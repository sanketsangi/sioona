"""FastAPI application entrypoint for Signal Score APIs."""

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.deps import require_service_token
from app.api.routes import (
    lifecycle,
    economics_dashboard,
    jobs,
    conversations,
    feedback,
    pilot,
    predictions,
    review,
    scores,
    supervised_actions,
    taxonomy,
    tenant_data,
    uploads,
    pilot_requests,
    detection_resume,
    detection_runs,
    ingestion,
    inference,
    inference_budget,
)
from app.config import get_settings
from app.ingestion_body_limit import IngestionBodyLimit

settings = get_settings()
_production = settings.sioona_env.strip().lower() == "production"

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Sioona evaluation metrics API. "
        "SignalScore = correct reviews / total reviews. "
        "Canonical feedback labels: correct | incorrect | partially_correct."
    ),
    docs_url=None if _production else "/docs",
    redoc_url=None if _production else "/redoc",
    openapi_url=None if _production else "/openapi.json",
)

api = APIRouter(dependencies=[Depends(require_service_token)])
api.include_router(economics_dashboard.router)
api.include_router(jobs.router)
api.include_router(predictions.router)
api.include_router(conversations.router)
api.include_router(feedback.router)
api.include_router(scores.router)
api.include_router(review.router)
api.include_router(pilot.router)
api.include_router(supervised_actions.router)
api.include_router(taxonomy.router)
api.include_router(tenant_data.router)
api.include_router(lifecycle.router)
api.include_router(uploads.router)
api.include_router(pilot_requests.router)
api.include_router(detection_resume.router)
api.include_router(detection_runs.router)
api.include_router(ingestion.router)
api.include_router(inference.router)
api.include_router(inference_budget.router)
app.include_router(api)

app.add_middleware(IngestionBodyLimit)


@app.middleware("http")
async def hide_public_docs(request: Request, call_next):
    """Docs stay off in production even if the process imported them earlier."""
    if get_settings().sioona_env.strip().lower() == "production":
        if request.url.path in {"/docs", "/redoc", "/openapi.json"}:
            return JSONResponse(status_code=404, content={"detail": "not_found"})
    return await call_next(request)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok"}
