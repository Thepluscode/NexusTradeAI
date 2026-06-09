---
title: AI Governance & Delivery Framework
company: ThePlus-Tech
classification: Confidential — Client Distribution
version: 1.0
date: 2026-05-02
audience: Enterprise prospects, regulated industries, multi-billion-dollar buyers
---

# AI Governance & Delivery Framework

**ThePlus-Tech**
*Engineering Intelligence, Security, and Creativity for the Digital Future*

---

## Purpose of This Document

This document is the standardized framework ThePlus-Tech uses to design, deliver, and operate agentic AI systems for enterprise clients. It is provided on day one of every engagement so that procurement, security, legal, compliance, and engineering counterparts at the client side have a single artifact describing how we work, what we deliver, and what controls are in place.

It is not a marketing document. It is the operational contract.

---

## 1. Executive Summary

Agentic AI systems — networks of autonomous AI agents executing multi-step workflows — represent the most significant structural change in applied AI since the deployment of large language models. The opportunity is significant. So is the risk.

ThePlus-Tech designs and delivers agentic AI systems under the following non-negotiable commitments:

1. **Production-grade by default.** No prototypes. Every system shipped is engineered to be secure, observable, maintainable, and economically sustainable from the first day in production.
2. **Security-native.** Trust boundaries, least-privilege access, and audit logging are designed in from the architecture phase. They are not retrofitted.
3. **Governed.** Human-in-the-loop checkpoints are mandatory for any irreversible or high-impact action. Every decision an agent makes is logged with full traceability.
4. **Measurable.** Every claim of effectiveness is backed by measured evidence. Every detector is evaluated for false positives and false negatives before acceptance.
5. **Reversible.** Every state-changing operation has a documented rollback path. We do not ship systems that cannot be undone.

The remainder of this document specifies how those commitments are implemented.

---

## 2. Governance Framework

Every agent system delivered by ThePlus-Tech is governed by four explicit components. These are documented before implementation begins, reviewed jointly with the client during design, and retained as living artifacts throughout the system lifecycle.

### 2.1 Acceptable Use Policy

For each agent or workflow:
- The set of tasks the agent is explicitly authorized to perform
- The set of tasks the agent is explicitly prohibited from performing
- The named human accountable for each authorized task
- The escalation path when the agent encounters a task outside its authorized scope

### 2.2 Trust Boundaries

For each agent:
- Which data sources the agent can read
- Which APIs and tools the agent can invoke
- Which other agents the agent can communicate with
- Which actions require human approval before execution
- Which actions are unconditionally prohibited

Trust boundaries are enforced at the orchestration layer through least-privilege access tokens and audit-logged tool registrations, not through prompt instructions alone.

### 2.3 Audit Logging

Every agent action produces a structured log entry containing:
- Unique request and run identifiers
- Authenticated identity of the requesting principal
- Inputs supplied to the agent
- Reasoning trace, where applicable, with citations to retrieved sources
- Tool calls invoked, with parameters and responses
- Outputs produced
- Outcome — success, partial success, failure, or human-overridden
- Cost in tokens, latency, and downstream resource consumption
- Cryptographic hash linking to the prior log entry for tamper-evidence

Logs are retained per the client's regulatory regime (typically 7 years for financial services, 6 years for healthcare, 3 years for general enterprise) and indexed for both compliance review and incident investigation.

### 2.4 Kill Switches and Circuit Breakers

Every agent system includes:
- A global kill switch operable from a non-AI control plane that halts all agent activity within seconds
- Per-agent disable controls accessible to authorized human operators
- Automatic circuit breakers that pause an agent when its error rate, cost burn, or anomaly score exceeds defined thresholds
- A documented procedure for restoring service after a kill-switch event

These controls exist outside the AI layer so they cannot be circumvented by agent actions.

---

## 3. Architectural Principles

### 3.1 Modular Agents with Single Responsibilities

Each agent has one clear job. Monolithic agents that attempt many tasks fail in unpredictable ways and are difficult to govern. Agent networks are composed of small, single-purpose agents coordinated through a defined protocol.

### 3.2 Tools Over Reasoning

Where deterministic logic suffices, ThePlus-Tech uses code, not LLM reasoning. Calculators, validators, SQL queries, lookups, schema enforcement — all run as tools the agent invokes. The LLM is reserved for tasks where natural-language reasoning is genuinely required.

### 3.3 Retrieval-Augmented Generation (RAG)

