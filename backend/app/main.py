"""FastAPI application entrypoint for Signal Score APIs."""

from fastapi import FastAPI

from app.api.routes import conversations, feedback, predictions, review, scores
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Sioona evaluation metrics API. "
        "SignalScore = correct reviews / total reviews. "
        "Canonical feedback labels: correct | incorrect | partially_correct."
    ),
)

app.include_router(predictions.router)
app.include_router(conversations.router)
app.include_router(feedback.router)
app.include_router(scores.router)
app.include_router(review.router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok"}
