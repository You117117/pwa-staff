// js/table-detail.js
// Version restaurée : uniquement panneau latéral sur clic table (sans statuts)

console.log("[table-detail] panneau latéral actif — sans badges de statut");

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  // Récupération de l’URL API du staff
  function getApiBase() {
    const input = $("#apiUrl");
    const val = (input?.value || "").trim();
    if (val) return val.replace(/\/+$/, "");
    try {
      const ls =
        localStorage.getItem("staff_api_url") ||
        localStorage.getItem("orders_api_url_v11") ||
        localStorage.getItem("api_url") ||
        "";
      return ls.trim().replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  async function apiGET(path) {
    const base = getApiBase();
    if (!base) throw new Error("API non configurée");
    const res = await fetch(base + path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  // === Création du panneau latéral ===
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
      <h2 id="panelTitle" style="margin:0;font-size:1.3rem;">Table</h2>
      <p id="panelSubtitle" style="margin:.25rem 0 0 0;color:#9CA3AF;">Sélectionnez une table…</p>
      <button id="panelClose" style="margin-top:.5rem;background:#374151;border:none;color:white;padding:4px 10px;border-radius:4px;cursor:pointer;">Fermer</button>
    </div>
    <div id="panelContent" style="padding:1rem;"></div>
  `;
  document.body.appendChild(panel);

  $("#panelClose").onclick = () => (panel.style.right = "-420px");

  // Fonction d’ouverture du panneau pour une table donnée
  async function openTablePanel(tableId) {
    const title = $("#panelTitle");
    const sub = $("#panelSubtitle");
    const content = $("#panelContent");

    title.textContent = "Table " + tableId;
    sub.textContent = "Chargement...";
    content.innerHTML = "<p>Chargement...</p>";
    panel.style.right = "0";

    try {
      const data = await apiGET(`/session/${encodeURIComponent(tableId)}`);
      const orders = data?.orders || [];

      if (!orders.length) {
        sub.textContent = "Aucune commande pour cette table";
        content.innerHTML = "<p>Aucune commande en cours.</p>";
        return;
      }

      sub.textContent = `${orders.length} commande(s) trouvée(s)`;
      let html = "";
      orders.forEach((o) => {
        const items = (o.items || [])
          .map((it) => `<li>${it.qty || 1}× ${it.name}</li>`)
          .join("");
        html += `
          <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px;">
            <h4 style="margin:0 0 4px 0;">Ticket ${o.id || ""}</h4>
            <ul style="margin:0;padding-left:16px;">${items}</ul>
          </div>
        `;
      });

      content.innerHTML = html;
    } catch (err) {
      sub.textContent = "Erreur";
      content.innerHTML = `<p style="color:#ef4444;">${err.message}</p>`;
    }
  }

  // Gestion du clic sur une carte table
  document.addEventListener("click", (e) => {
    const card = e.target.closest(".table");
    if (!card || e.target.closest("#tablePanel")) return;

    const id = card.querySelector(".chip b")?.textContent.trim() || "";
    if (id) openTablePanel(id);
  });
})();
