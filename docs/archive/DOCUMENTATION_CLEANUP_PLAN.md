# NexusTradeAI - Documentation Cleanup Plan

## Current State: 92 MD files (40,605 lines) - TOO MANY!

## Recommendation: Keep 8-10 Essential Files

### ✅ KEEP (Essential)
| File | Lines | Purpose |
|------|-------|---------|
| README.md | - | Main entry point |
| COMMERCIAL_GRADE_ROADMAP.md | 1682 | Master roadmap |
| QUICK_START_GUIDE.md | 670 | Getting started |
| API_REFERENCE.md | 812 | API documentation |
| BROKER_SETUP_GUIDE.md | - | Broker connections |

### 🗄️ ARCHIVE (Move to /docs/archive/)
These are obsolete status updates, duplicates, or debugging notes:

**Status Updates (obsolete):**
- PHASE_1_WEEK_1_COMPLETE.md
- PHASE_1_WEEK_2_COMPLETE.md
- ALL_FIXED_DASHBOARD_WORKING.md
- ALL_ISSUES_FIXED.md
- ALL_SERVICES_CONNECTED.md
- DEPLOYMENT_COMPLETE.md
- IMPLEMENTATION_COMPLETE.md
- PROBLEM_SOLVED.md
- BOT_STATUS_AND_NEXT_STEPS.md
- CURRENT_STATUS.md
- SERVICES_RUNNING.md
- RUNNING_SERVICES.md
- SCANNER_FIXED_WORKING.md
- SCANNER_NOW_WORKING.md

**Debugging Notes (historical):**
- WHY_NO_TRADES_DIAGNOSIS.md
- WHY_NO_TRADES_YET.md
- NO_TRADES_ROOT_CAUSE.md
- ROOT_CAUSE_ANALYSIS.md
- LOSS_DIAGNOSIS.md
- STRATEGY_DIAGNOSIS.md
- COMPUTER_CRASH_FIX.md
- FIXES_APPLIED.md
- TRADING_ENGINE_FIX.md

**Duplicates/Overlapping:**
- QUICK_START.md (duplicate of QUICK_START_GUIDE.md)
- README_FULL_SYSTEM.md (duplicate of README.md)
- COMPLETE_SYSTEM_QUICK_START.md (duplicate)
- GETTING_STARTED_CHECKLIST.md (merge into QUICK_START)
- COMPLETE_IMPLEMENTATION_GUIDE.md (merge into ROADMAP)
- IMPLEMENTATION_SUMMARY.md (obsolete)
- IMPLEMENTATION_TRACKER.md (obsolete)
- BOT_FEATURES_COMPLETE.md (merge into README)
- TRADING_BOT_FEATURES.md (duplicate)
- TRADING_BOT_COMPREHENSIVE_FEATURES.md (duplicate)

**Outdated Roadmaps:**
- FUTURE_IMPLEMENTATION_ROADMAP.md (superseded)
- AI_IMPLEMENTATION_ROADMAP.md (superseded)
- OPUS_PROFITABILITY_SOLUTION.md (historical)

### 📁 Recommended Structure

```
/NexusTradeAI/
├── README.md                    (Main - 200 lines max)
├── QUICK_START.md               (Getting started)
├── COMMERCIAL_ROADMAP.md        (Master plan)
├── docs/
│   ├── API_REFERENCE.md
│   ├── BROKER_SETUP.md
│   ├── TRADING_GUIDE.md
│   ├── ARCHITECTURE.md
│   └── archive/                 (Move 70+ files here)
│       └── [all historical files]
```

## Commands to Execute

```bash
# Create archive directory
mkdir -p docs/archive

# Move obsolete status files
mv *_COMPLETE.md *_FIXED*.md *_WORKING.md docs/archive/

# Move debugging notes  
mv *DIAGNOSIS*.md *ROOT_CAUSE*.md *FIX*.md docs/archive/

# Move duplicates
mv README_FULL_SYSTEM.md COMPLETE_*.md docs/archive/
```
