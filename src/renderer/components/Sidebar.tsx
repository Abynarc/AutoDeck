import { useRef, useState } from 'react'
import { useStore } from '../store'
import ScenarioItem from './ScenarioItem'
import '../styles/sidebar.css'

export default function Sidebar() {
  const scenarios = useStore((state) => state.scenarios)
  const selectedId = useStore((state) => state.selectedId)
  const selectScenario = useStore((state) => state.selectScenario)
  const addScenario = useStore((state) => state.addScenario)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)

  async function add() {
    if (pending.current) return
    pending.current = true
    setAdding(true)
    setError(null)
    try { await addScenario() } catch {
      setError('Не удалось создать сценарий. Попробуйте ещё раз.')
    } finally { pending.current = false; setAdding(false) }
  }

  return (
    <aside className="sidebar glass" aria-label="Сценарии">
      <div className="sidebar-header">
        <h2>Сценарии</h2>
        <button className="sidebar-add" type="button" title="Создать сценарий" aria-label="Создать сценарий"
          disabled={adding} aria-busy={adding} onClick={() => { void add() }}><span aria-hidden="true">{adding ? '…' : '+'}</span></button>
      </div>
      {error && <p className="sidebar-error" role="alert">{error}</p>}
      <nav className="scenario-list" aria-label="Выбор сценария">
        {scenarios.map((scenario) => <ScenarioItem key={scenario.id} scenario={scenario}
          isActive={scenario.id === selectedId} onClick={() => selectScenario(scenario.id)} />)}
        {scenarios.length === 0 && <p className="sidebar-empty">Сценариев пока нет. Нажмите «+», чтобы создать первый.</p>}
      </nav>
      <div className="sidebar-copyright">© flowminner</div>
    </aside>
  )
}
