// === table-detail.js v8 ===
// panneau de droite + actions staff (imprimer / paiement)

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
    // on met à jour les mémoires globales du app.js si elles existent
    if (window.lastKnownStatus) {
      window.lastKnownStatus[id] = newStatus;
    }
    // si on a aussi le store de statuts forcés (dans app.js), on le wipe en cas de clôture
    if (newStatus === 'Vide') {
      if (window.localTableStatus) {
        delete window.localTableStatus[id];
      }
    }
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

    // numéro de ticket bien visible
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

    // détail
    if (ticket.label) {
      const line = document.createElement('div');
      line.textContent = ticket.label;
      card.appendChild(line);
    }

    return card;
  }

  async function showTableDetail(tableId) {
    const base = getApiBase();
    if (!base) return;

    const normId = (tableId || '').trim().toUpperCase();

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

    let tickets = [];
    let total = 0;

    try {
      // on récupère /summary et on filtre sur la table
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

    // affichage des tickets
    tickets.forEach((t) => {
      panel.appendChild(makeTicketCard(t));
    });

    // total bien visible
    const totalBox = document.createElement('div');
    totalBox.style.marginTop = '8px';
    totalBox.style.marginBottom = '16px';
    totalBox.innerHTML = `
      <div style="font-size:12px;opacity:.7;margin-bottom:4px;">Montant total</div>
      <div style="font-size:28px;font-weight:600;">${total.toFixed(2)} €</div>
    `;
    panel.appendChild(totalBox);

    // zone boutons
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

    // === comportements ===

    // 1) imprimer → on laisse cliquer plusieurs fois
    btnPrint.addEventListener('click', async () => {
      // appel backend d'impression (si dispo)
      try {
        await fetch(`${base}/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: normId }),
        });
      } catch (e) {
        // on ignore pour l'instant
      }
      // on met la table en préparation côté UI
      updateLeftTableStatus(normId, 'En préparation');
    });

    // 2) paiement confirmé → status "Payée" 30s puis Vide
    btnPay.addEventListener('click', async () => {
      // on peut prévenir le backend
      try {
        await fetch(`${base}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: normId }),
        });
      } catch (e) {
        // pas bloquant
      }
      updateLeftTableStatus(normId, 'Payée');

      // après 30s on clôture (revient à Vide)
      setTimeout(() => {
        updateLeftTableStatus(normId, 'Vide');
      }, 30 * 1000);
    });

    // 3) annuler paiement → on revient à "Commandée"
    btnCancelPay.addEventListener('click', () => {
      updateLeftTableStatus(normId, 'Commandée');
    });
  }

  // exposé au reste de l'app
  window.showTableDetail = showTableDetail;
})();
