import { describe, expect, it, vi } from "vitest";
import { normalizePhMobile } from "../src/import/phone.js";
import { guessMapping, importCsv, normalizeDate, parseCsv, parseCsvRows } from "../src/import/csv.js";
import { syncHealth } from "../src/sync/health.js";
import { batch, SemaphoreClient } from "../src/integrations/semaphore.js";
import { eventKey, prepareSms, type PreparedSms } from "../src/send/pipeline.js";
import { DEFAULT_POLICY } from "../src/domain/eligibility.js";

const bounds = { min: "2000-01-01", max: "2026-10-30" };
const opts = (over = {}) => ({
  muted: { mobiles: new Set<string>(), emails: new Set<string>() },
  serviceCategories: ["Dental check-up"],
  dateBounds: bounds,
  ...over,
});

describe("PH mobile normalization", () => {
  it.each([
    ["09171234567", "639171234567"],
    ["0917-123-4567", "639171234567"],
    ["+63 917 123 4567", "639171234567"],
    ["639171234567", "639171234567"],
    ["9171234567", "639171234567"],
  ])("%s -> %s", (raw, want) => expect(normalizePhMobile(raw)).toBe(want));
  it.each(["(045) 888-1234", "0281234567", "12345", "", "abc"])("rejects %s", (raw) => expect(normalizePhMobile(raw)).toBeNull());
});

describe("CSV parsing", () => {
  it("parses quotes, commas and CRLF", () => {
    expect(parseCsv('a,b\r\n"Cruz, Ana","say ""hi"""\r\n')).toEqual([["a", "b"], ["Cruz, Ana", 'say "hi"']]);
  });
  it("keeps true source line numbers across blank and multiline rows", () => {
    const rows = parseCsvRows('h1,h2\n\n"multi\nline",x\ny,z\n');
    expect(rows.map((r) => r.line)).toEqual([1, 3, 5]);
  });
  it("rejects a file that ends inside a quote instead of swallowing rows", () => {
    expect(() => parseCsv('Name,Mobile\n"Ana,0917\nBen,0918\n')).toThrow(/Unclosed quote/);
  });
  it("guesses columns from English and Filipino headers", () => {
    expect(guessMapping(["Pangalan", "CP #", "Pet Name", "Last Visit"])).toEqual({ full_name: 0, mobile: 1, asset_label: 2, last_visit_on: 3 });
  });
  it("in vet files, texts go to the owner, not the pet", () => {
    expect(guessMapping(["Patient", "Owner", "Mobile"])).toMatchObject({ full_name: 1, asset_label: 0, mobile: 2 });
  });
});

describe("dates", () => {
  it("normalizes PH formats", () => {
    expect(normalizeDate("10/05/2026")).toBe("2026-10-05");
    expect(normalizeDate("March 3, 2026")).toBe("2026-03-03");
    expect(normalizeDate("3 Mar 2026")).toBe("2026-03-03");
  });
  it.each(["12", "1", "0", "Feb 30, 2026", "2026-02-29", "31/31/2026", "next week"])("rejects %s", (raw) => {
    expect(normalizeDate(raw)).toBeNull();
  });
  it("rejects future and ancient visit dates", () => {
    expect(normalizeDate("2099-01-01", bounds)).toBeNull();
    expect(normalizeDate("1998-05-01", bounds)).toBeNull();
    expect(normalizeDate("2026-10-30", bounds)).toBe("2026-10-30");
  });
});

