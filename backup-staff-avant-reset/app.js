// app.js — VERSION RESET STABLE
// - Statuts = backend uniquement
// - Tri = heure du dernier ticket (summary)
// - Plus de mémoires locales tordues
// - Détail table géré par table-detail.js (dernier ticket)

document.addEventListener('DOMContentLoaded', () => {
  const apiInput = document.querySelector('#apiUrl');
  const tablesContainer = document.querySelector('#tables');
  const tablesEmpty = document.querySelector('#tablesEmpty');
  const filterSelect = document.querySelector('#filterTables');
  const summaryContainer = document.querySelector('#summary');
  const summaryEmpty = document.querySelector('#summaryEmpty');

  const REFRESH_MS = 5000;

  const normId = (id) => (id || "").trim().toUpperCase();
  const getApiBase = () => (apiInput ? apiInput.value.trim().replace(/\/+$/, "") : "");

  const formatTime = (dateString) => {
    if (!dateString) return "--:--";
    const d = new Date(dateString);
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  // --- Sauvegarde / chargement API
  try {
    const saved = localStorage.getItem("staff-api");
    if (saved && apiInput) apiInput.value = saved;
  } catch {}

  if (apiInput) {
    apiInput.addEventListener("change", () => {
      try {
        localStorage.setItem("staff-api", apiInput.value.trim());
      } catch {}
    });
  }

  // --- Résumé du jour
  function renderSummary(tickets) {
    if (!summaryContainer) return;
    summaryContainer.innerHTML = "";

    if (!tickets || !tickets.length) {
      if (summaryEmpty) summaryEmpty.style.display = "block";
      return;
    }
    if (summaryEmpty) summaryEmpty.style.display = "none";

    tickets.forEach((t) => {
      let bodyText = "";
      if (t.label) bodyText = t.label;
      else if (Array.isArray(t.items)) {
        bodyText = t.items
          .map((it) => `${it.qty || it.quantity || 1}× ${it.label || it.name || it.title || "article"}`)
          .join(", ");
      } else if (Array.isArray(t.lines)) {
        bodyText = t.lines
          .map((it) => `${it.qty || it.quantity || 1}× ${it.label || it.name || it.title || "article"}`)
          .join(", ");
      }

      const item = document.createElement("div");
      item.className = "summaryItem";
      item.innerHTML = `
        <div class="head">
          <span class="chip">${t.table}</span>
          <span class="chip"><i class="icon-clock"></i> ${t.time}</span>
          <span class="chip">Total : ${t.total} €</span>
        </div>
        <div class="body">${bodyText || ""}</div>
      `;
      summaryContainer.appendChild(item);
    });
  }

  async function refreshSummary() {
    const base = getApiBase();
    if (!base) {
      if (summaryContainer) summaryContainer.innerHTML = "";
      if (summaryEmpty) summaryEmpty.style.display = "block";
      return;
    }

    try {
      const res = await fetch(`${base}/summary`, { cache: "no-store" });
      const data = await res.json();
      renderSummary(data.tickets || []);
    } catch (err) {
      console.error("[STAFF] erreur summary", err);
    }
  }

  // --- Tables (liste de gauche)

  function renderTables(tables, lastTicketPerTable) {
    if (!tablesContainer) return;
    tablesContainer.innerHTML = "";

    if (!tables || !tables.length) {
      if (tablesEmpty) tablesEmpty.style.display = "block";
      return;
    }
    if (tablesEmpty) tablesEmpty.style.display = "none";

    const filter = filterSelect ? normId(filterSelect.value) : "TOUTES";

    // Tri : table avec dernier ticket le plus récent en haut
    const sorted = [...tables].sort((a, b) => {
      const ida = normId(a.id);
      const idb = normId(b.id);
      const ta = lastTicketPerTable[ida]?.timeMs ?? 0;
      const tb = lastTicketPerTable[idb]?.timeMs ?? 0;
      return tb - ta;
    });

    sorted.forEach((table) => {
      const id = normId(table.id);
      if (!id) return;
      if (filter !== "TOUTES" && filter !== id) return;

      const lastInfo = lastTicketPerTable[id] || null;
      const displayTime = lastInfo ? formatTime(lastInfo.isoTime) : "--:--";

      const status = table.status || "Vide";

      const card = document.createElement("div");
      card.className = "table";
      card.setAttribute("data-table", id);
      card.innerHTML = `
        <div class="card-head">
          <span class="chip">${id}</span>
          <span class="chip">${status}</span>
          <span class="chip">
            ${ lastInfo ? `Commandé à : ${displayTime}` : "—" }
          </span>
        </div>
        <div class="card-actions">
          <button class="btn btn-primary btn-print">Imprimer maintenant</button>
          <button class="btn btn-primary btn-paid">Paiement confirmé</button>
        </div>
      `;

      // Clic sur la carte → détail de table
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        if (window.showTableDetail) window.showTableDetail(id);
      });

      // Bouton Imprimer
      const btnPrint = card.querySelector(".btn-print");
      if (btnPrint) {
        btnPrint.addEventListener("click", async (e) => {
          e.stopPropagation();
          const base = getApiBase();
          if (!base) return;
          try {
            await fetch(`${base}/print`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ table: id })
            });
          } catch (err) {
            console.error("[STAFF] erreur /print", err);
          }
        });
      }

      // Bouton Paiement confirmé
      const btnPaid = card.querySelector(".btn-paid");
      if (btnPaid) {
        btnPaid.addEventListener("click", async (e) => {
          e.stopPropagation();
          const base = getApiBase();
          if (!base) return;
          try {
            await fetch(`${base}/confirm`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ table: id })
            });
          } catch (err) {
            console.error("[STAFF] erreur /confirm", err);
          }
        });
      }

      tablesContainer.appendChild(card);
    });
  }

  async function refreshTables() {
    const base = getApiBase();
    if (!base) {
      if (tablesContainer) tablesContainer.innerHTML = "";
      if (tablesEmpty) tablesEmpty.style.display = "block";
      return;
    }

    try {
      // 1) Récupérer les tables
      const resTables = await fetch(`${base}/tables`, { cache: "no-store" });
      const dataTables = await resTables.json();
      const tables = dataTables.tables || [];

      // 2) Récupérer le summary pour savoir quel est le dernier ticket par table
      const resSummary = await fetch(`${base}/summary`, { cache: "no-store" });
      const dataSummary = await resSummary.json();
      const tickets = dataSummary.tickets || [];

      const lastTicketPerTable = {};
      tickets.forEach((t) => {
        const id = normId(t.table);
        if (!id) return;

        let timeMs = 0;
        if (t.created_at) {
          timeMs = new Date(t.created_at).getTime();
        } else if (t.time_iso) {
          timeMs = new Date(t.time_iso).getTime();
        } else if (t.time) {
          timeMs = 0;
        }

        const current = lastTicketPerTable[id];
        if (!current || timeMs > current.timeMs) {
          lastTicketPerTable[id] = {
            ticket: t,
            timeMs,
            isoTime: t.created_at || t.time_iso || null
          };
        }
      });

      renderTables(tables, lastTicketPerTable);
    } catch (err) {
      console.error("[STAFF] erreur tables/summary", err);
    }
  }

  // --- Init
  refreshTables();
  refreshSummary();
  setInterval(() => {
    refreshTables();
    refreshSummary();
  }, REFRESH_MS);
});
