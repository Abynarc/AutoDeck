const { test } = require('node:test')
const assert = require('node:assert/strict')
const { programFromInput } = require('./load-module.cjs')('shared/program-input')

test('manual paths support quoted Windows files, UNC and macOS development executables', () => {
  assert.deepEqual(programFromInput(' "C:\\Program Files\\Editor.EXE" ', ''), { name: 'Editor', path: 'C:\\Program Files\\Editor.EXE' })
  assert.deepEqual(programFromInput('\\\\server\\share\\Music.exe', ' Музыка '), { name: 'Музыка', path: '\\\\server\\share\\Music.exe' })
  assert.deepEqual(programFromInput('/usr/bin/true', ''), { name: 'true', path: '/usr/bin/true' })
})

test('manual entry rejects empty, relative, folder and command-line paths', () => {
  for (const path of ['', '  ', 'app.exe', 'C:app.exe', 'C:\\App\\', 'C:\\App.exe --flag', '/usr/bin/', '/tmp/a\0b']) {
    assert.throws(() => programFromInput(path, 'Имя'), Error, path)
  }
})
