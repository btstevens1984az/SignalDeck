import { loadState, saveState, resetState, uid } from './storage.js'

let state = loadState()
let activeIncidentId = null
let activeRunbookId = null

const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => document.querySelectorAll(sel)

function setStatus(msg) {
  $('#status-bar').textContent = msg
}

function persist() {
  saveState(state)
}

function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString()
}

// ─── Tabs ───────────────────────────────────────────────────────────────────

function activateTab(tabId) {
  $$('.tab-nav button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId)
  })
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === tabId))
  history.replaceState(null, '', `#${tabId}`)
  renderAll()
}

$$('.tab-nav button').forEach((btn) => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab))
})

// ─── Signal Board ───────────────────────────────────────────────────────────

function renderSignals() {
  const activeIncidents = state.incidents.filter((i) => i.status !== 'resolved')
  const urgentCerts = state.certs.filter((c) => daysUntil(c.expiry) <= 30)
  const weekChanges = state.changes.filter((c) => daysUntil(c.date.slice(0, 10)) <= 7 && daysUntil(c.date.slice(0, 10)) >= 0)

  $('#signal-grid').innerHTML = `
    <div class="signal-card ${activeIncidents.length ? 'danger' : 'ok'}">
      <div class="signal-label">Active incidents</div>
      <div class="signal-value">${activeIncidents.length}</div>
      <div class="signal-hint">${activeIncidents.filter((i) => i.severity === 'SEV1').length} SEV1</div>
    </div>
    <div class="signal-card ${urgentCerts.length ? 'warn' : 'ok'}">
      <div class="signal-label">Certs ≤ 30 days</div>
      <div class="signal-value">${urgentCerts.length}</div>
      <div class="signal-hint">of ${state.certs.length} tracked</div>
    </div>
    <div class="signal-card">
      <div class="signal-label">Changes this week</div>
      <div class="signal-value">${weekChanges.length}</div>
      <div class="signal-hint">${weekChanges.filter((c) => c.risk === 'high').length} high risk</div>
    </div>
    <div class="signal-card">
      <div class="signal-label">Services mapped</div>
      <div class="signal-value">${state.services.length}</div>
      <div class="signal-hint">in dependency atlas</div>
    </div>
    <div class="signal-card">
      <div class="signal-label">Runbooks</div>
      <div class="signal-value">${state.runbooks.length}</div>
      <div class="signal-hint">ready to execute</div>
    </div>
  `

  const incEl = $('#command-incidents')
  if (!activeIncidents.length) {
    incEl.innerHTML = '<li class="empty">No active incidents</li>'
  } else {
    incEl.innerHTML = activeIncidents.slice(0, 5).map((i) => `
      <li class="runbook-item" data-goto-incident="${i.id}">
        <h4>${esc(i.title)} <span class="tag ${i.severity.toLowerCase()}">${i.severity}</span></h4>
        <p>Opened ${fmtDateTime(i.openedAt)}</p>
      </li>`).join('')
    incEl.querySelectorAll('[data-goto-incident]').forEach((el) => {
      el.addEventListener('click', () => {
        activeIncidentId = el.dataset.gotoIncident
        activateTab('incidents')
      })
    })
  }

  const certEl = $('#command-certs')
  const soon = [...state.certs].sort((a, b) => daysUntil(a.expiry) - daysUntil(b.expiry)).slice(0, 5)
  certEl.innerHTML = soon.length
    ? soon.map((c) => `<li class="runbook-item"><h4>${esc(c.name)}</h4><p>${daysUntil(c.expiry)} days — ${esc(c.owner)}</p></li>`).join('')
    : '<li class="empty">No certs tracked</li>'

  const chEl = $('#command-changes')
  chEl.innerHTML = weekChanges.length
    ? weekChanges.map((c) => `<li class="runbook-item"><h4>${esc(c.title)}</h4><p>${fmtDateTime(c.date)} · ${c.risk} risk</p></li>`).join('')
    : '<li class="empty">No changes this week</li>'
}

