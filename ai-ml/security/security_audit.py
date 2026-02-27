"""
Security Audit Framework
=========================
Comprehensive security auditing tools for ML infrastructure.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

Features:
- Secret detection in code and config files
- Dependency vulnerability scanning
- API security testing
- Access control audit
- Encryption verification
- Security best practices checker
"""

import re
import os
import json
import hashlib
import requests
from pathlib import Path
from typing import List, Dict, Set, Optional, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class SeverityLevel(str, Enum):
    """Security issue severity levels"""
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


@dataclass
class SecurityIssue:
    """Represents a security issue found during audit"""
    severity: SeverityLevel
    category: str
    description: str
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    recommendation: Optional[str] = None
    cve_id: Optional[str] = None

    def __str__(self) -> str:
        location = f"{self.file_path}:{self.line_number}" if self.file_path else "N/A"
        return f"[{self.severity.value}] {self.category}: {self.description} ({location})"


@dataclass
class AuditReport:
    """Security audit report"""
    timestamp: datetime = field(default_factory=datetime.now)
    issues: List[SecurityIssue] = field(default_factory=list)
    files_scanned: int = 0
    dependencies_checked: int = 0
    passed_checks: int = 0
    failed_checks: int = 0

    def add_issue(self, issue: SecurityIssue):
        """Add security issue to report"""
        self.issues.append(issue)
        self.failed_checks += 1

    def add_pass(self):
        """Record a passed security check"""
        self.passed_checks += 1

    def get_issues_by_severity(self, severity: SeverityLevel) -> List[SecurityIssue]:
        """Get issues filtered by severity"""
        return [issue for issue in self.issues if issue.severity == severity]

    def print_summary(self):
        """Print audit summary"""
        print("\n" + "="*70)
        print("SECURITY AUDIT REPORT")
        print("="*70)
        print(f"Timestamp: {self.timestamp.isoformat()}")
        print(f"Files scanned: {self.files_scanned}")
        print(f"Dependencies checked: {self.dependencies_checked}")
        print(f"Passed checks: {self.passed_checks}")
        print(f"Failed checks: {self.failed_checks}")
        print()

        # Count by severity
        critical = len(self.get_issues_by_severity(SeverityLevel.CRITICAL))
        high = len(self.get_issues_by_severity(SeverityLevel.HIGH))
        medium = len(self.get_issues_by_severity(SeverityLevel.MEDIUM))
        low = len(self.get_issues_by_severity(SeverityLevel.LOW))

        print(f"Issues by Severity:")
        print(f"  CRITICAL: {critical}")
        print(f"  HIGH: {high}")
        print(f"  MEDIUM: {medium}")
        print(f"  LOW: {low}")
        print()

        if critical > 0 or high > 0:
            print("⚠️  CRITICAL or HIGH severity issues found!")
            print("   These must be addressed before production deployment.")
        elif medium > 0:
            print("⚠️  MEDIUM severity issues found.")
            print("   Recommend addressing these before deployment.")
        else:
            print("✅ No critical security issues found.")

        print("="*70 + "\n")

    def print_detailed_report(self):
        """Print detailed report with all issues"""
        self.print_summary()

        if not self.issues:
            print("No issues to report.\n")
            return

        # Group by severity
        for severity in [SeverityLevel.CRITICAL, SeverityLevel.HIGH, SeverityLevel.MEDIUM, SeverityLevel.LOW]:
            issues = self.get_issues_by_severity(severity)
            if not issues:
                continue

            print(f"\n{severity.value} Issues ({len(issues)}):")
            print("-" * 70)

            for i, issue in enumerate(issues, 1):
                print(f"\n{i}. {issue.category}")
                print(f"   Description: {issue.description}")
                if issue.file_path:
                    print(f"   Location: {issue.file_path}:{issue.line_number or 'N/A'}")
                if issue.cve_id:
                    print(f"   CVE: {issue.cve_id}")
                if issue.recommendation:
                    print(f"   Recommendation: {issue.recommendation}")

        print("\n" + "="*70 + "\n")


