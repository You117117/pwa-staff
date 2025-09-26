/* Staff app – robust version (final) */
(() => {
  const $ = sel => document.querySelector(sel);

  // ----- éléments DOM (inchangés)
  const apiInput      = $('#apiUrl');
  const healthBadge   = $('#healthBadge');
  const tablesWrap    = $('#tables');
  const tablesEmpty   = $('#tablesEmpty');
  const summaryWrap   = $('#summary');
  const summaryEmpty  = $('#summaryEmpty');
  const filterSel     = $('#filter');

  const LS_KEY = 'staff_api_url';

  // ----- helpers API (inchangés)
  function getApiBase() {
    return (localStorage.getItem(LS_KEY) || apiInput.value || '').trim().replace(/\/$/, '');
  }
  function setApiBase(url) {
    localStorage.setItem(LS_KEY, url.trim());
    apiInput.value = url.trim();
  }
  function restoreApi() {
    const v = localStorage.getItem(LS_KEY);
    if (v) apiInput.value = v;
  }

  // ----- boutons header (inchangés)
  $('#btnRemember').onclick = () => {
    const url = apiInput.value.trim();
    if (!/^https?:\/\//.test(url)) { markHealth('Invalide'); return; }
    setApiBase(url);
    markHealth('Sauvé');
  };
  $('#btnHealth').onclick       = () => probeHealth();
  $('#btnRefresh').onclick      = () => refreshAll();
  $('#btnRefreshSummary').onclick = () => refreshSummary();

  // ----- filtre tables (inchangé mais rend robustes données)
  filterSel.onchange = () => renderTables(lastTables);

  // ----- appels HTTP (inchangés)
  async function apiGET(path) {
    const r = await fetch(getApiBase() + path, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  async function apiPOST(path, body) {
    const r = await fetch(getApiBase() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(r.status);
    return r.json().catch(() => ({}));
  }

  // ----- santé (inchangé)
  function markHealth(txt, ok) {
    healthBadge.textContent = txt;
    healthBadge.className = 'badge ' + (ok === true ? 'ok' : ok === false ? 'err' : '');
  }
  async function probeHealth() {
    markHealth('…');
    try {
      const j = await apiGET('/health');
      markHealth(j.ok ? 'OK' : 'KO', j.ok);
    } catch {
      markHealth('KO', false);
    }
  }

  // ============================================================
  // ===================   TABLES (GET /tables)  =================
  // ============================================================

  let lastTables = null;

  // <— ICI la robustesse : on accepte un tableau brut OU {tables:[...]}
  function normalizeTablesPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.tables)) return payload.tables;
    return [];
  }

  function ensureFilterOptions(tables) {
    // Renseigne le <select id="filter"> si besoin (ALL + liste des tables)
    // On ne duplique pas si déjà rempli avec ces options.
    const current = Array.from(filterSel.options).map(o => o.value).join(',');
    const wanted  = ['ALL', ...tables.map(t => String(t.id))].join(',');
    if (current === wanted) return;

    filterSel.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = 'ALL';
    optAll.textContent = 'Toutes';
    filterSel.appendChild(optAll);

    tables.forEach(t => {
      const opt = document.createElement('option');
      opt.value = String(t.id);
      opt.textContent = String(t.name || ('Table ' + t.id));
      filterSel.appendChild(opt);
    });
  }

  function renderTables(payload) {
    lastTables = payload;

    const rows = normalizeTablesPayload(payload);
    ensureFilterOptions(rows);

    tablesWrap.innerHTML = '';

    // filtrage
    const shownRows = rows.filter(t => {
      return filterSel.value === 'ALL' || String(t.id) === filterSel.value;
    });

    if (!shownRows.length) {
      tablesEmpty.style.display = '';
      return;
    }
    tablesEmpty.style.display = 'none';

    shownRows.forEach(t => {
      const el = document.createElement('div');
      el.className = 'table';
      el.innerHTML = `
        <h3>${ t.name ? esc(t.name) : ('Table ' + esc(t.id)) }</h3>
        <div class="row">
          <span class="chip">En attente : <b>${ Number(t.pending||0) }</b></span>
          <span class="chip">Dernier ticket : <b>${ esc(t.last_ticket || '-') }</b></span>
        </div>
        <div class="actions-row">
          <button class="btnPrint" data-table="${ esc(t.id) }">Imprimer maintenant</button>
          <button class="secondary btnPaid" data-table="${ esc(t.id) }">Paiement confirmé</button>
        </div>
      `;
      tablesWrap.appendChild(el);
    });

    bindTableButtons();
  }

  function bindTableButtons() {
    tablesWrap.querySelectorAll('.btnPrint').forEach(b => b.onclick = async e => {
      const t = e.currentTarget.dataset.table;
      try {
        await apiPOST('/staff/print', { table: t });
        e.currentTarget.textContent = 'Imprimé ✓';
        setTimeout(() => e.currentTarget.textContent = 'Imprimer maintenant', 1500);
        refreshTables();
      } catch {
        e.currentTarget.textContent = 'Erreur';
        setTimeout(() => e.currentTarget.textContent = 'Imprimer maintenant', 1500);
      }
    });

    tablesWrap.querySelectorAll('.btnPaid').forEach(b => b.onclick = async e => {
      const t = e.currentTarget.dataset.table;
      try {
        await apiPOST('/staff/confirm', { table: t });
        e.currentTarget.textContent = 'Confirmé ✓';
        setTimeout(() => e.currentTarget.textContent = 'Paiement confirmé', 1500);
        refreshTables();
      } catch {
        e.currentTarget.textContent = 'Erreur';
        setTimeout(() => e.currentTarget.textContent = 'Paiement confirmé', 1500);
      }
    });
  }

  async function refreshTables() {
    try {
      const data = await apiGET('/tables');
      renderTables(data);                       // <— accepte array ou {tables}
    } catch {
      tablesWrap.innerHTML = '';
      tablesEmpty.style.display = '';
    }
  }

  // ============================================================
  // ==================   RÉSUMÉ (GET /staff/summary) ===========
  // ============================================================

  async function refreshSummary() {
    try {
      renderSummary(await apiGET('/staff/summary'));
    } catch {
      summaryWrap.innerHTML = '';
      summaryEmpty.style.display = '';
    }
  }

  function renderSummary(data) {
    const list = (data?.tickets || []);
    summaryWrap.innerHTML = '';
    summaryEmpty.style.display = list.length ? 'none' : '';

    list.forEach(t => {
      const it = document.createElement('div');
      it.className = 'table';
      const items = (t.items || []).map(i => `${i.qty}× ${i.name}`).join(', ');
      it.innerHTML = `
        <div class="row">
          <span class="chip"><b>${ esc(t.table) }</b></span>
          <span class="chip">⏱ ${ esc(t.time || '') }</span>
          <span class="chip">Total : <b>${ esc(t.total) } €</b></span>
        </div>
        <div class="muted" style="margin-top:8px">${ items || '—' }</div>
      `;
      summaryWrap.appendChild(it);
    });
  }

  // ============================================================
  // ========================== INIT ============================
  // ============================================================

  async function refreshAll() {
    await Promise.all([refreshTables(), refreshSummary()]);
  }
  function startPolling() { setInterval(refreshAll, 10000); } // 10 s

  restoreApi();
  probeHealth();
  refreshAll();
  startPolling();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  }

  // ----- util
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
      {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]
    ));
  }
})();
