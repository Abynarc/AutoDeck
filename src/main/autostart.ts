import { app } from 'electron'
import { loadAll, updateData } from './storage'
import { runPrograms } from './launcher'
import type { RunEvent } from '../shared/types'

export async function configureAutoStart(): Promise<void> {
  // Development must not register the Electron executable as a login application.
  if (process.platform !== 'win32' || !app.isPackaged) return
  const data = await loadAll()
  const scenarioId = data?.autoStartScenarioId ?? null
  const openAtLogin = Boolean(data?.settings.launchAtLogin || scenarioId !== null)
  app.setLoginItemSettings({
    openAtLogin,
    path: process.execPath,
    args: scenarioId === null ? [] : ['--autostart'],
  })
}

export async function getAutoStartScenario(): Promise<string | null> {
  return (await loadAll())?.autoStartScenarioId ?? null
}

export async function setAutoStartScenario(scenarioId: string | null): Promise<void> {
  if (scenarioId !== null && (typeof scenarioId !== 'string' || !scenarioId)) {
    throw new Error('Некорректный идентификатор сценария')
  }
  await updateData((data) => {
    if (scenarioId !== null && !data.scenarios.some((scenario) => scenario.id === scenarioId)) {
      throw new Error('Сценарий не найден')
    }
    data.autoStartScenarioId = scenarioId
  })
  if (process.platform === 'win32' && app.isPackaged) {
    const data = await loadAll()
    app.setLoginItemSettings({
      openAtLogin: Boolean(data?.settings.launchAtLogin || scenarioId !== null),
      path: process.execPath,
      args: scenarioId === null ? [] : ['--autostart'],
    })
  }
}

export async function setAutoStartApp(enabled: boolean): Promise<void> {
  if (typeof enabled !== 'boolean') throw new Error('Некорректное значение автозапуска')
  await updateData((data) => { data.settings.launchAtLogin = enabled })
  await configureAutoStart()
}

export async function runAutoStartScenario(args: string[]): Promise<RunEvent[]> {
  if (process.platform !== 'win32' || !args.includes('--autostart')) return []
  const data = await loadAll()
  const scenario = data?.scenarios.find((item) => item.id === data.autoStartScenarioId)
  return data && scenario ? runPrograms(scenario.programs, data.settings) : []
}
