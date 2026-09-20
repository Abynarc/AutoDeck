import { useRef, useState } from 'react'
import type { Settings } from '../../shared/types'
import { useStore } from '../store'
import Modal from './Modal'

const PRESETS: { name: string; colors: [string, string] }[] = [
  { name: 'Фиолетовый', colors: ['#6e3eff', '#a855f7'] },
  { name: 'Голубой', colors: ['#3b82f6', '#06b6d4'] },
  { name: 'Зелёный', colors: ['#10b981', '#34d399'] },
  { name: 'Оранжевый', colors: ['#f59e0b', '#f97316'] },
  { name: 'Красный', colors: ['#ef4444', '#f43f5e'] },
  { name: 'Розовый', colors: ['#ec4899', '#d946ef'] },
]

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useStore((state) => state.settings)
  const updateSettings = useStore((state) => state.updateSettings)
  const exportScenarios = useStore((state) => state.exportScenarios)
  const importScenarios = useStore((state) => state.importScenarios)
  const [draft, setDraft] = useState<Settings>(() => structuredClone(settings))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)

  async function perform(action: () => Promise<void>, message = 'Не удалось сохранить настройки. Попробуйте ещё раз.') {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(null)
    try { await action() } catch { setError(message) }
    finally { pending.current = false; setBusy(false) }
  }

  return <Modal title="Настройки" onClose={onClose} busy={busy} footer={<>
    {error && <p className="modal-error" role="alert">{error}</p>}
    <button type="button" className="modal-button" disabled={busy} onClick={onClose}>Отмена</button>
    <button type="button" className="modal-button modal-primary" disabled={busy} onClick={() => { void perform(async () => { await updateSettings(draft); onClose() }) }}>{busy ? 'Подождите…' : 'Сохранить'}</button>
  </>}>
    <fieldset disabled={busy} className="modal-section"><legend>Цвет акцента</legend>
      <div className="color-presets">{PRESETS.map((preset) => <button key={preset.name} type="button" className="color-preset"
        aria-label={preset.name} title={preset.name} aria-pressed={draft.accentGradient.every((color, index) => color === preset.colors[index])}
        style={{ background: `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]})` }}
        onClick={() => setDraft((value) => ({ ...value, accentGradient: [...preset.colors] }))} />)}</div>
      <div className="custom-colors">{[0, 1].map((index) => <label key={index}>Свой цвет {index + 1}
        <input type="color" aria-label={`Свой цвет ${index + 1}`} value={draft.accentGradient[index]} onChange={(event) => {
          const colors: [string, string] = [...draft.accentGradient]
          colors[index] = event.target.value
          setDraft((value) => ({ ...value, accentGradient: colors }))
        }} /></label>)}</div>
    </fieldset>
    <fieldset disabled={busy} className="modal-section"><legend>Интервал между запусками</legend>
      <div className="delay-control glass-panel">
        <input type="range" aria-label="Интервал между запусками" min={0} max={10000} step={500} value={draft.launchDelayMs}
          onChange={(event) => setDraft((value) => ({ ...value, launchDelayMs: Number(event.target.value) }))} />
        <output>{(draft.launchDelayMs / 1000).toLocaleString('ru')} с</output>
      </div>
    </fieldset>
    <fieldset disabled={busy} className="modal-section"><legend>При закрытии окна</legend>
      <label className="close-option glass-panel"><input type="radio" name="close-behavior" checked={draft.closeToTray} onChange={() => setDraft((value) => ({ ...value, closeToTray: true }))} /><span>Сворачивать в трей</span></label>
      <label className="close-option glass-panel"><input type="radio" name="close-behavior" checked={!draft.closeToTray} onChange={() => setDraft((value) => ({ ...value, closeToTray: false }))} /><span>Закрывать приложение</span></label>
    </fieldset>
    <label className="close-option auto-start-option glass-panel">
      <input type="checkbox" disabled={busy} checked={draft.launchAtLogin} onChange={(event) => setDraft((value) => ({ ...value, launchAtLogin: event.target.checked }))} />
      <span>Запускать AutoDeck при входе в Windows<small>Приложение будет запускаться в системном автозапуске</small></span>
    </label>
    <section className="modal-section"><h3>Сценарии</h3>
      <div className="modal-actions">
        <button type="button" className="modal-button" disabled={busy} onClick={() => { void perform(exportScenarios, 'Не удалось экспортировать сценарии. Проверьте доступ к файлу.') }}>Экспортировать</button>
        <button type="button" className="modal-button" disabled={busy} onClick={() => { void perform(importScenarios, 'Не удалось импортировать сценарии. Проверьте формат JSON и доступ к файлу.') }}>Импортировать</button>
      </div>
    </section>
  </Modal>
}
