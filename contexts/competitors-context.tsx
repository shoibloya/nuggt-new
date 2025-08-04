"use client"
import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
} from "react"

/* ---------- types ---------- */
export interface Competitor {
  domain:     string
  loading:    boolean
  ranked:     string[]
  notRanked:  string[]
}

/* ---------- ctx ---------- */
interface Ctx {
  list: Competitor[]
  addCompetitor: (url: string) => void
}

const CompetitorsCtx = createContext<Ctx | null>(null)

/* ---------- GPT + random ranking helpers ---------- */
async function fetchIcps(payload: { url: string }) {
  const res = await fetch("/api/keywords", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => r.json())
  if (!res.success) throw new Error(res.error ?? "Unknown error")
  return res.data as { icps: { problems: string[] }[] }
}

export function CompetitorsProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Competitor[]>([])

  const addCompetitor = async (url: string) => {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, "")
      if (list.some((c) => c.domain === domain)) return
      // optimistic skeleton
      setList((l) => [
        ...l,
        { domain, loading: true, ranked: [], notRanked: [] },
      ])

      const icpRes  = await fetchIcps({ url })
      const queries = Array.from(
        new Set(icpRes.icps.flatMap((i) => i.problems))
      ).slice(0, 40)

      const ranked: string[]    = []
      const notRanked: string[] = []
      for (const q of queries) {
        Math.random() < 0.7 ? ranked.push(q) : notRanked.push(q)
      }

      setList((l) =>
        l.map((c) =>
          c.domain === domain
            ? { domain, loading: false, ranked, notRanked }
            : c
        )
      )
    } catch (err) {
      console.error(err)
    }
  }

  const value = useMemo(() => ({ list, addCompetitor }), [list])

  return (
    <CompetitorsCtx.Provider value={value}>
      {children}
    </CompetitorsCtx.Provider>
  )
}

export function useCompetitors() {
  const ctx = useContext(CompetitorsCtx)
  if (!ctx) throw new Error("useCompetitors must be inside provider")
  return ctx
}
