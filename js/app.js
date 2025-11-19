// app.js — Staff (tables, buffer 120s, paiement, reset 03:00, tri par activité locale)

document.addEventListener('DOMContentLoaded', () => {
  // --- Sélecteurs
  const apiInput = document.querySelector('#apiUrl');
  const tablesContainer = document.querySelector('#tables');
  const tablesEmpty = document.querySelector('#tablesEmpty');
  const filterSelect = document.querySelector('#filterTables');
  const summaryContainer = document.querySelector('#summary');
  const summaryEmpty = document.querySelector('#summaryEmpty');

  // --- Constantes
  const REFRESH_MS = 5000;
  const PREP_MS = 20 * 60 * 1000;
  const BUFFER_MS = 120 * 1000;
  const RESET_HOUR = 3; // heure de "fin de journée" (03:00)

  // --- Utils
  const normId = (id) => (id || '').trim().toUpperCase();
  const now = () => Date.now();
  const getApiBase = () => (apiInput ? apiInput.value.trim().replace(/\/+$/, '') : '');
  const formatTime = (dateString) => {
    if (!dateString) return '--:--';
    const d = new Date(dateString);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  // --- "Business day" (gestion de la journée de service)
  function getBusinessDayKey() {
    // Clé de type "YYYY-MM-DD" mais avec coupure à RESET_HOUR
    const d = new Date();
    const h = d.getHours();
    if (h < RESET_HOUR) {
      // Avant RESET_HOUR, on considère qu'on est encore sur la journée d'hier
      d.setDate(d.getDate() - 1);
    }
    const iso = d.toISOString(); // ex: 2025-11-13T...
    return iso.slice(0, 10); // "YYYY-MM-DD"
  }

  // --- Stores & persistance
  const localTableStatus = (window.localTableStatus = window.localTableStatus || {}); // { phase, until }
  const tableMemory     = (window.tableMemory     = window.tableMemory     || {});   // { isClosed, ignoreIds:Set }
  const autoBuffer      = (window.autoBuffer      = window.autoBuffer      || {});   // { until, timeoutId }
  const payClose        = (window.payClose        = window.payClose        || {});   // { closeAt, timeoutId }
  const alertedTickets  = (window.alertedTickets  = window.alertedTickets  || {});   // { tid -> Set(ids) }
  const prevStatusBeforePay = (window.prevStatusBeforePay = window.prevStatusBeforePay || {}); // { tableId: {label, local} }
  const localLastActivity   = (window.localLastActivity   = window.localLastActivity   || {}); // { tableId: timestamp }

  if (!window.lastKnownStatus) window.lastKnownStatus = {};
  if (!window.businessDayKey) window.businessDayKey = null;

  // --- Chime robuste
  const chime = {
    ctx: null, lastPlayAt: 0, unlockTimer: null, el: null, wavUrl: null, retryTimer: null, retryUntil: 0,
    ensureCtx(){ const AC = window.AudioContext||window.webkitAudioContext; if(!this.ctx&&AC) this.ctx=new AC(); },
    startAutoUnlock(){ this.ensureCtx(); if(!this.ctx) return; const tryResume=()=>{ if(this.ctx&&this.ctx.state!=='running') this.ctx.resume?.().catch(()=>{}); }; if(!this.unlockTimer){ this.unlockTimer=setInterval(tryResume,1000); document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') tryResume();}); } tryResume(); },
    webAudioOk(){ return !!(this.ctx && this.ctx.state==='running'); },
    playWebAudio(){ const tnow=now(); if(tnow-this.lastPlayAt<500) return false; if(!this.webAudioOk()) return false; const ctx=this.ctx,t0=ctx.currentTime,g=ctx.createGain(); g.gain.value=0.0001;
      const notes=[{t:0.00,f:880},{t:0.18,f:1108},{t:0.36,f:1319}];
      const oscs=notes.map(n=>{const o=ctx.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(n.f,t0+n.t); o.connect(g); return o;});
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(0.30,t0+0.05); g.gain.exponentialRampToValueAtTime(0.20,t0+0.40); g.gain.exponentialRampToValueAtTime(0.0001,t0+1.20);
      oscs.forEach((o,i)=>{o.start(t0+notes[i].t); o.stop(t0+1.25);}); this.lastPlayAt=tnow; return true; },
    ensureHtml5Audio(){ if(this.el) return; const {url}=generateChimeWavUrl(); this.wavUrl=url; const a=document.createElement('audio'); a.src=url; a.preload='auto'; a.setAttribute('playsinline','true'); a.style.display='none'; document.body.appendChild(a); this.el=a; },
    tryPlayHtml5(){ const tnow=now(); if(tnow-this.lastPlayAt<500) return true; this.ensureHtml5Audio(); if(!this.el) return false; try{ const p=this.el.play(); if(p&&p.then){ p.then(()=>{this.lastPlayAt=tnow;}).catch(()=>{}); } else { this.lastPlayAt=tnow; } return true; } catch { return false; } },
    playRobust(){ if(this.playWebAudio()) return; if(this.tryPlayHtml5()) return; this.scheduleRetries(); },
    scheduleRetries(){ if(this.retryTimer) return; this.retryUntil=now()+10000; const tick=()=>{ this.ensureCtx(); if(this.playWebAudio()){ clearInterval(this.retryTimer); this.retryTimer=null; return; } if(this.tryPlayHtml5()){ clearInterval(this.retryTimer); this.retryTimer=null; return; } if(now()>this.retryUntil){ clearInterval(this.retryTimer); this.retryTimer=null; } }; this.retryTimer=setInterval(tick,300); document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') tick(); }); }
  };
  function generateChimeWavUrl(){ const sr=44100,dur=1.4,len=Math.floor(sr*dur),data=new Float32Array(len); const seq=[{t:0.00,f:880},{t:0.16,f:1046.5},{t:0.32,f:1318.5}]; const A=0.02,D=0.20,S=0.2,R=0.35; for(let i=0;i<len;i++){ const t=i/sr; let f=seq[seq.length-1].f; for(let j=0;j<seq.length;j++){ if(t>=seq[j].t) f=seq[j].f; } let v=Math.sin(2*Math.PI*f*t); let env=0; if(t<A) env=t/A; else if(t<A+D){ const dd=(t-A)/D; env=1-dd*(1-S); } else if(t<dur-R) env=S; else { const rr=(t-(dur-R))/R; env=S*(1-rr); } const prev=i>0?data[i-1]:0; v=(v*0.7+prev*0.3)*env*0.9; data[i]=v; } const bytesPerSample=2,channels=1,blockAlign=channels*bytesPerSample,byteRate=sr*blockAlign,dataSize=len*blockAlign; const buffer=new ArrayBuffer(44+dataSize); const view=new DataView(buffer); const wStr=(o,s)=>{for(let i=0;i<s.length;i++) view.setUint8(o+i,s.charCodeAt(i));}; const w16=(o,v)=>view.setUint16(o,v,true); const w32=(o,v)=>view.setUint32(o,v,true); wStr(0,'RIFF'); w32(4,36+dataSize); wStr(8,'WAVE'); wStr(12,'fmt '); w32(16,16); w16(20,1); w16(22,channels); w32(24,sr); w32(28,byteRate); w16(32,blockAlign); w16(34,16); wStr(36,'data'); w32(40,dataSize); let off=44; for(let i=0;i<len;i++){ let s=Math.max(-1,Math.min(1,data[i])); view.setInt16(off,s*0x7fff,true); off+=2; } const blob=new Blob([view],{type:'audio/wav'}); return {url:URL.createObjectURL(blob)}; }

  // --- Persistance
  const STORAGE_KEY='staff-state-v1';
  function saveState(){
    const json={
      tableMemory: Object.fromEntries(
        Object.entries(tableMemory).map(([tid,v])=>[
          tid,
          {isClosed:!!v.isClosed,ignoreIds:Array.from(v.ignoreIds||[])}
        ])
      ),
      localTableStatus,
      autoBuffer: Object.fromEntries(Object.entries(autoBuffer).map(([tid,v])=>[tid,{until:v.until}])),
      payClose: Object.fromEntries(Object.entries(payClose).map(([tid,v])=>[tid,{closeAt:v.closeAt}])),
      alertedTickets: Object.fromEntries(Object.entries(alertedTickets).map(([tid,set])=>[tid,Array.from(set||[])])),
      lastKnownStatus,
      prevStatusBeforePay,
      localLastActivity,
      businessDay: window.businessDayKey || getBusinessDayKey()
    };
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(json)); }catch{}
  }
  function loadState(){
    try{
      const txt=localStorage.getItem(STORAGE_KEY); if(!txt) return;
      const s=JSON.parse(txt);
      if(s.tableMemory)
        Object.entries(s.tableMemory).forEach(([tid,v])=>
          tableMemory[tid]={isClosed:!!v.isClosed,ignoreIds:new Set(v.ignoreIds||[])}
        );
      if(s.localTableStatus) Object.assign(localTableStatus,s.localTableStatus);
      if(s.autoBuffer)
        Object.entries(s.autoBuffer).forEach(([tid,v])=>autoBuffer[tid]={until:v.until});
      if(s.payClose)
        Object.entries(s.payClose).forEach(([tid,v])=>payClose[tid]={closeAt:v.closeAt});
      if(s.alertedTickets)
        Object.entries(s.alertedTickets).forEach(([tid,arr])=>alertedTickets[tid]=new Set(arr||[]));
      if(s.lastKnownStatus) Object.assign(window.lastKnownStatus,s.lastKnownStatus);
      if(s.prevStatusBeforePay) Object.assign(prevStatusBeforePay,s.prevStatusBeforePay);
      if(s.localLastActivity) Object.assign(localLastActivity,s.localLastActivity);
      if(s.businessDay) window.businessDayKey = s.businessDay;
    }catch{}
  }

  // --- Reset complet pour nouvelle journée
  function resetForNewBusinessDay() {
    // stop timers buffer
    Object.values(autoBuffer).forEach(v => {
      if (v && v.timeoutId) clearTimeout(v.timeoutId);
    });
    Object.keys(autoBuffer).forEach(k => delete autoBuffer[k]);

    // stop timers clôture payClose
    Object.values(payClose).forEach(v => {
      if (v && v.timeoutId) clearTimeout(v.timeoutId);
    });
    Object.keys(payClose).forEach(k => delete payClose[k]);

    // vider statuts & états locaux
    Object.keys(localTableStatus).forEach(k => delete localTableStatus[k]);
    Object.keys(prevStatusBeforePay).forEach(k => delete prevStatusBeforePay[k]);
    Object.keys(alertedTickets).forEach(k => delete alertedTickets[k]);
    Object.keys(window.lastKnownStatus || {}).forEach(k => delete window.lastKnownStatus[k]);
    Object.keys(localLastActivity).forEach(k => delete localLastActivity[k]);

    // remettre tables "ouvertes" et vider les ignoreIds
    Object.values(tableMemory).forEach(mem => {
      mem.isClosed = false;
      if (mem.ignoreIds && mem.ignoreIds.clear) mem.ignoreIds.clear();
    });
  }

  function ensureBusinessDayFresh() {
    const currentKey = getBusinessDayKey();
    if (!window.businessDayKey || window.businessDayKey !== currentKey) {
      resetForNewBusinessDay();
      window.businessDayKey = currentKey;
      saveState();
    }
  }

  // --- Timers statut
  function setPreparationFor20min(tableId){
    const id=normId(tableId);
    localTableStatus[id]={phase:'PREPARATION',until:now()+PREP_MS};
    saveState();
  }
  function getLocalStatus(tableId){
    const id=normId(tableId),st=localTableStatus[id]; if(!st) return null;
    const t=now();
    if(st.phase==='PREPARATION'){
      if(t<st.until) return 'En préparation';
      localTableStatus[id]={phase:'PAY',until:null}; saveState();
      return 'Doit payé';
    }
    if(st.phase==='PAY') return 'Doit payé';
    return null;
  }

  // --- Buffer 120s
  async function autoPrintAndPrep(id){
    const base=getApiBase();
    if(base){
      try{
        await fetch(`${base}/print`,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({table:id})
        });
      }catch{}
    }
    setPreparationFor20min(id);
    window.lastKnownStatus[id]='En préparation';
    delete autoBuffer[id];
    saveState();
    refreshTables();
  }
  function startAutoBuffer(id){
    id=normId(id);
    if(autoBuffer[id]) return;
    const until=now()+BUFFER_MS;
    const timeoutId=setTimeout(()=>autoPrintAndPrep(id),BUFFER_MS);
    autoBuffer[id]={until,timeoutId};
    saveState();
  }
  function cancelAutoBuffer(id){
    id=normId(id);
    if(autoBuffer[id]){
      if(autoBuffer[id].timeoutId) clearTimeout(autoBuffer[id].timeoutId);
      delete autoBuffer[id];
      saveState();
    }
  }

  // --- /summary helpers
  async function fetchTicketIdsForTable(base, tableIdNorm){
    try{
      const res=await fetch(`${base}/summary`,{cache:'no-store'});
      const data=await res.json();
      return (data.tickets||[])
        .filter(t=>normId(t.table)===tableIdNorm)
        .map(t=>t.id)
        .filter(id=>id!==undefined&&id!==null)
        .map(String);
    }catch{ return []; }
  }

  // --- Clôture
  async function closeTableAndIgnoreCurrentTickets(tableId){
    const base=getApiBase(); const id=normId(tableId);
    window.lastKnownStatus[id]='Vide';
    delete localTableStatus[id];
    cancelAutoBuffer(id);

    const ids=base?await fetchTicketIdsForTable(base,id):[];
    if(!tableMemory[id]) tableMemory[id]={isClosed:true,ignoreIds:new Set()};
    tableMemory[id].isClosed=true;
    ids.forEach(tid=>tableMemory[id].ignoreIds.add(String(tid)));

    delete prevStatusBeforePay[id];
    delete payClose[id];
    saveState();
  }
  function scheduleCloseIn30s(id){
    id=normId(id);
    const closeAt=now()+30_000;
    if(payClose[id]&&payClose[id].timeoutId) clearTimeout(payClose[id].timeoutId);
    const timeoutId=setTimeout(()=>closeTableAndIgnoreCurrentTickets(id),30_000);
    payClose[id]={closeAt,timeoutId};
    saveState();
  }
  function cancelPayClose(id){
    id=normId(id);
    if(payClose[id]&&payClose[id].timeoutId) clearTimeout(payClose[id].timeoutId);
    delete payClose[id];
    saveState();
  }
  window.cancelPayClose = cancelPayClose;

  // --- Rendu LISTE TABLES (TRI PAR localLastActivity)
  function renderTables(tables){
    if(!tablesContainer) return;
    tablesContainer.innerHTML='';

    if(!tables||!tables.length){
      if(tablesEmpty) tablesEmpty.style.display='block';
      return;
    }
    if(tablesEmpty) tablesEmpty.style.display='none';

    const filter=filterSelect?normId(filterSelect.value):'TOUTES';
    const PRIORITY=['Vide','Commandée','En préparation','Doit payé','Payée'];

    // Tri : table avec dernière activité locale la plus récente en haut
    const sorted = [...tables].sort((a, b) => {
      const ida = normId(a.id);
      const idb = normId(b.id);
      const ta = (typeof localLastActivity[ida] === 'number')
        ? localLastActivity[ida]
        : (a.lastTicketAt ? new Date(a.lastTicketAt).getTime() : 0);
      const tb = (typeof localLastActivity[idb] === 'number')
        ? localLastActivity[idb]
        : (b.lastTicketAt ? new Date(b.lastTicketAt).getTime() : 0);
      return tb - ta;
    });

    sorted.forEach((table)=>{
      const id=normId(table.id);
      if(filter!=='TOUTES'&&filter!==id) return;

      const last=table.lastTicketAt?formatTime(table.lastTicketAt):'--:--';
      let backendStatus=table.status||'Vide';
      const prev=window.lastKnownStatus[id]||null;
      const forced=getLocalStatus(id);

      let finalStatus;
      if(forced){ finalStatus=forced; }
      else if(prev&&prev!=='Vide'){
        const prevIdx=PRIORITY.indexOf(prev);
        const backIdx=PRIORITY.indexOf(backendStatus);
        finalStatus=prevIdx>backIdx?prev:backendStatus;
      }
      else { finalStatus=backendStatus; }

      window.lastKnownStatus[id]=finalStatus;
      if(finalStatus!=='Commandée') cancelAutoBuffer(id);

      const showActions = finalStatus!=='Vide';
      const isPaymentPending = !!payClose[id];

      const card=document.createElement('div');
      card.className='table';
      card.setAttribute('data-table',id);
      card.innerHTML = `
  <div class="card-head">
    <span class="chip">${id}</span>
    <span class="chip">${finalStatus}</span>
    <span class="chip">
      ${
        localLastActivity[id] 
        ? `Commandé à : ${formatTime(new Date(localLastActivity[id]).toISOString())}`
        : '—'
      }
    </span>
  </div>

  ${
    showActions
      ? `
        <div class="card-actions">
          <button class="btn btn-primary btn-print">Imprimer maintenant</button>
          ${
            isPaymentPending
              ? `<button class="btn btn-warning btn-cancel-pay" style="background:#f59e0b;border-color:#f59e0b;">Annuler le paiement</button>`
              : `<button class="btn btn-primary btn-paid">Paiement confirmé</button>`
          }
        </div>
      `
      : ``
  }
`;


      card.addEventListener('click',(e)=>{ if(e.target.closest('button')) return; openTableDetail(id); });

      if(showActions){
        const btnPrint=card.querySelector('.btn-print');
        if(btnPrint){
          btnPrint.addEventListener('click', async (e)=>{
            e.stopPropagation();
            const base=getApiBase();
            cancelAutoBuffer(id);
            if(base){
              try{
                await fetch(`${base}/print`,{
                  method:'POST',
                  headers:{'Content-Type':'application/json'},
                  body:JSON.stringify({table:id})
                });
              }catch{}
            }
            setPreparationFor20min(id);
            window.lastKnownStatus[id]='En préparation';
            if(!tableMemory[id]) tableMemory[id]={isClosed:false,ignoreIds:new Set()};
            tableMemory[id].isClosed=false;
            saveState();
            refreshTables();
          });
        }

        const btnPaid=card.querySelector('.btn-paid');
        if(btnPaid){
          btnPaid.addEventListener('click', async (e)=>{
            e.stopPropagation();
            const base=getApiBase();
            cancelAutoBuffer(id);

            prevStatusBeforePay[id] = {
              label: window.lastKnownStatus[id] || 'Commandée',
              local: localTableStatus[id] ? { ...localTableStatus[id] } : null
            };
            saveState();

            if(base){
              try{
                await fetch(`${base}/confirm`,{
                  method:'POST',
                  headers:{'Content-Type':'application/json'},
                  body:JSON.stringify({table:id})
                });
              }catch{}
            }
            window.lastKnownStatus[id]='Payée';
            delete localTableStatus[id];
            scheduleCloseIn30s(id);
            saveState();
            refreshTables();
          });
        }

        const btnCancel=card.querySelector('.btn-cancel-pay');
        if(btnCancel){
          btnCancel.addEventListener('click',(e)=>{
            e.stopPropagation();
            cancelPayClose(id);
            const prevState = prevStatusBeforePay[id];
            if (prevState) {
              window.lastKnownStatus[id] = prevState.label;
              if (prevState.local) {
                localTableStatus[id] = { ...prevState.local };
              } else {
                delete localTableStatus[id];
              }
              delete prevStatusBeforePay[id];
            } else {
              window.lastKnownStatus[id]='Doit payé';
              localTableStatus[id]={phase:'PAY',until:null};
            }
            saveState();
            refreshTables();
          });
        }
      }

      tablesContainer.appendChild(card);
    });
  }

  // --- Résumé du jour
  function renderSummary(tickets){
    if(!summaryContainer) return;
    summaryContainer.innerHTML='';

    if(!tickets||!tickets.length){ if(summaryEmpty) summaryEmpty.style.display='block'; return; }
    if(summaryEmpty) summaryEmpty.style.display='none';

    tickets.forEach((t)=>{
      let bodyText='';
      if(t.label) bodyText=t.label;
      else if(Array.isArray(t.items)){
        bodyText=t.items.map(it=>`${(it.qty||it.quantity||1)}× ${it.label||it.name||it.title||'article'}`).join(', ');
      } else if(Array.isArray(t.lines)){
        bodyText=t.lines.map(it=>`${(it.qty||it.quantity||1)}× ${it.label||it.name||it.title||'article'}`).join(', ');
      }
      const item=document.createElement('div');
      item.className='summaryItem';
      item.innerHTML=`
        <div class="head">
          <span class="chip">${t.table}</span>
          <span class="chip"><i class="icon-clock"></i> ${t.time}</span>
          <span class="chip">Total : ${t.total} €</span>
        </div>
        <div class="body">${bodyText||''}</div>
      `;
      summaryContainer.appendChild(item);
    });
  }

  // --- Refresh tables (+ chime + MAJ activité locale)
  async function refreshTables(){
    ensureBusinessDayFresh();

    const base=getApiBase();
    if(!base){
      if(tablesContainer) tablesContainer.innerHTML='';
      if(tablesEmpty) tablesEmpty.style.display='block';
      return;
    }
    try{
      const res=await fetch(`${base}/tables`);
      const data=await res.json();
      const tables=data.tables||[];

      let summaryByTable={};
      try{
        const resSum=await fetch(`${base}/summary`,{cache:'no-store'});
        const dataSum=await resSum.json();
        const tickets=dataSum.tickets||[];
        tickets.forEach(t=>{
          const tid=normId(t.table);
          if(!tid) return;
          const idStr=t.id!==undefined&&t.id!==null?String(t.id):null;
          if(!summaryByTable[tid]) summaryByTable[tid]=[];
          if(idStr) summaryByTable[tid].push(idStr);
        });
      }catch{}

      const hasNewById={};
      Object.keys(summaryByTable).forEach(tid=>{
        const mem=(tableMemory[tid]=tableMemory[tid]||{isClosed:false,ignoreIds:new Set()});
        const list=summaryByTable[tid]||[];

        const seen=(alertedTickets[tid]=alertedTickets[tid]||new Set());
        const activeIds=list.filter(tk=>!mem.ignoreIds.has(tk));
        const fresh=activeIds.filter(tk=>!seen.has(tk));
        hasNewById[tid]=activeIds.length>0;

        if(fresh.length>0){
          // nouvelle commande détectée -> son + activité
          chime.playRobust();
          fresh.forEach(tk=>seen.add(tk));
          localLastActivity[tid] = now();
        }

        if(mem.isClosed && hasNewById[tid]) mem.isClosed=false;
      });

      const enriched=tables.map(tb=>{
        const idNorm=normId(tb.id);
        if(!idNorm) return tb;
        const mem=(tableMemory[idNorm]=tableMemory[idNorm]||{isClosed:false,ignoreIds:new Set()});

        let status = tb.status;
        if(mem.isClosed){
          status='Vide';
        } else if((!status||status==='Vide')&&hasNewById[idNorm]){
          status='Commandée';
        }

        return {...tb,id:idNorm,status};
      });

      enriched.forEach(t=>{
        const id=normId(t.id);
        if(t.status==='Commandée'){ if(!autoBuffer[id]) startAutoBuffer(id); }
        else { cancelAutoBuffer(id); }
      });

      saveState();
      renderTables(enriched);
    }catch(err){ console.error('[STAFF] erreur tables',err); }
  }

  async function refreshSummary(){
    const base=getApiBase();
    if(!base){
      if(summaryContainer) summaryContainer.innerHTML='';
      if(summaryEmpty) summaryEmpty.style.display='block';
      return;
    }
    try{
      const res=await fetch(`${base}/summary`);
      const data=await res.json();
      renderSummary(data.tickets||[]);
    }catch(err){ console.error('[STAFF] erreur summary',err); }
  }

  function openTableDetail(tableId){ if(window.showTableDetail) window.showTableDetail(tableId); }

  function rearmTimersAfterLoad(){
    Object.entries(autoBuffer).forEach(([tid,v])=>{
      const remaining=v.until-now();
      if(remaining<=0) autoPrintAndPrep(tid);
      else v.timeoutId=setTimeout(()=>autoPrintAndPrep(tid),remaining);
    });
    Object.entries(payClose).forEach(([tid,v])=>{
      const remaining=v.closeAt-now();
      if(remaining<=0) closeTableAndIgnoreCurrentTickets(tid);
      else v.timeoutId=setTimeout(()=>closeTableAndIgnoreCurrentTickets(tid),remaining);
    });
  }

  // --- Init
  const saved=localStorage.getItem('staff-api');
  if(saved&&apiInput) apiInput.value=saved;

  loadState();
  ensureBusinessDayFresh();
  rearmTimersAfterLoad();
  chime.startAutoUnlock();

  refreshTables();
  refreshSummary();
  setInterval(()=>{ refreshTables(); refreshSummary(); }, REFRESH_MS);
});
