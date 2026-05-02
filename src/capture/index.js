const { execFile } = require('child_process')
const { writeFileSync, unlinkSync } = require('fs')
const { tmpdir } = require('os')
const path = require('path')
const saas = require('../main/saas')

// ── 업무 관련성 사전 필터 ──────────────────────────────────
const PERSONAL_PATTERNS = [
  /오늘\s*(뭐|저녁|점심|아침|밥|뭐 먹)/,
  /주말|휴가|여행|데이트|가족|친구들?랑/,
  /피곤|힘들다|기분|스트레스|우울|행복/,
  /날씨|비|눈|더워|추워/,
  /드라마|영화|유튜브|게임|유튜브/,
  /몇\s*시야|퇴근|점심\s*먹|커피\s*마/,
]
const WORK_PATTERNS = [
  /개발|배포|서버|API|데이터베이스|쿼리|버그|기능/,
  /프로젝트|스프린트|마감|일정|회의|미팅/,
  /팀장|PM|기획|디자인|QA|인프라|백엔드|프론트/,
  /요구사항|스펙|정책|프로세스|플로우/,
  /에러|이슈|수정|개선|리팩토링|릴리즈/,
]

function isWorkRelated(messages) {
  // 너무 짧은 대화 스킵 (3턴 미만)
  if (messages.length < 3) return false

  const fullText = messages.map(m => m.content).join('\n')

  const personalScore = PERSONAL_PATTERNS.filter(p => p.test(fullText)).length
  const workScore = WORK_PATTERNS.filter(p => p.test(fullText)).length

  // 개인 패턴이 압도적이고 업무 패턴이 없으면 스킵
  if (personalScore >= 2 && workScore === 0) return false

  return true
}

function findCLI() {
  const { existsSync } = require('fs')
  const candidates = [
    path.join(require('os').homedir(), '.local/bin/domain-agent'),
    '/usr/local/bin/domain-agent',
    '/opt/homebrew/bin/domain-agent',
    path.join(require('os').homedir(), 'Workspace/domain-agent/.venv/bin/domain-agent'),
  ]
  return candidates.find(existsSync) || 'domain-agent'
}

function toJsonl(messages) {
  return messages
    .map(m => JSON.stringify({ message: { role: m.role, content: m.content } }))
    .join('\n')
}

function saveSessionTeam(platform, messages) {
  saas.capture(platform, messages)
    .then(r => console.log(`[capture] 팀 메모리 저장 (${platform}):`, r.status || 'ok'))
    .catch(e => console.error(`[capture] SaaS 전송 실패 (${platform}):`, e.message))
}

function saveSessionLocal(platform, messages) {
  const tmpFile = path.join(tmpdir(), `dac-${platform}-${Date.now()}.jsonl`)
  try {
    writeFileSync(tmpFile, toJsonl(messages), 'utf-8')
  } catch (err) {
    console.error('[capture] 임시 파일 쓰기 실패:', err.message)
    return
  }

  const cli = findCLI()
  execFile(cli, ['capture', '--transcript', tmpFile], { timeout: 60_000 }, (err, stdout) => {
    try { unlinkSync(tmpFile) } catch (_) {}
    if (err) { console.error(`[capture] domain-agent 실패 (${platform}):`, err.message); return }
    console.log(`[capture] ${platform} 세션 저장 완료:`, stdout.trim())
  })
}

function saveSession(platform, messages, forced = false) {
  if (!forced && !isWorkRelated(messages)) {
    console.log(`[capture] 업무 무관 대화 스킵 (${platform}, ${messages.length}턴)`)
    return
  }
  if (forced) console.log(`[capture] !저장 강제 캡처 (${platform})`)
  if (saas.isTeamMode()) {
    saveSessionTeam(platform, messages)
  } else {
    saveSessionLocal(platform, messages)
  }
}

module.exports = { saveSession }
