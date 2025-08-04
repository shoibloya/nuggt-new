"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Loader2, CheckCircle2, XCircle, Target as TargetIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTargets } from "@/contexts/targets-context"

// Firebase
import { db } from "@/lib/firebase"
import { ref, get, update } from "firebase/database"

/* ---------------- Types ---------------- */
type Status = "Not analysed" | "Cited" | "Not cited"
type GoogleStatus = "Not analysed" | "Page 1" | "Not Page 1"
type Difficulty = "Easy" | "Medium" | "Hard"

type KeywordRow = {
  keyword: string
  chatgpt: Status
  perplexity: Status
  google: GoogleStatus
  difficulty: Difficulty
  urlChatgpt?: string | null
  urlGoogle?: string | null
  brandDomain: string           // here: competitor domain
  targeted?: boolean
  __loadingChatgpt?: boolean
  __loadingPerplexity?: boolean
  __loadingGoogle?: boolean
}

type Competitor = {
  domain: string
  rows: KeywordRow[]
  createdAt: number
}

/* ---------------- Helpers ---------------- */
const randomDifficulty = (): Difficulty =>
  (["Easy", "Medium", "Hard"][Math.floor(Math.random() * 3)] as Difficulty)

function normalizeDomain(value: string) {
  try {
    const h = new URL(value).hostname
    return h.replace(/^www\./, "")
  } catch {
    return value.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
  }
}

// Sanitize keys for Realtime DB
const safeKey = (s: string) => s.replace(/[.#$/\[\]]/g, "_")

function sanitizeCompetitors(list: Competitor[]): Competitor[] {
  return list.map((c) => ({
    ...c,
    rows: c.rows.map((r) => {
      const { __loadingChatgpt, __loadingPerplexity, __loadingGoogle, ...rest } = r
      return rest
    }),
  }))
}

async function analyseQuery(q: string, domain: string) {
  const res = await fetch("/api/rank", {
    method: "POST",
    body: JSON.stringify({ query: q, domain }),
  }).then((r) => r.json())
  if (!res.success) throw new Error(res.error)
  return res.data as {
    google: { ranked: boolean; url: string | null }
    bing: { ranked: boolean; url: string | null }
  }
}

function StatusCell({
  loading,
  value,
  href,
}: {
  loading?: boolean
  value: Status | GoogleStatus
  href?: string | null
}) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Analyzing…
      </span>
    )
  }
  const positive = value === "Cited" || value === "Page 1"
  const negative = value === "Not cited" || value === "Not Page 1"
  if (positive) {
    const label = (() => {
      try {
        return href ? new URL(href).hostname : "Open"
      } catch {
        return "Open"
      }
    })()
    return (
      <span className="inline-flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline text-blue-600 dark:text-blue-400 max-w-[220px] truncate"
            title={href}
          >
            {label}
          </a>
        ) : null}
      </span>
    )
  }
  if (negative) {
    return (
      <span className="inline-flex items-center text-red-600">
        <XCircle className="h-4 w-4" />
      </span>
    )
  }
  return <span className="text-sm text-muted-foreground">Not analysed</span>
}

