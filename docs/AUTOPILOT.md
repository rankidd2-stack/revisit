# Autopilot run playbook

Every scheduled run starts fresh with no memory of earlier runs. This file, CLAUDE.md, STATUS.json
and docs/DECISIONS.md are the memory. Follow these steps in order.

## 1. Load context
- Read CLAUDE.md, STATUS.json, the last 60 lines of docs/DECISIONS.md, and the `open` rows of status/findings.csv.
- `npm ci`, then `npm test` and `npm run typecheck`. If main is red, fixing it is this run's only job.

## 2. Finish before starting
- If a `claude/` branch from an earlier run is unmerged, finish it (fix review findings, get it merged
  or parked) before starting anything new.

## 3. Pick one milestone
- Take the first milestone in STATUS.json with state `in_progress`, else `todo`, in `currentPhase`,
  else the next phase.
- Skip a milestone blocked by an item in `needsPatrick`; say which item blocks it.
- One run = one milestone. If it is bigger than one run, split it in STATUS.json into smaller
  milestones and do the first.

## 4. Build
- Branch `claude/<short-milestone-slug>` from main.
- Domain logic stays pure in src/domain with Vitest tests. Every rule gets a test.
- `npm test` and `npm run typecheck` must be green before review.

## 5. Independent checks (never skip)
- Run the `reviewer` agent on the diff, then the `compliance-guard` agent.
- Fix every blocker or fail, then re-run that agent. At most 3 rounds; if still failing, park (step 7).
- Add each finding to status/findings.csv (fixed / open / deferred).
- Disagreeing with an agent is allowed: log the reason in docs/DECISIONS.md.

## 6. Update the record
- Run the `pm` agent: STATUS.json states, tests count, needsPatrick, DECISIONS entries.
- Regenerate status/milestones.csv, status/needs_patrick.csv and status/tests.csv from STATUS.json.

## 7. Merge or park
Merge into main (fast-forward or merge commit, never force) only when ALL are true:
- tests and typecheck green, reviewer and compliance-guard both pass;
- the change does not touch Patrick's decision rights: money or pricing, legal or compliance
  posture, sending to real patients, deleting data, or reversing a locked decision.

Otherwise push the branch, open a pull request, and add a `needsPatrick` entry that names the
exact question in plain words, with a recommended answer.

## Hard rules
- Never send a real SMS or email. No real API keys in the repo; secrets live in environment variables.
- Never force-push main or rewrite history.
- Never sign up for paid services or spend money.
- No em dashes in user-facing copy. Product name is "Revisit" (placeholder); no Filipino words in branding.
- Commit messages end with the attribution lines the session provides.

## 8. Hand-off
End the run with a five-line summary, also as the PR description or merge commit body:
1. Milestone worked on and result (merged / parked / blocked)
2. Tests: passing count
3. Agent verdicts
4. Decisions logged
5. What Patrick needs to do, if anything (or "nothing")
