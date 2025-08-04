import { NextRequest, NextResponse } from "next/server"
import { checkRankGoogle, checkRankBing } from "@/lib/serp"

/** Edge-compatible */
export async function POST(req: NextRequest) {
  try {
    const { query, domain } = (await req.json()) as {
      query: string
      domain: string
    }
    if (!query || !domain)
      return NextResponse.json({ error: "Missing data" }, { status: 400 })

    /* Run Google + Bing in parallel */
    const [google, bing] = await Promise.all([
      checkRankGoogle(query, domain),
      checkRankBing(query, domain),
    ])

    return NextResponse.json({ success: true, data: { google, bing } })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    )
  }
}
