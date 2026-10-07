"""Test-only Python socket guard, loaded before uvicorn via PYTHONPATH."""
import os
import sys

_AUDIT = os.environ.get("CB02_OUTBOUND_AUDIT")
if not _AUDIT:
    raise RuntimeError("Missing CB-02 outbound audit")


def _deny():
    with open(_AUDIT, "a", encoding="utf-8") as log:
        log.write("denied python\n")
    raise OSError("CB-02 outbound connection blocked")


def _guard(event, args):
    if event == "socket.connect":
        address = args[1]
        if not isinstance(address, tuple) or address[0] not in (
            "127.0.0.1", "::1", "::ffff:127.0.0.1"
        ):
            _deny()
    elif event == "socket.getaddrinfo":
        if args[0] not in ("localhost", "127.0.0.1", "::1"):
            _deny()
    elif event in ("socket.gethostbyname", "socket.gethostbyaddr"):
        if args[0] not in ("localhost", "127.0.0.1", "::1"):
            _deny()
    elif event in ("socket.sendto", "socket.sendmsg"):
        _deny()


sys.addaudithook(_guard)


def require_guard():
    """Explicit startup check: sitecustomize import failures must not fail open."""
    assert _AUDIT
