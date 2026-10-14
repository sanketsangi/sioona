def test_pilot_intake_is_durable_idempotent_and_bounded(client):
    body = {"name": " Reviewer ", "email": "reviewer@example.test", "company": "Pilot", "message": "Please discuss an export pilot"}
    key = "pilot-request-test-0001"
    first = client.post("/v1/pilot-requests", headers={"Idempotency-Key": key}, json=body)
    assert first.status_code == 200
    assert first.json()["receipt"] == key
    assert client.post("/v1/pilot-requests", headers={"Idempotency-Key": key}, json=body).json() == first.json()
    assert client.post("/v1/pilot-requests", headers={"Idempotency-Key": key}, json={**body, "company": "Different"}).status_code == 409
    for number in (2, 3):
        assert client.post("/v1/pilot-requests", headers={"Idempotency-Key": f"pilot-request-test-000{number}"}, json=body).status_code == 200
    assert client.post("/v1/pilot-requests", headers={"Idempotency-Key": "pilot-request-test-0004"}, json=body).status_code == 429
    assert client.post("/v1/pilot-requests", headers={"Idempotency-Key": "pilot-request-test-0005"}, json={**body, "message": "x" * 2001}).status_code == 422


def test_intake_service_auth_fails_closed_in_production(client, monkeypatch):
    from types import SimpleNamespace
    from app.api import deps
    settings = SimpleNamespace(sioona_env="production", sioona_service_token="")
    monkeypatch.setattr(deps, "get_settings", lambda: settings)
    body = {"name": "Reviewer", "email": "reviewer@example.test", "company": "Pilot"}
    headers = {"Idempotency-Key": "pilot-auth-test-0001"}
    assert client.post("/v1/pilot-requests", headers=headers, json=body).status_code == 503
    settings.sioona_service_token = "test-only-service-token"
    assert client.post("/v1/pilot-requests", headers=headers, json=body).status_code == 401
    assert client.post("/v1/pilot-requests", headers={**headers, "Authorization": "Bearer wrong"}, json=body).status_code == 401
    assert client.post("/v1/pilot-requests", headers={**headers, "Authorization": "Bearer test-only-service-token"}, json=body).status_code == 200


def test_global_intake_limit_cannot_be_bypassed_by_changing_email(client, monkeypatch):
    from types import SimpleNamespace
    from app.api.routes import pilot_requests
    monkeypatch.setattr(pilot_requests, "get_settings", lambda: SimpleNamespace(pilot_intake_daily_limit=2))
    body = {"name": "Reviewer", "email": "one@example.test", "company": "Pilot"}
    headers = {"Idempotency-Key": "global-pilot-test-0001"}
    assert client.post("/v1/pilot-requests", headers=headers, json=body).status_code == 200
    assert client.post("/v1/pilot-requests", headers={"Idempotency-Key": "global-pilot-test-0002"}, json={**body, "email": "two@example.test"}).status_code == 200
    assert client.post("/v1/pilot-requests", headers={"Idempotency-Key": "global-pilot-test-0003"}, json={**body, "email": "three@example.test"}).status_code == 429
    assert client.post("/v1/pilot-requests", headers=headers, json=body).status_code == 200
