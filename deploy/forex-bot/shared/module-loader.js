// Manifest-driven shared-module loader (RFC #46).
//
// Replaces the per-bot try/require/stub chains with one boot-time load whose
// outcome is declared in a plain-data manifest and fully observable via
// report() — the fix for the 2026-06-04 silent-stub incident class
// (EDGE_FINDINGS.md). The loader contains NO resolution policy of its own:
// candidate order, group coupling, and stub values are data in the manifest,
// transcribed verbatim from the bots' original inline chains. Golden parity
// with that original behavior is enforced by tests; changing a manifest is a
// reviewed, behavior-visible diff.
//
// Semantics (mirrors the original `let` + try/assign model exactly):
//   pass 1 — every entry's stub values become the initial bindings, in order;
//   pass 2 — entries resolve in order and overwrite bindings ON SUCCESS ONLY.
// Group modes:
//   'independent' — each entry walks its own `from` chain (local-first style);
//   'chain'       — entries resolve sequentially in one logical try: the first
//                   entry that fails leaves itself AND all remaining members
//                   on stubs (members already resolved keep their real values),
//                   then the group's `onChainFail` entries run. This is the
//                   original "big block" topology, preserved deliberately —
//                   in the Railway layout it is what keeps qualifyEntry et al.
//                   stubbed in prod (evidence-backed; see EDGE_FINDINGS.md
//                   addendum 2026-06-04). De-coupling it is a manifest edit.

'use strict';

const path = require('path');
const { createRequire } = require('module');

const _loadedBots = new Set();

function attemptError(err, candidate) {
    const missing = err && err.code === 'MODULE_NOT_FOUND'
        && typeof err.message === 'string' && err.message.includes(`'${candidate}'`);
    return { path: candidate, kind: missing ? 'missing' : 'broken', error: String(err && err.message || err) };
}

// Assign an entry's resolved module into the bindings map (destructuring parity:
// a picked export that doesn't exist binds undefined — the module still "won").
function bindModule(bindings, entry, mod) {
    if (entry.bind) { bindings[entry.bind] = mod; return [entry.bind]; }
    const names = Object.keys(entry.picks);
    for (const local of names) bindings[local] = mod[entry.picks[local]];
    return names;
}

function bindStubs(bindings, entry) {
    if (entry.bind) {
        bindings[entry.bind] = Object.prototype.hasOwnProperty.call(entry, 'stub') ? entry.stub : undefined;
        return [entry.bind];
    }
    const names = Object.keys(entry.stubs || entry.picks || {});
    for (const local of names) bindings[local] = (entry.stubs || {})[local];
    return names;
}

function resolveEntry(entry, requireFn, overrides) {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, entry.name)) {
        return { status: 'override', source: '(override)', attempts: [], mod: overrides[entry.name] };
    }
    const attempts = [];
    for (const candidate of entry.from) {
        try {
            return { status: 'real', source: candidate, attempts, mod: requireFn(candidate) };
        } catch (err) {
            attempts.push(attemptError(err, candidate));
        }
    }
    return { status: 'stub', source: null, attempts, mod: null };
}

/**
 * Load every module a bot consumes, once, at boot.
 * @param {object} manifest          plain-data manifest ({ bot, groups })
 * @param {object} opts
 * @param {string} opts.baseDir      __dirname of the calling bot file — all
 *                                   `from` paths resolve relative to this
 * @param {Function} [opts.requireFn]  injectable for tests (fake layouts)
 * @param {object} [opts.overrides]    entry name → module (test injection)
 * @param {Function} [opts.log]        defaults to console.log
 * @returns {{ exports: object, report: () => object }} frozen registry
 */
