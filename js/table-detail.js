// pwa-staff/js/table-detail.js
console.log("[table-detail] initialisé ✅");

(function () {
  const $ = (s, r = document) => r.querySelector(s);

  // on garde ici les timers "15 minutes → Doit payer"
  const paymentTimers = {}; // { T1: timeoutId, ... }

  // --- récupérer la bonne base API (comme le staff) ---
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

  // --- styles pour le badge sur la carte ---
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

  // --- trouver une carte dans la grille ---
  function findTableCard(tableId) {
    // d'abord data-table
    let card = document.querySelector(`[data-table="${tableId}"]`);
    if (card) return card;
    // sinon .table + .chip
    const all = document.querySelectorAll(".table");
    for (const c of all) {
      const chip = c.querySelector(".chip");
      if (chip && chip.textContent.trim() === tableId) return c;
    }
    return null;
  }

  // --- appliquer un statut sur une carte ---
  // statusKey ∈ ["vide","commande","prepa","doitpayer","payee"]
  function setTableStatus(tableId, statusKey, label) {
    ensureStatusStyles();
    const card = findTableCard(tableId);
    if (!card) return;

    let badge = card.querySelector(".td-card-status");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "td-card-status";
      card.insertBefore(badge, card.firstElementChild || null);
    }
    badge.textContent = label;
    badge.className = "td-card-status status-" + statusKey;
  }

  // --- démarrer le timer "15 min → doit payer" ---
  function startDoitPayerTimer(tableId) {
    // on nettoie l'ancien
    if (paymentTimers[tableId]) {
      clearTimeout(paymentTimers[tableId]);
    }
    paymentTimers[tableId] = setTimeout(() => {
      setTableStatus(tableId, "doitpayer", "Doit payer");
    }, 15 * 60 * 1000); // 15 minutes
  }

  // --- annuler le timer si payé ---
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

  // on garde le dernier affichage pour "annuler"
  let lastRendered = {
    tableId: null,
    html: "",
    status: "",
  };

  // --- charger les données d'une table ---
  async function loadTableData(tableId) {
    // 1) essayer la session
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
      // on tentera summary
    }

    // 2) fallback résumé du jour
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

  // --- afficher dans le panneau ---
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

      // s'il y a des commandes on met "Commandée"
      status.textContent =
        data.mode === "session" ? "Commandée" : "Commandée";
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

  // --- clic sur les tables (ouvrir panneau) ---
  document.addEventListener("click", (e) => {
    // ne pas intercepter les vrais boutons verts
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
    // imprimer (illimité) depuis le panneau
    const printBtn = e.target.closest("#btnPrint");
    if (printBtn) {
      const tableId = printBtn.dataset.table;
      try {
        await fetch(getApiBase() + "/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: tableId }),
        });
        // passage en "En préparation"
        setTableStatus(tableId, "prepa", "En préparation");
        // lancer le compte à rebours de 15 minutes
        startDoitPayerTimer(tableId);
      } catch (err) {
        console.error(err);
      }
      return;
    }

    // paiement confirmé depuis le panneau
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
            // remettre le badge précédent
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
  // "Imprimer maintenant" et "Paiement confirmé" déjà présents
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const txt = btn.textContent.trim().toLowerCase();
    // on remonte à la carte pour savoir quelle table
    const card = btn.closest("[data-table], .table");
    if (!card) return;
    const tableId =
      card.dataset.table ||
      (card.querySelector(".chip")?.textContent || "").trim();
    if (!tableId) return;

    // bouton vert "Imprimer maintenant"
    if (txt.includes("imprimer maintenant")) {
      // on met direct le statut
      setTableStatus(tableId, "prepa", "En préparation");
      startDoitPayerTimer(tableId);
      return;
    }

    // bouton vert "Paiement confirmé"
    if (txt.includes("paiement confirmé")) {
      setTableStatus(tableId, "payee", "Payée");
      clearDoitPayerTimer(tableId);
      return;
    }
  });
})();
