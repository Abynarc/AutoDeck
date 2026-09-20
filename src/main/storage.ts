import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { AppData, Program, Scenario, Settings } from '../shared/types'

const DATA_FILE = 'autodeck-data.json'
let writes: Promise<void> = Promise.resolve()

export function createDefaultData(): AppData {
  return {
    scenarios: [],
    settings: {
      accentGradient: ['#6e3eff', '#a855f7'],
      launchDelayMs: 1000,
      closeToTray: true,
      launchAtLogin: false,
    },
    autoStartScenarioId: null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProgram(value: unknown): value is Program {
  return isRecord(value) && typeof value.name === 'string' && typeof value.path === 'string'
}

function isScenario(value: unknown): value is Scenario {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
    && typeof value.icon === 'string' && Array.isArray(value.programs)
    && value.programs.every(isProgram)
}

function isSettings(value: unknown): value is Settings {
  return isRecord(value) && Array.isArray(value.accentGradient)
    && value.accentGradient.length === 2
    && value.accentGradient.every((color) => typeof color === 'string')
    && typeof value.launchDelayMs === 'number' && Number.isFinite(value.launchDelayMs)
    && value.launchDelayMs >= 0 && typeof value.closeToTray === 'boolean'
    && (value.launchAtLogin === undefined || typeof value.launchAtLogin === 'boolean')
}

function assertAppData(value: unknown): asserts value is AppData {
  if (!isRecord(value) || !Array.isArray(value.scenarios)
    || !value.scenarios.every(isScenario) || !isSettings(value.settings)
    || !(value.autoStartScenarioId === null || typeof value.autoStartScenarioId === 'string')) {
    throw new Error('Некорректный формат данных AutoDeck')
  }
}

function getDataPath(): string {
  return path.join(app.getPath('userData'), DATA_FILE)
}

export async function loadAll(): Promise<AppData | null> {
  let raw: string
  try {
    raw = await fs.readFile(getDataPath(), 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  const data: unknown = JSON.parse(raw)
  assertAppData(data)
  data.settings.launchAtLogin ??= false
  return data
}

async function writeData(data: AppData): Promise<void> {
  assertAppData(data)
  const destination = getDataPath()
  const temporary = `${destination}.tmp`
  await fs.mkdir(path.dirname(destination), { recursive: true })
  try {
    await fs.writeFile(temporary, JSON.stringify(data, null, 2), 'utf-8')
    await fs.rename(temporary, destination)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

function enqueueWrite(operation: () => Promise<void>): Promise<void> {
  const result = writes.then(operation)
  // A failed write must not block subsequent saves.
  writes = result.catch(() => {})
  return result
}

export function saveAll(data: AppData): Promise<void> {
  const snapshot = structuredClone(data)
  return enqueueWrite(() => writeData(snapshot))
}

export function updateData(update: (data: AppData) => void): Promise<void> {
  return enqueueWrite(async () => {
    const data = (await loadAll()) ?? createDefaultData()
    update(data)
    await writeData(data)
  })
}

export async function loadScenarios(): Promise<Scenario[]> {
  return (await loadAll())?.scenarios ?? []
}

export function saveScenarios(scenarios: Scenario[]): Promise<void> {
  const snapshot = structuredClone(scenarios)
  return updateData((data) => {
    data.scenarios = snapshot
    if (!snapshot.some((scenario) => scenario.id === data.autoStartScenarioId)) {
      data.autoStartScenarioId = null
    }
  })
}

export async function exportScenarios(): Promise<string> {
  return JSON.stringify(await loadScenarios(), null, 2)
}

export async function importScenarios(json: string): Promise<Scenario[]> {
  const imported: unknown = JSON.parse(json)
  if (!Array.isArray(imported) || !imported.every(isScenario)) {
    throw new Error('Некорректный формат сценариев')
  }
  return imported
}
