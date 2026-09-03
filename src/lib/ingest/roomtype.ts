/**
 * Room-type taxonomy per property (Blue Karma). Raw codes carry bedding/config
 * suffixes (e.g. 1BSUID, 2BVSDD, 1BDGVH, 1BDSUICOT), so we normalize by the
 * LONGEST matching base-code prefix.
 *
 * Combine rules (applied at reservation level — rooms sharing a reservation):
 *   BKDS: 1BDSUICO + 2BPVLCO together  → "4BR Private Pool Villa (Combined)"
 *   BKV : DLXJOC   + 2BVSD   together  → "3BR Private Pool Villa (Combined)"
 */

type RT = { base: string; name: string };

const RT_BY_PROP: Record<string, RT[]> = {
  BKDS: [
    { base: "1BDSUICO", name: "1BR Suite (Combine)" },
    { base: "2BPVLCO", name: "2BR Private Pool (Combine)" },
    { base: "2BPVL", name: "2BR Private Pool Villa" },
    { base: "1BPVL", name: "1BR Private Pool Villa" },
    { base: "1BSUI", name: "Suite Room" },
  ],
  BKV: [
    { base: "DLXJOC", name: "Deluxe Joglo" },
    { base: "1BDSUI", name: "Suite Room" },
    { base: "1BDPVL", name: "1BR Private Pool Villa" },
    { base: "2BVSD", name: "2BR Suite" },
  ],
  BKDU: [
    { base: "1BDGV", name: "1BR Garden View" },
    { base: "1BSUI", name: "1BR Suite" },
    { base: "HMVIL", name: "Hammock Jungle View" },
    { base: "1BPVL", name: "1BR Private Pool Villa" },
  ],
};

const COMBINE: Record<string, { a: string; b: string; name: string }> = {
  BKDS: { a: "1BDSUICO", b: "2BPVLCO", name: "4BR Private Pool Villa (Combined)" },
  BKV: { a: "DLXJOC", b: "2BVSD", name: "3BR Private Pool Villa (Combined)" },
};

/** Raw room code → { base, name } via longest-prefix match against the property taxonomy. */
export function normalizeRoomType(property: string, raw: unknown): { base: string; name: string } {
  if (!raw) return { base: "", name: "Unknown" };
  const s = String(raw).trim().toUpperCase();
  if (!s) return { base: "", name: "Unknown" };
  let best: RT | null = null;
  for (const rt of RT_BY_PROP[property] ?? []) {
    if (s.startsWith(rt.base) && (!best || rt.base.length > best.base.length)) best = rt;
  }
  return best ? { base: best.base, name: best.name } : { base: s, name: s };
}

/**
 * Given the set of base codes present in one reservation, return the combined
 * room-type name if the property's combine pair is fully present, else null.
 */
export function combinedNameFor(property: string, bases: Set<string>): { a: string; b: string; name: string } | null {
  const c = COMBINE[property];
  if (c && bases.has(c.a) && bases.has(c.b)) return c;
  return null;
}
