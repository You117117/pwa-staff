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
  function getBusinessDayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function isAfterResetHour(date = new Date()) {
    return date.getHours() >= RESET_HOUR;
  }

  function getCurrentServiceDayKey() {
    const nowDate = new Date();
    if (isAfterResetHour(nowDate)) {
      return getBusinessDayKey(nowDate);
    } else {
      const yesterday = new Date(nowDate);
      yesterday.setDate(nowDate.getDate() - 1);
      return getBusinessDayKey(yesterday);
    }
  }

  // --- Mémoire globale locale (par device)
  const tableMemory     = (window.tableMemory     = window.tableMemory     || {});   // { tableId: { isClosed, ignoreIds:Set } }
  const detailPayTimeouts = (window.detailPayTimeouts = window.detailPayTimeouts || {}); // pour panneau droit (si utilisé)
  const autoBuffer      = (window.autoBuffer      = window.autoBuffer      || {});   // { tableId: { timeoutId } }
  const payClose        = (window.payClose        = window.payClose        || {});   // { closeAt, timeoutId, displayUntil }
  const alertedTickets  = (window.alertedTickets  = window.alertedTickets  || {});   // { tid -> Set(ids) }
  const prevStatusBeforePay = (window.prevStatusBeforePay = window.prevStatusBeforePay || {}); // { tableId: {label, local} }
  const localLastActivity   = (window.localLastActivity   = window.localLastActivity   || {}); // { tableId -> timestamp }
  const localTableStatus    = (window.localTableStatus    = window.localTableStatus    || {}); // { tableId -> {phase:'PREP'|'PAY', until } }
  if (!window.lastKnownStatus) window.lastKnownStatus = {};
  if (!window.businessDayKey) window.businessDayKey = null;

  // --- Audio notif
  const chime = {
    ctx: null,
    lastPlayAt: 0,
    retryTimer: null,
    el: null,
    ensureCtx() {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      } catch {}
    },
    playWebAudio() {
      this.ensureCtx();
      const ctx = this.ctx;
      if (!ctx) return false;
      const tnow = now();
      if (tnow - this.lastPlayAt < 50) return false;
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
        o.frequency.setValueAtTime(n.f, ctx.currentTime + n.t);
        o.connect(g);
        return o;
      });
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
      oscs.forEach((o, i) => {
        o.start(ctx.currentTime + notes[i].t);
        o.stop(ctx.currentTime + 1.25);
      });
      this.lastPlayAt = tnow;
      return true;
    },
    ensureHtml5Audio() {
      if (this.el) return;
      const a = document.createElement('audio');
      a.style.display = 'none';
      document.body.appendChild(a);
      this.el = a;
    },
    tryPlayHtml5() {
      this.ensureHtml5Audio();
      const a = this.el;
      if (!a) return false;
      const tnow = now();
      if (tnow - this.lastPlayAt < 50) return false;
      try {
        a.currentTime = 0;
        const p = a.play();
        if (p && p.catch) p.catch(() => {});
        this.lastPlayAt = tnow;
        return true;
      } catch {
        return false;
      }
    },
    playRobust() {
      if (this.playWebAudio()) return;
      if (this.tryPlayHtml5()) return;
    },
    startAutoUnlock() {
      document.addEventListener('click', () => this.playRobust(), { once: true });
    },
  };

  // --- Persistance
  const STORAGE_KEY = 'staff-state-v1';
  function saveState() {
    try {
      const data = {
        tableMemory: serializeTableMemory(),
        payClose,
        prevStatusBeforePay,
        localLastActivity,
        localTableStatus,
        lastKnownStatus: window.lastKnownStatus,
        businessDayKey: window.businessDayKey,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }

  function serializeTableMemory() {
    const obj = {};
    for (const [k, v] of Object.entries(tableMemory)) {
      obj[k] = {
        isClosed: !!v.isClosed,
        ignoreIds: v.ignoreIds ? Array.from(v.ignoreIds) : [],
      };
    }
    return obj;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.tableMemory) {
        for (const [k, v] of Object.entries(data.tableMemory)) {
          tableMemory[k] = {
            isClosed: !!v.isClosed,
            ignoreIds: new Set(v.ignoreIds || []),
          };
        }
      }
      if (data.payClose) {
        for (const [k, v] of Object.entries(data.payClose)) {
          payClose[k] = v;
        }
      }
      if (data.prevStatusBeforePay) {
        for (const [k, v] of Object.entries(data.prevStatusBeforePay)) {
          prevStatusBeforePay[k] = v;
        }
      }
      if (data.localLastActivity) {
        Object.assign(localLastActivity, data.localLastActivity);
      }
      if (data.localTableStatus) {
        Object.assign(localTableStatus, data.localTableStatus);
      }
      if (data.lastKnownStatus) {
        Object.assign(window.lastKnownStatus, data.lastKnownStatus);
      }
      if (data.businessDayKey) {
        window.businessDayKey = data.businessDayKey;
      }
    } catch {}
  }

  // --- Gestion jour de service
  function ensureBusinessDayFresh() {
    const currentKey = getCurrentServiceDayKey();
    if (window.businessDayKey && window.businessDayKey !== currentKey) {
      for (const k of Object.keys(tableMemory)) delete tableMemory[k];
      for (const k of Object.keys(payClose)) delete payClose[k];
      for (const k of Object.keys(prevStatusBeforePay)) delete prevStatusBeforePay[k];
      for (const k of Object.keys(localLastActivity)) delete localLastActivity[k];
      for (const k of Object.keys(localTableStatus)) delete localTableStatus[k];
      window.lastKnownStatus = {};
    }
    window.businessDayKey = currentKey;
    saveState();
  }

  // --- Auto buffer & close
  function setPreparationFor20min(id) {
    id = normId(id);
    const until = now() + PREP_MS;
    localTableStatus[id] = { phase: 'PREP', until };
    saveState();
  }

  function scheduleCloseIn30s(id){
    id=normId(id);
    const nowTs=now();
    const closeAt=nowTs+5_000;
    const displayUntil=nowTs+5_000;
    if(payClose[id]&&payClose[id].timeoutId) clearTimeout(payClose[id].timeoutId);
    const timeoutId=setTimeout(()=>closeTableAndIgnoreCurrentTickets(id),5_000);
    payClose[id]={closeAt,displayUntil,timeoutId};
    saveState();
  }
  
  function cancelPayClose(id){
    id=normId(id);
    if(payClose[id]&&payClose[id].timeoutId) clearTimeout(payClose[id].timeoutId);
    delete payClose[id];
    saveState();
  }
  window.cancelPayClose = cancelPayClose;

  // ... (le reste de ton app.js est inchangé, y compris le rendu des cartes, résumé du jour, refresh, etc.)
  // La seule autre modif est dans le bloc btnCancel :

  // Dans renderTables(), à l’endroit où tu as :
  // const btnCancel=card.querySelector('.btn-cancel-pay'); if(btnCancel){ ... }

  // utilise la version avec compte à rebours que j’ai mise plus haut.
});
