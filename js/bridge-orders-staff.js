/* bridge-orders-staff.js — staff
   - Poll /staff/summary toutes les X secondes
   - Si 404 => on considère “aucun ticket aujourd’hui” (pas d’erreur bloquante)
   - Met à jour la colonne de droite “Résumé du jour”
   - Appelle window.__RQR_reloadTables() pour recharger les tables si une commande est confirmée
*/

(function () {
  const SUMMARY_INTERVAL_MS = 6000; // 6s
  const apiInput = document.querySelector('input[type="url"], input#api, input#apiUrl, input[name="api"]');
  const btnRefreshSummary = Array.from(document.querySelectorAll('button'))
    .find(b => /rafraîchir/i.test(b.textContent || '') && b.closest('[class*="summary"], [id*="summary"], [data-panel="summary"]')) || null;

  // Conteneur Résumé (colonne droite)
  const summaryPanel = document.querySelector('[data-panel="summary"]') ||
                       Array.from(document.querySelectorAll('section,div')).find(n => /Résumé du jour/i.test(n.textContent || ''));

  const getApi = () => (apiInput?.value || localStorage.getItem('RQR_API_URL') || '').trim();

  const renderEmptySummary = (reason) => {
    if (!summaryPanel) return;
    const body = summaryPanel.querySelector('.summary-body') || summaryPanel;
    body.innerHTML = `<div class="item muted">${reason || 'Aucun ticket aujourd’hui'}</div>`;
  };

  const renderSummary = (rows) => {
    if (!summaryPanel) return;
    const body = summaryPanel.querySelector('.summary-body') || summaryPanel;
    if (!rows || !rows.length) {
      renderEmptySummary();
      return;
    }
    body.innerHTML = rows.map(r => `
      <div class="item">
        <div class="line"><strong>${r.table || r.t || '?'}</strong> — <span>${r.when || r.time || ''}</span></div>
        <div class="line">${r.desc || r.items || ''}</div>
        <div class="line">Total: ${r.total ?? '0.00'} €</div>
        <div style="margin-top:6px"><button class="btn btn-outline" disabled>Paiement confirmé</button></div>
      </div>
    `).join('');
  };

  // Parse des différentes formes de payload que ton API peut renvoyer
  const normalizeSummaryPayload = (payload) => {
    if (!payload) return [];
    // cas {tickets:[...]}
    if (Array.isArray(payload.tickets)) return payload.tickets;
    // cas déjà un array
    if (Array.isArray(payload)) return payload;
    // cas {data:[...]}
    if (Array.isArray(payload.data)) return payload.data;
    return [];
  };

  const fetchSummary = async () => {
    const base = getApi();
    if (!base) return renderEmptySummary('Définissez l’URL API puis “Mémoriser”.');

    try {
      const res = await fetch(`${base.replace(/\/+$/,'')}/staff/summary?ts=${Date.now()}`, { cache: 'no-store' });
      if (res.status === 404) {
        // API non implémentée côté serveur -> on n’affiche juste rien, pas d’alarme
        return renderEmptySummary();
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = normalizeSummaryPayload(data);
      renderSummary(rows);
    } catch (e) {
      // Réseau, CORS, etc. => on affiche un msg discret (comme ton screenshot)
      renderEmptySummary('Erreur /staff/summary : ' + (e?.message || e));
    }
  };

  // Rafraîchissement manuel
  btnRefreshSummary?.addEventListener('click', () => fetchSummary());

  // Rafraîchissement périodique
  fetchSummary();
  setInterval(fetchSummary, SUMMARY_INTERVAL_MS);

  // Quand une commande est confirmée côté client, si tu envoies un signal via API, tu peux déclencher :
  // window.__RQR_reloadTables?.();
})();
