#!/usr/bin/env node
/**
 * fix-pnl-pct.js
 *
 * Fixes corrupted pnl_pct values in the trades table.
 *
 * Issues addressed:
 *   1. Some trades stored pnl_pct as whole-number percentages (5.77 instead of 0.0577)
 *   2. Some trades have pnl_pct ≈ 0 when the real P&L based on prices is significant
 *
 * Correct formula (stored as decimal, e.g. 0.0577 = +5.77%):
 *   LONG:  (exit_price - entry_price) / entry_price
 *   SHORT: (entry_price - exit_price) / entry_price
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/fix-pnl-pct.js
 *   # or on Railway where DATABASE_URL is already set:
 *   node scripts/fix-pnl-pct.js
 */

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('railway') || DATABASE_URL.includes('neon')
    ? { rejectUnauthorized: false }
    : undefined,
});

async function run() {
  const client = await pool.connect();
  try {
    // ── 1. Show current state ──────────────────────────────────────────
    const { rows: summary } = await client.query(`
      SELECT
        count(*)                                          AS total_closed,
        count(*) FILTER (WHERE entry_price > 0 AND exit_price > 0) AS have_prices,
        count(*) FILTER (WHERE pnl_pct IS NULL)           AS null_pnl
      FROM trades
      WHERE status = 'closed'
    `);
    console.log('\n── Current state ──');
    console.log(`  Closed trades:          ${summary[0].total_closed}`);
    console.log(`  With entry+exit prices: ${summary[0].have_prices}`);
    console.log(`  NULL pnl_pct:           ${summary[0].null_pnl}`);

    // ── 2. Sample BEFORE values ────────────────────────────────────────
    const { rows: samplesBefore } = await client.query(`
      SELECT id, bot, symbol, direction, entry_price, exit_price, pnl_pct,
             CASE
               WHEN UPPER(direction) IN ('LONG','BUY')
                 THEN ROUND((exit_price - entry_price) / entry_price, 6)
               ELSE
                 ROUND((entry_price - exit_price) / entry_price, 6)
             END AS correct_pnl_pct
      FROM trades
      WHERE status = 'closed'
        AND entry_price > 0
        AND exit_price > 0
      ORDER BY
        ABS(pnl_pct - CASE
          WHEN UPPER(direction) IN ('LONG','BUY')
            THEN (exit_price - entry_price) / entry_price
          ELSE (entry_price - exit_price) / entry_price
        END) DESC
      LIMIT 10
    `);

    if (samplesBefore.length > 0) {
      console.log('\n── Top 10 most-wrong rows (BEFORE fix) ──');
      console.log('  ID   | Bot    | Symbol     | Dir   | Entry       | Exit        | Old pnl_pct | Correct');
      console.log('  ' + '-'.repeat(95));
      for (const r of samplesBefore) {
        console.log(
          `  ${String(r.id).padEnd(5)}| ${(r.bot || '').padEnd(7)}| ${r.symbol.padEnd(11)}| ${r.direction.padEnd(6)}` +
          `| ${String(r.entry_price).padEnd(12)}| ${String(r.exit_price).padEnd(12)}` +
          `| ${String(r.pnl_pct).padEnd(12)}| ${r.correct_pnl_pct}`
        );
      }
    }

    // ── 3. Run the fix ─────────────────────────────────────────────────
    const updateSQL = `
      UPDATE trades
      SET pnl_pct = ROUND(
        CASE
          WHEN UPPER(direction) IN ('LONG', 'BUY')
            THEN (exit_price - entry_price) / entry_price
          ELSE
            (entry_price - exit_price) / entry_price
        END,
        6
      )
      WHERE status = 'closed'
        AND entry_price > 0
        AND exit_price > 0
    `;

    const result = await client.query(updateSQL);
    console.log(`\n── Fix applied ──`);
    console.log(`  Rows updated: ${result.rowCount}`);

    // ── 4. Sample AFTER values ─────────────────────────────────────────
    if (samplesBefore.length > 0) {
      const ids = samplesBefore.map(r => r.id);
      const { rows: samplesAfter } = await client.query(
        `SELECT id, symbol, direction, entry_price, exit_price, pnl_pct
         FROM trades WHERE id = ANY($1) ORDER BY id`,
        [ids]
      );
      console.log('\n── Same rows AFTER fix ──');
      console.log('  ID   | Symbol     | Dir   | Entry       | Exit        | New pnl_pct');
      console.log('  ' + '-'.repeat(80));
      for (const r of samplesAfter) {
        console.log(
          `  ${String(r.id).padEnd(5)}| ${r.symbol.padEnd(11)}| ${r.direction.padEnd(6)}` +
          `| ${String(r.entry_price).padEnd(12)}| ${String(r.exit_price).padEnd(12)}` +
          `| ${r.pnl_pct}`
        );
      }
    }

    // ── 5. Also fix pnl_usd if it looks wrong (optional sanity check) ─
    const { rows: pnlUsdCheck } = await client.query(`
      SELECT count(*) AS mismatched
      FROM trades
      WHERE status = 'closed'
        AND entry_price > 0
        AND exit_price > 0
        AND quantity > 0
        AND ABS(
          pnl_usd - (
            CASE WHEN UPPER(direction) IN ('LONG','BUY')
              THEN (exit_price - entry_price) * quantity
              ELSE (entry_price - exit_price) * quantity
            END
          )
        ) > 1.0
    `);
    if (Number(pnlUsdCheck[0].mismatched) > 0) {
      console.log(`\n⚠️  ${pnlUsdCheck[0].mismatched} trades also have pnl_usd that differs from price×qty by >$1.`);
      console.log('   Run a separate audit if needed.');
    }

    console.log('\n✅ Done.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
