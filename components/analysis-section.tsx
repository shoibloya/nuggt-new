"use client"
/* eslint-disable react-hooks/exhaustive-deps */
import type React from "react"

import { useState, useMemo, useEffect } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  flexRender,
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Loader2, TargetIcon, Plus, Sparkles, Globe, CheckCircle2, XCircle, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTargets } from "@/contexts/targets-context"

// Firebase client
import { db } from "@/lib/firebase"
import { ref, get, update } from "firebase/database"

/* ───────────── Types ───────────── */
type Status = "Not analysed" | "Cited" | "Not cited"
type GoogleStatus = "Not analysed" | "Page 1" | "Not Page 1"
type Difficulty = "Easy" | "Medium" | "Hard"

export interface KeywordRow {
  keyword: string
  chatgpt: Status
  perplexity: Status
  google: GoogleStatus
  difficulty: Difficulty
  urlChatgpt?: string | null
  urlGoogle?: string | null
  brandDomain: string
  targeted?: boolean

  // UI-only flags (not persisted)
  __selected?: boolean
  __loadingChatgpt?: boolean
  __loadingPerplexity?: boolean
  __loadingGoogle?: boolean
}

interface IcpTable {
  name: string
  description: string
  rows: KeywordRow[]
}

/* ───────────── Helpers ───────────── */
const randomDifficulty = (): Difficulty => ["Easy", "Medium", "Hard"][Math.floor(Math.random() * 3)] as Difficulty

function getCookie(name: string) {
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
  return m ? decodeURIComponent(m[2]) : null
}

async function fetchIcps(payload: { url: string; blogUrl?: string }) {
  const res = await fetch("/api/keywords", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.json())
  if (!res.success) throw new Error(res.error ?? "Unknown error")
  return res.data as {
    productMarkdown: string
    icps: { name: string; problems: string[] }[]
  }
}

async function analyseQuery(q: string, companyDomain: string) {
  const res = await fetch("/api/rank", {
    method: "POST",
    body: JSON.stringify({ query: q, domain: companyDomain }),
  }).then((r) => r.json())
  if (!res.success) throw new Error(res.error)
  return res.data as {
    google: { ranked: boolean; url: string | null }
    bing: { ranked: boolean; url: string | null }
  }
}

async function gptGenerateQueries(companyMarkdown: string, icpName: string, description: string) {
  const res = await fetch("/api/queries", {
    method: "POST",
    body: JSON.stringify({ companyMarkdown, icpName, description }),
  }).then((r) => r.json())
  if (!res.success) throw new Error(res.error)
  return res.data.queries as string[]
}

/** Remove UI-only flags before saving */
function sanitizeIcps(icps: IcpTable[]): IcpTable[] {
  return icps.map((icp) => ({
    ...icp,
    rows: icp.rows.map((r) => {
      const {
        __selected,
        __loadingChatgpt,
        __loadingPerplexity,
        __loadingGoogle,
        ...persistable
      } = r
      return persistable
    }),
  }))
}

