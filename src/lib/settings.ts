import { useCallback, useState } from 'react'

// Settings live only in this browser's localStorage on the user's device.
export interface Settings {
  discogsToken: string
  discogsUsername: string
}

const KEY = 'plattenscanner.settings.v1'
const DEFAULTS: Settings = { discogsToken: '', discogsUsername: '' }

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

export function useSettings() {
  const [settings, setState] = useState<Settings>(load)
  const update = useCallback((patch: Partial<Settings>) => {
    setState((prev) => {
      const next = { ...prev, ...patch }
      localStorage.setItem(KEY, JSON.stringify(next))
      return next
    })
  }, [])
  return [settings, update] as const
}
