// Tests for shared/module-loader.js (RFC #46).
//
// Three layers:
//  1. Loader unit tests — resolution semantics with fake require functions.
//  2. Golden parity — the crypto manifest run under simulated deploy/<bot>/
//     and dev layouts must reproduce the EXACT real-vs-stub outcomes of the
//     original inline chains (incl. the deliberate prod stubbing of the big
//     block — EDGE_FINDINGS 2026-06-04). A flipped outcome here is a
//     behavior change and must be an explicit, reviewed decision.
//  3. Manifest ↔ deploy.yml contract — every './signals/X' candidate must be
//     in deploy.yml's sync whitelist (the silent-prod-stub bug class), and
//     the loader + manifest themselves must be synced.

'use strict';

const fs = require('fs');
const path = require('path');
const { loadModules } = require('../module-loader');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const DEPLOY_YML = path.join(REPO_ROOT, '.github/workflows/deploy.yml');
const cryptoManifest = require('../../crypto-modules.manifest');

function notFound(p) {
    const e = new Error(`Cannot find module '${p}'`);
    e.code = 'MODULE_NOT_FOUND';
    return e;
}

// requireFn factory: resolves paths in `resolvable` to sentinel modules.
function fakeRequire(resolvable) {
    return (p) => {
        if (Object.prototype.hasOwnProperty.call(resolvable, p)) return resolvable[p];
        throw notFound(p);
    };
}

const noLog = () => {};

// Parse the `for SIG in ...` whitelist (and shared-file cp lines) out of deploy.yml.
function parseDeploySync() {
    const yml = fs.readFileSync(DEPLOY_YML, 'utf8');
    const sigMatch = yml.match(/for SIG in ([\s\S]*?);\s*do/);
    if (!sigMatch) throw new Error('could not parse SIG whitelist from deploy.yml');
    const sigList = sigMatch[1].replace(/\\\n/g, ' ').split(/\s+/).filter(Boolean);
    return { sigList, yml };
}

