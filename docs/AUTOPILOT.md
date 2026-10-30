# Autopilot run playbook

Every run (scheduled or started by Patrick) begins with no memory of earlier runs. This file, CLAUDE.md,
STATUS.json, docs/DECISIONS.md, docs/SPEC.md and design/README.md are the memory. Follow the steps in order.

## 0. Take the builder lock (never skip)
Only one builder works on this repo at a time; scheduled runs and live sessions share one lock, so nobody
has to pause anything. Pick a builder id once and reuse it all run: `scheduled-<UTC yyyymmddThhmmZ>` for a
scheduled run, `live-<UTC yyyymmddThhmmZ>` for a session Patrick started.
- `scripts/lock.sh take <id>`. Exit 3 (BUSY) means another builder is working: end the run at once with
  the hand-off "Skipped: <the BUSY line>". Change nothing, push nothing.
- While working: `scripts/lock.sh refresh <id>` about every 90 minutes and before every push to main.
  Exit 4 (LOST) means another builder took over a lock you let go stale: stop, push your branch only,
  and end with the hand-off "Stopped: lost the lock".
- At the very end, after the hand-off is written (also when ending early or on failure):
  `scripts/lock.sh release <id>`.

## 1. Load context
- Read CLAUDE.md, STATUS.json, the last 80 lines of docs/DECISIONS.md, and the rows of status/findings.csv
  whose status is not `fixed`. Read docs/SPEC.md and design/README.md when the milestone needs them.
- `git fetch origin`, then `npm ci`, `npm test` and `npm run typecheck` on main. If main is red, fixing it
  is this run's only job.

## 2. Integrate before building (never skip)
- List remote branches not merged into main: `git branch -r --no-merged origin/main`.
- Every `claude/` branch in that list, except `claude/autopilot-lock`, is unfinished work from an earlier run. Finish it before starting
  anything new, oldest first:
  1. Merge it onto current main and resolve conflicts. Generated files (status/*.csv, docs/STATUS.md) are
     never hand-merged: take either side, then run `npm run status`. Two migrations with the same number:
     renumber the later one and keep both.
  2. Fix every open blocker recorded for it in status/findings.csv.
  3. Review and merge it per steps 5 to 7.
- A branch parked only for a Patrick decision (a matching `needsPatrick` entry) is skipped, not merged.
- Don't delete merged branches (this environment refuses deletes); `--no-merged` already skips them.

## 3. Pick one milestone
- The first milestone in STATUS.json with state `in_progress`, else `todo`, in `currentPhase`, else the next phase.
- Skip a milestone blocked by a `needsPatrick` item; say which item blocks it.
- If it is bigger than one run, split it in STATUS.json into smaller milestones and do the first.

## 4. Build
- Branch `claude/<short-milestone-slug>` from main.
- Domain logic stays pure in src/domain with Vitest tests. Every rule gets a test. When all new tests pass on
  the first try, break the code on purpose to prove they can fail.
- Any UI uses only design/tokens.css and follows design/README.md.
- Migrations: next free number in db/migrations; never edit a migration already on main.

## 5. Independent checks
- Run the `reviewer` agent on the diff, then the `compliance-guard` agent.
- Fix every blocker or fail and re-run that agent. Up to 3 rounds per branch per run.
- Still failing after 3 rounds: push the branch, mark the milestone `parked` with the open finding IDs, and
  end the run. The next run picks it up in step 2.
- Add each finding to status/findings.csv (fixed / open / deferred). Disagreeing with an agent is allowed:
  log the reason in docs/DECISIONS.md.

## 6. Update the record
- Run the `pm` agent: STATUS.json states, test count, needsPatrick, DECISIONS entries.
- Run `npm run status` to regenerate docs/STATUS.md and status/*.csv.

## 7. Merge into main
Patrick has authorized runs to push to main. Merge when ALL are true:
- tests and typecheck green on the merged result, reviewer and compliance-guard both pass;
- the change does not touch Patrick's decision rights: money or pricing, legal or compliance posture, sending
  to real patients, deleting data, or reversing a locked decision.

Then: `scripts/lock.sh refresh <id>`, and
`git checkout main && git pull && git merge --no-ff <branch> && npm test && git push origin main`.
If the push is refused, say so in the hand-off and leave the branch.

Otherwise push the branch, open a pull request, and add a `needsPatrick` entry that names the exact question
in plain words with a recommended answer.

## Hard rules
- Never send a real SMS or email. No real API keys in the repo; secrets live in environment variables.
- Never force-push main or rewrite history.
- Never sign up for paid services or spend money.
- No em dashes in any copy. Product name is "Revisit" (placeholder); no Filipino words in branding.
- Commit messages end with the attribution lines the session provides.

## 8. Hand-off and release
End every run with five lines, also used as the merge commit body or PR description:
1. What was integrated and which milestone was worked on, with the result (merged / parked / blocked)
2. Tests: passing count
3. Agent verdicts
4. Decisions logged
5. What Patrick needs to do, in plain words (or "nothing")

Then `scripts/lock.sh release <id>`.
