# frontdesk — build contract

**Product.** A multi-tenant customer support desk SaaS. An organisation signs up,
invites teammates with roles, and works a shared queue of support tickets that
updates live. Billing is a Stripe subscription (free vs. pro seat limits). Runs
fully locally in **test mode** — Postgres + `stripe-mock` + backend + frontend via
docker-compose, **no real cloud account and no real Stripe keys**.

## Non-negotiables (the industry bar)

- **Tenant isolation is absolute.** Every row belongs to exactly one org. No query
  ever returns another org's data. This is enforced centrally (a scoped session /
  repository), never left to each endpoint to remember. There is a test that proves
  org A cannot read/modify org B's tickets.
- **RBAC is a matrix, not scattered ifs.** Roles: `owner`, `agent`, `viewer`.
  Permissions checked via one dependency `require(Permission.X)`. Tested per role.
- **No fabricated numbers.** Any figure in the README comes from a committed script
  or the test suite output.

## Backend (I, the lead, own this — the coupled core)

FastAPI + SQLAlchemy 2.0 async + asyncpg + Postgres. JWT auth (bcrypt passwords).

Models: `Org`, `User`, `Membership(org,user,role)`, `Ticket`, `TicketComment`,
`Subscription(org, stripe_customer, stripe_sub, plan, status, seats)`.

Modules the swarm builds AGAINST this foundation:
- **billing** — Stripe (test mode against stripe-mock): create customer + subscription,
  a webhook that flips `Subscription.status`/plan, seat-limit enforcement on invite.
- **tickets + ws** — ticket CRUD scoped to org, and a per-org WebSocket that broadcasts
  `ticket.created` / `ticket.updated` / `comment.created` events to connected members.
- **frontend** — Vite + React + TS: signup/login, ticket board (live via WS), members
  page (role management), billing page (plan + seats). Talks to the backend only.
- **tests** — pytest with a real ephemeral Postgres (testcontainers) covering tenant
  isolation, RBAC per role, billing webhook state transitions, and a WS broadcast.

## Interfaces the modules rely on (stable)

- `deps.get_db()` → `AsyncSession`
- `deps.current_user()` → `User`
- `deps.current_membership()` → `Membership` (resolves the caller's org + role from JWT)
- `rbac.require(perm)` → FastAPI dependency raising 403 if the role lacks `perm`
- `tenancy.scoped(session, membership)` → a helper that filters by `membership.org_id`
- `events.broadcast(org_id, event)` → push a JSON event to that org's WS subscribers

## Definition of done

`docker compose up` → signup works, tickets flow live between two browser tabs,
billing page shows a real (test-mode) subscription. `make test` green. CI green.
Real screenshots in `docs/img/`. README sells it in 30 seconds with true numbers.
