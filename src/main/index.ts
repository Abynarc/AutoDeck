import { app, BrowserWindow, dialog, Menu, nativeImage, Tray } from 'electron'
import path from 'path'
import { loadSettings } from './settings'
import { configureAutoStart, runAutoStartScenario } from './autostart'
import { registerIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let closeToTray = false
let closeFromAltF4 = false

function showWindow() {
  if (!mainWindow) createWindow()
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.show()
  mainWindow?.focus()
}

function getIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'autodeck-icon.png')
    : path.join(__dirname, '../../build/autodeck-icon.png')
}

function createTray() {
  const icon = nativeImage.createFromPath(getIconPath())
  tray = new Tray(icon.isEmpty?.() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('AutoDeck')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть AutoDeck', click: showWindow },
    { type: 'separator' },
    { label: 'Выйти', click: () => app.quit() },
  ]))
  tray.on('double-click', showWindow)
}

function reportError(error: unknown) {
  dialog.showErrorBox('Ошибка AutoDeck', error instanceof Error ? error.message : String(error))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 360,
    minHeight: 360,
    frame: false,
    transparent: false,
    backgroundColor: '#0d0d1a',
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    show: false,
  })

  const window = mainWindow
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F4' && input.alt) {
      event.preventDefault()
      closeFromAltF4 = true
      window.close()
    }
  })

  if (process.env.VITE_DEV_SERVER_URL && !app.isPackaged) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL).catch(reportError)
    mainWindow.webContents.openDevTools()
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html')).catch(reportError)
  }

  mainWindow.once('ready-to-show', () => window.show())
  mainWindow.on('close', (event) => {
    const forceClose = closeFromAltF4
    closeFromAltF4 = false
    if (!quitting && !forceClose && closeToTray && tray && !tray.isDestroyed()) {
      event.preventDefault()
      window.hide()
    }
  })
  mainWindow.on('closed', () => { mainWindow = null })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => { if (app.isReady()) showWindow() })
  app.whenReady().then(async () => {
    try { closeToTray = (await loadSettings()).closeToTray } catch (error) { reportError(error) }
    registerIpcHandlers(() => mainWindow, async (settings) => {
      closeToTray = settings.closeToTray
      await configureAutoStart()
    })
    createWindow()
    try { createTray() } catch (error) { reportError(error) }
    try { await configureAutoStart() } catch (error) { reportError(error) }
    try {
      const events = await runAutoStartScenario(process.argv)
      const failures = events.filter((event) => event.type === 'error')
      if (failures.length) reportError(new Error(failures.map((event) => `${event.program.name}: ${event.error}`).join('\n')))
    } catch (error) { reportError(error) }
  }).catch(reportError)
}
app.on('before-quit', () => { quitting = true })
app.on('will-quit', () => { tray?.destroy(); tray = null })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (app.isReady()) showWindow() })
