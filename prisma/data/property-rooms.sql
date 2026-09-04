-- Blue Karma Market Analytics — confirmed physical room counts per property.
-- Matches the PU-sheet "Room" totals and the room-inventory categories.
-- Load once:  sudo -u postgres psql -p 5432 -d marketanalytic -f property-rooms.sql
UPDATE public."Property" SET "roomsAvailable" = 18 WHERE code = 'BKDS';
UPDATE public."Property" SET "roomsAvailable" = 20 WHERE code = 'BKDU';
UPDATE public."Property" SET "roomsAvailable" = 15 WHERE code = 'BKV';
