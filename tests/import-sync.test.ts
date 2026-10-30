import { describe, expect, it, vi } from "vitest";
import { normalizePhMobile } from "../src/import/phone.js";
import { guessMapping, importCsv, normalizeDate, parseCsv } from "../src/import/csv.js";
import { syncHealth } from "../src/sync/health.js";
import { batch, SemaphoreClient } from "../src/integrations/semaphore.js";
import { prepareSms, type PreparedSms } from "../src/send/pipeline.js";
import { DEFAULT_POLICY } from "../src/domain/eligibility.js";

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

describe("CSV", () => {
  it("parses quotes, commas and CRLF", () => {
    expect(parseCsv('a,b\r\n"Cruz, Ana","say ""hi"""\r\n')).toEqual([["a", "b"], ["Cruz, Ana", 'say "hi"']]);
  });
  it("guesses columns from English and Filipino headers", () => {
    expect(guessMapping(["Pangalan", "CP #", "Pet Name", "Last Visit"])).toEqual({ full_name: 0, mobile: 1, asset_label: 2, last_visit_on: 3 });
  });
  it("normalizes PH dates and rejects impossible ones", () => {
    expect(normalizeDate("10/05/2026")).toBe("2026-10-05");
    expect(normalizeDate("2026-02-29")).toBeNull();
    expect(normalizeDate("March 3, 2026")).toBe("2026-03-03");
  });
  it("imports clean rows, rejects bad ones, and never re-adds muted numbers", () => {
    const csv = [
      "Name,Mobile,Pet Name,Last Visit",
      "Ana Cruz,0917 123 4567,Bantay,10/05/2026",
      "Ben Reyes,09181112222,Mingming,2026-09-01",
      ",09190000000,X,2026-09-01",
      "Carla Dizon,(045) 888-1234,Choco,2026-09-01",
      "Dan Lim,09171119999,Brownie,31/31/2026",
    ].join("\n");
    const res = importCsv(csv, { muted: { mobiles: new Set(["639181112222"]), emails: new Set() }, serviceCategories: [] });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ fullName: "Ana Cruz", mobile: "639171234567", assetLabel: "Bantay", lastVisitOn: "2026-10-05" });
    expect(res.skippedMuted).toBe(1);
    expect(res.rejected.map((r) => r.line)).toEqual([4, 5, 6]);
  });
});

describe("sync health", () => {
  const now = new Date("2026-10-30T02:00:00Z");
  const h = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600_000);
  it("healthy within 72 hours", () => {
    expect(syncHealth([{ finishedAt: h(10), ok: true }], now).healthy).toBe(true);
  });
  it("pauses when stale, failed or never synced", () => {
    expect(syncHealth([{ finishedAt: h(80), ok: true }], now)).toMatchObject({ healthy: false, reason: "stale" });
    expect(syncHealth([{ finishedAt: h(5), ok: true }, { finishedAt: h(1), ok: false }], now)).toMatchObject({ reason: "last_run_failed" });
    expect(syncHealth([], now)).toMatchObject({ reason: "never_synced" });
  });
});

const opts = (over = {}) => ({ muted: { mobiles: new Set<string>(), emails: new Set<string>() }, serviceCategories: ["Dental check-up"], ...over });

describe("import privacy", () => {
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

const clinic = {
  vertical: "vet" as const, senderName: "PAWCARE", senderNameApproved: true, nameTreatmentsAllowed: false,
  replyPhone: "0917 555 0000", serviceCategories: ["Rabies vaccine"],
};
const contact = {
  status: "active" as const, muted: false, hasMobile: true, mobile: "639171234567",
  consent: { service: true, marketing: true }, lastVisitOn: "2026-09-01", pastSends: [],
};
const tenAm = new Date("2026-10-30T02:00:00Z");
const req = { kind: "recall" as const, campaignId: null, automated: true, now: tenAm };
const prep = (over: Partial<Parameters<typeof prepareSms>[0]> = {}) =>
  prepareSms({ clinic, contact, policy: { ...DEFAULT_POLICY, syncHealthy: true }, request: req, body: "Hi Ana, Bantay is due for his rabies vaccine.", stopUrl: "https://revisit.example/s/x1", ...over });

describe("send pipeline", () => {
  it("appends reply path and stop link", () => {
    const r = prep();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sms.body).toMatch(/Reply: 0917 555 0000\nStop msgs: https:\/\/revisit\.ph\/s\/x1$/);
  });
  it("vet reminders may name pet care; human clinics may not name their services", () => {
    expect(prep().ok).toBe(true);
    const dental = { ...clinic, vertical: "dental" as const, serviceCategories: ["Root canal follow-up"] };
    const r = prep({ clinic: dental, body: "Hi Ana, your root canal follow-up is due." });
    expect(r).toMatchObject({ ok: false, reason: "content" });
  });
  it("blocks unapproved sender names and ineligible contacts", () => {
    expect(prep({ clinic: { ...clinic, senderNameApproved: false } })).toMatchObject({ ok: false, reason: "sender_not_approved" });
    expect(prep({ contact: { ...contact, muted: true } })).toMatchObject({ ok: false, reason: "muted" });
  });
  it("blocks promo wording in marketing texts", () => {
    const r = prep({ request: { ...req, kind: "marketing", campaignId: "c1" }, body: "Use code PAW100 for P100 off grooming!" });
    expect(r).toMatchObject({ ok: false, reason: "content" });
  });
});

describe("Semaphore client", () => {
  const okFetch = () => vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => [{ message_id: 1, recipient: "639171234567", status: "Queued" }],
    text: async () => "",
  }));
  it("sends only prepared texts, with the sender name", async () => {
    const r = prep();
    if (!r.ok) throw new Error("expected prepared");
    const fetchImpl = okFetch();
    const res = await new SemaphoreClient("key123", fetchImpl).send([r.sms]);
    expect(res.accepted).toHaveLength(1);
    const call = (fetchImpl.mock.calls[0] as unknown) as [string, { body: string }];
    const body = new URLSearchParams(call[1].body);
    expect(body.get("sendername")).toBe("PAWCARE");
    expect(body.get("message")).toContain("Stop msgs:");
  });
  it("refuses a hand-built message that skipped the pipeline", async () => {
    const forged = { mobile: "639171234567", body: "Hello", senderName: "PAWCARE", segments: 1 } as PreparedSms;
    await expect(new SemaphoreClient("k", okFetch()).send([forged])).rejects.toThrow(/prepareSms/);
  });
  it("batches recipients by 1,000", () => {
    expect(batch(Array.from({ length: 2500 }, (_, i) => i)).map((b) => b.length)).toEqual([1000, 1000, 500]);
  });
});
