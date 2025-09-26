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

// --- CONFIG : liste des tables à afficher côté Staff ---
const TABLES = ['T1', 'T2', 'T3', 'T4', 'T5'];

// Assure la présence du conteneur + des tuiles
function ensureTableTiles() {
  let grid = document.querySelector('#tables-grid');
  if (!grid) {
    // On essaye de créer le conteneur à la volée dans la carte "Tables"
    // Cherche la première carte "Tables" et mets-y un grid si manquant
    const tablesCard = document.querySelector('.card, .panel, .box, [data-role="tables"]') || document.querySelector('[data-section="tables"]');
    if (tablesCard) {
      grid = document.createElement('div');
      grid.id = 'tables-grid';
      tablesCard.innerHTML = '';  // remplace "Aucune table"
      tablesCard.appendChild(grid);
    }
  }
  if (!grid) return; // on n'a pas trouvé d'endroit où mettre les tuiles

  // Génère les tuiles si elles n'existent pas encore
  TABLES.forEach(tid => {
    if (!grid.querySelector(`[data-table-id="${tid}"]`)) {
      const tile = document.createElement('div');
      tile.className = 'tile table-tile';
      tile.setAttribute('data-table-id', tid);
      tile.innerHTML = `
        <div class="title">Table ${tid}</div>
        <div>En attente : <span class="pending-count">0</span></div>
        <div class="actions">
          <button class="btn btn-sm btn-outline btn-print" data-action="print">Imprimer maintenant</button>
          <button class="btn btn-sm btn-outline btn-paid" data-action="paid">Paiement confirmé</button>
        </div>
      `;
      grid.appendChild(tile);
    }
  });
}

// Met à jour les compteurs par table à partir des commandes "pending"
function updateTableCounters(pendingOrders) {
  const counts = {};
  pendingOrders.forEach(o => {
    const tid = o.tableId || o.table || o.table_id || '??';
    counts[tid] = (counts[tid] || 0) + 1;
  });

  document.querySelectorAll('[data-table-id]').forEach(tile => {
    const tid = tile.getAttribute('data-table-id');
    const n = counts[tid] || 0;
    const span = tile.querySelector('.pending-count');
    if (span) span.textContent = String(n);
  });
}

// Si tu as déjà un poll /renderSummary(pendingOrders), appelle ces fonctions :
async function renderStaffSummaryAndTables(pendingOrders){
  // 1) on met à jour la colonne de droite comme tu le fais déjà:
  renderSummary(pendingOrders); // <-- ta fonction existante

  // 2) on s'assure que les tuiles existent
  ensureTableTiles();

  // 3) on met à jour les compteurs par table
  updateTableCounters(pendingOrders);
}

// Et dans ton polling (toutes les 3–4s), au lieu de seulement renderSummary(), fais :
async function pollOrders() {
  try {
    const res = await fetch(`${getBaseUrl()}/orders?status=pending`, { cache: 'no-store' });
    const pending = await res.json(); // [] si vide
    renderStaffSummaryAndTables(pending);
  } catch (e) {
    console.error('pollOrders failed', e);
  }
}

// Démarrage
pollOrders();
setInterval(pollOrders, 4000);

