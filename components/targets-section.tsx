"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  FileText,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  Target,
  BookOpen,
  AlertCircle,
  ArrowRight,
  Calendar as CalendarIcon,
  CheckCircle,
  Clock,
  Pencil,
  Lock,
  KeyRound,
  ImagePlus,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Firebase
import { db, storage } from "@/lib/firebase"
import { ref, get, update, onValue } from "firebase/database"
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage"

/* ---------- constants ---------- */
const MAX_REQUESTED = 4
const ITEMS_PER_PAGE = 20
const DEFAULT_OUTLINE_IMAGE = "/blog-outline.png"
const EDIT_PASSWORD = "0000"
const UNLOCK_PASSWORD = "1234"

/* ---------- helpers ---------- */
const safeKey = (s: string) => s.replace(/[.#$/\[\]]/g, "_")
const uniq = (arr: string[]) => Array.from(new Set(arr))

type RequestedItem = {
  keyword: string
  submitted?: boolean
  submittedAt?: number
  // card fields (filled after submission)
  id?: number
  title?: string
  excerpt?: string
  imageUrl?: string
  date?: string
  readTime?: string
  url?: string
  status?: "pending" | "published"
}

type BlogPostCard = {
  key: string
  id: number
  title: string
  excerpt: string
  imageUrl: string
  date: string
  readTime: string
  url: string
  status: "pending" | "published"
}

type BlogEditableFields = Pick<
  BlogPostCard,
  "id" | "title" | "excerpt" | "imageUrl" | "date" | "readTime" | "url" | "status"
> & { key: string }

type Batch = { createdAt: number; keywords: string[] }
type PastBatch = Batch & { ts: number }
type PastTargetsGroup = { ts: number; keywords: string[]; createdAt?: number }

const container = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } }
const item = { hidden: { opacity: 0, y: 20 }, visible: { y: 0, opacity: 1 } }

