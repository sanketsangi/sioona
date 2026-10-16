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


RATES: tuple[Rate, ...] = (
    Rate(
        version="groq-qwen3.8-27b-2026-10-14",
        provider="groq",
        model="qwen/qwen3.8-27b",
        input_per_mtok=Decimal("0.20"),
        cached_input_per_mtok=Decimal("0.10"),
        output_per_mtok=Decimal("0.40"),
        valid_from=date(2026, 10, 14),
        source_url="https://groq.com/pricing",
    ),
    Rate(
        version="groq-gpt-oss-20b-2026-10-14",
        provider="groq",
        model="openai/gpt-oss-20b",
        input_per_mtok=Decimal("0.15"),
        cached_input_per_mtok=Decimal("0.075"),
        output_per_mtok=Decimal("0.30"),
        valid_from=date(2026, 10, 14),
        source_url="https://groq.com/pricing",
    ),
    Rate(
        version="groq-llama-3.3-70b-versatile-2026-10-14",
        provider="groq",
        model="meta/llama-3.3-70b-versatile",
        input_per_mtok=Decimal("0.59"),
        cached_input_per_mtok=Decimal("0.30"),
        output_per_mtok=Decimal("0.79"),
        valid_from=date(2026, 10, 14),
        source_url="https://groq.com/pricing",
    ),
    Rate(
        version="groq-deepseek-r1-distill-qwen-14b-2026-10-14",
        provider="groq",
        model="deepseek/deepseek-r1-distill-qwen-14b",
        input_per_mtok=Decimal("0.10"),
        cached_input_per_mtok=Decimal("0.05"),
        output_per_mtok=Decimal("0.20"),
        valid_from=date(2026, 10, 14),
        source_url="https://groq.com/pricing",
    ),
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
