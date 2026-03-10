"""
Safety layer for the agentic trading system.

KillSwitch: 3-layer circuit breaker (file, programmatic, auto-trigger)
SafetyGuardrails: Hardcoded limits that override ALL agent output.

These are NON-NEGOTIABLE — no LLM output can bypass them.
"""

import os
import json
import time
import logging
from datetime import datetime
from typing import Optional, Dict

from agents.base import AgentDecision, MarketSnapshot

logger = logging.getLogger(__name__)

STATE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "memory")


class KillSwitch:
    """
    3-layer kill switch for the agent system.

    Layer 1: File-based — create memory/agent_killswitch.json with {"killed": true}
    Layer 2: Programmatic — call kill() / resume()
    Layer 3: Auto-trigger — activates on excessive losses or error rate
    """

    def __init__(self):
        self._programmatic_kill = False
        self._kill_reason = ""
        self._auto_kill_threshold = 0.15  # 15% daily drawdown
        self._error_threshold = 10  # consecutive errors
        self._consecutive_errors = 0
        self._daily_pnl = 0.0
        self._daily_equity_start = 0.0
        self._state_file = os.path.join(STATE_DIR, "agent_killswitch.json")

    def is_killed(self) -> bool:
        """Check all 3 layers."""
        # Layer 1: file-based
        if self._check_file_kill():
            return True
        # Layer 2: programmatic
        if self._programmatic_kill:
            return True
        # Layer 3: auto-trigger (checked on update)
        return False

    def kill(self, reason: str = "Manual kill"):
        """Programmatically kill the agent system."""
        self._programmatic_kill = True
        self._kill_reason = reason
        self._save_state(True, reason)
        logger.warning(f"[KILL SWITCH] ACTIVATED: {reason}")

    def resume(self):
        """Resume agent system after kill."""
        self._programmatic_kill = False
        self._kill_reason = ""
        self._consecutive_errors = 0
        self._save_state(False, "")
        logger.info("[KILL SWITCH] Resumed")

    def record_error(self):
        """Record an agent error. Auto-kills after threshold."""
        self._consecutive_errors += 1
        if self._consecutive_errors >= self._error_threshold:
            self.kill(f"Auto-kill: {self._consecutive_errors} consecutive errors")

    def record_success(self):
        """Reset error counter on success."""
        self._consecutive_errors = 0

    def update_pnl(self, daily_pnl_pct: float):
        """Check drawdown auto-trigger."""
        if daily_pnl_pct < -self._auto_kill_threshold:
            self.kill(f"Auto-kill: daily drawdown {daily_pnl_pct:.1%} exceeds {self._auto_kill_threshold:.0%} limit")

    def get_status(self) -> Dict:
        return {
            "killed": self.is_killed(),
            "reason": self._kill_reason,
            "consecutive_errors": self._consecutive_errors,
            "auto_kill_threshold": self._auto_kill_threshold,
        }

    def _check_file_kill(self) -> bool:
        try:
            if os.path.exists(self._state_file):
                with open(self._state_file, 'r') as f:
                    data = json.load(f)
                    if data.get("killed", False):
                        self._kill_reason = data.get("reason", "File-based kill")
                        return True
        except Exception:
            pass
        return False

    def _save_state(self, killed: bool, reason: str):
        try:
            os.makedirs(os.path.dirname(self._state_file), exist_ok=True)
            with open(self._state_file, 'w') as f:
                json.dump({
                    "killed": killed,
                    "reason": reason,
                    "timestamp": datetime.now().isoformat()
                }, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save kill switch state: {e}")


class SafetyGuardrails:
    """
    Hardcoded safety limits that override ALL agent decisions.

    These cannot be changed by the LLM. They are the last line of defense.
    """

    # Position sizing: agent can suggest multiplier between these bounds
    MIN_SIZE_MULTIPLIER = 0.25
    MAX_SIZE_MULTIPLIER = 1.5

    # Conviction: below this threshold, auto-reject regardless of reasoning
    MIN_CONVICTION_THRESHOLD = 0.3

    # Maximum risk flags before auto-reject
    MAX_RISK_FLAGS = 5

    # Stops can only tighten, never widen — enforced by checking vs original
    ALLOW_STOP_WIDENING = False

    @staticmethod
    def validate_decision(decision: AgentDecision, snapshot: MarketSnapshot) -> AgentDecision:
        """
        Apply hardcoded guardrails to an agent decision.
        Returns the sanitized decision. May override approval.
        """
        # Clamp position size multiplier
        decision.position_size_multiplier = max(
            SafetyGuardrails.MIN_SIZE_MULTIPLIER,
            min(SafetyGuardrails.MAX_SIZE_MULTIPLIER, decision.position_size_multiplier)
        )

        # Auto-reject below conviction threshold
        if decision.approved and decision.confidence < SafetyGuardrails.MIN_CONVICTION_THRESHOLD:
            decision.approved = False
            decision.reason = f"Below minimum conviction ({decision.confidence:.2f} < {SafetyGuardrails.MIN_CONVICTION_THRESHOLD})"
            decision.risk_flags.append("low_conviction")

        # Auto-reject if too many risk flags
        if decision.approved and len(decision.risk_flags) > SafetyGuardrails.MAX_RISK_FLAGS:
            decision.approved = False
            decision.reason = f"Too many risk flags ({len(decision.risk_flags)})"

        # Stops can only tighten
        if decision.adjusted_stop is not None and snapshot.stop_loss is not None:
            if snapshot.direction == "long":
                # For longs, stop must be >= original (tighter = higher)
                if decision.adjusted_stop < snapshot.stop_loss:
                    decision.adjusted_stop = snapshot.stop_loss
            else:
                # For shorts, stop must be <= original (tighter = lower)
                if decision.adjusted_stop > snapshot.stop_loss:
                    decision.adjusted_stop = snapshot.stop_loss

        return decision

    @staticmethod
    def validate_snapshot(snapshot: MarketSnapshot) -> bool:
        """Basic sanity checks on input data."""
        if snapshot.price <= 0:
            return False
        if snapshot.direction not in ("long", "short"):
            return False
        if snapshot.confidence is not None and not (0 <= (snapshot.score or 0) <= 1000):
            pass  # scores can be large
        return True
