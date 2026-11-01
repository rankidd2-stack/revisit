import { useMemo, useState } from "react";
import { CalendarCheck, Clock, Inbox, LockKeyhole, MessageSquareReply, ShieldCheck, Users } from "lucide-react";
import { proposeDailyQueue, HELD_REASON_TEXT, type QueueItem } from "../../src/send/queue";
import { recoveredInMonth } from "../../src/domain/roi";
import { addDays, manilaDate, manilaInstant } from "../../src/domain/time";
import { demoClinics, type Vertical } from "./demo/data";
import { Button } from "./components/Button";
import { MetricCard } from "./components/MetricCard";
import { QueueRow } from "./components/QueueRow";
import { StatusPill, type Status } from "./components/StatusPill";

const peso = (centavos: number) => `₱${Math.round(centavos / 100).toLocaleString("en-PH")}`;
const centavoText = (centavos: number) => `₱${(centavos / 100).toFixed(2)}`;
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const monthName = (yyyyMm: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "long", timeZone: "UTC" }).format(new Date(`${yyyyMm}-01T00:00:00Z`));

function reasonText(i: QueueItem): string {
  const s = i.serviceCategory;
  if (i.stepOffsetDays < 0) return `Heads-up: ${s} due ${shortDate(i.dueOn)}`;
  if (i.stepOffsetDays === 0) return `${s} due today`;
  return `${s} was due ${shortDate(i.dueOn)}, ${i.stepOffsetDays} days ago`;
}

function aboutText(i: QueueItem): string | null {
  if (i.subject === "self") return null;
  return i.subject === "dependent" ? `${i.assetLabel} (family member)` : i.assetLabel;
}

function rowStatus(i: QueueItem, approved: boolean): { status: Status; label?: string } {
  if (i.status === "ready") return approved ? { status: "sent", label: "Approved" } : { status: "due" };
  if (i.status === "later_today") return { status: "scheduled", label: "Waits for 8 AM" };
  if (i.status === "next_day") return { status: "scheduled", label: "Tomorrow" };
  if (i.heldReason === "muted" || i.heldReason === "service_opted_out") return { status: "opted_out" };
  return { status: "paused" };
}

