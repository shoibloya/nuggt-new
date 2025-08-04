// contexts/targets-context.tsx
"use client"

import {
  createContext,
  useContext,
  useCallback,
  useState,
  type ReactNode,
} from "react"
import { v4 as uuid } from "uuid"

/* ---------- types ---------- */
export type TargetStatus =
  | "Generating"
  | "Human Edits"
  | "Ready for Review"
  | "Rectifying feedback"
  | "Published"

export interface Target {
  key: string
  keyword: string
  outline: string
  status: TargetStatus
  deadline: string            // YYYY‑MM‑DD
}

/* ---------- context ---------- */
interface Ctx {
  list: Target[]
  addTarget:  (keyword: string) => void
  updateTarget: (key: string, patch: Partial<Target>) => void
}

const TargetsCtx = createContext<Ctx | null>(null)

/* ---------- provider ---------- */
export function TargetsProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Target[]>([])

  /* add a brand‑new target (deduped by keyword) */
  const addTarget = useCallback((keyword: string) => {
    setList((prev) => {
      if (prev.some((t) => t.keyword === keyword)) return prev
      return [
        ...prev,
        {
          key: uuid(),
          keyword,
          outline: "",
          status: "Generating",
          deadline: new Date().toISOString().split("T")[0],
        },
      ]
    })
  }, [])

  /* patch an existing target */
  const updateTarget = useCallback((key: string, patch: Partial<Target>) => {
    setList((prev) =>
      prev.map((t) => (t.key === key ? { ...t, ...patch } : t)),
    )
  }, [])

  return (
    <TargetsCtx.Provider value={{ list, addTarget, updateTarget }}>
      {children}
    </TargetsCtx.Provider>
  )
}

/* ---------- hook ---------- */
export function useTargets() {
  const ctx = useContext(TargetsCtx)
  if (!ctx) throw new Error("useTargets must be used inside <TargetsProvider>")
  return ctx
}
