// app.js — Staff (synchronisé, logique statuts côté backend uniquement)

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
  const LS_KEY_API = 'staff-api';

  // --- Utils

  const normId = (id) => (id || '').toString().trim().toUpperCase();
  const now = () => Date.now();

  function getApiBase() {
    const raw = apiInput ? apiInput.value.trim() : '';
    if (!raw) return '';
    return raw.replace(/\/+$/, '');
  }

  function formatTime(dateString) {
    if (!dateString) return '--:--';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  function loadApiFromStorage() {
    try {
      const v = localStorage.getItem(LS_KEY_API);
      if (v && apiInput) apiInput.value = v;
    } catch {}
  }

  function saveApiToStorage() {
    if (!apiInput) return;
    const v = apiInput.value.trim();
    try {
      if (v) localStorage.setItem(LS_KEY_API, v);
    } catch {}
  }

  // --- Compteurs de paiement côté tableau de gauche
  // { [tableId]: { until, timeoutId, intervalId } }
  const leftPayTimers = (window.leftPayTimers = window.leftPayTimers || {});

  // --- Résumé du jour

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

  function renderTables(tables) {
    if (!tablesContainer) return;
    tablesContainer.innerHTML = '';

    if (!tables || tables.length === 0) {
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }
    if (tablesEmpty) tablesEmpty.style.display = 'none';

    const filterValue = filterSelect ? normId(filterSelect.value) : 'TOUTES';

    tables.forEach((tb) => {
      const id = normId(tb.id);
      if (!id) return;

      if (filterValue !== 'TOUTES' && filterValue !== id) return;

      const status = tb.status || 'Vide';
      const hasLastTicket = !!(tb.lastTicket && tb.lastTicket.at);

      const lastTime = hasLastTicket ? formatTime(tb.lastTicket.at) : '—';

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
      // Texte demandé : "Commandé à : (heure)"
      chipTime.textContent = hasLastTicket ? `Commandé à : ${lastTime}` : '—';
      head.appendChild(chipTime);

      card.appendChild(head);

      if (status !== 'Vide') {
        const actions = document.createElement('div');
        actions.className = 'card-actions';

        const btnPrint = document.createElement('button');
        btnPrint.className = 'btn btn-primary btn-print';
        btnPrint.textContent = 'Imprimer maintenant';

        const btnPaid = document.createElement('button');
        btnPaid.className = 'btn btn-primary btn-paid';

        const isPaid = status === 'Payée';
        const timer = leftPayTimers[id];

        // --- Apparence du bouton Paiement (avec éventuel compte à rebours) ---
        if (timer) {
          // Compte à rebours en cours
          btnPaid.style.backgroundColor = '#f97316';
          const updateLabel = () => {
            const remain = timer.until - now();
            if (remain <= 0) {
              btnPaid.textContent = 'Paiement confirmé';
              return;
            }
            const sec = Math.max(1, Math.ceil(remain / 1000));
            btnPaid.textContent = `Annuler paiement (${sec}s)`;
          };
          updateLabel();
          // Petit interval local juste pour ce bouton (si la carte reste affichée)
          const localInterval = setInterval(() => {
            if (!document.body.contains(btnPaid)) {
              clearInterval(localInterval);
              return;
            }
            const currentTimer = leftPayTimers[id];
            if (!currentTimer) {
              clearInterval(localInterval);
              btnPaid.textContent = isPaid ? 'Annuler paiement' : 'Paiement confirmé';
              btnPaid.style.backgroundColor = isPaid ? '#f97316' : '';
              return;
            }
            const remain = currentTimer.until - now();
            if (remain <= 0) {
              clearInterval(localInterval);
              btnPaid.textContent = 'Paiement confirmé';
              btnPaid.style.backgroundColor = '';
              return;
            }
            const sec = Math.max(1, Math.ceil(remain / 1000));
            btnPaid.textContent = `Annuler paiement (${sec}s)`;
          }, 250);
        } else if (isPaid) {
          // Payée sans compte à rebours actif
          btnPaid.textContent = 'Annuler paiement';
          btnPaid.style.backgroundColor = '#f97316';
        } else {
          // Pas encore payée, pas de timer
          btnPaid.textContent = 'Paiement confirmé';
          btnPaid.style.backgroundColor = '';
        }

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
            await refreshTables();
            if (window.__currentDetailTableId === id && window.showTableDetail) {
              window.showTableDetail(id);
            }
          }
        });

        // --- Gestion clic Paiement confirmé / Annuler paiement (avec compte à rebours) ---
        btnPaid.addEventListener('click', async (e) => {
          e.stopPropagation();
          const base = getApiBase();
          if (!base) return;

          const currentTimer = leftPayTimers[id];

          // 1) Si déjà payée OU si un compte à rebours est en cours → ANNULER PAIEMENT
          if (isPaid || currentTimer) {
            if (currentTimer) {
              clearTimeout(currentTimer.timeoutId);
              clearInterval(currentTimer.intervalId);
              delete leftPayTimers[id];
            }
            try {
              await fetch(`${base}/cancel-confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: id }),
              });
            } catch (err) {
              console.error('Erreur /cancel-confirm', err);
            } finally {
              await refreshTables();
              if (window.__currentDetailTableId === id && window.showTableDetail) {
                window.showTableDetail(id);
              }
            }
            return;
          }

          // 2) Sinon → PAIEMENT CONFIRMÉ + démarrage du compte à rebours 5s
          try {
            await fetch(`${base}/confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: id }),
            });
          } catch (err) {
            console.error('Erreur /confirm', err);
          }

          // On démarre le compte à rebours local de 5s
          const until = now() + 5000;
          const countdown = {
            until,
            timeoutId: null,
            intervalId: null,
          };
          leftPayTimers[id] = countdown;

          // Mise à jour immédiate du bouton
          btnPaid.style.backgroundColor = '#f97316';
          const updateLabel = () => {
            const remain = countdown.until - now();
            if (remain <= 0) {
              btnPaid.textContent = 'Paiement confirmé';
            } else {
              const sec = Math.max(1, Math.ceil(remain / 1000));
              btnPaid.textContent = `Annuler paiement (${sec}s)`;
            }
          };
          updateLabel();

          countdown.intervalId = setInterval(() => {
            if (!document.body.contains(btnPaid)) {
              clearInterval(countdown.intervalId);
              return;
            }
            const remain = countdown.until - now();
            if (remain <= 0) {
              clearInterval(countdown.intervalId);
              btnPaid.textContent = 'Paiement confirmé';
              btnPaid.style.backgroundColor = '';
            } else {
              const sec = Math.max(1, Math.ceil(remain / 1000));
              btnPaid.textContent = `Annuler paiement (${sec}s)`;
            }
          }, 250);

          // Au bout de 5s → clôture automatique de la table
          countdown.timeoutId = setTimeout(async () => {
            // Si entre-temps on a annulé ou remplacé le timer, on ne fait rien
            if (leftPayTimers[id] !== countdown) return;
            delete leftPayTimers[id];

            try {
              await fetch(`${base}/close-table`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: id }),
              });
            } catch (err) {
              console.error('Erreur /close-table', err);
            } finally {
              await refreshTables();
              if (window.__currentDetailTableId === id && window.showTableDetail) {
                window.showTableDetail(id);
              }
            }
          }, 5000);
        });
      }

      // Toggle panneau de droite en recliquant sur la même table
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;

        const currentId = window.__currentDetailTableId || null;
        if (currentId && normId(currentId) === id) {
          const panel = document.querySelector('#tableDetailPanel');
          if (panel) {
            panel.style.display = 'none';
            panel.innerHTML = '';
          }
          window.__currentDetailTableId = null;
          return;
        }

        if (window.showTableDetail) {
          window.showTableDetail(id, status);
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

  async function refreshTables() {
    const base = getApiBase();
    if (!base) {
      if (tablesContainer) tablesContainer.innerHTML = '';
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }
    try {
      const tablesData = await fetchTables();
      const tables = tablesData.tables || [];
      renderTables(tables);
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

  window.refreshTables = refreshTables;

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

  loadApiFromStorage();
  refreshTables();
  refreshSummary();
  setInterval(() => {
    refreshTables();
    refreshSummary();
  }, REFRESH_MS);
});
