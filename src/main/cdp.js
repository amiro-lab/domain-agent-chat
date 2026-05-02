const CDP = require('chrome-remote-interface')
const saas = require('./saas')

const TARGET_HOSTS = ['chatgpt.com', 'claude.ai']
const CAPTURE_BINDING = '__domainCapture'
const QUERY_BINDING = '__domainQuery'
const IDLE_MS = 30_000

// 첫 메시지 감지 + 캡처 통합 스크립트
function buildScript() {
  return `
(function() {
  if (window.__dac) return
  window.__dac = true

  let captureTimer = null
  let lastCount = 0
  let lastUserCount = 0
  let contextDone = false

  function extract() {
    const host = location.hostname
    try {
      if (host.includes('chatgpt.com')) {
        return Array.from(document.querySelectorAll('[data-message-author-role]'))
          .map(el => ({
            role: el.dataset.messageAuthorRole === 'user' ? 'user' : 'assistant',
            content: el.innerText.trim()
          }))
          .filter(m => m.content)
      }
      if (host.includes('claude.ai')) {
        const all = []
        document.querySelectorAll('[data-testid="user-message"], .font-user-message').forEach(el =>
          all.push({ role: 'user', content: el.innerText.trim(), y: el.getBoundingClientRect().top }))
        document.querySelectorAll('[data-testid="assistant-message"], .font-claude-message').forEach(el =>
          all.push({ role: 'assistant', content: el.innerText.trim(), y: el.getBoundingClientRect().top }))
        return all.sort((a, b) => a.y - b.y).map(({ role, content }) => ({ role, content })).filter(m => m.content)
      }
    } catch (_) {}
    return []
  }

  new MutationObserver(() => {
    const msgs = extract()
    const userMsgs = msgs.filter(m => m.role === 'user')

    // 첫 번째 유저 메시지 감지 → 컨텍스트 쿼리 요청
    if (userMsgs.length === 1 && !contextDone) {
      contextDone = true
      window.${QUERY_BINDING}(JSON.stringify({ content: userMsgs[0].content }))
    }

    // !저장 트리거: 마지막 유저 메시지에 !저장 포함 시 즉시 강제 캡처
    const lastUser = userMsgs[userMsgs.length - 1]
    if (lastUser && /!저장/.test(lastUser.content) && msgs.length >= 2) {
      clearTimeout(captureTimer)
      const platform = location.hostname.includes('chatgpt') ? 'chatgpt' : 'claude'
      const cleaned = msgs.map(m => ({
        ...m,
        content: m.content.replace(/!저장/g, '').trim()
      })).filter(m => m.content)
      window.${CAPTURE_BINDING}(JSON.stringify({ platform, messages: cleaned, forced: true }))
      lastCount = msgs.length
      return
    }

    // 30초 idle 후 캡처
    clearTimeout(captureTimer)
    captureTimer = setTimeout(() => {
      if (msgs.length > lastCount && msgs.length >= 2) {
        lastCount = msgs.length
        const platform = location.hostname.includes('chatgpt') ? 'chatgpt' : 'claude'
        window.${CAPTURE_BINDING}(JSON.stringify({ platform, messages: msgs }))
      }
    }, ${IDLE_MS})
  }).observe(document.body, { childList: true, subtree: true, characterData: true })
})()
`
}

// 팀원 목록 + 관련 메모리를 컨텍스트로 포맷
function formatContextReply(roster, recentMems, relatedMems) {
  const lines = ['[팀 지식베이스]', '']

  // 팀 간략 소개
  if (roster) {
    const teamName = roster.team_name || '팀'
    const memberCount = roster.members?.length || 0
    lines.push(`▸ 팀: ${teamName} (팀원 ${memberCount}명)`)
    lines.push('')
  }

  // 팀원 정보
  if (roster?.members?.length > 0) {
    lines.push('팀원 정보')
    roster.members.forEach(m => {
      lines.push(`  • ${m.name}${m.email ? ` — ${m.email}` : ''}`)
    })
    lines.push('')
  }

  // 내 최근 7일 활동
  if (recentMems?.length > 0) {
    lines.push('내 최근 7일 작업')
    recentMems.forEach(m => lines.push(`  • ${m.description}`))
    lines.push('')
  }

  // 질문과 관련된 팀 지식
  if (relatedMems?.length > 0) {
    lines.push('관련 팀 지식')
    relatedMems.forEach(m => lines.push(`  • ${m.description}`))
    lines.push('')
  }

  if (lines.length <= 2) return null
  return lines.join('\n').trimEnd()
}

