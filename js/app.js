// js/app.js — version remise en forme pour ton interface

const apiInput = document.querySelector('#apiUrl');
const btnMemorize = document.querySelector('#btnMemorize');
const btnHealth = document.querySelector('#btnHealth');

const tablesEl = document.querySelector('#tables');
const tablesEmptyEl = document.querySelector('#tablesEmpty');
const btnRefreshTables = document.querySelector('#btnRefresh');
const filterSelect = document.querySelector('#filterTables');

const summaryEl = document.querySelector('#summary');
const summaryEmptyEl = document.querySelector('#summaryEmpty');
const btnRefreshSummary = document.querySelector('#btnRefreshSummary');

const REFRESH_MS = 5000;

// -------- utils --------
function getApiBase() {
  return apiInput.value.trim();
}
function hhmm(dateStr) {
  if (!dateStr) return '--:--';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// -------- tables --------
function renderTables(tables = []) {
  tablesEl.innerHTML = '';

  if (!tables.length) {
    tablesEmptyEl.style.display = 'block';
    return;
  }
  tablesEmptyEl.style.display = 'none';

  const filter = filterSelect.value; // "Toutes" ou "T1" ...

  tables.forEach((t) => {
    const id = t.id || t.table || 'T?';

    if (filter !== 'Toutes' && filter !== id) return;

    const last = t.lastTicketAt ? hhmm(t.lastTicketAt) : '--:--';
    // statut qu’on veut voir au milieu
    const status = t.status || 'Vide';

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

    // clic sur la carte -> panneau latéral
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openTableDetail(id);
    });

    // bouton imprimer
    card.querySelector('.btn-print').addEventListener('click', (e) => {
      e.stopPropagation();
      // ici tu mettras ton appel impression
      console.log('[STAFF] imprimer', id);
    });

    // bouton paiement
    card.querySelector('.btn-paid').addEventListener('click', (e) => {
      e.stopPropagation();
      // ici tu mettras ton appel paiement
      console.log('[STAFF] paiement confirmé', id);
    });

    tablesEl.appendChild(card);
  });
}

async function refreshTables() {
  const base = getApiBase();
  if (!base) return;
  try {
    const res = await fetch(`${base}/tables`);
    const data = await res.json();
    // l’API que tu utilises renvoie { tables: [...] }
    renderTables(data.tables || []);
  } catch (err) {
    console.error('[STAFF] tables error', err);
  }
}

// -------- résumé du jour --------
function renderSummary(tickets = []) {
  summaryEl.innerHTML = '';

  if (!tickets.length) {
    summaryEmptyEl.style.display = 'block';
    return;
  }
  summaryEmptyEl.style.display = 'none';

  tickets.forEach((t) => {
    const div = document.createElement('div');
    div.className = 'summaryItem';

    // heure + total
    const time = t.time || t.createdAt ? hhmm(t.time || t.createdAt) : '--:--';
    const total = typeof t.total === 'number' ? t.total.toFixed(2) : (t.total || '');

    // lignes d’articles
    let body = '';
    if (Array.isArray(t.items)) {
      body = t.items
        .map((it) => {
          // on essaye de deviner les champs
          const q = it.qty || it.qte || it.quantity || 1;
          const name = it.name || it.label || '';
          return `${q}× ${name}`;
        })
        .join(', ');
    } else if (t.label) {
      body = t.label;
    }

    div.innerHTML = `
      <div class="head">
        <span class="chip">${t.table || t.id || '?'}</span>
        <span class="chip"><i class="icon-clock"></i> ${time}</span>
        <span class="chip">Total : ${total} €</span>
      </div>
      <div class="body">${body}</div>
    `;
    summaryEl.appendChild(div);
  });
}

async function refreshSummary() {
  const base = getApiBase();
  if (!base) return;
  try {
    const res = await fetch(`${base}/summary`);
    const data = await res.json();
    renderSummary(data.tickets || []);
  } catch (err) {
    console.error('[STAFF] summary error', err);
  }
}

// -------- panneau latéral (détail) --------
function openTableDetail(tableId) {
  if (window.showTableDetail) {
    window.showTableDetail(tableId);
  }
}

// -------- boutons haut --------
btnMemorize.addEventListener('click', () => {
  localStorage.setItem('staff-api', apiInput.value.trim());
});
btnHealth.addEventListener('click', async () => {
  const base = getApiBase();
  if (!base) return;
  try {
    const res = await fetch(`${base}/health`);
    const data = await res.json();
    alert('OK: ' + JSON.stringify(data));
  } catch (e) {
    alert('Erreur API');
  }
});

btnRefreshTables.addEventListener('click', refreshTables);
btnRefreshSummary.addEventListener('click', refreshSummary);
filterSelect.addEventListener('change', refreshTables);

// -------- init --------
const saved = localStorage.getItem('staff-api');
if (saved) apiInput.value = saved;

refreshTables();
refreshSummary();

// rafraîchissement périodique
setInterval(() => {
  refreshTables();
  refreshSummary();
}, REFRESH_MS);
