// pwa-staff/js/table-detail.js (version stable)
console.log("[table-detail] initialisé ✅");

document.addEventListener("DOMContentLoaded", () => {
  const container = document.querySelector("body");

  // 🔹 Crée le panneau latéral (une seule fois)
  let panel = document.createElement("div");
  panel.id = "tablePanel";
  panel.style.position = "fixed";
  panel.style.top = "0";
  panel.style.right = "-420px";
  panel.style.width = "400px";
  panel.style.height = "100%";
  panel.style.background = "#111827";
  panel.style.color = "white";
  panel.style.boxShadow = "-4px 0 8px rgba(0,0,0,0.3)";
  panel.style.transition = "right 0.3s ease";
  panel.style.zIndex = "9999";
  panel.style.overflowY = "auto";
  panel.innerHTML = `
    <div style="padding: 1rem; border-bottom: 1px solid #333;">
      <h2 id="panelTitle" style="margin:0; font-size: 1.4rem;">Table</h2>
      <p id="panelStatus" style="color:#9CA3AF; margin:0.25rem 0 0.5rem 0;">Chargement...</p>
      <button id="panelClose" style="background:#374151; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer;">Fermer</button>
    </div>
    <div id="panelContent" style="padding:1rem;">Aucune donnée</div>
  `;
  container.appendChild(panel);

  document.querySelector("#panelClose").addEventListener("click", () => {
    panel.style.right = "-420px";
  });

  // 🔹 Fonction d’affichage des infos d’une table
  async function openTablePanel(tableId) {
    const title = document.getElementById("panelTitle");
    const content = document.getElementById("panelContent");
    const status = document.getElementById("panelStatus");

    title.textContent = "Table " + tableId;
    status.textContent = "Chargement...";
    content.innerHTML = "<em>Chargement en cours...</em>";

    panel.style.right = "0";

    try {
      // 🔹 Appel API pour récupérer la session de la table
      const res = await fetch(`/api/table/${tableId}/session`);
      if (!res.ok) throw new Error("Erreur " + res.status);
      const data = await res.json();

      // 🔹 Affiche le statut et les commandes
      status.textContent = `Statut : ${data.status || "En attente"}`;
      if (!data.orders || data.orders.length === 0) {
        content.innerHTML = `<p>Aucune commande en cours.</p>`;
      } else {
        const list = data.orders
          .map(
            (o) => `
          <div style="margin-bottom:0.75rem;">
            <strong>${o.qty}× ${o.name}</strong><br/>
            <span style="color:#9CA3AF;">${o.category || ""}</span> — 
            <span style="color:#10B981;">${o.price.toFixed(2)} €</span>
          </div>
        `
          )
          .join("");
        const total = data.orders.reduce(
          (sum, o) => sum + o.price * o.qty,
          0
        );
        content.innerHTML = `
          <div>${list}</div>
          <hr style="border-color:#374151; margin:1rem 0;"/>
          <p><strong>Total :</strong> ${total.toFixed(2)} €</p>
          <div style="display:flex; gap:0.5rem; margin-top:1rem;">
            <button id="btnPrint" style="flex:1; background:#10B981; border:none; padding:8px; border-radius:6px; cursor:pointer;">Imprimer</button>
            <button id="btnPaid" style="flex:1; background:#3B82F6; border:none; padding:8px; border-radius:6px; cursor:pointer;">Paiement confirmé</button>
          </div>
        `;
      }
    } catch (err) {
      status.textContent = "Erreur de chargement";
      content.innerHTML = `<p style="color:#EF4444;">${err.message}</p>`;
    }
  }

  // 🔹 Clique sur une table → ouvre le panneau
  document.addEventListener("click", (e) => {
    const tableCard = e.target.closest("[data-table], .table");
    if (!tableCard) return;
    const id =
      tableCard.dataset.table ||
      (tableCard.querySelector(".chip")?.textContent || "").trim();
    if (!id) return;
    openTablePanel(id);
  });
});
