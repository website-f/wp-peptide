// KYVO Mail panel: cPanel-style UI for the mail server. No build step, no inline scripts/styles (strict CSP).
const BASE = location.pathname.startsWith('/mail') ? '/mail' : ''
const API = `${BASE}/api`
const WEBMAIL = '/webmail/'
const app = document.getElementById('app')
let me = { user: null, domain: '', host: '' }

// ---------- tiny DOM helper (text is always set as text, never parsed as HTML) ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'html') el.innerHTML = v // only ever used with constant icon SVG
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : String(kid))
  return el
}
const ICON = {
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 5l7 7-7 7"/><path d="M21 12H8a5 5 0 0 0-5 5v2"/></svg>',
  track: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  device: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/></svg>',
  web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7v9H3z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
}
const icon = (n) => h('span', { html: ICON[n] })

// ---------- API ----------
async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined || method !== 'GET' ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : method !== 'GET' ? '{}' : undefined,
  })
  let data = null
  try {
    data = await res.json()
  } catch {}
  if (res.status === 401 && path !== '/login') {
    me.user = null
    render()
    throw new Error('Please sign in again')
  }
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
  return data
}

// ---------- feedback ----------
function toast(msg, bad = false) {
  const t = h('div', { class: `toast${bad ? ' bad' : ''}`, role: 'status' }, msg)
  document.getElementById('toasts').append(t)
  setTimeout(() => t.remove(), 4500)
}
function confirmDialog({ title, body, confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const close = (v) => {
      ov.remove()
      resolve(v)
    }
    const ov = h(
      'div',
      { class: 'overlay', onclick: (e) => e.target === ov && close(false) },
      h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' }, h('h3', {}, title), h('p', {}, body), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => close(false) }, 'Cancel'), h('button', { class: `btn ${danger ? 'danger solid' : 'primary'}`, onclick: () => close(true) }, confirm))),
    )
    document.body.append(ov)
    ov.querySelector('.btn.primary, .btn.danger')?.focus()
    ov.addEventListener('keydown', (e) => e.key === 'Escape' && close(false))
  })
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast('Copied')
  } catch {
    toast('Copy failed, select the text instead', true)
  }
}
const copyBtn = (text) => h('button', { class: 'btn sm', type: 'button', onclick: () => copy(text) }, 'Copy')

