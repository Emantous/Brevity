#!/usr/bin/env bash

set -euo pipefail

RTK_TAG="${RTK_TAG:-dev-1.3.0-rc.642}"
RTK_ASSET="${RTK_ASSET:-rtk-x86_64-unknown-linux-musl.tar.gz}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

download_url="https://github.com/rtk-ai/rtk/releases/download/${RTK_TAG}"
curl -fsSL "${download_url}/${RTK_ASSET}" -o "${TMP_DIR}/${RTK_ASSET}"
curl -fsSL "${download_url}/checksums.txt" -o "${TMP_DIR}/checksums.txt"

python3 - "${TMP_DIR}" "$RTK_ASSET" <<'PY'
import hashlib
import sys
from pathlib import Path

tmp = Path(sys.argv[1])
asset = sys.argv[2]
archive = tmp / asset
expected = None

for line in (tmp / "checksums.txt").read_text().splitlines():
    parts = line.split()
    if len(parts) == 2 and parts[1].lstrip("*") == asset:
        expected = parts[0].lower()
        break

if expected is None:
    raise SystemExit(f"Checksum entry missing for {asset}")

actual = hashlib.sha256(archive.read_bytes()).hexdigest()
if actual != expected:
    raise SystemExit(f"Checksum mismatch: expected {expected}, got {actual}")
PY

tar -xzf "${TMP_DIR}/${RTK_ASSET}" -C "$TMP_DIR"

python3 - "${TMP_DIR}/rtk" <<'PY'
import json
import subprocess
import sys

rtk = sys.argv[1]


def run(payload):
    proc = subprocess.run(
        [rtk, "hook", "copilot"],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise SystemExit(
            f"RTK hook exited {proc.returncode}: {proc.stderr.strip()}"
        )
    return proc.stdout.strip()


cases = [
    (
        "VS Code git status rewrite",
        {"tool_name": "Bash", "tool_input": {"command": "git status"}},
        lambda out: '"updatedInput"' in out and '"rtk git status"' in out,
    ),
    (
        "VS Code git diff rewrite",
        {"tool_name": "Bash", "tool_input": {"command": "git diff HEAD"}},
        lambda out: '"updatedInput"' in out and '"rtk git diff HEAD"' in out,
    ),
    (
        "Copilot CLI git status rewrite",
        {
            "toolName": "bash",
            "toolArgs": json.dumps({"command": "git status"}),
        },
        lambda out: '"modifiedArgs"' in out and '"rtk git status"' in out,
    ),
    (
        "already rewritten pass-through",
        {
            "toolName": "bash",
            "toolArgs": json.dumps({"command": "rtk git status"}),
        },
        lambda out: out == "",
    ),
    (
        "heredoc pass-through",
        {
            "toolName": "bash",
            "toolArgs": json.dumps({"command": "cat <<EOF\\nhello\\nEOF"}),
        },
        lambda out: out == "",
    ),
    (
        "unknown command pass-through",
        {
            "toolName": "bash",
            "toolArgs": json.dumps({"command": "htop"}),
        },
        lambda out: out == "",
    ),
]

failed = []
for name, payload, assertion in cases:
    output = run(payload)
    if assertion(output):
        print(f"PASS: {name}")
    else:
        failed.append(name)
        print(f"FAIL: {name}\n  output: {output}")

if failed:
    raise SystemExit(f"{len(failed)} smoke-test case(s) failed")
PY
