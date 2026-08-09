#!/usr/bin/env python3
"""Live verification: prediction → feedback → SignalScore.

Usage:
  python scripts/verify_signal_score_flow.py
  BACKEND_URL=http://localhost:8000 TENANT_ID=tenant_demo python scripts/verify_signal_score_flow.py

Exits 0 on success, 1 on failure. Requires a running FastAPI server.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from uuid import uuid4


def request(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    body: dict | None = None,
) -> tuple[int, dict | list | None]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            payload = json.loads(raw) if raw else None
            return resp.status, payload
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            payload = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            payload = {"detail": raw}
        return exc.code, payload
    except urllib.error.URLError as exc:
        print(f"FAIL: cannot reach backend: {exc.reason}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    base = os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")
    tenant_id = os.environ.get("TENANT_ID", "tenant_demo")
    headers = {
        "Content-Type": "application/json",
        "X-Tenant-Id": tenant_id,
    }

    status, health = request("GET", f"{base}/health", headers={})
    if status != 200:
        print(f"FAIL: /health returned {status}", file=sys.stderr)
        sys.exit(1)
    print(f"OK  health={health}")

    conv_id = f"verify_{uuid4().hex[:10]}"
    status, pred = request(
        "POST",
        f"{base}/v1/predictions",
        headers=headers,
        body={
            "conversation_id": conv_id,
            "signal_type": "lead",
            "confidence": 0.88,
            "summary": "verify_signal_score_flow prediction",
        },
    )
    if status != 201 or not isinstance(pred, dict) or "id" not in pred:
        print(f"FAIL: create prediction → {status} {pred}", file=sys.stderr)
        sys.exit(1)
    signal_id = pred["id"]
    print(f"OK  prediction id={signal_id}")

    status, fb = request(
        "POST",
        f"{base}/v1/signals/{signal_id}/feedback",
        headers=headers,
        body={
            "feedback": "correct",
            "reviewed_by": "verify_script",
            "note": "e2e verify",
        },
    )
    if status != 200 or not isinstance(fb, dict) or fb.get("feedback") != "correct":
        print(f"FAIL: submit feedback → {status} {fb}", file=sys.stderr)
        sys.exit(1)
    print("OK  feedback=correct")

    status, score = request(
        "GET",
        f"{base}/v1/tenants/{tenant_id}/signal-score",
        headers=headers,
    )
    if status != 200 or not isinstance(score, dict):
        print(f"FAIL: get signal-score → {status} {score}", file=sys.stderr)
        sys.exit(1)

    reviewed = score.get("reviewed_count", 0)
    signal_score = score.get("signal_score")
    if not isinstance(reviewed, int) or reviewed < 1:
        print(f"FAIL: expected reviewed_count >= 1, got {score}", file=sys.stderr)
        sys.exit(1)
    if signal_score is None:
        print(f"FAIL: signal_score is null after reviews: {score}", file=sys.stderr)
        sys.exit(1)

    print(
        "OK  signal_score="
        f"{signal_score} reviewed={reviewed} correct={score.get('correct_count')}"
    )
    print("PASS: prediction → feedback → SignalScore")


if __name__ == "__main__":
    main()
