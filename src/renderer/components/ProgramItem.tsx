import type { Program } from '../../shared/types'

interface ProgramItemProps {
  program: Program
  index: number
  total: number
  disabled?: boolean
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export default function ProgramItem({ program, index, total, disabled = false, onRemove, onMoveUp, onMoveDown }: ProgramItemProps) {
  return (
    <li className="program-item glass-panel">
      <span className="program-number" aria-hidden="true">{index + 1}</span>
      <div className="program-info">
        <div className="program-name">{program.name}</div>
        <div className="program-path" title={program.path}>{program.path}</div>
      </div>
      <div className="program-actions">
        <button type="button" className="editor-button" aria-label={`Выше: ${program.name}`} title="Переместить выше" disabled={disabled || index === 0} onClick={onMoveUp}>↑</button>
        <button type="button" className="editor-button" aria-label={`Ниже: ${program.name}`} title="Переместить ниже" disabled={disabled || index === total - 1} onClick={onMoveDown}>↓</button>
        <button type="button" className="editor-button editor-danger" aria-label={`Удалить программу: ${program.name}`} title="Удалить из сценария" disabled={disabled} onClick={onRemove}>✕</button>
      </div>
    </li>
  )
}
