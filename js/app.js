// js/app.js
// - charge URL API depuis localStorage
// - permet de mémoriser
// - récupère /tables et /summary
// - affiche un badge de statut entre T1 et "Dernier : ..."

const API_INPUT_ID = "apiUrl";
const TABLES_CONTAINER_ID = "tables";
const SUMMARY_CONTAINER_ID = "summary";
const FILTER_SELECT_ID = "filter";
const REFRESH_BTN_ID = "btnRefresh";
const REFRESH_SUMMARY_BTN_ID = "btnRefreshSummary";
const MEMO_BTN_ID = "btnMemorize";
const HEALTH_BTN_ID = "btnHealth";

const LS_KEY = "staff_api_url";

let CURRENT_API_URL = "";

// petit helper
function $(sel, root = document) {
  return root.querySelector(sel);
}

// charge l’URL depuis le champ ou depuis le localStorage
function getApiUrl() {
  if (CURRENT_API_URL) return CURRENT_API_URL;
  const input = $("#" + API_INPUT_ID);
  if (input && input.value.trim()) {
    return input.value.trim();
  }
  const saved = localStorage.getItem(LS_KEY) || "";
  return saved;
}

// met à jour le champ et la variable
function setApiUrl(url) {
  CURRENT_API_URL = url;
  const input = $("#" + API_INPUT_ID);
  if (input) input.value = url;
}

// ---------- APPELS API ----------
async function fetchTables() {
  const url = getApiUrl();
  if (!url) return [];
  try {
    const res = await fetch(url + "/tables");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    return Array.isArray(json.tables) ? json.tables : json;
  } catch (err) {
    console.warn("[STAFF] erreur /tables", err);
    return [];
  }
}

async function fetchSummary() {
  const url = getApiUrl();
  if (!url) return [];
  try {
    const res = await fetch(url + "/summary");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    return Array.isArray(json.tickets) ? json.tickets : json;
  } catch (err) {
    console.warn("[STAFF] erreur /summary", err);
    return [];
  }
}

// ---------- RENDU TABLES ----------
function renderTables(tables) {
  const container = $("#" + TABLES_CONTAINER_ID);
  if (!container) return;

  const filter = $("#" + FILTER_SELECT_ID);
  const filterVal = filter ? filter.value : "ALL";

  container.innerHTML = "";

  tables
    .filter((t) => {
      if (filterVal === "ALL") return true;
      return t.id === filterVal;
    })
    .forEach((table) => {
      const id = table.id || table.name || "";
      const last = table.last || table.last_order || "--:--";
      // statut envoyé par l’API, sinon “Vide”
      const status = table.status || "Vide";

      const card = document.createElement("div");
      card.className = "table";
      card.dataset.table = id;

      card.innerHTML = `
        <div class="table-head">
          <div class="chip"><b>${id}</b></div>
          <div class="chip chip-status ${statusClass(status)}">${status}</div>
          <div class="chip muted">Dernier : ${last}</div>
        </div>
        <button class="btn btn-primary btn-print">Imprimer maintenant</button>
        <button class="btn btn-primary btn-pay">Paiement confirmé</button>
      `;

      container.appendChild(card);
    });

  if (!container.children.length) {
    container.innerHTML = `<p class="muted" id="tablesEmpty">Aucune table</p>`;
  }
}

// retourne une classe css en fonction du texte
function statusClass(status) {
  const s = status.toLowerCase();
  if (s.includes("command")) return "is-warning";
  if (s.includes("payer") || s.includes("doit")) return "is-danger";
  if (s.includes("payé") || s.includes("payee") || s.includes("confirm")) return "is-success";
  return "is-muted";
}

// ---------- RENDU SUMMARY ----------
function renderSummary(tickets) {
  const container = $("#" + SUMMARY_CONTAINER_ID);
  if (!container) return;
  container.innerHTML = "";

  tickets.forEach((t) => {
    const div = document.createElement("div");
    div.className = "table";
    div.innerHTML = `
      <div class="chip"><b>${t.table}</b></div>
      <div class="chip muted">🕒 ${t.time || ""}</div>
      <div class="chip muted">Total : ${t.total || ""}</div>
      <p class="muted">${t.items || t.lines || ""}</p>
    `;
    container.appendChild(div);
  });

  if (!container.children.length) {
    container.innerHTML = `<p class="muted" id="summaryEmpty">Aucun ticket aujourd'hui.</p>`;
  }
}

// ---------- ACTIONS ----------
async function refreshAll() {
  const [tables, summary] = await Promise.all([fetchTables(), fetchSummary()]);
  renderTables(tables);
  renderSummary(summary);
}

async function testHealth() {
  const url = getApiUrl();
  if (!url) return alert("Pas d’URL API");
  try {
    const res = await fetch(url + "/health");
    alert("/health → " + res.status);
  } catch (e) {
    alert("Erreur /health");
  }
}

// ---------- INIT ----------
function init() {
  // recharger l’URL mémorisée
  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    setApiUrl(saved);
  }

  // bouton mémoriser
  const memoBtn = $("#" + MEMO_BTN_ID);
  if (memoBtn) {
    memoBtn.onclick = () => {
      const val = $("#" + API_INPUT_ID).value.trim();
      if (!val) return;
      localStorage.setItem(LS_KEY, val);
      setApiUrl(val);
    };
  }

  // bouton /health
  const healthBtn = $("#" + HEALTH_BTN_ID);
  if (healthBtn) {
    healthBtn.onclick = testHealth;
  }

  const btn = $("#" + REFRESH_BTN_ID);
  if (btn) btn.onclick = refreshAll;

  const btn2 = $("#" + REFRESH_SUMMARY_BTN_ID);
  if (btn2) btn2.onclick = refreshAll;

  const filter = $("#" + FILTER_SELECT_ID);
  if (filter) filter.onchange = refreshAll;

  // premier chargement
  refreshAll();
}

document.addEventListener("DOMContentLoaded", init);
