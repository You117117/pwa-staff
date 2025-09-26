/* app.js — PWA Staff (final)
   - Boutons "Mémoriser" & "Tester /health"
   - /tables (fallback si vide)
   - Poll /staff/summary toutes les 5s (bridge client -> staff)
   - Aucun changement d'UI
*/
(function () {
  const LS_KEY_API = 'RQR_API_URL';

  // ------- helpers DOM robustes -------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const apiInput =
    $('input[type="url"]') ||
    $('#api') || $('#apiUrl') || $('input[name="api"]');

  // Bouton "Mémoriser"
  const btnMemoriser = $$('.btn,button').find(b => /m[ée]moriser/i.test(b.textContent||''));
  // Bouton "Tester /health"
  const btnHealth = $$('.btn,button').find(b => /tester\s*\/?health/i.test(b.textContent||''));

  // Bouton "Rafraîchir" du panneau Tables
  const btnRefreshTables = $$('.btn,button').find(b => {
    if (!/rafra[îi]chir/i.test(b.textContent||'')) return false;
    const host = b.closest('section,div');
    return !!host && /tables/i.test(host.textContent||'');
  });

  // Trouver panneau "Tables" et "Résumé"
  function findTablesPanel() {
    const sections = $$('section,div');
    let p = sections.find(n => /tables/i.test(n.querySelector('h1,h2,h3,h4,h5,h6')?.textContent||''));
    if (!p) p = sections.find(n => /tables/i.test(n.textContent||''));
    return p || document.body;
  }
  function findSummaryPanel() {
    const sections = $$('section,div');
    let p = sections.find(n => /r[ée]sum[ée]/i.test(n.querySelector('h1,h2,h3,h4,h5,h6')?.textContent||''));
    if (!p) p = sections.find(n => /r[ée]sum[ée]/i.test(n.textContent||''));
    return p || document.body;
  }

  function ensureTablesBody() {
    const panel = findTablesPanel();
    let body = $('[data-role="tables-body"]', panel) || $('#tables-body', panel) || $('.tables-body', panel);
    if (!body) {
      body = document.createElement('div');
      body.setAttribute('data-role', 'tables-body');
      const h = $('h1,h2,h3,h4,h5,h6', panel);
      if (h && h.parentNode===panel) panel.insertBefore(body, h.nextSibling);
      else panel.appendChild(body);
    }
    return body;
  }
  function ensureSummaryBody() {
    const panel = findSummaryPanel();
    let body = $('[data-role="summary-body"]', panel) || $('#summary-body', panel) || $('.summary-body', panel);
    if (!body) {
      body = document.createElement('div');
      body.setAttribute('data-role', 'summary-body');
      const h = $('h1,h2,h3,h4,h5,h6', panel);
      if (h && h.parentNode===panel) panel.insertBefore(body, h.nextSibling);
      else panel.appendChild(body);
    }
    return body;
  }

  // ------- stockage & statut -------
  const getApi = () => (apiInput?.value || '').trim();
  const saveApi = () => { const u=getApi(); if(u) try{localStorage.setItem(LS_KEY_API,u);}catch{} };
  const restoreApi = () => { try{const s=localStorage.getItem(LS_KEY_API); if(s&&apiInput) apiInput.value=s;}catch{} };

  function setHealthBadge(ok) {
    // si tu as un petit badge "OK/KO" dans l'en-tête, on l'actualise
    const pill = $('[data-pill="ok"]');
    if (pill) {
      pill.textContent = ok ? 'OK' : 'KO';
      pill.style.background = ok ? '#2ecc71' : '#e74c3c';
    }
  }

  // ------- rendu tables -------
  const fallbackTables = () => ([
    { id:'T1', pending:0, lastTicket:null },
    { id:'T2', pending:0, lastTicket:null },
    { id:'T3', pending:0, lastTicket:null },
    { id:'T4', pending:0, lastTicket:null },
    { id:'T5', pending:0, lastTicket:null },
  ]);

  function renderTables(tables) {
    const body = ensureTablesBody();
    body.innerHTML = '';
    if (!tables || !tables.length) {
      body.innerHTML = `<div class="card empty">Aucune table</div>`;
      return;
    }
    for (const t of tables) {
      const card = document.createElement('div');
      card.className = 'card table';
      card.innerHTML = `
        <div class="card-title">Table ${t.id || ''}</div>
        <div class="card-meta">
          <span>En attente&nbsp;: <strong>${t.pending ?? 0}</strong></span>
          <span style="margin-left:12px">Dernier ticket&nbsp;: <strong>${t.lastTicket ?? '-'}</strong></span>
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
    if (!base) { renderTables(fallbackTables()); return; }
    try {
      const r = await fetch(`${base.replace(/\/+$/,'')}/tables?ts=${Date.now()}`, { cache:'no-store' });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      let tables = Array.isArray(data) ? data : [];
      if (tables.length && typeof tables[0]==='string') {
        tables = tables.map(id => ({ id, pending:0, lastTicket:null }));
      }
      renderTables(tables.length ? tables : fallbackTables());
    } catch (e) {
      console.warn('Tables => fallback', e);
      renderTables(fallbackTables());
    }
  }

  // ------- résumé /staff/summary -------
  function renderSummary(items) {
    const body = ensureSummaryBody();
    body.innerHTML = '';
    if (!items || !items.length) {
      body.innerHTML = `<div class="muted">Aucun ticket aujourd'hui</div>`;
      return;
    }
    for (const it of items) {
      const el = document.createElement('div');
      el.className = 'summary-item';
      const lines = [];
      lines.push(`<div><strong>${it.table || '-'}</strong> — ${it.at || ''}</div>`);
      if (Array.isArray(it.items) && it.items.length) {
        const list = it.items.map(x => `${x.qty || x.q || 1}× ${x.title || x.name || x.id || '?'}`).join(', ');
        lines.push(`<div>${list}</div>`);
      }
      if (typeof it.total === 'number') lines.push(`<div>Total: ${it.total.toFixed(2)} €</div>`);
      el.innerHTML = lines.join('');
      body.appendChild(el);
    }
  }

  async function loadSummary() {
    const base = getApi();
    if (!base) { renderSummary([]); return; }
    try {
      const r = await fetch(`${base.replace(/\/+$/,'')}/staff/summary?ts=${Date.now()}`, { cache:'no-store' });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      const items = Array.isArray(data) ? data : (data?.orders || []);
      renderSummary(items);
    } catch (e) {
      // on n'affiche pas d'erreur rouge, on laisse "Aucun ticket"
      renderSummary([]);
    }
  }

  // ------- health -------
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

  // ------- init -------
  restoreApi();
  // lie les boutons (on re-binde même si déjà lié)
  btnMemoriser?.addEventListener('click', saveApi);
  btnHealth?.addEventListener('click', testHealth);
  btnRefreshTables?.addEventListener('click', loadTables);

  // 1er affichage
  loadTables();
  loadSummary();
  testHealth();

  // poll résumé toutes les 5s
  setInterval(loadSummary, 5000);

  // Expose pour le bridge si besoin
  window.__RQR_reloadTables = loadTables;
  window.__RQR_reloadSummary = loadSummary;
})();
