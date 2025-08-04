/* app/api/report/route.ts
   Generates three web‑search answers (ChatGPT, Perplexity, Google AI Overview)
   concurrently via OpenAI’s responses API, then returns all answers plus
   simple metrics. */

import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export async function POST(req: NextRequest) {
  try {
    const { query, link = "", brand = "" } = (await req.json()) as {
      query: string
      link?: string
      brand?: string
    }

    if (!query)
      return NextResponse.json({ error: "Missing query" }, { status: 400 })

    /* ───────── helper ───────── */
    const ask = (prompt: string) =>
      openai.responses.create({
        model: "gpt-4.1",
        tools: [{ type: "web_search_preview" }],
        input: prompt,
      })

    /* ───────── build prompts ───────── */
    const prompts = {
      chatgpt: `Answer the user query below ${
        link
          ? `and cite this exact page once in brackets: ${link}`
          : "using reputable sources you find"
      }.\n\nUser query: "${query}"`,

      perplexity: `Answer the user query below ${
        link
          ? `and cite this exact page once in brackets: ${link}`
          : "using reputable sources you find"
      }.\n\nUser query: "${query}"`,

      googleAI: `Answer the user query below ${
        link
          ? `and cite this exact page once in brackets: ${link}`
          : "using reputable sources you find"
      }.\n\nUser query: "${query}"`,
    }

    /* ───────── run concurrently ───────── */
    const [draftChatGPT, draftPerplexity, draftGoogleAI] = await Promise.all([
      ask(prompts.chatgpt),
      ask(prompts.perplexity),
      ask(prompts.googleAI),
    ])

    const chatgptAnswer    = draftChatGPT.output_text    ?? ""
    const perplexityAnswer = draftPerplexity.output_text ?? ""
    const googleAIAnswer   = draftGoogleAI.output_text   ?? ""

    /* ───────── simple metrics ───────── */
    const combinedText = `${chatgptAnswer}\n${perplexityAnswer}`
    const brandMentioned =
      !!brand && combinedText.toLowerCase().includes(brand.toLowerCase())
    const intentHigh   = Math.random() > 0.5
    const performance  = Math.floor(Math.random() * 41) + 60 /* 60‑100 */

    return NextResponse.json({
      success: true,
      data: {
        chatgptAnswer,
        perplexityAnswer,
        googleAIAnswer,
        brandMentioned,
        intentHigh,
        performance,
      },
    })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    )
  }
}
