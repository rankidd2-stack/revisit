import { describe, expect, it } from "vitest";
import { proposeDailyQueue, HELD_REASON_TEXT, type QueueContact, type QueueInput } from "../src/send/queue.js";
import { recoveredInMonth } from "../src/domain/roi.js";
import { DEFAULT_POLICY } from "../src/domain/eligibility.js";
import { isPrepared } from "../src/send/pipeline.js";

// 10:00 in Manila on 2026-11-02.
const tenAm = new Date("2026-11-02T02:00:00Z");
const clinic = {
  vertical: "vet" as const, senderName: "PAWCARE", senderNameApproved: true, nameTreatmentsAllowed: false,
  displayName: "Paw Care", displayNameConfirmedBy: null, replyPhone: "0917 555 0000", serviceCategories: ["Rabies vaccine"],
};
const rule = { id: "r1", serviceCategory: "Rabies vaccine", intervalDays: 365, stepOffsetsDays: [-7, 0, 14, 60],
  template: "Hi {first_name}, {pet_name} is due for a visit at {clinic}.", approvedBy: "admin@pawcare" };

const pet = (id: string, label: string, lastOn: string, over: object = {}) => ({
  id, kind: "pet" as const, label, active: true, visits: [{ serviceCategory: "Rabies vaccine", on: lastOn }],
  upcomingAppointment: false, stepsSent: {}, ...over,
});
// Due 2026-11-02 when last visit was 2025-11-02.
const person = (id: string, name: string, over: Partial<QueueContact> = {}): QueueContact => ({
  id, fullName: name, mobile: "639171234567", status: "active", muted: false, consent: { service: true },
  pastSends: [], sentEventKeys: [], assets: [pet(`${id}-p`, "Bantay", "2025-11-02")], ...over,
});
const input = (contacts: QueueContact[], over: Partial<QueueInput> = {}): QueueInput => ({
  clinic, policy: { ...DEFAULT_POLICY, syncHealthy: true }, rules: [rule], contacts,
  stopLinkHost: "revisit.example", stopUrl: (id) => `https://revisit.example/s/${id}`, ...over,
});

