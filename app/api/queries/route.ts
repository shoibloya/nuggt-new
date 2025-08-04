/* app/api/queries/route.ts
   Wraps generateQueries() so the client can ask GPT‑4.1 for
   long‑tail queries or keywords. */

import { NextRequest, NextResponse } from "next/server"
import { generateQueries } from "@/lib/openai"

export async function POST(req: NextRequest) {
  try {
    const { companyMarkdown, icpName, description = "" } =
      (await req.json()) as {
        companyMarkdown: string
        icpName: string
        description?: string
      }

    if (!companyMarkdown || !icpName)
      return NextResponse.json(
        { success: false, error: "Missing params" },
        { status: 400 },
      )

    const queries = await generateQueries(
      companyMarkdown,
      `${icpName}${description ? ` — ${description}` : ""}`,
    )

    return NextResponse.json({ success: true, data: { queries } })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    )
  }
}
