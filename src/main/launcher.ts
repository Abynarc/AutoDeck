import { spawn } from 'child_process'
import path from 'path'
import type { Program, RunEvent, Settings } from '../shared/types'

let running = false

function workingDirectory(executable: string): string {
  const directory = path.dirname(executable)
  // OBS resolves locale/ and themes/ relative to the bin\\64bit (or bin\\32bit)
  // directory that contains obs64.exe/obs32.exe, matching its Windows shortcut.
  return directory
}

export async function runPrograms(programs: Program[], settings: Settings): Promise<RunEvent[]> {
  if (running) throw new Error('Сценарий уже запускается')
  running = true
  try { return await launchSequentially(programs, settings) } finally { running = false }
}

async function launchSequentially(programs: Program[], settings: Settings): Promise<RunEvent[]> {
  if (!Array.isArray(programs) || !programs.every((program) => program
    && typeof program.name === 'string' && typeof program.path === 'string'
    && path.isAbsolute(program.path) && !program.path.includes('\0'))) {
    throw new Error('Укажите полные пути к программам')
  }
  if (!Number.isFinite(settings.launchDelayMs) || settings.launchDelayMs < 0) {
    throw new Error('Некорректный интервал запуска')
  }
  const events: RunEvent[] = []
  let completed = 0
  const total = programs.length
  for (const program of programs) {
    events.push({ type: 'launching', program, completed, total })
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(program.path, [], { cwd: workingDirectory(program.path), detached: true, stdio: 'ignore', shell: false })
        child.once('error', reject)
        child.once('spawn', () => { child.unref(); resolve() })
      })
      events.push({ type: 'success', program, completed: ++completed, total })
    } catch (error) {
      events.push({ type: 'error', program, error: error instanceof Error ? error.message : String(error), completed: ++completed, total })
    }
    if (completed < total && settings.launchDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, settings.launchDelayMs))
    }
  }
  events.push({ type: 'done', completed, total })
  return events
}
