import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

/* ───────────────────────── Analyse whole site ─────────────────── */
export async function analyseContent(payload: {
  productPagesMarkdown: string
  blogTitles: string[]
}) {
  const { productPagesMarkdown, blogTitles } = payload

  const systemPrompt = `
You are a senior SaaS marketing analyst.
Return **ONLY** valid JSON matching this schema:

{
  "productDescription": string,
  "icps": [
    {
      "name": string,
      "problems": string[]  // long-tail phrases they actually Google
    }
  ]
}

Make the ICP list as exhaustive as possible (at least 3 ICPS).
Ensure each "problems" array contains ≥ 4 high-intent, dumb-but-specific
search queries (long-tail, not generic single words).`;

  const userPrompt = `
## PRODUCT / ABOUT MARKDOWN
${productPagesMarkdown.slice(0, 30_000)}

## BLOG TITLES
${blogTitles.join("\n")}
`

  const chat = await openai.chat.completions.create({
    model: "gpt-4.1",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  })

  return chat.choices[0].message.content!
}

/* ─────────────────────── 1) Extra queries for one ICP ─────────── */
export async function generateQueries(
  companyMarkdown: string,
  icpName: string,
) {
  const sys = `You are an SEO strategist. Return ONLY JSON: {"queries":[ "...", ... ]}`
  const usr = `
Company info:
<<<${companyMarkdown.slice(0, 15_000)}>>>

ICP: ${icpName}
Give 6-8 ultra-specific long-tail queries this ICP would Google.`

  const resp = await openai.chat.completions.create({
    model: "gpt-4.1",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: usr },
    ],
  })
  return JSON.parse(resp.choices[0].message.content!).queries as string[]
}

/* ─────────────────────── 2) Gap-analysis final report ─────────── */
export async function generateReport(opts: {
  companyMarkdown: string
  selectedIcps: { name: string; queries: string[] }[]
  ranked: string[]
  notRanked: string[]
}) {
  const sys = `
You help companies rank via blogs/whitepapers.  
Return ONLY JSON:
{
  "summaryRanked": string,
  "summaryGap": string,
  "ideas": [
    { "title": string, "type": "blog" | "whitepaper", "angle": string, "outline": string[] }
  ]
}`

  const usr = `
COMPANY MARKDOWN:
<<<${opts.companyMarkdown.slice(0, 20_000)}>>>

SELECTED ICPs & QUERIES:
${JSON.stringify(opts.selectedIcps, null, 2)}

RANKED QUERIES:
${opts.ranked.join("\n")}

NOT-RANKED QUERIES:
${opts.notRanked.join("\n")}

Give exactly 5 detailed content ideas.`

  const resp = await openai.chat.completions.create({
    model: "gpt-4.1",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: usr },
    ],
  })
  return JSON.parse(resp.choices[0].message.content!)
}

/* ───────────────────────── NEW: blog keyword plan ──────────────────────────
Returns ONLY JSON:
{
  "mustPhrases": string[],               // 3–8 short "must-have" phrases
  "groups": [
    { "must": string, "longTails": string[] }  // each 5–10 long-tail (3–7 words)
  ]
}
*/
export async function generateBlogKeywordPlanFromMarkdown(markdown: string) {
  const system = `
You are an elite SEO strategist.

TASK → From the supplied article (markdown), first infer 3–8 SHORT "must-have" phrases
(think of them as mandatory seed phrases representing the article's main, title-level topic).
Then, for EACH must-phrase, produce 5–10 **long-tail search queries** (3–7 words each)
that real users would type into Google when looking specifically for this article's main topic
(ignore sub-topics).

Requirements
• Natural, conversational phrasing — no jargon unless clearly present in title-level topic.
• No duplicates, no minor re-phrasings, no section headings.
• Each long-tail must strongly imply the user intention matches this article.
• Return STRICT JSON only, exactly matching:
{
  "mustPhrases": string[],
  "groups": [
    { "must": string, "longTails": string[] }
  ]
}
  `
  const user = markdown.slice(0, 30_000)

  const chat = await openai.chat.completions.create({
    model: "gpt-4.1",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  })

  const json = chat.choices[0].message.content || `{"mustPhrases":[],"groups":[]}`
  return JSON.parse(json) as { mustPhrases: string[]; groups: { must: string; longTails: string[] }[] }
}