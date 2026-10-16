from datetime import date
from decimal import Decimal

import pytest

from app.services.inference_rates import estimate_cost, lookup_rate


@pytest.mark.parametrize(
    ("model", "input_rate", "cached_rate", "output_rate", "expected_cost"),
    [
        ("qwen/qwen3.8-27b", "0.80", None, "4.00", "2.80000000"),
        ("openai/gpt-oss-20b", "0.075", "0.037", "0.30", "0.21740000"),
    ],
)
def test_verified_groq_rates_transition_cost_from_unknown_to_estimated(
    model: str,
    input_rate: str,
    cached_rate: str,
    output_rate: str,
    expected_cost: str,
) -> None:
    rate = lookup_rate("groq", model, at=date(2026, 10, 16))

    assert rate is not None
    assert rate.input_per_mtok == Decimal(input_rate)
    assert rate.cached_input_per_mtok == (Decimal(cached_rate) if cached_rate else None)
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
    assert lookup_rate("groq", "unlisted/model", at=date(2026, 10, 16)) is None
    assert lookup_rate("groq", "qwen/qwen3.8-27b", at=date(2026, 10, 15)) is None

    unknown_model_cost, unknown_model_status = estimate_cost(
        lookup_rate("groq", "unlisted/model", at=date(2026, 10, 16)),
        input_tokens=100,
        cached=0,
        output_tokens=50,
    )
    incomplete_cost, incomplete_status = estimate_cost(
        lookup_rate("groq", "qwen/qwen3.8-27b", at=date(2026, 10, 16)),
        input_tokens=None,
        cached=None,
        output_tokens=50,
    )

    assert (unknown_model_cost, unknown_model_status) == (None, "unknown")
    assert (incomplete_cost, incomplete_status) == (None, "unknown")


@pytest.mark.parametrize("model", ["meta/llama-3.3-70b-versatile", "deepseek/deepseek-r1-distill-qwen-14b"])
def test_unverified_model_prices_stay_unknown(model):
    assert lookup_rate("groq", model, at=date(2026,10,16)) is None


@pytest.mark.parametrize("cached", [-1, 101])
def test_invalid_cached_subset_stays_unknown(cached):
    assert estimate_cost(lookup_rate("groq", "openai/gpt-oss-20b", at=date(2026,10,16)), 100, cached, 10) == (None, "unknown")
