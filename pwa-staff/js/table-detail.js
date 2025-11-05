// pwa-staff/js/table-detail.js
// Rend chaque carte de table cliquable et affiche un panneau de détail à droite
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // -------- API helpers ----------
  function getApiBase() {
    const inp = $('#apiUrl');
    const str = (inp?.value || '').trim().replace(/\/+$/, '');
    if (str) return str;
    try {
      const ls =
        localStorage.getItem('orders_api_url_v11') ||
        localStorage.getItem('api_url') ||
        localStorage.getItem('API_URL') ||
        '';
      return (ls || '').trim().replace(/\/+$/, '');
    } catch {
      return '';
    }
  }
  async function apiGET(path) {
    const r = await fetch(getApiBase() + path, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
    return r.json();
  }
  async function apiPOST(path, body) {
    const r = await fetch(getApiBase() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
    return r.json().catch(() => ({ ok: true }));
  }

  // -------- panneau latéral ----------
  function ensurePanel() {
    let panel = document.getElementById('tableDetailPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'tableDetailPanel';
      panel.innerHTML = `
        <div class="tdp-head">
          <h3 id="tdpTitle">Table</h3>
          <button id="tdpClose">×</button>
        </div>
        <div id="tdpBody" class="tdp-body">
          <p class="muted">Sélectionnez une table…</p>
        </div>
      `;
      document.body.appendChild(panel);

      // styles
      const st = document.createElement('style');
      st.textContent = `
        #tableDetailPanel{
          position:fixed;
          top:0; right:0;
          width:360px;
          height:100vh;
          background:#0f172a;
          border-left:1px solid #1f2937;
          box-shadow:-12px 0 25px rgba(0,0,0,.35);
          z-index:999;
          display:none;
          flex-direction:column;
        }
        #tableDetailPanel.open{display:flex;}
        .tdp-head{
          display:flex;align-items:center;justify-content:space-between;
          padding:16px;border-bottom:1px solid #1f2937;
        }
        .tdp-head h3{margin:0;font-size:16px;}
        #tdpClose{
          background:transparent;border:none;color:#e2e8f0;
          font-size:20px;cursor:pointer;
        }
        .tdp-body{padding:16px;overflow:auto;flex:1;}
        .tdp-badge{
          display:inline-block;
          padding:3px 10px;
          border-radius:999px;
          font-size:11px;
          font-weight:600;
          margin-bottom:8px;
        }
        .tdp-badge.ok{background:#10b9811a;color:#34d399;border:1px solid #34d39933;}
        .tdp-badge.empty{background:#1f2937;color:#e2e8f0;}
        .tdp-order{background:#111827;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px;}
        .tdp-order h4{margin:0 0 4px 0;font-size:13px;}
        .tdp-items{margin:0;padding-left:16px;font-size:13px;}
        .tdp-total{margin-top:10px;font-weight:700;}
        .tdp-actions{display:flex;gap:8px;margin-top:14px;}
        .tdp-btn{background:#10b981;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;color:#042f2e;font-weight:600;}
        .tdp-btn.secondary{background:#1f2937;color:#e2e8f0;}
      `;
      document.head.appendChild(st);

      panel.querySelector('#tdpClose').onclick = () => {
        panel.classList.remove('open');
      };
    }
    return panel;
  }

  function getTableIdFromCard(card) {
    let id = card?.dataset?.table || '';
    if (!id) {
      const chip = card.querySelector('.chip');
      if (chip) id = (chip.textContent || '').trim();
    }
    return (id || '').replace(/^Table\s*/i, '').trim();
  }

  // récup session OU résumé du jour
  async function loadTableData(tableId) {
    // 1) essaie la session
    try {
      const s = await apiGET(`/session/${encodeURIComponent(tableId)}`);
      const orders = s?.orders || [];
      if (orders.length)
        return {
          mode: 'session',
          orders,
          aggregate: s.aggregate || { total: 0, lastTime: '' },
        };
    } catch {}
    // 2) fallback résumé du jour
    const sum = await apiGET('/summary');
    const tickets = (sum?.tickets || []).filter(
      (t) => (t.table || '').toUpperCase() === tableId.toUpperCase()
    );
    let total = 0;
    tickets.forEach((t) => (total += Number(t.total || 0)));
    return { mode: 'summary', orders: tickets, aggregate: { total } };
  }

  async function openTableDetail(tableId) {
    const panel = ensurePanel();
    const title = panel.querySelector('#tdpTitle');
    const body = panel.querySelector('#tdpBody');

    title.textContent = `Table ${tableId}`;
    body.innerHTML = `<p class="muted">Chargement…</p>`;
    panel.classList.add('open');

    try {
      const data = await loadTableData(tableId);
      const orders = data.orders || [];
      const agg = data.aggregate || { total: 0 };

      let html = '';
      html += `<span class="tdp-badge ${
        orders.length ? 'ok' : 'empty'
      }">${orders.length ? (data.mode === 'session' ? 'En cours' : 'Résumé du jour') : 'Vide'}</span>`;

      if (!orders.length) {
        html += `<p>Aucune commande pour cette table.</p>`;
      } else {
        orders.forEach((o) => {
          const items = (o.items || [])
            .map((it) => `<li>${it.qty || 1}× ${it.name || ''}</li>`)
            .join('');
          html += `
            <div class="tdp-order">
              <h4>#${o.id || ''} ${o.time ? '• ' + o.time : ''}</h4>
              <ul class="tdp-items">${items}</ul>
              ${
                o.total
                  ? `<div class="tdp-order-total">Sous-total : ${o.total} €</div>`
                  : ''
              }
            </div>
          `;
        });
      }

      html += `<div class="tdp-total">Total cumulé : ${Number(
        agg.total || 0
      ).toFixed(2)} €</div>`;

      html += `
        <div class="tdp-actions">
          <button class="tdp-btn" data-act="print" data-table="${tableId}">Imprimer</button>
          <button class="tdp-btn secondary" data-act="confirm" data-table="${tableId}">Paiement confirmé</button>
          <button class="tdp-btn secondary" data-act="refresh" data-table="${tableId}">↻</button>
        </div>
      `;

      body.innerHTML = html;
    } catch (e) {
      body.innerHTML = `<p class="tdp-error">Erreur: ${e.message}</p>`;
    }
  }

  // clic sur les cartes
  function wireCards() {
    const container = $('#tables') || document;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn) return; // on ne bloque pas les boutons d’origine

      const card = e.target.closest('[data-table], .table');
      if (!card) return;
      const tableId = getTableIdFromCard(card);
      if (!tableId) return;
      openTableDetail(tableId);
    });
  }

  // actions dans le panneau
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('#tableDetailPanel .tdp-btn[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const table = btn.dataset.table;
    if (!table) return;

    if (act === 'print') {
      try {
        await apiPOST('/print', { table });
        btn.textContent = 'Imprimé ✓';
      } catch (e) {
        btn.textContent = 'Erreur';
      }
      setTimeout(() => (btn.textContent = 'Imprimer'), 1000);
    } else if (act === 'confirm') {
      try {
        await apiPOST('/confirm', { table });
        btn.textContent = 'Clôturé ✓';
      } catch (e) {
        btn.textContent = 'Erreur';
      }
      setTimeout(() => (btn.textContent = 'Paiement confirmé'), 1000);
    } else if (act === 'refresh') {
      openTableDetail(table);
    }
  });

  // init
  wireCards();
})();
