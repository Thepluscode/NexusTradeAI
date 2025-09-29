"""
NexusTradeAI - GDPR Compliance Service
=====================================

Handles GDPR compliance requirements including data subject rights,
consent management, and privacy controls.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import json
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

@dataclass
class DataSubject:
    """Data subject representation for GDPR compliance"""
    user_id: str
    email: str
    consent_status: Dict[str, bool] = field(default_factory=dict)
    data_processing_purposes: List[str] = field(default_factory=list)
    consent_timestamp: datetime = field(default_factory=datetime.now)
    last_updated: datetime = field(default_factory=datetime.now)
    data_retention_period: int = 2555  # 7 years in days (regulatory requirement)
    
@dataclass
class DataProcessingActivity:
    """Data processing activity record"""
    activity_id: str
    purpose: str
    legal_basis: str
    data_categories: List[str]
    retention_period: int
    third_party_sharing: bool = False
    international_transfers: bool = False

class GDPRComplianceService:
    """GDPR Compliance Service"""
    
    def __init__(self):
        self.data_subjects: Dict[str, DataSubject] = {}
        self.processing_activities: Dict[str, DataProcessingActivity] = {}
        self.consent_records: List[Dict] = []
        self.data_requests: List[Dict] = []
        
        # Initialize standard processing activities
        self._initialize_processing_activities()
    
    def _initialize_processing_activities(self):
        """Initialize standard data processing activities"""
        activities = [
            DataProcessingActivity(
                activity_id="trading_services",
                purpose="Provide automated trading services",
                legal_basis="Contract performance",
                data_categories=["Identity", "Financial", "Trading behavior"],
                retention_period=2555,  # 7 years
                third_party_sharing=True,
                international_transfers=False
            ),
            DataProcessingActivity(
                activity_id="risk_management",
                purpose="Risk assessment and portfolio management",
                legal_basis="Legitimate interest",
                data_categories=["Financial", "Trading behavior", "Risk profile"],
                retention_period=2555,
                third_party_sharing=False,
                international_transfers=False
            ),
            DataProcessingActivity(
                activity_id="aml_compliance",
                purpose="Anti-money laundering compliance",
                legal_basis="Legal obligation",
                data_categories=["Identity", "Financial", "Transaction history"],
                retention_period=1825,  # 5 years (AML requirement)
                third_party_sharing=True,
                international_transfers=False
            ),
            DataProcessingActivity(
                activity_id="marketing",
                purpose="Direct marketing communications",
                legal_basis="Consent",
                data_categories=["Identity", "Contact details", "Preferences"],
                retention_period=1095,  # 3 years
                third_party_sharing=False,
                international_transfers=False
            )
        ]
        
        for activity in activities:
            self.processing_activities[activity.activity_id] = activity
    
    def register_data_subject(self, user_id: str, email: str, 
                            consent_purposes: List[str] = None) -> Dict:
        """Register a new data subject with consent"""
        try:
            if consent_purposes is None:
                consent_purposes = ["trading_services", "risk_management", "aml_compliance"]
            
            # Create consent status
            consent_status = {}
            for purpose in consent_purposes:
                consent_status[purpose] = True
            
            # Create data subject record
            data_subject = DataSubject(
                user_id=user_id,
                email=email,
                consent_status=consent_status,
                data_processing_purposes=consent_purposes
            )
            
            self.data_subjects[user_id] = data_subject
            
            # Record consent
            consent_record = {
                'user_id': user_id,
                'timestamp': datetime.now().isoformat(),
                'consent_given': consent_status,
                'ip_address': request.remote_addr if request else 'system',
                'user_agent': request.headers.get('User-Agent') if request else 'system'
            }
            self.consent_records.append(consent_record)
            
            logger.info(f"Data subject registered: {user_id}")
            
            return {
                'success': True,
                'message': 'Data subject registered successfully',
                'data': {
                    'user_id': user_id,
                    'consent_status': consent_status,
                    'processing_purposes': consent_purposes
                }
            }
            
        except Exception as e:
            logger.error(f"Error registering data subject: {e}")
            return {'success': False, 'error': str(e)}
    
    def update_consent(self, user_id: str, consent_updates: Dict[str, bool]) -> Dict:
        """Update consent preferences for a data subject"""
        try:
            if user_id not in self.data_subjects:
                return {'success': False, 'error': 'Data subject not found'}
            
            data_subject = self.data_subjects[user_id]
            
            # Update consent status
            for purpose, consent in consent_updates.items():
                if purpose in self.processing_activities:
                    data_subject.consent_status[purpose] = consent
                    
                    # Add/remove from processing purposes
                    if consent and purpose not in data_subject.data_processing_purposes:
                        data_subject.data_processing_purposes.append(purpose)
                    elif not consent and purpose in data_subject.data_processing_purposes:
                        data_subject.data_processing_purposes.remove(purpose)
            
            data_subject.last_updated = datetime.now()
            
            # Record consent change
            consent_record = {
                'user_id': user_id,
                'timestamp': datetime.now().isoformat(),
                'consent_changes': consent_updates,
                'ip_address': request.remote_addr if request else 'system',
                'user_agent': request.headers.get('User-Agent') if request else 'system'
            }
            self.consent_records.append(consent_record)
            
            logger.info(f"Consent updated for user: {user_id}")
            
            return {
                'success': True,
                'message': 'Consent updated successfully',
                'data': {
                    'user_id': user_id,
                    'updated_consent': data_subject.consent_status
                }
            }
            
        except Exception as e:
            logger.error(f"Error updating consent: {e}")
            return {'success': False, 'error': str(e)}
    
    def handle_data_request(self, user_id: str, request_type: str, 
                          additional_info: Dict = None) -> Dict:
        """Handle GDPR data subject requests"""
        try:
            if user_id not in self.data_subjects:
                return {'success': False, 'error': 'Data subject not found'}
            
            request_id = str(uuid.uuid4())
            data_subject = self.data_subjects[user_id]
            
            # Create request record
            data_request = {
                'request_id': request_id,
                'user_id': user_id,
                'request_type': request_type,
                'timestamp': datetime.now().isoformat(),
                'status': 'pending',
                'additional_info': additional_info or {},
                'response_due': (datetime.now() + timedelta(days=30)).isoformat()
            }
            
            self.data_requests.append(data_request)
            
            # Handle different request types
            response_data = {}
            
            if request_type == 'access':
                # Right to access - provide all personal data
                response_data = {
                    'personal_data': {
                        'user_id': data_subject.user_id,
                        'email': data_subject.email,
                        'consent_status': data_subject.consent_status,
                        'processing_purposes': data_subject.data_processing_purposes,
                        'registration_date': data_subject.consent_timestamp.isoformat(),
                        'last_updated': data_subject.last_updated.isoformat()
                    },
                    'processing_activities': [
                        {
                            'purpose': activity.purpose,
                            'legal_basis': activity.legal_basis,
                            'data_categories': activity.data_categories,
                            'retention_period_days': activity.retention_period
                        }
                        for activity_id, activity in self.processing_activities.items()
                        if activity_id in data_subject.data_processing_purposes
                    ],
                    'consent_history': [
                        record for record in self.consent_records
                        if record['user_id'] == user_id
                    ]
                }
                
            elif request_type == 'portability':
                # Right to data portability - machine-readable format
                response_data = {
                    'user_data': {
                        'user_id': data_subject.user_id,
                        'email': data_subject.email,
                        'consent_preferences': data_subject.consent_status,
                        'export_timestamp': datetime.now().isoformat(),
                        'format': 'JSON'
                    }
                }
                
            elif request_type == 'erasure':
                # Right to erasure - delete personal data
                # Note: Some data may need to be retained for legal obligations
                mandatory_retention = ['aml_compliance']  # Cannot be deleted due to legal requirements
                
                can_delete = True
                retention_reasons = []
                
                for purpose in data_subject.data_processing_purposes:
                    if purpose in mandatory_retention:
                        can_delete = False
                        retention_reasons.append(f"Legal obligation: {purpose}")
                
                response_data = {
                    'can_delete': can_delete,
                    'retention_reasons': retention_reasons,
                    'partial_deletion_available': len(retention_reasons) > 0
                }
                
            elif request_type == 'rectification':
                # Right to rectification - correct inaccurate data
                response_data = {
                    'current_data': {
                        'user_id': data_subject.user_id,
                        'email': data_subject.email
                    },
                    'rectification_process': 'Contact support with correct information'
                }
            
            # Update request status
            data_request['status'] = 'processed'
            data_request['response_data'] = response_data
            data_request['processed_timestamp'] = datetime.now().isoformat()
            
            logger.info(f"Data request processed: {request_type} for user {user_id}")
            
            return {
                'success': True,
                'message': f'Data request processed: {request_type}',
                'data': {
                    'request_id': request_id,
                    'request_type': request_type,
                    'response': response_data
                }
            }
            
        except Exception as e:
            logger.error(f"Error handling data request: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_compliance_status(self) -> Dict:
        """Get overall GDPR compliance status"""
        try:
            total_subjects = len(self.data_subjects)
            total_requests = len(self.data_requests)
            pending_requests = len([r for r in self.data_requests if r['status'] == 'pending'])
            
            # Calculate consent rates
            consent_stats = {}
            for purpose in self.processing_activities.keys():
                consented = sum(1 for ds in self.data_subjects.values() 
                              if ds.consent_status.get(purpose, False))
                consent_stats[purpose] = {
                    'consented': consented,
                    'total': total_subjects,
                    'percentage': (consented / total_subjects * 100) if total_subjects > 0 else 0
                }
            
            return {
                'success': True,
                'data': {
                    'total_data_subjects': total_subjects,
                    'total_data_requests': total_requests,
                    'pending_requests': pending_requests,
                    'consent_statistics': consent_stats,
                    'processing_activities': len(self.processing_activities),
                    'compliance_score': self._calculate_compliance_score()
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting compliance status: {e}")
            return {'success': False, 'error': str(e)}
    
    def _calculate_compliance_score(self) -> float:
        """Calculate overall compliance score"""
        score = 100.0
        
        # Deduct points for pending requests
        pending_requests = len([r for r in self.data_requests if r['status'] == 'pending'])
        overdue_requests = len([
            r for r in self.data_requests 
            if r['status'] == 'pending' and 
            datetime.fromisoformat(r['response_due']) < datetime.now()
        ])
        
        score -= (pending_requests * 5)  # -5 points per pending request
        score -= (overdue_requests * 15)  # -15 points per overdue request
        
        return max(0.0, score)

# Global compliance service instance
compliance_service = GDPRComplianceService()

# API Routes
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'gdpr-compliance',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/gdpr/register', methods=['POST'])
def register_data_subject():
    """Register a new data subject"""
    data = request.get_json()
    
    user_id = data.get('user_id')
    email = data.get('email')
    consent_purposes = data.get('consent_purposes')
    
    if not user_id or not email:
        return jsonify({'success': False, 'error': 'user_id and email are required'}), 400
    
    result = compliance_service.register_data_subject(user_id, email, consent_purposes)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 500

@app.route('/api/gdpr/consent', methods=['PUT'])
def update_consent():
    """Update consent preferences"""
    data = request.get_json()
    
    user_id = data.get('user_id')
    consent_updates = data.get('consent_updates')
    
    if not user_id or not consent_updates:
        return jsonify({'success': False, 'error': 'user_id and consent_updates are required'}), 400
    
    result = compliance_service.update_consent(user_id, consent_updates)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 500

@app.route('/api/gdpr/request', methods=['POST'])
def handle_data_request():
    """Handle GDPR data subject requests"""
    data = request.get_json()
    
    user_id = data.get('user_id')
    request_type = data.get('request_type')
    additional_info = data.get('additional_info')
    
    if not user_id or not request_type:
        return jsonify({'success': False, 'error': 'user_id and request_type are required'}), 400
    
    valid_request_types = ['access', 'portability', 'erasure', 'rectification', 'objection']
    if request_type not in valid_request_types:
        return jsonify({'success': False, 'error': f'Invalid request_type. Must be one of: {valid_request_types}'}), 400
    
    result = compliance_service.handle_data_request(user_id, request_type, additional_info)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 500

@app.route('/api/gdpr/status', methods=['GET'])
def get_compliance_status():
    """Get GDPR compliance status"""
    result = compliance_service.get_compliance_status()
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 500

if __name__ == '__main__':
    logger.info("Starting NexusTradeAI GDPR Compliance Service...")
    app.run(host='0.0.0.0', port=3006, debug=True)
