// js/table-detail.js
// Panneau latéral : affiche les tickets d'une table + bloc total bien visible

console.log("[table-detail] panneau latéral + total visible");

(function () {
  const $ = (s, r = document) => r.querySelector(s);

  // === panneau latéral ===
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

  // ===== helpers =====
  function getTicketsForTable(tableId) {
    const summary = $("#summary");
    if (!summary) return [];
    return [...summary.querySelectorAll(".table")].filter((card) => {
      const chip = card.querySelector(".chip");
      return chip && chip.textContent.trim() === tableId;
    });
  }

  function extractTotalFromCard(card) {
    const chips = [...card.querySelectorAll(".chip")];
    const totalChip = chips.find((c) => c.textContent.includes("Total"));
    if (!totalChip) return 0;
    const m = totalChip.textContent.replace(",", ".").match(/([\d.]+)\s*€?/);
    return m ? parseFloat(m[1]) : 0;
  }

  // ===== affichage panneau =====
  function openPanelForTable(tableId) {
    const title = $("#panelTitle");
    const sub = $("#panelSubtitle");
    const content = $("#panelContent");

    title.textContent = "Table " + tableId;
    panel.style.right = "0";

    const cards = getTicketsForTable(tableId);

    if (!cards.length) {
      sub.textContent = "Aucune commande pour cette table";
      content.innerHTML = `<p style="color:#9CA3AF;">Cette table n'a pas encore de tickets dans le résumé du jour.</p>`;
      return;
    }

    // calcul du total cumulé
    const total = cards.reduce((acc, c) => acc + extractTotalFromCard(c), 0);
    sub.textContent = `${cards.length} ticket(s) • Total cumulé : ${total.toFixed(2)} €`;

    // rendu des tickets
    const ticketsHtml = cards
      .map((card, i) => {
        const chips = [...card.querySelectorAll(".chip")]
          .map((c) => c.textContent.trim())
          .join(" • ");

        const products =
          card.querySelector("p")?.textContent.trim() ||
          card.querySelector(".muted")?.textContent.trim() ||
          "";

        return `
          <div style="background:#0f172a;border:1px solid #1f2937;border-radius:10px;padding:12px;margin-bottom:12px;">
            <div style="font-size:.75rem;color:#9CA3AF;margin-bottom:4px;">
              Ticket #${i + 1} • ${chips}
            </div>
            <div style="font-size:1rem;color:#F9FAFB;">${products || "—"}</div>
          </div>
        `;
      })
      .join("");

    // bloc total bien visible (la zone rouge de ta capture)
    const totalBlock = `
      <div style="margin-top:10px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);border-radius:10px;padding:14px;">
        <div style="font-size:.75rem;color:#A7F3D0;letter-spacing:.02em;">TOTAL DE LA TABLE</div>
        <div style="font-size:1.6rem;font-weight:700;margin-top:4px;">${total.toFixed(2)} €</div>
      </div>
    `;

    content.innerHTML = ticketsHtml + totalBlock;
  }

  // clic sur une carte de table
  document.addEventListener("click", (e) => {
    const card = e.target.closest(".table");
    if (!card || e.target.closest("#tablePanel")) return;

    const id =
      card.querySelector(".chip b")?.textContent.trim() ||
      card.querySelector(".chip")?.textContent.trim() ||
      "";

    if (!id) return;

    openPanelForTable(id);
  });
})();
