// Sample clinics for the sales demo. Every name and number is invented. Dates are built relative to
// the day the demo is opened, so the queue always has work in it.
import { DEFAULT_POLICY } from "../../../src/domain/eligibility";
import { addDays } from "../../../src/domain/time";
import type { QueueAsset, QueueContact, QueueInput, QueueRule } from "../../../src/send/queue";
import type { Booking, SentText } from "../../../src/domain/roi";

export type Vertical = "dental" | "vet";

export interface DemoClinic {
  vertical: Vertical;
  name: string;
  serviceLabel: string;           // what one recovered booking usually is
  visitValueCentavos: number;     // average value of one recovered visit
  input: (opts: { syncHealthy: boolean }) => QueueInput;
  history: { texts: SentText[]; bookings: Booking[] };
}

// 0900 is not an assigned PH mobile prefix, so no sample number reaches a real person.
const mobile = (n: number) => `63900${String(n).padStart(7, "0")}`;

function contact(id: string, fullName: string, assets: QueueAsset[], over: Partial<QueueContact> = {}): QueueContact {
  return { id, fullName, mobile: mobile(Number(id.replace(/\D/g, "")) || 1), status: "active", muted: false,
    consent: { service: true }, pastSends: [], sentEventKeys: [], assets, ...over };
}

function asset(id: string, kind: QueueAsset["kind"], label: string, visits: QueueAsset["visits"], over: Partial<QueueAsset> = {}): QueueAsset {
  return { id, kind, label, active: true, visits, upcomingAppointment: false, stepsSent: {}, ...over };
}

/** Last visit date that makes `rule` land on recall step `offset` today (0 = due today, -7 = heads-up). */
const visitFor = (today: string, intervalDays: number, offset: number) => addDays(today, -intervalDays - offset);

/** Texts last month and this month, and the bookings that followed some of them. */
function history(today: string, prefix: string, valueCentavos: number, thisMonth: number, lastMonth: number) {
  const texts: SentText[] = [];
  const bookings: Booking[] = [];
  const month = today.slice(0, 7);
  const firstOfMonth = `${month}-01`;
  const prevMonthDay = addDays(firstOfMonth, -20);
  const day = Math.max(1, Number(today.slice(8, 10)));
  for (let i = 0; i < thisMonth; i++) {
    const on = addDays(firstOfMonth, Math.min(day - 1, i % day));
    texts.push({ contactId: `${prefix}h${i}`, sentAt: new Date(`${addDays(on, -3)}T02:00:00Z`), kind: "recall" });
    bookings.push({ contactId: `${prefix}h${i}`, on, valueCentavos });
  }
  for (let i = 0; i < lastMonth; i++) {
    const on = addDays(prevMonthDay, i % 15);
    texts.push({ contactId: `${prefix}l${i}`, sentAt: new Date(`${addDays(on, -2)}T02:00:00Z`), kind: "recall" });
    bookings.push({ contactId: `${prefix}l${i}`, on, valueCentavos });
  }
  return { texts, bookings };
}

