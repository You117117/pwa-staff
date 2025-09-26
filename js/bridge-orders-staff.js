/* Bridge Staff -> Orders API
 * Poll /orders toutes les 4s, maj du compteur par table, rendu d'une liste
 * de tickets avec bouton "Paiement confirmé".
 */
(function () {
  const S = {
    getApiBase() {
      const k = localStorage.getItem("apiBaseUrl") || localStorage.getItem("API_BASE_URL");
      if (k) return k;
      const guess = document.querySelector('input[type="text"], input[placeholder*="onrender"], input[placeholder*="api"]');
      return guess?.value?.trim() || "";
    },
    async fetchOrders(apiBase) {
      const r = await fetch(`${apiBase.replace(/\/$/,'')}/orders`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "API error");
      return j.data || [];
    },
    async pay(apiBase, id) {
      const r = await fetch(`${apiBase.replace(/\/$/,'')}/orders/${id}/pay`, { method: "PATCH" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "API error");
      return true;
    },
    // Mise à jour du compteur "en attente" dans tes tuiles (data-table-id="T1"...)
    updateTiles(orders) {
      const counts = {};
      orders.forEach(o => { counts[o.table] = (counts[o.table] || 0) + 1; });
      document.querySelectorAll("[data-table-id]").forEach(tile => {
        const tid = tile.getAttribute("data-table-id");
        const target = tile.querySelector(".pending-count") || tile.querySelector('[data-pending]');
        if (target) target.textContent = counts[tid] || 0;
      });
    },
    // Rendu d’une liste dans le panneau de droite (créé si absent)
    renderList(orders) {
      let box = document.getElementById("summary-list");
      if (!box) {
        // Essaie de se loger dans la colonne de droite
        const right = document.querySelector("#summary, .resume, .right, [data-summary]") || document.body;
        box = document.createElement("div");
        box.id = "summary-list";
        right.appendChild(box);
      }
      box.innerHTML = orders.map(o => {
        const lines = (o.items||[]).map(i => `${i.qty}× ${i.name}`).join(", ");
        const time = new Date(o.ts).toLocaleTimeString();
        return `<div class="ticket" data-order="${o.id}">
          <div><b>${o.table}</b> — ${time}</div>
          <div>${lines}</div>
          <div>Total: ${Number(o.total||0).toFixed(2)} €</div>
          <button class="btn-pay" data-pay="${o.id}">Paiement confirmé</button>
        </div>`;
      }).join("");
    },
    attachPayHandler(apiBase) {
      document.addEventListener("click", async (e) => {
        const id = e.target?.getAttribute?.("data-pay");
        if (!id) return;
        try {
          await S.pay(apiBase, id);
          await S.refresh(apiBase);
        } catch (err) {
          alert("Erreur de confirmation : " + err.message);
        }
      });
    },
    async refresh(apiBase) {
      try {
        const orders = await S.fetchOrders(apiBase);
        S.updateTiles(orders);
        S.renderList(orders);
      } catch (e) { console.error(e); }
    },
    start() {
      const api = S.getApiBase();
      if (!api) {
        console.warn("[Bridge] URL API non mémorisée côté staff.");
        return;
      }
      S.attachPayHandler(api);
      S.refresh(api);
      setInterval(()=> S.refresh(api), 4000);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", S.start);
  } else {
    S.start();
  }
})();
