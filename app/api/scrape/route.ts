// app/api/scrape/route.ts
import { NextRequest, NextResponse } from "next/server"
import FirecrawlApp from "@mendable/firecrawl-js"
import { analyseContent } from "@/lib/openai"
import { AnalysisSchema } from "@/lib/schema"

// export const runtime = "edge" // ← uncomment if you want Edge runtime

const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! })

export async function POST(req: NextRequest) {
  try {
    const { url, blogUrl, mode, onlyMarkdown } = (await req.json()) as {
      url: string
      blogUrl?: string
      mode?: "page" | "site"
      onlyMarkdown?: boolean
    }

    if (!url) {
      return NextResponse.json({ success: false, error: "Missing URL" }, { status: 400 })
    }

    // ── Default to *single page* scrape when only `url` is provided ─────────
    //     (Performance page posts just `{ url }`)
    if (onlyMarkdown || mode === "page" || !blogUrl) {
      const markdown = await scrapePage(url)
      return NextResponse.json({ success: true, data: { markdown } })
    }

    // ── Site analysis path (when blogUrl provided / explicit "site" mode) ───
    const scraped = await scrapeSite(url, blogUrl)
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
      { success: false, error: err?.message ?? "Internal error" },
      { status: 500 },
    )
  }
}

/* ───────────────────────── Firecrawl helpers ────────────────────────────── */

export async function scrapePage(targetUrl: string): Promise<string> {
  const res = await app.scrapeUrl(targetUrl, {
    formats: ["markdown"],
    timeout: 60_000,
  })
  if (!res.success) throw new Error(res.error ?? "Firecrawl scrape failed")
  return res.markdown ?? ""
}

/** Crawl up to 100 pages and classify product vs blog (titles only) */
export async function crawlSite(rootUrl: string) {
  const res = await app.crawlUrl(rootUrl, {
    limit: 100,
    scrapeOptions: { formats: ["markdown", "html"] },
  })
  if (!res.success) throw new Error(res.error ?? "Unknown Firecrawl error")

  const productPages: string[] = []
  const blogTitles: string[] = []

  for (const page of res.data) {
    const src = page.metadata?.sourceURL || ""
    try {
      const path = new URL(src).pathname
      if (
        /(about|home|index|pricing|features?|solutions?)/i.test(path) ||
        path === "/" ||
        path === ""
      ) {
        productPages.push(page.markdown ?? "")
      } else if (/\/blog\//i.test(path)) {
        const t = page.metadata?.title ?? ""
        if (t) blogTitles.push(t)
      }
    } catch {
      // ignore bad URLs
    }
  }

  return { productPagesMarkdown: productPages.join("\n\n"), blogTitles }
}

/**
 * Scrapes the main product URL and (optionally) a blog index URL to extract blog titles.
 * Returns { productMarkdown, blogTitles[] }.
 */
export async function scrapeSite(mainUrl: string, blogUrl?: string) {
  const productMarkdown = await scrapePage(mainUrl)

  let blogTitles: string[] = []
  if (blogUrl) {
    const blogMarkdown = await scrapePage(blogUrl)

    // very naive extraction – any markdown link that contains "/blog/"
    const linkRegex = /\[([^\]]+?)\]\(([^)]+?\/blog\/[^)]+?)\)/gi
    const titles: string[] = []
    let m: RegExpExecArray | null
    while ((m = linkRegex.exec(blogMarkdown))) {
      const title = m[1]?.trim()
      if (title) titles.push(title)
    }
    blogTitles = [...new Set(titles)]
  }

  return { productMarkdown, blogTitles }
}
