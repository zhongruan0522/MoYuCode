#!/usr/bin/env bash
set -euo pipefail

export HOME=/home/app

mkdir -p /workspace /home/app/.myyucode /home/app/.codex /home/app/.claude
chown -R app:app /workspace /home/app

cd /app
exec gosu app dotnet MoYuCode.dll

