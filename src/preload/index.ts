import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../shared/types'

const api: ElectronAPI = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  scenarios: {
    load: () => ipcRenderer.invoke('scenarios:load'),
    save: (data) => ipcRenderer.invoke('scenarios:save', data),
    exportAll: () => ipcRenderer.invoke('scenarios:export'),
    importAll: () => ipcRenderer.invoke('scenarios:import'),
  },
  launcher: {
    run: (programs) => ipcRenderer.invoke('launcher:run', programs),
  },
  scanner: {
    scanInstalled: () => ipcRenderer.invoke('scanner:scan'),
    chooseExecutable: () => ipcRenderer.invoke('scanner:choose-executable'),
  },
  autostart: {
    get: () => ipcRenderer.invoke('autostart:get'),
    set: (id: string | null) => ipcRenderer.invoke('autostart:set', id),
    getApp: () => ipcRenderer.invoke('autostart:app:get'),
    setApp: (enabled: boolean) => ipcRenderer.invoke('autostart:app:set', enabled),
  },
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (s) => ipcRenderer.invoke('settings:save', s),
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
