// js/table-detail.js
// Panneau latéral qui affiche le récap d'une table
// + calcule le total cumulé à partir de la colonne "Résumé du jour"

console.log("[table-detail] panneau latéral (DOM only) + total cumulé");

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
        matches.push(card);
      }
    });

    return matches;
  }

  // extrait le total "Total : 52.8 €" d'une carte du résumé
  function extractTotalFromCard(card) {
    // dans tes captures c'est le 3ème chip
    const chips = [...card.querySelectorAll(".chip")];
    const totalChip = chips.find((c) => c.textContent.includes("Total"));
    if (!totalChip) return 0;
    const txt = totalChip.textContent; // "Total : 52.8 €"
    const m = txt.replace(",", ".").match(/([\d.]+)\s*€?/);
    return m ? parseFloat(m[1]) : 0;
  }

  function openPanelForTable(tableId) {
    const title = $("#panelTitle");
    const sub = $("#panelSubtitle");
    const content = $("#panelContent");

    title.textContent = "Table " + tableId;
    panel.style.right = "0";

    const cards = getTicketsForTable(tableId);

    if (!cards.length) {
      sub.textContent = "Aucune commande pour cette table";
      content.innerHTML = `<p style="color:#9CA3AF;">Cette table n'a pas de ticket dans le résumé du jour.</p>`;
      return;
    }

    // calcul du total cumulé
    let total = 0;
    cards.forEach((c) => {
      total += extractTotalFromCard(c);
    });

    sub.textContent = `${cards.length} ticket(s) • Total cumulé : ${total.toFixed(2)} €`;

    // on reconstruit un affichage propre
    content.innerHTML = cards
      .map((card) => {
        const chips = [...card.querySelectorAll(".chip")]
          .map((c) => c.textContent.trim())
          .join(" • ");

        const products =
          card.querySelector(".muted")?.textContent?.trim() ||
          card.querySelector("p")?.textContent?.trim() ||
          "";

        return `
          <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:10px;margin-bottom:10px;">
            <div style="font-size:.7rem;color:#9CA3AF;margin-bottom:4px;">${chips}</div>
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