describe("import", () => {
  it("imports clean rows, rejects bad ones, and never re-adds muted numbers", () => {
    const csv = [
      "Name,Mobile,Pet Name,Last Visit",
      "Ana Cruz,0917 123 4567,Bantay,10/05/2026",
      "Ben Reyes,09181112222,Mingming,2026-09-01",
      ",09190000000,X,2026-09-01",
      "Carla Dizon,(045) 888-1234,Choco,2026-09-01",
      "Dan Lim,09171119999,Brownie,31/31/2026",
    ].join("\n");
    const res = importCsv(csv, opts({ muted: { mobiles: new Set(["639181112222"]), emails: new Set() } }));
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ fullName: "Ana Cruz", mobile: "639171234567", assetLabel: "Bantay", lastVisitOn: "2026-10-05" });
    expect(res.skippedMuted).toBe(1);
    expect(res.rejected.map((r) => r.line)).toEqual([4, 5, 6]);
  });
  it("a junk email does not rescue an unusable number", () => {
    const res = importCsv("Name,Mobile,Email\nAna,(045) 888-1234,n/a\n", opts());
    expect(res.rows).toHaveLength(0);
    expect(res.rejected).toHaveLength(1);
  });
  it("merges duplicates in one file, keeping the latest visit", () => {
    const csv = "Name,Mobile,Pet,Last Visit\nAna,09171234567,Bantay,2026-03-01\nAna Cruz,0917 123 4567,Bantay,2026-09-01\nAna,09171234567,Mingming,2026-01-01\n";
    const res = importCsv(csv, opts());
    expect(res.mergedDuplicates).toBe(1);
    expect(res.rows.map((r) => [r.assetLabel, r.lastVisitOn])).toEqual([["Bantay", "2026-09-01"], ["Mingming", "2026-01-01"]]);
  });
  it("never re-adds a muted email-only contact", () => {
    const csv = "Name,Email\nAna Cruz,ANA@example.com\nBen Reyes,ben@example.com\n";
    const res = importCsv(csv, opts({ muted: { mobiles: new Set(), emails: new Set(["ana@example.com"]) } }));
    expect(res.skippedMuted).toBe(1);
    expect(res.rows.map((r) => r.fullName)).toEqual(["Ben Reyes"]);
  });
  it("maps service text onto clinic categories and drops clinical free text", () => {
    const csv = "Name,Mobile,Service\nAna,09171234567,dental check-up\nBen,09181234567,RCT #14 abscess\n";
    const res = importCsv(csv, opts());
    expect(res.rows.map((r) => r.serviceCategory)).toEqual(["Dental check-up", null]);
    expect(res.unmappedServices).toBe(1);
  });
  it("rejection reasons never echo row content", () => {
    const res = importCsv("Name,Mobile\nAna,(045) 888-1234\n", opts());
    expect(res.rejected[0]!.reason).not.toContain("888");
  });
});

describe("sync health", () => {
  const now = new Date("2026-10-30T02:00:00Z");
  const h = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600_000);
  it("healthy within 72 hours", () => {
    expect(syncHealth([{ finishedAt: h(10), ok: true }], now).healthy).toBe(true);
  });
  it("pauses when stale, failed, unknown or never synced", () => {
    expect(syncHealth([{ finishedAt: h(80), ok: true }], now)).toMatchObject({ healthy: false, reason: "stale" });
    expect(syncHealth([{ finishedAt: h(5), ok: true }, { finishedAt: h(1), ok: false }], now)).toMatchObject({ reason: "last_run_failed" });
    expect(syncHealth([{ finishedAt: h(5), ok: true }, { finishedAt: h(1), ok: null }], now)).toMatchObject({ reason: "last_run_failed" });
    expect(syncHealth([], now)).toMatchObject({ reason: "never_synced" });
  });
});

const clinic = {
  vertical: "vet" as const, senderName: "PAWCARE", senderNameApproved: true, nameTreatmentsAllowed: false,
  replyPhone: "0917 555 0000", serviceCategories: ["Rabies vaccine"],
};
const contact = {
  status: "active" as const, muted: false, hasMobile: true, mobile: "639171234567",
  consent: { service: true, marketing: true }, lastVisitOn: "2026-09-01", pastSends: [],
};
const tenAm = new Date("2026-10-30T02:00:00Z");
const recallEvent = { type: "recall" as const, assetId: "a1", ruleId: "r1", dueOn: "2026-10-30", stepOffsetDays: 0 };
const prep = (over: Partial<Parameters<typeof prepareSms>[0]> = {}) =>
  prepareSms({
    clinic, contact, policy: { ...DEFAULT_POLICY, syncHealthy: true }, now: tenAm,
    approval: { type: "automation", automationId: "recall-rule:r1", approvedBy: "admin@pawcare" },
    event: recallEvent, sentEventKeys: new Set(),
    body: "Hi Ana, Bantay is due for his rabies vaccine.", stopUrl: "https://revisit.example/s/x1", stopLinkHost: "revisit.example",
    ...over,
  });

