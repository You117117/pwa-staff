/* Staff app – robust version */
(() => {
  const $ = sel => document.querySelector(sel);
  const apiInput = $('#apiUrl');
  const healthBadge = $('#healthBadge');
  const tablesWrap = $('#tables');
  const tablesEmpty = $('#tablesEmpty');
  const summaryWrap = $('#summary');
  const summaryEmpty = $('#summaryEmpty');
  const filterSel = $('#filter');
  const LS_KEY = 'staff_api_url';

  function getApiBase() { return (localStorage.getItem(LS_KEY)||apiInput.value||'').trim(); }
  function setApiBase(url){ localStorage.setItem(LS_KEY,url.trim()); apiInput.value=url.trim(); }
  function restoreApi(){ const v=localStorage.getItem(LS_KEY); if(v) apiInput.value=v; }

  $('#btnRemember').onclick=()=>{ const url=apiInput.value.trim(); if(!/^https?:\/\//.test(url)){markHealth('Invalide');return;} setApiBase(url); markHealth('Sauvé');};
  $('#btnHealth').onclick=()=>probeHealth();
  $('#btnRefresh').onclick=()=>refreshAll();
  $('#btnRefreshSummary').onclick=()=>refreshSummary();
  filterSel.onchange=()=>renderTables(lastTables);

  async function apiGET(path){const r=await fetch(getApiBase()+path,{cache:'no-store'});if(!r.ok)throw new Error(r.status);return r.json();}
  async function apiPOST(path,body){const r=await fetch(getApiBase()+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(r.status);return r.json().catch(()=>({}));}

  function markHealth(txt,ok){healthBadge.textContent=txt;healthBadge.className='badge '+(ok===true?'ok':ok===false?'err':'');}
  async function probeHealth(){markHealth('…');try{const j=await apiGET('/health');markHealth(j.ok?'OK':'KO',j.ok);}catch{markHealth('KO',false);}}

  let lastTables=null;
  function renderTables(data){lastTables=data;tablesWrap.innerHTML='';let shown=0;(data?.tables||[]).forEach(t=>{if(filterSel.value!=='ALL'&&t.id!==filterSel.value)return;shown++;const el=document.createElement('div');el.className='table';el.innerHTML=`<h3>${t.name||('Table '+t.id)}</h3><div class="row"><span class="chip">En attente : <b>${t.pending||0}</b></span><span class="chip">Dernier ticket : <b>${t.last_ticket||'-'}</b></span></div><div class="actions-row"><button class="btnPrint" data-table="${t.id}">Imprimer maintenant</button><button class="secondary btnPaid" data-table="${t.id}">Paiement confirmé</button></div>`;tablesWrap.appendChild(el);});tablesEmpty.style.display=shown?'none':'';bindTableButtons();}
  function bindTableButtons(){tablesWrap.querySelectorAll('.btnPrint').forEach(b=>b.onclick=async e=>{const t=e.currentTarget.dataset.table;try{await apiPOST('/staff/print',{table:t});e.currentTarget.textContent='Imprimé ✓';setTimeout(()=>e.currentTarget.textContent='Imprimer maintenant',1500);refreshTables();}catch{e.currentTarget.textContent='Erreur';setTimeout(()=>e.currentTarget.textContent='Imprimer maintenant',1500);}});tablesWrap.querySelectorAll('.btnPaid').forEach(b=>b.onclick=async e=>{const t=e.currentTarget.dataset.table;try{await apiPOST('/staff/confirm',{table:t});e.currentTarget.textContent='Confirmé ✓';setTimeout(()=>e.currentTarget.textContent='Paiement confirmé',1500);refreshTables();}catch{e.currentTarget.textContent='Erreur';setTimeout(()=>e.currentTarget.textContent='Paiement confirmé',1500);}});}
  async function refreshTables(){try{renderTables(await apiGET('/tables'));}catch{tablesWrap.innerHTML='';tablesEmpty.style.display='';}}

  async function refreshSummary(){try{renderSummary(await apiGET('/staff/summary'));}catch{summaryWrap.innerHTML='';summaryEmpty.style.display='';}}
  function renderSummary(data){const list=(data?.tickets||[]);summaryWrap.innerHTML='';summaryEmpty.style.display=list.length?'none':'';list.forEach(t=>{const it=document.createElement('div');it.className='table';const items=(t.items||[]).map(i=>`${i.qty}× ${i.name}`).join(', ');it.innerHTML=`<div class="row"><span class="chip"><b>${t.table}</b></span><span class="chip">⏱ ${t.time||''}</span><span class="chip">Total : <b>${t.total} €</b></span></div><div class="muted" style="margin-top:8px">${items||'—'}</div>`;summaryWrap.appendChild(it);});}

  async function refreshAll(){await Promise.all([refreshTables(),refreshSummary()]);}
  function startPolling(){setInterval(refreshAll,10000);}

  restoreApi();probeHealth();refreshAll();startPolling();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('service-worker.js').catch(()=>{});
})();