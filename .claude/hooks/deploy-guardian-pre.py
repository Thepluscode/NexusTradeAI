#!/usr/bin/env python3
"""
NexusTradeAI PreToolUse Deploy Guardian
Intercepts git push to verify tests were run and show deploy summary.
"""
import json
import os
import re
import subprocess
import sys

STATE_DIR = '/tmp/nexus-deploy-guardian'
TESTS_RAN_MARKER = 'signal-tests-passed'


def get_session_state_file(session_id):
    os.makedirs(STATE_DIR, exist_ok=True)
    safe_id = re.sub(r'[^a-zA-Z0-9_-]', '_', session_id or 'default')
    return os.path.join(STATE_DIR, f'{safe_id}.json')


def load_session_state(session_id):
    state_file = get_session_state_file(session_id)
    if os.path.exists(state_file):
        try:
            with open(state_file, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {}


def save_session_state(session_id, state):
    state_file = get_session_state_file(session_id)
    try:
        with open(state_file, 'w') as f:
            json.dump(state, f)
    except IOError:
        pass


def is_git_push(command):
    return bool(re.match(r'^\s*git\s+push\b', command))


def is_test_command(command):
    return bool(re.search(r'npx\s+jest', command) or re.search(r'npm\s+test', command))


def get_deploy_summary(cwd):
    lines = []
    try:
        branch = subprocess.check_output(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            cwd=cwd, stderr=subprocess.DEVNULL, timeout=5
        ).decode().strip()
        lines.append(f"Branch: {branch}")

        try:
            commits = subprocess.check_output(
                ['git', 'log', '--oneline', f'origin/{branch}..HEAD'],
                cwd=cwd, stderr=subprocess.DEVNULL, timeout=5
            ).decode().strip()
            if commits:
                commit_lines = commits.split('\n')
                lines.append(f"Unpushed commits ({len(commit_lines)}):")
                for cl in commit_lines[:10]:
                    lines.append(f"  {cl}")
            else:
                lines.append("No unpushed commits")
        except subprocess.CalledProcessError:
            lines.append("(Could not determine unpushed commits)")

        try:
            changed = subprocess.check_output(
                ['git', 'diff', '--name-only', f'origin/{branch}..HEAD'],
                cwd=cwd, stderr=subprocess.DEVNULL, timeout=5
            ).decode().strip()
            if changed:
                files = changed.split('\n')
                bot_files = [f for f in files if 'unified-' in f and f.endswith('.js')]
                signal_files = [f for f in files if 'services/signals/' in f]
                if bot_files:
                    lines.append(f"Bot files: {', '.join(bot_files)}")
                if signal_files:
                    lines.append(f"Signal modules: {len(signal_files)} files")
        except subprocess.CalledProcessError:
            pass
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        lines.append("(Could not generate deploy summary)")

    return '\n'.join(lines)


def main():
    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        sys.exit(0)

    tool_name = input_data.get('tool_name', '')
    if tool_name != 'Bash':
        sys.exit(0)

    tool_input = input_data.get('tool_input', {})
    command = tool_input.get('command', '')
    session_id = input_data.get('session_id', 'default')
    cwd = input_data.get('cwd', os.getcwd())

    # Track test runs
    if is_test_command(command):
        state = load_session_state(session_id)
        state[TESTS_RAN_MARKER] = True
        save_session_state(session_id, state)
        sys.exit(0)

    if not is_git_push(command):
        sys.exit(0)

    state = load_session_state(session_id)
    tests_ran = state.get(TESTS_RAN_MARKER, False)
    summary = get_deploy_summary(cwd)

    messages = ["DEPLOY GUARDIAN -- git push intercepted", "", summary, ""]

    if not tests_ran:
        messages.append("Signal tests have NOT been run this session.")
        messages.append("Run: cd services/signals && npx jest")
        messages.append("Blocking push until tests pass.")
        print(json.dumps({"decision": "block", "reason": '\n'.join(messages)}), file=sys.stderr)
        sys.exit(2)
    else:
        messages.append("Signal tests passed this session.")
        print(json.dumps({"systemMessage": '\n'.join(messages)}))
        sys.exit(0)


if __name__ == '__main__':
    main()
