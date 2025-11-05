// pwa-staff/js/table-detail.js
console.log("[table-detail] initialisé ✅");

(function () {
  const $ = (s, r = document) => r.querySelector(s);

  // --- 1. récupérer la bonne base API (comme le staff fait déjà) ---
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

  // --- 2. petit helper fetch ---
  async function apiGET(path) {
    const base = getApiBase();
    const url = base + path;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    return res.json();
  }

  // --- 3. construire le panneau ---
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
  $("#panelClose").onclick = () => {
    panel.style.right = "-420px";
  };

  // --- 4. charger les infos pour une table ---
  async function loadTableData(tableId) {
    // 4a. on tente d'abord /session/TX
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
    } catch (e) {
      // on passe au fallback
    }

    // 4b. fallback sur /summary
    const summary = await apiGET(`/summary`);
    const tickets = (summary.tickets || []).filter(
      (t) => (t.table || "").toUpperCase() === tableId.toUpperCase()
    );
    const total = tickets.reduce(
      (sum, t) => sum + Number(t.total || 0),
      0
    );
    return {
      mode: "summary",
      orders: tickets,
      total,
    };
  }

  // --- 5. afficher dans le panneau ---
  async function openTablePanel(tableId) {
    const title = $("#panelTitle");
    const status = $("#panelStatus");
    const content = $("#panelContent");

    title.textContent = "Table " + tableId;
    status.textContent = "Chargement…";
    content.innerHTML = "<p>Chargement en cours…</p>";
    panel.style.right = "0";

    try {
      const data = await loadTableData(tableId);
      const orders = data.orders || [];

      status.textContent =
        orders.length > 0
          ? data.mode === "session"
            ? "En cours"
            : "Commandes du jour"
          : "Vide";

      if (!orders.length) {
        content.innerHTML = `<p>Aucune commande pour cette table.</p>`;
      } else {
        let html = "";
        orders.forEach((o) => {
          // format session (app client) -> o.items
          const items = (o.items || [])
            .map((it) => `<li>${it.qty || 1}× ${it.name || ""}</li>`)
            .join("");
          html += `
            <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px;">
              <h4 style="margin:0 0 4px 0;font-size:13px;">#${o.id || ""} ${
            o.time ? "• " + o.time : ""
          }</h4>
              <ul style="margin:0;padding-left:16px;">${items}</ul>
              ${
                o.total
                  ? `<div style="margin-top:4px;">Sous-total : ${o.total} €</div>`
                  : ""
              }
            </div>
          `;
        });
        html += `<p style="margin-top:8px;font-weight:700;">Total cumulé : ${Number(
          data.total || 0
        ).toFixed(2)} €</p>`;
        html += `
          <div style="display:flex;gap:8px;margin-top:12px;">
            <button id="btnPrint" data-table="${tableId}" style="flex:1;background:#10B981;border:none;border-radius:6px;padding:8px;cursor:pointer;">Imprimer</button>
            <button id="btnPaid" data-table="${tableId}" style="flex:1;background:#3B82F6;border:none;border-radius:6px;padding:8px;cursor:pointer;">Paiement confirmé</button>
          </div>
        `;
        content.innerHTML = html;
      }
    } catch (err) {
      status.textContent = "Erreur de chargement";
      content.innerHTML = `<p style="color:#ef4444;">${err.message}</p>`;
    }
  }

  // --- 6. clic sur les tables ---
  document.addEventListener("click", (e) => {
    // éviter de capter les vrais boutons "Imprimer maintenant"
    if (e.target.closest("button")) return;

    const card = e.target.closest("[data-table], .table");
    if (!card) return;
    const id =
      card.dataset.table ||
      (card.querySelector(".chip")?.textContent || "").trim();
    if (!id) return;
    openTablePanel(id);
  });

  // --- 7. actions dans le panneau (imprimer / payer) ---
  document.addEventListener("click", async (e) => {
    const printBtn = e.target.closest("#btnPrint");
    const paidBtn = e.target.closest("#btnPaid");
    const tableId =
      printBtn?.dataset.table || paidBtn?.dataset.table || null;
    if (!tableId) return;

    const base = getApiBase();
    try {
      if (printBtn) {
        await fetch(base + "/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: tableId }),
        });
        printBtn.textContent = "Imprimé ✅";
      }
      if (paidBtn) {
        await fetch(base + "/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: tableId }),
        });
        paidBtn.textContent = "Clôturé ✅";
      }
    } catch (err) {
      console.error(err);
    }
  });
})();
