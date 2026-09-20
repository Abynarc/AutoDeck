const { test } = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const loadModule = require('./load-module.cjs')
const { default: ProgramItem } = loadModule('renderer/components/ProgramItem')

test('program row disables only unavailable moves and keeps the path readable', () => {
  const render = (index, disabled = false) => renderToStaticMarkup(React.createElement(ProgramItem, {
    program: { name: 'Редактор', path: 'C:\\Очень длинный путь\\Editor.exe' }, index, total: 2,
    disabled, onRemove() {}, onMoveUp() {}, onMoveDown() {},
  }))
  const first = render(0)
  assert.match(first, /aria-label="Выше: Редактор"[^>]*disabled=""/)
  assert.doesNotMatch(first, /aria-label="Ниже: Редактор"[^>]*disabled=""/)
  assert.match(first, /Очень длинный путь/)
  const last = render(1)
  assert.match(last, /aria-label="Ниже: Редактор"[^>]*disabled=""/)
  assert.equal((render(0, true).match(/disabled=""/g) || []).length, 3)
})
