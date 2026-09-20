const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const loadModule = require('./load-module.cjs')

const programs = [{ name: 'Первый', path: '/first' }, { name: 'Второй', path: '/second' }]
const settings = { launchDelayMs: 500, accentGradient: ['#000000', '#ffffff'], closeToTray: true }

test('launcher waits for spawn, reports errors and continues with the requested delay', async () => {
  const calls = []
  const optionsSeen = []
  const children = []
  const { runPrograms } = loadModule('main/launcher', {
    child_process: { spawn: (file, args, options) => {
      calls.push(file)
      assert.equal(options.shell, false)
      optionsSeen.push(options)
      const child = new EventEmitter()
      child.unref = () => calls.push('unref')
      children.push(child)
      return child
    } },
  }, { setTimeout: (callback, delay) => { calls.push(delay); callback() } })
  const pending = runPrograms(programs, settings)
  assert.deepEqual(calls, ['/first'])
  await assert.rejects(runPrograms(programs, settings), /уже запускается/)
  children[0].emit('error', new Error('ENOENT'))
  await new Promise(setImmediate)
  assert.deepEqual(calls, ['/first', 500, '/second'])
  children[1].emit('spawn')
  const events = await pending
  assert.deepEqual(events.map((event) => event.type), ['launching', 'error', 'launching', 'success', 'done'])
  assert.equal(events.at(-1).completed, 2)
  assert.deepEqual(calls, ['/first', 500, '/second', 'unref'])
  assert.equal(optionsSeen[0].cwd, '/')
  assert.deepEqual(await runPrograms([], settings), [{ type: 'done', completed: 0, total: 0 }])
  await assert.rejects(runPrograms([{ name: 'x', path: 'relative' }], settings))
})

test('window closes to a recoverable tray, settings apply immediately, explicit quit is allowed', async () => {
  const app = new EventEmitter()
  app.isPackaged = true
  app.requestSingleInstanceLock = () => true
  app.whenReady = () => Promise.resolve()
  app.isReady = () => true
  app.quit = () => app.emit('before-quit')
  let window
  let tray
  let settingsSaved
  let menu
  class Window extends EventEmitter {
    constructor() {
      super()
      window = this
      this.visible = false
      this.webContents = new EventEmitter()
      this.webContents.setWindowOpenHandler = (handler) => { this.openHandler = handler }
    }
    loadFile() { return Promise.resolve() }
    show() { this.visible = true }
    hide() { this.visible = false }
    focus() {}
    isMinimized() { return false }
  }
  class Tray extends EventEmitter {
    constructor() { super(); tray = this }
    setToolTip() {}
    setContextMenu(value) { menu = value }
    isDestroyed() { return false }
    destroy() { this.destroyed = true }
  }
  loadModule('main/index', {
    electron: { app, BrowserWindow: Window, Tray, nativeImage: { createFromPath: () => ({}) },
      Menu: { buildFromTemplate: (items) => items }, dialog: { showErrorBox: (title, message) => assert.fail(message) } },
    './settings': { loadSettings: async () => settings },
    './autostart': { configureAutoStart() {}, runAutoStartScenario: async () => [] },
    './ipc': { registerIpcHandlers: (getWindow, callback) => { settingsSaved = callback } },
  }, { process: { platform: 'win32', env: {}, argv: [], resourcesPath: 'C:\\resources' } })
  await new Promise(setImmediate)
  window.emit('ready-to-show')
  assert.equal(window.visible, true)
  let prevented = false
  window.emit('close', { preventDefault() { prevented = true } })
  assert.equal(prevented, true)
  assert.equal(window.visible, false)
  menu[0].click()
  assert.equal(window.visible, true)
  assert.deepEqual(window.openHandler(), { action: 'deny' })
  settingsSaved({ ...settings, closeToTray: false })
  prevented = false
  window.emit('close', { preventDefault() { prevented = true } })
  assert.equal(prevented, false)
  settingsSaved(settings)
  menu[2].click()
  window.emit('close', { preventDefault() { prevented = true } })
  assert.equal(prevented, false)
  app.emit('will-quit')
  assert.equal(tray.destroyed, true)
})

test('scanner does not access Windows facilities on macOS', async () => {
  const { scanInstalled } = loadModule('main/scanner', { electron: { shell: {} } }, { process: { platform: 'darwin' } })
  assert.deepEqual(await scanInstalled(), [])
})

