// app.js — Staff (synchronisé, logique statuts côté backend uniquement)

document.addEventListener('DOMContentLoaded', () => {
  // Sélecteurs
  const apiInput = document.querySelector('#apiUrl');
  const staffTokenInput = document.querySelector('#staffApiToken');
  const btnSaveApi = document.querySelector('#btnSaveApi');
  const btnRefreshTables = document.querySelector('#btnRefreshTables');
  const btnRefreshSummary = document.querySelector('#btnRefreshSummary');
  const btnToggleSummary = document.querySelector('#btnToggleSummary');
  const supportTrigger = document.querySelector('#supportTrigger');
  const supportPanel = document.querySelector('#supportPanel');
  const supportBackdrop = document.querySelector('#supportBackdrop');
  const btnCloseSupport = document.querySelector('#btnCloseSupport');

  const tablesContainer = document.querySelector('#tables');
  const tablesEmpty = document.querySelector('#tablesEmpty');
  const filterSelect = document.querySelector('#filterTables');

  const summaryContainer = document.querySelector('#summary');
  const summaryEmpty = document.querySelector('#summaryEmpty');
  const summarySection = document.querySelector('#summarySection');
  const summaryBody = document.querySelector('#summaryBody');

  const btnHealth = document.querySelector('#btnHealth');

  const SSE_FALLBACK_REFRESH_MS = 60000;
  const LS_KEY_API = 'staff-api';
  const LS_KEY_TOKEN = 'staff-api-token';
  let latestTablesById = {};
  window.__latestSummaryData = window.__latestSummaryData || { items: [], totals: {} };
  const refreshLocks = {
    tables: null,
    summary: null,
  };
  let lastHeavyRefreshAt = 0;
  let staffEventSource = null;
  let staffSseReconnectTimer = null;
  let staffSseConnected = false;
  let lastStaffRealtimeRefreshAt = 0;

  function coalesceRefresh(key, factory) {
    if (refreshLocks[key]) return refreshLocks[key];
    refreshLocks[key] = Promise.resolve().then(factory).finally(() => {
      refreshLocks[key] = null;
    });
    return refreshLocks[key];
  }

  function refreshHeavyPanels() {
    return Promise.resolve(refreshSummary());
  }

  async function refreshStaffSnapshot() {
    await Promise.all([refreshTables(), refreshSummary()]);
  }

  function scheduleStaffRealtimeRefresh(reason = 'changed') {
    const nowTs = Date.now();
    if (nowTs - lastStaffRealtimeRefreshAt < 800) return;
    lastStaffRealtimeRefreshAt = nowTs;
    refreshStaffSnapshot().catch((err) => console.error('Erreur refresh temps réel staff', reason, err));
  }

  function disconnectStaffSse() {
    if (staffEventSource) {
      try { staffEventSource.close(); } catch {}
      staffEventSource = null;
    }
    staffSseConnected = false;
    if (staffSseReconnectTimer) {
      clearTimeout(staffSseReconnectTimer);
      staffSseReconnectTimer = null;
    }
  }

  function connectStaffSse() {
    const base = getApiBase();
    if (!base || typeof window.EventSource !== 'function') return;

    disconnectStaffSse();

    const url = buildStaffSseUrl('/events/stream');
    if (!url) return;
    const es = new EventSource(url);
    staffEventSource = es;

    es.addEventListener('connected', () => {
      staffSseConnected = true;
    });

    es.addEventListener('table_updated', () => {
      scheduleStaffRealtimeRefresh('table_updated');
    });

    es.addEventListener('summary_updated', () => {
      scheduleStaffRealtimeRefresh('summary_updated');
    });

    es.addEventListener('ping', () => {
      staffSseConnected = true;
    });

    es.onerror = () => {
      if (staffEventSource !== es) return;
      disconnectStaffSse();
      staffSseReconnectTimer = setTimeout(async () => {
        try {
          await refreshStaffSnapshot();
        } catch (err) {
          console.error('Erreur resync snapshot SSE', err);
        }
        connectStaffSse();
      }, 3000);
    };
  }

  // --- Utils

  const normId = (id) => (id || '').toString().trim().toUpperCase();
  const now = () => Date.now();
  const todayKey = () => new Date().toISOString().slice(0, 10);

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

  function playStaffBeep() {
    try {
      if (!staffAudioCtx) {
        ensureStaffAudioCtxUnlocked();
      }
      if (!staffAudioCtx) return;

      const ctx = staffAudioCtx;
      const now = ctx.currentTime;

      // 3 notes marquantes : do (261.63 Hz), ré (293.66 Hz), mi (329.63 Hz)
      const notes = [
        { freq: 261.63, start: 0.0, dur: 0.12 }, // do
        { freq: 293.66, start: 0.13, dur: 0.12 }, // ré
        { freq: 329.63, start: 0.26, dur: 0.14 }, // mi
      ];

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.value = note.freq;

        const t0 = now + note.start;
        const t1 = t0 + note.dur;

        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t0);
        osc.stop(t1 + 0.02);
      });
    } catch (e) {
      console.warn('[staff-beep] Erreur lors du beep', e);
    }
  }

