import { useRef, useState } from 'react'
import type { Scenario } from '../../shared/types'
import { useStore } from '../store'
import ProgramList from './ProgramList'
import AddProgramModal from './AddProgramModal'
import '../styles/editor.css'

const SCENARIO_ICONS = ['🚀', '💼', '🎨', '🎬', '🎵', '🎮', '📚', '🧪', '🛠️', '🌐', '💡', '⚡', '🔒', '📊', '🧭', '☕']

export default function ScenarioEditor() {
  const scenarios = useStore((state) => state.scenarios)
  const selectedId = useStore((state) => state.selectedId)
  const scenario = scenarios.find((item) => item.id === selectedId)
  if (!scenario) return <main className="scenario-content glass"><h2>Ваши сценарии</h2><p>Создайте сценарий кнопкой «+» в списке.</p></main>
  // Changing selection discards drafts and errors belonging to the previous scenario.
  return <Editor key={scenario.id} scenario={scenario} />
}

function Editor({ scenario }: { scenario: Scenario }) {
  const updateScenario = useStore((state) => state.updateScenario)
  const removeScenario = useStore((state) => state.removeScenario)
  const runScenario = useStore((state) => state.runScenario)
  const toggleAutoStart = useStore((state) => state.toggleAutoStart)
  const autoStartId = useStore((state) => state.autoStartScenarioId)
  const isRunning = useStore((state) => state.isRunning)
  const runEvents = useStore((state) => state.runEvents)
  const runScenarioId = useStore((state) => state.runScenarioId)
  const [editing, setEditing] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [draft, setDraft] = useState(scenario.name)
  const [draftIcon, setDraftIcon] = useState(scenario.icon)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const disabled = busy || isRunning
  const events = runScenarioId === scenario.id ? runEvents : []
  const successes = events.filter((event) => event.type === 'success').length
  const errors = events.filter((event) => event.type === 'error')

  async function perform(action: () => Promise<void>) {
    if (pending.current || isRunning) return
    pending.current = true
    setBusy(true)
    setError(null)
    try { await action() } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось выполнить действие. Попробуйте ещё раз.')
    } finally { pending.current = false; setBusy(false) }
  }

  function edit() { setDraft(scenario.name); setDraftIcon(scenario.icon); setEditing(true); setConfirmDelete(false); setError(null) }

  return (
    <main className="scenario-content scenario-editor glass" aria-label="Редактор сценария">
      <div className="editor-header">
        <h2 className="editor-title"><span aria-hidden="true">{scenario.icon}</span> {scenario.name}</h2>
        <div className="editor-actions">
          <button type="button" className="editor-button editor-icon-button" title="Редактировать" aria-label="Редактировать" disabled={disabled} onClick={edit}>✎</button>
          <button type="button" className="editor-button editor-primary" disabled={disabled || scenario.programs.length === 0}
            onClick={() => { void perform(() => runScenario(scenario.id)) }}>{isRunning && runScenarioId === scenario.id ? 'Запуск…' : '▶ Запустить всё'}</button>
        </div>
      </div>
      {editing && <form className="editor-rename glass-panel" onSubmit={(event) => {
        event.preventDefault()
        if (!draft.trim()) { setError('Введите название сценария.'); return }
        void perform(async () => { await updateScenario(scenario.id, { name: draft.trim(), icon: draftIcon }); setEditing(false) })
      }}>
        <fieldset className="icon-picker">
          <legend>Иконка сценария</legend>
          <div className="icon-options">{SCENARIO_ICONS.map((icon) => <button key={icon} type="button" className={`icon-option${draftIcon === icon ? ' is-selected' : ''}`} aria-label={`Выбрать иконку ${icon}`} aria-pressed={draftIcon === icon} disabled={disabled} onClick={() => setDraftIcon(icon)}>{icon}</button>)}</div>
        </fieldset>
        <label htmlFor="scenario-name">Название сценария</label>
        <input id="scenario-name" autoFocus value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape' && !disabled) { setEditing(false); setError(null) } }} />
        <div className="editor-actions">
          <button type="submit" className="editor-button editor-primary" disabled={disabled}>Сохранить название</button>
          <button type="button" className="editor-button" disabled={disabled} onClick={() => { setEditing(false); setError(null) }}>Отмена</button>
        </div>
      </form>}
      {error && <p className="editor-error" role="alert">{error}</p>}
      <ProgramList programs={scenario.programs} scenarioId={scenario.id} disabled={disabled} onAddClick={() => setShowAddModal(true)} />
      {showAddModal && <AddProgramModal scenarioId={scenario.id} onClose={() => setShowAddModal(false)} />}
      <label className="editor-autostart glass-panel">
        <input type="checkbox" role="switch" checked={autoStartId === scenario.id} disabled={disabled}
          onChange={() => { void perform(() => toggleAutoStart(scenario.id)) }} />
        <span>Запускать при старте Windows<small>Автозапуск сценария «{scenario.name}»</small></span>
      </label>
      {isRunning && runScenarioId === scenario.id && <p className="editor-status glass-panel" role="status">Запускаем программы…</p>}
      {!isRunning && events.length > 0 && <div className="editor-status glass-panel" role="status">
        <p>Запущено: {successes} из {events.at(-1)?.total ?? 0}. Ошибок: {errors.length}.</p>
        {errors.length > 0 && <ul>{errors.map((event, index) => <li key={index}>{event.program.name}: {event.error}</li>)}</ul>}
      </div>}
      <div className="editor-delete">
        {confirmDelete ? <div className="editor-confirm glass-panel">
          <p>Удалить сценарий «{scenario.name}»? Программы останутся на компьютере.</p>
          <div className="editor-actions">
            <button type="button" className="editor-button editor-danger" disabled={disabled} onClick={() => { void perform(() => removeScenario(scenario.id)) }}>Подтвердить удаление</button>
            <button type="button" className="editor-button" disabled={disabled} onClick={() => setConfirmDelete(false)}>Отмена</button>
          </div>
        </div> : <button type="button" className="editor-button editor-danger" disabled={disabled}
          onClick={() => { setConfirmDelete(true); setEditing(false) }}>Удалить сценарий</button>}
      </div>
    </main>
  )
}