/* ---------------- Component ---------------- */
export default function CompetitorsSection() {
  const [input, setInput] = useState("")
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [loadingInit, setLoadingInit] = useState(true)
  const [adding, setAdding] = useState(false)
  const { addTarget } = useTargets()

  // FIX: read cookie on client only
  const [username, setUsername] = useState<string>("")
  useEffect(() => {
    if (typeof document !== "undefined") {
      const m = document.cookie.match(/(?:^| )session=([^;]+)/)
      setUsername(m ? decodeURIComponent(m[1]) : "")
    }
  }, [])

  // Load existing competitors from Firebase on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!username) return
        const snap = await get(ref(db, `analyticsDashaboard/${username}/competitors`))
        const data = snap.val() as Record<string, Competitor> | null
        if (cancelled) return
        if (data) {
          setCompetitors(Object.values(data))
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setLoadingInit(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [username])

  // Aggregate all user queries from their ICPs for analysis
  const userKeywords = useMemo<string[]>(() => {
    return []
  }, [])

  async function getUserKeywords(): Promise<string[]> {
    const snap = await get(ref(db, `analyticsDashaboard/${username}/icps`))
    const icps = (snap.val() as Array<{ rows: Array<{ keyword: string }> }> | null) || []
    const all = new Set<string>()
    icps.forEach((i) => i?.rows?.forEach((r) => r?.keyword && all.add(r.keyword)))
    return Array.from(all)
  }

  // Persist full competitors list (paths sanitized)
  async function saveAll(toSave: Competitor[]) {
    try {
      const updates: Record<string, any> = {}
      for (const c of toSave) {
        updates[`competitors/${safeKey(c.domain)}`] = c
      }
      await update(ref(db, `analyticsDashaboard/${username}`), updates)
    } catch (e) {
      console.error("Failed to save competitors:", e)
    }
  }

  // Add competitor → build rows from user's keywords → analyze concurrently → save
  async function onAddCompetitor() {
    const domain = normalizeDomain(input.trim())
    if (!domain) return
    setAdding(true)
    try {
      const queries = userKeywords.length ? userKeywords : await getUserKeywords()
      if (!queries.length) {
        alert("No keywords found for your account yet. Generate keywords in Analysis first.")
        setAdding(false)
        return
      }

      const baseRows: KeywordRow[] = queries.map((k) => ({
        keyword: k,
        chatgpt: "Not analysed",
        perplexity: "Not analysed",
        google: "Not analysed",
        difficulty: randomDifficulty(),
        brandDomain: domain,
        targeted: false,
        __loadingChatgpt: true,
        __loadingPerplexity: true,
        __loadingGoogle: true,
      }))

      const newComp: Competitor = {
        domain,
        rows: baseRows,
        createdAt: Date.now(),
      }

      setCompetitors((prev) => {
        const next = [...prev.filter((c) => c.domain !== domain), newComp]
        void saveAll(next) // save scaffold immediately (sanitized keys)
        return next
      })

      // Analyze all rows concurrently (per-row loaders)
      const tasks = baseRows.map((row, rowIdx) =>
        (async () => {
          try {
            const r = await analyseQuery(row.keyword, domain)
            setCompetitors((prev) =>
              prev.map((c) => {
                if (c.domain !== domain) return c
                const rows = c.rows.slice()
                const cur = rows[rowIdx]
                if (!cur) return c
                rows[rowIdx] = {
                  ...cur,
                  chatgpt: r.bing.ranked ? "Cited" : "Not cited",
                  perplexity: r.google.ranked ? "Cited" : "Not cited",
                  google: r.google.ranked ? "Page 1" : "Not Page 1",
                  urlChatgpt: r.bing.url,
                  urlGoogle: r.google.url,
                  __loadingChatgpt: false,
                  __loadingPerplexity: false,
                  __loadingGoogle: false,
                }
                return { ...c, rows }
              }),
            )
          } catch {
            // stop loaders even on failure
            setCompetitors((prev) =>
              prev.map((c) => {
                if (c.domain !== domain) return c
                const rows = c.rows.slice()
                const cur = rows[rowIdx]
                if (!cur) return c
                rows[rowIdx] = {
                  ...cur,
                  __loadingChatgpt: false,
                  __loadingPerplexity: false,
                  __loadingGoogle: false,
                }
                return { ...c, rows }
              }),
            )
          }
        })(),
      )

      await Promise.allSettled(tasks)
      // persist final analyzed results
      setCompetitors((current) => {
        void saveAll(sanitizeCompetitors(current))
        return current
      })
      setInput("")
    } finally {
      setAdding(false)
    }
  }

  // Toggle targeted and persist
  function toggleTarget(domain: string, index: number, next: boolean, keyword: string) {
    setCompetitors((prev) => {
      const nextList = prev.map((c) => {
        if (c.domain !== domain) return c
        const rows = c.rows.slice()
        const cur = rows[index]
        if (!cur) return c
        rows[index] = { ...cur, targeted: next }
        return { ...c, rows }
      })
      void saveAll(nextList)
      return nextList
    })
    if (next) addTarget(keyword)
  }

  return (
    <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-900/80 dark:border-slate-700">
      <CardHeader>
        <CardTitle className="text-xl">Competitors</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Add competitor */}
        <div className="flex gap-2">
          <Input
            placeholder="https://competitor.com"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAddCompetitor()}
          />
        <Button onClick={onAddCompetitor} disabled={adding}>
            {adding ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Adding…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" /> Add
              </>
            )}
          </Button>
        </div>

        {/* List */}
        {loadingInit ? (
          <div className="flex items-center justify-center gap-2 py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading competitors…</span>
          </div>
        ) : competitors.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed rounded-lg">
            <p className="text-sm text-muted-foreground">No competitors added yet.</p>
          </div>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {competitors
              .slice()
              .sort((a, b) => a.domain.localeCompare(b.domain))
              .map((cmp) => {
                const rankedRows = cmp.rows.filter((r) => r.google === "Page 1")
                const notRankedRows = cmp.rows.filter((r) => r.google !== "Page 1")
                return (
                  <AccordionItem key={cmp.domain} value={cmp.domain}>
                    <AccordionTrigger className="text-left hover:no-underline px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{cmp.domain}</span>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4 space-y-8">
                      {/* Ranked table */}
                      <div className="space-y-3">
                        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">
                          Queries they <strong>rank&nbsp;for</strong>
                        </h3>
                        <KeywordTable
                          rows={rankedRows}
                          onToggleTarget={(rowIdx, next) =>
                            toggleTarget(
                              cmp.domain,
                              cmp.rows.findIndex((r) => r === rankedRows[rowIdx]),
                              next,
                              rankedRows[rowIdx].keyword,
                            )
                          }
                        />
                        {rankedRows.length === 0 && (
                          <p className="text-xs text-muted-foreground italic">None found.</p>
                        )}
                      </div>

                      {/* Not ranked table */}
                      <div className="space-y-3">
                        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">
                          Queries they <strong>don’t&nbsp;rank</strong> for
                        </h3>
                        <KeywordTable
                          rows={notRankedRows}
                          onToggleTarget={(rowIdx, next) =>
                            toggleTarget(
                              cmp.domain,
                              cmp.rows.findIndex((r) => r === notRankedRows[rowIdx]),
                              next,
                              notRankedRows[rowIdx].keyword,
                            )
                          }
                        />
                        {notRankedRows.length === 0 && (
                          <p className="text-xs text-muted-foreground italic">None found.</p>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
          </Accordion>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------- Keyword Table ---------------- */

function KeywordTable({
  rows,
  onToggleTarget,
}: {
  rows: KeywordRow[]
  onToggleTarget: (rowIndex: number, next: boolean) => void
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <Table>
        <TableHeader className="bg-slate-50 dark:bg-slate-800">
          <TableRow>
            <TableHead className="w-[45%]">Keyword</TableHead>
            <TableHead>ChatGPT</TableHead>
            <TableHead>Perplexity</TableHead>
            <TableHead>Google</TableHead>
            <TableHead className="w-[120px] text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, idx) => (
            <TableRow
              key={row.keyword + idx}
              className={cn(row.targeted && "ring-1 ring-green-300 dark:ring-green-800")}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{row.keyword}</span>
                  {row.targeted && (
                    <Badge variant="default" className="h-5 px-2 gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Targeted
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <StatusCell loading={row.__loadingChatgpt} value={row.chatgpt} href={row.urlChatgpt} />
              </TableCell>
              <TableCell>
                <StatusCell loading={row.__loadingPerplexity} value={row.perplexity} href={row.urlGoogle} />
              </TableCell>
              <TableCell>
                <StatusCell loading={row.__loadingGoogle} value={row.google} href={row.urlGoogle} />
              </TableCell>
              <TableCell className="text-right">
                <TargetButton
                  isTargeted={!!row.targeted}
                  onClick={() => onToggleTarget(idx, !row.targeted)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/* ---------------- Target Button (same style as Analysis) ---------------- */

function TargetButton({ isTargeted, onClick }: { isTargeted: boolean; onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant={isTargeted ? "default" : "outline"}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3",
        isTargeted ? "bg-green-600 hover:bg-green-700 text-white" : "bg-transparent",
      )}
      onClick={onClick}
    >
      <TargetIcon className="h-4 w-4" />
      {isTargeted ? "Targeted" : "Target"}
    </Button>
  )
}