// ─── Incidents ──────────────────────────────────────────────────────────────

function renderIncidents() {
  const filter = $('#incident-filter').value
  const list = filter === 'active'
    ? state.incidents.filter((i) => i.status !== 'resolved')
    : [...state.incidents].reverse()

  const listEl = $('#incident-list')
  if (!list.length) {
    listEl.innerHTML = '<li class="empty">No incidents</li>'
  } else {
    listEl.innerHTML = list.map((i) => `
      <li class="runbook-item ${i.id === activeIncidentId ? 'active' : ''}" data-incident="${i.id}">
        <h4>${esc(i.title)} <span class="tag ${i.severity.toLowerCase()}">${i.severity}</span></h4>
        <p>${i.status} · ${fmtDateTime(i.openedAt)}</p>
      </li>`).join('')
    listEl.querySelectorAll('[data-incident]').forEach((el) => {
      el.addEventListener('click', () => {
        activeIncidentId = el.dataset.incident
        renderIncidents()
      })
    })
  }

  const detail = $('#incident-detail')
  const inc = state.incidents.find((i) => i.id === activeIncidentId)
  if (!inc) {
    detail.innerHTML = '<p class="empty">Select or create an incident</p>'
    return
  }

  detail.innerHTML = `
    <h3>${esc(inc.title)} <span class="tag ${inc.severity.toLowerCase()}">${inc.severity}</span></h3>
    <p style="color:var(--muted);font-size:0.85rem;margin:0.5rem 0">IC: ${esc(inc.ic || '—')} · Comms: ${esc(inc.comms || '—')} · Status: <strong>${inc.status}</strong></p>
    <div class="form-row" style="margin-top:0.75rem">
      <input id="timeline-entry" placeholder="Add timeline entry…" style="flex:1">
      <button class="btn btn-primary btn-sm" id="btn-add-timeline">Add</button>
    </div>
    <ul class="timeline" id="inc-timeline">
      ${inc.timeline.map((t) => `<li><time>${fmtDateTime(t.at)}</time>${esc(t.text)}</li>`).join('')}
    </ul>
    <div class="form-row" style="margin-top:1rem">
      <button class="btn btn-secondary btn-sm" id="btn-resolve">Mark resolved</button>
      <button class="btn btn-secondary btn-sm" id="btn-export-pm">Export postmortem stub</button>
      <button class="btn btn-danger btn-sm" id="btn-delete-inc">Delete</button>
    </div>
  `

  $('#btn-add-timeline').addEventListener('click', () => {
    const text = $('#timeline-entry').value.trim()
    if (!text) return
    inc.timeline.push({ at: new Date().toISOString(), text })
    $('#timeline-entry').value = ''
    persist()
    renderIncidents()
    setStatus('Timeline updated')
  })

  $('#btn-resolve').addEventListener('click', () => {
    inc.status = 'resolved'
    inc.timeline.push({ at: new Date().toISOString(), text: 'Incident marked resolved' })
    persist()
    renderIncidents()
    setStatus('Incident resolved')
  })

  $('#btn-delete-inc').addEventListener('click', () => {
    state.incidents = state.incidents.filter((i) => i.id !== inc.id)
    activeIncidentId = null
    persist()
    renderIncidents()
  })

  $('#btn-export-pm').addEventListener('click', () => {
    const md = buildPostmortem(inc)
    downloadText(`${inc.title.replace(/\s+/g, '-')}-postmortem.md`, md)
    setStatus('Postmortem stub downloaded')
  })
}

$('#btn-new-incident').addEventListener('click', () => {
  const title = prompt('Incident title:')
  if (!title) return
  const severity = prompt('Severity (SEV1/SEV2/SEV3):', 'SEV2') || 'SEV2'
  const ic = prompt('Incident Commander:', '') || ''
  const inc = {
    id: uid('inc'),
    title,
    severity: severity.toUpperCase(),
    status: 'investigating',
    ic,
    comms: '',
    openedAt: new Date().toISOString(),
    timeline: [{ at: new Date().toISOString(), text: 'Incident opened' }],
  }
  state.incidents.push(inc)
  activeIncidentId = inc.id
  persist()
  renderIncidents()
  setStatus('Incident created')
})

