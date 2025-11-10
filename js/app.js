// app.js — version DOMContentLoaded + statuts locaux

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
    return apiInput ? apiInput.value.trim() : '';
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
    if (!tablesContainer) return;
    tablesContainer.innerHTML = '';

    if (!tables || !tables.length) {
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }

    if (tablesEmpty) tablesEmpty.style.display = 'none';
    const filter = filterSelect ? filterSelect.value : 'Toutes';

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
        <d