/* ───────────── Columns ───────────── */
function useColumns(
  addTarget: (kw: string) => void,
  toggleTarget: (row: KeywordRow, next: boolean) => void,
  deleteRow: (row: KeywordRow) => void,
): ColumnDef<KeywordRow>[] {
  return useMemo<ColumnDef<KeywordRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
          />
        ),
      },
      {
        accessorKey: "keyword",
        header: "Keyword",
        cell: ({ row }) => {
          const targeted = row.original.targeted
          return (
            <div className="flex items-center gap-2">
              <span className="font-medium">{row.original.keyword}</span>
              {targeted && (
                <Badge variant="default" className="h-5 px-2 gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Targeted
                </Badge>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: "chatgpt",
        header: "ChatGPT",
        cell: ({ row }) =>
          statusCell(
            row.original.__loadingChatgpt,
            row.original.chatgpt,
            row.original.urlChatgpt,
            row.original.keyword,
            row.original.brandDomain,
          ),
      },
      {
        accessorKey: "perplexity",
        header: "Perplexity",
        cell: ({ row }) =>
          statusCell(
            row.original.__loadingPerplexity,
            row.original.perplexity,
            row.original.urlGoogle,
            row.original.keyword,
            row.original.brandDomain,
          ),
      },
      {
        accessorKey: "google",
        header: "Google",
        cell: ({ row }) =>
          statusCell(
            row.original.__loadingGoogle,
            row.original.google,
            row.original.urlGoogle,
            row.original.keyword,
            row.original.brandDomain,
          ),
      },
      {
        accessorKey: "difficulty",
        header: "Diff.",
        cell: ({ getValue }) => {
          const d = getValue<Difficulty>()
          return (
            <Badge
              variant={d === "Easy" ? "default" : d === "Medium" ? "secondary" : "destructive"}
              className="text-xs"
            >
              {d}
            </Badge>
          )
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const isTargeted = !!row.original.targeted
          return (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={isTargeted ? "default" : "outline"}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3",
                  isTargeted ? "bg-green-600 hover:bg-green-700 text-white" : "bg-transparent",
                )}
                onClick={() => {
                  const next = !isTargeted
                  toggleTarget(row.original, next)
                  if (next) addTarget(row.original.keyword)
                }}
              >
                <TargetIcon className="h-4 w-4" />
                {isTargeted ? "Targeted" : "Target"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full text-red-600"
                onClick={() => deleteRow(row.original)}
                aria-label="Delete row"
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        },
      },
    ],
    [addTarget, toggleTarget, deleteRow],
  )
}

function statusCell(
  loading: boolean | undefined,
  value: string,
  href: string | null | undefined,
  kw: string,
  brand: string,
) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Analyzing…
      </span>
    )
  }

  // links removed intentionally
  void href; void kw; void brand;

  const isPositive = value === "Cited" || value === "Page 1"
  const isNegative = value === "Not cited" || value === "Not Page 1"

  if (isPositive) {
    return (
      <span className="inline-flex items-center text-green-600">
        <CheckCircle2 className="h-4 w-4" />
      </span>
    )
  }
  if (isNegative) {
    return (
      <span className="inline-flex items-center text-red-600">
        <XCircle className="h-4 w-4" />
      </span>
    )
  }
  return <span className="text-sm text-muted-foreground">Not analysed</span>
}



