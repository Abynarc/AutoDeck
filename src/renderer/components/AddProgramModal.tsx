import { useEffect, useRef, useState } from 'react'
import type { Program } from '../../shared/types'
import { programFromInput } from '../../shared/program-input'
import { useStore } from '../store'
import Modal from './Modal'

export default function AddProgramModal({ onClose, scenarioId }: { onClose: () => void; scenarioId: string }) {
  const addProgram = useStore((state) => state.addProgram)
  const [programs, setPrograms] = useState<Program[]>([])
  const [scanning, setScanning] = useState(true)
  const [scanError, setScanError] = useState(false)
  const [scanAttempt, setScanAttempt] = useState(0)
  const [customPath, setCustomPath] = useState('')
  const [customName, setCustomName] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)

  useEffect(() => {
    let active = true
    setScanning(true)
    setScanError(false)
    useStore.getState().scanPrograms().then(() => {
      if (active) setPrograms(useStore.getState().scannedPrograms)
    }).catch(() => { if (active) setScanError(true) })
      .finally(() => { if (active) setScanning(false) })
    return () => { active = false }
  }, [scanAttempt])

  async function perform(action: () => Promise<void>, message = 'Не удалось добавить программу. Попробуйте ещё раз.') {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(null)
    try { await action() } catch { setError(message) }
    finally { pending.current = false; setBusy(false) }
  }
  async function add(program: Program) {
    await addProgram(scenarioId, program)
    onClose()
  }
  const found = programs.filter((program) => `${program.name} ${program.path}`.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')))

  return <Modal title="Добавить программу" onClose={onClose} busy={busy}
    footer={error ? <p className="modal-error" role="alert">{error}</p> : undefined}>
    <form className="modal-form" onSubmit={(event) => {
      event.preventDefault()
      try {
        const program = programFromInput(customPath, customName)
        void perform(() => add(program))
      } catch (error) { setError(error instanceof Error ? error.message : 'Проверьте путь к программе.') }
    }}>
      <label htmlFor="program-name">Название (необязательно)</label>
      <input id="program-name" value={customName} onChange={(event) => setCustomName(event.target.value)} disabled={busy} />
      <label htmlFor="program-path">Полный путь к программе</label>
      <input id="program-path" value={customPath} placeholder="C:\Program Files\App\App.exe" onChange={(event) => setCustomPath(event.target.value)} disabled={busy} />
      <div className="modal-actions">
        <button type="button" className="modal-button" disabled={busy} onClick={() => { void perform(async () => {
          const selected = await window.electronAPI.scanner.chooseExecutable()
          if (selected) { setCustomPath(selected.path); setCustomName((name) => name || selected.name) }
        }, 'Не удалось выбрать файл программы. Попробуйте ещё раз.') }}>Выбрать файл…</button>
        <button className="modal-button modal-primary" type="submit" disabled={busy || !customPath.trim()}>{busy ? 'Подождите…' : 'Добавить'}</button>
      </div>
    </form>
    <section className="modal-section" aria-label="Установленные программы">
      <h3>Найденные программы</h3>
      {scanning ? <p role="status">Поиск программ…</p> : scanError ? <div role="alert"><p>Не удалось найти программы. Можно указать путь вручную.</p>
        <button className="modal-button" type="button" disabled={busy} onClick={() => setScanAttempt((value) => value + 1)}>Повторить поиск</button></div>
        : programs.length === 0 ? <p>Программы не найдены. Выберите файл или укажите путь вручную.</p> : <>
          <label htmlFor="program-search">Поиск по названию или пути</label>
          <input id="program-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <ul className="found-programs">{found.map((program) => <li key={program.path}>
            <button type="button" className="found-program modal-button" disabled={busy} onClick={() => { void perform(() => add(program)) }}>
              <strong>{program.name}</strong><span>{program.path}</span>
            </button></li>)}</ul>
          {found.length === 0 && <p>По вашему запросу ничего не найдено.</p>}
        </>}
    </section>
  </Modal>
}
