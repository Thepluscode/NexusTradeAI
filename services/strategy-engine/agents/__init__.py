"""
NexusTradeAI Agentic Trading System
====================================

Multi-agent pipeline for autonomous trade evaluation with safety guardrails,
real-data learning (Scan AI), and adaptive context injection.

Architecture:
    Signal → KillSwitch → MarketAgent → DecisionAgent → SafetyGuardrails → Execute
    Trade Closed → LearningAgent → ScanEngine → PatternTracker → AdaptiveContext
"""

from agents.base import AgentDecision, MarketSnapshot, AgentAuditEntry
from agents.orchestrator import AgentOrchestrator
from agents.safety import KillSwitch, SafetyGuardrails

__all__ = [
    "AgentOrchestrator",
    "AgentDecision",
    "MarketSnapshot",
    "AgentAuditEntry",
    "KillSwitch",
    "SafetyGuardrails",
]
