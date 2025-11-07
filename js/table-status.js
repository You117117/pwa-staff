// pwa-staff/js/table-status.js
// version corrigée — lit aussi 'staff_api_url' et met bien à jour les badges
console.log("[table-status] loaded ✅ (sync sur /summary + suppression 'En attente')");

(function () {
  // états possibles
  const STATUS = {
    empty:      { label: "Vide",          color: "#1f2937" },
    ordered:    { label: "Commandée",     color: "#334155" },
    preparing:  { label: "En préparation",color: "#1d4ed8" },
    toPay:      { label: "Doit payer",    color: "#b45309" },
    paid:       { label: "Payée",         color: "#15803d" },
  };

  // mémoire locale
  const tableState   = {};
  const toPayTimers  = {};

  const $ = (s, r = document) => r.querySelector(s);

  // -------- 1. récupérer l’URL API --------
  function getApiBase() {
    // 1) input de la page
    const inp = $("#apiUrl");
    const v = (inp?.value || "").trim();
    if (v) return v.replace(/\/+$/, "");

    // 2) les différentes clés qu’on utilise dans le projet
    try {
      const fromLS =
        localStorage.getItem("staff_api_url") ||               // 👈 c’est celle-ci qui manquait
        localStorage.getItem("orders_api_url_v11") ||
        localStorage.getItem("api_url") ||
        localStorage.getItem("API_URL") ||
        "";
      return fromLS.trim().replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  // -------- 2. helpers DOM --------
  function findTableCard(tableId) {
    if (!tableId) return null;
    const id = tableId.toUpperCase();

    // essayer data-table
    let card = document.querySelector(`[data-table="${id}"]`);
    if (card) return card;

    // sinon via la 1re .chip
    const all = document.querySelectorAll(".table");
    for (const c of all) {
      const chip = c.querySelector(".chip");
      if (chip && chip.textContent.trim().toUpperCase() === id) {
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

  // crée/récupère la pastille juste après le n° de table
  function ensureBadge(card) {
    if (!card) return null;

    // on enlève les vieux "En attente : 0"
    card.querySelectorAll("span, small").forEach((el) => {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt.startsWith("en attente")) el.remove();
    });

    let badge = card.querySelector(".table-status-badge");
    if (badge) return badge;

    const chip = card.querySelector(".chip");
    badge = document.createElement("span");
    badge.className = "table-status-badge";
    badge.style.display = "inline-block";
    badge.style.marginLeft = "6px";
    badge.style.fontSize = "12px";
    badge.style.padding = "2px 8px";
    badge.style.borderRadius = "999px";
    badge.style.color = "#fff";
    badge.style.background = STATUS.empty.color;
    badge.textContent = STATUS.empty.label;

    if (chip && chip.parentNode) {
      chip.parentNode.insertBefore(badge, chip.nextSibling);
    } else {
      card.prepend(badge);
    }
    return badge;
  }

  // applique un état visible
  function applyStatus(tableId, statusKey) {
    const def = STATUS[statusKey] || STATUS.empty;
    const id = tableId.toUpperCase();
    tableState[id] = statusKey;

    const card  = findTableCard(id);
    const badge = card ? ensureBadge(card) : null;
    if (!badge) return;

    badge.textContent = def.label;
    badge.style.background = def.color;
  }

  // -------- 3. timer "doit payer" --------
  function startToPayTimer(tableId) {
    const id = tableId.toUpperCase();
    clearToPayTimer(id);
    toPayTimers[id] = setTimeout(() => {
      if (tableState[id] !== "paid") {
        applyStatus(id, "toPay");
      }
    }, 15 * 60 * 1000);
  }
  function clearToPayTimer(tableId) {
    const id = tableId.toUpperCase();
    if (toPayTimers[id]) {
      clearTimeout(toPayTimers[id]);
      delete toPayTimers[id];
    }
  }

  // -------- 4. init à l’affichage --------
  function initTablesOnce() {
    const cards = document.querySelectorAll(".table");
    if (!cards.length) return false;
    cards.forEach((card) => {
      const id = getTableIdFromCard(card);
      const badge = ensureBadge(card);
      if (!id) return;
      if (tableState[id]) {
        applyStatus(id, tableState[id]);
      } else {
        badge.textContent = STATUS.empty.label;
        badge.style.background = STATUS.empty.color;
        tableState[id] = "empty";
      }
    });
    return true;
  }

  // -------- 5. synchronisation /summary --------
  async function syncFromSummary() {
    const base = getApiBase();
    if (!base) return;
    try {
      const res = await fetch(base + "/summary", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const tickets = data.tickets || [];

      // tables qui ont actuellement une commande
      const tablesWithOrders = new Set(
        tickets
          .map((t) => (t.table || "").toUpperCase())
          .filter((x) => x.length > 0)
      );

      // celles qui ont une commande → "Commandée" (si elles étaient vides)
      tablesWithOrders.forEach((tid) => {
        const cur = tableState[tid];
        if (!cur || cur === "empty") {
          applyStatus(tid, "ordered");
        }
      });

      // celles qui n'en ont plus → on les remet "Vide" seulement si elles étaient "Commandée"
      Object.keys(tableState).forEach((tid) => {
        if (tableState[tid] === "ordered" && !tablesWithOrders.has(tid)) {
          applyStatus(tid, "empty");
        }
      });
    } catch (err) {
      console.warn("[table-status] sync erreur:", err.message);
    }
  }

  // -------- 6. clic sur les boutons verts --------
  function setupButtonListeners() {
    document.addEventListener("click", (e) => {
      const btn  = e.target.closest("button");
      if (!btn) return;
      const txt  = btn.textContent.trim().toLowerCase();
      const card = btn.closest(".table, [data-table]");
      if (!card) return;
      const tableId = getTableIdFromCard(card);
      if (!tableId) return;

      if (txt.includes("imprimer")) {
        applyStatus(tableId, "preparing");
        startToPayTimer(tableId);
        return;
      }
      if (txt.includes("paiement")) {
        applyStatus(tableId, "paid");
        clearToPayTimer(tableId);
        // on laisse au staff le temps de voir "Payée", puis on repasse à "Vide"
        setTimeout(() => {
          applyStatus(tableId, "empty");
        }, 2000);
        return;
      }
    });
  }

  // -------- 7. démarrage --------
  window.addEventListener("load", () => {
    // on laisse le temps à app.js de dessiner les cartes
    setTimeout(() => {
      initTablesOnce();
      setupButtonListeners();
      syncFromSummary();
      // toutes les 8 secondes → on recalcule
      setInterval(syncFromSummary, 8000);
    }, 500);
  });
})();
