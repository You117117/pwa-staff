// table-detail.js — détail table (sessions, paiement 5s, clôture avec compte à rebours)

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

  // Flag pour éviter que le clic qui OUVRE le panel le ferme immédiatement
  window.__suppressOutsideClose = false;

  // Fermeture par clic en dehors du panneau
  document.addEventListener('click', (e) => {
    if (panel.style.display === 'none') return;
    if (window.__suppressOutsideClose) return;
    if (panel.contains(e.target)) return;
    closePanel();
  });

  const normId = (id) => (id || '').toString().trim().toUpperCase();

  function getApiBase() {
    const input = document.querySelector('#apiUrl');
    return input ? input.value.trim().replace(/\/+$/, '') : '';
  }

  function closePanel() {
    panel.style.display = 'none';
    panel.innerHTML = '';
    window.__currentDetailTableId = null;
  }

  // 🔹 Texte des lignes d’un ticket (chaque article sur une ligne)
  function buildBodyText(ticket) {
    if (ticket.label) return ticket.label;
    const src = Array.isArray(ticket.items)
      ? ticket.items
      : Array.isArray(ticket.lines)
      ? ticket.lines
      : null;
    if (src) {
      return src
        .map((it) => {
          const qty = it.qty || it.quantity || 1;
          const name = it.label || it.name || it.title || 'article';
          return `${qty}× ${name}`;
        })
        .join('\n'); // <= UNE LIGNE PAR ARTICLE
    }
    return '';
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

    const bodyText = buildBodyText(ticket);
    if (bodyText) {
      const body = document.createElement('div');
      body.textContent = bodyText;
      body.style.fontSize = '14px';
      body.style.lineHeight = '1.4';
      body.style.opacity = '0.98';
      body.style.color = '#f9fafb';
      body.style.fontWeight = '500';
      body.style.whiteSpace = 'pre-line'; // <= pour afficher chaque article sur sa propre ligne
      card.appendChild(body);
    }

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

  async function showTableDetail(tableId, statusHint) {
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

    const tableMeta = (tablesData.tables || []).find(
      (t) => normId(t.id) === id
    );

    let currentStatus = statusHint || (tableMeta && tableMeta.status) || 'Vide';
    const cleared = !!(tableMeta && tableMeta.cleared);
    const sessionStartAt = tableMeta && tableMeta.sessionStartAt
      ? tableMeta.sessionStartAt
      : null;

    // Tickets de la journée pour cette table
    let allTickets = (summaryData.tickets || []).filter(
      (t) => normId(t.table) === id
    );

    // On ne garde que ceux de la SESSION en cours (>= sessionStartAt)
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
      // Session active : on montre toutes les commandes de la session
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
        (acc, t) =>
          acc + (typeof t.total === 'number' ? t.total : 0),
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

    const statusChip = document.createElement('div');
    statusChip.className = 'chip';
    statusChip.textContent = `Statut : ${currentStatus}`;
    statusChip.style.marginBottom = '12px';
    panel.appendChild(statusChip);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.flexDirection = 'column';
    actions.style.gap = '8px';

    const isActive = currentStatus !== 'Vide' && !cleared;

    let btnPrint = null;
    let btnPay = null;
    let btnCloseTable = null;

    // Gestion du compte à rebours paiement (5s) — déjà en place
    let pendingPayClose = false;
    let paySeconds = 5;
    let payTimeoutId = null;
    let payIntervalId = null;

    function updatePayButtonLabel() {
      if (!btnPay) return;

      if (pendingPayClose) {
        const label = `Annuler paiement (${paySeconds}s)`;
        btnPay.textContent = label;
        btnPay.style.backgroundColor = '#f97316';
        return;
      }

      if (currentStatus === 'Payée') {
        btnPay.textContent = 'Annuler paiement';
        btnPay.style.backgroundColor = '#f97316';
      } else {
        btnPay.textContent = 'Paiement confirmé';
        btnPay.style.backgroundColor = '';
      }
    }

    // 🔹 Boutons Imprimer / Paiement
    if (isActive) {
      btnPrint = document.createElement('button');
      btnPrint.textContent = 'Imprimer maintenant';
      btnPrint.className = 'btn btn-primary';
      btnPrint.style.width = '100%';
      btnPrint.style.fontSize = '14px';

      btnPay = document.createElement('button');
      btnPay.className = 'btn btn-primary';
      btnPay.style.width = '100%';
      btnPay.style.fontSize = '14px';

      updatePayButtonLabel();

      actions.appendChild(btnPrint);
      actions.appendChild(btnPay);
    }

    // 🔹 Bouton Clôturer la table (avec compte à rebours et orange pendant l’annulation)
    if (isActive) {
      btnCloseTable = document.createElement('button');
      btnCloseTable.style.width = '100%';
      btnCloseTable.style.fontSize = '14px';
      btnCloseTable.className = 'btn btn-primary';

      let pendingClose = false;
      let pendingSeconds = 5;
      let timeoutId = null;
      let countdownIntervalId = null;

      function updateCloseButtonLabel() {
        if (!btnCloseTable) return;
        if (pendingClose) {
          btnCloseTable.textContent = `Annuler clôture (${pendingSeconds}s)`;
          btnCloseTable.style.backgroundColor = '#f97316'; // ORANGE pendant le compte à rebours
        } else {
          btnCloseTable.textContent = 'Clôturer la table';
          btnCloseTable.style.backgroundColor = '#ef4444'; // ROUGE par défaut
        }
      }
      updateCloseButtonLabel();

      btnCloseTable.addEventListener('click', async (e) => {
        e.stopPropagation();
        const apiBase = getApiBase();
        if (!apiBase) return;

        // Si une clôture est en cours → annuler
        if (pendingClose) {
          pendingClose = false;
          pendingSeconds = 5;
          if (timeoutId) clearTimeout(timeoutId);
          if (countdownIntervalId) clearInterval(countdownIntervalId);
          updateCloseButtonLabel();
          return;
        }

        // Démarre un compte à rebours de 5s avant la vraie clôture
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

        timeoutId = setTimeout(async () => {
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

    // 🔹 Listeners Imprimer / Paiement

    if (isActive && btnPrint) {
      btnPrint.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await fetch(`${base}/print`, {
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
          showTableDetail(id);
        }
      });
    }

    if (isActive && btnPay) {
      btnPay.addEventListener('click', async (e) => {
        e.stopPropagation();
        const apiBase = getApiBase();
        if (!apiBase) return;

        // Si un compte à rebours paiement est en cours → annuler
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

        // Si déjà Payée → comportement Annuler paiement
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

        // Paiement confirmé (normal)
        try {
          await fetch(`${apiBase}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: id }),
          });
        } catch (err) {
          console.error('Erreur /confirm (détail)', err);
        }

        // Statut immédiat côté UI
        currentStatus = 'Payée';
        statusChip.textContent = `Statut : ${currentStatus}`;

        // Démarrage du compte à rebours 5s
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
  }

  window.showTableDetail = showTableDetail;
})();