export function demoClinics(today: string): Record<Vertical, DemoClinic> {
  const host = "revisit.example";
  const stopUrl = (id: string) => `https://${host}/s/${id}x7`;

  // Dental: six-month cleanings, the most common recall.
  const cleaning: QueueRule = { id: "d-clean", serviceCategory: "Cleaning", intervalDays: 182, stepOffsetsDays: [-7, 0, 14, 60],
    template: "Hi {first_name}, your next cleaning at {clinic} is due. Reply to book a time.",
    approvedBy: "Dra. Reyes" };
  const checkup: QueueRule = { id: "d-check", serviceCategory: "Check-up", intervalDays: 365, stepOffsetsDays: [-7, 0, 14, 60],
    template: "Hi {first_name}, your yearly check-up at {clinic} is due. Reply to book a time.",
    approvedBy: "Dra. Reyes" };
  const familyVisit: QueueRule = { id: "d-family", serviceCategory: "Kids visit", intervalDays: 182, stepOffsetsDays: [-7, 0, 14, 60],
    template: "Hi {first_name}, {pet_name} is due for a visit at {clinic}. Reply to book.", approvedBy: "Dra. Reyes" };
  const c = (offset: number) => [{ serviceCategory: "Cleaning", on: visitFor(today, 182, offset) }];

  const dentalContacts: QueueContact[] = [
    contact("d1", "Maria Santos", [asset("d1a", "self", "Self", c(0))]),
    contact("d2", "Jose Ramos", [asset("d2a", "self", "Self", c(-7))]),
    contact("d3", "Liza Navarro", [asset("d3a", "self", "Self", c(14))]),
    contact("d4", "Paolo Garcia", [asset("d4a", "self", "Self", c(0))]),
    contact("d5", "Carmela Uy", [asset("d5a", "self", "Self", [{ serviceCategory: "Check-up", on: visitFor(today, 365, 0) }])]),
    contact("d6", "Ramon Dizon", [asset("d6a", "self", "Self", c(-7))]),
    contact("d7", "Grace Lim", [asset("d7a", "self", "Self", c(60))]),
    contact("d8", "Andres Bautista", [asset("d8a", "self", "Self", c(0))]),
    contact("d9", "Trina Mendoza", [asset("d9a", "self", "Self", c(14))]),
    contact("d10", "Nico Villanueva", [asset("d10a", "self", "Self", c(-7))]),
    // A parent with a child due too: the child's text waits a day (one recall text per person per day).
    contact("d11", "Joy Aquino", [asset("d11a", "self", "Self", c(0)),
      asset("d11b", "dependent", "Mika", [{ serviceCategory: "Kids visit", on: visitFor(today, 182, 0) }])]),
    // Held back, and the console says why.
    contact("d12", "Ben Castillo", [asset("d12a", "self", "Self", c(0))], { muted: true }),
    contact("d13", "Celia Ortiz", [asset("d13a", "self", "Self", c(0))], { consent: { service: false } }),
    contact("d14", "Dante Flores", [asset("d14a", "self", "Self", c(-7))], { status: "moved" }),
    contact("d15", "Ella Robles", [asset("d15a", "self", "Self", c(0))], { mobile: null }),
    // Already booked: no text at all.
    contact("d16", "Fe Salazar", [asset("d16a", "self", "Self", c(0), { upcomingAppointment: true })]),
  ];

  // Vet: yearly rabies shots and deworming every 3 months, one owner, several pets.
  const rabies: QueueRule = { id: "v-rabies", serviceCategory: "Rabies vaccine", intervalDays: 365, stepOffsetsDays: [-7, 0, 14, 60],
    template: "Hi {first_name}, {pet_name}'s yearly rabies shot is due at {clinic}. Reply to this number to book.",
    approvedBy: "Dr. Tan" };
  const deworm: QueueRule = { id: "v-deworm", serviceCategory: "Deworming", intervalDays: 90, stepOffsetsDays: [-7, 0, 14],
    template: "Hi {first_name}, {pet_name} is due for deworming at {clinic}. Reply to book a quick visit.",
    approvedBy: "Dr. Tan" };
  const r = (offset: number) => [{ serviceCategory: "Rabies vaccine", on: visitFor(today, 365, offset) }];
  const w = (offset: number) => [{ serviceCategory: "Deworming", on: visitFor(today, 90, offset) }];
  const vetContacts: QueueContact[] = [
    contact("v1", "Ana Cruz", [asset("v1a", "pet", "Bantay", r(0)), asset("v1b", "pet", "Muning", w(0))]),
    contact("v2", "Mark Reyes", [asset("v2a", "pet", "Choco", r(-7))]),
    contact("v3", "Kim Domingo", [asset("v3a", "pet", "Mochi", w(0))]),
    contact("v4", "Rico Pascual", [asset("v4a", "pet", "Brownie", r(14))]),
    contact("v5", "Lea Fernandez", [asset("v5a", "pet", "Snow", w(-7))]),
    contact("v6", "Sam Torres", [asset("v6a", "pet", "Tiger", r(0))]),
    contact("v7", "Joan Lopez", [asset("v7a", "pet", "Peanut", w(14))]),
    contact("v8", "Ivan Morales", [asset("v8a", "pet", "Coco", r(60))]),
    contact("v9", "Mia Herrera", [asset("v9a", "pet", "Luna", r(-7))]),
    contact("v10", "Carlo Rivera", [asset("v10a", "pet", "Max", w(0))]),
    contact("v11", "Pia Gomez", [asset("v11a", "pet", "Kitkat", r(0))], { muted: true }),
    contact("v12", "Leo Cabrera", [asset("v12a", "pet", "Rocky", w(0))], { consent: { service: false } }),
    contact("v13", "Nina Velasco", [asset("v13a", "pet", "Bella", r(0), { active: false })]),
    contact("v14", "Tess Ramos", [asset("v14a", "pet", "Oreo", r(0))], { mobile: null }),
  ];

  const clinicBase = { senderNameApproved: true, nameTreatmentsAllowed: false, displayNameConfirmedBy: null, replyPhone: "0900 000 0000" };
  return {
    dental: {
      vertical: "dental", name: "Smile Studio Dental", serviceLabel: "cleanings", visitValueCentavos: 150000,
      history: history(today, "d", 150000, 14, 9),
      input: ({ syncHealthy }) => ({
        clinic: { ...clinicBase, vertical: "dental", senderName: "SMILESTUDIO", displayName: "Smile Studio",
          serviceCategories: ["Cleaning", "Check-up", "Kids visit", "Braces adjustment", "Whitening"] },
        policy: { ...DEFAULT_POLICY, syncHealthy }, rules: [cleaning, checkup, familyVisit], contacts: dentalContacts,
        stopLinkHost: host, stopUrl,
      }),
    },
    vet: {
      vertical: "vet", name: "Paw Care Animal Clinic", serviceLabel: "vaccines and dewormings", visitValueCentavos: 80000,
      history: history(today, "v", 80000, 19, 12),
      input: ({ syncHealthy }) => ({
        clinic: { ...clinicBase, vertical: "vet", senderName: "PAWCARE", displayName: "Paw Care",
          serviceCategories: ["Rabies vaccine", "Deworming", "Grooming"] },
        policy: { ...DEFAULT_POLICY, syncHealthy }, rules: [rabies, deworm], contacts: vetContacts,
        stopLinkHost: host, stopUrl,
      }),
    },
  };
}
