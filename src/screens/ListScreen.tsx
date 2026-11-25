import { useEffect, useState } from 'react'
import { allRecords, deleteRecord, onListChange, type SavedRecord } from '../lib/store'

type Load = { state: 'loading' } | { state: 'ok'; records: SavedRecord[] } | { state: 'error' }

export default function ListScreen() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [filter, setFilter] = useState('')

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

  async function remove(r: SavedRecord) {
    const where = r.discogsInstanceId ? ' Aus deiner Discogs-Sammlung wird sie dabei nicht entfernt.' : ''
    if (!confirm(`„${r.title}“ aus deiner Liste löschen?${where}`)) return
    await deleteRecord(r.id)
  }

  const records = load.state === 'ok' ? load.records : []
  const f = filter.trim().toLowerCase()
  const shown = f
    ? records.filter((r) => [r.artist, r.title, r.label, r.catno, r.country, r.year, r.notes].join(' ').toLowerCase().includes(f))
    : records

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
          <label className="field">
            <span>{f ? `${shown.length} von ${records.length} Platten` : records.length === 1 ? '1 Platte' : `${records.length} Platten`}</span>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Suchen in Künstler, Titel, Label …"
              autoCorrect="off" autoCapitalize="off" spellCheck={false} type="search" />
          </label>
          <ul className="results">
            {shown.map((r) => (
              <li key={r.id} className="result saved-item">
                <a className="saved-link" href={r.discogsUrl} target="_blank" rel="noreferrer">
                  {r.thumb ? <img className="thumb" src={r.thumb} alt="" loading="lazy" /> : <div className="thumb" aria-hidden="true" />}
                  <div className="result-text">
                    <span className="result-title">{r.title}</span>
                    {r.artist && <span className="result-artist">{r.artist}</span>}
                    <span className="result-meta">{[r.label, r.catno].filter(Boolean).join(' – ')}</span>
                    <span className="result-meta">{[r.country, r.year].filter(Boolean).join(' · ')}</span>
                    {(r.mediaCondition || r.sleeveCondition) && (
                      <span className="result-meta">Zustand: {[r.mediaCondition, r.sleeveCondition].map((c) => c || '–').join(' / ')}</span>
                    )}
                    {r.notes && <span className="result-meta">{r.notes}</span>}
                    <span className="result-meta">
                      {new Date(r.addedAt).toLocaleDateString('de-DE')}
                      {r.discogsInstanceId ? ' · auch in Discogs-Sammlung' : ''}
                      {r.matrixScore !== null ? ` · Matrix ${Math.round(r.matrixScore * 100)} %` : ''}
                    </span>
                  </div>
                </a>
                <button className="delete" aria-label={`${r.title} löschen`} onClick={() => remove(r)}>✕</button>
              </li>
            ))}
          </ul>
          <p className="hint">Die Liste liegt nur auf diesem iPhone. Export als Datei folgt in Phase 6.</p>
        </>
      )}
    </div>
  )
}
