/* app.js — staff (v2)
   - Trouve de façon robuste le panneau "Tables" et y injecte un body si absent
   - Affiche un fallback T1..T5 si /tables est vide/erreur
   - Boutons: Mémoriser, Tester /health, Rafraîchir (inchangés)
*/

(function () {
  const LS_KEY_API = 'RQR_API_URL';

  // --- Sélecteurs de base
  const apiInput =
    document.querySelector('input[type="url"], input#api, input#apiUrl, input[name="api"]');
  const btnMemoriser = Array.from(document.querySelectorAll('button'))
    .find(b => /mémoriser/i.test(b.textContent || ''));
  const btnHealth = Array.from(document.querySelectorAll('button'))
    .find(b => /tester\s*\/?health/i.test(b.textContent || ''));
  const btnRefreshTables = Array.from(document.querySelectorAll('button'))
    .find(b => /rafraîchir/i.test(b.textContent || '') &&
               b.closest('section,div') &&
               /tables/i.test(b.closest('section,div').textContent || ''));

  // --- Trouver le panneau "Tables" de façon sûre
  function findTablesPanel() {
    // 1) bloc contenant un titre "Tables"
    const candidates = Array.from(document.querySelectorAll('section,div'));
    let panel = candidates.find(n => /(^|\s)tables(\s|$)/i.test(n.getAttribute('data-panel') || ''));
    if (!panel) panel = candidates.find(n => /tables/i.test(n.querySelector('h1,h2,h3,h4,h5,h6')?.textContent || ''));
    if (!panel) panel = candidates.find(n => /tables/i.test(n.textContent || ''));
    return panel || document.body;
  }

  // Corps d’injection : on cherche un body interne, sinon on le crée
  function getTablesBody() {
    const panel = findTablesPanel();
    if (!panel) return null;

    // Cherche un conteneur dédié
    let body =
      panel.querySelector('[data-role="tables-body"]') ||
      panel.querySelector('#tables-body') ||
      panel.querySelector('.tables-body');

    if (!body) {
      // Crée un body juste sous le premier titre si possible
      body = document.createElement('div');
      body.setAttribute('data-role', 'tables-body');
      body.style.minHeight = '80px';
      body.style.padding = '8px 0';

      const heading = panel.querySelector('h1,h2,h3,h4,h5,h6');
      if (heading && heading.parentNode === panel) {
        panel.insertBefore(body, heading.nextSibling);
      } else {
        panel.appendChild(body);
      }
    }
    return body;
  }

  // --- Helpers
  const getApi = () => (apiInput?.value || '').trim();
  const setStatusOk = (ok) => {
    const pill = document.querySelector('[data-pill="ok"]');
    if (pill) {
      pill.textContent = ok ? 'OK' : 'KO';
      pill.style.background = ok ? '#2ecc71' : '#e74c3c';
    }
  };
  const saveApi = () => {
    const url = getApi();
    if (!url) return;
    try { localStorage.setItem(LS_KEY_API, url); } catch {}
  };
  const restoreApi = () => {
    try {
      const saved = localStorage.getItem(LS_KEY_API);
      if (saved && apiInput) apiInput.value = saved;
    } catch {}
  };

  // Fallback tables
  const fallbackTables = () => ([
    { id: 'T1', pending: 0, lastTicket: null },
    { id: 'T2', pending: 0, lastTicket: null },
    { id: 'T3', pending: 0, lastTicket: null },
    { id: 'T4', pending: 0, lastTicket: null },
    { id: 'T5', pending: 0, lastTicket: null },
  ]);

  // Rendu (sans toucher à ton CSS – markup simple)
  const renderTables = (tables) => {
    const body = getTablesBody();
    if (!body) return;

    body.innerHTML = '';

    if (!tables || !tables.length) {
      body.innerHTML = `<div class="card empty">Aucune table</div>`;
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
      body.appendChild(card);
    }
  };

  // Charge /tables (tolérant)
  const loadTables = async () => {
    const base = getApi();

    // Toujours afficher quelque chose (=fallback) si API vide
    if (!base) {
      renderTables(fallbackTables());
      return;
    }

    try {
      const res = await fetch(`${base.replace(/\/+$/,'')}/tables?ts=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Formats acceptés:
      // - [{id:"T1", pending:0, lastTicket:null}, ...]
      // - ["T1","T2",...]
      let tables = Array.isArray(data) ? data : [];
      if (tables.length && typeof tables[0] === 'string') {
        tables = tables.map(id => ({ id, pending: 0, lastTicket: null }));
      }

      renderTables(tables.length ? tables : fallbackTables());
    } catch (e) {
      console.warn('Tables: fallback (cause:', e?.message || e, ')');
      renderTables(fallbackTables());
    }
  };

  // Test /health (facultatif visuel)
  const testHealth = async () => {
    const base = getApi();
    if (!base) return setStatusOk(false);
    try {
      const r = await fetch(`${base.replace(/\/+$/,'')}/health?ts=${Date.now()}`, { cache: 'no-store' });
      setStatusOk(r.ok);
      try { console.log('health =>', await r.json()); } catch {}
    } catch (e) {
      setStatusOk(false);
    }
  };

  // --- Init
  restoreApi();
  loadTables(); // 1er rendu

  // Boutons
  btnMemoriser?.addEventListener('click', saveApi);
  btnHealth?.addEventListener('click', testHealth);
  btnRefreshTables?.addEventListener('click', loadTables);

  // Pour le bridge: permet de relancer un refresh depuis bridge-orders-staff.js
  window.__RQR_reloadTables = loadTables;
})();
