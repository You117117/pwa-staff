// === table-detail.js (version stable) ===
// Affiche le panneau de droite avec le détail de la table

(function () {
  // on crée le panneau une seule fois
  let panel = document.querySelector('#tableDetailPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'tableDetailPanel';
    panel.style.position = 'fixed';
    panel.style.top = '0';
    panel.style.right = '0';
    panel.style.width = '360px';
    panel.style.height = '100vh';
    panel.style.background = '#0f172a'; // même thème
    panel.style.borderLeft = '1px solid rgba(255,255,255,0.05)';
    panel.style.zIndex = '500';
    panel.style.display = 'none';
    panel.style.flexDirection = 'column';
    panel.style.padding = '16px';
    panel.style.overflowY = 'auto';
    panel.style.gap = '12px';
    document.body.appendChild(panel);
  }

  // petit helper pour récupérer l'URL API que l'utilisateur a mise
  function getApiBase() {
    const input = document.querySelector('#apiUrl');
    return input ? input.value.trim() : '';
  }

  // ferme le panneau
  function closePanel() {
    panel.style.display = 'none';
    panel.innerHTML = '';
  }

  // rendu d’un ticket
  function renderTicket(ticket) {
    const card = document.createElement('div');
    card.style.background = 'rgba(15,23,42,0.35)';
    card.style.border = '1px solid rgba(255,255,255,0.03)';
    card.style.borderRadius = '10px';
    card.style.padding = '10px 12px';
    card.style.marginBottom = '10px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '6px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.gap = '8px';
    header.style.alignItems = 'center';

    const chipId = document.createElement('span');
    chipId.className = 'chip';
    chipId.textContent = `#${ticket.id || ''}`;
    header.appendChild(chipId);

    // heure
    if (ticket.time) {
      const chipTime = document.createElement('span');
      chipTime.className = 'chip';
      chipTime.textContent = ticket.time;
      header.appendChild(chipTime);
    }

    // total
    if (ticket.total !== undefined) {
      const chipTotal = document.createElement('span');
      chipTotal.className = 'chip';
      chipTotal.textContent = `Total : ${ticket.total} €`;
      header.appendChild(chipTotal);
    }

    card.appendChild(header);

    // lignes d'articles
    if (Array.isArray(ticket.lines)) {
      ticket.lines.forEach((l) => {
        const line = document.createElement('div');
        line.textContent = `${l.qty}× ${l.label}`;
        card.appendChild(line);
      });
    } else if (ticket.label) {
      const line = document.createElement('div');
      line.textContent = ticket.label;
      card.appendChild(line);
    }

    return card;
  }

  // fonction principale appelée par app.js
  async function showTableDetail(tableId) {
    const base = getApiBase();
    if (!base) return;

    panel.innerHTML = '';
    panel.style.display = 'flex';

    // header de base
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

    // zone info (on remplira après le fetch)
    const info = document.createElement('div');
    info.textContent = 'Chargement...';
    info.style.marginBottom = '10px';
    panel.appendChild(info);

    try {
      // IMPORTANT : on va bien chercher sur la même API que le reste
      const res = await fetch(`${base}/table/${tableId}/session`);
      if (!res.ok) throw new Error('404');
      const data = await res.json();

      const tickets = data.tickets || [];

      // calcule le total cumulé
      let total = 0;
      tickets.forEach((t) => {
        if (typeof t.total === 'number') total += t.total;
      });

      info.textContent = `${tickets.length} ticket(s) • Total cumulé : ${total.toFixed(2)} €`;

      // liste des tickets
      tickets.forEach((t) => {
        panel.appendChild(renderTicket(t));
      });

    } catch (err) {
      info.textContent = 'Erreur';
      const e = document.createElement('div');
      e.textContent = '404';
      panel.appendChild(e);
    }
  }

  // on expose la fonction au global
  window.showTableDetail = showTableDetail;
})();
