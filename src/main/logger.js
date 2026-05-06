const log = require('electron-log/main')

log.transports.file.level = 'info'
log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}'

log.initialize()
Object.assign(console, log.functions)

module.exports = log
