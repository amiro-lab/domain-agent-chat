const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron')
const path = require('path')
const https = require('https')
const http = require('http')
const log = require('./logger')
const { launchChrome, findChrome, DEBUG_PORT } = require('./chrome')
const { setupCapture } = require('./cdp')
const { saveSession } = require('../capture/index')
const saas = require('./saas')

const PLATFORMS = ['https://chatgpt.com', 'https://claude.ai']

let tray = null
let setupWindow = null
let chromeProc = null
let currentStatus = '대기 중'


// ── 설정 완료 여부 확인 ───────────────────────────────────
function isConfigured() {
  const cfg = saas.loadConfig()
  return cfg.mode === 'team' && cfg.saas_url && cfg.team_api_key && cfg.member
}


// ── 트레이 아이콘 ─────────────────────────────────────────
function getTrayIcon(status) {
  if (process.platform === 'win32') return path.join(__dirname, '../../assets/tray.ico')
  if (status === 'active')   return path.join(__dirname, '../../assets/trayGreen.png')
  if (status === 'error')    return path.join(__dirname, '../../assets/trayRed.png')
  if (status === 'syncing')  return path.join(__dirname, '../../assets/trayYellow.png')
  return path.join(__dirname, '../../assets/trayTemplate.png')
}

function setTrayIcon(status) {
  if (!tray) return
  tray.setImage(nativeImage.createFromPath(getTrayIcon(status)))
}

function createTray() {
  const icon = nativeImage.createFromPath(getTrayIcon('default'))
  tray = new Tray(icon)
  tray.setToolTip('domain-agent')
  updateTrayMenu()
}

function updateTrayMenu() {
  if (!tray) return
  const isRunning = !!chromeProc
  const cfg = saas.loadConfig()
  const memberLabel = cfg.member ? `${cfg.member} · ${cfg.team_name || '팀'}` : '설정 필요'

  const menu = Menu.buildFromTemplate([
    { label: 'domain-agent', enabled: false },
    { label: memberLabel, enabled: false },
    { type: 'separator' },
    {
      label: `● ${currentStatus}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: isRunning ? 'Chrome 닫기' : 'ChatGPT · Claude.ai 열기',
      click: () => {
        if (isRunning) {
          chromeProc.kill()
          chromeProc = null
          sendStatus('대기 중')
        } else {
          startCapture()
        }
      },
    },
    { type: 'separator' },
    {
      label: '설정 다시 하기',
      click: () => {
        if (!setupWindow) createSetupWindow()
        else setupWindow.focus()
      },
    },
    {
      label: '로그 열기',
      click: () => shell.openPath(log.transports.file.getFile().path),
    },
    {
      label: '로그 폴더 열기',
      click: () => shell.showItemInFolder(log.transports.file.getFile().path),
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.isQuiting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(menu)
  tray.setToolTip(`domain-agent — ${currentStatus}`)
}


// ── 설정 창 ──────────────────────────────────────────────
function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 400,
    height: 520,
    resizable: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/setup.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  setupWindow.loadFile(path.join(__dirname, '../renderer/setup.html'))
  setupWindow.on('closed', () => { setupWindow = null })
}


// ── 상태 업데이트 ─────────────────────────────────────────
function sendStatus(msg) {
  currentStatus = msg
  updateTrayMenu()
  console.log('[status]', msg)

  if (msg.includes('캡처 중') || msg.includes('전송 중') || msg.includes('저장')) {
    setTrayIcon('active')        // 초록 — 지식 캡처/저장 중
  } else if (msg.includes('연결됨') || msg.includes('Chrome 실행')) {
    setTrayIcon('syncing')       // 노랑 — Chrome 연결/실행 중
  } else if (msg.includes('실패') || msg.includes('오류') || msg.includes('찾을 수 없')) {
    setTrayIcon('error')         // 빨강 — 에러
  } else {
    setTrayIcon('default')       // 기본 — 대기 중
  }
}


// ── 캡처 시작 ────────────────────────────────────────────
async function startCapture() {
  if (!findChrome()) {
    sendStatus('Chrome을 찾을 수 없습니다')
    return
  }

  sendStatus('Chrome 실행 중...')
  chromeProc = launchChrome(PLATFORMS)
  updateTrayMenu()
  chromeProc.on('close', () => {
    sendStatus('대기 중')
    chromeProc = null
    updateTrayMenu()
  })

  await setupCapture({
    port: DEBUG_PORT,
    onCapture: ({ platform, messages, forced }) => {
      if (messages.length < 2) return
      sendStatus(`캡처 중: ${platform} (${messages.length}개 메시지)${forced ? ' [강제저장]' : ''}`)
      saveSession(platform, messages, !!forced)
      setTimeout(() => sendStatus('대기 중'), 3000)
    },
    onStatus: sendStatus,
  })
}


// ── IPC: 설정 창 ─────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout: 8000 }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { reject(new Error('응답 파싱 실패')) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('연결 시간 초과')) })
  })
}

function postUrl(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const parsed = new URL(url)
    const lib = parsed.protocol === 'https:' ? https : http
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 10000,
    }, res => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => {
        try {
          const d = JSON.parse(raw)
          if (res.statusCode >= 400) reject(new Error(d.detail || `오류 ${res.statusCode}`))
          else resolve(d)
        } catch { reject(new Error('응답 파싱 실패')) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('연결 시간 초과')) })
    req.write(data)
    req.end()
  })
}

ipcMain.handle('setup:fetch-teams', async (_, url) => {
  const base = url.replace(/\/$/, '')
  return fetchUrl(`${base}/api/teams`)
})

ipcMain.handle('setup:join-team', async (_, { url, team_id, join_code, name, email }) => {
  const base = url.replace(/\/$/, '')
  return postUrl(`${base}/api/join`, { team_id, join_code, name, email })
})

ipcMain.handle('setup:save-config', async (_, cfg) => {
  const fs = require('fs')
  const os = require('os')
  const configDir = require('path').join(os.homedir(), '.claude', 'domain-agent')
  fs.mkdirSync(configDir, { recursive: true })
  const configPath = require('path').join(configDir, 'config.json')
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8')
  return { ok: true }
})

ipcMain.on('setup:finish', () => {
  if (setupWindow) { setupWindow.close(); setupWindow = null }
  updateTrayMenu()
  startCapture()
})


// ── 앱 시작 ──────────────────────────────────────────────
app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide()

  log.info('domain-agent-chat 시작 — 로그 파일:', log.transports.file.getFile().path)

  createTray()

  if (isConfigured()) {
    startCapture()
  } else {
    createSetupWindow()
  }
})

app.on('window-all-closed', () => {
  // 트레이가 있으면 창이 모두 닫혀도 앱 유지
})

app.on('before-quit', () => {
  if (chromeProc) chromeProc.kill()
})
