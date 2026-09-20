const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const loadModule = require('./load-module.cjs')
const { default: ScenarioItem, programCountLabel } = loadModule('renderer/components/ScenarioItem')

test('Russian program counts handle singular, plural and teens', () => {
  for (const [count, expected] of [[0,'0 программ'],[1,'1 программа'],[2,'2 программы'],[5,'5 программ'],[11,'11 программ'],[14,'14 программ'],[21,'21 программа'],[24,'24 программы'],[111,'111 программ']]) {
    assert.equal(programCountLabel(count), expected)
  }
})

test('scenario item uses a keyboard-accessible button and escapes scenario names', () => {
  const html = renderToStaticMarkup(React.createElement(ScenarioItem, {
    scenario: { id: 'one', name: '<script>Имя</script>', icon: '💼', programs: [] },
    isActive: true, onClick() {},
  }))
  assert.match(html, /<button/)
  assert.match(html, /aria-pressed="true"/)
  assert.match(html, /&lt;script&gt;Имя&lt;\/script&gt;/)
  assert.match(html, /0 программ/)
})

test('text contrast remains at least 4.5:1 on the brightest possible panel and accent backgrounds', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles/glass.css'), 'utf8')
  const value = name => css.match(new RegExp(`--${name}:\\s*([^;]+)`))[1]
  const rgb = hex => hex.slice(1).match(/../g).map(channel => parseInt(channel, 16))
  const luminance = color => color.map(channel => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
  const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
  const panel = value('glass-bg').match(/[\d.]+/g).map(Number)
  const brightestPanel = panel.slice(0,3).map(channel => channel * panel[3] + 255 * (1-panel[3]))
  for (const name of ['text-primary', 'text-secondary', 'text-tertiary', 'error']) {
    const contrast = ratio(rgb(value(name)), brightestPanel)
    assert.ok(contrast >= 4.5, `${name}: ${contrast}`)
  }
  const opacity = Number(value('accent-background').match(/rgba\(0,0,0,([\d.]+)\)/)[1])
  const brightestAccent = Array(3).fill(255 * (1-opacity))
  assert.ok(ratio([255,255,255], brightestAccent) >= 4.5)
})
