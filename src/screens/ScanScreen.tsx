import { useState } from 'react'
import { DiscogsError, searchByBarcode, searchReleases } from '../lib/discogs'
import type { SearchQuery, SearchResult } from '../lib/discogs'
import { barcodeVariants } from '../lib/barcode'
import { fileToJpegBase64, recognizeRecord, RecognizeError, type RecordInfo } from '../lib/recognize'
import { addCost, formatUsd, type Settings, type UpdateSettings } from '../lib/settings'
import CameraScanner from '../components/CameraScanner'
import CandidateList from '../components/CandidateList'
import { ReleaseView, VersionsView } from '../components/ReleaseView'
import type { MatrixMatch } from '../lib/matrix'
import { ChevronLeft, SearchIcon } from '../components/Icons'

interface Props {
  settings: Settings
  update: UpdateSettings
  active: boolean // is the Scan tab on screen?
  goToSettings: () => void
}

type View = 'camera' | 'photo' | 'manual'

// Pages opened on top of the results (release details, all pressings); the last one is on screen.
type Page =
  | { kind: 'release'; id: number; match?: MatrixMatch }
  | { kind: 'versions'; masterId: number; artist: string; title: string }

interface Recognized {
  info: RecordInfo
  costUsd: number
  photo: string // base64 JPEG, shown as a preview
}

type Status =
  | { state: 'idle' }
  | { state: 'loading'; label: string }
  | { state: 'results'; source: string; total: number; results: SearchResult[]; barcode?: string; recognized?: Recognized }
  | { state: 'error'; message: string; needsSettings: boolean }

const EMPTY: SearchQuery = { artist: '', release_title: '', catno: '', barcode: '', q: '' }

function toError(err: unknown, hasToken: boolean): Status {
  if (err instanceof RecognizeError) return { state: 'error', message: err.message, needsSettings: /Schlüssel/.test(err.message) }
  const message = err instanceof DiscogsError ? err.message : 'Unbekannter Fehler'
  const needsSettings = !hasToken || (err instanceof DiscogsError && err.status === 401)
  return { state: 'error', message, needsSettings }
}

const clean = (v: string | null) => v?.trim() || undefined

/** Tries the most precise search first and falls back step by step. */
async function searchFromInfo(token: string, info: RecordInfo) {
  const barcode = info.barcode?.replace(/\D/g, '')
  const artist = clean(info.artist)
  const title = clean(info.title)
  const catno = clean(info.catno)
  const label = clean(info.label)
  const attempts: { source: string; run: () => Promise<{ total: number; results: SearchResult[] }> }[] = []
  if (barcode && barcode.length >= 8) attempts.push({ source: `Barcode ${barcode}`, run: () => searchByBarcode(token, barcodeVariants(barcode)) })
  if (catno && label) attempts.push({ source: `Kat.-Nr. ${catno} · ${label}`, run: () => searchReleases(token, { catno, label }) })
  if (catno) attempts.push({ source: `Kat.-Nr. ${catno}`, run: () => searchReleases(token, { catno, artist }) })
  if (catno && artist) attempts.push({ source: `Kat.-Nr. ${catno}`, run: () => searchReleases(token, { catno }) })
  if (artist && title) attempts.push({ source: `${artist} – ${title}`, run: () => searchReleases(token, { artist, release_title: title }) })
  const q = [artist, title, label].filter(Boolean).join(' ')
  if (q) attempts.push({ source: `Freie Suche „${q}“`, run: () => searchReleases(token, { q }) })
  if (!attempts.length) return { source: 'Keine lesbaren Angaben', total: 0, results: [] }

  let last = { source: attempts[0].source, total: 0, results: [] as SearchResult[] }
  for (const a of attempts) {
    const found = await a.run()
    last = { source: a.source, ...found }
    if (found.total > 0) break
  }
  return last
}

