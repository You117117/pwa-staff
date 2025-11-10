// app.js — version DOMContentLoaded + statuts locaux + verrou anti-retour à "Vide"

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

  // 1) statuts forcés (quand tu imprimes → 20 min en préparation)
  const localTableStatus = {};

  // 2) mémoire globale des derniers statuts vus (pour ne pas redescendre)
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
        // 20min passées → passe en doit payer
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

    // ordre de priorité
    const PRIORITY = ['Vide', 'Commandée', 'En préparation', 'Doit payer'];

    tables.forEach((table) => {
      const id = table.id;
      if (filter !== 'Toutes' && filter !== id) return;

      const last = table.lastTicketAt ? formatTime(table.lastTicketAt) : '--:--';

      // statut reçu du backend (ou Vide si rien)
      let backendStatus = table.status || 'Vide';

      // statut qu'on avait affiché la dernière fois
      const prev = window.lastKnownStatus[id] || null;

      // statut forcé (impression → 20 min, paiement)
      const forced = getLocalStatus(id);

      // -------- LOGIQUE ANTI-CLIGNOTEMENT --------
      // règle 1 : si on a un statut forcé → on l'affiche
      let finalStatus;
      if (forced) {
        finalStatus = forced;
      } else if (prev && prev !== 'Vide') {
        // règle 2 : si on avait déjà un statut "avancé" (pas Vide),
        // on NE REDESCEND PAS à Vide même si le backend le dit
        // ex: prev = "Commandée" et backend = "Vide" → on garde "Commandée"
        const prevIdx = PRIORITY.indexOf(prev);
        const backIdx = PRIORITY.indexOf(backendStatus);
        if (prevIdx > backIdx) {
          finalStatus = prev;
        } else {
          finalStatus = backendStatus;
        }
      } else {
        // première fois ou toujours Vide → on prend le backend
        finalStatus = backendStatus;
      }
      // -------------------------------------------

      // on mémorise ce qu'on vient d'afficher
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

      // clic sur la carte → détail
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
          // on force 20 min
          setPreparationFor20min(id);
          // et on rerend via un fetch frais
          refreshTables();
        });
      }

      // bouton paiement confirmé
      const btnPaid = card.querySelector('.btn-paid');
      if (btnPaid) {
        btnPaid.addEventListener('click', async (e) => {
          e.stopPropagation();
          alert(`Paiement confirmé pour ${id}`);
          // on force en "Doit payer" et on le fixe dans la mémoire globale
          localTableStatus[id] = { phase: 'PAY', until: null };
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
