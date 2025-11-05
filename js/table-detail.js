// pwa-staff/js/table-detail.js (version test)
console.log('[table-detail] chargé ✅');

document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-table], .table');
  if (!card) return;
  const id =
    card.dataset.table ||
    (card.querySelector('.chip')?.textContent || '').trim();
  if (!id) return;
  alert('Table cliquée : ' + id);
});
