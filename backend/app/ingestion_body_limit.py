"""Bound atomic upload JSON before FastAPI buffers/parses the request."""
import re
from starlette.responses import JSONResponse

INGESTION_BODY_LIMIT = 32 * 1024 * 1024


class IngestionBodyLimit:
    def __init__(self, app, max_bytes=INGESTION_BODY_LIMIT):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if (scope["type"] != "http" or scope.get("method") not in {"PUT", "POST"} or
                not re.fullmatch(r"/v1/tenants/[^/]+/(?:(?:ingestions|jobs/uploads)/[^/]+|live/events|live/installations/[^/]+/events/[^/]+/resolution)/?", scope.get("path", ""))):
            return await self.app(scope, receive, send)
        async def reject():
            await JSONResponse({"detail": "ingestion_body_too_large"}, status_code=413)(scope, receive, send)
        for name, value in scope.get("headers", []):
            if name.lower() == b"content-length":
                try:
                    if int(value) > self.max_bytes:
                        return await reject()
                except ValueError:
                    pass  # The streamed count remains authoritative.
        body = bytearray()
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > self.max_bytes:
                return await reject()
            body.extend(chunk)
            if not message.get("more_body", False):
                break
        delivered = False
        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()
        return await self.app(scope, replay, send)
