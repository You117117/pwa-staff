// pwa-staff/js/table-detail.js
// v8 — met à jour la pastille .status-chip créée par app.js
console.log("[table-detail] v8 chargé ✅");

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const paymentTimers = {}; // pour "Doit payer" après 15 min

  // --------------------- helpers API ---------------------
  function getApiBase() {
    const input = $("#apiUrl");
    const val = (input && input.value.trim()) || "";
    if (val) return val.replace(/\/+$/, "");
    try {
      const ls =
        localStorage.getItem("staff_api_url") ||
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
    if (!base) throw new Error("API non définie");
    const res = await fetch(base + path, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    return res.json();
  }

  // --------------------- trouver les cartes ---------------------
  function findTableCard(tableId) {
    if (!tableId) return null;
    tableId = tableId.toUpperCase();
    // d’abord data-table
    let card = document.querySelector(`[data-table="${tableId}"]`);
    if (card) return card;
    // sinon .table avec chip
    const all = document.querySelectorAll(".table");
    for (const c of all) {
      const chip = c.querySelector(".chip");
      if (chip && chip.textContent.trim().toUpperCase() === tableId) {
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

  // --------------------- pastille de statut ---------------------
  function getStatusChip(card) {
    if (!card) return null;
    // priorité à la classe ajoutée par notre app.js
    let chip = card.querySelector(".status-chip");
    if (chip) return chip;

    // fallback : 2e .chip
    const chips = card.querySelectorAll(".chip");
    if (chips.length >= 2) return chips[1];
    return null;
  }

  function setStatus(tableId, state) {
    const card = findTableCard(tableId);
    if (!card) return;
    const chip = getStatusChip(card);
    if (!chip) return;

    switch (state) {
      case "empty":
        chip.textContent = "Vide";
        chip.style.background = ""; // style par défaut
        break;
      case "ordered":
        chip.textContent = "Commandée";
        chip.style.background = "#334155";
        break;
      case "preparing":
        chip.textContent = "En préparation";
        chip.style.background = "#1d4ed8";
        break;
      case "toPay":
        chip.textContent = "Doit payer";
        chip.style.background = "#b45309";
        break;
      case "paid":
        chip.textContent = "Payée";
        chip.style.background = "#15803d";
        break;
      default:
        chip.textContent = "Vide";
        chip.style.background = "";
    }
  }

  function getStatus(tableId) {
    const card = findTableCard(tableId);
    if (!card) return null;
    const chip = getStatusChip(card);
    if (!chip) return null;
    return (chip.textContent || "").trim();
  }

  function startToPayTimer(tableId) {
    clearToPayTimer(tableId);
    paymentTimers[tableId] = setTimeout(() => {
      // ne pas écraser un "Payée"
      if (getStatus(tableId) !== "Payée") {
        setStatus(tableId, "toPay");
      }
    }, 15 * 60 * 1000);
  }

  function clearToPayTimer(tableId) {
    if (paymentTimers[tableId]) {
      clearTimeout(paymentTimers[tableId]);
      delete paymentTimers[tableId];
    }
  }

  // --------------------- panneau latéral (comme avant) ---------------------
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
      <h2 id="panelTitle" style="margin:0;font-size:1.3rem;">Table</h2>
      <p id="panelStatus" style="margin:.25rem 0 0 0;color:#9CA3AF;">Sélectionnez une table…</p>
      <button id="panelClose" style="margin-top:.5rem;background:#374151;border:none;color:white;padding:4px 10px;border-radius:4px;cursor:pointer;">Fermer</button>
    </div>
    <div id="panelContent" style="padding:1rem;"></div>
  `;
  document.body.appendChild(panel);
  $("#panelClose").onclick = () => (panel.style.right = "-420px");

  function buttonsHtml(tableId) {
    return `
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button id="btnPrint" data-table="${tableId}" style="flex:1;background:#10B981;border:none;border-radius:6px;padding:8px;cursor:pointer;">Imprimer</button>
        <button id="btnPaid" data-table="${tableId}" style="flex:1;background:#3B82F6;border:none;border-radius:6px;padding:8px;cursor:pointer;">Paiement confirmé</button>
      </div>
    `;
  }

  async function loadTablePanel(tableId) {
    const title = $("#panelTitle");
    const status = $("#panelStatus");
    const content = $("#panelContent");
    title.textContent = "Table " + tableId;
    status.textContent = "Chargement…";
    content.innerHTML = "<p>Chargement…</p>";
    panel.style.right = "0";

    // 1. essayer /session/<table>
    try {
      const session = await apiGET(`/session/${encodeURIComponent(tableId)}`);
      const orders = session?.orders || [];
      if (orders.length) {
        status.textContent = "Commandée";
        setStatus(tableId, "ordered");
        let html = "";
        orders.forEach((o) => {
          const items = (o.items || [])
            .map((it) => `<li>${it.qty || 1}× ${it.name || ""}</li>`)
            .join("");
          html += `
            <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px;">
              <h4 style="margin:0 0 4px 0;">Ticket ${o.id || ""}</h4>
              <ul style="margin:0;padding-left:16px;">${items}</ul>
            </div>
          `;
        });
        html += buttonsHtml(tableId);
        content.innerHTML = html;
        return;
      }
    } catch {
      // on tente summary ensuite
    }

  // 2. fallback /summary
    try {
      const summary = await apiGET("/summary");
      const tickets = (summary.tickets || []).filter(
        (t) => (t.table || "").toUpperCase() === tableId.toUpperCase()
      );
      if (!tickets.length) {
        status.textContent = "Vide";
        setStatus(tableId, "empty");
        content.innerHTML = "<p>Aucune commande pour cette table.</p>";
        return;
      }
      status.textContent = "Commandée";
      setStatus(tableId, "ordered");

      let html = "";
      tickets.forEach((t) => {
        const items = (t.items || [])
          .map((it) => `<li>${it.qty || 1}× ${it.name || ""}</li>`)
          .join("");
        html += `
          <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px;">
            <h4 style="margin:0 0 4px 0;">Ticket ${t.id || ""} ${t.time ? "• " + t.time : ""}</h4>
            <ul style="margin:0;padding-left:16px;">${items}</ul>
            ${t.total ? `<p style="margin-top:4px;">Sous-total : ${t.total} €</p>` : ""}
          </div>
        `;
      });
      html += buttonsHtml(tableId);
      content.innerHTML = html;
    } catch (err) {
      status.textContent = "Erreur";
      content.innerHTML = `<p style="color:#ef4444;">${err.message}</p>`;
    }
  }

  // --------------------- clics ---------------------
  document.addEventListener("click", (e) => {
    // clic sur une table
    const card = e.target.closest(".table, [data-table]");
    if (card && !e.target.closest("#tablePanel")) {
      const id = getTableIdFromCard(card);
      if (id) loadTablePanel(id);
      return;
    }

    // clic dans le panneau
    const btnPrint = e.target.closest("#btnPrint");
    if (btnPrint) {
      const tableId = btnPrint.dataset.table;
      setStatus(tableId, "preparing");
      startToPayTimer(tableId);
      return;
    }
    const btnPaid = e.target.closest("#btnPaid");
    if (btnPaid) {
      const tableId = btnPaid.dataset.table;
      setStatus(tableId, "paid");
      clearToPayTimer(tableId);
      return;
    }

    // clic sur bouton vert de la carte
    const btn = e.target.closest("button");
    if (btn) {
      const txt = btn.textContent.trim().toLowerCase();
      const parentCard = btn.closest(".table, [data-table]");
      if (!parentCard) return;
      const tableId = getTableIdFromCard(parentCard);
      if (!tableId) return;

      if (txt.includes("imprimer")) {
        setStatus(tableId, "preparing");
        startToPayTimer(tableId);
      } else if (txt.includes("paiement")) {
        setStatus(tableId, "paid");
        clearToPayTimer(tableId);
      }
    }
  });

  // --------------------- sync /summary toutes les 8s ---------------------
  async function syncFromSummary() {
    try {
      const data = await apiGET("/summary");
      const tickets = data.tickets || [];

      const tablesWithOrders = new Set(
        tickets
          .map((t) => (t.table || "").toUpperCase())
          .filter(Boolean)
      );

      // tables qui ont des commandes → "Commandée" si pas déjà plus avancé
      tablesWithOrders.forEach((tid) => {
        const cur = getStatus(tid);
        if (!cur || cur === "Vide") {
          setStatus(tid, "ordered");
        }
      });

      // tables sans commandes → si elles étaient "Commandée" on remet "Vide"
      document.querySelectorAll(".table").forEach((card) => {
        const tid = getTableIdFromCard(card);
        if (!tid) return;
        if (!tablesWithOrders.has(tid)) {
          const cur = getStatus(tid);
          if (cur === "Commandée") {
            setStatus(tid, "empty");
          }
        }
      });
    } catch (err) {
      // on ignore, on réessaiera
    }
  }

  // lancer après que app.js ait affiché les cartes
  window.addEventListener("load", () => {
    setTimeout(() => {
      // première passe : s'assurer que chaque table a un statut (si jamais)
      document.querySelectorAll(".table").forEach((card) => {
        const chip = getStatusChip(card);
        if (chip && !chip.textContent.trim()) {
          chip.textContent = "Vide";
        }
      });

      syncFromSummary();
      setInterval(syncFromSummary, 8000);
    }, 300);
  });
})();
