/* Staff app – version avec badge de statut
 * - /tables et /staff/tables
 * - /summary et /staff/summary
 * - au lieu de "En attente : 0" on met une pastille "Vide"
 */
(() => {
  const $ = sel => document.querySelector(sel);

  const apiInput     = $('#apiUrl');
  const healthBadge  = $('#healthBadge');
  const tablesWrap   = $('#tables');
  const tablesEmpty  = $('#tablesEmpty');
  const summaryWrap  = $('#summary');
  const summaryEmpty = $('#summaryEmpty');
  const filterSel    = $('#filter');
  const lastError    = $('#lastError');
  const LS_KEY       = 'staff_api_url';

  function log(...args){ try{ console.log('[STAFF]', ...args); }catch{} }
  function showError(msg){
    if (lastError) {
      lastError.textContent = msg;
      lastError.style.display = '';
    }
  }

  // petit layout sympa
  try {
    tablesWrap.style.display = 'grid';
    tablesWrap.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
    tablesWrap.style.gap = '12px';
  } catch {}

  function saveApi(url){
    localStorage.setItem(LS_KEY, url);
    if (apiInput) apiInput.value = url;
  }
  function restoreApi(){
    const saved = localStorage.getItem(LS_KEY) || '';
    if (saved && apiInput) apiInput.value = saved;
  }
  function getApiBase(){
    const v = (apiInput?.value || '').trim().replace(/\/$/, '');
    return v;
  }

  // ----------- appels API génériques -----------
  async function apiGETmulti(paths){
    const base = getApiBase();
    for (const p of paths){
      const url = base + p;
      try{
        log('GET', url);
        const r = await fetch(url, { cache:'no-store' });
        if (!r.ok) { log('HTTP '+r.status+' for '+url); continue; }
        const j = await r.json();
        log('OK', url, j);
        return j;
      }catch(e){
        log('ERR', url, e);
      }
    }
    throw new Error('all GET attempts failed: ' + paths.join(' OR '));
  }

  async function apiPOSTmulti(paths, body){
    const base = getApiBase();
    for (const p of paths){
      const url = base + p;
      try{
        log('POST', url, body);
        const r = await fetch(url, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(body)
        });
        if (!r.ok) { log('HTTP '+r.status+' for '+url); continue; }
        const j = await r.json().catch(()=>({ok:true}));
        log('OK', url, j);
        return j;
      }catch(e){
        log('ERR', url, e);
      }
    }
    throw new Error('all POST attempts failed: ' + paths.join(' OR '));
  }

  // ----------- /health -----------
  function markHealth(txt, ok){
    if (!healthBadge) return;
    healthBadge.textContent = txt;
    healthBadge.className = 'badge ' + (ok===true ? 'ok' : ok===false ? 'err' : '');
  }
  async function probeHealth(){
    markHealth('…');
    try {
      const j = await apiGETmulti(['/health']);
      markHealth(j.ok ? 'OK' : 'KO', j.ok);
    } catch {
      markHealth('KO', false);
    }
  }

  // ----------- normalisation tables -----------
  function normalizeTables(data){
    try{
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (data.tables && Array.isArray(data.tables)) return data.tables;
      if (data.data && Array.isArray(data.data)) return data.data;
      if (data.result && Array.isArray(data.result)) return data.result;
      if (data.payload && typeof data.payload === 'object'){
        return Object.entries(data.payload).map(([id,obj]) => ({ id, ...obj }));
      }
      if (typeof data === 'object'){
        return Object.entries(data).map(([id,obj]) => ({ id, ...obj }));
      }
    }catch(e){}
    return [];
  }

  // ----------- rendu tables -----------
  let lastTables = [];

  function renderTables(data){
    const list = normalizeTables(data);
    lastTables = list;                // on mémorise pour le filtre
    tablesWrap.innerHTML = '';

    const onlyPending = (filterSel?.value === 'pending');
    // on garde le filtre existant, même si maintenant le badge n’est plus "En attente"
    const filtered = list.filter(x => {
      if (!onlyPending) return true;
      return Number(x.pending || 0) > 0;
    });

    if (filtered.length === 0) {
      tablesEmpty && (tablesEmpty.style.display = '');
      return;
    }
    tablesEmpty && (tablesEmpty.style.display = 'none');

    filtered.forEach(t => {
      const el = document.createElement('div');
      el.className = 'table';

      const lt   = t.lastTicket ? new Date(t.lastTicket.at) : null;
      const last = lt ? lt.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}) : '--:--';

      // ⚠️ ici on enlève complètement "En attente : 0"
      // et on met à la place une pastille de statut par défaut = "Vide"
      el.innerHTML = `
        <div class="row">
          <span class="chip"><b>${t.id}</b></span>
          <span class="chip status-chip">Vide</span>
          <span class="chip">Dernier : ${last}</span>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="primary btnPrint" data-table="${t.id}">Imprimer maintenant</button>
          <button class="ghost btnPaid" data-table="${t.id}">Paiement confirmé</button>
        </div>
      `;
      tablesWrap.appendChild(el);
    });

    // boutons
    tablesWrap.querySelectorAll('.btnPrint').forEach(b => {
      b.onclick = async e => {
        const t = e.currentTarget.dataset.table;
        try {
          await apiPOSTmulti(['/print','/staff/print'], { table: t });
          e.currentTarget.textContent = 'Imprimé ✓';
        } catch(err){
          e.currentTarget.textContent = 'Erreur';
          showError(err.message);
        }
        setTimeout(() => { e.currentTarget.textContent = 'Imprimer maintenant'; }, 1200);
      };
    });

    tablesWrap.querySelectorAll('.btnPaid').forEach(b => {
      b.onclick = async e => {
        const t = e.currentTarget.dataset.table;
        try {
          await apiPOSTmulti(['/confirm','/staff/confirm'], { table: t });
          e.currentTarget.textContent = 'Confirmé ✓';
        } catch(err){
          e.currentTarget.textContent = 'Erreur';
          showError(err.message);
        }
        setTimeout(() => { e.currentTarget.textContent = 'Paiement confirmé'; }, 1200);
        refreshTables();
      };
    });
  }

  // ----------- rendu summary -----------
  function renderSummary(data){
    const list = (data?.tickets || []);
    summaryWrap.innerHTML = '';
    summaryEmpty && (summaryEmpty.style.display = list.length ? 'none' : '');
    list.forEach(t => {
      const it = document.createElement('div');
      it.className = 'table';
      const items = (t.items || []).map(i => `${i.qty}× ${i.name}`).join(', ');
      it.innerHTML = `
        <div class="row">
          <span class="chip"><b>${t.table}</b></span>
          <span class="chip">⏱ ${t.time || ''}</span>
          <span class="chip">Total : <b>${t.total} €</b></span>
        </div>
        <div class="muted" style="margin-top:8px">${items || '—'}</div>
      `;
      summaryWrap.appendChild(it);
    });
  }

  // ----------- refresh -----------
  async function refreshTables(){
    try {
      const j = await apiGETmulti(['/tables','/staff/tables']);
      renderTables(j);
    } catch(e){
      tablesWrap.innerHTML = '';
      tablesEmpty && (tablesEmpty.style.display = '');
      showError('Tables: ' + e.message);
    }
  }

  async function refreshSummary(){
    try {
      const j = await apiGETmulti(['/summary','/staff/summary']);
      renderSummary(j);
    } catch(e){
      summaryWrap.innerHTML = '';
      summaryEmpty && (summaryEmpty.style.display = '');
      showError('Summary: ' + e.message);
    }
  }

  async function refreshAll(){
    await Promise.all([refreshTables(), refreshSummary()]);
  }

  function startPolling(){
    setInterval(refreshAll, 10000);
  }

  // UI
  $('#btnRemember')?.addEventListener('click', () => saveApi(apiInput?.value || ''));
  $('#btnHealth')?.addEventListener('click', () => probeHealth());
  $('#btnRefreshTables')?.addEventListener('click', () => refreshTables());
  $('#btnRefreshSummary')?.addEventListener('click', () => refreshSummary());
  if (filterSel) {
    filterSel.onchange = () => {
      // réafficher à partir des données mémorisées
      renderTables(lastTables);
    };
  }

  // init
  restoreApi();
  probeHealth();
  refreshAll();
  startPolling();

  // SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  }
})();