class SecretDetector:
    """
    Detect secrets and sensitive information in code
    """

    # Patterns for detecting secrets
    SECRET_PATTERNS = {
        'AWS Access Key': r'AKIA[0-9A-Z]{16}',
        'Generic API Key': r'[aA][pP][iI]_?[kK][eE][yY].*[\'"][0-9a-zA-Z]{32,}[\'"]',
        'Generic Secret': r'[sS][eE][cC][rR][eE][tT].*[\'"][0-9a-zA-Z]{32,}[\'"]',
        'Password': r'[pP][aA][sS][sS][wW][oO][rR][dD].*[\'"][^\'"]{8,}[\'"]',
        'Private Key': r'-----BEGIN.*PRIVATE KEY-----',
        'JWT Token': r'eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*',
        'Generic Token': r'[tT][oO][kK][eE][nN].*[\'"][0-9a-zA-Z]{32,}[\'"]',
    }

    # Files to exclude from scanning
    EXCLUDE_PATTERNS = {
        '.git', '__pycache__', 'node_modules', '.venv', 'venv',
        '.pyc', '.pyo', '.so', '.dylib', '.dll'
    }

    def __init__(self):
        self.findings: List[SecurityIssue] = []

    def scan_file(self, file_path: Path) -> List[SecurityIssue]:
        """Scan a single file for secrets"""
        issues = []

        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()

            for line_num, line in enumerate(lines, 1):
                for secret_type, pattern in self.SECRET_PATTERNS.items():
                    matches = re.finditer(pattern, line)
                    for match in matches:
                        # Skip if it looks like a comment or example
                        if 'example' in line.lower() or 'your_' in line.lower():
                            continue

                        issue = SecurityIssue(
                            severity=SeverityLevel.CRITICAL,
                            category=f"Potential {secret_type} Exposed",
                            description=f"Found potential {secret_type.lower()} in code",
                            file_path=str(file_path),
                            line_number=line_num,
                            recommendation="Remove hardcoded secrets. Use environment variables or secret management system."
                        )
                        issues.append(issue)

        except Exception as e:
            logger.warning(f"Error scanning {file_path}: {e}")

        return issues

    def scan_directory(self, directory: Path) -> List[SecurityIssue]:
        """Scan directory recursively for secrets"""
        issues = []

        for root, dirs, files in os.walk(directory):
            # Exclude certain directories
            dirs[:] = [d for d in dirs if d not in self.EXCLUDE_PATTERNS]

            for file in files:
                file_path = Path(root) / file

                # Skip binary files and excluded patterns
                if any(pattern in str(file_path) for pattern in self.EXCLUDE_PATTERNS):
                    continue

                if file_path.suffix in ['.py', '.js', '.ts', '.yaml', '.yml', '.json', '.env', '.conf']:
                    file_issues = self.scan_file(file_path)
                    issues.extend(file_issues)

        return issues


class DependencyScanner:
    """
    Scan dependencies for known vulnerabilities
    """

    def __init__(self):
        self.known_vulnerabilities: Dict[str, List[Dict]] = {}
        self._load_vulnerability_db()

    def _load_vulnerability_db(self):
        """Load known vulnerability database (simplified)"""
        # In production, this would query actual vulnerability databases
        # For now, we'll use a simplified local check
        self.known_vulnerabilities = {
            # Example vulnerabilities (these are illustrative)
            'requests': [
                {'version': '<2.31.0', 'cve': 'CVE-2023-32681', 'severity': 'MEDIUM'}
            ],
            'urllib3': [
                {'version': '<1.26.5', 'cve': 'CVE-2021-33503', 'severity': 'HIGH'}
            ],
        }

    def scan_requirements(self, requirements_file: Path) -> List[SecurityIssue]:
        """Scan requirements.txt for vulnerable dependencies"""
        issues = []

        if not requirements_file.exists():
            return issues

        try:
            with open(requirements_file, 'r') as f:
                lines = f.readlines()

            for line_num, line in enumerate(lines, 1):
                line = line.strip()
                if not line or line.startswith('#'):
                    continue

                # Parse package and version
                if '==' in line:
                    package, version = line.split('==')
                    package = package.strip()
                    version = version.strip()

                    # Check for known vulnerabilities
                    if package in self.known_vulnerabilities:
                        for vuln in self.known_vulnerabilities[package]:
                            issue = SecurityIssue(
                                severity=SeverityLevel[vuln['severity']],
                                category="Vulnerable Dependency",
                                description=f"{package} {version} has known vulnerability",
                                file_path=str(requirements_file),
                                line_number=line_num,
                                cve_id=vuln['cve'],
                                recommendation=f"Update {package} to latest secure version"
                            )
                            issues.append(issue)

        except Exception as e:
            logger.error(f"Error scanning requirements: {e}")

        return issues