For knowledge that changes faster than model training cycles — internal documents, customer records, market data, regulatory updates — RAG is the standard pattern. Retrieval indexes are treated as production systems with their own SLAs, refresh cadence, and quality metrics.

### 3.4 Tiered Model Routing

Frontier models are expensive and not always necessary. ThePlus-Tech systems route tasks across model tiers:
- Lightweight models for triage, routing, and simple extraction
- Mid-tier models for the bulk of agent work
- Frontier models reserved for tasks that demonstrably fail with smaller models

Routing rules are version-controlled and evaluated continuously.

### 3.5 Structured Output and Schema Validation

All agent outputs that feed into downstream systems are produced as structured data — typically JSON conforming to a published schema. The schema is validated before the output is consumed. Free-text outputs are confined to user-facing surfaces, never to system-to-system integration.

### 3.6 Idempotency and Replay Safety

Every action that creates a resource, moves money, sends a communication, or modifies state is idempotent through a client-supplied request key. Retries cannot cause duplicate effects.

---

## 4. Evaluation Infrastructure

The single greatest cause of silent quality degradation in agent systems is the absence of continuous evaluation. ThePlus-Tech treats evaluation as first-class engineering, equal in priority to the agent code itself.

### 4.1 Golden Evaluation Sets

For every production behavior, a labeled test set is curated jointly with the client domain experts. The set contains:
- Normal cases representative of typical inputs
- Boundary cases — inputs at decision thresholds
- Malformed cases — null, missing, malformed, or hostile inputs
- Adversarial cases — inputs designed to cause incorrect behavior or boundary violations
- Regression cases — one entry per previously identified bug

Evaluation sets grow over the system's lifetime. They are version-controlled and signed off by the client.

### 4.2 Continuous Evaluation Pipelines

Every model change, prompt revision, retrieval index refresh, or tool definition update triggers an automated evaluation run. Changes that fail predefined acceptance thresholds are blocked from production deployment until resolved.

### 4.3 Detector Quality

For every component that scores, classifies, or flags:
- Precision and recall measured against labeled data at the chosen threshold
- False positive and false negative rates reported per release
- Threshold changes require explicit FP/FN measurement before acceptance
- Drift detection over time, with alerts when distributions shift materially

### 4.4 Shadow Mode and Canary Deployment

New agent versions and model upgrades are rolled out in stages:
- Shadow mode — new version runs alongside production, outputs compared offline, no traffic served
- Canary — 1% of traffic, monitored against statistical guardrails
- Progressive rollout — 5%, 25%, 100% with automatic rollback on degradation
- Champion-challenger — incumbent version remains the default until challenger demonstrably outperforms it on agreed metrics

### 4.5 Cost and Performance Monitoring

Every workflow tracks:
- Cost per task in tokens and currency
- Cache hit rates
- Latency at 50th, 95th, and 99th percentiles
- Error rates segmented by failure mode

Anomaly alerts fire on cost spikes, latency degradation, and error rate increases without human intervention.

---

## 5. Reliability & Service Level Objectives

### 5.1 SLOs and SLIs

For each workflow, ThePlus-Tech and the client agree:
- **SLI** — what is measured (e.g., percentage of agent runs completing successfully within latency budget)
- **SLO** — the target value of the SLI (e.g., 99.5% over a rolling 30-day window)
- **Error budget** — the amount of unreliability the system is permitted to consume before further changes are paused

### 5.2 Graceful Degradation

When primary systems fail, agent workflows degrade in a documented sequence:
- Primary model fails → fall back to alternate model
- Alternate model fails → fall back to cached response if applicable
- Cache miss → fall back to a deterministic, simpler workflow
- All AI paths fail → fall back to human handoff with full context preserved

The user experience is degraded gradually, not catastrophically.

### 5.3 Backpressure and Resource Bounds

- Queues are bounded; oldest messages are explicitly dropped or routed to dead-letter queues, not silently discarded
- Retries are bounded with exponential backoff and jitter
- Circuit breakers protect every external dependency
- Cost ceilings per workflow prevent runaway spend
- Rate limits per tenant prevent noisy-neighbor effects

### 5.4 Disaster Recovery

- Recovery Time Objective and Recovery Point Objective agreed per workflow
- Multi-region deployment for workflows with regional SLA requirements
- Quarterly disaster recovery tests with documented results
- Incident response runbooks per failure mode, accessible offline

---

## 6. Security Architecture

ThePlus-Tech systems are designed to meet OWASP Top 10 (web), OWASP Top 10 for Agentic Applications, NIST AI Risk Management Framework, and applicable client-specific frameworks (ISO 27001, SOC 2 Type II, PCI DSS, HIPAA, FedRAMP) from the architecture phase.

