# Market Analytics Dashboard — Project Spec (v2)

Internal revenue-management dashboard for **Blue Karma Dijiwa Group** — **BKDS** (Seminyak), **BKDU** (Ubud), and **BKV** (Village). Ingests reservation and daily-report exports from any PMS or template, auto-detects the shape, and turns them into the KPIs a revenue manager actually acts on: on-the-books occupancy, pickup, pace vs STLY, channel mix, segment budget-vs-actual, RevPAR, ADR, and nationality analysis.

Built with Claude Code + GitHub, self-hosted on the existing VPS, same stack as the ads dashboard.

---

## 1 · Revenue-management context — what the dashboard exists to answer

Hotel KPIs form a pyramid — the dashboard should be organized the same way:

| Layer | Purpose | KPIs | Cadence |
|---|---|---|---|
| **Base (operational)** | What just happened | Occupancy %, ADR, Room Nights, Revenue | Daily |
| **Middle (revenue intel)** | Where we're headed | RevPAR, Pickup, Booking Pace vs STLY, On-The-Books (OTB), ALOS, Cancellation rate, Channel mix | Daily forward-looking, weekly for lookback |
| **Top (profitability)** | Are we actually earning | TRevPAR, GOPPAR, Net revenue by channel, Budget vs Actual | Monthly |
| **Structural** | Longer-term shape | Booking window, Segment mix, Nationality mix, ALOS trend | Quarterly |

**Only three metrics genuinely need daily attention** — they're the forward-looking ones: pickup, pace, and on-the-books occupancy. Everything else moves too slowly to act on daily. The dashboard should reflect that hierarchy: don't bury pickup under six clicks.

**Core formulas** the system computes rather than expecting from the source file:
- **RevPAR** = ADR × Occupancy = Room Revenue ÷ Rooms Available
- **Occupancy %** = Rooms Sold ÷ (Rooms Available − OOO)
- **ADR** = Room Revenue ÷ Rooms Sold
- **Pickup (period P for target T)** = OTB rooms at end of P for T − OTB at start of P for T
- **Pace vs STLY** = OTB now for date D − OTB same-days-out last year for date D-365
- **ALOS** = Total room nights ÷ Number of reservations
- **Booking window / lead time** = Arrival date − Create date

---

## 2 · Data inputs — four archetypes, auto-detected

The system detects file shape on upload and routes to the right ingester. All accept `.csv` and `.xlsx`.

### Archetype A — Reservation/arrival list (transactional)
One row per reservation. Example: `Arrival list - bk.xlsx`.

Typical columns (variance expected — see column mapping below):
`No, Room Number, Reservation ID, Group Name, Repeater, Guest Name, VIP, Arrangement/Segment, Room Type, Room Rate, Adult/Child, Nationality, Date of Birth, Company/Agent (source), Arrival, Departure, Status, Region, Email, Phone`

Not every export has every column. Room rate may be missing (as in the sample) — the row still ingests; revenue-based KPIs just become unavailable for those rows.

**Use for:** guest analytics (nationality, source, repeater), segment mix, ALOS distribution, booking window, group vs FIT breakdown.

### Archetype B — Daily aggregate report
One row per date. Example: `Jan room rev 2026` sheet — `Date | Room Nights | Revenue | ADR`.

**Use for:** the base-layer KPIs (Occ, ADR, RevPAR, Revenue) on a proper time series, YoY comparison, weekend-vs-weekday analysis.

### Archetype C — Market segment budget vs actual (matrix)
Segments as rows, months as top-level column groups, each month split into `Budget | Actual | Rev Budget`. Example: `Market segment` sheet.

**Use for:** budget-vs-actual by segment, segment contribution to revenue, over/under-performance flagging.

### Archetype D — Pickup / pace matrix (advanced)
Days of month as rows, future months as columns, cells = cumulative OTB occupancy for that target month as of that day. Example: `JAN 2026 PU` sheet — a snapshot-per-day pickup grid plus a summary block (Avg Pickup/day, Occ on Hand, Room Sold, ADR, Revenue) plus reference blocks (Closing STLY, Budget, 3-month forecast).

