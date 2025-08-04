import { NextRequest, NextResponse } from "next/server"
import { scrapeSite } from "@/lib/scraper"
import { analyseContent } from "@/lib/openai"
import { AnalysisSchema } from "@/lib/schema"

/** Uncomment if you prefer edge runtime */
// export const runtime = "edge"

export async function POST(req: NextRequest) {
  try {
    const { url, blogUrl } = (await req.json()) as {
      url: string
      blogUrl?: string
    }

    if (!url)
      return NextResponse.json({ error: "Missing URL" }, { status: 400 })

    /* ── 1️⃣  SCRAPE  ─────────────────────────────────────────────── */
    const scraped = await scrapeSite(url, blogUrl)

    /* ── 2️⃣  GPT-4.1  ───────────────────────────────────────────── */
    const raw = await analyseContent({
      productPagesMarkdown: scraped.productMarkdown,
      blogTitles: scraped.blogTitles,
    })
    const parsed = AnalysisSchema.parse(JSON.parse(raw))

    return NextResponse.json({
      success: true,
      data: { ...parsed, productMarkdown: scraped.productMarkdown },
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    )
  }
}
