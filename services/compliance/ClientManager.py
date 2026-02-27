"""
NexusTradeAI - Client Reporting & Onboarding
==============================================

Commercial deployment infrastructure:
- Client portfolio tracking
- Performance reporting
- Investor onboarding

Senior Engineering Rigor Applied:
- Professional reporting
- Multi-client support
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging
import json

logger = logging.getLogger(__name__)


class ClientTier(Enum):
    """Client tier levels"""
    BASIC = "basic"
    PROFESSIONAL = "professional"
    INSTITUTIONAL = "institutional"


@dataclass
class ClientAccount:
    """Client account information"""
    client_id: str
    name: str
    email: str
    tier: ClientTier
    initial_investment: float
    current_value: float
    inception_date: datetime
    fee_rate_pct: float = 2.0  # Management fee
    performance_fee_pct: float = 20.0  # Carry
    high_water_mark: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'client_id': self.client_id,
            'name': self.name,
            'tier': self.tier.value,
            'initial_investment': self.initial_investment,
            'current_value': round(self.current_value, 2),
            'total_return_pct': round((self.current_value / self.initial_investment - 1) * 100, 2),
            'inception_date': self.inception_date.strftime('%Y-%m-%d'),
            'fee_rate_pct': self.fee_rate_pct
        }


@dataclass
class ClientReport:
    """Monthly/quarterly client report"""
    client: ClientAccount
    period_start: datetime
    period_end: datetime
    starting_value: float
    ending_value: float
    deposits: float
    withdrawals: float
    gross_return: float
    fees_charged: float
    net_return: float
    benchmark_return: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'client_id': self.client.client_id,
            'period': f"{self.period_start.strftime('%Y-%m-%d')} to {self.period_end.strftime('%Y-%m-%d')}",
            'starting_value': round(self.starting_value, 2),
            'ending_value': round(self.ending_value, 2),
            'deposits': round(self.deposits, 2),
            'withdrawals': round(self.withdrawals, 2),
            'gross_return_pct': round(self.gross_return * 100, 2),
            'fees': round(self.fees_charged, 2),
            'net_return_pct': round(self.net_return * 100, 2),
            'benchmark_return_pct': round(self.benchmark_return * 100, 2),
            'alpha_pct': round((self.net_return - self.benchmark_return) * 100, 2)
        }


class ClientManager:
    """
    Client relationship management.
    
    Handles onboarding, tracking, reporting.
    """
    
    def __init__(self):
        self.clients: Dict[str, ClientAccount] = {}
        self.reports: Dict[str, List[ClientReport]] = {}
        self.transactions: Dict[str, List[Dict]] = {}
    
    def onboard_client(
        self,
        client_id: str,
        name: str,
        email: str,
        initial_investment: float,
        tier: ClientTier = ClientTier.BASIC,
        fee_rate: float = 2.0,
        perf_fee: float = 20.0
    ) -> ClientAccount:
        """Onboard a new client"""
        client = ClientAccount(
            client_id=client_id,
            name=name,
            email=email,
            tier=tier,
            initial_investment=initial_investment,
            current_value=initial_investment,
            inception_date=datetime.now(),
            fee_rate_pct=fee_rate,
            performance_fee_pct=perf_fee,
            high_water_mark=initial_investment
        )
        
        self.clients[client_id] = client
        self.reports[client_id] = []
        self.transactions[client_id] = []
        
        self._log_transaction(client_id, 'deposit', initial_investment, 'Initial investment')
        
        logger.info(f"Client onboarded: {name} ({client_id}) - ${initial_investment:,.0f}")
        
        return client
    
    def _log_transaction(
        self,
        client_id: str,
        tx_type: str,
        amount: float,
        note: str = ""
    ):
        """Log a client transaction"""
        self.transactions[client_id].append({
            'timestamp': datetime.now().isoformat(),
            'type': tx_type,
            'amount': amount,
            'note': note
        })
    
    def update_client_value(self, client_id: str, new_value: float):
        """Update client portfolio value"""
        if client_id not in self.clients:
            return
        
        client = self.clients[client_id]
        client.current_value = new_value
        
        if new_value > client.high_water_mark:
            client.high_water_mark = new_value
    
    def process_deposit(self, client_id: str, amount: float):
        """Process client deposit"""
        if client_id not in self.clients:
            return
        
        self.clients[client_id].current_value += amount
        self._log_transaction(client_id, 'deposit', amount)
    
    def process_withdrawal(self, client_id: str, amount: float) -> bool:
        """Process client withdrawal"""
        if client_id not in self.clients:
            return False
        
        client = self.clients[client_id]
        if amount > client.current_value:
            return False
        
        client.current_value -= amount
        self._log_transaction(client_id, 'withdrawal', amount)
        return True
    
    def generate_period_report(
        self,
        client_id: str,
        period_start: datetime,
        period_end: datetime,
        benchmark_return: float = 0.0
    ) -> Optional[ClientReport]:
        """Generate performance report for period"""
        if client_id not in self.clients:
            return None
        
        client = self.clients[client_id]
        
        # Get transactions in period
        period_txs = [
            t for t in self.transactions[client_id]
            if period_start <= datetime.fromisoformat(t['timestamp']) <= period_end
        ]
        
        deposits = sum(t['amount'] for t in period_txs if t['type'] == 'deposit')
        withdrawals = sum(t['amount'] for t in period_txs if t['type'] == 'withdrawal')
        
        # Calculate returns (simplified)
        starting = client.initial_investment  # Simplified
        ending = client.current_value
        
        gross_return = (ending / starting) - 1 if starting > 0 else 0
        
        # Calculate fees
        mgmt_fee = starting * (client.fee_rate_pct / 100) * ((period_end - period_start).days / 365)
        
        # Performance fee on gains above HWM
        gains_above_hwm = max(0, ending - client.high_water_mark)
        perf_fee = gains_above_hwm * (client.performance_fee_pct / 100)
        
        total_fees = mgmt_fee + perf_fee
        net_return = gross_return - (total_fees / starting)
        
        report = ClientReport(
            client=client,
            period_start=period_start,
            period_end=period_end,
            starting_value=starting,
            ending_value=ending,
            deposits=deposits,
            withdrawals=withdrawals,
            gross_return=gross_return,
            fees_charged=total_fees,
            net_return=net_return,
            benchmark_return=benchmark_return
        )
        
        self.reports[client_id].append(report)
        
        return report
    
    def get_aum_summary(self) -> Dict[str, Any]:
        """Get total assets under management"""
        total_aum = sum(c.current_value for c in self.clients.values())
        
        by_tier = {}
        for tier in ClientTier:
            tier_clients = [c for c in self.clients.values() if c.tier == tier]
            by_tier[tier.value] = {
                'clients': len(tier_clients),
                'aum': sum(c.current_value for c in tier_clients)
            }
        
        return {
            'total_aum': round(total_aum, 2),
            'total_clients': len(self.clients),
            'by_tier': by_tier,
            'as_of': datetime.now().isoformat()
        }
    
    def export_reports(self, filepath: str):
        """Export all reports to JSON"""
        data = {
            'aum_summary': self.get_aum_summary(),
            'clients': [c.to_dict() for c in self.clients.values()],
            'reports': {
                cid: [r.to_dict() for r in reports]
                for cid, reports in self.reports.items()
            }
        }
        
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)


# Factory function
def create_client_manager() -> ClientManager:
    return ClientManager()
