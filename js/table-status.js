// pwa-staff/js/table-status.js
// met à jour le badge de statut placé par app.js
console.log("[table-status] actif");

(function () {

  function getApiBase() {
    const inp = document.querySelector("#apiUrl");
    const v = (inp?.value || "").trim();
    if (v) return v.replace(/\/+$/, "");

    const ls =
      localStorage.getItem("staff_api_url") ||
      localStorage.getItem("orders_api_url_v11") ||
      localStorage.getItem("api_url") ||
      "";
    return (ls || "").replace(/\/+$/, "");
  }

  // trouve la carte d'une table
  function findTableCard(tableId) {
    const id = tableId.toUpperCase();
    let card = document.querySelector(`[data-table="${id}"]`);
    if (card) return card;
    // fallback via la première chip
    const all = document.querySelectorAll(".table");
    for (const c of all) {
      const chip = c.querySelector(".chip");
      if (chip && chip.textContent.trim().toUpperCase() === id) {
        return c;
      }
    }
    return null;
  }

  // récupère le badge créé par app.js
  function getStatusBadge(tableId) {
    const card = findTableCard(tableId);
    if (!card) return null;

    // au cas où il resterait des anciens "En attente : …"
    card.querySelectorAll("span, small").forEach((el) => {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt.startsWith("en attente")) el.remove();
    });

    return card.querySelector(".status-chip");
  }

  function setBadge(tableId, text, color) {
    const badge = getStatusBadge(tableId);
    if (!badge) return;
    badge.textContent = text;
    if (color) badge.style.background = color;
  }

  async function syncOnce() {
    const base = getApiBase();
    if (!base) return;

    try {
      const res = await fetch(base + "/summary", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const tickets = data.tickets || [];

      // tables qui ont des commandes
      const busy = new Set(
        tickets.map(t => (t.table || "").toUpperCase()).filter(Boolean)
      );

      // celles-là → Commandée
      busy.forEach(tid => {
        setBadge(tid, "Commandée", "#334155");
      });

      // toutes les tables affichées → si pas dans busy → Vide
      document.querySelectorAll(".table .chip:first-child").forEach(chip => {
        const tid = chip.textContent.trim().toUpperCase();
        if (!tid) return;
        if (!busy.has(tid)) {
          setBadge(tid, "Vide", "#1f2937");
        }
      });

    } catch (err) {
      console.warn("[table-status] erreur sync:", err.message);
    }
  }

  // boutons verts → on met à jour le badge tout de suite
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const card = btn.closest(".table, [data-table]");
    if (!card) return;

    const chip = card.querySelector(".chip");
    const tableId = chip ? chip.textContent.trim().toUpperCase() : card.dataset.table;
    if (!tableId) return;

    const label = btn.textContent.trim().toLowerCase();

    if (label.includes("imprimer")) {
      // préparation
      setBadge(tableId, "En préparation", "#1d4ed8");
    } else if (label.includes("paiement")) {
      setBadge(tableId, "Payée", "#15803d");
      // puis on laisse le temps au serveur de voir, et on repasse à Vide
      setTimeout(() => {
        setBadge(tableId, "Vide", "#1f2937");
      }, 1500);
    }
  });

  window.addEventListener("load", () => {
    // on attend que app.js ait dessiné les cartes
    setTimeout(() => {
      syncOnce();
      setInterval(syncOnce, 8000);
    }, 500);
  });

})();