// ---------- formatting ----------
function bytes(n) {
  if (n === null || n === undefined) return '∞'
  if (n < 1024) return `${n} B`
  const u = ['KB', 'MB', 'GB', 'TB']
  let i = -1
  do {
    n /= 1024
    i++
  } while (n >= 1024 && i < u.length - 1)
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(n >= 10 ? 1 : 2)} ${u[i]}`
}
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' }) : '')
function strength(pw) {
  let s = 0
  if (pw.length >= 10) s++
  if (pw.length >= 14) s++
  for (const re of [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]) if (re.test(pw)) s++
  return Math.min(100, Math.round((s / 6) * 100))
}
function genPassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_=+?']
  const all = sets.join('')
  const r = new Uint32Array(16)
  crypto.getRandomValues(r)
  const chars = [...r].map((x, i) => (i < sets.length ? sets[i] : all)[x % (i < sets.length ? sets[i].length : all.length)])
  return chars.sort(() => (crypto.getRandomValues(new Uint8Array(1))[0] & 1 ? 1 : -1)).join('')
}

function passwordField(id, label, { required = true, hint } = {}) {
  const input = h('input', { type: 'password', id, autocomplete: 'new-password', spellcheck: 'false' })
  const meter = h('i')
  const bar = h('div', { class: 'strength' }, meter)
  const show = h('button', { class: 'btn', type: 'button', onclick: () => (input.type = input.type === 'password' ? 'text' : 'password') }, 'Show')
  const gen = h('button', {
    class: 'btn',
    type: 'button',
    onclick: () => {
      input.value = genPassword()
      input.type = 'text'
      input.dispatchEvent(new Event('input'))
    },
  }, 'Generate')
  input.addEventListener('input', () => {
    const s = strength(input.value)
    meter.style.width = `${s}%`
    meter.style.background = s < 50 ? '#c8352b' : s < 80 ? '#a86400' : '#1e8e4e'
  })
  return {
    input,
    el: h('div', { class: 'field' }, h('label', { class: 'f', for: id }, label, required ? '' : h('span', { class: 'sub' }, ' (optional)')), h('div', { class: 'toolbar' }, h('div', { class: 'join' }, input), show, gen), bar, h('div', { class: 'hint' }, hint ?? 'At least 10 characters, using three of: lowercase, uppercase, numbers, symbols.')),
  }
}

// ---------- shell ----------
const PAGES = [
  { group: 'Email' },
  { id: 'accounts', label: 'Email Accounts', icon: 'inbox' },
  { id: 'forwarders', label: 'Forwarders', icon: 'fwd' },
  { id: 'delivery', label: 'Track Delivery', icon: 'track' },
  { id: 'deliverability', label: 'Email Deliverability', icon: 'shield' },
  { id: 'devices', label: 'Connect Devices', icon: 'device' },
  { group: 'Account' },
  { id: 'password', label: 'Panel Password', icon: 'key' },
]

function route() {
  const [page, arg] = location.hash.replace(/^#\/?/, '').split('/')
  return { page: page || 'accounts', arg: arg ? decodeURIComponent(arg) : null }
}
const go = (hash) => (location.hash = hash)

function shell(crumb, ...content) {
  const { page } = route()
  const side = h(
    'aside',
    { class: 'side' },
    h('div', { class: 'brand' }, h('div', { class: 'logo' }, icon('inbox')), h('div', {}, 'Mail Panel', h('small', {}, me.domain))),
    h(
      'nav',
      { class: 'nav' },
      PAGES.map((p) =>
        p.group
          ? h('div', { class: 'group' }, p.group)
          : h('a', { href: `#/${p.id}`, class: page === p.id || (page === 'create' && p.id === 'accounts') || (page === 'manage' && p.id === 'accounts') ? 'active' : '' }, icon(p.icon), p.label),
      ),
      h('div', { class: 'group' }, 'Shortcuts'),
      h('a', { href: WEBMAIL, target: '_blank', rel: 'noopener' }, icon('web'), 'Webmail'),
      h('a', { href: '/admin', target: '_blank', rel: 'noopener' }, icon('home'), 'Store admin'),
    ),
    h('div', { class: 'foot' }, me.host),
  )
  const menu = h('button', { class: 'btn sm menu-btn', type: 'button', 'aria-label': 'Menu', onclick: () => side.classList.toggle('open'), html: ICON.menu })
  side.addEventListener('click', (e) => e.target.closest('a') && side.classList.remove('open'))
  return h(
    'div',
    { class: 'shell' },
    side,
    h(
      'div',
      { class: 'main' },
      h('header', { class: 'top' }, h('div', { class: 'toolbar' }, menu, h('div', { class: 'crumbs' }, 'Email', ' › ', h('b', {}, crumb))), h('div', { class: 'user' }, h('span', { class: 'hide-sm' }, me.user), h('button', { class: 'btn sm', onclick: logout }, 'Log out'))),
      h('div', { class: 'content' }, ...content),
    ),
  )
}

async function logout() {
  await call('POST', '/logout').catch(() => {})
  me.user = null
  render()
}

