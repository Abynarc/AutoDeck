import { useRef, useState } from 'react'
import type { Program } from '../../shared/types'
import { useStore } from '../store'
import ProgramItem from './ProgramItem'

interface ProgramListProps {
  programs: Program[]
  scenarioId: string
  onAddClick?: () => void
  disabled?: boolean
}

export default function ProgramList({ programs, scenarioId, onAddClick, disabled = false }: ProgramListProps) {
  const moveProgram = useStore((state) => state.moveProgram)
  const removeProgram = useStore((state) => state.removeProgram)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)

  async function change(action: () => Promise<void>) {
    if (pending.current || disabled) return
    pending.current = true
    setBusy(true)
    setError(null)
    try { await action() } catch { setError('Не удалось сохранить список программ. Попробуйте ещё раз.') }
    finally { pending.current = false; setBusy(false) }
  }

  return (
    <section className="program-section" aria-label="Программы сценария" aria-busy={busy}>
      {programs.length === 0 && <p className="editor-muted">В сценарии пока нет программ.</p>}
      <ol className="program-list">
        {programs.map((program, index) => <ProgramItem key={`${program.path}-${index}`} program={program}
          index={index} total={programs.length} disabled={disabled || busy}
          onMoveUp={() => { void change(() => moveProgram(scenarioId, index, index - 1)) }}
          onMoveDown={() => { void change(() => moveProgram(scenarioId, index, index + 1)) }}
          onRemove={() => { void change(() => removeProgram(scenarioId, index)) }} />)}
      </ol>
      {error && <p className="editor-error" role="alert">{error}</p>}
      <button type="button" className="editor-button program-add" disabled={disabled || busy || !onAddClick} onClick={onAddClick}>+ Добавить программу</button>
    </section>
  )
}
