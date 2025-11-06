// pwa-staff/js/table-detail.js
console.log("[table-detail] chargé ✅");

(function () {
  const STATUS_COLORS = {
    vide: "#1f2937",
    commande: "#334155",
    prepa: "#1d4ed8",
    doitpayer: "#b45309",
    payee: "#15803d",
  };

  // on garde ce qu'on a déjà mis pour chaque table
  const currentStatuses = {};
  const paymentTimers = {};

  // --------------------------------------------------
  // outils
  // --------------------------------------------------
  const $ = (s, r = document) => r.querySelector(s);

  function getApiBase() {
    const input = $("#apiUrl");
    const val = (input?.value || "").trim();
    if (val) return val.replace(/\/+$/, "");
    try {
      const ls =
        localStorage.getItem("orders_api_url_v11") ||
        localStorage.getItem("api_url") ||
        localStorage.getItem("API_URL") ||
        "";
      return ls.trim().replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  async function apiGET(path) {
    const base = getApiBase();
    const res = await fetch(base + path, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    return res.json();
  }

  function findTableCard(tableId) {
    if (!tableId) return null;
    tableId = tableId.toUpperCase();
    // d'abord via data-table
    let card = document.querySelector(`[data-table="${tableId}"]`);
    if (card) return card;
    // sinon via le libellé .chip
    const all = document.querySelectorAll(".table");
    for (const c of all) {
      const chip = c.querySelector(".chip");
      if (!chip) continue;
      if (chip.textContent.trim().toUpperCase() === tableId) {
        return c;
      }
    }
    return null;
  }

  function getTableIdFromCard(card) {
    if (!card) return null;
    if (card.dataset.table) return card.dataset.table.toUpperCase();
    const chip = card.querySelector(".chip");
    if (chip) return chip.textContent.trim().toUpperCase();
    return null;
  }

  // crée le span de statut AU BON ENDROIT (juste après .chip)
  function ensureStatusSpanOnCard(card) {
    if (!card) return null;
    let span = card.querySelector(".table-status-inline");
    if (span) return span;

    const chip = card.querySelector(".chip");
    span = document.createElement("span");
    span.className = "table-status-inline";
    span.style.display = "inline-block";
    span.style.marginLeft = "6px";
    span.style.fontSize = "12px";
    span.style.padding = "2px 8px";
    span.style.borderRadius = "999px";
    span.style.color = "#fff";

    if (chip && chip.parentNode) {
      chip.parentNode.insertBefore(span, chip.nextSibling);
    } else {
      card.prepend(span);
    }
    return span;
  }

  function applyStatusToCard(card, key, label) {
    const span = ensureStatusSpanOnCard(card);
    if (!span) return;
    span.textContent = label;
    span.style.background = STATUS_COLORS[key] || STATUS_COLORS.vide;
  }

  function setTableStatus(tableId, key, label) {
    currentStatuses[tableId.toUpperCase()] = { key, label };
    const card = findTableCard(tableId);
    if (card) applyStatusToCard(card, key, label);
  }

  function getTableStatus(tableId) {
    return currentStatuses[tableId.toUpperCase()] || null;
  }

  // --------------------------------------------------
  // 1. supprimer "En attente" et mettre "Vide" à toutes les tables
  // --------------------------------------------------
  function cleanAndInitTables() {
    // virer les "En attente : ..."
    document.querySelectorAll(".table span, .table small, .table div").forEach((el) => {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt.startsWith("dernier")) return;
      if (txt.startsWith("en attente")) el.remove();
    });

    // poser le badge au bon endroit et réappliquer le statut connu
    document.querySelectorAll(".table").forEach((card) => {
      const id = getTableIdFromCard(card);
      const span = ensureStatusSpanOnCard(card);
      if (!id) {
        span.textContent = "Vide";
        span.style.background = STATUS_COLORS.vide;
        return;
      }
      const saved = currentStatuses[id];
      if (saved) {
        applyStatusToCard(card, saved.key, saved.label);
      } else {
        applyStatusToCard(card, "vide", "Vide");
        currentStatuses[id] = { key: "vide", label: "Vide" };
      }
    });
  }

  // 1er passage
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cleanAndInitTables);
  } else {
    cleanAndInitTables();
  }

  // quand la page réinjecte des tables → on remet nos statuts
  const domObserver = new MutationObserver(() => {
    cleanAndInitTables();
  });
  domObserver.observe(document.body, { childList: true, subtree: true });

  // --------------------------------------------------
  // 2. panneau latéral (inchangé dans l'esprit)
  // --------------------------------------------------
  const panel = document.createElement("div");
  panel.id = "tablePanel";
  Object.assign(panel.style, {
    position: "fixed",
    top: "0",
    right: "-420px",
    width: "400px",
    height: "100%",
    background: "#111827",
    color: "white",
    boxShadow: "-4px 0 8px rgba(0,0,0,.3)",
    transition: "right .3s ease",
    zIndex: "9999",
    overflowY: "auto",
  });
  panel.innerHTML = `
    <div style="padding:1rem;border-bottom:1px solid #1f2937;">
      <h2 id="panelTitle" style="margin:0;font-size:1.4rem;">Table</h2>
      <p id="panelStatus" style="margin:.25rem 0 0 0;color:#9CA3AF;">Chargement...</p>
      <button id="panelClose" style="margin-top:.5rem;background:#374151;border:none;color:white;padding:4px 10px;border-radius:4px;cursor:pointer;">Fermer</button>
    </div>
    <div id="panelContent" style="padding:1rem;">Sélectionnez une table…</div>
  `;
  document.body.appendChild(panel);
  $("#panelClose").onclick = () => (panel.style.right = "-420px");

  async function loadTableData(tableId) {
    // essayer /session
    try {
      const session = await apiGET(`/session/${encodeURIComponent(tableId)}`);
      const orders = session?.orders || [];
      if (orders.length) {
        return {
          orders,
          total:
            session.aggregate?.total ||
            orders.reduce(
              (sum, o) =>
                sum +
                (o.items || []).reduce(
                  (s, it) => s + (it.qty || 1) * (it.price || 0),
                  0
                ),
              0
            ),
        };
      }
    } catch (_) {}

    // sinon /summary
    const summary = await apiGET(`/summary`);
    const tickets = (summary.tickets || []).filter(
      (t) => (t.table || "").toUpperCase() === tableId.toUpperCase()
    );
    const total = tickets.reduce((sum, t) => sum + Number(t.total || 0), 0);
    return { orders: tickets, total };
  }

  async function openTablePanel(tableId) {
    const title = $("#panelTitle");
    const status = $("#panelStatus");
    const content = $("#panelContent");
    title.textContent = "Table " + tableId;
    status.textContent = "Chargement…";
    content.innerHTML = "<p>Chargement…</p>";
    panel.style.right = "0";

    try {
      const data = await loadTableData(tableId);
      const orders = data.orders || [];

      if (!orders.length) {
        status.textContent = "Vide";
        setTableStatus(tableId, "vide", "Vide");
        content.innerHTML = "<p>Aucune commande pour cette table.</p>";
        return;
      }

      status.textContent = "Commandée";
      setTableStatus(tableId, "commande", "Commandée");

      let html = "";
      orders.forEach((o) => {
        const items = (o.items || [])
          .map((it) => `<li>${it.qty || 1}× ${it.name || ""}</li>`)
          .join("");
        html += `
          <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px;">
            <h4 style="margin:0 0 4px 0;font-size:13px;">#${o.id || ""} ${
          o.time ? "• " + o.time : ""
        }</h4>
            <ul style="margin:0;padding-left:16px;">${items}</ul>
            ${o.total ? `<div style="margin-top:4px;">Sous-total : ${o.total} €</div>` : ""}
          </div>
        `;
      });
      html += `<p style="margin-top:8px;font-weight:700;">Total cumulé : ${Number(
        data.total || 0
      ).toFixed(2)} €</p>`;
      html += `
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button id="btnPrint" data-table="${tableId}" style="flex:1;background:#10B981;border:none;border-radius:6px;padding:8px;cursor:pointer;">Imprimer</button>
          <button id="btnPaid" data-table="${tableId}" style="flex:1;background:#3B82F6;border:none;border-radius:6px;padding:8px;cursor:pointer;">Paiement confirmé</button>
        </div>
      `;
      content.innerHTML = html;
    } catch (err) {
      status.textContent = "Erreur de chargement";
      content.innerHTML = `<p style="color:#ef4444;">${err.message}</p>`;
    }
  }

  // clic sur une table → ouvrir
  document.addEventListener("click", (e) => {
    if (e.target.closest("button") && !e.target.closest("#tablePanel")) return;
    const card = e.target.closest(".table, [data-table]");
    if (!card) return;
    const id = getTableIdFromCard(card);
    if (!id) return;
    openTablePanel(id);
  });

  // boutons dans le panneau
  document.addEventListener("click", async (e) => {
    const printBtn = e.target.closest("#btnPrint");
    if (printBtn) {
      const tableId = printBtn.dataset.table;
      try {
        await fetch(getApiBase() + "/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: tableId }),
        });
      } catch (_) {}
      setTableStatus(tableId, "prepa", "En préparation");
      // timer 15 min
      if (paymentTimers[tableId]) clearTimeout(paymentTimers[tableId]);
      paymentTimers[tableId] = setTimeout(() => {
        setTableStatus(tableId, "doitpayer", "Doit payer");
      }, 15 * 60 * 1000);
      return;
    }

    const paidBtn = e.target.closest("#btnPaid");
    if (paidBtn) {
      const tableId = paidBtn.dataset.table;
      try {
        await fetch(getApiBase() + "/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: tableId }),
        });
      } catch (_) {}
      setTableStatus(tableId, "payee", "Payée");
      if (paymentTimers[tableId]) {
        clearTimeout(paymentTimers[tableId]);
        delete paymentTimers[tableId];
      }
      return;
    }
  });

  // boutons verts dans la grille
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const txt = btn.textContent.trim().toLowerCase();
    const card = btn.closest(".table, [data-table]");
    if (!card) return;
    const id = getTableIdFromCard(card);
    if (!id) return;

    if (txt.includes("imprimer maintenant")) {
      setTableStatus(id, "prepa", "En préparation");
      if (paymentTimers[id]) clearTimeout(paymentTimers[id]);
      paymentTimers[id] = setTimeout(() => {
        setTableStatus(id, "doitpayer", "Doit payer");
      }, 15 * 60 * 1000);
      return;
    }

    if (txt.includes("paiement confirmé")) {
      setTableStatus(id, "payee", "Payée");
      if (paymentTimers[id]) {
        clearTimeout(paymentTimers[id]);
        delete paymentTimers[id];
      }
      return;
    }
  });

  // --------------------------------------------------
  // sync /summary → passe en "Commandée" les tables qui reçoivent une commande
  // --------------------------------------------------
  async function syncFromSummary() {
    try {
      const data = await apiGET("/summary");
      const tickets = data.tickets || [];

      const tablesWithOrder = new Set(
        tickets.map((t) => (t.table || "").toUpperCase()).filter(Boolean)
      );

      // tables qui ont une commande → si on les avait en Vide → Commandée
      tablesWithOrder.forEach((tid) => {
        const saved = currentStatuses[tid];
        if (!saved || saved.key === "vide") {
          setTableStatus(tid, "commande", "Commandée");
        }
      });

      // tables qu'on avait mises "Commandée" mais qui n'ont plus de tickets → revenir à Vide
      Object.keys(currentStatuses).forEach((tid) => {
        const saved = currentStatuses[tid];
        if (saved.key === "commande" && !tablesWithOrder.has(tid)) {
          setTableStatus(tid, "vide", "Vide");
        }
      });
    } catch (err) {
      // pas grave, on réessaiera
      console.warn("[table-detail] sync summary échoué:", err.message);
    }
  }

  syncFromSummary();
  setInterval(syncFromSummary, 8000);
})();
// pwa-staff/js/table-detail.js
console.log("[table-detail] chargé ✅");