// ---------- pages ----------
function loginPage() {
  const user = h('input', { type: 'text', id: 'u', autocomplete: 'username', value: 'admin', spellcheck: 'false' })
  const pass = h('input', { type: 'password', id: 'p', autocomplete: 'current-password' })
  const err = h('div', { class: 'err', role: 'alert' })
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Log in')
  const form = h(
    'form',
    {
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault()
        err.textContent = ''
        btn.disabled = true
        try {
          const r = await call('POST', '/login', { username: user.value, password: pass.value })
          me.user = r.user
          render()
        } catch (x) {
          err.textContent = x.message
          btn.disabled = false
          pass.select()
        }
      },
    },
    h('div', { class: 'field' }, h('label', { class: 'f', for: 'u' }, 'Username'), user),
    h('div', { class: 'field' }, h('label', { class: 'f', for: 'p' }, 'Password'), pass),
    btn,
    err,
  )
  app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'box' }, h('div', { class: 'toolbar' }, h('div', { class: 'logo' }, icon('inbox')), h('span', { class: 'pill info' }, me.domain || 'Mail')), h('h1', {}, 'Mail Panel'), h('p', { class: 'lead' }, 'Manage email accounts, forwarders and delivery.'), form, h('p', { class: 'hint' }, 'Reading or sending email? ', h('a', { href: WEBMAIL }, 'Open webmail')))))
  setTimeout(() => pass.focus(), 0)
}

async function accountsPage() {
  const list = h('tbody', {}, h('tr', {}, h('td', { colspan: 4, class: 'empty' }, 'Loading...')))
  const search = h('input', { type: 'search', placeholder: 'Search accounts', 'aria-label': 'Search accounts' })
  const stats = h('div', { class: 'stats' })
  app.replaceChildren(
    shell(
      'Email Accounts',
      h('h1', {}, 'Email Accounts'),
      h('p', { class: 'lead' }, `Create and manage mailboxes for ${me.domain}. People read and send mail in webmail or in any mail app.`),
      stats,
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'card-h' }, h('div', { class: 'toolbar' }, search), h('a', { class: 'btn primary', href: '#/create' }, '+ Create')),
        h('div', { class: 'table-wrap' }, h('table', { class: 'stack' }, h('thead', {}, h('tr', {}, h('th', {}, 'Account @ Domain'), h('th', {}, 'Storage: Used / Allocated'), h('th', { class: 'hide-sm' }, 'Created'), h('th', {}))), list)),
      ),
    ),
  )
  const [accounts, ov] = await Promise.all([call('GET', '/accounts'), call('GET', '/overview')])
  stats.replaceChildren(
    h('div', { class: 'stat' }, h('span', {}, 'Email accounts'), h('b', {}, ov.accounts)),
    h('div', { class: 'stat' }, h('span', {}, 'Forwarders'), h('b', {}, ov.forwarders)),
    h('div', { class: 'stat' }, h('span', {}, 'Storage used'), h('b', {}, bytes(ov.usedBytes))),
    h('div', { class: 'stat' }, h('span', {}, 'Mail server'), h('b', { class: 'mono' }, ov.host)),
  )
  const draw = () => {
    const q = search.value.trim().toLowerCase()
    const rows = accounts.filter((a) => !q || a.email.includes(q))
    if (!rows.length) return list.replaceChildren(h('tr', {}, h('td', { colspan: 4, class: 'empty' }, accounts.length ? 'No accounts match.' : 'No email accounts yet. Click Create to add one.')))
    list.replaceChildren(
      ...rows.map((a) => {
        const pct = a.quotaBytes ? Math.min(100, (a.usedBytes / a.quotaBytes) * 100) : 0
        const fill = h('i')
        fill.style.width = `${a.quotaBytes ? Math.max(pct, 1) : 2}%`
        return h(
          'tr',
          {},
          h('td', {}, h('div', { class: 'addr' }, a.email)),
          h('td', { 'data-label': 'Storage' }, h('div', {}, `${bytes(a.usedBytes)} / ${a.quotaBytes ? bytes(a.quotaBytes) : '∞'}`, a.quotaBytes ? h('span', { class: 'sub' }, `  ${pct.toFixed(pct < 10 ? 1 : 0)}%`) : ''), h('div', { class: `bar ${pct >= 95 ? 'full' : pct >= 80 ? 'warn' : ''}` }, fill)),
          h('td', { class: 'hide-sm' }, a.createdAt ? when(a.createdAt) : h('span', { class: 'sub' }, '-')),
          h('td', {}, h('div', { class: 'actions' }, h('a', { class: 'btn sm', href: WEBMAIL, target: '_blank', rel: 'noopener' }, 'Check Email'), h('a', { class: 'btn sm', href: `#/manage/${encodeURIComponent(a.email)}` }, 'Manage'), h('a', { class: 'btn sm', href: `#/devices/${encodeURIComponent(a.email)}` }, 'Connect Devices'))),
        )
      }),
    )
  }
  search.addEventListener('input', draw)
  draw()
}

