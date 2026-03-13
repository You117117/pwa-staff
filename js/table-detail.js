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
    try {
      if (window.refreshSummary) await window.refreshSummary();
    } catch (err) {
      console.error('Erreur refreshSummary depuis détail', err);
    }
    try {
      if (window.refreshHistory) await window.refreshHistory();
    } catch (err) {
      console.error('Erreur refreshHistory depuis détail', err);
    }
  }

  function closePanel() {
    panel.style.display = 'none';
    panel.innerHTML = '';
    window.__currentDetailTableId = null;
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
        div.style.fontWeight = '500';
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
      wrapper.style.marginBottom = '6px';

      const line = document.createElement('div');
      line.style.display = 'flex';
      line.style.justifyContent = 'space-between';
      line.style.alignItems = 'center';
      line.style.fontSize = '15px';
      line.style.color = '#f9fafb';
      line.style.fontWeight = '700';

      const left = document.createElement('span');
      left.textContent = `${qty}× ${name}`;
      const right = document.createElement('span');
      right.textContent = typeof price === 'number' ? formatMoney(price) : '';
      line.appendChild(left);
      line.appendChild(right);
      wrapper.appendChild(line);

      if (lineClientName) {
        const clientLine = document.createElement('div');
        clientLine.textContent = `Client : ${lineClientName}`;
        clientLine.style.fontSize = '13px';
        clientLine.style.color = '#e5e7eb';
        clientLine.style.opacity = '0.9';
        clientLine.style.marginLeft = '4px';
        wrapper.appendChild(clientLine);
      }

      if (extras.length) {
        const extrasLine = document.createElement('div');
        extrasLine.textContent = `Suppléments : ${extras.join(', ')}`;
        extrasLine.style.fontSize = '13px';
        extrasLine.style.color = '#cbd5f5';
        extrasLine.style.opacity = '0.9';
        extrasLine.style.marginLeft = '4px';
        wrapper.appendChild(extrasLine);
      }

      return wrapper;
    });
  }

  function makeTicketCard(ticket) {
    const card = document.createElement('div');
    card.style.background = 'rgba(15,23,42,0.6)';
    card.style.border = '1px solid rgba(148,163,184,0.3)';
    card.style.borderRadius = '12px';
    card.style.padding = '12px 14px';
    card.style.marginBottom = '10px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '8px';
    card.style.color = '#e5e7eb';
    card.style.boxShadow = '0 8px 20px rgba(15,23,42,0.45)';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.gap = '8px';
    head.style.alignItems = 'center';
    head.style.flexWrap = 'wrap';

    const chipId = document.createElement('span');
    chipId.className = 'chip';
    chipId.textContent = ticket.id ? `Ticket #${ticket.id}` : 'Ticket';
    head.appendChild(chipId);

    const chipTime = document.createElement('span');
    chipTime.className = 'chip';
    chipTime.textContent = `Commandé à : ${ticket.time || formatTime(ticket.createdAt)}`;
    head.appendChild(chipTime);

    const chipTotal = document.createElement('span');
    chipTotal.className = 'chip';
    chipTotal.textContent = formatMoney(ticket.total);
    chipTotal.style.fontSize = '15px';
    chipTotal.style.fontWeight = '700';
    head.appendChild(chipTotal);

    card.appendChild(head);
    makeProductLines(ticket).forEach((line) => card.appendChild(line));
    return card;
  }

  async function fetchSummary(base) {
    const res = await fetch(`${base}/summary`, { cache: 'no-store' });
    return await res.json();
  }

  async function fetchTables(base) {
    const res = await fetch(`${base}/tables`, { cache: 'no-store' });
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

    return {
      id: summaryEntry.id || summaryEntry.sessionId || null,
      table: normId(summaryEntry.table || fallbackTableId),
      tableLabel: summaryEntry.tableLabel || summaryEntry.table || fallbackTableId,
      status: summaryEntry.displayStatus || summaryEntry.status || fallbackStatus || 'Vide',
      displayStatus: summaryEntry.displayStatus || summaryEntry.status || fallbackStatus || 'Vide',
      tickets: orderedTickets,
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
    };
  }

  async function showTableDetail(tableId, statusHint, opts) {
    const options = opts || {};
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
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    title.style.color = '#f9fafb';

    const btnClose = document.createElement('button');
    btnClose.textContent = 'Fermer';
    btnClose.className = 'btn';
    btnClose.style.padding = '4px 10px';
    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closePanel();
    });

    head.appendChild(title);
    head.appendChild(btnClose);
    panel.appendChild(head);

    const contextMeta = document.createElement('div');
    contextMeta.style.marginBottom = '10px';
    contextMeta.style.color = '#cbd5e1';
    contextMeta.style.fontSize = '13px';
    panel.appendChild(contextMeta);

    const info = document.createElement('div');
    info.style.marginBottom = '10px';
    info.style.color = '#e5e7eb';
    info.style.fontSize = '14px';
    info.textContent = 'Chargement...';
    panel.appendChild(info);

    const summaryEntry = normalizeSummaryEntry(options.summaryEntry, id, statusHint);
    let currentStatus = statusHint || 'Vide';
    let allTickets = [];
    let total = 0;
    let cleared = false;
    let isHistoryView = !!options.historyMode;
    let durationSeconds = null;

    if (summaryEntry) {
      currentStatus = summaryEntry.displayStatus || currentStatus;
      allTickets = summaryEntry.tickets || [];
      total = typeof summaryEntry.total === 'number' ? summaryEntry.total : 0;
      cleared = !!summaryEntry.isClosed;
      isHistoryView = summaryEntry.stateKind !== 'active' || !!options.historyMode;
      durationSeconds = summaryEntry.durationSeconds;
      info.textContent = isHistoryView
        ? `Historique (${allTickets.length} ticket${allTickets.length > 1 ? 's' : ''})`
        : `Session active (${allTickets.length} ticket${allTickets.length > 1 ? 's' : ''})`;

      const metaParts = [`Ouverte à ${summaryEntry.openedTime || formatTime(summaryEntry.openedAt)}`];
      if (summaryEntry.closedAt) metaParts.push(`Clôturée à ${summaryEntry.closedTime || formatTime(summaryEntry.closedAt)}`);
      if (summaryEntry.durationSeconds) metaParts.push(`Durée : ${formatDuration(summaryEntry.durationSeconds)}`);
      contextMeta.textContent = metaParts.join(' · ');
    } else {
      let summaryData;
      let tablesData;
      try {
        [summaryData, tablesData] = await Promise.all([fetchSummary(base), fetchTables(base)]);
      } catch (err) {
        console.error('Erreur fetch detail', err);
        info.textContent = 'Erreur de chargement';
        return;
      }

      const tableMeta = (tablesData.tables || []).find((t) => normId(t.id) === id);
      currentStatus = statusHint || (tableMeta && tableMeta.status) || 'Vide';
      cleared = !!(tableMeta && tableMeta.cleared);

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

    if (!allTickets.length) {
      info.textContent = isHistoryView ? 'Aucune commande enregistrée pour cet historique.' : info.textContent;
      const totalBoxEmpty = document.createElement('div');
      totalBoxEmpty.style.marginTop = '10px';
      totalBoxEmpty.style.marginBottom = '16px';
      totalBoxEmpty.innerHTML = `
        <div style="font-size:13px;opacity:.8;margin-bottom:4px;color:#e5e7eb;">Montant total</div>
        <div style="font-size:28px;font-weight:600;color:#f9fafb;">0.00 €</div>
      `;
      panel.appendChild(totalBoxEmpty);
    } else {
      allTickets.forEach((ticket) => panel.appendChild(makeTicketCard(ticket)));
      const totalBox = document.createElement('div');
      totalBox.style.marginTop = '10px';
      totalBox.style.marginBottom = '18px';
      totalBox.innerHTML = `
        <div style="font-size:13px;opacity:.8;margin-bottom:4px;color:#e5e7eb;">Montant total ${isHistoryView ? '(historique)' : '(session)'}</div>
        <div style="font-size:30px;font-weight:650;color:#f9fafb;">${formatMoney(total)}</div>
      `;
      panel.appendChild(totalBox);
    }

    const statusChip = document.createElement('div');
    statusChip.className = 'chip';
    statusChip.textContent = `Statut : ${currentStatus}`;
    statusChip.style.marginBottom = '12px';
    panel.appendChild(statusChip);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.flexDirection = 'column';
    actions.style.gap = '8px';

    const isActive = !isHistoryView && currentStatus !== 'Vide' && !cleared && allTickets.length > 0;

    if (isActive) {
      const btnPrint = document.createElement('button');
      btnPrint.className = 'btn btn-primary';
      btnPrint.style.width = '100%';
      btnPrint.style.fontSize = '14px';

      const btnPay = document.createElement('button');
      btnPay.className = 'btn btn-primary';
      btnPay.style.width = '100%';
      btnPay.style.fontSize = '14px';

      const btnCloseTable = document.createElement('button');
      btnCloseTable.className = 'btn btn-primary';
      btnCloseTable.style.width = '100%';
      btnCloseTable.style.fontSize = '14px';
      btnCloseTable.textContent = 'Clôturer la table';
      btnCloseTable.style.backgroundColor = '#ef4444';

      function syncPrintButtonFromGlobal() {
        const timer = leftPrintTimers[id];
        if (!timer) {
          btnPrint.textContent = 'Imprimer maintenant';
          btnPrint.style.backgroundColor = '';
          return;
        }
        const remain = timer.until - Date.now();
        if (remain <= 0) {
          btnPrint.textContent = 'Imprimer maintenant';
          btnPrint.style.backgroundColor = '';
        } else {
          btnPrint.textContent = `Impression en cours (${Math.max(1, Math.ceil(remain / 1000))}s)`;
          btnPrint.style.backgroundColor = '#f97316';
        }
      }

      function syncPayButtonFromGlobal() {
        const timer = leftPayTimers[id];
        if (timer) {
          const remain = timer.until - Date.now();
          if (remain > 0) {
            btnPay.textContent = `Annuler paiement (${Math.max(1, Math.ceil(remain / 1000))}s)`;
            btnPay.style.backgroundColor = '#f97316';
            btnCloseTable.style.display = 'none';
            return;
          }
        }
        if (currentStatus === 'Encodage caisse confirmé') {
          btnPay.textContent = 'Annuler paiement';
          btnPay.style.backgroundColor = '#f97316';
          btnCloseTable.style.display = 'none';
        } else {
          btnPay.textContent = 'Encoder en caisse';
          btnPay.style.backgroundColor = '';
          btnCloseTable.style.display = 'block';
        }
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
        if (leftBtn) leftBtn.click();
      });

      btnPay.addEventListener('click', (e) => {
        e.stopPropagation();
        const leftBtn = document.querySelector(`.table[data-table="${id}"] .btn-paid`);
        if (leftBtn) leftBtn.click();
      });

      btnCloseTable.addEventListener('click', async (e) => {
        e.stopPropagation();
        const apiBase = getApiBase();
        if (!apiBase) return;

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
      });

      actions.appendChild(btnPrint);
      actions.appendChild(btnPay);
      actions.appendChild(btnCloseTable);
      panel.appendChild(actions);
    }
  }

  window.showTableDetail = showTableDetail;
})();
