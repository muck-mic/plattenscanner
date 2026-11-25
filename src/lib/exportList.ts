import type { SavedRecord } from './store'

const today = () => new Date().toISOString().slice(0, 10)

/** Semicolon-separated with BOM, so Excel and Numbers in German open it with umlauts and columns intact. */
export function toCsv(records: SavedRecord[]) {
  const header = [
    'Künstler', 'Titel', 'Label', 'Kat.-Nr.', 'Land', 'Jahr', 'Format', 'Zustand Platte', 'Zustand Hülle', 'Notiz',
    'Matrix gelesen', 'Matrix-Übereinstimmung', 'In Discogs-Sammlung', 'Discogs-Link', 'Release-ID', 'Hinzugefügt',
  ]
  const rows = records.map((r) => [
    r.artist, r.title, r.label, r.catno, r.country, r.year, r.format, r.mediaCondition, r.sleeveCondition, r.notes,
    r.matrixRead.join(' | '), r.matrixScore === null ? '' : `${Math.round(r.matrixScore * 100)} %`,
    r.discogsInstanceId ? 'ja' : 'nein', r.discogsUrl, String(r.releaseId), r.addedAt.slice(0, 10),
  ])
  const cell = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return '﻿' + [header, ...rows].map((row) => row.map((v) => cell(v ?? '')).join(';')).join('\r\n')
}

export function toBackup(records: SavedRecord[]) {
  return JSON.stringify({ app: 'plattenscanner', version: 1, exportedAt: new Date().toISOString(), records }, null, 2)
}

export function parseBackup(text: string): SavedRecord[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Die Datei ist keine gültige Sicherung.')
  }
  const records = (data as { app?: string; records?: unknown })?.records
  if ((data as { app?: string })?.app !== 'plattenscanner' || !Array.isArray(records))
    throw new Error('Die Datei ist keine Sicherung vom Plattenscanner.')
  return records
    .filter((r): r is SavedRecord => typeof r?.id === 'string' && typeof r?.releaseId === 'number' && typeof r?.title === 'string')
    .map((r) => ({
      ...r,
      matrixRead: Array.isArray(r.matrixRead) ? r.matrixRead : [],
      matrixScore: typeof r.matrixScore === 'number' ? r.matrixScore : null,
      discogsInstanceId: typeof r.discogsInstanceId === 'number' ? r.discogsInstanceId : null,
    }))
}

/** Hands the file to the iPhone share sheet (save to Files, AirDrop, mail …); falls back to a download. */
export async function shareFile(content: string, name: string, type: string) {
  const file = new File([content], name, { type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // user closed the sheet
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const csvName = () => `plattenliste-${today()}.csv`
export const backupName = () => `plattenscanner-sicherung-${today()}.json`
