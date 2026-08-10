# Sioona

**Signals into Revenue** — overlay conversation intelligence for finance and high-volume chat teams.

- Product brief: [PRODUCT.md](./PRODUCT.md)
- Source blueprint: [Grok NLP Report.pdf](./Grok%20NLP%20Report.pdf)
- App (Insights / Shadow Mode): [web/](./web/)
- Signal Score API (FastAPI + Neon): [backend/](./backend/)

## Local run (dual process)

**1. Backend (Signal Score SoT)**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set DATABASE_URL to Neon (postgresql+psycopg://…)
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**2. Web (Insights UI)**

```bash
cd web
npm install
cp .env.example .env   # BACKEND_URL=http://localhost:8000
npm run dev
```

Open http://localhost:3000

SignalScore feedback and review precision use the FastAPI backend when it is reachable. Conversations live in the JSON store under `web/data/`; the Shadow Mode pending queue and Signal Score SoT are FastAPI + Neon.

**Hosted demo** (https://sioona-demo.vercel.app): deploy FastAPI + Neon, then set Vercel Production `BACKEND_URL` — see [web/DEPLOY.md](./web/DEPLOY.md) and [backend/README.md](./backend/README.md#hosted-deploy-demo).
