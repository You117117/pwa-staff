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

  function statusToCssClass(statusKey){
    switch(statusKey){
      case 'VIDE': return 'status-vide';
      case 'EN_COURS': return 'status-en_cours';
      case 'COMMANDEE':
      case 'COMMANDÉE': return 'status-commandee';
      case 'NOUVELLE_COMMANDE': return 'status-nouvelle_commande';
      case 'DOIT_PAYER': return 'status-doit_payer';
      case 'PAYEE':
      case 'PAYÉE': return 'status-payee';
      default: return '';
    }
  }


  const normId = (id) => (id || '').toString().trim().toUpperCase();
  const now = () => Date.now();

  // --- Détection de nouvelles commandes pour bip sonore (tableau de gauche uniquement)

  let prevTablesSnapshot = window.__prevTablesSnapshot || {};
  window.__prevTablesSnapshot = prevTablesSnapshot;

  
  let staffAudioCtx = null;

  function ensureStaffAudioCtxUnlocked() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!staffAudioCtx) {
        staffAudioCtx = new AudioContext();
      }
      if (staffAudioCtx.state === 'suspended') {
        staffAudioCtx.resume();
      }
    } catch (e) {
      console.warn('[staff-beep] Impossible d\'initialiser l\'AudioContext', e);
    }
  }

  document.addEventListener('click', ensureStaffAudioCtxUnlocked, { once: true });
  document.addEventListener('touchstart', ensureStaffAudioCtxUnlocked, { once: true });

  function playStatusMelody(kind) {
    try {
      if (!staffAudioCtx) {
        ensureStaffAudioCtxUnlocked();
      }
      if (!staffAudioCtx) return;

      const ctx = staffAudioCtx;
      const t0 = ctx.currentTime;

      // Mélodies 3–4 notes (marquantes mais courtes)
      const melodies = {
        // COMMANDÉE : montée (C5–E5–G5)
        COMMANDEE: [
          { freq: 523.25, start: 0.00, dur: 0.11 },
          { freq: 659.25, start: 0.12, dur: 0.11 },
          { freq: 783.99, start: 0.24, dur: 0.13 },
        ],
        // NOUVELLE_COMMANDE : appel plus "urgent" (G5–E5–C5–B5)
        NOUVELLE: [
          { freq: 783.99, start: 0.00, dur: 0.10 },
          { freq: 659.25, start: 0.11, dur: 0.10 },
          { freq: 523.25, start: 0.22, dur: 0.10 },
          { freq: 987.77, start: 0.33, dur: 0.12 },
        ],
      };

      const notes = melodies[kind];
      if (!notes) return;

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, t0 + note.start);

        // Enveloppe douce (évite le son agressif)
        gain.gain.setValueAtTime(0.0001, t0 + note.start);
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + note.start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.start + note.dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t0 + note.start);
        osc.stop(t0 + note.start + note.dur + 0.02);
      });
    } catch (e) {
      console.warn('[staff-sound] Erreur lecture son', e);
    }
  }

  // Anti-spam : 1 son par table par transition + cooldown global
  const SOUND_GLOBAL_COOLDOWN_MS = 2500;
  const SOUND_PER_TABLE_COOLDOWN_MS = 6000;
  let lastGlobalSoundAt = 0;
  const lastTableSoundAt = {};

  function maybePlaySoundForTable(tableId, kind) {
    const nowMs = Date.now();
    if (nowMs - lastGlobalSoundAt < SOUND_GLOBAL_COOLDOWN_MS) return;

    const lastTb = lastTableSoundAt[tableId] || 0;
    if (nowMs - lastTb < SOUND_PER_TABLE_COOLDOWN_MS) return;

    lastGlobalSoundAt = nowMs;
    lastTableSoundAt[tableId] = nowMs;

    playStatusMelody(kind);
  }

