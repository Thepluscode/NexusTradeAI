#!/usr/bin/env python3
"""
NexusTradeAI PostToolUse Red Team Checker
Detects weakened trading safety limits, direct deploy/ edits, and silent error swallowing.
"""
import json
import re
import sys

SAFETY_CONSTANTS = {
    'MAX_TRADES_PER_DAY': {'min': 10, 'direction': 'decrease_bad'},
    'MAX_TRADES_PER_SYMBOL': {'min': 2, 'direction': 'decrease_bad'},
    'COOLDOWN_MS': {'min': 600000, 'direction': 'decrease_bad'},
    'STOP_LOSS_COOLDOWN_MS': {'min': 1800000, 'direction': 'decrease_bad'},
    'RISK_PER_TRADE': {'max': 0.005, 'direction': 'increase_bad'},
    'MAX_POSITION_SIZE': {'max': 5000, 'direction': 'increase_bad'},
    'MAX_DAILY_LOSS': {'max': 100, 'direction': 'increase_bad'},
    'MAX_DRAWDOWN_PCT': {'max': 10, 'direction': 'increase_bad'},
    'MAX_OPEN_POSITIONS': {'max': 15, 'direction': 'increase_bad'},
}

DEPLOY_DIR_PATTERN = re.compile(r'/deploy/(stock-bot|forex-bot|crypto-bot)/')
EMPTY_CATCH_PATTERN = re.compile(r'\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)')
EMPTY_CATCH_PATTERN2 = re.compile(r'catch\s*\(\s*\w*\s*\)\s*\{\s*\}')


def check_deploy_dir_edit(file_path):
    if DEPLOY_DIR_PATTERN.search(file_path):
        if '/infrastructure/' in file_path:
            return None
        return (
            "DEPLOY DIR EDIT DETECTED: You are editing a file in deploy/ directly. "
            "Deploy dirs contain thin loaders -- edit the source in clients/bot-dashboard/ instead. "
            f"File: {file_path}"
        )
    return None


def check_safety_weakening(content):
    if not content:
        return None
    warnings = []
    for const_name, limits in SAFETY_CONSTANTS.items():
        pattern = re.compile(
            rf'(?:let|const|var)?\s*{re.escape(const_name)}\s*=\s*([0-9.]+)',
            re.IGNORECASE
        )
        for match in pattern.findall(content):
            try:
                value = float(match)
            except ValueError:
                continue
            if limits.get('direction') == 'decrease_bad' and 'min' in limits:
                if value < limits['min']:
                    warnings.append(f"{const_name} set to {value}, below safe minimum {limits['min']}")
            elif limits.get('direction') == 'increase_bad' and 'max' in limits:
                if value > limits['max']:
                    warnings.append(f"{const_name} set to {value}, above safe maximum {limits['max']}")
    if warnings:
        return (
            "TRADING SAFETY WEAKENED:\n" +
            "\n".join(f"  - {w}" for w in warnings) +
            "\nThese limits protect against the SMX incident. Review carefully."
        )
    return None


def check_silent_errors(content):
    if not content:
        return None
    matches = []
    if EMPTY_CATCH_PATTERN.search(content):
        matches.append(".catch(() => {}) -- empty arrow catch")
    if EMPTY_CATCH_PATTERN2.search(content):
        matches.append("catch(e) {} -- empty catch block")
    if matches:
        return (
            "SILENT ERROR HANDLER DETECTED:\n" +
            "\n".join(f"  - {m}" for m in matches) +
            "\nRule 8: No silent failures. Every error must emit observable evidence."
        )
    return None


def main():
    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    tool_name = input_data.get('tool_name', '')
    if tool_name not in ('Edit', 'Write', 'MultiEdit'):
        sys.exit(0)

    tool_input = input_data.get('tool_input', {})
    file_path = tool_input.get('file_path', '')

    content = ''
    if tool_name == 'Write':
        content = tool_input.get('content', '')
    elif tool_name == 'Edit':
        content = tool_input.get('new_string', '')
    elif tool_name == 'MultiEdit':
        edits = tool_input.get('edits', [])
        content = ' '.join(e.get('new_string', '') for e in edits)

    alerts = []
    deploy_warning = check_deploy_dir_edit(file_path)
    if deploy_warning:
        alerts.append(deploy_warning)
    safety_warning = check_safety_weakening(content)
    if safety_warning:
        alerts.append(safety_warning)
    error_warning = check_silent_errors(content)
    if error_warning:
        alerts.append(error_warning)

    if alerts:
        message = "RED TEAM ALERT\n" + "\n\n".join(alerts)
        print(json.dumps({"systemMessage": message}))

    sys.exit(0)


if __name__ == '__main__':
    main()
