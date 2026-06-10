"""Deterministic tests for tender_lib (Rule 2: normal, boundary, malformed,
adversarial). No network — pure logic only. Run:
    python3 -m unittest services/tender-scout/test_tender_lib.py -v
or from this directory: python3 -m unittest test_tender_lib -v
"""

import unittest

from tender_lib import (ALERT_SPREAD_PCT, classify_offer, evaluate_filing,
                        format_report)

PRIORITY_TEXT = (
    "Shareholders owning fewer than 100 shares (odd lots) who tender all "
    "their shares will not be subject to proration. The purchase price of "
    "$22.50 per share will be paid promptly. The offer expires on "
    "July 15, 2026 at 5:00 p.m."
)
BOILERPLATE_TEXT = (
    "Holders of odd lots should consult their broker about fees. "
    "The purchase price of $10.00 per share applies to all tendered shares."
)
DUTCH_TEXT = (
    "Odd lots will be accepted first and given priority before proration. The company invites tenders at prices "
    "not less than $5.00 per share and not greater than $5.75 per share."
)
NAV_TEXT = (
    "Tendered shares accepted with odd lot priority before proration applies. The purchase price will equal 98% "
    "of net asset value per share as of the expiration date."
)

FILING = {"adsh": "0001-26-000001", "cik": "12345",
          "name": "Test Corp (TST) (CIK 0000012345)", "file_date": "2026-06-01"}


class TestClassification(unittest.TestCase):
    def test_priority_clause_detected(self):
        c = classify_offer(PRIORITY_TEXT, FILING["name"])
        self.assertTrue(c["odd_lot_priority"])
        self.assertEqual(c["offer_type"], "fixed")
        self.assertEqual(c["tender_price"], 22.50)
        self.assertEqual(c["ticker"], "TST")
        self.assertEqual(c["expiry_hint"], "July 15, 2026")

    def test_boilerplate_mention_is_not_priority(self):
        c = classify_offer(BOILERPLATE_TEXT, FILING["name"])
        self.assertFalse(c["odd_lot_priority"])

    def test_dutch_auction_uses_conservative_low_end(self):
        c = classify_offer(DUTCH_TEXT, FILING["name"])
        self.assertTrue(c["odd_lot_priority"])
        self.assertEqual(c["offer_type"], "dutch")
        self.assertEqual(c["tender_price"], 5.00)

    def test_nav_based_has_no_fixed_price(self):
        c = classify_offer(NAV_TEXT, FILING["name"])
        self.assertEqual(c["offer_type"], "nav_based")
        self.assertIsNone(c["tender_price"])

    def test_cik_is_never_a_ticker(self):
        # The gate's historical misparse bug: "(CIK 0001234567)" parsed as ticker.
        c = classify_offer(PRIORITY_TEXT, "No Ticker Corp (CIK 0001234567)")
        self.assertIsNone(c["ticker"])

    def test_preferred_class_price_is_flagged_not_priced(self):
        # The NHP artifact (2026-06-10 live run): tender at $22.50 was for
        # Series A Preferred while the display ticker was the common.
        text = ("Odd lots will not be subject to proration. Our 7.375% "
                "Series A Cumulative Redeemable Perpetual Preferred Stock, "
                "for a purchase price of $22.50 per share in cash.")
        c = classify_offer(text, FILING["name"])
        self.assertTrue(c["class_warning"])
        o = evaluate_filing(FILING, c, price=13.98)
        self.assertFalse(o["actionable"])
        self.assertIsNone(o["spread_pct"])
        self.assertIn("verify class", o["offer_type"])

    def test_common_stock_offer_has_no_class_warning(self):
        c = classify_offer(PRIORITY_TEXT, FILING["name"])
        self.assertFalse(c.get("class_warning"))

    def test_empty_and_garbage_text_never_throws(self):
        for text in ("", "   ", "<html></html>", "x" * 10000):
            c = classify_offer(text, FILING["name"])
            self.assertFalse(c["odd_lot_priority"])


class TestEvaluation(unittest.TestCase):
    CLS = {"odd_lot_priority": True, "offer_type": "fixed",
           "tender_price": 22.50, "ticker": "TST", "expiry_hint": None}

    def test_actionable_above_bar(self):
        o = evaluate_filing(FILING, self.CLS, price=20.00)   # +12.5%
        self.assertTrue(o["actionable"])
        self.assertEqual(o["spread_pct"], 12.5)
        self.assertEqual(o["profit_99sh"], round(99 * 2.50, 2))

    def test_exactly_at_bar_is_actionable(self):
        price = 22.50 / (1 + ALERT_SPREAD_PCT / 100)
        o = evaluate_filing(FILING, self.CLS, price=price)
        self.assertTrue(o["actionable"])  # >= bar, inclusive

    def test_below_bar_is_watchlist(self):
        o = evaluate_filing(FILING, self.CLS, price=22.30)   # +0.9%
        self.assertFalse(o["actionable"])
        self.assertIsNotNone(o["spread_pct"])

    def test_negative_spread_not_actionable(self):
        o = evaluate_filing(FILING, self.CLS, price=25.00)
        self.assertFalse(o["actionable"])
        self.assertLess(o["spread_pct"], 0)

    def test_missing_price_or_tender_is_unpriced_not_crash(self):
        o = evaluate_filing(FILING, self.CLS, price=None)
        self.assertIsNone(o["spread_pct"])
        self.assertFalse(o["actionable"])
        nav = {**self.CLS, "tender_price": None, "offer_type": "nav_based"}
        o2 = evaluate_filing(FILING, nav, price=20.0)
        self.assertIsNone(o2["spread_pct"])

    def test_zero_price_adversarial(self):
        o = evaluate_filing(FILING, self.CLS, price=0)
        self.assertIsNone(o["spread_pct"])


class TestReport(unittest.TestCase):
    def test_report_renders_all_sections_and_honest_expectations(self):
        actionable = evaluate_filing(FILING, TestEvaluation.CLS, price=20.0)
        watch = evaluate_filing(FILING, TestEvaluation.CLS, price=22.40)
        unpriced = evaluate_filing(
            FILING, {**TestEvaluation.CLS, "tender_price": None,
                     "offer_type": "nav_based"}, price=None)
        r = format_report([actionable, watch, unpriced], days=45)
        self.assertIn("ACTIONABLE NOW (1)", r)
        self.assertIn("WATCHLIST (1)", r)
        self.assertIn("UNPRICED (1)", r)
        self.assertIn("$200–1,400/yr", r)   # honest-expectations line always present

    def test_empty_report_is_friendly(self):
        r = format_report([], days=45)
        self.assertIn("Nothing active right now", r)


if __name__ == "__main__":
    unittest.main()
