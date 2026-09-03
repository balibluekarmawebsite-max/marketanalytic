/** ISO-ish country codes as they appear in the arrival lists → display names. */
export const COUNTRY_NAMES: Record<string, string> = {
  AUS: "Australia", FRA: "France", GBR: "United Kingdom", NLD: "Netherlands", CHN: "China",
  DEU: "Germany", NZL: "New Zealand", USA: "United States", PRT: "Portugal", JPN: "Japan",
  ITA: "Italy", HUN: "Hungary", PAK: "Pakistan", ARE: "UAE", SAU: "Saudi Arabia", IDN: "Indonesia",
  SGP: "Singapore", KOR: "South Korea", IND: "India", CAN: "Canada", CHE: "Switzerland",
  BEL: "Belgium", ESP: "Spain", SWE: "Sweden", RUS: "Russia", THA: "Thailand", MYS: "Malaysia",
  HKG: "Hong Kong", TWN: "Taiwan", PHL: "Philippines", BRA: "Brazil", ZAF: "South Africa",
  IRL: "Ireland", AUT: "Austria", DNK: "Denmark", NOR: "Norway", FIN: "Finland", POL: "Poland",
  ISR: "Israel", DZA: "Algeria", UKR: "Ukraine", CZE: "Czechia", GRC: "Greece", MEX: "Mexico",
};

/** Country display name, falling back to the raw code when unmapped. */
export function countryName(code: string | null | undefined): string {
  if (!code) return "—";
  return COUNTRY_NAMES[code] ?? code;
}
