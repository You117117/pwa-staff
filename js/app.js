// === app.js — version avec statut local (prépa 20 min) ===

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

// Intervalle de rafraîchissement (ms)
const REFRESH_MS = 5000;

// --- store des statuts forcés côté front ---
// structure : { "T7": { phase: "PREPARATION", until: 1731240000000 } }
const localTableStatus = {};

// utilitaire pour poser 20 minutes de préparation
function setPreparationFor20min(tableId) {
  const TWENTY_MIN = 20 * 60 * 1000;
  localTableStatus[tableId] = {
    phase: 'PREPARATION',
    until: Date.now() + TWENTY_MIN,
  };
}

// récupère le statut à afficher si on en a un local
function getLocalStatus(tableId) {
  const st = localTableStatus[tableId];
  if (!st) return null;

  const now = Date.now();

  // cas "en préparation"
  if (st.phase === 'PREPARATION') {
    if (now < st.until) {
      return 'En préparation';
    } else {
      // les 20 min sont passées → on passe en "doit payer"
      localTableStatus[tableId] = { phase: 'PAY', until: null };
      return 'Doit payer';
    }
  }

  // cas "doit payer" déjà posé
  if (st.phase === 'PAY') {
    return 'Doit payer';
  }

  return null;
}

// Utilitaires
function getApiBase() {
  return apiInput.value.trim();
}

function formatTime(dateString) {
  if (!dateString) return '--:--';
  const d = new Date(dateString);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Rendu des tables
function renderTables(tables) {
  tablesContainer.innerHTML = '';

  if (!tables || !tables.length) {
    tablesEmpty.style.display = 'block';
    return;
  }

  tablesEmpty.style.display = 'none';
  const filter = filterSelect.value;

  tables.forEach((table) => {
    const id = table.id;
    if (filter !== 'Toutes' && filter !== id) return;

    const last = table.lastTicketAt ? formatTime(table.lastTicketAt) : '--:--';

    // ✅ priorité au statut local (imprimer → en préparation 20 min → doit payer)
    const forced = getLocalStatus(id);
    const status = forced ? forced : (table.status || 'Vide');

    const card = document.createElement('div');
    card.className = 'table';
    card.setAttribute('data-table', id);

    card.innerHTML = `
      <div class="card-head">
        <span class="chip">${id}</span>
        <span class="chip">${status}</span>
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
    card.querySelector('.btn-print').addEventListener('click', async (e) => {
      e.stopPropagation();
      // ici tu fais ton appel backend si tu veux vraiment imprimer
      // const base = getApiBase();
      // if (base) await fetch(`${base}/print`, { method: 'POST', body: JSON.stringify({ table: id }) })

      alert(`Impression pour ${id}`);

      // ✅ on force le statut en local pendant 20 min
      setPreparationFor20min(id);
      // on relance un rendu pour afficher tout de suite
      refreshTables();
    });

    // bouton paiement confirmé
    card.querySelector('.btn-paid').addEventListener('click', async (e) => {
      e.stopPropagation();
      alert(`Paiement confirmé pour ${id}`);

      // si tu veux, on peut aussi fixer localement :
      localTableStatus[id] = { phase: 'PAY', until: null };
      refreshTables();
    });

    tablesContainer.appendChild(card);
  });
}

// Rendu du résumé
function renderSummary(tickets) {
  summaryContainer.innerHTML = '';

  if (!tickets || !tickets.length) {
    summaryEmpty.style.display = 'block';
    return;
  }

  summaryEmpty.style.display = 'none';

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

// Rafraîchissement
async function refreshTables() {
  const base = getApiBase();
  if (!base) return;
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
  if (!base) return;
  try {
    const res = await fetch(`${base}/summary`);
    const data = await res.json();
    renderSummary(data.tickets || []);
  } catch (err) {
    console.error('[STAFF] erreur summary', err);
  }
}

// Détail table
function openTableDetail(tableId) {
  if (window.showTableDetail) {
    window.showTableDetail(tableId);
  }
}

// Boutons
btnMemorize.addEventListener('click', () => {
  const url = getApiBase();
  localStorage.setItem('staff-api', url);
});

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

btnRefreshTables.addEventListener('click', refreshTables);
btnRefreshSummary.addEventListener('click', refreshSummary);
filterSelect.addEventListener('change', refreshTables);

// Initialisation
const saved = localStorage.getItem('staff-api');
if (saved) {
  apiInput.value = saved;
}

refreshTables();
refreshSummary();

setInterval(() => {
  // 👇 à chaque refresh on redessine, mais le statut local garde la priorité
  refreshTables();
  refreshSummary();
}, REFRESH_MS);
