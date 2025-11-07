// pwa-staff/js/table-status.js
// version simple : met à jour UNIQUEMENT le badge .status-chip, jamais les boutons
console.log("[table-status] v9 chargé");

(function () {
  const STATUS = {
    empty:     { text: "Vide",          color: "#1f2937" },
    ordered:   { text: "Commandée",     color: "#334155" },
    preparing: { text: "En préparation",color: "#1d4ed8" },
    toPay:     { text: "Doit payer",    color: "#b45309" },
    paid:      { text: "Payée",         color: "#15803d" },
  };

  const tableState  = {};
  const payTimers   = {};

  const $ = (s, r = document) => r.querySelector(s);

  // ----------- API -----------
  function getApiBase() {
    const input = $("#apiUrl");
    const val = (input?.value || "").trim();
    if (val) return val.replace(/\/+$/, "");

    try {
      const fromLS =
        localStorage.getItem("staff_api_url") ||   // 👈 c’est celle que ton staff utilise
        localStorage.getItem("orders_api_url_v11") ||
        localStorage.getItem("api_url") ||
        localStorage.getItem("API_URL") || "";
      return fromLS.trim().replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  async function fetchSummary() {
    const base = getApiBase();
    if (!base) return null;
    const res = await fetch(base + "/summary", { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  }

  // ----------- DOM helpers -----------
  function findTableCard(tableId) {
    const id = tableId.toUpperCase();
    // data-table
    let card = document.querySelector(`[data-table="${id}"]`);
    if (card) return card;

    // sinon via première .chip
    const all = document.querySelectorAll(".table");
    for (const c of all) {
      const chip = c.querySelector(".chip");
      if (chip && chip.textContent.trim().toUpperCase() === id) {
        return c;
      }
    }
    return null;
  }

  // 🔴 le badge qu’on veut mettre à jour, et rien d’autre
  function getStatusBadge(card) {
    if (!card) return null;

    // on enlève d’éventuels vieux "En attente : 0" posés dans la même ligne
    card.querySelectorAll("span, small").forEach((el) => {
      const t = (el.textContent || "").trim().toLowerCase();
      if (t.startsWith("en attente")) el.remove();
    });

    const badge = card.querySelector(".status-chip");
    return badge || null;
  }

  function setStatus(tableId, statusKey) {
    const def = STATUS[statusKey] || STATUS.empty;
    const card = findTableCard(tableId);
    if (!card) return;
    const badge = getStatusBadge(card);
    if (!badge) return;             // 👈 si pas de badge, on NE TOUCHE PAS aux boutons

    badge.textContent = def.text;
    badge.style.background = def.color;
    tableState[tableId.toUpperCase()] = statusKey;
  }

  function startToPay(tableId) {
    const id = tableId.toUpperCase();
    clearToPay(id);
    payTimers[id] = setTimeout(() => {
      if (tableState[id] !== "paid") {
        setStatus(id, "toPay");
      }
    }, 15 * 60 * 1000);
  }

  function clearToPay(tableId) {
    const id = tableId.toUpperCase();
    if (payTimers[id]) {
      clearTimeout(payTimers[id]);
      delete payTimers[id];
    }
  }

  // ----------- sync /summary -----------
  async function syncFromSummary() {
    const data = await fetchSummary();
    if (!data) return;
    const tickets = data.tickets || [];

    // tables qui ont une commande
    const busy = new Set(
      tickets
        .map((t) => (t.table || "").toUpperCase())
        .filter(Boolean)
    );

    // celles-là → "Commandée" (si pas déjà plus avancé)
    busy.forEach((tid) => {
      const current = tableState[tid];
      if (!current || current === "empty") {
        setStatus(tid, "ordered");
      }
    });

    // celles qui ne sont plus dans le résumé → on remet "Vide" si elles étaient "Commandée"
    Object.keys(tableState).forEach((tid) => {
      if (!busy.has(tid) && tableState[tid] === "ordered") {
        setStatus(tid, "empty");
      }
    });
  }

  // ----------- clics sur les boutons ----------- 
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const card = btn.closest(".table, [data-table]");
    if (!card) return;

    const firstChip = card.querySelector(".chip");
    const tableId = firstChip ? firstChip.textContent.trim().toUpperCase() : card.dataset.table;
    if (!tableId) return;

    const label = btn.textContent.trim().toLowerCase();

    if (label.includes("imprimer")) {
      // seul le badge change
      setStatus(tableId, "preparing");
      startToPay(tableId);
    } else if (label.includes("paiement")) {
      setStatus(tableId, "paid");
      clearToPay(tableId);
      // si tu veux laisser "payée" définitivement, supprime les 2 lignes suivantes
      setTimeout(() => {
        setStatus(tableId, "empty");
      }, 1500);
    }
  });

  // ----------- démarrage ----------- 
  window.addEventListener("load", () => {
    // petite latence pour laisser app.js dessiner les cartes
    setTimeout(() => {
      // init : tout le monde en "Vide"
      document.querySelectorAll(".table").forEach((card) => {
        const chip = card.querySelector(".status-chip");
        if (chip) {
          chip.textContent = STATUS.empty.text;
          chip.style.background = STATUS.empty.color;
          const id = (card.querySelector(".chip")?.textContent || "").trim().toUpperCase();
          if (id) tableState[id] = "empty";
        }
      });

      // 1er sync
      syncFromSummary();
      // puis toutes les 8s
      setInterval(syncFromSummary, 8000);
    }, 400);
  });
})();
