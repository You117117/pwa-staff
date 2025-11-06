// js/table-detail.js
console.log("[table-detail] version légère chargée ✅");

(function () {
  const $ = (s, r = document) => r.querySelector(s);

  function getApiBase() {
    const input = $("#apiUrl");
    const val = (input && input.value.trim()) || "";
    if (val) return val.replace(/\/+$/, "");
    try {
      const fromLS =
        localStorage.getItem("orders_api_url_v11") ||
        localStorage.getItem("api_url") ||
        localStorage.getItem("API_URL") ||
        "";
      return fromLS.trim().replace(/\/+$/, "");
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

  // panneau
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
      <p id="panelStatus" style="margin:.25rem 0 0 0;color:#9CA3AF;">Sélectionnez une table…</p>
      <button id="panelClose" style="margin-top:.5rem;background:#374151;border:none;color:white;padding:4px 10px;border-radius:4px;cursor:pointer;">Fermer</button>
    </div>
    <div id="panelContent" style="padding:1rem;">&nbsp;</div>
  `;
  document.body.appendChild(panel);
  $("#panelClose").onclick = () => (panel.style.right = "-420px");

  // charger les commandes d’une table
  async function loadTable(tableId) {
    const title = $("#panelTitle");
    const status = $("#panelStatus");
    const content = $("#panelContent");

    title.textContent = "Table " + tableId;
    status.textContent = "Chargement…";
    content.innerHTML = "<p>Chargement…</p>";
    panel.style.right = "0";

    // 1. essayer /session
    try {
      const session = await apiGET(`/session/${encodeURIComponent(tableId)}`);
      const orders = session?.orders || [];
      if (orders.length) {
        status.textContent = "Commandée";
        let html = "";
        orders.forEach((o) => {
          const items = (o.items || [])
            .map((it) => `<li>${it.qty || 1}× ${it.name || ""}</li>`)
            .join("");
          html += `
            <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px;">
              <h4 style="margin:0 0 4px 0;">Ticket ${o.id || ""}</h4>
              <ul style="margin:0;padding-left:16px;">${items}</ul>
            </div>
          `;
        });
        content.innerHTML = html;
        return;
      }
    } catch (e) {
      // on tente summary ensuite
    }

    // 2. sinon /summary
    try {
      const summary = await apiGET("/summary");
      const tickets = (summary.tickets || []).filter(
        (t) => (t.table || "").toUpperCase() === tableId.toUpperCase()
      );
      if (!tickets.length) {
        status.textContent = "Vide";
        content.innerHTML = "<p>Aucune commande pour cette table.</p>";
        return;
      }
      status.textContent = "Commandée";
      let html = "";
      tickets.forEach((t) => {
        html += `
          <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px;">
            <h4 style="margin:0 0 4px 0;">Ticket ${t.id || ""} • ${t.time || ""}</h4>
            ${(t.items || [])
              .map((it) => `<li>${it.qty || 1}× ${it.name || ""}</li>`)
              .join("")}
            ${t.total ? `<p style="margin-top:6px;">Total : ${t.total} €</p>` : ""}
          </div>
        `;
      });
      content.innerHTML = html;
    } catch (err) {
      status.textContent = "Erreur";
      content.innerHTML = `<p style="color:#ef4444;">${err.message}</p>`;
    }
  }

  // clic sur une table
  document.addEventListener("click", (e) => {
    const card = e.target.closest(".table, [data-table]");
    if (!card) return;
    const chip = card.querySelector(".chip");
    const id =
      card.dataset.table ||
      (chip && chip.textContent.trim()) ||
      null;
    if (!id) return;
    loadTable(id.toUpperCase());
  });
})();
