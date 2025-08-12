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

// Firebase
import { db, storage } from "@/lib/firebase"
import { ref, get, update } from "firebase/database"
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage"

/* ---------- constants ---------- */
const MAX_REQUESTED = 4
const ITEMS_PER_PAGE = 20
const DEFAULT_OUTLINE_IMAGE = "/blog-outline.png"
const EDIT_PASSWORD = "0000"

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

type BlogEditableFields = Pick<BlogPostCard, "id" | "title" | "excerpt" | "imageUrl" | "date" | "readTime" | "url" | "status"> & {
  key: string
}

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
  const [requested, setRequested] = useState<RequestedItem[]>([])
  const [updatingKey, setUpdatingKey] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [lockUntil, setLockUntil] = useState<number | null>(null)

  // UI state
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"alphabetical" | "length">("alphabetical")
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)

  // Load targeted + requested + lock (+ from Performance blogs)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!username) return
      try {
        setLoading(true)
        const [icpsSnap, compsSnap, reqSnap, lockSnap, reportTargetsSnap, perfBlogsSnap] = await Promise.all([
          get(ref(db, `analyticsDashaboard/${username}/icps`)),
          get(ref(db, `analyticsDashaboard/${username}/competitors`)),
          get(ref(db, `analyticsDashaboard/${username}/requestedBlogs`)),
          get(ref(db, `analyticsDashaboard/${username}/blogRequestLockUntil`)),
          // legacy / optional path (if you ever used it)
          get(ref(db, `analyticsDashaboard/${username}/targetsFromReport`)),
          // NEW: pull from performanceBlogs where Performance saves per-blog targets
          get(ref(db, `analyticsDashaboard/${username}/performanceBlogs`)),
        ])

        // Collect targeted from ICPs
        const icps = (icpsSnap.val() as Array<{ rows?: Array<{ keyword: string; targeted?: boolean }> }> | null) || []
        const targetedFromIcps: string[] = []
        icps.forEach((i) => i?.rows?.forEach((r) => r?.targeted && r.keyword && targetedFromIcps.push(r.keyword)))

        // Collect targeted from Competitors
        const comps =
          (compsSnap.val() as Record<string, { rows?: Array<{ keyword: string; targeted?: boolean }> }> | null) || {}
        const targetedFromComps: string[] = []
        Object.values(comps).forEach((c) =>
          c?.rows?.forEach((r) => r?.targeted && r.keyword && targetedFromComps.push(r.keyword)),
        )

        // Optional legacy "targetsFromReport"
        const reportTargets =
          (reportTargetsSnap.val() as Record<string, { keyword?: string; targeted?: boolean }> | null) || {}
        const targetedFromReportLegacy: string[] = []
        Object.values(reportTargets).forEach((t) => {
          const kw = t?.keyword
          const isTargeted = typeof t?.targeted === "boolean" ? !!t.targeted : !!kw
          if (kw && isTargeted) targetedFromReportLegacy.push(kw)
        })

        // **NEW**: Collect targeted from Performance blogs
        // Structure: performanceBlogs/{blogKey}/plan.flatQueries + /targets/{safeKey(kw)} = true
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

        // Requested set (might include submitted cards)
        const reqObj =
          (reqSnap.val() as Record<
            string,
            RequestedItem & { requestedAt?: number; submittedAt?: number }
          > | null) || {}
        const requestedList: RequestedItem[] = Object.values(reqObj)

        if (!cancelled) {
          const all = uniq([
            ...targetedFromIcps,
            ...targetedFromComps,
            ...targetedFromReportLegacy,
            ...targetedFromPerf, // ← include performance "Target" clicks
          ])
          setTargets(all)
          setRequested(requestedList)
          setLockUntil((lockSnap.val() as number | null) ?? null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [username])

  // Actions
  async function requestBlog(keyword: string) {
    if (requested.length >= MAX_REQUESTED) return
    setUpdatingKey(keyword)
    try {
      const updates: Record<string, any> = {}
      updates[`requestedBlogs/${safeKey(keyword)}`] = { keyword, requestedAt: Date.now(), submitted: false }
      await update(ref(db, `analyticsDashaboard/${username}`), updates)
      setRequested((prev) => [...prev, { keyword, submitted: false }])
    } finally {
      setUpdatingKey(null)
    }
  }

  async function removeRequest(keyword: string) {
    // Only allow removal if not submitted
    const item = requested.find((r) => r.keyword === keyword)
    if (!item || item.submitted) return
    setUpdatingKey(keyword)
    try {
      const updates: Record<string, any> = {}
      updates[`requestedBlogs/${safeKey(keyword)}`] = null
      await update(ref(db, `analyticsDashaboard/${username}`), updates)
      setRequested((prev) => prev.filter((k) => k.keyword !== keyword))
    } finally {
      setUpdatingKey(null)
    }
  }

  function addDays(base: number, days: number) {
    const d = new Date(base)
    d.setDate(d.getDate() + days)
    return d
  }
  function addOneMonth(ts: number) {
    const d = new Date(ts)
    d.setMonth(d.getMonth() + 1)
    return d.getTime()
  }
  function fmtDate(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }

  // Submit: schedule 4 posts: first in 4 days, then +5 days each
  async function submitRequests() {
    const pending = requested.filter((r) => !r.submitted)
    if (pending.length !== MAX_REQUESTED) return
    setSubmitting(true)
    try {
      const ts = Date.now()
      const keywords = pending.map((r) => r.keyword)

      // Create per-key schedule
      const scheduleDates = [
        fmtDate(addDays(ts, 4)),
        fmtDate(addDays(ts, 9)),
        fmtDate(addDays(ts, 14)),
        fmtDate(addDays(ts, 19)),
      ]

      const updates: Record<string, any> = {}
      // Record submission bundle
      updates[`blogRequests/${ts}`] = { keywords, createdAt: ts }
      // For each keyword, mark submitted and add card data under requestedBlogs
      pending.forEach((r, idx) => {
        const k = `requestedBlogs/${safeKey(r.keyword)}`
        updates[`${k}/submitted`] = true
        updates[`${k}/submittedAt`] = ts
        updates[`${k}/id`] = idx + 1
        updates[`${k}/title`] = r.keyword // no truncation
        updates[`${k}/excerpt`] = "Blog outline"
        updates[`${k}/imageUrl`] = DEFAULT_OUTLINE_IMAGE
        updates[`${k}/date`] = scheduleDates[idx]
        updates[`${k}/readTime`] = "N/A"
        updates[`${k}/url`] = "#"
        updates[`${k}/status`] = "pending"
      })
      // Set lockUntil = next month
      updates[`blogRequestLockUntil`] = addOneMonth(ts)

      await update(ref(db, `analyticsDashaboard/${username}`), updates)

      // reflect locally
      setRequested((prev) =>
        prev.map((r) =>
          keywords.includes(r.keyword)
            ? {
                ...r,
                submitted: true,
                submittedAt: ts,
                id: (keywords.indexOf(r.keyword) ?? 0) + 1,
                title: r.keyword,
                excerpt: "Blog outline",
                imageUrl: DEFAULT_OUTLINE_IMAGE,
                date: scheduleDates[keywords.indexOf(r.keyword)],
                readTime: "N/A",
                url: "#",
                status: "pending",
              }
            : r,
        ),
      )
      setLockUntil(addOneMonth(ts))
      setSelectedKeywords(new Set())
      setSubmitOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  // Bulk actions (targets only)
  async function requestSelectedBlogs() {
    const pendingCount = requested.filter((r) => !r.submitted).length
    const available = Math.min(selectedKeywords.size, MAX_REQUESTED - pendingCount)
    const keywordsToRequest = Array.from(selectedKeywords).slice(0, available)
    for (const keyword of keywordsToRequest) {
      await requestBlog(keyword)
    }
    setSelectedKeywords(new Set())
  }

  // Derived lists with filtering and sorting (search only affects targets)
  const requestedKeywordsSet = useMemo(() => new Set(requested.map((r) => r.keyword)), [requested])

  const availableTargets = useMemo(() => {
    let filtered = targets.filter((k) => !requestedKeywordsSet.has(k))
    if (searchQuery) {
      filtered = filtered.filter((k) => k.toLowerCase().includes(searchQuery.toLowerCase()))
    }
    filtered.sort((a, b) => (sortBy === "alphabetical" ? a.localeCompare(b) : a.length - b.length))
    return filtered
  }, [targets, requestedKeywordsSet, searchQuery, sortBy])

  const sortedRequested: RequestedItem[] = useMemo(() => {
    return requested
      .slice()
      .sort((a, b) => (sortBy === "alphabetical" ? a.keyword.localeCompare(b.keyword) : a.keyword.length - b.keyword.length))
  }, [requested, sortBy])

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

  const pendingRequestedCount = requested.filter((r) => !r.submitted).length
  const isLimitReached = pendingRequestedCount >= MAX_REQUESTED
  const availableSlots = Math.max(0, MAX_REQUESTED - pendingRequestedCount)
  const canSubmit = pendingRequestedCount === MAX_REQUESTED
  const now = Date.now()
  const lockedByMonth = lockUntil ? now < lockUntil : false

  // When a BlogCard saves changes, reflect them locally
  const handleCardUpdated = (updated: BlogEditableFields) => {
    setRequested((prev) =>
      prev.map((r) => (safeKey(r.keyword) === updated.key ? { ...r, ...updated } : r)),
    )
  }

  return (
    <div className="space-y-6">
      {/* ---------- TOP: Cards UI shown only AFTER submission exists (any submitted item) ---------- */}
      {sortedRequested.some((r) => r.submitted) && (
        <motion.div variants={container} initial="hidden" animate="visible" className="w-full">
          <Card className="border bg-card/50 shadow-md backdrop-blur-sm">
            <CardHeader className="bg-gradient-to-r from-primary/15 via-primary/10 to-transparent p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Scheduled Blogs</h2>
                  <p className="mt-1 text-muted-foreground">These posts are in the pipeline</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  Next window opens {lockUntil ? new Date(lockUntil).toLocaleDateString() : "soon"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {sortedRequested.filter((r) => r.submitted).length ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                  {sortedRequested
                    .filter((r) => r.submitted)
                    .map((r, idx) => (
                      <BlogCard
                        key={r.keyword + idx}
                        username={username}
                        post={{
                          key: safeKey(r.keyword),
                          id: r.id ?? idx + 1,
                          title: r.title ?? r.keyword, // no truncation
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
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ---------- Available Targets & Request Workflow (disabled after submission until next month) ---------- */}
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
                      {lockedByMonth
                        ? "New requests are locked until next month"
                        : "Keywords ready for blog creation"}
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
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {requested.filter((r) => !r.submitted).length}
                  </div>
                  <div className="text-xs text-orange-700 dark:text-orange-300">Requested (pending)</div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Lock / Limit Warnings */}
              {(isLimitReached || lockedByMonth) && (
                <Alert className="border-red-200 bg-red-50 dark:bg-red-950/20">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800 dark:text-red-200">
                    {lockedByMonth ? (
                      <>
                        <strong>Requests locked.</strong> You can request new blogs after {lockUntil ? new Date(lockUntil).toLocaleDateString() : "next month"}.
                      </>
                    ) : (
                      <>
                        <strong>Blog limit reached!</strong> You have requested the maximum of {MAX_REQUESTED} blogs.
                        Submit them or wait until next month to add more.
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Bulk Actions Bar */}
              {selectedKeywords.size > 0 && !lockedByMonth && (
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
                      disabled={isLimitReached || lockedByMonth}
                      className="bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400"
                    >
                      {isLimitReached
                        ? "Limit Reached"
                        : `Request Selected (${Math.min(selectedKeywords.size, availableSlots)})`}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedKeywords(new Set())}>
                      Clear Selection
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
                      disabled={lockedByMonth}
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
                  {!lockedByMonth && availableSlots > 0 && (
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
                    disabled={lockedByMonth || isLimitReached}
                  />

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, availableTargets.length)} of {availableTargets.length} keywords
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

        {/* Right: Requested Pipeline */}
        <div className="xl:col-span-4">
          <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm dark:bg-slate-900/80 dark:border-slate-700 h-fit">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg">
                  <BookOpen className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle className="text-xl">Requested Blogs</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {sortedRequested.some((r) => r.submitted)
                      ? "Submitted batch is locked"
                      : "Select targets and request up to 4"}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Pending Removal + List (only when not submitted yet) */}
              {!sortedRequested.some((r) => r.submitted) ? (
                <div className="space-y-4">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2 py-12">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading requests…</span>
                    </div>
                  ) : sortedRequested.filter((r) => !r.submitted).length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                      <div className="text-3xl mb-3">📝</div>
                      <h4 className="font-medium mb-1">No blogs requested yet</h4>
                      <p className="text-sm text-muted-foreground">
                        Select targets and click 'Request Selected' to get started.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sortedRequested
                        .filter((r) => !r.submitted)
                        .map(({ keyword }) => (
                          <motion.div key={keyword} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800 hover:shadow-sm transition-shadow">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                {/* NO TRUNCATION */}
                                <span className="font-medium text-sm text-orange-900 dark:text-orange-100">{keyword}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeRequest(keyword)}
                                disabled={updatingKey === keyword || submitting}
                                className="ml-2 h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20"
                              >
                                {updatingKey === keyword ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </motion.div>
                        ))}

                      {/* Submit when exactly 4 pending */}
                      {canSubmit && (
                        <div className="flex items-center justify-end pt-2">
                          <Popover open={submitOpen} onOpenChange={setSubmitOpen}>
                            <PopoverTrigger asChild>
                              <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={submitting}>
                                {submitting ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                    Submitting…
                                  </>
                                ) : (
                                  "Submit"
                                )}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-80">
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4 text-amber-600" />
                                  <p className="font-medium">Are you sure?</p>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  You’re about to submit {MAX_REQUESTED} blog requests. This will record a schedule and
                                  lock new requests until next month.
                                </p>
                                <div className="flex items-center justify-end gap-2 pt-2">
                                  <Button variant="outline" size="sm" onClick={() => setSubmitOpen(false)} disabled={submitting}>
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    onClick={submitRequests}
                                    disabled={submitting}
                                  >
                                    {submitting ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                        Confirming…
                                      </>
                                    ) : (
                                      "Confirm Submit"
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                // After submission: keep showing the list but locked (no edits)
                <div className="space-y-2">
                  {sortedRequested.map(({ keyword, submitted }) => (
                    <div
                      key={keyword}
                      className="flex items-center justify-between p-4 rounded-lg border bg-muted/20 opacity-90"
                    >
                      <span className="font-medium text-sm">{keyword}</span>
                      {submitted && (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          Submitted
                        </Badge>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground pt-2">
                    This batch is submitted. New requests will be available next month.
                  </p>
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
      // If user chose default outline, ensure value is the default image
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
                <Label htmlFor="pass" className="text-right">Password</Label>
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
                  <Label htmlFor="id" className="text-right">ID</Label>
                  <Input
                    id="id"
                    type="number"
                    value={form.id}
                    onChange={(e) => handleChange("id", Number(e.target.value))}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="title" className="text-right">Title</Label>
                  <Input id="title" value={form.title} onChange={(e) => handleChange("title", e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-start gap-3">
                  <Label htmlFor="excerpt" className="text-right pt-2">Excerpt</Label>
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
                    <Label htmlFor="imageFile" className="text-right">Choose file</Label>
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
                  <Label htmlFor="imageUrl" className="text-right">Image URL</Label>
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
                  <Label htmlFor="date" className="text-right">Date</Label>
                  <Input id="date" type="date" value={form.date} onChange={(e) => handleChange("date", e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="readTime" className="text-right">Read time</Label>
                  <Input id="readTime" value={form.readTime} onChange={(e) => handleChange("readTime", e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-3">
                  <Label htmlFor="url" className="text-right">URL</Label>
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
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving || uploading}>Cancel</Button>
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
              disabled={disabled}
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
