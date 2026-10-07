"""Dated provider rates. Empty until a human enters official prices. Never seed from a review memo."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class Rate:
    version: str
    provider: str
    model: str
    input_per_mtok: Decimal
    cached_input_per_mtok: Decimal | None
    output_per_mtok: Decimal
    valid_from: date
    source_url: str


RATES: tuple[Rate, ...] = ()


def estimate_cost(
    rate: Rate | None,
    input_tokens: int | None,
    cached: int | None,
    output_tokens: int | None,
):
    """Cached tokens are a subset of input. Reasoning tokens stay inside output."""
    if rate is None or input_tokens is None or output_tokens is None:
        return None, "unknown"
    cached = cached or 0
    cached_rate = rate.cached_input_per_mtok if rate.cached_input_per_mtok is not None else rate.input_per_mtok
    total = (
        Decimal(max(input_tokens - cached, 0)) * rate.input_per_mtok
        + Decimal(cached) * cached_rate
        + Decimal(output_tokens) * rate.output_per_mtok
    ) / Decimal(1_000_000)
    return total.quantize(Decimal("0.00000001")), "estimated"


def rate_for(provider: str, model: str, on: date) -> Rate | None:
    matches = [rate for rate in RATES if rate.provider == provider and rate.model == model and rate.valid_from <= on]
    if not matches:
        return None
    return max(matches, key=lambda rate: rate.valid_from)
