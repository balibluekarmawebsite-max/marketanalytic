/**
 * Physical room inventory per property + the room-category occupancy model.
 *
 * The confirmed unit counts (BKDS 18, BKDU 20, BKV 15) are the source of truth
 * for "rooms available". Room-category occupancy is derived from the arrival
 * list (ReservationFact), whose room-nights reconcile to physical room-nights
 * (total known room-nights ÷ units×days tracks the PU-sheet occupancy to within
 * a couple of points).
 *
 * Each room product is its own line so every room is visible, even in a month
 * where it had no bookings. A line is only merged with another when the booking
 * system genuinely can't tell them apart — BKV "Suite Room" covers both Suite
 * Joglo and One Bedroom Suite under one code, so those two stay together (with
 * both members listed).
 *
 * "Combined" villas are their own product line. A combined booking joins physical
 * villas for one stay — a BKDS 4-bedroom is two pool villas joined — so it reuses
 * villas that also appear on the base-room lines. Those pool lines are therefore a
 * product-mix view whose units overlap; the physical total (totalUnits) and the
 * All-rooms row stay at the real room count. A busy month can still push a small
 * product line above 100% (shown as 100%+), since a single villa can turn over.
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
      { key: "suitecombine", label: "One bedroom suite (combine)", members: [u("One bedroom suite combine", 2)], reservationLabels: ["1BR Suite (Combine)"], note: "Two suites joined and sold as one." },
      { key: "poolsuite", label: "One bedroom suite w/ private pool", members: [u("One bedroom suite w/ private pool", 6)], reservationLabels: ["1BR Private Pool Villa"] },
      { key: "pool2br", label: "Two bedroom private pool villa", members: [u("Two bedroom private pool villa", 2)], reservationLabels: ["2BR Private Pool Villa"] },
      { key: "poolcombine", label: "Two bedroom pool villa (combine)", members: [u("Two bedroom pool villa combine", 1)], reservationLabels: ["2BR Private Pool (Combine)"], note: "The combine villa sold on its own as a two-bedroom." },
      {
        key: "pool4br",
        label: "Four bedroom private pool villa (combined)",
        members: [u("two pool villas joined", 2)],
        reservationLabels: ["4BR Private Pool Villa (Combined)"],
        note: "A 4-bedroom is two pool villas joined for the same stay, so it reuses two of the villas above — a product view that overlaps the two-bedroom lines; the physical total stays 18.",
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
