/**
 * Seed script — Milestone 1.
 *
 * Seeds:
 *   - Property        (BKDS, BKDU=38 rooms, BKV)
 *   - SegmentAlias    (Blue Karma canonical taxonomy, Section 5 of the spec)
 *   - ColumnAlias     (Archetype A column dictionary, Section 4 of the spec)
 *
 * Idempotent: safe to run repeatedly. Seeded rows have createdBy = null so the
 * app can tell them apart from aliases the system learns from user uploads.
 *
 * Run with:  npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// 1 · Properties
// ---------------------------------------------------------------------------
// roomsAvailable is the confirmed physical room count per property (matches the
// PU-sheet "Room" totals and the room-inventory breakdown in room-inventory.ts).
const properties = [
  { code: "BKDS", name: "Blue Karma Dijiwa Seminyak", city: "Seminyak", roomsAvailable: 18 },
  { code: "BKDU", name: "Blue Karma Dijiwa Ubud", city: "Ubud", roomsAvailable: 20 },
  { code: "BKV", name: "Blue Karma Village", city: "Seminyak", roomsAvailable: 15 },
];

// ---------------------------------------------------------------------------
// 2 · Segment aliases (raw source value  ->  Blue Karma canonical segment)
// ---------------------------------------------------------------------------
// Matched as case-insensitive "contains". `priority` breaks ties: LOWER numbers
// are checked first, so specific patterns (e.g. "heytrip international") must
// sit above generic ones (e.g. "heytrip") or the generic rule would swallow them.
const segmentAliases: {
  sourcePattern: string;
  canonicalSegment: string;
  priority: number;
}[] = [
  // --- Specific overrides first (low priority number) ---
  { sourcePattern: "heytrip international", canonicalSegment: "Overseas TA", priority: 10 },
  { sourcePattern: "luxury escape", canonicalSegment: "Overseas TA", priority: 10 },

  // --- OTA ---
  { sourcePattern: "booking.com", canonicalSegment: "OTA", priority: 50 },
  { sourcePattern: "booking", canonicalSegment: "OTA", priority: 60 },
  { sourcePattern: "expedia", canonicalSegment: "OTA", priority: 50 },
  { sourcePattern: "agoda", canonicalSegment: "OTA", priority: 50 },
  { sourcePattern: "dida", canonicalSegment: "OTA", priority: 50 },
  { sourcePattern: "heytrip", canonicalSegment: "OTA", priority: 55 },
  { sourcePattern: "traveloka", canonicalSegment: "OTA", priority: 50 },
  { sourcePattern: "tiket", canonicalSegment: "OTA", priority: 50 },

  // --- Overseas / Local TA ---
  { sourcePattern: "alaric", canonicalSegment: "Local TA", priority: 50 },

  // --- Direct / Website / Walk-in ---
  { sourcePattern: "individual re", canonicalSegment: "Direct Booking", priority: 40 },
  { sourcePattern: "[individual", canonicalSegment: "Direct Booking", priority: 40 },
  { sourcePattern: "direct", canonicalSegment: "Direct Booking", priority: 60 },
  { sourcePattern: "website", canonicalSegment: "Website", priority: 50 },
  { sourcePattern: "walk", canonicalSegment: "Walk-in", priority: 50 },

  // --- Complimentary / house use ---
  { sourcePattern: "complimentary", canonicalSegment: "Complimentary", priority: 40 },
  { sourcePattern: "comp", canonicalSegment: "Complimentary", priority: 70 },
  { sourcePattern: "house use", canonicalSegment: "Complimentary", priority: 40 },
  { sourcePattern: "staff", canonicalSegment: "Complimentary", priority: 50 },

  // --- Wellness ---
  { sourcePattern: "fit wellness", canonicalSegment: "FIT Wellness", priority: 30 },

  // --- Corporate / B2B / Wholesale ---
  { sourcePattern: "corporate", canonicalSegment: "Corporate", priority: 50 },
  { sourcePattern: "wholesale", canonicalSegment: "Local Wholesale", priority: 50 },
  { sourcePattern: "b2b", canonicalSegment: "B2B", priority: 50 },
];

// ---------------------------------------------------------------------------
// 3 · Column aliases — Archetype A (reservation list)
// ---------------------------------------------------------------------------
// Exact canonical header names get confidence 1.0; known variants slightly less.
// The ingest pipeline (Milestone 4) will append user-confirmed mappings here.
const ARCH_A = "A_reservation";
const columnAliases: {
  archetype: string;
  sourceHeader: string;
  canonicalField: string;
  confidence: number;
}[] = [
  // room_number
  { archetype: ARCH_A, sourceHeader: "Room Number", canonicalField: "room_number", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "RmNo", canonicalField: "room_number", confidence: 0.9 },
  { archetype: ARCH_A, sourceHeader: "No. Kamar", canonicalField: "room_number", confidence: 0.9 },
  { archetype: ARCH_A, sourceHeader: "Kamar", canonicalField: "room_number", confidence: 0.85 },
  // reservation_id
  { archetype: ARCH_A, sourceHeader: "Reservation ID", canonicalField: "reservation_id", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Reservation No", canonicalField: "reservation_id", confidence: 0.9 },
  { archetype: ARCH_A, sourceHeader: "Res ID", canonicalField: "reservation_id", confidence: 0.85 },
  // arrival / departure
  { archetype: ARCH_A, sourceHeader: "Arrival", canonicalField: "arrival_date", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Arrival Date", canonicalField: "arrival_date", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Check In", canonicalField: "arrival_date", confidence: 0.85 },
  { archetype: ARCH_A, sourceHeader: "Departure", canonicalField: "departure_date", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Departure Date", canonicalField: "departure_date", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Check Out", canonicalField: "departure_date", confidence: 0.85 },
  // guest / room
  { archetype: ARCH_A, sourceHeader: "Guest Name", canonicalField: "guest_name", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Room Type", canonicalField: "room_type", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Room Rate", canonicalField: "room_rate", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Rate", canonicalField: "room_rate", confidence: 0.8 },
  // nationality / region
  { archetype: ARCH_A, sourceHeader: "Nationality", canonicalField: "nationality", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Nat", canonicalField: "nationality", confidence: 0.9 },
  { archetype: ARCH_A, sourceHeader: "Kebangsaan", canonicalField: "nationality", confidence: 0.9 },
  { archetype: ARCH_A, sourceHeader: "Region", canonicalField: "region", confidence: 1 },
  // segment / channel
  { archetype: ARCH_A, sourceHeader: "Market Segment", canonicalField: "market_segment", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Segment", canonicalField: "market_segment", confidence: 0.9 },
  { archetype: ARCH_A, sourceHeader: "Arrangement", canonicalField: "market_segment", confidence: 0.9 },
  { archetype: ARCH_A, sourceHeader: "Rate Plan", canonicalField: "market_segment", confidence: 0.85 },
  { archetype: ARCH_A, sourceHeader: "Company/TA", canonicalField: "company_agent", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Company/Agent", canonicalField: "company_agent", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Source", canonicalField: "company_agent", confidence: 0.85 },
  // occupancy / party
  { archetype: ARCH_A, sourceHeader: "Adult", canonicalField: "adults", confidence: 0.9 },
  { archetype: ARCH_A, sourceHeader: "Adults", canonicalField: "adults", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Child", canonicalField: "children", confidence: 0.9 },
  { archetype: ARCH_A, sourceHeader: "Children", canonicalField: "children", confidence: 1 },
  // flags / group / status
  { archetype: ARCH_A, sourceHeader: "Repeater", canonicalField: "is_repeater", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "VIP", canonicalField: "is_vip", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Group Name", canonicalField: "group_name", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Status", canonicalField: "reservation_status", confidence: 1 },
  // contact
  { archetype: ARCH_A, sourceHeader: "Email", canonicalField: "email", confidence: 1 },
  { archetype: ARCH_A, sourceHeader: "Phone", canonicalField: "phone", confidence: 1 },
];

async function main() {
  console.log("Seeding Blue Karma Market Analytics database…\n");

  // Properties
  for (const p of properties) {
    await prisma.property.upsert({
      where: { code: p.code },
      update: { name: p.name, city: p.city, roomsAvailable: p.roomsAvailable },
      create: p,
    });
  }
  console.log(`  ✓ ${properties.length} properties`);

  // Segment aliases
  for (const s of segmentAliases) {
    await prisma.segmentAlias.upsert({
      where: {
        sourcePattern_canonicalSegment: {
          sourcePattern: s.sourcePattern,
          canonicalSegment: s.canonicalSegment,
        },
      },
      update: { priority: s.priority },
      create: { ...s, createdBy: null },
    });
  }
  console.log(`  ✓ ${segmentAliases.length} segment aliases`);

  // Column aliases
  for (const c of columnAliases) {
    await prisma.columnAlias.upsert({
      where: {
        archetype_sourceHeader_canonicalField: {
          archetype: c.archetype,
          sourceHeader: c.sourceHeader,
          canonicalField: c.canonicalField,
        },
      },
      update: { confidence: c.confidence },
      create: { ...c, createdBy: null },
    });
  }
  console.log(`  ✓ ${columnAliases.length} column aliases (Archetype A)`);

  console.log("\nSeed complete.");
  console.log(
    "  Note: BKDS and BKV room counts are still null — fill them in prisma/seed.ts",
  );
  console.log("  and re-run `npm run db:seed` to enable occupancy math for them.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