function quotaField(current) {
  const name = 'quota'
  const custom = h('input', { type: 'number', min: 50, step: 1, value: current && current !== 2048 ? current : 1024, 'aria-label': 'Storage in MB' })
  const opts = [
    ['2048', '2 GB (recommended)'],
    ['custom', null],
    ['unlimited', 'Unlimited'],
  ]
  const initial = current === null ? 'unlimited' : current === 2048 || current === undefined ? '2048' : 'custom'
  const radios = opts.map(([v, label]) => {
    const r = h('input', { type: 'radio', name, value: v, id: `q-${v}`, checked: v === initial })
    return h('div', { class: 'radio' }, r, h('label', { for: `q-${v}` }, label ?? 'Custom'), v === 'custom' ? h('span', { class: 'join' }, custom, h('span', { class: 'suffix' }, 'MB')) : '')
  })
  const el = h('div', { class: 'field' }, h('label', { class: 'f' }, 'Storage space'), ...radios, h('div', { class: 'hint' }, 'When a mailbox is full, new mail to it is refused until space is freed.'))
  const value = () => {
    const v = el.querySelector('input[type=radio]:checked')?.value
    return v === 'unlimited' ? null : v === 'custom' ? Number(custom.value) : 2048
  }
  return { el, value }
}

function createPage() {
  const local = h('input', { type: 'text', id: 'local', autocomplete: 'off', spellcheck: 'false', placeholder: 'e.g. sales' })
  const pw = passwordField('pw', 'Password')
  const quota = quotaField(2048)
  const stay = h('input', { type: 'checkbox', id: 'stay' })
  const err = h('div', { class: 'err', role: 'alert' })
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Create')
  const form = h(
    'form',
    {
      novalidate: true,
      class: 'card-b',
      onsubmit: async (e) => {
        e.preventDefault()
        err.textContent = ''
        btn.disabled = true
        try {
          const r = await call('POST', '/accounts', { local: local.value, password: pw.input.value, quotaMb: quota.value() })
          toast(`${r.email} created. It is ready to use in a few seconds.`)
          if (stay.checked) {
            local.value = ''
            pw.input.value = ''
            pw.input.dispatchEvent(new Event('input'))
            btn.disabled = false
            local.focus()
          } else go('#/accounts')
        } catch (x) {
          err.textContent = x.message
          btn.disabled = false
        }
      },
    },
    h('div', { class: 'field' }, h('label', { class: 'f', for: 'local' }, 'Username'), h('div', { class: 'join' }, local, h('span', { class: 'suffix' }, `@${me.domain}`)), h('div', { class: 'hint' }, 'Letters, numbers, dots, dashes and underscores.')),
    pw.el,
    quota.el,
    h('div', { class: 'radio' }, stay, h('label', { for: 'stay' }, 'Stay on this page after I click Create')),
    h('div', { class: 'toolbar' }, btn, h('a', { class: 'btn', href: '#/accounts' }, 'Go Back')),
    err,
  )
  app.replaceChildren(shell('Create an Email Account', h('h1', {}, 'Create an Email Account'), h('p', { class: 'lead' }, 'The new mailbox can send and receive mail straight away through webmail or a mail app.'), h('div', { class: 'card' }, form)))
  local.focus()
}