test('scanner handles Unicode, deduplication, missing executables and Start Menu shortcuts', async () => {
  const entry = (name) => ({ name, isDirectory: () => false, isFile: () => true })
  const { scanInstalled } = loadModule('main/scanner', {
    child_process: { execFile: (command, args, options, callback) => {
      assert.equal(command, 'powershell.exe')
      assert.equal(options.encoding, 'utf8')
      callback(null, JSON.stringify(['"C:\\Программы\\Редактор.exe"', 'c:\\программы\\редактор.EXE', 'C:\\missing.exe', 'C:\\folder', 'C:\\Windows\\@Bios.exe', 'C:\\Apps\\Uninstall Helper.exe']))
    } },
    fs: { promises: {
      stat: async (file) => { if (file.includes('missing')) throw new Error('missing'); return { isFile: () => true } },
      readdir: async () => [entry('Музыка.lnk'), entry('С аргументами.lnk'), entry('Удаление.lnk')],
    } },
    electron: { shell: { readShortcutLink: (file) => ({ target: file.includes('Удаление') ? 'C:\\Apps\\uninstall.exe' : 'C:\\Music.exe', args: file.includes('аргументами') ? '--special' : '' }) } },
  }, { process: { platform: 'win32', env: { APPDATA: 'C:\\Users\\User' } } })
  const result = await scanInstalled()
  assert.equal(result.length, 2)
  assert.ok(result.some((item) => item.name === 'Музыка'))
  assert.ok(result.some((item) => item.path === 'C:\\Программы\\Редактор.exe'))
  assert.ok(result.every((item) => !/windows|uninstall/i.test(item.path)))
})

test('autostart preserves stored data, validates IDs and only registers packaged Windows builds', async () => {
  const data = { scenarios: [{ id: 'one', programs }], settings, autoStartScenarioId: null }
  const login = []
  const launches = []
  const globals = { process: { platform: 'win32', execPath: 'C:\\AutoDeck.exe' } }
  const mocks = {
    electron: { app: { isPackaged: true, setLoginItemSettings: (value) => login.push(value) } },
    './storage': { loadAll: async () => data, updateData: async (update) => update(data) },
    './launcher': { runPrograms: async (...args) => { launches.push(args); return [] } },
  }
  const api = loadModule('main/autostart', mocks, globals)
  await api.configureAutoStart()
  assert.deepEqual(login, [{ openAtLogin: false, path: 'C:\\AutoDeck.exe', args: [] }])
  await api.setAutoStartScenario('one')
  assert.deepEqual(login.at(-1), { openAtLogin: true, path: 'C:\\AutoDeck.exe', args: ['--autostart'] })
  await api.runAutoStartScenario(['app', '--autostart'])
  assert.deepEqual(launches, [[programs, settings]])
  await assert.rejects(api.setAutoStartScenario('missing'))
  await assert.rejects(api.setAutoStartScenario(42))
  assert.equal(await api.getAutoStartScenario(), 'one')
  await api.setAutoStartScenario(null)
  await api.runAutoStartScenario(['--autostart'])
  assert.equal(launches.length, 1)
  globals.process.platform = 'darwin'
  await api.configureAutoStart()
  assert.equal(login.length, 3)
  globals.process.platform = 'win32'
  mocks.electron.app.isPackaged = false
  await api.configureAutoStart()
  assert.equal(login.length, 3)
})

function ipcFixture() {
  const handlers = {}
  const state = { canceled: true, writes: [], saved: [], notifications: [], launches: [] }
  const window = { isDestroyed: () => false, webContents: { mainFrame: {} },
    minimize: () => state.minimized = true, close: () => state.closed = true,
    isMaximized: () => !!state.maximized, maximize: () => state.maximized = true, unmaximize: () => state.maximized = false }
  const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
  const api = loadModule('main/ipc', {
    electron: {
      ipcMain: { handle: (name, handler) => { handlers[name] = handler } },
      dialog: { showOpenDialog: async () => ({ canceled: state.canceled, filePaths: ['import.json'] }),
        showSaveDialog: async () => ({ canceled: state.canceled, filePath: 'export.json' }) },
    },
    fs: { promises: { stat: async () => ({ isFile: () => !state.directory }), readFile: async () => '[]', writeFile: async (...args) => state.writes.push(args) } },
    './storage': { loadScenarios: async () => [], saveScenarios: async (value) => state.saved.push(value),
      exportScenarios: async () => '[]', importScenarios: async (raw) => JSON.parse(raw) },
    './settings': { loadSettings: async () => settings, saveSettings: async (value) => { if (!value) throw new Error('invalid'); state.saved.push(value) } },
    './launcher': { runPrograms: async (...args) => { state.launches.push(args); if (state.run) return state.run() ; return [] } },
    './scanner': { scanInstalled: async () => programs },
    './autostart': { getAutoStartScenario: async () => null, setAutoStartScenario: async (id) => state.saved.push(id) },
  })
  api.registerIpcHandlers(() => window, (value) => state.notifications.push(value))
  return { handlers, state, event }
}