**Use for:** pickup by day, pace vs STLY, on-the-books curves, forecast-vs-actual tracking. This is the highest-value data for revenue decisions but the hardest to parse — later milestone.

---

## 3 · Multi-sheet workbook handling

Reservation-list workbooks in production carry **one sheet per property per month** — the sample had 48 sheets across BKV / BKDU / BKDS × 2025-2026. Sheet name is metadata.

**Sheet name parser** — extracts `(property, year, month)` from names like:
- `BKV April` → BKV, current-year assumed, April
- `2026 BKDS JAN` → BKDS, 2026, January
- `BKV  APR ,2026` → BKV, 2026, April (double space, comma)
- `bkdu may 2026` → BKDU, 2026, May (lowercase)
- `BKDS JUN,26 ` → BKDS, 2026, June (trailing space, 2-digit year)

Three-layer approach same as column mapping (below): regex first, fuzzy on tokens, LLM fallback for oddballs. Ambiguous sheets go into a "needs review" queue rather than being silently dropped.

**On upload the user sees:**
- All sheets listed with detected `(property, month, year, archetype)`
- Confidence badge per sheet
- Checkbox to include/exclude each
- Bulk override if the parser got the property wrong (e.g., a whole workbook is BKDU)
- "Ingest selected" — processes each with its own archetype pipeline

---

## 4 · Flexible column mapping

For each archetype, canonical fields are defined. Source columns are mapped to canonical fields via three layers:

1. **Alias dictionary** — known variants map directly:
   `"Room Number" / "RmNo" / "No. Kamar" / "Kamar"` → `room_number`
   `"Nat" / "Nationality" / "Kebangsaan"` → `nationality`
   `"Arrangement" / "Rate Plan" / "Segment" / "Market Segment"` → `market_segment`
   `"Company/TA" / "Company/Agent" / "Source"` → `company_agent`
2. **Fuzzy match** — Levenshtein + token similarity for typos and near-matches (`"Reservtn ID"` → `reservation_id`).
3. **AI fallback (Groq)** — unmapped columns are sent with 5 sample values to the LLM; it returns the best canonical field or `ignore`.

**User confirmation UI** before ingest. Any override is written back to `ColumnAlias` — the system learns from every upload.

### Canonical fields — Archetype A (reservations)
`property_code, reservation_id, arrival_date, departure_date, stay_nights, room_number, room_type, room_rate, guest_name, region, nationality, adults, children, market_segment, source_channel, company_agent, create_date, is_repeater, is_vip, group_name, reservation_status, email, phone`

### Canonical fields — Archetype B (daily aggregate)
`property_code, date, room_nights, revenue, adr, rooms_available, occupancy_pct`
(any derived KPI missing is computed if the base fields exist)

### Canonical fields — Archetype C (segment matrix)
`property_code, month, segment, metric_type (budget|actual|rev_budget), rooms, revenue`

### Canonical fields — Archetype D (pickup matrix)
`property_code, snapshot_date, target_month, otb_occupancy, otb_rooms, otb_revenue`
plus reference blocks: `stly_kpis, budget_kpis, forecast_kpis` normalized into a single `MonthlyBenchmark` table.

---

## 5 · Segment normalization (Blue Karma canonical taxonomy)

Segments come in freely in the source data (`Booking.com`, `LUXURY ESCAPE`, `Alaric`, `[INDIVIDUAL RE`, `DIJIWA SANCTUA`, `Blogger / Infl`). The system normalizes to Blue Karma's actual segment taxonomy:

