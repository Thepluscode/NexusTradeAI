const schema = require('../schema');

describe('schema', () => {
    test('exports initSignalSchema as a function', () => {
        expect(typeof schema.initSignalSchema).toBe('function');
    });

    test('initSignalSchema is async', () => {
        expect(schema.initSignalSchema.constructor.name).toBe('AsyncFunction');
    });

    test('initSignalSchema accepts a dbPool argument', async () => {
        // Mock dbPool.query that records calls
        const queries = [];
        const mockPool = { query: async (sql) => { queries.push(sql); return { rows: [] }; } };
        await schema.initSignalSchema(mockPool);
        // Expect 4 CREATE TABLE statements
        const creates = queries.filter(q => q.includes('CREATE TABLE'));
        expect(creates.length).toBeGreaterThanOrEqual(4);
    });

    test('initSignalSchema is idempotent (uses IF NOT EXISTS)', async () => {
        const queries = [];
        const mockPool = { query: async (sql) => { queries.push(sql); return { rows: [] }; } };
        await schema.initSignalSchema(mockPool);
        queries.forEach(q => {
            if (q.includes('CREATE TABLE')) {
                expect(q).toMatch(/CREATE TABLE IF NOT EXISTS/);
            }
        });
    });

    test('initSignalSchema creates all 4 expected tables', async () => {
        const queries = [];
        const mockPool = { query: async (sql) => { queries.push(sql); return { rows: [] }; } };
        await schema.initSignalSchema(mockPool);
        const allSql = queries.join(' ');
        expect(allSql).toMatch(/historical_bars_cache/);
        expect(allSql).toMatch(/backtest_results/);
        expect(allSql).toMatch(/shadow_signals/);
        expect(allSql).toMatch(/strategy_enabled/);
    });

    test('initSignalSchema tolerates null dbPool without crashing', async () => {
        // When DATABASE_URL is unset, callers pass null — must not throw
        await expect(schema.initSignalSchema(null)).resolves.not.toThrow();
    });
});
