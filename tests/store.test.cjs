const { test } = require('node:test')
const assert = require('node:assert/strict')
const loadModule = require('./load-module.cjs')

const program = { name: 'Редактор', path: 'C:\\Editor.exe' }
const scenario = { id: 'one', name: 'Работа', icon: '💼', programs: [program] }
const defaults = { accentGradient: ['#123456', '#abcdef'], launchDelayMs: 500, closeToTray: true, launchAtLogin: false }

function fixture() {
  let id = 0
  const css = {}
  const state = { scenarios: [structuredClone(scenario)], settings: structuredClone(defaults), autoStart: 'one', saves: 0, imports: [], runs: 0 }
  const api = {
    scenarios: {
      load: async () => structuredClone(state.scenarios),
      save: async (value) => {
        if (state.fail) throw new Error('Не удалось сохранить')
        await new Promise(setImmediate)
        state.scenarios = structuredClone(value)
        if (!value.some(item => item.id === state.autoStart)) state.autoStart = null
        state.saves++
      },
      importAll: async () => structuredClone(state.imports),
      exportAll: async () => { state.exported = structuredClone(state.scenarios) },
    },
    settings: {
      load: async () => structuredClone(state.settings),
      save: async (value) => { if (state.fail) throw new Error('Не удалось сохранить'); state.settings = structuredClone(value) },
    },
    autostart: { get: async () => state.autoStart, set: async (id) => { state.autoStart = id } },
    launcher: { run: async (programs) => {
      state.runs++
      if (state.run) return state.run(programs)
      return [{ type: 'done', completed: programs.length, total: programs.length }]
    } },
    scanner: { scanInstalled: async () => [program] },
  }
  const { createAppStore } = loadModule('renderer/store', { nanoid: { nanoid: () => `new-${++id}` } }, {
    document: { documentElement: { style: { setProperty: (key, value) => { css[key] = value } } } },
  })
  const store = createAppStore(() => api)
  return { store, state, api, css }
}

test('load and settings apply accent only after successful persistence', async () => {
  const { store, state, css } = fixture()
  await store.getState().loadAll()
  assert.equal(store.getState().selectedId, 'one')
  assert.equal(css['--accent-1'], '#123456')
  const settings = { ...defaults, accentGradient: ['#ffffff', '#000000'] }
  state.fail = true
  await assert.rejects(store.getState().updateSettings(settings))
  assert.deepEqual(store.getState().settings, defaults)
  assert.equal(css['--accent-1'], '#123456')
  state.fail = false
  await store.getState().updateSettings(settings)
  assert.equal(css['--accent-1'], '#ffffff')
})

test('queued rapid edits preserve all changes and failed saves do not change state', async () => {
  const { store, state } = fixture()
  await store.getState().loadAll()
  await Promise.all([store.getState().addScenario(), store.getState().addScenario(), store.getState().addProgram('one', program)])
  assert.equal(store.getState().scenarios.length, 3)
  assert.equal(store.getState().scenarios[0].programs.length, 2)
  assert.deepEqual(store.getState().scenarios, state.scenarios)
  state.fail = true
  await assert.rejects(store.getState().updateScenario('one', { name: 'Изменено' }))
  assert.equal(store.getState().scenarios[0].name, 'Работа')
  assert.match(store.getState().error, /сохранить/)
  state.fail = false
  await store.getState().updateScenario('one', { name: 'Изменено', id: 'other' })
  assert.equal(store.getState().scenarios[0].id, 'one')
  assert.equal(store.getState().scenarios[0].name, 'Изменено')
})

test('program reordering checks bounds, and removing the autostart scenario clears selection and reference', async () => {
  const { store, state } = fixture()
  await store.getState().loadAll()
  await store.getState().addProgram('one', { name: 'Музыка', path: 'C:\\Music.exe' })
  await store.getState().moveProgram('one', 0, 1)
  assert.equal(store.getState().scenarios[0].programs[0].name, 'Музыка')
  const saves = state.saves
  await assert.rejects(store.getState().moveProgram('one', -1, 0))
  await assert.rejects(store.getState().moveProgram('one', 0, 2))
  await assert.rejects(store.getState().removeProgram('one', 0.5))
  assert.equal(state.saves, saves)
  await store.getState().removeProgram('one', 0)
  assert.deepEqual(store.getState().scenarios[0].programs, [program])
  await store.getState().removeScenario('one')
  assert.equal(store.getState().selectedId, null)
  assert.equal(store.getState().autoStartScenarioId, null)
  assert.equal(state.autoStart, null)
})

test('import skips duplicate names, replaces conflicting IDs and cancellation is a no-op', async () => {
  const { store, state } = fixture()
  await store.getState().loadAll()
  await store.getState().importScenarios()
  assert.equal(state.saves, 0)
  state.imports = [{ ...scenario, name: ' работа ' }, { ...scenario, name: 'Музыка' }, { ...scenario, name: 'музыка' }]
  await store.getState().importScenarios()
  assert.equal(state.scenarios.length, 2)
  assert.notEqual(state.scenarios[1].id, 'one')
  assert.equal(store.getState().selectedId, state.scenarios[1].id)
  await store.getState().exportScenarios()
  assert.deepEqual(state.exported, state.scenarios)
})

test('run failures reset isRunning and concurrent launch cannot unset an active run', async () => {
  const { store, state } = fixture()
  await store.getState().loadAll()
  let reject
  state.run = () => new Promise((resolve, fail) => { reject = fail })
  const pending = store.getState().runScenario('one')
  await new Promise(setImmediate)
  assert.equal(store.getState().isRunning, true)
  assert.equal(store.getState().runScenarioId, 'one')
  await assert.rejects(store.getState().runScenario('one'), /уже запускается/)
  assert.equal(store.getState().isRunning, true)
  assert.equal(state.runs, 1)
  reject(new Error('IPC failed'))
  await assert.rejects(pending, /IPC failed/)
  assert.equal(store.getState().isRunning, false)
  state.run = undefined
  await store.getState().runScenario('one')
  assert.equal(store.getState().runEvents[0].type, 'done')
  await store.getState().addScenario()
  assert.notEqual(store.getState().selectedId, store.getState().runScenarioId)
})

test('selection survives reload and autostart toggles are serialized', async () => {
  const { store, state } = fixture()
  await store.getState().loadAll()
  await store.getState().addScenario()
  const selected = store.getState().selectedId
  await store.getState().loadAll()
  assert.equal(store.getState().selectedId, selected)
  store.getState().selectScenario('missing')
  assert.equal(store.getState().selectedId, selected)
  await Promise.all([store.getState().toggleAutoStart(selected), store.getState().toggleAutoStart(selected)])
  assert.equal(state.autoStart, null)
  await store.getState().scanPrograms()
  assert.deepEqual(store.getState().scannedPrograms, [program])
})