function loadModules(manifest, opts) {
    if (!manifest || !Array.isArray(manifest.groups) || !manifest.bot) {
        throw new Error('[module-loader] malformed manifest: need { bot, groups[] }');
    }
    if (!opts || !opts.baseDir) throw new Error('[module-loader] opts.baseDir is required');
    if (_loadedBots.has(manifest.bot) && !opts.requireFn && !opts.overrides) {
        throw new Error(`[module-loader] modules for '${manifest.bot}' already loaded — call loadModules once per boot`);
    }

    const log = opts.log || console.log;
    const requireFn = opts.requireFn || createRequire(path.join(path.resolve(opts.baseDir), '__module_loader__.js'));
    const bindings = {};
    const entryReports = [];

    // Validate + pass 1: stub defaults in manifest order (the old `let` declarations).
    for (const group of manifest.groups) {
        for (const entry of [...group.entries, ...(group.onChainFail || [])]) {
            if (!entry.name || !Array.isArray(entry.from) || entry.from.length === 0
                || (!entry.picks && !entry.bind)) {
                throw new Error(`[module-loader] malformed entry '${entry && entry.name}' in group '${group.name}'`);
            }
        }
        for (const entry of group.entries) bindStubs(bindings, entry);
    }

    // Pass 2: resolution.
    for (const group of manifest.groups) {
        let chainBroken = false;
        for (const entry of group.entries) {
            if (group.mode === 'chain' && chainBroken) {
                entryReports.push({ name: entry.name, group: group.name, status: 'stub', source: null,
                    attempts: [], note: entry.note || null, bindings: bindStubs({}, entry), skipped: 'chain-broken' });
                continue;
            }
            const r = resolveEntry(entry, requireFn, opts.overrides);
            let bound;
            if (r.status === 'stub') {
                bound = bindStubs({}, entry); // bindings already hold stubs from pass 1
                if (group.mode === 'chain') chainBroken = true;
            } else {
                bound = bindModule(bindings, entry, r.mod);
            }
            entryReports.push({ name: entry.name, group: group.name, status: r.status,
                source: r.source, attempts: r.attempts, note: entry.note || null, bindings: bound });
        }
        if (group.mode === 'chain' && chainBroken && group.onChainFail) {
            if (group.chainFailLog) log(group.chainFailLog);
            for (const entry of group.onChainFail) {
                const r = resolveEntry(entry, requireFn, opts.overrides);
                const bound = r.status === 'stub' ? bindStubs({}, entry) : bindModule(bindings, entry, r.mod);
                entryReports.push({ name: entry.name, group: group.name, status: r.status,
                    source: r.source, attempts: r.attempts, note: entry.note || null,
                    bindings: bound, rescue: true });
            }
        }
    }

    const stubsActive = entryReports.filter(e => e.status === 'stub').map(e => e.name);
    const real = entryReports.filter(e => e.status !== 'stub');
    const summary = {
        entries: entryReports.length,
        real: real.length,
        stub: stubsActive.length,
        fromLocal: real.filter(e => e.source && e.source.startsWith('./')).length,
        fromServices: real.filter(e => e.source && e.source.startsWith('../../')).length,
    };
    log(`[MODULES] ${manifest.bot}: ${summary.real}/${summary.entries} real `
        + `(${summary.fromLocal} local, ${summary.fromServices} services)`
        + (summary.stub ? ` — ${summary.stub} STUBBED` : ''));
    for (const e of entryReports) {
        if (e.status !== 'stub') continue;
        const why = e.skipped === 'chain-broken' ? 'group chain failed earlier'
            : (e.attempts[e.attempts.length - 1] || {}).error || 'no candidate resolved';
        log(`[MODULES][STUB] ${e.name} (${e.group}): ${why}${e.note ? ` [${e.note}]` : ''}`);
    }

    const frozenReport = Object.freeze({
        bot: manifest.bot,
        loadedAt: new Date().toISOString(),
        summary: Object.freeze(summary),
        stubsActive: Object.freeze(stubsActive),
        entries: Object.freeze(entryReports.map(e => Object.freeze({
            ...e, attempts: Object.freeze(e.attempts), bindings: Object.freeze(e.bindings),
        }))),
    });

    _loadedBots.add(manifest.bot);
    return Object.freeze({ exports: Object.freeze(bindings), report: () => frozenReport });
}

module.exports = { loadModules };
