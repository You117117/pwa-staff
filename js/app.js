// app.js — buffer auto 120s + auto-print + synchro statuts + ignore anciens tickets

document.addEventListener('DOMContentLoaded', () => {
  // --- Sélecteurs
  const apiInput = document.querySelector('#apiUrl');
  const btnMemorize = document.querySelector('#btnMemorize');
  const btnHealth = document.querySelector('#btnHealth');
  const tablesContainer = document.querySelector('#tables');
  const tablesEmpty = document.querySelector('#tablesEmpty');
  const btnRefreshTables = document.querySelector('#btnRefresh');
  const filterSelect = document.querySelector('#filterTables');
  const summaryContainer = document.querySelector('#summary');
  const summaryEmpty = document.querySelector('#summaryEmpty');
  const btnRefreshSummary = document.querySelector('#btnRefreshSummary');

  // --- Constantes
  const REFRESH_MS = 5000;
  const PREP_MS = 20 * 60 * 1000;    // 20 min
  const BUFFER_MS = 120 * 1000;      // 120 s (agrégation)

  // --- Stores partagés runtime
  const localTableStatus = (window.localTableStatus = window.localTableStatus || {});
  // tableMemory[TID] = { isClosed: boolean, ignoreIds: Set<string> }
  const tableMemory = (window.tableMemory = window.tableMemory || {});
  // autoBuffer[TID] = { until:number, timeoutId:number }
  const autoBuffer = (window.autoBuffer = window.autoBuffer || {});
  if (!window.lastKnownStatus) window.lastKnownStatus = {};

  // --- Utils
  const normId = (id) => (id || '').trim().toUpperCase();
  const getApiBase = () => (apiInput ? apiInput.value.trim().replace(/\/+$/, '') : '');
  const formatTime = (dateString) => {
    if (!dateString) return '--:--';
    const d = new Date(dateString);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  // --- Timers statut
  function setPreparationFor20min(tableId) {
    const id = normId(tableId);
    localTableStatus[id] = { phase: 'PREPARATION', until: Date.now() + PREP_MS };
  }
  function getLocalStatus(tableId) {
    const id = normId(tableId);
    const st = localTableStatus[id];
    if (!st) return null;
    const now = Date.now();
    if (st.phase === 'PREPARATION') {
      if (now < st.until) return 'En préparation';
      localTableStatus[id] = { phase: 'PAY', until: null };
      return 'Doit payé';
    }
    if (st.phase === 'PAY') return 'Doit payé';
    return null;
  }

  // --- Buffer d’agrégation automatique 120s
  function startAutoBuffer(id) {
    id = normId(id);
    if (autoBuffer[id]) return; // déjà actif
    const until = Date.now() + BUFFER_MS;
    const timeoutId = setTimeout(async () => {
      // À l’expiration du buffer → auto-print + préparation 20min
      const base = getApiBase();
      if (base) {
        try {
          await fetch(`${base}/print`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: id }),
          });
        } catch {}
      }
      setPreparationFor20min(id);
      window.lastKnownStatus[id] = 'En préparation';
      delete autoBuffer[id];
      refreshTables();
    }, BUFFER_MS);
    autoBuffer[id] = { until, timeoutId };
  }
  function cancelAutoBuffer(id) {
    id = normId(id);
    if (autoBuffer[id]) {
      clearTimeout(autoBuffer[id].timeoutId);
      delete autoBuffer[id];
    }
  }

  // --- Aide /summary
  async function fetchTicketIdsForTable(base, tableIdNorm) {
    try {
      const res = await fetch(`${base}/summary`, { cache: 'no-store' });
      const data = await res.json();
      const tickets = (data.tickets || []).filter((t) => normId(t.table) === tableIdNorm);
      return tickets
        .map((t) => t.id)
        .filter((id) => id !== undefined && id !== null)
        .map(String);
    } catch {
      return [];
    }
  }

  // Clôture : passe Vide + isClosed=true et mémorise les IDs à ignorer (persiste en mémoire runtime)
  async function closeTableAndIgnoreCurrentTickets(tableId) {
    const base = getApiBase();
    const id = normId(tableId);
    window.lastKnownStatus[id] = 'Vide';
    delete localTableStatus[id];
    cancelAutoBuffer(id);

    const ids = base ? await fetchTicketIdsForTable(base, id) : [];
    if (!tableMemory[id]) tableMemory[id] = { isClosed: true, ignoreIds: new Set() };
    tableMemory[id].isClosed = true;
    ids.forEach((tid) => tableMemory[id].ignoreIds.add(String(tid)));
  }

  // --- UI : rendu des tables
  function renderTables(tables) {
    if (!tablesContainer) return;
    tablesContainer.innerHTML = '';

    if (!tables || !tables.length) {
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }
    if (tablesEmpty) tablesEmpty.style.display = 'none';

    const filter = filterSelect ? normId(filterSelect.value) : 'TOUTES';
    const PRIORITY = ['Vide', 'Commandée', 'En préparation', 'Doit payé', 'Payée'];

    tables.forEach((table) => {
      const id = normId(table.id);
      if (filter !== 'TOUTES' && filter !== id) return;

      const last = table.lastTicketAt ? formatTime(table.lastTicketAt) : '--:--';
      let backendStatus = table.status || 'Vide';
      const prev = window.lastKnownStatus[id] || null;
      const forced = getLocalStatus(id);

      let finalStatus;
      if (forced) {
        finalStatus = forced;
      } else if (prev && prev !== 'Vide') {
        const prevIdx = PRIORITY.indexOf(prev);
        const backIdx = PRIORITY.indexOf(backendStatus);
        finalStatus = prevIdx > backIdx ? prev : backendStatus;
      } else {
        finalStatus = backendStatus;
      }

      window.lastKnownStatus[id] = finalStatus;

      // Sécurité : si la table n’est pas “Commandée”, on annule le buffer auto
      if (finalStatus !== 'Commandée') cancelAutoBuffer(id);

      const card = document.createElement('div');
      card.className = 'table';
      card.setAttribute('data-table', id);
      card.innerHTML = `
        <div class="card-head">
          <span class="chip">${id}</span>
          <span class="chip">${finalStatus}</span>
          <span class="chip">Dernier : ${last}</span>
        </div>
        <div class="card-actions">
          <button class="btn btn-primary btn-print">Imprimer maintenant</button>
          <button class="btn btn-primary btn-paid">Paiement confirmé</button>
        </div>
      `;

      // Ouvrir panneau détail
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openTableDetail(id);
      });

      // Imprimer (manuel) → annule le buffer auto si actif
      const btnPrint = card.querySelector('.btn-print');
      if (btnPrint) {
        btnPrint.addEventListener('click', async (e) => {
          e.stopPropagation();
          const base = getApiBase();
          cancelAutoBuffer(id);
          if (base) {
            try {
              await fetch(`${base}/print`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: id }),
              });
            } catch {}
          }
          setPreparationFor20min(id);
          window.lastKnownStatus[id] = 'En préparation';
          // réouverture si besoin
          if (!tableMemory[id]) tableMemory[id] = { isClosed: false, ignoreIds: new Set() };
          tableMemory[id].isClosed = false;
          refreshTables();
        });
      }

      // Paiement confirmé → Payée → 30s → Vide + clôture + annule buffer
      const btnPaid = card.querySelector('.btn-paid');
      if (btnPaid) {
        btnPaid.addEventListener('click', async (e) => {
          e.stopPropagation();
          const base = getApiBase();
          cancelAutoBuffer(id);
          if (base) {
            try {
              await fetch(`${base}/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: id }),
              });
            } catch {}
          }
          window.lastKnownStatus[id] = 'Payée';
          delete localTableStatus[id];
          refreshTables();

          setTimeout(async () => {
            await closeTableAndIgnoreCurrentTickets(id);
            refreshTables();
          }, 30 * 1000);
        });
      }

      tablesContainer.appendChild(card);
    });
  }

  // --- Résumé du jour (inchangé, déjà “safe”)
  function renderSummary(tickets) {
    if (!summaryContainer) return;
    summaryContainer.innerHTML = '';

    if (!tickets || !tickets.length) {
      if (summaryEmpty) summaryEmpty.style.display = 'block';
      return;
    }
    if (summaryEmpty) summaryEmpty.style.display = 'none';

    tickets.forEach((t) => {
      let bodyText = '';
      if (t.label) {
        bodyText = t.label;
      } else if (Array.isArray(t.items)) {
        bodyText = t.items
          .map((it) => {
            const qty = it.qty || it.quantity || 1;
            const name = it.label || it.name || it.title || 'article';
            return `${qty}× ${name}`;
          })
          .join(', ');
      } else if (Array.isArray(t.lines)) {
        bodyText = t.lines
          .map((it) => {
            const qty = it.qty || it.quantity || 1;
            const name = it.label || it.name || it.title || 'article';
            return `${qty}× ${name}`;
          })
          .join(', ');
      }

      const item = document.createElement('div');
      item.className = 'summaryItem';
      item.innerHTML = `
        <div class="head">
          <span class="chip">${t.table}</span>
          <span class="chip"><i class="icon-clock"></i> ${t.time}</span>
          <span class="chip">Total : ${t.total} €</span>
        </div>
        <div class="body">${bodyText || ''}</div>
      `;
      summaryContainer.appendChild(item);
    });
  }

  // --- Refresh tables : merge /tables + /summary + auto-buffer sur “Commandée”
  async function refreshTables() {
    const base = getApiBase();
    if (!base) {
      if (tablesContainer) tablesContainer.innerHTML = '';
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }
    try {
      // 1) /tables
      const res = await fetch(`${base}/tables`);
      const data = await res.json();
      const tables = data.tables || [];

      // 2) /summary → map {tid: [ticketIds]}
      let summaryByTable = {};
      try {
        const resSum = await fetch(`${base}/summary`, { cache: 'no-store' });
        const dataSum = await resSum.json();
        const tickets = dataSum.tickets || [];
        tickets.forEach((t) => {
          const tid = normId(t.table);
          if (!tid) return;
          const idStr = t.id !== undefined && t.id !== null ? String(t.id) : null;
          if (!summaryByTable[tid]) summaryByTable[tid] = [];
          if (idStr) summaryByTable[tid].push(idStr);
        });
      } catch {}

      // 3) calcul “hasNew” (nouveau ticket non ignoré)
      const hasNewById = {};
      Object.keys(summaryByTable).forEach((tid) => {
        const mem = (tableMemory[tid] = tableMemory[tid] || {
          isClosed: false,
          ignoreIds: new Set(),
        });
        const list = summaryByTable[tid] || [];
        hasNewById[tid] = list.some((id) => !mem.ignoreIds.has(id));
        // Réouverture auto si table fermée mais nouveau ticket
        if (mem.isClosed && hasNewById[tid]) mem.isClosed = false;
      });

      // 4) enrichit tables (force Vide si fermée, Commandée si nouveau ticket)
      const enriched = tables.map((tb) => {
        const idNorm = normId(tb.id);
        if (!idNorm) return tb;
        const mem = (tableMemory[idNorm] = tableMemory[idNorm] || {
          isClosed: false,
          ignoreIds: new Set(),
        });

        if (mem.isClosed) {
          return { ...tb, id: idNorm, status: 'Vide' };
        }
        if ((!tb.status || tb.status === 'Vide') && hasNewById[idNorm]) {
          return { ...tb, id: idNorm, status: 'Commandée' };
        }
        return { ...tb, id: idNorm };
      });

      // 5) démarrage/annulation du buffer selon statut
      enriched.forEach((t) => {
        const id = normId(t.id);
        if (t.status === 'Commandée') {
          startAutoBuffer(id);
        } else {
          cancelAutoBuffer(id);
        }
      });

      renderTables(enriched);
    } catch (err) {
      console.error('[STAFF] erreur tables', err);
    }
  }

  async function refreshSummary() {
    const base = getApiBase();
    if (!base) {
      if (summaryContainer) summaryContainer.innerHTML = '';
      if (summaryEmpty) summaryEmpty.style.display = 'block';
      return;
    }
    try {
      const res = await fetch(`${base}/summary`);
      const data = await res.json();
      renderSummary(data.tickets || []);
    } catch (err) {
      console.error('[STAFF] erreur summary', err);
    }
  }

  function openTableDetail(tableId) {
    if (window.showTableDetail) window.showTableDetail(tableId);
  }

  // --- Topbar
  if (btnMemorize) {
    btnMemorize.addEventListener('click', () => {
      const url = getApiBase();
      if (url) localStorage.setItem('staff-api', url);
    });
  }
  if (btnHealth) {
    btnHealth.addEventListener('click', async () => {
      const base = getApiBase();
      if (!base) return;
      try {
        const res = await fetch(`${base}/health`);
        const data = await res.json();
        alert('API OK : ' + JSON.stringify(data));
      } catch {
        alert('Erreur API');
      }
    });
  }
  if (btnRefreshTables) btnRefreshTables.addEventListener('click', refreshTables);
  if (btnRefreshSummary) btnRefreshSummary.addEventListener('click', refreshSummary);
  if (filterSelect) filterSelect.addEventListener('change', refreshTables);

  // --- Init
  const saved = localStorage.getItem('staff-api');
  if (saved && apiInput) apiInput.value = saved;

  refreshTables();
  refreshSummary();
  setInterval(() => {
    refreshTables();
    refreshSummary();
  }, REFRESH_MS);
});
