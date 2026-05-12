/**
 * Both Google & Bing checks use SerpAPI.
 * Set SERP_API_KEY in .env.local.
 * Bing = engine=bing, Google = default.
 */
import { countryConfig } from "@/lib/countries"

interface RankResult {
  ranked: boolean
  url: string | null
}

const BASE = "https://serpapi.com/search.json"

export async function checkRankGoogle(
  query: string,
  companyDomain: string,
  country?: string,
): Promise<RankResult> {
  return checkRank(query, companyDomain, country, /*engine*/ undefined) // google default
}

export async function checkRankBing(
  query: string,
  companyDomain: string,
  country?: string,
): Promise<RankResult> {
  return checkRank(query, companyDomain, country, "bing")
}

async function checkRank(
  query: string,
  companyDomain: string,
  country?: string,
  engine?: "bing",
): Promise<RankResult> {
  const config = countryConfig(country)
  const params = new URLSearchParams({
    q: query,
    location: config.serpLocation,
    hl: config.hl,
    gl: config.gl,
    google_domain: config.googleDomain,
    api_key: process.env.SERP_API_KEY!,
  })
  if (engine) params.set("engine", engine)

  const res = await fetch(`${BASE}?${params}`, { method: "GET" }).then((r) =>
    r.json(),
  )

  const organic = res.organic_results ?? []
  const hit = organic.find((r: any) =>
    r.link?.toLowerCase().includes(companyDomain.toLowerCase()),
  )

  return { ranked: !!hit, url: hit?.link ?? null }
}
