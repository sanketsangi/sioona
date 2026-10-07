"""Every route has a cross-tenant case. Tenant B cannot read or change tenant A."""

from fastapi.routing import APIRoute

from app.main import app
from tests.actor_support import MARKER, actor_headers, add_member

pytest_plugins = ["tests.actor_support"]

EXEMPT = {("GET", "/health")}
PATH_PARAMS = {
    "{tenant_id}": "tenant_a",
    "{signal_id}": "00000000-0000-4000-8000-000000000099",
    "{upload_id}": "missing",
    "{run_id}": "missing",
    "{conversation_id}": "shared",
}


def all_routes():
    for route in app.routes:
        if isinstance(route, APIRoute):
            for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
                yield method, route.path


def _concrete(path: str) -> str:
    concrete = path
    for token, value in PATH_PARAMS.items():
        concrete = concrete.replace(token, value)
    return concrete


def _body(method: str, path: str):
    if method in {"GET", "DELETE"}:
        return None
    if path == "/v1/pilot-requests":
        return {
            "name": MARKER,
            "email": "a@example.test",
            "company": "Acme",
            "message": MARKER,
        }
    if path.endswith("/signal-score"):
        return {}
    if path.endswith("/feedback"):
        return {"feedback": "correct", "reviewed_by": "b"}
    if path.endswith("/acted"):
        return {"acted": True}
    if path.endswith("/outcome"):
        return {"outcome": "unknown"}
    if path.endswith("/ground-truth") or path.endswith("/conversations/{conversation_id}"):
        return {"ground_truth": None}
    if "predictions" in path:
        return {
            "conversation_id": "shared",
            "signal_type": "lead",
            "confidence": 0.2,
            "summary": "should not land",
            "predictions": [],
        }
    if path.endswith("/conversations") or path.endswith("/conversations/bulk"):
        chat = {
            "conversation_id": "shared",
            "channel": "upload",
            "started_at": "2026-10-01T00:00:00Z",
            "external_id": "ext-shared",
        }
        if path.endswith("/bulk"):
            return {"conversations": [chat]}
        return chat
    if path.endswith("/supervised-actions"):
        return {
            "conversation_id": "shared",
            "action_type": "lead_outreach",
            "status": "dismissed",
            "decided_at": "2026-10-01T00:00:00Z",
        }
    if path.endswith("/prune"):
        return {"keep_conversation_ids": ["shared"]}
    if "taxonomy" in path:
        return {"overrides": {}}
    if path.endswith("/pilot"):
        return {"baseline_opportunities": 0}
    if "/uploads/" in path and method == "PUT":
        return {
            "source": "weekly.csv",
            "content_sha256": "a" * 64,
            "conversation_ids": ["shared"],
        }
    if path.endswith("/published-conversations"):
        return {"conversation_ids": ["shared"]}
    if "/ingestions/" in path and method == "PUT":
        return {
            "source": "batch",
            "conversations": [{
                "conversation_id": "shared",
                "channel": "upload",
                "started_at": "2026-10-01T00:00:00Z",
                "messages": [{
                    "message_id": "m1",
                    "role": "customer",
                    "content": "hello",
                    "timestamp": "2026-10-01T00:00:00Z",
                }],
            }],
            "detections": [{
                "conversation_id": "shared",
                "content_hash": "b" * 64,
                "model_version": "m",
                "prompt_version": "p",
                "coverage": {
                    "included_turns": 1,
                    "omitted_turns": 0,
                    "truncated": False,
                    "token_upper_bound": 5,
                    "token_budget": 2400,
                },
                "output": [],
            }],
        }
    if "/detection-runs/" in path and method == "POST":
        return {"conversations": []}
    return {}


def _case(method: str, path: str):
    def run(client, factory) -> None:
        if path == "/v1/pilot-requests":
            response = client.post(
                path,
                headers={"Idempotency-Key": "pilot-request-test-0099"},
                json=_body(method, path),
            )
            assert response.status_code == 200
            assert set(response.json()) == {"ok", "receipt"}
            assert MARKER not in response.text
            return
        sub = add_member(factory, "b@example.test", "tenant_b", "admin")
        kwargs = {"headers": actor_headers(sub, "tenant_b")}
        body = _body(method, path)
        if body is not None:
            kwargs["json"] = body
        response = client.request(method, _concrete(path), **kwargs)
        assert response.status_code in {403, 404}, (method, path, response.status_code, response.text)
        assert MARKER not in response.text

    return run


ISOLATION_CASES = {
    (method, path): _case(method, path)
    for method, path in all_routes()
    if (method, path) not in EXEMPT
}


def test_every_route_has_an_isolation_case() -> None:
    missing = sorted(route for route in all_routes() if route not in EXEMPT and route not in ISOLATION_CASES)
    assert not missing, f"Add tenant-isolation cases for: {missing}"
    assert EXEMPT == {("GET", "/health")}


def _tenant_a_snapshot(client, owner: str) -> dict[str, object]:
    listed = client.get(
        "/v1/tenants/tenant_a/conversations",
        headers=actor_headers(owner, "tenant_a"),
    )
    assert listed.status_code == 200
    rows = listed.json()
    return {
        "conversation_count": len(rows),
        "external_ids": sorted(row["external_id"] for row in rows),
        "marker_messages": sum(
            1
            for row in rows
            for message in row.get("messages", [])
            if message.get("content") == MARKER
        ),
    }


def test_tenant_b_cannot_read_or_mutate_tenant_a(api) -> None:
    client, factory = api
    owner = add_member(factory, "a@example.test", "tenant_a", "admin")
    seeded_a = client.post(
        "/v1/tenants/tenant_a/conversations",
        headers=actor_headers(owner, "tenant_a"),
        json={
            "conversation_id": "shared",
            "channel": "upload",
            "started_at": "2026-10-01T00:00:00Z",
            "external_id": "ext-shared",
            "messages": [{
                "message_id": "m1",
                "role": "customer",
                "content": MARKER,
                "timestamp": "2026-10-01T00:00:00Z",
            }],
        },
    )
    assert seeded_a.status_code == 201, seeded_a.text
    owner_b = add_member(factory, "b@example.test", "tenant_b", "admin")
    seeded_b = client.post(
        "/v1/tenants/tenant_b/conversations",
        headers=actor_headers(owner_b, "tenant_b"),
        json={
            "conversation_id": "shared",
            "channel": "upload",
            "started_at": "2026-10-01T00:00:00Z",
            "external_id": "ext-shared",
            "messages": [{
                "message_id": "m1-b",
                "role": "customer",
                "content": "tenant-b-only",
                "timestamp": "2026-10-01T00:00:00Z",
            }],
        },
    )
    assert seeded_b.status_code == 201, seeded_b.text
    before = _tenant_a_snapshot(client, owner)
    for (method, path), run in sorted(ISOLATION_CASES.items()):
        run(client, factory)
    after = _tenant_a_snapshot(client, owner)
    assert after == before
    assert after["conversation_count"] == 1
    assert after["external_ids"] == ["ext-shared"]
    assert after["marker_messages"] == 1