function detectTablesChangesAndBeep(tables) {
    if (!Array.isArray(tables)) return;

    let shouldBeep = false;
    const nextSnapshot = {};

    tables
      .slice()
      .sort((a,b)=> statusPrio(a.status || 'Vide') - statusPrio(b.status || 'Vide'))
      .forEach((tb) => {
      const id = normId(tb.id);
      if (!id) return;

      const status = (tb.status || 'Vide').toString().trim();
      const lastAt =
        tb.lastTicket && tb.lastTicket.at
          ? String(tb.lastTicket.at)
          : null;

      nextSnapshot[id] = { status, lastAt };

      const prev = prevTablesSnapshot[id];
      if (!prev) {
        // Table qui devient active alors qu'on n'avait pas d'historique
        if (status !== 'Vide' && lastAt) {
          shouldBeep = true;
        }
        return;
      }

      // Nouveau ticket pour cette table
      if (prev.lastAt !== lastAt && lastAt) {
        shouldBeep = true;
        return;
      }

      // Table qui passe de "Vide" à un autre statut
      if (prev.status === 'Vide' && status !== 'Vide') {
        shouldBeep = true;
        return;
      }
    });

    prevTablesSnapshot = nextSnapshot;
    window.__prevTablesSnapshot = prevTablesSnapshot;

    if (shouldBeep) {
      playStaffBeep();
    }
  }

  function getApiBase() {
    const raw = apiInput ? apiInput.value.trim() : '';
    if (raw) return raw.replace(/\/+$/, '');
    try {
      const stored = localStorage.getItem(LS_KEY_API)
        || localStorage.getItem('orders_api_url_v11')
        || localStorage.getItem('api_url')
        || localStorage.getItem('API_URL')
        || '';
      return stored.trim().replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  function getStaffToken() {
    const raw = staffTokenInput ? staffTokenInput.value.trim() : '';
    if (raw) return raw;
    try {
      return String(localStorage.getItem(LS_KEY_TOKEN) || '').trim();
    } catch {
      return '';
    }
  }

  function buildStaffHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    const token = getStaffToken();
    if (token) headers['x-staff-token'] = token;
    return headers;
  }

  async function staffFetch(path, options = {}) {
    const base = getApiBase();
    if (!base) throw new Error('API non configurée');
    const finalOptions = { ...options };
    finalOptions.headers = buildStaffHeaders(options.headers || {});
    return fetch(`${base}${path}`, finalOptions);
  }

  function extractApiErrorMessage(payload, fallback = 'Erreur API') {
    if (!payload || typeof payload !== 'object') return fallback;
    return payload.message || payload.error || payload.code || fallback;
  }

  async function parseApiResponse(res, fallbackMessage = 'Erreur API') {
    let payload = null;
    try {
      payload = await res.json();
    } catch (_err) {
      payload = null;
    }

    if (!res.ok) {
      throw new Error(extractApiErrorMessage(payload, `${fallbackMessage} (HTTP ${res.status})`));
    }

    if (payload && typeof payload === 'object' && payload.ok === false) {
      throw new Error(extractApiErrorMessage(payload, fallbackMessage));
    }

    return payload || {};
  }

  function buildStaffSseUrl(path) {
    const base = getApiBase();
    if (!base) return '';
    const url = new URL(`${base}${path}`);
    const token = getStaffToken();
    if (token) url.searchParams.set('staff_token', token);
    return url.toString();
  }

  window.__staffApi = {
    getApiBase,
    getStaffToken,
    buildStaffHeaders,
    staffFetch,
    buildStaffSseUrl,
  };

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
      const apiValue = localStorage.getItem(LS_KEY_API);
      const tokenValue = localStorage.getItem(LS_KEY_TOKEN);
      if (apiValue && apiInput) apiInput.value = apiValue;
      if (tokenValue && staffTokenInput) staffTokenInput.value = tokenValue;
    } catch {}
  }

  function saveApiToStorage() {
    const apiValue = apiInput ? apiInput.value.trim() : '';
    const tokenValue = staffTokenInput ? staffTokenInput.value.trim() : '';
    try {
      if (apiValue) {
        localStorage.setItem(LS_KEY_API, apiValue);
        localStorage.setItem('API_URL', apiValue);
      }
      if (tokenValue) localStorage.setItem(LS_KEY_TOKEN, tokenValue);
      else localStorage.removeItem(LS_KEY_TOKEN);
    } catch {}
  }

  function openSupportPanel() {
    if (!supportPanel) return;
    loadApiFromStorage();
    supportPanel.hidden = false;
    document.body.classList.add('support-open');
  }

  function closeSupportPanel() {
    if (!supportPanel) return;
    supportPanel.hidden = true;
    document.body.classList.remove('support-open');
  }

  // --- Compteurs de paiement côté tableau de gauche
  // { [tableId]: { until, timeoutId, intervalId } }
  const leftPayTimers = (window.leftPayTimers = window.leftPayTimers || {});

  // --- Compteurs d'impression côté tableau de gauche
  // { [tableId]: { until, timeoutId, intervalId } }
  const leftPrintTimers = (window.leftPrintTimers = window.leftPrintTimers || {});

  
  // === UI Status (couleurs / pulse / sons) ===
  const STATUS_UI = {
    'Vide': { key:'vide', prio: 60 },
    'En cours': { key:'en_cours', prio: 40 },
    'Commandée': { key:'commandee', prio: 10 },
    'Nouvelle commande': { key:'nouvelle_commande', prio: 0 },
    'En préparation': { key:'en_preparation', prio: 15 },
    'À encoder en caisse': { key:'a_encoder_caisse', prio: 20 },
    'Encodage caisse confirmé': { key:'encodage_caisse_confirme', prio: 50 },
    'Encodée en caisse': { key:'encodage_caisse_confirme', prio: 55 },
    'Clôture avec anomalie': { key:'cloture_anomalie', prio: 52 },
    'Anomalie pas encodé': { key:'cloture_anomalie', prio: 56 },
    'Clôturée': { key:'cloturee', prio: 55 },
  };

  const SOUND_COOLDOWN_MS = 6000; // anti-spam global
  const soundGate = { lastAt: 0 };
  const lastStatusByTable = {};   // per table transition tracking
  const pulseTimers = {};         // per table pulse stop timeout

  function statusKey(label){
    return (STATUS_UI[label] && STATUS_UI[label].key) ? STATUS_UI[label].key : 'vide';
  }
  function statusPrio(label){
    return (STATUS_UI[label] && typeof STATUS_UI[label].prio === 'number') ? STATUS_UI[label].prio : 999;
  }

  function statusClassName(label){
    return `status-${statusKey(label)}`;
  }

  function buildStatusBadge(label){
    const badge = document.createElement('span');
    badge.className = `chip ${statusClassName(label)}`;
    badge.textContent = displayStatusLabel(label);
    return badge;
  }

  function actionLabelForStatus(label){
    switch(label){
      case 'Commandée': return 'Imprime le ticket !';
      case 'Nouvelle commande': return 'Imprime le ticket !';
      case 'À encoder en caisse': return 'Encode dans la caisse !';
      default: return '';
    }
  }

  function displayStatusLabel(label){
    switch(label){
      case 'Nouvelle commande': return 'Commande additionnel';
      case 'À encoder en caisse': return 'En attente caisse';
      default: return label || 'Vide';
    }
  }

  function leftCardPriority(label){
    switch(label){
      case 'Commandée': return 10;
      case 'Nouvelle commande': return 10;
      case 'En préparation': return 30;
      case 'À encoder en caisse': return 40;
      case 'Vide': return 90;
      default: return 80;
    }
  }

  function leftCardBg(label){
    switch(label){
      case 'Commandée':
      case 'Nouvelle commande':
        return 'rgba(251,191,36,0.22)';
      case 'En préparation':
        return 'rgba(59,130,246,0.16)';
      case 'À encoder en caisse':
        return 'rgba(139,92,246,0.18)';
      case 'Vide':
        return 'rgba(148,163,184,0.04)';
      default:
        return 'rgba(15,23,42,0.6)';
    }
  }

  function buildActionBadge(label){
    const action = actionLabelForStatus(label);
    if (!action) return null;
    const badge = document.createElement('span');
    const isCashAction = label === 'À encoder en caisse';
    badge.className = `chip chip-action ${isCashAction ? 'chip-action--cash' : 'chip-action--danger'}`;
    badge.textContent = action;
    return badge;
  }

  function playToneSequence(freqs, durationMs=130){
    try{
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      let t = ctx.currentTime;
      freqs.forEach((f)=>{
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.value = 0.14;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + (durationMs/1000));
        t += (durationMs/1000);
      });
    }catch(e){
      // audio can fail on some devices if not user-initiated; ignore safely
    }
  }

  function maybePlayStatusSound(tableId, newStatusLabel){
    const now = Date.now();
    if (now - soundGate.lastAt < SOUND_COOLDOWN_MS) return;

    // Only these two statuses
    if (newStatusLabel === 'Commandée'){
      soundGate.lastAt = now;
      playToneSequence([523, 659, 784]); // 3 notes (C5 E5 G5)
    } else if (newStatusLabel === 'Nouvelle commande'){
      soundGate.lastAt = now;
      playToneSequence([784, 659, 523, 988]); // 4 notes (G5 E5 C5 B5-ish)
    }
  }

  function applyStatusClasses(cardEl, chipStatusEl, statusLabel){
    const key = statusKey(statusLabel);
    const cls = `status-${key}`;

    // Card status classes
    cardEl.classList.remove(
      'status-vide','status-en_cours','status-commandee','status-en_preparation','status-nouvelle_commande','status-a_encoder_caisse','status-encodage_caisse_confirme','status-cloturee','status-cloture_anomalie'
    );
    cardEl.classList.add(cls);

    // Chip status classes
    if (chipStatusEl){
      chipStatusEl.classList.remove(
        'status-vide','status-en_cours','status-commandee','status-en_preparation','status-nouvelle_commande','status-a_encoder_caisse','status-encodage_caisse_confirme','status-cloturee','status-cloture_anomalie'
      );
      chipStatusEl.classList.add(cls);
    }
  }

  function startPulseForAttentionStatus(cardEl, tableId){
    // pulse for max 60s then keep red but stop animation (fatigue visuelle)
    cardEl.classList.add('pulse');
    if (pulseTimers[tableId]) clearTimeout(pulseTimers[tableId]);
    pulseTimers[tableId] = setTimeout(()=>{
      cardEl.classList.remove('pulse');
      delete pulseTimers[tableId];
    }, 60000);
  }