### 6.1 Identity and Access

- Each agent operates under its own service identity with rotating credentials
- Tool access is granted per-agent through least-privilege scopes
- Human users authenticate via the client's identity provider (Okta, Entra ID, Auth0, Ping)
- Multi-factor authentication required for any human action that modifies system configuration
- Privileged operations require quorum approval — at minimum two named individuals

### 6.2 Secrets Management

- Secrets are stored in dedicated secret management systems (HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault)
- No secrets in source code, configuration files, environment variables of long-running processes, or logs
- Automatic secret rotation on a defined schedule
- Separate secret stores per environment with no cross-environment access

### 6.3 Network and Egress Controls

- Agents operate within network segments with explicit egress allowlists
- Outbound calls to LLM providers, knowledge sources, and tools are routed through audited gateways
- DNS, TLS certificate, and SNI controls prevent agent communication with unauthorized endpoints

### 6.4 Data Protection

- Personally identifiable information is detected and redacted before reaching any external model
- Data residency controls ensure information stays within agreed geographic boundaries
- Encryption at rest with AES-256, in transit with TLS 1.3
- Hardware security modules for key material in regulated environments

### 6.5 Adversarial Resilience

Before any production deployment:
- Prompt injection attacks tested with the latest published techniques
- Goal hijacking and instruction following overrides tested across all agent surfaces
- Tool call sandboxing for any agent that executes generated code (gVisor, Firecracker, or equivalent)
- Red team engagement on systems handling sensitive operations or data

### 6.6 Supply Chain Security

- Every dependency pinned by version and verified by checksum or signature
- Software Bill of Materials (SBOM) generated for each release
- Continuous vulnerability scanning with policy-based blocking on critical and high severity issues
- Vendor risk assessment for every third-party model, tool, or knowledge source

---

## 7. Compliance Mapping

ThePlus-Tech systems are designed to support — not replace — the client's compliance program. The following mappings are produced for each engagement.

### 7.1 EU AI Act

- High-risk AI system classification reviewed jointly with the client's legal team
- Risk management system, data governance, technical documentation, record-keeping, transparency, human oversight, accuracy, robustness, and cybersecurity requirements addressed per the framework
- Conformity assessment evidence retained for the lifetime of the system
- August 2026 milestone obligations tracked and met

### 7.2 GDPR / UK GDPR

- Data Protection Impact Assessments produced for any system processing personal data
- Lawful basis for processing documented per use case
- Data minimization in retrieval indexes — only the data needed for the task is exposed
- Right of access, rectification, and erasure supported through documented procedures

### 7.3 Financial Services

- SR 11-7 (US) / SS 1/23 (UK PRA) model risk management requirements addressed for systems used in regulated financial decisions
- DORA (Digital Operational Resilience Act) obligations met for ICT risk and third-party concentration
- MiFID II, MiCA, and FCA conduct rules considered per applicable jurisdiction

### 7.4 Healthcare

- HIPAA Security Rule controls implemented where Protected Health Information is processed
- Clinical decision support classifications reviewed per FDA / MHRA guidance

### 7.5 Information Security Frameworks

- SOC 2 Type II — the platform is delivered with controls that map to Trust Services Criteria
- ISO 27001 — Information Security Management System integration supported
- NIST Cybersecurity Framework profile produced per engagement

---

## 8. Engagement Model

### 8.1 Discovery (4–6 weeks)

Workshops with the client's stakeholders to:
- Map current decision flows in the target domain
- Identify the highest-value automation opportunities
- Identify the lowest-risk starting point for the first deployed agent
- Document data sources, integration points, and constraints
- Document compliance, security, and audit requirements
- Produce a written architecture proposal for client review

Discovery deliverables:
- Current-state workflow analysis
- Opportunity prioritization matrix
- Risk and readiness assessment
- Architecture proposal with named components, trust boundaries, and acceptance criteria
- Investment case with phased budget

### 8.2 Pilot (8–12 weeks)

- Single workflow, single agent network
- Full observability, governance, and security infrastructure from day one
- Acceptance criteria agreed in writing before development begins
- Weekly status reviews with the client steering committee
- Final acceptance against measured criteria, signed by client and ThePlus-Tech

Pilot deliverables:
- Production-deployed agent system
- Evaluation evidence demonstrating acceptance criteria met
- Runbooks for operations, incident response, and rollback
- Knowledge transfer to the client's operations team
- Documented expansion path

