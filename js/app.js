// app.js — Staff (synchronisé, logique statuts côté backend uniquement)

document.addEventListener('DOMContentLoaded', () => {
  // Sélecteurs
  const apiInput = document.querySelector('#apiUrl');
  const btnSaveApi = document.querySelector('#btnSaveApi');
  const btnRefreshTables = document.querySelector('#btnRefreshTables');
  const btnRefreshSummary = document.querySelector('#btnRefreshSummary');
  const btnToggleSummary = document.querySelector('#btnToggleSummary');

  const tablesContainer = document.querySelector('#tables');
  const tablesEmpty = document.querySelector('#tablesEmpty');
  const filterSelect = document.querySelector('#filterTables');

  const summaryContainer = document.querySelector('#summary');
  const summaryEmpty = document.querySelector('#summaryEmpty');
  const summarySection = document.querySelector('#summarySection');
  const summaryBody = document.querySelector('#summaryBody');

  const historyList = document.querySelector('#historyList');
  const historyEmpty = document.querySelector('#historyEmpty');
  const historyDateInput = document.querySelector('#historyDate');
  const historyTableFilter = document.querySelector('#historyTableFilter');
  const historyTypeFilter = document.querySelector('#historyTypeFilter');
  const btnRefreshHistory = document.querySelector('#btnRefreshHistory');

  const managerKpis = document.querySelector('#managerKpis');
  const managerByTable = document.querySelector('#managerByTable');
  const managerByHour = document.querySelector('#managerByHour');
  const managerRecentSessions = document.querySelector('#managerRecentSessions');
  const managerEmpty = document.querySelector('#managerEmpty');
  const managerStartDateInput = document.querySelector('#managerStartDate');
  const managerEndDateInput = document.querySelector('#managerEndDate');
  const managerTableFilter = document.querySelector('#managerTableFilter');
  const btnRefreshManager = document.querySelector('#btnRefreshManager');

  const diagnosticKpis = document.querySelector('#diagnosticKpis');
  const diagnosticBreakdown = document.querySelector('#diagnosticBreakdown');
  const diagnosticErrors = document.querySelector('#diagnosticErrors');
  const diagnosticList = document.querySelector('#diagnosticList');
  const diagnosticEmpty = document.querySelector('#diagnosticEmpty');
  const diagSeverityFilter = document.querySelector('#diagSeverityFilter');
  const diagTypeFilter = document.querySelector('#diagTypeFilter');
  const diagTableFilter = document.querySelector('#diagTableFilter');
  const diagSessionFilter = document.querySelector('#diagSessionFilter');
  const diagIncludeAudit = document.querySelector('#diagIncludeAudit');
  const btnRefreshDiagnostic = document.querySelector('#btnRefreshDiagnostic');
  const btnHealth = document.querySelector('#btnHealth');

  const SSE_FALLBACK_REFRESH_MS = 60000;
  const LS_KEY_API = 'staff-api';
  let latestTablesById = {};
  window.__latestSummaryData = window.__latestSummaryData || { items: [], totals: {} };
  const refreshLocks = {
    tables: null,
    summary: null,
    history: null,
    manager: null,
    diagnostic: null,
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

    const url = `${base}/events/stream`;
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

  
  // === UI Status (couleurs / pulse / sons) ===
  const STATUS_UI = {
    'Vide': { key:'vide', prio: 90 },
    'En cours': { key:'en_preparation', prio: 30 },
    'Commandée': { key:'commandee', prio: 10 },
    'Nouvelle commande': { key:'nouvelle_commande', prio: 20 },
    'En préparation': { key:'en_preparation', prio: 30 },
    'À encoder en caisse': { key:'a_encoder_caisse', prio: 40 },
    'Encodage caisse confirmé': { key:'encodage_caisse_confirme', prio: 50 },
    'Encodée en caisse': { key:'encodage_caisse_confirme', prio: 50 },
    'Clôture avec anomalie': { key:'cloture_anomalie', prio: 55 },
    'Anomalie pas encodé': { key:'cloture_anomalie', prio: 55 },
    'Clôturée': { key:'cloturee', prio: 60 },
  };

  const SOUND_COOLDOWN_MS = 6000; // anti-spam global
  const soundGate = { lastAt: 0 };
  const lastStatusByTable = {};   // per table transition tracking
  const pulseTimers = {};         // per table pulse stop timeout

  function normalizeStatusLabel(label){
    return (label || 'Vide').toString().trim() || 'Vide';
  }

  function displayStatusLabel(label){
    const raw = normalizeStatusLabel(label);
    switch(raw){
      case 'Nouvelle commande': return 'Commande additionnel';
      case 'À encoder en caisse': return 'En attente caisse';
      case 'En cours': return 'En préparation';
      default: return raw;
    }
  }

  function actionLabelForStatus(label){
    const raw = normalizeStatusLabel(label);
    switch(raw){
      case 'Commandée':
      case 'Nouvelle commande':
        return 'Imprime le ticket !';
      case 'À encoder en caisse':
        return 'Encode dans la caisse !';
      default:
        return '';
    }
  }

  function statusKey(label){
    const raw = normalizeStatusLabel(label);
    return (STATUS_UI[raw] && STATUS_UI[raw].key) ? STATUS_UI[raw].key : 'vide';
  }
  function statusPrio(label){
    const raw = normalizeStatusLabel(label);
    return (STATUS_UI[raw] && typeof STATUS_UI[raw].prio === 'number') ? STATUS_UI[raw].prio : 999;
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

  function buildActionBadge(label){
    const action = actionLabelForStatus(label);
    if (!action) return null;
    const badge = document.createElement('span');
    badge.className = 'chip chip-action chip-action--danger';
    badge.textContent = action;
    return badge;
  }

  function getInfoTextForStatus(label, tb){
    const raw = normalizeStatusLabel(label);
    const at = tb && tb.lastTicket && tb.lastTicket.at ? formatTime(tb.lastTicket.at) : '—';
    if (raw === 'En préparation' || raw === 'En cours') return `En cuisine… ${at}`;
    return '';
  }

  function getSortTimestamp(tb){
    const candidates = [
      tb?.lastTicket?.at,
      tb?.openedAt,
      tb?.createdAt,
      tb?.updatedAt,
      tb?.sessionStartedAt,
    ];
    for (const value of candidates){
      if (!value) continue;
      const ts = new Date(value).getTime();
      if (!Number.isNaN(ts)) return ts;
    }
    return Number.MAX_SAFE_INTEGER;
  }

  function isEmptyStatus(label){
    return statusKey(label) === 'vide';
  }

  function applyStatusClasses(cardEl, chipStatusEl, statusLabel){
    const cls = statusClassName(statusLabel);
    const classes = [
      'status-vide','status-en_cours','status-commandee','status-en_preparation','status-nouvelle_commande','status-a_encoder_caisse','status-encodage_caisse_confirme','status-cloturee','status-cloture_anomalie'
    ];

    cardEl.classList.remove(...classes);
    cardEl.classList.add(cls);

    if (chipStatusEl){
      chipStatusEl.classList.remove(...classes);
      chipStatusEl.classList.add(cls);
    }
  }

  function startPulseForNewOrder(cardEl, tableId){
    // pulse for max 60s then keep red but stop animation (fatigue visuelle)
    cardEl.classList.add('pulse');
    if (pulseTimers[tableId]) clearTimeout(pulseTimers[tableId]);
    pulseTimers[tableId] = setTimeout(()=>{
      cardEl.classList.remove('pulse');
      delete pulseTimers[tableId];
    }, 60000);
  }

// --- Résumé du jour

  function renderKpiGrid(container, cards = []) {
    if (!container) return;
    container.innerHTML = '';
    cards.forEach((card) => {
      const el = document.createElement('div');
      el.className = 'kpiCard';
      const label = document.createElement('div');
      label.className = 'kpiLabel';
      label.textContent = card.label;
      const value = document.createElement('div');
      value.className = 'kpiValue';
      value.textContent = card.value;
      el.appendChild(label);
      el.appendChild(value);
      container.appendChild(el);
    });
  }

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
      head.className = 'head';

      const chipTable = document.createElement('span');
      chipTable.className = 'chip';
      chipTable.textContent = t.tableLabel || tableId || t.table || 'Table';
      head.appendChild(chipTable);

      if (t.openTime) {
        const chipOpen = document.createElement('span');
        chipOpen.className = 'chip';
        chipOpen.textContent = `Ouverte : ${t.openTime}`;
        head.appendChild(chipOpen);
      }

      if (t.closedTime) {
        const chipClosed = document.createElement('span');
        chipClosed.className = 'chip';
        chipClosed.textContent = `Clôturée : ${t.closedTime}`;
        head.appendChild(chipClosed);
      }

      if (typeof currentTotal === 'number') {
        const chipTotal = document.createElement('span');
        chipTotal.className = 'chip';
        chipTotal.textContent = `Total : ${currentTotal.toFixed(2)} €`;
        head.appendChild(chipTotal);
      }

      head.appendChild(buildStatusBadge(currentStatus));
      wrapper.appendChild(head);

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

  function renderHistory(historyData) {
    if (!historyList) return;
    historyList.innerHTML = '';
    const items = Array.isArray(historyData?.items) ? historyData.items : [];
    if (!items.length) {
      if (historyEmpty) historyEmpty.style.display = 'block';
      return;
    }
    if (historyEmpty) historyEmpty.style.display = 'none';

    items.forEach((item) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'summaryItem summaryItem--clickable';
      row.innerHTML = `
        <div class="head">
          <span class="chip">${item.tableLabel || item.table || 'Table'}</span>
          <span class="chip">Ouverte : ${item.openTime || '--:--'}</span>
          <span class="chip">Clôturée : ${item.closedTime || '—'}</span>
          <span class="chip">${Number(item.total || 0).toFixed(2)} €</span>
          <span class="chip ${statusClassName(item.displayStatus || item.status || 'Vide')}">${item.displayStatus || item.status || 'Vide'}</span>
        </div>
        <div class="summaryMeta">${item.ordersCount || 0} ticket(s) • ${item.itemsCount || 0} article(s) • durée ${Math.round(Number(item.durationSeconds || 0) / 60)} min</div>
      `;
      row.addEventListener('click', () => {
        if (window.showTableDetail) {
          window.showTableDetail(normId(item.table), item.displayStatus || item.status || 'Vide', { summaryEntry: item, historyMode: true });
        }
      });
      historyList.appendChild(row);
    });
  }

  function normalizeManagerCollection(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    const values = Object.values(value).filter(Boolean);
    const looksLikeSingleRow = ['table', 'hour', 'sessionId', 'id', 'grossTotal', 'sessionsCount'].some((key) => Object.prototype.hasOwnProperty.call(value, key));
    if (looksLikeSingleRow) return [value];
    return values;
  }

  function renderManager(managerData) {
    const totals = managerData?.totals || {};
    renderKpiGrid(managerKpis, [
      { label: 'CA période', value: `${Number(totals.grossTotal || 0).toFixed(2)} €` },
      { label: 'Sessions', value: String(totals.sessionsCount || 0) },
      { label: 'Actives', value: String(totals.activeCount || 0) },
      { label: 'Clôtures OK', value: String(totals.closedNormalCount || 0) },
      { label: 'Anomalies', value: String(totals.closedAnomalyCount || 0) },
      { label: 'Panier moyen', value: `${Number(totals.averageBasket || 0).toFixed(2)} €` },
      { label: 'Durée moyenne', value: durationMinutesLabel(totals.averageDurationSeconds || 0) },
      { label: 'Période', value: managerData?.period?.days > 1 ? `${managerData.period.days} j` : '1 j' },
    ]);

    const byTable = normalizeManagerCollection(managerData?.byTable);
    const byHour = normalizeManagerCollection(managerData?.byHour);
    const recentSessions = normalizeManagerCollection(managerData?.recentSessions);
    const hasData = Boolean((totals.sessionsCount || 0) > 0 || byTable.length || byHour.length || recentSessions.length);

    if (managerEmpty) managerEmpty.style.display = hasData ? 'none' : 'block';
    if (!hasData) {
      renderListState(managerByTable, 'Aucune table sur la période.');
      renderListState(managerByHour, 'Aucun flux horaire.');
      renderListState(managerRecentSessions, 'Aucune session récente.');
      return;
    }

    if (managerByTable) {
      managerByTable.innerHTML = '';
      byTable.slice(0, 8).forEach((row) => {
        const item = document.createElement('div');
        item.className = 'summaryItem managerRow';
        item.innerHTML = `
          <div class="head">
            <span class="chip">${row.table}</span>
            <span class="chip">${row.sessionsCount} session(s)</span>
            <span class="chip">${Number(row.grossTotal || 0).toFixed(2)} €</span>
            ${row.anomaliesCount ? `<span class="chip chip-severity chip-severity--warn">${row.anomaliesCount} anomalie(s)</span>` : ''}
          </div>
          <div class="summaryMeta">Panier moyen ${Number(row.averageBasket || 0).toFixed(2)} € • durée ${durationMinutesLabel(row.averageDurationSeconds || 0)}</div>
        `;
        managerByTable.appendChild(item);
      });
      if (!byTable.length) renderListState(managerByTable, 'Aucune table sur la période.');
    }

    if (managerByHour) {
      managerByHour.innerHTML = '';
      byHour.slice(0, 12).forEach((row) => {
        const item = document.createElement('div');
        item.className = 'summaryItem managerRow';
        item.innerHTML = `
          <div class="head">
            <span class="chip">${row.hour}h</span>
            <span class="chip">${row.sessionsCount} session(s)</span>
            <span class="chip">${Number(row.grossTotal || 0).toFixed(2)} €</span>
          </div>
          <div class="summaryMeta">${row.anomaliesCount || 0} anomalie(s) sur ce créneau</div>
        `;
        managerByHour.appendChild(item);
      });
      if (!byHour.length) renderListState(managerByHour, 'Aucun flux horaire.');
    }

    if (managerRecentSessions) {
      managerRecentSessions.innerHTML = '';
      recentSessions.forEach((item) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'summaryItem summaryItem--clickable';
        row.innerHTML = `
          <div class="head">
            <span class="chip">${item.tableLabel || item.table || 'Table'}</span>
            <span class="chip">Ouverte : ${item.openTime || '--:--'}</span>
            <span class="chip">Clôturée : ${item.closedTime || '—'}</span>
            <span class="chip">${Number(item.total || 0).toFixed(2)} €</span>
            ${buildStatusBadge(item.displayStatus || item.status || 'Vide').outerHTML}
          </div>
          <div class="summaryMeta">${item.ordersCount || 0} ticket(s) • ${item.itemsCount || 0} article(s) • durée ${durationMinutesLabel(item.durationSeconds || 0)}</div>
        `;
        row.addEventListener('click', () => {
          if (window.showTableDetail) {
            window.showTableDetail(normId(item.table), item.displayStatus || item.status || 'Vide', { summaryEntry: item, historyMode: true });
          }
        });
        managerRecentSessions.appendChild(row);
      });
      if (!recentSessions.length) renderListState(managerRecentSessions, 'Aucune session récente.');
    }
  }

  function renderDiagnostic(overviewData, eventsData) {
    renderKpiGrid(diagnosticKpis, [
      { label: 'Événements', value: String(overviewData?.totals?.total || 0) },
      { label: 'Infos', value: String(overviewData?.totals?.infoCount || 0) },
      { label: 'Warnings', value: String(overviewData?.totals?.warnCount || 0) },
      { label: 'Erreurs', value: String(overviewData?.totals?.errorCount || 0) },
    ]);

    const byCategory = overviewData?.breakdown?.byCategory || {};
    renderKpiGrid(diagnosticBreakdown, [
      { label: 'Métier', value: String(byCategory.business || 0) },
      { label: 'Technique', value: String(byCategory.technical || 0) },
      { label: 'Audit', value: String(byCategory.audit || 0) },
      { label: 'Système', value: String(byCategory.system || 0) },
    ]);

    if (diagnosticErrors) {
      diagnosticErrors.innerHTML = '';
      const errors = Array.isArray(overviewData?.recentErrors) ? overviewData.recentErrors : [];
      if (errors.length) {
        errors.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'summaryItem diagnosticItem diagnostic-error';
          row.innerHTML = `
            <div class="head">
              <span class="chip">${item.tableCode || 'GLOBAL'}</span>
              <span class="chip">${item.eventCode || 'ERROR'}</span>
              <span class="chip chip-severity chip-severity--error">ERROR</span>
            </div>
            <div class="summaryMeta">${item.message || 'Erreur'} • ${formatTime(item.createdAt)}</div>
          `;
          diagnosticErrors.appendChild(row);
        });
      }
    }

    if (!diagnosticList) return;
    diagnosticList.innerHTML = '';
    const items = Array.isArray(eventsData?.items) ? eventsData.items : [];
    if (!items.length) {
      if (diagnosticEmpty) diagnosticEmpty.style.display = 'block';
      return;
    }
    if (diagnosticEmpty) diagnosticEmpty.style.display = 'none';

    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = `summaryItem diagnosticItem diagnostic-${(item.severity || 'info').toLowerCase()}`;
      const top = document.createElement('div');
      top.className = 'head';
      top.innerHTML = `
        <span class="chip">${item.tableCode || 'GLOBAL'}</span>
        <span class="chip">${item.eventCode || item.eventType || 'EVENT'}</span>
        <span class="chip">${item.category || 'system'}</span>
        ${item.sessionId ? `<span class="chip chip-light">Session ${String(item.sessionId).slice(0, 8)}</span>` : ''}
        ${item.ticketId ? `<span class="chip chip-light">Ticket ${String(item.ticketId).slice(0, 8)}</span>` : ''}
        <span class="chip">${item.source || 'api'}</span>
        <span class="chip chip-severity chip-severity--${(item.severity || 'info').toLowerCase()}">${(item.severity || 'info').toUpperCase()}</span>
      `;
      const msg = document.createElement('div');
      msg.className = 'summaryMeta';
      msg.textContent = `${item.message || 'Sans message'} • ${formatTime(item.createdAt)}`;
      row.appendChild(top);
      row.appendChild(msg);
      if (item.payload && Object.keys(item.payload).length) {
        const payload = document.createElement('pre');
        payload.className = 'diagnosticPayload';
        payload.textContent = JSON.stringify(item.payload, null, 2);
        row.appendChild(payload);
      }
      diagnosticList.appendChild(row);
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
    const filtered = tables.filter((tb) => {
      const id = normId(tb.id);
      if (!id) return false;
      if (filterValue !== 'TOUTES' && filterValue !== id) return false;
      return true;
    });

    if (!filtered.length) {
      if (tablesEmpty) tablesEmpty.style.display = 'block';
      return;
    }

    const sorted = [...filtered].sort((a, b) => {
      const prioDiff = statusPrio(a.status) - statusPrio(b.status);
      if (prioDiff !== 0) return prioDiff;
      const timeDiff = getSortTimestamp(a) - getSortTimestamp(b);
      if (timeDiff !== 0) return timeDiff;
      return normId(a.id).localeCompare(normId(b.id), 'fr', { numeric: true });
    });

    const activeTables = sorted.filter((tb) => !isEmptyStatus(tb.status));
    const emptyTables = sorted.filter((tb) => isEmptyStatus(tb.status));

    const buildSection = (title, items, isEmptySection = false) => {
      const section = document.createElement('div');
      section.className = `tables-subsection${isEmptySection ? ' tables-subsection--empty' : ''}`;

      const head = document.createElement('div');
      head.className = 'tables-subsection-head';
      head.innerHTML = `<h3>${title}</h3>`;
      section.appendChild(head);

      const grid = document.createElement('div');
      grid.className = `tables-grid${isEmptySection ? ' tables-grid--empty' : ''}`;

      items.forEach((tb) => {
        const id = normId(tb.id);
        const rawStatus = normalizeStatusLabel(tb.status);
        const displayStatus = displayStatusLabel(rawStatus);
        const actionLabel = actionLabelForStatus(rawStatus);
        const infoText = getInfoTextForStatus(rawStatus, tb);
        const timeText = tb && tb.lastTicket && tb.lastTicket.at ? formatTime(tb.lastTicket.at) : '—';

        const card = document.createElement('div');
        card.className = `table${isEmptySection ? ' table--empty' : ''}`;
        card.setAttribute('data-table', id);

        const headRow = document.createElement('div');
        headRow.className = 'card-head';

        const chipId = document.createElement('span');
        chipId.className = 'chip chip-table-id';
        chipId.textContent = id;
        headRow.appendChild(chipId);

        const chipStatus = document.createElement('span');
        chipStatus.className = 'chip chip-status-text';
        chipStatus.textContent = displayStatus;
        headRow.appendChild(chipStatus);
        card.appendChild(headRow);

        applyStatusClasses(card, chipStatus, rawStatus);
        if (rawStatus === 'Nouvelle commande') startPulseForNewOrder(card, id);

        const metaRow = document.createElement('div');
        metaRow.className = 'card-meta-row';

        if (actionLabel) {
          const actionBadge = buildActionBadge(rawStatus);
          if (actionBadge) metaRow.appendChild(actionBadge);
        } else if (infoText) {
          const infoBadge = document.createElement('span');
          infoBadge.className = 'chip chip-info';
          infoBadge.textContent = infoText;
          metaRow.appendChild(infoBadge);
        } else {
          const dash = document.createElement('span');
          dash.className = 'chip chip-muted-line';
          dash.textContent = '—';
          metaRow.appendChild(dash);
        }

        const chipTime = document.createElement('span');
        chipTime.className = 'chip chip-time';
        chipTime.textContent = `🕒 ${timeText}`;
        metaRow.appendChild(chipTime);
        card.appendChild(metaRow);

        const prev = lastStatusByTable[id];
        if (prev !== rawStatus) {
          maybePlayStatusSound(id, rawStatus);
          lastStatusByTable[id] = rawStatus;
        }

        grid.appendChild(card);
      });

      section.appendChild(grid);
      return section;
    };

    if (activeTables.length) {
      tablesContainer.appendChild(buildSection('Tables actives', activeTables, false));
    }
    if (emptyTables.length) {
      tablesContainer.appendChild(buildSection('Tables vides', emptyTables, true));
    }
  }

  async function fetchDiagnosticOverview() {
    const base = getApiBase();
    if (!base) return { totals: {}, breakdown: {} };
    const params = new URLSearchParams();
    params.set('date', historyDateInput?.value || todayKey());
    if (diagSeverityFilter?.value) params.set('severity', diagSeverityFilter.value);
    if (diagTypeFilter?.value) params.set('eventType', diagTypeFilter.value);
    if (diagTableFilter?.value) params.set('tableId', diagTableFilter.value);
    params.set('includeAudit', diagIncludeAudit?.checked ? 'true' : 'false');
    const res = await fetch(`${base}/diagnostic/overview?${params.toString()}`, { cache: 'no-store' });
    const data = await res.json();
    return data || { totals: {}, breakdown: {} };
  }

  async function fetchDiagnosticEvents() {
    const base = getApiBase();
    if (!base) return { items: [] };
    const params = new URLSearchParams();
    params.set('date', historyDateInput?.value || todayKey());
    if (diagSeverityFilter?.value) params.set('severity', diagSeverityFilter.value);
    if (diagTypeFilter?.value) params.set('eventType', diagTypeFilter.value);
    if (diagTableFilter?.value) params.set('tableId', diagTableFilter.value);
    if (diagSessionFilter?.value) params.set('sessionId', diagSessionFilter.value.trim());
    params.set('includeAudit', diagIncludeAudit?.checked ? 'true' : 'false');
    params.set('limit', '25');
    const res = await fetch(`${base}/diagnostic/events?${params.toString()}`, { cache: 'no-store' });
    const data = await res.json();
    return data || { items: [] };
  }

  async function fetchTables() {
    const base = getApiBase();
    if (!base) return { tables: [] };
    const res = await fetch(`${base}/tables`, { cache: 'no-store' });
    const data = await res.json();
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
      }
    });
  }
  async function refreshHistory() { return null; }
  async function refreshManager() { return null; }
  async function refreshDiagnostic() { return null; }
  window.refreshTables = refreshTables;
  window.refreshSummary = refreshSummary;
  window.refreshHistory = refreshHistory;
  window.refreshManager = refreshManager;
  window.refreshDiagnostic = refreshDiagnostic;

  if (btnSaveApi) {
    btnSaveApi.addEventListener('click', () => {
      saveApiToStorage();
      refreshTables();
      refreshSummary();
      connectStaffSse();
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
        const data = await res.json();
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
