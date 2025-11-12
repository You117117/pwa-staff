// app.js — clôture fiable + réouverture sur nouveau ticket (ignore des anciens)

document.addEventListener('DOMContentLoaded', () => {
  // Sélecteurs
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

  const REFRESH_MS = 5000;

  // Stores partagés
  const localTableStatus =
    (window.localTableStatus = window.localTableStatus || {});
  const closedTables =
    (window.closedTables = window.closedTables || {}); // { [TID]: { ignoreIds: Set<string> } }
  if (!window.lastKnownStatus) window.lastKnownStatus = {};

  // Utils
  const normId = (id) => (id || '').trim().toUpperCase();
  const formatTime = (dateString) => {
    if (!dateString) return '--:--';
    const d = new Date(dateString);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };
  const getApiBase = () =>
    apiInput ? apiInput.value.trim().replace(/\/+$/, '') : '';

  // Timers statut
  function setPreparationFor20min(tableId) {
    const id = normId(tableId);
    const TWENTY_MIN = 20 * 60 * 1000;
    localTableStatus[id] = { phase: 'PREPARATION', until: Date.now() + TWENTY_MIN };
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

  // Récupère tous les IDs de tickets d'une table dans /summary
  async function fetchTicketIdsForTable(base, tableIdNorm) {
    try {
      const res = await fetch(`${base}/summary`, { cache: 'no-store' });
      const data = await res.json();
      const tickets = (data.tickets || []).filter(
        (t) => normId(t.table) === tableIdNorm
      );
      return tickets
        .map((t) => t.id)
        .filter((id) => typeof id === 'string' || typeof id === 'number')
        .map(String);
    } catch {
      return [];
    }
  }

  // Marque une table comme clôturée et mémorise les tickets à ignorer
  async function closeTableAndIgnoreCurrentTickets(tableId) {
    const base = getApiBase();
    const id = normId(tableId);
    window.lastKnownStatus[id] = 'Vide';
    delete localTableStatus[id];

    // on lit une fois /summary pour mémoriser les tickets actuels
    const ids = base ? await fetchTicketIdsForTable(base, id) : [];
    closedTables[id] = {
      ignoreIds: new Set(ids), // anciens tickets à ignorer définitivement côté front
    };
  }

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

      // Ouvrir panneau
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openTableDetail(id);
      });

      // Imprimer
      const btnPrint = card.querySelector('.btn-print');
      if (btnPrint) {
        btnPrint.addEventListener('click', async (e) => {
          e.stopPropagation();
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
          // si elle était marquée clôturée par le passé, on la ré-ouvre explicitement
          delete closedTables[id];
          refreshTables();
        });
      }

      // Paiement confirmé
      const btnPaid = card.querySelector('.btn-paid');
      if (btnPaid) {
        btnPaid.addEventListener('click', async (e) => {
          e.stopPropagation();
          const base = getApiBase();
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

          // 30s plus tard → clôture + mémorise les tickets à ignorer
          setTimeout(async () => {
            await closeTableAndIgnoreCurrentTickets(id);
            refreshTables();
          }, 30 * 1000);
        });
      }

      tablesContainer.appendChild(card);
    });
  }

  // Résumé du jour (inchangé, déjà corrigé)
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

  // Merge /tables + /summary avec logique de clôture/ignores
  async function refreshTables() {
    const base = getApiBase();
    if (!base) {
      if (tablesContainer) tablesContainer.innerHTML = '';
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }
    try {
      // 1) tables
      const res = await fetch(`${base}/tables`);
      const data = await res.json();
      const tables = data.tables || [];

      // 2) summary → map par table + liste d'IDs par table
      let summaryByTable = {};
      try {
        const resSum = await fetch(`${base}/summary`, { cache: 'no-store' });
        const dataSum = await resSum.json();
        const tickets = dataSum.tickets || [];
        tickets.forEach((t) => {
          const tid = normId(t.table);
          if (!tid) return;
          const idStr = (t.id !== undefined && t.id !== null) ? String(t.id) : null;
          if (!summaryByTable[tid]) summaryByTable[tid] = { has: true, ids: [] };
          if (idStr) summaryByTable[tid].ids.push(idStr);
        });
      } catch {}

      // 2b) SI table clôturée ET nouveau ticket non ignoré → réouverture auto
      Object.keys(closedTables).forEach((tid) => {
        const entry = summaryByTable[tid];
        if (entry && entry.ids && entry.ids.length) {
          const ignore = closedTables[tid]?.ignoreIds || new Set();
          const hasNew = entry.ids.some((id) => !ignore.has(id));
          if (hasNew) {
            // on ré-ouvre : on supprime l'état clôturé
            delete closedTables[tid];
            // le merge la fera passer en "Commandée"
          }
        }
      });

      // 3) enrichit tables pour affichage
      const enriched = tables.map((tb) => {
        const idNorm = normId(tb.id);
        if (!idNorm) return tb;

        // table clôturée → toujours Vide (le panneau de droite ne montrera pas d'anciens tickets)
        if (closedTables[idNorm]) {
          return { ...tb, id: idNorm, status: 'Vide' };
        }

        // sinon : si Vide mais table vue dans summary → Commandée
        const inSum = !!summaryByTable[idNorm];
        if ((!tb.status || tb.status === 'Vide') && inSum) {
          return { ...tb, id: idNorm, status: 'Commandée' };
        }

        return { ...tb, id: idNorm };
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
    if (window.showTableDetail) {
      window.showTableDetail(tableId);
    }
  }

  // Topbar
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
      } catch (err) {
        alert('Erreur API');
      }
    });
  }

  if (btnRefreshTables) btnRefreshTables.addEventListener('click', refreshTables);
  if (btnRefreshSummary) btnRefreshSummary.addEventListener('click', refreshSummary);
  if (filterSelect) filterSelect.addEventListener('change', refreshTables);

  // Init
  const saved = localStorage.getItem('staff-api');
  if (saved && apiInput) {
    apiInput.value = saved;
  }

  refreshTables();
  refreshSummary();

  setInterval(() => {
    refreshTables();
    refreshSummary();
  }, REFRESH_MS);
});