async function managePage(email) {
  const accounts = await call('GET', '/accounts')
  const a = accounts.find((x) => x.email === email)
  if (!a) {
    toast('That account no longer exists', true)
    return go('#/accounts')
  }
  const pw = passwordField('npw', 'New password', { required: false, hint: 'Leave empty to keep the current password. The account signs in with the new one within a few seconds.' })
  const quota = quotaField(a.quotaBytes === null ? null : Math.round(a.quotaBytes / 1024 / 1024))
  const err = h('div', { class: 'err', role: 'alert' })
  const save = h('button', { class: 'btn primary', type: 'submit' }, 'Update Email Settings')
  const form = h(
    'form',
    {
      novalidate: true,
      class: 'card-b',
      onsubmit: async (e) => {
        e.preventDefault()
        err.textContent = ''
        save.disabled = true
        try {
          const body = { quotaMb: quota.value() }
          if (pw.input.value) body.password = pw.input.value
          await call('PATCH', `/accounts/${encodeURIComponent(email)}`, body)
          toast(pw.input.value ? 'Password and storage updated' : 'Storage updated')
          go('#/accounts')
        } catch (x) {
          err.textContent = x.message
          save.disabled = false
        }
      },
    },
    h('div', { class: 'field' }, h('label', { class: 'f' }, 'Storage used'), h('div', {}, `${bytes(a.usedBytes)} of ${a.quotaBytes ? bytes(a.quotaBytes) : 'unlimited'}`)),
    pw.el,
    quota.el,
    h('div', { class: 'toolbar' }, save, h('a', { class: 'btn', href: '#/accounts' }, 'Go Back')),
    err,
  )
  const del = h('button', {
    class: 'btn danger',
    onclick: async () => {
      if (!(await confirmDialog({ title: `Delete ${email}?`, body: 'The mailbox and all of its mail are deleted permanently. Mail sent to this address will bounce. This cannot be undone.', confirm: 'Delete permanently', danger: true }))) return
      try {
        await call('DELETE', `/accounts/${encodeURIComponent(email)}`)
        toast(`${email} deleted`)
        go('#/accounts')
      } catch (x) {
        toast(x.message, true)
      }
    },
  }, 'Delete Email Account')
  app.replaceChildren(
    shell(
      'Manage an Email Account',
      h('h1', {}, 'Manage an Email Account'),
      h('p', { class: 'lead' }, h('span', { class: 'addr' }, email)),
      h('div', { class: 'toolbar' }, h('a', { class: 'btn', href: WEBMAIL, target: '_blank', rel: 'noopener' }, 'Check Email'), h('a', { class: 'btn', href: `#/devices/${encodeURIComponent(email)}` }, 'Connect Devices')),
      h('div', { class: 'card', id: 'manage-card' }, h('div', { class: 'card-h' }, h('h2', {}, 'Security and storage')), form),
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', {}, 'Delete Email Account')), h('div', { class: 'card-b' }, h('p', { class: 'lead' }, 'Removes the mailbox and every message in it.'), del)),
    ),
  )
}

