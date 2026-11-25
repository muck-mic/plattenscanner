import { useCallback, useState } from 'react'
import type { ModelChoice } from './recognize'

// Settings live only in this browser's localStorage on the user's device.
export interface Settings {
  discogsToken: string
  discogsUsername: string
  anthropicKey: string
  aiModel: ModelChoice
  aiEnabled: boolean
  // Spend tracking for the current month (USD, computed from token usage).
  costMonth: string
  costUsd: number
  costScans: number
  // Where "Speichern" puts a record; the last choice is remembered.
  saveDiscogs: boolean
  saveLocal: boolean
  discogsFolderId: number
}

const KEY = 'plattenscanner.settings.v1'
const DEFAULTS: Settings = {
  discogsToken: '',
  discogsUsername: '',
  anthropicKey: '',
  aiModel: 'claude-opus-5-5',
  aiEnabled: true,
  costMonth: '',
  costUsd: 0,
  costScans: 0,
  saveDiscogs: true,
  saveLocal: true,
  discogsFolderId: 1,
}

export const currentMonth = () => new Date().toISOString().slice(0, 7)

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

export function useSettings() {
  const [settings, setState] = useState<Settings>(load)
  const update = useCallback((patch: Partial<Settings> | ((prev: Settings) => Partial<Settings>)) => {
    setState((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])
  return [settings, update] as const
}

export type UpdateSettings = ReturnType<typeof useSettings>[1]

/** Adds one AI scan to this month's counter (resets when a new month starts). */
export function addCost(prev: Settings, usd: number): Partial<Settings> {
  const month = currentMonth()
  const same = prev.costMonth === month
  return { costMonth: month, costUsd: (same ? prev.costUsd : 0) + usd, costScans: (same ? prev.costScans : 0) + 1 }
}

export function formatUsd(usd: number) {
  return usd.toLocaleString('de-DE', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: usd < 1 ? 3 : 2 })
}
