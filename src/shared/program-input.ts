import type { Program } from './types'

export function programFromInput(rawPath: string, rawName: string): Program {
  const path = rawPath.trim().replace(/^"(.*)"$/, '$1')
  const windowsPath = /^[a-z]:[\\/]/i.test(path) || /^\\\\[^\\]+\\[^\\]+\\/.test(path)
  if (!path || path.includes('\0') || (!windowsPath && !path.startsWith('/'))) {
    throw new Error('Укажите полный путь к исполняемому файлу.')
  }
  if (windowsPath && !/\.exe$/i.test(path)) throw new Error('Выберите файл с расширением .exe.')
  const filename = path.split(/[\\/]/).pop() ?? ''
  if (!filename) throw new Error('Укажите файл программы, а не папку.')
  return { path, name: rawName.trim() || filename.replace(/\.exe$/i, '') }
}
