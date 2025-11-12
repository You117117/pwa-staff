// table-detail.js — filtre les anciens tickets et ré-ouvre si nouveau ticket non ignoré

(function () {
  let panel = document.querySelector('#tableDetailPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'tableDetailPanel';
    panel.style.position = 'fixed';
    panel.style.top = '0';
    panel.style.right = '0';
    panel.style.width = '360px';
    panel.style.height = '100vh';
    panel.style.background = '#0f172a';
    panel.style.borderLeft = '1px solid rgba(255,255,255,0.03)';
    panel.style.zIndex = '500';
    panel.style.display = 'none';
    panel.style.flexDirection = 'column';
    panel.style.padding = '16px';
    panel.style.overflowY = 'auto';
    panel.style.gap = '12px';
    document.body.appendChild(panel);
  }

  const normId = (id) => (id || '').trim().toUpperCase();

  function getApiBase() {
    const input = document.querySelector('#apiUrl');
    return input ? input.value.trim().replace(/\/+$/, '') : '';
  }

  function closePanel() {
    panel.style.display = 'none';
    panel.innerHTML = '';
  }

  function updateLeftTableStatus(tableId, newStatus) {
    const id = normId(tableId);
    const card = document.querySelector(`.table[data-table="${id}"]`);
    if (card) {
      const chips = card.querySelectorAll('.card-head .chip');
      if (chips.length >= 2) chips[1].textContent = newStatus;
    }
    if (window.lastKnownStatus) window.lastKnownStatus[id] = newStatus;
    if (newStatus === 'Vide' && window.localTableStatus) {
      delete window.localTableStatus[id];
    }
  }

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
        .join(', ');
    }
    return '';
  }

  function makeTicketCard(ticket) {
    const card = document.createElement('div');
    card.style.background = 'rgba(15,23,42,0.35)';
    card.style.border = '1px solid rgba(255,255,255,0.03)';
    card.style.borderRadius = '10px';
    card.style.padding = '10px 12px';
    card.style.marginBottom = '10px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '6px';
    card.style.color = '#fff';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.gap = '6px';
    head.style.alignItems = 'center';

    const chipId = document.createElement('span');
    chipId.className = 'chip';
    chipId.textContent = ticket.id ? `Ticket #${ticket.id}` : 'Ticket';
    head.appendChild(chipId);

    if (ticket.time) {
      const chipTime = document.createElement('span');
      chipTime.className = 'chip';
      chipTime.textContent = ticket.time;
      head.appendChild(chipTime);
    }

    card.appendChild(head);

    const bodyText = buildBodyText(ticket);
    if (bodyText) {
      const body = document.createElement('div');
      body.textContent = bodyText;
      body.style.fontSize = '13px';
      body.style.opacity = '0.95';
      body.style.color = '#fff';
      card.appendChild(body);
    }

    return card;
  }

  async function fetchSummary(base) {
    const res = await fetch(`${base}/summary`, { cache: 'no-store' });
    return await res.json();
  }

  async function showTableDetail(tableId) {
    const base = getApiBase();
    if (!base) return;
    const id = normId(tableId);

    const closedTables = (window.closedTables = window.closedTables || {});
    const ignore = closedTables[id]?.ignoreIds || new Set();

    panel.innerHTML = '';
    panel.style.display = 'flex';

    // header
    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'center';
    head.style.marginBottom = '12px';

    const title = document.createElement('h2');
    title.textContent = `Table ${id}`;
    title.style.fontSize = '16px';
    title.style.color = '#fff';

    const btnClose = document.createElement('button');
    btnClose.textContent = 'Fermer';
    btnClose.className = 'btn';
    btnClose.addEventListener('click', closePanel);

    head.appendChild(title);
    head.appendChild(btnClose);
    panel.appendChild(head);

    const info = document.createElement('div');
    info.style.marginBottom = '10px';
    info.style.color = '#fff';
    info.textContent = 'Chargement...';
    panel.appendChild(info);

    // on lit /summary
    let tickets = [];
    try {
      const data = await fetchSummary(base);
      const all = data.tickets || [];
      // filtre par table
      tickets = all.filter((t) => normId(t.table) === id);
    } catch {
      info.textContent = 'Erreur de chargement';
    }

    // Si table clôturée : on garde seulement les tickets NON ignorés
    let displayable = tickets;
    if (closedTables[id]) {
      const ign = closedTables[id].ignoreIds || new Set();
      displayable = tickets.filter((t) => {
        const tid = t.id !== undefined && t.id !== null ? String(t.id) : '';
        return tid && !ign.has(tid);
      });

      // s'il existe un ticket non ignoré → réouverture automatique
      if (displayable.length > 0) {
        delete closedTables[id];
      }
    }

    if (displayable.length === 0) {
      info.textContent = 'Aucune commande pour cette table.';
    } else {
      info.textContent = `${displayable.length} ticket(s) pour cette table`;
      displayable.forEach((t) => panel.appendChild(makeTicketCard(t)));
    }

    // total visible (sur les tickets affichés)
    const total = displayable.reduce((acc, t) => {
      if (typeof t.total === 'number') return acc + t.total;
      return acc;
    }, 0);
    const totalBox = document.createElement('div');
    totalBox.style.marginTop = '8px';
    totalBox.style.marginBottom = '16px';
    totalBox.innerHTML = `
      <div style="font-size:12px;opacity:.7;margin-bottom:4px;color:#fff;">Montant total</div>
      <div style="font-size:28px;font-weight:600;color:#fff;">${total.toFixed(2)} €</div>
    `;
    panel.appendChild(totalBox);

    // actions
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.flexDirection = 'column';
    actions.style.gap = '8px';

    const btnPrint = document.createElement('button');
    btnPrint.textContent = 'Imprimer maintenant';
    btnPrint.className = 'btn btn-primary';
    btnPrint.style.width = '100%';

    const btnPay = document.createElement('button');
    btnPay.textContent = 'Paiement confirmé';
    btnPay.className = 'btn btn-primary';
    btnPay.style.width = '100%';

    const btnCancelPay = document.createElement('button');
    btnCancelPay.textContent = 'Annuler le paiement';
    btnCancelPay.className = 'btn btn-secondary';
    btnCancelPay.style.width = '100%';

    actions.appendChild(btnPrint);
    actions.appendChild(btnPay);
    actions.appendChild(btnCancelPay);
    panel.appendChild(actions);

    // actions handlers
    btnPrint.addEventListener('click', async () => {
      try {
        await fetch(`${base}/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: id }),
        });
      } catch {}
      updateLeftTableStatus(id, 'En préparation');
      delete closedTables[id]; // si on réimprime, on assume réouverture
    });

    btnPay.addEventListener('click', async () => {
      try {
        await fetch(`${base}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: id }),
        });
      } catch {}
      updateLeftTableStatus(id, 'Payée');

      // 30s → Vide + mémoriser tickets courants à ignorer
      setTimeout(async () => {
        updateLeftTableStatus(id, 'Vide');
        // mémorise la liste des tickets actuels pour ne plus les afficher
        const ids = await (async () => {
          try {
            const data = await fetchSummary(base);
            const all = data.tickets || [];
            return all
              .filter((t) => normId(t.table) === id)
              .map((t) => t.id)
              .filter((v) => v !== undefined && v !== null)
              .map(String);
          } catch {
            return [];
          }
        })();
        closedTables[id] = { ignoreIds: new Set(ids) };
      }, 30 * 1000);
    });

    btnCancelPay.addEventListener('click', () => {
      updateLeftTableStatus(id, 'Commandée');
      delete closedTables[id];
    });
  }

  window.showTableDetail = showTableDetail;
})();