/* ───────────── Main component ───────────── */
export default function AnalysisSection() {
  const [websiteUrl, setWebsiteUrl] = useState<string>("")
  const [brandDomain, setBrand] = useState("")
  const [productMarkdown, setPM] = useState("")
  const [icps, setIcps] = useState<IcpTable[]>([])
  const [loadingInit, setLoadingInit] = useState(true)       // initial bootstrap (read DB, maybe generate)
  const [bootstrapping, setBootstrapping] = useState(false)  // generating keywords from site (first time)

  const { addTarget } = useTargets()
  const [username, setUsername] = useState<string>("")
useEffect(() => {
  if (typeof document !== "undefined") {
    const m = document.cookie.match(/(?:^| )session=([^;]+)/)
    setUsername(m ? decodeURIComponent(m[1]) : "")
  }
}, [])

  const columns = useColumns(
    addTarget,
    // target toggle persist
    async (row, next) => {
      setIcps((prev) => {
        const nextIcps = prev.map((icp) => ({
          ...icp,
          rows: icp.rows.map((r) => (r === row ? { ...r, targeted: next } : r)),
        }))
        void persistIcps(nextIcps)
        return nextIcps
      })
    },
    // delete row persist
    (rowToDelete) => {
      setIcps((prev) => {
        const nextIcps = prev.map((icp) => ({
          ...icp,
          rows: icp.rows.filter((r) => r !== rowToDelete),
        }))
        void persistIcps(nextIcps)
        return nextIcps
      })
    },
  )

  // Load from Firebase; generate & auto-analyze on first-time only
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!username) return
        const snap = await get(ref(db, `analyticsDashaboard/${username}`))
        const data = snap.val() as
          | {
              websiteUrl?: string
              blogUrl?: string
              productMarkdown?: string
              brandDomain?: string
              icps?: IcpTable[]
            }
          | null

        if (!data || !data.websiteUrl) {
          setLoadingInit(false)
          console.warn("No website configured for user.")
          return
        }

        const url = data.websiteUrl
        if (!cancelled) setWebsiteUrl(url)

        const domain = (data.brandDomain ||
          new URL(url).hostname.replace(/^www\./, "")) as string
        if (!cancelled) setBrand(domain)

        // If icps already exist -> render only (no re-analyze)
        if (data.icps && data.icps.length > 0) {
          if (!cancelled) {
            setIcps(data.icps)
            setPM(data.productMarkdown || "")
            setLoadingInit(false)
          }
          return
        }

        // First time: generate from website URL, render immediately, then auto-analyze all
        setBootstrapping(true)
        const gen = await fetchIcps({ url, blogUrl: data.blogUrl })
        const newIcps: IcpTable[] = gen.icps.map<IcpTable>((icp) => ({
          name: icp.name,
          description: icp.problems.join(", "),
          rows: icp.problems.map<KeywordRow>((k) => ({
            keyword: k,
            chatgpt: "Not analysed",
            perplexity: "Not analysed",
            google: "Not analysed",
            difficulty: randomDifficulty(),
            brandDomain: domain,
            targeted: false,
          })),
        }))

        if (cancelled) return
        setPM(gen.productMarkdown)
        setIcps(newIcps)         // show queries first
        setLoadingInit(false)    // hide website card now that queries are displayed

        // Save the initial scaffold
        await update(ref(db, `analyticsDashaboard/${username}`), {
          productMarkdown: gen.productMarkdown,
          brandDomain: domain,
          icps: sanitizeIcps(newIcps),
        })

        // Auto analyze ALL rows concurrently (per-row UI loaders)
        await analyzeRowsAuto(newIcps, domain, username, setIcps)
      } catch (err) {
        console.error(err)
        setLoadingInit(false)
      } finally {
        setBootstrapping(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [username])

  /* Persist ICPS */
  async function persistIcps(next: IcpTable[]) {
    if (!username) return
    try {
      await update(ref(db, `analyticsDashaboard/${username}`), {
        icps: sanitizeIcps(next),
      })
    } catch (e) {
      console.error("Failed to save to Firebase:", e)
    }
  }

  /* Auto-analyze helper (for first-time & for new keywords). Writes results to DB when done. */
  async function analyzeRowsAuto(
    sourceIcps: IcpTable[],
    domain: string,
    user: string,
    setIcpsState: React.Dispatch<React.SetStateAction<IcpTable[]>>,
    icpIndicesAndRowIndices?: Array<{ icpIdx: number; rowIdx: number }>, // if provided, analyze only these
  ) {
    // mark loaders
    setIcpsState((prev) => {
      const clone = prev.map((icp, icpIdx) => ({
        ...icp,
        rows: icp.rows.map((r, rowIdx) => {
          const shouldAnalyze =
            !icpIndicesAndRowIndices ||
            icpIndicesAndRowIndices.some((p) => p.icpIdx === icpIdx && p.rowIdx === rowIdx)
          return shouldAnalyze
            ? { ...r, __loadingChatgpt: true, __loadingPerplexity: true, __loadingGoogle: true }
            : r
        }),
      }))
      return clone
    })

    const tasks: Array<Promise<void>> = []
    sourceIcps.forEach((icp, icpIdx) => {
      icp.rows.forEach((row, rowIdx) => {
        const included =
          !icpIndicesAndRowIndices || icpIndicesAndRowIndices.some((p) => p.icpIdx === icpIdx && p.rowIdx === rowIdx)
        if (!included) return

        tasks.push(
          (async () => {
            try {
              const r = await analyseQuery(row.keyword, domain)
              setIcpsState((prev) => {
                const next = prev.map((icp2, i) => {
                  if (i !== icpIdx) return icp2
                  const rows = icp2.rows.slice()
                  const cur = rows[rowIdx]
                  if (!cur) return icp2
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
                  return { ...icp2, rows }
                })
                return next
              })
            } catch {
              setIcpsState((prev) => {
                const next = prev.map((icp2, i) => {
                  if (i !== icpIdx) return icp2
                  const rows = icp2.rows.slice()
                  const cur = rows[rowIdx]
                  if (!cur) return icp2
                  rows[rowIdx] = {
                    ...cur,
                    __loadingChatgpt: false,
                    __loadingPerplexity: false,
                    __loadingGoogle: false,
                  }
                  return { ...icp2, rows }
                })
                return next
              })
            }
          })(),
        )
      })
    })

    await Promise.allSettled(tasks)
    // persist latest from state
    setIcpsState((current) => {
      void update(ref(db, `analyticsDashaboard/${user}`), { icps: sanitizeIcps(current) })
      return current
    })
  }

  /* ───────── render ───────── */
  const showWebsiteCard = loadingInit || icps.length === 0

  return (
    <div className="space-y-8">
      {/* Website info / initial load */}
      {showWebsiteCard && (
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-900/80 dark:border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span className="font-medium text-slate-700 dark:text-slate-300">Website:</span>
              <span>{websiteUrl || "Not configured"}</span>
              {(loadingInit || bootstrapping) && (
                <span className="inline-flex items-center gap-2 ml-auto">
                  <Loader2 className="h-4 w-4 animate-spin" /> Preparing…
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Toolbar with Add ICP (like before, but standalone since analysis is auto) */}
      {!loadingInit && icps.length > 0 && (
        <Card className="bg-gradient-to-r from-slate-50 to-slate-100 border-slate-200 dark:from-slate-800/50 dark:to-slate-800/30 dark:border-slate-700">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <AddIcpDialog
              productMarkdown={productMarkdown}
              onAdd={(newIcp) => {
                setIcps((prev) => {
                  const next = [...prev, newIcp]
                  void persistIcps(next)
                  // auto-analyze just-added ICP
                  const icpIdx = next.length - 1
                  const indices = newIcp.rows.map((_, rowIdx) => ({ icpIdx, rowIdx }))
                  void analyzeRowsAuto(next, brandDomain, username, setIcps, indices)
                  return next
                })
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* ICP Tables */}
      {!loadingInit && icps.length > 0 && (
        <div className="space-y-8">
          {icps.map((icp, idx) => (
            <IcpSection
              key={icp.name + idx}
              icp={icp}
              productMarkdown={productMarkdown}
              columns={columns}
              onUpdate={(t) => setIcps((arr) => arr.map((x) => (x === icp ? t : x)))}
              onPersist={(t) =>
                setIcps((arr) => {
                  const next = arr.map((x) => (x === icp ? t : x))
                  void persistIcps(next)
                  return next
                })
              }
              onAfterAddRows={async (addedCount) => {
                const icpIdx = icps.findIndex((x) => x === icp)
                if (icpIdx < 0 || addedCount <= 0) return
                setIcps((current) => {
                  const latestIcp = current[icpIdx]
                  const startIndex = latestIcp.rows.length - addedCount
                  const indices: Array<{ icpIdx: number; rowIdx: number }> = []
                  for (let r = startIndex; r < latestIcp.rows.length; r++) indices.push({ icpIdx, rowIdx: r })
                  void analyzeRowsAuto(current, brandDomain, username, setIcps, indices)
                  return current
                })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ───────────── Add-ICP dialog ───────────── */
function AddIcpDialog({
  productMarkdown,
  onAdd,
}: {
  productMarkdown: string
  onAdd: (icp: IcpTable) => void
}) {
  const [open, setOpen] = useState(false)
  const [icpName, setName] = useState("")
  const [desc, setDesc] = useState("")
  const [queries, setQueries] = useState("")
  const [generating, setGen] = useState(false)

  async function handleGen() {
    try {
      setGen(true)
      const qs = await gptGenerateQueries(productMarkdown, icpName, desc)
      setQueries(qs.join("\n"))
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setGen(false)
    }
  }

  function handleAdd() {
    const rows = queries
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean)
    if (!icpName || rows.length === 0) {
      alert("Specify ICP name and at least one query.")
      return
    }
    onAdd({
      name: icpName,
      description: desc,
      rows: rows.map<KeywordRow>((k) => ({
        keyword: k,
        chatgpt: "Not analysed",
        perplexity: "Not analysed",
        google: "Not analysed",
        difficulty: randomDifficulty(),
        brandDomain: "",
        targeted: false,
      })),
    })
    setOpen(false)
    setName("")
    setDesc("")
    setQueries("")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="rounded-full">
          <Plus className="h-3 w-3 mr-1" /> Add ICP
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Ideal Customer Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="ICP name (e.g., DevSecOps teams)"
            value={icpName}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            placeholder="Describe this ICP… (optional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleGen} disabled={generating || !icpName} className="rounded-full">
              {generating ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 mr-1" />
                  Generate queries
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">Uses GPT-4.1 with company context</span>
          </div>
          <Textarea
            placeholder="One query per line…"
            value={queries}
            onChange={(e) => setQueries(e.target.value)}
            rows={6}
          />
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} className="rounded-full">Add ICP</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ───────────── ICP section ───────────── */
function IcpSection({
  icp,
  columns,
  onUpdate,
  onPersist,
  onAfterAddRows,
  productMarkdown,
}: {
  icp: IcpTable
  columns: ColumnDef<KeywordRow>[]
  onUpdate: (t: IcpTable) => void         // local state only
  onPersist: (t: IcpTable) => void        // persist to Firebase
  onAfterAddRows: (addedCount: number) => void // callback to auto-analyze new rows
  productMarkdown: string
}) {
  const [rowSelection, setRS] = useState({})
  const [newKeyword, setNew] = useState("")
  const [genOpen, setGOpen] = useState(false)
  const [genDesc, setGDesc] = useState("")
  const [genLoading, setGL] = useState(false)
  const [adding, setAdding] = useState(false)

  /* sync selection flag (do NOT persist) */
  useEffect(() => {
    icp.rows.forEach((r, i) => (r.__selected = !!(rowSelection as any)[i]))
    onUpdate({ ...icp })
  }, [rowSelection])

  const table = useReactTable({
    data: icp.rows,
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRS,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  /* add manual keyword (persist + auto analyze new one) */
  async function addRow() {
    if (!newKeyword.trim()) return
    setAdding(true)
    const fresh: KeywordRow = {
      keyword: newKeyword.trim(),
      chatgpt: "Not analysed",
      perplexity: "Not analysed",
      google: "Not analysed",
      difficulty: randomDifficulty(),
      brandDomain: icp.rows[0]?.brandDomain ?? "",
      targeted: false,
    }
    const next = { ...icp, rows: [...icp.rows, fresh] }
    onPersist(next)
    setNew("")
    setAdding(false)
    onAfterAddRows(1)
  }

  /* generate via GPT (persist + auto analyze new ones) */
  async function handleGenerate() {
    try {
      setGL(true)
      const qs = await gptGenerateQueries(productMarkdown, icp.name, genDesc)
      const newRows = qs.map<KeywordRow>((k) => ({
        keyword: k,
        chatgpt: "Not analysed",
        perplexity: "Not analysed",
        google: "Not analysed",
        difficulty: randomDifficulty(),
        brandDomain: icp.rows[0]?.brandDomain ?? "",
        targeted: false,
      }))
      const next = { ...icp, rows: [...icp.rows, ...newRows] }
      onPersist(next)
      setGOpen(false)
      setGDesc("")
      onAfterAddRows(newRows.length)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setGL(false)
    }
  }

  return (
    <Card className="shadow-lg border-slate-200 dark:border-slate-700 dark:bg-slate-800/20">
      <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-t-lg dark:from-slate-800/50 dark:to-slate-800/30">
        <CardTitle className="text-xl font-bold text-slate-800 dark:text-slate-200">{icp.name}</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">{icp.description}</p>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* add / generate row */}
        <div className="flex gap-2">
          <Input
            placeholder="Add keyword manually…"
            value={newKeyword}
            onChange={(e) => setNew(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addRow()}
            className="flex-1"
          />
          <Button onClick={addRow} size="sm" className="rounded-full" disabled={adding}>
            {adding ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Adding…
              </>
            ) : (
              <>
                <Plus className="h-3 w-3 mr-1" /> Add
              </>
            )}
          </Button>
          {/* Generate dialog */}
          <Dialog open={genOpen} onOpenChange={setGOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="flex items-center gap-1 bg-transparent rounded-full">
                <Sparkles className="h-3 w-3" /> Generate
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Generate keywords for “{icp.name}”</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  placeholder="Optional: describe what you want…"
                  value={genDesc}
                  onChange={(e) => setGDesc(e.target.value)}
                  rows={3}
                />
                <Button onClick={handleGenerate} disabled={genLoading} className="w-full rounded-full">
                  {genLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    "Generate & add"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {/* table */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-800">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className="font-semibold text-slate-700 dark:text-slate-300">
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={cn(
                    "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors",
                    row.getIsSelected() && "bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500",
                    row.original.targeted && "ring-1 ring-green-300 dark:ring-green-800",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
