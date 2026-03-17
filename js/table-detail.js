// table-detail.js — panneau détail table / historique Bloc 6

(function () {
  let panel = document.querySelector('#tableDetailPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'tableDetailPanel';
    panel.style.position = 'fixed';
    panel.style.top = '0';
    panel.style.right = '0';
    panel.style.width = '380px';
    panel.style.height = '100vh';
    panel.style.background = '#0f172a';
    panel.style.borderLeft = '1px solid rgba(255,255,255,0.06)';
    panel.style.zIndex = '500';
    panel.style.display = 'none';
    panel.style.flexDirection = 'column';
    panel.style.padding = '18px';
    panel.style.overflowY = 'auto';
    panel.style.gap = '14px';
    document.body.appendChild(panel);
  }

  window.__suppressOutsideClose = false;
  const leftPrintTimers = (window.leftPrintTimers = window.leftPrintTimers || {});
  const leftPayTimers = (window.leftPayTimers = window.leftPayTimers || {});
  let detailRenderSeq = 0;

  document.addEventListener('click', (e) => {
    if (panel.style.display === 'none') return;
    if (window.__suppressOutsideClose) return;
    if (panel.contains(e.target)) return;
    closePanel();
  });

  const normId = (id) => (id || '').toString().trim().toUpperCase();
  const getApiBase = () => {
    const input = document.querySelector('#apiUrl');
    return input ? input.value.trim().replace(/\/+$/, '') : '';
  };

  function formatTime(dateValue) {
    if (!dateValue) return '--:--';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
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


  function mapDisplayStatus(status) {
    switch ((status || '').trim()) {
      case 'Nouvelle commande':
        return 'Commande additionnel';
      case 'À encoder en caisse':
        return 'En attente caisse';
      default:
        return status || 'Vide';
    }
  }

  function getStatusBadgeStyle(status) {
    const label = mapDisplayStatus(status);
    if (label === 'En attente caisse') {
      return {
        background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
        color: '#ffffff',
      };
    }
    if (label === 'Commande additionnel') {
      return {
        background: 'linear-gradient(135deg, #facc15 0%, #f59e0b 100%)',
        color: '#111827',
      };
    }
    if (label === 'Commandée') {
      return {
        background: 'linear-gradient(135deg, #facc15 0%, #f59e0b 100%)',
        color: '#111827',
      };
    }
    if (label === 'En préparation') {
      return {
        background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
        color: '#ffffff',
      };
    }
    if (label === 'Encodage caisse confirmé') {
      return {
        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        color: '#052e16',
      };
    }
    if (label === 'Vide') {
      return {
        background: 'rgba(148,163,184,0.18)',
        color: '#e2e8f0',
      };
    }
    return {
      background: 'rgba(59,130,246,0.22)',
      color: '#dbeafe',
    };
  }

  function formatTicketDate(dateValue) {
    if (!dateValue) return '--/--';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '--/--';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  }

  function makeTicketDisplayLabel(tableId, ticket) {
    const ticketDate = formatTicketDate(ticket && ticket.createdAt);
    const ticketTime = ticket && (ticket.time || formatTime(ticket.createdAt));
    return `Ticket ${tableId} • ${ticketDate} • ${ticketTime}`;
  }

  function showStaffChoiceModal({
    title = 'Confirmation',
    message = '',
    confirmLabel = 'Oui',
    dangerLabel = 'Non',
    cancelLabel = 'Annuler',
  } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.background = 'rgba(2,6,23,0.7)';
      overlay.style.backdropFilter = 'blur(4px)';
      overlay.style.zIndex = '1200';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.padding = '20px';

      const modal = document.createElement('div');
      modal.style.width = '100%';
      modal.style.maxWidth = '440px';
      modal.style.background = 'linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(17,24,39,0.98) 100%)';
      modal.style.border = '1px solid rgba(148,163,184,0.25)';
      modal.style.borderRadius = '18px';
      modal.style.boxShadow = '0 25px 60px rgba(2,6,23,0.55)';
      modal.style.padding = '22px';
      modal.style.display = 'flex';
      modal.style.flexDirection = 'column';
      modal.style.gap = '14px';
      modal.addEventListener('click', (e) => e.stopPropagation());

      const titleEl = document.createElement('div');
      titleEl.textContent = title;
      titleEl.style.fontSize = '18px';
      titleEl.style.fontWeight = '800';
      titleEl.style.color = '#f8fafc';

      const messageEl = document.createElement('div');
      messageEl.textContent = message;
      messageEl.style.fontSize = '14px';
      messageEl.style.lineHeight = '1.5';
      messageEl.style.color = '#cbd5e1';

      const actions = document.createElement('div');
      actions.style.display = 'grid';
      actions.style.gridTemplateColumns = '1fr 1fr';
      actions.style.gap = '10px';
      actions.style.marginTop = '6px';

      const baseBtnStyle = (btn) => {
        btn.type = 'button';
        btn.style.border = 'none';
        btn.style.borderRadius = '12px';
        btn.style.padding = '12px 14px';
        btn.style.fontSize = '14px';
        btn.style.fontWeight = '700';
        btn.style.cursor = 'pointer';
      };

      const yesBtn = document.createElement('button');
      baseBtnStyle(yesBtn);
      yesBtn.textContent = confirmLabel;
      yesBtn.style.background = '#22c55e';
      yesBtn.style.color = '#052e16';

      const noBtn = document.createElement('button');
      baseBtnStyle(noBtn);
      noBtn.textContent = dangerLabel;
      noBtn.style.background = '#ef4444';
      noBtn.style.color = '#fff';

      const cancelBtn = document.createElement('button');
      baseBtnStyle(cancelBtn);
      cancelBtn.textContent = cancelLabel;
      cancelBtn.style.gridColumn = '1 / -1';
      cancelBtn.style.background = 'rgba(148,163,184,0.12)';
      cancelBtn.style.color = '#e2e8f0';
      cancelBtn.style.border = '1px solid rgba(148,163,184,0.2)';

      const cleanup = (value) => {
        document.removeEventListener('keydown', onKeyDown);
        overlay.remove();
        resolve(value);
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') cleanup(null);
      };
      document.addEventListener('keydown', onKeyDown);

      overlay.addEventListener('click', () => cleanup(null));
      yesBtn.addEventListener('click', () => cleanup('yes'));
      noBtn.addEventListener('click', () => cleanup('no'));
      cancelBtn.addEventListener('click', () => cleanup(null));

      actions.appendChild(yesBtn);
      actions.appendChild(noBtn);
      actions.appendChild(cancelBtn);
      modal.appendChild(titleEl);
      modal.appendChild(messageEl);
      modal.appendChild(actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    });
  }

  async function refreshStaffViews() {
    try {
      if (window.refreshTables) await window.refreshTables();
    } catch (err) {
      console.error('Erreur refreshTables depuis détail', err);
    }
  }

  function closePanel() {
    panel.style.display = 'none';
    panel.innerHTML = '';
    window.__currentDetailTableId = null;
  }

  function closePanelIfStillCurrent(tableId) {
    if ((window.__currentDetailTableId || null) === tableId) {
      closePanel();
    }
  }

  function makeProductLines(ticket) {
    const src = Array.isArray(ticket.items)
      ? ticket.items
      : Array.isArray(ticket.lines)
      ? ticket.lines
      : null;

    if (!src) {
      const lines = [];
      if (ticket.label) {
        const div = document.createElement('div');
        div.textContent = ticket.label;
        div.style.fontSize = '14px';
        div.style.color = '#f9fafb';
        div.style.fontWeight = '600';
        lines.push(div);
      }
      return lines;
    }

    return src.map((it) => {
      const qty = it.qty || it.quantity || 1;
      const name = it.label || it.name || it.title || 'article';
      const price = it.price || it.unitPrice || it.amount || null;
      const lineClientName = it.clientName || it.customerName || it.ownerName || ticket.clientName || null;
      const extrasSrc = Array.isArray(it.extras)
        ? it.extras
        : Array.isArray(it.options)
        ? it.options
        : Array.isArray(it.supplements)
        ? it.supplements
        : Array.isArray(it.toppings)
        ? it.toppings
        : [];
      const extras = Array.isArray(extrasSrc)
        ? extrasSrc
            .map((e) => (typeof e === 'string' ? e.trim() : (e && (e.label || e.name || e.title || '')).trim()))
            .filter(Boolean)
        : [];

      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '6px';

      const line = document.createElement('div');
      line.style.display = 'flex';
      line.style.justifyContent = 'space-between';
      line.style.alignItems = 'flex-start';
      line.style.gap = '10px';
      line.style.fontSize = '17px';
      line.style.color = '#f8fafc';
      line.style.fontWeight = '800';

      const left = document.createElement('span');
      left.textContent = `${qty}× ${name}`;
      left.style.flex = '1';
      const right = document.createElement('span');
      right.textContent = typeof price === 'number' ? formatMoney(price) : '';
      right.style.whiteSpace = 'nowrap';
      line.appendChild(left);
      line.appendChild(right);
      wrapper.appendChild(line);

      if (lineClientName) {
        const clientLine = document.createElement('div');
        clientLine.textContent = `Client : ${lineClientName}`;
        clientLine.style.fontSize = '13px';
        clientLine.style.color = '#e5e7eb';
        clientLine.style.opacity = '0.95';
        wrapper.appendChild(clientLine);
      }

      if (extras.length) {
        const extrasWrap = document.createElement('div');
        extrasWrap.style.display = 'flex';
        extrasWrap.style.flexWrap = 'wrap';
        extrasWrap.style.gap = '8px';
        extrasWrap.style.marginTop = '2px';

        const extrasLabel = document.createElement('span');
        extrasLabel.textContent = 'Suppléments :';
        extrasLabel.style.fontSize = '12px';
        extrasLabel.style.fontWeight = '700';
        extrasLabel.style.color = '#e2e8f0';
        extrasLabel.style.padding = '4px 0';
        extrasWrap.appendChild(extrasLabel);

        extras.forEach((extra) => {
          const chip = document.createElement('span');
          chip.textContent = extra;
          chip.style.fontSize = '12px';
          chip.style.fontWeight = '600';
          chip.style.color = '#f8fafc';
          chip.style.background = 'rgba(99,102,241,0.12)';
          chip.style.border = '1px solid rgba(255,255,255,0.08)';
          chip.style.borderRadius = '999px';
          chip.style.padding = '4px 10px';
          extrasWrap.appendChild(chip);
        });

        wrapper.appendChild(extrasWrap);
      }

      return wrapper;
    });
  }

  function makeTicketCard(ticket, tableId) {
    const card = document.createElement('div');
    card.style.background = 'rgba(15,23,42,0.45)';
    card.style.border = '1px solid rgba(255,255,255,0.78)';
    card.style.borderRadius = '18px';
    card.style.padding = '14px 14px 16px';
    card.style.marginBottom = '14px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '10px';
    card.style.color = '#e5e7eb';
    card.style.boxShadow = '0 8px 20px rgba(15,23,42,0.32)';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'center';
    head.style.gap = '12px';

    const ticketLabel = document.createElement('div');
    ticketLabel.textContent = makeTicketDisplayLabel(tableId, ticket);
    ticketLabel.style.fontSize = '15px';
    ticketLabel.style.fontWeight = '500';
    ticketLabel.style.color = '#e2e8f0';
    ticketLabel.style.lineHeight = '1.2';

    const totalLabel = document.createElement('div');
    totalLabel.textContent = formatMoney(ticket.total);
    totalLabel.style.fontSize = '17px';
    totalLabel.style.fontWeight = '800';
    totalLabel.style.color = '#f8fafc';
    totalLabel.style.whiteSpace = 'nowrap';

    head.appendChild(ticketLabel);
    head.appendChild(totalLabel);
    card.appendChild(head);
    makeProductLines(ticket).forEach((line) => card.appendChild(line));
    return card;
  }

  async function fetchSummary(base) {
    const res = await fetch(`${base}/summary`, { cache: 'no-store' });
    return await res.json();
  }


  function normalizeSummaryEntry(summaryEntry, fallbackTableId, fallbackStatus) {
    if (!summaryEntry) return null;
    const orderedTickets = Array.isArray(summaryEntry.tickets)
      ? [...summaryEntry.tickets].sort((a, b) => {
          const aTs = a.createdAt ? new Date(a.createdAt).getTime() : NaN;
          const bTs = b.createdAt ? new Date(b.createdAt).getTime() : NaN;
          if (!Number.isNaN(aTs) && !Number.isNaN(bTs)) return aTs - bTs;
          return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
        })
      : [];

    const total = typeof summaryEntry.total === 'number'
      ? summaryEntry.total
      : orderedTickets.reduce((acc, t) => acc + (typeof t.total === 'number' ? t.total : 0), 0);

    const dedupedTickets = [];
    const seenTicketKeys = new Set();
    orderedTickets.forEach((ticket, index) => {
      const rawKey = ticket && (ticket.id || ticket.ticketId || ticket.orderId || ticket.createdAt || ticket.time || index);
      const key = String(rawKey || index);
      if (seenTicketKeys.has(key)) return;
      seenTicketKeys.add(key);
      dedupedTickets.push(ticket);
    });

    return {
      id: summaryEntry.id || summaryEntry.sessionId || null,
      table: normId(summaryEntry.table || fallbackTableId),
      tableLabel: summaryEntry.tableLabel || summaryEntry.table || fallbackTableId,
      status: summaryEntry.displayStatus || summaryEntry.status || fallbackStatus || 'Vide',
      displayStatus: summaryEntry.displayStatus || summaryEntry.status || fallbackStatus || 'Vide',
      tickets: dedupedTickets,
      total,
      createdAt: summaryEntry.createdAt || summaryEntry.openedAt || (orderedTickets[0] && orderedTickets[0].createdAt) || null,
      sessionKey: summaryEntry.sessionKey || summaryEntry.sessionStartedAt || summaryEntry.openedAt || null,
      time: summaryEntry.time || formatTime(summaryEntry.createdAt || summaryEntry.openedAt),
      openedAt: summaryEntry.openedAt || summaryEntry.sessionStartedAt || summaryEntry.createdAt || null,
      openedTime: summaryEntry.openedTime || formatTime(summaryEntry.openedAt || summaryEntry.sessionStartedAt || summaryEntry.createdAt),
      closedAt: summaryEntry.closedAt || null,
      closedTime: summaryEntry.closedTime || formatTime(summaryEntry.closedAt),
      paidAt: summaryEntry.paidAt || null,
      durationSeconds: summaryEntry.durationSeconds || null,
      stateKind: summaryEntry.stateKind || (summaryEntry.closedAt ? 'closed_normal' : 'active'),
      isClosed: !!summaryEntry.closedAt,
      closureType: summaryEntry.closureType || (summaryEntry.closedWithAnomaly ? 'anomaly' : (summaryEntry.closedAt ? 'normal' : 'active')),
      closedWithAnomaly: !!summaryEntry.closedWithAnomaly || summaryEntry.closureType === 'anomaly',
      date: summaryEntry.date || null,
    };
  }


  function getCachedSummaryEntry(tableId, fallbackStatus) {
    const data = window.__latestSummaryData || {};
    const items = Array.isArray(data.items) ? data.items : Array.isArray(data.tickets) ? data.tickets : [];
    const active = items.find((entry) => normId(entry.table) === normId(tableId) && entry.stateKind === 'active');
    return normalizeSummaryEntry(active || null, tableId, fallbackStatus);
  }

  async function showTableDetail(tableId, statusHint, opts) {
    const options = opts || {};
    const renderSeq = ++detailRenderSeq;
    const base = getApiBase();
    if (!base) return;
    const id = normId(tableId);

    window.__currentDetailTableId = id;
    window.__suppressOutsideClose = true;
    setTimeout(() => {
      window.__suppressOutsideClose = false;
    }, 0);

    panel.innerHTML = '';
    panel.style.display = 'flex';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'center';
    head.style.marginBottom = '14px';

    const title = document.createElement('h2');
    title.textContent = `Table ${id}`;
    title.style.fontSize = '22px';
    title.style.fontWeight = '800';
    title.style.color = '#f9fafb';

    const headActions = document.createElement('div');
    headActions.style.display = 'flex';
    headActions.style.alignItems = 'center';
    headActions.style.gap = '8px';

    const btnClose = document.createElement('button');
    btnClose.textContent = 'Fermer';
    btnClose.className = 'btn';
    btnClose.style.padding = '4px 10px';
    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closePanel();
    });

    headActions.appendChild(btnClose);
    head.appendChild(title);
    head.appendChild(headActions);
    panel.appendChild(head);

    const contextMeta = document.createElement('div');
    contextMeta.style.marginBottom = '10px';
    contextMeta.style.color = '#e2e8f0';
    contextMeta.style.fontSize = '14px';
    contextMeta.style.lineHeight = '1.45';
    panel.appendChild(contextMeta);

    const info = document.createElement('div');
    info.style.marginBottom = '14px';
    info.style.color = '#e5e7eb';
    info.style.fontSize = '14px';
    info.style.opacity = '0.92';
    info.textContent = 'Chargement...';
    panel.appendChild(info);

    const summaryEntry = normalizeSummaryEntry(options.summaryEntry, id, statusHint);
    let currentStatus = statusHint || 'Vide';
    let allTickets = [];
    let total = 0;
    let cleared = false;
    let isHistoryView = !!options.historyMode;
    let durationSeconds = null;


    function isStaleRender() {
      return renderSeq !== detailRenderSeq || window.__currentDetailTableId !== id;
    }

    function syncCloseTableVisibility() {
      const shouldShow = !isHistoryView && currentStatus !== 'Vide';
    }

    const cachedSummaryEntry = summaryEntry || getCachedSummaryEntry(id, currentStatus);
    if (cachedSummaryEntry) {
      currentStatus = cachedSummaryEntry.displayStatus || currentStatus;
      allTickets = cachedSummaryEntry.tickets || [];
      total = typeof cachedSummaryEntry.total === 'number' ? cachedSummaryEntry.total : 0;
      cleared = !!cachedSummaryEntry.isClosed;
      isHistoryView = cachedSummaryEntry.stateKind !== 'active' || !!options.historyMode;
      durationSeconds = cachedSummaryEntry.durationSeconds;
    }

    syncCloseTableVisibility();

    async function handleCloseInProgress() {
      const apiBase = getApiBase();
      if (!apiBase) return;

      const answer = await showStaffChoiceModal({
        title: 'Clôturer la table',
        message: 'Clôturer cette table en cours et la remettre à vide ?',
        confirmLabel: 'Oui',
        dangerLabel: 'Non',
        cancelLabel: 'Annuler',
      });
      if (!answer || answer === 'no') return;

      try {
        const closeRes = await fetch(`${apiBase}/close-in-progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: id }),
        });
        const closeJson = await closeRes.json().catch(() => ({}));
        if (!closeRes.ok || closeJson.ok === false) {
          window.alert(closeJson.error?.message || closeJson.error || 'Échec clôture de table en cours');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 180));
      } catch (err) {
        console.error('Erreur clôture (close-in-progress)', err);
        window.alert('Erreur réseau pendant la clôture de table en cours');
        return;
      } finally {
        await refreshStaffViews();
        const latestMap = window.__latestTablesById || {};
        const latestTable = latestMap[id] || null;
        const latestStatus = latestTable && latestTable.status ? latestTable.status : currentStatus;
        if (latestStatus === 'Vide') closePanel();
        else showTableDetail(id, latestStatus);
      }
    }

    async function handleCloseTableAction() {
      const apiBase = getApiBase();
      if (!apiBase) return;

      if (currentStatus === 'En cours') {
        await handleCloseInProgress();
        return;
      }

      let closureType = 'normal';
      if (currentStatus !== 'Encodage caisse confirmé') {
        const answer = await showStaffChoiceModal({
          title: 'Clôture de table',
          message:
            'L’encodage dans la caisse a-t-il été effectué ?\n\nOui = confirmation caisse puis clôture normale.\nNon = clôture avec anomalie.',
          confirmLabel: 'Oui',
          dangerLabel: 'Non',
          cancelLabel: 'Annuler',
        });
        if (!answer) return;

        if (answer === 'yes') {
          try {
            const confirmRes = await fetch(`${apiBase}/confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: id }),
            });
            const confirmJson = await confirmRes.json().catch(() => ({}));
            if (!confirmRes.ok || confirmJson.ok === false) {
              window.alert(confirmJson.error || 'Échec confirmation encodage caisse');
              return;
            }
          } catch (err) {
            console.error('Erreur /confirm (clôture détail)', err);
            window.alert('Erreur réseau pendant la confirmation caisse');
            return;
          }
          closureType = 'normal';
        } else {
          closureType = 'anomaly';
        }
      }

      try {
        const closePayload =
          closureType === 'anomaly'
            ? {
                table: id,
                closureType: 'anomaly',
                answer: 'NON',
                closedWithException: true,
                posConfirmed: false,
                reason: 'POS_NON_CONFIRME',
                note: 'Clôture avec anomalie depuis le panneau détail staff',
              }
            : {
                table: id,
                closureType: 'normal',
                answer: 'OUI',
                posConfirmed: true,
              };

        const closeRes = await fetch(`${apiBase}/close-table`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(closePayload),
        });
        const closeJson = await closeRes.json().catch(() => ({}));
        if (!closeRes.ok || closeJson.ok === false) {
          window.alert(closeJson.error || 'Échec clôture de table');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 180));
      } catch (err) {
        console.error('Erreur clôture (close-table)', err);
        window.alert('Erreur réseau pendant la clôture de table');
        return;
      } finally {
        await refreshStaffViews();
        const latestMap = window.__latestTablesById || {};
        const latestTable = latestMap[id] || null;
        const latestStatus = latestTable && latestTable.status ? latestTable.status : currentStatus;
        if (latestStatus === 'Vide') closePanel();
        else showTableDetail(id, latestStatus);
      }
    }
    async function handleResolveAnomalyAction() {
      const apiBase = getApiBase();
      if (!apiBase || !summaryEntry) return;

      const answer = await showStaffChoiceModal({
        title: 'Traiter l’anomalie',
        message: 'Avez-vous bien encodé la commande dans la caisse ?',
        confirmLabel: 'Oui',
        dangerLabel: 'Non',
        cancelLabel: 'Annuler',
      });

      if (!answer || answer === 'no') return;

      try {
        const resp = await fetch(`${apiBase}/resolve-anomaly`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: id,
            sessionKey: summaryEntry.sessionKey || summaryEntry.sessionStartedAt || summaryEntry.openedAt,
            date: summaryEntry.date || null,
          }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || json.ok === false) {
          window.alert(json.error?.message || json.error || 'Impossible de traiter l anomalie');
          return;
        }
        await refreshStaffViews();
        closePanel();
      } catch (err) {
        console.error('Erreur traitement anomalie', err);
        window.alert('Erreur réseau pendant le traitement de l anomalie');
      }
    }


    if (cachedSummaryEntry) {
      info.textContent = isHistoryView
        ? `Historique (${allTickets.length} ticket${allTickets.length > 1 ? 's' : ''})`
        : `Session active (${allTickets.length} ticket${allTickets.length > 1 ? 's' : ''})`;

      const metaParts = [`Ouverte à ${cachedSummaryEntry.openedTime || formatTime(cachedSummaryEntry.openedAt)}`];
      if (cachedSummaryEntry.closedAt) metaParts.push(`Clôturée à ${cachedSummaryEntry.closedTime || formatTime(cachedSummaryEntry.closedAt)}`);
      if (cachedSummaryEntry.durationSeconds) metaParts.push(`Durée : ${formatDuration(cachedSummaryEntry.durationSeconds)}`);
      contextMeta.textContent = metaParts.join(' · ');
    } else {
      const tableMeta = (window.__latestTablesById || {})[id] || null;
      currentStatus = statusHint || (tableMeta && tableMeta.status) || 'Vide';
      cleared = !!(tableMeta && tableMeta.cleared);
      info.textContent = currentStatus === 'Vide' ? 'Aucune session active pour cette table.' : 'Synchronisation en cours...';
      contextMeta.textContent = '';

      let summaryData;
      try {
        summaryData = await fetchSummary(base);
      } catch (err) {
        if (isStaleRender()) return;
        console.error('Erreur fetch detail', err);
        info.textContent = 'Erreur de chargement';
        return;
      }

      if (isStaleRender()) return;

      window.__latestSummaryData = summaryData || { items: [], totals: {} };
      const sessionGroups = (summaryData.items || summaryData.tickets || []).filter((entry) => normId(entry.table) === id);
      const activeGroup = sessionGroups.find((entry) => entry.stateKind === 'active') || null;

      if (activeGroup) {
        const normalized = normalizeSummaryEntry(activeGroup, id, currentStatus);
        allTickets = normalized.tickets || [];
        total = normalized.total || 0;
        durationSeconds = normalized.durationSeconds;
        info.textContent = allTickets.length
          ? `Commandes en cours (${allTickets.length})`
          : currentStatus === 'Vide'
          ? 'Aucune commande pour cette table.'
          : 'Synchronisation en cours...';
        const metaParts = [];
        if (normalized.openedAt) metaParts.push(`Ouverte à ${normalized.openedTime}`);
        if (durationSeconds) metaParts.push(`Durée : ${formatDuration(durationSeconds)}`);
        contextMeta.textContent = metaParts.join(' · ');
      } else {
        allTickets = [];
        total = 0;
        info.textContent = currentStatus === 'Vide' ? 'Aucune session active pour cette table.' : 'Synchronisation en cours...';
        contextMeta.textContent = '';
      }
    }

    if (isStaleRender()) return;

    const displayStatus = mapDisplayStatus(currentStatus);

    const statusChip = document.createElement('div');
    statusChip.textContent = displayStatus;
    statusChip.style.display = 'inline-flex';
    statusChip.style.alignItems = 'center';
    statusChip.style.alignSelf = 'flex-start';
    statusChip.style.marginBottom = '14px';
    statusChip.style.borderRadius = '999px';
    statusChip.style.padding = '10px 16px';
    statusChip.style.fontSize = '15px';
    statusChip.style.fontWeight = '800';
    const statusStyle = getStatusBadgeStyle(displayStatus);
    statusChip.style.background = statusStyle.background;
    statusChip.style.color = statusStyle.color;
    panel.insertBefore(statusChip, contextMeta);

    const contextBits = [];
    const contextText = contextMeta.textContent.trim();
    if (contextText) {
      contextText
        .split('·')
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => contextBits.push(part));
    }
    contextMeta.innerHTML = '';
    contextMeta.style.display = 'flex';
    contextMeta.style.flexWrap = 'wrap';
    contextMeta.style.gap = '8px';
    contextMeta.style.marginBottom = '14px';

    contextBits.forEach((bit) => {
      const chip = document.createElement('span');
      chip.textContent = bit;
      chip.style.display = 'inline-flex';
      chip.style.alignItems = 'center';
      chip.style.padding = '7px 12px';
      chip.style.borderRadius = '999px';
      chip.style.background = 'rgba(99,102,241,0.12)';
      chip.style.border = '1px solid rgba(255,255,255,0.08)';
      chip.style.color = '#e2e8f0';
      chip.style.fontSize = '13px';
      chip.style.fontWeight = '600';
      contextMeta.appendChild(chip);
    });

    if (isHistoryView) {
      info.textContent = summaryEntry && summaryEntry.closureType === 'anomaly' ? 'Historique avec anomalie' : info.textContent;
    } else {
      info.textContent = allTickets.length
        ? `Session active (${allTickets.length} ticket${allTickets.length > 1 ? 's' : ''})`
        : info.textContent;
    }

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.flexDirection = 'column';
    actions.style.gap = '8px';

    const canShowActions = !isHistoryView && currentStatus !== 'Vide' && !cleared;
    const hasTickets = allTickets.length > 0;

    if (canShowActions) {
      const btnPrint = document.createElement('button');
      btnPrint.className = 'btn btn-primary';
      btnPrint.style.width = '100%';
      btnPrint.style.fontSize = '14px';
      btnPrint.style.fontWeight = '800';
      btnPrint.style.borderRadius = '14px';
      btnPrint.style.padding = '12px 14px';
      btnPrint.style.background = 'linear-gradient(135deg, #4f7df3 0%, #5b7cff 100%)';
      btnPrint.style.color = '#ffffff';

      const btnPay = document.createElement('button');
      btnPay.className = 'btn btn-primary';
      btnPay.style.width = '100%';
      btnPay.style.fontSize = '14px';
      btnPay.style.fontWeight = '800';
      btnPay.style.borderRadius = '14px';
      btnPay.style.padding = '12px 14px';
      btnPay.style.background = 'linear-gradient(135deg, #4f7df3 0%, #5b7cff 100%)';
      btnPay.style.color = '#ffffff';

      const btnCloseTable = document.createElement('button');
      btnCloseTable.className = 'btn btn-primary';
      btnCloseTable.style.width = '100%';
      btnCloseTable.style.fontSize = '14px';
      btnCloseTable.style.fontWeight = '800';
      btnCloseTable.style.borderRadius = '14px';
      btnCloseTable.style.padding = '12px 14px';
      btnCloseTable.textContent = 'Clôturer la table';
      btnCloseTable.dataset.role = 'close-in-progress-footer';
      btnCloseTable.style.backgroundColor = '#ef4444';

      function syncPrintButtonFromGlobal() {
        const timer = leftPrintTimers[id];
        if (!timer) {
          btnPrint.textContent = 'Imprimer maintenant';
          btnPrint.style.background = 'linear-gradient(135deg, #4f7df3 0%, #5b7cff 100%)';
          return;
        }
        const remain = timer.until - Date.now();
        if (remain <= 0) {
          btnPrint.textContent = 'Imprimer maintenant';
          btnPrint.style.background = 'linear-gradient(135deg, #4f7df3 0%, #5b7cff 100%)';
        } else {
          btnPrint.textContent = `Impression en cours (${Math.max(1, Math.ceil(remain / 1000))}s)`;
          btnPrint.style.background = '#f97316';
        }
      }

      function syncPayButtonFromGlobal() {
        btnCloseTable.style.display = 'block';

        if (currentStatus === 'En cours') {
          btnPay.style.display = 'none';
          return;
        }

        btnPay.style.display = hasTickets ? 'block' : 'none';
        if (!hasTickets) {
          btnPay.textContent = 'Encoder dans la caisse';
          btnPay.style.background = 'linear-gradient(135deg, #4f7df3 0%, #5b7cff 100%)';
          return;
        }

        const timer = leftPayTimers[id];
        if (timer) {
          const remain = timer.until - Date.now();
          if (remain > 0) {
            btnPay.textContent = `Annuler (${Math.max(1, Math.ceil(remain / 1000))}s)`;
            btnPay.style.background = '#f97316';
            return;
          }
        }
        if (currentStatus === 'Encodage caisse confirmé') {
          btnPay.textContent = 'Annuler';
          btnPay.style.backgroundColor = '#f97316';
        } else {
          btnPay.textContent = 'Encoder dans la caisse';
          btnPay.style.background = 'linear-gradient(135deg, #4f7df3 0%, #5b7cff 100%)';
        }
      }

      if (!hasTickets) {
        btnPrint.style.display = 'none';
      }

      syncPrintButtonFromGlobal();
      syncPayButtonFromGlobal();

      const syncIntervalId = setInterval(() => {
        if (!document.body.contains(btnPrint) && !document.body.contains(btnPay)) {
          clearInterval(syncIntervalId);
          return;
        }
        syncPrintButtonFromGlobal();
        syncPayButtonFromGlobal();
      }, 250);

      btnPrint.addEventListener('click', (e) => {
        e.stopPropagation();
        const leftBtn = document.querySelector(`.table[data-table="${id}"] .btn-print`);
        if (!leftBtn) return;
        leftBtn.click();
        window.setTimeout(() => closePanelIfStillCurrent(id), 5000);
      });

      btnPay.addEventListener('click', (e) => {
        e.stopPropagation();
        const leftBtn = document.querySelector(`.table[data-table="${id}"] .btn-paid`);
        if (!leftBtn) return;
        leftBtn.click();
        if (currentStatus !== 'En cours' && hasTickets) {
          window.setTimeout(() => closePanelIfStillCurrent(id), 5000);
        }
      });

      btnCloseTable.addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleCloseTableAction();
      });

      actions.appendChild(btnPrint);
      actions.appendChild(btnPay);
      actions.appendChild(btnCloseTable);
      panel.appendChild(actions);
    }

    if (!allTickets.length) {
      info.textContent = isHistoryView ? 'Aucune commande enregistrée pour cet historique.' : info.textContent;
    } else {
      allTickets.forEach((ticket) => panel.appendChild(makeTicketCard(ticket, id)));
    }

    const totalChipWrap = document.createElement('div');
    totalChipWrap.style.marginTop = allTickets.length ? '4px' : '8px';
    totalChipWrap.style.marginBottom = '18px';
    totalChipWrap.style.display = 'flex';
    totalChipWrap.style.justifyContent = 'flex-start';

    const totalChip = document.createElement('div');
    totalChip.style.display = 'inline-flex';
    totalChip.style.alignItems = 'center';
    totalChip.style.gap = '10px';
    totalChip.style.padding = '12px 16px';
    totalChip.style.borderRadius = '999px';
    totalChip.style.background = 'rgba(99,102,241,0.16)';
    totalChip.style.border = '1px solid rgba(255,255,255,0.12)';
    totalChip.style.color = '#f8fafc';

    const totalChipLabel = document.createElement('span');
    totalChipLabel.textContent = 'Montant total :';
    totalChipLabel.style.fontSize = '15px';
    totalChipLabel.style.fontWeight = '800';
    totalChipLabel.style.opacity = '0.92';

    const totalChipValue = document.createElement('span');
    totalChipValue.textContent = formatMoney(total);
    totalChipValue.style.fontSize = '22px';
    totalChipValue.style.fontWeight = '800';
    totalChipValue.style.letterSpacing = '0.01em';

    totalChip.appendChild(totalChipLabel);
    totalChip.appendChild(totalChipValue);
    totalChipWrap.appendChild(totalChip);
    panel.appendChild(totalChipWrap);
  }

  window.showTableDetail = showTableDetail;
})();