// --- Résumé du jour

  function renderSummary(summaryData) {
    if (!summaryContainer) return;
    summaryContainer.innerHTML = '';

    const totals = summaryData?.totals || {};
    const items = Array.isArray(summaryData?.items) ? summaryData.items : Array.isArray(summaryData?.tickets) ? summaryData.tickets : [];

    if (!items.length) {
      if (summaryEmpty) summaryEmpty.style.display = 'block';
      return;
    }
    if (summaryEmpty) summaryEmpty.style.display = 'none';

    items.forEach((t) => {
      const tableId = normId(t.table);
      const currentStatus = t.displayStatus || t.status || 'Vide';
      const currentTotal = typeof t.total === 'number' ? t.total : null;

      const wrapper = document.createElement('button');
      wrapper.type = 'button';
      wrapper.className = 'summaryItem summaryItem--clickable';
      wrapper.setAttribute('data-table', tableId);
      wrapper.setAttribute('aria-label', `Voir le détail de la table ${tableId}`);

      const head = document.createElement('div');
      head.className = 'head summaryHeadTop';

      const chipTable = document.createElement('span');
      chipTable.className = 'chip';
      chipTable.textContent = t.tableLabel || tableId || t.table || 'Table';
      head.appendChild(chipTable);

      head.appendChild(buildStatusBadge(currentStatus));
      wrapper.appendChild(head);

      const secondaryRow = document.createElement('div');
      secondaryRow.className = 'head summaryHeadBottom';

      if (t.openTime) {
        const chipOpen = document.createElement('span');
        chipOpen.className = 'chip';
        chipOpen.textContent = `Ouverte : ${t.openTime}`;
        secondaryRow.appendChild(chipOpen);
      }

      if (t.closedTime) {
        const chipClosed = document.createElement('span');
        chipClosed.className = 'chip';
        chipClosed.textContent = `Clôturée : ${t.closedTime}`;
        secondaryRow.appendChild(chipClosed);
      }

      if (typeof currentTotal === 'number') {
        const chipTotal = document.createElement('span');
        chipTotal.className = 'chip chip-total';
        chipTotal.textContent = `Total : ${currentTotal.toFixed(2)} €`;
        secondaryRow.appendChild(chipTotal);
      }

      if (secondaryRow.childElementCount > 0) {
        wrapper.appendChild(secondaryRow);
      }

      const meta = document.createElement('div');
      meta.className = 'summaryMeta';
      meta.textContent = `${t.ordersCount || 0} ticket${(t.ordersCount || 0) > 1 ? 's' : ''} • Durée : ${Math.round(Number(t.durationSeconds || 0) / 60)} min`;
      wrapper.appendChild(meta);

      wrapper.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.showTableDetail) {
          window.showTableDetail(tableId, currentStatus, { summaryEntry: t, historyMode: true });
        }
      });

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
    const normalizedTables = tables
      .filter((tb) => {
        const id = normId(tb.id);
        if (!id) return false;
        if (filterValue !== 'TOUTES' && filterValue !== id) return false;
        return true;
      })
      .slice()
      .sort((a, b) => {
        const pa = leftCardPriority(a.status || 'Vide');
        const pb = leftCardPriority(b.status || 'Vide');
        if (pa !== pb) return pa - pb;
        const ta = new Date(a?.lastTicket?.at || a?.lastTicketAt || 0).getTime() || 0;
        const tbv = new Date(b?.lastTicket?.at || b?.lastTicketAt || 0).getTime() || 0;
        if (ta !== tbv) return ta - tbv;
        return normId(a.id).localeCompare(normId(b.id), 'fr', { numeric: true });
      });

    if (!normalizedTables.length) {
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }

    const activeTables = normalizedTables.filter((tb) => (tb.status || 'Vide') !== 'Vide');
    const emptyTables = normalizedTables.filter((tb) => (tb.status || 'Vide') === 'Vide');

    const activeGrid = document.createElement('div');
    activeGrid.className = 'tables-grid tables-grid--active';
    const emptySection = document.createElement('div');
    emptySection.className = 'tables-empty-section';
    const emptyTitle = document.createElement('div');
    emptyTitle.className = 'tables-subtitle';
    emptyTitle.textContent = 'Tables vides';
    const emptyGrid = document.createElement('div');
    emptyGrid.className = 'tables-grid tables-grid--empty';

    function appendTableCard(tb, targetGrid) {
      const id = normId(tb.id);
      const status = tb.status || 'Vide';
      const displayStatus = displayStatusLabel(status);
      const ticketTimeSource = status === 'En préparation'
        ? (tb?.lastTicket?.printedAt || tb?.lastTicket?.at || tb?.lastTicketAt || null)
        : status === 'À encoder en caisse'
          ? (tb?.sessionStartAt || tb?.lastTicket?.at || tb?.lastTicketAt || null)
          : (tb?.lastTicket?.at || tb?.lastTicketAt || null);
      const hasLastTicket = !!ticketTimeSource;
      const lastTime = hasLastTicket ? formatTime(ticketTimeSource) : '—';

      const card = document.createElement('div');
      card.className = 'table';
      card.setAttribute('data-table', id);
      card.style.background = leftCardBg(status);
      if (status === 'Vide') card.classList.add('table--empty');

      const head = document.createElement('div');
      head.className = 'card-head';

      const chipId = document.createElement('span');
      chipId.className = 'chip chip-id';
      chipId.textContent = id;
      head.appendChild(chipId);

      const chipStatus = document.createElement('span');
      chipStatus.className = 'chip chip-status';
      chipStatus.textContent = displayStatus;
      head.appendChild(chipStatus);
      card.appendChild(head);

      applyStatusClasses(card, chipStatus, status);
      if (status === 'Nouvelle commande' || status === 'Commandée') startPulseForAttentionStatus(card, id);

      const prev = lastStatusByTable[id];
      if (prev !== status) {
        maybePlayStatusSound(id, status);
        lastStatusByTable[id] = status;
      }

      const body = document.createElement('div');
      body.className = 'card-body';

      const actionBadge = buildActionBadge(status);
      if (actionBadge) body.appendChild(actionBadge);

      const timeRow = document.createElement('div');
      timeRow.className = 'card-time-row';
      const chipTime = document.createElement('span');
      chipTime.className = 'chip chip-time';
      if (status === 'En préparation') {
        chipTime.textContent = hasLastTicket ? `En cuisine… ${lastTime}` : 'En cuisine…';
      } else {
        chipTime.textContent = hasLastTicket ? `🕒 ${lastTime}` : '—';
      }
      timeRow.appendChild(chipTime);
      body.appendChild(timeRow);
      card.appendChild(body);

      if (status !== 'Vide') {
        const actions = document.createElement('div');
        actions.className = 'card-actions';
        actions.style.display = 'none';

        const btnPrint = document.createElement('button');
        btnPrint.className = 'btn btn-primary btn-print';
        btnPrint.textContent = 'Imprimer maintenant';

        const btnPaid = document.createElement('button');
        btnPaid.className = 'btn btn-primary btn-paid';

        const isPaid = status === 'Encodage caisse confirmé';
        const payTimer = leftPayTimers[id];
        const printTimer = leftPrintTimers[id];

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

        if (payTimer) {
          btnPaid.style.backgroundColor = '#f97316';
          const updateLabel = () => {
            const remain = payTimer.until - now();
            if (remain <= 0) {
              btnPaid.textContent = 'Paiement confirmé';
              return;
            }
            const sec = Math.max(1, Math.ceil(remain / 1000));
            btnPaid.textContent = `Annuler (${sec}s)`;
          };
          updateLabel();
          const localInterval = setInterval(() => {
            if (!document.body.contains(btnPaid)) {
              clearInterval(localInterval);
              return;
            }
            const currentTimer = leftPayTimers[id];
            if (!currentTimer) {
              clearInterval(localInterval);
              btnPaid.textContent = isPaid ? 'Annuler' : 'Paiement confirmé';
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
            btnPaid.textContent = `Annuler (${sec}s)`;
          }, 250);
        } else if (isPaid) {
          btnPaid.textContent = 'Annuler';
          btnPaid.style.backgroundColor = '#f97316';
        } else {
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
          if (leftPrintTimers[id]) return;
          const until = now() + 5000;
          const timer = { until, timeoutId: null, intervalId: null };
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
            if (current === timer) delete leftPrintTimers[id];
            clearInterval(timer.intervalId);
            btnPrint.textContent = 'Imprimer maintenant';
            btnPrint.style.backgroundColor = '';
          }, 5000);
          try {
            await staffFetch('/print', {
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

        btnPaid.addEventListener('click', async (e) => {
          e.stopPropagation();
          const base = getApiBase();
          if (!base) return;
          const currentTimer = leftPayTimers[id];
          if (isPaid || currentTimer) {
            if (currentTimer) {
              clearTimeout(currentTimer.timeoutId);
              clearInterval(currentTimer.intervalId);
              delete leftPayTimers[id];
            }
            try {
              await staffFetch('/cancel-confirm', {
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
          try {
            const confirmResp = await staffFetch('/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: id }),
            });
            await parseApiResponse(confirmResp, "Impossible de confirmer l'encodage caisse");
          } catch (err) {
            console.error('Erreur /confirm', err);
            alert(`Impossible de confirmer l'encodage caisse : ${err.message || err}`);
            await refreshTables();
            if (window.__currentDetailTableId === id && window.showTableDetail) {
              window.showTableDetail(id);
            }
            return;
          }
          const until = now() + 5000;
          const countdown = { until, timeoutId: null, intervalId: null };
          leftPayTimers[id] = countdown;
          btnPaid.style.backgroundColor = '#f97316';
          const updateLabel = () => {
            const remain = countdown.until - now();
            if (remain <= 0) {
              btnPaid.textContent = 'Paiement confirmé';
            } else {
              const sec = Math.max(1, Math.ceil(remain / 1000));
              btnPaid.textContent = `Annuler (${sec}s)`;
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
              btnPaid.textContent = `Annuler (${sec}s)`;
            }
          }, 250);
          countdown.timeoutId = setTimeout(async () => {
            if (leftPayTimers[id] !== countdown) return;
            delete leftPayTimers[id];
            try {
              const closeResp = await staffFetch('/close-table', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: id, closureType: 'normal' }),
              });
              const closeJson = await closeResp.json().catch(() => ({}));
              if (!closeResp.ok || closeJson?.ok === false) {
                throw new Error(closeJson?.error || `http_${closeResp.status}`);
              }
            } catch (err) {
              console.error('Erreur /close-table', err);
              alert(`Impossible de clôturer la table : ${err.message || err}`);
            } finally {
              await refreshTables();
              if (window.__currentDetailTableId === id && window.showTableDetail) {
                window.showTableDetail(id);
              }
            }
          }, 5000);
        });
      }

      card.addEventListener('click', async (e) => {
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
        const freshMap = window.__latestTablesById || {};
        const freshTable = freshMap[id] || null;
        const freshStatus = (freshTable && freshTable.status) ? freshTable.status : status;
        if (window.showTableDetail) {
          window.showTableDetail(id, freshStatus);
        }
      });

      targetGrid.appendChild(card);
    }

    activeTables.forEach((tb) => appendTableCard(tb, activeGrid));
    emptyTables.forEach((tb) => appendTableCard(tb, emptyGrid));

    if (activeTables.length) tablesContainer.appendChild(activeGrid);
    if (emptyTables.length) {
      emptySection.appendChild(emptyTitle);
      emptySection.appendChild(emptyGrid);
      tablesContainer.appendChild(emptySection);
    }
  }

  // --- Appels API

  async function fetchSummary() {
    const base = getApiBase();
    if (!base) return { items: [], totals: {} };
    const res = await staffFetch('/summary', { cache: 'no-store' });
    const data = await parseApiResponse(res, 'Impossible de charger le résumé');
    return data || { items: [], totals: {} };
  }

  async function fetchTables() {
    const base = getApiBase();
    if (!base) return { tables: [] };
    const res = await staffFetch('/tables', { cache: 'no-store' });
    const data = await parseApiResponse(res, 'Impossible de charger les tables');
    return data || { tables: [] };
  }

  async function refreshTables() {
    return coalesceRefresh('tables', async () => {
    const base = getApiBase();
    if (!base) {
      if (tablesContainer) tablesContainer.innerHTML = '';
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }
    try {
      const tablesData = await fetchTables();
      const tables = tablesData.tables || [];
      latestTablesById = tables.reduce((acc, tb) => {
        const id = normId(tb.id);
        if (id) acc[id] = tb;
        return acc;
      }, {});
      window.__latestTablesById = latestTablesById;
      detectTablesChangesAndBeep(tables);
      renderTables(tables);
    } catch (err) {
      console.error('Erreur refreshTables', err);
      if (tablesContainer) tablesContainer.innerHTML = '';
      if (tablesEmpty) tablesEmpty.style.display = 'block';
    }
  
    });
  }
  function updateSummaryVisibility(isOpen) {
    if (!summarySection || !summaryBody || !btnToggleSummary) return;
    summarySection.classList.toggle('collapsed', !isOpen);
    summaryBody.hidden = !isOpen;
    btnToggleSummary.textContent = isOpen ? 'Masquer' : 'Afficher';
  }

  async function refreshSummary() {
    return coalesceRefresh('summary', async () => {
      const base = getApiBase();
      if (!base) {
        if (summaryContainer) summaryContainer.innerHTML = '';
        if (summaryEmpty) summaryEmpty.style.display = 'block';
        return;
      }
      try {
        const summaryData = await fetchSummary();
        window.__latestSummaryData = summaryData || { items: [], totals: {} };
        renderSummary(summaryData);
      } catch (err) {
        console.error('Erreur refreshSummary', err);
        if (summaryContainer) summaryContainer.innerHTML = '';
        if (summaryEmpty) summaryEmpty.style.display = 'block';
      }
    });
  }
  window.refreshTables = refreshTables;
  window.refreshSummary = refreshSummary;

  if (supportTrigger) {
    let clickCount = 0;
    let clickTimer = null;
    supportTrigger.addEventListener('click', () => {
      clickCount += 1;
      if (clickTimer) clearTimeout(clickTimer);
      if (clickCount >= 3) {
        clickCount = 0;
        clickTimer = null;
        openSupportPanel();
        return;
      }
      clickTimer = setTimeout(() => {
        clickCount = 0;
        clickTimer = null;
      }, 900);
    });
  }

  if (supportBackdrop) {
    supportBackdrop.addEventListener('click', closeSupportPanel);
  }

  if (btnCloseSupport) {
    btnCloseSupport.addEventListener('click', closeSupportPanel);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && supportPanel && !supportPanel.hidden) {
      closeSupportPanel();
    }
  });

  if (btnSaveApi) {
    btnSaveApi.addEventListener('click', () => {
      saveApiToStorage();
      refreshTables();
      refreshSummary();
      connectStaffSse();
      closeSupportPanel();
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

  if (btnToggleSummary) {
    updateSummaryVisibility(false);
    btnToggleSummary.addEventListener('click', () => {
      const isCollapsed = summarySection ? summarySection.classList.contains('collapsed') : true;
      updateSummaryVisibility(isCollapsed);
    });
  }

  if (btnHealth) {
    btnHealth.addEventListener('click', async () => {
      const base = getApiBase();
      if (!base) return;
      try {
        const res = await fetch(`${base}/health`, { cache: 'no-store' });
        const data = await parseApiResponse(res, 'Healthcheck indisponible');
        alert(`Health OK: ${JSON.stringify(data)}`);
      } catch (err) {
        alert(`Health KO: ${err.message || err}`);
      }
    });
  }

  loadApiFromStorage();
  refreshStaffSnapshot();
  connectStaffSse();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshStaffSnapshot();
      if (!staffSseConnected) connectStaffSse();
    }
  });

  window.addEventListener('beforeunload', () => {
    disconnectStaffSse();
  });

  setInterval(() => {
    refreshStaffSnapshot();
    if (!staffSseConnected) connectStaffSse();
  }, SSE_FALLBACK_REFRESH_MS);
});
