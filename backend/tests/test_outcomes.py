"""Signal outcome persistence and revenue totals."""

from fastapi.testclient import TestClient


def _predict(client: TestClient, conversation_id: str, signal_type: str) -> str:
    created = client.post(
        "/v1/predictions",
        headers={"X-Tenant-Id": "tenant_revenue"},
        json={
            "conversation_id": conversation_id,
            "signal_type": signal_type,
            "confidence": 0.8,
            "summary": signal_type,
        },
    )
    assert created.status_code == 201
    return created.json()["id"]


def test_outcome_round_trip_and_revenue(client: TestClient) -> None:
    headers = {"X-Tenant-Id": "tenant_revenue"}
    retained = _predict(client, "conv_ret", "retention")
    saved = client.post(
        f"/v1/signals/{retained}/outcome",
        headers=headers,
        json={"outcome": "retained", "value_inr": 12000, "recorded_on": "2026-09-01"},
    )
    assert saved.status_code == 200
    assert saved.json()["outcome"] == "retained"
    assert saved.json()["outcome_value_inr"] == 12000

    converted = _predict(client, "conv_lead", "lead")
    churned = _predict(client, "conv_gone", "retention")
    quiet = _predict(client, "conv_same", "upsell")
    assert (
        client.post(
            f"/v1/signals/{converted}/outcome",
            headers=headers,
            json={"outcome": "converted", "value_inr": 5000},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/v1/signals/{churned}/outcome",
            headers=headers,
            json={"outcome": "churned", "value_inr": 8000},
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/v1/signals/{quiet}/outcome",
            headers=headers,
            json={"outcome": "no_change", "value_inr": 999},
        ).status_code
        == 200
    )

    api = client.get("/v1/tenants/tenant_revenue/signal-score", headers=headers)
    assert api.status_code == 200
    payload = api.json()
    assert payload["revenue_at_risk_found_inr"] == 20000
    assert payload["revenue_saved_inr"] == 17000


def test_outcome_rejects_unknown_label(client: TestClient) -> None:
    signal_id = _predict(client, "conv_bad", "lead")
    response = client.post(
        f"/v1/signals/{signal_id}/outcome",
        headers={"X-Tenant-Id": "tenant_revenue"},
        json={"outcome": "won"},
    )
    assert response.status_code == 422
