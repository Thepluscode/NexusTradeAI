# ADR-NNNN: <short title in sentence case>

- **Status:** Proposed | Accepted | Deprecated | Superseded by ADR-NNNN
- **Date:** YYYY-MM-DD (when accepted)
- **Owner:** <operator or service name>
- **Related:** ADR-NNNN, ADR-NNNN
- **Tags:** <comma-separated, e.g. auth, deploy, persistence>

## Context

What problem is this addressing? What constraints (technical, operational, organisational) bound the solution space? Cite concrete signals: error symptoms, file paths, commit SHAs, dashboard incidents. **One reader, no prior context** should be able to understand why this came up.

## Decision

The decision itself, stated as a single sentence if possible, then expanded with the specifics that would let a future engineer re-implement the same shape:

- What is chosen
- What is rejected (alternatives and why)
- What concrete code/config makes this real (file paths, env vars, endpoint names)

## Consequences

Both directions. What this enables, what it costs, what it locks in:

- **Positive:** ...
- **Negative / cost:** ...
- **Risk if violated:** ...
- **What this forecloses:** ...

## Implementation pointers

Files and commits where this decision lives in the codebase. Relative paths only.

- `path/to/file.js:LINE`
- Commit `abc1234`: "fix: ..."

## Open questions

Things this ADR explicitly does not resolve, and should be picked up by a follow-up ADR.