(function () {
  const STATUS_COLORS = {
    vide: "#1f2937",
    commande: "#334155",
    prepa: "#1d4ed8",
    doitpayer: "#b45309",
    payee: "#15803d",
  };

  // on garde ce qu'on a déjà mis pour chaque table
  const currentStatuses = {};
  const paymentTimers = {};

  // --------------------------------------------------
  // outils
  // --------------------------------------------------
  const $ = (s, r = document) => r.querySelector(s);

  function getApiBase() {
    const input = $("#apiUrl");
    const val = (input?.value || "").trim();
    if (val) return val.replace(/\/+$/, "");
    try {
      const ls =
        localStorage.getItem("orders_api_url_v11") ||
        localStorage.getItem("api_url") ||
        localStorage.getItem("API_URL") ||
        "";
      return ls.trim().replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  async function apiGET(path) {
    const base = getApiBase();
    const res = await fetch(base + path, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    return res.json();
  }

  function findTableCard(tableId) {
    if (!tableId) return null;
    tableId = tableId.toUpperCase();
    // d'abord via data-table
    let card = document.querySelector(`[data-table="${tableId}"]`);
    if (card) return card;
    // sinon via le libellé .chip
    const all = document.querySelectorAll(".table");
    for (const c of all) {
      const chip = c.querySelector(".chip");
      if (!chip) continue;
      if (chip.textContent.trim().toUpperCase() === tableId) {
        return c;
      }
    }
    return null;
  }

  function getTableIdFromCard(card) {
    if (!card) return null;
    if (card.dataset.table) return card.dataset.table.toUpperCase();
    const chip = card.querySelector(".chip");
    if (chip) return chip.textContent.trim().toUpperCase();
    return null;
  }

  // crée le span de statut AU BON ENDROIT (juste après .chip)
  function ensureStatusSpanOnCard(card) {
    if (!card) return null;
    let span = card.querySelector(".table-status-inline");
    if (span) return span;

    const chip = card.querySelector(".chip");
    span = document.createElement("span");
    span.className = "table-status-inline";
    span.style.display = "inline-block";
    span.style.marginLeft = "6px";
    span.style.fontSize = "12px";
    span.style.padding = "2px 8px";
    span.style.borderRadius = "999px";
    span.style.color = "#fff";

    if (chip && chip.parentNode) {
      chip.parentNode.insertBefore(span, chip.nextSibling);
    } else {
      card.prepend(span);
    }
    return span;
  }

  function applyStatusToCard(card, key, label) {
    const span = ensureStatusSpanOnCard(card);
    if (!span) return;
    span.textContent = label;
    span.style.background = STATUS_COLORS[key] || STATUS_COLORS.vide;
  }

  function setTableStatus(tableId, key, label) {
    currentStatuses[tableId.toUpperCase()] = { key, label };
    const card = findTableCard(tableId);
    if (card) applyStatusToCard(card, key, label);
  }

  function getTableStatus(tableId) {
    return currentStatuses[tableId.toUpperCase()] || null;
  }

  // --------------------------------------------------
  // 1. supprimer "En attente" et mettre "Vide" à toutes les tables
  // --------------------------------------------------
  function cleanAndInitTables() {
    // virer les "En attente : ..."
    document.querySelectorAll(".table span, .table small, .table div").forEach((el) => {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt.startsWith("dernier")) return;
      if (txt.startsWith("en attente")) el.remove();
    });

    // poser le badge au bon endroit et réappliquer le statut connu
    document.querySelectorAll(".table").forEach((card) => {
      const id = getTableIdFromCard(card);
      const span = ensureStatusSpanOnCard(card);
      if (!id) {
        span.textContent = "Vide";
        span.style.background = STATUS_COLORS.vide;
        return;
      }
      const saved = currentStatuses[id];
      if (saved) {
        applyStatusToCard(card, saved.key, saved.label);
      } else {
        applyStatusToCard(card, "vide", "Vide");
        currentStatuses[id] = { key: "vide", label: "Vide" };
      }
    });
  }

  // 1er passage
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", cleanAndInitTables);
  } else {
    cleanAndInitTables();
  }

  // quand la page réinjecte des tables → on remet nos statuts
  const domObserver = new MutationObserver(() => {
    cleanAndInitTables();
  });
  domObserver.observe(document.body, { childList: true, subtree: true });

  // --------------------------------------------------
  // 2. panneau latéral (inchangé dans l'esprit)
  // --------------------------------------------------
  const panel = document.createElement("div");
  panel.id = "tablePanel";
  Object.assign(panel.style, {
    position: "fixed",
    top: "0",
    right: "-420px",
    width: "400px",
    height: "100%",
    background: "#111827",
    color: "white",
    boxShadow: "-4px 0 8px rgba(0,0,0,.3)",
    transition: "right .3s ease",
    zIndex: "9999",
    overflowY: "auto",
  });
  panel.innerHTML = `
    <div style="padding:1rem;border-bottom:1px solid #1f2937;">
      <h2 id="panelTitle" style="margin:0;font-size:1.4rem;">Table</h2>
      <p id="panelStatus" style="margin:.25rem 0 0 0;color:#9CA3AF;">Chargement...</p>
      <button id="panelClose" style="margin-top:.5rem;background:#374151;border:none;color:white;padding:4px 10px;border-radius:4px;cursor:pointer;">Fermer</button>
    </div>
    <div id="panelContent" style="padding:1rem;">Sélectionnez une table…</div>
  `;
  document.body.appendChild(panel);
  $("#panelClose").onclick = () => (panel.style.right = "-420px");

  async function loadTableData(tableId) {
    // essayer /session
    try {
      const session = await apiGET(`/session/${encodeURIComponent(tableId)}`);
      const orders = session?.orders || [];
      if (orders.length) {
        return {
          orders,
          total:
            session.aggregate?.total ||
            orders.reduce(
              (sum, o) =>
                sum +
                (o.items || []).reduce(
                  (s, it) => s + (it.qty || 1) * (it.price || 0),
                  0
                ),
              0
            ),
        };
      }
    } catch (_) {}

    // sinon /summary
    const summary = await apiGET(`/summary`);
    const tickets = (summary.tickets || []).filter(
      (t) => (t.table || "").toUpperCase() === tableId.toUpperCase()
    );
    const total = tickets.reduce((sum, t) => sum + Number(t.total || 0), 0);
    return { orders: tickets, total };
  }

  async function openTablePanel(tableId) {
    const title = $("#panelTitle");
    const status = $("#panelStatus");
    const content = $("#panelContent");
    title.textContent = "Table " + tableId;
    status.textContent = "Chargement…";
    content.innerHTML = "<p>Chargement…</p>";
    panel.style.right = "0";

    try {
      const data = await loadTableData(tableId);
      const orders = data.orders || [];

      if (!orders.length) {
        status.textContent = "Vide";
        setTableStatus(tableId, "vide", "Vide");
        content.innerHTML = "<p>Aucune commande pour cette table.</p>";
        return;
      }

      status.textContent = "Commandée";
      setTableStatus(tableId, "commande", "Commandée");

      let html = "";
      orders.forEach((o) => {
        const items = (o.items || [])
          .map((it) => `<li>${it.qty || 1}× ${it.name || ""}</li>`)
          .join("");
        html += `
          <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px;">
            <h4 style="margin:0 0 4px 0;font-size:13px;">#${o.id || ""} ${
          o.time ? "• " + o.time : ""
        }</h4>
            <ul style="margin:0;padding-left:16px;">${items}</ul>
            ${o.total ? `<div style="margin-top:4px;">Sous-total : ${o.total} €</div>` : ""}
          </div>
        `;
      });
      html += `<p style="margin-top:8px;font-weight:700;">Total cumulé : ${Number(
        data.total || 0
      ).toFixed(2)} €</p>`;
      html += `
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button id="btnPrint" data-table="${tableId}" style="flex:1;background:#10B981;border:none;border-radius:6px;padding:8px;cursor:pointer;">Imprimer</button>
          <button id="btnPaid" data-table="${tableId}" style="flex:1;background:#3B82F6;border:none;border-radius:6px;padding:8px;cursor:pointer;">Paiement confirmé</button>
        </div>
      `;
      content.innerHTML = html;
    } catch (err) {
      status.textContent = "Erreur de chargement";
      content.innerHTML = `<p style="color:#ef4444;">${err.message}</p>`;
    }
  }

  // clic sur une table → ouvrir
  document.addEventListener("click", (e) => {
    if (e.target.closest("button") && !e.target.closest("#tablePanel")) return;
    const card = e.target.closest(".table, [data-table]");
    if (!card) return;
    const id = getTableIdFromCard(card);
    if (!id) return;
    openTablePanel(id);
  });

  // boutons dans le panneau
  document.addEventListener("click", async (e) => {
    const printBtn = e.target.closest("#btnPrint");
    if (printBtn) {
      const tableId = printBtn.dataset.table;
      try {
        await fetch(getApiBase() + "/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: tableId }),
        });
      } catch (_) {}
      setTableStatus(tableId, "prepa", "En préparation");
      // timer 15 min
      if (paymentTimers[tableId]) clearTimeout(paymentTimers[tableId]);
      paymentTimers[tableId] = setTimeout(() => {
        setTableStatus(tableId, "doitpayer", "Doit payer");
      }, 15 * 60 * 1000);
      return;
    }

    const paidBtn = e.target.closest("#btnPaid");
    if (paidBtn) {
      const tableId = paidBtn.dataset.table;
      try {
        await fetch(getApiBase() + "/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: tableId }),
        });
      } catch (_) {}
      setTableStatus(tableId, "payee", "Payée");
      if (paymentTimers[tableId]) {
        clearTimeout(paymentTimers[tableId]);
        delete paymentTimers[tableId];
      }
      return;
    }
  });

  // boutons verts dans la grille
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const txt = btn.textContent.trim().toLowerCase();
    const card = btn.closest(".table, [data-table]");
    if (!card) return;
    const id = getTableIdFromCard(card);
    if (!id) return;

    if (txt.includes("imprimer maintenant")) {
      setTableStatus(id, "prepa", "En préparation");
      if (paymentTimers[id]) clearTimeout(paymentTimers[id]);
      paymentTimers[id] = setTimeout(() => {
        setTableStatus(id, "doitpayer", "Doit payer");
      }, 15 * 60 * 1000);
      return;
    }

    if (txt.includes("paiement confirmé")) {
      setTableStatus(id, "payee", "Payée");
      if (paymentTimers[id]) {
        clearTimeout(paymentTimers[id]);
        delete paymentTimers[id];
      }
      return;
    }
  });

  // --------------------------------------------------
  // sync /summary → passe en "Commandée" les tables qui reçoivent une commande
  // --------------------------------------------------
  async function syncFromSummary() {
    try {
      const data = await apiGET("/summary");
      const tickets = data.tickets || [];

      const tablesWithOrder = new Set(
        tickets.map((t) => (t.table || "").toUpperCase()).filter(Boolean)
      );

      // tables qui ont une commande → si on les avait en Vide → Commandée
      tablesWithOrder.forEach((tid) => {
        const saved = currentStatuses[tid];
        if (!saved || saved.key === "vide") {
          setTableStatus(tid, "commande", "Commandée");
        }
      });

      // tables qu'on avait mises "Commandée" mais qui n'ont plus de tickets → revenir à Vide
      Object.keys(currentStatuses).forEach((tid) => {
        const saved = currentStatuses[tid];
        if (saved.key === "commande" && !tablesWithOrder.has(tid)) {
          setTableStatus(tid, "vide", "Vide");
        }
      });
    } catch (err) {
      // pas grave, on réessaiera
      console.warn("[table-detail] sync summary échoué:", err.message);
    }
  }

  syncFromSummary();
  setInterval(syncFromSummary, 8000);
})();
