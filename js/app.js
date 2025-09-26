/* PWA STAFF – app.js (final robust)
 * - Boutons "Mémoriser" et "Tester /health" via délégation d'événements
 * - Stockage URL API dans localStorage 'api_url' (même clé que le Client)
 * - Chargement /tables (fallback T1..T5 si vide/erreur)
 * - Poll /staff/summary toutes les 5s
 * - Aucun changement d’UI requis
 */

(function () {
  const LS_KEY = 'api_url';

  // --------- Utils DOM ----------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // Essaie de trouver l'input URL API le plus probable
  function findApiInput() {
    return (
      $('input[type="url"]') ||
      $('#api') || $('#apiUrl') || $('input[name="api"]') ||
      $$('input').find(i => /https?:\/\//i.test(i.placeholder||'')) ||
      $$('input').find(i => /api/i.test((i.id||'') + ' ' + (i.name||'')))
    );
  }

  const apiInput = findApiInput();

  // Panneaux "Tables" et "Résumé du jour"
  function findPanelByTitle(word) {
    const blocks = $$('section,div');
    let p = blocks.find(n => new RegExp(`\\b${word}\\b`, 'i')
      .test(n.querySelector('h1,h2,h3,h4,h5,h6')?.textContent||''));
    if (!p) p = blocks.find(n => new RegExp(`\\b${word}\\b`, 'i').test(n.textContent||''));
    return p || document.body;
  }
  function ensureBody(panel, attr) {
    let body = panel.querySelector(`[data-role="${attr}"]`) ||
               panel.querySelector(`#${attr}`) ||
               panel.querySelector(`.${attr}`);
    if (!body) {
      body = document.createElement('div');
      body.setAttribute('data-role', attr);
      const h = panel.querySelector('h1,h2,h3,h4,h5,h6');
      if (h && h.parentNode===panel) panel.insertBefore(body, h.nextSibling);
      else panel.appendChild(body);
    }
    return body;
  }

  const tablesPanel = () => findPanelByTitle('Tables');
  const summaryPanel = () => findPanelByTitle('Résumé');
  const tablesBody  = () => ensureBody(tablesPanel(), 'tables-body');
  const summaryBody = () => ensureBody(summaryPanel(), 'summary-body');

  function getApi() {
    const fromInput = (apiInput?.value || '').trim();
    if (fromInput) return fromInput;
    try { return localStorage.getItem(LS_KEY) || ''; } catch { return ''; }
  }
  function setApi(url) {
    if (!url) return;
    try { localStorage.setItem(LS_KEY, url); } catch {}
    if (apiInput) apiInput.value = url;
  }
  function restoreApiFromLS() {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved && apiInput) apiInput.value = saved;
    } catch {}
  }

  function setHealthBadge(ok) {
    const pill = $('[data-pill="ok"]');
    if (pill) {
      pill.textContent = ok ? 'OK' : 'KO';
      pill.style.background = ok ? '#2ecc71' : '#e74c3c';
    }
  }

  const fallbackTables = () => ([
    { id:'T1', pending:0, lastTicket:null },
    { id:'T2', pending:0, lastTicket:null },
    { id:'T3', pending:0, lastTicket:null },
    { id:'T4', pending:0, lastTicket:null },
    { id:'T5', pending:0, lastTicket:null },
  ]);

  function renderTables(list) {
    const body = tablesBody();
    body.innerHTML = '';

    const tables = (Array.isArray(list) && list.length)
      ? (typeof list[0] === 'string'
          ? list.map(id => ({ id, pending:0, lastTicket:null }))
          : list)
      : fallbackTables();

    for (const t of tables) {
      const card = document.createElement('div');
      card.className = 'card table';
      card.innerHTML = `
        <div class="card-title">Table ${t.id || ''}</div>
        <div class="card-meta">
          <span>En attente : <strong>${t.pending ?? 0}</strong></span>
          <span style="margin-left:12px">Dernier ticket : <strong>${t.lastTicket ?? '-'}</strong></span>
        </div>
        <div class="card-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" disabled>Imprimer maintenant</button>
          <button class="btn btn-outline" disabled>Paiement confirmé</button>
        </div>
      `;
      body.appendChild(card);
    }
  }

  async function loadTables() {
    const base = getApi();
    if (!base) return renderTables(null);
    try {
      const r = await fetch(`${base.replace(/\/+$/,'')}/tables?ts=${Date.now()}`, { cache:'no-store' });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      renderTables(Array.isArray(data) ? data : (data?.tables || data?.data || null));
    } catch (e) {
      console.warn('Tables => fallback', e);
      renderTables(null);
    }
  }

  function renderSummary(rows) {
    const body = summaryBody();
    body.innerHTML = '';

    const items = Array.isArray(rows)
      ? rows
      : (Array.isArray(rows?.summary) ? rows.summary : (Array.isArray(rows?.data) ? rows.data : []));

    if (!items.length) {
      body.innerHTML = `<div class="muted">Aucun ticket aujourd'hui</div>`;
      return;
    }

    for (const ev of items) {
      const div = document.createElement('div');
      div.className = 'summary-item';
      const lines = ev.lines || ev.items || [];
      const list  = Array.isArray(lines) ? lines.map(l => `${l.qty || 1}× ${l.name || l.title || '?'}`).join(', ') : '';
      const tot   = typeof ev.total === 'number' ? ev.total.toFixed(2)+' €' : '';
      const when  = ev.ts ? new Date(ev.ts).toLocaleTimeString() : (ev.at || '');
      div.innerHTML = `
        <div><strong>${ev.table || '-'}</strong> — ${when}</div>
        <div>${list}</div>
        <div>${tot}</div>
      `;
      body.appendChild(div);
    }
  }

  async function loadSummary() {
    const base = getApi();
    if (!base) return renderSummary([]);
    try {
      const r = await fetch(`${base.replace(/\/+$/,'')}/staff/summary?ts=${Date.now()}`, { cache:'no-store' });
      if (r.status === 404) return renderSummary([]);
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      renderSummary(data);
    } catch (e) {
      renderSummary([]);
    }
  }

  async function testHealth() {
    const base = getApi();
    if (!base) return setHealthBadge(false);
    try {
      const r = await fetch(`${base.replace(/\/+$/,'')}/health?ts=${Date.now()}`, { cache:'no-store' });
      setHealthBadge(r.ok);
      try { console.log('health =>', await r.json()); } catch {}
    } catch {
      setHealthBadge(false);
    }
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const txt = (t.textContent || '').trim().toLowerCase();

    if (/m[ée]moriser/.test(txt)) {
      const val = (apiInput?.value || '').trim();
      if (val) setApi(val);
      loadTables();
      loadSummary();
      testHealth();
    }

    if (/tester/.test(txt) && /health/.test(txt)) {
      testHealth();
    }

    if (/rafra[îi]chir/.test(txt)) {
      const host = t.closest('section,div');
      if (host && /tables/i.test(host.textContent||'')) {
        loadTables();
      } else if (host && /r[ée]sum[ée]/i.test(host.textContent||'')) {
        loadSummary();
      } else {
        loadTables(); loadSummary();
      }
    }
  }, true);

  restoreApiFromLS();
  loadTables();
  loadSummary();
  testHealth();
  setInterval(loadSummary, 5000);
  window.__RQR_reloadTables = loadTables;
  window.__RQR_reloadSummary = loadSummary;
})();