export default function ScanScreen({ settings, update, active, goToSettings }: Props) {
  const [view, setView] = useState<View>('camera')
  const [query, setQuery] = useState<SearchQuery>(EMPTY)
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const [pages, setPages] = useState<Page[]>([])
  const push = (p: Page) => {
    setPages((ps) => [...ps, p])
    window.scrollTo(0, 0)
  }
  const pop = () => setPages((ps) => ps.slice(0, -1))
  const openRelease = (id: number, match?: MatrixMatch) => push({ kind: 'release', id, match })
  const openVersions = (masterId: number, artist: string, title: string) => push({ kind: 'versions', masterId, artist, title })
  const hasInput = Object.values(query).some((v) => v?.trim())

  const set = (key: keyof SearchQuery) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setQuery((q) => ({ ...q, [key]: e.target.value }))

  async function onBarcode(code: string) {
    setStatus({ state: 'loading', label: `Barcode ${code} erkannt – suche bei Discogs …` })
    try {
      const found = await searchByBarcode(settings.discogsToken, barcodeVariants(code))
      setPages([])
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
      setPages([])
      setStatus({ state: 'results', source: 'Manuelle Suche', ...found })
    } catch (err) {
      setStatus(toError(err, !!settings.discogsToken))
    }
  }

  async function onPhoto(jpeg: string) {
    if (!settings.aiEnabled) {
      setStatus({ state: 'error', message: 'Die KI-Erkennung ist in den Einstellungen ausgeschaltet.', needsSettings: true })
      return
    }
    if (!settings.anthropicKey) {
      setStatus({ state: 'error', message: 'Für die Erkennung brauchst du einen Claude-Schlüssel.', needsSettings: true })
      return
    }
    setStatus({ state: 'loading', label: 'Claude liest Cover / Label …' })
    try {
      const { info, costUsd } = await recognizeRecord(settings.anthropicKey, settings.aiModel, jpeg)
      update((prev) => addCost(prev, costUsd))
      setStatus({ state: 'loading', label: 'Erkannt – suche bei Discogs …' })
      const found = await searchFromInfo(settings.discogsToken, info)
      setPages([])
      setStatus({ state: 'results', ...found, recognized: { info, costUsd, photo: jpeg } })
    } catch (err) {
      setStatus(toError(err, !!settings.discogsToken))
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      onPhoto(await fileToJpegBase64(file))
    } catch {
      setStatus({ state: 'error', message: 'Das Foto konnte nicht geöffnet werden.', needsSettings: false })
    }
  }

  function editRecognized(info: RecordInfo) {
    setQuery({
      artist: info.artist ?? '',
      release_title: info.title ?? '',
      catno: info.catno ?? '',
      barcode: info.barcode?.replace(/\D/g, '') ?? '',
      q: '',
    })
    setStatus({ state: 'idle' })
    setView('manual')
  }

  function backToScanning() {
    setPages([])
    setStatus({ state: 'idle' })
  }

  function openManualWithBarcode(code: string) {
    setQuery({ ...EMPTY, barcode: code })
    setStatus({ state: 'idle' })
    setView('manual')
  }

  if (status.state === 'results') {
    const top = pages.length - 1
    return (
      <>
      <div className="screen" hidden={pages.length > 0}>
        <button className="back" onClick={backToScanning}>
          <ChevronLeft /> {view === 'manual' ? 'Suche' : 'Weiter scannen'}
        </button>
        <h1 className="title">Treffer</h1>
        {status.recognized && <RecognizedBox rec={status.recognized} onEdit={() => editRecognized(status.recognized!.info)} />}
        <p className="source-chip">{status.source}</p>
        <p className="muted">
          {status.total === 0
            ? 'Keine Vinyl-Pressung gefunden.'
            : `${status.total} Treffer bei Discogs${status.total > status.results.length ? ` · die ersten ${status.results.length}` : ''}`}
        </p>
        {status.total === 0 && status.barcode && !status.recognized && (
          <div className="stack-8">
            <button className="btn ghost" onClick={() => openManualWithBarcode(status.barcode!)}>Manuell weitersuchen</button>
            {settings.aiEnabled && (
              <button className="btn ghost" onClick={() => { setStatus({ state: 'idle' }); setView('photo') }}>Cover / Label mit KI erkennen</button>
            )}
          </div>
        )}
        <CandidateList
          key={status.source}
          settings={settings}
          update={update}
          candidates={status.results}
          visible={active && pages.length === 0}
          onOpen={openRelease}
        />
      </div>
      {pages.map((p, i) => (
        <div key={i} hidden={i !== top}>
          {p.kind === 'release' ? (
            <ReleaseView token={settings.discogsToken} id={p.id} match={p.match} onBack={pop} onOpenVersions={openVersions} />
          ) : (
            <VersionsView
              settings={settings}
              update={update}
              masterId={p.masterId}
              artist={p.artist}
              title={p.title}
              visible={active && i === top}
              onBack={pop}
              onOpen={openRelease}
            />
          )}
        </div>
      ))}
      </>
    )
  }

  const errorBox = status.state === 'error' && (
    <p className="error" role="alert">
      {status.message}{' '}
      {status.needsSettings && <button type="button" className="link" onClick={goToSettings}>Einstellungen öffnen</button>}
    </p>
  )

  return (
    <div className="screen">
      <div className="title-row">
        <h1 className="title">Scannen</h1>
      </div>

      <div className="segmented" role="group" aria-label="Erkennungsart">
        <button className={view === 'camera' ? 'seg active' : 'seg'} aria-pressed={view === 'camera'} onClick={() => setView('camera')}>Barcode</button>
        <button className={view === 'photo' ? 'seg active' : 'seg'} aria-pressed={view === 'photo'} onClick={() => setView('photo')}>Cover / Label</button>
        <button className={view === 'manual' ? 'seg active' : 'seg'} aria-pressed={view === 'manual'} onClick={() => setView('manual')}>Manuell</button>
      </div>

      {!settings.discogsToken && (
        <div className="notice">
          <span>Für die Suche brauchst du ein Discogs-Token.</span>
          <button className="link" onClick={goToSettings}>Zu den Einstellungen</button>
        </div>
      )}

      {view !== 'manual' && (
        <>
          <CameraScanner
            active={active && status.state === 'idle'}
            mode={view === 'photo' ? 'photo' : 'barcode'}
            onDetected={onBarcode}
            onPhoto={onPhoto}
          />
          {status.state === 'loading' && <p className="muted" role="status">{status.label}</p>}
          {status.state === 'error' && (
            <>
              {errorBox}
              <button className="btn ghost" onClick={backToScanning}>Weiter scannen</button>
            </>
          )}
          {view === 'camera' && (
            <p className="hint">Platten vor ca. 1980 haben meist keinen Barcode. Dann nimm „Cover / Label“.</p>
          )}
          {view === 'photo' && status.state !== 'loading' && (
            <>
              <label className="btn ghost file-btn">
                Foto aus der Mediathek
                <input type="file" accept="image/*" onChange={onPickFile} />
              </label>
              <p className="hint">
                Am genauesten ist ein Foto vom Label in der Mitte der Platte (Katalognummer, Label, Land). Rückseiten mit Barcode
                gehen auch. Ein Scan kostet mit {settings.aiModel === 'claude-haiku-5-5' ? 'Haiku' : 'Opus'} etwa{' '}
                {settings.aiModel === 'claude-haiku-5-5' ? 'unter 0,1 Cent' : '1–2 Cent'}.
              </p>
            </>
          )}
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

const FIELDS: [keyof RecordInfo, string][] = [
  ['artist', 'Künstler'],
  ['title', 'Titel'],
  ['label', 'Label'],
  ['catno', 'Kat.-Nr.'],
  ['barcode', 'Barcode'],
  ['country', 'Land'],
  ['year', 'Jahr'],
]
const CONFIDENCE = { high: 'sicher', medium: 'ziemlich sicher', low: 'unsicher' }

function RecognizedBox({ rec, onEdit }: { rec: Recognized; onEdit: () => void }) {
  const rows = FIELDS.filter(([k]) => rec.info[k])
  return (
    <div className="recognized">
      <img className="photo-preview" src={`data:image/jpeg;base64,${rec.photo}`} alt="Aufgenommenes Foto" />
      <strong>Von Claude erkannt ({CONFIDENCE[rec.info.confidence]})</strong>
      {rows.length ? (
        <dl>
          {rows.map(([k, label]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{label}</dt>
              <dd>{rec.info[k]}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="muted">Nichts Lesbares gefunden.</span>
      )}
      {rec.info.notes && <span className="hint">{rec.info.notes}</span>}
      <span className="hint">Kosten dieses Scans: {formatUsd(rec.costUsd)}</span>
      <button className="btn ghost" onClick={onEdit}>Angaben bearbeiten</button>
    </div>
  )
}
