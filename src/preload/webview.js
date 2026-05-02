// 각 AI 사이트 BrowserView에 주입되는 preload
// contextIsolation: false라 ipcRenderer 직접 사용 가능
const { ipcRenderer } = require('electron')

// ── 봇 감지 우회 (페이지 스크립트보다 먼저 실행) ──────────────────────────
Object.defineProperty(navigator, 'webdriver', { get: () => false })

if (!window.chrome) {
  window.chrome = {
    runtime: { id: undefined },
    loadTimes: () => {},
    csi: () => {},
    app: {},
  }
}

// 플러그인 목록 (빈 배열이면 감지됨)
Object.defineProperty(navigator, 'plugins', {
  get: () => [1, 2, 3, 4, 5],
})

Object.defineProperty(navigator, 'languages', {
  get: () => ['ko-KR', 'ko', 'en-US', 'en'],
})

const IDLE_MS = 30_000  // 30초 무응답 → 세션 종료로 판단

let idleTimer = null
let lastMessageCount = 0

function detectPlatform() {
  const host = window.location.hostname
  if (host.includes('chatgpt.com')) return 'chatgpt'
  if (host.includes('claude.ai')) return 'claude'
  return 'unknown'
}

// ── ChatGPT 메시지 추출 ──────────────────────────────────────────────────────
function extractChatGPT() {
  const els = document.querySelectorAll('[data-message-author-role]')
  return Array.from(els).map(el => ({
    role: el.dataset.messageAuthorRole === 'user' ? 'user' : 'assistant',
    content: el.innerText.trim(),
  })).filter(m => m.content)
}

// ── Claude.ai 메시지 추출 ────────────────────────────────────────────────────
function extractClaude() {
  const messages = []
  // 사용자 메시지
  document.querySelectorAll('[data-testid="user-message"], .font-user-message').forEach(el => {
    messages.push({ role: 'user', content: el.innerText.trim(), _y: el.getBoundingClientRect().top })
  })
  // 어시스턴트 메시지
  document.querySelectorAll('[data-testid="assistant-message"], .font-claude-message').forEach(el => {
    messages.push({ role: 'assistant', content: el.innerText.trim(), _y: el.getBoundingClientRect().top })
  })
  // DOM 순서대로 정렬
  return messages.sort((a, b) => a._y - b._y).map(({ role, content }) => ({ role, content })).filter(m => m.content)
}

function extractMessages(platform) {
  try {
    if (platform === 'chatgpt') return extractChatGPT()
    if (platform === 'claude') return extractClaude()
  } catch (_) {}
  return []
}

function scheduleCapture(platform) {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    const messages = extractMessages(platform)
    if (messages.length > lastMessageCount) {
      lastMessageCount = messages.length
      ipcRenderer.send('session-captured', { platform, messages })
    }
  }, IDLE_MS)
}

window.addEventListener('DOMContentLoaded', () => {
  const platform = detectPlatform()
  if (platform === 'unknown') return

  // DOM 변화 감지 → idle timer 리셋
  const observer = new MutationObserver(() => scheduleCapture(platform))
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
})
