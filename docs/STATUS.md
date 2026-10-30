# Revisit status

Updated 2026-10-30. Generated from STATUS.json by `npm run status`; don't edit by hand.

**Tests:** 180 passing, 0 failing · **Current phase:** 1. Foundation · **Open review findings:** 26

## Needs Patrick

1. **Create a Semaphore account and share an API key**  
   Recommended: Prepaid credits only; no real sends until the pilot clinic approves
2. **Book 3 dental or vet clinic meetings for the prototype demo**  
   Recommended: Target the week after the prototype ships
3. **Register the business (DTI) and send one email to DTI Pampanga on free events and announcements**  
   Recommended: Claude drafts the email
4. **Legal check: dental testimonials, texting a family number about a dependent (DPA s.13), and keeping an opt-out after an erasure request**  
   Recommended: One consult covers all three. Until then: testimonials off for dental, texts about dependents name nothing (not even cleaning or check-up), and erased opt-outs are kept
5. **Brand name**  
   Recommended: Revisit is a placeholder. Pick a global, non-Filipino brand before the first clinic demo; Claude can shortlist names with free .com domains

## Phases

| Phase | State | Milestones done |
| --- | --- | --- |
| 0. Plan and setup | Done | 3 of 3 |
| 1. Foundation | In progress | 5 of 9 |
| 2. AI console prototype (sales demo) | To do | 0 of 4 |
| 3. Sending live | To do | 0 of 4 |
| 4. Paid pilot | To do | 0 of 4 |
| 5. Growth | To do | 0 of 4 |

## 1. Foundation

- **Done:** Database schema: contacts, assets, consent ledger, mute list, campaign log
- **Done:** Send gate: consent, mute, caps, dedupe, quiet hours, sync pause
- **Done:** Recall engine: due dates, 4-step sequence, stop on booking
- **Done:** CSV import: PH numbers and dates, muted numbers never re-added
- **Done:** Semaphore SMS client and SMS cost counter
- **Parked:** Database wiring 1: load send-gate inputs from Postgres (clinic, contact, consent, mutes, sends, sync health, approvals)
- **To do:** Database wiring 2: write imports and sync runs to Postgres; muted never re-added, clinic-owned status kept
- **To do:** Google Sheet sync: scheduled pull into the import path; failed or stale sync pauses sends and alerts the clinic
- **To do:** Philippines market pack: +63 numbers, Asia/Manila, Semaphore and word lists behind one module

## Open review findings

| ID | Agent | Severity | Finding | Status |
| --- | --- | --- | --- | --- |
| C11 | compliance-guard | not built yet | Data processing agreement template for clinics | open |
| C12 | compliance-guard | not built yet | Same-link review flow | open |
| R23 | reviewer | nit | Two pets due the same day: second pet goes next day (merge later) | deferred |
| G3 | compliance-guard | risk | Household grouping: dependents never named (done); clinic confirms households at import (console) | open |
| R35 | reviewer | nit | A scheduled campaign stays approved long after its time if the scheduler was down | deferred |
| R36 | reviewer | should-fix | Caps and same-day rules are not enforced under concurrent senders; lock the contact and re-check at send time. Required before the send pipeline milestone passes | deferred |
| R37 | reviewer | nit | A stop that only writes a mute does not follow the person to a new number; also append a linked opt-out | deferred |
| R38 | reviewer | nit | Loader results don't carry their clinic id, so a caller could mix clinics | deferred |
| R39 | reviewer | nit | Database wiring tests share one changing database and depend on order | deferred |
| G9 | compliance-guard | risk | Keeping an erased person's opt-out needs a line in the privacy notice, DPA template and erasure reply, plus a retention period | open |
| G11 | compliance-guard | risk | Imports must never write consent rows, or a re-import could undo a stop | open |
| R60 | reviewer | nit | A doctor's name in a category blocked patients with the same first name; names are now masked before the check (the Dr/Dra skip was dropped, see R64) -- masking reopened: see R70 | open |
| R61 | reviewer | nit | A plain space inside a clinic word ("pre natal") is not caught; accepted limit, pinned by a test | deferred |
| G16 | compliance-guard | note | Subject is supplied by the caller; derive it from assets.kind of the event's asset in the loader (Wiring 2) | open |
| R66 | reviewer | should-fix | A clinic name containing a stem ("Psych Wellness Center") blocked every text; names are masked before the check -- masking reopened: see R70 | open |
| R67 | reviewer | nit | 4+ letter category words blocked patient names that start with them ("Step" vs Stephanie); names are masked -- masking reopened: see R70 | open |
| G19 | compliance-guard | note | "aids" now whole-word only; "hearing aids" still blocks (no word rule can tell them apart), accepted as fail-closed | deferred |
| R70 | reviewer | blocker | Masking name placeholders skips checking them; names typed with notes ("Ana Cruz (braces)", "Ana Cruz HIV") reach the lock screen. Introduced in round 5 fix a52a822 | open |
| R71 | reviewer | should-fix | {clinic_name} "Smile Implant Center" is masked, so "implant" goes out | open |
| R72 | reviewer | should-fix | checkContent treatmentText ?? body: an empty or other treatmentText turns the treatment check off for a direct caller | open |
| R73 | reviewer | should-fix | New stems over-block place and ordinary words: cardi (Cardinal Santos, cardio dance), tuli (Tuliahan), breast (breastfeeding), therap (therapist) | open |
| R74 | reviewer | nit | Comment says whole-word spares hearing aids; it does not | open |
| R75 | reviewer | nit | No tests for a name holding treatment text, a placeholder outside NAME_VARS, or an empty treatmentText | open |
| G20 | compliance-guard | risk | {clinic} filled by the caller is masked; "Manila HIV and Rehab Center" would go out. Fill {clinic} from the approved clinic record or check it against the default list | open |
| G21 | compliance-guard | risk | Masked pet or dependent labels ("Lola (dialysis)") are never checked | open |
| G22 | compliance-guard | note | "check" and "clean" are wider than Patrick's three words; logged as Claude's reading, small impact | deferred |
