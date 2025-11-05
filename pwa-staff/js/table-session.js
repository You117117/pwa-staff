/* table-session.js — Vue "session en cours" par table (PWA Staff)
 * Usage: inclure APRÈS js/app.js dans index.html
 *   <script src="js/table-session.js"></script>
 * Fonctionnement:
 * - Clique sur une carte de table -> ouvre un modal avec la session active
 * - Affiche chaque commande de la session + agrégat + total
 * - Bouton "Clôturer" appelle /confirm (réinitialise la session) puis rafraîchit
 */
(function(){
  const $ = (s, r=document)=>r.querySelector(s);

  function getApiBase(){
    const inp = $('#apiUrl');
    const str = (inp?.value || '').trim().replace(/\/+$/,'');
    if (str) return str;
    try {
      const ls = localStorage.getItem('orders_api_url_v11')
        || localStorage.getItem('api_url')
        || localStorage.getItem('API_URL') || '';
      return (ls||'').trim().replace(/\/+$/,'');
    } catch { return ''; }
  }
  async function apiGET(p){ const r = await fetch(getApiBase()+p, {cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }
  async function apiPOST(p,b){ const r = await fetch(getApiBase()+p, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(b||{})}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json().catch(()=>({ok:true})); }

  function ensureStyles(){
    if ($('#tsStyles')) return;
    const st = document.createElement('style'); st.id='tsStyles';
    st.textContent = `
      .ts-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999}
      .ts-modal{background:#111827;border:1px solid #1f2937;border-radius:16px;max-width:680px;width:92%;padding:18px;box-shadow:0 10px 30px rgba(0,0,0,.5);color:#e5e7eb}
      .ts-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
      .ts-title{font-weight:700;font-size:20px}
      .ts-close{background:#1f2937;border:none;border-radius:10px;padding:6px 10px;color:#e5e7eb;cursor:pointer}
      .ts-muted{opacity:.75;font-size:12px}
      .ts-list{margin:8px 0;max-height:45vh;overflow:auto}
      .ts-item{display:flex;justify-content:space-between;border-bottom:1px dashed #374151;padding:6px 2px}
      .ts-actions{display:flex;gap:10px;margin-top:12px}
      .ts-btn{background:#10b981;border:none;border-radius:10px;padding:10px 14px;color:#042;cursor:pointer;font-weight:700}
      .ts-btn.ghost{background:#1f2937;color:#e5e7eb}
    `;
    document.head.appendChild(st);
  }

  async function openModal(tableId){
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.className = 'ts-overlay';
    overlay.addEventListener('click', e=>{ if(e.target===overlay) document.body.removeChild(overlay); });

    const box = document.createElement('div');
    box.className = 'ts-modal';
    box.innerHTML = `
      <div class="ts-hdr">
        <div class="ts-title">Table ${tableId}</div>
        <button class="ts-close" aria-label="Fermer">✕</button>
      </div>
      <div id="tsBody" class="ts-body"></div>
      <div class="ts-actions">
        <button class="ts-btn" id="tsCloseSession">Clôturer (paiement confirmé)</button>
        <button class="ts-btn ghost" id="tsRefresh">Rafraîchir</button>
      </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.querySelector('.ts-close').onclick = ()=> document.body.removeChild(overlay);

    async function refresh(){
      const j = await apiGET(`/session/${encodeURIComponent(tableId)}`);
      const body = box.querySelector('#tsBody');
      body.innerHTML = '';
      const sess = j || {};
      const orders = sess.orders || [];
      const agg = (sess.aggregate || {items:[], total:0, lastTime:''});

      const meta = document.createElement('div');
      meta.className = 'ts-muted';
      meta.textContent = orders.length ? `Commandes dans la session : ${orders.length} • Dernier ticket : ${agg.lastTime || '--:--'} • Total cumulé : ${agg.total.toFixed(2)} €`
                                     : 'Aucune commande dans cette session.';
      body.appendChild(meta);

      const list = document.createElement('div');
      list.className = 'ts-list';
      orders.forEach(o => {
        const items = (o.items||[]).map(i=>`${i.qty}× ${i.name}`).join(', ');
        const line = document.createElement('div');
        line.className = 'ts-item';
        line.innerHTML = `<span>#${o.id} • ${o.time||''}</span><b>${o.total} €</b>`;
        list.appendChild(line);
        if (items){
          const sub = document.createElement('div');
          sub.className = 'ts-muted';
          sub.style.margin = '0 0 8px 0';
          sub.textContent = items;
          list.appendChild(sub);
        }
      });

      if (orders.length) body.appendChild(list);

      // Agrégat
      if (agg.items && agg.items.length){
        const aggTitle = document.createElement('div');
        aggTitle.className = 'ts-muted';
        aggTitle.style.marginTop = '8px';
        aggTitle.textContent = 'Récapitulatif (agrégé) :';
        body.appendChild(aggTitle);

        const aggList = document.createElement('div');
        aggList.className = 'ts-list';
        agg.items.forEach(it => {
          const el = document.createElement('div');
          el.className = 'ts-item';
          el.innerHTML = `<span>${it.name}</span><b>${it.qty}×</b>`;
          aggList.appendChild(el);
        });
        body.appendChild(aggList);
      }
    }

    box.querySelector('#tsRefresh').onclick = refresh;
    box.querySelector('#tsCloseSession').onclick = async ()=>{
      try {
        await apiPOST('/confirm', { table: tableId });
        await refresh();
        // ferme le modal et rafraîchit la liste des tables de la page
        setTimeout(()=>{ try{ document.body.removeChild(overlay); }catch{}; }, 400);
        try { document.getElementById('btnRefreshTables')?.click(); } catch {}
        try { document.getElementById('btnRefreshSummary')?.click(); } catch {}
      } catch (e) { alert('Erreur de clôture: '+e.message); }
    };

    await refresh();
  }

  const grid = document.getElementById('tables');
  if (!grid) return;
  grid.addEventListener('click', e => {
    if (e.target.closest('button')) return; // évite conflit avec boutons de la carte
    const card = e.target.closest('.table'); if (!card) return;
    let id = card.dataset.table || '';
    if (!id) {
      const chip = card.querySelector('.chip');
      if (chip) id = (chip.textContent||'').trim();
    }
    id = (id||'').replace(/^Table\s*/i,'').trim();
    if (!id) return;
    openModal(id);
  });
})();
