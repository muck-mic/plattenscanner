import { useState } from 'react'
import { splitTitle, DiscogsError, type SearchResult } from '../lib/discogs'
import { fileToJpegBase64, RecognizeError } from '../lib/recognize'
import { matchLabel, MAX_CANDIDATES, readMatrix, scoreCandidates, type MatrixMatch } from '../lib/matrix'
import { addCost, formatUsd, type Settings, type UpdateSettings } from '../lib/settings'
import CameraScanner from './CameraScanner'

interface Props {
  settings: Settings
  update: UpdateSettings
  candidates: SearchResult[]
  visible: boolean // is this list on screen? (the camera only runs then)
  onOpen: (id: number, match?: MatrixMatch) => void
}

interface Side {
  side: string | null
  text: string
}

type Phase =
  | { state: 'idle' }
  | { state: 'capturing' }
  | { state: 'reading' }
  | { state: 'comparing'; done: number; total: number }
  | { state: 'error'; message: string }

export default function CandidateList({ settings, update, candidates, visible, onOpen }: Props) {
  const [phase, setPhase] = useState<Phase>({ state: 'idle' })
  const [sides, setSides] = useState<Side[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [cost, setCost] = useState(0)
  const [scores, setScores] = useState<Map<number, MatrixMatch> | null>(null)
  const canUseAi = settings.aiEnabled && !!settings.anthropicKey

  async function onPhoto(jpeg: string) {
    setPhase({ state: 'reading' })
    try {
      const { info, costUsd } = await readMatrix(settings.anthropicKey, settings.aiModel, jpeg)
      update((prev) => addCost(prev, costUsd))
      setCost((c) => c + costUsd)
      const read = info.sides.filter((s) => s.text.trim())
      if (!read.length) {
        setPhase({ state: 'error', message: 'Claude konnte in der Auslaufrille nichts lesen. Versuch es näher und mit schrägem Licht.' })
        return
      }
      const allSides = [...sides, ...read]
      setSides(allSides)
      if (info.notes) setNotes((n) => [...n, info.notes])
      const ids = candidates.map((c) => c.id)
      const result = await scoreCandidates(settings.discogsToken, ids, allSides.map((s) => s.text), (done, total) =>
        setPhase({ state: 'comparing', done, total }),
      )
      setScores(result)
      setPhase({ state: 'idle' })
    } catch (err) {
      const message = err instanceof RecognizeError || err instanceof DiscogsError ? err.message : 'Unbekannter Fehler'
      setPhase({ state: 'error', message })
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      onPhoto(await fileToJpegBase64(file))
    } catch {
      setPhase({ state: 'error', message: 'Das Foto konnte nicht geöffnet werden.' })
    }
  }

  function reset() {
    setSides([])
    setNotes([])
    setCost(0)
    setScores(null)
    setPhase({ state: 'idle' })
  }

  const sorted = scores
    ? [...candidates].sort((a, b) => (scores.get(b.id)?.score ?? -1) - (scores.get(a.id)?.score ?? -1))
    : candidates
  const busy = phase.state === 'reading' || phase.state === 'comparing'

  return (
    <>
      {candidates.length > 1 && canUseAi && phase.state !== 'capturing' && (
        <div className="matrix-box">
          {sides.length === 0 ? (
            <>
              <strong>Genaue Pressung finden</strong>
              <span className="hint">
                Fotografiere die Auslaufrille (zwischen Rillen und Label). Claude liest die eingeritzte Matrixnummer und die App
                vergleicht sie mit {Math.min(candidates.length, MAX_CANDIDATES)} Pressungen bei Discogs.
              </span>
            </>
          ) : (
            <>
              <strong>Gelesene Matrix</strong>
              <dl>
                {sides.map((s, i) => (
                  <div key={i} style={{ display: 'contents' }}>
                    <dt>{s.side ? `Seite ${s.side}` : `Foto ${i + 1}`}</dt>
                    <dd className="mono">{s.text}</dd>
                  </div>
                ))}
              </dl>
              {notes.map((n, i) => <span key={i} className="hint">{n}</span>)}
              <span className="hint">Kosten bisher: {formatUsd(cost)}</span>
            </>
          )}
          {phase.state === 'reading' && <p className="muted" role="status">Claude liest die Matrix …</p>}
          {phase.state === 'comparing' && (
            <p className="muted" role="status">Vergleiche mit Discogs … {phase.done} von {phase.total}</p>
          )}
          {phase.state === 'error' && <p className="error" role="alert">{phase.message}</p>}
          <div className="stack-8">
            <button className="btn primary" disabled={busy} onClick={() => setPhase({ state: 'capturing' })}>
              {sides.length ? 'Andere Seite fotografieren' : 'Matrix fotografieren'}
            </button>
            {sides.length > 0 && <button className="btn ghost" disabled={busy} onClick={reset}>Matrix zurücksetzen</button>}
          </div>
        </div>
      )}

      {candidates.length > 1 && !canUseAi && (
        <p className="hint">Mit einem Claude-Schlüssel in den Einstellungen kannst du die Pressung über ein Foto der Matrixnummer eingrenzen.</p>
      )}

      {phase.state === 'capturing' && (
        <div className="stack-8">
          <CameraScanner active={visible} mode="photo" photoHint="Auslaufrille nah und scharf, Licht schräg" onDetected={() => {}} onPhoto={onPhoto} />
          <label className="btn ghost file-btn">
            Foto aus der Mediathek
            <input type="file" accept="image/*" onChange={onPickFile} />
          </label>
          <button className="btn ghost" onClick={() => setPhase({ state: 'idle' })}>Abbrechen</button>
          <p className="hint">
            Tipp: Die Gravur ist oft nur im Streiflicht lesbar. Halte die Taschenlampe (Blitz-Knopf) schräg oder kippe die Platte gegen
            eine Lampe. Pro Foto eine Seite.
          </p>
        </div>
      )}

      <ul className="results">
        {sorted.map((r) => (
          <li key={r.id}>
            <ResultCard result={r} match={scores?.get(r.id)} onOpen={() => onOpen(r.id, scores?.get(r.id))} />
          </li>
        ))}
      </ul>
      {scores && candidates.length > MAX_CANDIDATES && (
        <p className="hint">Verglichen wurden die ersten {MAX_CANDIDATES} von {candidates.length} Pressungen.</p>
      )}
    </>
  )
}

function ResultCard({ result, match, onOpen }: { result: SearchResult; match?: MatrixMatch; onOpen: () => void }) {
  const { artist, album } = splitTitle(result.title)
  const formats = (result.format ?? []).filter((f) => f !== 'Vinyl').slice(0, 3).join(', ')
  const meta = [result.country, result.year, result.catno].filter(Boolean).join(' · ')
  const badge = match && matchLabel(match.score)
  return (
    <button className="result" onClick={onOpen}>
      {result.thumb ? <img className="thumb" src={result.thumb} alt="" loading="lazy" /> : <div className="thumb" aria-hidden="true" />}
      <div className="result-text">
        <span className="result-title">{album}</span>
        {artist && <span className="result-artist">{artist}</span>}
        <span className="result-meta">{meta}</span>
        {formats && <span className="result-meta">{formats}</span>}
        {result.label?.[0] && <span className="result-meta">{result.label[0]}</span>}
        {badge && <span className={`badge ${badge.tone}`}>{badge.text}</span>}
      </div>
    </button>
  )
}
