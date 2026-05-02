const {
    evaluateLiveModeRequest,
    assertLiveModeAllowed,
    buildAuditEvent,
} = require('../live-safety');

describe('live trading safety', () => {
    test('allows paper mode without live approval controls', () => {
        const result = evaluateLiveModeRequest({
            requestedMode: 'paper',
            env: {},
            body: {},
        });

        expect(result.allowed).toBe(true);
        expect(result.mode).toBe('paper');
        expect(result.reasons).toEqual([]);
    });

    test('blocks live mode unless global live trading flag is enabled', () => {
        const result = evaluateLiveModeRequest({
            requestedMode: 'live',
            env: {},
            body: { operatorApproval: 'ok' },
        });

        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain('ALLOW_LIVE_TRADING must be true');
    });

    test('blocks live mode without matching operator approval token', () => {
        const result = evaluateLiveModeRequest({
            requestedMode: 'live',
            env: {
                ALLOW_LIVE_TRADING: 'true',
                LIVE_TRADING_APPROVAL_TOKEN: 'approve-live',
                MAX_DAILY_LOSS_USD: '250',
            },
            body: { operatorApproval: 'wrong' },
        });

        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain('operator approval token is missing or invalid');
    });

    test('blocks live mode without explicit positive max daily loss', () => {
        const result = evaluateLiveModeRequest({
            requestedMode: 'live',
            env: {
                ALLOW_LIVE_TRADING: 'true',
                LIVE_TRADING_APPROVAL_TOKEN: 'approve-live',
                MAX_DAILY_LOSS_USD: '0',
            },
            body: { operatorApproval: 'approve-live' },
        });

        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain('MAX_DAILY_LOSS_USD must be a positive number');
    });

    test('allows live mode only when every safety control is present', () => {
        const result = evaluateLiveModeRequest({
            requestedMode: 'live',
            env: {
                ALLOW_LIVE_TRADING: 'true',
                LIVE_TRADING_APPROVAL_TOKEN: 'approve-live',
                MAX_DAILY_LOSS_USD: '250',
            },
            body: { operatorApproval: 'approve-live' },
        });

        expect(result.allowed).toBe(true);
        expect(result.mode).toBe('live');
        expect(result.reasons).toEqual([]);
        expect(result.controls.maxDailyLossUsd).toBe(250);
    });

    test('assertLiveModeAllowed throws with safety reasons when blocked', () => {
        expect(() => assertLiveModeAllowed({
            requestedMode: 'live',
            env: {},
            body: {},
        })).toThrow(/Live mode blocked/);
    });

    test('buildAuditEvent redacts sensitive fields and preserves decision context', () => {
        const event = buildAuditEvent({
            bot: 'crypto',
            action: 'mode_change',
            decision: 'blocked',
            actor: 'api-secret',
            subject: 'live-mode',
            metadata: {
                reason: 'operator approval token is missing or invalid',
                apiKey: 'secret-key',
                token: 'secret-token',
                maxDailyLossUsd: 250,
            },
        });

        expect(event).toMatchObject({
            bot: 'crypto',
            action: 'mode_change',
            decision: 'blocked',
            actor: 'api-secret',
            subject: 'live-mode',
        });
        expect(event.id).toMatch(/^audit_/);
        expect(event.timestamp).toEqual(expect.any(String));
        expect(event.metadata.apiKey).toBe('[REDACTED]');
        expect(event.metadata.token).toBe('[REDACTED]');
        expect(event.metadata.maxDailyLossUsd).toBe(250);
    });
});
