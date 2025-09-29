"""
NexusTradeAI - AML/KYC Compliance Service
========================================

Handles Anti-Money Laundering and Know Your Customer compliance
requirements including customer due diligence, transaction monitoring,
and suspicious activity reporting.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import json
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum
import uuid
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class RiskLevel(Enum):
    """Customer risk levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    PROHIBITED = "prohibited"

class CustomerType(Enum):
    """Customer types for KYC"""
    INDIVIDUAL = "individual"
    CORPORATE = "corporate"
    PEP = "politically_exposed_person"
    HIGH_NET_WORTH = "high_net_worth"

@dataclass
class CustomerProfile:
    """Customer profile for KYC/AML"""
    customer_id: str
    customer_type: CustomerType
    risk_level: RiskLevel
    kyc_status: str = "pending"  # pending, approved, rejected, expired
    kyc_completion_date: Optional[datetime] = None
    last_review_date: Optional[datetime] = None
    next_review_date: Optional[datetime] = None
    pep_status: bool = False
    sanctions_checked: bool = False
    enhanced_due_diligence: bool = False
    source_of_funds_verified: bool = False
    documents_verified: List[str] = field(default_factory=list)
    risk_factors: List[str] = field(default_factory=list)
    monitoring_alerts: List[Dict] = field(default_factory=list)

@dataclass
class TransactionAlert:
    """Transaction monitoring alert"""
    alert_id: str
    customer_id: str
    transaction_id: str
    alert_type: str
    risk_score: float
    amount: float
    currency: str
    timestamp: datetime
    status: str = "open"  # open, investigating, closed, escalated
    investigation_notes: List[str] = field(default_factory=list)
    false_positive: bool = False