/* ---------- main section ---------- */
export default function TargetsSection() {
  // Client-only username from cookie
  const [username, setUsername] = useState<string>("")
  useEffect(() => {
    if (typeof document !== "undefined") {
      const m = document.cookie.match(/(?:^| )session=([^;]+)/)
      setUsername(m ? decodeURIComponent(m[1]) : "")
    }
  }, [])

  // State management
  const [loading, setLoading] = useState(true)
  const [targets, setTargets] = useState<string[]>([])

  // Scheduled blog cards come from requestedBlogs (submitted ones)
  const [requested, setRequested] = useState<RequestedItem[]>([])

  // Past scheduled cards (archived on unlock)
  const [pastScheduledCards, setPastScheduledCards] = useState<BlogPostCard[]>([])

  // Lock/unlock & batches
  const [unlocked, setUnlocked] = useState<boolean>(false)
  const [currentBatchTs, setCurrentBatchTs] = useState<number | null>(null)
  const [currentBatch, setCurrentBatch] = useState<Batch | null>(null)
  const [pastBatches, setPastBatches] = useState<PastBatch[]>([])
  const [pastTargetsGroups, setPastTargetsGroups] = useState<PastTargetsGroup[]>([])

  // UI state
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"alphabetical" | "length">("alphabetical")
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)

  // Unlock popover state
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockPass, setUnlockPass] = useState("")
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState("")

  // Load all needed data
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!username) return
      try {
        setLoading(true)

        const base = `analyticsDashaboard/${username}`
        const [
          // targets sources
          icpsSnap,
          compsSnap,
          reportTargetsSnap,
          perfBlogsSnap,
          // scheduled cards (current)
          requestedSnap,
          // lock & batches
          unlockedSnap,
          blogRequestsSnap,
          pastRequestsSnap,
          // past archives
          pastTargetsSnap,
          pastSchedSnap,
        ] = await Promise.all([
          get(ref(db, `${base}/icps`)),
          get(ref(db, `${base}/competitors`)),
          get(ref(db, `${base}/targetsFromReport`)),
          get(ref(db, `${base}/performanceBlogs`)),
          get(ref(db, `${base}/requestedBlogs`)),
          get(ref(db, `${base}/blogRequestUnlocked`)),
          get(ref(db, `${base}/blogRequests`)),
          get(ref(db, `${base}/pastRequests`)),
          get(ref(db, `${base}/pastTargets`)),
          get(ref(db, `${base}/pastScheduledBlogs`)),
        ])

        // -------- targets (ICPs, Comps, Report legacy, Performance) --------
        const icps = (icpsSnap.val() as Array<{ rows?: Array<{ keyword: string; targeted?: boolean }> }> | null) || []
        const targetedFromIcps: string[] = []
        icps.forEach((i) => i?.rows?.forEach((r) => r?.targeted && r.keyword && targetedFromIcps.push(r.keyword)))

     const comps = (compsSnap.val() as Record<string, any> | null) || {}

const targetedFromComps: string[] = []
const kwFromRow = (r: any) => {
  if (typeof r?.keyword === "string") return r.keyword.trim()
  if (typeof r?.keyword?.text === "string") return r.keyword.text.trim()
  if (typeof r?.keyword?.value === "string") return r.keyword.value.trim()
  return ""
}

Object.values(comps).forEach((c: any) => {
  const rows = Array.isArray(c?.rows) ? c.rows : Object.values(c?.rows || {})
  rows.forEach((r: any) => {
    const isTargeted =
      r?.targeted === true || r?.targeted === "true" || r?.targeted === 1 || r?.targeted === "1"
    const kw = kwFromRow(r)
    if (isTargeted && kw) targetedFromComps.push(kw)
  })
})



        const reportTargets =
          (reportTargetsSnap.val() as Record<string, { keyword?: string; targeted?: boolean }> | null) || {}
        const targetedFromReportLegacy: string[] = []
        Object.values(reportTargets).forEach((t) => {
          const kw = t?.keyword
          const isTargeted = typeof t?.targeted === "boolean" ? !!t.targeted : !!kw
          if (kw && isTargeted) targetedFromReportLegacy.push(kw)
        })

        const perfBlogs =
          (perfBlogsSnap.val() as
            | Record<string, { plan?: { flatQueries?: string[] }; targets?: Record<string, boolean> }>
            | null) || {}
        const targetedFromPerf: string[] = []
        Object.values(perfBlogs).forEach((blog) => {
          const flat = blog?.plan?.flatQueries || []
          const tgts = blog?.targets || {}
          if (!flat || !tgts) return
          flat.forEach((kw) => {
            if (tgts[safeKey(kw)]) targetedFromPerf.push(kw)
          })
        })

        // -------- scheduled cards (requestedBlogs with submitted) --------
        const reqObj =
          (requestedSnap.val() as Record<string, RequestedItem & { requestedAt?: number; submittedAt?: number }> | null) ||
          {}
        const requestedList: RequestedItem[] = Object.values(reqObj)

        // -------- lock & batches --------
        const isUnlocked = !!unlockedSnap.val()
        const blogRequestsObj = (blogRequestsSnap.val() as Record<string, Batch> | null) || {}
        const pastReqObj = (pastRequestsSnap.val() as Record<string, Batch> | null) || {}

        // find latest batch ts (numeric max key)
        const allTs = Object.keys(blogRequestsObj)
          .map((k) => Number(k))
          .filter((n) => !Number.isNaN(n))
        const latestTs = allTs.length ? Math.max(...allTs) : null
        const latestBatch = latestTs ? blogRequestsObj[String(latestTs)] : null

        const pastList: PastBatch[] = Object.keys(pastReqObj)
          .map((k) => Number(k))
          .filter((n) => !Number.isNaN(n))
          .map((ts) => ({ ts, ...(pastReqObj[String(ts)] || { createdAt: ts, keywords: [] }) }))

        // -------- past targets & scheduled cards (archives) --------
        const ptObj = (pastTargetsSnap.val() as Record<string, string[]> | null) || {}
        const ptGroups: PastTargetsGroup[] = Object.keys(ptObj)
          .map((k) => Number(k))
          .filter((n) => !Number.isNaN(n))
          .map((ts) => ({ ts, keywords: ptObj[String(ts)] || [] }))
          .sort((a, b) => b.ts - a.ts)

        const psObj = (pastSchedSnap.val() as Record<string, Record<string, RequestedItem>> | null) || {}
        const psCards: BlogPostCard[] = Object.entries(psObj).flatMap(([ts, group]) =>
          Object.entries(group || {}).map(([key, val]) => ({
            key,
            id: Number(val?.id ?? 0),
            title: val?.title ?? val?.keyword ?? "",
            excerpt: val?.excerpt ?? "Blog outline",
            imageUrl: val?.imageUrl ?? DEFAULT_OUTLINE_IMAGE,
            date: val?.date ?? "",
            readTime: val?.readTime ?? "N/A",
            url: val?.url ?? "#",
            status: (val?.status as "pending" | "published") ?? "pending",
          })),
        )

        if (!cancelled) {
          const allTargets = uniq([
            ...targetedFromIcps,
            ...targetedFromComps,
            ...targetedFromReportLegacy,
            ...targetedFromPerf,
          ])
          setTargets(allTargets)
          setRequested(requestedList)

          setUnlocked(isUnlocked)
          setCurrentBatchTs(latestTs)
          setCurrentBatch(latestBatch)
          setPastBatches(pastList.sort((a, b) => b.ts - a.ts))
          setPastTargetsGroups(ptGroups)
          setPastScheduledCards(psCards)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [username])

  /* ---------- NEW: live-listen to competitors to keep targets fresh ---------- */
  useEffect(() => {
    if (!username) return
    const base = `analyticsDashaboard/${username}`
    const unsubscribe = onValue(ref(db, `${base}/competitors`), async (compsSnap) => {
    const comps = (compsSnap.val() as Record<string, any> | null) || {}

const targetedFromComps: string[] = []
const kwFromRow = (r: any) => {
  if (typeof r?.keyword === "string") return r.keyword.trim()
  if (typeof r?.keyword?.text === "string") return r.keyword.text.trim()
  if (typeof r?.keyword?.value === "string") return r.keyword.value.trim()
  return ""
}

Object.values(comps).forEach((c: any) => {
  const rows = Array.isArray(c?.rows) ? c.rows : Object.values(c?.rows || {})
  rows.forEach((r: any) => {
    const isTargeted =
      r?.targeted === true || r?.targeted === "true" || r?.targeted === 1 || r?.targeted === "1"
    const kw = kwFromRow(r)
    if (isTargeted && kw) targetedFromComps.push(kw)
  })
})


      // fetch the other (non-live) sources once to recompute the union
      const [icpsSnap, reportTargetsSnap, perfBlogsSnap] = await Promise.all([
        get(ref(db, `${base}/icps`)),
        get(ref(db, `${base}/targetsFromReport`)),
        get(ref(db, `${base}/performanceBlogs`)),
      ])

      const icps = (icpsSnap.val() as Array<{ rows?: Array<{ keyword: string; targeted?: boolean }> }> | null) || []
      const targetedFromIcps: string[] = []
      icps.forEach((i) => i?.rows?.forEach((r) => r?.targeted && r.keyword && targetedFromIcps.push(r.keyword)))

      const reportTargets =
        (reportTargetsSnap.val() as Record<string, { keyword?: string; targeted?: boolean }> | null) || {}
      const targetedFromReportLegacy: string[] = []
      Object.values(reportTargets).forEach((t) => {
        const kw = t?.keyword
        const isTargeted = typeof t?.targeted === "boolean" ? !!t.targeted : !!kw
        if (kw && isTargeted) targetedFromReportLegacy.push(kw)
      })

      const perfBlogs =
        (perfBlogsSnap.val() as
          | Record<string, { plan?: { flatQueries?: string[] }; targets?: Record<string, boolean> }>
          | null) || {}
      const targetedFromPerf: string[] = []
      Object.values(perfBlogs).forEach((blog) => {
        const flat = blog?.plan?.flatQueries || []
        const tgts = blog?.targets || {}
        if (!flat || !tgts) return
        flat.forEach((kw) => {
          if (tgts[safeKey(kw)]) targetedFromPerf.push(kw)
        })
      })

      const allTargets = uniq([
        ...targetedFromIcps,
        ...targetedFromComps,
        ...targetedFromReportLegacy,
        ...targetedFromPerf,
      ])
      setTargets(allTargets)
    })

    return () => {
      unsubscribe()
    }
  }, [username])

  /* ---------------- derived ---------------- */
  const currentSubmittedKeywords = useMemo(
    () => requested.filter((r) => r.submitted).map((r) => r.keyword),
    [requested],
  )
  const submittedCount = currentSubmittedKeywords.length
  const requestedKeywordsSet = useMemo(() => new Set(currentBatch?.keywords || []), [currentBatch])

  const pastTargetsSet = useMemo(
    () => new Set(pastTargetsGroups.flatMap((g) => g.keywords || [])),
    [pastTargetsGroups],
  )
  const submittedNowSet = useMemo(() => new Set(currentSubmittedKeywords), [currentSubmittedKeywords])

  // Available = targeted - (in batch) - (submitted) - (past)
  const availableTargets = useMemo(() => {
    let filtered = targets.filter(
      (k) => !requestedKeywordsSet.has(k) && !submittedNowSet.has(k) && !pastTargetsSet.has(k),
    )
    if (searchQuery) {
      filtered = filtered.filter((k) => k.toLowerCase().includes(searchQuery.toLowerCase()))
    }
    filtered.sort((a, b) => (sortBy === "alphabetical" ? a.localeCompare(b) : a.length - b.length))
    return filtered
  }, [targets, requestedKeywordsSet, submittedNowSet, pastTargetsSet, searchQuery, sortBy])

  // Pagination
  const totalPages = Math.ceil(availableTargets.length / ITEMS_PER_PAGE)
  const paginatedTargets = availableTargets.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  const toggleKeywordSelection = (keyword: string) => {
    const newSelected = new Set(selectedKeywords)
    if (newSelected.has(keyword)) newSelected.delete(keyword)
    else newSelected.add(keyword)
    setSelectedKeywords(newSelected)
  }

  const toggleSelectAll = (keywords: string[]) => {
    const allSelected = keywords.every((k) => selectedKeywords.has(k))
    const newSelected = new Set(selectedKeywords)
    if (allSelected) keywords.forEach((k) => newSelected.delete(k))
    else keywords.forEach((k) => newSelected.add(k))
    setSelectedKeywords(newSelected)
  }

  const pendingRequestedCount = currentBatch?.keywords?.length ?? 0
  const availableSlots = Math.max(0, MAX_REQUESTED - submittedCount - pendingRequestedCount)
  const isLimitReached = submittedCount >= MAX_REQUESTED

  // Lock logic: locked = !unlocked
  const isLocked = !unlocked

  /* ---------------- actions for blogRequests model ---------------- */

  // Ensure a current (active) batch exists; if not, create one
  const ensureActiveBatch = async (): Promise<number> => {
    if (currentBatchTs && currentBatch) return currentBatchTs
    const ts = Date.now()
    const batch: Batch = { createdAt: ts, keywords: [] }
    await update(ref(db, `analyticsDashaboard/${username}`), {
      [`blogRequests/${ts}`]: batch,
    })
    setCurrentBatchTs(ts)
    setCurrentBatch(batch)
    return ts
  }

  // Add keywords to the active batch (unique, but capped by remaining cycle slots)
  const addKeywordsToActiveBatch = async (newKws: string[]) => {
    const ts = await ensureActiveBatch()
    const existing = (currentBatch?.keywords || []).slice()
    const room = Math.max(0, MAX_REQUESTED - submittedCount - existing.length)
    const toAdd = uniq([...existing, ...newKws]).slice(0, existing.length + room)
    await update(ref(db, `analyticsDashaboard/${username}`), {
      [`blogRequests/${ts}/keywords`]: toAdd,
      blogRequestUnlocked: true, // stays unlocked while building this batch
    })
    setCurrentBatch({ createdAt: ts, keywords: toAdd })
  }

  // Remove a keyword from the current batch (back to Available)
  const deleteFromBatch = async (kw: string) => {
    const ts = await ensureActiveBatch()
    const next = (currentBatch?.keywords || []).filter((k) => k !== kw)
    await update(ref(db, `analyticsDashaboard/${username}`), {
      [`blogRequests/${ts}/keywords`]: next.length ? next : null,
    })
    setCurrentBatch((prev) => (prev ? { ...prev, keywords: next } : prev))
  }

  // Submit a keyword -> becomes "Current" (requestedBlogs + card), removed from batch, and check lock
  const submitKeyword = async (kw: string) => {
    if (isLocked) return
    const ts = await ensureActiveBatch()
    const base = `analyticsDashaboard/${username}`
    const key = safeKey(kw)
    const card: RequestedItem = {
      keyword: kw,
      submitted: true,
      submittedAt: Date.now(),
      id: Date.now(),
      title: kw,
      excerpt: "Blog outline",
      imageUrl: DEFAULT_OUTLINE_IMAGE,
      date: "",
      readTime: "N/A",
      url: "#",
      status: "pending",
    }

    // remove from batch
    const nextBatch = (currentBatch?.keywords || []).filter((k) => k !== kw)

    await update(ref(db, base), {
      [`requestedBlogs/${key}`]: card,
      [`blogRequests/${ts}/keywords`]: nextBatch.length ? nextBatch : null,
    })

    // local updates
    setRequested((prev) => {
      const next = prev.slice()
      const idx = next.findIndex((r) => safeKey(r.keyword) === key)
      if (idx >= 0) next[idx] = { ...next[idx], ...card }
      else next.push(card)
      return next
    })
    setCurrentBatch((prev) => (prev ? { ...prev, keywords: nextBatch } : prev))

    // lock when we have 4 submitted
    const submittedAfter = submittedCount + 1
    if (submittedAfter >= MAX_REQUESTED) {
      await update(ref(db, base), { blogRequestUnlocked: false })
      setUnlocked(false)
    }
  }

  // Request selected -> add into blogRequests active batch
  async function requestSelectedBlogs() {
    if (isLocked || availableSlots <= 0) return
    const keywordsToRequest = Array.from(selectedKeywords).slice(0, availableSlots)
    if (keywordsToRequest.length === 0) return
    await addKeywordsToActiveBatch(keywordsToRequest)
    setSelectedKeywords(new Set())
  }

  // UNLOCK: archive current (no data loss) and start fresh unlocked cycle
  const manualUnlockNow = async () => {
    if (unlockPass !== UNLOCK_PASSWORD) {
      setUnlockError("Incorrect password")
      return
    }
    if (!username) {
      setUnlockError("Missing session username")
      return
    }
    setUnlocking(true)
    try {
      const base = `analyticsDashaboard/${username}`

      // fetch latest batch + all requested blogs for archiving
      const [brSnap, rbSnap] = await Promise.all([
        get(ref(db, `${base}/blogRequests`)),
        get(ref(db, `${base}/requestedBlogs`)),
      ])

      const brObj = (brSnap.val() as Record<string, Batch> | null) || {}
      const keys = Object.keys(brObj).map((k) => Number(k)).filter((n) => !Number.isNaN(n))
      const latestTs = keys.sort((a, b) => b - a)[0]
      const latestBatch = latestTs ? brObj[String(latestTs)] : { createdAt: Date.now(), keywords: [] }

      const reqObj = (rbSnap.val() as Record<string, RequestedItem> | null) || {}
      const submittedNow = Object.values(reqObj).filter((x) => x?.submitted)
      const submittedKeywordsOnly = submittedNow.map((x) => x.keyword)

      const archiveTs = Date.now()
      const updates: Record<string, any> = {
        // archive batch
        [`pastRequests/${archiveTs}`]: latestBatch,
        // archive current targets (keywords that were submitted this cycle)
        [`pastTargets/${archiveTs}`]: submittedKeywordsOnly,
        // archive scheduled cards (full payload)
        [`pastScheduledBlogs/${archiveTs}`]: reqObj,
        // clear current
        requestedBlogs: null,
        ...(latestTs ? { [`blogRequests/${latestTs}`]: null } : {}),
        // open a fresh cycle
        blogRequestUnlocked: true,
      }

      await update(ref(db, base), updates)

      // local state refresh (append archives; clear current)
      setUnlocked(true)
      setCurrentBatchTs(null)
      setCurrentBatch(null)
      setSelectedKeywords(new Set())
      setRequested([])

      setPastBatches((prev) => [
        { ts: archiveTs, createdAt: latestBatch.createdAt, keywords: latestBatch.keywords || [] },
        ...prev,
      ])
      setPastTargetsGroups((prev) => [{ ts: archiveTs, keywords: submittedKeywordsOnly }, ...prev])

      // convert archived requestedBlogs into cards for Past tab
      const newPastCards: BlogPostCard[] = Object.entries(reqObj).map(([key, val]) => ({
        key,
        id: Number(val?.id ?? 0),
        title: val?.title ?? val?.keyword ?? "",
        excerpt: val?.excerpt ?? "Blog outline",
        imageUrl: val?.imageUrl ?? DEFAULT_OUTLINE_IMAGE,
        date: val?.date ?? "",
        readTime: val?.readTime ?? "N/A",
        url: val?.url ?? "#",
        status: (val?.status as "pending" | "published") ?? "pending",
      }))
      setPastScheduledCards((prev) => [...newPastCards, ...prev])

      // close UI
      setUnlockOpen(false)
      setUnlockPass("")
      setUnlockError("")
    } finally {
      setUnlocking(false)
    }
  }

  /* ---------------- scheduled blog cards (Current & Past) ---------------- */

  const sortedRequestedForCards: RequestedItem[] = useMemo(() => {
    return requested
      .slice()
      .filter((r) => r.submitted) // current scheduled
      .sort((a, b) => (a.keyword || "").localeCompare(b.keyword || ""))
  }, [requested])

  // When a BlogCard saves changes, reflect them locally
  const handleCardUpdated = (updated: BlogEditableFields) => {
    setRequested((prev) => prev.map((r) => (safeKey(r.keyword) === updated.key ? { ...r, ...updated } : r)))
  }

  return (
    <div className="space-y-6">
      {/* ---------- TOP: Scheduled (Tabs: Current | Past) ---------- */}
      <motion.div variants={container} initial="hidden" animate="visible" className="w-full">
        <Card className="border bg-card/50 shadow-md backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-primary/15 via-primary/10 to-transparent p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Scheduled Blogs</h2>
                <p className="mt-1 text-muted-foreground">Manage the pipeline for your blog cycle</p>
              </div>
              <Badge variant="outline" className="text-xs">
                {unlocked ? "Unlocked" : "Locked"}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            <Tabs defaultValue="current" className="w-full">
              <TabsList className="bg-background/80 backdrop-blur-sm">
                <TabsTrigger value="current">Current</TabsTrigger>
                <TabsTrigger value="past">Past</TabsTrigger>
              </TabsList>

              <TabsContent value="current" className="mt-4">
                {sortedRequestedForCards.length ? (
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {sortedRequestedForCards.map((r, idx) => (
                      <BlogCard
                        key={r.keyword + idx}
                        username={username}
                        post={{
                          key: safeKey(r.keyword),
                          id: r.id ?? idx + 1,
                          title: r.title ?? r.keyword,
                          excerpt: r.excerpt ?? "Blog outline",
                          imageUrl: r.imageUrl ?? DEFAULT_OUTLINE_IMAGE,
                          date: r.date ?? "",
                          readTime: r.readTime ?? "N/A",
                          url: r.url ?? "#",
                          status: r.status ?? "pending",
                        }}
                        onUpdated={handleCardUpdated}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyCards />
                )}
              </TabsContent>

              <TabsContent value="past" className="mt-4">
                {pastScheduledCards.length ? (
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {pastScheduledCards.map((p, idx) => (
                      <BlogCard key={p.key + "_past_" + idx} username={username} post={p} onUpdated={() => {}} />
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No past scheduled blogs yet.</div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>

      {/* ---------- Available Targets & Request Workflow ---------- */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left: Targets */}
        <div className="xl:col-span-8">
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-900/80 dark:border-slate-700 h-fit">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Available Targets</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {isLocked ? "Locked — unlock to request new blogs" : "Unlocked — select keywords and request"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search targets..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alphabetical">A-Z</SelectItem>
                      <SelectItem value="length">Length</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{targets.length}</div>
                  <div className="text-xs text-blue-700 dark:text-blue-300">Total Targeted</div>
                </div>
                <div className="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-950/50 dark:to-green-900/50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">{availableTargets.length}</div>
                  <div className="text-xs text-green-700 dark:text-green-300">Available</div>
                </div>
                <div className="bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-950/50 dark:to-orange-900/50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{submittedCount}</div>
                  <div className="text-xs text-orange-700 dark:text-orange-300">Submitted (current cycle)</div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Lock / Limit Warnings */}
              {(isLimitReached || isLocked) && (
                <Alert className="border-red-200 bg-red-50 dark:bg-red-950/20">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800 dark:text-red-200">
                    {isLocked ? (
                      <>Requests locked. Unlock to start a new batch.</>
                    ) : (
                      <>
                        <strong>Limit reached!</strong> You’ve submitted the maximum of {MAX_REQUESTED} keywords this cycle.
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Bulk Actions Bar */}
              {selectedKeywords.size > 0 && !isLocked && availableSlots > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                      {selectedKeywords.size} selected
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {selectedKeywords.size === 1 ? "1 keyword selected" : `${selectedKeywords.size} keywords selected`}
                    </span>
                    {availableSlots < selectedKeywords.size && (
                      <Badge variant="outline" className="text-orange-600 border-orange-300">
                        Only {availableSlots} slots available
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={requestSelectedBlogs}
                      disabled={isLimitReached || isLocked || availableSlots === 0}
                      className="bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400"
                    >
                      Request Selected ({Math.min(selectedKeywords.size, availableSlots)})
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedKeywords(new Set())}>
                      Clear
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {availableTargets.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleSelectAll(paginatedTargets)}
                      disabled={isLocked || availableSlots === 0}
                    >
                      {paginatedTargets.every((k) => selectedKeywords.has(k)) ? (
                        <>
                          <CheckSquare className="h-4 w-4 mr-1" />
                          Deselect Page
                        </>
                      ) : (
                        <>
                          <Square className="h-4 w-4 mr-1" />
                          Select Page
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {!isLocked && (
                    <Badge variant="outline" className="text-green-600 border-green-300">
                      {availableSlots} slots remaining
                    </Badge>
                  )}
                  <span className="text-sm text-muted-foreground">{availableTargets.length} keywords available</span>
                </div>
              </div>

              {/* Content */}
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-20">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading targeted keywords…</span>
                </div>
              ) : availableTargets.length === 0 ? (
                <div className="text-center py-20">
                  <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h4 className="text-lg font-medium mb-2">
                    {searchQuery ? "No keywords found" : "No available targets"}
                  </h4>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                    {searchQuery
                      ? "Try adjusting your search terms or filters."
                      : "Mark queries as Targeted in Analysis, Competitors, or Performance to see them here."}
                  </p>
                  {searchQuery && (
                    <Button variant="outline" onClick={() => setSearchQuery("")}>
                      Clear Search
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <KeywordList
                    keywords={paginatedTargets}
                    selectedKeywords={selectedKeywords}
                    onToggleSelection={toggleKeywordSelection}
                    disabled={isLocked || isLimitReached || availableSlots === 0}
                  />

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                        {Math.min(currentPage * ITEMS_PER_PAGE, availableTargets.length)} of {availableTargets.length} keywords
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const page = i + 1
                            return (
                              <Button
                                key={page}
                                variant={currentPage === page ? "default" : "outline"}
                                size="sm"
                                onClick={() => setCurrentPage(page)}
                                className="w-8 h-8 p-0"
                              >
                                {page}
                              </Button>
                            )
                          })}
                          {totalPages > 5 && <span className="text-muted-foreground">...</span>}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Requested Pipeline + Current Keywords + Past Requests/Targets */}
        <div className="xl:col-span-4 space-y-6">
          {/* Requested (building) */}
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-900/80 dark:border-slate-700 h-fit">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                  <BookOpen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <CardTitle className="text-xl">Requested Blogs</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isLocked ? "Locked — showing last saved state" : "Unlocked — build your batch then Submit"}
                  </p>
                </div>
                {isLocked && (
                  <div className="ml-auto">
                    <Popover open={unlockOpen} onOpenChange={setUnlockOpen}>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1">
                          <Lock className="h-4 w-4" />
                          Unlock
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-80">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                            <p className="font-medium">Enter password to unlock</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="password"
                              placeholder="Enter password"
                              value={unlockPass}
                              onChange={(e) => {
                                setUnlockPass(e.target.value)
                                setUnlockError("")
                              }}
                            />
                            <Button size="sm" onClick={manualUnlockNow} disabled={unlocking || !unlockPass}>
                              {unlocking ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin mr-1" /> Unlocking…
                                </>
                              ) : (
                                "Unlock"
                              )}
                            </Button>
                          </div>
                          {unlockError && (
                            <Alert>
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription className="text-red-600">{unlockError}</AlertDescription>
                            </Alert>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading requests…</span>
                </div>
              ) : !currentBatch || (currentBatch.keywords?.length ?? 0) === 0 ? (
                <div className="text-center py-10 border-2 border-dashed rounded-lg">
                  <div className="text-3xl mb-3">📝</div>
                  <h4 className="font-medium mb-1">No blogs requested in this batch</h4>
                  <p className="text-sm text-muted-foreground">
                    {isLocked ? "Unlock to start a new batch." : "Select targets on the left and click 'Request Selected'."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {currentBatch.keywords.map((keyword, i) => (
                    <div
                      key={`${keyword}_${i}`}
                      className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
                    >
                      <span className="font-medium text-sm text-orange-900 dark:text-orange-100 break-words">
                        {keyword}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteFromBatch(keyword)}
                          className="gap-1"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => submitKeyword(keyword)}
                          disabled={isLocked || submittedCount >= MAX_REQUESTED}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          Submit
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Current Keywords (submitted) */}
          {currentSubmittedKeywords.length > 0 && (
            <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-900/80 dark:border-slate-700 h-fit">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Current Keywords</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Finalised for this cycle — their outlines are visible above in <em>Scheduled Blogs → Current</em>
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {currentSubmittedKeywords.map((kw, i) => (
                  <div key={`cur_${i}`} className="p-3 rounded-md border bg-muted/10 text-sm break-words">
                    {kw}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          

          {/* Past Targets (submitted keywords per cycle) */}
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-900/80 dark:border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Past Targets</CardTitle>
              <p className="text-sm text-muted-foreground">Keywords that were submitted in previous cycles.</p>
            </CardHeader>
            <CardContent>
              {pastTargetsGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No past targets yet.</p>
              ) : (
                <div className="space-y-4">
                  {pastTargetsGroups.map((g) => (
                    <div key={g.ts} className="rounded-lg border p-3">
                      <div className="mb-2 text-xs text-muted-foreground">
                        Cycle archived {new Date(g.createdAt || g.ts).toLocaleString()}
                      </div>
                      {g.keywords.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No keywords in this cycle.</p>
                      ) : (
                        <div className="space-y-2">
                          {g.keywords.map((kw, i) => (
                            <div key={`${g.ts}_${i}`} className="p-2 rounded-md bg-muted/10 text-sm break-words">
                              {kw}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ---------- Blog Card (editable + password protected + upload or default image + read more link) ---------- */
function BlogCard({
  post,
  username,
  onUpdated,
}: {
  post: BlogPostCard
  username: string
  onUpdated: (updated: BlogEditableFields) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Password gate
  const [authPass, setAuthPass] = useState("")
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState("")

  // Image upload state
  const [uploading, setUploading] = useState(false)
  const [imageMode, setImageMode] = useState<"default" | "upload">(
    post.imageUrl && post.imageUrl !== DEFAULT_OUTLINE_IMAGE ? "upload" : "default",
  )

  const [form, setForm] = useState<BlogEditableFields>({
    key: post.key,
    id: post.id,
    title: post.title,
    excerpt: post.excerpt,
    imageUrl: post.imageUrl,
    date: post.date,
    readTime: post.readTime,
    url: post.url,
    status: post.status,
  })

  useEffect(() => {
    setForm({
      key: post.key,
      id: post.id,
      title: post.title,
      excerpt: post.excerpt,
      imageUrl: post.imageUrl,
      date: post.date,
      readTime: post.readTime,
      url: post.url,
      status: post.status,
    })
    setImageMode(post.imageUrl && post.imageUrl !== DEFAULT_OUTLINE_IMAGE ? "upload" : "default")
    setAuthed(false)
    setAuthPass("")
    setAuthError("")
  }, [post, open])

  const handleChange = (field: keyof BlogEditableFields, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const tryUnlock = () => {
    if (authPass === EDIT_PASSWORD) {
      setAuthed(true)
      setAuthError("")
    } else {
      setAuthError("Incorrect password")
    }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const path = `analyticsDashaboard/${username}/requestedBlogs/${post.key}/${Date.now()}_${file.name}`
      const sref = storageRef(storage, path)
      await uploadBytes(sref, file)
      const url = await getDownloadURL(sref)
      handleChange("imageUrl", url)
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const finalImageUrl = imageMode === "default" ? DEFAULT_OUTLINE_IMAGE : form.imageUrl

      const updates: Record<string, any> = {
        id: Number(form.id) || post.id,
        title: form.title,
        excerpt: form.excerpt,
        imageUrl: finalImageUrl,
        date: form.date,
        readTime: form.readTime,
        url: form.url,
        status: form.status,
      }

      await update(ref(db, `analyticsDashaboard/${username}/requestedBlogs/${post.key}`), updates)
      onUpdated({ ...form, id: updates.id, imageUrl: finalImageUrl })
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div variants={item}>
      <Card className="relative h-full overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1">
        <div className="aspect-video overflow-hidden">
          <img
            src={post.imageUrl || "/placeholder.svg"}
            alt={post.title}
            className="h-full w-full object-contain transition-transform duration-300 hover:scale-105"
          />
        </div>

        {/* Edit Button opens dialog (password protected) */}
        <Button
          size="icon"
          variant="secondary"
          className="absolute top-2 right-2 rounded-full p-1 text-muted-foreground hover:text-primary"
          onClick={() => setOpen(true)}
          aria-label="Edit blog"
        >
          <Pencil className="h-4 w-4" />
        </Button>

        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={post.status === "published" ? "default" : "outline"} className="rounded-full">
              {post.status === "published" ? (
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Published
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Pending
                </span>
              )}
            </Badge>

            <div className="flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              <span>{post.date}</span>
            </div>
            <span>•</span>
            <span>{post.readTime}</span>
          </div>

          <h3 className="mb-2 font-semibold break-words">{post.title}</h3>
          <p className="text-sm text-muted-foreground mb-2">{post.excerpt}</p>

          {post.url && post.url !== "#" && (
            <Button asChild variant="link" className="px-0">
              <a href={post.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center">
                Read more <ArrowRight className="ml-1 h-3 w-3" />
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {authed ? (
                <>
                  <Pencil className="h-4 w-4" /> Edit Blog
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" /> Enter password to edit
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {!authed ? (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-4 items-center gap-3">
                <Label htmlFor="pass" className="text-right">
                  Password
                </Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Input
                    id="pass"
                    type="password"
                    value={authPass}
                    onChange={(e) => setAuthPass(e.target.value)}
                    placeholder="Enter dev password"
                  />
                  <Button onClick={tryUnlock} disabled={!authPass} className="whitespace-nowrap">
                    <KeyRound className="h-4 w-4 mr-1" /> Unlock
                  </Button>
                </div>
              </div>
              {authError && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-red-600">{authError}</AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="id" className="text-right">
                    ID
                  </Label>
                  <Input
                    id="id"
                    type="number"
                    value={form.id}
                    onChange={(e) => handleChange("id", Number(e.target.value))}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="title" className="text-right">
                    Title
                  </Label>
                  <Input id="title" value={form.title} onChange={(e) => handleChange("title", e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-start gap-3">
                  <Label htmlFor="excerpt" className="text-right pt-2">
                    Excerpt
                  </Label>
                  <Textarea id="excerpt" value={form.excerpt} onChange={(e) => handleChange("excerpt", e.target.value)} className="col-span-3" rows={3} />
                </div>

                {/* Image controls: choose upload or default outline */}
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label className="text-right">Image</Label>
                  <div className="col-span-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={imageMode === "upload" ? "default" : "outline"}
                      onClick={() => setImageMode("upload")}
                    >
                      <ImagePlus className="h-4 w-4 mr-1" /> Upload
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={imageMode === "default" ? "default" : "outline"}
                      onClick={() => {
                        setImageMode("default")
                        handleChange("imageUrl", DEFAULT_OUTLINE_IMAGE)
                      }}
                    >
                      Use blog outline image
                    </Button>
                  </div>
                </div>

                {imageMode === "upload" && (
                  <div className="grid grid-cols-4 items-center gap-3">
                    <Label htmlFor="imageFile" className="text-right">
                      Choose file
                    </Label>
                    <div className="col-span-3 flex items-center gap-2">
                      <Input id="imageFile" type="file" accept="image/*" onChange={handleFile} />
                      {uploading && (
                        <span className="inline-flex items-center text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin mr-1" /> Uploading…
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Manual URL still editable */}
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="imageUrl" className="text-right">
                    Image URL
                  </Label>
                  <Input id="imageUrl" value={form.imageUrl} onChange={(e) => handleChange("imageUrl", e.target.value)} className="col-span-3" />
                </div>

                {/* Preview */}
                <div className="grid grid-cols-4 items-start gap-3">
                  <div className="col-start-2 col-span-3">
                    <div className="rounded-md border p-2 bg-muted/30">
                      <img src={form.imageUrl || DEFAULT_OUTLINE_IMAGE} alt="Preview" className="w-full h-40 object-contain" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="date" className="text-right">
                    Date
                  </Label>
                  <Input id="date" type="date" value={form.date} onChange={(e) => handleChange("date", e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="readTime" className="text-right">
                    Read time
                  </Label>
                  <Input id="readTime" value={form.readTime} onChange={(e) => handleChange("readTime", e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="url" className="text-right">
                    URL
                  </Label>
                  <Input id="url" value={form.url} onChange={(e) => handleChange("url", e.target.value)} placeholder="# or https://..." className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label className="text-right">Status</Label>
                  <div className="col-span-3">
                    <Select value={form.status} onValueChange={(v: "pending" | "published") => handleChange("status", v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving || uploading}>
                  Cancel
                </Button>
                <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white" disabled={saving || uploading}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}

/* ---------- keyword list (Targets) ---------- */
function KeywordList({
  keywords,
  selectedKeywords,
  onToggleSelection,
  disabled,
}: {
  keywords: string[]
  selectedKeywords: Set<string>
  onToggleSelection: (keyword: string) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      {keywords.map((keyword, index) => (
        <motion.div
          key={keyword}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: index * 0.02 }}
        >
          <div
            className={`group flex items-center gap-4 p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
              selectedKeywords.has(keyword)
                ? "bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 border-blue-300 dark:border-blue-700 shadow-sm"
                : disabled
                  ? "bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed"
                  : "bg-white dark:bg-slate-800/50 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-800/80 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
            }`}
            onClick={() => !disabled && onToggleSelection(keyword)}
          >
            <Checkbox
              checked={selectedKeywords.has(keyword)}
              onCheckedChange={() => !disabled && onToggleSelection(keyword)}
              onClick={(e) => e.stopPropagation()}
              disabled={!!disabled}
              className="shrink-0"
            />
            <span
              className={`font-medium flex-1 break-words ${
                selectedKeywords.has(keyword)
                  ? "text-blue-900 dark:text-blue-100"
                  : disabled
                    ? "text-gray-500 dark:text-gray-400"
                    : "text-gray-900 dark:text-gray-100 group-hover:text-gray-700 dark:group-hover:text-gray-200"
              }`}
            >
              {keyword}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

/* ---------- empty cards state ---------- */
function EmptyCards() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/20 bg-muted/10 p-10 text-center">
      <Clock className="mb-2 h-10 w-10 text-muted-foreground/60" />
      <h3 className="mb-2 text-lg font-medium">No scheduled blogs</h3>
      <p className="text-sm text-muted-foreground">Once you submit 4 keywords, your schedule will appear here.</p>
    </div>
  )
}
