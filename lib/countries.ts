export type CountryOption = {
  code: string
  label: string
  serpLocation: string
  hl: string
  gl: string
  googleDomain: string
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: "US", label: "United States", serpLocation: "United States", hl: "en", gl: "us", googleDomain: "google.com" },
  { code: "SG", label: "Singapore", serpLocation: "Singapore", hl: "en", gl: "sg", googleDomain: "google.com.sg" },
  { code: "GB", label: "United Kingdom", serpLocation: "United Kingdom", hl: "en", gl: "uk", googleDomain: "google.co.uk" },
  { code: "AU", label: "Australia", serpLocation: "Australia", hl: "en", gl: "au", googleDomain: "google.com.au" },
  { code: "CA", label: "Canada", serpLocation: "Canada", hl: "en", gl: "ca", googleDomain: "google.ca" },
  { code: "IN", label: "India", serpLocation: "India", hl: "en", gl: "in", googleDomain: "google.co.in" },
  { code: "DE", label: "Germany", serpLocation: "Germany", hl: "de", gl: "de", googleDomain: "google.de" },
  { code: "FR", label: "France", serpLocation: "France", hl: "fr", gl: "fr", googleDomain: "google.fr" },
  { code: "JP", label: "Japan", serpLocation: "Japan", hl: "ja", gl: "jp", googleDomain: "google.co.jp" },
]

export const DEFAULT_COUNTRY = "SG"

export function countryLabel(code: string) {
  return COUNTRY_OPTIONS.find((c) => c.code === code)?.label ?? code
}

export function countryConfig(code?: string | null) {
  return COUNTRY_OPTIONS.find((c) => c.code === code) ?? COUNTRY_OPTIONS.find((c) => c.code === DEFAULT_COUNTRY)!
}

export function normalizeCountryCodes(countries?: string[] | null) {
  const allowed = new Set(COUNTRY_OPTIONS.map((c) => c.code))
  const normalized = (countries || [])
    .map((country) => country.trim().toUpperCase())
    .filter((country) => allowed.has(country))
  return Array.from(new Set(normalized.length ? normalized : [DEFAULT_COUNTRY]))
}
