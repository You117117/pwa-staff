// pwa-staff/js/app.js
// version stabilisée : 1er rendu complet, ensuite MAJ sans toucher au statut

const API_INPUT = document.querySelector('#apiUrl');
const btnMemorize = document.querySelector('#btnMemorize');
const btnHealth = document.querySelector('#btnHealth');
const tablesContainer = document.querySelector('#tables');
const tablesEmpty = document.querySelector('#tablesEmpty');
const btnRefreshTables = document.querySelector('#btnRefresh');
const filterSelect = document.querySelector('#filterTables');

const summaryContainer = document.querySelector('#summary');
const summaryEmpty = document.querySelector('#summaryEmpty');
const btnRefreshSummary = document.querySelector('#btnRefreshSummary');

// stockage local des statuts (ce qu’on affiche dans le badge du milieu)
window.tableStatus = window.tableStatus || {};

// on se souvient si on a déjà dessiné les cartes une fois
let tablesAlreadyRendered = false;

// intervalle de refresh (ms)
const REFRESH_MS = 5000;

// =========================
// utilitaires
// =========================
function getApiBase() {
  return API_INPUT.value.trim();
}

function formatTime(dateString) {
  if (!dateString) return '--:--';
  const d = new Date(dateString);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// =========================
// rendu COMPLET (1ère fois)
// =========================
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

    // on prend le statut qu’on a en mémoire, sinon “Vide”
    const statusLabel = window.tableStatus[id] || 'Vide';

    const card = document.createElement('div');
    card.className = 'tableCard';
    card.setAttribute('data-table', id);

    card.innerHTML = `
      <div class="card-head">
        <span class="chip chip-id">${id}</span>
        <span class="chip chip-status">${statusLabel}</span>
        <span class="chip chip-last">Dernier : ${last}</span>
      </div>
      <div class="card-actions">
        <button class="btn btn-primary btn-print">Imprimer maintenant</button>
        <button class="btn btn-primary btn-paid">Paiement confirmé</button>
      </div>
    `;

    // clic sur la carte = ouvrir le détail
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openTableDetail(id);
    });

    // bouton imprimer
    card.querySelector('.btn-print').addEventListener('click', (e) => {
      e.stopPropagation();
      alert(`Impression pour ${id}`);
    });

    // bouton paiement confirmé → on change le statut seulement ici
    card.querySelector('.btn-paid').addEventListener('click', (e) => {
      e.stopPropagation();
      window.tableStatus[id] = 'Payé';
      const chip = card.querySelector('.chip-status');
      if (chip) chip.textContent = window.tableStatus[id];
    });

    tablesContainer.appendChild(card);
  });
}

// =========================
// mise à jour LÉGÈRE (toutes les 5s)
// =========================
function updateTables(tables) {
  const filter = filterSelect.value;

  tables.forEach((table) => {
    const id = table.id;
    if (filter !== 'Toutes' && filter !== id) return;

    const card = tablesContainer.querySelector(`[data-table="${id}"]`);
    if (!card) return; // si nouvelle table on l’ignore pour rester simple

    // mettre à jour seulement l’heure du dernier ticket
    const last = table.lastTicketAt ? formatTime(table.lastTicketAt) : '--:--';
    const lastChip = card.querySelector('.chip-last');
    if (lastChip) {
      lastChip.textContent = `Dernier : ${last}`;
    }

    // 🔴 on NE TOUCHE PAS au badge de statut ici
    // il reste ce qu’il était (“Commandée”, “Doit payer”, “Payé”…)
  });
}

// =========================
// résumé du jour
// =========================
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

// =========================
// fetch tables
// =========================
async function refreshTables() {
  const base = getApiBase();
  if (!base) return;

  try {
    const res = await fetch(`${base}/tables`);
    const data = await res.json();
    const list = data.tables || [];

    if (!tablesAlreadyRendered) {
      renderTables(list);
      tablesAlreadyRendered = true;
    } else {
      updateTables(list);
    }
  } catch (err) {
    console.error('[STAFF] erreur tables', err);
  }
}

// =========================
// fetch summary
// =========================
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

// =========================
// panneau latéral
// =========================
function openTableDetail(tableId) {
  if (window.showTableDetail) {
    window.showTableDetail(tableId);
  }
}

// =========================
// init
// =========================
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

btnRefreshTables.addEventListener('click', () => {
  // forcer un vrai refresh visuel si tu appuies
  tablesAlreadyRendered = false;
  refreshTables();
});
btnRefreshSummary.addEventListener('click', () => {
  refreshSummary();
});
filterSelect.addEventListener('change', () => {
  // quand on filtre on veut un rendu complet
  tablesAlreadyRendered = false;
  refreshTables();
});

// recharger l’URL mémorisée
const saved = localStorage.getItem('staff-api');
if (saved) {
  API_INPUT.value = saved;
}

// premier chargement
refreshTables();
refreshSummary();

// rafraîchissement périodique (ne fait que updateTables)
setInterval(() => {
  refreshTables();
  refreshSummary();
}, REFRESH_MS);