async function forwardersPage() {
  const list = h('tbody', {}, h('tr', {}, h('td', { colspan: 3, class: 'empty' }, 'Loading...')))
  const local = h('input', { type: 'text', id: 'flocal', placeholder: 'e.g. info', spellcheck: 'false' })
  const to = h('input', { type: 'email', id: 'fto', placeholder: 'someone@example.com', spellcheck: 'false' })
  const err = h('div', { class: 'err', role: 'alert' })
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Add Forwarder')
  const load = async () => {
    const rows = await call('GET', '/forwarders')
    const flat = rows.flatMap((f) => f.to.map((t) => ({ from: f.from, to: t })))
    if (!flat.length) return list.replaceChildren(h('tr', {}, h('td', { colspan: 3, class: 'empty' }, 'No forwarders yet.')))
    list.replaceChildren(
      ...flat.map((f) =>
        h(
          'tr',
          {},
          h('td', { class: 'addr' }, f.from),
          h('td', { 'data-label': 'Forward to' }, f.to),
          h('td', {}, h('div', { class: 'actions' }, h('button', {
            class: 'btn sm danger',
            onclick: async () => {
              if (!(await confirmDialog({ title: 'Delete forwarder?', body: `Mail to ${f.from} will no longer be forwarded to ${f.to}.`, confirm: 'Delete', danger: true }))) return
              try {
                await call('POST', '/forwarders/remove', f)
                toast('Forwarder deleted')
                load()
              } catch (x) {
                toast(x.message, true)
              }
            },
          }, 'Delete'))),
        ),
      ),
    )
  }
  const form = h(
    'form',
    {
      novalidate: true,
      class: 'card-b',
      onsubmit: async (e) => {
        e.preventDefault()
        err.textContent = ''
        btn.disabled = true
        try {
          const r = await call('POST', '/forwarders', { local: local.value, to: to.value })
          toast(`${r.from} now forwards to ${r.to}`)
          local.value = ''
          to.value = ''
          load()
        } catch (x) {
          err.textContent = x.message
        }
        btn.disabled = false
      },
    },
    h('div', { class: 'field' }, h('label', { class: 'f', for: 'flocal' }, 'Address to forward'), h('div', { class: 'join' }, local, h('span', { class: 'suffix' }, `@${me.domain}`))),
    h('div', { class: 'field' }, h('label', { class: 'f', for: 'fto' }, 'Forward to email address'), to, h('div', { class: 'hint' }, 'Any address, inside or outside this domain. Add the same address again to forward to several people.')),
    btn,
    err,
  )
  app.replaceChildren(
    shell(
      'Forwarders',
      h('h1', {}, 'Forwarders'),
      h('p', { class: 'lead' }, 'Send a copy of all mail for an address to another address. Use forwarders for addresses that do not need their own mailbox, like info@ or sales@.'),
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', {}, 'Add Forwarder')), form),
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('h2', {}, 'Forwarders')), h('div', { class: 'table-wrap' }, h('table', { class: 'stack' }, h('thead', {}, h('tr', {}, h('th', {}, 'Address'), h('th', {}, 'Forward To'), h('th', {}))), list))),
    ),
  )
  load()
}

