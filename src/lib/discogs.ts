// Minimal Discogs API client. Personal access token auth, browser-side (Discogs sends CORS headers).
const BASE = 'https://api.discogs.com'

export class DiscogsError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  if (!token) throw new DiscogsError('Kein Discogs-Token hinterlegt. Bitte in den Einstellungen eintragen.', 0)
  let res: Response
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { Authorization: `Discogs token=${token}`, ...init.headers },
    })
  } catch {
    throw new DiscogsError('Keine Verbindung zu Discogs. Bist du online?', 0)
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

/** Splits Discogs' "Artist - Title" into its parts. */
export function splitTitle(title: string) {
  const i = title.indexOf(' - ')
  return i < 0 ? { artist: '', album: title } : { artist: title.slice(0, i), album: title.slice(i + 3) }
}

export function releaseUrl(r: SearchResult) {
  return r.uri ? `https://www.discogs.com${r.uri}` : `https://www.discogs.com/release/${r.id}`
}
