// app.js — Staff (synchronisé, sans mémoire locale de statuts)
// Affiche les tables et tickets en se basant UNIQUEMENT sur /tables et /summary.
// PC et smartphone lisent exactement la même chose.

document.addEventListener('DOMContentLoaded', () => {
  // Sélecteurs
  const apiInput = document.querySelector('#apiUrl');
  const btnSaveApi = document.querySelector('#btnSaveApi');
  const btnRefreshTables = document.querySelector('#btnRefreshTables');
  const btnRefreshSummary = document.querySelector('#btnRefreshSummary');

  const tablesContainer = document.querySelector('#tables');
  const tablesEmpty = document.querySelector('#tablesEmpty');
  const filterSelect = document.querySelector('#filterTables');

  const summaryContainer = document.querySelector('#summary');
  const summaryEmpty = document.querySelector('#summaryEmpty');

  const REFRESH_MS = 5000;

  // --- Utils

  const normId = (id) => (id || '').toString().trim().toUpperCase();

  function getApiBase() {
    const raw = apiInput ? apiInput.value.trim() : '';
    if (!raw) return '';
    return raw.replace(/\/+$/, '');
  }

  function formatTime(dateString) {
    if (!dateString) return '--:--';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString; // au cas où le backend envoie déjà "12:34"
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  // --- LocalStorage pour l'URL API uniquement (pas pour les statuts)

  const LS_KEY_API = 'staff-api';

  function loadApiFromStorage() {
    try {
      const v = localStorage.getItem(LS_KEY_API);
      if (v && apiInput) apiInput.value = v;
    } catch {
      // ignore
    }
  }

  function saveApiToStorage() {
    if (!apiInput) return;
    const v = apiInput.value.trim();
    try {
      if (v) localStorage.setItem(LS_KEY_API, v);
    } catch {
      // ignore
    }
  }

  // --- Rendu du résumé du jour

  function renderSummary(tickets) {
    if (!summaryContainer) return;
    summaryContainer.innerHTML = '';

    if (!tickets || tickets.length === 0) {
      if (summaryEmpty) summaryEmpty.style.display = 'block';
      return;
    }
    if (summaryEmpty) summaryEmpty.style.display = 'none';

    tickets.forEach((t) => {
      const head = document.createElement('div');
      head.className = 'head';

      const chipTable = document.createElement('span');
      chipTable.className = 'chip';
      chipTable.textContent = t.table;
      head.appendChild(chipTable);

      if (t.time) {
        const chipTime = document.createElement('span');
        chipTime.className = 'chip';
        chipTime.innerHTML = `<i class="icon-clock"></i> ${t.time}`;
        head.appendChild(chipTime);
      }

      if (typeof t.total === 'number') {
        const chipTotal = document.createElement('span');
        chipTotal.className = 'chip';
        chipTotal.textContent = `Total : ${t.total} €`;
        head.appendChild(chipTotal);
      }

      const body = document.createElement('div');
      body.className = 'body';

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

      body.textContent = bodyText || '';

      const wrapper = document.createElement('div');
      wrapper.className = 'summaryItem';
      wrapper.appendChild(head);
      wrapper.appendChild(body);

      summaryContainer.appendChild(wrapper);
    });
  }

  // --- Rendu des tables

  function renderTables(tables, tickets) {
    if (!tablesContainer) return;
    tablesContainer.innerHTML = '';

    if (!tables || tables.length === 0) {
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }
    if (tablesEmpty) tablesEmpty.style.display = 'none';

    // Regroupement des tickets par table pour la journée
    const ticketsByTable = {};
    (tickets || []).forEach((t) => {
      const tid = normId(t.table);
      if (!tid) return;
      if (!ticketsByTable[tid]) ticketsByTable[tid] = [];
      ticketsByTable[tid].push(t);
    });

    // Tri des tickets par ID ou par temps (du plus ancien au plus récent)
    Object.values(ticketsByTable).forEach((list) => {
      list.sort((a, b) => {
        const aId = Number(a.id);
        const bId = Number(b.id);
        if (!Number.isNaN(aId) && !Number.isNaN(bId)) return aId - bId;
        if (a.time && b.time) return a.time.localeCompare(b.time);
        return 0;
      });
    });

    const filterValue = filterSelect ? normId(filterSelect.value) : 'TOUTES';

    // On trie les tables par dernière activité (d'après le dernier ticket connu)
    const tablesWithActivity = tables.map((tb) => {
      const id = normId(tb.id);
      const list = ticketsByTable[id] || [];
      let lastTs = 0;
      if (list.length > 0) {
        const last = list[list.length - 1];
        if (last.createdAt) {
          const d = new Date(last.createdAt);
          lastTs = d.getTime();
        } else if (last.time) {
          // si "time" est un string "HH:MM", on ne peut pas recomposer la date précisément -> on laisse 0
        }
      }
      return { raw: tb, id, lastTs, tickets: list };
    });

    tablesWithActivity.sort((a, b) => b.lastTs - a.lastTs);

    tablesWithActivity.forEach((entry) => {
      const tb = entry.raw;
      const id = entry.id;
      if (!id) return;

      if (filterValue !== 'TOUTES' && filterValue !== id) return;

      const list = entry.tickets;
      const hasTickets = list && list.length > 0;

      let status = tb.status || 'Vide';
      if ((!tb.status || tb.status === 'Vide') && hasTickets) {
        status = 'Commandée';
      }

      const lastTicket = hasTickets ? list[list.length - 1] : null;
      const lastTime =
        (tb.lastTicketAt && formatTime(tb.lastTicketAt)) ||
        (lastTicket && lastTicket.createdAt && formatTime(lastTicket.createdAt)) ||
        (lastTicket && lastTicket.time) ||
        '--:--';

      const card = document.createElement('div');
      card.className = 'table';
      card.setAttribute('data-table', id);

      const head = document.createElement('div');
      head.className = 'card-head';

      const chipId = document.createElement('span');
      chipId.className = 'chip';
      chipId.textContent = id;
      head.appendChild(chipId);

      const chipStatus = document.createElement('span');
      chipStatus.className = 'chip';
      chipStatus.textContent = status;
      head.appendChild(chipStatus);

      const chipTime = document.createElement('span');
      chipTime.className = 'chip';
      chipTime.textContent = hasTickets ? `Dernier ticket : ${lastTime}` : '—';
      head.appendChild(chipTime);

      card.appendChild(head);

      // Actions uniquement si la table n'est pas "Vide"
      if (status !== 'Vide') {
        const actions = document.createElement('div');
        actions.className = 'card-actions';

        const btnPrint = document.createElement('button');
        btnPrint.className = 'btn btn-primary btn-print';
        btnPrint.textContent = 'Imprimer maintenant';

        const btnPaid = document.createElement('button');
        btnPaid.className = 'btn btn-primary btn-paid';
        btnPaid.textContent = 'Paiement confirmé';

        actions.appendChild(btnPrint);
        actions.appendChild(btnPaid);
        card.appendChild(actions);

        btnPrint.addEventListener('click', async (e) => {
          e.stopPropagation();
          const base = getApiBase();
          if (!base) return;
          try {
            await fetch(`${base}/print`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: id }),
            });
          } catch (err) {
            console.error('Erreur /print', err);
          } finally {
            // On se contente de refléter le backend
            await refreshTables();
          }
        });

        btnPaid.addEventListener('click', async (e) => {
          e.stopPropagation();
          const base = getApiBase();
          if (!base) return;
          try {
            await fetch(`${base}/confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: id }),
            });
          } catch (err) {
            console.error('Erreur /confirm', err);
          } finally {
            await refreshTables();
          }
        });
      }

      // Clique sur la carte → détail
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (window.showTableDetail) {
          window.showTableDetail(id);
        }
      });

      tablesContainer.appendChild(card);
    });
  }

  // --- Appels API

  async function fetchSummary() {
    const base = getApiBase();
    if (!base) return { tickets: [] };
    const res = await fetch(`${base}/summary`, { cache: 'no-store' });
    const data = await res.json();
    return data || { tickets: [] };
  }

  async function fetchTables() {
    const base = getApiBase();
    if (!base) return { tables: [] };
    const res = await fetch(`${base}/tables`, { cache: 'no-store' });
    const data = await res.json();
    return data || { tables: [] };
  }

  // --- Refresh globaux

  async function refreshTables() {
    const base = getApiBase();
    if (!base) {
      if (tablesContainer) tablesContainer.innerHTML = '';
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }
    try {
      const [tablesData, summaryData] = await Promise.all([fetchTables(), fetchSummary()]);
      const tables = tablesData.tables || [];
      const tickets = summaryData.tickets || [];
      renderTables(tables, tickets);
    } catch (err) {
      console.error('Erreur refreshTables', err);
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
      const summaryData = await fetchSummary();
      renderSummary(summaryData.tickets || []);
    } catch (err) {
      console.error('Erreur refreshSummary', err);
    }
  }

  // Rendre refreshTables accessible côté global (pour table-detail.js)
  window.refreshTables = refreshTables;

  // --- Écouteurs UI

  if (btnSaveApi) {
    btnSaveApi.addEventListener('click', () => {
      saveApiToStorage();
      refreshTables();
      refreshSummary();
    });
  }

  if (btnRefreshTables) {
    btnRefreshTables.addEventListener('click', () => {
      refreshTables();
    });
  }

  if (btnRefreshSummary) {
    btnRefreshSummary.addEventListener('click', () => {
      refreshSummary();
    });
  }

  if (filterSelect) {
    filterSelect.addEventListener('change', () => {
      refreshTables();
    });
  }

  // --- Init

  loadApiFromStorage();
  refreshTables();
  refreshSummary();
  setInterval(() => {
    refreshTables();
    refreshSummary();
  }, REFRESH_MS);
});
