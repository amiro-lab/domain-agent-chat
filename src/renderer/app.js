const dot = document.getElementById('dot')
const msg = document.getElementById('msg')

window.bridge.onStatus((text) => {
  msg.textContent = text
  const active = text.includes('캡처') || text.includes('연결')
  dot.className = active ? 'active' : ''
  msg.parentElement.className = active ? 'active' : ''
})
