/**
 * Physical room inventory per property + the room-category occupancy model.
 *
 * The confirmed unit counts (BKDS 18, BKDU 20, BKV 15) are the source of truth
 * for "rooms available". Room-category occupancy is derived from the arrival
 * list (ReservationFact), whose room-nights reconcile to physical room-nights
 * (total known room-nights ÷ units×days tracks the PU-sheet occupancy to within
 * a couple of points).
 *
 * Each physical room category is its own line so every room is visible, even in
 * a month where it had no bookings. A line is only merged with another when the
 * booking system genuinely can't tell them apart — BKV "Suite Room" covers both
 * Suite Joglo and One Bedroom Suite under one code, so those two stay together
 * (with both members listed). "Combined" villas are shown on their own line; a
 * combined booking (e.g. a 4-bedroom made of two 2-bedroom villas) spans more
 * rooms than its one nominal unit, so that line can read above 100% — the note
 * says so, and the base-room lines plus the All-rooms total stay within capacity.
 *
 * To change a mapping, edit the group's `reservationLabels` (must match the
 * ReservationFact.roomType strings exactly) or its `members`. Order here is the
 * display order.
 */

export type InvCategory = { name: string; units: number };
export type OccGroup = {
  key: string;
  label: string;
  members: InvCategory[]; // physical categories in this group
  reservationLabels: string[]; // arrival-list room types that map here
  note?: string;
};
export type PropertyInventory = { code: string; totalUnits: number; groups: OccGroup[] };

const u = (name: string, units: number): InvCategory => ({ name, units });

export const ROOM_INVENTORY: Record<string, PropertyInventory> = {
  BKDU: {
    code: "BKDU",
    totalUnits: 20,
    groups: [
      { key: "garden", label: "One bedroom villa · garden view", members: [u("One bedroom villa garden view", 12)], reservationLabels: ["1BR Garden View"] },
      { key: "suite", label: "One bedroom suite", members: [u("One bedroom suite", 4)], reservationLabels: ["1BR Suite"] },
      { key: "hammock", label: "One bedroom villa · hammock jungle view", members: [u("One bedroom villa hammock jungle view", 3)], reservationLabels: ["Hammock Jungle View"] },
      { key: "pool", label: "One bedroom private pool villa", members: [u("One bedroom private pool villa", 1)], reservationLabels: ["1BR Private Pool Villa"] },
    ],
  },
  BKDS: {
    code: "BKDS",
    totalUnits: 18,
    groups: [
      { key: "suite", label: "One bedroom suite", members: [u("One bedroom suite", 7)], reservationLabels: ["Suite Room"] },
      { key: "suitecombine", label: "One bedroom suite (combine)", members: [u("One bedroom suite combine", 2)], reservationLabels: ["1BR Suite (Combine)"], note: "Two suites joined and sold as one unit." },
      {
        key: "poolvillas",
        label: "Private pool villas",
        members: [u("One bedroom suite w/ private pool", 6), u("Two bedroom private pool villa", 2), u("Two bedroom pool villa combine", 1)],
        reservationLabels: ["1BR Private Pool Villa", "2BR Private Pool Villa", "2BR Private Pool (Combine)", "4BR Private Pool Villa (Combined)"],
        note: "One-bedroom, two-bedroom and combined pool villas are the same physical villas in different layouts — a 4-bedroom is two villas joined — so a single combined booking spans more than one villa. Measured across the whole pool of 9 so the % stays honest.",
      },
    ],
  },
  BKV: {
    code: "BKV",
    totalUnits: 15,
    groups: [
      {
        key: "suite",
        label: "Suite Joglo + one bedroom suite",
        members: [u("Suite Joglo", 4), u("One bedroom suite", 8)],
        reservationLabels: ["Suite Room"],
        note: "Suite Joglo and One Bedroom Suite are sold under one 'Suite Room' code.",
      },
      {
        key: "twobed",
        label: "Two bedroom suite",
        members: [u("Two bedroom suite", 1)],
        reservationLabels: ["2BR Suite", "3BR Private Pool Villa (Combined)"],
        note: "Includes the 3-bedroom combined booking, which joins the two-bedroom with a pool villa.",
      },
      { key: "pooljoglo", label: "One bedroom private pool Joglo", members: [u("One bedroom private pool Joglo", 1)], reservationLabels: ["1BR Private Pool Villa"] },
      { key: "deluxe", label: "Deluxe Joglo combine", members: [u("Deluxe Joglo combine", 1)], reservationLabels: ["Deluxe Joglo"] },
    ],
  },
};

/** Calendar days in a "YYYY-MM" month (UTC, handles leap years). */
export function daysInMonthYM(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