describe("daily autopilot queue", () => {
  it("proposes today's due recall through the real pipeline: approved wording, reply path, stop link, cost", () => {
    const q = proposeDailyQueue(input([person("c1", "Ana Cruz")]), tenAm);
    expect(q.date).toBe("2026-11-02");
    expect(q.ready).toBe(1);
    const item = q.items[0]!;
    expect(item).toMatchObject({ status: "ready", stepOffsetDays: 0, dueOn: "2026-11-02", subject: "pet" });
    expect(item.sms!.body).toContain("Hi Ana, Bantay is due for a visit at Paw Care.");
    expect(item.sms!.body).toContain("Stop msgs: https://revisit.example/s/c1");
    expect(isPrepared(item.sms!)).toBe(true);
    expect(q.costCentavos).toBe(item.sms!.segments * 56);
  });
  it("holds texts the rules forbid and says why", () => {
    const q = proposeDailyQueue(input([
      person("c1", "Opted Out", { consent: { service: false } }),
      person("c2", "Muted", { muted: true }),
      person("c3", "Moved", { status: "moved" }),
      person("c4", "No Phone", { mobile: null }),
    ]), tenAm);
    expect(q.ready).toBe(0);
    expect(q.items.map((i) => [i.contactName, i.status, i.heldReason])).toEqual([
      ["Moved", "held", "inactive_status"], ["Muted", "held", "muted"], ["No Phone", "held", "no_mobile"], ["Opted Out", "held", "service_opted_out"],
    ]);
    for (const i of q.items) expect(HELD_REASON_TEXT[i.heldReason!]).toBeTruthy();
  });
  it("quiet hours: before 8 AM waits for later today, after 8 PM waits for tomorrow", () => {
    const early = proposeDailyQueue(input([person("c1", "Ana Cruz")]), new Date("2026-11-01T22:00:00Z")); // 06:00 Nov 2
    expect(early.items[0]).toMatchObject({ status: "later_today", heldReason: "quiet_hours" });
    const late = proposeDailyQueue(input([person("c1", "Ana Cruz")]), new Date("2026-11-02T13:00:00Z"));  // 21:00 Nov 2
    expect(late.items[0]).toMatchObject({ status: "next_day", heldReason: "quiet_hours" });
    expect(late.ready).toBe(0);
  });
  it("one recall text per person per day: a second pet waits for tomorrow", () => {
    const owner = person("c1", "Ana Cruz", { assets: [pet("p1", "Bantay", "2025-11-02"), pet("p2", "Muning", "2025-11-02")] });
    const q = proposeDailyQueue(input([owner]), tenAm);
    expect(q.items.map((i) => [i.assetLabel, i.status])).toEqual([["Bantay", "ready"], ["Muning", "next_day"]]);
    expect(q.items[1]!.heldReason).toBe("one_recall_per_day");
  });
  it("proposes nothing for unapproved rules, booked or inactive pets, steps already sent, or patients not yet due", () => {
    expect(proposeDailyQueue(input([person("c1", "A")], { rules: [{ ...rule, approvedBy: " " }] }), tenAm).items).toEqual([]);
    expect(proposeDailyQueue(input([person("c1", "A", { assets: [pet("p", "B", "2025-11-02", { upcomingAppointment: true })] })]), tenAm).items).toEqual([]);
    expect(proposeDailyQueue(input([person("c1", "A", { assets: [pet("p", "B", "2025-11-02", { active: false })] })]), tenAm).items).toEqual([]);
    expect(proposeDailyQueue(input([person("c1", "A", { assets: [pet("p", "B", "2025-11-02", { stepsSent: { "r1:2026-11-02": [-7, 0] } })] })]), tenAm).items).toEqual([]);
    expect(proposeDailyQueue(input([person("c1", "A", { assets: [pet("p", "B", "2026-06-01")] })]), tenAm).items).toEqual([]);
  });
  it("a stale sync holds every automated text", () => {
    const q = proposeDailyQueue(input([person("c1", "Ana Cruz")], { policy: { ...DEFAULT_POLICY, syncHealthy: false } }), tenAm);
    expect(q.items[0]).toMatchObject({ status: "held", heldReason: "sync_stale" });
  });
  it("texts about a child stay strict: a check-up category word is held", () => {
    const dental = { ...clinic, vertical: "dental" as const, senderName: "SMILE", displayName: "Smile Studio", serviceCategories: ["Dental check-up"] };
    const checkup = { ...rule, serviceCategory: "Dental check-up", intervalDays: 180, template: "Hi {first_name}, {pet_name}'s check-up is due." };
    const kid = { id: "k1", kind: "dependent" as const, label: "Mika", active: true, visits: [{ serviceCategory: "Dental check-up", on: "2026-05-06" }], upcomingAppointment: false, stepsSent: {} };
    const self = { ...kid, id: "s1", kind: "self" as const, label: "Self" };
    const selfRule = { ...checkup, id: "r2", template: "Hi {first_name}, your check-up is due." };
    const kidQ = proposeDailyQueue(input([person("c1", "Ana Cruz", { assets: [kid] })], { clinic: dental, rules: [checkup] }), tenAm);
    expect(kidQ.items[0]).toMatchObject({ status: "held", heldReason: "content" });
    const selfQ = proposeDailyQueue(input([person("c1", "Ana Cruz", { assets: [self] })], { clinic: dental, rules: [selfRule] }), tenAm);
    expect(selfQ.items[0]).toMatchObject({ status: "ready" });
  });
  it("orders ready texts first and totals only what is ready", () => {
    const q = proposeDailyQueue(input([person("c1", "Zed", { muted: true }), person("c2", "Bea"), person("c3", "Al")]), tenAm);
    expect(q.items.map((i) => i.contactName)).toEqual(["Al", "Bea", "Zed"]);
    expect(q.ready).toBe(2);
    expect(q.segments).toBe(q.items.slice(0, 2).reduce((n, i) => n + i.sms!.segments, 0));
  });
});

describe("bookings recovered (the money number)", () => {
  const sent = (contactId: string, iso: string) => ({ contactId, sentAt: new Date(iso) });
  it("counts bookings this month that followed a text within 30 days, once each", () => {
    const texts = [sent("a", "2026-10-20T02:00:00Z"), sent("a", "2026-10-25T02:00:00Z"), sent("b", "2026-11-01T02:00:00Z")];
    const r = recoveredInMonth(texts, [
      { contactId: "a", on: "2026-11-03", valueCentavos: 150000 },   // counts once despite two texts
      { contactId: "b", on: "2026-11-01", valueCentavos: 80000 },    // same day as the text counts
      { contactId: "c", on: "2026-11-04", valueCentavos: 99900 },    // never texted
    ], "2026-11");
    expect(r).toEqual({ bookings: 2, valueCentavos: 230000 });
  });
  it("ignores bookings before the text, outside the window, or in another month", () => {
    const texts = [sent("a", "2026-10-01T02:00:00Z"), sent("b", "2026-11-10T02:00:00Z")];
    expect(recoveredInMonth(texts, [
      { contactId: "a", on: "2026-11-05", valueCentavos: 1 },   // 35 days later
      { contactId: "b", on: "2026-11-09", valueCentavos: 1 },   // day before the text
      { contactId: "b", on: "2026-12-01", valueCentavos: 1 },   // next month
    ], "2026-11")).toEqual({ bookings: 0, valueCentavos: 0 });
  });
  it("reads the text day on the Manila calendar", () => {
    // 17:00 UTC Oct 31 is 01:00 Nov 1 in Manila, so a Nov 1 booking is not before the text.
    expect(recoveredInMonth([sent("a", "2026-10-31T17:00:00Z")], [{ contactId: "a", on: "2026-11-01", valueCentavos: 5 }], "2026-11").bookings).toBe(1);
  });
});
