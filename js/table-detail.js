// pwa-staff/js/table-detail.js
// version légère + statuts à côté du numéro + sync /summary + timers
console.log("[table-detail] v6 chargé ✅");

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const paymentTimers = {}; // pour "doit payer" après 15 min

  // ---------------------------
  // helpers API
  // ---------------------------
  function getApiBase() {
    const input = $("#apiUrl");
    const val = (input && input.value.trim()) || "";
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
    if (!base) throw new Error("API non définie");
    const res = await fetch(base + path, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    return res.json();
  }

  // ---------------------------
  // DOM helpers tables
  // ---------------------------
  function findTableCard(tableId) {
    if (!tableId) return null;
    const byData = document.querySelector(`[data-table="${tableId}"]`);
    if (byData) return byData;
    const all = document.querySelectorAll(".table");
    for (const c of all) {
      const chip = c.querySelector(".chip");
      if (chip && chip.textContent.trim().toUpperCase() === tableId.toUpperCase()) {
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

  // ---------------------------
  // statut inline (à côté du numéro)
  // ---------------------------
  function ensureStatusBadge(card) {
    if (!card) return null;

    // virer les vieux "En attente"
    card.querySelectorAll("span, small").forEach((el) => {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt.startsWith("en attente")) el.remove();
    });

    let badge = card.querySelector(".table-status-inline");
    if (!badge) {
      const chip = card.querySelector(".chip");
      badge = document.createElement("span");
      badge.className = "table-status-inline";
      badge.style.display = "inline-block";
      badge.style.marginLeft = "6px";
      badge.style.fontSize = "12px";
      badge.style.padding = "2px 8px";
      badge.style.borderRadius = "999px";
      badge.style.background = "#1f2937";
      badge.style.color = "#fff";
      badge.textContent = "Vide";
      if (chip && chip.parentNode) {
        chip.parentNode.insertBefore(badge, chip.nextSibling);
      } else {
        card.prepend(badge);
      }
    }
    return badge;
  }

  function applyStatus(tableId, statusKey) {
    const card = findTableCard(tableId);
    if (!card) return;
    const badge = ensureStatusBadge(card);
    if (!badge) return;

    switch (statusKey) {
      case "empty":
        badge.textContent = "Vide";
        badge.style.background = "#1f2937";
        break;
      case "ordered":
        badge.textContent = "Commandée";
        badge.style.background = "#334155";
        break;
      case "preparing":
        badge.textContent = "En préparation";
        badge.style.background = "#1d4ed8";
        break;
      case "toPay":
        badge.textContent = "Doit payer";
        badge.style.background = "#b45309";
        break;
      case "paid":
        badge.textContent = "Payée";
        badge.style.background = "#15803d";
        break;
      default:
        badge.textContent = "Vide";
        badge.style.background = "#1f2937";
    }
  }

  function getCurrentStatus(tableId) {
    const card = findTableCard(tableId);
    if (!card) return null;
    const badge = card.querySelector(".table-status-inline");
    if (!badge) return null;
    return (badge.textContent || "").trim();
  }

  function startToPayTimer(tableId) {
    // 15 minutes
    clearToPayTimer(tableId);
    paymentTimers[tableId] = setTimeout(() => {
      // ne pas écraser une table déjà Payée
      if (getCurrentStatus(tableId) !== "Payée") {
        applyStatus(tableId, "toPay");
      }
    }, 15 * 60 * 1000);
  }

  function clearToPayTimer(tableId) {
    if (paymentTimers[tableId]) {
      clearTimeout(paymentTimers[tableId]);
      delete paymentTimers[tableId];
    }
  }

  // ---------------------------
  // panneau latéral
  // ---------------------------
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
        applyStatus(tableId, "ordered");
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
        html += `
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button id="btnPrint" data-table="${tableId}" style="flex:1;background:#10B981;border:none;border-radius:6px;padding:8px;cursor:pointer;">Imprimer</button>
            <button id="btnPaid" data-table="${tableId}" style="flex:1;background:#3B82F6;border:none;border-radius:6px;padding:8px;cursor:pointer;">Paiement confirmé</button>
          </div>
        `;
        content.innerHTML = html;
        return;
      }
    } catch (e) {
      // on va tenter /summary juste après
    }

    // 2. fallback /summary
    try {
      const summary = await apiGET("/summary");
      const tickets = (summary.tickets || []).filter(
        (t) => (t.table || "").toUpperCase() === tableId.toUpperCase()
      );
      if (!tickets.length) {
        status.textContent = "Vide";
        applyStatus(tableId, "empty");
        content.innerHTML = "<p>Aucune commande pour cette table.</p>";
        return;
      }
      status.textContent = "Commandée";
      applyStatus(tableId, "ordered");
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
      content.innerHTML = html + `
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button id="btnPrint" data-table="${tableId}" style="flex:1;background:#10B981;border:none;border-radius:6px;padding:8px;cursor:pointer;">Imprimer</button>
          <button id="btnPaid" data-table="${tableId}" style="flex:1;background:#3B82F6;border:none;border-radius:6px;padding:8px;cursor:pointer;">Paiement confirmé</button>
        </div>
      `;
    } catch (err) {
      status.textContent = "Erreur";
      content.innerHTML = `<p style="color:#ef4444;">${err.message}</p>`;
    }
  }

  // ---------------------------
  // évènements clic
  // ---------------------------
  document.addEventListener("click", (e) => {
    // clic sur une carte de table
    const card = e.target.closest(".table, [data-table]");
    if (card && !e.target.closest("#tablePanel")) {
      const id = getTableIdFromCard(card);
      if (id) loadTablePanel(id);
      return;
    }

    // clic bouton du panneau
    const btnPrint = e.target.closest("#btnPrint");
    if (btnPrint) {
      const tableId = btnPrint.dataset.table;
      applyStatus(tableId, "preparing");
      startToPayTimer(tableId);
      // tu pourras rajouter le POST vers /print si tu veux
      return;
    }

    const btnPaid = e.target.closest("#btnPaid");
    if (btnPaid) {
      const tableId = btnPaid.dataset.table;
      applyStatus(tableId, "paid");
      clearToPayTimer(tableId);
      return;
    }

    // clic sur les boutons verts dans les cartes
    const btn = e.target.closest("button");
    if (btn) {
      const txt = btn.textContent.trim().toLowerCase();
      const parentCard = btn.closest(".table, [data-table]");
      if (!parentCard) return;
      const tableId = getTableIdFromCard(parentCard);
      if (!tableId) return;

      if (txt.includes("imprimer")) {
        applyStatus(tableId, "preparing");
        startToPayTimer(tableId);
      } else if (txt.includes("paiement")) {
        applyStatus(tableId, "paid");
        clearToPayTimer(tableId);
      }
    }
  });

  // ---------------------------
  // sync /summary toutes les 8s
  // ---------------------------
  async function syncFromSummary() {
    try {
      const summary = await apiGET("/summary");
      const tickets = summary.tickets || [];
      const tablesWithOrders = new Set(
        tickets
          .map((t) => (t.table || "").toUpperCase())
          .filter((t) => t.length > 0)
      );

      // tables avec commandes
      tablesWithOrders.forEach((tid) => {
        const cur = getCurrentStatus(tid);
        if (!cur || cur === "Vide") {
          applyStatus(tid, "ordered");
        }
      });

      // tables sans commandes → on ne remet à Vide que si elles étaient "Commandée"
      const allCards = document.querySelectorAll(".table");
      allCards.forEach((card) => {
        const tid = getTableIdFromCard(card);
        if (!tid) return;
        if (!tablesWithOrders.has(tid)) {
          const cur = getCurrentStatus(tid);
          if (cur === "Commandée") {
            applyStatus(tid, "empty");
          }
        }
      });
    } catch (err) {
      // on ignore, on réessaiera
    }
  }

  // lancer après que les tables soient rendues
  window.addEventListener("load", () => {
    // petit délai pour laisser app.js afficher les cartes
    setTimeout(() => {
      // première passe : poser les pastilles
      const cards = document.querySelectorAll(".table, [data-table]");
      cards.forEach((c) => ensureStatusBadge(c));

      syncFromSummary();
      setInterval(syncFromSummary, 8000);

      // observer UNIQUEMENT le conteneur des tables (pas tout le body)
      const container = $("#tables");
      if (container) {
        const obs = new MutationObserver(() => {
          const cards2 = container.querySelectorAll(".table, [data-table]");
          cards2.forEach((c) => ensureStatusBadge(c));
        });
        obs.observe(container, { childList: true });
      }
    }, 400);
  });
})();
