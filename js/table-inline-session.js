/* table-inline-session.js — PWA Staff
 * Affiche la session en cours directement DANS la carte de la table :
 * - Statut au-dessus (En cours / Vide)
 * - Liste des commandes de la session (tickets + items)
 * - Boutons "Imprimer" et "Paiement confirmé" en dessous
 * Intégration: inclure APRÈS js/app.js dans index.html
 *   <script src="js/table-inline-session.js"></script>
 */
(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

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
      .tis-sub{opacity:.8;font-size:12px;margin:0 0 6px 0}
      .tis-actions{display:flex;gap:8px;margin-top:8px}
      .tis-btn{background:#10b981;border:none;border-radius:10px;padding:8px 12px;color:#042;cursor:pointer;font-weight:700}
      .tis-btn.ghost{background:#1f2937;color:#e5e7eb}
      .tis-total{margin-top:6px;font-weight:700}
    `;
    document.head.appendChild(st);
  }

  function parseTableIdFromCard(card){
    let id = card?.dataset?.table || '';
    if (!id){
      const chip = card?.querySelector('.chip');
      if (chip) id = (chip.textContent||'').trim();
    }
    return (id||'').replace(/^Table\\s*/i,'').trim();
  }

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

  async function refreshPanel(card){
    const tableId = parseTableIdFromCard(card);
    if (!tableId) return;
    const panel = ensurePanel(card);
    const badge = panel.querySelector('#tisBadge');
    const meta  = panel.querySelector('#tisMeta');
    const list  = panel.querySelector('#tisList');
    const total = panel.querySelector('#tisTotal');
    const btnPrint = panel.querySelector('#tisPrint');
    const btnConfirm = panel.querySelector('#tisConfirm');
    const btnRefresh = panel.querySelector('#tisRefresh');

    list.innerHTML = '<div class="tis-sub">Chargement…</div>';
    total.textContent = '';

    try{
      const j = await apiGET(`/session/${encodeURIComponent(tableId)}`);
      const orders = j?.orders || [];
      const agg = j?.aggregate || { items:[], total:0, lastTime:'' };

      // statut
      if (orders.length){
        badge.classList.remove('empty'); badge.classList.add('ok'); badge.textContent = 'En cours';
        meta.textContent = `Commandes: ${orders.length} • Dernier: ${agg.lastTime || '--:--'}`;
      } else {
        badge.classList.remove('ok'); badge.classList.add('empty'); badge.textContent = 'Vide';
        meta.textContent = 'Aucune commande';
      }

      // liste des commandes
      list.innerHTML = '';
      orders.forEach(o => {
        const itStr = (o.items||[]).map(i=>\`\${i.qty}× \${i.name}\`).join(', ');
        const row = document.createElement('div');
        row.className = 'tis-item';
        row.innerHTML = \`<span>#\${o.id} • \${o.time||''}</span><b>\${o.total} €</b>\`;
        list.appendChild(row);
        if (itStr){
          const sub = document.createElement('div');
          sub.className = 'tis-sub';
          sub.textContent = itStr;
          list.appendChild(sub);
        }
      });

      // total cumulé
      total.textContent = \`Total cumulé : \${agg.total.toFixed(2)} €\`;

      // actions
      btnPrint.onclick = async ()=>{
        try { await apiPOST('/print',{table:tableId}); btnPrint.textContent='Imprimé ✓'; }
        catch { btnPrint.textContent='Erreur'; }
        setTimeout(()=> btnPrint.textContent='Imprimer', 1100);
      };
      btnConfirm.onclick = async ()=>{
        try { await apiPOST('/confirm',{table:tableId}); btnConfirm.textContent='Clôturé ✓'; }
        catch { btnConfirm.textContent='Erreur'; }
        setTimeout(()=> btnConfirm.textContent='Paiement confirmé', 1100);
        // refresh local card + global lists si présents
        await refreshPanel(card);
        try { document.getElementById('btnRefreshTables')?.click(); } catch {}
        try { document.getElementById('btnRefreshSummary')?.click(); } catch {}
      };
      btnRefresh.onclick = ()=> refreshPanel(card);

    }catch(e){
      list.innerHTML = \`<div class="tis-sub">Erreur: \${e.message}</div>\`;
    }
  }

  function wireCards(){
    ensureStyles();
    const grid = $('#tables'); if (!grid) return;
    grid.addEventListener('click', e => {
      // si clic sur les boutons d'origine, on ne fait rien
      if (e.target.closest('button')) return;
      const card = e.target.closest('.table'); if (!card) return;
      refreshPanel(card);
    });
  }

  // init
  wireCards();
})();
