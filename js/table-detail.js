// table-detail.js — détail table synchronisé (aucune mémoire locale de statuts / tickets)

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

  const normId = (id) => (id || '').toString().trim().toUpperCase();

  function getApiBase() {
    const input = document.querySelector('#apiUrl');
    return input ? input.value.trim().replace(/\/+$/, '') : '';
  }

  function closePanel() {
    panel.style.display = 'none';
    panel.innerHTML = '';
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

    panel.innerHTML = '';
    panel.style.display = 'flex';

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

    let tickets = [];
    try {
      const data = await fetchSummary(base);
      tickets = (data.tickets || []).filter((t) => normId(t.table) === id);
    } catch (err) {
      console.error('Erreur fetch summary', err);
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

    // On trie les tickets par id croissant ou temps croissant
    tickets.sort((a, b) => {
      const aId = Number(a.id);
      const bId = Number(b.id);
      if (!Number.isNaN(aId) && !Number.isNaN(bId)) return aId - bId;
      if (a.time && b.time) return a.time.localeCompare(b.time);
      return 0;
    });

    const lastTicket = tickets[tickets.length - 1];

    info.textContent = lastTicket.id ? `Dernière commande (#${lastTicket.id})` : 'Dernière commande';
    panel.appendChild(makeTicketCard(lastTicket));

    const total =
      typeof lastTicket.total === 'number'
        ? lastTicket.total
        : tickets.reduce((acc, t) => (typeof t.total === 'number' ? acc + t.total : acc), 0);

    const totalBox = document.createElement('div');
    totalBox.style.marginTop = '8px';
    totalBox.style.marginBottom = '16px';
    totalBox.innerHTML = `
      <div style="font-size:12px;opacity:.7;margin-bottom:4px;color:#fff;">Montant total (dernière commande)</div>
      <div style="font-size:28px;font-weight:600;color:#fff;">${total.toFixed(2)} €</div>
    `;
    panel.appendChild(totalBox);

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
        console.error('Erreur /print (détail)', err);
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
        console.error('Erreur /confirm (détail)', err);
      } finally {
        // on referme et on laisse la liste principale se resynchroniser avec /tables
        closePanel();
        if (window.refreshTables) {
          window.refreshTables();
        }
      }
    });
  }

  window.showTableDetail = showTableDetail;
})();
