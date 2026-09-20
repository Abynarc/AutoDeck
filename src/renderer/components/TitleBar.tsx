import { useState } from 'react'
import iconUrl from '../assets/autodeck-icon.png'
import '../styles/titlebar.css'

interface TitleBarProps {
  onSettingsClick: () => void
  settingsDisabled?: boolean
}

export default function TitleBar({ onSettingsClick, settingsDisabled = false }: TitleBarProps) {
  const [error, setError] = useState<string | null>(null)
  async function control(action: 'minimize' | 'toggleMaximize' | 'close') {
    setError(null)
    try { await window.electronAPI.window[action]() } catch {
      setError('Не удалось выполнить действие с окном')
    }
  }
  return (
    <header className="titlebar glass">
      <div className="titlebar-brand"><img className="titlebar-icon" src={iconUrl} alt="" aria-hidden="true" /><h1 className="titlebar-name">AutoDeck</h1></div>
      {error && <span className="titlebar-error" role="alert">{error}</span>}
      <div className="titlebar-actions">
        <button type="button" className="titlebar-button titlebar-settings" title="Настройки" aria-label="Настройки" disabled={settingsDisabled} onClick={onSettingsClick}>⚙</button>
        <button type="button" className="titlebar-button" title="Свернуть" aria-label="Свернуть" onClick={() => { void control('minimize') }}>─</button>
        <button type="button" className="titlebar-button" title="Развернуть / восстановить" aria-label="Развернуть или восстановить окно" onClick={() => { void control('toggleMaximize') }}>□</button>
        <button type="button" className="titlebar-button titlebar-close" title="Закрыть" aria-label="Закрыть" onClick={() => { void control('close') }}>✕</button>
      </div>
    </header>
  )
}
