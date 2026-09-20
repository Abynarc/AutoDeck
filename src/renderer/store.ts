import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { ElectronAPI, Program, RunEvent, Scenario, Settings } from '../shared/types'

export interface AppState {
  scenarios: Scenario[]
  selectedId: string | null
  settings: Settings
  autoStartScenarioId: string | null
  isRunning: boolean
  runEvents: RunEvent[]
  runScenarioId: string | null
  scannedPrograms: Program[]
  error: string | null
  loadAll(): Promise<void>
  selectScenario(id: string): void
  addScenario(): Promise<void>
  updateScenario(id: string, patch: Partial<Omit<Scenario, 'id'>>): Promise<void>
  removeScenario(id: string): Promise<void>
  addProgram(scenarioId: string, program: Program): Promise<void>
  removeProgram(scenarioId: string, index: number): Promise<void>
  moveProgram(scenarioId: string, from: number, to: number): Promise<void>
  runScenario(scenarioId: string): Promise<void>
  updateSettings(settings: Settings): Promise<void>
  toggleAutoStart(scenarioId: string | null): Promise<void>
  exportScenarios(): Promise<void>
  importScenarios(): Promise<void>
  scanPrograms(): Promise<void>
}

function applyAccent(settings: Settings) {
  document.documentElement.style.setProperty('--accent-1', settings.accentGradient[0])
  document.documentElement.style.setProperty('--accent-2', settings.accentGradient[1])
}

export function createAppStore(getApi: () => ElectronAPI) {
  // Compute changes inside the queue, using state from the preceding successful save.
  let mutations = Promise.resolve()
  return create<AppState>((set, get) => {
    async function perform(operation: () => Promise<void>) {
      set({ error: null })
      try { await operation() } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) })
        throw error
      }
    }
    function enqueue(operation: () => Promise<void>) {
      const result = mutations.then(() => perform(operation))
      mutations = result.catch(() => {})
      return result
    }
    function findScenario(id: string) {
      const scenario = get().scenarios.find((item) => item.id === id)
      if (!scenario) throw new Error('Сценарий не найден')
      return scenario
    }
    async function saveScenarios(scenarios: Scenario[]) {
      await getApi().scenarios.save(scenarios)
      const current = get()
      set({
        scenarios,
        selectedId: scenarios.some((item) => item.id === current.selectedId)
          ? current.selectedId : scenarios[0]?.id ?? null,
        autoStartScenarioId: scenarios.some((item) => item.id === current.autoStartScenarioId)
          ? current.autoStartScenarioId : null,
      })
    }
    async function changePrograms(id: string, transform: (programs: Program[]) => Program[]) {
      const scenario = findScenario(id)
      const programs = transform([...scenario.programs])
      await saveScenarios(get().scenarios.map((item) => item.id === id ? { ...item, programs } : item))
    }
    function checkIndex(programs: Program[], index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= programs.length) {
        throw new Error('Программа не найдена')
      }
    }
    return {
      scenarios: [], selectedId: null, autoStartScenarioId: null,
      settings: { accentGradient: ['#6e3eff', '#a855f7'], launchDelayMs: 1000, closeToTray: true, launchAtLogin: false },
      isRunning: false, runEvents: [], runScenarioId: null, scannedPrograms: [], error: null,

      loadAll: () => enqueue(async () => {
        const api = getApi()
        const [scenarios, settings, autoStartScenarioId] = await Promise.all([
          api.scenarios.load(), api.settings.load(), api.autostart.get(),
        ])
        applyAccent(settings)
        set({ scenarios, settings, autoStartScenarioId,
          selectedId: scenarios.some((item) => item.id === get().selectedId)
            ? get().selectedId : scenarios[0]?.id ?? null })
      }),

      selectScenario(id) {
        if (get().scenarios.some((item) => item.id === id)) set({ selectedId: id })
      },

      addScenario: () => enqueue(async () => {
        const scenario: Scenario = { id: nanoid(), name: 'Новый сценарий', icon: '📋', programs: [] }
        await saveScenarios([...get().scenarios, scenario])
        set({ selectedId: scenario.id })
      }),

      updateScenario(id, patch) {
        const snapshot = structuredClone(patch)
        return enqueue(async () => {
          findScenario(id)
          await saveScenarios(get().scenarios.map((item) => item.id === id ? { ...item, ...snapshot, id } : item))
        })
      },

      removeScenario: (id) => enqueue(async () => {
        findScenario(id)
        // Storage clears the autostart reference in the same write as this deletion.
        await saveScenarios(get().scenarios.filter((item) => item.id !== id))
      }),

      addProgram(id, program) {
        const snapshot = structuredClone(program)
        return enqueue(() => changePrograms(id, (programs) => [...programs, snapshot]))
      },

      removeProgram: (id, index) => enqueue(() => changePrograms(id, (programs) => {
        checkIndex(programs, index)
        programs.splice(index, 1)
        return programs
      })),

      moveProgram: (id, from, to) => enqueue(() => changePrograms(id, (programs) => {
        checkIndex(programs, from)
        checkIndex(programs, to)
        const [program] = programs.splice(from, 1)
        programs.splice(to, 0, program)
        return programs
      })),

      async runScenario(id) {
        await mutations
        return perform(async () => {
          if (get().isRunning) throw new Error('Сценарий уже запускается')
          const scenario = findScenario(id)
          if (!scenario.programs.length) { set({ runEvents: [], runScenarioId: id }); return }
          set({ isRunning: true, runEvents: [], runScenarioId: id })
          try {
            const runEvents = await getApi().launcher.run(structuredClone(scenario.programs))
            set({ runEvents })
          } finally { set({ isRunning: false }) }
        })
      },

      updateSettings(settings) {
        const snapshot = structuredClone(settings)
        return enqueue(async () => {
          await getApi().settings.save(snapshot)
          applyAccent(snapshot)
          set({ settings: snapshot })
        })
      },

      toggleAutoStart: (id) => enqueue(async () => {
        if (id !== null) findScenario(id)
        const autoStartScenarioId = get().autoStartScenarioId === id ? null : id
        await getApi().autostart.set(autoStartScenarioId)
        set({ autoStartScenarioId })
      }),

      exportScenarios: () => enqueue(() => getApi().scenarios.exportAll()),

      importScenarios: () => enqueue(async () => {
        const imported = await getApi().scenarios.importAll()
        const scenarios = [...get().scenarios]
        const names = new Set(scenarios.map((item) => item.name.trim().toLocaleLowerCase('ru')))
        const ids = new Set(scenarios.map((item) => item.id))
        let firstId: string | null = null
        for (const item of imported) {
          const name = item.name.trim().toLocaleLowerCase('ru')
          if (names.has(name)) continue
          let id = item.id
          while (!id || ids.has(id)) id = nanoid()
          scenarios.push({ ...item, id })
          names.add(name)
          ids.add(id)
          firstId ??= id
        }
        if (firstId === null) return
        await saveScenarios(scenarios)
        set({ selectedId: firstId })
      }),

      scanPrograms: () => perform(async () => {
        const scannedPrograms = await getApi().scanner.scanInstalled()
        set({ scannedPrograms })
      }),
    }
  })
}

export const useStore = createAppStore(() => window.electronAPI)
