// pwa-staff/js/table-detail.js
console.log("[table-detail] initialisé ✅");

(function () {
  const $ = (s, r = document) => r.querySelector(s);

  // timers pour "15 min → doit payer"
  const paymentTimers = {};

  // --- récupérer la bonne base API ---
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

  // --- styles pour le badge (on garde) ---
  function ensureStatusStyles() {
    if (document.getElementById("td-card-status-style")) return;
    const st = document.createElement("style");
    st.id = "td-card-status-style";
    st.textContent = `
      .table .td-card-status {
        display:inline-block;
        border-radius:999px;
        padding:2px 10px;
        font-size:11px;
        margin-bottom:6px;
        font-weight:600;
      }
      .table .td-card-status.status-vide{
        background:rgba(148,163,184,.12);
        color:#e2e8f0;
        border:1px solid rgba(148,163,184,.35);
      }
      .table .td-card-status.status-commande{
        background:rgba(254,240,138,.12);
        color:#fef3c7;
        border:1px solid rgba(250,204,21,.35);
      }
      .table .td-card-status.status-prepa{
        background:rgba(59,130,246,.12);
        color:#dbeafe;
        border:1px solid rgba(59,130,246,.35);
      }
      .table .td-card-status.status-doitpayer{
        background:rgba(249,115,22,.12);
        color:#ffedd5;
        border:1px solid rgba(249,115,22,.35);
      }
      .table .td-card-status.status-payee{
        background:rgba(16,185,129,.12);
        color:#ecfdf5;
        border:1px solid rgba(16,185,129,.35);
      }
    `;
    document.head.appendChild(st);
  }

  // --- trouver la carte de la table ---
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

  // --- NOUVEAU : remplacer "En attente : 0" par le statut ---
  function replaceInlineStatus(card, label) {
    if (!card) return;
    // on cherche un petit élément qui contient "En attente"
    const candidates = card.querySelectorAll("span, div, p, small");
    for (const el of candidates) {
      const txt = (el.textContent || "").trim();
      if (/^en attente/i.test(txt)) {
        el.textContent = label;
        return;
      }
    }
    // si on ne l'a pas trouvé, on ne fait rien (layout différent)
  }

  // --- appliquer un statut sur la carte + ligne "en attente" ---
  function setTableStatus(tableId, statusKey, label) {
    ensureStatusStyles();
    const card = findTableCard(tableId);
    if (!card) return;

    // 1. badge (qu’on avait déjà)
    let badge = card.querySelector(".td-card-status");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "td-card-status";
      card.insertBefore(badge, card.firstElementChild || null);
    }
    badge.textContent = label;
    badge.className = "td-card-status status-" + statusKey;

    // 2. on remplace la ligne "En attente : 0" par le statut
    replaceInlineStatus(card, label);
  }

  // --- timer 15 min ---
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

  // --- panneau latéral ---
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

  // pour "Annuler"
  let lastRendered = {
    tableId: null,
    html: "",
    status: "",
  };

  // --- charger la table ---
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
    } catch (e) {
      // on tombera sur summary
    }

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

  // --- ouvrir panneau ---
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

      if (!orders.length) {
        status.textContent = "Vide";
        content.innerHTML = `<p>Aucune commande pour cette table.</p>`;
        setTableStatus(tableId, "vide", "Vide");
        lastRendered = { tableId, html: content.innerHTML, status: status.textContent };
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
          </div>
        `;
      });
      html += `<p style="margin-top:8px;font-weight:700;">Total cumulé : ${Number(
        data.total || 0
      ).toFixed(2)} €</p>`;
      html += `
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
          <button id="btnPrint" data-table="${tableId}" style="flex:1;background:#10B981;border:none;border-radius:6px;padding:8px;cursor:pointer;">Imprimer</button>
          <button id="btnPaid" data-table="${tableId}" style="flex:1;background:#3B82F6;border:none;border-radius:6px;padding:8px;cursor:pointer;">Paiement confirmé</button>
        </div>
      `;
      content.innerHTML = html;

      lastRendered = {
        tableId,
        html: content.innerHTML,
        status: status.textContent,
      };
    } catch (err) {
      status.textContent = "Erreur de chargement";
      content.innerHTML = `<p style="color:#ef4444;">${err.message}</p>`;
    }
  }

  // --- clic sur les tables ---
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

  // --- actions dans le panneau ---
  document.addEventListener("click", async (e) => {
    const printBtn = e.target.closest("#btnPrint");
    if (printBtn) {
      const tableId = printBtn.dataset.table;
      try {
        await fetch(getApiBase() + "/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: tableId }),
        });
        setTableStatus(tableId, "prepa", "En préparation");
        startDoitPayerTimer(tableId);
      } catch (err) {
        console.error(err);
      }
      return;
    }

    const paidBtn = e.target.closest("#btnPaid");
    if (paidBtn) {
      const tableId = paidBtn.dataset.table;
      try {
        await fetch(getApiBase() + "/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: tableId }),
        });
      } catch (err) {
        console.error(err);
      }

      const content = $("#panelContent");
      const status = $("#panelStatus");
      const prev = { ...lastRendered };

      content.innerHTML = `
        <p>La table ${tableId} a été marquée comme <strong>payée</strong>.</p>
        <button id="btnUndoPaid" style="background:#FBBF24;border:none;border-radius:6px;padding:8px 12px;cursor:pointer;">Annuler</button>
      `;
      status.textContent = "Payée";
      setTableStatus(tableId, "payee", "Payée");
      clearDoitPayerTimer(tableId);

      const undo = $("#btnUndoPaid");
      if (undo) {
        undo.onclick = () => {
          if (prev.tableId === tableId) {
            $("#panelContent").innerHTML = prev.html;
            $("#panelStatus").textContent = prev.status;
            // remettre le statut précédent dans la carte
            if (prev.status === "Vide") {
              setTableStatus(tableId, "vide", "Vide");
            } else {
              setTableStatus(tableId, "commande", "Commandée");
            }
          } else {
            openTablePanel(tableId);
          }
        };
      }
    }
  });

  // --- capter aussi les boutons verts de la grille ---
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const txt = btn.textContent.trim().toLowerCase();
    const card = btn.closest("[data-table], .table");
    if (!card) return;
    const tableId =
      card.dataset.table ||
      (card.querySelector(".chip")?.textContent || "").trim();
    if (!tableId) return;

    if (txt.includes("imprimer maintenant")) {
      setTableStatus(tableId, "prepa", "En préparation");
      startDoitPayerTimer(tableId);
      return;
    }

    if (txt.includes("paiement confirmé")) {
      setTableStatus(tableId, "payee", "Payée");
      clearDoitPayerTimer(tableId);
      return;
    }
  });
})();
