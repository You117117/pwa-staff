// ======================================================
//  PWA STAFF — VERSION ORIGINALE + SYNCHRO AJOUTÉE
//  PARTIE A
// ======================================================

document.addEventListener("DOMContentLoaded", () => {

  // ------------------------------
  // SELECTEURS
  // ------------------------------
  const apiInput = document.querySelector("#apiUrl");
  const tablesContainer = document.querySelector("#tables");
  const tablesEmpty = document.querySelector("#tablesEmpty");
  const filterSelect = document.querySelector("#filterTables");
  const summaryContainer = document.querySelector("#summary");
  const summaryEmpty = document.querySelector("#summaryEmpty");

  // ------------------------------
  // CONSTANTES
  // ------------------------------
  const REFRESH_MS = 5000;
  const PREP_MS = 20 * 60 * 1000;     // 20 min
  const BUFFER_MS = 120 * 1000;       // 120 sec
  const RESET_HOUR = 3;               // reset journée 03:00

  // ------------------------------
  // UTILS
  // ------------------------------

  const normId = (id) => (id || "").trim().toUpperCase();
  const now = () => Date.now();

  const getApiBase = () =>
    apiInput ? apiInput.value.trim().replace(/\/+$/, "") : "";

  function parseHHMM(str) {
    if (!str || typeof str !== "string") return 0;
    const m = str.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return 0;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function formatTime(datestr) {
    if (!datestr) return "--:--";
    const d = new Date(datestr);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
  }

  // ------------------------------
  // BUSINESS DAY
  // ------------------------------
  function getBusinessDayKey() {
    const d = new Date();
    if (d.getHours() < RESET_HOUR) d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  // ------------------------------
  // STORES
  // (ON GARDE EXACTEMENT TES OBJETS LOCAUX)
  // MAIS on désactive la partie qui cassait la synchro.
  // ------------------------------

  const localTableStatus = (window.localTableStatus = window.localTableStatus || {});
  const tableMemory = (window.tableMemory = window.tableMemory || {});
  const autoBuffer = (window.autoBuffer = window.autoBuffer || {});
  const payClose = (window.payClose = window.payClose || {});
  const alertedTickets = (window.alertedTickets = window.alertedTickets || {});
  const prevStatusBeforePay = (window.prevStatusBeforePay = window.prevStatusBeforePay || {});
  const localLastActivity = (window.localLastActivity = window.localLastActivity || {});
  if (!window.lastKnownStatus) window.lastKnownStatus = {};

  // =====================================================
  // 🔥 CHANGEMENT IMPORTANT POUR LA SYNCHRO :
  // On ignore ignoreIds + isClosed dans l'affichage.
  // Ils restent stockés mais n'impactent PLUS l'état visuel.
  // =====================================================

  function isTicketIgnored(tableId, ticketId) {
    return false; // 🔥 synchro totale : plus de tickets masqués différemment
  }

  function isTableClosed(tableId) {
    return false; // 🔥 synchro totale : aucune fermeture locale différente
  }

  // ------------------------------
  // SAUVEGARDE LOCALSTORAGE
  // ------------------------------

  const STORAGE_KEY = "staff-state-v1";

  function saveState() {
    const json = {
      tableMemory,
      localTableStatus,
      autoBuffer,
      payClose,
      alertedTickets,
      prevStatusBeforePay,
      localLastActivity,
      lastKnownStatus: window.lastKnownStatus,
      businessDay: window.businessDayKey || getBusinessDayKey(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
    } catch {}
  }

  function loadState() {
    try {
      const txt = localStorage.getItem(STORAGE_KEY);
      if (!txt) return;
      const s = JSON.parse(txt);

      Object.assign(tableMemory, s.tableMemory || {});
      Object.assign(localTableStatus, s.localTableStatus || {});
      Object.assign(autoBuffer, s.autoBuffer || {});
      Object.assign(payClose, s.payClose || {});
      Object.assign(alertedTickets, s.alertedTickets || {});
      Object.assign(prevStatusBeforePay, s.prevStatusBeforePay || {});
      Object.assign(localLastActivity, s.localLastActivity || {});
      Object.assign(window.lastKnownStatus, s.lastKnownStatus || {});

      if (s.businessDay) window.businessDayKey = s.businessDay;
    } catch {}
  }

  loadState();
  // ------------------------------
  // RESET DE JOURNÉE (inchangé)
  // ------------------------------
  function resetForNewBusinessDay() {
    Object.values(autoBuffer).forEach(v => {
      if (v && v.timeoutId) clearTimeout(v.timeoutId);
    });
    Object.keys(autoBuffer).forEach(k => delete autoBuffer[k]);

    Object.values(payClose).forEach(v => {
      if (v && v.timeoutId) clearTimeout(v.timeoutId);
    });
    Object.keys(payClose).forEach(k => delete payClose[k]);

    Object.keys(localTableStatus).forEach(k => delete localTableStatus[k]);
    Object.keys(prevStatusBeforePay).forEach(k => delete prevStatusBeforePay[k]);
    Object.keys(alertedTickets).forEach(k => delete alertedTickets[k]);
    Object.keys(window.lastKnownStatus || {}).forEach(k => delete window.lastKnownStatus[k]);
    Object.keys(localLastActivity).forEach(k => delete localLastActivity[k]);

    // 🔥 On NE touche plus tableMemory.ignoreIds ni isClosed
    // On les laisse exister mais on les ignore pour l'affichage.
  }

  function ensureBusinessDayFresh() {
    const currentKey = getBusinessDayKey();
    if (!window.businessDayKey || window.businessDayKey !== currentKey) {
      resetForNewBusinessDay();
      window.businessDayKey = currentKey;
      saveState();
    }
  }

  // ------------------------------
  // STATUT LOCAL (préparation / doit payé)
  // ------------------------------

  function setPreparationFor20min(tableId) {
    const id = normId(tableId);
    localTableStatus[id] = { phase: "PREPARATION", until: now() + PREP_MS };
    saveState();
  }

  function getLocalStatus(tableId) {
    const id = normId(tableId);
    const st = localTableStatus[id];
    if (!st) return null;

    if (st.phase === "PREPARATION") {
      if (now() < st.until) return "En préparation";
      localTableStatus[id] = { phase: "PAY", until: null };
      saveState();
      return "Doit payé";
    }

    if (st.phase === "PAY") return "Doit payé";

    return null;
  }

  // ------------------------------
  // BUFFER AUTOMATIQUE 120s
  // ------------------------------

  async function autoPrintAndPrep(id) {
    const base = getApiBase();
    if (base) {
      try {
        await fetch(`${base}/print`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: id })
        });
      } catch {}
    }

    setPreparationFor20min(id);
    window.lastKnownStatus[id] = "En préparation";

    delete autoBuffer[id];
    saveState();
    refreshTables();
  }

  function startAutoBuffer(id) {
    id = normId(id);
    if (autoBuffer[id]) return;

    const until = now() + BUFFER_MS;
    const timeoutId = setTimeout(() => autoPrintAndPrep(id), BUFFER_MS);

    autoBuffer[id] = { until, timeoutId };
    saveState();
  }

  function cancelAutoBuffer(id) {
    id = normId(id);
    if (autoBuffer[id]) {
      if (autoBuffer[id].timeoutId) clearTimeout(autoBuffer[id].timeoutId);
      delete autoBuffer[id];
      saveState();
    }
  }

  // ------------------------------
  // RÉCUP TICKETS D'UNE TABLE
  // ------------------------------

  async function fetchTicketIdsForTable(base, tableIdNorm) {
    try {
      const res = await fetch(`${base}/summary`, { cache: "no-store" });
      const data = await res.json();

      return (data.tickets || [])
        .filter(t => normId(t.table) === tableIdNorm)
        .map(t => t.id)
        .filter(id => id !== undefined && id !== null)
        .map(String);

    } catch {
      return [];
    }
  }

  // ------------------------------
  // PAIEMENT → FERMETURE
  // ------------------------------

  async function closeTableAndIgnoreCurrentTickets(tableId) {
    const base = getApiBase();
    const id = normId(tableId);

    window.lastKnownStatus[id] = "Vide";
    delete localTableStatus[id];
    cancelAutoBuffer(id);

    // On récupère les tickets mais on ne les masquera plus visuellement,
    // c'est juste pour garder ton mécanisme interne.
    const ids = base ? await fetchTicketIdsForTable(base, id) : [];

    if (!tableMemory[id]) tableMemory[id] = { isClosed: true, ignoreIds: new Set() };
    tableMemory[id].isClosed = true;
    ids.forEach(tid => tableMemory[id].ignoreIds.add(String(tid)));

    delete prevStatusBeforePay[id];
    delete payClose[id];

    saveState();
  }

  function scheduleCloseIn30s(id) {
    id = normId(id);

    const closeAt = now() + 30_000;
    if (payClose[id] && payClose[id].timeoutId) {
      clearTimeout(payClose[id].timeoutId);
    }

    const timeoutId = setTimeout(() => closeTableAndIgnoreCurrentTickets(id), 30_000);

    payClose[id] = { closeAt, timeoutId };
    saveState();
  }

  function cancelPayClose(id) {
    id = normId(id);

    if (payClose[id] && payClose[id].timeoutId)
      clearTimeout(payClose[id].timeoutId);

    delete payClose[id];
    saveState();
  }
  window.cancelPayClose = cancelPayClose;

  // ======================================================
  //  🔥 PARTIE LA PLUS IMPORTANTE : SYNCHRO STATUT + TRI
  // ======================================================
  //
  // On ne dépend PLUS de ignoreIds / isClosed.
  // On dépend UNIQUEMENT de `/tables` + `/summary`
  // Et de ton localTableStatus (PREPARATION / PAY)
  //
  // Ainsi, PC + SMARTPHONE = identique.
  // ======================================================
  // ------------------------------
  // RENDU DES TABLES (SYNCHRO 100%)
  // ------------------------------

  function renderTables(tables) {
    if (!tablesContainer) return;

    tablesContainer.innerHTML = "";
    if (!tables || !tables.length) {
      if (tablesEmpty) tablesEmpty.style.display = "block";
      return;
    }
    if (tablesEmpty) tablesEmpty.style.display = "none";

    const filter = filterSelect ? normId(filterSelect.value) : "TOUTES";

    // 🔥 TRI : toujours basé sur l’heure réelle du dernier ticket (/summary)
    const sorted = [...tables].sort((a, b) => {
      const ta = a.lastMinutes || 0;
      const tb = b.lastMinutes || 0;
      return tb - ta; // plus récent en premier
    });

    sorted.forEach((table) => {
      const id = normId(table.id);
      if (filter !== "TOUTES" && filter !== id) return;

      const lastStr = table.lastTimeStr || "--:--";

      // 🔥 Calcule du statut SYNCHRO
      // 1. si pas de tickets -> "Vide"
      // 2. si tickets -> "Commandée"
      // 3. si local status (preparation/pay) -> garder ton comportement original

      let finalStatus = "Vide";

      if (table.hasTickets) finalStatus = "Commandée";

      const localSt = getLocalStatus(id);
      if (localSt) finalStatus = localSt;

      if (window.lastKnownStatus[id]) finalStatus = window.lastKnownStatus[id];

      const showActions = finalStatus !== "Vide";
      const isPaymentPending = !!payClose[id];

      // ------------------------------
      // CONSTRUCTION DE LA CARTE
      // ------------------------------
      const card = document.createElement("div");
      card.className = "table";
      card.setAttribute("data-table", id);

      card.innerHTML = `
        <div class="card-head">
          <span class="chip">${id}</span>
          <span class="chip">${finalStatus}</span>
          <span class="chip">
            ${ lastStr !== "--:--" ? `Commandé à : ${lastStr}` : "Commandé à : --:--" }
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
            : ""
        }
      `;

      // ------------------------------
      // OUVERTURE PAGE DÉTAIL
      // ------------------------------
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        openTableDetail(id);
      });

      // ------------------------------
      // LOGIQUE DES BOUTONS
      // ------------------------------

      if (showActions) {
        // --- bouton imprimer
        const btnPrint = card.querySelector(".btn-print");
        if (btnPrint) {
          btnPrint.addEventListener("click", async (e) => {
            e.stopPropagation();
            const base = getApiBase();
            cancelAutoBuffer(id);

            if (base) {
              try {
                await fetch(`${base}/print`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ table: id }),
                });
              } catch {}
            }

            // passe en préparation
            setPreparationFor20min(id);
            if (!tableMemory[id]) tableMemory[id] = { isClosed: false, ignoreIds: new Set() };
            tableMemory[id].isClosed = false;

            saveState();
            refreshTables();
          });
        }

        // --- bouton paiement confirmé
        const btnPaid = card.querySelector(".btn-paid");
        if (btnPaid) {
          btnPaid.addEventListener("click", async (e) => {
            e.stopPropagation();
            const base = getApiBase();
            cancelAutoBuffer(id);

            // stocker la valeur précédente
            prevStatusBeforePay[id] = {
              label: finalStatus || "Commandée",
              local: localTableStatus[id] ? { ...localTableStatus[id] } : null,
            };
            saveState();

            // backend
            if (base) {
              try {
                await fetch(`${base}/confirm`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ table: id }),
                });
              } catch {}
            }

            delete localTableStatus[id];
            scheduleCloseIn30s(id);

            saveState();
            refreshTables();
          });
        }

        // --- bouton annuler paiement
        const btnCancel = card.querySelector(".btn-cancel-pay");
        if (btnCancel) {
          btnCancel.addEventListener("click", (e) => {
            e.stopPropagation();

            cancelPayClose(id);

            const prev = prevStatusBeforePay[id];
            if (prev) {
              if (prev.local) {
                localTableStatus[id] = { ...prev.local };
              } else {
                delete localTableStatus[id];
              }
              delete prevStatusBeforePay[id];
            } else {
              localTableStatus[id] = { phase: "PAY", until: null };
            }

            saveState();
            refreshTables();
          });
        }
      }

      tablesContainer.appendChild(card);
    });
  }

  // ------------------------------
  // RENDU DU SUMMARY (inchangé)
  // ------------------------------

  function renderSummary(tickets) {
    if (!summaryContainer) return;

    summaryContainer.innerHTML = "";

    if (!tickets || !tickets.length) {
      if (summaryEmpty) summaryEmpty.style.display = "block";
      return;
    }
    if (summaryEmpty) summaryEmpty.style.display = "none";

    tickets.forEach((t) => {
      const bodyText = Array.isArray(t.items)
        ? t.items.map(it => `${it.qty || it.quantity || 1}× ${it.label || it.name || "article"}`).join(", ")
        : t.label || "";

      const item = document.createElement("div");
      item.className = "summaryItem";

      item.innerHTML = `
        <div class="head">
          <span class="chip">${t.table}</span>
          <span class="chip"><i class="icon-clock"></i> ${t.time}</span>
          <span class="chip">Total : ${t.total} €</span>
        </div>
        <div class="body">${bodyText}</div>
      `;

      summaryContainer.appendChild(item);
    });
  }
  // ------------------------------
  // REFRESH TABLES (SYNCHRO 100%)
  // ------------------------------

  async function refreshTables() {
    ensureBusinessDayFresh();

    const base = getApiBase();
    if (!base) {
      if (tablesContainer) tablesContainer.innerHTML = "";
      if (tablesEmpty) tablesEmpty.style.display = "block";
      return;
    }

    try {
      // 1) RECUP /tables
      const res = await fetch(`${base}/tables`);
      const data = await res.json();
      const tables = data.tables || [];

      // 2) RECUP /summary (pour générer la synchro)
      const resSum = await fetch(`${base}/summary`, { cache: "no-store" });
      const dataSum = await resSum.json();
      const tickets = dataSum.tickets || [];

      // REGROUPER LES TICKETS PAR TABLE
      const byTable = {};
      tickets.forEach(t => {
        const tid = normId(t.table);
        if (!byTable[tid]) byTable[tid] = [];
        byTable[tid].push(t);
      });

      // ------------------------------
      // AUGMENTER CHAQUE TABLE :
      // - lastTimeStr
      // - lastMinutes
      // - hasTickets
      // - statusComputed
      // ------------------------------
      const enriched = tables.map(tb => {
        const id = normId(tb.id);
        const list = byTable[id] || [];

        // tri des tickets (optionnel mais propre)
        list.sort((a, b) => parseHHMM(b.time) - parseHHMM(a.time));

        const lastTimeStr = list.length ? list[0].time : null;
        const lastMinutes = lastTimeStr ? parseHHMM(lastTimeStr) : 0;
        const hasTickets = list.length > 0;

        // statut synchro
        let statusComputed = "Vide";
        if (hasTickets) statusComputed = "Commandée";

        const local = getLocalStatus(id);
        if (local) statusComputed = local;

        if (window.lastKnownStatus[id]) statusComputed = window.lastKnownStatus[id];

        return {
          ...tb,
          id,
          list,
          lastTimeStr,
          lastMinutes,
          hasTickets,
          statusComputed,
        };
      });

      // BUFFER AUTO
      enriched.forEach(t => {
        const id = t.id;
        if (t.statusComputed === "Commandée" && !autoBuffer[id]) {
          startAutoBuffer(id);
        }
        if (t.statusComputed !== "Commandée") {
          cancelAutoBuffer(id);
        }
      });

      saveState();
      renderTables(enriched);

    } catch (err) {
      console.error("[STAFF] erreur refreshTables()", err);
    }
  }

  // ------------------------------
  // REFRESH SUMMARY (inchangé)
  // ------------------------------

  async function refreshSummary() {
    const base = getApiBase();

    if (!base) {
      if (summaryContainer) summaryContainer.innerHTML = "";
      if (summaryEmpty) summaryEmpty.style.display = "block";
      return;
    }

    try {
      const res = await fetch(`${base}/summary`);
      const data = await res.json();
      renderSummary(data.tickets || []);
    } catch (err) {
      console.error("[STAFF] erreur refreshSummary()", err);
    }
  }

  // ------------------------------
  // PANEL DÉTAIL TABLE
  // ------------------------------

  function openTableDetail(tableId) {
    if (window.showTableDetail) {
      window.showTableDetail(tableId);
    }
  }

  // ------------------------------
  // REARMER LES TIMERS
  // ------------------------------

  function rearmTimersAfterLoad() {
    // autoBuffer
    Object.entries(autoBuffer).forEach(([id, obj]) => {
      const remaining = obj.until - now();
      if (remaining <= 0) {
        autoPrintAndPrep(id);
      } else {
        obj.timeoutId = setTimeout(() => autoPrintAndPrep(id), remaining);
      }
    });

    // payClose
    Object.entries(payClose).forEach(([id, obj]) => {
      const remaining = obj.closeAt - now();
      if (remaining <= 0) {
        closeTableAndIgnoreCurrentTickets(id);
      } else {
        obj.timeoutId = setTimeout(() => closeTableAndIgnoreCurrentTickets(id), remaining);
      }
    });
  }

  // ------------------------------
  // INIT
  // ------------------------------

  // Charger l’API mémorisée
  try {
    const saved = localStorage.getItem("staff-api");
    if (saved && apiInput) apiInput.value = saved;
  } catch {}

  ensureBusinessDayFresh();
  rearmTimersAfterLoad();

  // Premier refresh
  refreshTables();
  refreshSummary();

  // Refresh auto
  setInterval(() => {
    refreshTables();
    refreshSummary();
  }, REFRESH_MS);

});