$('#incident-filter').addEventListener('change', renderIncidents)

function buildPostmortem(inc) {
  return `# Postmortem: ${inc.title}

**Severity:** ${inc.severity}
**Opened:** ${fmtDateTime(inc.openedAt)}
**Status:** ${inc.status}
**Incident Commander:** ${inc.ic || 'TBD'}

## Summary
(Describe customer impact and duration)

## Timeline
${inc.timeline.map((t) => `- ${fmtDateTime(t.at)} — ${t.text}`).join('\n')}

## Root cause
(TBD)

## Action items
- [ ] 
`
}

// ─── Runbooks ───────────────────────────────────────────────────────────────

function renderRunbooks() {
  const q = ($('#runbook-search').value || '').toLowerCase()
  const filtered = state.runbooks.filter((rb) =>
    rb.title.toLowerCase().includes(q) ||
    rb.category.toLowerCase().includes(q) ||
    rb.tags.some((t) => t.includes(q))
  )

  const listEl = $('#runbook-list')
  listEl.innerHTML = filtered.map((rb) => `
    <li class="runbook-item ${rb.id === activeRunbookId ? 'active' : ''}" data-rb="${rb.id}">
      <h4>${esc(rb.title)} <span class="tag ${rb.severity.toLowerCase()}">${rb.severity}</span></h4>
      <p>${esc(rb.category)} · ${rb.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</p>
    </li>`).join('')

  listEl.querySelectorAll('[data-rb]').forEach((el) => {
    el.addEventListener('click', () => {
      activeRunbookId = el.dataset.rb
      renderRunbooks()
    })
  })

  const detail = $('#runbook-detail')
  const rb = state.runbooks.find((r) => r.id === activeRunbookId)
  if (!rb) {
    detail.innerHTML = '<p class="empty">Select a runbook</p>'
    return
  }

  const progress = state.runbookProgress[rb.id] || []
  detail.innerHTML = `
    <h3>${esc(rb.title)}</h3>
    <p style="color:var(--muted);margin:0.5rem 0 0.75rem">${esc(rb.summary)}</p>
    <ul class="step-list">
      ${rb.steps.map((step, i) => `
        <li class="${progress[i] ? 'done' : ''}">
          <input type="checkbox" data-step="${i}" ${progress[i] ? 'checked' : ''}>
          <span>${esc(step)}</span>
        </li>`).join('')}
    </ul>
    <button class="btn btn-secondary btn-sm" style="margin-top:0.75rem" id="btn-reset-rb">Reset checklist</button>
  `

  detail.querySelectorAll('[data-step]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const idx = Number(cb.dataset.step)
      if (!state.runbookProgress[rb.id]) state.runbookProgress[rb.id] = []
      state.runbookProgress[rb.id][idx] = cb.checked
      persist()
      renderRunbooks()
    })
  })

  $('#btn-reset-rb')?.addEventListener('click', () => {
    delete state.runbookProgress[rb.id]
    persist()
    renderRunbooks()
  })
}

$('#runbook-search').addEventListener('input', renderRunbooks)

// ─── Topology ───────────────────────────────────────────────────────────────

function renderTopology() {
  const map = $('#topology-map')
  if (!state.services.length) {
    map.innerHTML = '<p class="empty">Add services to map dependencies</p>'
    return
  }
  map.innerHTML = state.services.map((s) => {
    const downstream = state.services.filter((x) => x.deps.includes(s.name)).map((x) => x.name)
    return `
      <div class="service-node">
        <strong>${esc(s.name)}</strong>
        <span class="tag">${esc(s.tier)}</span>
        <div class="deps" style="margin-top:0.35rem">↑ ${s.deps.length ? esc(s.deps.join(', ')) : 'none'}</div>
        <div class="deps">↓ ${downstream.length ? esc(downstream.join(', ')) : 'none'}</div>
        <button class="btn btn-danger btn-sm" style="margin-top:0.5rem" data-del-svc="${s.id}">Remove</button>
      </div>`
  }).join('')

  map.querySelectorAll('[data-del-svc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.services = state.services.filter((s) => s.id !== btn.dataset.delSvc)
      persist()
      renderTopology()
    })
  })
}

