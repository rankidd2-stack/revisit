# Revisit status

Updated 2026-11-01. Generated from STATUS.json by `npm run status`; don't edit by hand.

**Tests:** 242 passing, 0 failing · **Current phase:** 1. Foundation · **Open review findings:** 41

## Needs Patrick

1. **The next two demo screens ("type a goal, get a campaign" and "photo or spreadsheet to patient list") need AI. Real AI means a paid Anthropic API account (pay per use) and a small server. Use real AI now, or labelled sample drafts first?**  
   Recommended: Sample drafts first, clearly labelled, at no cost. The spreadsheet import works for real without AI. Get the API account once one clinic says yes. The demo link is private: share it from its Share menu if anyone else should open it
2. **Create a Semaphore account and share an API key**  
   Recommended: Prepaid credits only; no real sends until the pilot clinic approves
3. **Book 3 dental or vet clinic meetings for the prototype demo**  
   Recommended: Target the week after the prototype ships
4. **Register the business (DTI) and send one email to DTI Pampanga on free events and announcements**  
   Recommended: Claude drafts the email
5. **Legal check: dental testimonials, texting a family number about a dependent (DPA s.13), keeping an opt-out after an erasure request, showing a clinic name that names a treatment ("Smile Implant Center") in texts, and whether the frozen sensitive word list is enough (names like Lasik or Thyroid still pass)**  
   Recommended: One consult covers all five. Until then: testimonials off for dental, texts about dependents name nothing (not even cleaning or check-up, nor a clinic name that names a treatment), erased opt-outs are kept, a treatment-naming clinic name goes out only after the clinic confirms it and only in texts about the patient or their pet, and the word list stays frozen
6. **Brand name**  
   Recommended: Revisit is a placeholder. Pick a global, non-Filipino brand before the first clinic demo; Claude can shortlist names with free .com domains

## Phases

| Phase | State | Milestones done |
| --- | --- | --- |
| 0. Plan and setup | Done | 3 of 3 |
| 1. Foundation | In progress | 7 of 11 |
| 2. AI console prototype (sales demo) | In progress | 1 of 4 |
| 3. Sending live | To do | 0 of 4 |
| 4. Paid pilot | To do | 0 of 4 |
| 5. Growth | To do | 0 of 4 |

## 1. Foundation

- **Done:** Database schema: contacts, assets, consent ledger, mute list, campaign log
- **Done:** Send gate: consent, mute, caps, dedupe, quiet hours, sync pause
- **Done:** Recall engine: due dates, 4-step sequence, stop on booking
- **Done:** CSV import: PH numbers and dates, muted numbers never re-added
- **Done:** Semaphore SMS client and SMS cost counter
- **Done:** Database wiring 1: load send-gate inputs from Postgres (clinic, contact, consent, mutes, sends, sync health, approvals)
- **Done:** Sync apply: imported rows to database, sync run log, Sheet CSV fetch (injected fetcher)
- **To do:** Database wiring 2: subject derived from assets.kind of the event's asset, recall loader skips inactive assets
- **To do:** Real Google Sheet fetcher: https-only, redirect allowlist docs.google.com and *.googleusercontent.com, timeout, streamed byte cap, content-type check
- **To do:** Scheduled sync runner, optional realtime, stale unfinished runs treated as failed, clinic alert, advisory lock
- **To do:** Philippines market pack split

## Open review findings

