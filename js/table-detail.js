// pwa-staff/js/table-detail.js
console.log("[table-detail] initialisé ✅ (version complète + suppression 'En attente')");

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const paymentTimers = {};

  // --------------------------------------------------
  // 0. SUPPRIMER tous les "En attente : ..." dès qu'on les voit
  // --------------------------------------------------
  function removeWaitingLabels() {
    const els = document.querySelectorAll(".table span, .table small, .table div");
    let removed = 0;
    els.forEach((el) => {
      const txt = (el.textContent || "").trim().toLowerCase();
      // on ne touche pas "Dernier :"
      if (txt.startsWith("dernier")) return;
      if (txt.startsWith("en attente")) {
        el.remove();
        removed++;
      }
    });
    if (removed) {
      console.log("🧹 [table-detail] supprimé", removed, "label(s) 'En attente'");
    }
  }

  // lancer au chargement
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", removeWaitingLabels);
  } else {
    removeWaitingLabels();
  }

  // surveiller les changements (quand ton app recharge les tables)
  const observer = new MutationObserver(() => {
    removeWaitingLabels();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // --------------------------------------------------
  // 1. Helpers API
  // --------------------------------------------------
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

  // --------------------------------------------------
  // 2. Retrouver une carte de table
  // --------------------------------------------------
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

  // --------------------------------------------------
  // 3. Afficher un statut dans la carte (sans remettre "En attente")
  // --------------------------------------------------
  // on ne réinsère pas l'ancien chip; si tu veux le mettre à côté du titre plus tard, on pourra
  function setTableStatus(tableId, statusKey, label) {
    const card = findTableCard(tableId);
    if (!card) return;

    // on essaie de trouver un span qu'on a déjà créé
    let span = card.querySelector(".table-status-inline");
    if (!span) {
      // on le crée juste après la puce "T1"
      const chip = card.querySelector(".chip");
      span = document.createElement("span");
      span.className = "table-status-inline";
      span.style.display = "inline-block";
      span.style.marginLeft = "6px";
      span.style.fontSize = "12px";
      span.style.padding = "2px 8px";
      span.style.borderRadius = "999px";
      span.style.background = "#1f2937";
      span.style.color = "#fff";
      if (chip && chip.parentNode) {
        chip.parentNode.insertBefore(span, chip.nextSibling);
      } else {
        card.prepend(span);
      }
    }

    span.textContent = label;

    // couleurs simples par statut
    span.style.background =
      statusKey === "payee"
        ? "#15803d"
        : statusKey === "doitpayer"
        ? "#b45309"
        : statusKey === "prepa"
        ? "#1d4ed8"
        : statusKey === "commande"
        ? "#334155"
        : "#1f2937";
  }

  // --------------------------------------------------
  // 4. timers 15 minutes → "Doit payer"
  // --------------------------------------------------
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

  // --------------------------------------------------
  // 5. Panneau latéral (comme avant)
  // --------------------------------------------------
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

  // --------------------------------------------------
  // 6. Charger les données d'une table
  // --------------------------------------------------
  async function loadTableData(tableId) {
    // essayer la session
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
    } catch (_) {
      // on passera sur summary
    }

    // sinon résumé du jour
    const summary = await apiGET(`/summary`);
    const tickets = (summary.tickets || []).filter(
      (t) => (t.table || "").toUpperCase() === tableId.toUpperCase()
    );
    const total = tickets.reduce((sum, t) => sum + Number(t.total || 0), 0);
    return { mode: "summary", orders: tickets, total };
  }

  // --------------------------------------------------
  // 7. ouvrir panneau
  // --------------------------------------------------
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
    } catch (err) {
      status.textContent = "Erreur de chargement";
      content.innerHTML = `<p style="color:#ef4444;">${err.message}</p>`;
    }
  }

  // --------------------------------------------------
  // 8. clic sur une carte → ouvrir panneau
  // --------------------------------------------------
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

  // --------------------------------------------------
  // 9. actions dans le panneau (imprimer / payé)
  // --------------------------------------------------
  document.addEventListener("click", async (e) => {
    const printBtn = e.target.closest("#btnPrint");
    if (printBtn) {
      const tableId = printBtn.dataset.table;
      // appel API d'impression si tu l'as, sinon on met juste le statut
      try {
        await fetch(getApiBase() + "/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: tableId }),
        });
      } catch (err) {
        console.warn("[print] erreur (mock)", err.message);
      }
      setTableStatus(tableId, "prepa", "En préparation");
      startDoitPayerTimer(tableId);
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
        console.warn("[confirm] erreur (mock)", err.message);
      }
      setTableStatus(tableId, "payee", "Payée");
      clearDoitPayerTimer(tableId);
      return;
    }
  });

  // --------------------------------------------------
  // 10. boutons verts dans la grille
  // --------------------------------------------------
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

    // bouton "Imprimer maintenant"
    if (txt.includes("imprimer maintenant")) {
      setTableStatus(tableId, "prepa", "En préparation");
      startDoitPayerTimer(tableId);
      return;
    }

    // bouton "Paiement confirmé"
    if (txt.includes("paiement confirmé")) {
      setTableStatus(tableId, "payee", "Payée");
      clearDoitPayerTimer(tableId);
      return;
    }
  });
})();