| Canonical segment | Typical source matches |
|---|---|
| OTA | Booking.com, Expedia, Agoda, DIDA, HeyTrip |
| OTA (Wellness) | Wellness-specific OTA channels |
| Direct Booking | [INDIVIDUAL RE…, direct enquiries |
| Website | Own website bookings |
| Walk-in | Walk-in tag |
| Corporate | Named corporate accounts |
| Local TA | Domestic travel agents (Alaric, local names) |
| Overseas TA | International travel agents (Luxury Escape, HeyTrip International) |
| Local Wholesale | Wholesale contracts |
| B2B | B2B contracts |
| FIT Wellness | Independent wellness guests |
| Complimentary | Comp, house use, staff |
| Group | Group Name populated |

Mapping rules are seeded, editable in-UI, and stored in `SegmentAlias`.

---

## 6 · Property tagging

Priority order:
1. **Sheet name parser** (multi-sheet workbook) — usually authoritative.
2. **Filename hint** — `BKDU_...`, `daily_BKDS_2026.xlsx`.
3. **`Property` column in data**, if present.
4. **User selection at upload** — required if none of the above resolves.

Every row is tagged with `property_code` (BKDS / BKDU / BKV) so cross-property filters work.

---

## 7 · Deduplication

- **Archetype A**: unique key = `property_code + reservation_id + arrival_date`. Re-upload updates in place.
- **Archetype B**: unique key = `property_code + date`. Latest upload wins.
- **Archetype C**: unique key = `property_code + month + segment + metric_type`.
- **Archetype D**: unique key = `property_code + snapshot_date + target_month`. Pickup grids are append-only history.

---

## 8 · Dashboard — organized by cadence

Landing page = the three forward-looking numbers. Everything else is one click away.

### Daily forward-looking (top of page)
- **Pickup last 24h / 7d** — rooms and revenue added for future dates, per property.
- **On-the-books occupancy** — curves for next 30 / 60 / 90 days, per property, with STLY overlay.
- **Booking pace vs STLY** — OTB now for month M vs OTB same-days-out last year for month M-12.

### Weekly performance strip
- Occ %, ADR, RevPAR — rolling 7d, with WoW and YoY deltas.
- Channel mix — % rooms and % revenue by canonical segment.
- Cancellation rate — by channel.
- Repeater share — % rooms and % revenue.

### Monthly management view
- Budget vs Actual — by segment (from Archetype C), month view.
- Revenue mix — segment × property matrix.
- TRevPAR (later — needs non-room revenue feed).
- GOPPAR (later — needs cost data; hook into BEP sheet).
- ALOS by segment.

### Guest analytics
- Nationality breakdown — bar + world map (top N + "others"), filterable by segment.
- Region breakdown (for INA guests) — Jakarta, Bali, etc.
- Repeater vs new — donut + revenue contribution.
- Booking window distribution — histogram (days between create and arrival).
- Length-of-stay distribution — histogram.

### Property comparison
Side-by-side cards for BKDS / BKDU / BKV: Occ, ADR, RevPAR, Revenue, Pace, top segment, top nationality — one glance, three properties.

### KPI strip (persistent, top of every view)
Total revenue MTD, room nights MTD, ADR, occupancy %, unique guests, % repeater, top segment, top nationality.

---

## 9 · Filters (global)

Property (multi-select) · date range (arrival or stay-night basis, toggle) · segment · nationality · channel · repeater · VIP · room type.

Filter state syncs to URL — dashboards are shareable via link.

---

## 10 · Export

- Chart → PNG
- Filtered data → CSV
- Monthly digital report → PDF (ties into your recurring Tiffany report — later phase)

---

## 11 · AI insights layer (Groq, bilingual EN/ID)

Final phase. Same pattern as ads dashboard Phase 9. Auto-generates plain-language summaries:

- "BKDU room nights turun 12% WoW; segmen OTA drop 18 rooms sementara Website naik 5. Cancellation rate normal. Cek harga BAR OTA weekend depan."
- "BKDS pace for December is +8% vs STLY, driven by Direct Booking (+22 rooms). ADR holding at IDR 3.4M."

Model configurable, prompt templates versioned.

---

## 12 · Tech stack (aligned with ads dashboard)

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Charts**: Recharts + `react-simple-maps` (nationality map)
- **Backend**: Next.js API routes + Node.js
- **DB**: PostgreSQL + Prisma (can share the ads-dashboard instance — open decision)
- **File parsing**: `xlsx` (SheetJS) + `papaparse` + `exceljs` for formula-aware reads when needed
- **AI mapping + insights**: Groq (configurable model)
- **Auth**: NextAuth (email + password)
- **Deploy**: Docker + Nginx on the existing VPS
- **Repo**: GitHub, built with Claude Code

---

## 13 · Data model (Prisma sketch)

```prisma
model Property {
  code         String   @id  // BKDS, BKDU, BKV
  name         String
  roomsAvailable Int          // for occupancy math (BKDU=38, etc.)
  reservations Reservation[]
  dailyStats   DailyStat[]
  segmentActuals SegmentActual[]
  pickupSnapshots PickupSnapshot[]
  benchmarks   MonthlyBenchmark[]
}

// Archetype A
model Reservation {
  id              String   @id @default(cuid())
  propertyCode    String
  property        Property @relation(fields: [propertyCode], references: [code])
  reservationId   String
  arrivalDate     DateTime
  departureDate   DateTime
  stayNights      Int
  createDate      DateTime?
  bookingWindow   Int?         // computed: arrivalDate - createDate
  roomNumber      String?
  roomType        String?
  roomRate        Decimal?
  guestName       String
  region          String?
  nationality     String?
  adults          Int?
  children        Int?
  marketSegment   String?      // canonical, after normalization
  sourceChannel   String?      // canonical channel (OTA/Direct/etc.)
  companyAgent    String?      // raw source
  isRepeater      Boolean  @default(false)
  isVip           Boolean  @default(false)
  groupName       String?
  status          String?
  email           String?
  phone           String?
  uploadedAt      DateTime @default(now())
  sourceFileId    String

  @@unique([propertyCode, reservationId, arrivalDate])
  @@index([propertyCode, arrivalDate])
  @@index([marketSegment])
  @@index([nationality])
}

// Archetype B
model DailyStat {
  id              String   @id @default(cuid())
  propertyCode    String
  property        Property @relation(fields: [propertyCode], references: [code])
  date            DateTime
  roomNights      Int
  revenue         Decimal
  adr             Decimal?     // computed if missing
  roomsAvailable  Int?
  occupancyPct    Decimal?     // computed if missing
  revpar          Decimal?     // computed
  sourceFileId    String

  @@unique([propertyCode, date])
  @@index([propertyCode, date])
}

// Archetype C
model SegmentActual {
  id              String   @id @default(cuid())
  propertyCode    String
  property        Property @relation(fields: [propertyCode], references: [code])
  month           DateTime     // first of month
  segment         String       // canonical
  budgetRooms     Int?
  actualRooms     Int?
  revBudget       Decimal?
  actualRevenue   Decimal?
  sourceFileId    String

  @@unique([propertyCode, month, segment])
}

// Archetype D
model PickupSnapshot {
  id              String   @id @default(cuid())
  propertyCode    String
  property        Property @relation(fields: [propertyCode], references: [code])
  snapshotDate    DateTime     // the day the pickup was captured
  targetMonth     DateTime     // first of the month being forecast
  otbOccupancy    Decimal
  otbRooms        Int?
  otbRevenue      Decimal?
  sourceFileId    String

  @@unique([propertyCode, snapshotDate, targetMonth])
  @@index([propertyCode, targetMonth, snapshotDate])
}

model MonthlyBenchmark {
  id              String   @id @default(cuid())
  propertyCode    String
  property        Property @relation(fields: [propertyCode], references: [code])
  month           DateTime
  kind            String       // 'stly' | 'budget' | 'forecast'
  occupancyPct    Decimal?
  adr             Decimal?
  revenue         Decimal?
  roomsSold       Int?

  @@unique([propertyCode, month, kind])
}

model UploadFile {
  id           String   @id @default(cuid())
  filename     String
  archetype    String       // 'A_reservation' | 'B_daily' | 'C_segment' | 'D_pickup'
  sheetsProcessed Int
  rowsTotal    Int
  rowsIngested Int
  rowsSkipped  Int
  uploadedBy   String
  uploadedAt   DateTime @default(now())
  mapping      Json         // column and sheet mapping used
}

model ColumnAlias {
  id             String @id @default(cuid())
  archetype      String
  sourceHeader   String
  canonicalField String
  confidence     Float
  createdBy      String?      // null = seeded, user id = learned
  createdAt      DateTime @default(now())
  @@unique([archetype, sourceHeader, canonicalField])
}

model SegmentAlias {
  id             String @id @default(cuid())
  sourcePattern  String       // "booking.com", "luxury escape", etc. (case-insensitive contains)
  canonicalSegment String     // "OTA", "Overseas TA", etc.
  createdBy      String?
  createdAt      DateTime @default(now())
  @@unique([sourcePattern, canonicalSegment])
}
```

---

## 14 · Milestones (resequenced)

1. **Setup** — repo, Next.js, Prisma, Postgres, Docker on VPS. Seed `Property` (BKDS/BKDU/BKV with rooms available), seed `SegmentAlias` and `ColumnAlias` from this spec.
2. **Upload + parse foundation** — drag-drop, sheet enumeration, size/type checks, 20-row raw preview per sheet.
3. **Sheet name parser** — regex + fuzzy + Groq fallback for `(property, year, month, archetype)`. Confirmation UI.
4. **Archetype A ingest** — reservation-list column mapping, dedupe, segment normalization, learning aliases.
5. **Guest analytics dashboard** — nationality, segment mix, source/channel, repeater, ALOS, booking window (only needs Archetype A data).
6. **Archetype B ingest + Base KPIs** — daily aggregate ingestion, compute derived KPIs, Occ/ADR/RevPAR time series with WoW/YoY.
7. **Archetype C ingest + Segment Budget vs Actual view.**
8. **Property comparison + global filters + URL-synced state.**
9. **Auth + user management.**
10. **Archetype D ingest + Pickup/Pace view** — the advanced revenue view. Hardest to parse; last core milestone.
11. **Export (CSV/PNG) + polish + monthly PDF report generator.**
12. **AI insights layer (Groq, bilingual EN/ID).**

---

## 15 · Kickoff prompt for Claude Code

Paste into a fresh Claude Code session at the repo root:

> Read `market-analytics-dashboard-project.md` in this repo. Set up **Milestone 1 (Setup)** exactly as specified: Next.js 14 + TypeScript + Tailwind + shadcn/ui + Prisma + Postgres, with a Dockerfile and docker-compose for local dev and VPS deploy. Follow the conventions from my existing ads-dashboard repo where possible. Seed the `Property` table (BKDS, BKDU=38 rooms, BKV) and seed `SegmentAlias` and `ColumnAlias` from Sections 4 and 5 of the spec. Do **not** start Milestone 2 yet — stop after Milestone 1 and show me what you built so I can run it locally.

Run one milestone per session; review before moving on.

---

## 16 · Glossary (for anyone joining the project mid-way)

- **ADR** — Average Daily Rate = Room Revenue ÷ Rooms Sold
- **ALOS** — Average Length of Stay
- **BAR** — Best Available Rate (published selling rate for the day)
- **BEP** — Break-Even Point
- **GOPPAR** — Gross Operating Profit Per Available Room
- **OOO** — Out Of Order (rooms unavailable due to maintenance)
- **OTB** — On The Books (already-confirmed reservations)
- **Pace** — OTB now vs OTB same-days-out last year (STLY)
- **Pickup** — Rooms added between two snapshots
- **RevPAR** — Revenue Per Available Room = ADR × Occupancy
- **STLY** — Same Time Last Year (365-day offset comparison)
- **TRevPAR** — Total Revenue Per Available Room (includes F&B, spa, etc.)

---

## 17 · Open decisions

- Reuse the ads-dashboard Postgres instance, or separate DB?
- Auth scope — internal team only, or read-only view for owners/directors (Tiffany, Alexa)?
- Historical backfill — upload full 2025 up front for YoY baselines, or start from a chosen month?
- Currency — keep IDR everywhere, or normalize to USD for owner reporting?
- Comp-set data — do we have access to STR or a comparable benchmarking feed for RGI/MPI/ARI, or skip the index family for now?
- Room count per property — need BKDS and BKV `roomsAvailable` numbers to seed occupancy math (BKDU = 38 from the sample).
