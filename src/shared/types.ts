export interface Program {
  name: string
  path: string
}

export interface Scenario {
  id: string
  name: string
  icon: string
  programs: Program[]
}

export interface Settings {
  accentGradient: [string, string]
  launchDelayMs: number
  closeToTray: boolean
  launchAtLogin: boolean
}

export interface AppData {
  scenarios: Scenario[]
  settings: Settings
  autoStartScenarioId: string | null
}

export type RunEvent =
  | { type: 'launching'; program: Program; completed: number; total: number }
  | { type: 'success'; program: Program; completed: number; total: number }
  | { type: 'error'; program: Program; error: string; completed: number; total: number }
  | { type: 'done'; completed: number; total: number }

export interface ElectronAPI {
  window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    close(): Promise<void>
  }
  scenarios: {
    load(): Promise<Scenario[]>
    save(scenarios: Scenario[]): Promise<void>
    exportAll(): Promise<void>
    importAll(): Promise<Scenario[]>
  }
  launcher: {
    run(programs: Program[]): Promise<RunEvent[]>
  }
  scanner: {
    scanInstalled(): Promise<Program[]>
    chooseExecutable(): Promise<Program | null>
  }
  autostart: {
    get(): Promise<string | null>
    set(scenarioId: string | null): Promise<void>
    getApp(): Promise<boolean>
    setApp(enabled: boolean): Promise<void>
  }
  settings: {
    load(): Promise<Settings>
    save(settings: Settings): Promise<void>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
