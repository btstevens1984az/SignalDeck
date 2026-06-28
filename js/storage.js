const STORAGE_KEY = 'signaldeck-v1'

const defaultState = () => ({
  team: 'Infrastructure Team',
  oncall: '',
  runbooks: [],
  runbookProgress: {},
  incidents: [],
  services: [
    { id: 'svc-1', name: 'Active Directory', tier: 'Tier-0', deps: [] },
    { id: 'svc-2', name: 'DNS', tier: 'Tier-0', deps: ['Active Directory'] },
    { id: 'svc-3', name: 'vCenter', tier: 'Tier-1', deps: ['DNS'] },
    { id: 'svc-4', name: 'Patient Portal', tier: 'Tier-1', deps: ['DNS', 'SQL Cluster', 'F5 VIP'] },
  ],
  certs: [
    { id: 'c1', name: 'wildcard.example.com', expiry: addDays(45), owner: 'Platform' },
    { id: 'c2', name: 'api.internal.example.com', expiry: addDays(12), owner: 'App Team' },
  ],
  changes: [
    { id: 'ch1', title: 'Monthly Windows patching — Wave 1', date: addDays(3), risk: 'medium' },
    { id: 'ch2', title: 'F5 cert renewal — DMZ VIPs', date: addDays(6), risk: 'high' },
  ],
})

function addDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    return { ...defaultState(), ...JSON.parse(raw) }
  } catch {
    return defaultState()
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY)
  return defaultState()
}

export { uid, addDays }
