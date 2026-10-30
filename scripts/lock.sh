#!/usr/bin/env bash
# Builder lock: only one builder (a scheduled run or a live session) works on this repo at a time.
# The lock is the tip commit of origin/claude/autopilot-lock: a "lock: ..." tip means held,
# an "unlock: ..." tip means free. Taking it pushes a child commit; if two builders race,
# git refuses the second push (non-fast-forward), so only one can win.
# A held lock not refreshed for STALE_HOURS counts as abandoned and may be taken over.
#
# Usage: scripts/lock.sh <status|take|check|refresh|release> <builder-id>
#   builder-id: unique per builder, e.g. scheduled-20261031T0144Z or live-20261031T0440Z
# Exit codes: 0 ok, 3 busy (another builder holds it), 4 lost (this builder no longer holds it).
set -euo pipefail
BR=claude/autopilot-lock
STALE_HOURS=6
cmd=${1:-status}
who=${2:-}
if [ "$cmd" != status ] && [ -z "$who" ]; then echo "usage: scripts/lock.sh $cmd <builder-id>"; exit 2; fi
EMPTY_TREE=$(git hash-object -t tree /dev/null)
now=$(date -u +%Y-%m-%dT%H:%MZ)

git fetch -q origin "+refs/heads/$BR:refs/remotes/origin/$BR" 2>/dev/null || true
tip=$(git rev-parse -q --verify "refs/remotes/origin/$BR" || true)
msg=""
age=999999
if [ -n "$tip" ]; then
  msg=$(git log -1 --format=%s "$tip")
  age=$(( ( $(date +%s) - $(git log -1 --format=%ct "$tip") ) / 3600 ))
fi

held() { [[ "$msg" == lock:* ]] && [ "$age" -lt "$STALE_HOURS" ]; }
mine() { [[ "$msg" == "lock: $who "* ]]; }
push() {
  local c
  if [ -n "$tip" ]; then c=$(git commit-tree "$EMPTY_TREE" -p "$tip" -m "$1"); else c=$(git commit-tree "$EMPTY_TREE" -m "$1"); fi
  git push -q origin "$c:refs/heads/$BR" 2>/dev/null
}

case "$cmd" in
  status)
    if held; then echo "HELD: $msg (${age}h since last refresh)"; else echo "FREE: ${msg:-no lock yet}"; fi ;;
  take)
    if mine && held; then echo "ALREADY MINE"; exit 0; fi
    if held; then echo "BUSY: $msg (${age}h since last refresh)"; exit 3; fi
    stale=""; if [[ "$msg" == lock:* ]]; then stale=" (took over a stale lock: $msg)"; fi
    if push "lock: $who since $now"; then echo "TAKEN by $who$stale"; else echo "BUSY: another builder took it first"; exit 3; fi ;;
  check)
    if mine; then echo "MINE"; else echo "LOST: lock is now '$msg'"; exit 4; fi ;;
  refresh)
    if ! mine; then echo "LOST: lock is now '$msg'"; exit 4; fi
    if push "lock: $who refreshed $now"; then echo "REFRESHED"; else echo "LOST: refresh refused"; exit 4; fi ;;
  release)
    if ! mine; then echo "NOT MINE: $msg"; exit 4; fi
    if push "unlock: free since $now (released by $who)"; then echo "RELEASED"; else echo "LOST: release refused"; exit 4; fi ;;
  *) echo "unknown command: $cmd"; exit 2 ;;
esac