// 자동 메시지 전송 스크립트
function buildAutoSendScript(text) {
  const escaped = JSON.stringify(text)
  return `
(async function() {
  const text = ${escaped}

  function getBox() {
    return document.querySelector('#prompt-textarea') ||
           document.querySelector('div[contenteditable="true"].ProseMirror') ||
           document.querySelector('fieldset div[contenteditable="true"]')
  }

  // 전송 버튼 활성화 대기 (GPT가 응답 완료할 때까지)
  let waitTries = 0
  while (waitTries++ < 20) {
    const btn = document.querySelector('[data-testid="send-button"]:not([disabled]), button[aria-label*="Send"]:not([disabled]), button[aria-label*="전송"]:not([disabled])')
    if (btn) break
    await new Promise(r => setTimeout(r, 500))
  }

  const box = getBox()
  if (!box) return

  if (box.tagName === 'TEXTAREA') {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    if (setter) setter.call(box, text)
    else box.value = text
  } else {
    box.innerHTML = '<p>' + text.replace(/\\n/g, '</p><p>') + '</p>'
  }
  box.dispatchEvent(new Event('input', { bubbles: true }))

  await new Promise(r => setTimeout(r, 600))

  const sendBtn = document.querySelector('[data-testid="send-button"]:not([disabled]), button[aria-label*="Send"]:not([disabled]), button[aria-label*="전송"]:not([disabled])')
  if (sendBtn) sendBtn.click()
})()
`
}

function isTargetHost(url = '') {
  return TARGET_HOSTS.some(h => url.includes(h))
}

async function attachTarget(port, targetId, onCapture, onStatus) {
  const client = await CDP({ port, target: targetId })
  const { Runtime, Page } = client

  await Runtime.enable()
  await Page.enable()
  await Runtime.addBinding({ name: CAPTURE_BINDING })
  await Runtime.addBinding({ name: QUERY_BINDING })

  Runtime.bindingCalled(async ({ name, payload }) => {
    if (name === CAPTURE_BINDING) {
      try { onCapture(JSON.parse(payload)) } catch (_) {}
      return
    }

    if (name === QUERY_BINDING && saas.isTeamMode()) {
      try {
        const { content } = JSON.parse(payload)
        const [rosterResult, recentResult, relatedResult] = await Promise.all([
          saas.getTeamRoster().catch(() => null),
          saas.getRecentActivity(7).catch(() => ({ memories: [] })),
          saas.queryContext(content, 5).catch(() => ({ memories: [] })),
        ])
        const roster = rosterResult
        const recentMems = recentResult.memories || []
        const relatedMems = relatedResult.memories || []

        const contextText = formatContextReply(roster, recentMems, relatedMems)
        if (!contextText) return

        const memberCount = roster?.members?.length || 0
        onStatus(`팀 컨텍스트 전송 중... (팀원 ${memberCount}명, 최근 ${recentMems.length}개, 관련 ${relatedMems.length}개)`)
        await Runtime.evaluate({ expression: buildAutoSendScript(contextText), awaitPromise: true })
          .catch(() => {})
        setTimeout(() => onStatus('대기 중'), 3000)
      } catch (e) {
        console.error('[context] 자동 전송 실패:', e.message)
      }
    }
  })

  const inject = () => Runtime.evaluate({ expression: buildScript() }).catch(() => {})
  Page.loadEventFired(inject)
  await inject()

  return client
}

async function setupCapture({ port, onCapture, onStatus }) {
  let cdp = null
  for (let i = 0; i < 20; i++) {
    try {
      cdp = await CDP({ port })
      break
    } catch (_) {
      await new Promise(r => setTimeout(r, 500))
    }
  }
  if (!cdp) { onStatus('Chrome 연결 실패'); return }

  const { Target } = cdp
  await Target.setDiscoverTargets({ discover: true })

  const attached = new Set()

  async function tryAttach(targetId, url) {
    if (attached.has(targetId) || !isTargetHost(url)) return
    attached.add(targetId)
    try {
      await attachTarget(port, targetId, onCapture, onStatus)
      onStatus(`연결됨: ${url.split('/')[2]}`)
    } catch (e) {
      attached.delete(targetId)
      console.error('[cdp] attach 실패:', url, e.message)
    }
  }

  // 이벤트 리스너를 먼저 등록해야 탭 로딩 중 URL 변경을 놓치지 않음
  Target.targetInfoChanged(({ targetInfo }) => {
    if (targetInfo.type === 'page') tryAttach(targetInfo.targetId, targetInfo.url)
  })
  Target.targetCreated(({ targetInfo }) => {
    if (targetInfo.type === 'page') tryAttach(targetInfo.targetId, targetInfo.url)
  })

  const targets = await CDP.List({ port })
  await Promise.all(targets.filter(t => t.type === 'page').map(t => tryAttach(t.id, t.url)))
}

module.exports = { setupCapture }