$('#btn-add-service').addEventListener('click', () => {
  const name = $('#svc-name').value.trim()
  if (!name) return
  state.services.push({
    id: uid('svc'),
    name,
    tier: $('#svc-tier').value.trim() || 'Tier-2',
    deps: $('#svc-deps').value.split(',').map((d) => d.trim()).filter(Boolean),
  })
  $('#svc-name').value = ''
  $('#svc-tier').value = ''
  $('#svc-deps').value = ''
  persist()
  renderTopology()
  setStatus('Service added')
})

// ─── Certs ──────────────────────────────────────────────────────────────────

function renderCerts() {
  const tbody = $('#cert-tbody')
  const sorted = [...state.certs].sort((a, b) => daysUntil(a.expiry) - daysUntil(b.expiry))
  tbody.innerHTML = sorted.map((c) => {
    const days = daysUntil(c.expiry)
    const cls = days <= 14 ? 'style="color:var(--danger)"' : days <= 30 ? 'style="color:var(--warning)"' : ''
    return `<tr>
      <td>${esc(c.name)}</td>
      <td>${fmtDate(c.expiry)}</td>
      <td ${cls}>${days}</td>
      <td>${esc(c.owner)}</td>
      <td><button class="btn btn-danger btn-sm" data-del-cert="${c.id}">×</button></td>
    </tr>`
  }).join('') || '<tr><td colspan="5" class="empty">No certificates tracked</td></tr>'

  tbody.querySelectorAll('[data-del-cert]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.certs = state.certs.filter((c) => c.id !== btn.dataset.delCert)
      persist()
      renderCerts()
    })
  })
}

$('#btn-add-cert').addEventListener('click', () => {
  const name = $('#cert-name').value.trim()
  const expiry = $('#cert-expiry').value
  if (!name || !expiry) return
  state.certs.push({ id: uid('cert'), name, expiry, owner: $('#cert-owner').value.trim() || 'Unassigned' })
  $('#cert-name').value = ''
  $('#cert-expiry').value = ''
  $('#cert-owner').value = ''
  persist()
  renderCerts()
  setStatus('Certificate added')
})

// ─── Changes ────────────────────────────────────────────────────────────────

function renderChanges() {
  const list = $('#change-list')
  const sorted = [...state.changes].sort((a, b) => new Date(a.date) - new Date(b.date))
  list.innerHTML = sorted.length
    ? sorted.map((c) => `
      <li class="runbook-item">
        <h4>${esc(c.title)} <span class="tag">${c.risk} risk</span></h4>
        <p>${fmtDateTime(c.date)}</p>
        <button class="btn btn-danger btn-sm" style="margin-top:0.35rem" data-del-ch="${c.id}">Remove</button>
      </li>`).join('')
    : '<p class="empty">No scheduled changes</p>'

  list.querySelectorAll('[data-del-ch]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.changes = state.changes.filter((c) => c.id !== btn.dataset.delCh)
      persist()
      renderChanges()
    })
  })
}

$('#btn-add-change').addEventListener('click', () => {
  const title = $('#change-title').value.trim()
  const date = $('#change-date').value
  if (!title || !date) return
  state.changes.push({ id: uid('ch'), title, date: new Date(date).toISOString(), risk: $('#change-risk').value })
  $('#change-title').value = ''
  $('#change-date').value = ''
  persist()
  renderChanges()
  setStatus('Change scheduled')
})

// ─── Handoff ────────────────────────────────────────────────────────────────

function renderHandoff() {
  // output updated on generate only
}

