import { useEffect, useState } from 'react'
import { allRecords, deleteRecord, MEDIA_CONDITIONS, onListChange, putRecords, SLEEVE_CONDITIONS, updateRecord, type SavedRecord } from '../lib/store'
import { backupName, csvName, parseBackup, shareFile, toBackup, toCsv } from '../lib/exportList'

type Load = { state: 'loading' } | { state: 'ok'; records: SavedRecord[] } | { state: 'error' }
type Sort = 'added' | 'artist' | 'title' | 'year'

const SORTS: Record<Sort, { label: string; compare: (a: SavedRecord, b: SavedRecord) => number }> = {
  added: { label: 'Neueste zuerst', compare: (a, b) => b.addedAt.localeCompare(a.addedAt) },
  artist: { label: 'Künstler A–Z', compare: (a, b) => a.artist.localeCompare(b.artist, 'de') || a.title.localeCompare(b.title, 'de') },
  title: { label: 'Titel A–Z', compare: (a, b) => a.title.localeCompare(b.title, 'de') },
  year: { label: 'Jahr', compare: (a, b) => (a.year || '9999').localeCompare(b.year || '9999') },
}

export default function ListScreen() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<Sort>('added')
  const [openId, setOpenId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    const reload = () =>
      allRecords().then(
        (records) => !cancelled && setLoad({ state: 'ok', records }),
        () => !cancelled && setLoad({ state: 'error' }),
      )
    reload()
    const off = onListChange(reload)
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const records = load.state === 'ok' ? load.records : []
  const f = filter.trim().toLowerCase()
  const shown = (f
    ? records.filter((r) => [r.artist, r.title, r.label, r.catno, r.country, r.year, r.notes].join(' ').toLowerCase().includes(f))
    : [...records]
  ).sort(SORTS[sort].compare)

  async function importBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const incoming = parseBackup(await file.text())
      const known = new Set(records.map((r) => r.id))
      const added = incoming.filter((r) => !known.has(r.id)).length
      await putRecords(incoming)
      setMessage({ text: `Sicherung eingespielt: ${added} neu, ${incoming.length - added} schon vorhanden.`, error: false })
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Einspielen fehlgeschlagen.', error: true })
    }
  }

  return (
    <div className="screen">
      <h1 className="title">Meine Liste</h1>
      {load.state === 'loading' && <p className="muted" role="status">Lade …</p>}
      {load.state === 'error' && <p className="error" role="alert">Die Liste konnte nicht geladen werden.</p>}
      {load.state === 'ok' && records.length === 0 && (
        <div className="camera-placeholder">
          <p>Noch keine Platten gespeichert.</p>
          <p className="muted">Scanne eine Platte, öffne den passenden Treffer und tippe auf „Speichern“.</p>
        </div>
      )}
      {records.length > 0 && (
        <>
          <div className="field-grid list-tools">
            <label className="field">
              <span>{f ? `${shown.length} von ${records.length} Platten` : records.length === 1 ? '1 Platte' : `${records.length} Platten`}</span>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Suchen …"
                autoCorrect="off" autoCapitalize="off" spellCheck={false} type="search" />
            </label>
            <label className="field">
              <span>Sortieren</span>
              <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {(Object.keys(SORTS) as Sort[]).map((s) => <option key={s} value={s}>{SORTS[s].label}</option>)}
              </select>
            </label>
          </div>
          <ul className="results">
            {shown.map((r) => (
              <li key={r.id}>
                <RecordCard record={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} />
              </li>
            ))}
          </ul>
        </>
      )}

      {load.state === 'ok' && (
        <>
          <h2 className="group-label">Export und Sicherung</h2>
          <div className="stack-8">
            <button className="btn ghost" disabled={!records.length} onClick={() => shareFile(toCsv(shown), csvName(), 'text/csv')}>
              {f ? `Gefilterte Liste als Tabelle (CSV)` : 'Als Tabelle exportieren (CSV)'}
            </button>
            <button className="btn ghost" disabled={!records.length} onClick={() => shareFile(toBackup(records), backupName(), 'application/json')}>
              Sicherung erstellen
            </button>
            <label className="btn ghost file-btn">
              Sicherung einspielen
              <input type="file" accept="application/json,.json" onChange={importBackup} />
            </label>
          </div>
          {message && <p className={message.error ? 'error' : 'ok'} role="status">{message.text}</p>}
          <p className="hint">
            Die Liste liegt nur auf diesem iPhone. Die Tabelle öffnest du in Numbers oder Excel. Die Sicherung speicherst du am besten in
            iCloud Drive („In Dateien sichern“) und spielst sie bei Bedarf hier wieder ein.
          </p>
        </>
      )}
    </div>
  )
}

