// table-detail.js — détail table (sessions, paiement 5s, clôture 5s, produits en gras avec prix)

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

  // Empêcher que le clic qui ouvre le panel le ferme directement
  window.__suppressOutsideClose = false;

  // 🔁 Auto-refresh de la vue détail
  const detailAutoRefresh = (window.detailAutoRefresh =
    window.detailAutoRefresh || { timerId: null, tableId: null });

  // 🔁 Timers globaux partagés avec le tableau de gauche (app.js)
  const leftPrintTimers = (window.leftPrintTimers = window.leftPrintTimers || {});
  const leftPayTimers = (window.leftPayTimers = window.leftPayTimers || {});

  // Fermeture par clic en dehors du panneau
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

  function closePanel() {
    panel.style.display = 'none';
    panel.innerHTML = '';
    window.__currentDetailTableId = null;

    // Stop auto-refresh
    if (detailAutoRefresh.timerId) {
      clearInterval(detailAutoRefresh.timerId);
      detailAutoRefresh.timerId = null;
      detailAutoRefresh.tableId = null;
    }
  }

  function startDetailAutoRefresh(id) {
    // Clear ancien timer éventuel
    if (detailAutoRefresh.timerId) {
      clearInterval(detailAutoRefresh.timerId);
      detailAutoRefresh.timerId = null;
      detailAutoRefresh.tableId = null;
    }

    detailAutoRefresh.tableId = id;
    detailAutoRefresh.timerId = setInterval(() => {
      const panelEl = document.querySelector('#tableDetailPanel');
      // Si le panneau est fermé, on stoppe tout
      if (!panelEl || panelEl.style.display === 'none') {
        clearInterval(detailAutoRefresh.timerId);
        detailAutoRefresh.timerId = null;
        detailAutoRefresh.tableId = null;
        return;
      }

      // Rafraîchit le détail sans relancer un nouveau timer
      showTableDetail(id, null, { skipAutoRefresh: true });
    }, 5000);
  }

  // 🔹 Lignes produits : chaque produit en gras + prix en gras à droite
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

      // Prénom du client pour cette ligne (ou à défaut, celui du ticket)
      const lineClientName =
        it.clientName ||
        it.customerName ||
        it.ownerName ||
        ticket.clientName ||
        null;

      // Suppléments / options
      let extrasSrc = null;
      if (Array.isArray(it.extras)) extrasSrc = it.extras;
      else if (Array.isArray(it.options)) extrasSrc = it.options;
      else if (Array.isArray(it.supplements)) extrasSrc = it.supplements;
      else if (Array.isArray(it.toppings)) extrasSrc = it.toppings;

      const extras =
        Array.isArray(extrasSrc)
          ? extrasSrc
              .map((e) =>
                typeof e === 'string'
                  ? e.trim()
                  : (e && (e.label || e.name || e.title || '')).trim()
              )
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
      if (typeof price === 'number') {
        right.textContent = `${price.toFixed(2)} €`;
      } else {
        right.textContent = '';
      }

      line.appendChild(left);
      line.appendChild(right);
      wrapper.appendChild(line);

      // Ligne "Client : Prénom"
      if (lineClientName) {
        const clientLine = document.createElement('div');
        clientLine.textContent = `Client : ${lineClientName}`;
        clientLine.style.fontSize = '13px';
        clientLine.style.color = '#e5e7eb';
        clientLine.style.opacity = '0.9';
        clientLine.style.marginLeft = '4px';
        wrapper.appendChild(clientLine);
      }

      // Ligne "Suppléments : ..."
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

    if (ticket.time) {
      const chipTime = document.createElement('span');
      chipTime.className = 'chip';
      chipTime.textContent = `Commandé à : ${ticket.time}`;
      head.appendChild(chipTime);
    }

    if (typeof ticket.total === 'number') {
      const chipTotal = document.createElement('span');
      chipTotal.className = 'chip';
      chipTotal.textContent = `${ticket.total.toFixed(2)} €`;
      chipTotal.style.fontSize = '15px';
      chipTotal.style.fontWeight = '700';
      chipTotal.style.letterSpacing = '0.02em';
      head.appendChild(chipTotal);
    }

    card.appendChild(head);

    // Lignes produits (en gras + prix en gras à droite)
    const productLines = makeProductLines(ticket);
    productLines.forEach((ln) => card.appendChild(ln));

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

  async function showTableDetail(tableId, statusHint, opts) {
    const options = opts || {};

    const base = getApiBase();
    if (!base) return;
    const id = normId(tableId);

    window.__currentDetailTableId = id;

    // Empêche le clic qui ouvre le panel de le fermer immédiatement
    window.__suppressOutsideClose = true;
    setTimeout(() => {
      window.__suppressOutsideClose = false;
    }, 0);

    panel.innerHTML = '';
    panel.style.display = 'flex';

    // ── Header ─────────────────────────────────────
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

    const info = document.createElement('div');
    info.style.marginBottom = '10px';
    info.style.color = '#e5e7eb';
    info.style.fontSize = '14px';
    info.textContent = 'Chargement...';
    panel.appendChild(info);

    // ── Fetch backend ──────────────────────────────
    let summaryData;
    let tablesData;
    try {
      [summaryData, tablesData] = await Promise.all([
        fetchSummary(base),
        fetchTables(base),
      ]);
    } catch (err) {
      console.error('Erreur fetch detail', err);
      info.textContent = 'Erreur de chargement';
      return;
    }

    const tableMeta = (tablesData.tables || []).find((t) => normId(t.id) === id);
    let currentStatus = statusHint || (tableMeta && tableMeta.status) || 'Vide';
    const cleared = !!(tableMeta && tableMeta.cleared);
    const sessionStartAt =
      tableMeta && tableMeta.sessionStartAt ? tableMeta.sessionStartAt : null;

    // Tickets pour cette table
    let allTickets = (summaryData.tickets || []).filter((t) => normId(t.table) === id);

    // Si sessionStartAt présent → on ne garde que la session en cours
    if (sessionStartAt) {
      const threshold = new Date(sessionStartAt).getTime();
      if (!Number.isNaN(threshold)) {
        allTickets = allTickets.filter((t) => {
          if (!t.createdAt) return true;
          const ts = new Date(t.createdAt).getTime();
          if (Number.isNaN(ts)) return true;
          return ts >= threshold;
        });
      }
    }

    // ── Tickets / Montant ──────────────────────────
    if (!allTickets.length || cleared) {
      info.textContent = 'Aucune commande pour cette table.';

      const totalBoxEmpty = document.createElement('div');
      totalBoxEmpty.style.marginTop = '10px';
      totalBoxEmpty.style.marginBottom = '16px';
      totalBoxEmpty.innerHTML = `
        <div style="font-size:13px;opacity:.8;margin-bottom:4px;color:#e5e7eb;">Montant total</div>
        <div style="font-size:28px;font-weight:600;color:#f9fafb;">0.00 €</div>
      `;
      panel.appendChild(totalBoxEmpty);
    } else {
      // Tri des tickets de la session
      allTickets.sort((a, b) => {
        const aTs = a.createdAt ? new Date(a.createdAt).getTime() : NaN;
        const bTs = b.createdAt ? new Date(b.createdAt).getTime() : NaN;
        if (!Number.isNaN(aTs) && !Number.isNaN(bTs)) return aTs - bTs;

        const aId = Number(a.id);
        const bId = Number(b.id);
        if (!Number.isNaN(aId) && !Number.isNaN(bId)) return aId - bId;
        if (a.time && b.time) return a.time.localeCompare(b.time);
        return 0;
      });

      info.textContent = `Commandes en cours (${allTickets.length})`;

      allTickets.forEach((t) => {
        panel.appendChild(makeTicketCard(t));
      });

      const total = allTickets.reduce(
        (acc, t) => acc + (typeof t.total === 'number' ? t.total : 0),
        0
      );

      const totalBox = document.createElement('div');
      totalBox.style.marginTop = '10px';
      totalBox.style.marginBottom = '18px';
      totalBox.innerHTML = `
        <div style="font-size:13px;opacity:.8;margin-bottom:4px;color:#e5e7eb;">Montant total (session)</div>
        <div style="font-size:30px;font-weight:650;color:#f9fafb;">${total.toFixed(
          2
        )} €</div>
      `;
      panel.appendChild(totalBox);
    }

    // ── Statut ─────────────────────────────────────
    const statusChip = document.createElement('div');
    statusChip.className = 'chip';
    statusChip.textContent = `Statut : ${currentStatus}`;
    statusChip.style.marginBottom = '12px';
    panel.appendChild(statusChip);

    // ── Actions (Imprimer / Paiement / Clôturer) ───
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.flexDirection = 'column';
    actions.style.gap = '8px';

    const isActive = currentStatus !== 'Vide' && !cleared && allTickets.length > 0;


    let btnPrint = null;
    let btnPay = null;
    let btnCloseTable = null;

    // Boutons Imprimer / Paiement
    if (isActive) {
      btnPrint = document.createElement('button');
      btnPrint.className = 'btn btn-primary';
      btnPrint.style.width = '100%';
      btnPrint.style.fontSize = '14px';

      btnPay = document.createElement('button');
      btnPay.className = 'btn btn-primary';
      btnPay.style.width = '100%';
      btnPay.style.fontSize = '14px';

      // --- Synchronisation avec les timers globaux (gauche / app.js) ---

      function syncPrintButtonFromGlobal() {
        if (!btnPrint) return;
        const timers = window.leftPrintTimers || {};
        const t = timers[id];
        if (!t) {
          btnPrint.textContent = 'Imprimer maintenant';
          btnPrint.style.backgroundColor = '';
          return;
        }
        const remain = t.until - Date.now();
        if (remain <= 0) {
          btnPrint.textContent = 'Imprimer maintenant';
          btnPrint.style.backgroundColor = '';
        } else {
          const sec = Math.max(1, Math.ceil(remain / 1000));
          btnPrint.textContent = `Impression en cours (${sec}s)`;
          btnPrint.style.backgroundColor = '#f97316';
        }
      }

      function syncPayButtonFromGlobal() {
        if (!btnPay) return;
        const timers = window.leftPayTimers || {};
        const t = timers[id];
        if (t) {
          const remain = t.until - Date.now();
          if (remain > 0) {
            const sec = Math.max(1, Math.ceil(remain / 1000));
            btnPay.textContent = `Annuler paiement (${sec}s)`;
            btnPay.style.backgroundColor = '#f97316';
            return;
          }
        }
        // Aucun timer actif → état basé sur le statut courant
        if (currentStatus === 'Payée') {
          btnPay.textContent = 'Annuler paiement';
          btnPay.style.backgroundColor = '#f97316';
        } else {
          btnPay.textContent = 'Paiement confirmé';
          btnPay.style.backgroundColor = '';
        }
      }

      // Sync initial
      syncPrintButtonFromGlobal();
      syncPayButtonFromGlobal();

      // Sync périodique toutes les 250ms (tant que le bouton existe dans le DOM)
      const syncIntervalId = setInterval(() => {
        if (!document.body.contains(btnPrint) && !document.body.contains(btnPay)) {
          clearInterval(syncIntervalId);
          return;
        }
        syncPrintButtonFromGlobal();
        syncPayButtonFromGlobal();

        // Synchroniser aussi la visibilité du bouton de clôture
        if (btnCloseTable) {
          const payTimerGlobalForClose = leftPayTimers[id];
          if (currentStatus === 'Payée' || payTimerGlobalForClose) {
            btnCloseTable.style.display = 'none';
          } else {
            btnCloseTable.style.display = 'block';
          }
        }
      }, 250);

      actions.appendChild(btnPrint);
      actions.appendChild(btnPay);
    }

    // Clôturer la table : bouton rouge + mode "Annuler clôture (5s)" orange
    if (isActive) {
      btnCloseTable = document.createElement('button');
      btnCloseTable.style.width = '100%';
      btnCloseTable.style.fontSize = '14px';
      btnCloseTable.className = 'btn btn-primary';

      let pendingClose = false;
      let pendingSeconds = 5;
      let closeTimeoutId = null;
      let countdownIntervalId = null;

      function updateCloseButtonLabel() {
        if (!btnCloseTable) return;
        if (pendingClose) {
          btnCloseTable.textContent = `Annuler clôture (${pendingSeconds}s)`;
          btnCloseTable.style.backgroundColor = '#f97316'; // ORANGE pendant compte à rebours
        } else {
          btnCloseTable.textContent = 'Clôturer la table';
          btnCloseTable.style.backgroundColor = '#ef4444'; // ROUGE par défaut
        }
      }
      updateCloseButtonLabel();

      // Cacher le bouton de clôture si paiement confirmé ou timer de paiement actif (synchro avec app.js)
      const payTimerGlobalForClose = leftPayTimers[id];
      if (currentStatus === 'Payée' || payTimerGlobalForClose) {
        btnCloseTable.style.display = 'none';
      } else {
        btnCloseTable.style.display = 'block';
      }


      btnCloseTable.addEventListener('click', async (e) => {
        e.stopPropagation();
        const apiBase = getApiBase();
        if (!apiBase) return;

        // Si une clôture est déjà en cours → annuler
        if (pendingClose) {
          pendingClose = false;
          pendingSeconds = 5;
          if (closeTimeoutId) clearTimeout(closeTimeoutId);
          if (countdownIntervalId) clearInterval(countdownIntervalId);
          updateCloseButtonLabel();
          return;
        }

        // Démarre compte à rebours 5s
        pendingClose = true;
        pendingSeconds = 5;
        updateCloseButtonLabel();

        countdownIntervalId = setInterval(() => {
          if (!pendingClose) {
            clearInterval(countdownIntervalId);
            return;
          }
          pendingSeconds -= 1;
          if (pendingSeconds <= 0) {
            pendingSeconds = 0;
            clearInterval(countdownIntervalId);
          }
          updateCloseButtonLabel();
        }, 1000);

        closeTimeoutId = setTimeout(async () => {
          if (!pendingClose) return; // annulé entre-temps
          pendingClose = false;
          pendingSeconds = 5;

          try {
            await fetch(`${apiBase}/close-table`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: id }),
            });
          } catch (err) {
            console.error('Erreur clôture (close-table)', err);
          } finally {
            if (window.refreshTables) {
              window.refreshTables();
            }
            showTableDetail(id);
          }
        }, 5000);
      });

      actions.appendChild(btnCloseTable);
    }

    if (actions.children.length > 0) {
      panel.appendChild(actions);
    }

    // ── Listeners Imprimer / Paiement ──────────────

    if (isActive && btnPrint) {
      btnPrint.addEventListener('click', (e) => {
        e.stopPropagation();
        // Délègue l'action au bouton "Imprimer" du tableau de gauche (cerveau unique dans app.js)
        const leftBtn = document.querySelector(`.table[data-table="${id}"] .btn-print`);
        if (leftBtn) {
          leftBtn.click();
        }
      });
    }

    if (isActive && btnPay) {
      btnPay.addEventListener('click', (e) => {
        e.stopPropagation();
        // Délègue l'action au bouton Paiement du tableau de gauche (cerveau unique dans app.js)
        const leftBtn = document.querySelector(`.table[data-table="${id}"] .btn-paid`);
        if (leftBtn) {
          leftBtn.click();
        }
      });
    }

    // ── Listeners Imprimer / Paiement ──────────────

    if (isActive && btnPrint) {
      btnPrint.addEventListener('click', async (e) => {
        e.stopPropagation();
        const apiBase = getApiBase();
        if (!apiBase) return;

        // Si impression déjà en cours pour cette table → on ignore
        const existing = detailPrintTimers[id];
        if (existing) return;

        // Démarre un nouveau timer global pour cette table
        const until = Date.now() + 5000;
        detailPrintTimers[id] = { until };

        // Démarre le compte à rebours local
        pendingPrint = true;
        printSeconds = 5;
        updatePrintButtonLabel();

        if (printIntervalId) clearInterval(printIntervalId);
        if (printTimeoutId) clearTimeout(printTimeoutId);

        printIntervalId = setInterval(() => {
          if (!pendingPrint) {
            clearInterval(printIntervalId);
            return;
          }
          const remain = detailPrintTimers[id]
            ? detailPrintTimers[id].until - Date.now()
            : 0;
          if (remain <= 0) {
            clearInterval(printIntervalId);
            pendingPrint = false;
            printSeconds = 5;
            delete detailPrintTimers[id];
            updatePrintButtonLabel();
            return;
          }
          printSeconds = Math.max(1, Math.ceil(remain / 1000));
          updatePrintButtonLabel();
        }, 1000);

        printTimeoutId = setTimeout(() => {
          pendingPrint = false;
          printSeconds = 5;
          delete detailPrintTimers[id];
          updatePrintButtonLabel();
        }, 5000);

        // Appel API /print (comme avant)
        try {
          await fetch(`${apiBase}/print`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: id }),
          });
        } catch (err) {
          console.error('Erreur /print (détail)', err);
        } finally {
          if (window.refreshTables) {
            window.refreshTables();
          }
          // On laisse l'auto-refresh gérer le rechargement du détail
        }
      });
    }

    if (isActive && btnPay) {
      btnPay.addEventListener('click', async (e) => {
        e.stopPropagation();
        const apiBase = getApiBase();
        if (!apiBase) return;

        // Si un compte à rebours paiement est en cours → annuler paiement
        if (pendingPayClose) {
          pendingPayClose = false;
          paySeconds = 5;
          if (payTimeoutId) clearTimeout(payTimeoutId);
          if (payIntervalId) clearInterval(payIntervalId);

          try {
            await fetch(`${apiBase}/cancel-confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: id }),
            });
          } catch (err) {
            console.error('Erreur /cancel-confirm (détail)', err);
          } finally {
            if (btnCloseTable) {
              btnCloseTable.style.display = 'block';
            }
            updatePayButtonLabel();
            if (window.refreshTables) {
              window.refreshTables();
            }
            showTableDetail(id);
          }

          return;
        }

        // Si déjà Payée → annuler paiement (sans compte à rebours actif)
        if (currentStatus === 'Payée') {
          try {
            await fetch(`${apiBase}/cancel-confirm`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ table: id }),
            });
          } catch (err) {
            console.error('Erreur /cancel-confirm (détail)', err);
          } finally {
            if (btnCloseTable) {
              btnCloseTable.style.display = 'block';
            }
            if (window.refreshTables) {
              window.refreshTables();
            }
            showTableDetail(id);
          }
          return;
        }

        // Paiement confirmé
        try {
          await fetch(`${apiBase}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: id }),
          });
        } catch (err) {
          console.error('Erreur /confirm (détail)', err);
        }

        // Statut direct côté UI
        currentStatus = 'Payée';
        statusChip.textContent = `Statut : ${currentStatus}`;

        // Démarre compte à rebours 5s
        pendingPayClose = true;
        paySeconds = 5;

        if (btnCloseTable) {
          btnCloseTable.style.display = 'none';
        }

        updatePayButtonLabel();

        payIntervalId = setInterval(() => {
          if (!pendingPayClose) {
            clearInterval(payIntervalId);
            return;
          }
          paySeconds -= 1;
          if (paySeconds <= 0) {
            paySeconds = 0;
            clearInterval(payIntervalId);
          }
          updatePayButtonLabel();
        }, 1000);

        payTimeoutId = setTimeout(() => {
          if (!pendingPayClose) return;
          pendingPayClose = false;
          paySeconds = 5;
          if (window.refreshTables) {
            window.refreshTables();
          }
          showTableDetail(id);
        }, 5000);
      });
    }

    // 🔁 Démarrer l’auto-refresh si ce n’est pas un refresh interne
    if (!options.skipAutoRefresh) {
      startDetailAutoRefresh(id);
    }
  }

  window.showTableDetail = showTableDetail;
})();