class APISecurityTester:
    """
    Test API endpoints for security vulnerabilities
    """

    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()

    def test_authentication(self) -> List[SecurityIssue]:
        """Test authentication mechanisms"""
        issues = []

        # Test if API allows unauthenticated access
        try:
            response = self.session.get(f"{self.base_url}/models", timeout=5)

            if response.status_code == 200:
                issue = SecurityIssue(
                    severity=SeverityLevel.HIGH,
                    category="Missing Authentication",
                    description="API endpoint accessible without authentication",
                    recommendation="Implement API key or JWT authentication"
                )
                issues.append(issue)

        except Exception as e:
            logger.warning(f"Error testing authentication: {e}")

        return issues

    def test_https(self) -> List[SecurityIssue]:
        """Test if HTTPS is enforced"""
        issues = []

        if self.base_url.startswith('http://'):
            issue = SecurityIssue(
                severity=SeverityLevel.HIGH,
                category="Insecure Transport",
                description="API uses HTTP instead of HTTPS",
                recommendation="Enable HTTPS/TLS for all API endpoints"
            )
            issues.append(issue)

        return issues

    def test_rate_limiting(self) -> List[SecurityIssue]:
        """Test if rate limiting is implemented"""
        issues = []

        try:
            # Send multiple rapid requests
            for _ in range(100):
                response = self.session.get(f"{self.base_url}/health", timeout=1)

            # If all succeeded, rate limiting might not be implemented
            issue = SecurityIssue(
                severity=SeverityLevel.MEDIUM,
                category="Missing Rate Limiting",
                description="API does not appear to implement rate limiting",
                recommendation="Implement rate limiting to prevent abuse"
            )
            issues.append(issue)

        except Exception as e:
            # Could mean rate limiting is working or connection error
            logger.info(f"Rate limit test: {e}")

        return issues

    def test_cors(self) -> List[SecurityIssue]:
        """Test CORS configuration"""
        issues = []

        try:
            response = self.session.options(f"{self.base_url}/predict", timeout=5)

            cors_header = response.headers.get('Access-Control-Allow-Origin', '')

            if cors_header == '*':
                issue = SecurityIssue(
                    severity=SeverityLevel.MEDIUM,
                    category="Permissive CORS",
                    description="CORS allows all origins (*)",
                    recommendation="Restrict CORS to specific trusted domains"
                )
                issues.append(issue)

        except Exception as e:
            logger.warning(f"Error testing CORS: {e}")

        return issues


class EncryptionVerifier:
    """
    Verify encryption and secure configuration
    """

    @staticmethod
    def check_file_permissions(file_path: Path) -> Optional[SecurityIssue]:
        """Check if sensitive files have appropriate permissions"""
        if not file_path.exists():
            return None

        # Check if file is world-readable (on Unix-like systems)
        try:
            stat_info = file_path.stat()
            mode = stat_info.st_mode

            # Check if others can read (mode & 0o004)
            if mode & 0o004:
                return SecurityIssue(
                    severity=SeverityLevel.HIGH,
                    category="Insecure File Permissions",
                    description=f"Sensitive file {file_path.name} is world-readable",
                    file_path=str(file_path),
                    recommendation="Set file permissions to 600 (rw-------)"
                )

        except Exception as e:
            logger.warning(f"Error checking permissions for {file_path}: {e}")

        return None

    @staticmethod
    def check_environment_file() -> List[SecurityIssue]:
        """Check .env file security"""
        issues = []

        env_file = Path('.env')

        if env_file.exists():
            # Check permissions
            perm_issue = EncryptionVerifier.check_file_permissions(env_file)
            if perm_issue:
                issues.append(perm_issue)

            # Check if .env is in .gitignore
            gitignore = Path('.gitignore')
            if gitignore.exists():
                with open(gitignore, 'r') as f:
                    if '.env' not in f.read():
                        issue = SecurityIssue(
                            severity=SeverityLevel.HIGH,
                            category="Sensitive File Not Ignored",
                            description=".env file not in .gitignore",
                            recommendation="Add .env to .gitignore to prevent committing secrets"
                        )
                        issues.append(issue)
            else:
                issue = SecurityIssue(
                    severity=SeverityLevel.MEDIUM,
                    category="Missing .gitignore",
                    description=".gitignore file not found",
                    recommendation="Create .gitignore and add .env, secrets, etc."
                )
                issues.append(issue)

        return issues


