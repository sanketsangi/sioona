from datetime import date
from decimal import Decimal

import pytest

from app.services.inference_rates import estimate_cost, lookup_rate


@pytest.mark.parametrize(
    ("model", "input_rate", "cached_rate", "output_rate", "expected_cost"),
    [
        (
            "qwen/qwen3.8-27b",
            "0.20",
            "0.10",
            "0.40",
            "0.38000000",
        ),
        (
            "openai/gpt-oss-20b",
            "0.15",
            "0.075",
            "0.30",
            "0.28500000",
        ),
        (
            "meta/llama-3.3-70b-versatile",
            "0.59",
            "0.30",
            "0.79",
            "0.92700000",
        ),
        (
            "deepseek/deepseek-r1-distill-qwen-14b",
            "0.10",
            "0.05",
            "0.20",
            "0.19000000",
        ),
    ],
)
def test_verified_groq_rates_transition_cost_from_unknown_to_estimated(
    model: str,
    input_rate: str,
    cached_rate: str,
    output_rate: str,
    expected_cost: str,
) -> None:
    rate = lookup_rate("groq", model, at=date(2026, 10, 14))

    assert rate is not None
    assert rate.input_per_mtok == Decimal(input_rate)
    assert rate.cached_input_per_mtok == Decimal(cached_rate)
    assert rate.output_per_mtok == Decimal(output_rate)
    cost, status = estimate_cost(
        rate,
        input_tokens=1_000_000,
        cached=200_000,
        output_tokens=500_000,
    )

    assert status == "estimated"
    assert cost == Decimal(expected_cost)


def test_unknown_model_and_incomplete_usage_remain_unknown() -> None:
    assert lookup_rate("groq", "unlisted/model", at=date(2026, 10, 14)) is None
    assert lookup_rate("groq", "qwen/qwen3.8-27b", at=date(2026, 10, 13)) is None

    unknown_model_cost, unknown_model_status = estimate_cost(
        lookup_rate("groq", "unlisted/model", at=date(2026, 10, 14)),
        input_tokens=100,
        cached=0,
        output_tokens=50,
    )
    incomplete_cost, incomplete_status = estimate_cost(
        lookup_rate("groq", "qwen/qwen3.8-27b", at=date(2026, 10, 14)),
        input_tokens=None,
        cached=None,
        output_tokens=50,
    )

    assert (unknown_model_cost, unknown_model_status) == (None, "unknown")
    assert (incomplete_cost, incomplete_status) == (None, "unknown")