describe('module-loader: resolution semantics', () => {
    const entry = (over = {}) => ({
        name: 'mod', from: ['./a', './b'],
        picks: { fn: 'fn' }, stubs: { fn: () => 'stub' }, ...over,
    });
    const manifest = (groups, bot = `t${Math.random().toString(36).slice(2)}`) => ({ bot, groups });

    test('first candidate wins', () => {
        const reg = loadModules(manifest([{ name: 'g', mode: 'independent', entries: [entry()] }]), {
            baseDir: '/x', log: noLog,
            requireFn: fakeRequire({ './a': { fn: () => 'a' }, './b': { fn: () => 'b' } }),
        });
        expect(reg.exports.fn()).toBe('a');
        expect(reg.report().entries[0]).toMatchObject({ status: 'real', source: './a' });
    });

    test('falls through to second candidate, records the failed attempt', () => {
        const reg = loadModules(manifest([{ name: 'g', mode: 'independent', entries: [entry()] }]), {
            baseDir: '/x', log: noLog, requireFn: fakeRequire({ './b': { fn: () => 'b' } }),
        });
        expect(reg.exports.fn()).toBe('b');
        const e = reg.report().entries[0];
        expect(e.source).toBe('./b');
        expect(e.attempts).toHaveLength(1);
        expect(e.attempts[0]).toMatchObject({ path: './a', kind: 'missing' });
    });

    test('all candidates fail → stub binding + stubsActive', () => {
        const reg = loadModules(manifest([{ name: 'g', mode: 'independent', entries: [entry()] }]), {
            baseDir: '/x', log: noLog, requireFn: fakeRequire({}),
        });
        expect(reg.exports.fn()).toBe('stub');
        expect(reg.report().stubsActive).toEqual(['mod']);
    });

    test('broken module (exists but throws) is distinguished from missing', () => {
        const reg = loadModules(manifest([{ name: 'g', mode: 'independent', entries: [entry({ from: ['./a'] })] }]), {
            baseDir: '/x', log: noLog,
            requireFn: (p) => { const e = new Error(`Cannot find module 'transitive-dep'`); e.code = 'MODULE_NOT_FOUND'; throw e; },
        });
        expect(reg.report().entries[0].attempts[0].kind).toBe('broken');
    });

    test('destructuring parity: missing export binds undefined but module is real', () => {
        const reg = loadModules(manifest([{ name: 'g', mode: 'independent', entries: [entry()] }]), {
            baseDir: '/x', log: noLog, requireFn: fakeRequire({ './a': { other: 1 } }),
        });
        expect(reg.exports.fn).toBeUndefined();
        expect(reg.report().entries[0].status).toBe('real');
    });

    test('chain: mid-chain failure keeps earlier reals, stubs the rest, runs rescue', () => {
        const m = manifest([{
            name: 'block', mode: 'chain',
            entries: [
                { name: 'one', from: ['./one'], picks: { a: 'a' }, stubs: { a: 'stubA' } },
                { name: 'two', from: ['./two'], picks: { b: 'b' }, stubs: { b: 'stubB' } },
                { name: 'three', from: ['./three'], picks: { c: 'c' }, stubs: { c: 'stubC' } },
            ],
            onChainFail: [{ name: 'three-local', from: ['./three-local'], picks: { c: 'c' }, stubs: {} }],
        }]);
        const reg = loadModules(m, {
            baseDir: '/x', log: noLog,
            requireFn: fakeRequire({ './one': { a: 'realA' }, './three': { c: 'NEVER' }, './three-local': { c: 'rescueC' } }),
        });
        expect(reg.exports.a).toBe('realA');     // before the break: real
        expect(reg.exports.b).toBe('stubB');     // the break: stub
        expect(reg.exports.c).toBe('rescueC');   // after the break: skipped, then rescued
        const statuses = Object.fromEntries(reg.report().entries.map(e => [e.name, e.status]));
        expect(statuses).toMatchObject({ one: 'real', two: 'stub', three: 'stub', 'three-local': 'real' });
    });

    test('chain: full success never runs rescue', () => {
        const m = manifest([{
            name: 'block', mode: 'chain',
            entries: [{ name: 'one', from: ['./one'], picks: { a: 'a' }, stubs: { a: 'stubA' } }],
            onChainFail: [{ name: 'rescue', from: ['./rescue'], picks: { a: 'a' }, stubs: {} }],
        }]);
        const reg = loadModules(m, {
            baseDir: '/x', log: noLog,
            requireFn: fakeRequire({ './one': { a: 'realA' }, './rescue': { a: 'RESCUE' } }),
        });
        expect(reg.exports.a).toBe('realA');
        expect(reg.report().entries.map(e => e.name)).toEqual(['one']);
    });

    test('overrides inject a module without touching require', () => {
        const reg = loadModules(manifest([{ name: 'g', mode: 'independent', entries: [entry()] }]), {
            baseDir: '/x', log: noLog, requireFn: fakeRequire({}),
            overrides: { mod: { fn: () => 'injected' } },
        });
        expect(reg.exports.fn()).toBe('injected');
        expect(reg.report().entries[0].status).toBe('override');
    });

    test('exports are frozen', () => {
        const reg = loadModules(manifest([{ name: 'g', mode: 'independent', entries: [entry()] }]), {
            baseDir: '/x', log: noLog, requireFn: fakeRequire({}),
        });
        expect(() => { 'use strict'; reg.exports.fn = null; }).toThrow();
    });

    test('malformed manifest and entries throw at boot', () => {
        expect(() => loadModules({ bot: 'x' }, { baseDir: '/x', log: noLog })).toThrow(/malformed manifest/);
        expect(() => loadModules(
            { bot: 'x2', groups: [{ name: 'g', entries: [{ name: 'bad', from: [] }] }] },
            { baseDir: '/x', log: noLog },
        )).toThrow(/malformed entry/);
    });

    test('double-load guard: same bot twice (without test injection) throws', () => {
        const m = { bot: 'guard-test-bot', groups: [] };
        loadModules(m, { baseDir: '/x', log: noLog });
        expect(() => loadModules(m, { baseDir: '/x', log: noLog })).toThrow(/already loaded/);
    });
});

