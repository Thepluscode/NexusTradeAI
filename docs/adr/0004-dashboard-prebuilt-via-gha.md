# ADR-0004: Dashboard `dist/` pre-built in GHA and committed; Railway only serves static files

- **Status:** Accepted
- **Date:** 2026-04
- **Owner:** nexus-dashboard
- **Related:** ADR-0003 (the underlying "self-contained leaf" principle)
- **Tags:** deploy, build

## Context

The dashboard is a Vite-built React SPA. Two options for production:

1. **Build on Railway** — `deploy/dashboard/` contains the full source; Railway runs `npm install && npm run build && npm run start`. Pro: standard. Con: build time eats redeploy latency, build environments drift (Vite, node major), and a failed build blocks redeploy of an otherwise-healthy artifact.
2. **Build in GHA, serve static** — GHA builds the bundle, commits `dist/` to `deploy/dashboard/dist/` with `[skip ci]`, and `deploy/dashboard/server.js` is a 30-line Express static-file server. Railway only ever serves; never builds.

Memory notes about Railway filesystem ephemerality, JWT secret drift detection, and historical 502s during build steps biased us toward (2).

## Decision

Choose (2):

1. `.github/workflows/deploy.yml` job `build-dashboard`:
   - Runs only if `clients/bot-dashboard/src/`, `index.html`, `vite.config.ts`, or `package.json` changed since the last real (non-`[skip ci]`) commit. Detected via `git log --oneline | grep -v '\[skip ci\]'` to find the last source commit and diffing against it.
   - `npm install && npm run build` (Vite)
   - **Production URL assertions** in the built bundle:
     - No `localhost:` URLs (would break in prod)
     - All five Railway production URLs present
   - `rm -rf deploy/dashboard/dist/assets && cp -r clients/bot-dashboard/dist/. deploy/dashboard/dist/`
   - `git commit -m "chore: sync deploy files (bot-only) [skip ci]"` and push (with rebase-on-conflict).
2. `deploy/dashboard/server.js` is a thin Express app:
   - Caches hashed `/assets/*` for 1 year, immutable
   - Serves `index.html` with `no-cache, no-store, must-revalidate`
   - SPA fallback: any unknown route → `index.html`
3. `deploy/dashboard/package.json` has only `express` as a dependency.

## Consequences

- **Positive:** Redeploy latency = "Railway pulls latest commit and restarts a static-file server" — measured in ~30 seconds, not minutes.
- **Positive:** Build failures fail in CI on `main`, not in Railway after merge. CI is the gate.
- **Positive:** Hashed assets are cached aggressively at the browser; only `index.html` (small) is re-fetched per session.
- **Positive:** Production URLs are asserted at CI time. The bundle cannot contain a `localhost:` URL or miss a Railway hostname without the workflow failing red.
- **Cost:** The repo carries the built `dist/` in history forever. Hashed filenames mean each build is a separate commit's worth of new files. Manageable, but the repo will grow steadily.
- **Cost:** `[skip ci]` commits proliferate. Filter them out of useful `git log` views: `git log --oneline | grep -v '\[skip ci\]'`.
- **Cost:** Adds rebase complexity if two deploys race (handled by `concurrency: deploy-production cancel-in-progress: false` in `deploy.yml`).

## Implementation pointers

- `.github/workflows/deploy.yml` — `build-dashboard` job, "Copy dist to deploy/dashboard/" step
- `deploy/dashboard/server.js` — Express static-file server (~30 lines)
- `deploy/dashboard/package.json` — single `express` dep
- `deploy/dashboard/dist/` — committed build output

## Open questions

- A CDN in front of `nexus-dashboard` (Cloudflare) would offload most of the static-file load. Open architectural question, not urgent.
- The `[skip ci]` bundle commits will eventually dominate the commit log. At some point, consider squashing them or filtering them in CI summaries.
