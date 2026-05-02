const crypto = require('crypto');

const SENSITIVE_KEY_RE = /(secret|token|password|credential|api.?key|authorization)/i;

function evaluateLiveModeRequest({ requestedMode, env = process.env, body = {} }) {
    const mode = String(requestedMode || '').toLowerCase();
    const reasons = [];
    const controls = {};

    if (!['paper', 'live'].includes(mode)) {
        return { allowed: false, mode, reasons: ['mode must be paper or live'], controls };
    }

    if (mode === 'paper') {
        return { allowed: true, mode, reasons, controls };
    }

    if (env.ALLOW_LIVE_TRADING !== 'true') {
        reasons.push('ALLOW_LIVE_TRADING must be true');
    }

    const approvalToken = env.LIVE_TRADING_APPROVAL_TOKEN || '';
    if (!approvalToken || body.operatorApproval !== approvalToken) {
        reasons.push('operator approval token is missing or invalid');
    }

    const maxDailyLossUsd = Number(env.MAX_DAILY_LOSS_USD);
    if (!Number.isFinite(maxDailyLossUsd) || maxDailyLossUsd <= 0) {
        reasons.push('MAX_DAILY_LOSS_USD must be a positive number');
    } else {
        controls.maxDailyLossUsd = maxDailyLossUsd;
    }

    return { allowed: reasons.length === 0, mode, reasons, controls };
}

function assertLiveModeAllowed(input) {
    const result = evaluateLiveModeRequest(input);
    if (!result.allowed) {
        const error = new Error(`Live mode blocked: ${result.reasons.join('; ')}`);
        error.code = 'LIVE_MODE_BLOCKED';
        error.reasons = result.reasons;
        error.controls = result.controls;
        throw error;
    }
    return result;
}

function redactMetadata(value) {
    if (Array.isArray(value)) return value.map(redactMetadata);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
        if (SENSITIVE_KEY_RE.test(key)) return [key, '[REDACTED]'];
        return [key, redactMetadata(item)];
    }));
}

function buildAuditEvent({ bot, action, decision, actor = 'system', subject = null, metadata = {} }) {
    return {
        id: `audit_${crypto.randomUUID()}`,
        timestamp: new Date().toISOString(),
        bot,
        action,
        decision,
        actor,
        subject,
        metadata: redactMetadata(metadata),
    };
}

module.exports = {
    evaluateLiveModeRequest,
    assertLiveModeAllowed,
    buildAuditEvent,
    redactMetadata,
};
