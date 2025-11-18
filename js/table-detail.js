// table-detail.js — panneau détail simplifié : montre UNIQUEMENT le dernier ticket de la table

(function () {
  // Helpers
  function normId(id) {
    return (id || "").trim().toUpperCase();
  }

  function getApiBase() {
    const inp = document.querySelector('#apiUrl');
    const raw = (inp && inp.value) || '';
    const url = raw.trim().replace(/\/+$/, '');
    if (url) return url;

    // fallback éventuel depuis localStorage (si tu stockes l'API)
    try {
      const saved = localStorage.getItem('staff-api') || localStorage.getItem('api_url') || '';
      return (saved || '').trim().replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  async function fetchSummary(base) {
    const res = await fetch(`${base}/summary`, { cache: 'no-store' });
    return res.json();
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
    chipId.textContent = `#${ticket.id ?? '?'}`;
    chipId.style.fontSize = '11px';
    chipId.style.padding = '2px 6px';
    chipId.style.borderRadius = '999px';
    chipId.style.border = '1px solid rgba(148,163,184,0.7)';
    chipId.style.color = '#e5e7eb';

    const chipTime = document.createElement('span');
    chipTime.textContent = ticket.time || '--:--';
    chipTime.style.fontSize = '11px';
    chipTime.style.padding = '2px 6px';
    chipTime.style.borderRadius = '999px';
    chipTime.style.border = '1px solid rgba(148,163,184,0.7)';
    chipTime.style.color = '#e5e7eb';

    head.appendChild(chipId);
    head.appendChild(chipTime);

    const body = document.createElement('div');
    body.style.fontSize = '13px';
    body.style.opacity = '0.9';
    body.textContent = buildBodyText(ticket);

    const foot = document.createElement('div');
    foot.style.display = 'flex';
    foot.style.justifyContent = 'flex-end';
    foot.style.fontWeight = '600';
    foot.style.fontSize = '15px';
    foot.textContent =
      typeof ticket.total === 'number' ? `${ticket.total.toFixed(2)} €` : `${ticket.total || ''}`;

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(foot);

    return card;
  }

  // --- Création / récupération du panneau fixe à droite
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
    panel.style.boxSizing = 'border-box';
    panel.style.overflow = 'auto';
    document.body.appendChild(panel);
  }

  function closePanel() {
    panel.style.display = 'none';
    panel.innerHTML = '';
  }

  // --- Mise à jour du statut dans la liste de gauche (carte table)
  function updateLeftTableStatus(id, status) {
    const grid = document.querySelector('#tables');
    if (!grid) return;
    const card = grid.querySelector(`.table[data-table="${id}"]`);
    if (!card) return;
    const chips = card.querySelectorAll('.chip');
    if (chips.length >= 2) {
      chips[1].textContent = status;
    }
  }

  // --- Fonction principale appelée depuis app.js : window.showTableDetail(...)
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
    btnClose.style.background = '#1f2937';
    btnClose.style.borderColor = '#374151';
    btnClose.addEventListener('click', closePanel);

    head.appendChild(title);
    head.appendChild(btnClose);
    panel.appendChild(head);

    // Info + conteneur
    const info = document.createElement('div');
    info.style.marginBottom = '10px';
    info.style.color = '#fff';
    info.style.fontSize = '13px';
    info.textContent = 'Chargement...';
    panel.appendChild(info);

    // Charger les tickets depuis /summary
    let tickets = [];
    try {
      const data = await fetchSummary(base);
      tickets = (data.tickets || []).filter((t) => normId(t.table) === id);
    } catch (err) {
      console.error('[table-detail] Erreur summary', err);
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

    // 🔥 NOUVEAU COMPORTEMENT ICI :
    // On ne garde QUE le DERNIER ticket de la table (id max numérique)
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

    // Si impossible de déterminer par id, on prend par défaut le dernier dans la liste
    if (!lastTicket) {
      lastTicket = tickets[tickets.length - 1];
    }

    const displayable = [lastTicket];

    info.textContent = `Dernier ticket pour cette table`;
    displayable.forEach((t) => panel.appendChild(makeTicketCard(t)));

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

    // --- Actions (Imprimer / Paiement confirmé)
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.flexDirection = 'column';
    actions.style.gap = '8px';

    const btnPrint = document.createElement('button');
    btnPrint.textContent = 'Imprimer maintenant';
    btnPrint.className = 'btn';
    btnPrint.style.width = '100%';

    const btnPay = document.createElement('button');
    btnPay.textContent = 'Paiement confirmé';
    btnPay.className = 'btn';
    btnPay.style.width = '100%';

    actions.appendChild(btnPrint);
    actions.appendChild(btnPay);
    panel.appendChild(actions);

    // --- Logique boutons

    btnPrint.addEventListener('click', async () => {
      try {
        await fetch(`${base}/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: id }),
        });
      } catch (err) {
        console.error('[table-detail] Erreur /print', err);
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
        console.error('[table-detail] Erreur /confirm', err);
      }

      // Mise à jour locale simple (le polling de app.js finira d’aligner)
      if (!window.lastKnownStatus) window.lastKnownStatus = {};
      window.lastKnownStatus[id] = 'Payée';
      updateLeftTableStatus(id, 'Payée');

      // On peut fermer le panneau après confirmation
      setTimeout(closePanel, 300);
    });
  }

  // Expose la fonction au reste de l’appli
  window.showTableDetail = showTableDetail;
})();
