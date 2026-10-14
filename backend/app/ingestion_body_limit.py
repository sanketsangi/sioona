"""Bound upload and contact JSON before FastAPI buffers/parses the request."""
import re
from starlette.responses import JSONResponse

INGESTION_BODY_LIMIT = 32 * 1024 * 1024
PILOT_INTAKE_BODY_LIMIT = 16 * 1024


class IngestionBodyLimit:
    def __init__(self, app, max_bytes=INGESTION_BODY_LIMIT):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        intake = (scope.get("method") == "POST" and
                  re.fullmatch(r"/v1/pilot-requests/?", scope.get("path", "")))
        ingestion = (scope.get("method") == "PUT" and
                     re.fullmatch(r"/v1/tenants/[^/]+/ingestions/[^/]+/?", scope.get("path", "")))
        if not intake and not ingestion:
            return await self.app(scope, receive, send)
        max_bytes = PILOT_INTAKE_BODY_LIMIT if intake else self.max_bytes
        async def reject():
            await JSONResponse({"detail": "intake_body_too_large" if intake else "ingestion_body_too_large"}, status_code=413)(scope, receive, send)
        for name, value in scope.get("headers", []):
            if name.lower() == b"content-length":
                try:
                    if int(value) > max_bytes:
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
            if size > max_bytes:
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
