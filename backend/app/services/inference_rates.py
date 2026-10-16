"""Dated provider rate table for estimated inference cost.

Rates are entered by a human from official pricing pages only.
Never copy prices from the CTO report or invent defaults.
An empty table means every cost is ``unknown``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class Rate:
    version: str  # e.g. "groq-qwen3.8-27b-2026-10-07"
    provider: str
    model: str
    input_per_mtok: Decimal
    cached_input_per_mtok: Decimal | None
    output_per_mtok: Decimal
    valid_from: date
    source_url: str


# Official model pages checked 2026-10-16. No backdating, guessed cached
# discounts, deprecated-model prices, or price aliases for different model IDs.
# https://console.groq.com/docs/model/qwen/qwen3.8-27b
# https://console.groq.com/docs/model/openai/gpt-oss-20b
# https://console.groq.com/docs/prompt-caching
RATES: tuple[Rate, ...] = (
    Rate("groq-qwen3.8-27b-2026-10-16", "groq", "qwen/qwen3.8-27b",
         Decimal("0.80"), None, Decimal("4.00"), date(2026, 10, 16),
         "https://console.groq.com/docs/model/qwen/qwen3.8-27b"),
    Rate("groq-gpt-oss-20b-2026-10-16", "groq", "openai/gpt-oss-20b",
         Decimal("0.075"), Decimal("0.037"), Decimal("0.30"), date(2026, 10, 16),
         "https://console.groq.com/docs/model/openai/gpt-oss-20b"),
)


def lookup_rate(provider: str, model: str, at: date | None = None) -> Rate | None:
    """Return the newest rate valid on ``at`` (defaults to today), or None."""
    day = at or date.today()
    matches = [
        rate
        for rate in RATES
        if rate.provider == provider and rate.model == model and rate.valid_from <= day
    ]
    if not matches:
        return None
    return max(matches, key=lambda rate: (rate.valid_from, rate.version))


def estimate_cost(
    rate: Rate | None,
    input_tokens: int | None,
    cached: int | None,
    output_tokens: int | None,
) -> tuple[Decimal | None, str]:
    """Cached tokens are a subset of input; reasoning tokens are inside output.

    Verify per provider before filling ``RATES``. Unknowns stay explicit.
    """
    if rate is None or input_tokens is None or output_tokens is None:
        return None, "unknown"
    if input_tokens < 0 or output_tokens < 0 or (cached is not None and (cached < 0 or cached > input_tokens)):
        return None, "unknown"
    cached_tokens = cached or 0
    cached_rate = (
        rate.cached_input_per_mtok
        if rate.cached_input_per_mtok is not None
        else rate.input_per_mtok
    )
    total = (
        Decimal(max(input_tokens - cached_tokens, 0)) * rate.input_per_mtok
        + Decimal(cached_tokens) * cached_rate
        + Decimal(output_tokens) * rate.output_per_mtok
    ) / Decimal(1_000_000)
    return total.quantize(Decimal("0.00000001")), "estimated"
