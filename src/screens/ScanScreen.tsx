import { useState } from 'react'
import { DiscogsError, releaseUrl, searchReleases, splitTitle } from '../lib/discogs'
import type { SearchQuery, SearchResult } from '../lib/discogs'
import type { Settings } from '../lib/settings'
import { ChevronLeft, SearchIcon } from '../components/Icons'

interface Props {
  settings: Settings
  goToSettings: () => void
}

type Status =
  | { state: 'form' }
  | { state: 'loading' }
  | { state: 'results'; total: number; results: SearchResult[] }
  | { state: 'error'; message: string; needsToken: boolean }

const EMPTY: SearchQuery = { artist: '', release_title: '', catno: '', barcode: '', q: '' }

export default function ScanScreen({ settings, goToSettings }: Props) {
  const [query, setQuery] = useState<SearchQuery>(EMPTY)
  const [status, setStatus] = useState<Status>({ state: 'form' })
  const hasInput = Object.values(query).some((v) => v?.trim())

  const set = (key: keyof SearchQuery) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setQuery((q) => ({ ...q, [key]: e.target.value }))

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!hasInput) return
    setStatus({ state: 'loading' })
    try {
      const { total, results } = await searchReleases(settings.discogsToken, query)
      setStatus({ state: 'results', total, results })
    } catch (err) {
      const message = err instanceof DiscogsError ? err.message : 'Unbekannter Fehler'
      const needsToken = err instanceof DiscogsError && (err.status === 401 || err.status === 0) && !settings.discogsToken
      setStatus({ state: 'error', message, needsToken })
    }
  }

  if (status.state === 'results') {
    return (
      <div className="screen">
        <button className="back" onClick={() => setStatus({ state: 'form' })}>
          <ChevronLeft /> Suche
        </button>
        <h1 className="title">Treffer</h1>
        <p className="muted">
          {status.total === 0
            ? 'Keine Vinyl-Pressung gefunden. Versuch es mit weniger Angaben.'
            : `${status.total} Treffer bei Discogs${status.total > status.results.length ? ` · die ersten ${status.results.length}` : ''}`}
        </p>
        <ul className="results">
          {status.results.map((r) => (
            <li key={r.id}>
              <ResultCard result={r} />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="screen">
      <h1 className="title">Scannen</h1>
      <div className="camera-placeholder">
        <p>Die Kamera-Erkennung kommt in Phase 2.</p>
        <p className="muted">Bis dahin kannst du hier manuell bei Discogs suchen.</p>
      </div>

      {!settings.discogsToken && (
        <div className="notice">
          <span>Für die Suche brauchst du ein Discogs-Token.</span>
          <button className="link" onClick={goToSettings}>Zu den Einstellungen</button>
        </div>
      )}

      <form className="stack-12" onSubmit={search}>
        <div className="field-grid">
          <Field label="Künstler" value={query.artist} onChange={set('artist')} />
          <Field label="Titel" value={query.release_title} onChange={set('release_title')} />
          <Field label="Kat.-Nr." value={query.catno} onChange={set('catno')} />
          <Field label="Barcode" value={query.barcode} onChange={set('barcode')} inputMode="numeric" />
        </div>
        <Field label="Oder freie Suche" value={query.q} onChange={set('q')} />
        {status.state === 'error' && (
          <p className="error" role="alert">
            {status.message}{' '}
            {status.needsToken && <button type="button" className="link" onClick={goToSettings}>Einstellungen öffnen</button>}
          </p>
        )}
        <div className="stack-8">
          <button className="btn primary" type="submit" disabled={!hasInput || status.state === 'loading'}>
            <SearchIcon /> {status.state === 'loading' ? 'Suche läuft …' : 'Bei Discogs suchen'}
          </button>
          {hasInput && (
            <button className="btn ghost" type="button" onClick={() => setQuery(EMPTY)}>Felder leeren</button>
          )}
        </div>
      </form>
    </div>
  )
}

function Field(props: {
  label: string
  value?: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  inputMode?: 'numeric'
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        value={props.value ?? ''}
        onChange={props.onChange}
        inputMode={props.inputMode}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
      />
    </label>
  )
}

function ResultCard({ result }: { result: SearchResult }) {
  const { artist, album } = splitTitle(result.title)
  const formats = (result.format ?? []).filter((f) => f !== 'Vinyl').slice(0, 3).join(', ')
  const meta = [result.country, result.year, result.catno].filter(Boolean).join(' · ')
  return (
    <a className="result" href={releaseUrl(result)} target="_blank" rel="noreferrer">
      {result.thumb ? (
        <img className="thumb" src={result.thumb} alt="" loading="lazy" />
      ) : (
        <div className="thumb" aria-hidden="true" />
      )}
      <div className="result-text">
        <span className="result-title">{album}</span>
        <span className="result-artist">{artist}</span>
        <span className="result-meta">{meta}</span>
        {formats && <span className="result-meta">{formats}</span>}
        {result.label?.[0] && <span className="result-meta">{result.label[0]}</span>}
      </div>
    </a>
  )
}
