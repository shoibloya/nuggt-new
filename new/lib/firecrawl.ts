import FirecrawlApp from "@mendable/firecrawl-js"

const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! })

/** Crawl up to 100 pages and classify product vs blog */
export async function crawlSite(url: string) {
  const res = await app.crawlUrl(url, {
    limit: 100,
    scrapeOptions: { formats: ["markdown", "html"] },
  })
  if (!res.success) throw new Error(res.error ?? "Unknown Firecrawl error")

  const productPages: string[] = []
  const blogTitles: string[] = []

  for (const page of res.data) {
    const path = new URL(page.metadata.sourceURL).pathname
    if (
      /(about|home|index|pricing|features?|solutions?)/i.test(path) ||
      path === "/" ||
      path === ""
    )
      productPages.push(page.markdown)
    else if (/\/blog\//i.test(path))
      blogTitles.push(page.metadata.title ?? "")
  }

  return { productPagesMarkdown: productPages.join("\n\n"), blogTitles }
}

/* ───────────────────────── Low-level helpers ──────────────────── */

async function scrape(url: string): Promise<string> {
  const res = await app.scrapeUrl(url, { formats: ["markdown"], timeout: 60_000 })
  return res.success ? res.markdown ?? "" : ""
}

/**
 * Scrapes the main product URL (required) and optional blog URL
 * Returns { productMarkdown, blogTitles[] }.
 */
export async function scrapeSite(url: string, blogUrl?: string) {
  const productMarkdown = await scrape(url)

  let blogTitles: string[] = []
  if (blogUrl) {
    const blogMarkdown = await scrape(blogUrl)

    /* very naive extraction – any markdown link that contains "/blog/" */
    const linkRegex = /\[([^\]]+?)\]\(([^)]+?\/blog\/[^)]+?)\)/gi
    const titles: string[] = []
    let m: RegExpExecArray | null
    while ((m = linkRegex.exec(blogMarkdown))) titles.push(m[1].trim())
    blogTitles = [...new Set(titles)]
  }

  return { productMarkdown, blogTitles }
}