export function App() {
  const today = manilaDate(new Date());
  const clinics = useMemo(() => demoClinics(today), [today]);
  const [vertical, setVertical] = useState<Vertical>("dental");
  const [staleSync, setStaleSync] = useState(false);
  const [evening, setEvening] = useState(false);
  const [view, setView] = useState<"today" | "patients">("today");
  const [approved, setApproved] = useState(false);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const clinic = clinics[vertical];
  // Demo clock: today at 10:00 AM Manila (or 9:00 PM to show quiet hours).
  const now = manilaInstant(today, evening ? 21 : 10);
  const input = clinic.input({ syncHealthy: !staleSync });
  const queue = proposeDailyQueue(input, now);
  const key = (i: QueueItem) => `${i.contactId}:${i.assetId}:${i.ruleId}`;
  const ready = queue.items.filter((i) => i.status === "ready" && !skipped.has(key(i)));
  const skippedItems = queue.items.filter((i) => i.status === "ready" && skipped.has(key(i)));
  const waiting = queue.items.filter((i) => i.status !== "ready");
  const cost = ready.reduce((n, i) => n + i.costCentavos, 0);
  const segments = ready.reduce((n, i) => n + (i.sms?.segments ?? 0), 0);

  const month = today.slice(0, 7);
  const lastMonth = addDays(`${month}-01`, -1).slice(0, 7);
  const thisM = recoveredInMonth(clinic.history.texts, clinic.history.bookings, month);
  const prevM = recoveredInMonth(clinic.history.texts, clinic.history.bookings, lastMonth);
  const series = [0.35, 0.5, 0.6, 0.75].map((f) => Math.round(prevM.bookings * f)).concat([prevM.bookings, thisM.bookings]);

  const reset = (fn: () => void) => { fn(); setApproved(false); setSkipped(new Set()); };
  const sender = input.clinic.senderName ?? "";

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <p className="wordmark heading">Revisit</p>
        <p className="caption muted nav-clinic">{clinic.name}</p>
        <ul>
          <li><button className={`nav-item label ${view === "today" ? "active" : ""}`} aria-current={view === "today" ? "page" : undefined} onClick={() => setView("today")}><Inbox size={20} strokeWidth={1.5} aria-hidden /> Today</button></li>
          <li><button className={`nav-item label ${view === "patients" ? "active" : ""}`} aria-current={view === "patients" ? "page" : undefined} onClick={() => setView("patients")}><Users size={20} strokeWidth={1.5} aria-hidden /> Patients</button></li>
        </ul>
        <section className="demo-controls" aria-label="Demo controls">
          <p className="label">Demo controls</p>
          <div className="segmented" role="radiogroup" aria-label="Clinic type">
            {(["dental", "vet"] as const).map((v) => (
              <button key={v} role="radio" aria-checked={vertical === v} className={`label ${vertical === v ? "on" : ""}`}
                onClick={() => reset(() => setVertical(v))}>{v === "dental" ? "Dental" : "Vet"}</button>
            ))}
          </div>
          <label className="toggle caption"><input type="checkbox" checked={staleSync} onChange={(e) => reset(() => setStaleSync(e.target.checked))} /> Patient list out of date</label>
          <label className="toggle caption"><input type="checkbox" checked={evening} onChange={(e) => reset(() => setEvening(e.target.checked))} /> It is 9 PM</label>
          <p className="caption muted">Sample patients. Nothing is sent from this demo.</p>
        </section>
      </nav>

      <main className="main">
        {view === "today" ? (
          <>
            <header className="page-head">
              <h1 className="title">Today</h1>
              <p className="body muted">{longDate(today)} · {evening ? "9:00 PM" : "10:00 AM"}</p>
            </header>

            <div className="grid">
              <MetricCard label="Bookings recovered this month" value={peso(thisM.valueCentavos)}
                detail={`${thisM.bookings} ${clinic.serviceLabel} booked after a text`}
                change={thisM.bookings - prevM.bookings} changeLabel={`bookings vs ${monthName(lastMonth)}`} series={series} />

              <section className={`card sync ${staleSync ? "sync-stale" : ""}`} aria-label="Sync status">
                <div className="sync-head">
                  <p className="heading">Patient list</p>
                  {staleSync ? <StatusPill status="paused" label="Out of date" /> : <StatusPill status="booked" label="Up to date" />}
                </div>
                <p className="body">{staleSync
                  ? "Last synced 3 days ago. Automatic texts are paused until it syncs. Re-upload the sheet to resume texts."
                  : "Synced today at 6:00 AM from your Google Sheet."}</p>
                <ul className="safety caption">
                  <li><MessageSquareReply size={16} strokeWidth={1.5} aria-hidden /> Every text ends with your reply number and a stop link</li>
                  <li><Clock size={16} strokeWidth={1.5} aria-hidden /> No texts between 8 PM and 8 AM</li>
                  <li><LockKeyhole size={16} strokeWidth={1.5} aria-hidden /> {vertical === "vet" ? "Texts name pet care only, never anything about the owner" : "Texts never name a treatment on the lock screen"}</li>
                  <li><ShieldCheck size={16} strokeWidth={1.5} aria-hidden /> Anyone who said stop never gets another text</li>
                </ul>
              </section>
            </div>

            <section className="card queue" aria-labelledby="queue-title">
              <div className="queue-head">
                <div>
                  <h2 className="heading" id="queue-title">{approved ? "Approved for today" : "Ready to send"}</h2>
                  <p className="caption muted">
                    {ready.length} {ready.length === 1 ? "text" : "texts"} · {segments} SMS · {centavoText(cost)} at ₱0.56 each
                  </p>
                </div>
                {ready.length > 0 && !approved ? (
                  <Button variant="primary" icon={<CalendarCheck size={20} strokeWidth={1.5} aria-hidden />} onClick={() => setApproved(true)}>
                    Approve {ready.length} {ready.length === 1 ? "text" : "texts"}
                  </Button>
                ) : null}
                {approved ? <Button variant="secondary" onClick={() => setApproved(false)}>Undo approval</Button> : null}
              </div>
              {approved ? (
                <p className="notice body" role="status">
                  {ready.length} {ready.length === 1 ? "text" : "texts"} approved. In the live product they go out now from {sender}. This demo sends nothing.
                </p>
              ) : null}
              {ready.length === 0 ? (
                <p className="empty body muted">
                  {staleSync ? "Nothing can go out while the patient list is out of date. Re-upload the sheet to resume texts."
                    : evening ? "It is quiet hours. Today's texts wait until 8 AM."
                    : "No one is due today. Patients appear here the week before their visit is due."}
                </p>
              ) : (
                <ul className="queue-list">
                  {ready.map((i) => {
                    const s = rowStatus(i, approved);
                    return <QueueRow key={key(i)} name={i.contactName} about={aboutText(i)} reason={reasonText(i)} status={s.status}
                      statusLabel={s.label} sender={sender} body={i.sms?.body}
                      onSkip={approved ? undefined : () => setSkipped(new Set(skipped).add(key(i)))} />;
                  })}
                </ul>
              )}
            </section>

            {waiting.length + skippedItems.length > 0 ? (
              <section className="card queue" aria-labelledby="held-title">
                <h2 className="heading" id="held-title">Not today</h2>
                <p className="caption muted">The rules held these back. Nothing to do unless a reason surprises you.</p>
                <ul className="queue-list">
                  {skippedItems.map((i) => (
                    <QueueRow key={key(i)} name={i.contactName} about={aboutText(i)} reason={reasonText(i)} status="paused" statusLabel="Skipped"
                      note="You skipped this one today." onUndo={() => { const n = new Set(skipped); n.delete(key(i)); setSkipped(n); }} />
                  ))}
                  {waiting.map((i) => {
                    const s = rowStatus(i, false);
                    return <QueueRow key={key(i)} name={i.contactName} about={aboutText(i)} reason={reasonText(i)} status={s.status}
                      statusLabel={s.label} note={HELD_REASON_TEXT[i.heldReason ?? ""] ?? null} />;
                  })}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <Patients contacts={input.contacts} items={queue.items} />
        )}
      </main>
    </div>
  );
}

function Patients({ contacts, items }: { contacts: ReturnType<ReturnType<typeof demoClinics>["dental"]["input"]>["contacts"]; items: QueueItem[] }) {
  const statusOf = (id: string): { status: Status; label?: string } => {
    const c = contacts.find((x) => x.id === id)!;
    if (c.muted || c.consent.service === false) return { status: "opted_out" };
    if (c.status !== "active") return { status: "paused", label: "Moved" };
    if (c.assets.some((a) => a.upcomingAppointment)) return { status: "booked" };
    const mine = items.filter((i) => i.contactId === id);
    if (mine.some((i) => i.status === "ready")) return { status: "due" };
    if (mine.length) return rowStatus(mine[0]!, false);
    return { status: "scheduled", label: "Not due" };
  };
  const phone = (m: string | null) => (m ? `0${m.slice(2, 5)} ${m.slice(5, 8)} ${m.slice(8)}` : "None");
  return (
    <>
      <header className="page-head">
        <h1 className="title">Patients</h1>
        <p className="body muted">{contacts.length} patients from your sheet</p>
      </header>
      <section className="card">
        <table className="table">
          <thead><tr className="label muted"><th>Name</th><th>Pets or family</th><th>Mobile</th><th>Status</th></tr></thead>
          <tbody>
            {contacts.map((c) => {
              const s = statusOf(c.id);
              const others = c.assets.filter((a) => a.kind !== "self").map((a) => a.label).join(", ");
              return (
                <tr key={c.id} className="body">
                  <td className="body-strong">{c.fullName}</td>
                  <td>{others || <span className="muted">None</span>}</td>
                  <td className="data">{phone(c.mobile)}</td>
                  <td><StatusPill status={s.status} label={s.label} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
