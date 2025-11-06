// pwa-staff/js/table-status.js
// Gestion simple des statuts de table (Vide → Commandée → En préparation → Doit payer → Payée)

console.log("[table-status] chargé ✅");

(function () {
  // états qu'on veut
  const STATUS = {
    empty: { label: "Vide", color: "#1f2937" },
    ordered: { label: "Commandée", color: "#334155" },
    preparing: { label: "En préparation", color: "#1d4ed8" },
    toPay: { label: "Doit payer", color: "#b45309" },
    paid: { label: "Payée", color: "#15803d" },
  };

  // on mémorise le dernier état connu pour chaque table
  const tableState = {};
  const toPayTimers = {};

  // -------------------- helpers --------------------

  const $ = (s, r = document) => r.querySelector(s);

  function getApiBase() {
    // même logique que ton staff : input en haut ou localStorage
    const input = $("#apiUrl");
    const v = (input && input.value.trim()) || "";
    if (v) return v.replace(/\/+$/, "");
    try {
      const fromLS =
        localStorage.getItem("orders_api_url_v11") ||
        localStorage.getItem("api_url") ||
        localStorage.getItem("API_URL") ||
        "";
      return fromLS.trim().replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  function findTableCard(tableId) {
    if (!tableId) return null;
    tableId = tableId.toUpperCase();

    // essayer data-table
    let card = document.querySelector(`[data-table="${tableId}"]`);
    if (card) return card;

    // sinon chercher .table et lire .chip
    const all = document.querySelectorAll(".table");
    for (const t of all) {
      const chip = t.querySelector(".chip");
      if (chip && chip.textContent.trim().toUpperCase() === tableId) {
        return t;
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

  // crée / récupère la pastille juste après le nom de table
  function ensureBadge(card) {
    if (!card) return null;
    // on supprime les anciens "En attente : 0"
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

  function applyStatus(tableId, statusKey) {
    const st = STATUS[statusKey] || STATUS.empty;
    tableState[tableId] = statusKey;

    const card = findTableCard(tableId);
    if (!card) return;

    const badge = ensureBadge(card);
    if (!badge) return;

    badge.textContent = st.label;
    badge.style.background = st.color;
  }

  // timer 15 minutes après "En préparation"
  function startToPayTimer(tableId) {
    clearToPayTimer(tableId);
    toPayTimers[tableId] = setTimeout(() => {
      // si pas déjà payée
      if (tableState[tableId] !== "paid") {
        applyStatus(tableId, "toPay");
      }
    }, 15 * 60 * 1000);
  }

  function clearToPayTimer(tableId) {
    if (toPayTimers[tableId]) {
      clearTimeout(toPayTimers[tableId]);
      delete toPayTimers[tableId];
    }
  }

  // -------------------- 1. initialiser les cartes à Vide --------------------
  function initAllTables() {
    const cards = document.querySelectorAll(".table");
    cards.forEach((card) => {
      const id = getTableIdFromCard(card);
      const badge = ensureBadge(card);
      // si on n'a rien en mémoire → Vide
      if (!id) return;
      const saved = tableState[id];
      if (!saved) {
        badge.textContent = STATUS.empty.label;
        badge.style.background = STATUS.empty.color;
        tableState[id] = "empty";
      } else {
        // on réapplique le statut connu (utile après rafraîchissement)
        applyStatus(id, saved);
      }
    });
  }

  // -------------------- 2. sync avec /summary --------------------
  async function syncFromSummary() {
    try {
      const base = getApiBase();
      if (!base) return;
      const res = await fetch(base + "/summary", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const tickets = data.tickets || [];

      // tables qui ont un ticket
      const tablesWithOrders = new Set(
        tickets
          .map((t) => (t.table || "").toUpperCase())
          .filter((t) => t.length > 0)
      );

      // 2a. celles qui ont un ticket → si elles sont "empty" on les passe en "ordered"
      tablesWithOrders.forEach((tableId) => {
        const cur = tableState[tableId];
        if (!cur || cur === "empty") {
          applyStatus(tableId, "ordered");
        }
      });

      // 2b. celles qu'on avait marquées "ordered" mais qui n'ont plus de ticket
      Object.keys(tableState).forEach((tableId) => {
        const cur = tableState[tableId];
        if (cur === "ordered" && !tablesWithOrders.has(tableId)) {
          applyStatus(tableId, "empty");
        }
      });
    } catch (err) {
      console.warn("[table-status] sync error:", err.message);
    }
  }

  // -------------------- 3. écouter les boutons de la grille --------------------
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const text = btn.textContent.trim().toLowerCase();
    const card = btn.closest(".table, [data-table]");
    if (!card) return;
    const tableId = getTableIdFromCard(card);
    if (!tableId) return;

    // "Imprimer maintenant" → En préparation + timer 15min
    if (text.includes("imprimer")) {
      applyStatus(tableId, "preparing");
      startToPayTimer(tableId);
      return;
    }

    // "Paiement confirmé" → Payée
    if (text.includes("paiement")) {
      applyStatus(tableId, "paid");
      clearToPayTimer(tableId);
      return;
    }
  });

  // -------------------- 4. écouter les boutons du panneau (si tu l'as) --------------------
  document.addEventListener("click", (e) => {
    const printBtn = e.target.closest("#btnPrint"); // panneau latéral
    if (printBtn) {
      const tableId = printBtn.dataset.table;
      if (tableId) {
        applyStatus(tableId.toUpperCase(), "preparing");
        startToPayTimer(tableId.toUpperCase());
      }
    }
    const paidBtn = e.target.closest("#btnPaid");
    if (paidBtn) {
      const tableId = paidBtn.dataset.table;
      if (tableId) {
        applyStatus(tableId.toUpperCase(), "paid");
        clearToPayTimer(tableId.toUpperCase());
      }
    }
  });

  // -------------------- 5. observer le DOM (car ta page rafraîchit les tables) --------------------
  const obs = new MutationObserver(() => {
    // à chaque réinjection, on repose la pastille au bon endroit
    initAllTables();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // démarrage
  initAllTables();
  syncFromSummary();
  // toutes les 8 secondes on regarde si de nouvelles commandes arrivent
  setInterval(syncFromSummary, 8000);
})();
