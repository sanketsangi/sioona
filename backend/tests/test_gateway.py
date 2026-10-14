"""CB-09 existing replay parity: no network, model, prompt or threshold changes."""

import hashlib
import json
import re
from pathlib import Path
from types import SimpleNamespace as NS
import httpx
import pytest
from app.ai import gateway as g
from app.config import get_settings

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).parent / "fixtures"
ROWS = json.loads((FIXTURES / "cb11-gateway-parity.json").read_text())


def test_v3_prompt_and_source_checksum():
    source = (ROOT / "web/src/lib/detect-llm.ts").read_text()
    prompt = re.search(r"export const SYSTEM_PROMPT = `([\s\S]*?)`;", source)[1]
    assert (
        prompt
        == g.SYSTEM_PROMPT
        == (ROOT / "web/eval/promptfoo/system-prompt.txt").read_text()
    )
    checks = json.loads((FIXTURES / "cb11-port-source-checksums.json").read_text())
    for path, checksum in checks.items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == checksum, path


@pytest.mark.parametrize("row", ROWS, ids=lambda r: r["id"])
def test_existing_cb09_replay_request_parser_and_signal_parity(row):
    chat = NS(
        customer_name=row["conversation"]["customerName"],
        channel=row["conversation"]["channel"],
    )
    messages = [NS(**m) for m in row["messages"]]
    parsed = g.parse_classification(row["replay"])
    assert parsed == row["parsed"]
    text, coverage = g.recent_transcript(messages)
    assert (
        g.chat_messages(chat, text, coverage["omitted_turns"])[1]["content"]
        == row["userPrompt"]
    )
    assert g.heuristic_output(chat, messages) == row["heuristic"]
    try:
        output = g.classification_output(parsed, chat, messages, g.DEFAULT_MODEL)
    except g.ProviderFailure:
        output = g.heuristic_output(chat, messages)
    assert output == row["output"]


@pytest.mark.parametrize(
    "usage",
    [None, {}, {"prompt_tokens": 12}, {"prompt_tokens": 12, "completion_tokens": 3}],
)
def test_transport_request_shape_and_unknown_usage(monkeypatch, usage):
    monkeypatch.setenv("GROQ_API_KEY", "test-only")
    get_settings.cache_clear()

    def respond(request):
        assert str(request.url) == "https://api.groq.com/openai/v1/chat/completions"
        assert json.loads(request.content)["reasoning_effort"] == "none"
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": '{"signal":"none","confidence":0.9}'}}
                ],
                "usage": usage,
            },
        )

    try:
        _, result = g.provider_call(
            g.DEFAULT_MODEL, [], transport=httpx.MockTransport(respond)
        )
        assert result["usage"] == (
            {
                "input_tokens": 12,
                "output_tokens": 3,
                "cached_input_tokens": None,
                "reasoning_tokens": None,
            }
            if usage and usage.get("completion_tokens")
            else {}
        )
    finally:
        get_settings.cache_clear()


@pytest.mark.parametrize(
    "status,body,category,retryable",
    [
        (401, "invalid_api_key", "key", False),
        (429, "tokens per day (TPD)", "quota", False),
        (429, "rate limit", "http", True),
        (500, "", "http", True),
    ],
)
def test_transport_failure_categories(monkeypatch, status, body, category, retryable):
    monkeypatch.setenv("GROQ_API_KEY", "test-only")
    get_settings.cache_clear()
    try:
        with pytest.raises(g.ProviderFailure) as exc:
            g.provider_call(
                g.DEFAULT_MODEL,
                [],
                transport=httpx.MockTransport(
                    lambda _: httpx.Response(status, text=body)
                ),
            )
        assert exc.value.category == category and exc.value.retryable == retryable
    finally:
        get_settings.cache_clear()
