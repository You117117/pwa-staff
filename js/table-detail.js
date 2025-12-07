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

  window.__suppressOutsideClose = false;
  const normId = (id) => (id || '').toString().trim().toUpperCase();
  const getApiBase = () => {
    const input = document.querySelector('#apiUrl');
    return input ? input.value.trim().replace(/\/+$/, '') : '';
  };

  function makeProductLines(ticket) {
    const src = ticket.items || ticket.lines || [];

    return src.map((it) => {
      const qty = it.qty || 1;
      const name = it.name || it.label || 'article';
      const price = it.price || null;

      const lineClientName =
        it.clientName ||
        ticket.clientName ||
        it.ownerName ||
        it.customerName ||
        null;

      const extras = Array.isArray(it.extras || it.supplements || it.options)
        ? (it.extras || it.supplements || it.options).filter(Boolean)
        : [];

      const wrapper = document.createElement('div');
      wrapper.style.marginBottom = '12px';
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '2px';

      // ---- CLIENT AU-DESSUS ----
      if (lineClientName) {
        const c = document.createElement('div');
        c.textContent = `Client : ${lineClientName}`;
        c.style.fontSize = '13px';
        c.style.color = '#e5e7eb';
        c.style.fontWeight = '600';
        wrapper.appendChild(c);
      }

      // ---- LIGNE PRODUIT ----
      const line = document.createElement('div');
      line.style.display = 'flex';
      line.style.justifyContent = 'space-between';
      line.style.alignItems = 'center';
      line.style.fontSize = '15px';
      line.style.color = '#f9fafb';
      line.style.fontWeight = '700';

      const left = document.createElement('span');
      left.textContent = `${qty}× ${name}`;

      const right = document.createElement('span');
      right.textContent = price ? `${price.toFixed(2)} €` : '';

      line.appendChild(left);
      line.appendChild(right);

      wrapper.appendChild(line);

      // ---- SUPPLÉMENTS EN LISTE ----
      if (extras.length) {
        const label = document.createElement('div');
        label.textContent = 'Suppléments :';
        label.style.fontSize = '13px';
        label.style.fontWeight = '700';
        label.style.color = '#cbd5f5';
        label.style.marginTop = '4px';
        wrapper.appendChild(label);

        extras.forEach((ex) => {
          const exLine = document.createElement('div');
          exLine.textContent = `• ${ex}`;
          exLine.style.fontSize = '13px';
          exLine.style.color = '#cbd5f5';
          exLine.style.marginLeft = '10px';
          wrapper.appendChild(exLine);
        });
      }

      return wrapper;
    });
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
    card.style.gap = '10px';
    card.style.color = '#e5e7eb';

    // HEADER
    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.gap = '8px';
    head.style.alignItems = 'center';

    const chipId = document.createElement('span');
    chipId.className = 'chip';
    chipId.textContent = ticket.id ? `Ticket #${ticket.id}` : 'Ticket';
    head.appendChild(chipId);

    const chipTime = document.createElement('span');
    chipTime.className = 'chip';
    chipTime.textContent = `Commandé à : ${ticket.time}`;
    head.appendChild(chipTime);

    const chipTotal = document.createElement('span');
    chipTotal.className = 'chip';
    chipTotal.textContent = `${ticket.total.toFixed(2)} €`;
    chipTotal.style.fontWeight = '700';
    head.appendChild(chipTotal);

    card.appendChild(head);

    // PRODUITS
    const productLines = makeProductLines(ticket);
    productLines.forEach((ln) => card.appendChild(ln));

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

  async function showTableDetail(id) {
    const base = getApiBase();
    if (!base) return;

    panel.innerHTML = '';
    panel.style.display = 'flex';

    const head = document.createElement('h2');
    head.textContent = `Table ${id}`;
    head.style.color = '#f9fafb';
    head.style.marginBottom = '10px';
    panel.appendChild(head);

    const [summary, tables] = await Promise.all([
      fetchSummary(base),
      fetchTables(base),
    ]);

    const tickets = (summary.tickets || []).filter(
      (t) => normId(t.table) === normId(id)
    );

    if (!tickets.length) {
      const p = document.createElement('div');
      p.textContent = 'Aucune commande';
      panel.appendChild(p);
      return;
    }

    tickets.forEach((t) => panel.appendChild(makeTicketCard(t)));
  }

  window.showTableDetail = showTableDetail;
})();
