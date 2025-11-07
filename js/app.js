// pwa-staff/js/app.js
// version avec persistance locale des statuts

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

// 🔴 c’est le petit stockage local des statuts de table
// on ne le vide pas quand on rafraîchit
// { "T1": "Commandée", "T5": "Doit payer" }
window.tableStatus = window.tableStatus || {};

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
// rendu des tables
// =========================
function renderTables(tables) {
  tablesContainer.innerHTML = '';

  if (!tables || !tables.length) {
    tablesEmpty.style.display = 'block';
    return;
  }
  tablesEmpty.style.display = 'none';

  const filter = filterSelect.value; // "Toutes" ou "T1", "T2"...

  tables.forEach((table) => {
    const id = table.id; // ex: "T1"
    if (filter !== 'Toutes' && filter !== id) {
      return;
    }

    // heure du dernier ticket
    const last = table.lastTicketAt ? formatTime(table.lastTicketAt) : '--:--';

    // ⚠️ récupérer le statut que NOUS avons conservé
    // sinon on affiche "Vide" par défaut
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

    // clic sur la carte → ouvrir le panneau latéral
    card.addEventListener('click', (e) => {
      // éviter que le clic sur le bouton imprime/paid ouvre aussi le panneau
      if (e.target.closest('button')) return;
      openTableDetail(id);
    });

    // bouton imprimer
    card.querySelector('.btn-print').addEventListener('click', (e) => {
      e.stopPropagation();
      // ici ton code d’impression (mock)
      alert(`Impression pour ${id}`);
    });

    // bouton paiement confirmé
    card.querySelector('.btn-paid').addEventListener('click', (e) => {
      e.stopPropagation();
      // quand on confirme le paiement → on peut mettre le statut ici
      window.tableStatus[id] = 'Payé';
      // on met à jour juste ce chip-là
      const chip = card.querySelector('.chip-status');
      if (chip) chip.textContent = window.tableStatus[id];
    });

    tablesContainer.appendChild(card);
  });
}

// =========================
// rendu du résumé du jour
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
    // data.tables = [{id:"T1", lastTicketAt: "..."}]

    // 👉 on rend en réutilisant les statuts déjà connus
    renderTables(data.tables || []);
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
async function openTableDetail(tableId) {
  // ce fichier est déjà inclus dans ton index.html
  // et c’est lui qui s’occupe d’aller chercher /table/TX/session
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
  refreshTables();
});
btnRefreshSummary.addEventListener('click', () => {
  refreshSummary();
});
filterSelect.addEventListener('change', () => {
  refreshTables();
});

// charger URL mémorisée
const saved = localStorage.getItem('staff-api');
if (saved) {
  API_INPUT.value = saved;
}

// premier chargement
refreshTables();
refreshSummary();

// rafraîchissement périodique
setInterval(() => {
  refreshTables();
  refreshSummary();
}, REFRESH_MS);