### 8.3 Production Rollout

- Progressive deployment with agreed canary stages
- Performance monitored against SLOs with automatic rollback on degradation
- Quarterly business reviews assessing realized value against the investment case
- Continuous evaluation of newly published models for upgrade opportunities

### 8.4 Managed Operations (optional)

ThePlus-Tech provides ongoing operations services for systems requiring 24/7 oversight:
- Continuous observability and incident response
- Model and prompt optimization as foundation models evolve
- Cost management and inference efficiency reviews
- Quarterly performance and reliability reporting
- Continuous evaluation set expansion

---

## 9. Roles and Responsibilities

### 9.1 ThePlus-Tech

- Architecture, design, and engineering of the agent system
- Implementation of governance, security, and observability infrastructure
- Evaluation pipeline construction and operation
- Knowledge transfer to client operations team
- Optional ongoing managed operations under separate agreement

### 9.2 Client

- Domain expertise and labeled data for evaluation set construction
- Identity provider integration and access provisioning
- Compliance review and sign-off per the client's regulatory regime
- Operational oversight post-handover (or contracted to ThePlus-Tech under managed operations)
- Acceptance criteria sign-off at each engagement gate

### 9.3 Joint Governance

- AI Council with representation from legal, security, compliance, and product
- Weekly working sessions during pilot
- Monthly steering reviews during production rollout
- Incident response coordination per agreed runbooks

---

## 10. Acceptance Criteria

Every engagement defines measurable acceptance criteria before development begins. The default categories, customized per engagement, are:

- **Functional** — does the agent perform the agreed task on the agreed inputs?
- **Quality** — precision, recall, accuracy, or task-specific metrics meeting agreed thresholds
- **Performance** — latency at 95th and 99th percentiles within agreed budgets
- **Cost** — per-task and aggregate cost within the agreed envelope
- **Reliability** — SLO compliance over the evaluation window
- **Security** — penetration test and red team results clean, dependency vulnerabilities below severity thresholds
- **Compliance** — required artifacts produced and signed off
- **Operational** — runbooks tested, on-call rotation established, incident response practiced

A system is not delivered until all categories are met and signed off by both parties.

---

## 11. What ThePlus-Tech Does Not Do

- We do not deliver prototypes. Every system is engineered for production from the architecture phase.
- We do not deploy systems without documented rollback paths.
- We do not deploy systems without continuous evaluation.
- We do not retrofit security after delivery.
- We do not skip human oversight on high-impact decisions because the model is "good enough."
- We do not commit to model performance numbers on training data — only on held-out evaluation sets the client has reviewed.
- We do not use client data to train shared models without explicit written consent and a defined scope.

---

## 12. How to Engage

Initial engagement is a Discovery workshop. The output of Discovery is a written architecture proposal with named components, named trust boundaries, written acceptance criteria, and a phased investment case. The client decides at that point whether to proceed to Pilot.

There is no obligation beyond Discovery. ThePlus-Tech does not propose Pilot scope until the architecture has been agreed.

---

## Appendix A — Standard Artifacts Produced Per Engagement

- Discovery report
- Architecture proposal with trust boundary diagram
- Acceptable use policy per agent
- Audit log specification
- Evaluation set with sign-off
- Security architecture document
- Compliance mapping per applicable framework
- SLO/SLI specification
- Runbooks: operations, incident response, rollback, disaster recovery
- Knowledge transfer materials for client operations team

## Appendix B — Standard Tooling

- Identity: Okta, Entra ID, Auth0, Ping (per client preference)
- Secrets: Vault, AWS Secrets Manager, GCP Secret Manager, Azure Key Vault
- Observability: OpenTelemetry traces, Prometheus metrics, structured JSON logs
- Vector storage: pgvector, Pinecone, Weaviate (per client preference)
- Model providers: Anthropic, OpenAI, Google, with abstraction layer enabling provider switching
- Orchestration: ThePlus-Tech proprietary orchestration layer with LangGraph compatibility
- Evaluation: Custom harness with statistical rigor; integration with MLflow or Weights & Biases per client preference

## Appendix C — Document Control

| Version | Date | Change | Author |
|---------|------|--------|--------|
| 1.0 | 2026-05-02 | Initial release | ThePlus-Tech |

This document is reviewed quarterly and on every material change to ThePlus-Tech's standard practice.

---

**ThePlus-Tech**
Building Intelligent, Secure, and Creative Technology for a Complex World
London, UK | www.theplus.tech