async function deliveryPage() {
  const q = h('input', { type: 'search', placeholder: 'Filter by email address', 'aria-label': 'Filter by email address' })
  const status = h(
    'select',
    { 'aria-label': 'Result' },
    [['all', 'All results'], ['delivered', 'Delivered'], ['problems', 'All problems'], ['deferred', 'Deferred (retrying)'], ['bounced', 'Bounced'], ['rejected', 'Rejected']].map(([v, l]) => h('option', { value: v }, l)),
  )
  const refresh = h('button', { class: 'btn', type: 'button' }, 'Refresh')
  const body = h('tbody', {}, h('tr', {}, h('td', { colspan: 6, class: 'empty' }, 'Loading...')))
  const label = { delivered: 'Delivered', deferred: 'Deferred', bounced: 'Bounced', rejected: 'Rejected', expired: 'Expired' }
  const load = async () => {
    body.replaceChildren(h('tr', {}, h('td', { colspan: 6, class: 'empty' }, 'Loading...')))
    const rows = await call('GET', `/delivery?q=${encodeURIComponent(q.value)}&status=${status.value}`)
    if (!rows.length) return body.replaceChildren(h('tr', {}, h('td', { colspan: 6, class: 'empty' }, 'No deliveries match.')))
    body.replaceChildren(
      ...rows.flatMap((r) => {
        const detail = h('tr', { class: 'detail-row', hidden: true }, h('td', { colspan: 6 }, h('div', {}, h('b', {}, 'Server response: '), r.detail || '-'), r.messageId ? h('div', {}, h('b', {}, 'Message ID: '), r.messageId) : '', r.id ? h('div', {}, h('b', {}, 'Queue ID: '), r.id) : ''))
        const row = h(
          'tr',
          { class: 'click', onclick: () => (detail.hidden = !detail.hidden), title: 'Show details' },
          h('td', {}, h('span', { class: `status-dot ${r.status}` }), label[r.status] ?? r.status),
          h('td', { 'data-label': 'Sender' }, h('div', {}, r.from || h('span', { class: 'sub' }, '(none)')), h('div', { class: 'sub' }, r.direction === 'in' ? 'Incoming' : 'Outgoing')),
          h('td', { 'data-label': 'Recipient' }, r.to),
          h('td', { class: 'hide-sm' }, r.relay || '-'),
          h('td', { class: 'hide-sm' }, r.size ? bytes(r.size) : '-'),
          h('td', { 'data-label': 'Time' }, when(r.time)),
        )
        return [row, detail]
      }),
    )
  }
  let timer
  q.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(load, 350)
  })
  status.addEventListener('change', load)
  refresh.addEventListener('click', load)
  app.replaceChildren(
    shell(
      'Track Delivery',
      h('h1', {}, 'Track Delivery'),
      h('p', { class: 'lead' }, 'Every message the server sent or received, newest first. Click a row for the receiving server’s exact response.'),
      h('div', { class: 'card' }, h('div', { class: 'card-h' }, h('div', { class: 'toolbar' }, q, status), refresh), h('div', { class: 'table-wrap' }, h('table', { class: 'stack' }, h('thead', {}, h('tr', {}, h('th', {}, 'Result'), h('th', {}, 'Sender'), h('th', {}, 'Recipient'), h('th', { class: 'hide-sm' }, 'Delivery host'), h('th', { class: 'hide-sm' }, 'Size'), h('th', {}, 'Time'))), body))),
    ),
  )
  load()
}

async function deliverabilityPage() {
  const wrap = h('div', {}, h('div', { class: 'card' }, h('div', { class: 'empty' }, 'Checking DNS...')))
  app.replaceChildren(shell('Email Deliverability', h('h1', {}, 'Email Deliverability'), h('p', { class: 'lead' }, 'These records tell other mail servers that mail from this domain is genuine. When all are valid, mail lands in the inbox instead of spam.'), wrap))
  const d = await call('GET', '/deliverability')
  const bad = d.records.filter((r) => !r.ok)
  wrap.replaceChildren(
    h('div', { class: `notice ${bad.length ? 'warn' : 'ok'}` }, bad.length ? `${bad.length} of ${d.records.length} records need attention. Add or fix them at your domain's DNS provider (reverse DNS is set by the server host).` : 'All records are valid. Mail from this domain is fully authenticated.'),
    ...d.records.map((r) =>
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'card-h' }, h('h2', {}, r.label), h('span', { class: `pill ${r.ok ? 'ok' : 'bad'}` }, r.ok ? 'Valid' : 'Problem')),
        h(
          'div',
          { class: 'card-b' },
          h(
            'div',
            { class: 'kv' },
            h('div', {}, 'Type'), h('div', {}, h('code', {}, r.type)),
            h('div', {}, 'Name'), h('div', {}, h('div', { class: 'copy' }, h('code', {}, r.name), copyBtn(r.name))),
            h('div', {}, 'Value'), h('div', {}, h('div', { class: 'copy' }, h('code', {}, r.value), copyBtn(r.value))),
            h('div', {}, 'Found now'), h('div', {}, r.current ? h('code', {}, r.current) : h('span', { class: 'sub' }, 'Nothing published')),
            h('div', {}, 'Set at'), h('div', {}, r.where),
          ),
          r.note ? h('div', { class: 'notice warn' }, r.note) : '',
        ),
      ),
    ),
  )
}

