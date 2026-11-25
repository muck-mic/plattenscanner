import { useState } from 'react'
import { useSettings } from './lib/settings'
import ScanScreen from './screens/ScanScreen'
import SettingsScreen from './screens/SettingsScreen'
import { GearIcon, RecordIcon, ScanIcon } from './components/Icons'

type Tab = 'scan' | 'list' | 'settings'

const TABS: { id: Tab; label: string; Icon: () => React.JSX.Element }[] = [
  { id: 'scan', label: 'Scannen', Icon: ScanIcon },
  { id: 'list', label: 'Meine Liste', Icon: RecordIcon },
  { id: 'settings', label: 'Einstellungen', Icon: GearIcon },
]

export default function App() {
  const [settings, update] = useSettings()
  const [tab, setTab] = useState<Tab>(settings.discogsToken ? 'scan' : 'settings')

  return (
    <div className="app">
      <main className="content">
        {/* Screens stay mounted so form input and results survive tab switches. */}
        <div hidden={tab !== 'scan'}>
          <ScanScreen settings={settings} update={update} active={tab === 'scan'} goToSettings={() => setTab('settings')} />
        </div>
        <div hidden={tab !== 'list'}>
          <div className="screen">
            <h1 className="title">Meine Liste</h1>
            <div className="camera-placeholder">
              <p>Deine eigene Liste kommt in Phase 5.</p>
            </div>
          </div>
        </div>
        <div hidden={tab !== 'settings'}>
          <SettingsScreen settings={settings} update={update} />
        </div>
      </main>
      <nav className="tabbar" aria-label="Hauptnavigation">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={tab === id ? 'tab active' : 'tab'} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
