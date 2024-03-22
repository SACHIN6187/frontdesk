.PHONY: up down logs test lint fmt seed backend-dev frontend-dev

up:            ## Build + start the full stack (db, stripe-mock, backend, frontend)
	docker compose up -d --build

down:          ## Stop and remove the stack + volumes
	docker compose down -v

logs:
	docker compose logs -f --tail=100

test:          ## Backend test suite (spins an ephemeral Postgres via testcontainers)
	cd backend && uv run pytest -q

lint:          ## Lint + type-check backend
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy .

fmt:
	cd backend && uv run ruff format . && uv run ruff check --fix .

seed:          ## Populate a demo org with tickets (requires stack up); prints real counts
	cd backend && uv run python -m scripts.seed

backend-dev:   ## Run backend against a local Postgres + stripe-mock
	cd backend && uv run uvicorn frontdesk.main:app --reload --port 8000

frontend-dev:
	cd frontend && npm run dev
