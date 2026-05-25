// src/views/panel.js
export function renderPanel(sessions) {
  const statusBadge = (status) => {
    const map = {
      connected: ['#22c55e', '✓ Conectado'],
      connecting: ['#f59e0b', '⟳ Conectando'],
      qr_pending: ['#3b82f6', '◉ QR Pendente'],
      reconnecting: ['#f97316', '↺ Reconectando'],
      disconnected: ['#6b7280', '✕ Desconectado'],
    }
    const [color, label] = map[status] ?? ['#6b7280', status]
    return `<span style="background:${color};color:#fff;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;">${label}</span>`
  }

  const rows = sessions.length
    ? sessions.map((s) => `
      <tr>
        <td style="padding:14px 16px;font-weight:600;">${s.name}</td>
        <td style="padding:14px 16px;font-family:monospace;font-size:12px;color:#6b7280;">${s.id}</td>
        <td style="padding:14px 16px;">${statusBadge(s.status)}</td>
        <td style="padding:14px 16px;font-size:12px;color:#9ca3af;">${new Date(s.createdAt).toLocaleString('pt-BR')}</td>
        <td style="padding:14px 16px;">
          ${s.status === 'qr_pending' || s.status === 'connecting'
            ? `<button onclick="showQR('${s.id}')" style="background:#3b82f6;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;">Ver QR</button>`
            : ''}
          <button onclick="deleteSession('${s.id}')" style="background:#ef4444;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;margin-left:4px;">Remover</button>
        </td>
      </tr>
    `).join('')
    : `<tr><td colspan="5" style="padding:40px;text-align:center;color:#9ca3af;">Nenhuma sessão cadastrada.</td></tr>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>WhatsApp API — Painel</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;color:#1f2937}
    .topbar{background:#075e54;color:#fff;padding:16px 32px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,.2)}
    .topbar svg{opacity:.9}
    .topbar h1{font-size:20px;font-weight:700;letter-spacing:-.3px}
    .topbar span{font-size:13px;opacity:.7;margin-left:auto}
    .container{max-width:1100px;margin:32px auto;padding:0 24px}
    .card{background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden}
    .card-header{padding:20px 24px;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center}
    .card-header h2{font-size:16px;font-weight:700}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;padding:12px 16px;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;background:#f9fafb;border-bottom:1px solid #f3f4f6}
    tr:not(:last-child) td{border-bottom:1px solid #f9fafb}
    tr:hover td{background:#fafafa}
    .form-row{display:flex;gap:12px;align-items:flex-end;padding:20px 24px;background:#f9fafb;border-top:1px solid #f3f4f6}
    input[type=text]{border:1px solid #d1d5db;border-radius:8px;padding:9px 14px;font-size:14px;width:280px;outline:none;transition:border .2s}
    input[type=text]:focus{border-color:#075e54}
    .btn-create{background:#075e54;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:background .2s}
    .btn-create:hover{background:#064e45}
    .modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100;align-items:center;justify-content:center}
    .modal-overlay.open{display:flex}
    .modal{background:#fff;border-radius:16px;padding:32px;text-align:center;max-width:360px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.2)}
    .modal h3{font-size:18px;margin-bottom:16px}
    .modal img{max-width:260px;border-radius:8px;border:1px solid #e5e7eb}
    .modal-close{margin-top:20px;background:#6b7280;color:#fff;border:none;padding:9px 24px;border-radius:8px;cursor:pointer;font-size:14px}
    .toast{position:fixed;bottom:24px;right:24px;background:#1f2937;color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;opacity:0;transition:opacity .3s;pointer-events:none;z-index:200}
    .toast.show{opacity:1}
  </style>
</head>
<body>
<div class="topbar">
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
  <h1>WhatsApp API</h1>
  <span>Multi-sessão · Baileys + Fastify</span>
</div>

<div class="container">
  <div style="margin-bottom:16px;display:flex;gap:10px">
    <div style="background:#fff;border-radius:10px;padding:16px 24px;flex:1;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <div style="font-size:28px;font-weight:700;color:#075e54">${sessions.length}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:2px">Total de sessões</div>
    </div>
    <div style="background:#fff;border-radius:10px;padding:16px 24px;flex:1;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <div style="font-size:28px;font-weight:700;color:#22c55e">${sessions.filter(s => s.status === 'connected').length}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:2px">Conectadas</div>
    </div>
    <div style="background:#fff;border-radius:10px;padding:16px 24px;flex:1;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <div style="font-size:28px;font-weight:700;color:#3b82f6">${sessions.filter(s => s.status === 'qr_pending').length}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:2px">Aguardando QR</div>
    </div>
    <div style="background:#fff;border-radius:10px;padding:16px 24px;flex:1;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <div style="font-size:28px;font-weight:700;color:#6b7280">${sessions.filter(s => s.status === 'disconnected').length}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:2px">Desconectadas</div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h2>Sessões</h2>
      <button onclick="location.reload()" style="background:#f3f4f6;border:none;padding:7px 16px;border-radius:6px;cursor:pointer;font-size:13px;color:#374151">↻ Atualizar</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>Nome</th><th>ID</th><th>Status</th><th>Criada em</th><th>Ações</th>
        </tr>
      </thead>
      <tbody id="session-list">${rows}</tbody>
    </table>
    <div class="form-row">
      <input type="text" id="session-name" placeholder="Nome da sessão (ex: empresa-1)" />
      <button class="btn-create" onclick="createSession()">+ Nova Sessão</button>
    </div>
  </div>

  <div style="margin-top:24px;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:24px">
    <h2 style="font-size:15px;font-weight:700;margin-bottom:16px">Endpoints da API</h2>
    <div style="display:grid;gap:8px;font-size:13px">
      ${[
        ['GET',    '/api/sessions',               'Listar todas as sessões'],
        ['POST',   '/api/sessions',               'Criar nova sessão'],
        ['GET',    '/api/sessions/:id',           'Detalhes de uma sessão'],
        ['GET',    '/api/sessions/:id/qr',        'Obter QR code (JSON)'],
        ['DELETE', '/api/sessions/:id',           'Remover sessão'],
        ['POST',   '/api/sessions/:id/send/text', 'Enviar mensagem de texto'],
        ['POST',   '/api/sessions/:id/send/image','Enviar imagem (multipart)'],
        ['POST',   '/api/sessions/:id/send/file', 'Enviar arquivo (multipart)'],
      ].map(([method, path, desc]) => {
        const colors = { GET:'#22c55e', POST:'#3b82f6', DELETE:'#ef4444' }
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6">
          <span style="background:${colors[method]};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;min-width:58px;text-align:center">${method}</span>
          <code style="color:#1f2937;font-size:12px">${path}</code>
          <span style="color:#9ca3af;margin-left:auto">${desc}</span>
        </div>`
      }).join('')}
    </div>
  </div>
