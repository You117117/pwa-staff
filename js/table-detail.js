// table-detail.js — Version synchro simple
// - Affiche les tickets d'une table à partir de /summary
// - Même contenu sur PC et smartphone
// - Pas de tableMemory / ignoreIds / prevStatus locales
// - Boutons : Imprimer maintenant / Paiement confirmé

(function () {
  // Panneau sur la droite (on garde ton style général)
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

    // En-tête
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
      tickets = (data.tickets || []).filter(
        (t) => normId(t.table) === id
      );
    } catch (e) {
      console.error('[STAFF] erreur summary détail', e);
      info.textContent = 'Erreur de chargement';
      return;
    }

    if (!tickets.length) {
      info.textContent = 'Aucune commande pour cette table.';
      const totalBox = document.createElement('div');
      totalBox.style.marginTop = '8px';
      totalBox.style.marginBottom = '16px';
      totalBox.innerHTML = `
        <div style="font-size:12px;opacity:.7;margin-bottom:4px;color:#fff;">Montant total</div>
        <div style="font-size:28px;font-weight:600;color:#fff;">0.00 €</div>
      `;
      panel.appendChild(totalBox);
      return;
    }

    // Tri des tickets par date (du plus ancien au plus récent)
    tickets.sort((a, b) => {
      const ta = new Date(a.created_at || a.time_iso || 0).getTime();
      const tb = new Date(b.created_at || b.time_iso || 0).getTime();
      return ta - tb;
    });

    info.textContent = `${tickets.length} ticket(s) pour cette table`;

    tickets.forEach((t) => panel.appendChild(makeTicketCard(t)));

    const total = tickets.reduce(
      (acc, t) => (typeof t.total === 'number' ? acc + t.total : acc),
      0
    );
    const totalBox = document.createElement('div');
    totalBox.style.marginTop = '8px';
    totalBox.style.marginBottom = '16px';
    totalBox.innerHTML = `
      <div style="font-size:12px;opacity:.7;margin-bottom:4px;color:#fff;">Montant total</div>
      <div style="font-size:28px;font-weight:600;color:#fff;">${total.toFixed(
        2
      )} €</div>
    `;
    panel.appendChild(totalBox);

    // Boutons actions
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
      } catch (e) {
        console.error('[STAFF] erreur /print détail', e);
      }
    });

    btnPay.addEventListener('click', async () => {
      try {
        await fetch(`${base}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: id }),
        });
      } catch (e) {
        console.error('[STAFF] erreur /confirm détail', e);
      }
    });
  }

  window.showTableDetail = showTableDetail;
})();