function detectTablesChangesAndBeep(tables) {
    if (!Array.isArray(tables)) return;

    const nextSnapshot = {};
    // On garde en mémoire les transitions détectées (priorité NOUVELLE_COMMANDE > COMMANDÉE)
    const events = [];

    tables.forEach((tb) => {
      const id = normId(tb.id);
      if (!id) return;

      const statusRaw = (tb.status || 'Vide').toString().trim();
      const status = normId(statusRaw.replace(' ', '_')); // "Nouvelle commande" -> "NOUVELLE_COMMANDE"
      const lastAt =
        tb.lastTicket && tb.lastTicket.at
          ? String(tb.lastTicket.at)
          : null;

      nextSnapshot[id] = { status, lastAt };

      const prev = prevTablesSnapshot[id];

      // Première apparition dans le snapshot : si table active et statut intéressant, on sonne
      if (!prev) {
        if ((status === 'COMMANDEE' || status === 'NOUVELLE_COMMANDE') && lastAt) {
          events.push({ id, status });
        }
        return;
      }

      // Transition de statut : on sonne uniquement quand on ENTRE dans COMMANDEE ou NOUVELLE_COMMANDE
      if (prev.status !== status) {
        if (status === 'COMMANDEE' || status === 'NOUVELLE_COMMANDE') {
          events.push({ id, status });
        }
        return;
      }

      // Nouveau ticket sans changement de statut : on ne sonne PAS (sinon spam).
      // Exemple : plusieurs commandes alors que statut déjà NOUVELLE_COMMANDE.
    });

    prevTablesSnapshot = nextSnapshot;
    window.__prevTablesSnapshot = prevTablesSnapshot;

    if (events.length === 0) return;

    // Priorité : NOUVELLE_COMMANDE d'abord
    events.sort((a, b) => (b.status === 'NOUVELLE_COMMANDE') - (a.status === 'NOUVELLE_COMMANDE'));

    const ev = events[0];
    if (ev.status === 'NOUVELLE_COMMANDE') {
      maybePlaySoundForTable(ev.id, 'NOUVELLE');
    } else if (ev.status === 'COMMANDEE') {
      maybePlaySoundForTable(ev.id, 'COMMANDEE');
    }
  }

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

  // --- Compteurs d'impression côté tableau de gauche
  // { [tableId]: { until, timeoutId, intervalId } }
  const leftPrintTimers = (window.leftPrintTimers = window.leftPrintTimers || {});

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
      const statusKey = normId(String(status).trim().replace(' ', '_'));
      card.className = 'table ' + statusToCssClass(statusKey);
      card.setAttribute('data-table', id);

      const head = document.createElement('div');
      head.className = 'card-head';

      const chipId = document.createElement('span');
      chipId.className = 'chip';
      chipId.textContent = id;
      head.appendChild(chipId);

      const chipStatus = document.createElement('span');
      const statusKey2 = normId(String(status).trim().replace(' ', '_'));
      chipStatus.className = 'chip chip-status ' + statusToCssClass(statusKey2);
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
        const payTimer = leftPayTimers[id];
        const printTimer = leftPrintTimers[id];

        // --- Apparence du bouton IMPRESSION (avec éventuel compte à rebours) ---
        if (printTimer) {
          btnPrint.style.backgroundColor = '#f97316';
          const updatePrintLabel = () => {
            const remain = printTimer.until - now();
            if (remain <= 0) {
              btnPrint.textContent = 'Imprimer maintenant';
              btnPrint.style.backgroundColor = '';
              return;
            }
            const sec = Math.max(1, Math.ceil(remain / 1000));
            btnPrint.textContent = `Impression en cours (${sec}s)`;
          };
          updatePrintLabel();
          const localPrintInterval = setInterval(() => {
            if (!document.body.contains(btnPrint)) {
              clearInterval(localPrintInterval);
              return;
            }
            const cur = leftPrintTimers[id];
            if (!cur) {
              clearInterval(localPrintInterval);
              btnPrint.textContent = 'Imprimer maintenant';
              btnPrint.style.backgroundColor = '';
              return;
            }
            const remain = cur.until - now();
            if (remain <= 0) {
              clearInterval(localPrintInterval);
              btnPrint.textContent = 'Imprimer maintenant';
              btnPrint.style.backgroundColor = '';
              return;
            }
            const sec = Math.max(1, Math.ceil(remain / 1000));
            btnPrint.textContent = `Impression en cours (${sec}s)`;
          }, 250);
        } else {
          btnPrint.textContent = 'Imprimer maintenant';
          btnPrint.style.backgroundColor = '';
        }

        // --- Apparence du bouton Paiement (avec éventuel compte à rebours) ---
        if (payTimer) {
          // Compte à rebours en cours
          btnPaid.style.backgroundColor = '#f97316';
          const updateLabel = () => {
            const remain = payTimer.until - now();
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

        // --- Clic IMPRESSION avec compte à rebours 5s ---
        btnPrint.addEventListener('click', async (e) => {
          e.stopPropagation();
          const base = getApiBase();
          if (!base) return;

          // Si impression déjà en cours pour cette table → on ignore
          if (leftPrintTimers[id]) return;

          // Lance le compte à rebours UI 5s
          const until = now() + 5000;
          const timer = {
            until,
            timeoutId: null,
            intervalId: null,
          };
          leftPrintTimers[id] = timer;

          btnPrint.style.backgroundColor = '#f97316';
          const updatePrintLabel = () => {
            const remain = timer.until - now();
            if (remain <= 0) {
              btnPrint.textContent = 'Imprimer maintenant';
            } else {
              const sec = Math.max(1, Math.ceil(remain / 1000));
              btnPrint.textContent = `Impression en cours (${sec}s)`;
            }
          };
          updatePrintLabel();

          timer.intervalId = setInterval(() => {
            if (!document.body.contains(btnPrint)) {
              clearInterval(timer.intervalId);
              return;
            }
            const remain = timer.until - now();
            if (remain <= 0) {
              clearInterval(timer.intervalId);
              btnPrint.textContent = 'Imprimer maintenant';
              btnPrint.style.backgroundColor = '';
            } else {
              const sec = Math.max(1, Math.ceil(remain / 1000));
              btnPrint.textContent = `Impression en cours (${sec}s)`;
            }
          }, 250);

          timer.timeoutId = setTimeout(() => {
            const current = leftPrintTimers[id];
            if (current === timer) {
              delete leftPrintTimers[id];
            }
            clearInterval(timer.intervalId);
            btnPrint.textContent = 'Imprimer maintenant';
            btnPrint.style.backgroundColor = '';
          }, 5000);

          // Appel API /print (comme avant)
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
      detectTablesChangesAndBeep(tables);
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
