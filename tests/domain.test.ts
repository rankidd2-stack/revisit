import { describe, expect, it } from "vitest";
import { nextRecallStep, type RecallRule } from "../src/domain/recall.js";
import { checkEligibility, DEFAULT_POLICY, type ContactState } from "../src/domain/eligibility.js";
import { buildFooter, checkContent, cleanFirstName, clinicNameIssues, isAllowedVisitTerm, nameIssues, measureSms, normalizeForSms, smsCostCentavos } from "../src/domain/sms.js";
import { manilaDate, manilaHour, manilaInstant } from "../src/domain/time.js";
import { latestConsent, latestVisit, type ConsentRecord } from "../src/domain/contact-state.js";

const cleaning: RecallRule = { serviceCategory: "Dental check-up", intervalDays: 180, stepOffsetsDays: [-7, 0, 14, 60] };
const base = { rule: cleaning, lastVisitOn: "2026-01-01", hasUpcomingAppointment: false, stepsAlreadySent: [] as number[] };

describe("time (Asia/Manila)", () => {
  it("maps UTC instants to Manila date and hour", () => {
    const t = new Date("2026-10-30T17:30:00Z"); // 01:30 next day in Manila
    expect(manilaDate(t)).toBe("2026-10-31");
    expect(manilaHour(t)).toBe(1);
    expect(manilaInstant("2026-10-31", 8).toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });
});

describe("recall", () => {
  it("is due 180 days after the visit, heads-up 7 days before", () => {
    expect(nextRecallStep(base, "2026-06-22")).toEqual({ action: "none", reason: "not_yet" });
    expect(nextRecallStep(base, "2026-06-23")).toMatchObject({ action: "send", dueOn: "2026-06-30", stepOffsetDays: -7 });
  });
  it("does not resend a step already sent", () => {
    expect(nextRecallStep({ ...base, stepsAlreadySent: [-7] }, "2026-06-25").action).toBe("none");
    expect(nextRecallStep({ ...base, stepsAlreadySent: [-7] }, "2026-06-30")).toMatchObject({ action: "send", stepOffsetDays: 0 });
  });
  it("stops when the patient has booked", () => {
    expect(nextRecallStep({ ...base, hasUpcomingAppointment: true }, "2026-07-01")).toEqual({ action: "none", reason: "booked" });
  });
  it("a late import fires only the latest due step, not a burst", () => {
    expect(nextRecallStep(base, "2026-09-05")).toMatchObject({ action: "send", stepOffsetDays: 60 });
  });
  it("never sends a step missed by more than the grace window", () => {
    // Step 14 was due 07-14: 11 days late is inside the 14-day grace, 16 days late is not.
    expect(nextRecallStep(base, "2026-07-25")).toMatchObject({ action: "send", stepOffsetDays: 14 });
    expect(nextRecallStep(base, "2026-07-30")).toEqual({ action: "none", reason: "not_yet" });
    // The next step (60, due 08-29) still fires on time.
    expect(nextRecallStep(base, "2026-08-29")).toMatchObject({ action: "send", stepOffsetDays: 60 });
  });
  it("years-old visits are lapsed, never texted 'you are due'", () => {
    expect(nextRecallStep({ ...base, lastVisitOn: "2019-01-01" }, "2026-10-30")).toEqual({ action: "none", reason: "lapsed" });
  });
  it("ends after the last step", () => {
    expect(nextRecallStep({ ...base, stepsAlreadySent: [60] }, "2026-09-05")).toEqual({ action: "none", reason: "sequence_done" });
  });
  it("needs a visit to start", () => {
    expect(nextRecallStep({ ...base, lastVisitOn: null }, "2026-06-30")).toEqual({ action: "none", reason: "no_visit" });
  });
});

const tenAm = new Date("2026-10-30T02:00:00Z"); // 10:00 Manila
const contact: ContactState = {
  status: "active", muted: false, hasMobile: true,
  consent: { service: true, marketing: true }, lastVisitOn: "2026-09-01", pastSends: [],
};
const policy = { ...DEFAULT_POLICY, syncHealthy: true };
const mkt = { kind: "marketing" as const, campaignId: "c1", automated: true, now: tenAm };

describe("eligibility", () => {
  it("allows a consented marketing text in daytime", () => {
    expect(checkEligibility(contact, policy, mkt)).toEqual({ ok: true });
  });
  it("blocks muted, inactive and no-mobile contacts for every kind", () => {
    expect(checkEligibility({ ...contact, muted: true }, policy, { ...mkt, kind: "reminder" })).toMatchObject({ reason: "muted" });
    expect(checkEligibility({ ...contact, status: "deceased" }, policy, { ...mkt, kind: "recall" })).toMatchObject({ reason: "inactive_status" });
    expect(checkEligibility({ ...contact, hasMobile: false }, policy, mkt)).toMatchObject({ reason: "no_mobile" });
  });
  it("marketing needs explicit opt-in; reminders do not", () => {
    const noMkt = { ...contact, consent: { service: true } };
    expect(checkEligibility(noMkt, policy, mkt)).toMatchObject({ reason: "no_marketing_consent" });
    expect(checkEligibility(noMkt, policy, { ...mkt, kind: "reminder", campaignId: null })).toEqual({ ok: true });
  });
  it("honors a service opt-out", () => {
    expect(checkEligibility({ ...contact, consent: { service: false } }, policy, { ...mkt, kind: "recall" })).toMatchObject({ reason: "service_opted_out" });
  });
  it("never sends the same campaign twice", () => {
    const sent = { ...contact, pastSends: [{ kind: "marketing" as const, campaignId: "c1", sentAt: new Date("2026-09-20T02:00:00Z") }] };
    expect(checkEligibility(sent, policy, mkt)).toMatchObject({ reason: "duplicate_campaign" });
  });
  it("caps marketing at 2 per 30 days", () => {
    const two = { ...contact, pastSends: [
      { kind: "marketing" as const, campaignId: "a", sentAt: new Date("2026-10-05T02:00:00Z") },
      { kind: "marketing" as const, campaignId: "b", sentAt: new Date("2026-10-20T02:00:00Z") },
    ] };
    expect(checkEligibility(two, policy, mkt)).toMatchObject({ reason: "marketing_cap" });
  });
  it("no marketing within 7 days after a visit", () => {
    expect(checkEligibility({ ...contact, lastVisitOn: "2026-10-26" }, policy, mkt)).toMatchObject({ reason: "recent_visit" });
  });
  it("one recall text per contact per day, even with two pets due", () => {
    const recalledToday = { ...contact, pastSends: [{ kind: "recall" as const, campaignId: null, sentAt: new Date("2026-10-30T00:30:00Z") }] };
    expect(checkEligibility(recalledToday, policy, { ...mkt, kind: "recall", campaignId: null })).toMatchObject({ reason: "daily_recall_cap" });
  });
  it("recall and marketing never land on the same Manila day", () => {
    const recalledToday = { ...contact, pastSends: [{ kind: "recall" as const, campaignId: null, sentAt: new Date("2026-10-30T00:30:00Z") }] };
    expect(checkEligibility(recalledToday, policy, mkt)).toMatchObject({ reason: "same_day_collision" });
  });
  it("pauses automated sends when sync is stale, but not manual ones", () => {
    const stale = { ...policy, syncHealthy: false };
    expect(checkEligibility(contact, stale, mkt)).toMatchObject({ reason: "sync_stale" });
    expect(checkEligibility(contact, stale, { ...mkt, automated: false })).toEqual({ ok: true });
  });
  it("defers quiet-hour sends to 8am Manila", () => {
    const ninePm = new Date("2026-10-30T13:00:00Z"); // 21:00 Manila
    const r = checkEligibility(contact, policy, { ...mkt, now: ninePm });
    expect(r).toMatchObject({ reason: "quiet_hours" });
    if (!r.ok && r.reason === "quiet_hours") expect(r.deferUntil.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });
});

describe("sms", () => {
  it("counts GSM-7 and UCS-2 segments", () => {
    expect(measureSms("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1 });
    expect(measureSms("a".repeat(161))).toMatchObject({ segments: 2 });
    expect(measureSms("Hi 😊")).toMatchObject({ encoding: "UCS-2", segments: 1 });
    expect(measureSms("😊" + "a".repeat(69))).toMatchObject({ encoding: "UCS-2", segments: 2 });
    expect(measureSms("€".repeat(80))).toMatchObject({ encoding: "GSM-7", units: 160, segments: 1 });
    expect(measureSms("")).toMatchObject({ segments: 0 });
  });
  it("never splits an escape pair across segments", () => {
    expect(measureSms("a".repeat(152) + "€" + "a".repeat(152)).segments).toBe(3);
  });
  it("normalizes curly quotes and long dashes so AI drafts stay cheap", () => {
    expect(measureSms(normalizeForSms("Hi Ana \u2014 it\u2019s time")).encoding).toBe("GSM-7");
  });
  it("prices per segment at P0.56", () => {
    expect(smsCostCentavos("a".repeat(200))).toBe(112);
  });
  it("footer always has a reply path and a stop link on our domain", () => {
    const h = "revisit.example";
    expect(buildFooter({ replyPhone: "0917 123 4567", stopUrl: "https://revisit.example/s/x1", stopLinkHost: h })).toContain("Stop msgs: https://revisit.example/s/x1");
    expect(() => buildFooter({ stopUrl: "https://revisit.example/s/x1", stopLinkHost: h })).toThrow();
    expect(() => buildFooter({ replyPhone: "0917", stopUrl: "", stopLinkHost: h })).toThrow();
    expect(() => buildFooter({ replyPhone: "0917", stopUrl: "http://revisit.example/s/x1", stopLinkHost: h })).toThrow();
    expect(() => buildFooter({ replyPhone: "0917", stopUrl: "https://evil.com/s/x1", stopLinkHost: h })).toThrow();
    expect(buildFooter({ replyPhone: "  ", messengerUrl: "m.me/pawcare", stopUrl: "https://revisit.example/s/x1", stopLinkHost: h })).toContain("Reply: m.me/pawcare");
  });
  it("flags discount wording only in marketing", () => {
    const body = "Get 20% off cleaning this November";
    expect(checkContent(body, { kind: "marketing", nameTreatmentsAllowed: true }).map((i) => i.code)).toContain("discount_wording");
    expect(checkContent(body, { kind: "reminder", nameTreatmentsAllowed: true }).map((i) => i.code)).not.toContain("discount_wording");
  });
  it("catches shorteners next to punctuation", () => {
    for (const b of ["Go to bit.ly.", "(bit.ly)", "BIT.LY, now"]) {
      expect(checkContent(b, { kind: "recall", nameTreatmentsAllowed: true }).map((i) => i.code)).toContain("url_shortener");
    }
  });
  it("catches Taglish and singular treatment names", () => {
    for (const b of ["Bunot at pasta po", "Your brace adjustment is due", "RCT follow-up"]) {
      expect(checkContent(b, { kind: "recall", vertical: "dental", nameTreatmentsAllowed: false }).map((i) => i.code)).toContain("names_treatment");
    }
  });
  it("matches shorteners by hostname, not substring", () => {
    expect(checkContent("Book at pawcarevet.com/book", { kind: "recall", nameTreatmentsAllowed: true })).toEqual([]);
    expect(checkContent("Book at https://t.co/abc", { kind: "recall", nameTreatmentsAllowed: true }).map((i) => i.code)).toContain("url_shortener");
  });
  it("flags codes, rewards, peso-off and Filipino claim wording", () => {
    const mk = (b: string) => checkContent(b, { kind: "marketing", nameTreatmentsAllowed: true }).map((i) => i.code);
    expect(mk("Use code SMILE for a free gift")).toContain("discount_wording");
    expect(mk("Earn reward points every visit")).toContain("discount_wording");
    expect(mk("P500 off whitening")).toContain("discount_wording");
    expect(mk("Walang sakit na cleaning")).toContain("medical_claim");
    expect(mk("We now offer Saturday check-ups")).toEqual([]);
  });
  it("flags TEST prefix, shorteners, claims and named treatments", () => {
    const codes = checkContent("Test: painless root canal, book at bit.ly/x", { kind: "recall", nameTreatmentsAllowed: false }).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["starts_with_test", "url_shortener", "medical_claim", "names_treatment"]));
  });
});

describe("reviewer pass 2: content", () => {
  it("catches Filipino roots inside affixed words, and orthodontic", () => {
    for (const b of ["Pwede na po magpabunot", "Kailan po kayo pinapastahan", "Your orthodontic visit"]) {
      expect(checkContent(b, { kind: "recall", vertical: "dental", nameTreatmentsAllowed: false }).map((i) => i.code)).toContain("names_treatment");
    }
  });
  it("catches bitly.com and keeps peso amounts in cheap GSM-7", () => {
    expect(checkContent("see bitly.com/x", { kind: "recall", nameTreatmentsAllowed: true }).map((i) => i.code)).toContain("url_shortener");
    expect(measureSms(normalizeForSms("Fee is ₱500")).encoding).toBe("GSM-7");
  });
});

describe("compliance pass 2: word lists", () => {
  const mk = (b: string) => checkContent(normalizeForSms(b), { kind: "marketing", vertical: "dental", nameTreatmentsAllowed: false }).map((i) => i.code);
  it("flags purchase-linked freebies, contests and bundles, but not a plain free event", () => {
    for (const b of ["Libreng check-up with every cleaning", "Giveaway! Win a prize", "Buy one take one", "Half price this week", "Save P500", "20％ off", "20% less"]) {
      expect(mk(b)).toContain("discount_wording");
    }
    expect(mk("Free dental check-up day this Saturday")).not.toContain("discount_wording");
  });
  it("flags Filipino and shorthand results claims", () => {
    for (const b of ["Hindi masakit", "See our before & after", "Garantisado", "Risk-free", "No side effects"]) expect(mk(b)).toContain("medical_claim");
  });
  it("flags more dental treatments", () => {
    for (const b of ["ortho adjustment", "veneers", "crown", "cavity", "scaling", "wisdom tooth", "oral surgery", "x-ray"]) expect(mk(b)).toContain("names_treatment");
  });
  it("matches shorteners by parent domain", () => {
    for (const b of ["maps.app.goo.gl/x", "g.page/x", "forms.gle/x", "qrco.de/x", "j.mp/x", "t.me/x"]) expect(mk(b)).toContain("url_shortener");
  });
});

describe("contact state", () => {
  const at = (iso: string) => new Date(iso);
  const rec = (purpose: ConsentRecord["purpose"], granted: boolean, iso: string, linked = true): ConsentRecord =>
    ({ purpose, granted, recordedAt: at(iso), linked });

  it("the newest consent row wins per purpose; none recorded stays unknown", () => {
    expect(latestConsent([])).toEqual({});
    expect(latestConsent([
      rec("marketing", true, "2026-01-01T00:00:00Z"),
      rec("marketing", false, "2026-03-01T00:00:00Z"),
      rec("service", false, "2026-01-01T00:00:00Z"),
      rec("service", true, "2026-02-01T00:00:00Z"),
    ])).toEqual({ marketing: false, service: true });
    // Order of rows from the database doesn't matter.
    expect(latestConsent([rec("marketing", false, "2026-03-01T00:00:00Z"), rec("marketing", true, "2026-01-01T00:00:00Z")])).toEqual({ marketing: false });
  });
  it("on a tie the opt-out wins, whichever row comes first", () => {
    const t = "2026-05-01T00:00:00Z";
    expect(latestConsent([rec("marketing", true, t), rec("marketing", false, t)])).toEqual({ marketing: false });
    expect(latestConsent([rec("marketing", false, t), rec("marketing", true, t)])).toEqual({ marketing: false });
  });
  it("an erased contact's opt-out still counts; its opt-in never transfers", () => {
    expect(latestConsent([rec("marketing", true, "2026-01-01T00:00:00Z", false)])).toEqual({});
    expect(latestConsent([rec("service", false, "2026-01-01T00:00:00Z", false)])).toEqual({ service: false });
    // A newer opt-in by the new contact itself overrides an old orphaned opt-out.
    expect(latestConsent([rec("marketing", false, "2026-01-01T00:00:00Z", false), rec("marketing", true, "2026-06-01T00:00:00Z")])).toEqual({ marketing: true });
  });
  it("testimonial consent never counts as service or marketing consent", () => {
    expect(latestConsent([rec("testimonial", true, "2026-01-01T00:00:00Z")])).toEqual({});
  });
  it("an unreadable consent time or a non-ISO visit date throws instead of passing a check", () => {
    expect(() => latestConsent([rec("marketing", false, "not a date")])).toThrow();
    expect(() => latestVisit(["28/10/2026"], [])).toThrow(/YYYY-MM-DD/);
  });
  it("latest visit takes recorded visits and completed appointments on the Manila calendar", () => {
    expect(latestVisit([], [])).toBeNull();
    expect(latestVisit([null], [null])).toBeNull();
    expect(latestVisit(["2026-10-01", "2026-09-01"], [])).toBe("2026-10-01");
    // 17:30 UTC on Oct 30 is 01:30 on Oct 31 in Manila.
    expect(latestVisit(["2026-10-01"], [at("2026-10-30T17:30:00Z")])).toBe("2026-10-31");
  });
});

describe("routine visit words (Patrick, 2026-10-30)", () => {
  const dental = (body: string, sensitiveTerms: string[]) =>
    checkContent(body, { kind: "recall", vertical: "dental", nameTreatmentsAllowed: false, sensitiveTerms, allowVisitWords: true }).map((i) => i.code);

  it("cleaning, check-up and consultation pass even when they are the clinic's own service categories", () => {
    const categories = ["Cleaning", "Dental check-up", "Consultation", "Teeth cleaning", "Checkup", "Check up", "Annual check-ups"];
    for (const body of ["Hi Ana, your cleaning is due.", "Hi Ana, your dental check-up is due.", "Hi Ana, time for a consultation.",
      "Hi Ana, your teeth cleaning is due.", "Hi Ana, your checkup is due.", "Hi Ana, your annual check-ups are due."]) {
      expect(dental(body, categories)).toEqual([]);
    }
  });
  it("only a routine word, alone or after a generic qualifier, is allowed", () => {
    for (const t of ["cleaning", "Check-up", "check up", "checkups", "consultations", "Dental  cleaning", "routine check-up"]) expect(isAllowedVisitTerm(t)).toBe(true);
    for (const t of ["Cleaning and whitening", "Deep cleaning", "Ortho consultation", "Implant check-up", "Root canal", "", "and", "linis", "konsulta"]) expect(isAllowedVisitTerm(t)).toBe(false);
  });
  it("treatments still block, in a category or the default list, even next to an allowed word", () => {
    expect(dental("Hi Ana, your cleaning and whitening is due.", ["Cleaning and whitening"])).toContain("names_treatment");
    expect(dental("Hi Ana, your ortho consultation is due.", ["Ortho consultation"])).toContain("names_treatment");
    expect(dental("Hi Ana, your deep cleaning is due.", ["Deep cleaning"])).toContain("names_treatment");
    expect(dental("Hi Ana, your cleaning and scaling are due.", ["Cleaning"])).toContain("names_treatment");
    expect(dental("Hi Ana, your check-up and x-ray are due.", ["Dental check-up"])).toContain("names_treatment");
  });
});

describe("reviewer pass 5: the allowlist can't hide a treatment", () => {
  const dental = (body: string, sensitiveTerms: string[], allowVisitWords = true) =>
    checkContent(body, { kind: "recall", vertical: "dental", nameTreatmentsAllowed: false, sensitiveTerms, allowVisitWords }).map((i) => i.code);

  it("spacing, hyphens, line breaks and invisible characters don't split a blocked category", () => {
    const cats = ["Cleaning", "Deep cleaning"];
    for (const body of ["Your deep-cleaning is due", "Your deep  cleaning is due", "Your deep\ncleaning is due",
      "Your deep\u2010cleaning is due", "Your deep\u200bcleaning is due", "Your DEEP CLEANING is due"]) {
      expect(dental(body, cats)).toContain("names_treatment");
    }
    expect(dental("Your cleaning is due", cats)).toEqual([]);
  });
  it("the other words of a category built on a routine word block on their own", () => {
    expect(dental("Your consultation for HIV is due", ["Consultation", "HIV consultation"])).toContain("names_treatment");
    expect(dental("Your HIV consultation is due", ["HIV  consultation"])).toContain("names_treatment");
    expect(dental("Cleaning, the deep kind, is due", ["Deep cleaning"])).toContain("names_treatment");
    // ...but plain words in such a category ("and", "visit") never block a text by themselves.
    expect(dental("Your cleaning is due. See you at your visit", ["Cleaning visit", "Cleaning and polish"])).toEqual([]);
  });
  it("check-up, checkup and check up are one word for matching", () => {
    for (const body of ["Your prenatal checkup is due", "Your prenatal check up is due", "Your prenatal check-up is due"]) {
      expect(dental(body, ["Prenatal check-up"])).toContain("names_treatment");
    }
  });
  it("texts about a dependent don't get the allowlist", () => {
    expect(dental("Mika's check-up is due", ["Dental check-up"], false)).toContain("names_treatment");
    expect(dental("Mika's checkup is due", ["Teeth cleaning", "Check up"], false)).toContain("names_treatment");
    expect(dental("Mika's check-up is due", ["Dental check-up"])).toEqual([]);
  });
  it("default treatment terms still match through the same normalisation", () => {
    for (const body of ["Your x-ray is due", "Your x ray is due", "Your root\ncanal is due"]) expect(dental(body, [])).toContain("names_treatment");
  });
});


describe("reviewer pass 6: category words match whole and short words count", () => {
  const dental = (body: string, sensitiveTerms: string[], allowVisitWords = true) =>
    checkContent(body, { kind: "recall", vertical: "dental", nameTreatmentsAllowed: false, sensitiveTerms, allowVisitWords });
  const codes = (body: string, terms: string[], allow = true) => dental(body, terms, allow).map((i) => i.code);

  it("R47: 2-letter category words (TB, OB, ED) block on their own", () => {
    expect(codes("Your TB check-up is due", ["TB check-up"])).toContain("names_treatment");
    expect(codes("Your OB consultation is due", ["OB consultation"])).toContain("names_treatment");
    expect(codes("Hi Ana, ED follow-up: your check-up is due", ["ED check-up"])).toContain("names_treatment");
    expect(codes("Your check-up is due", ["TB check-up", "Check-up"])).toEqual([]);
  });
  it("R48: category words match as whole words (plurals too), so STI never blocks still and a doctor's name never blocks a longer first name", () => {
    expect(codes("We still have slots for your consultation", ["STI consultation"])).toEqual([]);
    expect(codes("Your STI consultation is due", ["STI consultation"])).toContain("names_treatment");
    expect(codes("Hi Lima, your consultation is due", ["Dr Lim consultation"])).toEqual([]);
    expect(codes("Your implants check is due", ["Implant"])).toContain("names_treatment");
    expect(codes("We still have slots", ["STI"])).toEqual([]);
    expect(codes("Your STIs screening is due", ["STI"])).toContain("names_treatment");
  });
  it("R49: a hyphen or dot inside the word doesn't split it, on either side", () => {
    expect(codes("Your pre-natal visit is due", ["Prenatal"])).toContain("names_treatment");
    expect(codes("Your pre.natal visit is due", ["Prenatal"])).toContain("names_treatment");
    expect(codes("Your prenatal visit is due", ["Pre-natal"])).toContain("names_treatment");
    expect(codes("Your deep​cleaning is due", ["Deep cleaning"])).toContain("names_treatment");
  });
  it("R51: every multi-word clinic category blocks its words alone, not only categories built on a routine word", () => {
    expect(codes("Your test for HIV is due", ["HIV test"])).toContain("names_treatment");
    expect(codes("Your test is due", ["HIV test"])).toEqual([]);
    expect(codes("Your fluoride is due", ["Kids fluoride"])).toContain("names_treatment");
  });
  it("R52: a category starting or ending with punctuation still matches", () => {
    expect(codes("Your HIV consultation is due", ["(HIV) consultation"])).toContain("names_treatment");
    expect(codes("Your prenatal care is due", ["*Prenatal*"])).toContain("names_treatment");
  });
  it("R53/R54: invisible, full-width and accented characters can't hide a word; non-ASCII letters stay one word", () => {
    expect(codes("Your H⁣IV consultation is due", ["HIV consultation"])).toContain("names_treatment");
    expect(codes("Your H‪IV consultation is due", ["HIV consultation"])).toContain("names_treatment");
    expect(codes("Your ＨＩＶ consultation is due", ["HIV consultation"])).toContain("names_treatment");
    expect(codes("Your éxtractión is due", [])).toContain("names_treatment");
    // "Peña" is one word: the category word "pena" doesn't fall apart into "pe" and "a".
    expect(codes("Hi Ana, your consultation is due", ["Peña consultation"])).toEqual([]);
    expect(codes("Hi Ana, your Peña consultation is due", ["Peña consultation"])).toContain("names_treatment");
  });
  it("R55: a category of only routine words joined by and is allowed", () => {
    for (const t of ["Cleaning and check-up", "Dental cleaning & check-up", "Check-up, cleaning"]) expect(isAllowedVisitTerm(t)).toBe(true);
    expect(codes("Your cleaning and check-up are due", ["Cleaning and check-up"])).toEqual([]);
    // Still strict for a text about someone else.
    expect(codes("Mika's cleaning and check-up are due", ["Cleaning and check-up"], false)).toContain("names_treatment");
  });
  it("R56: the block message names the clinic service the word came from", () => {
    const msg = dental("Your consultation for fluoride is due", ["Fluoride consultation"]).map((i) => i.message).join(" ");
    expect(msg).toContain('"fluoride"');
    expect(msg).toContain('clinic service "Fluoride consultation"');
  });
  it("Patrick: English words only; linis and konsulta are not on the allowlist", () => {
    expect(codes("Oras na ng linis mo", ["Linis"])).toContain("names_treatment");
    expect(codes("Oras na ng konsulta mo", ["Konsulta"])).toContain("names_treatment");
  });
  it("the allowlist is off unless the caller turns it on", () => {
    const off = checkContent("Your check-up is due", { kind: "recall", vertical: "dental", nameTreatmentsAllowed: false, sensitiveTerms: ["Dental check-up"] });
    expect(off.map((i) => i.code)).toContain("names_treatment");
  });
  it("the allowlist applies to every human clinic, not only dental", () => {
    const aesthetic = (b: string, t: string[]) => checkContent(b, { kind: "recall", vertical: "aesthetic", nameTreatmentsAllowed: false, sensitiveTerms: t, allowVisitWords: true }).map((i) => i.code);
    expect(aesthetic("Your consultation is due", ["Consultation"])).toEqual([]);
    expect(aesthetic("Your skin consultation is due", ["Skin consultation"])).toContain("names_treatment");
  });
});

describe("reviewer round 4 and compliance pass 4", () => {
  const codes = (body: string, sensitiveTerms: string[], allowVisitWords = true) =>
    checkContent(body, { kind: "recall", vertical: "dental", nameTreatmentsAllowed: false, sensitiveTerms, allowVisitWords }).map((i) => i.code);

  it("R58/R63: a category of 4+ letters blocks its longer forms; a short one stays whole-word", () => {
    expect(codes("Your psychiatry visit is due", ["Psych"])).toContain("names_treatment");
    expect(codes("Your oncology follow-up is due", ["Onco"])).toContain("names_treatment");
    expect(codes("Your dermatology visit is due", ["Derma"])).toContain("names_treatment");
    expect(codes("Your cardiology visit is due", ["Cardio consultation"])).toContain("names_treatment");
    expect(codes("We still have slots for your visit", ["STI"])).toEqual([]);
  });
  it("R59: numbers and time units in a category never block alone", () => {
    expect(codes("Your visit on Oct 30 is due", ["Cleaning (30 min)"])).toEqual([]);
    expect(codes("See you next month for your check-up", ["6-month check-up"])).toEqual([]);
  });
  it("R64: every word of a category blocks, even after a title; a doctor's name in the wording fails closed", () => {
    expect(codes("Your TB check-up is due", ["Doctor TB check-up"])).toContain("names_treatment");
    expect(codes("Your derma consultation is due", ["Dra. Derma consultation"])).toContain("names_treatment");
    expect(codes("Dra. Ana says your check-up is due", ["Consultation with Dra. Ana"])).toContain("names_treatment");
    // checkContent judges exactly the text it is given; the pipeline passes the template with names masked.
    expect(checkContent("Hi Ana, your check-up is due", { kind: "recall", vertical: "dental", nameTreatmentsAllowed: false, sensitiveTerms: ["Dr Ana consultation"], allowVisitWords: true }).map((i) => i.code)).toContain("names_treatment");
  });
  it("R65: short forms of the routine words count as routine words", () => {
    for (const t of ["Consult", "Check", "Clean", "Dental consult"]) expect(isAllowedVisitTerm(t)).toBe(true);
    expect(codes("Time for your consultation", ["Consult"])).toEqual([]);
    expect(codes("Your check-up is due", ["Health check"])).toEqual([]);
    expect(codes("Your cleaning is due", ["Clean & polish"])).toEqual([]);
    expect(codes("Your polish is due", ["Clean & polish"])).toContain("names_treatment");
    // Not for texts about someone else.
    expect(codes("Mika's consultation is due", ["Consult"], false)).toContain("names_treatment");
  });
  it("R68: ordinals in a category never block alone", () => {
    expect(codes("Your 2nd visit is due", ["Braces 2nd"])).toEqual([]);
  });
  it("G18/G19: more sensitive care is blocked by default; aids matches whole words only", () => {
    for (const b of ["Your TB check-up is due", "Your TB-DOTS visit is due", "Your infertility consultation is due", "Your OB consultation is due",
      "Your HPV shot is due", "Your PCOS check-up is due", "Your ADHD consultation is due", "Your depression check-up is due",
      "Your menopause consultation is due", "Buntis check-up", "Your tuli schedule", "Your kidney check-up", "Your therapy session",
      "Your breast exam is due", "Your hormone consultation", "Your drug test is due", "Your AIDS consultation"]) {
      expect(codes(b, ["Check-up", "Consultation"])).toContain("names_treatment");
    }
    // Accepted, fails closed: no word rule can tell "hearing aids" from AIDS, so it blocks too. "Hearing aid" passes.
    expect(codes("Bring your hearing aids to your check-up", ["Check-up"])).toContain("names_treatment");
    expect(codes("Bring your hearing aid to your check-up", ["Check-up"])).toEqual([]);
  });
  it("R61: known limit, kept on purpose: a plain space inside a clinic word is not rejoined", () => {
    expect(codes("Your pre natal visit is due", ["Prenatal"])).toEqual([]);
  });
  it("R62: blank characters that count as letters can't hide a word", () => {
    expect(codes("Your deep\u3164cleaning is due", ["Deep cleaning"])).toContain("names_treatment");
    expect(codes("Your deep\u2800cleaning is due", ["Deep cleaning"])).toContain("names_treatment");
  });
  it("G14: sensitive care before an allowed word blocks even when the clinic's only category is Check-up", () => {
    for (const b of ["Your STD check-up is due", "Your pregnancy check-up is due", "Your pap smear consultation is due",
      "Your OB-GYN check-up is due", "Your HIV consultation is due", "Your psychiatric consultation is due", "Your prenatal check-up is due"]) {
      expect(codes(b, ["Check-up", "Consultation"])).toContain("names_treatment");
    }
    // Ordinary words that start like a short stem still pass.
    expect(codes("We still have a slot; your check-up is due", ["Check-up"])).toEqual([]);
  });
});

describe("derived names and the clinic name (2026-10-31 direction)", () => {
  it("cleanFirstName keeps only the first word of a name, without notes", () => {
    const cases: [string | null, string | null][] = [
      ["Ana Cruz (braces)", "Ana"], ["Ana Cruz HIV", "Ana"], ["Ana (braces", "Ana"], ["(HIV) Ana Cruz", "Ana"],
      ["[note] ben lim", "Ben"], ["Juan - diabetic", "Juan"], ["Juan \u2013 rehab", "Juan"], ["ana-marie de la cruz", "Ana-Marie"],
      ["O'NEIL", "O'Neil"], ["Ma. Luisa", "Ma"], ["Jos\u00e9 Rizal", "Jos\u00e9"], ["  \u674e\u5c0f\u9f99 ", "\u674e\u5c0f\u9f99"],
      ["Ana50%off", "Ana"], ["Ana+HIV", "Ana"], ["#Ben", "Ben"], ["Bartholomewbartholomew Cruz", "Bartholomewbartholom"], ["-Ana-", "Ana"],
      ["123", null], ["", null], ["(note only)", null], [null, null],
    ];
    for (const [raw, want] of cases) expect(cleanFirstName(raw)).toBe(want);
  });
  it("a cleaned name that is itself a default sensitive word is caught, whole words only", () => {
    for (const n of ["Hiv", "Botox", "Tuli", "Implants"]) expect(nameIssues(n, "dental").map((i) => i.code)).toContain("names_treatment");
    for (const n of ["Stephanie", "Cardinal", "Ana", "Crownie"]) expect(nameIssues(n, "dental")).toEqual([]);
    expect(nameIssues("Hiv", "vet")).toEqual([]);
  });
  it("the clinic name is judged against the default list when it is set", () => {
    for (const n of ["Smile Implant Center", "Manila HIV and Rehab Center", "Psych Wellness Center"]) expect(clinicNameIssues(n, "other").length).toBeGreaterThan(0);
    for (const n of ["Paw Care", "Cardinal Dental", "Tuliahan Family Clinic", "Smile"]) expect(clinicNameIssues(n, "dental")).toEqual([]);
  });
  it("R73: stems made specific so place and ordinary words pass; the care words still block", () => {
    const codes = (b: string) => checkContent(b, { kind: "recall", vertical: "dental", nameTreatmentsAllowed: false }).map((i) => i.code);
    for (const b of ["Our new branch near Cardinal Santos is open", "Free cardio dance on Saturday", "Our Tuliahan branch is open",
      "Breastfeeding mothers welcome", "Meet our new therapist"]) expect(codes(b)).toEqual([]);
    for (const b of ["Your cardiac check is due", "Your cardiology visit", "Your tuli schedule", "Magpatuli na", "Your breast exam",
      "Your therapy session", "Your physiotherapy is due"]) expect(codes(b)).toContain("names_treatment");
  });
});
