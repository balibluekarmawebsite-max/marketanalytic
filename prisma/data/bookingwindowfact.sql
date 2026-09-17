-- Blue Karma — BookingWindowFact (lead-time aggregates, no PII).
-- Requires the BookingWindowFact table (run: npx prisma db push).
-- Load:  sudo -u postgres psql -p 5432 -d marketanalytic -f prisma/data/bookingwindowfact.sql
BEGIN;
TRUNCATE "BookingWindowFact";
INSERT INTO public."BookingWindowFact" (id, "propertyCode", month, agent, reservations, "leadDaysSum", "lead0_7", "lead8_30", "lead31_60", "lead61_90", "lead91plus") VALUES ('cmu524yew0006pavu941wkf0z', 'BKV', '2026-03-01 00:00:00', 'Agoda', 1, 57, 0, 0, 1, 0, 0);
INSERT INTO public."BookingWindowFact" (id, "propertyCode", month, agent, reservations, "leadDaysSum", "lead0_7", "lead8_30", "lead31_60", "lead61_90", "lead91plus") VALUES ('cmu524yew0000pavunwhkmvyz', 'BKV', '2026-03-01 00:00:00', 'Alaric', 20, 642, 6, 6, 3, 5, 0);
INSERT INTO public."BookingWindowFact" (id, "propertyCode", month, agent, reservations, "leadDaysSum", "lead0_7", "lead8_30", "lead31_60", "lead61_90", "lead91plus") VALUES ('cmu524yew0001pavucz6fvkjg', 'BKV', '2026-03-01 00:00:00', 'Booking.com', 75, 2246, 39, 17, 13, 3, 3);
INSERT INTO public."BookingWindowFact" (id, "propertyCode", month, agent, reservations, "leadDaysSum", "lead0_7", "lead8_30", "lead31_60", "lead61_90", "lead91plus") VALUES ('cmu524yew0008pavuonwndrpt', 'BKV', '2026-03-01 00:00:00', 'Dida', 1, 5, 1, 0, 0, 0, 0);
INSERT INTO public."BookingWindowFact" (id, "propertyCode", month, agent, reservations, "leadDaysSum", "lead0_7", "lead8_30", "lead31_60", "lead61_90", "lead91plus") VALUES ('cmu524yew0003pavups94vhvi', 'BKV', '2026-03-01 00:00:00', 'Expedia', 4, 9, 4, 0, 0, 0, 0);
INSERT INTO public."BookingWindowFact" (id, "propertyCode", month, agent, reservations, "leadDaysSum", "lead0_7", "lead8_30", "lead31_60", "lead61_90", "lead91plus") VALUES ('cmu524yew0005pavu9jji1okn', 'BKV', '2026-03-01 00:00:00', 'G2 Travel', 2, 111, 0, 0, 1, 1, 0);
INSERT INTO public."BookingWindowFact" (id, "propertyCode", month, agent, reservations, "leadDaysSum", "lead0_7", "lead8_30", "lead31_60", "lead61_90", "lead91plus") VALUES ('cmu524yew0004pavu3hrbbsvh', 'BKV', '2026-03-01 00:00:00', 'Luxury Escape', 2, 209, 0, 0, 0, 1, 1);
INSERT INTO public."BookingWindowFact" (id, "propertyCode", month, agent, reservations, "leadDaysSum", "lead0_7", "lead8_30", "lead31_60", "lead61_90", "lead91plus") VALUES ('cmu524yew0007pavu8wkmwfjx', 'BKV', '2026-03-01 00:00:00', 'Mg Holiday', 1, 52, 0, 0, 1, 0, 0);
INSERT INTO public."BookingWindowFact" (id, "propertyCode", month, agent, reservations, "leadDaysSum", "lead0_7", "lead8_30", "lead31_60", "lead61_90", "lead91plus") VALUES ('cmu524yew0002pavuz4fnma7b', 'BKV', '2026-03-01 00:00:00', '[individual Reservation]', 26, 653, 12, 1, 9, 4, 0);
COMMIT;
