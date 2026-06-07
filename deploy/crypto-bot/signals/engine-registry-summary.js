/**
 * engine-registry-summary.js — per-user engine visibility for /api/health/detailed.
 *
 * All three bots are per-user: real trading runs in a registry of per-user engines
 * (creds from app Settings), NOT the legacy global engine (env creds, often demo).
 * Health/monitoring historically reported only the global engine, so a global engine
 * idling in demo (no env creds) looked like an outage. These helpers summarize the
 * registry and derive an operational status that reflects actual user activity.
 *
 * Pure / never throws. Caller passes Date.now() so the math is testable.
 */

const EMPTY = Object.freeze({
  total: 0, running: 0, validCreds: 0, demo: 0,
  openPositions: 0, lastScanAt: null, lastScanAgeSec: null,
});

/**
 * @param {Map<any, object>|null} registry - userId -> engine
 * @param {number} [now]
 */
function summarizeRegistry(registry, now = Date.now()) {
  if (!registry || typeof registry.values !== 'function') return { ...EMPTY };
  let total = 0, running = 0, validCreds = 0, demo = 0, openPositions = 0, lastScanAt = null;
  for (const eng of registry.values()) {
    if (!eng) continue;
    total++;
    // Engine classes differ: crypto uses `isRunning`, stock/forex use `botRunning`.
    if ((eng.isRunning ?? eng.botRunning) === true) running++;
    // demo / credentialsValid are crypto-specific (Kraken auth); absent ⇒ not counted.
    if (eng.credentialsValid === true) validCreds++;
    if (eng.demoMode === true) demo++;
    if (eng.positions && typeof eng.positions.size === 'number') openPositions += eng.positions.size;
    const ls = Number(eng.lastScanAt);
    if (Number.isFinite(ls) && ls > 0 && (lastScanAt === null || ls > lastScanAt)) lastScanAt = ls;
  }
  return {
    total, running, validCreds, demo, openPositions, lastScanAt,
    lastScanAgeSec: lastScanAt ? Math.max(0, Math.round((now - lastScanAt) / 1000)) : null,
  };
}

/**
 * Derive a single operational status that distinguishes "idle by design" from a real stall.
 *   down        - endpoint/global unreachable (caller decides; not returned here)
 *   ok          - per-user engines running and scanning recently, OR global engine healthy
 *   starting    - per-user engines running but none has recorded a scan yet
 *   scan-stalled- engines that should be scanning aren't (real problem)
 *   idle        - per-user engines exist but none running (configured, not started)
 *   demo-idle   - no per-user engines and the global engine is demo (expected: no env creds / no users)
 *
 * @param {{demoMode?: boolean, scanHealthy?: boolean, userEngines: object}} detail
 * @param {{scanThresholdSec?: number}} [opts]
 */
function operationalStatus(detail, opts = {}) {
  const ue = (detail && detail.userEngines) || EMPTY;
  const threshold = opts.scanThresholdSec || 600; // 10 min default
  if (ue.total > 0) {
    if (ue.running === 0) return 'idle';
    if (ue.lastScanAgeSec == null) return 'starting';
    if (ue.lastScanAgeSec > threshold) return 'scan-stalled';
    return 'ok';
  }
  // No per-user engines → fall back to the global engine signal.
  if (detail && detail.demoMode === true) return 'demo-idle';
  if (detail && detail.scanHealthy === false) return 'scan-stalled';
  return 'ok';
}

/**
 * Per-engine credential state for the admin endpoint. NEVER includes secret values —
 * only userId, running/demo flags, validity, and the human-readable credentialsError.
 * @param {Map<any, object>|null} registry
 * @returns {Array<{userId:any, running:boolean, demo:boolean, credentialsValid:(boolean|null), credentialsError:(string|null)}>}
 */
function listEngineCredentials(registry) {
  if (!registry || typeof registry.entries !== 'function') return [];
  const out = [];
  for (const [userId, eng] of registry.entries()) {
    if (!eng) continue;
    out.push({
      userId,
      running: (eng.isRunning ?? eng.botRunning) === true,
      demo: eng.demoMode === true,
      credentialsValid: eng.credentialsValid ?? null,
      credentialsError: eng.credentialsError ?? null,
    });
  }
  return out;
}

module.exports = { summarizeRegistry, operationalStatus, listEngineCredentials, EMPTY };
