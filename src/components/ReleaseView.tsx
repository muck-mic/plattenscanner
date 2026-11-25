import { useEffect, useMemo, useState } from 'react'
import { DiscogsError, detailUrl, getMasterVersions, getRelease, splitTitle, type ReleaseDetail, type SearchResult } from '../lib/discogs'
import { matchLabel, type MatrixMatch } from '../lib/matrix'
import type { Settings, UpdateSettings } from '../lib/settings'
import CandidateList from './CandidateList'
import { ChevronLeft } from './Icons'

type Load<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string }

const errorText = (err: unknown) => (err instanceof DiscogsError ? err.message : 'Unbekannter Fehler')

interface ReleaseProps {
  token: string
  id: number
  match?: MatrixMatch
  onBack: () => void
  onOpenVersions: (masterId: number, artist: string, title: string) => void
}

export function ReleaseView({ token, id, match, onBack, onOpenVersions }: ReleaseProps) {
  const [load, setLoad] = useState<Load<ReleaseDetail>>({ state: 'loading' })

  useEffect(() => {
    let cancelled = false
    getRelease(token, id).then(
      (data) => !cancelled && setLoad({ state: 'ok', data }),
      (err) => !cancelled && setLoad({ state: 'error', message: errorText(err) }),
    )
    return () => {
      cancelled = true
    }
  }, [token, id])

  return (
    <div className="screen">
      <button className="back" onClick={onBack}><ChevronLeft /> Zurück</button>
      {load.state === 'loading' && <p className="muted" role="status">Lade Pressung …</p>}
      {load.state === 'error' && <p className="error" role="alert">{load.message}</p>}
      {load.state === 'ok' && <ReleaseBody r={load.data} match={match} onOpenVersions={onOpenVersions} />}
    </div>
  )
}

function ReleaseBody({ r, match, onOpenVersions }: { r: ReleaseDetail; match?: MatrixMatch; onOpenVersions: ReleaseProps['onOpenVersions'] }) {
  const image = r.images?.find((i) => i.type === 'primary') ?? r.images?.[0]
  const artist = r.artists_sort ?? ''
  const matched = new Set(match?.best.map((b) => b.discogs))
  const badge = match && matchLabel(match.score)
  const matrix = (r.identifiers ?? []).filter((i) => i.type === 'Matrix / Runout')
  const other = (r.identifiers ?? []).filter((i) => i.type !== 'Matrix / Runout')
  const facts: [string, string | undefined][] = [
    ['Label', r.labels?.map((l) => `${l.name} – ${l.catno}`).join('\n')],
    ['Land', r.country],
    ['Erschienen', r.released && r.released !== '0' ? r.released.replace(/-00/g, '') : r.year ? String(r.year) : undefined],
    [
      'Format',
      r.formats
        ?.map((f) => [f.qty && f.qty !== '1' ? `${f.qty} ×` : '', f.name, ...(f.descriptions ?? []), f.text].filter(Boolean).join(', '))
        .join('\n'),
    ],
  ]

  return (
    <>
      {image && <img className="cover" src={image.uri} alt="" />}
      <div>
        <h1 className="title small">{r.title}</h1>
        {artist && <p className="result-artist">{artist}</p>}
      </div>
      {badge && <p className={`badge ${badge.tone}`}>{badge.text}</p>}

      <dl className="facts">
        {facts.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="group-label">Matrix / Auslaufrille</h2>
      {matrix.length ? (
        <ul className="ident-list">
          {matrix.map((i, n) => (
            <li key={n} className={matched.has(i.value) ? 'hit' : undefined}>
              <span className="mono">{i.value}</span>
              {i.description && <span className="hint">{i.description}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Für diese Pressung ist bei Discogs keine Matrix eingetragen.</p>
      )}
      {match?.best.length ? (
        <p className="hint">
          Gelesen: {match.best.map((b) => b.read).join(' · ')}
        </p>
      ) : null}

      {other.length > 0 && (
        <>
          <h2 className="group-label">Weitere Kennungen</h2>
          <ul className="ident-list">
            {other.map((i, n) => (
              <li key={n}>
                <span><span className="muted">{i.type}{i.description ? ` (${i.description})` : ''}:</span> <span className="mono">{i.value}</span></span>
              </li>
            ))}
          </ul>
        </>
      )}

      {r.notes && (
        <details className="notes">
          <summary>Anmerkungen bei Discogs</summary>
          <p>{r.notes}</p>
        </details>
      )}

      <div className="stack-8">
        {r.master_id ? (
          <button className="btn ghost" onClick={() => onOpenVersions(r.master_id!, artist, r.title)}>Alle Vinyl-Pressungen dieses Albums</button>
        ) : null}
        <a className="btn ghost" href={detailUrl(r)} target="_blank" rel="noreferrer">Auf Discogs öffnen</a>
      </div>
    </>
  )
}

interface VersionsProps {
  settings: Settings
  update: UpdateSettings
  masterId: number
  artist: string
  title: string
  visible: boolean
  onBack: () => void
  onOpen: (id: number, match?: MatrixMatch) => void
}

export function VersionsView({ settings, update, masterId, artist, title, visible, onBack, onOpen }: VersionsProps) {
  const [load, setLoad] = useState<Load<{ total: number; results: SearchResult[] }>>({ state: 'loading' })
  const [country, setCountry] = useState('')
  const token = settings.discogsToken

  useEffect(() => {
    let cancelled = false
    getMasterVersions(token, masterId, artist).then(
      (data) => !cancelled && setLoad({ state: 'ok', data }),
      (err) => !cancelled && setLoad({ state: 'error', message: errorText(err) }),
    )
    return () => {
      cancelled = true
    }
  }, [token, masterId, artist])

  const all = useMemo(() => (load.state === 'ok' ? load.data.results : []), [load])
  const countries = useMemo(() => {
    const count = new Map<string, number>()
    for (const v of all) if (v.country) count.set(v.country, (count.get(v.country) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1])
  }, [all])
  const shown = country ? all.filter((v) => v.country === country) : all

  return (
    <div className="screen">
      <button className="back" onClick={onBack}><ChevronLeft /> Zurück</button>
      <div>
        <h1 className="title small">Alle Pressungen</h1>
        <p className="result-artist">{[artist, splitTitle(title).album].filter(Boolean).join(' – ')}</p>
      </div>
      {load.state === 'loading' && <p className="muted" role="status">Lade Pressungen …</p>}
      {load.state === 'error' && <p className="error" role="alert">{load.message}</p>}
      {load.state === 'ok' && (
        <>
          <label className="field">
            <span>Land ({shown.length} von {load.data.total} Pressungen{all.length < load.data.total ? `, die ersten ${all.length} geladen` : ''})</span>
            <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Alle Länder</option>
              {countries.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
            </select>
          </label>
          {/* key: a new country filter starts a fresh matrix comparison */}
          <CandidateList key={country} settings={settings} update={update} candidates={shown} visible={visible} onOpen={onOpen} />
        </>
      )}
    </div>
  )
}