class AMLKYCService:
    """AML/KYC Compliance Service"""
    
    def __init__(self):
        self.customer_profiles: Dict[str, CustomerProfile] = {}
        self.transaction_alerts: Dict[str, TransactionAlert] = {}
        self.sanctions_list: List[str] = []
        self.high_risk_countries: List[str] = []
        self.monitoring_rules: Dict[str, Dict] = {}
        
        # Initialize compliance data
        self._initialize_compliance_data()
    
    def _initialize_compliance_data(self):
        """Initialize compliance reference data"""
        # High-risk countries (FATF list)
        self.high_risk_countries = [
            'AF', 'IR', 'KP', 'MM', 'PK', 'UG', 'YE'  # Sample high-risk ISO codes
        ]
        
        # Sample sanctions list (in production, integrate with OFAC/EU sanctions)
        self.sanctions_list = [
            'sanctioned_entity_1', 'sanctioned_entity_2'
        ]
        
        # Transaction monitoring rules
        self.monitoring_rules = {
            'large_transaction': {
                'threshold': 10000,
                'currency': 'USD',
                'risk_score': 0.7,
                'description': 'Large transaction threshold'
            },
            'velocity_check': {
                'max_transactions_per_day': 50,
                'max_amount_per_day': 50000,
                'risk_score': 0.8,
                'description': 'High velocity trading'
            },
            'unusual_pattern': {
                'deviation_threshold': 3.0,  # Standard deviations
                'risk_score': 0.6,
                'description': 'Unusual trading pattern'
            },
            'geographic_risk': {
                'high_risk_multiplier': 2.0,
                'risk_score': 0.5,
                'description': 'Geographic risk factor'
            }
        }
    
    def onboard_customer(self, customer_id: str, customer_data: Dict) -> Dict:
        """Onboard new customer with KYC checks"""
        try:
            # Extract customer information
            customer_type = CustomerType(customer_data.get('customer_type', 'individual'))
            country_code = customer_data.get('country_code', '').upper()
            name = customer_data.get('name', '').lower()
            
            # Initial risk assessment
            risk_level = self._assess_initial_risk(customer_type, country_code, name)
            
            # Check if customer is prohibited
            if risk_level == RiskLevel.PROHIBITED:
                return {
                    'success': False,
                    'error': 'Customer onboarding prohibited due to high risk factors',
                    'risk_level': risk_level.value
                }
            
            # Create customer profile
            profile = CustomerProfile(
                customer_id=customer_id,
                customer_type=customer_type,
                risk_level=risk_level,
                pep_status=customer_data.get('pep_status', False),
                enhanced_due_diligence=risk_level in [RiskLevel.HIGH]
            )
            
            # Perform sanctions screening
            sanctions_result = self._screen_sanctions(name, customer_data.get('aliases', []))
            profile.sanctions_checked = True
            
            if sanctions_result['match_found']:
                profile.risk_level = RiskLevel.PROHIBITED
                profile.risk_factors.append('Sanctions list match')
                
                return {
                    'success': False,
                    'error': 'Customer matches sanctions list',
                    'sanctions_details': sanctions_result
                }
            
            # Set review dates based on risk level
            profile.next_review_date = self._calculate_next_review_date(risk_level)
            
            self.customer_profiles[customer_id] = profile
            
            logger.info(f"Customer onboarded: {customer_id} with risk level: {risk_level.value}")
            
            return {
                'success': True,
                'message': 'Customer onboarded successfully',
                'data': {
                    'customer_id': customer_id,
                    'risk_level': risk_level.value,
                    'kyc_status': profile.kyc_status,
                    'enhanced_due_diligence_required': profile.enhanced_due_diligence,
                    'next_review_date': profile.next_review_date.isoformat() if profile.next_review_date else None
                }
            }
            
        except Exception as e:
            logger.error(f"Error onboarding customer: {e}")
            return {'success': False, 'error': str(e)}
    
    def _assess_initial_risk(self, customer_type: CustomerType, 
                           country_code: str, name: str) -> RiskLevel:
        """Assess initial customer risk level"""
        risk_score = 0.0
        
        # Customer type risk
        if customer_type == CustomerType.PEP:
            risk_score += 0.8
        elif customer_type == CustomerType.HIGH_NET_WORTH:
            risk_score += 0.4
        elif customer_type == CustomerType.CORPORATE:
            risk_score += 0.3
        
        # Geographic risk
        if country_code in self.high_risk_countries:
            risk_score += 0.7
        
        # Name screening (basic check)
        if any(term in name for term in ['sanctioned', 'blocked']):
            return RiskLevel.PROHIBITED
        
        # Determine risk level
        if risk_score >= 0.8:
            return RiskLevel.HIGH
        elif risk_score >= 0.5:
            return RiskLevel.MEDIUM
        else:
            return RiskLevel.LOW
    
    def _screen_sanctions(self, name: str, aliases: List[str] = None) -> Dict:
        """Screen customer against sanctions lists"""
        if aliases is None:
            aliases = []
        
        all_names = [name.lower()] + [alias.lower() for alias in aliases]
        
        matches = []
        for check_name in all_names:
            for sanctioned_entity in self.sanctions_list:
                if sanctioned_entity.lower() in check_name:
                    matches.append({
                        'name': check_name,
                        'sanctioned_entity': sanctioned_entity,
                        'match_type': 'partial'
                    })
        
        return {
            'match_found': len(matches) > 0,
            'matches': matches,
            'screening_date': datetime.now().isoformat()
        }
    
    def _calculate_next_review_date(self, risk_level: RiskLevel) -> datetime:
        """Calculate next KYC review date based on risk level"""
        if risk_level == RiskLevel.HIGH:
            return datetime.now() + timedelta(days=365)  # Annual review
        elif risk_level == RiskLevel.MEDIUM:
            return datetime.now() + timedelta(days=730)  # Biennial review
        else:
            return datetime.now() + timedelta(days=1095)  # Triennial review
    
    def monitor_transaction(self, transaction_data: Dict) -> Dict:
        """Monitor transaction for suspicious activity"""
        try:
            customer_id = transaction_data['customer_id']
            transaction_id = transaction_data['transaction_id']
            amount = float(transaction_data['amount'])
            currency = transaction_data.get('currency', 'USD')
            
            if customer_id not in self.customer_profiles:
                return {'success': False, 'error': 'Customer not found'}
            
            profile = self.customer_profiles[customer_id]
            alerts = []
            
            # Apply monitoring rules
            for rule_name, rule_config in self.monitoring_rules.items():
                alert = self._apply_monitoring_rule(
                    rule_name, rule_config, transaction_data, profile
                )
                if alert:
                    alerts.append(alert)
            
            # Store alerts
            for alert in alerts:
                self.transaction_alerts[alert.alert_id] = alert
                profile.monitoring_alerts.append({
                    'alert_id': alert.alert_id,
                    'timestamp': alert.timestamp.isoformat(),
                    'alert_type': alert.alert_type,
                    'risk_score': alert.risk_score
                })
            
            logger.info(f"Transaction monitored: {transaction_id}, alerts: {len(alerts)}")
            
            return {
                'success': True,
                'data': {
                    'transaction_id': transaction_id,
                    'alerts_generated': len(alerts),
                    'alerts': [
                        {
                            'alert_id': alert.alert_id,
                            'alert_type': alert.alert_type,
                            'risk_score': alert.risk_score
                        }
                        for alert in alerts
                    ]
                }
            }
            
        except Exception as e:
            logger.error(f"Error monitoring transaction: {e}")
            return {'success': False, 'error': str(e)}
    
    def _apply_monitoring_rule(self, rule_name: str, rule_config: Dict,
                             transaction_data: Dict, profile: CustomerProfile) -> Optional[TransactionAlert]:
        """Apply specific monitoring rule"""
        amount = float(transaction_data['amount'])
        
        if rule_name == 'large_transaction':
            if amount >= rule_config['threshold']:
                return TransactionAlert(
                    alert_id=str(uuid.uuid4()),
                    customer_id=profile.customer_id,
                    transaction_id=transaction_data['transaction_id'],
                    alert_type='large_transaction',
                    risk_score=rule_config['risk_score'],
                    amount=amount,
                    currency=transaction_data.get('currency', 'USD'),
                    timestamp=datetime.now()
                )
        
        elif rule_name == 'geographic_risk':
            country_code = transaction_data.get('country_code', '').upper()
            if country_code in self.high_risk_countries:
                risk_score = rule_config['risk_score'] * rule_config['high_risk_multiplier']
                return TransactionAlert(
                    alert_id=str(uuid.uuid4()),
                    customer_id=profile.customer_id,
                    transaction_id=transaction_data['transaction_id'],
                    alert_type='geographic_risk',
                    risk_score=min(risk_score, 1.0),
                    amount=amount,
                    currency=transaction_data.get('currency', 'USD'),
                    timestamp=datetime.now()
                )
        
        return None
    
    def get_compliance_dashboard(self) -> Dict:
        """Get AML/KYC compliance dashboard data"""
        try:
            total_customers = len(self.customer_profiles)
            
            # Risk level distribution
            risk_distribution = {level.value: 0 for level in RiskLevel}
            for profile in self.customer_profiles.values():
                risk_distribution[profile.risk_level.value] += 1
            
            # KYC status distribution
            kyc_status_distribution = {}
            for profile in self.customer_profiles.values():
                status = profile.kyc_status
                kyc_status_distribution[status] = kyc_status_distribution.get(status, 0) + 1
            
            # Alert statistics
            total_alerts = len(self.transaction_alerts)
            open_alerts = len([a for a in self.transaction_alerts.values() if a.status == 'open'])
            high_risk_alerts = len([a for a in self.transaction_alerts.values() if a.risk_score >= 0.7])
            
            # Customers requiring review
            customers_due_review = len([
                p for p in self.customer_profiles.values()
                if p.next_review_date and p.next_review_date <= datetime.now()
            ])
            
            return {
                'success': True,
                'data': {
                    'customer_statistics': {
                        'total_customers': total_customers,
                        'risk_distribution': risk_distribution,
                        'kyc_status_distribution': kyc_status_distribution,
                        'customers_due_review': customers_due_review
                    },
                    'alert_statistics': {
                        'total_alerts': total_alerts,
                        'open_alerts': open_alerts,
                        'high_risk_alerts': high_risk_alerts,
                        'alert_rate': (total_alerts / max(total_customers, 1)) * 100
                    },
                    'compliance_metrics': {
                        'sanctions_screening_coverage': 100.0,  # All customers screened
                        'kyc_completion_rate': (
                            kyc_status_distribution.get('approved', 0) / max(total_customers, 1)
                        ) * 100,
                        'high_risk_customer_percentage': (
                            risk_distribution.get('high', 0) / max(total_customers, 1)
                        ) * 100
                    }
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting compliance dashboard: {e}")
            return {'success': False, 'error': str(e)}

# Global AML/KYC service instance
aml_kyc_service = AMLKYCService()

# API Routes
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'aml-kyc-compliance',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/aml/onboard', methods=['POST'])
def onboard_customer():
    """Onboard new customer with KYC checks"""
    data = request.get_json()
    
    customer_id = data.get('customer_id')
    customer_data = data.get('customer_data', {})
    
    if not customer_id:
        return jsonify({'success': False, 'error': 'customer_id is required'}), 400
    
    result = aml_kyc_service.onboard_customer(customer_id, customer_data)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 400

@app.route('/api/aml/monitor', methods=['POST'])
def monitor_transaction():
    """Monitor transaction for suspicious activity"""
    data = request.get_json()
    
    required_fields = ['customer_id', 'transaction_id', 'amount']
    for field in required_fields:
        if field not in data:
            return jsonify({'success': False, 'error': f'{field} is required'}), 400
    
    result = aml_kyc_service.monitor_transaction(data)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 500

@app.route('/api/aml/dashboard', methods=['GET'])
def get_compliance_dashboard():
    """Get AML/KYC compliance dashboard"""
    result = aml_kyc_service.get_compliance_dashboard()
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 500

@app.route('/api/aml/customer/<customer_id>', methods=['GET'])
def get_customer_profile(customer_id):
    """Get customer AML/KYC profile"""
    if customer_id not in aml_kyc_service.customer_profiles:
        return jsonify({'success': False, 'error': 'Customer not found'}), 404
    
    profile = aml_kyc_service.customer_profiles[customer_id]
    
    return jsonify({
        'success': True,
        'data': {
            'customer_id': profile.customer_id,
            'customer_type': profile.customer_type.value,
            'risk_level': profile.risk_level.value,
            'kyc_status': profile.kyc_status,
            'pep_status': profile.pep_status,
            'enhanced_due_diligence': profile.enhanced_due_diligence,
            'next_review_date': profile.next_review_date.isoformat() if profile.next_review_date else None,
            'total_alerts': len(profile.monitoring_alerts)
        }
    })

if __name__ == '__main__':
    logger.info("Starting NexusTradeAI AML/KYC Compliance Service...")
    app.run(host='0.0.0.0', port=3007, debug=True)
