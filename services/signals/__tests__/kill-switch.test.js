/**
 * kill-switch — enforcement matcher + cached, fail-open DB gate.
 */
const { killKey, matchKill, createKillSwitchGate } = require('../kill-switch');

describe('killKey', () => {
  it('builds <strategy>|<regime>', () => {
    expect(killKey('momentum', 'MEAN_REVERTING')).toBe('momentum|MEAN_REVERTING');
  });
  it('coalesces blank/null strategy to (unknown) and regime to (any) — mirrors the cron', () => {
    expect(killKey('', 'X')).toBe('(unknown)|X');
    expect(killKey('momentum', '')).toBe('momentum|(any)');
    expect(killKey(null, null)).toBe('(unknown)|(any)');
    expect(killKey('momentum', '   ')).toBe('momentum|(any)');
  });
});

describe('matchKill', () => {
  const map = new Map([
    ['momentum|MEAN_REVERTING', 'losing in MR'],
    ['orb|(any)', 'losing everywhere'],
  ]);

  it('matches an exact (strategy, regime) flag', () => {
    expect(matchKill(map, 'momentum', 'MEAN_REVERTING')).toEqual({ killed: true, key: 'momentum|MEAN_REVERTING', reason: 'losing in MR' });
  });
  it('does NOT match the same strategy in a different regime', () => {
    expect(matchKill(map, 'momentum', 'TRENDING_UP')).toBeNull();
  });
  it('an (any)-regime flag blocks the strategy in every regime', () => {
    expect(matchKill(map, 'orb', 'TRENDING_UP').key).toBe('orb|(any)');
    expect(matchKill(map, 'orb', 'MEAN_REVERTING').key).toBe('orb|(any)');
  });
  it('returns null for unflagged strategies and for an empty map', () => {
    expect(matchKill(map, 'breakout', 'X')).toBeNull();
    expect(matchKill(new Map(), 'momentum', 'MEAN_REVERTING')).toBeNull();
    expect(matchKill(null, 'momentum', 'MEAN_REVERTING')).toBeNull();
  });
});

describe('createKillSwitchGate', () => {
  function poolReturning(rows, counter) {
    return { query: async (_sql, params) => { if (counter) { counter.calls++; counter.lastBot = params[0]; } return { rows }; } };
  }

  it('blocks a flagged bucket and passes an unflagged one', async () => {
    const pool = poolReturning([{ strategy: 'momentum', market_regime: 'MEAN_REVERTING', reason: 'r' }]);
    const gate = createKillSwitchGate({ dbPool: pool, bot: 'crypto' });
    expect(await gate.isKilled('momentum', 'MEAN_REVERTING')).toMatchObject({ killed: true });
    expect(await gate.isKilled('momentum', 'TRENDING_UP')).toBeNull();
  });

  it('queries scoped to the bot', async () => {
    const counter = { calls: 0 };
    const gate = createKillSwitchGate({ dbPool: poolReturning([], counter), bot: 'forex' });
    await gate.isKilled('x', 'y');
    expect(counter.lastBot).toBe('forex');
  });

  it('caches within the TTL — one DB hit for many checks', async () => {
    const counter = { calls: 0 };
    const gate = createKillSwitchGate({ dbPool: poolReturning([], counter), bot: 'crypto', ttlMs: 60000 });
    await gate.isKilled('a', 'b');
    await gate.isKilled('c', 'd');
    await gate.isKilled('e', 'f');
    expect(counter.calls).toBe(1);
  });

  it('refreshes after the TTL expires', async () => {
    const counter = { calls: 0 };
    // ttlMs -1 ⇒ cache is always considered stale (deterministic regardless of ms clock).
    const gate = createKillSwitchGate({ dbPool: poolReturning([], counter), bot: 'crypto', ttlMs: -1 });
    await gate.isKilled('a', 'b');
    await gate.isKilled('c', 'd');
    expect(counter.calls).toBe(2);
  });

  it('FAILS OPEN and logs when the DB query throws (never blocks on infra error)', async () => {
    const pool = { query: async () => { throw new Error('db down'); } };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const gate = createKillSwitchGate({ dbPool: pool, bot: 'crypto' });
    expect(await gate.isKilled('momentum', 'MEAN_REVERTING')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('bot=crypto'));
    warn.mockRestore();
  });

  it('null pool → never kills', async () => {
    const gate = createKillSwitchGate({ dbPool: null, bot: 'crypto' });
    expect(await gate.isKilled('momentum', 'MEAN_REVERTING')).toBeNull();
  });
});
