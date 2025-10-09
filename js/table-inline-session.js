/* table-inline-session.js — Version complète inline */
(function(){
  const $  = (s,r=document)=>r.querySelector(s);
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

  async function apiGET(p){
    const r = await fetch(getApiBase()+p,{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status+' '+p);
    return r.json();
  }

  async function apiPOST(p,b){
    const r = await fetch(getApiBase()+p,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(b||{})
    });
    if(!r.ok) throw new Error('HTTP '+r.status+' '+p);
    return r.json().catch(()=>({ok:true}));
  }

  async function loadData(tableId){
    try {
      const s=await apiGET(`/session/${encodeURIComponent(tableId)}`);
      const orders=s?.orders||[];
      if(orders.length) return {orders};
    }catch{}
    const sum=await apiGET('/summary');
    const tickets=(sum?.tickets||[]).filter(t=>(t.table||'').toUpperCase()===(tableId||'').toUpperCase());
    return {orders:tickets};
  }

  function renderOrders(orders){
    if(!orders.length) return '<em>Aucune commande</em>';
    let html='<ul>';
    let total=0;
    orders.forEach(o=>{
      if(o.items){
        o.items.forEach(it=>{
          html+=`<li>${it.qty||1} × ${it.name||'??'} - ${it.price?it.price.toFixed(2):''}€</li>`;
          total+= (it.qty||1)*(it.price||0);
        });
      }
    });
    html+='</ul>';
    html+=`<div class="tis-total">Total: <b>${total.toFixed(2)} €</b></div>`;
    return html;
  }

  async function refreshSlot(slot){
    const id=slot.dataset.table||'';
    if(!id) return;
    try {
      const data=await loadData(id);
      const orders=data.orders||[];
      slot.innerHTML = `
        <div class="tis-block">
          <div class="tis-status">${orders.length?'En cours':'Vide'}</div>
          <div class="tis-orders">${renderOrders(orders)}</div>
          <div class="tis-actions">
            <button data-act="print" data-table="${id}">🖨 Imprimer</button>
            <button data-act="confirm" data-table="${id}">✔ Paiement confirmé</button>
            <button data-act="refresh" data-table="${id}">🔄 Rafraîchir</button>
          </div>
        </div>`;
    } catch(e){
      slot.innerHTML=`<div class="tis-block">Erreur: ${e.message}</div>`;
    }
  }

  async function tick(){
    const slots=$$('.tis-slot');
    for(const s of slots) await refreshSlot(s);
  }

  // Auto-refresh toutes les 15s
  let timer;
  function start(){
    if(timer) clearInterval(timer);
    tick();
    timer=setInterval(tick,15000);
  }

  // Délégation des clics
  document.addEventListener('click',async e=>{
    const btn=e.target.closest('button[data-act]');
    if(!btn) return;
    const act=btn.dataset.act, table=btn.dataset.table;
    if(!table) return;
    if(act==='print'){ await apiPOST('/print',{table}); alert('Ticket imprimé'); }
    if(act==='confirm'){ await apiPOST('/confirm',{table}); alert('Table clôturée'); }
    if(act==='refresh'){ const slot=$(`.tis-slot[data-table="${table}"]`); if(slot) refreshSlot(slot); }
    tick();
  });

  // Démarrage
  start();
})();