function RecordCard({ record: r, open, onToggle }: { record: SavedRecord; open: boolean; onToggle: () => void }) {
  return (
    <div className="result record-card">
      <button className="record-head" aria-expanded={open} onClick={onToggle}>
        {r.thumb ? <img className="thumb" src={r.thumb} alt="" loading="lazy" /> : <div className="thumb" aria-hidden="true" />}
        <div className="result-text">
          <span className="result-title">{r.title}</span>
          {r.artist && <span className="result-artist">{r.artist}</span>}
          <span className="result-meta">{[r.label, r.catno].filter(Boolean).join(' – ')}</span>
          <span className="result-meta">{[r.country, r.year].filter(Boolean).join(' · ')}</span>
          {(r.mediaCondition || r.sleeveCondition) && (
            <span className="result-meta">Zustand: {[r.mediaCondition, r.sleeveCondition].map((c) => c || '–').join(' / ')}</span>
          )}
          {r.notes && !open && <span className="result-meta">{r.notes}</span>}
        </div>
      </button>
      {open && <RecordEditor record={r} onDone={onToggle} />}
    </div>
  )
}

function RecordEditor({ record: r, onDone }: { record: SavedRecord; onDone: () => void }) {
  const [media, setMedia] = useState(r.mediaCondition)
  const [sleeve, setSleeve] = useState(r.sleeveCondition)
  const [notes, setNotes] = useState(r.notes)
  const dirty = media !== r.mediaCondition || sleeve !== r.sleeveCondition || notes.trim() !== r.notes

  async function save() {
    await updateRecord({ ...r, mediaCondition: media, sleeveCondition: sleeve, notes: notes.trim() })
    onDone()
  }

  async function remove() {
    const where = r.discogsInstanceId ? ' Aus deiner Discogs-Sammlung wird sie dabei nicht entfernt.' : ''
    if (!confirm(`„${r.title}“ aus deiner Liste löschen?${where}`)) return
    await deleteRecord(r.id)
  }

  return (
    <div className="record-editor">
      <p className="result-meta wrap">
        {r.format && <>{r.format}<br /></>}
        Gespeichert am {new Date(r.addedAt).toLocaleDateString('de-DE')}
        {r.discogsInstanceId ? ' · auch in der Discogs-Sammlung' : ''}
        {r.matrixRead.length > 0 && (
          <>
            <br />Matrix gelesen: <span className="mono">{r.matrixRead.join(' · ')}</span>
            {r.matrixScore !== null && ` (${Math.round(r.matrixScore * 100)} %)`}
          </>
        )}
      </p>
      <div className="group">
        <label className="row">
          <span>Zustand Platte</span>
          <select className="row-select" value={media} onChange={(e) => setMedia(e.target.value)}>
            <option value="">–</option>
            {MEDIA_CONDITIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="row">
          <span>Zustand Hülle</span>
          <select className="row-select" value={sleeve} onChange={(e) => setSleeve(e.target.value)}>
            <option value="">–</option>
            {SLEEVE_CONDITIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="row">
          <span>Notiz</span>
          <input className="row-input" value={notes} placeholder="optional" onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      {r.discogsInstanceId && dirty && <p className="hint">Änderungen gelten nur für deine Liste, nicht für die Discogs-Sammlung.</p>}
      <div className="stack-8">
        <button className="btn primary" onClick={dirty ? save : onDone}>{dirty ? 'Änderungen speichern' : 'Schließen'}</button>
        <a className="btn ghost" href={r.discogsUrl} target="_blank" rel="noreferrer">Auf Discogs öffnen</a>
        <button className="btn ghost danger" onClick={remove}>Aus Liste löschen</button>
      </div>
    </div>
  )
}
