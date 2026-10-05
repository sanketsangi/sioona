"""Ground model-stated INR values in individual persisted customer turns."""
import re
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models.message import Message

_NUMBER = r"\d[\d,]*(?:\.\d+)?"
_UNIT = r"crores?|cr|lakhs?|lacs?"
_AMOUNT = re.compile(rf"(?:₹|\brs\.?|\binr)\s*({_NUMBER})\s*({_UNIT})?\b|({_NUMBER})\s*({_UNIT})\b", re.I)


def stated_amounts(text: str) -> list[tuple[int, str]]:
    values = []
    for match in _AMOUNT.finditer(text):
        number = match.group(1) or match.group(3)
        if len(number.replace(",", "")) > 16:
            continue
        unit = (match.group(2) or match.group(4) or "").lower()
        multiplier = 10000000 if unit.startswith("cr") else 100000 if unit else 1
        value = int((Decimal(number.replace(",", "")) * multiplier).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        values.append((value, match.group(0).strip()))
    return values


def value_category(text: str) -> str:
    asset = bool(re.search(r"\b(portfolio|holdings|assets?|aum|corpus|account balance)\b", text, re.I))
    revenue = bool(re.search(r"\b(fees?|brokerage|commission|revenue|subscription|premium)\b", text, re.I))
    return "asset" if asset and not revenue else "revenue_opportunity" if revenue and not asset else "unconfirmed"


def ground_commercial_values(db: Session, tenant_id: str, conversation_id: str, output: list[dict]) -> dict[str, list[dict]]:
    if not any(item.get("mentioned_value_inr") is not None for item in output):
        return {}
    messages = db.scalars(select(Message).where(Message.tenant_id == tenant_id,
        Message.conversation_id == conversation_id, Message.role == "customer").order_by(Message.message_id)).all()
    grounded = {}
    for item in output:
        value = item.get("mentioned_value_inr")
        if value is None:
            continue
        evidence = [{"message_id": message.message_id, "quote": quote, "amount_inr": amount,
                     "category": value_category(message.content)}
                    for message in messages for amount, quote in stated_amounts(message.content) if amount == value]
        if not evidence:
            raise ValueError("Commercial amount is not grounded in customer text")
        grounded[item["signal_type"]] = evidence[:10]
    return grounded
