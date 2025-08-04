// app/api/scrape/_helpers.ts
import FirecrawlApp from "@mendable/firecrawl-js";
const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! });

export async function scrapePage(targetUrl: string): Promise<string> {
  const res = await app.scrapeUrl(targetUrl, { formats: ["markdown"], timeout: 60_000 });
  if (!res.success) throw new Error(res.error ?? "Firecrawl scrape failed");
  return res.markdown ?? "";
}

export async function scrapeSite(mainUrl: string, blogUrl?: string) {
  const productMarkdown = await scrapePage(mainUrl);
  let blogTitles: string[] = [];
  if (blogUrl) {
    const blogMarkdown = await scrapePage(blogUrl);
    const linkRegex = /\[([^\]]+?)\]\(([^)]+?\/blog\/[^)]+?)\)/gi;
    const titles: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(blogMarkdown))) {
      const t = m[1]?.trim();
      if (t) titles.push(t);
    }
    blogTitles = [...new Set(titles)];
  }
  return { productMarkdown, blogTitles };
}
