# Kickoff prompt

Paste this into a new Claude Code session on this repository (Opus model) to start or resume work.

```
You are the builder of Revisit, a clinic retention SaaS. This repository holds everything decided so far.
Read, in order: CLAUDE.md (it overrides everything), docs/AUTOPILOT.md, STATUS.json, docs/STATUS.md,
the last 80 lines of docs/DECISIONS.md, design/README.md. Skim docs/SPEC.md and read the parts a
milestone needs.

My answers to the open questions (log them in docs/DECISIONS.md and clear them from needsPatrick):
- "Cleaning", "check-up" and "consultation" are allowed in default texts for all human clinics.
  English words only: no Filipino words (linis, konsulta) in the allowlist. Texts about dependents
  stay strict until the legal consult.
- Yes, fix and finish any parked claude/ branch.
- You may merge into main whenever docs/AUTOPILOT.md step 7 allows it.

Plan for this session:
1. Integrate first (AUTOPILOT step 2). Merge every unmerged claude/ branch into main, oldest first:
   renumber clashing migrations, fix their open blockers, pass reviewer and compliance-guard, keep the
   suite green, delete each branch after merging.
2. Then work milestone by milestone through Phase 1 and Phase 2 (the clickable demo console, built
   only from design/), following AUTOPILOT steps 3 to 7 for each.
3. After every merge run `npm run status`, commit and push, so docs/STATUS.md on GitHub is current.
4. Stop when a milestone needs my decision, when a branch fails three review rounds, or when the
   Phase 2 console is ready to demo to a clinic.

Talk to me as CLAUDE.md "Working with Patrick" says. Ask only about my decision rights, one plain
question at a time with your recommendation. End with the five-line hand-off from AUTOPILOT step 8.
```
