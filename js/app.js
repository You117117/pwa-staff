// app.js — Staff (tables, buffer 120s, paiement, reset 03:00, tri par activité locale)

document.addEventListener('DOMContentLoaded', () => {
  // --- Sélecteurs
  const apiInput = document.querySelector('#apiUrl');
  const tablesContainer = document.querySelector('#tables');
  const tablesEmpty = document.querySelector('#tablesEmpty');
  const filterSelect = document.querySelector('#filterTables');
  const summaryContainer = document.querySelector('#summary');
  const summaryEmpty = document.querySelector('#summaryEmpty');

  // --- Constantes
  const REFRESH_MS = 5000;
  const PREP_MS = 20 * 60 * 1000;
  const BUFFER_MS = 120 * 1000;
  const RESET_HOUR = 3; // heure de "fin de journée" (03:00)

  // --- Persistance de l'URL API (Render) ---
  const API_URL_STORAGE_KEY = 'staff_api_url_v1';

  function loadApiUrlFromStorage() {
    if (!apiInput) return;
    try {
      const saved = localStorage.getItem(API_URL_STORAGE_KEY);
      if (saved) {
        apiInput.value = saved;
      }
    } catch (e) {
      console.warn('Impossible de charger apiUrl depuis localStorage', e);
    }
  }

  function saveApiUrlToStorage() {
    if (!apiInput) return;
    try {
      const v = apiInput.value.trim();
      if (v) {
        localStorage.setItem(API_URL_STORAGE_KEY, v);
      } else {
        localStorage.removeItem(API_URL_STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Impossible de sauvegarder apiUrl dans localStorage', e);
    }
  }

  // Charger l'URL API au démarrage
  loadApiUrlFromStorage();

  // Sauvegarder dès que l'utilisateur modifie le champ
  if (apiInput) {
    apiInput.addEventListener('change', () => {
      saveApiUrlToStorage();
      // On relance un refresh direct avec la nouvelle URL
      if (window.refreshTables) {
        window.refreshTables();
      }
    });
    apiInput.addEventListener('blur', () => {
      saveApiUrlToStorage();
    });
  }

  // --- Utils
  const normId = (id) => (id || '').trim().toUpperCase();
  const now = () => Date.now();
  const getApiBase = () => (apiInput ? apiInput.value.trim().replace(/\/+$/, '') : '');
  const formatTime = (dateString) => {
    if (!dateString) return '--:--';
    const d = new Date(dateString);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  // --- "Business day" (gestion de la journée de service)
  function getBusinessDayKey() {
    // Clé de type "YYYY-MM-DD" mais avec coupure à RESET_HOUR
    const d = new Date();
    const h = d.getHours();
    if (h < RESET_HOUR) {
      // Avant RESET_HOUR, on considère qu'on est encore sur la journée d'hier
      d.setDate(d.getDate() - 1);
    }
    const iso = d.toISOString(); // ex: 2025-11-13T...
    return iso.slice(0, 10); // "YYYY-MM-DD"
  }

  // --- Stores & persistance
  const localTableStatus = (window.localTableStatus = window.localTableStatus || {}); // { phase, until }
  const tableMemory     = (window.tableMemory     = window.tableMemory     || {});   // { isClosed, ignoreIds:Set }
  const autoBuffer      = (window.autoBuffer      = window.autoBuffer      || {});   // { until, timeoutId }
  const payClose        = (window.payClose        = window.payClose        || {});   // { closeAt, displayUntil, timeoutId }
  const alertedTickets  = (window.alertedTickets  = window.alertedTickets  || {});   // { tid -> Set(ids) }
  const prevStatusBeforePay = (window.prevStatusBeforePay = window.prevStatusBeforePay || {}); // { tableId: {label, local} }
  const localLastActivity   = (window.localLastActivity   = window.localLastActivity   || {}); // { tableId: timestamp }

  if (!window.lastKnownStatus) window.lastKnownStatus = {};
  if (!window.businessDayKey) window.businessDayKey = null;

  // --- Chime robuste
  const chime = {
    ctx: null,
    lastPlayAt: 0,
    unlockTimer: null,
    el: null,
    wavUrl: null,
    retryTimer: null,
    retryUntil: 0,
    ensureCtx() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!this.ctx && AC) this.ctx = new AC();
    },
    startAutoUnlock() {
      this.ensureCtx();
      if (!this.ctx) return;
      const tryResume = () => {
        if (!this.ctx) return;
        if (this.ctx.state === 'running') return;
        this.ctx.resume().catch(() => {});
      };
      if (this.unlockTimer) clearInterval(this.unlockTimer);
      this.unlockTimer = setInterval(tryResume, 1500);
      document.addEventListener('click', tryResume, { once: true });
      document.addEventListener('touchstart', tryResume, { once: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tryResume();
      });
      tryResume();
    },
    webAudioOk() {
      return !!(this.ctx && this.ctx.state === 'running');
    },
    playWebAudio() {
      const tnow = now();
      if (tnow - this.lastPlayAt < 500) return false;
      this.ensureCtx();
      const ctx = this.ctx;
      if (!ctx) return false;
      if (ctx.state !== 'running') {
        ctx.resume().catch(() => {});
        if (ctx.state !== 'running') return false;
      }
      const t0 = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      const notes = [
        { t: 0.0, f: 880 },
        { t: 0.18, f: 1108 },
        { t: 0.36, f: 1319 },
      ];
      const oscs = notes.map((n) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(n.f, t0 + n.t);
        o.connect(g);
        return o;
      });
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
      oscs.forEach((o, i) => {
        o.start(t0 + notes[i].t);
        o.stop(t0 + 1.25);
      });
      this.lastPlayAt = tnow;
      return true;
    },
    ensureAudioElement() {
      if (this.el) return;
      const audio = document.createElement('audio');
      audio.style.display = 'none';
      document.body.appendChild(audio);
      this.el = audio;
      const wavData =
        'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
      this.wavUrl = wavData;
      audio.src = wavData;
    },
    async playHtmlAudio() {
      const tnow = now();
      if (tnow - this.lastPlayAt < 500) return false;
      this.ensureAudioElement();
      if (!this.el) return false;
      try {
        this.el.currentTime = 0;
        await this.el.play();
        this.lastPlayAt = tnow;
        return true;
      } catch {
        return false;
      }
    },
    async play() {
      if (this.webAudioOk()) {
        const ok = this.playWebAudio();
        if (ok) return;
      }
      await this.playHtmlAudio();
    },
  };

  // --- Persistance localStorage (état staff)
  const STORAGE_KEY = 'staff_state_v3';
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.lastKnownStatus) {
        Object.assign(window.lastKnownStatus, parsed.lastKnownStatus);
      }
      if (parsed.tableMemory) {
        Object.assign(tableMemory, parsed.tableMemory);
        Object.keys(tableMemory).forEach((k) => {
          if (tableMemory[k].ignoreIds && !(tableMemory[k].ignoreIds instanceof Set)) {
            tableMemory[k].ignoreIds = new Set(tableMemory[k].ignoreIds);
          }
        });
      }
      if (parsed.autoBuffer) Object.assign(autoBuffer, parsed.autoBuffer);
      if (parsed.localTableStatus) Object.assign(localTableStatus, parsed.localTableStatus);
      if (parsed.localLastActivity) Object.assign(localLastActivity, parsed.localLastActivity);
      if (parsed.payClose) Object.assign(payClose, parsed.payClose);
      if (parsed.prevStatusBeforePay) Object.assign(prevStatusBeforePay, parsed.prevStatusBeforePay);
      if (parsed.businessDayKey) window.businessDayKey = parsed.businessDayKey;
    } catch {}
  }
  function saveState() {
    try {
      const ser = {
        lastKnownStatus: window.lastKnownStatus,
        tableMemory: Object.fromEntries(
          Object.entries(tableMemory).map(([k, v]) => [
            k,
            {
              ...v,
              ignoreIds: v.ignoreIds ? Array.from(v.ignoreIds) : [],
            },
          ])
        ),
        autoBuffer,
        localTableStatus,
        localLastActivity,
        payClose,
        prevStatusBeforePay,
        businessDayKey: window.businessDayKey,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ser));
    } catch {}
  }

  loadState();

  // --- Auto reset business day si on a changé de date
  function ensureBusinessDay() {
    const currentKey = getBusinessDayKey();
    if (window.businessDayKey && window.businessDayKey !== currentKey) {
      Object.keys(tableMemory).forEach((k) => {
        tableMemory[k].isClosed = false;
        if (tableMemory[k].ignoreIds) tableMemory[k].ignoreIds.clear();
      });
      Object.keys(autoBuffer).forEach((k) => {
        if (autoBuffer[k].timeoutId) clearTimeout(autoBuffer[k].timeoutId);
      });
      Object.keys(payClose).forEach((k) => {
        if (payClose[k].timeoutId) clearTimeout(payClose[k].timeoutId);
      });
      Object.keys(localTableStatus).forEach((k) => delete localTableStatus[k]);
      Object.keys(prevStatusBeforePay).forEach((k) => delete prevStatusBeforePay[k]);
      Object.keys(localLastActivity).forEach((k) => delete localLastActivity[k]);
      Object.keys(window.lastKnownStatus).forEach((k) => delete window.lastKnownStatus[k]);
      saveState();
    }
    window.businessDayKey = currentKey;
  }

  // --- Gestion buffer auto (120s) avant "En préparation"
  function ensureAutoBuffer(id, createdAt) {
    id = normId(id);
    const tCreated = new Date(createdAt).getTime();
    const target = tCreated + BUFFER_MS;
    const nowTs = now();

    if (nowTs >= target) {
      setPreparationFor20min(id);
      return;
    }

    if (autoBuffer[id] && autoBuffer[id].timeoutId) clearTimeout(autoBuffer[id].timeoutId);
    const delay = target - nowTs;
    const timeoutId = setTimeout(() => setPreparationFor20min(id), delay);
    autoBuffer[id] = { until: target, timeoutId };
    saveState();
  }

  function cancelAutoBuffer(id) {
    id = normId(id);
    if (autoBuffer[id] && autoBuffer[id].timeoutId) clearTimeout(autoBuffer[id].timeoutId);
    delete autoBuffer[id];
    saveState();
  }

  function setPreparationFor20min(id) {
    id = normId(id);
    const until = now() + PREP_MS;
    localTableStatus[id] = { phase: 'PREP', until };
    saveState();
  }

  function getLocalStatus(id) {
    id = normId(id);
    const st = localTableStatus[id];
    if (!st) return null;
    const tnow = now();
    if (st.phase === 'PREP') {
      if (tnow >= st.until) {
        localTableStatus[id] = { phase: 'PAY', until: null };
        saveState();
        return { phase: 'PAY', until: null };
      }
      return st;
    }
    if (st.phase === 'PAY') {
      return st;
    }
    return null;
  }

  // --- Fermeture table + ignore des tickets courants (ancienne logique locale)
  async function fetchTicketIdsForTable(base, tableId) {
    try {
      const res = await fetch(`${base}/summary`, { cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      if (!data || !Array.isArray(data.tickets)) return [];
      const idNorm = normId(tableId);
      return data.tickets.filter((t) => normId(t.table) === idNorm).map((t) => t.id);
    } catch {
      return [];
    }
  }

  async function closeTableAndIgnoreCurrentTickets(id) {
    id = normId(id);
    const base = getApiBase();
    const ids = base ? await fetchTicketIdsForTable(base, id) : [];
    if (!tableMemory[id]) tableMemory[id] = { isClosed: true, ignoreIds: new Set() };
    tableMemory[id].isClosed = true;
    ids.forEach((tid) => tableMemory[id].ignoreIds.add(String(tid)));

    delete prevStatusBeforePay[id];
    delete payClose[id];
    saveState();
  }

  function scheduleCloseIn30s(id) {
    id = normId(id);
    const closeAt = now() + 30_000; // fermeture logique locale (inchangée)
    const displayUntil = now() + 5_000; // compte à rebours visuel 5s pour le bouton de gauche
    if (payClose[id] && payClose[id].timeoutId) clearTimeout(payClose[id].timeoutId);
    const timeoutId = setTimeout(() => closeTableAndIgnoreCurrentTickets(id), 30_000);
    payClose[id] = { closeAt, displayUntil, timeoutId };
    saveState();
  }

  function cancelPayClose(id) {
    id = normId(id);
    if (payClose[id] && payClose[id].timeoutId) clearTimeout(payClose[id].timeoutId);
    delete payClose[id];
    saveState();
  }
  window.cancelPayClose = cancelPayClose;

  // --- Rendu LISTE TABLES (TRI PAR localLastActivity)
  function renderTables(tables) {
    if (!tablesContainer) return;
    tablesContainer.innerHTML = '';

    if (!tables || !tables.length) {
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }
    if (tablesEmpty) tablesEmpty.style.display = 'none';

    const filter = filterSelect ? normId(filterSelect.value) : 'TOUTES';
    const PRIORITY = ['Vide', 'Commandée', 'En préparation', 'Doit payé', 'Payée'];

    // Tri : table avec dernière activité locale la plus récente en haut
    const sorted = [...tables].sort((a, b) => {
      const ida = normId(a.id);
      const idb = normId(b.id);
      const ta =
        typeof localLastActivity[ida] === 'number'
          ? localLastActivity[ida]
          : a.lastTicketAt
          ? new Date(a.lastTicketAt).getTime()
          : 0;
      const tb =
        typeof localLastActivity[idb] === 'number'
          ? localLastActivity[idb]
          : b.lastTicketAt
          ? new Date(b.lastTicketAt).getTime()
          : 0;
      return tb - ta;
    });

    sorted.forEach((table) => {
      const id = normId(table.id);
      if (filter !== 'TOUTES' && filter !== id) return;

      const last = table.lastTicketAt ? formatTime(table.lastTicketAt) : '--:--';
      let backendStatus = table.status || 'Vide';
      const prev = window.lastKnownStatus[id] || null;
      const forced = getLocalStatus(id);

      let finalStatus;
      if (forced && forced.phase === 'PREP') {
        finalStatus = 'En préparation';
      } else if (forced && forced.phase === 'PAY') {
        finalStatus = 'Doit payé';
      } else if (prev) {
        const prevIdx = PRIORITY.indexOf(prev);
        const backIdx = PRIORITY.indexOf(backendStatus);
        finalStatus = prevIdx > backIdx ? prev : backendStatus;
      } else {
        finalStatus = backendStatus;
      }

      window.lastKnownStatus[id] = finalStatus;
      if (finalStatus !== 'Commandée') cancelAutoBuffer(id);

      const showActions = finalStatus !== 'Vide';
      const isPaymentPending = !!payClose[id];

      const card = document.createElement('div');
      card.className = 'table';
      card.setAttribute('data-table', id);
      card.innerHTML = `
  <div class="card-head">
    <span class="chip">${id}</span>
    <span class="chip">${finalStatus}</span>
    <span class="chip">
      ${
        localLastActivity[id]
          ? `Commandé à : ${formatTime(new Date(localLastActivity[id]).toISOString())}`
          : '—'
      }
    </span>
  </div>

  ${
    showActions
      ? `
        <div class="card-actions">
          <button class="btn btn-primary btn-print">Imprimer maintenant</button>
          ${
            isPaymentPending
              ? `<button class="btn btn-warning btn-cancel-pay">Annuler le paiement</button>`
              : `<button class="btn btn-primary btn-paid">Paiement confirmé</button>`
          }
        </div>
      `
      : ``
  }
`;

      // Toggle panneau de droite quand on reclique sur la même table
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return; // clic sur un bouton = pas toggle

        const currentId = window.__currentDetailTableId || null;
        if (currentId && normId(currentId) === id) {
          const panelEl = document.querySelector('#tableDetailPanel');
          if (panelEl) {
            panelEl.style.display = 'none';
          }
          window.__currentDetailTableId = null;
          return;
        }

        openTableDetail(id);
      });

      if (showActions) {
        const btnPrint = card.querySelector('.btn-print');
        if (btnPrint) {
          btnPrint.addEventListener('click', async (e) => {
            e.stopPropagation();
            const base = getApiBase();
            cancelAutoBuffer(id);
            if (base) {
              try {
                await fetch(`${base}/print`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ table: id }),
                });
              } catch {}
            }
            setPreparationFor20min(id);
            window.lastKnownStatus[id] = 'En préparation';
            if (!tableMemory[id]) tableMemory[id] = { isClosed: false, ignoreIds: new Set() };
            tableMemory[id].isClosed = false;
            saveState();
            refreshTables();
          });
        }

        const btnPaid = card.querySelector('.btn-paid');
        if (btnPaid) {
          btnPaid.addEventListener('click', async (e) => {
            e.stopPropagation();
            const base = getApiBase();
            cancelAutoBuffer(id);

            prevStatusBeforePay[id] = {
              label: window.lastKnownStatus[id] || 'Commandée',
              local: localTableStatus[id] ? { ...localTableStatus[id] } : null,
            };
            saveState();

            if (base) {
              try {
                await fetch(`${base}/confirm`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ table: id }),
                });
              } catch {}
            }
            window.lastKnownStatus[id] = 'Payée';
            delete localTableStatus[id];
            scheduleCloseIn30s(id);
            saveState();
            refreshTables();
          });
        }

        const btnCancel = card.querySelector('.btn-cancel-pay');
        // Compte à rebours visuel 5s sur le bouton "Annuler le paiement" (tableau de gauche)
        if (btnCancel && payClose[id] && payClose[id].displayUntil) {
          const updateCountdown = () => {
            const pc = payClose[id];
            if (!pc) {
              btnCancel.textContent = 'Annuler le paiement';
              return;
            }
            const remainingMs = pc.displayUntil - now();
            if (remainingMs > 0) {
              const sec = Math.ceil(remainingMs / 1000);
              btnCancel.textContent = `Annuler le paiement (${sec}s)`;
            } else {
              btnCancel.textContent = 'Annuler le paiement';
            }
          };
          updateCountdown();
          const countdownIntervalId = setInterval(() => {
            if (!document.body.contains(btnCancel) || !payClose[id]) {
              clearInterval(countdownIntervalId);
              return;
            }
            updateCountdown();
          }, 250);
        }

        if (btnCancel) {
          btnCancel.addEventListener('click', (e) => {
            e.stopPropagation();
            cancelPayClose(id);
            const prevState = prevStatusBeforePay[id];
            if (prevState) {
              window.lastKnownStatus[id] = prevState.label;
              if (prevState.local) {
                localTableStatus[id] = { ...prevState.local };
              } else {
                delete localTableStatus[id];
              }
              delete prevStatusBeforePay[id];
            } else {
              window.lastKnownStatus[id] = 'Doit payé';
              localTableStatus[id] = { phase: 'PAY', until: null };
            }
            saveState();
            refreshTables();
          });
        }
      }

      tablesContainer.appendChild(card);
    });
  }

  // --- Rendu RÉSUMÉ
  function renderSummary(tickets) {
    if (!summaryContainer) return;
    summaryContainer.innerHTML = '';

    if (!tickets || !tickets.length) {
      if (summaryEmpty) summaryEmpty.style.display = 'block';
      return;
    }
    if (summaryEmpty) summaryEmpty.style.display = 'none';

    tickets.forEach((t) => {
      let bodyText = '';
      if (t.label) bodyText = t.label;
      else if (Array.isArray(t.items)) {
        bodyText = t.items
          .map(
            (it) =>
              `${it.qty || it.quantity || 1}× ${
                it.label || it.name || it.title || 'article'
              }`
          )
          .join(', ');
      } else if (Array.isArray(t.lines)) {
        bodyText = t.lines
          .map(
            (it) =>
              `${it.qty || it.quantity || 1}× ${
                it.label || it.name || it.title || 'article'
              }`
          )
          .join(', ');
      }

      const item = document.createElement('div');
      item.className = 'summaryItem';
      item.innerHTML = `
        <div class="head">
          <span class="chip">${t.table}</span>
          <span class="chip">${t.time || ''}</span>
          <span class="chip">${typeof t.total === 'number' ? t.total.toFixed(2) + ' €' : ''}</span>
        </div>
        <div class="body">${bodyText}</div>
      `;
      summaryContainer.appendChild(item);
    });
  }

  // --- Fetch & refresh
  async function fetchTablesAndSummary() {
    ensureBusinessDay();
    const base = getApiBase();
    if (!base) return;
    try {
      const [tablesRes, summaryRes] = await Promise.all([
        fetch(`${base}/tables`, { cache: 'no-store' }),
        fetch(`${base}/summary`, { cache: 'no-store' }),
      ]);
      const tablesData = await tablesRes.json();
      const summaryData = await summaryRes.json();

      const tables = tablesData.tables || [];
      const tickets = summaryData.tickets || [];

      tickets.forEach((t) => {
        const id = normId(t.table);
        const createdTs = t.createdAt ? new Date(t.createdAt).getTime() : null;
        if (createdTs && (!localLastActivity[id] || createdTs > localLastActivity[id])) {
          localLastActivity[id] = createdTs;
        }
      });

      saveState();
      renderTables(tables);
      renderSummary(tickets);
    } catch (err) {
      console.error('Erreur fetchTablesAndSummary', err);
    }
  }

  window.refreshTables = fetchTablesAndSummary;

  // --- Ouverture du détail de table
  function openTableDetail(id) {
    if (window.showTableDetail) {
      window.showTableDetail(id);
    }
  }
  window.openTableDetail = openTableDetail;

  // --- Init

  // Si on a rechargé la page et qu'un apiUrl était en localStorage,
  // il est déjà rechargé dans le champ -> on peut req direct
  fetchTablesAndSummary();
  setInterval(fetchTablesAndSummary, REFRESH_MS);

  chime.startAutoUnlock();
});
