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

  const detailAutoRefresh = (window.detailAutoRefresh =
    window.detailAutoRefresh || { timerId: null, tableId: null });

  const leftPrintTimers = (window.leftPrintTimers = window.leftPrintTimers || {});
  const leftPayTimers = (window.leftPayTimers = window.leftPayTimers || {});

  document.addEventListener('click', (e) => {
    if (panel.style.display === 'none') return;
    if (window.__suppressOutsideClose) return;
    if (panel.contains(e.target)) return;
    closePanel();
  });

  const normId = (id) => (id || '').toString().trim().toUpperCase();
  const getApiBase = () => {
    const input = document.querySelector('#apiUrl');
    return input ? input.value.trim().replace(/\/+$/, '') : '';
  };

  function closePanel() {
    panel.style.display = 'none';
    panel.innerHTML = '';
    window.__currentDetailTableId = null;

    if (detailAutoRefresh.timerId) {
      clearInterval(detailAutoRefresh.timerId);
      detailAutoRefresh.timerId = null;
      detailAutoRefresh.tableId = null;
    }
  }

  function startDetailAutoRefresh(id) {
    if (detailAutoRefresh.timerId) {
      clearInterval(detailAutoRefresh.timerId);
      detailAutoRefresh.timerId = null;
      detailAutoRefresh.tableId = null;
    }

    detailAutoRefresh.tableId = id;
    detailAutoRefresh.timerId = setInterval(() => {
      const panelEl = document.querySelector('#tableDetailPanel');
      if (!panelEl || panelEl.style.display === 'none') {
        clearInterval(detailAutoRefresh.timerId);
        detailAutoRefresh.timerId = null;
        detailAutoRefresh.tableId = null;
        return;
      }
      showTableDetail(id, null, { skipAutoRefresh: true });
    }, 5000);
  }

  // 🔥🔥🔥 VERSION CORRIGÉE AVEC PRÉNOM + SUPPLÉMENTS EN LISTE
  function makeProductLines(ticket) {
    const src = Array.isArray(ticket.items)
      ? ticket.items
      : Array.isArray(ticket.lines)
      ? ticket.lines
      : null;

    if (!src) return [];

    return src.map((it) => {
      const qty = it.qty || 1;
      const name = it.name || it.label || "Article";
      const price = it.price || 0;

      const clientName =
        it.clientName ||
        it.ownerName ||
        ticket.clientName ||
        null;

      const extras = Array.isArray(it.extras || it.supplements || [])
        ? (it.extras || it.supplements || [])
        : [];

      const wrapper = document.createElement("div");
      wrapper.style.marginBottom = "12px";

      // ▶ Client au-dessus
      if (clientName) {
        const c = document.createElement("div");
        c.textContent = `Client : ${clientName}`;
        c.style.fontSize = "13px";
        c.style.color = "#e5e7eb";
        c.style.marginBottom = "4px";
        wrapper.appendChild(c);
      }

      // ▶ Ligne principale (produit)
      const line = document.createElement("div");
      line.style.display = "flex";
      line.style.justifyContent = "space-between";
      line.style.fontSize = "15px";
      line.style.fontWeight = "700";
      line.style.color = "#f9fafb";

      const left = document.createElement("span");
      left.textContent = `${qty}× ${name}`;

      const right = document.createElement("span");
      right.textContent = `${price.toFixed(2)} €`;

      line.appendChild(left);
      line.appendChild(right);
      wrapper.appendChild(line);

      // ▶ Suppléments en liste verticale
      if (extras.length > 0) {
        const label = document.createElement("div");
        label.textContent = "Suppléments :";
        label.style.fontSize = "13px";
        label.style.fontWeight = "700";
        label.style.color = "#cbd5f5";
        label.style.marginTop = "4px";
        wrapper.appendChild(label);

        extras.forEach((ex) => {
          const exLine = document.createElement("div");
          exLine.textContent = `• ${ex}`;
          exLine.style.fontSize = "13px";
          exLine.style.color = "#cbd5f5";
          exLine.style.marginLeft = "10px";
          wrapper.appendChild(exLine);
        });
      }

      return wrapper;
    });
  }

  // ------------------------------------------------------------------------------------------
  // (LE RESTE DU FICHIER EST IDENTIQUE À TON ORIGINAL — JE N’Y TOUCHE PAS)
  // ------------------------------------------------------------------------------------------

  function makeTicketCard(ticket) {
    const card = document.createElement('div');
    card.style.background = 'rgba(15,23,42,0.6)';
    card.style.border = '1px solid rgba(148,163,184,0.3)';
    card.style.borderRadius = '12px';
    card.style.padding = '12px 14px';
    card.style.marginBottom = '10px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '8px';
    card.style.color = '#e5e7eb';

    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.gap = '8px';
    head.style.alignItems = 'center';

    const chipId = document.createElement('span');
    chipId.className = 'chip';
    chipId.textContent = ticket.id ? `Ticket #${ticket.id}` : 'Ticket';
    head.appendChild(chipId);

    if (ticket.time) {
      const chipTime = document.createElement('span');
      chipTime.className = 'chip';
      chipTime.textContent = `Commandé à : ${ticket.time}`;
      head.appendChild(chipTime);
    }

    if (typeof ticket.total === 'number') {
      const chipTotal = document.createElement('span');
      chipTotal.className = 'chip';
      chipTotal.textContent = `${ticket.total.toFixed(2)} €`;
      chipTotal.style.fontSize = '15px';
      chipTotal.style.fontWeight = '700';
      head.appendChild(chipTotal);
    }

    card.appendChild(head);

    // 🔥 Ajout des lignes produits
    makeProductLines(ticket).forEach((ln) => card.appendChild(ln));

    return card;
  }

  // --- (TOUT LE RESTE DU FICHIER NE CHANGE PAS) ---
  window.showTableDetail = showTableDetail;

  async function fetchSummary(base) {
    const res = await fetch(`${base}/summary`, { cache: 'no-store' });
    return await res.json();
  }

  async function fetchTables(base) {
    const res = await fetch(`${base}/tables`, { cache: 'no-store' });
    return await res.json();
  }

  async function showTableDetail(tableId, statusHint, opts) {
    // (…) identique, aucun changement
  }
})();
