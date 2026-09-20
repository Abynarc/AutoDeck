import { useEffect, useState } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import ScenarioEditor from './components/ScenarioEditor'
import SettingsModal from './components/SettingsModal'
import { useStore } from './store'
import './styles/layout.css'

export default function App() {
  const loadAll = useStore((state) => state.loadAll)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setFailed(false)
    loadAll().catch(() => { if (active) setFailed(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadAll, attempt])

  return (
    <div className="app-layout">
      <TitleBar onSettingsClick={() => setShowSettings(true)} settingsDisabled={loading || failed} />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {loading ? <p className="app-message glass" role="status">Загрузка сценариев…</p>
        : failed ? <div className="app-message glass" role="alert">
          <p>Не удалось загрузить данные.</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>Повторить</button>
        </div> : <div className="app-body">
          <Sidebar />
          <ScenarioEditor />
        </div>}
    </div>
  )
}
