/* app/api/outline/route.ts
   Generates a blog outline for a keyword using GPT‑4.1.        */

import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export async function POST(req: NextRequest) {
  try {
    const { keyword, companyMarkdown = "" } = (await req.json()) as {
      keyword: string
      companyMarkdown?: string
    }

    if (!keyword)
      return NextResponse.json({ error: "Missing keyword" }, { status: 400 })

    const sys =
      "You are an SEO copywriter. Return ONLY a Markdown outline (bullet list with H2/H3 headings) for a blog post that targets the given keyword."
    const usr = `Company context (may help):\n<<<${companyMarkdown.slice(
      0,
      12000,
    )}>>>\n\nKeyword: "${keyword}"`

    const chat = await openai.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.3,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
    })

    const outline = chat.choices[0].message.content ?? ""

    return NextResponse.json({ success: true, data: { outline } })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    )
  }
}
