import { describe, expect, it } from "vitest";
import { demoClinics } from "../console/src/demo/data";
import { proposeDailyQueue } from "../src/send/queue.js";
import { manilaInstant } from "../src/domain/time.js";
import { isPrepared } from "../src/send/pipeline.js";

// The sales demo runs the real rules on sample data. These checks keep what it shows honest.
describe("demo console data", () => {
  for (const today of ["2026-11-01", "2027-02-28", "2027-03-01"]) {
    for (const v of ["dental", "vet"] as const) {
      it(`${v} on ${today}: a full queue of real prepared texts, each 1 SMS, plus every kind of held text`, () => {
        const clinic = demoClinics(today)[v];
        const q = proposeDailyQueue(clinic.input({ syncHealthy: true }), manilaInstant(today, 10));
        const ready = q.items.filter((i) => i.status === "ready");
        expect(ready.length).toBeGreaterThanOrEqual(8);
        for (const i of ready) {
          expect(isPrepared(i.sms!)).toBe(true);
          expect(i.sms!.segments).toBe(1);
        }
        const reasons = new Set(q.items.map((i) => i.heldReason));
        for (const r of ["muted", "service_opted_out", "no_mobile"]) expect(reasons).toContain(r);
        // The stale-sync and quiet-hours toggles hold everything.
        const stale = proposeDailyQueue(clinic.input({ syncHealthy: false }), manilaInstant(today, 10));
        expect(stale.items.filter((i) => i.status === "ready")).toEqual([]);
        const night = proposeDailyQueue(clinic.input({ syncHealthy: true }), manilaInstant(today, 21));
        expect(night.items.filter((i) => i.status === "ready")).toEqual([]);
      });
    }
  }
});
