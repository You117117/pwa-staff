// pwa-staff/js/table-detail.js
console.log("[table-detail] initialisé ✅ (remplacement direct du texte En attente)");

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const paymentTimers = {};

  // --- Base API ---
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

  async function apiGET(path) {
    const base = getApiBase();
    const res = await fetch(base + path, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    return res.json();
  }

  // --- Trouver carte ---
  function findTableCard(tableId) {
    let card = document.querySelector(`[data-table="${tableId}"]`);
    if (card) return card;
    const all = document.querySelectorAll(".table");
    for (const c of all) {
      const chip = c.querySelector(".chip");
      if (chip && chip.textContent.trim() === tableId) return c;
    }
    return null;
  }

  // --- 🔥 Fonction principale : remplacer le texte "En attente" ---
  function updateInlineStatus(card, label) {
    if (!card) return;
    const elements = card.querySelectorAll("span, small, div, p");
    for (const el of elements) {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt.startsWith("en attente")) {
        el.textContent = label;
        el.style.fontWeight = "600";
        el.style.color = "#fff";
        return;
      }
    }
  }

  // --- Mise à jour du statut global ---
  function setTableStatus(tableId, statusKey, label) {
    const card = findTableCard(tableId);
    if (!card) return;
    updateInlineStatus(card, label);
  }

  // --- Timer 15 min → "Doit payer" ---
  function startDoitPayerTimer(tableId) {
    if (paymentTimers[tableId]) clearTimeout(paymentTimers[tableId]);
    paymentTimers[tableId] = setTimeout(() => {
      setTableStatus(tableId, "doitpayer", "Doit payer");
    }, 15 * 60 * 1000);
  }
  function clearDoitPayerTimer(tableId) {
    if (paymentTimers[tableId]) {
      clearTimeout(paymentTimers[tableId]);
      delete paymentTimers[tableId];
    }
  }

  // --- Panneau latéral (inchangé) ---
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
  $("#panelClose").onclick = () => (panel.style.right = "-420px");

  // --- Charger data ---
  async function loadTableData(tableId) {
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
    } catch (_) {}
    const summary = await apiGET(`/summary`);
    const tickets = (summary.tickets || []).filter(
      (t) => (t.table || "").toUpperCase() === tableId.toUpperCase()
    );
    const total = tickets.reduce((sum, t) => sum + Number(t.total || 0), 0);
    return { mode: "summary", orders: tickets, total };
  }

  // --- Panneau table ---
  async function openTablePanel(tableId) {
    const title = $("#panelTitle");
    const status = $("#panelStatus");
    const content = $("#panelContent");
    title.textContent = "Table " + tableId;
    status.textContent = "Chargement…";
    content.innerHTML = "<p>Chargement…</p>";
    panel.style.right = "0";

    try {
      const data = await loadTableData(tableId);
      const orders = data.orders || [];

      if (!orders.length) {
        status.textContent = "Vide";
        content.innerHTML = `<p>Aucune commande pour cette table.</p>`;
        setTableStatus(tableId, "vide", "Vide");
        return;
      }

      status.textContent = "Commandée";
      setTableStatus(tableId, "commande", "Commandée");

      let html = "";
      orders.forEach((o) => {
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
          </div>`;
      });
      html += `<p style="margin-top:8px;font-weight:700;">Total cumulé : ${Number(
        data.total || 0
      ).toFixed(2)} €</p>`;
      html += `
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
          <button id="btnPrint" data-table="${tableId}" style="flex:1;background:#10B981;border:none;border-radius:6px;padding:8px;cursor:pointer;">Imprimer</button>
          <button id="btnPaid" data-table="${tableId}" style="flex:1;background:#3B82F6;border:none;border-radius:6px;padding:8px;cursor:pointer;">Paiement confirmé</button>
        </div>`;
      content.innerHTML = html;
    } catch (err) {
      status.textContent = "Erreur de chargement";
      content.innerHTML = `<p style="color:#ef4444;">${err.message}</p>`;
    }
  }

  // --- Clic carte ---
  document.addEventListener("click", (e) => {
    if (e.target.closest("button") && !e.target.closest("#tablePanel")) return;
    const card = e.target.closest("[data-table], .table");
    if (!card) return;
    const id =
      card.dataset.table ||
      (card.querySelector(".chip")?.textContent || "").trim();
    if (!id) return;
    openTablePanel(id);
  });

  // --- Clic actions panneau ---
  document.addEventListener("click", async (e) => {
    const printBtn = e.target.closest("#btnPrint");
    if (printBtn) {
      const id = printBtn.dataset.table;
      setTableStatus(id, "prepa", "En préparation");
      startDoitPayerTimer(id);
      return;
    }
    const paidBtn = e.target.closest("#btnPaid");
    if (paidBtn) {
      const id = paidBtn.dataset.table;
      setTableStatus(id, "payee", "Payée");
      clearDoitPayerTimer(id);
      return;
    }
  });

  // --- Boutons sur les cartes ---
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const txt = btn.textContent.trim().toLowerCase();
    const card = btn.closest("[data-table], .table");
    if (!card) return;
    const id =
      card.dataset.table ||
      (card.querySelector(".chip")?.textContent || "").trim();
    if (!id) return;

    if (txt.includes("imprimer maintenant")) {
      setTableStatus(id, "prepa", "En préparation");
      startDoitPayerTimer(id);
      return;
    }
    if (txt.includes("paiement confirmé")) {
      setTableStatus(id, "payee", "Payée");
      clearDoitPayerTimer(id);
      return;
    }
  });
})();
