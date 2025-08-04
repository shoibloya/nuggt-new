"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Search,
  Shield,
  FileText,
  Zap,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react"
import { motion } from "framer-motion"

const clusters = [
  {
    title: "Definitions & Fundamentals",
    items: ["adversarial prompts", "what are adversarial prompts in generative AI"],
    ranking: ["1", "1"],
    icon: <FileText className="h-5 w-5" />,
  },
  {
    title: "Detection & Bypassing",
    items: [
      "how to detect adversarial prompts",
      "adversarial prompts detection techniques",
      "embedding similarity for adversarial prompts",
      "pattern matching for adversarial prompts",
      "how adversarial prompts bypass AI rules",
    ],
    ranking: ["1", "1", "1", "1", "1"],
    icon: <Search className="h-5 w-5" />,
  },
  {
    title: "Defense & Mitigation",
    items: [
      "defending against adversarial prompts in AI",
      "preventing adversarial prompts in AI systems",
      "adversarial prompts mitigation strategies",
      "protecting generative AI from adversarial prompts",
      "testing AI robustness against adversarial prompts",
    ],
    ranking: ["1", "1", "1", "1", "1"],
    icon: <Shield className="h-5 w-5" />,
  },
  {
    title: "Security Risks & Vulnerabilities",
    items: [
      "adversarial prompts security risks",
      "adversarial prompts and AI vulnerabilities",
      "adversarial prompts in enterprise AI applications",
    ],
    ranking: ["1", "1", "1"],
    icon: <AlertCircle className="h-5 w-5" />,
  },
  {
    title: "Comparisons",
    items: ["adversarial prompts vs jailbreak prompts"],
    ranking: ["1"],
    icon: <Layers className="h-5 w-5" />,
  },
  {
    title: "Prompt Injection",
    items: ["adversarial prompts and prompt injection attacks"],
    ranking: ["2"],
    icon: <Zap className="h-5 w-5" />,
  },
  {
    title: "Examples & Case Studies",
    items: ["examples of adversarial prompts in chatbots", "real world examples of adversarial prompts"],
    ranking: ["2", "2"],
    icon: <FileText className="h-5 w-5" />,
  },
  {
    title: "Model-Specific Contexts",
    items: ["adversarial prompts in large language models", "adversarial prompts in content generation AI"],
    ranking: ["-1", "1"],
    icon: <BarChart3 className="h-5 w-5" />,
  },
]

// Replace the existing contentPlan array with this updated version
const contentPlan = [
  {
    title: "Real-World & Chatbot Examples",
    objectives: [
      "Deep dive with 10+ anonymized chatbot logs showing adversarial inputs and model reactions.",
      "Code snippets (Python).",
      "Page length: 1,500+ words.",
    ],
    reasoning:
      "Examples & case studies keywords are currently on Page 2 (ranking position 2). Creating comprehensive real-world examples will directly target these underperforming keywords and fill this content gap.",
    relatedKeywords: ["examples of adversarial prompts in chatbots", "real world examples of adversarial prompts"],
    currentRanking: "Page 2",
  },
  {
    title: "Prompt Injection Attacks",
    objectives: [
      "Technical write-up on injection patterns, two-tier examples (e.g., hidden instructions).",
      "Mitigation code samples.",
      "Page length: 1,200+ words.",
    ],
    reasoning:
      "Prompt injection coverage is currently on Page 2 and lacks depth. This content will strengthen our position for 'adversarial prompts and prompt injection attacks' while complementing our strong defense & mitigation rankings.",
    relatedKeywords: ["adversarial prompts and prompt injection attacks"],
    currentRanking: "Page 2",
  },
  {
    title: "Adversarial Prompts in Large Language Models",
    objectives: [
      "Explain why LLMs are uniquely vulnerable (context window, chain-of-thought).",
      "Case studies (GPT-4, PaLM).",
      "Page length: 1,500+ words.",
    ],
    reasoning:
      "LLM-specific content has negative rankings (-1 for 'adversarial prompts in large language models'). This represents our biggest opportunity for improvement and addresses a critical gap in our content strategy.",
    relatedKeywords: ["adversarial prompts in large language models", "adversarial prompts in content generation AI"],
    currentRanking: "Position -1",
  },
]

// Calculate statistics
const totalKeywords = clusters.reduce((acc, cluster) => acc + cluster.items.length, 0)
const page1Rankings = clusters.reduce((acc, cluster) => {
  return acc + cluster.ranking.filter((rank) => rank === "1").length
}, 0)
const page2Rankings = clusters.reduce((acc, cluster) => {
  return acc + cluster.ranking.filter((rank) => rank === "2").length
}, 0)
const negativeRankings = clusters.reduce((acc, cluster) => {
  return acc + cluster.ranking.filter((rank) => rank.includes("-")).length
}, 0)

const rankingPercentage = Math.round((page1Rankings / totalKeywords) * 100)