| ID | Agent | Severity | Finding | Status |
| --- | --- | --- | --- | --- |
| C11 | compliance-guard | not built yet | Data processing agreement template for clinics | open |
| C12 | compliance-guard | not built yet | Same-link review flow | open |
| R23 | reviewer | nit | Two pets due the same day: second pet goes next day (merge later) | deferred |
| G3 | compliance-guard | risk | Household grouping: dependents never named (done); clinic confirms households at import (console) | open |
| R32 | reviewer | should-fix | cleanName fell back to the raw name |  which could keep a note |
| R33 | reviewer | nit | Round 2 suggestion 6 (contact uniqueness) was mistaken: unique mobile and email indexes already exist | deferred |
| G10 | pm | risk | Real Sheet fetcher not built: https-only, redirect allowlist, timeout, byte cap, content-type check | deferred |
| G11 | pm | risk | Scheduled runner, stale unfinished runs as failed, clinic alert, advisory lock not built | deferred |
| R76 | reviewer | nit | No migration runner yet; when built it must record each applied file, not only the highest number (002 merges after 003) | deferred |
| R77 | reviewer | nit | An email-only row matched to a contact whose mobile is muted still adds visits; the send gate blocks the send | deferred |
| R78 | reviewer | nit | A row matched by email to a contact with no mobile does not fill the mobile in | deferred |
| R80 | reviewer | nit | 3 to 5 queries per row in one transaction; batch lookups in the runner milestone | deferred |
| G23 | compliance-guard | risk | SyncOutcome.result carries patient rows; the scheduled runner must log counts only | deferred |
| G24 | compliance-guard | nit | A sync with a very high rejection rate still counts as ok; flag it to the clinic in the runner milestone | deferred |
| G25 | compliance-guard | nit | Visits can attach to a deactivated pet; recall eligibility must keep checking assets.active | deferred |
| R35 | reviewer | nit | A scheduled campaign stays approved long after its time if the scheduler was down | deferred |
| R36 | reviewer | should-fix | Caps and same-day rules are not enforced under concurrent senders; lock the contact and re-check at send time. Required before the send pipeline milestone passes | deferred |
| R37 | reviewer | nit | A stop that only writes a mute does not follow the person to a new number; also append a linked opt-out | deferred |
| R38 | reviewer | nit | Loader results don't carry their clinic id, so a caller could mix clinics | deferred |
| R39 | reviewer | nit | Database wiring tests share one changing database and depend on order | deferred |
| G26 | compliance-guard | risk | Keeping an erased person's opt-out needs a line in the privacy notice, DPA template and erasure reply, plus a retention period | open |
| G28 | compliance-guard | risk | Imports must never write consent rows, or a re-import could undo a stop | open |
| R61 | reviewer | nit | A plain space inside a clinic word ("pre natal") is not caught; accepted limit, pinned by a test | deferred |
| G16 | compliance-guard | note | Subject is supplied by the caller; derive it from assets.kind of the event's asset in the loader (Wiring 2) | open |
| G19 | compliance-guard | note | "aids" now whole-word only; "hearing aids" still blocks (no word rule can tell them apart), accepted as fail-closed | deferred |
| G22 | compliance-guard | note | "check" and "clean" are wider than Patrick's three words; logged as Claude's reading, small impact | deferred |
| G32 | compliance-guard | risk | Clinic name confirmation is free text with no link to a staff account; a confirmation set on insert now clears. Staff account link waits for the console login | deferred |
| G33 | compliance-guard | risk | Subject (who the text is about) still comes from the caller (G16) and the recall loader must skip inactive assets (G25); both required in Database wiring 2 before any real send | open |
| R96 | reviewer | nit | Words not on the frozen default list pass in names (Lasik, Thyroid, Stroke, Asthma); known limit of the safety net, for the legal consult | deferred |
| G35 | compliance-guard | nit | Confirmation does not store which name was confirmed; rename trigger is the safeguard (part of G32) | deferred |
| R203 | reviewer | should-fix | Steps sent are keyed by a due date derived from the current interval; editing an interval can resend a step. Key by cycle (last visit) in the send pipeline milestone | deferred |
| G204 | compliance-guard | note | {pet_name} also names a child; consider a neutral placeholder name later | deferred |
| G206 | compliance-guard | note | Confirm with Semaphore that Smart accepts our branded stop-link domain before going live | deferred |
| G207 | compliance-guard | note | Decide before live sends whether an approved automation needs the daily Approve click; the console must match | deferred |
| R211 | reviewer | nit | At 9 PM the queue shows today's recall step; the deferred day may need a different step. Re-decide at the send step | deferred |
| R212 | reviewer | nit | Per-mobile daily cap does not see past sends of another contact record with the same mobile; send pipeline milestone with R203 | deferred |
| R213 | reviewer | nit | 0900 prefix believed unassigned, not verified against the NTC numbering plan | deferred |
| R214 | reviewer | nit | Two pets at 9 PM, and a deferred re-check that passes, not tested | deferred |
| G208 | compliance-guard | note | Confirm 0900 is unassigned (NTC numbering plan) before any public demo link | deferred |
| G209 | compliance-guard | note | With real data the money card must say "recall or marketing text" | deferred |
| G210 | compliance-guard | note | For live clinics consider "Bookings after a text" instead of "Bookings recovered" (implies causation) | deferred |