$('#btn-gen-handoff').addEventListener('click', () => {
  const from = $('#handoff-from').value.trim() || 'Outgoing'
  const to = $('#handoff-to').value.trim() || 'Incoming'
  const notes = $('#handoff-notes').value.trim()
  const active = state.incidents.filter((i) => i.status !== 'resolved')
  const urgentCerts = state.certs.filter((c) => daysUntil(c.expiry) <= 30)
  const changes = state.changes.filter((c) => daysUntil(c.date.slice(0, 10)) <= 7)

  let md = `# Shift Handoff — ${state.team}\n`
  md += `**From:** ${from} → **To:** ${to}\n`
  md += `**Generated:** ${new Date().toLocaleString()}\n\n`
  md += `## Active incidents (${active.length})\n`
  md += active.length
    ? active.map((i) => `- **${i.severity}** ${i.title} (${i.status}) — IC: ${i.ic || 'TBD'}`).join('\n')
    : '- None\n'
  md += `\n\n## Certs expiring ≤ 30 days (${urgentCerts.length})\n`
  md += urgentCerts.length
    ? urgentCerts.map((c) => `- ${c.name} — ${daysUntil(c.expiry)} days (${c.owner})`).join('\n')
    : '- None\n'
  md += `\n\n## Changes this week (${changes.length})\n`
  md += changes.length
    ? changes.map((c) => `- ${c.title} — ${fmtDateTime(c.date)} (${c.risk})`).join('\n')
    : '- None\n'
  md += `\n\n## Notes\n${notes || '(none)'}\n`
  md += `\n---\nOn-call: ${state.oncall || 'See schedule'}\n`

  $('#handoff-output').textContent = md
  setStatus('Handoff generated')
})

$('#btn-copy-handoff').addEventListener('click', async () => {
  const text = $('#handoff-output').textContent
  try {
    await navigator.clipboard.writeText(text)
    setStatus('Copied to clipboard')
  } catch {
    setStatus('Copy failed — select text manually')
  }
})

// ─── Settings ───────────────────────────────────────────────────────────────

function renderSettings() {
  $('#setting-team').value = state.team
  $('#setting-oncall').value = state.oncall
  $('#team-label').textContent = state.team
}

$('#btn-save-settings').addEventListener('click', () => {
  state.team = $('#setting-team').value.trim() || 'Infrastructure Team'
  state.oncall = $('#setting-oncall').value.trim()
  persist()
  renderSettings()
  setStatus('Settings saved')
})

$('#btn-reset').addEventListener('click', () => {
  if (!confirm('Reset all SignalDeck data? This cannot be undone.')) return
  state = resetState()
  loadRunbooks()
  persist()
  renderAll()
  setStatus('Reset to defaults')
})

// ─── Import / Export ────────────────────────────────────────────────────────

$('#btn-export').addEventListener('click', () => {
  downloadText(`signaldeck-${state.team.replace(/\s+/g, '-')}.json`, JSON.stringify(state, null, 2))
  setStatus('Team data exported')
})

$('#btn-import').addEventListener('click', () => $('#import-file').click())

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const imported = JSON.parse(await file.text())
    state = { ...defaultStateMerge(), ...imported }
    persist()
    renderAll()
    setStatus('Team data imported')
  } catch {
    setStatus('Import failed — invalid JSON')
  }
  e.target.value = ''
})

function defaultStateMerge() {
  return loadState()
}

function downloadText(filename, text) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function esc(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

// ─── Init runbooks from JSON ──────────────────────────────────────────────────

async function loadRunbooks() {
  if (state.runbooks.length) return
  try {
    const res = await fetch('data/default-runbooks.json')
    state.runbooks = await res.json()
    persist()
  } catch {
    setStatus('Could not load default runbooks — serve via HTTP or open from file server')
  }
}

function renderAll() {
  renderSignals()
  renderIncidents()
  renderRunbooks()
  renderTopology()
  renderCerts()
  renderChanges()
  renderSettings()
}

// ─── Boot ───────────────────────────────────────────────────────────────────

async function boot() {
  await loadRunbooks()
  const hash = location.hash.slice(1)
  if (hash && document.getElementById(hash)) activateTab(hash)
  else renderAll()
}

boot()
