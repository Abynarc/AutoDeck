const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

module.exports = function loadModule(name, mocks = {}, globals = {}) {
  const base = path.join(__dirname, '../src', name)
  const source = fs.readFileSync(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  })
  const module = { exports: {} }
  const localRequire = (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id)
  new Function('require', 'module', 'exports', '__dirname', ...Object.keys(globals), outputText)(
    localRequire, module, module.exports, path.join(__dirname, '../src', path.dirname(name)), ...Object.values(globals))
  return module.exports
}
