// js/table-detail.js
// version : badge de statut auto + panneau latéral + boutons
console.log("[table-detail] statut auto + panel");

(function () {
  const STATUS = {
    empty: { text: "Vide", bg: "" },
    ordered: { text: "Commandée", bg: "#334155" },
    preparing: { text: "En préparation", bg: "#1d4ed8" },
    toPay: { text: "Doit payer", bg: "#b45309" },
    paid: { text: "Payée", bg: "#15803d" },
  };

  // ---------- petits helpers ----------
  function $(s, r = document) { return r.querySelector(s); }

  function getTableIdFromCard(card) {
    if (!card) return null;
    if (card.dataset.table) return card.dataset.table.toUpperCase();
    const chip = card.querySelector(".chip");
    return chip ? chip.textContent.trim().toUpperCase() : null;
  }

  // dans ton HTML de carte tu as :
  // <span class="chip">T1</span>
  // <span class="chip">...</span>   <-- c’est CE badge qu’on pilote
  // <span class="chip">Dernier : ...</span>
  function getStatusChip(card) {
    const chips = card.querySelectorAll(".chip");
    return chips.length >= 2 ? chips[1] : null;
  }

  function applyStatusOnChip(chip, statusKey) {
    const def = STATUS[statusKey] || STATUS.empty;
    chip.textContent = def.text;
    chip.style.background = def.bg;
  }

  function setStatusOnCard(tableId, statusKey) {
    const card = document.querySelector(`.table[data-table="${tableId}"]`)
      || Array.from(document.querySelectorAll(".table"))
        .find(c => c.querySelector(".chip")?.textContent.trim().toUpperCase() === tableId);
    if (!card) return;
    const chip = getStatusChip(card);
    if (!chip) return;
    applyStatusOnChip(chip, statusKey);
  }

  function getStatusFromCard(tableId) {
    const card = document.querySelector(`.table[data-table="${tableId}"]`)
      || Array.from(document.querySelectorAll(".table"))
        .find(c => c.querySelector(".chip")?.textContent.trim().toUpperCase() === tableId);
    if (!card) return null;
    const chip = getStatusChip(card);
    return chip ? chip.textContent.trim() : null;
  }

  // ---------- panneau latéral ----------
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
    transition: "right .2s",
    zIndex: "999",
    display: "flex",
    flexDirection: "column",
  });
  panel.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid #1f2937;display:flex;justify-content:space-between;align-items:center;">
      <h3 id="panelTitle" style="margin:0;font-size:1rem;">Table</h3>
      <button id="panelClose" style="background:#ef4444;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;">Fermer</button>
    </div>
    <div id="panelStatus" style="padding:8px 16px;color:#94a3b8;font-size:0.85rem;"></div>
    <div id="panelContent" style="padding:12px 16px;flex:1;overflow-y:auto;"></div>
  `;
  document.body.appendChild(panel);

  $("#panelClose").addEventListener("click", () => {
    panel.style.right = "-420px";
  });

  async function apiGET(path) {
    const base = ($("#apiUrl")?.value || localStorage.getItem("staff_api_url") || "").replace(/\/+$/, "");
    if (!base) throw new Error("URL API manquante");
    const res = await fetch(base + path, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);
    return res.json();
  }

  async function loadTablePanel(tableId) {
    $("#panelTitle").textContent = "Table " + tableId;
    $("#panelStatus").textContent = "Chargement…";
    $("#panelContent").innerHTML = "";
    panel.style.right = "0";

    // on essaie d’abord l’endpoint de session détaillée
    try {
      const j = await apiGET(`/api/table/${tableId}/session`);
      const orders = j.orders || j.tickets || [];
      if (!orders.length) {
        $("#panelStatus").textContent = "Vide";
        setStatusOnCard(tableId, "empty");
        $("#panelContent").textContent = "Aucune commande pour cette table.";
        return;
      }
      $("#panelStatus").textContent = "Commandée";
      setStatusOnCard(tableId, "ordered");

      const total = (orders || []).reduce((sum, o) => sum + (Number(o.total) || 0), 0);
      let html = `<div style="margin-bottom:10px;font-weight:500;">Montant total : ${total.toFixed(2)} €</div>`;
      orders.forEach((o) => {
        const items = (o.items || [])
          .map(it => `<li>${it.qty || 1}× ${it.name || ""}</li>`)
          .join("");
        html += `
          <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px;">
            <h4 style="margin:0 0 4px 0;">Ticket ${o.id || ""} ${o.time ? "• " + o.time : ""}</h4>
            <ul style="margin:0;padding-left:16px;">${items}</ul>
            ${o.total ? `<p style="margin-top:4px;">Sous-total : ${o.total} €</p>` : ""}
          </div>
        `;
      });
      html += buttonsHtml(tableId);
      $("#panelContent").innerHTML = html;
      return;
    } catch (e) {
      // on tombera sur /summary juste après
    }

    // fallback /summary
    try {
      const s = await apiGET("/summary");
      const tickets = (s.tickets || []).filter(t => (t.table || "").toUpperCase() === tableId.toUpperCase());
      if (!tickets.length) {
        $("#panelStatus").textContent = "Vide";
        setStatusOnCard(tableId, "empty");
        $("#panelContent").textContent = "Aucune commande pour cette table.";
        return;
      }
      $("#panelStatus").textContent = "Commandée";
      setStatusOnCard(tableId, "ordered");
      const total = tickets.reduce((sum, t) => sum + (Number(t.total) || 0), 0);
      let html = `<div style="margin-bottom:10px;font-weight:500;">Montant total : ${total.toFixed(2)} €</div>`;
      tickets.forEach((t) => {
        const items = (t.items || [])
          .map(it => `<li>${it.qty || 1}× ${it.name || ""}</li>`)
          .join("");
        html += `
          <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px;">
            <h4 style="margin:0 0 4px 0;">Ticket ${t.id || ""} ${t.time ? "• " + t.time : ""}</h4>
            <ul style="margin:0;padding-left:16px;">${items}</ul>
            ${t.total ? `<p style="margin-top:4px;">Sous-total : ${t.total} €</p>` : ""}
          </div>
        `;
      });
      html += buttonsHtml(tableId);
      $("#panelContent").innerHTML = html;
    } catch (err) {
      $("#panelStatus").textContent = "Erreur";
      $("#panelContent").innerHTML = `<p style="color:#ef4444;">${err.message}</p>`;
    }
  }

  function buttonsHtml(tableId) {
    return `
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button id="btnPrint" data-table="${tableId}" style="flex:1;background:#10B981;border:none;border-radius:6px;padding:8px;cursor:pointer;">Imprimer</button>
        <button id="btnPaid" data-table="${tableId}" style="flex:1;background:#3B82F6;border:none;border-radius:6px;padding:8px;cursor:pointer;">Paiement confirmé</button>
      </div>
    `;
  }

  // ---------- clics ----------
  document.addEventListener("click", (e) => {
    const card = e.target.closest(".table, [data-table]");
    if (card && !e.target.closest("#tablePanel")) {
      const id = getTableIdFromCard(card);
      if (id) loadTablePanel(id);
      return;
    }

    const btnPrint = e.target.closest("#btnPrint");
    if (btnPrint) {
      const id = btnPrint.dataset.table;
      setStatusOnCard(id, "preparing");
      return;
    }
    const btnPaid = e.target.closest("#btnPaid");
    if (btnPaid) {
      const id = btnPaid.dataset.table;
      setStatusOnCard(id, "paid");
      return;
    }
  });

  // ---------- SYNC périodique : on aligne les badges ----------
  async function syncFromSummary() {
    try {
      const data = await apiGET("/summary");
      const tickets = data.tickets || [];
      const busy = new Set(
        tickets.map(t => (t.table || "").toUpperCase()).filter(Boolean)
      );

      // 1. pour chaque carte on décide du statut
      document.querySelectorAll(".table").forEach((card) => {
        const id = getTableIdFromCard(card);
        if (!id) return;
        const chip = getStatusChip(card);
        if (!chip) return;

        const current = chip.textContent.trim();

        if (busy.has(id)) {
          // s’il y a un ticket → Commandée (sauf si déjà payée)
          if (current !== STATUS.paid.text) {
            applyStatusOnChip(chip, "ordered");
          }
        } else {
          // plus de ticket → si pas payée → Vide
          if (current !== STATUS.paid.text) {
            applyStatusOnChip(chip, "empty");
          }
        }
      });
    } catch (e) {
      // on ignore le cycle en erreur
    }
  }

  // on attend que app.js ait dessiné les cartes
  window.addEventListener("load", () => {
    setTimeout(() => {
      // 1er passage : s’assurer qu’il y a bien un texte dans le 2ᵉ badge
      document.querySelectorAll(".table").forEach((card) => {
        const chip = getStatusChip(card);
        if (chip && !chip.textContent.trim()) {
          chip.textContent = "Vide";
        }
      });

      syncFromSummary();
      setInterval(syncFromSummary, 8000);
    }, 300);
  });
})();
