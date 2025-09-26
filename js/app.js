/* app.js — staff
   - Charge l’URL API depuis l’input (mémorisée en localStorage)
   - Affiche les tables via GET /tables
   - Si l’API est vide/erreur, fallback sur T1..T5 (pour ne jamais rester “Aucune table”)
   - Bouton “Tester /health” : affiche OK/KO sans casser l’écran
   - Bouton “Rafraîchir” : recharge tables + résumé (le résumé est géré dans bridge-orders-staff.js)
*/

(function () {
  const LS_KEY_API = 'RQR_API_URL';
  const apiInput = document.querySelector('input[type="url"], input#api, input#apiUrl, input[name="api"]');
  const btnMemoriser = document.querySelector('button[data-action="memoriser"], button:contains("Mémoriser")');
  const btnHealth = document.querySelector('button[data-action="test-health"], button:contains("Tester /health")');
  const btnRefreshTables = document.querySelector('button[data-action="refresh-tables"], button:contains("Rafraîchir")');
  const selectFilter = document.querySelector('select[data-role="tables-filter"]') || document.querySelector('select');

  // Conteneur des cartes de tables (le 1er grand panneau à gauche)
  const tablesPanel = document.querySelector('[data-panel="tables"]') ||
                      document.querySelector('.tables-panel') ||
                      document.querySelectorAll('section,div').item(1);

  // Helpers
  const getApi = () => (apiInput?.value || '').trim();
  const setStatusOk = (ok) => {
    // Petit indicateur vert/rouge (optionnel)
    const pill = document.querySelector('[data-pill="ok"]');
    if (pill) {
      pill.textContent = ok ? 'OK' : 'KO';
      pill.style.background = ok ? '#2ecc71' : '#e74c3c';
    }
  };

  const saveApi = () => {
    const url = getApi();
    if (!url) return;
    try {
      localStorage.setItem(LS_KEY_API, url);
    } catch {}
  };

  const restoreApi = () => {
    try {
      const saved = localStorage.getItem(LS_KEY_API);
      if (saved && apiInput) apiInput.value = saved;
    } catch {}
  };

  // Fallback tables si l’API ne renvoie rien
  const fallbackTables = () => ([
    { id: 'T1', pending: 0, lastTicket: null },
    { id: 'T2', pending: 0, lastTicket: null },
    { id: 'T3', pending: 0, lastTicket: null },
    { id: 'T4', pending: 0, lastTicket: null },
    { id: 'T5', pending: 0, lastTicket: null },
  ]);

  // Rendu ultra simple d’une carte table (on ne touche pas à ton CSS, on laisse le markup générique)
  const renderTables = (tables) => {
    if (!tablesPanel) return;
    tablesPanel.innerHTML = '';

    if (!tables || !tables.length) {
      tablesPanel.innerHTML = `<div class="card empty">Aucune table</div>`;
      return;
    }

    for (const t of tables) {
      const card = document.createElement('div');
      card.className = 'card table';
      card.innerHTML = `
        <div class="card-title">Table ${t.id?.replace(/^T/i,'T') || ''}</div>
        <div class="card-meta">
          <span>En attente&nbsp;: <strong>${t.pending ?? 0}</strong></span>
          <span style="margin-left:12px">Dernier ticket&nbsp;: <strong>${t.lastTicket ?? '-'}</strong></span>
        </div>
        <div class="card-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-outline" disabled>Paiement confirmé</button>
          <button class="btn" disabled>Imprimer maintenant</button>
        </div>
      `;
      tablesPanel.appendChild(card);
    }
  };

  // Charge /tables (tolérant)
  const loadTables = async () => {
    const base = getApi();
    if (!base) {
      renderTables(fallbackTables());
      return;
    }

    try {
      const res = await fetch(`${base.replace(/\/+$/,'')}/tables?ts=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // On peut accepter plusieurs formats:
      // - [{id:"T1", pending:0, lastTicket:null}, ...]
      // - ["T1","T2",...]
      let tables = Array.isArray(data) ? data : [];
      if (tables.length && typeof tables[0] === 'string') {
        tables = tables.map(id => ({ id, pending: 0, lastTicket: null }));
      }

      // Si l’API renvoie [], on bascule sur le fallback pour garder l’écran utile
      renderTables(tables.length ? tables : fallbackTables());
    } catch (e) {
      console.warn('Tables: fallback (cause:', e?.message || e, ')');
      renderTables(fallbackTables());
    }
  };

  // Test /health
  const testHealth = async () => {
    const base = getApi();
    if (!base) return setStatusOk(false);
    try {
      const r = await fetch(`${base.replace(/\/+$/,'')}/health?ts=${Date.now()}`, { cache: 'no-store' });
      const ok = r.ok;
      setStatusOk(ok);
      try {
        const j = await r.json();
        console.log('health =>', j);
      } catch {}
    } catch (e) {
      console.warn('health error', e);
      setStatusOk(false);
    }
  };

  // Init
  restoreApi();
  // Auto render au premier affichage
  loadTables();

  // Écouteurs UI (sans casser ton HTML : on teste la présence avant d’attacher)
  btnMemoriser?.addEventListener('click', () => { saveApi(); });
  btnHealth?.addEventListener('click', () => { testHealth(); });
  btnRefreshTables?.addEventListener('click', () => { loadTables(); });

  // Filtre (si tu as un select de catégorie — sinon ça n’impacte rien)
  selectFilter?.addEventListener('change', () => loadTables());

  // Expose pour bridge-orders-staff.js (rafraîchir depuis le bridge)
  window.__RQR_reloadTables = loadTables;
})();
