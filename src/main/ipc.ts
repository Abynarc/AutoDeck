import { ipcMain, dialog, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { loadScenarios, saveScenarios, exportScenarios, importScenarios } from './storage'
import { loadSettings, saveSettings } from './settings'
import { runPrograms } from './launcher'
import { scanInstalled } from './scanner'
import { getAutoStartScenario, setAutoStartScenario, setAutoStartApp } from './autostart'
import type { Program, Scenario, Settings } from '../shared/types'

export function registerIpcHandlers(getWindow: () => BrowserWindow | null, onSettingsSaved: (settings: Settings) => void | Promise<void>) {
  function handle(channel: string, action: (window: BrowserWindow, ...args: any[]) => unknown) {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const window = getWindow()
      if (!window || window.isDestroyed() || event.sender !== window.webContents
        || event.senderFrame !== window.webContents.mainFrame) {
        throw new Error('Недопустимый источник запроса')
      }
      return action(window, ...args)
    })
  }
  handle('window:minimize', (window) => window.minimize())
  handle('window:toggle-maximize', (window) => {
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  handle('window:close', (window) => window.close())
  handle('scenarios:load', () => loadScenarios())
  handle('scenarios:save', (_window, scenarios: Scenario[]) => saveScenarios(scenarios))
  handle('scenarios:export', async (window) => {
    const json = await exportScenarios()
    const result = await dialog.showSaveDialog(window, {
      title: 'Экспорт сценариев', defaultPath: 'autodeck-scenarios.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!result.canceled && result.filePath) await fs.writeFile(result.filePath, json, 'utf-8')
  })
  handle('scenarios:import', async (window) => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Импорт сценариев', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return []
    return importScenarios(await fs.readFile(result.filePaths[0], 'utf-8'))
  })
  let running = false
  handle('launcher:run', async (_window, programs: Program[]) => {
    if (running) throw new Error('Сценарий уже запускается')
    running = true
    try { return await runPrograms(programs, await loadSettings()) } finally { running = false }
  })
  handle('scanner:scan', () => scanInstalled())
  handle('scanner:choose-executable', async (window) => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Выберите программу', properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Программы', extensions: ['exe'] }] : [],
    })
    const filename = result.filePaths[0]
    if (result.canceled || !filename) return null
    if (!(await fs.stat(filename)).isFile() || (process.platform === 'win32' && !/\.exe$/i.test(filename))) {
      throw new Error('Выберите исполняемый файл программы.')
    }
    return { path: filename, name: path.basename(filename).replace(/\.exe$/i, '') }
  })
  handle('autostart:get', () => getAutoStartScenario())
  handle('autostart:set', (_window, id: string | null) => setAutoStartScenario(id))
  handle('autostart:app:get', async () => (await loadSettings()).launchAtLogin)
  handle('autostart:app:set', (_window, enabled: boolean) => setAutoStartApp(enabled))
  handle('settings:load', () => loadSettings())
  handle('settings:save', async (_window, settings: Settings) => {
    await saveSettings(settings)
    await onSettingsSaved(settings)
  })
}
