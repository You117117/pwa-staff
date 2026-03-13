// app.js — Staff (Bloc 6 : tables actives + résumé robuste + historique sessions)

document.addEventListener('DOMContentLoaded', () => {
  const apiInput = document.querySelector('#apiUrl');
  const btnSaveApi = document.querySelector('#btnSaveApi') || document.querySelector('#btnMemorize');
  const btnRefreshTables = document.querySelector('#btnRefreshTables') || document.querySelector('#btnRefresh');
  const btnRefreshSummary = document.querySelector('#btnRefreshSummary');
  const btnRefreshHistory = document.querySelector('#btnRefreshHistory');

  const tablesContainer = document.querySelector('#tables');
  const tablesEmpty = document.querySelector('#tablesEmpty');
  const filterSelect = document.querySelector('#filterTables');

  const summaryContainer = document.querySelector('#summary');
  const summaryEmpty = document.querySelector('#summaryEmpty');
  const summaryStats = document.querySelector('#summaryStats');

  const historyContainer = document.querySelector('#historySessions');
  const historyEmpty = document.querySelector('#historyEmpty');
  const filterHistoryDate = document.querySelector('#historyDate');
  const filterHistoryTable = document.querySelector('#historyTable');
  const filterHistoryType = document.querySelector('#historyType');

  const TABLES_REFRESH_MS = 2000;
  const LS_KEY_API = 'staff-api';
  let latestTablesById = {};

  const normId = (id) => (id || '').toString().trim().toUpperCase();
  const now = () => Date.now();

  let prevTablesSnapshot = window.__prevTablesSnapshot || {};
  window.__prevTablesSnapshot = prevTablesSnapshot;

  let staffAudioCtx = null;

  function ensureStaffAudioCtxUnlocked() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!staffAudioCtx) staffAudioCtx = new AudioContext();
      if (staffAudioCtx.state === 'suspended') staffAudioCtx.resume();
    } catch (e) {
      console.warn('[staff-beep] Impossible d\'initialiser l\'AudioContext', e);
    }
  }

  document.addEventListener('click', ensureStaffAudioCtxUnlocked, { once: true });
  document.addEventListener('touchstart', ensureStaffAudioCtxUnlocked, { once: true });

  function playStaffBeep() {
    try {
      if (!staffAudioCtx) ensureStaffAudioCtxUnlocked();
      if (!staffAudioCtx) return;

      const ctx = staffAudioCtx;
      const tNow = ctx.currentTime;
      const notes = [
        { freq: 261.63, start: 0.0, dur: 0.12 },
        { freq: 293.66, start: 0.13, dur: 0.12 },
        { freq: 329.63, start: 0.26, dur: 0.14 },
      ];

      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = note.freq;
        const t0 = tNow + note.start;
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
      .sort((a, b) => statusPrio(a.status || 'Vide') - statusPrio(b.status || 'Vide'))
      .forEach((tb) => {
        const id = normId(tb.id);
        if (!id) return;

        const status = (tb.status || 'Vide').toString().trim();
        const lastAt = tb.lastTicket && tb.lastTicket.at ? String(tb.lastTicket.at) : null;

        nextSnapshot[id] = { status, lastAt };

        const prev = prevTablesSnapshot[id];
        if (!prev) {
          if (status !== 'Vide' && lastAt) shouldBeep = true;
          return;
        }

        if (prev.lastAt !== lastAt && lastAt) {
          shouldBeep = true;
          return;
        }

        if (prev.status === 'Vide' && status !== 'Vide') {
          shouldBeep = true;
        }
      });

    prevTablesSnapshot = nextSnapshot;
    window.__prevTablesSnapshot = prevTablesSnapshot;

    if (shouldBeep) playStaffBeep();
  }

  function getApiBase() {
    const raw = apiInput ? apiInput.value.trim() : '';
    return raw ? raw.replace(/\/+$/, '') : '';
  }

  function formatTime(dateString) {
    if (!dateString) return '--:--';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return dateString;
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateInput(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatMoney(value) {
    return `${Number(value || 0).toFixed(2)} €`;
  }

  function formatDuration(durationSeconds) {
    if (typeof durationSeconds !== 'number' || Number.isNaN(durationSeconds) || durationSeconds < 0) return '—';
    const totalMinutes = Math.round(durationSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return `${minutes} min`;
    return `${hours} h ${String(minutes).padStart(2, '0')}`;
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

  const leftPayTimers = (window.leftPayTimers = window.leftPayTimers || {});
  const leftPrintTimers = (window.leftPrintTimers = window.leftPrintTimers || {});

  const STATUS_UI = {
    'Vide': { key: 'vide', prio: 60 },
    'En cours': { key: 'en_cours', prio: 40 },
    'Commandée': { key: 'commandee', prio: 10 },
    'Nouvelle commande': { key: 'nouvelle_commande', prio: 0 },
    'En préparation': { key: 'en_preparation', prio: 15 },
    'À encoder en caisse': { key: 'a_encoder_caisse', prio: 20 },
    'Encodage caisse confirmé': { key: 'encodage_caisse_confirme', prio: 50 },
    'Encodée en caisse': { key: 'encodage_caisse_confirme', prio: 55 },
    'Clôture avec anomalie': { key: 'cloture_anomalie', prio: 52 },
    'Anomalie pas encodé': { key: 'cloture_anomalie', prio: 56 },
    'Clôturée': { key: 'cloturee', prio: 55 },
  };

  const SOUND_COOLDOWN_MS = 6000;
  const soundGate = { lastAt: 0 };
  const lastStatusByTable = {};
  const pulseTimers = {};

  function statusKey(label) {
    return STATUS_UI[label] && STATUS_UI[label].key ? STATUS_UI[label].key : 'vide';
  }

  function statusPrio(label) {
    return STATUS_UI[label] && typeof STATUS_UI[label].prio === 'number' ? STATUS_UI[label].prio : 999;
  }

  function statusClassName(label) {
    return `status-${statusKey(label)}`;
  }

  function buildStatusBadge(label) {
    const badge = document.createElement('span');
    badge.className = `chip ${statusClassName(label)}`;
    badge.textContent = label || 'Vide';
    return badge;
  }

  function actionLabelForStatus(label) {
    switch (label) {
      case 'Commandée':
        return 'Imprimer ticket';
      case 'Nouvelle commande':
        return 'Imprimer ajout';
      case 'À encoder en caisse':
        return 'Encoder en caisse';
      case 'Encodage caisse confirmé':
        return 'Clôturer';
      default:
        return '';
    }
  }

  function buildActionBadge(label) {
    const action = actionLabelForStatus(label);
    if (!action) return null;
    const badge = document.createElement('span');
    badge.className = 'chip chip-action';
    badge.textContent = action;
    return badge;
  }

  function playToneSequence(freqs, durationMs = 130) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      let t = ctx.currentTime;
      freqs.forEach((f) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f;
        gain.gain.value = 0.14;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + durationMs / 1000);
        t += durationMs / 1000;
      });
    } catch (e) {}
  }

  function maybePlayStatusSound(tableId, newStatusLabel) {
    const tNow = Date.now();
    if (tNow - soundGate.lastAt < SOUND_COOLDOWN_MS) return;
    if (newStatusLabel === 'Commandée') {
      soundGate.lastAt = tNow;
      playToneSequence([523, 659, 784]);
    } else if (newStatusLabel === 'Nouvelle commande') {
      soundGate.lastAt = tNow;
      playToneSequence([784, 659, 523, 988]);
    }
  }

  function applyStatusClasses(cardEl, chipStatusEl, statusLabel) {
    const cls = `status-${statusKey(statusLabel)}`;
    cardEl.classList.remove(
      'status-vide',
      'status-en_cours',
      'status-commandee',
      'status-en_preparation',
      'status-nouvelle_commande',
      'status-a_encoder_caisse',
      'status-encodage_caisse_confirme',
      'status-cloturee',
      'status-cloture_anomalie'
    );
    cardEl.classList.add(cls);

    if (chipStatusEl) {
      chipStatusEl.classList.remove(
        'status-vide',
        'status-en_cours',
        'status-commandee',
        'status-en_preparation',
        'status-nouvelle_commande',
        'status-a_encoder_caisse',
        'status-encodage_caisse_confirme',
        'status-cloturee',
        'status-cloture_anomalie'
      );
      chipStatusEl.classList.add(cls);
    }
  }

  function startPulseForNewOrder(cardEl, tableId) {
    cardEl.classList.add('pulse');
    if (pulseTimers[tableId]) clearTimeout(pulseTimers[tableId]);
    pulseTimers[tableId] = setTimeout(() => {
      cardEl.classList.remove('pulse');
      delete pulseTimers[tableId];
    }, 60000);
  }

  function buildSessionCard(item, opts = {}) {
    const tableId = normId(item.table || item.tableLabel || '');
    const currentStatus = item.displayStatus || item.status || 'Vide';
    const currentTotal = typeof item.total === 'number' ? item.total : 0;
    const wrapper = document.createElement('button');
    wrapper.type = 'button';
    wrapper.className = 'summaryItem summaryItem--clickable';
    wrapper.setAttribute('data-table', tableId);

    const head = document.createElement('div');
    head.className = 'head';

    const chipTable = document.createElement('span');
    chipTable.className = 'chip';
    chipTable.textContent = item.tableLabel || item.table || 'Table';
    head.appendChild(chipTable);

    const chipOpen = document.createElement('span');
    chipOpen.className = 'chip';
    chipOpen.innerHTML = `<i class="icon-clock"></i> Ouverte : ${item.openedTime || item.time || '--:--'}`;
    head.appendChild(chipOpen);

    if (item.closedAt) {
      const chipClose = document.createElement('span');
      chipClose.className = 'chip';
      chipClose.textContent = `Clôturée : ${item.closedTime || formatTime(item.closedAt)}`;
      head.appendChild(chipClose);
    }

    const chipTotal = document.createElement('span');
    chipTotal.className = 'chip';
    chipTotal.textContent = `Total : ${formatMoney(currentTotal)}`;
    head.appendChild(chipTotal);

    head.appendChild(buildStatusBadge(currentStatus));
    wrapper.appendChild(head);

    const body = document.createElement('div');
    body.className = 'body';
    const ordersCount = Number(item.ordersCount || (Array.isArray(item.tickets) ? item.tickets.length : 0) || 0);
    body.textContent = `${ordersCount} ticket${ordersCount > 1 ? 's' : ''} • Durée : ${formatDuration(item.durationSeconds)}${opts.showStateKind && item.stateKind === 'active' ? ' • Session active' : ''}`;
    wrapper.appendChild(body);

    wrapper.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.showTableDetail) {
        window.showTableDetail(tableId, currentStatus, { summaryEntry: item, historyMode: item.stateKind !== 'active' || !!opts.forceHistoryMode });
      }
    });

    return wrapper;
  }

  function renderSummary(summaryData) {
    if (!summaryContainer) return;
    summaryContainer.innerHTML = '';

    const items = Array.isArray(summaryData?.items)
      ? summaryData.items
      : Array.isArray(summaryData?.tickets)
      ? summaryData.tickets
      : [];

    const totals = summaryData?.totals || {
      sessionsCount: 0,
      activeCount: 0,
      closedNormalCount: 0,
      closedAnomalyCount: 0,
      grossTotal: 0,
      averageBasket: 0,
      averageDurationSeconds: 0,
    };

    if (summaryStats) {
      summaryStats.innerHTML = '';
      const cards = [
        { label: 'CA sessions', value: formatMoney(totals.grossTotal) },
        { label: 'Sessions', value: String(totals.sessionsCount || 0) },
        { label: 'Actives', value: String(totals.activeCount || 0) },
        { label: 'Anomalies', value: String(totals.closedAnomalyCount || 0) },
        { label: 'Panier moyen', value: formatMoney(totals.averageBasket) },
        { label: 'Durée moyenne', value: formatDuration(totals.averageDurationSeconds) },
      ];
      cards.forEach((card) => {
        const el = document.createElement('div');
        el.className = 'summaryStatCard';
        el.innerHTML = `<div class="summaryStatLabel">${card.label}</div><div class="summaryStatValue">${card.value}</div>`;
        summaryStats.appendChild(el);
      });
    }

    if (!items.length) {
      if (summaryEmpty) summaryEmpty.style.display = 'block';
      return;
    }
    if (summaryEmpty) summaryEmpty.style.display = 'none';

    items.forEach((item) => {
      summaryContainer.appendChild(buildSessionCard(item, { showStateKind: true }));
    });
  }

  function renderHistory(items) {
    if (!historyContainer) return;
    historyContainer.innerHTML = '';

    if (!Array.isArray(items) || !items.length) {
      if (historyEmpty) historyEmpty.style.display = 'block';
      return;
    }
    if (historyEmpty) historyEmpty.style.display = 'none';

    items.forEach((item) => {
      historyContainer.appendChild(buildSessionCard(item, { forceHistoryMode: true }));
    });
  }

  function syncHistoryTableFilter(tables) {
    if (!filterHistoryTable) return;
    const previous = filterHistoryTable.value;
    const options = ['<option value="">Toutes</option>'];
    (tables || []).forEach((tb) => {
      const id = normId(tb.id);
      if (!id) return;
      options.push(`<option value="${id}">${id}</option>`);
    });
    filterHistoryTable.innerHTML = options.join('');
    if ([...filterHistoryTable.options].some((opt) => opt.value === previous)) {
      filterHistoryTable.value = previous;
    }
  }

  function renderTables(tables) {
    if (!tablesContainer) return;
    tablesContainer.innerHTML = '';

    if (!tables || !tables.length) {
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
      const bgMap = {
        Vide: 'rgba(148,163,184,0.06)',
        'En cours': 'rgba(59,130,246,0.14)',
        Commandée: 'rgba(245,158,11,0.16)',
        'Nouvelle commande': 'rgba(239,68,68,0.16)',
        'En préparation': 'rgba(245,158,11,0.16)',
        'À encoder en caisse': 'rgba(168,85,247,0.16)',
        'Encodage caisse confirmé': 'rgba(16,185,129,0.16)',
        'Clôture avec anomalie': 'rgba(239,68,68,0.16)',
      };
      card.style.background = bgMap[status] || 'rgba(15,23,42,0.6)';

      const head = document.createElement('div');
      head.className = 'card-head';

      const chipId = document.createElement('span');
      chipId.className = 'chip';
      chipId.style.fontSize = '14px';
      chipId.style.padding = '8px 14px';
      chipId.style.fontWeight = '800';
      chipId.textContent = id;
      head.appendChild(chipId);

      const chipStatus = document.createElement('span');
      chipStatus.className = 'chip';
      chipStatus.style.fontSize = '14px';
      chipStatus.style.padding = '8px 14px';
      chipStatus.style.fontWeight = '800';
      chipStatus.textContent = status;
      head.appendChild(chipStatus);

      const actionBadge = buildActionBadge(status);
      if (actionBadge) head.appendChild(actionBadge);

      const chipTime = document.createElement('span');
      chipTime.className = 'chip';
      chipTime.textContent = hasLastTicket ? `🕒 ${lastTime}` : '—';
      head.appendChild(chipTime);

      card.appendChild(head);
      applyStatusClasses(card, chipStatus, status);
      if (status === 'Nouvelle commande') startPulseForNewOrder(card, id);

      const prev = lastStatusByTable[id];
      if (prev !== status) {
        maybePlayStatusSound(id, status);
        lastStatusByTable[id] = status;
      }

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
            btnPrint.textContent = `Impression en cours (${Math.max(1, Math.ceil(remain / 1000))}s)`;
          };
          updatePrintLabel();
          const localPrintInterval = setInterval(() => {
            if (!document.body.contains(btnPrint)) return clearInterval(localPrintInterval);
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
            btnPrint.textContent = `Impression en cours (${Math.max(1, Math.ceil(remain / 1000))}s)`;
          }, 250);
        }

        if (payTimer) {
          btnPaid.style.backgroundColor = '#f97316';
          const updateLabel = () => {
            const remain = payTimer.until - now();
            if (remain <= 0) {
              btnPaid.textContent = 'Paiement confirmé';
              return;
            }
            btnPaid.textContent = `Annuler paiement (${Math.max(1, Math.ceil(remain / 1000))}s)`;
          };
          updateLabel();
          const localInterval = setInterval(() => {
            if (!document.body.contains(btnPaid)) return clearInterval(localInterval);
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
            btnPaid.textContent = `Annuler paiement (${Math.max(1, Math.ceil(remain / 1000))}s)`;
          }, 250);
        } else if (isPaid) {
          btnPaid.textContent = 'Annuler paiement';
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
          if (!base || leftPrintTimers[id]) return;

          const until = now() + 5000;
          const timer = { until, timeoutId: null, intervalId: null };
          leftPrintTimers[id] = timer;
          btnPrint.style.backgroundColor = '#f97316';

          const updatePrintLabel = () => {
            const remain = timer.until - now();
            btnPrint.textContent = remain <= 0 ? 'Imprimer maintenant' : `Impression en cours (${Math.max(1, Math.ceil(remain / 1000))}s)`;
          };
          updatePrintLabel();

          timer.intervalId = setInterval(() => {
            if (!document.body.contains(btnPrint)) return clearInterval(timer.intervalId);
            const remain = timer.until - now();
            if (remain <= 0) {
              clearInterval(timer.intervalId);
              btnPrint.textContent = 'Imprimer maintenant';
              btnPrint.style.backgroundColor = '';
            } else {
              btnPrint.textContent = `Impression en cours (${Math.max(1, Math.ceil(remain / 1000))}s)`;
            }
          }, 250);

          timer.timeoutId = setTimeout(() => {
            if (leftPrintTimers[id] === timer) delete leftPrintTimers[id];
            clearInterval(timer.intervalId);
            btnPrint.textContent = 'Imprimer maintenant';
            btnPrint.style.backgroundColor = '';
          }, 5000);

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
            await refreshSummary();
            await refreshHistory();
            if (window.__currentDetailTableId === id && window.showTableDetail) window.showTableDetail(id);
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
              await fetch(`${base}/cancel-confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: id }),
              });
            } catch (err) {
              console.error('Erreur /cancel-confirm', err);
            } finally {
              await refreshTables();
              await refreshSummary();
              await refreshHistory();
              if (window.__currentDetailTableId === id && window.showTableDetail) window.showTableDetail(id);
            }
            return;
          }

          try {
            await fetch(`${base}/confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: id }),
            });
          } catch (err) {
            console.error('Erreur /confirm', err);
          }

          const until = now() + 5000;
          const countdown = { until, timeoutId: null, intervalId: null };
          leftPayTimers[id] = countdown;
          btnPaid.style.backgroundColor = '#f97316';

          const updateLabel = () => {
            const remain = countdown.until - now();
            btnPaid.textContent = remain <= 0 ? 'Paiement confirmé' : `Annuler paiement (${Math.max(1, Math.ceil(remain / 1000))}s)`;
          };
          updateLabel();

          countdown.intervalId = setInterval(() => {
            if (!document.body.contains(btnPaid)) return clearInterval(countdown.intervalId);
            const remain = countdown.until - now();
            if (remain <= 0) {
              clearInterval(countdown.intervalId);
              btnPaid.textContent = 'Paiement confirmé';
              btnPaid.style.backgroundColor = '';
            } else {
              btnPaid.textContent = `Annuler paiement (${Math.max(1, Math.ceil(remain / 1000))}s)`;
            }
          }, 250);

          countdown.timeoutId = setTimeout(async () => {
            if (leftPayTimers[id] !== countdown) return;
            delete leftPayTimers[id];
            try {
              const closeResp = await fetch(`${base}/close-table`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: id, closureType: 'normal' }),
              });
              const closeJson = await closeResp.json().catch(() => ({}));
              if (!closeResp.ok || closeJson?.ok === false) throw new Error(closeJson?.error || `http_${closeResp.status}`);
            } catch (err) {
              console.error('Erreur /close-table', err);
              alert(`Impossible de clôturer la table : ${err.message || err}`);
            } finally {
              await refreshTables();
              await refreshSummary();
              await refreshHistory();
              if (window.__currentDetailTableId === id && window.showTableDetail) window.showTableDetail(id);
            }
          }, 5000);
        });
      }

      card.addEventListener('click', () => {
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
        const freshStatus = freshTable && freshTable.status ? freshTable.status : status;
        if (window.showTableDetail) window.showTableDetail(id, freshStatus);

        refreshTables().then(() => {
          const latestMap = window.__latestTablesById || {};
          const latestTable = latestMap[id] || null;
          const latestStatus = latestTable && latestTable.status ? latestTable.status : freshStatus;
          if (window.__currentDetailTableId === id && window.showTableDetail) window.showTableDetail(id, latestStatus);
        }).catch((err) => console.error('Erreur refresh après ouverture détail', err));
      });

      tablesContainer.appendChild(card);
    });
  }

  async function fetchSummary() {
    const base = getApiBase();
    if (!base) return { items: [], totals: {} };
    const res = await fetch(`${base}/summary`, { cache: 'no-store' });
    return (await res.json()) || { items: [], totals: {} };
  }

  async function fetchTables() {
    const base = getApiBase();
    if (!base) return { tables: [] };
    const res = await fetch(`${base}/tables`, { cache: 'no-store' });
    return (await res.json()) || { tables: [] };
  }

  async function fetchHistory() {
    const base = getApiBase();
    if (!base) return { items: [] };
    const params = new URLSearchParams();
    const selectedDate = filterHistoryDate?.value?.trim();
    const selectedTable = filterHistoryTable?.value?.trim();
    const selectedType = filterHistoryType?.value?.trim();
    if (selectedDate) params.set('date', selectedDate);
    if (selectedTable) params.set('tableId', selectedTable);
    if (selectedType) params.set('closureType', selectedType);
    const includeActive = selectedType === 'active';
    if (includeActive) params.set('includeActive', 'true');
    const res = await fetch(`${base}/history-sessions?${params.toString()}`, { cache: 'no-store' });
    return (await res.json()) || { items: [] };
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
      latestTablesById = tables.reduce((acc, tb) => {
        const id = normId(tb.id);
        if (id) acc[id] = tb;
        return acc;
      }, {});
      window.__latestTablesById = latestTablesById;
      detectTablesChangesAndBeep(tables);
      syncHistoryTableFilter(tables);
      renderTables(tables);
    } catch (err) {
      console.error('Erreur refreshTables', err);
    }
  }

  async function refreshSummary() {
    const base = getApiBase();
    if (!base) {
      if (summaryContainer) summaryContainer.innerHTML = '';
      if (summaryStats) summaryStats.innerHTML = '';
      if (summaryEmpty) summaryEmpty.style.display = 'block';
      return;
    }
    try {
      const summaryData = await fetchSummary();
      renderSummary(summaryData);
    } catch (err) {
      console.error('Erreur refreshSummary', err);
    }
  }

  async function refreshHistory() {
    const base = getApiBase();
    if (!base) {
      if (historyContainer) historyContainer.innerHTML = '';
      if (historyEmpty) historyEmpty.style.display = 'block';
      return;
    }
    try {
      const historyData = await fetchHistory();
      renderHistory(historyData.items || []);
    } catch (err) {
      console.error('Erreur refreshHistory', err);
    }
  }

  window.refreshTables = refreshTables;
  window.refreshSummary = refreshSummary;
  window.refreshHistory = refreshHistory;

  if (btnSaveApi) {
    btnSaveApi.addEventListener('click', () => {
      saveApiToStorage();
      refreshTables();
      refreshSummary();
      refreshHistory();
    });
  }

  if (btnRefreshTables) btnRefreshTables.addEventListener('click', refreshTables);
  if (btnRefreshSummary) btnRefreshSummary.addEventListener('click', refreshSummary);
  if (btnRefreshHistory) btnRefreshHistory.addEventListener('click', refreshHistory);

  window.addEventListener('focus', () => {
    refreshTables();
    refreshSummary();
    refreshHistory();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshTables();
      refreshSummary();
      refreshHistory();
    }
  });

  if (filterSelect) filterSelect.addEventListener('change', refreshTables);
  if (filterHistoryDate) filterHistoryDate.addEventListener('change', refreshHistory);
  if (filterHistoryTable) filterHistoryTable.addEventListener('change', refreshHistory);
  if (filterHistoryType) filterHistoryType.addEventListener('change', refreshHistory);

  loadApiFromStorage();
  if (filterHistoryDate && !filterHistoryDate.value) filterHistoryDate.value = formatDateInput(new Date().toISOString());

  refreshTables();
  refreshSummary();
  refreshHistory();

  setInterval(refreshTables, TABLES_REFRESH_MS);
});
