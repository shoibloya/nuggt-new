"use client"

import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { motion } from "framer-motion"
import { Bot } from "lucide-react"

import AnalysisSection from "@/components/analysis-section"
import CompetitorsSection from "@/components/competitors-section"
import PerformanceSection from "@/components/performance-section"
import TargetsSection from "@/components/targets-section"
import { TargetsProvider } from "@/contexts/targets-context"
import { CompetitorsProvider } from "@/contexts/competitors-context"
import { ThemeToggle } from "@/components/theme-toggle"

// 🔽 NEW: imports for fetching data
import { db } from "@/lib/firebase"
import { ref, get } from "firebase/database"

// 🔽 NEW: shadcn UI button for Logout
import { Button } from "@/components/ui/button"

const tabs = [
  { id: "analysis", label: "Analysis" },
  { id: "competitors", label: "Competitors" },
  { id: "performance", label: "Performance" },
  { id: "targets", label: "Targets" },
]

// 🔽 simple cookie reader for "session"
function getCookie(name: string) {
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
  return m ? decodeURIComponent(m[2]) : null
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState(tabs[0].id)

  // 🔽 fetch user-specific analytics from RTDB once logged in
  useEffect(() => {
    const username = getCookie("session")
    if (!username) return
    ;(async () => {
      try {
        const snap = await get(ref(db, `analyticsDashaboard/${username}`)) // keep your exact path/spelling
        console.log("analyticsDashaboard data:", snap.val())
      } catch (e) {
        console.error("Failed to load user data:", e)
      }
    })()
  }, [])

  // 🔽 NEW: logout handler (clears cookie and goes to /login)
  function handleLogout() {
    document.cookie = "session=; Max-Age=0; Path=/; SameSite=Lax"
    window.location.href = "/login"
  }

  return (
    <TargetsProvider>
      <CompetitorsProvider>
        <div className="min-h-screen w-full bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-950 dark:to-black">
          <div className="max-w-7xl mx-auto p-4 md:p-8">
            <header className="flex items-center justify-between pb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-lg">
                  <Bot className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent dark:from-slate-200 dark:to-slate-400">
                    Nuggt Dashboard Demo
                  </h1>
                  <p className="text-sm text-muted-foreground">AI Visibility Analysis Dashboard</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Button variant="outline" onClick={handleLogout}>Logout</Button>
              </div>
            </header>

            <Tabs defaultValue={activeTab} className="w-full" onValueChange={setActiveTab}>
              <div className="flex justify-center">
                <TabsList className="relative grid h-12 w-full sm:w-auto sm:grid-cols-4 items-center justify-center rounded-full bg-slate-100 p-2 dark:bg-slate-800">
                  {tabs.map((tab) => (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="relative rounded-full px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      {activeTab === tab.id && (
                        <motion.span
                          layoutId="bubble"
                          className="absolute inset-0 z-10 bg-white dark:bg-slate-900/80"
                          style={{ borderRadius: 9999 }}
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <span className="relative z-20">{tab.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="pt-8">
                <TabsContent value="analysis" forceMount className="hidden data-[state=active]:block">
                  <AnalysisSection />
                </TabsContent>
                <TabsContent value="competitors">
                  <CompetitorsSection />
                </TabsContent>
                <TabsContent value="performance" forceMount className="hidden data-[state=active]:block">
                  <PerformanceSection />
                </TabsContent>
                <TabsContent value="targets">
                  <TargetsSection />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </CompetitorsProvider>
    </TargetsProvider>
  )
}
