// app.js — version avec fermeture de table après paiement

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

  // 1) statuts forcés partagés (panneau + cartes)
  const localTableStatus =
    (window.localTableStatus = window.localTableStatus || {});

  // 2) mémoire globale pour empêcher de redescendre
  if (!window.lastKnownStatus) {
    window.lastKnownStatus = {};
  }

  // 3) tables clôturées (après paiement) → on ignore /summary
  const closedTables = (window.closedTables = window.closedTables || {});

  function setPreparationFor20min(tableId) {
    const TWENTY_MIN = 20 * 60 * 1000;
    localTableStatus[tableId] = {
      phase: 'PREPARATION',
      until: Date.now() + TWENTY_MIN,
    };
  }

  function getLocalStatus(tableId) {
    const st = localTableStatus[tableId];
    if (!st) return null;
    const now = Date.now();

    if (st.phase === 'PREPARATION') {
      if (now < st.until) {
        return 'En préparation';
      } else {
        // 20 min passées → doit payé
        localTableStatus[tableId] = { phase: 'PAY', until: null };
        return 'Doit payé';
      }
    }

    if (st.phase === 'PAY') return 'Doit payé';

    return null;
  }

  function getApiBase() {
    return apiInput ? apiInput.value.trim().replace(/\/+$/, '') : '';
  }

  function formatTime(dateString) {
    if (!dateString) return '--:--';
    const d = new Date(dateString);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  function renderTables(tables) {
    if (!tablesContainer) return;
    tablesContainer.innerHTML = '';

    if (!tables || !tables.length) {
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }

    if (tablesEmpty) tablesEmpty.style.display = 'none';
    const filter = filterSelect ? filterSelect.value : 'Toutes';

    const PRIORITY = ['Vide', 'Commandée', 'En préparation', 'Doit payé', 'Payée'];

    tables.forEach((table) => {
      const id = table.id;
      if (filter !== 'Toutes' && filter !== id) return;

      const last = table.lastTicketAt ? formatTime(table.lastTicketAt) : '--:--';

      // statut que dit l'API
      let backendStatus = table.status || 'Vide';
      // statut affiché précédemment
      const prev = window.lastKnownStatus[id] || null;
      // statut forcé (impression / timer)
      const forced = getLocalStatus(id);

      let finalStatus;

      if (forced) {
        finalStatus = forced;
      } else if (prev && prev !== 'Vide') {
        // on ne redescend pas
        const prevIdx = PRIORITY.indexOf(prev);
        const backIdx = PRIORITY.indexOf(backendStatus);
        finalStatus = prevIdx > backIdx ? prev : backendStatus;
      } else {
        finalStatus = backendStatus;
      }

      // on mémorise
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

      // clic carte → panneau
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openTableDetail(id);
      });

      // bouton "Imprimer maintenant"
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
            } catch (err) {}
          }
          setPreparationFor20min(id);
          window.lastKnownStatus[id] = 'En préparation';
          // si elle était marquée clôturée par erreur → on enlève
          delete closedTables[id];
          refreshTables();
        });
      }

      // bouton "Paiement confirmé"
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
            } catch (err) {}
          }

          // tout de suite : Payée
          window.lastKnownStatus[id] = 'Payée';
          delete localTableStatus[id];
          refreshTables();

          // 30s plus tard : on clôture vraiment
          setTimeout(() => {
            window.lastKnownStatus[id] = 'Vide';
            delete localTableStatus[id];
            closedTables[id] = true; // ⬅️ très important : on marque la table comme clôturée
            refreshTables();
          }, 30 * 1000);
        });
      }

      tablesContainer.appendChild(card);
    });
  }

  // résumé du jour (déjà corrigé)
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

  // 🔁 merge /tables + /summary avec prise en compte des tables clôturées
  async function refreshTables() {
    const base = getApiBase();
    if (!base) {
      if (tablesContainer) tablesContainer.innerHTML = '';
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }
    try {
      // 1. on récupère les tables
      const res = await fetch(`${base}/tables`);
      const data = await res.json();
      const tables = data.tables || [];

      // 2. on récupère le résumé pour savoir qui a vraiment commandé
      let summaryMap = {};
      try {
        const resSum = await fetch(`${base}/summary`, { cache: 'no-store' });
        const dataSum = await resSum.json();
        const tickets = dataSum.tickets || [];
        summaryMap = tickets.reduce((acc, t) => {
          const tid = (t.table || '').trim().toUpperCase();
          if (tid) acc[tid] = true;
          return acc;
        }, {});
      } catch (e) {}

      // 2b. si une table était marquée clôturée mais qu'elle a disparu du summary,
      // on peut la "déclôturer" pour la prochaine commande
      Object.keys(closedTables).forEach((tid) => {
        if (!summaryMap[tid]) {
          delete closedTables[tid];
        }
      });

      // 3. on enrichit les tables : Vide + présente dans summary → Commandée
      const enriched = tables.map((tb) => {
        const idNorm = (tb.id || '').trim().toUpperCase();
        if (!idNorm) return tb;

        // ⛔ si la table est clôturée, on force Vide et on n'utilise pas summary
        if (closedTables[idNorm]) {
          return { ...tb, id: idNorm, status: 'Vide' };
        }

        if ((!tb.status || tb.status === 'Vide') && summaryMap[idNorm]) {
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

  // topbar
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

  // init
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
