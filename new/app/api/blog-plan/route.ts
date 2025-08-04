// app/api/blog-plan/route.ts
import { NextResponse } from "next/server"
import { generateBlogKeywordPlanFromMarkdown } from "@/lib/openai"

export async function POST(req: Request) {
  try {
    const { markdown } = await req.json()
    if (!markdown) return NextResponse.json({ success: false, error: "Missing markdown" }, { status: 400 })
    const data = await generateBlogKeywordPlanFromMarkdown(markdown)
    return NextResponse.json({ success: true, data })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || "OpenAI failed" }, { status: 500 })
  }
}