describe("send pipeline", () => {
  it("appends reply path and stop link, and carries the event key", () => {
    const r = prep();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sms.body).toMatch(/Reply: 0917 555 0000\nStop msgs: https:\/\/revisit\.ph\/s\/x1$/);
      expect(r.sms.eventKey).toBe("recall:a1:r1:2026-10-30:0");
    }
  });
  it("refuses anything without a human approval", () => {
    expect(prep({ approval: null })).toMatchObject({ ok: false, reason: "not_approved" });
    expect(prep({ approval: { type: "automation", automationId: "recall-rule:r1", approvedBy: " " } })).toMatchObject({ ok: false, reason: "not_approved" });
    const campaign = { type: "campaign" as const, campaignId: "c1" };
    expect(prep({ event: campaign, approval: { type: "campaign", campaignId: "c2", approvedBy: "x" } })).toMatchObject({ ok: false, reason: "not_approved" });
  });
  it("never sends the same event twice", () => {
    expect(prep({ sentEventKeys: new Set([eventKey(recallEvent)]) })).toMatchObject({ ok: false, reason: "already_sent" });
  });
  it("refuses empty or foreign stop links", () => {
    expect(prep({ stopUrl: "" })).toMatchObject({ ok: false, reason: "bad_stop_link" });
    expect(prep({ stopUrl: "https://bit.ly/x" })).toMatchObject({ ok: false, reason: "bad_stop_link" });
  });
  it("vet reminders may name pet care; human clinics may not name their services", () => {
    expect(prep().ok).toBe(true);
    const dental = { ...clinic, vertical: "dental" as const, serviceCategories: ["Root canal follow-up"] };
    expect(prep({ clinic: dental, body: "Hi Ana, your root canal follow-up is due." })).toMatchObject({ ok: false, reason: "content" });
  });
  it("blocks unapproved sender names and ineligible contacts", () => {
    expect(prep({ clinic: { ...clinic, senderNameApproved: false } })).toMatchObject({ ok: false, reason: "sender_not_approved" });
    expect(prep({ contact: { ...contact, muted: true } })).toMatchObject({ ok: false, reason: "muted" });
  });
  it("blocks promo wording in marketing texts", () => {
    const event = { type: "campaign" as const, campaignId: "c1" };
    const r = prep({ event, approval: { type: "campaign", campaignId: "c1", approvedBy: "x" }, body: "Use code PAW100 for P100 off grooming!" });
    expect(r).toMatchObject({ ok: false, reason: "content" });
  });
  it("a campaign send is always gated as marketing, whatever the caller intends", () => {
    // Reviewer probe: promo body, no marketing consent, visit yesterday. Must be blocked.
    const event = { type: "campaign" as const, campaignId: "c1" };
    const approval = { type: "campaign" as const, campaignId: "c1", approvedBy: "x" };
    const noConsent = { ...contact, consent: { service: true }, lastVisitOn: "2026-10-29" };
    expect(prep({ event, approval, contact: noConsent, body: "Clinic news" })).toMatchObject({ ok: false, reason: "no_marketing_consent" });
    const r = prep({ event, approval, body: "We now offer Saturday hours" });
    expect(r.ok && r.sms.kind).toBe("marketing");
  });
  it("an approval only covers its own event", () => {
    expect(prep({ approval: { type: "campaign", campaignId: "unrelated", approvedBy: "x" } })).toMatchObject({ reason: "not_approved" });
    expect(prep({ approval: { type: "automation", automationId: "recall-rule:other", approvedBy: "x" } })).toMatchObject({ reason: "not_approved" });
    expect(prep({ approval: { type: "automation", automationId: "reminders", approvedBy: "x" } })).toMatchObject({ reason: "not_approved" });
  });
  it("only a person pressing send can go ahead while sync is stale", () => {
    const stale = { ...DEFAULT_POLICY, syncHealthy: false };
    const event = { type: "campaign" as const, campaignId: "c1" };
    expect(prep({ policy: stale })).toMatchObject({ reason: "sync_stale" });
    expect(prep({ policy: stale, event, approval: { type: "campaign", campaignId: "c1", approvedBy: "x" }, body: "Clinic news" })).toMatchObject({ reason: "sync_stale" });
    expect(prep({ policy: stale, event, approval: { type: "campaign", campaignId: "c1", approvedBy: "x", sendingNow: true }, body: "Clinic news" }).ok).toBe(true);
  });
  it("checks clinic-entered footer links for shorteners", () => {
    expect(prep({ clinic: { ...clinic, replyPhone: null, messengerUrl: "https://bit.ly/x" } })).toMatchObject({ ok: false, reason: "content" });
  });
});

