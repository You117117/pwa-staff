
// ------- Config -------
const apiInput = document.getElementById('apiUrl');
const saveBtn  = document.getElementById('saveApi');
const testBtn  = document.getElementById('testHealth');
const health   = document.getElementById('healthBadge');
const listEl   = document.getElementById('tables');
const filterEl = document.getElementById('filter');
const refreshBtn = document.getElementById('reload');
const summaryEl = document.getElementById('summary');
const summaryBtn = document.getElementById('reloadSummary');

const DEFAULT_API = 'https://resto-qr-api-1.onrender.com';

function getApi(){ return localStorage.getItem('API_URL') || DEFAULT_API; }
function setApi(url){ localStorage.setItem('API_URL', url); }

apiInput.value = getApi();

saveBtn.addEventListener('click', ()=>{
  const v = apiInput.value.trim();
  if(!v){ alert('Entre une URL valide'); return; }
  setApi(v);
  alert('API mémorisée ✔');
});

testBtn.addEventListener('click', async ()=>{
  health.textContent = '...';
  health.className = 'badge';
  try{
    const res = await fetch(getApi()+'/health');
    if(res.ok){
      const js = await res.json().catch(()=> ({}));
      health.textContent = 'OK';
      health.classList.add('ok');
    }else{
      health.textContent = 'ERR';
      health.classList.add('err');
    }
  }catch(e){
    health.textContent = 'ERR';
    health.classList.add('err');
  }
});

// ------- Helpers -------
async function jget(path){
  const res = await fetch(getApi()+path);
  if(!res.ok) throw new Error(res.statusText);
  return res.json();
}
async function jpost(path, body){
  const res = await fetch(getApi()+path, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(body||{})
  });
  if(!res.ok) throw new Error(await res.text());
  return res.json().catch(()=> ({}));
}

// ------- Tables -------
async function loadTables(){
  listEl.innerHTML = '<div class="muted" style="padding:8px;">Chargement…</div>';
  try{
    const data = await jget('/tables');
    renderTables(Array.isArray(data)? data : (data.tables||[]));
  }catch(e){
    listEl.innerHTML = `<div class="muted" style="padding:8px;color:#ffa8a8">Impossible de charger /tables : ${e.message}</div>`;
  }
}

function renderTables(tables){
  const f = filterEl.value;
  const filtered = tables.filter(t=>{
    if(f==='pending') return (t.pending_count || t.pending || 0) > 0;
    if(f==='empty') return (t.pending_count || t.pending || 0) === 0;
    return true;
  });
  if(filtered.length===0){
    listEl.innerHTML = '<div class="muted" style="padding:8px;">Aucune table</div>';
    return;
  }
  listEl.innerHTML = '';
  for(const t of filtered){
    const card = document.createElement('div');
    card.className = 'card';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = `Table ${t.name || t.code || t.id}`;
    card.appendChild(title);

    const kpis = document.createElement('div');
    kpis.className = 'kpis';
    const kpi1 = document.createElement('div');
    kpi1.className='kpi'; kpi1.textContent = `En attente: ${t.pending_count ?? t.pending ?? 0}`;
    const kpi2 = document.createElement('div');
    kpi2.className='kpi'; kpi2.textContent = `Dernier ticket: ${t.last_ticket_id ?? '-'}`;
    kpis.append(kpi1,kpi2);
    card.appendChild(kpis);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const flushBtn = document.createElement('button');
    flushBtn.className = 'btn ok'; flushBtn.textContent = 'Imprimer maintenant';
    flushBtn.onclick = async ()=>{
      flushBtn.disabled = true;
      try{
        await jpost('/print/flush', { table_id: t.id || t.code || t.name });
        await loadTables();
        alert('Flush demandé ✔');
      }catch(e){ alert('Erreur flush: '+e.message); }
      flushBtn.disabled = false;
    };
    const paidBtn = document.createElement('button');
    paidBtn.className = 'btn ghost'; paidBtn.textContent = 'Paiement confirmé';
    paidBtn.onclick = async ()=>{
      paidBtn.disabled = true;
      try{
        await jpost('/staff/payment-confirm', { table_id: t.id || t.code || t.name });
        await loadTables();
        alert('Table remise à zéro ✔');
      }catch(e){ alert('Erreur paiement-confirm: '+e.message); }
      paidBtn.disabled = false;
    };
    actions.append(flushBtn, paidBtn);
    card.appendChild(actions);

    listEl.appendChild(card);
  }
}

// ------- Summary -------
async function loadSummary(){
  summaryEl.innerHTML = '<div class="muted">Chargement…</div>';
  try{
    const data = await jget('/staff/summary');
    const items = Array.isArray(data)? data : (data.tickets||[]);
    if(items.length===0){
      summaryEl.innerHTML = '<div class="muted">Aucun ticket aujourd’hui</div>';
      return;
    }
    summaryEl.innerHTML='';
    items.slice(0,40).forEach(t=>{
      const it = document.createElement('div');
      it.className = 'item';
      it.innerHTML = `<strong>#${t.id ?? t.ticket_id ?? '?'}</strong> — table ${t.table_id ?? t.table ?? '-'} — total ${t.total ?? '-'} €`;
      summaryEl.appendChild(it);
    });
  }catch(e){
    summaryEl.innerHTML = `<div class="muted" style="color:#ffa8a8">Erreur /staff/summary : ${e.message}</div>`;
  }
}

// ------- Events -------
refreshBtn.addEventListener('click', loadTables);
filterEl.addEventListener('change', loadTables);
summaryBtn.addEventListener('click', loadSummary);

// ------- Boot -------
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('service-worker.js').catch(()=>{});
}
loadTables();
loadSummary();
