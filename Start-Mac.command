#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  python3 serve.py
else
  echo "Python 3 is required. Install it from https://www.python.org/downloads/"
  read -r answer
fi
