"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Loader2,
  ArrowLeft,
  Search,
  LinkIcon,
  ExternalLink,
  Building,
  CheckCircle,
  XCircle,
  Target,
  BarChart3,
  MessageSquare,
  TrendingUp,
} from "lucide-react"

interface ApiResp {
  chatgptAnswer:    string
  perplexityAnswer: string
  googleAIAnswer:   string
  brandMentioned:   boolean
  intentHigh:       boolean
  performance:      number
}

export default function ReportPage() {
  const params        = useSearchParams()
  const kw            = params.get("kw")    ?? ""
  const link          = params.get("link")  ?? ""
  const brand         = params.get("brand") ?? ""
  const scoreOverride = params.get("score")

  const [data, setData]     = useState<ApiResp | null>(null)
  const [loading, setLoading] = useState(true)

  /* ───────── fetch backend ───────── */
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/gen-report", {
          method: "POST",
          body: JSON.stringify({ query: kw, link, brand }),
        }).then((r) => r.json())

        if (res.success) {
          const d: ApiResp = res.data
          if (scoreOverride) d.performance = Number(scoreOverride)
          setData(d)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [kw, link, brand, scoreOverride])

  /* ───────── loading / error states ───────── */
  if (loading)
    return (
      <CenteredCard>
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
        <h3 className="text-lg font-semibold">Generating Report</h3>
        <p className="text-sm text-muted-foreground">
          Gathering AI responses…
        </p>
      </CenteredCard>
    )

  if (!data)
    return (
      <CenteredCard variant="error">
        <XCircle className="h-12 w-12 text-red-500" />
        <h3 className="text-lg font-semibold text-red-700">
          Report Generation Failed
        </h3>
        <p className="text-sm text-muted-foreground">
          Unable to generate the report. Please try again.
        </p>
        <BackBtn />
      </CenteredCard>
    )

  /* ───────── helpers ───────── */
  const perfColor =
    data.performance >= 80
      ? "text-green-600"
      : data.performance >= 60
      ? "text-yellow-600"
      : "text-red-600"
  const perfLabel =
    data.performance >= 80
      ? "Excellent"
      : data.performance >= 60
      ? "Good"
      : "Needs Improvement"

  const googleSEO = `**SEO Checklist for "${kw}"**

- Keyword in H1 + first paragraph  
- 140‑160 char meta description with CTA  
- Descriptive image alt‑text  
- Internal link from /blog/security‑guide  
- LCP < 2 s (Core Web Vitals)`

  /* ───────── render ───────── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="space-y-2">
          <BackBtn />
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
            Query Performance Report
          </h1>
          <p className="text-lg text-muted-foreground">
            Detailed analysis of your keyword performance
          </p>
        </header>

        {/* Metric cards */}
        <MetricGrid
          brandMentioned={data.brandMentioned}
          intentHigh={data.intentHigh}
          performance={data.performance}
          perfColor={perfColor}
          perfLabel={perfLabel}
        />

        {/* Query details */}
        <QueryDetails
          kw={kw}
          brand={brand}
          link={link}
          performance={data.performance}
          perfLabel={perfLabel}
        />

        {/* AI Answers */}
        <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-t-lg border-b border-blue-200">
            <CardTitle className="text-2xl font-bold text-blue-800 flex items-center gap-2">
              <MessageSquare className="h-6 w-6" /> AI Response Analysis
            </CardTitle>
            <p className="text-sm text-blue-600 mt-1">
              Multi‑source answers for the analysed query
            </p>
          </CardHeader>

          <CardContent className="p-6">
            <Tabs defaultValue="chatgpt">
              <TabsList className="mb-4">
                <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
                <TabsTrigger value="perplexity">Perplexity</TabsTrigger>
                <TabsTrigger value="googleai">Google AI Overview</TabsTrigger>
                <TabsTrigger value="googleseo">Google SEO</TabsTrigger>
              </TabsList>

              <TabsContent value="chatgpt">
                <AnswerBlock text={data.chatgptAnswer} />
              </TabsContent>
              <TabsContent value="perplexity">
                <AnswerBlock text={data.perplexityAnswer} />
              </TabsContent>
              <TabsContent value="googleai">
                <AnswerBlock text={data.googleAIAnswer} />
              </TabsContent>
              <TabsContent value="googleseo">
                <AnswerBlock text={googleSEO} markdown />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-center gap-4 pt-4">
          <BackBtn variant="outline" />
          <Button
            size="lg"
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Optimize Performance
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ───────── sub‑components ───────── */

