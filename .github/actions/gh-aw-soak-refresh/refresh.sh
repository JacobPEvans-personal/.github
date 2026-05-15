#!/usr/bin/env bash
# Refresh gh-aw action SHA pins with a 24h supply-chain soak.
#
# 1. Snapshot HEAD's lock file (the "before" state).
# 2. Force-refresh all pins to current upstream SHAs.
# 3. For each entry whose SHA changed AND the new SHA's commit is <24h
#    old, rewind that entry's SHA to its predecessor in the lock file.
#    The `version` field is left unchanged; the lock file stays consistent.
# 4. Re-emit .lock.yml files via a no-flag `gh aw compile`.
#
# First-time pins (no predecessor in HEAD's lock file) skip the rewind
# and adopt the fresh SHA -- recurring refreshes never encounter this.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LOCK=.github/aw/actions-lock.json
BEFORE=$(mktemp)
trap 'rm -f "$BEFORE"' EXIT

git show "HEAD:$LOCK" >"$BEFORE" 2>/dev/null || echo '{"entries":{}}' >"$BEFORE"

# Wipe the SHA-keyed import cache so old folders don't accumulate alongside
# new ones on every refresh. `gh aw compile` regenerates the cache (including
# .gitattributes) from current import refs in the workflow .md files; the
# resulting create-pull-request commit then contains the deletes and the
# adds in one atomic diff.
rm -rf .github/aw/imports

gh aw compile --force-refresh-action-pins

NOW=$(date -u +%s)

# Capture jq output up front so a jq failure aborts via `set -e`. A while-read
# fed by `< <(jq ...)` would silently swallow jq's exit status and let the run
# continue with no rewinds applied.
CHANGED=$(jq -r --slurpfile b "$BEFORE" -f "$SCRIPT_DIR/diff-changed-pins.jq" "$LOCK")

# Skip the loop entirely when no entries changed. `<<<` always feeds a single
# trailing newline, so an empty CHANGED would otherwise drive one iteration
# with all fields empty -- the prior version of this script wrote a bogus
# `"":{"sha":""}` entry into the lock file in exactly that case.
if [ -n "$CHANGED" ]; then
  while IFS='|' read -r key repo new_sha old_sha; do
    # Fail closed: if the commit-date lookup fails (rate limit, transient network,
    # SHA not yet visible), treat the entry as "too new" and rewind to the
    # predecessor. Adopting an unverified fresh SHA would break the soak guarantee.
    if d=$(gh api "repos/$repo/commits/$new_sha" --jq .commit.committer.date 2>/dev/null); then
      age_h=$(((NOW - $(date -d "$d" +%s)) / 3600))
    else
      echo "warn: commit-date lookup failed for $repo@$new_sha; failing closed (rewind)"
      age_h=0
    fi
    if [ "$age_h" -lt 24 ]; then
      tmp=$(mktemp)
      jq --arg k "$key" --arg s "$old_sha" '.entries[$k].sha = $s' "$LOCK" >"$tmp"
      mv "$tmp" "$LOCK"
      echo "rewound: $key  $new_sha -> $old_sha  (commit was ${age_h}h old)"
    fi
  done <<< "$CHANGED"
fi

gh aw compile