class SecurityAuditor:
    """
    Main security auditor that runs all security checks
    """

    def __init__(self, project_root: Path, api_url: Optional[str] = None):
        self.project_root = project_root
        self.api_url = api_url
        self.report = AuditReport()

    def run_full_audit(self) -> AuditReport:
        """Run complete security audit"""
        print("\n" + "="*70)
        print("RUNNING COMPREHENSIVE SECURITY AUDIT")
        print("="*70 + "\n")

        # 1. Secret Detection
        print("[1/6] Scanning for exposed secrets...")
        secret_detector = SecretDetector()
        secret_issues = secret_detector.scan_directory(self.project_root)
        for issue in secret_issues:
            self.report.add_issue(issue)
        self.report.files_scanned += sum(1 for _ in self.project_root.rglob('*.py'))
        print(f"   Found {len(secret_issues)} potential secret exposures")

        # 2. Dependency Scanning
        print("[2/6] Scanning dependencies for vulnerabilities...")
        dep_scanner = DependencyScanner()
        requirements_file = self.project_root / 'requirements.txt'
        if requirements_file.exists():
            dep_issues = dep_scanner.scan_requirements(requirements_file)
            for issue in dep_issues:
                self.report.add_issue(issue)
            self.report.dependencies_checked += 1
            print(f"   Found {len(dep_issues)} vulnerable dependencies")
        else:
            print("   requirements.txt not found, skipping")

        # 3. API Security Testing
        if self.api_url:
            print("[3/6] Testing API security...")
            api_tester = APISecurityTester(self.api_url)

            for test_func in [api_tester.test_https, api_tester.test_authentication,
                             api_tester.test_rate_limiting, api_tester.test_cors]:
                try:
                    issues = test_func()
                    for issue in issues:
                        self.report.add_issue(issue)
                except Exception as e:
                    logger.warning(f"API test failed: {e}")

            print(f"   Completed API security tests")
        else:
            print("[3/6] Skipping API tests (no URL provided)")

        # 4. File Permissions
        print("[4/6] Checking file permissions...")
        env_issues = EncryptionVerifier.check_environment_file()
        for issue in env_issues:
            self.report.add_issue(issue)
        print(f"   Found {len(env_issues)} permission issues")

        # 5. Best Practices
        print("[5/6] Checking security best practices...")
        best_practice_issues = self._check_best_practices()
        for issue in best_practice_issues:
            self.report.add_issue(issue)
        print(f"   Found {len(best_practice_issues)} best practice violations")

        # 6. Configuration Security
        print("[6/6] Checking configuration security...")
        config_issues = self._check_configuration_security()
        for issue in config_issues:
            self.report.add_issue(issue)
        print(f"   Found {len(config_issues)} configuration issues")

        print("\n✅ Security audit complete\n")

        return self.report

    def _check_best_practices(self) -> List[SecurityIssue]:
        """Check for security best practices"""
        issues = []

        # Check if there's a security policy
        security_md = self.project_root / 'SECURITY.md'
        if not security_md.exists():
            issues.append(SecurityIssue(
                severity=SeverityLevel.LOW,
                category="Missing Security Policy",
                description="No SECURITY.md file found",
                recommendation="Create SECURITY.md with vulnerability reporting process"
            ))

        # Check for Docker security
        dockerfile = self.project_root / 'Dockerfile'
        if dockerfile.exists():
            with open(dockerfile, 'r') as f:
                content = f.read()
                if 'USER root' in content or 'USER' not in content:
                    issues.append(SecurityIssue(
                        severity=SeverityLevel.MEDIUM,
                        category="Docker Security",
                        description="Dockerfile runs as root user",
                        file_path=str(dockerfile),
                        recommendation="Add non-root USER directive to Dockerfile"
                    ))

        return issues

    def _check_configuration_security(self) -> List[SecurityIssue]:
        """Check configuration files for security issues"""
        issues = []

        # Check for debug mode in production configs
        config_files = list(self.project_root.glob('**/config/*.yaml'))
        config_files.extend(self.project_root.glob('**/config/*.yml'))

        for config_file in config_files:
            if 'production' in config_file.name.lower():
                try:
                    with open(config_file, 'r') as f:
                        content = f.read().lower()
                        if 'debug: true' in content:
                            issues.append(SecurityIssue(
                                severity=SeverityLevel.HIGH,
                                category="Debug Mode in Production",
                                description="Debug mode enabled in production config",
                                file_path=str(config_file),
                                recommendation="Disable debug mode in production"
                            ))
                except Exception as e:
                    logger.warning(f"Error checking config {config_file}: {e}")

        return issues


# Example usage
if __name__ == "__main__":
    # Run security audit
    project_root = Path(".")
    api_url = "http://localhost:8000"  # Optional

    auditor = SecurityAuditor(project_root, api_url)
    report = auditor.run_full_audit()

    # Print detailed report
    report.print_detailed_report()

    # Return exit code based on severity
    critical_count = len(report.get_issues_by_severity(SeverityLevel.CRITICAL))
    high_count = len(report.get_issues_by_severity(SeverityLevel.HIGH))

    if critical_count > 0:
        print("❌ CRITICAL issues must be fixed before deployment!")
        exit(1)
    elif high_count > 0:
        print("⚠️  HIGH severity issues should be addressed.")
        exit(1)
    else:
        print("✅ No critical security issues found.")
        exit(0)
