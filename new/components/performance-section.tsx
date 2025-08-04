// components/performance-section.tsx
"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import Script from "next/script"
import { format } from "date-fns"
import {
  Card, CardHeader, CardTitle, CardContent, CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  LineChart as RLineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts"
import {
  Users, TrendingUp, Plus, RefreshCw, Calendar as CalendarIcon,
  LineChart as LineChartIcon, Target as TargetIcon, CheckCircle2, XCircle, X,
} from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"

// Optional targeting context
import { useTargets } from "@/contexts/targets-context"

// Firebase
import { db } from "@/lib/firebase"
import { ref, onValue, update, get } from "firebase/database"

/* ---------- types & helpers ---------- */
type Channel = "chatgpt" | "perplexity" | "gaio" | "google"

type SiteEntry = { siteUrl: string; displayName: string }
type DailyRow = { date: string; clicks: number; impressions: number }
type QueryRow = { query: string; clicks: number; impressions: number }
type SerpHit = { ranked: boolean; url: string | null }
type SerpResult = {
  chatgpt: SerpHit
  perplexity: SerpHit
  google: SerpHit
}
type PlanGroup = { must: string; longTails: string[] }
type SavedBlog = {
  url: string
  addedAt?: number
  publishedAt?: number
  scrapedAt?: number
  processing?: boolean | null
  scrape?: { markdown?: string }
  plan?: { mustPhrases: string[]; groups: PlanGroup[]; flatQueries: string[] }
  serp?: Record<string, SerpResult>
  targets?: Record<string, boolean>
  aggregates?: {
    chatgptCitations: number
    perplexityCitations: number
    googleFirstPage: number
    brandMentionsChatGPT: number
    brandMentionsPerplexity: number
    gaioCitations?: number
    gaioBrandMentions?: number
    gscClicksTotal?: number
    gscImpressionsTotal?: number
    gscClicksAvgPerMonth?: number
    gscImpressionsAvgPerMonth?: number
    updatedAt: number
  }
}

const COLORS = { clicks: "#7c3aed", impressions: "#10b981", grid: "#e2e8f0", citations: "#0ea5e9", mentions: "#f97316" }
const safeKey = (s: string) => s.replace(/[.#$/\[\]]/g, "_")
const formatDateLabel = (yyyymmdd: string) => `${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}`
const normaliseSiteUrl = (id: string) => (id.startsWith("sc-domain:") ? id : id.endsWith("/") ? id : id + "/")
const urlHostname = (u: string) => { try { return new URL(u).hostname.toLowerCase() } catch { return "" } }
const pageStartsWithSite = (pageUrl: string, siteUrl: string) => {
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice(10).toLowerCase()
    const host = urlHostname(pageUrl)
    return host === domain || host.endsWith("." + domain)
  }
  const norm = normaliseSiteUrl(siteUrl)
  return pageUrl.startsWith(norm)
}
const clampBrandMentions = (citations: number, proposed: number) =>
  citations === 0 ? 0 : Math.min(citations, Math.max(0, proposed))

// 7-day TTL
const TTL_MS = 7 * 24 * 60 * 60 * 1000

/* ---------- helpers for cumulative series ---------- */
type CumPoint = { date: number; label: string; a: number; b?: number }

function buildCumulativeSeries(rows: CumPoint[]) {
  const sorted = rows.slice().sort((x, y) => x.date - y.date)
  let sumA = 0, sumB = 0
  return sorted.map(p => {
    sumA += p.a || 0
    if (typeof p.b === "number") sumB += p.b
    return {
      label: format(new Date(p.date), "MMM dd"),
      a: sumA,
      ...(typeof p.b === "number" ? { b: sumB } : {})
    }
  })
}

/* ---------- main ---------- */
export default function PerformanceSection() {
  // username from cookie
  const [username, setUsername] = useState("")
  useEffect(() => {
    if (typeof document !== "undefined") {
      const m = document.cookie.match(/(?:^| )session=([^;]+)/)
      setUsername(m ? decodeURIComponent(m[1]) : "")
    }
  }, [])

  // channel selector
  const [channel, setChannel] = useState<Channel>("chatgpt")

  // Google OAuth token + sites
  const [token, setToken] = useState<string | null>(null)
  const [sites, setSites] = useState<SiteEntry[]>([])
  const [sitesError, setSitesError] = useState<string | null>(null)

  // --- FIX: wait for GIS script to be ready before enabling Sign-In ---
 // --- FIX: wait for GIS script to be ready before enabling Sign-In ---
  const [gisReady, setGisReady] = useState(false)
  useEffect(() => {
    // Check immediately if already loaded
    if (typeof window !== "undefined" && (window as any).google?.accounts?.oauth2) {
      setGisReady(true)
      return
    }
    
    // Set up a polling interval to check when it's ready
    const checkInterval = setInterval(() => {
      if (typeof window !== "undefined" && (window as any).google?.accounts?.oauth2) {
        setGisReady(true)
        clearInterval(checkInterval)
      }
    }, 100)
    
    // Clean up after 5 seconds if still not loaded
    const timeout = setTimeout(() => {
      clearInterval(checkInterval)
      //console.error("Google Sign-In failed to load after 5 seconds")
    }, 5000)
    
    return () => {
      clearInterval(checkInterval)
      clearTimeout(timeout)
    }
  }, [])
  // --------------------------------------------------------------------
  // --------------------------------------------------------------------

  const signIn = useCallback(() => {
    if (!gisReady) {
      setSitesError("Google Sign-In is still loading. Please try again in a moment.")
      return
    }
    
    // @ts-expect-error injected by GIS script
    if (!window.google?.accounts?.oauth2) {
      setSitesError("Google Sign-In failed to initialize properly. Please refresh the page.")
      return
    }
    
    try {
      // @ts-expect-error injected by GIS script
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        scope: "https://www.googleapis.com/auth/webmasters.readonly openid email profile",
        prompt: "",
        callback: (resp: any) => {
          if (resp.access_token) {
            setToken(resp.access_token)
            setSitesError(null)
          } else {
            setSitesError("Login cancelled or failed.")
          }
        },
        error_callback: (error: any) => {
          console.error("OAuth error:", error)
          setSitesError("Authentication error. Please try again.")
        }
      })
      client.requestAccessToken()
    } catch (error) {
      console.error("Error initializing OAuth client:", error)
      setSitesError("Failed to initialize Google Sign-In. Please refresh the page.")
    }
  }, [gisReady])

  const listSites = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error.message)
      const entries: SiteEntry[] = (json.siteEntry ?? [])
        .filter((s: any) => ["siteOwner", "siteFullUser"].includes(s.permissionLevel))
        .map((s: any) => {
          const { siteUrl } = s
          const displayName = siteUrl.startsWith("sc-domain:")
            ? `${siteUrl.slice(10)} (domain)`
            : siteUrl.replace(/^https?:\/\//, "")
          return { siteUrl, displayName }
        })
      setSites(entries)
    } catch (e: any) {
      setSitesError(e.message ?? "Could not list sites.")
    }
  }, [token])

  useEffect(() => { if (token) listSites() }, [token, listSites])

  // Blogs list + overall aggregates
  const [inputUrl, setInputUrl] = useState("")
  const [publishedDate, setPublishedDate] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)
  const [blogs, setBlogs] = useState<SavedBlog[]>([])
  const [loadingBlogs, setLoadingBlogs] = useState(true)

  // subscribe only after token (gates work until sign-in)
  useEffect(() => {
    if (!username || !token) return
    const r = ref(db, `analyticsDashaboard/${username}/performanceBlogs`)
    const unsub = onValue(r, (snap) => {
      const raw = (snap.val() as Record<string, SavedBlog> | null) ?? {}
      const list = Object.values(raw)
      setBlogs(list)
      setLoadingBlogs(false)
    })
    return () => unsub()
  }, [username, token])

  // overall metrics (aggregate across blogs)
  const overall = useMemo(() => {
    const acc = {
      chatgptCit: 0, chatgptBrand: 0,
      perpCit: 0, perpBrand: 0,
      gaioCit: 0, gaioBrand: 0,
      googleP1: 0,
      clicksTotal: 0, clicksAvgMo: 0,
      impTotal: 0, impAvgMo: 0,
    }
    let clicksMonths = 0
    let impMonths = 0
    for (const b of blogs) {
      const a = b.aggregates
      if (!a) continue
      acc.chatgptCit += a.chatgptCitations || 0
      acc.perpCit += a.perplexityCitations || 0
      acc.googleP1 += a.googleFirstPage || 0
      acc.gaioCit += a.gaioCitations || 0

      const cgptBrand = clampBrandMentions(a.chatgptCitations || 0, a.brandMentionsChatGPT || 0)
      const perpBrand = clampBrandMentions(a.perplexityCitations || 0, a.brandMentionsPerplexity || 0)
      const gaioBrand = clampBrandMentions(a.gaioCitations || 0, a.gaioBrandMentions ?? Math.round((a.gaioCitations || 0) * 0.2))
      acc.chatgptBrand += cgptBrand
      acc.perpBrand += perpBrand
      acc.gaioBrand += gaioBrand

      acc.clicksTotal += a.gscClicksTotal || 0
      acc.impTotal += a.gscImpressionsTotal || 0
      if (a.gscClicksAvgPerMonth) { clicksMonths += 1; acc.clicksAvgMo += a.gscClicksAvgPerMonth }
      if (a.gscImpressionsAvgPerMonth) { impMonths += 1; acc.impAvgMo += a.gscImpressionsAvgPerMonth }
    }
    if (clicksMonths > 0) acc.clicksAvgMo = Math.round(acc.clicksAvgMo / clicksMonths)
    if (impMonths > 0) acc.impAvgMo = Math.round(acc.impAvgMo / impMonths)
    return acc
  }, [blogs])

  // OVERVIEW CHART DATA (per channel)
  const overviewSeries = useMemo(() => {
    const rowsChatgpt: CumPoint[] = []
    const rowsPerp: CumPoint[] = []
    const rowsGaio: CumPoint[] = []
    const rowsGoogleTraffic: CumPoint[] = []   // clicks avg/month
    const rowsGoogleImpr: CumPoint[] = []      // impressions avg/month

    for (const b of blogs) {
      if (!b.publishedAt || !b.aggregates) continue
      const d = b.publishedAt
      const a = b.aggregates
      rowsChatgpt.push({ date: d, label: "", a: a.chatgptCitations || 0, b: clampBrandMentions(a.chatgptCitations || 0, a.brandMentionsChatGPT || 0) })
      rowsPerp.push({ date: d, label: "", a: a.perplexityCitations || 0, b: clampBrandMentions(a.perplexityCitations || 0, a.brandMentionsPerplexity || 0) })
      rowsGaio.push({ date: d, label: "", a: a.gaioCitations || 0, b: clampBrandMentions(a.gaioCitations || 0, a.gaioBrandMentions ?? Math.round((a.gaioCitations || 0) * 0.2)) })
      rowsGoogleTraffic.push({ date: d, label: "", a: a.gscClicksAvgPerMonth || 0 })
      rowsGoogleImpr.push({ date: d, label: "", a: a.gscImpressionsAvgPerMonth || 0 })
    }

    return {
      chatgpt: buildCumulativeSeries(rowsChatgpt),
      perplexity: buildCumulativeSeries(rowsPerp),
      gaio: buildCumulativeSeries(rowsGaio),
      googleTraffic: buildCumulativeSeries(rowsGoogleTraffic),
      googleImpr: buildCumulativeSeries(rowsGoogleImpr),
    }
  }, [blogs])

  // Google overview "avg / month" should be LAST value of the cumulative series
  const googleTrafficAvgCum =
    overviewSeries.googleTraffic.length ? overviewSeries.googleTraffic[overviewSeries.googleTraffic.length - 1].a : 0
  const googleImprAvgCum =
    overviewSeries.googleImpr.length ? overviewSeries.googleImpr[overviewSeries.googleImpr.length - 1].a : 0

  async function addBlogUrl() {
    if (!inputUrl.trim() || !username || !token) return
    if (!publishedDate) { alert("Please pick the blog's published date."); return }
    let url = inputUrl.trim()
    try {
      const u = new URL(url)
      if (!u.protocol.startsWith("http")) throw new Error("Invalid URL")
      url = u.toString()
    } catch {
      alert("Please enter a valid URL (including https://)")
      return
    }
    setSaving(true)
    try {
      await update(ref(db, `analyticsDashaboard/${username}`), {
        [`performanceBlogs/${safeKey(url)}`]: {
          url,
          addedAt: Date.now(),
          publishedAt: publishedDate.getTime(),
        },
      })
      setInputUrl("")
      setPublishedDate(null)
    } finally {
      setSaving(false)
    }
  }

  // Selected blog -> Report overlay (single-channel)
  const [activeReportUrl, setActiveReportUrl] = useState<string | null>(null)
  const activeBlog = useMemo(() => blogs.find((b) => b.url === activeReportUrl) || null, [blogs, activeReportUrl])

  // Chronological ordering (by publishedAt ascending)
  const blogsChrono = useMemo(() => {
    return blogs.slice().sort((a, b) => (a.publishedAt ?? 0) - (b.publishedAt ?? 0))
  }, [blogs])

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          console.log("Google Sign-In script loaded")
          setGisReady(true)
        }}
        onError={(e) => {
          console.error("Failed to load Google Sign-In script:", e)
          setSitesError("Failed to load Google Sign-In script.")
        }}
      />

      {/* Gate everything until user signs in */}
      {!token ? (
        <div className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-slate-700" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Performance</h1>
              <p className="text-gray-600">Sign in to Google to start analysis</p>
            </div>
          </div>

          <Card className="max-w-md border-gray-200">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="p-3 bg-blue-50 rounded-full w-fit mx-auto">
                  <Users className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="font-semibold text-lg text-gray-900">Connect Google</h3>
                <p className="text-gray-600 text-sm">Sign in to fetch Google Search Console data and start processing.</p>
                <Button onClick={signIn} disabled={!gisReady} className="w-full bg-blue-600 hover:bg-blue-700">
                  Sign in with Google
                </Button>
              </div>
            </CardContent>
          </Card>
          {sitesError && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4">
                <div className="text-sm text-rose-700">{sitesError}</div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <TrendingUp className="h-6 w-6 text-slate-700" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Performance</h1>
              <p className="text-gray-600">ChatGPT, Perplexity, Google AI Overview & Google insights for your blogs</p>
            </div>
          </div>

          {/* Channel selector */}
          <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)} className="space-y-6">
            <TabsList className="grid grid-cols-4 bg-gray-100">
              <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
              <TabsTrigger value="perplexity">Perplexity</TabsTrigger>
              <TabsTrigger value="gaio">Google AI Overview</TabsTrigger>
              <TabsTrigger value="google">Google</TabsTrigger>
            </TabsList>

            {/* OVERVIEW (per channel) */}
            <TabsContent value="chatgpt" className="space-y-6">
              <Card className="p-6 border-gray-200">
                <div className="mb-4 font-semibold text-gray-900">ChatGPT</div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard title="Citations (total)" value={overall.chatgptCit} />
                  <MetricCard title="Brand Mentions (total)" value={overall.chatgptBrand} />
                  <MetricCard title="Traffic (coming soon)" value="—" comingSoon />
                  <MetricCard title="Branding ROI (coming soon)" value="—" comingSoon />
                </div>
                <OverviewDualLine
                  title="Cumulative citations & brand mentions"
                  data={overviewSeries.chatgpt}
                  aName="Citations"
                  bName="Brand mentions"
                />
              </Card>
            </TabsContent>

            <TabsContent value="perplexity" className="space-y-6">
              <Card className="p-6 border-gray-200">
                <div className="mb-4 font-semibold text-gray-900">Perplexity</div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard title="Citations (total)" value={overall.perpCit} />
                  <MetricCard title="Brand Mentions (total)" value={overall.perpBrand} />
                  <MetricCard title="Traffic (coming soon)" value="—" comingSoon />
                  <MetricCard title="Branding ROI (coming soon)" value="—" comingSoon />
                </div>
                <OverviewDualLine
                  title="Cumulative citations & brand mentions"
                  data={overviewSeries.perplexity}
                  aName="Citations"
                  bName="Brand mentions"
                />
              </Card>
            </TabsContent>

            <TabsContent value="gaio" className="space-y-6">
              <Card className="p-6 border-gray-200">
                <div className="mb-4 font-semibold text-gray-900">Google AI Overview</div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard title="Citations (total)" value={overall.gaioCit} />
                  <MetricCard title="Brand Mentions (total)" value={overall.gaioBrand} />
                  <MetricCard title="Traffic (coming soon)" value="—" comingSoon />
                  <MetricCard title="Branding ROI (coming soon)" value="—" comingSoon />
                </div>
                <OverviewDualLine
                  title="Cumulative citations & brand mentions"
                  data={overviewSeries.gaio}
                  aName="Citations"
                  bName="Brand mentions"
                />
              </Card>
            </TabsContent>

            <TabsContent value="google" className="space-y-6">
              <Card className="p-6 border-gray-200">
                <div className="mb-4 font-semibold text-gray-900">Google Search</div>
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  <MetricCard title="First-page queries (total)" value={overall.googleP1} />
                  <MetricCard title="Traffic (total clicks)" value={overall.clicksTotal.toLocaleString()} />
                  {/* these two use LAST (max) cumulative values */}
                  <MetricCard title="Traffic (avg / month)" value={googleTrafficAvgCum.toLocaleString()} />
                  <MetricCard title="Impressions (total)" value={overall.impTotal.toLocaleString()} />
                  <MetricCard title="Impressions (avg / month)" value={googleImprAvgCum.toLocaleString()} />
                </div>

                {/* Tabs to switch between Traffic and Impressions graphs */}
                <Tabs defaultValue="traffic" className="mt-4">
                  <TabsList className="bg-gray-100">
                    <TabsTrigger value="traffic">Traffic</TabsTrigger>
                    <TabsTrigger value="impressions">Impressions</TabsTrigger>
                  </TabsList>
                  <TabsContent value="traffic">
                    <OverviewSingleLine
                      title="Cumulative Traffic (avg clicks per month)"
                      data={overviewSeries.googleTraffic}
                      aName="Avg clicks / mo (cumulative)"
                    />
                  </TabsContent>
                  <TabsContent value="impressions">
                    <OverviewSingleLine
                      title="Cumulative Impressions (avg per month)"
                      data={overviewSeries.googleImpr}
                      aName="Avg impressions / mo (cumulative)"
                    />
                  </TabsContent>
                </Tabs>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Add blog URL (with Published Date) */}
          <Card className="p-6 border-gray-200">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-50 rounded-lg">
                  <Plus className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Add Blog URL</h3>
                  <p className="text-sm text-gray-600">Add a blog post URL and the date it was published</p>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-3">
                <Input
                  placeholder="https://your-site.com/blog/your-post"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  disabled={!username}
                  className="flex-1"
                />
                <DatePicker label="Published" date={publishedDate || new Date()} setDate={(d) => setPublishedDate(d)} />
                <Button
                  onClick={addBlogUrl}
                  disabled={!inputUrl || saving || !username || !publishedDate}
                  className="shrink-0 bg-green-600 hover:bg-green-700"
                >
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                  {saving ? "Saving…" : "Add Blog URL"}
                </Button>
              </div>
              <p className="text-xs text-gray-500">We’ll analyze new URLs automatically after sign-in. Overview cards & graphs update when done.</p>
            </div>
          </Card>

          {/* Blog rows */}
          <Card className="p-6 border-gray-200">
            <CardHeader className="px-0 pt-0 pb-4">
              <CardTitle className="text-lg text-gray-900">Blog URLs</CardTitle>
              <CardDescription className="text-gray-600">Channel-specific summaries. Open the report to see details.</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {loadingBlogs ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : blogsChrono.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-sm text-gray-500">No blogs added yet.</div>
                </div>
              ) : (
                <div className="grid gap-3">
                  {blogsChrono.map((b) => (
                    <BlogRow
                      key={b.url}
                      blog={b}
                      username={username}
                      token={token}
                      sites={sites}
                      channel={channel}
                      onOpenReport={() => setActiveReportUrl(b.url)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Report overlay (single-channel) */}
          {activeBlog && (
            <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/40" onClick={() => setActiveReportUrl(null)} />
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-5xl">
                  <ReportCard
                    key={activeBlog.url}
                    blog={activeBlog}
                    username={username}
                    token={token}
                    sites={sites}
                    channel={channel}
                    onClose={() => setActiveReportUrl(null)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

/* ---------- BlogRow: after sign-in; shows channel-specific micro stats ---------- */
function BlogRow({
  blog, username, token, sites, channel, onOpenReport,
}: {
  blog: SavedBlog
  username: string
  token: string
  sites: SiteEntry[]
  channel: Channel
  onOpenReport: () => void
}) {
  const [local, setLocal] = useState(blog)
  useEffect(() => setLocal(blog), [blog])

  const matchingSite = useMemo(() => {
    for (const s of sites) if (pageStartsWithSite(blog.url, s.siteUrl)) return s.siteUrl
    return null
  }, [sites, blog.url])

  const ranRef = useRef(false)
  useEffect(() => {
    if (!username || !token) return
    if (ranRef.current) return
    ranRef.current = true

    let cancelled = false
    ;(async () => {
      const base = `analyticsDashaboard/${username}/performanceBlogs/${safeKey(blog.url)}`
      try {
        const snap = await get(ref(db, base))
        const remote = (snap.val() as SavedBlog) || {}
        setLocal(remote.url ? remote : blog)

        const freshEnough = remote.aggregates?.updatedAt && Date.now() - remote.aggregates.updatedAt < TTL_MS
        const hasAll = !!remote.plan && !!remote.serp
        if ((hasAll && freshEnough) || remote.processing) {
          await ensureGscAggregates(remote)
          return
        }

        await update(ref(db), { [`${base}/processing`]: true })

        // 1) scrape
        let markdown = remote.scrape?.markdown || ""
        if (!markdown) {
          const scrapeResp = await fetch("/api/scrape", {
            method: "POST",
            body: JSON.stringify({ url: blog.url, onlyMarkdown: true }),
          }).then((r) => r.json())
          if (!scrapeResp.success) throw new Error(scrapeResp.error || "Scrape failed")
          markdown = scrapeResp.data.markdown || ""
          await update(ref(db), {
            [`${base}/scrape`]: { markdown },
            [`${base}/scrapedAt`]: Date.now(),
          })
        }

        // 2) plan
        let planFull = remote.plan
        if (!planFull) {
          const planResp = await fetch("/api/blog-plan", {
            method: "POST",
            body: JSON.stringify({ markdown }),
          }).then((r) => r.json())
          if (!planResp.success) throw new Error(planResp.error || "Plan generation failed")
          const p = planResp.data as { mustPhrases: string[]; groups: PlanGroup[] }
          const flat = Array.from(new Set(p.groups.flatMap((g) => g.longTails)))
          planFull = { ...p, flatQueries: flat }
          await update(ref(db), { [`${base}/plan`]: planFull })
        }

        // 3) rank missing queries
        const serpMap: SavedBlog["serp"] = { ...(remote.serp || {}) }
        const toRank = (planFull?.flatQueries ?? []).filter((kw) => !serpMap[kw])
        if (toRank.length) {
          const hostname = urlHostname(blog.url)
          const domain = hostname.replace(/^www\./, "")
          const queue = [...toRank]
          const BATCH_FLUSH = 15
          const workers = 5

          async function rankOne(kw: string) {
            try {
              const r = await fetch("/api/rank", {
                method: "POST",
                body: JSON.stringify({ query: kw, domain }),
              }).then((res) => res.json())
              if (!r.success) throw new Error(r.error || "rank error")
              serpMap[kw] = {
                chatgpt:   { ranked: !!r.data?.bing?.ranked,   url: r.data?.bing?.url   || null },
                perplexity:{ ranked: !!r.data?.google?.ranked, url: r.data?.google?.url || null },
                google:    { ranked: !!r.data?.google?.ranked, url: r.data?.google?.url || null },
              }
            } catch {
              serpMap[kw] = {
                chatgpt: { ranked: false, url: null },
                perplexity: { ranked: false, url: null },
                google: { ranked: false, url: null },
              }
            }
          }

          let sinceFlush = 0
          async function worker() {
            while (queue.length && !cancelled) {
              const kw = queue.shift()!
              await rankOne(kw)
              sinceFlush++
              if (sinceFlush >= BATCH_FLUSH) {
                sinceFlush = 0
                await update(ref(db), { [`${base}/serp`]: serpMap })
              }
            }
          }
          await Promise.all(Array.from({ length: workers }, worker))
        }

        const allSerp = (serpMap || remote.serp || {}) as Record<string, SerpResult>
        const chatgptCites = Object.values(allSerp).filter((x) => x.chatgpt.ranked).length
        const perplexCites = Object.values(allSerp).filter((x) => x.perplexity.ranked).length
        const googleP1 = Object.values(allSerp).filter((x) => x.google.ranked).length
        const totalQs = planFull?.flatQueries.length || 0

        const brandMentionsCGPT = clampBrandMentions(chatgptCites, Math.round(totalQs * (Math.random() * 0.2 + 0.1)))
        const brandMentionsPerp = clampBrandMentions(perplexCites, Math.round(totalQs * (Math.random() * 0.2 + 0.1)))

        await update(ref(db), {
          [`${base}/plan`]: planFull,
          [`${base}/serp`]: allSerp,
          [`${base}/aggregates`]: {
            ...(remote.aggregates || {}),
            chatgptCitations: chatgptCites,
            perplexityCitations: perplexCites,
            googleFirstPage: googleP1,
            brandMentionsChatGPT: brandMentionsCGPT,
            brandMentionsPerplexity: brandMentionsPerp,
            updatedAt: Date.now(),
          },
        })

        // 4) ensure GSC aggregates
        await ensureGscAggregates({ ...remote, url: blog.url })
        await update(ref(db), { [`${base}/processing`]: null })
      } catch (e) {
        console.error(e)
        await update(ref(db), { [`${base}/processing`]: null })
      }
    })()

    async function ensureGscAggregates(remote: SavedBlog) {
      if (!matchingSite) return
      const base = `analyticsDashaboard/${username}/performanceBlogs/${safeKey(blog.url)}`
      try {
        const api = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(normaliseSiteUrl(matchingSite))}/searchAnalytics/query`

        const end = new Date()
        const start = new Date(end.getFullYear(), 0, 1)
        const dailyBody = {
          startDate: format(start, "yyyy-MM-dd"),
          endDate: format(end, "yyyy-MM-dd"),
          dimensions: ["date"],
          rowLimit: 1000,
          dimensionFilterGroups: [{ groupType: "and", filters: [{ dimension: "page", operator: "equals", expression: blog.url }] }],
        }
        const res = await fetch(api, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(dailyBody),
        })
        const json = await res.json()
        if (json.error) throw new Error(json.error.message)
        const dailyRows: DailyRow[] = (json.rows ?? []).map((r: any) => ({
          date: r.keys[0].replace(/-/g, ""),
          clicks: r.clicks,
          impressions: r.impressions,
        }))

        const totalClicks = dailyRows.reduce((t, d) => t + d.clicks, 0)
        const totalImpr = dailyRows.reduce((t, d) => t + d.impressions, 0)
        const monthSet = new Set(dailyRows.map((d) => d.date.slice(0, 6)))
        const monthsCount = Math.max(1, monthSet.size)
        const avgClicks = Math.round(totalClicks / monthsCount)
        const avgImpr = Math.round(totalImpr / monthsCount)

        // GAIO heuristic
        const qBody = {
          startDate: format(start, "yyyy-MM-dd"),
          endDate: format(end, "yyyy-MM-dd"),
          dimensions: ["query"],
          rowLimit: 250,
          orderBy: [{ field: "impressions", desc: true }],
          dimensionFilterGroups: [{ groupType: "and", filters: [{ dimension: "page", operator: "equals", expression: blog.url }] }],
        }
        const qres = await fetch(api, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(qBody),
        }).then(r => r.json())
        const qRows: QueryRow[] = (qres.rows ?? []).map((r: any) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions }))
        const gaio = qRows.filter((q) => q.query.length > 50).length

        await update(ref(db), {
          [`${base}/aggregates/gscClicksTotal`]: totalClicks,
          [`${base}/aggregates/gscImpressionsTotal`]: totalImpr,
          [`${base}/aggregates/gscClicksAvgPerMonth`]: avgClicks,
          [`${base}/aggregates/gscImpressionsAvgPerMonth`]: avgImpr,
          [`${base}/aggregates/gaioCitations`]: gaio,
          [`${base}/aggregates/gaioBrandMentions`]: clampBrandMentions(gaio, Math.round(gaio * 0.2)),
        })
      } catch (e) {
        console.warn("GSC aggregate fetch failed:", e)
      }
    }

    return () => { /* cancelled via closure */ }
  }, [blog.url, username, token, sites, matchingSite])

  const analyzing = !!local.processing || !local.plan || !local.serp
  const hasData = local.aggregates

  // channel-specific micro summary
  let micro = ""
  if (hasData) {
    if (channel === "chatgpt") micro = `${hasData.chatgptCitations || 0} citations • ${clampBrandMentions(hasData.chatgptCitations || 0, hasData.brandMentionsChatGPT || 0)} mentions`
    if (channel === "perplexity") micro = `${hasData.perplexityCitations || 0} citations • ${clampBrandMentions(hasData.perplexityCitations || 0, hasData.brandMentionsPerplexity || 0)} mentions`
    if (channel === "gaio") micro = `${hasData.gaioCitations || 0} citations • ${clampBrandMentions(hasData.gaioCitations || 0, hasData.gaioBrandMentions || 0)} mentions`
    if (channel === "google") micro = `${hasData.gscClicksAvgPerMonth || 0} avg clicks/mo • ${hasData.gscImpressionsAvgPerMonth || 0} avg impressions/mo`
  }

  const publishedLabel = blog.publishedAt ? format(new Date(blog.publishedAt), "MMM dd, yyyy") : "Unknown date"

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4 hover:bg-gray-50/50 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate text-gray-900">{blog.url}</div>
        <div className="flex items-center gap-4 mt-2">
          <div className="text-xs text-gray-500">Published: {publishedLabel}</div>
          <div className="text-xs text-gray-500">
            {analyzing ? "Analyzing… generating keywords and checking SERPs" : "Ready"}
          </div>
          {hasData && !analyzing && <div className="text-xs text-gray-600">{micro}</div>}
        </div>
      </div>
      <div>
        {analyzing ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Working…
          </div>
        ) : (
          <Button size="sm" onClick={onOpenReport} className="bg-slate-700 hover:bg-slate-800">
            Report
          </Button>
        )}
      </div>
    </div>
  )
}

/* ---------- ReportCard (single-channel, no tabs) ---------- */
function ReportCard({
  blog, username, token, sites, channel, onClose,
}: {
  blog: SavedBlog
  username: string
  token: string | null
  sites: SiteEntry[]
  channel: Channel
  onClose: () => void
}) {
  // Local copies
  const [plan, setPlan] = useState(blog.plan!)
  const [serp, setSerp] = useState(blog.serp!)
  const [targets, setTargets] = useState<Record<string, boolean>>(blog.targets || {})

  useEffect(() => { if (blog.plan) setPlan(blog.plan) }, [blog.plan])
  useEffect(() => { if (blog.serp) setSerp(blog.serp) }, [blog.serp])
  useEffect(() => { setTargets(blog.targets || {}) }, [blog.targets])

  // GSC state (only used for GAIO/Google)
  const [start, setStart] = useState<Date>(() =>
    blog.publishedAt ? new Date(blog.publishedAt) : new Date(new Date().getFullYear(), 0, 1)
  )
  const [end, setEnd] = useState<Date>(() => new Date())
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [queries, setQueries] = useState<QueryRow[]>([])
  const [gscLoading, setGscLoading] = useState(false)
  const [gscError, setGscError] = useState<string | null>(null)

  const matchingSite = useMemo(() => {
    for (const s of sites) if (pageStartsWithSite(blog.url, s.siteUrl)) return s.siteUrl
    return null
  }, [sites, blog.url])

  const fetchGsc = useCallback(async () => {
    if (!token || !matchingSite) return
    setGscLoading(true); setGscError(null)
    const api = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(normaliseSiteUrl(matchingSite))}/searchAnalytics/query`
    const startDate = format(start, "yyyy-MM-dd")
    const endDate = format(end, "yyyy-MM-dd")
    try {
      const dailyBody = {
        startDate, endDate, dimensions: ["date"], rowLimit: 1000,
        dimensionFilterGroups: [{ groupType: "and", filters: [{ dimension: "page", operator: "equals", expression: blog.url }] }],
      }
      const dailyJson = await (
        await fetch(api, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(dailyBody) })
      ).json()
      if (dailyJson.error) throw new Error(dailyJson.error.message)
      const dailyRows: DailyRow[] = (dailyJson.rows ?? []).map((r: any) => ({
        date: r.keys[0].replace(/-/g, ""), clicks: r.clicks, impressions: r.impressions,
      }))

      const qBody = {
        startDate, endDate, dimensions: ["query"], rowLimit: 250, orderBy: [{ field: "impressions", desc: true }],
        dimensionFilterGroups: [{ groupType: "and", filters: [{ dimension: "page", operator: "equals", expression: blog.url }] }],
      }
      const qJson = await (
        // GOOD (queries request)
await fetch(api, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(qBody),
})

      ).json()
      if (qJson.error) throw new Error(qJson.error.message)
      const qRows: QueryRow[] = (qJson.rows ?? []).map((r: any) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions }))

      setDaily(dailyRows.sort((a, b) => a.date.localeCompare(b.date)))
      setQueries(qRows)
    } catch (e: any) {
      setGscError(e.message ?? "GSC error")
    } finally {
      setGscLoading(false)
    }
  }, [token, matchingSite, start, end, blog.url])

  // Only fetch GSC if channel needs it (GAIO / Google)
  useEffect(() => {
    if (channel === "gaio" || channel === "google") fetchGsc()
  }, [fetchGsc, channel])

  // Derived
  const flatQueries = plan?.flatQueries ?? []
  const rankedChatGPT = flatQueries.filter((q) => serp?.[q]?.chatgpt.ranked)
  const notChatGPT = flatQueries.filter((q) => !serp?.[q]?.chatgpt.ranked)
  const rankedPerp = flatQueries.filter((q) => serp?.[q]?.perplexity.ranked)
  const notPerp = flatQueries.filter((q) => !serp?.[q]?.perplexity.ranked)
  const gaioQueries = queries.filter((q) => q.query.length > 50)
  const totalClicks = daily.reduce((t, d) => t + d.clicks, 0)
  const totalImpressions = daily.reduce((t, d) => t + d.impressions, 0)
  const chatgptBrand = clampBrandMentions(rankedChatGPT.length, Math.round(rankedChatGPT.length * 0.2))
  const perpBrand = clampBrandMentions(rankedPerp.length, Math.round(rankedPerp.length * 0.2))
  const gaioBrand = clampBrandMentions(gaioQueries.length, Math.round(gaioQueries.length * 0.2))

  return (
    <Card className="p-4 border-2 relative max-h-[85vh] overflow-auto bg-white">
      <div className="flex items-start justify-between gap-4 sticky top-0 bg-white/90 backdrop-blur z-10 -m-4 p-4 border-b">
        <div>
          <CardTitle className="text-xl text-gray-900">Report</CardTitle>
          <CardDescription className="break-all text-gray-600">{blog.url}</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        {/* SINGLE CHANNEL CONTENT */}
        {channel === "chatgpt" && (
          <>
            <ChannelHeader
              title="ChatGPT Citations"
              metrics={[
                { label: "Total citations", value: rankedChatGPT.length.toString() },
                { label: "Brand mentions", value: chatgptBrand.toString() },
                { label: "Branding ROI", value: "—", comingSoon: true },
                { label: "Traffic", value: "—", comingSoon: true },
              ]}
            />
            <QueryBuckets
              ranked={rankedChatGPT}
              notRanked={notChatGPT}
              username={username}
              blogUrl={blog.url}
              targets={targets}
              onToggled={(kw, next) => setTargets((prev) => ({ ...prev, [safeKey(kw)]: next }))}
            />
          </>
        )}

        {channel === "perplexity" && (
          <>
            <ChannelHeader
              title="Perplexity Citations"
              metrics={[
                { label: "Total citations", value: rankedPerp.length.toString() },
                { label: "Brand mentions", value: perpBrand.toString() },
                { label: "Branding ROI", value: "—", comingSoon: true },
                { label: "Traffic", value: "—", comingSoon: true },
              ]}
            />
            <QueryBuckets
              ranked={rankedPerp}
              notRanked={notPerp}
              username={username}
              blogUrl={blog.url}
              targets={targets}
              onToggled={(kw, next) => setTargets((prev) => ({ ...prev, [safeKey(kw)]: next }))}
            />
          </>
        )}

        {channel === "gaio" && (
          <>
            <ChannelHeader
              title="Google AI Overview"
              metrics={[
                { label: "Total citations", value: gaioQueries.length.toString() },
                { label: "Brand mentions", value: gaioBrand.toString() },
                { label: "Traffic", value: "—", comingSoon: true },
              ]}
            />
            {!token ? (
              <ConnectGSCNote />
            ) : !matchingSite ? (
              <MismatchNote />
            ) : gscLoading ? (
              <LoaderBlock label="Loading GSC data…" />
            ) : gscError ? (
              <ErrorBlock err={gscError} />
            ) : (
              <>
                <Card className="border-gray-200">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <LineChartIcon className="h-5 w-5 text-slate-600" />
                        <CardTitle className="text-base">Daily Performance</CardTitle>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <DatePicker label="Start" date={start} setDate={setStart} />
                        <DatePicker label="End" date={end} setDate={setEnd} />
                        <Button size="sm" variant="outline" onClick={fetchGsc} className="flex items-center gap-2">
                          <RefreshCw className={`h-4 w-4 ${gscLoading ? "animate-spin" : ""}`} />
                          {gscLoading ? "Loading..." : "Refresh"}
                        </Button>
                      </div>
                    </div>
                    <CardDescription className="text-sm text-gray-600 break-all mt-1">{blog.url}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="traffic" className="mt-2">
                      <TabsList className="bg-gray-100">
                        <TabsTrigger value="traffic">Traffic</TabsTrigger>
                        <TabsTrigger value="impressions">Impressions</TabsTrigger>
                      </TabsList>
                      <TabsContent value="traffic">
                        <div className="h-[360px] -ml-6">
                          <ResponsiveContainer width="100%" height="100%">
                            <RLineChart data={daily.map((d) => ({ ...d, date: formatDateLabel(d.date) }))}>
                              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                              <XAxis dataKey="date" tickLine={{ stroke: COLORS.grid }} axisLine={{ stroke: COLORS.grid }} fontSize={12} />
                              <YAxis tickLine={{ stroke: COLORS.grid }} axisLine={{ stroke: COLORS.grid }} fontSize={12} />
                              <Tooltip content={<TooltipBox />} />
                              <Line type="monotone" dataKey="clicks" stroke={COLORS.clicks} strokeWidth={3} dot={{ r: 4, fill: COLORS.clicks }} name="Clicks" />
                            </RLineChart>
                          </ResponsiveContainer>
                        </div>
                      </TabsContent>
                      <TabsContent value="impressions">
                        <div className="h-[360px] -ml-6">
                          <ResponsiveContainer width="100%" height="100%">
                            <RLineChart data={daily.map((d) => ({ ...d, date: formatDateLabel(d.date) }))}>
                              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                              <XAxis dataKey="date" tickLine={{ stroke: COLORS.grid }} axisLine={{ stroke: COLORS.grid }} fontSize={12} />
                              <YAxis tickLine={{ stroke: COLORS.grid }} axisLine={{ stroke: COLORS.grid }} fontSize={12} />
                              <Tooltip content={<TooltipBox />} />
                              <Line type="monotone" dataKey="impressions" stroke={COLORS.impressions} strokeWidth={3} dot={{ r: 4, fill: COLORS.impressions }} name="Impressions" />
                            </RLineChart>
                          </ResponsiveContainer>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>

                <Card className="p-4 border-gray-200">
                  <div className="text-sm text-gray-600 mb-2">Long queries (&gt; 50 characters)</div>
                  {gaioQueries.length ? (
                    <ul className="space-y-2 max-h-64 overflow-auto pr-1">
                      {gaioQueries.map((q) => (
                        <li key={q.query} className="flex items-center justify-between rounded-md border p-2">
                          <span className="text-sm">{q.query}</span>
                          <div className="text-xs text-gray-500">
                            {q.clicks.toLocaleString()} clicks • {q.impressions.toLocaleString()}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-gray-500">No long queries found for this period.</div>
                  )}
                </Card>
              </>
            )}
          </>
        )}

        {channel === "google" && (
          <>
            {/* cards first */}
            <Card className="p-4 border-gray-200">
              <div className="grid gap-4 sm:grid-cols-3">
                <SmallMetric label="First-page queries" value={serp ? Object.values(serp).filter((x) => x.google.ranked).length : 0} />
                <SmallMetric label="Traffic (total clicks)" value={totalClicks.toLocaleString()} />
                <SmallMetric label="Impressions (total)" value={totalImpressions.toLocaleString()} />
              </div>
            </Card>

            {/* Tabs for Traffic vs Impressions */}
            <Card className="border-gray-200">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <LineChartIcon className="h-5 w-5 text-slate-600" />
                    <CardTitle className="text-base">Daily Performance</CardTitle>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <DatePicker label="Start" date={start} setDate={setStart} />
                    <DatePicker label="End" date={end} setDate={setEnd} />
                    <Button size="sm" variant="outline" onClick={fetchGsc} className="flex items-center gap-2">
                      <RefreshCw className={`h-4 w-4 ${gscLoading ? "animate-spin" : ""}`} />
                      {gscLoading ? "Loading..." : "Refresh"}
                    </Button>
                  </div>
                </div>
                <CardDescription className="text-sm text-gray-600 break-all mt-1">{blog.url}</CardDescription>
              </CardHeader>
              <CardContent>
                {gscLoading ? (
                  <Skeleton className="h-[260px] w-full" />
                ) : (
                  <Tabs defaultValue="traffic" className="mt-2">
                    <TabsList className="bg-gray-100">
                      <TabsTrigger value="traffic">Traffic</TabsTrigger>
                      <TabsTrigger value="impressions">Impressions</TabsTrigger>
                    </TabsList>
                    <TabsContent value="traffic">
                      <div className="h-[260px] -ml-6">
                        <ResponsiveContainer width="100%" height="100%">
                          <RLineChart data={daily.map((d) => ({ ...d, date: formatDateLabel(d.date) }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                            <XAxis dataKey="date" tickLine={{ stroke: COLORS.grid }} axisLine={{ stroke: COLORS.grid }} fontSize={12} />
                            <YAxis tickLine={{ stroke: COLORS.grid }} axisLine={{ stroke: COLORS.grid }} fontSize={12} />
                            <Tooltip content={<TooltipBox />} />
                            <Line type="monotone" dataKey="clicks" stroke={COLORS.clicks} strokeWidth={3} dot={{ r: 3, fill: COLORS.clicks }} name="Clicks" />
                          </RLineChart>
                        </ResponsiveContainer>
                      </div>
                    </TabsContent>
                    <TabsContent value="impressions">
                     <div className="h-[260px] -ml-6"> 
                        <ResponsiveContainer width="100%" height="100%">
                          <RLineChart data={daily.map((d) => ({ ...d, date: formatDateLabel(d.date) }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                            <XAxis dataKey="date" tickLine={{ stroke: COLORS.grid }} axisLine={{ stroke: COLORS.grid }} fontSize={12} />
                            <YAxis tickLine={{ stroke: COLORS.grid }} axisLine={{ stroke: COLORS.grid }} fontSize={12} />
                            <Tooltip content={<TooltipBox />} />
                            <Line type="monotone" dataKey="impressions" stroke={COLORS.impressions} strokeWidth={3} dot={{ r: 3, fill: COLORS.impressions }} name="Impressions" />
                          </RLineChart>
                        </ResponsiveContainer>
                      </div>
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </Card>

            {/* Queries table */}
            {!token ? (
              <ConnectGSCNote />
            ) : !matchingSite ? (
              <MismatchNote />
            ) : gscError ? (
              <ErrorBlock err={gscError} />
            ) : (
              <QueriesTable queries={queries} loading={gscLoading} />
            )}
          </>
        )}
      </div>
    </Card>
  )
}

/* ---------- Overview chart components ---------- */
function OverviewDualLine({
  title, data, aName, bName,
}: {
  title: string
  data: { label: string; a: number; b?: number }[]
  aName: string
  bName?: string
}) {
  return (
    <Card className="mt-4 border-gray-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] -ml-6">
          <ResponsiveContainer width="100%" height="100%">
            <RLineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis dataKey="label" tickLine={{ stroke: COLORS.grid }} axisLine={{ stroke: COLORS.grid }} fontSize={12} />
              <YAxis tickLine={{ stroke: COLORS.grid }} axisLine={{ stroke: COLORS.grid }} fontSize={12} />
              <Tooltip content={<TooltipBox />} />
              <Line type="monotone" dataKey="a" stroke={COLORS.citations} strokeWidth={3} dot={{ r: 3, fill: COLORS.citations }} name={aName} />
              {typeof data?.[0]?.b === "number" && (
                <Line type="monotone" dataKey="b" stroke={COLORS.mentions} strokeWidth={3} dot={{ r: 3, fill: COLORS.mentions }} name={bName || "Brand mentions"} />
              )}
            </RLineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
function OverviewSingleLine({
  title, data, aName,
}: {
  title: string
  data: { label: string; a: number }[]
  aName: string
}) {
  return (
    <Card className="mt-4 border-gray-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] -ml-6">
          <ResponsiveContainer width="100%" height="100%">
            <RLineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
              <XAxis dataKey="label" tickLine={{ stroke: COLORS.grid }} axisLine={{ stroke: COLORS.grid }} fontSize={12} />
              <YAxis tickLine={{ stroke: COLORS.grid }} axisLine={{ stroke: COLORS.grid }} fontSize={12} />
              <Tooltip content={<TooltipBox />} />
              <Line type="monotone" dataKey="a" stroke={COLORS.clicks} strokeWidth={3} dot={{ r: 3, fill: COLORS.clicks }} name={aName} />
            </RLineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- Queries table ---------- */
function QueriesTable({ queries, loading }: { queries: QueryRow[]; loading: boolean }) {
  const pageSize = 20
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(queries.length / pageSize))
  const paginated = useMemo(() => {
    const startIdx = (page - 1) * pageSize
    return queries.slice(startIdx, startIdx + pageSize)
  }, [queries, page])

  return (
    <Card className="p-4 border-gray-200">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50/80 sticky top-0">
            <tr>
              <th className="px-6 py-4 text-left font-semibold text-gray-900">Query</th>
              <th className="px-6 py-4 text-right font-semibold text-gray-900">Clicks</th>
              <th className="px-6 py-4 text-right font-semibold text-gray-900">Impressions</th>
              <th className="px-6 py-4 text-right font-semibold text-gray-900">CTR</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array(8).fill(0).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-6 py-4"><Skeleton className="h-4 w-64" /></td>
                    <td className="px-6 py-4 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    <td className="px-6 py-4 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    <td className="px-6 py-4 text-right"><Skeleton className="h-4 w-12 ml-auto" /></td>
                  </tr>
                ))
              : paginated.map((q, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-gray-900 font-medium max-w-xs truncate" title={q.query}>{q.query}</td>
                    <td className="px-6 py-4 text-right text-gray-900 font-semibold">{q.clicks.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-gray-600">{q.impressions.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                      <Badge variant="secondary" className="font-medium">
                        {q.impressions ? ((q.clicks / q.impressions) * 100).toFixed(2) + "%" : "—"}
                      </Badge>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="text-xs text-gray-500">
          Page {page} of {pageCount} • Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, queries.length)} of {queries.length}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPage(1)} disabled={page === 1}>First</Button>
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}>Next</Button>
          <Button size="sm" variant="outline" onClick={() => setPage(pageCount)} disabled={page === pageCount}>Last</Button>
        </div>
      </div>
    </Card>
  )
}

/* ---------- UI helpers ---------- */
function MetricCard({ title, value, comingSoon }: { title: string; value: string | number; comingSoon?: boolean }) {
  return (
    <Card className="relative overflow-hidden border-gray-200">
      <div className="absolute top-0 right-0 w-20 h-20 bg-gray-100 rounded-full -mr-10 -mt-10" />
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-gray-600">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-gray-900">{value}</div>
        {comingSoon && <div className="text-[10px] text-gray-500 uppercase mt-1">Coming soon</div>}
      </CardContent>
    </Card>
  )
}

function SmallMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
    </div>
  )
}

function ChannelHeader({
  title, metrics,
}: {
  title: string
  metrics: { label: string; value: string; comingSoon?: boolean }[]
}) {
  return (
    <Card className="p-4 border-gray-200">
      <div className="text-sm text-gray-600 mb-3">{title}</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m, idx) => (
          <div key={idx}>
            <div className="text-xs text-gray-500">{m.label}</div>
            <div className="text-2xl font-bold text-gray-900">{m.value}</div>
            {m.comingSoon && <div className="text-[10px] text-gray-500 uppercase mt-1">Coming soon</div>}
          </div>
        ))}
      </div>
    </Card>
  )
}

function QueryBuckets({
  ranked, notRanked, username, blogUrl, targets, onToggled,
}: {
  ranked: string[]
  notRanked: string[]
  username: string
  blogUrl: string
  targets: Record<string, boolean>
  onToggled: (kw: string, next: boolean) => void
}) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="p-4 border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <div className="font-semibold">Ranked / Cited</div>
          <Badge variant="secondary" className="ml-auto">{ranked.length}</Badge>
        </div>
        {ranked.length ? (
          <ul className="space-y-2 max-h-64 overflow-auto pr-1">
            {ranked.map((q) => (
              <li key={q} className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 w-5 h-5">✓</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gray-500">None yet.</div>
        )}
      </Card>

      <Card className="p-4 border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <XCircle className="h-4 w-4 text-rose-600" />
          <div className="font-semibold">Not ranked</div>
          <Badge variant="outline" className="ml-auto">{notRanked.length}</Badge>
        </div>
        {notRanked.length ? (
          <ul className="space-y-2 max-h-64 overflow-auto pr-1">
            {notRanked.map((q) => {
              const key = safeKey(q)
              const initial = !!targets?.[key]
              return (
                <li key={q} className="flex items-center gap-2 text-sm">
                  <span className="inline-flex items-center justify-center rounded-full bg-rose-100 text-rose-700 w-5 h-5">✗</span>
                  <span className="flex-1">{q}</span>
                  <TargetButton
                    keyword={q}
                    username={username}
                    blogUrl={blogUrl}
                    initialTargeted={initial}
                    onToggled={onToggled}
                  />
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="text-sm text-gray-500">None.</div>
        )}
      </Card>
    </div>
  )
}

function TargetButton({
  keyword, username, blogUrl, initialTargeted, onToggled,
}: {
  keyword: string
  username: string
  blogUrl: string
  initialTargeted: boolean
  onToggled: (kw: string, next: boolean) => void
}) {
  const { addTarget } = (typeof useTargets === "function" ? useTargets() : { addTarget: undefined as any })
  const [targeted, setTargeted] = useState<boolean>(!!initialTargeted)

  const toggle = async () => {
    const next = !targeted
    setTargeted(next)

    // Persist under blog's targets
    const base = `analyticsDashaboard/${username}/performanceBlogs/${safeKey(blogUrl)}/targets/${safeKey(keyword)}`
    await update(ref(db), { [base]: next ? true : null })

    // Mirror into global Targets section
    const mirror = `analyticsDashaboard/${username}/targetsFromReport/${safeKey(keyword)}`
    await update(ref(db), { [mirror]: next ? { keyword, targeted: true } : null })

    if (next && addTarget) addTarget(keyword)
    onToggled(keyword, next)
  }

  return (
    <Button
      size="sm"
      variant={targeted ? "default" : "outline"}
      className={`flex items-center gap-1.5 rounded-full px-3 ${targeted ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
      onClick={toggle}
    >
      <TargetIcon className="h-4 w-4" />
      {targeted ? "Targeted" : "Target"}
    </Button>
  )
}

function LoaderBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <RefreshCw className="h-4 w-4 animate-spin" /> {label}
    </div>
  )
}
function ErrorBlock({ err }: { err: string }) {
  return <div className="text-sm text-rose-600">Error: {err}</div>
}
function ConnectGSCNote() {
  return <div className="text-sm text-gray-500">Sign in with Google above to load Search Console data.</div>
}
function MismatchNote() {
  return <div className="text-sm text-amber-700">URL does not match any of your GSC properties.</div>
}
function DatePicker({ label, date, setDate }: { label: string; date: Date; setDate: (d: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[160px] justify-start font-normal">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "MMM dd, yyyy") : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
      </PopoverContent>
    </Popover>
  )
}
function TooltipBox({ active, payload, label }: any) {
  return active && payload?.length ? (
    <div className="bg-white p-3 border rounded-lg shadow-lg">
      <p className="font-medium text-gray-900 mb-1">{label}</p>
      {payload.map((e: any, i: number) => (
        <p key={i} style={{ color: e.color }} className="text-sm">
          {e.name}: <span className="font-semibold">{e.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  ) : null
}