describe("Semaphore client", () => {
  const fetchReturning = (json: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => json, text: async () => "" }));
  const prepared = () => { const r = prep(); if (!r.ok) throw new Error("expected prepared"); return r.sms; };

  it("sends only prepared texts, with the sender name", async () => {
    const fetchImpl = fetchReturning([{ message_id: 1, recipient: "639171234567", status: "Queued" }]);
    const res = await new SemaphoreClient("key123", fetchImpl).send([prepared()]);
    expect(res.accepted).toHaveLength(1);
    const call = (fetchImpl.mock.calls[0] as unknown) as [string, { body: string }];
    const body = new URLSearchParams(call[1].body);
    expect(body.get("sendername")).toBe("PAWCARE");
    expect(body.get("message")).toContain("Stop msgs:");
  });
  it("refuses a hand-built message that skipped the pipeline", async () => {
    const forged = { kind: "recall", mobile: "639171234567", body: "Hello", senderName: "PAWCARE", segments: 1, eventKey: "x" } as PreparedSms;
    await expect(new SemaphoreClient("k", fetchReturning([])).send([forged])).rejects.toThrow(/prepareSms/);
  });
  it("reports error objects and failed messages instead of dropping them", async () => {
    const err = await new SemaphoreClient("k", fetchReturning({ sendername: ["invalid"] })).send([prepared()]);
    expect(err).toMatchObject({ accepted: [], errors: ["unexpected response shape"] });
    const failed = await new SemaphoreClient("k", fetchReturning([{ message_id: 2, recipient: "639171234567", status: "Failed" }])).send([prepared()]);
    expect(failed.accepted).toHaveLength(0);
    expect(failed.failed).toHaveLength(1);
  });
  it("never texts the same number twice in one call", async () => {
    const fetchImpl = fetchReturning([]);
    const a = prepared(); const b = prepared();
    await new SemaphoreClient("k", fetchImpl).send([a, b]);
    const call = (fetchImpl.mock.calls[0] as unknown) as [string, { body: string }];
    expect(new URLSearchParams(call[1].body).get("number")).toBe("639171234567");
  });
  it("batches recipients by 1,000", () => {
    expect(batch(Array.from({ length: 2500 }, (_, i) => i)).map((b) => b.length)).toEqual([1000, 1000, 500]);
  });
});

describe("reviewer pass 2: import edge cases", () => {
  const opts = { muted: { mobiles: new Set<string>(), emails: new Set<string>() }, serviceCategories: ["Check-up", "Vaccine"], dateBounds: { min: "2000-01-01", max: "2026-10-30" } };

  it("a stray mid-field quote never swallows later rows", () => {
    const rows = parseCsvRows('name,mobile\nAna "Bing" Cruz,09171234567\nBen,09181234567\nCar "x,09191234567\n');
    expect(rows.map((r) => r.cells[0])).toEqual(["name", 'Ana "Bing" Cruz', "Ben", 'Car "x']);
  });
  it("family members sharing one number become dependents, not dropped", () => {
    const r = importCsv("name,mobile,service\nAna Cruz,09171234567,Check-up\nBen Cruz,09171234567,Check-up\n", opts);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1]).toMatchObject({ fullName: "Ana Cruz", assetLabel: "Ben Cruz", assetKind: "dependent" });
    expect(r.dependentsGrouped).toBe(1);
  });
  it("one email never ends up on two contacts", () => {
    const r = importCsv("name,mobile,email\nAna,09171234567,a@x.com\nAna,09181234567,a@x.com\n", opts);
    expect(r.rows.filter((x) => x.email === "a@x.com")).toHaveLength(1);
    expect(r.emailsDropped).toBe(1);
  });
  it("maps vet species wording onto the schema list", () => {
    const r = importCsv("owner,patient,species,mobile\nAna,Bantay,Canine,09171234567\nAna,Mingming,Pusa,09171234567\nAna,Nemo,Fish,09171234567\n", opts);
    expect(r.rows.map((x) => x.species)).toEqual(["dog", "cat", "other"]);
    expect(r.rows.every((x) => x.assetKind === "pet")).toBe(true);
  });
  it("detects DD/MM files instead of misreading them", () => {
    const r = importCsv("name,mobile,last visit\nAna,09171234567,05/06/2024\nBen,09181234567,25/06/2024\n", opts);
    expect(r.dateOrder).toBe("DMY");
    expect(r.rows.map((x) => x.lastVisitOn)).toEqual(["2024-06-05", "2024-06-25"]);
    expect(importCsv("name,mobile,last visit\nAna,09171234567,05/06/2024\n", opts).rows[0]!.lastVisitOn).toBe("2024-05-06");
  });
  it("a sync that 'finished' in the future is not trusted", () => {
    const now = new Date("2026-10-30T02:00:00Z");
    expect(syncHealth([{ finishedAt: new Date(now.getTime() + 3600_000), ok: true }], now)).toMatchObject({ healthy: false, reason: "clock_skew" });
  });
});