export default function AdversarialSeoAnalysis() {
  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5 },
  }

  const staggerContainer = {
    animate: {
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        <motion.div className="space-y-8" initial="initial" animate="animate" variants={staggerContainer}>
          {/* Header */}
          <motion.div className="text-center space-y-4" variants={fadeIn}>
            <h1 className="text-4xl font-bold tracking-tight">Adversarial Prompts SEO Analysis</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Comprehensive keyword performance analysis and content strategy for improving visibility in the
              adversarial AI security space
            </p>
          </motion.div>

          {/* Stats Overview */}
          <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" variants={fadeIn}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Keywords</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalKeywords}</div>
                <p className="text-xs text-muted-foreground">Across 8 topic clusters</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Page 1 Rankings</CardTitle>
                <ArrowUpRight className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{page1Rankings}</div>
                <div className="flex items-center">
                  <Progress value={rankingPercentage} className="h-2 w-full" />
                  <span className="ml-2 text-xs text-muted-foreground">{rankingPercentage}%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Page 2 Rankings</CardTitle>
                <Minus className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{page2Rankings}</div>
                <p className="text-xs text-muted-foreground">Opportunity for improvement</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Negative Rankings</CardTitle>
                <ArrowDownRight className="h-4 w-4 text-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{negativeRankings}</div>
                <p className="text-xs text-muted-foreground">Requires immediate attention</p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Main Content */}
          <motion.div variants={fadeIn}>
            <Tabs defaultValue="clusters" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-8">
                <TabsTrigger value="clusters">Keyword Clusters</TabsTrigger>
                <TabsTrigger value="insights">Strengths & Weaknesses</TabsTrigger>
                <TabsTrigger value="content">Content Plan</TabsTrigger>
              </TabsList>

              {/* Keyword Clusters Tab */}
              <TabsContent value="clusters" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {clusters.map((cluster, idx) => (
                    <motion.div
                      key={cluster.title}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                    >
                      <Card className="h-full hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800">{cluster.icon}</div>
                              <CardTitle className="text-base">{cluster.title}</CardTitle>
                            </div>
                            <Badge
                              variant={
                                cluster.ranking.every((r) => r === "1")
                                  ? "default"
                                  : cluster.ranking.some((r) => r.includes("-"))
                                    ? "destructive"
                                    : "outline"
                              }
                            >
                              {cluster.ranking.every((r) => r === "1")
                                ? "Strong"
                                : cluster.ranking.some((r) => r.includes("-"))
                                  ? "Weak"
                                  : "Mixed"}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {cluster.items.map((kw, i) => (
                            <div
                              key={i}
                              className="flex justify-between items-center text-sm py-1 border-b border-slate-100 dark:border-slate-800 last:border-0"
                            >
                              <span className="truncate mr-2">{kw}</span>
                              <div className="flex items-center">
                                {cluster.ranking[i] === "1" ? (
                                  <Badge
                                    variant="success"
                                    className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100"
                                  >
                                    P1
                                  </Badge>
                                ) : cluster.ranking[i] === "2" ? (
                                  <Badge
                                    variant="outline"
                                    className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100"
                                  >
                                    P2
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive">-1</Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </TabsContent>

              {/* Strengths & Weaknesses Tab */}
              <TabsContent value="insights">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Card className="border-l-4 border-l-emerald-500">
                    <CardHeader>
                      <div className="flex items-center space-x-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <CardTitle>Strengths</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <h3 className="font-medium">Detection & Defense Dominance</h3>
                        <p className="text-sm text-muted-foreground">
                          Page 1 rankings on nearly all detection, defense, risk & enterprise queries.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-medium">High-Intent Solution Seekers</h3>
                        <p className="text-sm text-muted-foreground">
                          Capturing high-intent solution seekers ("how to detect…", "testing AI robustness").
                        </p>
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-medium">Comparative Content</h3>
                        <p className="text-sm text-muted-foreground">
                          Owns comparative angles like "vs jailbreak prompts."
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-rose-500">
                    <CardHeader>
                      <div className="flex items-center space-x-2">
                        <AlertCircle className="h-5 w-5 text-rose-500" />
                        <CardTitle>Weaknesses</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <h3 className="font-medium">Case Studies Underperforming</h3>
                        <p className="text-sm text-muted-foreground">Examples & case studies pages stuck on Page 2.</p>
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-medium">Prompt Injection Gap</h3>
                        <p className="text-sm text-muted-foreground">
                          Prompt injection coverage needs depth ("prompt injection attacks" on P2).
                        </p>
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-medium">LLM-Specific Content Missing</h3>
                        <p className="text-sm text-muted-foreground">
                          No ranking for LLM-specific content ("large language models" is –1).
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Content Plan Tab */}
              <TabsContent value="content">
                <div className="space-y-6">
                  {contentPlan.map((plan, idx) => (
                    <motion.div
                      key={plan.title}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                    >
                      <Card className="overflow-hidden">
                        <CardHeader className="bg-slate-50 dark:bg-slate-800 pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">{plan.title}</CardTitle>
                            <Badge
                              variant={plan.currentRanking.includes("-1") ? "destructive" : "outline"}
                              className="ml-2"
                            >
                              {plan.currentRanking}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="p-6">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2">
                              <h3 className="text-sm font-medium mb-3">Objectives</h3>
                              <ul className="space-y-2">
                                {plan.objectives.map((objective, i) => (
                                  <li key={i} className="flex items-start">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 mr-2 flex-shrink-0" />
                                    <span className="text-sm">{objective}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="space-y-4">
                              <div>
                                <h3 className="text-sm font-medium mb-2">Data-Driven Reasoning</h3>
                                <p className="text-sm text-muted-foreground">{plan.reasoning}</p>
                              </div>
                              <div>
                                <h3 className="text-sm font-medium mb-2">Target Keywords</h3>
                                <div className="flex flex-wrap gap-2">
                                  {plan.relatedKeywords.map((keyword, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {keyword}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