function CenteredCard({
  children,
  variant,
}: {
  children: React.ReactNode
  variant?: "error"
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
      <Card
        className={`w-96 shadow-xl border-0 bg-white/80 backdrop-blur-sm ${
          variant === "error" ? "border-red-200" : ""
        }`}
      >
        <CardContent className="flex flex-col items-center justify-center p-8 space-y-4">
          {children}
        </CardContent>
      </Card>
    </div>
  )
}

function BackBtn({ variant = "ghost" }: { variant?: "ghost" | "outline" }) {
  return (
    <Link href="/" passHref>
      <Button variant={variant} className="flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Button>
    </Link>
  )
}

function MetricGrid({
  brandMentioned,
  intentHigh,
  performance,
  perfColor,
  perfLabel,
}: {
  brandMentioned: boolean
  intentHigh: boolean
  performance: number
  perfColor: string
  perfLabel: string
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <SmallCard
        title="Citation Status"
        icon={<CheckCircle className="h-4 w-4 text-blue-600" />}
        value="Cited"
        subtitle="Link found in response"
        color="blue"
      />
      <SmallCard
        title="Brand Mention"
        icon={
          <Building
            className={`h-4 w-4 ${
              brandMentioned ? "text-green-600" : "text-red-600"
            }`}
          />
        }
        value={brandMentioned ? "Yes" : "No"}
        subtitle={brandMentioned ? "Brand is mentioned" : "Brand not mentioned"}
        color={brandMentioned ? "green" : "red"}
      />
      <SmallCard
        title="Intent Level"
        icon={
          <Target
            className={`h-4 w-4 ${
              intentHigh ? "text-purple-600" : "text-gray-600"
            }`}
          />
        }
        value={intentHigh ? "High" : "Low"}
        subtitle={
          intentHigh ? "High‑intent placement" : "Low‑intent placement"
        }
        color={intentHigh ? "purple" : "gray"}
      />
      <SmallCard
        title="Performance Score"
        icon={<BarChart3 className="h-4 w-4 text-orange-600" />}
        value={`${performance}%`}
        subtitle={perfLabel}
        color="orange"
        valueClass={perfColor}
      />
    </div>
  )
}

function SmallCard({
  title,
  icon,
  value,
  subtitle,
  color,
  valueClass = "",
}: {
  title: string
  icon: React.ReactNode
  value: string
  subtitle: string
  color: string
  valueClass?: string
}) {
  const bg     = `from-${color}-50 to-${color}-100`
  const border = `border-${color}-200`
  const textT  = `text-${color}-700`
  const textS  = `text-${color}-600`
  return (
    <Card className={`bg-gradient-to-br ${bg} ${border}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className={`text-sm font-medium ${textT}`}>{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
        <p className={`text-xs ${textS} mt-1`}>{subtitle}</p>
      </CardContent>
    </Card>
  )
}

function QueryDetails({
  kw,
  brand,
  link,
  performance,
  perfLabel,
}: {
  kw: string
  brand: string
  link: string
  performance: number
  perfLabel: string
}) {
  return (
    <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
      <CardHeader className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-t-lg">
        <CardTitle className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Search className="h-6 w-6" /> Query Analysis
        </CardTitle>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <InfoBlock label="Search Query" value={kw} />
          <InfoBlock label="Brand Domain" value={brand} />
          <InfoBlock
            label="Cited Link"
            value={
              link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <LinkIcon className="h-4 w-4" />
                  <span className="truncate font-medium">{link}</span>
                  <ExternalLink className="h-4 w-4 flex-shrink-0" />
                </a>
              ) : (
                "—"
              )
            }
          />
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
              Overall Performance
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Performance Score
                </span>
                <Badge
                  variant={
                    performance >= 80
                      ? "default"
                      : performance >= 60
                      ? "secondary"
                      : "destructive"
                  }
                >
                  {perfLabel}
                </Badge>
              </div>
              <Progress value={performance} className="h-3" />
              <p className="text-xs text-muted-foreground">{performance}%</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function InfoBlock({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
        {label}
      </label>
      <div className="p-3 bg-slate-50 rounded-lg border">
        {typeof value === "string" ? (
          <p className="font-medium text-slate-800">{value}</p>
        ) : (
          value
        )}
      </div>
    </div>
  )
}

function AnswerBlock({
  text,
  markdown = false,
}: {
  text: string
  markdown?: boolean
}) {
  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-6 border border-slate-200">
      {markdown ? (
        <div
          className="prose prose-sm"
          dangerouslySetInnerHTML={{
            __html: text
              .replace(/\n/g, "<br/>")
              .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
          }}
        />
      ) : (
        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 font-mono">
          {text}
        </pre>
      )}
    </div>
  )
}
