// Semaphore SMS client. Docs: https://api.semaphore.co/docs
// POST /api/v4/messages, up to 1,000 numbers per call, 120 calls per minute.
// Messages that start with "TEST" are silently dropped by Semaphore (checkContent blocks them).
import { isPrepared, type PreparedSms } from "../send/pipeline.js";

export const SEMAPHORE_URL = "https://api.semaphore.co/api/v4/messages";
export const MAX_RECIPIENTS_PER_CALL = 1000;

export interface SemaphoreMessage {
  message_id: number | string;
  recipient: string;
  status: "Queued" | "Pending" | "Sent" | "Failed" | "Refunded" | string;
  network?: string;
}

export interface SendResult {
  accepted: SemaphoreMessage[];   // Queued, Pending or Sent
  failed: SemaphoreMessage[];     // Failed or Refunded: record against the send row, do not blindly retry
  errors: string[];               // whole-call failures; recipients in that call were not accepted
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export class SemaphoreClient {
  constructor(private apiKey: string, private fetchImpl: FetchLike = fetch as unknown as FetchLike) {
    if (!apiKey) throw new Error("SEMAPHORE_API_KEY missing");
  }

  /**
   * Sends texts produced by prepareSms only. Identical bodies from the same sender are grouped
   * into one call of up to 1,000 recipients; personalized bodies go one call each.
   */
  async send(items: PreparedSms[]): Promise<SendResult> {
    for (const s of items) {
      if (!isPrepared(s)) throw new Error("Unprepared message: every text must go through prepareSms (eligibility, content checks, footer).");
    }
    const groups = new Map<string, PreparedSms[]>();
    for (const s of items) {
      const key = `${s.senderName}\u0000${s.body}`;
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    const result: SendResult = { accepted: [], failed: [], errors: [] };
    for (const group of groups.values()) {
      const first = group[0]!;
      const mobiles = [...new Set(group.map((g) => g.mobile))]; // never text one number twice in a call
      for (const chunk of batch(mobiles)) {
        const body = new URLSearchParams({ apikey: this.apiKey, number: chunk.join(","), message: first.body, sendername: first.senderName });
        const res = await this.fetchImpl(SEMAPHORE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        if (!res.ok) { result.errors.push(`HTTP ${res.status}`); continue; } // never log response bodies: they echo numbers
        let json: unknown;
        try { json = await res.json(); } catch { result.errors.push("unreadable response"); continue; }
        if (!Array.isArray(json)) { result.errors.push("unexpected response shape"); continue; } // Semaphore errors come back as objects with HTTP 200
        for (const m of json as SemaphoreMessage[]) {
          (m.status === "Failed" || m.status === "Refunded" ? result.failed : result.accepted).push(m);
        }
      }
    }
    return result;
  }
}

export function batch<T>(items: T[], size = MAX_RECIPIENTS_PER_CALL): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
