// === table-detail.js v11 ===
// panneau de droite avec détail de commande synchronisé + prise en compte des tables clôturées

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

  // met à jour la carte de gauche
  function updateLeftTableStatus(tableId, newStatus) {
    const id = (tableId || '').trim().toUpperCase();
    const card = document.querySelector(`.table[data-table="${id}"]`);
    if (card) {
      const chips = card.querySelectorAll('.card-head .chip');
      if (chips.length >= 2) {
        chips[1].textContent = newStatus;
      }
    }
    if (window.lastKnownStatus) {
      window.lastKnownStatus[id] = newStatus;
    }
    if (newStatus === 'Vide' && window.localTableStatus) {
      delete window.localTableStatus[id];
    }
  }

  // même logique que dans app.js → on fabrique un texte lisible
  function buildBodyText(ticket) {
    if (ticket.label) return ticket.label;

    const src =
      Array.isArray(ticket.items)
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

    // détail (même logique que résumé du jour)
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

  async function showTableDetail(tableId) {
    const base = getApiBase();
    if (!base) return;

    const normId = (tableId || '').trim().toUpperCase();

    // on récupère la liste des tables clôturées partagée par app.js
    const closedTables = (window.closedTables = window.closedTables || {});

    panel.innerHTML = '';
    panel.style.display = 'flex';

    // header
    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'center';
    head.style.marginBottom = '12px';

    const title = document.createElement('h2');
    title.textContent = `Table ${normId}`;
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
    panel.appendChild(info);

    // si la table est clôturée → on n'affiche pas l'ancienne commande
    if (closedTables[normId]) {
      info.textContent = 'Aucune commande pour cette table.';
      // on met quand même les boutons pour réimprimer / réouvrir si tu veux
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.flexDirection = 'column';
      actions.style.gap = '8px';

      const btnPrint = document.createElement('button');
      btnPrint.textContent = 'Imprimer maintenant';
      btnPrint.className = 'btn btn-primary';
      btnPrint.style.width = '100%';

      const btnCancelPay = document.createElement('button');
      btnCancelPay.textContent = 'Annuler le paiement';
      btnCancelPay.className = 'btn btn-secondary';
      btnCancelPay.style.width = '100%';

      actions.appendChild(btnPrint);
      actions.appendChild(btnCancelPay);
      panel.appendChild(actions);

      // on laisse ces actions mini
      btnPrint.addEventListener('click', async () => {
        try {
          await fetch(`${base}/print`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: normId }),
          });
        } catch {}
        // si on réimprime après clôture, on peut décider de repasser en préparation
        updateLeftTableStatus(normId, 'En préparation');
        delete closedTables[normId];
      });

      btnCancelPay.addEventListener('click', () => {
        // si on annule on rouvre la table
        delete closedTables[normId];
        updateLeftTableStatus(normId, 'Commandée');
      });

      return;
    }

    // sinon on affiche vraiment la commande depuis /summary
    info.textContent = 'Chargement...';

    let tickets = [];
    let total = 0;

    try {
      const res = await fetch(`${base}/summary`, { cache: 'no-store' });
      const data = await res.json();
      const allTickets = data.tickets || [];
      tickets = allTickets.filter(
        (t) => (t.table || '').trim().toUpperCase() === normId
      );
      total = tickets.reduce((acc, t) => {
        if (typeof t.total === 'number') return acc + t.total;
        return acc;
      }, 0);
      info.textContent = `${tickets.length} ticket(s) pour cette table`;
    } catch (err) {
      info.textContent = 'Erreur de chargement';
    }

    tickets.forEach((t) => {
      panel.appendChild(makeTicketCard(t));
    });

    // total
    const totalBox = document.createElement('div');
    totalBox.style.marginTop = '8px';
    totalBox.style.marginBottom = '16px';
    totalBox.innerHTML = `
      <div style="font-size:12px;opacity:.7;margin-bottom:4px;color:#fff;">Montant total</div>
      <div style="font-size:28px;font-weight:600;color:#fff;">${total.toFixed(2)} €</div>
    `;
    panel.appendChild(totalBox);

    // boutons
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

    // actions
    btnPrint.addEventListener('click', async () => {
      try {
        await fetch(`${base}/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: normId }),
        });
      } catch {}
      updateLeftTableStatus(normId, 'En préparation');
    });

    btnPay.addEventListener('click', async () => {
      try {
        await fetch(`${base}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: normId }),
        });
      } catch {}
      updateLeftTableStatus(normId, 'Payée');

      setTimeout(() => {
        // on passe en vide + on marque la table comme clôturée (ID normalisé)
        updateLeftTableStatus(normId, 'Vide');
        closedTables[normId] = true;
      }, 30 * 1000);
    });

    btnCancelPay.addEventListener('click', () => {
      updateLeftTableStatus(normId, 'Commandée');
    });
  }

  window.showTableDetail = showTableDetail;
})();
