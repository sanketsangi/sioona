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
