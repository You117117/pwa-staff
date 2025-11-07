// js/table-detail.js
// Ouvre un panneau à droite et affiche les tickets de la table
// en lisant ce qu'il y a déjà dans le DOM (colonne "Résumé du jour").

console.log("[table-detail] panneau latéral (DOM only)");

(function () {
  const $ = (s, r = document) => r.querySelector(s);

  // création panneau
  const panel = document.createElement("div");
  panel.id = "tablePanel";
  Object.assign(panel.style, {
    position: "fixed",
    top: "0",
    right: "-420px",
    width: "400px",
    height: "100vh",
    background: "#111827",
    color: "#fff",
    boxShadow: "-4px 0 8px rgba(0,0,0,.35)",
    transition: "right .25s ease",
    zIndex: "9999",
    overflowY: "auto",
  });
  panel.innerHTML = `
    <div style="padding:1rem;border-bottom:1px solid #1f2937;">
      <h2 id="panelTitle" style="margin:0;font-size:1.25rem;">Table</h2>
      <p id="panelSubtitle" style="margin:.25rem 0 0 0;color:#9CA3AF;">Sélectionnez une table…</p>
      <button id="panelClose"
        style="margin-top:.5rem;background:#374151;border:none;color:white;padding:4px 10px;border-radius:4px;cursor:pointer;">
        Fermer
      </button>
    </div>
    <div id="panelContent" style="padding:1rem;"></div>
  `;
  document.body.appendChild(panel);

  $("#panelClose").onclick = () => (panel.style.right = "-420px");

  // lit la colonne de droite et renvoie les tickets de la table
  function getTicketsForTable(tableId) {
    const summary = $("#summary");
    if (!summary) return [];

    const cards = [...summary.querySelectorAll(".table")];
    const matches = [];

    cards.forEach((card) => {
      // la première pastille est le numéro de table
      const chipTable = card.querySelector(".chip");
      const txt = chipTable ? chipTable.textContent.trim() : "";
      if (txt === tableId) {
        // on prend tout le reste du contenu
        const content = card.innerHTML;
        matches.push({
          raw: content,
          el: card.cloneNode(true),
        });
      }
    });

    return matches;
  }

  function openPanelForTable(tableId) {
    const title = $("#panelTitle");
    const sub = $("#panelSubtitle");
    const content = $("#panelContent");

    title.textContent = "Table " + tableId;
    panel.style.right = "0";

    const tickets = getTicketsForTable(tableId);

    if (!tickets.length) {
      sub.textContent = "Aucune commande pour cette table";
      content.innerHTML = `<p style="color:#9CA3AF;">Cette table n'a pas de ticket dans le résumé du jour.</p>`;
      return;
    }

    sub.textContent = tickets.length + " ticket(s)";
    // on reconstruit un petit affichage propre
    content.innerHTML = tickets
      .map((t) => {
        // on essaie de récupérer la ligne des produits
        const products = t.el.querySelector(".muted")?.textContent?.trim() || "";
        const chips = [...t.el.querySelectorAll(".chip")]
          .map((c) => c.textContent.trim())
          .join(" • ");
        return `
          <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px;">
            <div style="font-size:.75rem;color:#9CA3AF;margin-bottom:4px;">${chips}</div>
            <div>${products || "—"}</div>
          </div>
        `;
      })
      .join("");
  }

  // clic sur une table
  document.addEventListener("click", (e) => {
    const card = e.target.closest(".table");
    if (!card || e.target.closest("#tablePanel")) return;

    // le numéro de table est dans la première .chip > b
    const id =
      card.querySelector(".chip b")?.textContent.trim() ||
      card.querySelector(".chip")?.textContent.trim() ||
      "";

    if (!id) return;

    openPanelForTable(id);
  });
})();
