/* table-inline-session.js v4 — léger & sûr
 * - Statut + liste dans chaque carte
 * - 1 seul timer global (15s) pour rafraîchir toutes les cartes
 * - Fallback /summary si /session est vide
 * Intégration: APRÈS js/app.js
 *   <script src="js/table-inline-session.js?v=4"></script>
 */
(function(){
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

  // ---------- API ----------
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
  async function apiGET(p){ const r = await fetch(getApiBase()+p, {cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status+' '+p); return r.json(); }
  async function apiPOST(p,b){ const r = await fetch(getApiBase()+p, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(b||{})}); if(!r.ok) throw new Error('HTTP '+r.status+' '+p); return r.json().catch(()=>({ok:true})); }

  // ---------- Styles ----------
  function ensureStyles(){
    if ($('#tisStyles')) return;
    const st = document.createElement('style'); st.id='tisStyles';
    st.textContent = `
      .tis{margin-top:10px;background:#0b0b0f;border:1px solid #1f2937;border-radius:12px;padding:10px}
      .tis-status{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px}
      .tis-badge{display:inline-block;border-radius:999px;padding:2px 8px;font-weight:700;font-size:11px}
      .tis-badge.ok{background:#065f46;color:#ecfdf5}
      .tis-badge.empty{background:#374151;color:#e5e7eb}
      .tis-list{max-height:180px;overflow:auto;border-top:1px dashed #374151;margin-top:6px;padding-top:6px}
      .tis-item{display:flex;justify-content:space-between;margin:3px 0}
      .tis-sub{opacity:.85;font-size:12px;margin:0 0 6px 0}
      .tis-actions{display:flex;gap:8px;margin-top:8px}
      .tis-btn{background:#10b981;border:none;border-radius:10px;padding:8px 12px;color:#042;cursor:pointer;font-weight:700}
      .tis-btn.ghost{background:#1f2937;color:#e5e7eb}
      .tis-total{margin-top:6px;font-weight:700}
      .tis-error{color:#fca5a5;font-size:12px}
    `;
    document.head.appendChild(st);
  }

  // ---------- Sélection des cartes ----------
  function getCards(){
    const grid = $('#tables') || $('[data-grid="tables"]') || document;
    let cards = $$('[data-table]', grid);
    if (!cards.length) cards = $$('.table', grid);
    if (!cards.length) cards = $$('.card', grid);
    return cards;
  }
  function tableIdFromCard(card){
    let id = card?.dataset?.table || '';
    if (!id){
      const chip = card.querySelector('.chip');
      if (chip) id = (chip.textContent||'').trim();
    }
    return (id||'').replace(/^Table\s*/i,'').trim();
  }

  // ---------- Panneau ----------
  function ensurePanel(card){
    let panel = card.querySelector('.tis');
    if (!panel){
      panel = document.createElement('div');
      panel.className = 'tis';
      panel.innerHTML = `
        <div class="tis-status">
          <span class="tis-badge empty" id="tisBadge">Vide</span>
          <span id="tisMeta" class="tis-meta"></span>
        </div>
        <div id="tisList" class="tis-list"></div>
        <div class="tis-total" id="tisTotal"></div>
        <div class="tis-actions">
          <button class="tis-btn" id="tisPrint">Imprimer</button>
          <button class="tis-btn ghost" id="tisConfirm">Paiement confirmé</button>
          <button class="tis-btn ghost" id="tisRefresh">↻</button>
        </div>
      `;
      card.appendChild(panel);
    }
    return panel;
  }

  function aggregateFromTickets(tickets){
    const items = new Map();
    let total = 0, lastTime = '';
    tickets.forEach(t=>{
      total += Number(t.total||0);
      if (t.time) lastTime = t.time;
      (t.items||[]).forEach(i=>{
        const k = i.name || i.id || 'Item';
        const prev = items.get(k) || {name:k, qty:0};
        prev.qty += Number(i.qty||1);
        items.set(k, prev);
      });
    });
    return { total: Math.round(total*100)/100, items:[...items.values()], lastTime };
  }

  async function loadData(tableId){
    // 1) Essaie la session
    try{
      const s = await apiGET(`/session/${encodeURIComponent(tableId)}`);
      const orders = s?.orders || [];
      if (orders.length) return { mode:'session', orders, aggregate: s.aggregate || {items:[], total:0, lastTime:''} };
    }catch{}
    // 2) Fallback: summary du jour
    const sum = await apiGET('/summary');
    const tickets = (sum?.tickets||[]).filter(t=>(t.table||'').toUpperCase()===(tableId||'').toUpperCase());
    const agg = aggregateFromTickets(tickets);
    return { mode:'summary', orders: tickets.map(t=>({id:t.id,time:t.time,total:t.total,items:t.items})), aggregate: agg };
  }

  async function refreshCard(card){
    const id = tableIdFromCard(card);
    if (!id) return;
    const panel = ensurePanel(card);
    const badge = panel.querySelector('#tisBadge');
    const meta  = panel.querySelector('#tisMeta');
    const list  = panel.querySelector('#tisList');
    const total = panel.querySelector('#tisTotal');
    const btnPrint   = panel.querySelector('#tisPrint');
    const btnConfirm = panel.querySelector('#tisConfirm');
    const btnRefresh = panel.querySelector('#tisRefresh');

    list.innerHTML = '<div class="tis-sub">Chargement…</div>';
    total.textContent = '';

    try{
      const data = await loadData(id);
      const orders = data.orders;
      const agg = data.aggregate;

      if (orders.length){
        badge.classList.remove('empty'); badge.classList.add('ok');
        badge.textContent = (data.mode==='session' ? 'En cours' : '(Résumé du jour)');
        meta.textContent = `Commandes: ${orders.length} • Dernier: ${agg.lastTime || '--:--'}`;
      } else {
        badge.classList.remove('ok'); badge.classList.add('empty');
        badge.textContent = 'Vide';
        meta.textContent = 'Aucune commande';
      }

      list.innerHTML = '';
      orders.forEach(o=>{
        const it = (o.items||[]).map(i=>`${i.qty}× ${i.name}`).join(', ');
        const row = document.createElement('div');
        row.className = 'tis-item';
        row.innerHTML = `<span>#${o.id} • ${o.time||''}</span><b>${o.total} €</b>`;
        list.appendChild(row);
        if (it){
          const sub = document.createElement('div');
          sub.className = 'tis-sub';
          sub.textContent = it;
          list.appendChild(sub);
        }
      });

      total.textContent = `Total cumulé : ${agg.total.toFixed(2)} €`;

      btnPrint.onclick = async ()=>{
        try { await apiPOST('/print',{table:id}); btnPrint.textContent='Imprimé ✓'; }
        catch { btnPrint.textContent='Erreur'; }
        setTimeout(()=> btnPrint.textContent='Imprimer', 1100);
      };
      btnConfirm.onclick = async ()=>{
        try { await apiPOST('/confirm',{table:id}); btnConfirm.textContent='Clôturé ✓'; }
        catch { btnConfirm.textContent='Erreur'; }
        setTimeout(()=> btnConfirm.textContent='Paiement confirmé', 1100);
        await refreshCard(card);
      };
      btnRefresh.onclick = ()=> refreshCard(card);

    }catch(e){
      list.innerHTML = `<div class="tis-error">Erreur: ${e.message}</div>`;
    }
  }

  // ---------- Rafraîchissement GLOBAL (UN SEUL TIMER) ----------
  let globalTimer = null;
  function startGlobalRefresh(){
    stopGlobalRefresh();
    const tick = ()=> getCards().forEach(c=> refreshCard(c));
    tick(); // 1ère passe immédiate
    globalTimer = setInterval(tick, 15000); // toutes les 15s
  }
  function stopGlobalRefresh(){
    if (globalTimer){ clearInterval(globalTimer); globalTimer = null; }
  }

  // ---------- Init ----------
  ensureStyles();
  startGlobalRefresh();

  // recâble “Rafraîchir” si présent (après reconstruction DOM)
  const btn = $('#btnRefreshTables');
  if (btn){
    btn.addEventListener('click', ()=>{
      // petite attente pour laisser l’app reconstruire les cartes
      setTimeout(()=> startGlobalRefresh(), 200);
    });
  }
})();
