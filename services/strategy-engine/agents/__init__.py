"""
NexusTradeAI Agentic Trading System
====================================

Multi-agent pipeline for autonomous trade evaluation with safety guardrails,
real-data learning (Scan AI), adaptive context injection, and supervisor bandit.

Architecture:
    Signal → KillSwitch → SupervisorBandit → MarketAgent → DecisionAgent → SafetyGuardrails → Execute
    Trade Closed → LearningAgent → ScanEngine → OutcomeStore → RewardCalculator → SupervisorBandit
"""

from agents.base import AgentDecision, MarketSnapshot, AgentAuditEntry
from agents.orchestrator import AgentOrchestrator
from agents.safety import KillSwitch, SafetyGuardrails
from agents.supervisor_bandit import SupervisorBandit

__all__ = [
    "AgentOrchestrator",
    "AgentDecision",
    "MarketSnapshot",
    "AgentAuditEntry",
    "KillSwitch",
    "SafetyGuardrails",
    "SupervisorBandit",
]
