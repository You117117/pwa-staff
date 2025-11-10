// === table-detail.js (version sans 404, basée sur /summary) ===

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

  function getApiBase() {
    const input = document.querySelector('#apiUrl');
    return input ? input.value.trim().replace(/\/+$/, '') : '';
  }

  function closePanel() {
    panel.style.display = 'none';
    panel.innerHTML = '';
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

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.gap = '6px';
    head.style.alignItems = 'center';

    const chipTable = document.createElement('span');
    chipTable.className = 'chip';
    chipTable.textContent = ticket.table || '';
    head.appendChild(chipTable);

    if (ticket.time) {
      const chipTime = document.createElement('span');
      chipTime.className = 'chip';
      chipTime.textContent = ticket.time;
      head.appendChild(chipTime);
    }

    if (typeof ticket.total === 'number') {
      const chipTotal = document.createElement('span');
      chipTotal.className = 'chip';
      chipTotal.textContent = `Total : ${ticket.total}`;
      head.appendChild(chipTotal);
    }

    card.appendChild(head);

    // si backend renvoie label
    if (ticket.label) {
      const body = document.createElement('div');
      body.textContent = ticket.label;
      card.appendChild(body);
    }

    return card;
  }

  async function showTableDetail(tableId) {
    const base = getApiBase();
    if (!base) return;

    panel.innerHTML = '';
    panel.style.display = 'flex';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'center';
    head.style.marginBottom = '12px';

    const title = document.createElement('h2');
    title.textContent = `Table ${tableId}`;
    title.style.fontSize = '16px';

    const btnClose = document.createElement('button');
    btnClose.textContent = 'Fermer';
    btnClose.className = 'btn';
    btnClose.addEventListener('click', closePanel);

    head.appendChild(title);
    head.appendChild(btnClose);
    panel.appendChild(head);

    const info = document.createElement('div');
    info.textContent = 'Chargement...';
    info.style.marginBottom = '10px';
    panel.appendChild(info);

    try {
      // ✅ on passe par /summary (celle qui marche)
      const res = await fetch(`${base}/summary`, { cache: 'no-store' });
      if (!res.ok) throw new Error('summary failed');
      const data = await res.json();

      const allTickets = data.tickets || [];
      // certains backends renvoient "t7" → on normalise
      const wanted = (tableId || '').trim().toUpperCase();
      const tickets = allTickets.filter((t) => {
        return (t.table || '').trim().toUpperCase() === wanted;
      });

      info.textContent = `${tickets.length} ticket(s) pour cette table`;

      if (!tickets.length) {
        const empty = document.createElement('div');
        empty.textContent = 'Aucune commande pour cette table.';
        panel.appendChild(empty);
        return;
      }

      tickets.forEach((t) => {
        panel.appendChild(makeTicketCard(t));
      });
    } catch (err) {
      info.textContent = 'Erreur de chargement';
      const code = document.createElement('div');
      code.textContent = 'Impossible de lire /summary';
      panel.appendChild(code);
    }
  }

  // on expose pour app.js
  window.showTableDetail = showTableDetail;
})();
