const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const ts = require('typescript')

// Run the actual modules with an isolated userData directory, without opening Electron.
async function fixture(t, fsOverride) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autodeck-storage-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'nested', 'autodeck-data.json')
  const modules = {}
  for (const name of ['storage', 'settings']) {
    const source = await fs.readFile(path.join(__dirname, '../src/main', `${name}.ts`), 'utf8')
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    })
    const module = { exports: {} }
    const localRequire = (id) => {
      if (id === 'electron') return { app: { getPath: () => path.dirname(file) } }
      if (id === 'fs' && fsOverride) return { promises: { ...fs, ...fsOverride } }
      if (id === './storage') return modules.storage
      return require(id)
    }
    new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports)
    modules[name] = module.exports
  }
  return { ...modules, file }
}

const scenarios = [{ id: 'work', name: 'Работа', icon: '💼', programs: [{ name: 'Редактор', path: 'C:\\Editor.exe' }] }]
const settings = { accentGradient: ['#123456', '#abcdef'], launchDelayMs: 500, closeToTray: false, launchAtLogin: false }

test('first run returns independent defaults and creates the directory on save', async (t) => {
  const { storage, settings: preferences, file } = await fixture(t)
  assert.equal(await storage.loadAll(), null)
  assert.deepEqual(await storage.loadScenarios(), [])
  const defaults = await preferences.loadSettings()
  defaults.accentGradient[0] = 'changed'
  assert.equal((await preferences.loadSettings()).accentGradient[0], '#6e3eff')
  await storage.saveScenarios(scenarios)
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')).scenarios, scenarios)
})

test('concurrent scenario/settings saves preserve both fields and autostart', async (t) => {
  const { storage, settings: preferences } = await fixture(t)
  await storage.saveAll({ ...storage.createDefaultData(), autoStartScenarioId: 'work' })
  await Promise.all([storage.saveScenarios(scenarios), preferences.saveSettings(settings)])
  assert.deepEqual(await storage.loadAll(), { scenarios, settings, autoStartScenarioId: 'work' })
})

test('export/import roundtrip and malformed imports', async (t) => {
  const { storage } = await fixture(t)
  await storage.saveScenarios(scenarios)
  assert.deepEqual(await storage.importScenarios(await storage.exportScenarios()), scenarios)
  for (const invalid of ['{', '{}', '[null]', '[{"id":"x"}]', JSON.stringify([{ ...scenarios[0], programs: [{ path: 1 }] }])]) {
    await assert.rejects(storage.importScenarios(invalid))
  }
  assert.deepEqual(await storage.importScenarios('[]'), [])
  assert.deepEqual(await storage.loadScenarios(), scenarios)
})

test('deleting an autostart scenario clears its reference in the same save', async (t) => {
  const { storage } = await fixture(t)
  await storage.saveAll({ ...storage.createDefaultData(), scenarios, autoStartScenarioId: 'work' })
  await storage.saveScenarios([])
  const data = await storage.loadAll()
  assert.deepEqual(data.scenarios, [])
  assert.equal(data.autoStartScenarioId, null)
})

test('corrupt data is reported and preserved instead of overwritten', async (t) => {
  const { storage, settings: preferences, file } = await fixture(t)
  await fs.mkdir(path.dirname(file), { recursive: true })
  for (const raw of ['{broken', '{}']) {
    await fs.writeFile(file, raw)
    await assert.rejects(storage.loadAll())
    await assert.rejects(preferences.saveSettings(settings))
    assert.equal(await fs.readFile(file, 'utf8'), raw)
  }
})

test('failed replacement preserves previous data and the write queue recovers', async (t) => {
  let fail = false
  const { storage, file } = await fixture(t, {
    rename: async (...args) => {
      if (fail) throw Object.assign(new Error('denied'), { code: 'EACCES' })
      return fs.rename(...args)
    },
  })
  await storage.saveScenarios(scenarios)
  fail = true
  await assert.rejects(storage.saveScenarios([]), /denied/)
  assert.deepEqual(await storage.loadScenarios(), scenarios)
  await assert.rejects(fs.stat(`${file}.tmp`), { code: 'ENOENT' })
  fail = false
  await storage.saveScenarios([])
  assert.deepEqual(await storage.loadScenarios(), [])
})

test('read permission failures propagate and invalid settings cannot replace valid data', async (t) => {
  const denied = await fixture(t, {
    readFile: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }) },
  })
  await assert.rejects(denied.storage.loadAll(), { code: 'EACCES' })
  const { storage, settings: preferences } = await fixture(t)
  await preferences.saveSettings(settings)
  for (const launchDelayMs of [-1, NaN, Infinity]) {
    await assert.rejects(preferences.saveSettings({ ...settings, launchDelayMs }))
  }
  assert.deepEqual(await preferences.loadSettings(), settings)
  assert.deepEqual(await storage.loadScenarios(), [])
})
