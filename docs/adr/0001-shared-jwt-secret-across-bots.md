# ADR-0001: Shared `JWT_SECRET` across stock/forex/crypto bots; stock-bot hosts `/api/auth/refresh`

- **Status:** Accepted
- **Date:** 2026-04-03
- **Owner:** stock-bot (auth issuer), all bots (verifiers)
- **Related:** ADR-0002 (proactive refresh), ADR-0003 (self-contained deploy leaves)
- **Tags:** auth, security

## Context

The platform has three Node trading services (`nexus-stock-bot`, `nexus-forex-bot`, `nexus-crypto-bot`) plus a dashboard SPA. The operator wants to log in once and have the resulting session work against any of the three bots — e.g. the dashboard's `/crypto` page calls `nexus-crypto-bot` but uses the token minted by the login form, which posts to `nexus-stock-bot`.

Initially each bot had its own inline JWT logic (byte-identical implementations of `requireJwt`, `signTokens`, `registerAuthRoutes`). Three copies meant three opportunities for drift; any divergence in `JWT_SECRET` produces silent 401s for cross-service requests with no clear signal of why.

In the 2026-05-16 incident, a console 401 on `/api/crypto/engine/status` triggered a full audit. The fix path required verifying that the shared secret was identical across all three services (it was — SHA `dd8b155e...` matched on stock/crypto/forex).

## Decision

1. Extract auth logic into `shared/auth.js` (one canonical module synced into each `deploy/*-bot/shared/auth.js` by CI).
2. All three bots **verify** JWTs against the same `JWT_SECRET` env var. Drift between services is treated as a misconfiguration to be detected at deploy time.
3. Only `nexus-stock-bot` **mints** tokens. It exposes the canonical `POST /api/auth/login`, `POST /api/auth/register`, and `POST /api/auth/refresh`. The dashboard's API client (`clients/bot-dashboard/src/services/api.ts`) hardcodes `SERVICE_URLS.stockBot` for the refresh endpoint.
4. Forex-bot and crypto-bot **also expose** the same auth routes (because `registerAuthRoutes()` is called there too), but the dashboard never hits them.

## Consequences

- **Positive:** One session works across all three bots. No extra coordination layer (Keycloak, Auth0) needed. Token format is uniform, debugging is straightforward.
- **Cost:** All three services must hold the same secret. Rotation requires updating it on every service simultaneously, or the next request 401s mid-rotation. There is no automated drift detector — drift only surfaces as 401s in production.
- **Locks in:** Stock-bot is the de-facto session authority. If we ever split it (e.g. micro-service it), the auth flow moves with it.
- **Risk if violated:** `JWT_SECRET` falling back to the literal string `'dev-secret-change-me'` on any bot (when env var is missing) means that bot accepts only tokens signed with that literal — silent 401s for all real users.

## Implementation pointers

- `deploy/stock-bot/shared/auth.js` (source-of-truth lives in `clients/bot-dashboard/shared/auth.js`)
- `deploy/crypto-bot/shared/auth.js` (identical copy, synced by CI)
- `deploy/forex-bot/shared/auth.js` (identical copy)
- `clients/bot-dashboard/src/services/api.ts` — `tryRefreshToken()` hits `SERVICE_URLS.stockBot` for the refresh endpoint
- Commit `3ae3a17`: "fix: restore self-contained deploy dirs for Railway rootDirectory" — introduced the shared extraction

## Open questions

- Should we add an admin endpoint that returns `sha256(JWT_SECRET)` so the GHA deploy workflow can assert all three services agree before declaring deploy success?
- Long-term: rotate `JWT_SECRET` on a schedule. Currently never rotated.
