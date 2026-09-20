import type { Settings } from '../shared/types'
import { createDefaultData, loadAll, updateData } from './storage'

export async function loadSettings(): Promise<Settings> {
  return (await loadAll())?.settings ?? createDefaultData().settings
}

export function saveSettings(settings: Settings): Promise<void> {
  const snapshot = structuredClone(settings)
  return updateData((data) => { data.settings = snapshot })
}
