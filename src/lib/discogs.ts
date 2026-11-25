// Minimal Discogs API client. Personal access token auth, browser-side (Discogs sends CORS headers).
const BASE = 'https://api.discogs.com'

export class DiscogsError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  if (!token) throw new DiscogsError('Kein Discogs-Token hinterlegt. Bitte in den Einstellungen eintragen.', 0)
  let res: Response
  // Discogs allows 60 requests per minute; on 429 wait a little and try again (twice at most).
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(BASE + path, {
        ...init,
        headers: { Authorization: `Discogs token=${token}`, ...init.headers },
      })
    } catch {
      throw new DiscogsError('Keine Verbindung zu Discogs. Bist du online?', 0)
    }
    if (res.status !== 429 || attempt >= 2) break
    await wait(4000 * (attempt + 1))
  }
  if (res.status === 401) throw new DiscogsError('Discogs lehnt das Token ab. Bitte in den Einstellungen prüfen.', 401)
  if (res.status === 429) throw new DiscogsError('Zu viele Anfragen an Discogs. Bitte eine Minute warten.', 429)
  if (!res.ok) throw new DiscogsError(`Discogs-Fehler ${res.status}`, res.status)
  return res.json() as Promise<T>
}

export interface Identity {
  id: number
  username: string
}

export function getIdentity(token: string) {
  return request<Identity>('/oauth/identity', token)
}

export interface SearchQuery {
  q?: string
  artist?: string
  release_title?: string
  catno?: string
  barcode?: string
  label?: string
  country?: string
  year?: string
}

export interface SearchResult {
  id: number
  title: string // "Artist - Title"
  country?: string
  year?: string
  format?: string[]
  label?: string[]
  catno?: string
  barcode?: string[]
  thumb?: string
  cover_image?: string
  uri?: string
}

interface SearchResponse {
  pagination: { items: number }
  results: SearchResult[]
}

export async function searchReleases(token: string, query: SearchQuery) {
  const params = new URLSearchParams({ type: 'release', format: 'Vinyl', per_page: '50' })
  for (const [key, value] of Object.entries(query)) {
    const v = value?.trim()
    if (v) params.set(key, v)
  }
  const data = await request<SearchResponse>(`/database/search?${params}`, token)
  return { total: data.pagination.items, results: data.results }
}

/**
 * Searches by barcode, trying each variant (EAN-13 / UPC-A forms) and finally a free-text search,
 * because Discogs stores barcodes in many spellings. Stops at the first variant with results.
 */
export async function searchByBarcode(token: string, variants: string[]) {
  for (const barcode of variants) {
    const found = await searchReleases(token, { barcode })
    if (found.total > 0) return found
  }
  return searchReleases(token, { q: variants[0] })
}

/** Splits Discogs' "Artist - Title" into its parts. */
export function splitTitle(title: string) {
  const i = title.indexOf(' - ')
  return i < 0 ? { artist: '', album: title } : { artist: title.slice(0, i), album: title.slice(i + 3) }
}

export function releaseUrl(r: SearchResult) {
  return r.uri ? `https://www.discogs.com${r.uri}` : `https://www.discogs.com/release/${r.id}`
}

export interface Identifier {
  type: string // e.g. "Matrix / Runout", "Barcode", "Label Code"
  value: string
  description?: string
}

export interface ReleaseDetail {
  id: number
  title: string
  artists_sort?: string
  year?: number
  country?: string
  released?: string
  master_id?: number
  uri?: string
  notes?: string
  labels?: { name: string; catno: string }[]
  formats?: { name: string; qty?: string; descriptions?: string[]; text?: string }[]
  identifiers?: Identifier[]
  images?: { type: string; uri: string; uri150: string }[]
}

// Release details rarely change; keep them for this session to spare the rate limit.
const releaseCache = new Map<number, Promise<ReleaseDetail>>()

export function getRelease(token: string, id: number) {
  let p = releaseCache.get(id)
  if (!p) {
    p = request<ReleaseDetail>(`/releases/${id}`, token)
    p.catch(() => releaseCache.delete(id))
    releaseCache.set(id, p)
  }
  return p
}

interface Version {
  id: number
  title: string
  label?: string
  country?: string
  format?: string
  catno?: string
  released?: string
  thumb?: string
}

/** All vinyl pressings of a master release, shaped like search results. */
export async function getMasterVersions(token: string, masterId: number, artist: string) {
  const results: SearchResult[] = []
  let total = 0
  for (let page = 1; page <= 3; page++) {
    const data = await request<{ pagination: { items: number; pages: number }; versions: Version[] }>(
      `/masters/${masterId}/versions?format=Vinyl&per_page=100&page=${page}`,
      token,
    )
    total = data.pagination.items
    for (const v of data.versions) {
      results.push({
        id: v.id,
        title: artist ? `${artist} - ${v.title}` : v.title,
        country: v.country,
        year: v.released?.slice(0, 4),
        format: v.format ? v.format.split(', ') : [],
        label: v.label ? [v.label] : [],
        catno: v.catno,
        thumb: v.thumb,
      })
    }
    if (page >= data.pagination.pages) break
  }
  return { total, results }
}

export const matrixIdentifiers = (r: ReleaseDetail) => (r.identifiers ?? []).filter((i) => i.type === 'Matrix / Runout')

export function detailUrl(r: ReleaseDetail) {
  return r.uri ?? `https://www.discogs.com/release/${r.id}`
}
