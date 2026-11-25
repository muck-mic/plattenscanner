import { useState } from 'react'
import { getIdentity, DiscogsError } from '../lib/discogs'
import { checkApiKey, MODELS, RecognizeError, type ModelChoice } from '../lib/recognize'
import { currentMonth, formatUsd, type Settings, type UpdateSettings } from '../lib/settings'
import { BUILD_ID } from '../lib/update'

interface Props {
  settings: Settings
  update: UpdateSettings
}

type Check = { state: 'idle' } | { state: 'checking' } | { state: 'ok'; message: string } | { state: 'error'; message: string }

export default function SettingsScreen({ settings, update }: Props) {
  return (
    <div className="screen">
      <h1 className="title">Einstellungen</h1>
      <DiscogsSection settings={settings} update={update} />
      <ClaudeSection settings={settings} update={update} />
      <p className="hint">App-Version {BUILD_ID}</p>
    </div>
  )
}

function DiscogsSection({ settings, update }: Props) {
  const [token, setToken] = useState(settings.discogsToken)
  const [check, setCheck] = useState<Check>({ state: 'idle' })
  const dirty = token.trim() !== settings.discogsToken

  async function saveAndCheck() {
    const t = token.trim()
    setCheck({ state: 'checking' })
    try {
      const me = await getIdentity(t)
      update({ discogsToken: t, discogsUsername: me.username })
      setCheck({ state: 'idle' })
    } catch (e) {
      update({ discogsToken: t, discogsUsername: '' })
      setCheck({ state: 'error', message: e instanceof DiscogsError ? e.message : 'Unbekannter Fehler' })
    }
  }

  function removeToken() {
    setToken('')
    update({ discogsToken: '', discogsUsername: '' })
    setCheck({ state: 'idle' })
  }

  return (
    <>
      <h2 className="group-label">Discogs</h2>
      <div className="group">
        <label className="row">
          <span>Token</span>
          <input className="row-input" type="password" autoComplete="off" autoCapitalize="off" spellCheck={false}
            placeholder="einfügen" value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
        <div className="row">
          <span>Benutzer</span>
          {settings.discogsUsername ? <span className="ok">{settings.discogsUsername} ✓</span> : <span className="muted">nicht verbunden</span>}
        </div>
      </div>
      {check.state === 'error' && <p className="error" role="alert">{check.message}</p>}
      <div className="stack-8">
        <button className="btn primary" disabled={!token.trim() || check.state === 'checking'} onClick={saveAndCheck}>
          {check.state === 'checking' ? 'Prüfe …' : dirty || !settings.discogsUsername ? 'Speichern & prüfen' : 'Verbindung erneut prüfen'}
        </button>
        {settings.discogsToken && <button className="btn ghost danger" onClick={removeToken}>Token entfernen</button>}
      </div>
      <p className="hint">
        Das Token erzeugst du auf discogs.com unter Einstellungen → Entwickler → „Generate new token“. Es bleibt nur auf diesem Gerät gespeichert.
      </p>
    </>
  )
}

function ClaudeSection({ settings, update }: Props) {
  const [key, setKey] = useState(settings.anthropicKey)
  const [check, setCheck] = useState<Check>({ state: 'idle' })
  const dirty = key.trim() !== settings.anthropicKey
  const [monthName] = useState(() => new Date().toLocaleDateString('de-DE', { month: 'long' }))
  const monthCost = settings.costMonth === currentMonth() ? settings : { costUsd: 0, costScans: 0 }

  async function saveAndCheck() {
    const k = key.trim()
    update({ anthropicKey: k })
    setCheck({ state: 'checking' })
    try {
      await checkApiKey(k, settings.aiModel)
      setCheck({ state: 'ok', message: 'Schlüssel funktioniert ✓' })
    } catch (e) {
      setCheck({ state: 'error', message: e instanceof RecognizeError ? e.message : 'Unbekannter Fehler' })
    }
  }

  function removeKey() {
    setKey('')
    update({ anthropicKey: '' })
    setCheck({ state: 'idle' })
  }

  return (
    <>
      <h2 className="group-label">KI-Erkennung (Cover / Label)</h2>
      <div className="group">
        <label className="row">
          <span>Eingeschaltet</span>
          <input type="checkbox" className="switch" checked={settings.aiEnabled} onChange={(e) => update({ aiEnabled: e.target.checked })} />
        </label>
        <label className="row">
          <span>Claude-Schlüssel</span>
          <input className="row-input" type="password" autoComplete="off" autoCapitalize="off" spellCheck={false}
            placeholder="sk-ant-… einfügen" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <label className="row">
          <span>Modell</span>
          <select className="row-select" value={settings.aiModel} onChange={(e) => update({ aiModel: e.target.value as ModelChoice })}>
            {(Object.keys(MODELS) as ModelChoice[]).map((m) => <option key={m} value={m}>{MODELS[m].label}</option>)}
          </select>
        </label>
        <div className="row">
          <span>Kosten {monthName}</span>
          <span className="muted">{formatUsd(monthCost.costUsd)} · {monthCost.costScans} Scans</span>
        </div>
      </div>
      {check.state === 'error' && <p className="error" role="alert">{check.message}</p>}
      {check.state === 'ok' && <p className="ok" role="status">{check.message}</p>}
      <div className="stack-8">
        <button className="btn primary" disabled={!key.trim() || check.state === 'checking'} onClick={saveAndCheck}>
          {check.state === 'checking' ? 'Prüfe …' : dirty ? 'Speichern & prüfen' : 'Schlüssel prüfen'}
        </button>
        {settings.anthropicKey && <button className="btn ghost danger" onClick={removeKey}>Schlüssel entfernen</button>}
      </div>
      <p className="hint">
        Den Schlüssel erzeugst du auf console.anthropic.com unter „API Keys“ (vorher etwas Guthaben aufladen). Er bleibt nur auf diesem Gerät
        gespeichert. Die Prüfung kostet nichts. Die Kosten werden aus dem Verbrauch berechnet und sind eine Schätzung in US-Dollar.
      </p>
    </>
  )
}