test('IPC cancellation matches the typed API, dialogs read/write only on confirmation', async () => {
  const { handlers, state, event } = ipcFixture()
  assert.equal(Object.keys(handlers).length, 16)
  await handlers['window:minimize'](event)
  assert.equal(state.minimized, true)
  await handlers['window:toggle-maximize'](event)
  assert.equal(state.maximized, true)
  await handlers['window:toggle-maximize'](event)
  assert.equal(state.maximized, false)
  await handlers['window:close'](event)
  assert.equal(state.closed, true)
  assert.throws(() => handlers['window:close']({ ...event, sender: {} }), /источник/)
  assert.deepEqual(await handlers['scenarios:import'](event), [])
  assert.equal(await handlers['scanner:choose-executable'](event), null)
  await handlers['scenarios:export'](event)
  assert.deepEqual(state.writes, [])
  state.canceled = false
  assert.deepEqual(await handlers['scanner:choose-executable'](event), { name: 'import.json', path: 'import.json' })
  state.directory = true
  await assert.rejects(handlers['scanner:choose-executable'](event), /исполняемый файл/)
  state.directory = false
  assert.deepEqual(await handlers['scenarios:import'](event), [])
  await handlers['scenarios:export'](event)
  assert.deepEqual(state.writes, [['export.json', '[]', 'utf-8']])
  await handlers['settings:save'](event, settings)
  assert.deepEqual(state.notifications, [settings])
  await assert.rejects(handlers['settings:save'](event, null))
  assert.equal(state.notifications.length, 1)
  assert.throws(() => handlers['scanner:scan']({ ...event, senderFrame: {} }), /источник/)
  assert.throws(() => handlers['scanner:scan']({ ...event, sender: {} }), /источник/)
})

test('IPC prevents overlapping manual launches and recovers after failure', async () => {
  const { handlers, state, event } = ipcFixture()
  let reject
  state.run = () => new Promise((resolve, fail) => { reject = fail })
  const pending = handlers['launcher:run'](event, programs)
  await new Promise(setImmediate)
  await assert.rejects(handlers['launcher:run'](event, programs), /уже запускается/)
  reject(new Error('failed'))
  await assert.rejects(pending, /failed/)
  state.run = undefined
  await handlers['launcher:run'](event, programs)
  assert.deepEqual(state.launches.at(-1), [programs, settings])
})

test('preload exposes only the typed bridge and forwards channel arguments', async () => {
  const calls = []
  let api
  loadModule('preload/index', { electron: {
    contextBridge: { exposeInMainWorld: (name, value) => { assert.equal(name, 'electronAPI'); api = value } },
    ipcRenderer: { invoke: async (...args) => { calls.push(args) } },
  } })
  await api.scenarios.load()
  await api.scenarios.save([])
  await api.scenarios.exportAll()
  await api.scenarios.importAll()
  await api.launcher.run(programs)
  await api.scanner.scanInstalled()
  await api.autostart.get()
  await api.autostart.set(null)
  await api.settings.load()
  await api.settings.save(settings)
  assert.deepEqual(calls.map((call) => call[0]), ['scenarios:load', 'scenarios:save', 'scenarios:export', 'scenarios:import', 'launcher:run', 'scanner:scan', 'autostart:get', 'autostart:set', 'settings:load', 'settings:save'])
  assert.equal(calls[4][1], programs)
  assert.equal(calls[9][1], settings)
  await api.window.minimize()
  await api.window.toggleMaximize()
  await api.window.close()
  assert.deepEqual(calls.slice(10), [['window:minimize'], ['window:toggle-maximize'], ['window:close']])
  await api.scanner.chooseExecutable()
  assert.deepEqual(calls.at(-1), ['scanner:choose-executable'])
})
