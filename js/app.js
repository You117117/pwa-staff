// app.js — solid chime (dual engine + retries) + all existing logic intact

document.addEventListener('DOMContentLoaded', () => {
  // --- Selectors
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

  // --- Constants
  const REFRESH_MS = 5000;
  const PREP_MS = 20 * 60 * 1000;
  const BUFFER_MS = 120 * 1000;

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

  // --- Stores + persistence
  const localTableStatus = (window.localTableStatus = window.localTableStatus || {});
  const tableMemory = (window.tableMemory = window.tableMemory || {});
  const autoBuffer = (window.autoBuffer = window.autoBuffer || {});
  const payClose = (window.payClose = window.payClose || {});
  const alertedTickets = (window.alertedTickets = window.alertedTickets || {});
  if (!window.lastKnownStatus) window.lastKnownStatus = {};

  // -----------------------------
  // SOLID CHIME ENGINE
  // -----------------------------
  const chime = {
    // webaudio
    ctx: null,
    lastPlayAt: 0,
    unlockTimer: null,

    // html5 audio fallback
    el: null,
    wavUrl: null,
    retryTimer: null,
    retryUntil: 0,

    ensureCtx() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
    },
    startAutoUnlock() {
      this.ensureCtx();
      if (!this.ctx) return;
      const tryResume = () => {
        if (!this.ctx) return;
        if (this.ctx.state === 'running') return;
        this.ctx.resume?.().catch(() => {});
      };
      if (!this.unlockTimer) {
        this.unlockTimer = setInterval(tryResume, 1000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') tryResume();
        });
      }
      tryResume();
    },
    webAudioOk() {
      return !!(this.ctx && this.ctx.state === 'running');
    },
    playWebAudio() {
      const tnow = now();
      if (tnow - this.lastPlayAt < 500) return; // anti-spam
      if (!this.webAudioOk()) return false;

      const ctx = this.ctx;
      const t0 = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;

      // 3-note arpeggio + tail (~1.2s)
      const notes = [
        { t: 0.00, f: 880 },  // A5
        { t: 0.18, f: 1108 }, // C#6
        { t: 0.36, f: 1319 }, // E6
      ];
      const osc = notes.map(() => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        return o;
      });

      osc.forEach((o, i) => {
        o.frequency.setValueAtTime(notes[i].f, t0 + notes[i].t);
        o.connect(gain);
      });
      gain.connect(ctx.destination);

      // ADSR
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.30, t0 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.20, t0 + 0.40);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.20);

      osc.forEach((o, i) => {
        o.start(t0 + notes[i].t);
        o.stop(t0 + 1.25);
      });

      this.lastPlayAt = tnow;
      return true;
    },
    // HTML5 audio fallback: build WAV in-memory once
    ensureHtml5Audio() {
      if (this.el) return;
      const { url } = generateChimeWavUrl(); // ~1.4s bell-ish
      this.wavUrl = url;
      const a = document.createElement('audio');
      a.src = url;
      a.preload = 'auto';
      a.setAttribute('playsinline', 'true');
      a.style.display = 'none';
      document.body.appendChild(a);
      this.el = a;
    },
    tryPlayHtml5() {
      const tnow = now();
      if (tnow - this.lastPlayAt < 500) return true;
      this.ensureHtml5Audio();
      if (!this.el) return false;

      try {
        const p = this.el.play();
        if (p && typeof p.then === 'function') {
          p.then(() => { this.lastPlayAt = tnow; }).catch(() => {});
        } else {
          this.lastPlayAt = tnow;
        }
        return true;
      } catch {
        return false;
      }
    },
    // Public entrypoint: robust chime with retries (up to 10s)
    playRobust() {
      // 1) try webaudio
      if (this.playWebAudio()) return;

      // 2) fallback to HTML5 audio
      if (this.tryPlayHtml5()) return;

      // 3) schedule retries—fires ASAP when policy allows
      this.scheduleRetries();
    },
    scheduleRetries() {
      if (this.retryTimer) return;
      this.retryUntil = now() + 10000; // retry up to 10s
      const tick = () => {
        this.ensureCtx();
        // First preference: try resuming ctx and playing
        if (this.playWebAudio()) {
          clearInterval(this.retryTimer); this.retryTimer = null; return;
        }
        // Second: HTML5 audio
        if (this.tryPlayHtml5()) {
          clearInterval(this.retryTimer); this.retryTimer = null; return;
        }
        if (now() > this.retryUntil) {
          clearInterval(this.retryTimer); this.retryTimer = null; return;
        }
      };
      this.retryTimer = setInterval(tick, 300);
      // Also react immediately if tab becomes visible
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tick();
      });
    },
  };

  // Create a simple WAV (PCM16, 44.1kHz) synthesized in JS
  function generateChimeWavUrl() {
    const sampleRate = 44100;
    const duration = 1.4; // seconds
    const length = Math.floor(sampleRate * duration);
    const channels = 1;
    const freqSeq = [
      { t: 0.00, f: 880 },
      { t: 0.16, f: 1046.5 },
      { t: 0.32, f: 1318.5 },
    ];
    const attack = 0.02, decay = 0.20, sustain = 0.2, release = 0.35;

    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Select active note (simple step arp)
      let f = freqSeq[freqSeq.length - 1].f;
      for (let j = 0; j < freqSeq.length; j++) {
        if (t >= freqSeq[j].t) f = freqSeq[j].f;
      }
      // Sine
      let v = Math.sin(2 * Math.PI * f * t);

      // Envelope ADSR
      let env = 0;
      if (t < attack) {
        env = t / attack;
      } else if (t < attack + decay) {
        const d = (t - attack) / decay;
        env = 1 - d * (1 - sustain);
      } else if (t < duration - release) {
        env = sustain;
      } else {
        const r = (t - (duration - release)) / release;
        env = sustain * (1 - r);
      }
      // gentle lowpass-ish by mixing with delayed sample
      const prev = i > 0 ? data[i - 1] : 0;
      v = (v * 0.7 + prev * 0.3) * env * 0.9;

      data[i] = v;
    }

    // Convert to PCM16 WAV
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeStr(off, s) { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); }
    function write16(off, v) { view.setUint16(off, v, true); }
    function write32(off, v) { view.setUint32(off, v, true); }

    // RIFF header
    writeStr(0, 'RIFF');
    write32(4, 36 + dataSize);
    writeStr(8, 'WAVE');
    // fmt chunk
    writeStr(12, 'fmt ');
    write32(16, 16);       // PCM
    write16(20, 1);        // format PCM
    write16(22, channels);
    write32(24, sampleRate);
    write32(28, byteRate);
    write16(32, blockAlign);
    write16(34, 16);       // bits
    // data chunk
    writeStr(36, 'data');
    write32(40, dataSize);

    // samples
    let offset = 44;
    for (let i = 0; i < length; i++) {
      let s = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, s * 0x7fff, true);
      offset += 2;
    }

    const blob = new Blob([view], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    return { url };
  }

  // --- Persistence
  const STORAGE_KEY = 'staff-state-v1';
  function saveState() {
    const json = {
      tableMemory: Object.fromEntries(
        Object.entries(tableMemory).map(([tid, v]) => [
          tid, { isClosed: !!v.isClosed, ignoreIds: Array.from(v.ignoreIds || []) },
        ])
      ),
      localTableStatus,
      autoBuffer: Object.fromEntries(Object.entries(autoBuffer).map(([tid, v]) => [tid, { until: v.until }])),
      payClose: Object.fromEntries(Object.entries(payClose).map(([tid, v]) => [tid, { closeAt: v.closeAt }])),
      alertedTickets: Object.fromEntries(Object.entries(alertedTickets).map(([tid, set]) => [tid, Array.from(set || [])])),
      lastKnownStatus,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(json)); } catch {}
  }
  function loadState() {
    try {
      const txt = localStorage.getItem(STORAGE_KEY);
      if (!txt) return;
      const s = JSON.parse(txt);
      if (s.tableMemory) Object.entries(s.tableMemory).forEach(([tid, v]) => tableMemory[tid] = { isClosed: !!v.isClosed, ignoreIds: new Set(v.ignoreIds || []) });
      if (s.localTableStatus) Object.assign(localTableStatus, s.localTableStatus);
      if (s.autoBuffer) Object.entries(s.autoBuffer).forEach(([tid, v]) => autoBuffer[tid] = { until: v.until });
      if (s.payClose) Object.entries(s.payClose).forEach(([tid, v]) => payClose[tid] = { closeAt: v.closeAt });
      if (s.alertedTickets) Object.entries(s.alertedTickets).forEach(([tid, arr]) => alertedTickets[tid] = new Set(arr || []));
      if (s.lastKnownStatus) Object.assign(window.lastKnownStatus, s.lastKnownStatus);
    } catch {}
  }

  // --- Status timers
  function setPreparationFor20min(tableId) {
    const id = normId(tableId);
    localTableStatus[id] = { phase: 'PREPARATION', until: now() + PREP_MS };
    saveState();
  }
  function getLocalStatus(tableId) {
    const id = normId(tableId);
    const st = localTableStatus[id];
    if (!st) return null;
    const t = now();
    if (st.phase === 'PREPARATION') {
      if (t < st.until) return 'En préparation';
      localTableStatus[id] = { phase: 'PAY', until: null };
      saveState();
      return 'Doit payé';
    }
    if (st.phase === 'PAY') return 'Doit payé';
    return null;
  }

  // --- 120s buffer
  async function autoPrintAndPrep(id) {
    const base = getApiBase();
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
    delete autoBuffer[id];
    saveState();
    refreshTables();
  }
  function startAutoBuffer(id) {
    id = normId(id);
    if (autoBuffer[id]) return;
    const until = now() + BUFFER_MS;
    const timeoutId = setTimeout(() => autoPrintAndPrep(id), BUFFER_MS);
    autoBuffer[id] = { until, timeoutId };
    saveState();
  }
  function cancelAutoBuffer(id) {
    id = normId(id);
    if (autoBuffer[id]) {
      if (autoBuffer[id].timeoutId) clearTimeout(autoBuffer[id].timeoutId);
      delete autoBuffer[id];
      saveState();
    }
  }

  // --- /summary helpers
  async function fetchTicketIdsForTable(base, tableIdNorm) {
    try {
      const res = await fetch(`${base}/summary`, { cache: 'no-store' });
      const data = await res.json();
      return (data.tickets || [])
        .filter((t) => normId(t.table) === tableIdNorm)
        .map((t) => t.id)
        .filter((id) => id !== undefined && id !== null)
        .map(String);
    } catch {
      return [];
    }
  }

  // --- Close flow
  async function closeTableAndIgnoreCurrentTickets(tableId) {
    const base = getApiBase();
    const id = normId(tableId);
    window.lastKnownStatus[id] = 'Vide';
    delete localTableStatus[id];
    cancelAutoBuffer(id);

    const ids = base ? await fetchTicketIdsForTable(base, id) : [];
    if (!tableMemory[id]) tableMemory[id] = { isClosed: true, ignoreIds: new Set() };
    tableMemory[id].isClosed = true;
    ids.forEach((tid) => tableMemory[id].ignoreIds.add(String(tid)));

    delete payClose[id];
    saveState();
  }
  function scheduleCloseIn30s(id) {
    id = normId(id);
    const closeAt = now() + 30_000;
    if (payClose[id] && payClose[id].timeoutId) clearTimeout(payClose[id].timeoutId);
    const timeoutId = setTimeout(() => closeTableAndIgnoreCurrentTickets(id), 30_000);
    payClose[id] = { closeAt, timeoutId };
    saveState();
  }

  // --- Render tables (buttons hidden if "Vide")
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

    tables.forEach((table) => {
      const id = normId(table.id);
      if (filter !== 'TOUTES' && filter !== id) return;

      const last = table.lastTicketAt ? formatTime(table.lastTicketAt) : '--:--';
      let backendStatus = table.status || 'Vide';
      const prev = window.lastKnownStatus[id] || null;
      const forced = getLocalStatus(id);

      let finalStatus;
      if (forced) finalStatus = forced;
      else if (prev && prev !== 'Vide') {
        const prevIdx = PRIORITY.indexOf(prev);
        const backIdx = PRIORITY.indexOf(backendStatus);
        finalStatus = prevIdx > backIdx ? prev : backendStatus;
      } else finalStatus = backendStatus;

      window.lastKnownStatus[id] = finalStatus;
      if (finalStatus !== 'Commandée') cancelAutoBuffer(id);

      const showActions = finalStatus !== 'Vide';

      const card = document.createElement('div');
      card.className = 'table';
      card.setAttribute('data-table', id);
      card.innerHTML = `
        <div class="card-head">
          <span class="chip">${id}</span>
          <span class="chip">${finalStatus}</span>
          <span class="chip">Dernier : ${last}</span>
        </div>
        ${
          showActions
            ? `<div class="card-actions">
                 <button class="btn btn-primary btn-print">Imprimer maintenant</button>
                 <button class="btn btn-primary btn-paid">Paiement confirmé</button>
               </div>`
            : ``
        }
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
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
      }

      tablesContainer.appendChild(card);
    });
  }

  // --- Summary render
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
        bodyText = t.items.map((it) => {
          const qty = it.qty || it.quantity || 1;
          const name = it.label || it.name || it.title || 'article';
          return `${qty}× ${name}`;
        }).join(', ');
      } else if (Array.isArray(t.lines)) {
        bodyText = t.lines.map((it) => {
          const qty = it.qty || it.quantity || 1;
          const name = it.label || it.name || it.title || 'article';
          return `${qty}× ${name}`;
        }).join(', ');
      }

      const item = document.createElement('div');
      item.className = 'summaryItem';
      item.innerHTML = `
        <div class="head">
          <span class="chip">${t.table}</span>
          <span class="chip"><i class="icon-clock"></i> ${t.time}</span>
          <span class="chip">Total : ${t.total} €</span>
        </div>
        <div class="body">${bodyText || ''}</div>
      `;
      summaryContainer.appendChild(item);
    });
  }

  // --- Refresh logic (+ chime trigger)
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
      const tables = data.tables || [];

      let summaryByTable = {};
      try {
        const resSum = await fetch(`${base}/summary`, { cache: 'no-store' });
        const dataSum = await resSum.json();
        const tickets = dataSum.tickets || [];
        tickets.forEach((t) => {
          const tid = normId(t.table);
          if (!tid) return;
          const idStr = t.id !== undefined && t.id !== null ? String(t.id) : null;
          if (!summaryByTable[tid]) summaryByTable[tid] = [];
          if (idStr) summaryByTable[tid].push(idStr);
        });
      } catch {}

      const hasNewById = {};
      Object.keys(summaryByTable).forEach((tid) => {
        const mem = (tableMemory[tid] = tableMemory[tid] || { isClosed: false, ignoreIds: new Set() });
        const list = summaryByTable[tid] || [];

        const seen = (alertedTickets[tid] = alertedTickets[tid] || new Set());
        const fresh = list.filter((tk) => !mem.ignoreIds.has(tk) && !seen.has(tk));
        hasNewById[tid] = list.some((tk) => !mem.ignoreIds.has(tk));

        if (fresh.length > 0) {
          chime.playRobust();               // <<<< robust chime (dual path + retries)
          fresh.forEach((tk) => seen.add(tk));
        }
        if (mem.isClosed && hasNewById[tid]) mem.isClosed = false;
      });

      const enriched = tables.map((tb) => {
        const idNorm = normId(tb.id);
        if (!idNorm) return tb;
        const mem = (tableMemory[idNorm] = tableMemory[idNorm] || { isClosed: false, ignoreIds: new Set() });

        if (mem.isClosed) return { ...tb, id: idNorm, status: 'Vide' };
        if ((!tb.status || tb.status === 'Vide') && hasNewById[idNorm]) {
          return { ...tb, id: idNorm, status: 'Commandée' };
        }
        return { ...tb, id: idNorm };
      });

      enriched.forEach((t) => {
        const id = normId(t.id);
        if (t.status === 'Commandée') {
          if (!autoBuffer[id]) startAutoBuffer(id);
        } else {
          cancelAutoBuffer(id);
        }
      });

      saveState();
      renderTables(enriched);
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
    if (window.showTableDetail) window.showTableDetail(tableId);
  }

  function rearmTimersAfterLoad() {
    Object.entries(autoBuffer).forEach(([tid, v]) => {
      const remaining = v.until - now();
      if (remaining <= 0) autoPrintAndPrep(tid);
      else v.timeoutId = setTimeout(() => autoPrintAndPrep(tid), remaining);
    });
    Object.entries(payClose).forEach(([tid, v]) => {
      const remaining = v.closeAt - now();
      if (remaining <= 0) closeTableAndIgnoreCurrentTickets(tid);
      else v.timeoutId = setTimeout(() => closeTableAndIgnoreCurrentTickets(tid), remaining);
    });
  }

  // Init
  const saved = localStorage.getItem('staff-api');
  if (saved && apiInput) apiInput.value = saved;

  loadState();
  rearmTimersAfterLoad();
  chime.startAutoUnlock();       // keep trying to enable audio as soon as possible

  refreshTables();
  refreshSummary();
  setInterval(() => {
    refreshTables();
    refreshSummary();
  }, REFRESH_MS);
});
