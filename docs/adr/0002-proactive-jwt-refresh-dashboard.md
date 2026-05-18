# ADR-0002: Dashboard proactively refreshes JWT 60s before expiry

- **Status:** Accepted
- **Date:** 2026-05-16
- **Owner:** nexus-dashboard
- **Related:** ADR-0001 (shared JWT)
- **Tags:** auth, ux

## Context

Access tokens are issued with a 24-hour lifetime. Without intervention, every 24 hours an in-progress dashboard session would see a `GET /api/crypto/engine/status 401 (Unauthorized)` line in the browser console as the first stale-token request fired before the response interceptor silently refreshed and retried. Functionally fine — the user never lost data — but the console error looked like a real bug and surfaced during a debug session on 2026-05-16.

The reactive flow (catch 401 → refresh → retry once) is the right safety net but a poor primary mechanism: every expiry cycle produces a visible console error.

## Decision

Add a **proactive** refresh layer alongside the existing reactive interceptor:

1. A module-level `setTimeout` armed at:
   - Module load (for sessions that arrive with a token already in localStorage)
   - After a successful login (both `/api/auth/login` and `/api/auth/dev-login`)
   - After every successful `tryRefreshToken()` (the timer re-arms itself)
2. Timer fires `REFRESH_LEAD_MS = 60_000` ms before the access token's `exp`. Delay is clamped to `>= 1000ms` so an already-expired token fires promptly rather than skipping.
3. Cross-tab coordination: a `window.addEventListener('storage', ...)` listener catches sibling-tab writes to `nexus_access_token` and re-arms this tab's timer against the new `exp`. Prevents two tabs from racing to call `/api/auth/refresh` after their respective timers fire near-simultaneously.
4. The reactive 401-retry interceptor **stays as-is** — it covers tabs waking from sleep past expiry, clock skew between client and bot, and any path that bypasses the timer.

## Consequences

- **Positive:** Users on an active session never see a console 401 on the normal expiry path. The proactive layer is invisible.
- **Positive:** Cross-tab listener prevents redundant refresh calls and stale-timer races.
- **Cost:** Two paths to the same goal increases reasoning cost when debugging an auth issue.
- **Cost:** Time-based: assumes tolerable clock skew. If the server's clock is hours ahead of the client's, the proactive timer fires "too early" but the resulting refresh still succeeds — degenerate but not broken.
- **Cost:** `setTimeout` is throttled when a tab is backgrounded. A tab that's been backgrounded for 24h+ will still see one reactive 401 on resumption (covered by the safety net).

## Implementation pointers

- `clients/bot-dashboard/src/services/api.ts`:
  - `readAccessTokenExpiryMs()` — decodes the JWT payload to extract `exp`
  - `scheduleProactiveRefresh()` — clears any existing timer and arms a new one
  - `tryRefreshToken()` — calls `scheduleProactiveRefresh()` after writing the new token to localStorage
  - Module bottom: `scheduleProactiveRefresh()` kicks the cycle off at module load
  - Storage event listener: re-arms when a sibling tab writes `nexus_access_token`
- `clients/bot-dashboard/src/pages/LoginPage.tsx` — calls `scheduleProactiveRefresh()` after both `setItem` pairs (login + dev-login)
- Commit `c097114`: "feat(dashboard): proactively refresh JWT 60s before exp to suppress reactive 401s"

## Open questions

- `REFRESH_LEAD_MS = 60_000` is a static guess. For shorter token TTLs, this may be too aggressive (refresh fires very early). Consider making the lead time a fraction of the token TTL (e.g. 5%) once we observe shorter TTLs.
- BroadcastChannel would be cleaner than the `storage` event for cross-tab coordination, but `storage` is sufficient for the single-operator case.
