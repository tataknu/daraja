# Turflow local workflow. Run `make` to list targets.
#
# First run:   make setup     (install deps, start local Supabase in Docker, migrate, write .env.local)
# Every day:   make dev       (app on http://localhost:8080 against local Supabase + OpenAI)
# Before a PR: make check     (typecheck, unit tests, production build)
#              make e2e       (real webhooks end to end against the dev server)
# Prod-like:   make deploy-local / make e2e-worker   (built Cloudflare Worker running locally in workerd)

SHELL := /bin/bash

BUN      ?= $(shell command -v bun >/dev/null 2>&1 && echo bun || echo npx --yes bun@1)
SUPABASE ?= npx --yes supabase@2
WRANGLER ?= npx --yes wrangler@4
DB_URL   ?= postgresql://postgres:postgres@127.0.0.1:54322/postgres
ENV_LOCAL := apps/web/.env.local
WORKER    := apps/web/.output/server
# Only what the app needs: Postgres, API gateway, REST, auth, realtime.
SUPABASE_SKIP := studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,storage-api,postgres-meta
WITH_ENV  := set -a && . ./$(ENV_LOCAL) && set +a &&

.DEFAULT_GOAL := help
.PHONY: help setup install env db-up db-down db-status db-migrate db-reset dev test lint check build \
        deploy-local e2e e2e-worker clean require-env require-docker

help: ## List targets
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: install db-up db-reset env ## First run: deps, local Supabase, migrations, .env.local

install: ## Install workspace dependencies (bun)
	$(BUN) install

env: ## Write apps/web/.env.local from the running local Supabase (keeps your OPENAI_API_KEY)
	node scripts/local-env.mjs

# ---- database (Supabase in Docker) -------------------------------------------------------------

require-docker:
	@docker info >/dev/null 2>&1 || { echo "Docker is not running. Start Docker Desktop and retry."; exit 1; }

db-up: require-docker ## Start local Supabase (Postgres, REST, auth, realtime)
	cd packages/db && $(SUPABASE) start -x $(SUPABASE_SKIP)

db-down: ## Stop local Supabase (data is kept)
	cd packages/db && $(SUPABASE) stop

db-status: ## Show local Supabase URLs and keys
	cd packages/db && $(SUPABASE) status

db-migrate: ## Apply packages/db/migrations to the local database
	@for f in $$(ls packages/db/migrations/*.sql | sort); do \
	  echo "applying $$f"; psql "$(DB_URL)" -v ON_ERROR_STOP=1 -q -f $$f || exit 1; \
	done

db-reset: require-docker ## Wipe the local database and re-apply migrations (fresh seed data)
	cd packages/db && $(SUPABASE) db reset --local
	$(MAKE) db-migrate

# ---- app ---------------------------------------------------------------------------------------

require-env:
	@test -f $(ENV_LOCAL) || { echo "$(ENV_LOCAL) missing: run 'make setup' (or 'make env' if Supabase is up)."; exit 1; }

dev: require-env ## Run the app on http://localhost:8080 with local env
	$(WITH_ENV) $(BUN) run dev

test: ## Typecheck all packages and run unit tests
	$(BUN) run typecheck
	$(BUN) run test

lint: ## Lint (note: Lovable's code has existing Prettier issues)
	$(BUN) run lint

build: require-env ## Production build (Cloudflare Worker in apps/web/.output)
	$(WITH_ENV) $(BUN) run build

check: test build ## Typecheck, unit tests and production build

deploy-local: build ## Run the built Worker locally in workerd on http://localhost:8787
	grep -v '^VITE_\|^#' $(ENV_LOCAL) > $(WORKER)/.dev.vars
	$(WRANGLER) dev --config $(WORKER)/wrangler.json --port 8787 --local

e2e: require-env ## End-to-end through the real webhooks, against a fresh dev server
	node scripts/e2e-local.mjs --serve dev

e2e-worker: build ## Same end-to-end test against the built Worker in workerd
	grep -v '^VITE_\|^#' $(ENV_LOCAL) > $(WORKER)/.dev.vars
	node scripts/e2e-local.mjs --serve worker

# Deletes only these build folders, by absolute path inside this repo.
CLEAN_PATHS := $(CURDIR)/apps/web/.output $(CURDIR)/apps/web/.wrangler $(CURDIR)/apps/web/.turbo $(CURDIR)/.turbo

clean: ## Remove build output and turbo cache
	@test -f "$(CURDIR)/turbo.json" || { echo "refusing: not at the repo root"; exit 1; }
	rm -rf $(CLEAN_PATHS)
