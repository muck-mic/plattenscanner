import { useState } from 'react'
import { DiscogsError, releaseUrl, searchByBarcode, searchReleases, splitTitle } from '../lib/discogs'
import type { SearchQuery, SearchResult } from '../lib/discogs'
import { barcodeVariants } from '../lib/barcode'
import type { Settings } from '../lib/settings'
import CameraScanner from '../components/CameraScanner'
import { ChevronLeft, SearchIcon } from '../components/Icons'

interface Props {
  settings: Settings
  active: boolean // is the Scan tab on screen?
  goToSettings: () => void
}

type View = 'camera' | 'manual'

type Status =
  | { state: 'idle' }
  | { state: 'loading'; label: string }
  | { state: 'results'; source: string; total: number; results: SearchResult[]; barcode?: string }
  | { state: 'error'; message: string; needsToken: boolean }

const EMPTY: SearchQuery = { artist: '', release_title: '', catno: '', barcode: '', q: '' }

function toError(err: unknown, hasToken: boolean): Status {
  const message = err instanceof DiscogsError ? err.message : 'Unbekannter Fehler'
  const needsToken = !hasToken || (err instanceof DiscogsError && err.status === 401)
  return { state: 'error', message, needsToken }
}

export default function ScanScreen({ settings, active, goToSettings }: Props) {
  const [view, setView] = useState<View>('camera')
  const [query, setQuery] = useState<SearchQuery>(EMPTY)
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const hasInput = Object.values(query).some((v) => v?.trim())

  const set = (key: keyof SearchQuery) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setQuery((q) => ({ ...q, [key]: e.target.value }))

  async function onBarcode(code: string) {
    setStatus({ state: 'loading', label: `Barcode ${code} erkannt – suche bei Discogs …` })
    try {
      const found = await searchByBarcode(settings.discogsToken, barcodeVariants(code))
      setStatus({ state: 'results', source: `Barcode ${code}`, barcode: code, ...found })
    } catch (err) {
      setStatus(toError(err, !!settings.discogsToken))
    }
  }

  async function onManualSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!hasInput) return
    setStatus({ state: 'loading', label: 'Suche bei Discogs …' })
    try {
      const found = await searchReleases(settings.discogsToken, query)
      setStatus({ state: 'results', source: 'Manuelle Suche', ...found })
    } catch (err) {
      setStatus(toError(err, !!settings.discogsToken))
    }
  }

  function backToScanning() {
    setStatus({ state: 'idle' })
  }

  function openManualWithBarcode(code: string) {
    setQuery({ ...EMPTY, barcode: code })
    setStatus({ state: 'idle' })
    setView('manual')
  }

  if (status.state === 'results') {
    return (
      <div className="screen">
        <button className="back" onClick={backToScanning}>
          <ChevronLeft /> {view === 'camera' ? 'Weiter scannen' : 'Suche'}
        </button>
        <h1 className="title">Treffer</h1>
        <p className="source-chip">{status.source}</p>
        <p className="muted">
          {status.total === 0
            ? 'Keine Vinyl-Pressung gefunden.'
            : `${status.total} Treffer bei Discogs${status.total > status.results.length ? ` · die ersten ${status.results.length}` : ''}`}
        </p>
        {status.total === 0 && status.barcode && (
          <button className="btn ghost" onClick={() => openManualWithBarcode(status.barcode!)}>Manuell weitersuchen</button>
        )}
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

  const errorBox = status.state === 'error' && (
    <p className="error" role="alert">
      {status.message}{' '}
      {status.needsToken && <button type="button" className="link" onClick={goToSettings}>Einstellungen öffnen</button>}
    </p>
  )

  return (
    <div className="screen">
      <div className="title-row">
        <h1 className="title">Scannen</h1>
      </div>

      <div className="segmented" role="group" aria-label="Erkennungsart">
        <button className={view === 'camera' ? 'seg active' : 'seg'} aria-pressed={view === 'camera'} onClick={() => setView('camera')}>Barcode</button>
        <button className="seg" disabled title="Kommt in Phase 3">Cover / Label</button>
        <button className={view === 'manual' ? 'seg active' : 'seg'} aria-pressed={view === 'manual'} onClick={() => setView('manual')}>Manuell</button>
      </div>

      {!settings.discogsToken && (
        <div className="notice">
          <span>Für die Suche brauchst du ein Discogs-Token.</span>
          <button className="link" onClick={goToSettings}>Zu den Einstellungen</button>
        </div>
      )}

      {view === 'camera' && (
        <>
          <CameraScanner active={active && status.state === 'idle'} onDetected={onBarcode} />
          {status.state === 'loading' && <p className="muted" role="status">{status.label}</p>}
          {status.state === 'error' && (
            <>
              {errorBox}
              <button className="btn ghost" onClick={backToScanning}>Weiter scannen</button>
            </>
          )}
          <p className="hint">Platten vor ca. 1980 haben meist keinen Barcode. Dafür kommt in Phase 3 die Erkennung über Cover und Label.</p>
        </>
      )}

      {view === 'manual' && (
        <form className="stack-12" onSubmit={onManualSearch}>
          <div className="field-grid">
            <Field label="Künstler" value={query.artist} onChange={set('artist')} />
            <Field label="Titel" value={query.release_title} onChange={set('release_title')} />
            <Field label="Kat.-Nr." value={query.catno} onChange={set('catno')} />
            <Field label="Barcode" value={query.barcode} onChange={set('barcode')} inputMode="numeric" />
          </div>
          <Field label="Oder freie Suche" value={query.q} onChange={set('q')} />
          {errorBox}
          <div className="stack-8">
            <button className="btn primary" type="submit" disabled={!hasInput || status.state === 'loading'}>
              <SearchIcon /> {status.state === 'loading' ? 'Suche läuft …' : 'Bei Discogs suchen'}
            </button>
            {hasInput && (
              <button className="btn ghost" type="button" onClick={() => setQuery(EMPTY)}>Felder leeren</button>
            )}
          </div>
        </form>
      )}
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
