// pwa-staff/js/table-detail.js
console.log("[table-detail] initialisé ✅ suppression En attente active");

(function () {
  const $ = (s, r = document) => r.querySelector(s);

  // --- fonction de suppression immédiate ---
  function removeAllWaitingChips() {
    const els = document.querySelectorAll(".table span, .table small, .table div");
    let count = 0;
    els.forEach((el) => {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt.startsWith("en attente")) {
        el.remove();
        count++;
      }
    });
    if (count > 0) console.log(`🧹 Supprimé ${count} "En attente"`);
  }

  // --- exécution au chargement ---
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", removeAllWaitingChips);
  } else {
    removeAllWaitingChips();
  }

  // --- observer les changements du DOM (rafraîchissement auto inclus) ---
  const observer = new MutationObserver(() => removeAllWaitingChips());
  observer.observe(document.body, { childList: true, subtree: true });

  // --- panneau latéral (inchangé) ---
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

  // --- clic sur carte pour ouvrir panneau ---
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

  // --- contenu du panneau ---
  async function openTablePanel(tableId) {
    const title = $("#panelTitle");
    const status = $("#panelStatus");
    const content = $("#panelContent");
    title.textContent = "Table " + tableId;
    status.textContent = "Chargement…";
    content.innerHTML = "<p>Chargement…</p>";
    panel.style.right = "0";

    status.textContent = "Vide";
    content.innerHTML = `<p>Aucune commande pour cette table.</p>`;
  }
})();
