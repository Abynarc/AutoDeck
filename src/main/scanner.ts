import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { shell } from 'electron'
import type { Program } from '../shared/types'

// A constant script, with explicit UTF-8 output to preserve Russian paths.
const REGISTRY_SCRIPT = `
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$paths = @(
  'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths',
  'HKCU:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths'
)
$items = @(foreach ($root in $paths) {
  Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object {
    $value = $_.GetValue('')
    if ($value -is [string]) { $value }
  }
})
ConvertTo-Json -InputObject $items -Compress
`

function registryPaths(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', REGISTRY_SCRIPT],
      { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) { reject(error); return }
        try {
          const values: unknown = JSON.parse(stdout.replace(/^\uFEFF/, '').trim() || '[]')
          if (!Array.isArray(values) || !values.every((value) => typeof value === 'string')) {
            throw new Error('Некорректный ответ сканера реестра')
          }
          resolve(values)
        } catch (error) { reject(error) }
      })
  })
}

export async function scanInstalled(): Promise<Program[]> {
  if (process.platform !== 'win32') return []
  const programs = new Map<string, Program>()
  const environment = new Map(Object.entries(process.env).map(([key, value]) => [key.toLowerCase(), value]))
  const windowsRoot = path.win32.normalize(environment.get('windir') || environment.get('systemroot') || 'C:\\Windows').replace(/[\\/]$/, '').toLowerCase()
  async function add(raw: string, name?: string) {
    const executable = raw.trim().replace(/^"(.*)"$/, '$1')
      .replace(/%([^%]+)%/g, (match, key: string) => environment.get(key.toLowerCase()) ?? match)
    if (!path.win32.isAbsolute(executable) || !/\.exe$/i.test(executable)) return
    const normalized = path.win32.normalize(executable)
    const fileName = path.win32.basename(normalized)
    const rawLabel = (name || fileName.replace(/\.exe$/i, '')).trim()
    const label = rawLabel ? rawLabel[0].toLocaleUpperCase('ru') + rawLabel.slice(1) : rawLabel
    if (normalized.toLowerCase().startsWith(`${windowsRoot}\\`)) return
    if (/(^|[ _-])(uninstall|uninstaller|unins)([ _-]|\.|$)/i.test(`${label} ${fileName}`)) return
    try {
      if (!(await fs.stat(normalized)).isFile()) return
    } catch { return }
    const key = normalized.toLowerCase()
    if (!programs.has(key)) programs.set(key, { name: label, path: normalized })
  }
  let registryError: unknown
  try {
    for (const executable of await registryPaths()) await add(executable)
  } catch (error) { registryError = error }

  async function scanMenu(directory: string): Promise<void> {
    let entries
    try { entries = await fs.readdir(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const filename = path.win32.join(directory, entry.name)
      if (entry.isDirectory()) await scanMenu(filename)
      else if (entry.isFile() && /\.lnk$/i.test(entry.name)) {
        try {
          const shortcut = shell.readShortcutLink(filename)
          // Program only stores a path; shortcuts requiring arguments cannot be reproduced.
          if (!shortcut.args) await add(shortcut.target, entry.name.replace(/\.lnk$/i, ''))
        } catch { /* Broken or inaccessible shortcut. */ }
      }
    }
  }
  for (const root of [process.env.APPDATA, process.env.ProgramData]) {
    if (root) await scanMenu(path.win32.join(root, 'Microsoft', 'Windows', 'Start Menu', 'Programs'))
  }
  if (registryError && programs.size === 0) throw new Error('Не удалось прочитать список установленных программ')
  return [...programs.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}
