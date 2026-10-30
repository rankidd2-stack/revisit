# Revisit product spec

Exported from the planning doc ("Clinic Retention Engine (PH)", Oct 28 to 30, 2026) so the repo is self-contained.
Precedence: CLAUDE.md (locked decisions) and docs/DECISIONS.md win over anything below. This file is the background:
market research, the full feature catalog, the build sequence and the add-on backlog. "Revisit" is a placeholder name.

Contents: 1. Market teardown · 2. Product spec v1 · 3. Features and markets · 4. Add-on backlog


---

## Clinic Retention Engine (PH): Market Teardown

2026-10-28 · Patrick Gutierrez

### Revised verdict: conditional go

With outreach on the table, this becomes a viable business. It gets there by selling recovered revenue to multi-branch aesthetic clinics, not a reviews-and-posts tool to single dentists. Two things from the original spec still cannot ship as written, and everything else can be built compliantly.

- **Must change, [Certain]:** the 5-star-only route to Google. Your consent-survey idea is fine, but the Google link has to appear to every respondent whatever score they gave. Google's April 2026 update enforces this and now targets the software that gates ([KUKUI summary](https://www.kukui.com/google-changed-the-rules-on-reviews)).
- **Must change, [Certain]:** fully automatic Instagram posting on day one. Posting to accounts you do not own needs Meta App Review and Business Verification ([Meta](https://developers.facebook.com/docs/instagram-platform/overview)). Ship clinic-approved drafts first.
- **Your fix works, [Likely]:** a post-visit survey with a separate, unticked consent box for publication solves the testimonial problem under the Data Privacy Act, if consent is specific, logged and revocable.
- **Still open, [Guessing]:** whether Philippine medical and dental ethics rules restrict testimonials. Budget one legal consult before launch, and keep testimonials switchable per vertical.

What changed my view: you removed the outreach constraint, and aesthetic chains like SkinStation (90+ branches) and Flawless (45+) let one sale cover many clinics.

### Demand and supply numbers

Demand is real and growing; the buyer is small, fragmented and price-sensitive. **[Likely]** Aesthetics is the richest of your four verticals, dental is the largest by count, and vet is growing on the back of 24 million pet dogs and cats.

> (Chart in the original doc: Ken Research, Philippines Non-Invasive Aesthetic Treatment Market 2026-2031 (search-result excerpt; site blocks automated reading), Oct 2026)

| Signal | Number | Confidence and source |
| --- | --- | --- |
| New dentists licensed in 2025 | 2,046 (764 in June, 1,282 in December) | **[Certain]** [Summit Express, PRC results](https://www.thesummitexpress.com/2025/12/prc-releases-november-december-2025-dle-dentist-results-today.html) |
| Total dentists in practice | Sources conflict: about 4,200 vs over 10,000 | **[Guessing]** [US trade.gov citing Statista](https://trade.gov/market-intelligence/philippine-dental-sector); PDA figure only via secondary sites |
| Private dental clinics, one city | 191 in Pasig City alone, plus 40 public | **[Certain]** [Acta Medica Philippina](https://actamedicaphilippina.upm.edu.ph/index.php/acta/article/download/14034/7231/234930) |
| Medical spa market | $92M (2020) to $190M (2025) | **[Guessing]** [Ken Research](https://www.kenresearch.com/philippines-medical-spa-market.md) |
| Pet population, 2025 | 21.3M dogs, 2.74M cats; total pet population up 15.1% since 2021 | **[Likely]** [Global Pet Industry](https://globalpetindustry.com/article/country-report-the-philippines-a-growing-force-in-asias-pet-market/) |
| Social reach | Facebook used by 94.9% of internet users, Messenger 90.6%, Instagram 71.2% | **[Certain]** [DataReportal via NoypiGeeks](https://www.noypigeeks.com/?p=279976) |
| Recall leak (US benchmark) | Average hygiene recall rate 60 to 70%; 25 to 40% of patients overdue at any time | **[Likely]** [Ainora benchmarks](https://ainora.lt/blog/dental-recall-reactivation-statistics-benchmarks), [Viva](https://www.getviva.ai/increase-dental-recall-rates/) |
| Automation lift (vendor claim) | 18 to 24% more hygiene bookings with automated recall | **[Guessing]** Solutionreach data via [US Tech Automations](https://ustechautomations.com/resources/blog/automate-weave-alternatives-for-dental-practices-2026) |

**[Likely]** No Philippine recall-rate data exists publicly; the US benchmarks probably understate the PH gap, since dental care here is mostly out-of-pocket and less habitual. That cuts both ways: more patients to win back, but fewer who respond to a cleaning reminder.

### Competition, local to global

Your real competitor is free: a Facebook Page, Messenger, Meta Business Suite's built-in scheduler and Canva. **[Likely]** Most PH clinics already run marketing there, so you must beat free on convenience, not on features. Locally, SeriousMD owns the doctor relationship; globally, the US players are 10x your viable price point.

| Player | Scope | Overlap with your idea | Price | Threat |
| --- | --- | --- | --- | --- |
| Facebook Page + Messenger + Meta Business Suite | Global, free | Booking chats, scheduled posts, reviews and recommendations on the Page | Free | Highest: default habit |
| [SeriousMD](https://seriousmd.com/llms.txt) + NowServing | Philippines | EMR, booking, automated reminders, 34,000+ registered doctors, 10M+ patients in ecosystem | Pro P1,950/mo ([FitGap](https://us.fitgap.com/products/seriousmd)) | High: owns the clinic record |
| [MyDMD](https://apps.apple.com/us/app/id6470774305), [My Dental Clinic](https://www.capterra.co.za/software/186055/my-dental-clinic) | Philippines, dental | Records, appointments, reminders; built by Filipino dentists | Free to low | Medium |
| Local dev shops and Odoo dental modules | Philippines | Custom clinic systems with SMS reminders | One-off build fee | Medium |
| [Fresha](https://pabau.com/blog/fresha-pricing/) | Global, beauty and aesthetics | Booking, marketing messages, marketplace | $19.95/mo solo or $14.95 per team member, plus 20% on marketplace new clients | Medium for aesthetics |
| [Pabau](https://pabau.com/blog/fresha-pricing/) | Global, medical aesthetics | CRM, recalls, reviews, clinical records | From $59 per user/mo (Capterra listing) | Low in PH on price |
| Weave, Podium, Birdeye, NexHealth, Solutionreach | US-centric | Recall, reminders, review requests, two-way text | Weave about $249/mo per location + $750 setup ([Pabau](https://pabau.com/blog/weave-pricing/)); Podium $399; Birdeye about $299 | Low in PH; proves the category |

**[****Likely]** Vendors such as Podium and KUKUI now publish guidance against review gating, because it gets their own customers penalized. **[Likely]** The PH white space is not features; it is a P500 to P1,500 a month price point with Messenger-first delivery and Taglish templates, which is also a thin moat.

### Architecture, complexity and expense

Technically this is the easier of your two ideas; the hard parts are permission, not code. **[Likely]** A recall MVP is a CRUD app, a job queue and an SMS API. The reputation half adds three approvals you do not control.

> (Chart in the original doc: Reference flow for the clinic engine as specified, 8 steps, 3 compliance gates)

- **Gate 1, review link.** Every patient must get the same neutral ask; your 5-star branch has to go. Google's April 2026 update also bans in-clinic tablets and asking patients to name a service **[Certain]**.
- **Gate 2, consent.** Health data is sensitive personal information. A processor holding sensitive data on more than 1,000 people must register with the NPC **[Certain]** ([NPC](https://privacy.gov.ph/?p=3516)). Across 20 clinics you cross that quickly.
- **Gate 3, Meta publishing.** Posting to client Instagram accounts you do not own needs Advanced Access, which requires App Review and Business Verification **[Certain]** ([Meta developer docs](https://developers.facebook.com/docs/instagram-platform/overview)).

| Cost line | Unit cost | Per clinic per month (1,500 patients, 300 visits) |
| --- | --- | --- |
| SMS via Semaphore | P0.56 per 160-character text, ex VAT **[Certain]** ([Semaphore](https://www.semaphore.co)) | About 850 texts (300 reminders, 300 feedback asks, 250 recalls) = about P476 **[Guessing]** on volumes |
| Viber Business Messages | About $0.0096 per PH marketing message ([Alibaba Cloud](https://www.alibabacloud.com/help/en/chatapp/product-overview/viber)), plus a monthly minimum of EUR 115 to 200 at resellers ([SMSBAT](https://smsbat.com/viber-business-messages/)) **[Certain]** | Only viable pooled under one sender account |
| Hosting, database, queue | Small PaaS plus managed Postgres | $30 to $60 total for a pilot **[Guessing]** |
| Post graphics | HTML template rendered to PNG | Near zero **[Likely]** |
| Compliance | Privacy notice, consent log, DPO, NPC registration | Mostly your time, but non-optional |

**Unit economics [Guessing]:** at P1,500 a month, under SeriousMD Pro, SMS eats about P476, leaving about P1,024. You need roughly 98 paying clinics to clear P100,000 a month, each one sold and onboarded by hand. **[Guessing]** Build effort for the recall MVP is 4 to 6 weeks of evenings; the full spec with Meta publishing is 2 to 3 months plus an App Review cycle you cannot schedule.

### Every concern and the modern fix

Each risk has a known pattern that current vendors already use; none of them requires dropping the idea.

| # | Concern | Modern fix | Confidence |
| --- | --- | --- | --- |
| 1 | Review gating | Private survey first, then the same Google link shown to every respondent. Low scores also trigger a same-day private callback task for the clinic. Neutral wording, no in-clinic tablets. | [Certain] on the rule |
| 2 | Testimonial consent (DPA) | Separate, unticked consent box per use. Log timestamp, consent text version and channel. One-tap revoke link that queues a takedown. Default to first name plus initial, no photos, no treatment detail unless opted in. | [Likely] |
| 3 | Professional ethics on testimonials | One paid legal consult before launch. Testimonials ship as a per-vertical toggle; off by default for dental until cleared. | [Guessing] on PH rules |
| 4 | Meta App Review for auto-posting | v1 generates the branded graphic and caption; the clinic approves and posts in one tap via Meta Business Suite. Apply for Advanced Access after registering your business (DTI or SEC) and completing Business Verification. | [Certain] on the requirement |
| 5 | Messenger outbound limits | Appointment reminders through approved Messenger Utility templates, allowed outside the 24-hour window ([ManyChat docs](https://help.manychat.com/hc/en-us/articles/25928347005596-Utility-Messages-on-Messenger)). Promotional recalls via opt-in marketing messages, with SMS fallback at about P0.56 each. | [Likely] |
| 6 | Double data entry; SeriousMD owns the record | Do not replace the EMR. Patients are created automatically when they message the Page; CSV import for the existing list; a 3-field front-desk mode for walk-ins. | [Likely] |
| 7 | SMB churn and price resistance | Monthly ROI line on the dashboard: bookings recovered and pesos attributed. 30-day paid pilot, annual prepay discount, optional success fee. | [Likely] |
| 8 | Sales cost per clinic | Sell to chains and franchise groups first; then local clusters (Angeles, Clark, San Fernando) for single clinics. Partner with aesthetic device and skincare distributors who already visit clinics. | [Likely] |
| 9 | Data security and NPC | Encrypted managed database, role-based access, audit log, a data processing agreement template for clinics, NPC registration and a named DPO. Sell DPA readiness as a feature. | [Certain] on obligations |
| 10 | Generic AI chatbot competitors | Go vertical: treatment-cycle recall rules, Taglish templates, clinic KPIs. BookingAssist launched in PH in March 2026 as a horizontal AI booking tool ([Dugout](https://www.dugout.ph/2026/03/bookingassist-launches-in-philippines.html)). | [Certain] it exists |
| 11 | Patients treating messages as spam | Frequency caps, quiet hours, easy opt-out on every message, and one channel per patient based on what they actually reply to. | [Likely] |

### The profitable angle

Sell recovered revenue, not software. Launch verticals (set Oct 28): dental and vet clinics from existing contacts; aesthetics later, for the reasons below. Aesthetics wins on every axis that drives SaaS profit: short repeat cycles, high tickets, marketing budgets and chains.

| Vertical | Repeat cycle | Marketing appetite | Chains to sell into | Testimonial risk |
| --- | --- | --- | --- | --- |
| Aesthetic and skin clinics | Weeks to months: laser hair removal sessions, facials, injectables **[Likely]** | High; already Instagram-native | SkinStation 90+ branches ([PhilJobNet](https://philjobnet.gov.ph/job-vacancies/company/my-sanctuary-wellness-center-inc-38732)), Flawless 45+ ([Bossjob](https://bossjob.ph/company/forever-flawless-face-and-body-center-inc-39942)), Belo about 15 ([BusinessWorld](https://www.bworldonline.com/?p=576292)) | Medium |
| Vet clinics | Vaccines, deworming, annual checks | Medium | Few large chains **[Guessing]** | Low |
| Dental | 6 months | Low to medium | Some chains, mostly solo | Highest, pending ethics check |
| Physical therapy | Session packages | Low | Few | Medium |

The product, in priority order:

1. **Recall and win-back engine.** Treatment-cycle rules per service, sequences that stop once the patient books.
2. **Reminders and no-show reduction.** Confirm or reschedule links; replies route to the clinic's own phone or Messenger, no patient chatbot.
3. **Promo campaigns.** Segments plus a consent gate for marketing messages.
4. **Feedback and testimonial composer.** Survey, universal Google link, consented quotes turned into copy-ready drafts the clinic posts itself.
5. **ROI dashboard.** Pesos recovered per month; this is what renews the contract.

Full feature spec: see the Product spec v1 tab.

**[Likely]** Lead with 1 and 2 in the pitch; 3 is the upsell that makes you stickier than a generic chatbot.

### Pricing and unit economics

Price per branch against recovered bookings: if an average aesthetic ticket is about P3,000 **[Guessing]**, two recovered bookings a month already cover the Growth tier. Anchors: SeriousMD Pro at P1,950 a month, Malaysian clinic AI chatbots at RM200 to RM2,000 a month ([Lamanify](https://lamanify.pages.dev/blog/how-ai-chatbots-are-helping-malaysian-clinics-book-2x-more-patients-online-and-why-its-essential-in-2025)), Weave at about $249 per location in the US.

| Tier | Price per branch / month | Includes |
| --- | --- | --- |
| Starter | P1,990 | Recall, reminders, compliant review requests, 500 SMS |
| Growth | P4,490 | Starter + AI Messenger front desk + testimonial studio + ROI dashboard |
| Chain (10+ branches) | P3,490, plus P25,000 one-time setup per brand | Growth features, central dashboard, per-branch reporting |

**[Guessing]** Variable cost per Growth branch is about P1,000 to P1,500 a month: SMS about P500, AI inference P300 to P800, hosting share about P200. That puts gross margin near 72%.

| Scenario | Monthly recurring revenue | Est. gross profit at 72% |
| --- | --- | --- |
| 30 single clinics on Growth | P134,700 | about P97,000 |
| 1 chain, 20 branches | P69,800 (+ P25,000 setup) | about P50,000 |
| Both together | P204,500 | about P147,000 |

**[Guessing]** Plan for 3 to 5% monthly churn among single clinics; chains churn less but take 2 to 4 months to close. The first chain is the milestone that matters most.

### First 90 days

Validate willingness to pay before building the expensive parts; each phase has a go or stop gate.

1. **Weeks 1 to 2: interviews and paperwork.** Visit 15 aesthetic and skin clinics in Angeles, Clark and San Fernando. Ask what share of Messenger inquiries go unanswered after hours and how they handle recalls now. Register the business (DTI) and book one legal consult on testimonials and DPA consent. Gate: at least 5 clinics agree to a paid pilot.
2. **Weeks 3 to 6: concierge pilot.** Run recall and reminders for 3 to 5 clinics using a spreadsheet, Semaphore and an off-the-shelf Messenger bot builder. Track bookings per message by hand. Charge a discounted P1,000 a month from week 1, because free pilots do not prove demand.
3. **Weeks 7 to 10: build the MVP.** Recall engine, Messenger front desk on Utility templates, compliant review flow, ROI dashboard. Testimonial studio outputs drafts only. Start Meta Business Verification.
4. **Weeks 11 to 13: first chain pitch.** Take pilot numbers (bookings recovered, pesos attributed) to SkinStation, Flawless or a regional chain's marketing head. Gate: one chain trial of 3 or more branches, or 10 paying singles.

**[Likely]** If no clinic pays P1,000 in weeks 3 to 6, the demand is not there and you stop having spent mostly evenings, not months of code.

### Sources

- [KUKUI: Google changed the rules on reviews, Jun 2026](https://www.kukui.com/google-changed-the-rules-on-reviews)
- [Search Engine Land: Google review guidelines on gating](https://searchengineland.com/google-review-guidelines-say-discouraging-negative-or-selectively-soliciting-positive-reviews-is-not-allowed-388541)
- [National Privacy Commission on health data and registration](https://privacy.gov.ph/?p=3516)
- [Meta Instagram Platform overview: access levels and App Review](https://developers.facebook.com/docs/instagram-platform/overview)
- [Singapore Dental Council advisory on testimonials](https://www.sdc.gov.sg/publications-and-newsroom/announcements/advisory-on-provision-of-government-indemnity-against-claims-arising-from-work-carried-out-by-medical-practitioners-and-healthcare-workers/)
- [Semaphore SMS gateway](https://www.semaphore.co)
- [Sent.dm Philippines SMS pricing comparison](https://sent.dm/resources/philippines-sms-pricing)
- [Alibaba Cloud Viber channel pricing](https://www.alibabacloud.com/help/en/chatapp/product-overview/viber)
- [SMSBAT Viber Business Messages](https://smsbat.com/viber-business-messages/)
- [SeriousMD key facts](https://seriousmd.com/llms.txt) and [FitGap pricing](https://us.fitgap.com/products/seriousmd)
- [Pabau: Fresha pricing](https://pabau.com/blog/fresha-pricing/) and [Weave pricing](https://pabau.com/blog/weave-pricing/)
- [DataReportal Digital 2026 Philippines via NoypiGeeks](https://www.noypigeeks.com/?p=279976)
- [Summit Express: 2025 dentist licensure results](https://www.thesummitexpress.com/2025/12/prc-releases-november-december-2025-dle-dentist-results-today.html)
- [US trade.gov: Philippine dental sector](https://trade.gov/market-intelligence/philippine-dental-sector)
- [Acta Medica Philippina: Pasig dental clinic distribution](https://actamedicaphilippina.upm.edu.ph/index.php/acta/article/download/14034/7231/234930)
- [Ken Research: non-invasive aesthetic treatment market](https://www.kenresearch.com/philippines-non-invasive-aesthetic-treatment-market.md) and [medical spa market](https://www.kenresearch.com/philippines-medical-spa-market.md)
- [Global Pet Industry: Philippines country report](https://globalpetindustry.com/article/country-report-the-philippines-a-growing-force-in-asias-pet-market/)
- [Ainora: dental recall benchmarks](https://ainora.lt/blog/dental-recall-reactivation-statistics-benchmarks)
- [US Tech Automations: Weave alternatives and recall data](https://ustechautomations.com/resources/blog/automate-weave-alternatives-for-dental-practices-2026)

Added Oct 28 for the revised plan:

- [ManyChat: Utility Messages on Messenger](https://help.manychat.com/hc/en-us/articles/25928347005596-Utility-Messages-on-Messenger)
- [Meta Messenger Platform policy overview](https://developers.facebook.com/docs/messenger-platform/policy/policy-overview)
- [Dugout: BookingAssist launches in the Philippines, Mar 2026](https://www.dugout.ph/2026/03/bookingassist-launches-in-philippines.html)
- [Lamanify: AI chatbots for Malaysian clinics, pricing](https://lamanify.pages.dev/blog/how-ai-chatbots-are-helping-malaysian-clinics-book-2x-more-patients-online-and-why-its-essential-in-2025)
- [PhilJobNet: SkinStation branch count](https://philjobnet.gov.ph/job-vacancies/company/my-sanctuary-wellness-center-inc-38732)
- [Bossjob: Flawless branch count](https://bossjob.ph/company/forever-flawless-face-and-body-center-inc-39942)
- [BusinessWorld: Belo branch count](https://www.bworldonline.com/?p=576292)

---

## Product spec v1: clinic retention console

A clinic-facing tool that brings existing patients back: no patient chatbot, no auto-posting, minimal data. Scope set by Patrick on Oct 28, 2026.

### Scope: dental and vet first, every feature defined now

Launch verticals are dental and vet clinics from Patrick's existing contacts; aesthetics comes later. The core features in the Features and markets tab are specified now, add-ons sit in the Add-on backlog tab, and the data model is built for all of them from day one, so nothing gets redesigned while clinics are live.

The only ordering left is build sequence, because code ships one piece at a time:

1. **Foundation:** contacts and assets, sync, mute list, consent ledger, campaign log.
2. **Sending:** sender-name SMS, email with clinic reply-to, reminders, recall, no-show recovery, win-back.
3. **Console:** daily action list, booking request page, rebook-at-checkout prompt, ROI dashboard, AI copywriter.
4. **Growth:** marketing texts with segments, packages, birthdays, referral tracking, feedback, review link, testimonial composer.
5. **Expansion:** AI briefing, churn score, plain-language segments, benchmarks; everything else is in the Add-on backlog tab.

**[Likely]** Your first dental or vet clinic can start paying after step 2; steps 3 to 5 then ship to clinics already using it, which is where their feedback becomes useful.

**Still open for dental [Guessing]:** whether PH dental ethics rules restrict testimonials. Keep the testimonial composer switched off for dental until a lawyer or the PDA confirms.

### Data: the minimum you store

Generic labels do not bypass the Data Privacy Act; they minimize what you hold, which is what the law actually asks for. **[Likely]** A name plus mobile number plus "patient of Smile Dental, due for a visit" still says something about that person's health. So design as if it counts, and keep the footprint small.

| Field | Store? | Note |
| --- | --- | --- |
| Name, mobile, email | Yes | Ordinary personal information |
| Service category code (e.g. Dental visit, Skin treatment, Vet vaccine) | Yes | Needed for recall intervals; no clinical detail |
| Last visit date, next due date | Yes | Drives every sequence |
| Pet name and species | Yes, vets only | Animal data is not human health data **[Likely]** |
| Diagnoses, notes, prescriptions, photos | Never | Stays in the clinic's own system |
| Consent flags with timestamp and text version | Yes | Separate flags for reminders and marketing |

Four practices that keep you low-risk:

1. **Roles on paper.** The clinic is the Personal Information Controller; you are the processor. Sign a data processing agreement with every clinic; ship a template.
2. **Consent at intake.** Give clinics your consent form and QR; marketing consent is a separate, unticked box.
3. **Lock-screen privacy.** Default SMS text never names the treatment: "Your next visit at [Clinic] is due" instead of "Your Botox top-up is due." Clinics can opt in to specifics.
4. **Retention limits.** Auto-purge contacts inactive for 3 years **[Guessing]** on the right period; encrypt at rest; role-based access; audit log. If you end up processing sensitive data on over 1,000 people, register with the NPC **[Certain]** ([NPC](https://privacy.gov.ph/?p=3516)).

### Sending channels and replies

Email is not no-reply: set the Reply-To to the clinic's inbox and replies go straight to them **[Certain]**. SMS is the hard part, because Philippine carriers treat business texts and person-to-person texts very differently.

| Option | Patient sees | Replies | Links in text | Risk | Verdict |
| --- | --- | --- | --- | --- | --- |
| Registered sender name via Semaphore | "SMILEDENT" | No | Yes; avoid URL shorteners, Smart blocks them **[Certain]** | Low: the carrier-approved business route | Default for reminders, recalls, promos |
| Your own SIMs sending for all clinics | A random 09xx number | Yes | Globe has blocked texts with links from prepaid and postpaid numbers **[Certain]** ([SunStar](https://www.sunstar.com.ph/cebu/feature/globe-starts-blocking-sms-with-clickable-links-to-boost-fight-against-fraudsters)) | High: NTC orders telcos to deactivate SMS blast devices; Globe blocks numbers reported twice ([Rappler](https://www.rappler.com/?p=65689)) | Do not build |
| Clinic's own SIM through a gateway app on an Android phone | The clinic's number patients already know | Yes, into your inbox and the phone | Unreliable on Globe | Medium at low volume; throttle to tens per hour **[Guessing]** on the safe rate | Paid add-on for two-way conversations |
| Long codes or virtual numbers (Twilio, Vonage) | A number | Yes | Yes | Globe blocks long codes for business texts **[Certain]** ([Vonage](https://api.support.vonage.com/hc/en-us/articles/204017413-Philippines-SMS-Features-and-Restrictions)) | Not for PH outbound |

Correction to my last reply: I said Twilio two-way would work in PH. Delivery to Globe users through long codes is blocked, so it is not a real option.

**[Likely] On the first-line-as-business-name idea:** a promo from an unknown 09xx number starting "SmileDent:" reads exactly like the scam texts Filipinos have been warned about for years. It looks cheap, patients report it, and reported numbers get blocked. A registered sender name is the trust signal.

Recommended setup: sender name for everything outbound; every text ends with the clinic's own number or Messenger link for replies; the clinic-SIM gateway as an add-on for clinics that want replies in the console. The [Telerivet Gateway app](https://www.telerivet.com/product/messaging/country/PH) shows the model works on Android.

### Sync with clinic systems

Scheduled sync by default, realtime where the clinic's system allows it, and the clinic owns patient status. That split is sound; one guard stays on your side.

- **Scheduled:** a nightly pull from an uploaded CSV or a shared Google Sheet.
- **Realtime:** a webhook or API connection where the clinic's system offers one.
- **Clinic responsibility, written into the terms and onboarding:** keep booked, moved and deceased status current in their own system before each sync.
- **The one guard you keep:** if a sync fails or has not run for 3 days **[Guessing]** on the threshold, sends pause and the clinic gets an alert. A silently broken nightly import means every later recall fires from stale data, and the clinic will blame your app, not their spreadsheet **[Likely]**.
- **Mute list lives in your app** and survives re-imports, so an old CSV cannot bring back someone who opted out.

### Consent: reminders vs promos

Reminders can go out without a marketing opt-in; promos cannot. Receiving spam yourself shows how common non-compliance is, not that it is allowed; those senders are exactly who telcos block and the NPC acts on.

| Message type | Consent needed | Low-friction way to get it |
| --- | --- | --- |
| Appointment reminders, recalls, no-show follow-ups | Covered by the purpose the clinic collected the number for **[Likely]** | One line in the clinic's privacy notice and patient form |
| Marketing texts: service spotlights, new services, clinic news | Opt-in **[Certain]**: the NPC has said implied consent is not enough ([SyCip on Advisory Opinion 2017-42](https://www.legal500.com/developments/wp-content/uploads/sites/19/2018/05/NPC20Advisory20Opinion20on20Consent2020180306.pdf)); NTC broadcast rules define opt-in for SMS direct marketing ([jur.ph](https://jur.ph/law/facts/rules-and-regulations-on-broadcast-messaging-service)) | Unticked checkbox on the intake form, a QR at the counter, staff asking at checkout, and a "Want occasional promos? Tap YES" line inside a normal reminder |

Product rule: marketing texts can only target opted-in contacts, and the console shows the opted-in count growing. That count becomes the clinic's marketing asset, which is a selling point.

### Campaign log and duplicate protection

Every send belongs to an event, as you proposed. The log is also your proof if a patient ever complains.

- **Each event records:** campaign or automation name, message text, recipient list, send date and time, delivery status, link taps and bookings.
- **Rule 1:** a contact never receives the same campaign twice.
- **Rule 2:** a cross-campaign cap, default 2 marketing texts per contact per 30 days **[Guessing]** on the number; the clinic can adjust it.
- **Rule 3:** no marketing text within 7 days after a visit or while that contact is mid-recall sequence.
- **Rule 4:** automations read the same log, so a recall and a marketing text never land on the same day.
- **Export:** CSV of any event, any time.

### Announcement builder (marketing texts)

Discount promos are out of the core product (decided Oct 28); a DTI promo module becomes a paid add-on built later. What remains is marketing without a discount, which removes the DTI permit question but not the opt-in rule: service announcements are still direct marketing, so they only go to opted-in contacts **[Likely]**.

| Announcement type | Example |
| --- | --- |
| Service spotlight | "Did you know we do teeth whitening?" / "We now offer pet dental cleaning" |
| New service launch | New laser equipment, a new vet joining, home-service visits |
| Clinic news | Extended Saturday hours, new branch, holiday closures |
| Seasonal care tip | Rainy-season leptospirosis reminder, back-to-school dental check |
| Free event, no purchase | Free check-up day, free pet weigh-in; confirm with DTI once **[Guessing]** |

Five-step wizard, each step gated:

1. **Basics:** name, announcement type, services mentioned. Required: name and type.
2. **Timeline:** send date, optional reminder wave, quiet hours. Required: send date.
3. **Audience:** opted-in contacts only (locked), filters by service history, last visit, asset type, tags; auto-excludes recent visitors and anyone at the 30-day cap. Required: at least 1 recipient.
4. **Message:** AI draft, live character and cost counter, auto footer (reply number, stop link), phone preview. Required: test send to the admin's own phone.
5. **Review:** AI check flags discount wording ("% off", "sale", "promo") and medical claims, so nothing that needs a permit slips through; optional second-admin approval. Required: check cleared.

Report: delivered, link taps, booking requests, bookings, opt-outs triggered.

**Opt-in incentive without discounts:** "Join our VIP list for first access to new services and free event slots." Early access to free events carries no purchase, so it stays clear of sales-promotion rules **[Guessing]**.

**Add-on later: DTI promo module.** Discount events with offer terms, Senior and PWD choice handling, a permit-number gate and DTI blanket-approval paperwork support.

### Testimonials via Google Forms

Use Google Forms over SurveyMonkey: free, unlimited responses on the clinic's own Google account, and answers land in a Google Sheet your app already knows how to sync **[Likely]**.

1. Post-visit message links to the clinic's form.
2. Questions about the visit, then a final, separate consent question.
3. Responses flow into a Sheet; your app pulls rows where consent is Yes into the post composer.
4. Every published quote links back to its row, so a removal request takes one click.

Warmth belongs in the invitation; the consent question itself must stay plain. Wording built to guilt patients into saying yes risks consent that is not freely given **[Likely]**.

- **Invitation (warm):** "Your story helps other pet parents in our community find care they can trust. Mind sharing a few words about Bantay's visit?"
- **Consent (plain):** "May we post your answer on our Facebook and Instagram pages, showing only your first name and last initial? You can ask us to remove it anytime." Options: Yes / No, nothing pre-selected.

#### The testimonial form: 6 questions, about 60 seconds

One open question does the heavy lifting; everything else is a tap. Send the link prefilled with the patient's name and visit type so they only confirm **[Certain]** that Google Forms supports prefilled links.

| # | Question | Type | Required | Used for |
| --- | --- | --- | --- | --- |
| 1 | Name to show (first name and last initial) | Short text, prefilled | Yes | Attribution on the post |
| 2 | Your pet's name (vet) or skip (dental) | Short text | No | Warmer posts: "Bantay's mom says..." |
| 3 | How was your visit overall? | 1 to 5 scale | Yes | Internal tracking only |
| 4 | What did you come in for? | Multiple choice: check-up, cleaning, vaccine, treatment, emergency, other | Yes | Post context and hashtag choice |
| 5 | In a sentence or two, what would you tell a friend about us? | Paragraph | Yes | The testimonial itself |
| 6 | May we post your answer on our Facebook and Instagram pages, showing only your first name and last initial? You can ask us to remove it anytime. | Yes / No, nothing pre-selected | Yes | Consent gate |

The confirmation page thanks everyone and shows the Google review link to everyone, whatever they answered. Skip photo uploads: Google Forms requires respondents to sign in to upload files **[Likely]**, which kills completion; ask for pet photos by Messenger instead.

**From answer to post:** rows with consent Yes flow into the composer. The AI uses question 5 word for word (trimming only), adds context from questions 2 and 4, then fills in the clinic's name, address, phone, hours and booking link. It writes one caption per platform within each limit, and the clinic approves before copying.

### Post composer

Your draft-and-copy flow removes the Meta App Review problem entirely; the clinic posts from its own account. Flow: approved quote, pick platform, AI drafts caption variants with clinic details auto-filled (address, phone, hours, booking link), a branded quote card is rendered, then Copy caption and Download image.

| Platform | Hard limits to enforce | Best-practice defaults |
| --- | --- | --- |
| Instagram | 2,200-character caption; max 5 hashtags per post since December 2025 **[Certain]** ([Business Today](https://www.businesstoday.in/technology/news/story/no-more-hashtag-stuffing-instagram-limits-hashtag-usage-to-just-5-per-reel-and-post-507444-2025-12-19)) | Hook in the first 125 characters before the "more" cut **[Likely]** ([Sendible](https://www.sendible.com/insights/instagram-character-limit?hsLang=en)); 3 to 5 local and service tags; portrait quote card |
| Facebook | Effectively no practical caption limit | Short quote, one call to action, booking link, address; the main channel for PH clinics |
| TikTok | Caption limit around 4,000 characters **[Guessing]** | Better as a short video script than a quote card; offer a 15-second script template |
| Google Business Profile post | About 1,500 characters **[Guessing]** | Plain text, booking button; helps local search |

Guardrails built into the composer: patient words are trimmed but never rewritten; every draft shows a consent badge linked to the consent record; no before-and-after photos by default; the AI is blocked from writing results claims like "guaranteed" or "painless." **[Likely]** "Viral" is not something the tool can promise; consistent, local, specific posts are what it can reliably produce.

---

## Features and markets

Everything the engine could do, and every kind of business it could sell to, local and global.

### Positioning: one engine, many vertical packs

Build one retention engine and sell it through vertical packs; do not build a different app per industry. A pack is just configuration: service intervals, message templates, vocabulary (patient, client, member, pet owner) and dashboard labels.

- **The versatility trick: recall attaches to an asset, not only a person.** An asset can be a pet, a motorcycle, an aircon unit, a water filter or a prepaid package. One owner can have many assets, each with its own due date. That single data model covers vets, motorcycle shops, aircon services and aesthetic packages without new code **[Likely]**.
- **Go-to-market stays narrow even if the product is broad.** Lead with one or two packs, prove ROI, then add packs. Selling "retention for any business" on day one makes every pitch generic **[Likely]**.
- **Local market size:** the Philippines had 1,246,373 business enterprises in 2023, including 604,313 in wholesale and retail trade plus motor vehicle and motorcycle repair, and 87,197 in other service activities **[Certain]** ([DTI MSME statistics](https://dti.gov.ph/businesses/msmes/msmeresources/msme-statistics)).

### Full feature catalog

52 features across 11 categories, all in scope, each with a dental and a vet example. Build order lives in the Product spec v1 tab. Value and fit are **[Likely]** unless marked.

**Scope change, Oct 28:** discount promos left the core product. Features 17 (stamp card), 18 (referral rewards) and 20 (VIP perks) hand out rewards tied to purchases, so they move into the future DTI promo add-on with them **[Likely]**. Feature 18 can stay in core as plain referral tracking with no reward. Nuance: DTI treats rewards for proof of purchase as a "redemption" promo ([DTI e-Sigaw](https://esigaw.dti.gov.ph/?p=425)), but one permit can cover a year-long program, as Samsung's PH rewards permit for Aug 2026 to Aug 2027 shows ([Samsung PH](https://images.samsung.com/is/content/samsung/assets/ph/offer/2026/promo-mechanics/estore-omnibus-samsung-online-rewards-program-2027-265922.pdf)), and redemption permits are processed in about 3 working days ([PIA](https://mirror.pia.gov.ph/news/2023/02/22/dti-albay-urges-business-establishments-to-get-sales-promotion-permit)). Core can record stamps and referrals at the counter; texting or posting about the rewards is what needs the clinic's permit on file.

| # | Category | Feature | How it works | Dental example | Vet example |
| --- | --- | --- | --- | --- | --- |
| 1 | Data and sync | Scheduled + realtime sync | Nightly CSV or Google Sheet pull; webhook or API where offered | Import the clinic's Excel patient list | Import from the clinic system or logbook sheet |
| 2 | Data and sync | Assets per contact | Each asset has its own due dates | Kids under one parent | Each pet under one owner |
| 3 | Data and sync | Tags and custom fields | Free-form labels for segments | Ortho patient, HMO card | Senior dog, breeder |
| 4 | Data and sync | Mute list | Survives every re-import | Patient asked to stop | Owner asked to stop |
| 5 | Data and sync | POS and calendar connectors | Loyverse, Square, Shopify POS, Google Calendar **[Guessing]** on PH demand | Dentist schedule sync | Vaccine and grooming sales sync |
| 6 | Automations | Interval recall | 4-step sequence; stops on booking | Cleaning every 6 months | Rabies yearly, deworming every 3 months |
| 7 | Automations | Appointment reminders | 24h and 2h before, confirm link | Tomorrow's 10am visit | Tomorrow's surgery, with prep instructions from the clinic |
| 8 | Automations | No-show recovery | Same-day rebook message | Missed cleaning | Missed booster shot |
| 9 | Automations | Win-back tiers | 30, 60, 90, 180 days lapsed | No visit in 12 months | Vaccine schedule lapsed |
| 10 | Automations | Cancellation backfill | Waitlist gets a text; first tap gets the slot | Saturday slot opens | Grooming slot opens |
| 11 | Automations | Package and credit expiry | Sessions-left and expiring-soon nudges | Prepaid ortho adjustments | Prepaid vaccine or grooming packages |
| 12 | Automations | Birthdays and anniversaries | Auto greeting, no discount | Patient birthday | Pet birthday, adoption anniversary |
| 13 | Automations | Usage-based reminders | By count or quantity | Aligner tray changes | Prescription diet reorder by bag size |
| 14 | Automations | Membership renewal | Renewal reminders and follow-up | Clinic discount card renewal | Pet wellness plan renewal |
| 15 | Automations | Seasonal triggers | PH calendar presets | Back-to-school check-ups in May | Rainy-season leptospirosis vaccine reminder **[Likely]** |
| 16 | Automations | Weather triggers | Weather feed | Typhoon closure and auto-reschedule notice | Heatwave pet-care tips with check-up offer |
| 17 | Loyalty and referral | Stamp card or points | QR scan at the counter | 5th cleaning, free fluoride | 10th grooming free |
| 18 | Loyalty and referral | Referral codes | Per-contact code, tracked bookings | Refer a friend, both get a discount | Refer another pet owner |
| 19 | Loyalty and referral | Wallet passes | Apple and Google Wallet card, free push updates | Patient card with next due date | Pet health card with vaccine due dates |
| 20 | Loyalty and referral | VIP tiers | Spend-based perks | Family-plan VIP | Multi-pet household VIP |
| 21 | Campaigns | AI copywriter | Taglish, English, Cebuano; tone presets; character-aware | Whitening service spotlight in Taglish | Anti-rabies month message |
| 22 | Campaigns | RFM segments | Auto groups: champions, at risk, lost | Regulars who stopped coming | Owners overdue on 2+ pets |
| 23 | Campaigns | Event attendance tracking | Track which campaign brought who back | Free check-up day sign-ups | Vaccination day attendance |
| 24 | Campaigns | A/B tests and send-time optimization | Learns best wording and hour | Morning vs evening recall | Weekday vs weekend promos |
| 25 | Campaigns | Campaign log and dedupe | Event list with recipients and dates; never the same campaign twice; cross-campaign cap | Holiday-hours notice sent once per patient | Vaccine month blast sent once per owner |
| 26 | Channels | Sender-name SMS | Semaphore, one-way, registered name | SMILEDENT | PAWCARE |
| 27 | Channels | Email with clinic reply-to | Replies land in the clinic inbox | Receipts and newsletters | Vaccine certificates and reminders |
| 28 | Channels | Clinic-SIM gateway (add-on) | Two-way texts through the clinic's own phone, throttled | Patients text the clinic's known number | Owners send pet updates |
| 29 | Channels | Messenger utility templates | Reminders outside the 24-hour window | Appointment confirmation | Vaccine due notice |
| 30 | Channels | Viber, WhatsApp, RCS | Market-dependent | Viber for older patients | WhatsApp for expat owners |
| 31 | Reputation and content | Survey and NPS | 2-tap post-visit | Rate your visit | Rate your pet's visit |
| 32 | Reputation and content | Universal review link | Same Google link to everyone | After every visit | After every visit |
| 33 | Reputation and content | Testimonial consent + post composer | Drafts, copy-paste, platform limits enforced | Off until the ethics check clears | On: happy-pet stories |
| 34 | Reputation and content | AI review-response drafts | Suggested replies to Google and Facebook reviews | Reply to a 2-star review calmly | Thank a 5-star reviewer |
| 35 | Staff tools | Daily action list | Who to call today and why | 8 overdue cleanings to call | 5 overdue rabies shots to call |
| 36 | Staff tools | Rebook-at-checkout prompt | Prompt to book the next visit before they leave | Next cleaning booked at payment | Next booster booked at payment |
| 37 | Staff tools | Booking request page | Branded page; patient picks a slot; clinic confirms | Pick a cleaning slot | Pick a grooming or vaccine slot |
| 38 | Staff tools | Mobile web console | Phone-first for the front desk | Receptionist on her phone | Vet assistant on the clinic tablet |
| 39 | Staff tools | Roles and audit log | Who did what, when | Dentist vs receptionist access | Vet vs assistant access |
| 40 | AI layer | Weekly AI briefing | "23 lapsed this week, about P69,000 at stake. Send win-back?" | Lapsed cleanings value | Lapsed vaccines value |
| 41 | AI layer | Churn risk score | Flags regulars past their usual gap | Twice-yearly patient now at 9 months | Monthly groomer client now at 10 weeks |
| 42 | AI layer | Plain-language segments | Type the audience in a sentence | "Came twice last year, not since June" | "Dogs over 7 with no visit this year" |
| 43 | Analytics | ROI dashboard | Bookings and pesos attributed | Cleanings recovered this month | Vaccines recovered this month |
| 44 | Analytics | Cohorts, repeat rate, lifetime value | Retention curves by month joined | Patients still active after a year | Pets still active after a year |
| 45 | Analytics | Anonymized benchmarks | Compare with similar clinics; a data moat over time | Your recall rate vs other clinics | Your vaccine compliance vs other clinics |
| 46 | Compliance | Consent ledger + capture tools | Logged consent; QR, intake checkbox, YES-reply | Promo opt-in at the front desk | Promo opt-in at the front desk |
| 47 | Compliance | Opt-out link, quiet hours, caps | One-tap stop link, no late-night sends, frequency limits | Stop link in every text | Stop link in every text |
| 48 | Compliance | Lock-screen privacy | Default texts never name the treatment | "Your next visit is due" | Pet name allowed; owner chooses |
| 49 | Platform | Multi-branch | Rollups and per-branch comparison | Group dental practice | Multi-branch vet hospital |
| 50 | Platform | White-label for agencies | Resellers rebrand the console | Dental marketing agency resells it | Pet-industry agency resells it |
| 51 | Platform | API, webhooks, Zapier and Make | Connect anything | Push bookings to the clinic calendar | Push vaccine records to the clinic system |
| 52 | Platform | Billing and global rule packs | GCash, Maya, Stripe; per-country messaging rules | Pay monthly via GCash | Same, plus US and AU packs later |

**[Likely]** The three features with the best ratio of build effort to sales impact: cancellation backfill, the weekly AI briefing and the rebook-at-checkout prompt.

### Vertical map

Retention sells wherever a business earns from repeat visits on a predictable cycle. Intervals below are typical, not rules **[Likely]**. Suggested launch order: dental and vet first, aesthetics next, then motorcycle service and aircon cleaning as the first non-clinic packs.

| Business | Retention trigger | Typical interval | PH fit | Global fit |
| --- | --- | --- | --- | --- |
| Aesthetic and skin clinics | Session series, top-ups, package expiry | 3 to 12 weeks | High | High |
| Vet clinics and pet grooming | Vaccines, deworming, grooming | 3 weeks to 12 months | High | High |
| Dental | Cleaning and check-up recall | 6 months | Medium, ethics check pending | High |
| Motorcycle and auto service | Preventive maintenance by km or months, registration renewal | 3 to 6 months, yearly | High | Medium |
| Aircon cleaning and repair | Cleaning before summer and mid-year | 3 to 6 months | High | Medium, hot climates |
| Salons, barbers, nail and lash | Rebooking | 2 to 8 weeks | High | High |
| Spas and massage | Packages, memberships | 2 to 4 weeks | High | High |
| Gyms and fitness studios | Inactivity alerts, membership renewal | Weekly check, monthly renewal | Medium | High |
| Physio and chiropractic | Session plans | Weekly | Medium | High |
| Optical | Eye exams, contact lens reorders | 12 months, 1 to 3 months | Medium | High |
| Pest control | Scheduled treatments | Quarterly | Medium | High |
| Water purifier service and refilling stations | Filter changes, refill subscriptions | 3 to 6 months, weekly | High | Low |
| Tutoring and learning centers | Term re-enrollment | Per term; June school opening | High | Medium |
| Laundry and car wash | Lapsed regulars, subscriptions | Weekly to monthly | Medium | Medium |
| Insurance and pre-need agents | Renewals, birthdays, policy reviews | Yearly | High | Medium |

**[Likely]** Motorcycle service is the sleeper: huge ownership, a clear maintenance cycle and shops that keep paper logbooks today.

### Channels and messaging rules by market

Going global means a rule pack per country, not just translations. **[Likely]** on the summaries below; confirm each with a local source before launch.

| Market | Main channels | Key rule to build in |
| --- | --- | --- |
| Philippines | SMS (one-way sender names), Messenger, Viber, email | Data Privacy Act consent; promos only to opted-in contacts **[Certain]** ([Twilio PH](https://www.twilio.com/en-us/guidelines/ph/sms)) |
| United States | SMS (two-way), email | TCPA written consent for marketing texts; 10DLC or toll-free number registration before sending |
| Australia | SMS, email | Spam Act: consent, sender identified, working unsubscribe in every message |
| UK and EU | Email, WhatsApp, SMS | GDPR and ePrivacy: opt-in for marketing, easy opt-out, data processing agreements |
| Singapore | WhatsApp, SMS | PDPA plus Do Not Call Registry checks for marketing messages |
| Malaysia, Indonesia, Latin America | WhatsApp first | WhatsApp template approval; local consent laws |

**[Likely]** Your one-tap opt-out link and consent ledger already satisfy the common core of all of these, which makes global expansion a configuration job, not a rebuild.

---

## Add-on backlog

Built when a clinic asks for it. Each row is a starter spec, so any of them can be picked up quickly; the core data model (assets, consent ledger, campaign log) already supports all of them.

| Add-on | What it does | Build when | Prerequisites | Effort |
| --- | --- | --- | --- | --- |
| DTI promo module | Discount events with offer terms, per-client limits, the Senior and PWD choice rule, a permit-number gate before scheduling, help preparing a DTI blanket-approval application | A clinic wants discount campaigns | Clinic's DTI sales promotion permit; blanket approval covers a year at the normal fee plus 50% ([DTI Fair Trade FAQ](https://fairtrade.dti.gov.ph/?p=5025)) | 2 to 3 weeks **[Guessing]** |
| Loyalty and referral rewards | Stamp cards, referral rewards, VIP perks; counter-side tracking is free, texts about rewards need the permit | First aesthetics client, or any clinic asking | Annual DTI permit for redemption promos, processed in about 3 working days ([PIA](https://mirror.pia.gov.ph/news/2023/02/22/dti-albay-urges-business-establishments-to-get-sales-promotion-permit)) | 2 weeks **[Guessing]** |
| Clinic-SIM gateway | Two-way texting through the clinic's own Android phone and registered SIM, throttled; replies appear in the console | A clinic wants replies inside the console | Clinic's registered SIM and an Android phone left at the clinic | 2 to 3 weeks **[Guessing]** |
| Messenger utility templates | Reminders and confirmations through the clinic's Facebook Page | A clinic's patients answer Messenger more than SMS | Meta app, Page connection, template approval | 2 weeks **[Guessing]** |
| Viber and WhatsApp | Business messaging on those apps | Older patient base (Viber) or expat clients (WhatsApp) | Reseller account; Viber resellers charge a monthly minimum of about EUR 115 to 200 ([SMSBAT](https://smsbat.com/viber-business-messages/)) | 1 to 2 weeks each **[Guessing]** |
| Aesthetics pack | Session-series intervals, package and session tracker, aesthetics templates | After dental and vet show results | Pairs with the loyalty add-on | 1 to 2 weeks **[Guessing]** |
| Multi-branch console | Rollups and branch comparison | A group practice or multi-branch vet signs | None | 2 weeks **[Guessing]** |
| POS and calendar connectors | Loyverse, Square, Shopify POS, Google Calendar | A clinic already uses one | API keys from the clinic | About 1 week each **[Guessing]** |
| Wallet passes | Apple and Google Wallet cards with due dates and free push updates | To cut SMS costs for larger clinics | Apple developer account | 1 to 2 weeks **[Guessing]** |
| White-label for agencies | Resellers rebrand and sell the console | A marketing agency asks to resell | Reseller agreement | 2 weeks **[Guessing]** |
| Global rule packs | Consent and sending rules for US, AU, EU, SG and WhatsApp-first markets | First non-PH client | Local legal check per country | Per country |
