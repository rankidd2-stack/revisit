# Revisit status

Updated 2026-10-31. Generated from STATUS.json by `npm run status`; don't edit by hand.

**Tests:** 140 passing, 0 failing · **Current phase:** 1. Foundation · **Open review findings:** 15

## Needs Patrick

1. **Create a Semaphore account and share an API key**  
   Recommended: Prepaid credits only; no real sends until the pilot clinic approves
2. **Book 3 dental or vet clinic meetings for the prototype demo**  
   Recommended: Target the week after the prototype ships
3. **Register the business (DTI) and send one email to DTI Pampanga on free events and announcements**  
   Recommended: Claude drafts the email
4. **Legal check: dental testimonials, and texting a family number about a dependent (DPA s.13)**  
   Recommended: One consult covers both. Testimonials stay off for dental and texts never name treatments for dependents until then
5. **Brand name**  
   Recommended: Revisit is a placeholder. Pick a global, non-Filipino brand before the first clinic demo; Claude can shortlist names with free .com domains

## Phases

| Phase | State | Milestones done |
| --- | --- | --- |
| 0. Plan and setup | Done | 3 of 3 |
| 1. Foundation | In progress | 6 of 10 |
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
- **In progress:** Database wiring 1: load send-gate inputs from Postgres (clinic, contact, consent, mutes, sends, sync health, approvals)
- **Done:** Sync apply: imported rows to database, sync run log, Sheet CSV fetch (injected fetcher)
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
