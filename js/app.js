
/* === STATUS UI ENHANCEMENTS === */

const SOUND_COOLDOWN_MS = 10000;
const tableSoundMemory = {};

function playToneSequence(freqs, duration = 120) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let time = ctx.currentTime;
  freqs.forEach(f => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = f;
    osc.type = 'sine';
    gain.gain.value = 0.15;
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + duration / 1000);
    time += duration / 1000;
  });
}

function playStatusSound(tableId, status) {
  const now = Date.now();
  if (tableSoundMemory[tableId] && now - tableSoundMemory[tableId] < SOUND_COOLDOWN_MS) return;
  tableSoundMemory[tableId] = now;

  if (status === 'commandée') {
    playToneSequence([523, 659, 784]); // C5 E5 G5
  }
  if (status === 'nouvelle_commande') {
    playToneSequence([784, 659, 523, 988]); // G5 E5 C5 B5
  }
}

/* Hook into existing render/update logic */
const originalRenderTable = window.renderTable;
window.renderTable = function(table) {
  const el = originalRenderTable(table);

  el.classList.remove(
    'status-vide','status-en_cours','status-commandee',
    'status-nouvelle_commande','status-doit_payer','status-payee'
  );

  const statusMap = {
    'VIDE':'status-vide',
    'EN_COURS':'status-en_cours',
    'COMMANDÉE':'status-commandee',
    'NOUVELLE_COMMANDE':'status-nouvelle_commande',
    'DOIT_PAYER':'status-doit_payer',
    'PAYÉE':'status-payee'
  };

  const cssClass = statusMap[table.status];
  if (cssClass) el.classList.add(cssClass);

  // Detect transition
  if (!el.dataset.prevStatus) {
    el.dataset.prevStatus = table.status;
  } else if (el.dataset.prevStatus !== table.status) {
    if (table.status === 'COMMANDÉE') playStatusSound(table.id, 'commandée');
    if (table.status === 'NOUVELLE_COMMANDE') playStatusSound(table.id, 'nouvelle_commande');
    el.dataset.prevStatus = table.status;
  }

  return el;
};
