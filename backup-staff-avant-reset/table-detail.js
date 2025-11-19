// table-detail.js — VERSION RESET
// - Affiche UNIQUEMENT le DERNIER ticket de la table
// - Pas de mémoires locales (ignoreIds, tableMemory, etc.)
// - Tout vient de /summary

(function () {
  const normId = (id) => (id || '').trim().toUpperCase();

  function getApiBase() {
    const input = document.querySelector('#apiUrl');
    const raw = (input && input.value) || '';
    return raw.trim().replace(/\/+$/, '');
  }

  async function fetchSummary(base) {
    const res = await fetch(`${base}/summary`, { cache: 'no-store' });
    return await res.json();
  }

  function buildBodyText(ticket) {
    if (ticket.label) return ticket.label;

    const src = Array.isArray(ticket.items)
      ? ticket.items
      : Array.isArray(ticket.lines)
      ? ticket.lines
      : null;

    if (!src) return '';

    return src
      .map((it) => {
        const qty = it.qty || it.quantity || 1;
        const name = it.label || it.name || it.title || 'article';
        return `${qty}× ${name}`;
      })
      .join(', ');
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

  // Panneau de détail (créé une fois)
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

  function closePanel() {
    panel.style.display = 'none';
    panel.innerHTML = '';
  }

  function updateLeftTableStatus(tableId, newStatus) {
    const id = normId(tableId);
    const card = document.querySelector(`.table[data-table="${id}"]`);
    if (!card) return;

    const chips = card.querySelectorAll('.card-head .chip');
    if (chips.length >= 2) {
      chips[1].textContent = newStatus;
    }
  }

  async function showTableDetail(tableId) {
    const base = getApiBase();
    if (!base) return;
    const id = normId(tableId);

    panel.innerHTML = '';
    panel.style.display = 'flex';

    // Header
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

    // Récupérer tous les tickets de la journée pour cette table
    let tickets = [];
    try {
      const data = await fetchSummary(base);
      tickets = (data.tickets || []).filter((t) => normId(t.table) === id);
    } catch (err) {
      console.error('[table-detail] erreur summary', err);
      info.textContent = 'Erreur de chargement';
      return;
    }

    if (!tickets.length) {
      info.textContent = 'Aucune commande pour cette table.';
      const totalBoxEmpty = document.createElement('div');
      totalBoxEmpty.style.marginTop = '8px';
      totalBoxEmpty.style.marginBottom = '16px';
      totalBoxEmpty.innerHTML = `
        <div style="font-size:12px;opacity:.7;margin-bottom:4px;color:#fff;">Montant total</div>
        <div style="font-size:28px;font-weight:600;color:#fff;">0.00 €</div>
      `;
      panel.appendChild(totalBoxEmpty);
      return;
    }

    // 🔥 On garde UNIQUEMENT le DERNIER ticket (par id numérique si possible)
    let lastTicket = null;
    tickets.forEach((t) => {
      const idNum =
        t.id !== undefined && t.id !== null && !isNaN(Number(t.id)) ? Number(t.id) : null;
      if (idNum === null) return;

      if (!lastTicket) {
        lastTicket = t;
      } else {
        const lastNum =
          lastTicket.id !== undefined &&
          lastTicket.id !== null &&
          !isNaN(Number(lastTicket.id))
            ? Number(lastTicket.id)
            : 0;
        if (idNum > lastNum) lastTicket = t;
      }
    });

    if (!lastTicket) {
      // fallback : dernier de la liste
      lastTicket = tickets[tickets.length - 1];
    }

    info.textContent = 'Dernier ticket pour cette table';
    panel.appendChild(makeTicketCard(lastTicket));

    const total =
      typeof lastTicket.total === 'number'
        ? lastTicket.total
        : Number(lastTicket.total || 0) || 0;

    const totalBox = document.createElement('div');
    totalBox.style.marginTop = '8px';
    totalBox.style.marginBottom = '16px';
    totalBox.innerHTML = `
      <div style="font-size:12px;opacity:.7;margin-bottom:4px;color:#fff;">Montant total</div>
      <div style="font-size:28px;font-weight:600;color:#fff;">${total.toFixed(2)} €</div>
    `;
    panel.appendChild(totalBox);

    // Actions
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

    actions.appendChild(btnPrint);
    actions.appendChild(btnPay);
    panel.appendChild(actions);

    btnPrint.addEventListener('click', async () => {
      try {
        await fetch(`${base}/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: id }),
        });
      } catch (err) {
        console.error('[table-detail] erreur /print', err);
      }
    });

    btnPay.addEventListener('click', async () => {
      try {
        await fetch(`${base}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: id }),
        });
      } catch (err) {
        console.error('[table-detail] erreur /confirm', err);
      }

      // feedback visuel immédiat à gauche
      updateLeftTableStatus(id, 'Payée');

      // le polling de app.js mettra à jour la suite
      setTimeout(closePanel, 300);
    });
  }

  window.showTableDetail = showTableDetail;
})();
