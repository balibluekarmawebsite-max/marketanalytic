/**
 * Normalize a raw "Company / Agent" value into (a) a canonical Blue Karma market
 * segment and (b) a cleaned agent label. Mirrors the seeded SegmentAlias rules
 * (Section 5 of the spec); priority breaks ties so specific patterns win.
 */

type Rule = { pattern: string; segment: string; priority: number };

const RULES: Rule[] = [
  // specific first (low priority number)
  { pattern: "heytrip international", segment: "Overseas TA", priority: 10 },
  { pattern: "luxury escape", segment: "Overseas TA", priority: 10 },
  { pattern: "g2 travel", segment: "Overseas TA", priority: 20 },
  { pattern: "fit wellness", segment: "FIT Wellness", priority: 30 },
  { pattern: "individual re", segment: "Direct Booking", priority: 40 },
  { pattern: "[individual", segment: "Direct Booking", priority: 40 },
  { pattern: "complimentary", segment: "Complimentary", priority: 40 },
  { pattern: "house use", segment: "Complimentary", priority: 40 },
  // OTAs
  { pattern: "booking.com", segment: "OTA", priority: 50 },
  { pattern: "expedia", segment: "OTA", priority: 50 },
  { pattern: "agoda", segment: "OTA", priority: 50 },
  { pattern: "dida", segment: "OTA", priority: 50 },
  { pattern: "traveloka", segment: "OTA", priority: 50 },
  { pattern: "tiket", segment: "OTA", priority: 50 },
  { pattern: "heytrip", segment: "OTA", priority: 55 },
  { pattern: "klook", segment: "OTA", priority: 50 },
  { pattern: "booking", segment: "OTA", priority: 60 },
  // Bedbanks / wholesalers (international)
  { pattern: "hotelbeds", segment: "Overseas TA", priority: 45 },
  { pattern: "webbeds", segment: "Overseas TA", priority: 45 },
  { pattern: "panorama", segment: "Local TA", priority: 45 },
  // Local / Bali DMCs and travel agents
  { pattern: "asian trails", segment: "Local TA", priority: 45 },
  { pattern: "pegasus", segment: "Local TA", priority: 45 },
  { pattern: "bali authentique", segment: "Local TA", priority: 45 },
  { pattern: "bali autrement", segment: "Local TA", priority: 45 },
  { pattern: "mg holiday", segment: "Local TA", priority: 45 },
  { pattern: "wow travel", segment: "Local TA", priority: 45 },
  { pattern: "kba", segment: "Local TA", priority: 45 },
  // Media / barter
  { pattern: "blogger", segment: "Complimentary", priority: 35 },
  { pattern: "influe", segment: "Complimentary", priority: 35 },
  // TAs / other channels
  { pattern: "alaric", segment: "Local TA", priority: 50 },
  { pattern: "website", segment: "Website", priority: 50 },
  { pattern: "walk", segment: "Walk-in", priority: 50 },
  { pattern: "corporate", segment: "Corporate", priority: 50 },
  { pattern: "wholesale", segment: "Local Wholesale", priority: 50 },
  { pattern: "b2b", segment: "B2B", priority: 50 },
  { pattern: "staff", segment: "Complimentary", priority: 50 },
  { pattern: "direct", segment: "Direct Booking", priority: 60 },
  { pattern: "individual", segment: "Direct Booking", priority: 65 },
  { pattern: "comp", segment: "Complimentary", priority: 70 },
];

export function normalizeSegment(rawAgent: string | null | undefined): string {
  if (!rawAgent) return "Unknown";
  const s = String(rawAgent).toLowerCase();
  let best: Rule | null = null;
  for (const r of RULES) {
    if (s.includes(r.pattern) && (!best || r.priority < best.priority)) best = r;
  }
  return best?.segment ?? "Other";
}

/** Clean a raw agent value into a readable label (strips the "T&T" sub-tag). */
export function cleanAgent(rawAgent: string | null | undefined): string {
  if (!rawAgent) return "Unknown";
  let s = String(rawAgent).replace(/\*+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/[,\s]*t&t\s*$/i, ""); // drop trailing ", T&T"
  s = s.replace(/[,\s]+$/g, "").replace(/^[,\s]+/g, "").trim();
  if (!s) return "Unknown";
  // Title-case words while preserving embedded dots/digits (Booking.com, G2 Travel).
  return s
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}
