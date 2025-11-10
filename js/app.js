// app.js — version DOMContentLoaded + statuts locaux (v3 anti-clignotement)

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

  // --- store des statuts forcés côté front (imprimer → 20min) ---
  const localTableStatus = {};

  // --- store pour empêcher de revenir en arrière (Vide -> Commandée -> Vide) ---
  // on le met sur window pour qu'il survive aux refresh dans la même page
  if (!window.lastKnownStatus) {
    window.lastKnownStatus = {};
  }

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
        // 20min passées → on passe en "doit payer"
        localTableStatus[tableId] = { phase: 'PAY', until: null };
        return 'Doit payer';
      }
    }

    if (st.phase === 'PAY') return 'Doit payer';
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

    // ordre de priorité des statuts
    const PRIORITY = ['Vide', 'Commandée', 'En préparation', 'Doit payer'];

    tables.forEach((table) => {
      const id = table.id;
      if (filter !== 'Toutes' && filter !== id) return;

      const last = table.lastTicketAt ? formatTime(table.lastTicketAt) : '--:--';

      // 1) statut calculé par le backend
      let backendStatus = table.status || 'Vide';

      // 2) on regarde ce qu'on avait affiché la dernière fois
      const lastStatus = window.lastKnownStatus[id] || null;

      // 3) on bloque les régressions : si le backend revient à "Vide" mais nous on avait mieux → on garde mieux
      if (lastStatus) {
        const backendIndex = PRIORITY.indexOf(backendStatus);
        const lastIndex = PRIORITY.indexOf(lastStatus);
        if (lastIndex > backendIndex) {
          backendStatus = lastStatus;
        }
      }

      // 4) on regarde si on a un statut forcé (impression → 20min)
      const forced = getLocalStatus(id);
      const finalStatus = forced ? forced : backendStatus;

      // 5) on met à jour l'historique
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

      // clic carte → détail
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openTableDetail(id);
      });

      // bouton imprimer
      const btnPrint = card.querySelector('.btn-print');
      if (btnPrint) {
        btnPrint.addEventListener('click', async (e) => {
          e.stopPropagation();
          alert(`Impression pour ${id}`);
          // on force 20 min de "En préparation"
          setPreparationFor20min(id);
          // et on rerend
          refreshTables();
        });
      }

      // bouton paiement confirmé
      const btnPaid = card.querySelector('.btn-paid');
      if (btnPaid) {
        btnPaid.addEventListener('click', async (e) => {
          e.stopPropagation();
          alert(`Paiement confirmé pour ${id}`);
          // on force en "Doit payer"
          localTableStatus[id] = { phase: 'PAY', until: null };
          // on l'enregistre aussi dans la mémoire anti-régression
          window.lastKnownStatus[id] = 'Doit payer';
          refreshTables();
        });
      }

      tablesContainer.appendChild(card);
    });
  }

  function renderSummary(tickets) {
    if (!summaryContainer) return;
    summaryContainer.innerHTML = '';

    if (!tickets || !tickets.length) {
      if (summaryEmpty) summaryEmpty.style.display = 'block';
      return;
    }

    if (summaryEmpty) summaryEmpty.style.display = 'none';

    tickets.forEach((t) => {
      const item = document.createElement('div');
      item.className = 'summaryItem';
      item.innerHTML = `
        <div class="head">
          <span class="chip">${t.table}</span>
          <span class="chip"><i class="icon-clock"></i> ${t.time}</span>
          <span class="chip">Total : ${t.total} €</span>
        </div>
        <div class="body">${t.label}</div>
      `;
      summaryContainer.appendChild(item);
    });
  }

  async function refreshTables() {
    const base = getApiBase();
    if (!base) {
      // pas d'API → on affiche rien
      if (tablesContainer) tablesContainer.innerHTML = '';
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }
    try {
      const res = await fetch(`${base}/tables`);
      const data = await res.json();
      renderTables(data.tables || []);
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

  // Boutons topbar
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
