const { spawn } = require('child_process')
const { existsSync } = require('fs')
const { mkdirSync } = require('fs')
const path = require('path')
const os = require('os')

const DEBUG_PORT = 9222

// 사용자별 전용 Chrome 프로필 (기존 Chrome 세션과 충돌 방지)
const PROFILE_DIR = path.join(os.homedir(), '.domain-agent-chat', 'chrome-profile')

function findChrome() {
  const candidates = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    ],
    win32: [
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
    linux: ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'],
  }
  return (candidates[process.platform] || candidates.linux).find(existsSync) || null
}

function launchChrome(urls) {
  const chromePath = findChrome()
  if (!chromePath) throw new Error('Chrome을 찾을 수 없습니다. Google Chrome을 설치해주세요.')

  mkdirSync(PROFILE_DIR, { recursive: true })

  const proc = spawn(chromePath, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-mode',
    ...urls,
  ], { detached: false, stdio: 'ignore' })

  proc.on('error', err => console.error('[chrome] 실행 실패:', err.message))
  return proc
}

module.exports = { findChrome, launchChrome, DEBUG_PORT }
