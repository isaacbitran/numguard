#!/usr/bin/env bash
# Scripted terminal demo for recording a GIF (e.g. with vhs or asciinema).
# Shows a draft answer with a number no query produced getting flagged, then the fixed answer passing.
set -u
cd "$(dirname "$0")"
numguard() { node ../bin/numguard.js "$@"; }
DELAY="${DELAY:-0.03}"

type() { local s="$1"; for ((i = 0; i < ${#s}; i++)); do printf '%s' "${s:i:1}"; sleep "$DELAY"; done; printf '\n'; }
run() { printf '\033[1;32m$\033[0m '; type "$1"; eval "$1"; echo; sleep 1.2; }

clear
echo "# The agent ran two queries. Here is what they returned:"
run "cat query-result.csv"
run "cat sum.txt"
echo "# Its draft answer:"
run "cat answer-draft.txt"
echo "# Check every number against the session's tool outputs:"
run "numguard check answer-draft.txt --source query-result.csv --source sum.txt"
echo "# The agent recomputes from the table and fixes the answer:"
run "cat answer-fixed.txt"
run "numguard check answer-fixed.txt --source query-result.csv --source sum.txt"