async function devicesPage(email) {
  const ov = await call('GET', '/overview')
  const user = email || ov.settings.username
  const s = ov.settings
  app.replaceChildren(
    shell(
      'Connect Devices',
      h('h1', {}, 'Connect Devices'),
      h('p', { class: 'lead' }, 'Use these settings in Outlook, Apple Mail, Thunderbird or the phone’s mail app. Choose IMAP.'),
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'card-h' }, h('h2', {}, 'Secure SSL/TLS Settings (Recommended)')),
        h(
          'div',
          { class: 'card-b' },
          h(
            'div',
            { class: 'kv' },
            h('div', {}, 'Username'), h('div', {}, h('div', { class: 'copy' }, h('code', {}, user), copyBtn(user))),
            h('div', {}, 'Password'), h('div', {}, 'The email account’s password'),
            h('div', {}, 'Incoming server (IMAP)'), h('div', {}, h('div', { class: 'copy' }, h('code', {}, s.incoming.server), copyBtn(s.incoming.server)), h('div', { class: 'sub' }, `Port ${s.incoming.imapPort}, ${s.incoming.security}`)),
            h('div', {}, 'Outgoing server (SMTP)'), h('div', {}, h('div', { class: 'copy' }, h('code', {}, s.outgoing.server), copyBtn(s.outgoing.server)), h('div', { class: 'sub' }, s.outgoing.ports.map((p) => `Port ${p.port}, ${p.security}`).join(' or '))),
            h('div', {}, 'Authentication'), h('div', {}, 'Required for IMAP and SMTP (normal password)'),
          ),
        ),
      ),
      h('div', { class: 'notice info' }, 'Webmail needs no setup: open ', h('a', { href: WEBMAIL, target: '_blank', rel: 'noopener' }, location.origin + WEBMAIL), ' and sign in with the email address and password.'),
    ),
  )
}

function passwordPage() {
  const cur = h('input', { type: 'password', id: 'cur', autocomplete: 'current-password' })
  const pw = passwordField('next', 'New password')
  const err = h('div', { class: 'err', role: 'alert' })
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Change Password')
  const form = h(
    'form',
    {
      novalidate: true,
      class: 'card-b',
      onsubmit: async (e) => {
        e.preventDefault()
        err.textContent = ''
        btn.disabled = true
        try {
          await call('POST', '/password', { current: cur.value, next: pw.input.value })
          toast('Panel password changed')
          cur.value = ''
          pw.input.value = ''
        } catch (x) {
          err.textContent = x.message
        }
        btn.disabled = false
      },
    },
    h('div', { class: 'field' }, h('label', { class: 'f', for: 'cur' }, 'Current password'), cur),
    pw.el,
    btn,
    err,
  )
  app.replaceChildren(shell('Panel Password', h('h1', {}, 'Panel Password'), h('p', { class: 'lead' }, 'The password for this mail panel (user "admin"). Mailbox passwords are changed under Email Accounts › Manage.'), h('div', { class: 'card' }, form)))
}

// ---------- router ----------
async function render() {
  app.classList.remove('boot')
  if (!me.user) return loginPage()
  const { page, arg } = route()
  try {
    if (page === 'create') return createPage()
    if (page === 'manage' && arg) return await managePage(arg)
    if (page === 'forwarders') return await forwardersPage()
    if (page === 'delivery') return await deliveryPage()
    if (page === 'deliverability') return await deliverabilityPage()
    if (page === 'devices') return await devicesPage(arg)
    if (page === 'password') return passwordPage()
    return await accountsPage()
  } catch (x) {
    if (me.user) toast(x.message, true)
  }
}

window.addEventListener('hashchange', render)
;(async () => {
  try {
    me = await call('GET', '/me')
  } catch {}
  document.title = `Mail Panel · ${me.domain}`
  render()
})()
