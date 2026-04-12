'use strict';

/**
 * Stub strategy for smoke testing the registry pattern.
 * Always returns killedBy — never produces a candidate.
 * Leading underscore in filename prevents accidental use as a real strategy.
 */
module.exports = {
    name: '_stub',
    assetClass: 'stock',
    regimes: ['any'],
    evaluate(bars, context) {
        return { killedBy: 'stub_never_produces_candidates' };
    },
};
