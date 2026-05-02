const http = require('http')
const https = require('https')
const fs = require('fs')
const os = require('os')
const path = require('path')

function loadConfig() {
  try {
    const p = path.join(os.homedir(), '.claude', 'domain-agent', 'config.json')
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch (_) {
    return { mode: 'single' }
  }
}

function isTeamMode() {
  return loadConfig().mode === 'team'
}

function request(method, apiPath, body = null) {
  const cfg = loadConfig()
  if (!cfg.saas_url || !cfg.team_api_key) return Promise.reject(new Error('팀 설정 없음'))

  const base = cfg.saas_url.replace(/\/$/, '')
  const fullUrl = new URL(base + apiPath)
  const lib = fullUrl.protocol === 'https:' ? https : http
  const data = body ? JSON.stringify(body) : null

  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: fullUrl.hostname,
      port: fullUrl.port || (fullUrl.protocol === 'https:' ? 443 : 80),
      path: fullUrl.pathname + fullUrl.search,
      method,
      headers: {
        Authorization: `Bearer ${cfg.team_api_key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) } catch { resolve({}) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function capture(platform, messages) {
  const cfg = loadConfig()
  const body = { platform, source: 'chat', messages }
  if (cfg.member) body.member = cfg.member
  return request('POST', '/api/capture', body)
}

function queryContext(q = '', limit = 5) {
  const qs = q ? `?q=${encodeURIComponent(q)}&limit=${limit}` : `?limit=${limit}`
  return request('GET', `/api/context${qs}`)
}

function queryContextBrief(maxChars = 500) {
  return request('GET', `/api/context/brief?max_chars=${maxChars}`)
}

function getTeamRoster() {
  return request('GET', '/api/team/roster')
}

function getRecentActivity(days = 7) {
  return request('GET', `/api/context/recent?days=${days}`)
}

module.exports = { isTeamMode, capture, queryContext, queryContextBrief, getTeamRoster, getRecentActivity, loadConfig }
