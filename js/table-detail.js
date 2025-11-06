// pwa-staff/js/table-detail.js
console.log("[table-detail] initialisé ✅ (emplacement fixe + statuts persistants)");

(function () {
  const $ = (s, r = document) => r.querySelector(s);

  // on garde les statuts qu'on a posés pour les remettre après un refresh
  // ex: { T6: {key:"commande", label:"Commandée"} }
  const currentTableStatuses = {};
  const paymentTimers = {};

  // --------------------------------------------------
  // 0. helpers DOM
  // --------------------------------------------------
  function getTableIdFromCard(card) {
    if (!card) return null;
    const dataId = card.dataset.table;
    if (dataId) return dataId.toUpperCase();
    const chip = card.querySelector(".chip");
    if (chip) return chip.textContent.trim().toUpperCase();
    return null;
  }

  // crée ou récupère le span de statut à l'endroit CORRECT (juste après .chip)
  function getOrCreateStatusSpan(card) {
    if (!card) return null;
    const existing = card.querySelector(".table-status-inline");
    if (existing) return existing;

    const chip = card.querySelector(".chip");
    const span = document.createElement("span");
    span.className = "table-status-inline";
    span.style.display = "inline-block";
    span.style.marginLeft = "6px";
    span.style.fontSize = "12px";
    span.style.padding = "2px 8px";
    span.style.borderRadius = "999px";
    span.style.background = "#1f2937";
    span.style.color = "#fff";

    if (chip && chip.parentNode) {
      chip.parentNode.insertBefore(span, chip.nextSibling);
    } else {
      card.prepend(span);
    }
    return span;
  }

  // --------------------------------------------------
  // 1. suppression "En attente"
  // --------------------------------------------------
  function removeWaitingLabels() {
    document.querySelectorAll(".table span, .table small, .table div").forEach((el) => {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt.startsWith("dernier")) return;
      if (txt.startsWith("en attente")) el.remove();
    });
  }

  // --------------------------------------------------
  // 2. mettre un statut sur une table
  // --------------------------------------------------
  // statusKey ∈ ["vide","commande","prepa","doitpayer","payee"]
  function setTableStatus(tableId, statusKey, label) {
    if (!tableId) return;
    // on mémorise
    currentTableStatuses[tableId] = { key: statusKey, label };

    const card = findTableCard(tableId);
    if (!card) return;
    const span = getOrCreateStatusSpan(card);
    if (!span) return;

    span.textContent = label;

    // couleur
    switch (statusKey) {
      case "vide":
        span.style.background = "#1f2937";
        break;
      case "commande":
        span.style.background = "#334155";
        break;
      case "prepa":
        span.style.background = "#1d4ed8";
        break;
      case "doitpayer":
        span.style.background = "#b45309";
        break;
      case "payee":
        span.style.background = "#15803d";
        break;
      default:
        span.style.background = "#1f2937";
    }
  }

  function getTableStatus(tableId) {
    const card = findTableCard(tableId);
    if (!card) return null;
    const span = card.querySelector(".table-status-inline");
    if (!span) return null;
    return (span.textContent || "").trim();
  }

  // --------------------------------------------------
  // 3. trouver une carte
  // --------------------------------------------------
  function findTableCard(tableId) {
    if (!tableId) return null;
    const card = document.querySelector(`[data-table="${tableId}"]`);
    if (card) return card;
    const all = document.querySelectorAll(".table");
    for (const c of all) {
      const chip = c.querySelector(".chip");
      if (chip && chip.textContent.trim().toUpperCase() === tableId.toUpperCase()) {
        return c;
      }
    }
    return null;
  }

  // --------------------------------------------------
  // 4. initialisation de toutes les tables -> "Vide"
  // --------------------------------------------------
  function ensureAllTablesHaveDefaultStatus() {
    document.querySelectorAll(".table").forEach((card) => {
      const id = getTableIdFromCard(card);
      const span = getOrCreateStatusSpan(card);

      // si on avait déjà un statut en mémoire → on le remet
      if (id && currentTableStatuses[id]) {
        const { key, label } = currentTableStatuses[id];
        setTableStatus(id, key, label);
      } else {
        // sinon, on met Vide
        span.textContent = "Vide";
        span.style.background = "#1f2937";
        if (id) {
          currentTableStatuses[id] = { key: "vide", label: "Vide" };
        }
      }
    });
  }

  // --------------------------------------------------
  // 5. API helpers
  // --------------------------------------------------
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

  // --------------------------------------------------
  // 6. timers 15 min
  // --------------------------------------------------
  const paymentTimers = {};
  function startDoitPayerTimer(tableId) {
    if (paymentTimers[tableId]) clearTimeout(paymentTimers[tableId]);
    paymentTimers[tableId] = setTimeout(() => {
      setTableStatus(tableId, "doitpayer", "Doit payer");
    }, 15 * 60 * 1000);
  }
  function clearDoitPayerTimer(tableId) {
    if (paymentTimers[tableId]) {
      clearTimeout(paymentTimers[tableId]);
      delete paymentTimers[tableId];
    }
  }

  // --------------------------------------------------
  // 7. panneau latéral
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

  // --------------------------------------------------
  // 8. charger données d'une table
  // --------------------------------------------------
  async function loadTableData(tableId) {
    try {
      const session = await apiGET(`/session/${encodeURIComponent(tableId)}`);
      const orders = session?.orders || [];
      if (orders.length) {
        return {
          mode: "session",
          orders,
          total:
            session.aggregate?.total ??
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

    const summary = await apiGET(`/summary`);
    const tickets = (summary.tickets || []).filter(
      (t) => (t.table || "").toUpperCase() === tableId.toUpperCase()
    );
    const total = tickets.reduce((sum, t) => sum + Number(t.total || 0), 0);
    return { mode: "summary", orders: tickets, total };
  }

  // --------------------------------------------------
  // 9. ouvrir panneau
  // --------------------------------------------------
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
        content.innerHTML = `<p>Aucune commande pour cette table.</p>`;
        setTableStatus(tableId, "vide", "Vide");
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
            <h4 style="margin:0 0 4px 0;font-size:13px;">#${o.id || ""} ${o.time ? "• " + o.time : ""}</h4>
            <ul style="margin:0;padding-left:16px;">${items}</ul>
            ${o.total ? `<div style="margin-top:4px;">Sous-total : ${o.total} €</div>` : ""}
          </div>
        `;
      });
      html += `<p style="margin-top:8px;font-weight:700;">Total cumulé : ${Number(
        data.total || 0
      ).toFixed(2)} €</p>`;
      html += `
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
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

  // --------------------------------------------------
  // 10. clic sur carte
  // --------------------------------------------------
  document.addEventListener("click", (e) => {
    if (e.target.closest("button") && !e.target.closest("#tablePanel")) return;
    const card = e.target.closest("[data-table], .table");
    if (!card) return;
    const id = getTableIdFromCard(card);
    if (!id) return;
    openTablePanel(id);
  });

  // --------------------------------------------------
  // 11. actions panneau
  // --------------------------------------------------
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
      startDoitPayerTimer(tableId);
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
      clearDoitPayerTimer(tableId);
      return;
    }
  });

  // --------------------------------------------------
  // 12. boutons verts de la grille
  // --------------------------------------------------
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const txt = btn.textContent.trim().toLowerCase();
    const card = btn.closest("[data-table], .table");
    if (!card) return;
    const tableId = getTableIdFromCard(card);
    if (!tableId) return;

    if (txt.includes("imprimer maintenant")) {
      setTableStatus(tableId, "prepa", "En préparation");
      startDoitPayerTimer(tableId);
      return;
    }
    if (txt.includes("paiement confirmé")) {
      setTableStatus(tableId, "payee", "Payée");
      clearDoitPayerTimer(tableId);
      return;
    }
  });

  // --------------------------------------------------
  // 13. sync /summary pour passer automatiquement en "Commandée"
  // --------------------------------------------------
  async function syncStatusesFromSummary() {
    try {
      const data = await apiGET("/summary");
      const tickets = data.tickets || [];

      const tablesWithOrders = new Set(
        tickets
          .map((t) => (t.table || "").toUpperCase())
          .filter((t) => t.length > 0)
      );

      // marquer "Commandée" si on voit un ticket et que c'était Vide
      tablesWithOrders.forEach((tableId) => {
        const current = (currentTableStatuses[tableId]?.label || "").toLowerCase();
        if (!current || current === "vide") {
          setTableStatus(tableId, "commande", "Commandée");
        }
      });

      // remettre Vide celles qui étaient seulement "Commandée" mais n'ont plus de ticket
      document.querySelectorAll(".table").forEach((card) => {
        const id = getTableIdFromCard(card);
        if (!id) return;
        if (!tablesWithOrders.has(id)) {
          const saved = currentTableStatuses[id];
          if (saved && saved.key === "commande") {
            setTableStatus(id, "vide", "Vide");
          }
        }
      });
    } catch (err) {
      console.warn("[table-detail] sync summary échoué:", err.message);
    }
  }

  // --------------------------------------------------
  // 14. observer le DOM -> on remet nos statuts
  // --------------------------------------------------
  const domObs = new MutationObserver(() => {
    removeWaitingLabels();
    ensureAllTablesHaveDefaultStatus();
  });
  domObs.observe(document.body, { childList: true, subtree: true });

  // lancer la sync régulièrement
  syncStatusesFromSummary();
  setInterval(syncStatusesFromSummary, 8000);
})();
