// app/api/scrape/route.ts
import { NextRequest, NextResponse } from "next/server";
import { analyseContent } from "@/lib/openai";
import { AnalysisSchema } from "@/lib/schema";
import { scrapePage, scrapeSite } from "./_helpers";

export const runtime = "edge"; // optional

export async function POST(req: NextRequest) {
  try {
    const { url, blogUrl, mode, onlyMarkdown } = await req.json();

    if (!url) {
      return NextResponse.json({ success: false, error: "Missing URL" }, { status: 400 });
    }

    if (onlyMarkdown || mode === "page" || !blogUrl) {
      const markdown = await scrapePage(url);
      return NextResponse.json({ success: true, data: { markdown } });
    }

    const scraped = await scrapeSite(url, blogUrl);
    const raw = await analyseContent({
      productPagesMarkdown: scraped.productMarkdown,
      blogTitles: scraped.blogTitles,
    });
    const parsed = AnalysisSchema.parse(JSON.parse(raw));

    return NextResponse.json({
      success: true,
      data: { ...parsed, productMarkdown: scraped.productMarkdown },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Internal error" }, { status: 500 });
  }
}
