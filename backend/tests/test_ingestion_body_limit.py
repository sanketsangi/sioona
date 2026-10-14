import asyncio
from app.ingestion_body_limit import IngestionBodyLimit


def exercise(chunks, headers=(), path="/v1/tenants/a/ingestions/u1"):
    state = {"reads": 0, "called": False, "body": b"", "sent": []}
    async def receive():
        index = state["reads"]
        state["reads"] += 1
        return {"type": "http.request", "body": chunks[index], "more_body": index < len(chunks) - 1}
    async def send(message):
        state["sent"].append(message)
    async def downstream(scope, receive, send):
        state["called"] = True
        while True:
            message = await receive()
            state["body"] += message.get("body", b"")
            if not message.get("more_body", False):
                break
    scope = {"type": "http", "method": "PUT", "path": path, "headers": headers}
    asyncio.run(IngestionBodyLimit(downstream, max_bytes=10)(scope, receive, send))
    return state


def test_chunked_body_stops_at_limit_without_parsing_or_reading_remainder():
    state = exercise([b"123456", b"78901", b"unread"])
    assert state["reads"] == 2 and not state["called"]
    assert state["sent"][0]["status"] == 413


def test_declared_size_rejects_without_consuming_body():
    state = exercise([b"unread"], [(b"content-length", b"11")])
    assert state["reads"] == 0 and not state["called"]
    assert state["sent"][0]["status"] == 413


def test_understated_length_cannot_bypass_stream_count():
    state = exercise([b"12345678901"], [(b"content-length", b"1")])
    assert not state["called"] and state["sent"][0]["status"] == 413


def test_exact_boundary_replays_every_byte_and_other_routes_are_unaffected():
    assert exercise([b"12345", b"67890"])["body"] == b"1234567890"
    assert exercise([b"12345678901"], path="/v1/conversations")["called"]
