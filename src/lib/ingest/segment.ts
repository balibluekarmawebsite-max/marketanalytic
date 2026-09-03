/**
 * Normalize a raw "Company / Agent" value (or a cleaned agent label) into a
 * canonical Blue Karma market segment, and produce a clean agent label.
 *
 * Segment taxonomy (authoritative, set by revenue management):
 *   Direct Booking       — Alaric, Individual Reservation
 *   B2B Agent            — G2 Travel, Hotelbeds, MG Holiday, Dida Travel
 *   OTA                  — Booking.com, Agoda, Expedia, Traveloka, Tiket.com, Ctrip
 *   Overseas TA          — Luxury Escape, HeyTrip
 *   Walk-in / Complimentary — kept as-is (not travel agents)
 *   Offline Travel Agent — everything else (any other agent)
 *
 * Lower `priority` wins on ties; anything unmatched falls through to
 * "Offline Travel Agent".
 */

type Rule = { pattern: string; segment: string; priority: number };

const RULES: Rule[] = [
  // Non-agent channels first (so they don't fall into "Offline Travel Agent")
  { pattern: "walk", segment: "Walk-in", priority: 10 },
  { pattern: "complimentary", segment: "Complimentary", priority: 10 },
  { pattern: "house use", segment: "Complimentary", priority: 10 },
  { pattern: "staff", segment: "Complimentary", priority: 15 },
  { pattern: "blogger", segment: "Complimentary", priority: 15 },
  { pattern: "influe", segment: "Complimentary", priority: 15 },
  { pattern: "comp", segment: "Complimentary", priority: 80 },

  // Overseas TA
  { pattern: "luxury escape", segment: "Overseas TA", priority: 20 },
  { pattern: "heytrip", segment: "Overseas TA", priority: 20 },

  // Direct Booking
  { pattern: "alaric", segment: "Direct Booking", priority: 25 },
  { pattern: "individual", segment: "Direct Booking", priority: 25 },
  { pattern: "direct", segment: "Direct Booking", priority: 60 },

  // B2B Agent
  { pattern: "g2 travel", segment: "B2B Agent", priority: 25 },
  { pattern: "g2travel", segment: "B2B Agent", priority: 25 },
  { pattern: "hotelbeds", segment: "B2B Agent", priority: 25 },
  { pattern: "mg holiday", segment: "B2B Agent", priority: 25 },
  { pattern: "dida", segment: "B2B Agent", priority: 25 },

  // OTA
  { pattern: "booking.com", segment: "OTA", priority: 25 },
  { pattern: "booking", segment: "OTA", priority: 55 },
  { pattern: "agoda", segment: "OTA", priority: 25 },
  { pattern: "expedia", segment: "OTA", priority: 25 },
  { pattern: "traveloka", segment: "OTA", priority: 25 },
  { pattern: "tiket", segment: "OTA", priority: 25 },
  { pattern: "ctrip", segment: "OTA", priority: 25 },
  { pattern: "trip.com", segment: "OTA", priority: 25 },
  { pattern: "klook", segment: "OTA", priority: 25 },
];

const DEFAULT_SEGMENT = "Offline Travel Agent";

export function normalizeSegment(rawAgent: string | null | undefined): string {
  if (!rawAgent) return DEFAULT_SEGMENT;
  const s = String(rawAgent).toLowerCase();
  let best: Rule | null = null;
  for (const r of RULES) {
    if (s.includes(r.pattern) && (!best || r.priority < best.priority)) best = r;
  }
  return best?.segment ?? DEFAULT_SEGMENT;
}

/** Clean a raw agent value into a readable label (strips the "T&T" sub-tag). */
export function cleanAgent(rawAgent: string | null | undefined): string {
  if (!rawAgent) return "Unknown";
  let s = String(rawAgent).replace(/\*+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/[,\s]*t&t\s*$/i, ""); // drop trailing ", T&T"
  s = s.replace(/[,\s]+$/g, "").replace(/^[,\s]+/g, "").trim();
  if (!s) return "Unknown";
  return s
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}