describe('golden parity: crypto manifest vs original inline chains', () => {
    const { sigList } = parseDeploySync();

    // Simulated Railway layout (deploy/crypto-bot/): './signals/X' resolves iff
    // X.js is in the deploy.yml sync list; './signal-analytics' and
    // './auto-optimizer' are synced; NOTHING under '../../' resolves.
    const sentinel = (p) => ({ __sentinel: p });
    const deployRequire = (p) => {
        if (p === './signal-analytics' || p === './auto-optimizer') return sentinel(p);
        const m = p.match(/^\.\/signals\/([\w-]+)$/);
        if (m && sigList.includes(`${m[1]}.js`)) return sentinel(p);
        throw notFound(p);
    };

    // Simulated dev layout (clients/bot-dashboard/): no local signals/ dir;
    // everything under '../../services/' resolves; './signal-analytics' resolves.
    const devRequire = (p) => {
        if (p === './signal-analytics' || p.startsWith('../../services/')) return sentinel(p);
        throw notFound(p);
    };

    test('PROD layout: big block fully stubbed (deliberate), locals real, optimizer rescued', () => {
        const reg = loadModules(cryptoManifest, { baseDir: '/app', log: noLog, requireFn: deployRequire });
        const r = reg.report();
        // The deliberate prod-stub set — flipping ANY of these is a gate change
        // requiring evidence per EDGE_FINDINGS 2026-06-04:
        expect([...r.stubsActive].sort()).toEqual([
            'api-handlers', 'auto-optimizer', 'committee-scorer', 'confidence-calibrator',
            'entry-qualifier', 'exit-manager', 'monte-carlo-sizer',
        ]);
        // Exact stub behaviors the engine depends on:
        expect(reg.exports.qualifyEntry()).toEqual({ qualified: true, reason: 'no-qualifier', ev: 0, allocationFactor: 1.0 });
        expect(reg.exports.computePortfolioHeat()).toEqual({ heat: 0, canOpen: true });
        expect(reg.exports.sharedCalibrateConfidence(0.42)).toBe(0.42);
        expect(reg.exports.sharedCommitteeScore).toBeUndefined();
        expect(reg.exports.BOT_COMPONENTS.crypto.components).toContain('momentum');
        // Kill-switch fallback never blocks (Rule 9) — but here it must be REAL:
        const byName = Object.fromEntries(r.entries.map(e => [e.name, e]));
        for (const name of ['health-monitor', 'health-pnl', 'kill-switch', 'engine-registry-summary',
            'compat', 'indicators', 'edge-stats', 'regime-detector', 'portfolio-intelligence',
            'event-calendar', 'cross-asset', 'microstructure', 'liquidity-sweep', 'normalizers']) {
            expect(byName[name].status).toBe('real');
            expect(byName[name].source).toBe(`./signals/${name === 'normalizers' ? 'normalizers' : name}`);
        }
        // [v17.1] Railway rescue: auto-optimizer loads locally after the chain breaks.
        expect(byName['auto-optimizer-local']).toMatchObject({ status: 'real', source: './auto-optimizer' });
        // Monte Carlo: inline Kelly fallback in prod, by design.
        expect(byName['monte-carlo-sizer'].status).toBe('stub');
        const sizer = new reg.exports.MonteCarloSizer();
        expect(sizer.optimize()).toMatchObject({ optimalFraction: 0.02, confidence: 'low' });
        // The correlation-guard inline fallback (count-based):
        const guard = reg.exports.computeCorrelationGuard([
            { direction: 'long' }, { direction: 'long' }, { direction: 'long' },
            { direction: 'long' }, { direction: 'short' },
        ]);
        expect(guard).toMatchObject({ isConcentrated: true, directionBias: 'long', longCount: 4, shortCount: 1 });
    });

    test('normalizers fully unavailable: stub is the CORRECTED array-shape normalizer', () => {
        // Regression for the 2026-05-14 zero-bars incident: if BOTH normalizer
        // candidates fail, the fallback must parse Kraken array bars, not
        // silently produce zeros from object-shaped access.
        const reg = loadModules(cryptoManifest, {
            baseDir: '/x', log: noLog,
            requireFn: (p) => { throw notFound(p); },
        });
        const bars = reg.exports.normalizeCryptoBars([[1700000000, '1.5', '2.5', '1.0', '2.0', '99']]);
        expect(bars[0]).toEqual({ open: 1.5, high: 2.5, low: 1.0, close: 2.0, volume: 99 });
        expect(reg.report().stubsActive).toContain('normalizers');
    });

    test('DEV layout: everything real, nothing stubbed', () => {
        const reg = loadModules(cryptoManifest, { baseDir: '/repo/clients/bot-dashboard', log: noLog, requireFn: devRequire });
        const r = reg.report();
        expect(r.stubsActive).toEqual([]);
        const byName = Object.fromEntries(r.entries.map(e => [e.name, e]));
        expect(byName['entry-qualifier']).toMatchObject({ status: 'real', source: '../../services/signals/entry-qualifier' });
        expect(byName['compat']).toMatchObject({ status: 'real', source: '../../services/signals/compat' });
        expect(byName['monte-carlo-sizer']).toMatchObject({ status: 'real', source: '../../services/trading/monte-carlo-sizer' });
        // No rescue entry when the chain succeeds:
        expect(byName['auto-optimizer-local']).toBeUndefined();
    });

    test('REAL dev filesystem: manifest transcription actually loads the real modules', () => {
        // Non-hermetic on purpose: anchors at clients/bot-dashboard with the real
        // require — verifies every '../../services/...' path in the manifest
        // points at a file that exists and loads (transcription typo detector).
        const reg = loadModules(cryptoManifest, {
            baseDir: path.resolve(__dirname, '../..'), log: noLog,
            // bypass double-load guard via explicit (empty) overrides object
            overrides: {},
        });
        const r = reg.report();
        expect(r.stubsActive).toEqual([]); // dev layout: everything must be real
        expect(typeof reg.exports.qualifyEntry).toBe('function');
        expect(typeof reg.exports.sharedCommitteeScore).toBe('function');
        expect(typeof reg.exports.normalizeCryptoBars).toBe('function');
        expect(reg.exports.sharedSignals).not.toBeNull();
        expect(typeof reg.exports.MonteCarloSizer).toBe('function'); // class
    });
});

describe('manifest ↔ deploy.yml contract', () => {
    const { sigList, yml } = parseDeploySync();

    test('every ./signals/ candidate in the crypto manifest is in the deploy.yml sync list', () => {
        const missing = [];
        for (const group of cryptoManifest.groups) {
            for (const entry of [...group.entries, ...(group.onChainFail || [])]) {
                for (const p of entry.from) {
                    const m = p.match(/^\.\/signals\/([\w-]+)$/);
                    if (m && !sigList.includes(`${m[1]}.js`)) missing.push(p);
                }
            }
        }
        // A miss here is the exact silent-prod-stub bug class this loader exists to kill.
        expect(missing).toEqual([]);
    });

    test('deploy.yml syncs the loader and the crypto manifest into deploy dirs', () => {
        expect(yml).toContain('shared/module-loader.js');
        expect(yml).toContain('crypto-modules.manifest.js');
    });

    test('non-signals local candidates are synced by deploy.yml', () => {
        expect(yml).toContain('signal-analytics.js');
        expect(yml).toContain('auto-optimizer.js');
    });
});