</div>

<!-- QR Modal -->
<div class="modal-overlay" id="modal">
  <div class="modal">
    <h3>Escanear QR Code</h3>
    <p style="color:#6b7280;font-size:13px;margin-bottom:16px">Abra o WhatsApp → Aparelhos Conectados → Conectar Aparelho</p>
    <img id="qr-img" src="" alt="QR Code"/>
    <br/>
    <button class="modal-close" onclick="closeModal()">Fechar</button>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
  function toast(msg, color='#1f2937'){
    const el = document.getElementById('toast')
    el.textContent = msg
    el.style.background = color
    el.classList.add('show')
    setTimeout(()=>el.classList.remove('show'), 3000)
  }

  async function createSession(){
    const name = document.getElementById('session-name').value.trim()
    if(!name) return toast('Digite um nome para a sessão', '#ef4444')
    try {
      const r = await fetch('/api/sessions', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({name})
      })
      const data = await r.json()
      if(!r.ok) return toast(data.error || 'Erro ao criar sessão', '#ef4444')
      toast('Sessão iniciada! Aguarde o QR Code...', '#22c55e')
      setTimeout(()=>location.reload(), 2500)
    } catch(e) { toast('Erro de rede', '#ef4444') }
  }

  async function showQR(id){
    try {
      const r = await fetch('/api/sessions/'+id+'/qr')
      const data = await r.json()
      if(!r.ok) return toast(data.error || 'QR não disponível', '#ef4444')
      document.getElementById('qr-img').src = data.qr
      document.getElementById('modal').classList.add('open')
    } catch(e) { toast('Erro ao carregar QR', '#ef4444') }
  }

  async function deleteSession(id){
    if(!confirm('Remover a sessão "'+id+'"?')) return
    try {
      const r = await fetch('/api/sessions/'+id, {method:'DELETE'})
      const data = await r.json()
      toast(data.message || 'Sessão removida', '#22c55e')
      setTimeout(()=>location.reload(), 1200)
    } catch(e) { toast('Erro ao remover', '#ef4444') }
  }

  function closeModal(){ document.getElementById('modal').classList.remove('open') }
  document.getElementById('modal').addEventListener('click', (e)=>{ if(e.target===e.currentTarget) closeModal() })
  document.getElementById('session-name').addEventListener('keydown', (e)=>{ if(e.key==='Enter') createSession() })

  // Auto-refresh every 15s
  setInterval(()=>location.reload(), 15000)
</script>
</body>
</html>`
}
