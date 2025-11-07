// js/app.js
// charge les tables + le résumé et affiche tout dans la page
// ajout d’un badge de statut entre T1 et "Dernier : ..."

const API_INPUT_ID = "apiUrl";
const TABLES_CONTAINER_ID = "tables";
const SUMMARY_CONTAINER_ID = "summary";
const FILTER_SELECT_ID = "filter";
const REFRESH_BTN_ID = "btnRefresh";
const REFRESH_SUMMARY_BTN_ID = "btnRefreshSummary";

let CURRENT_API_URL = "";

// petit helper
function $(sel, root = document) {
  return root.querySelector(sel);
}

function getApiUrl() {
  if (CURRENT_API_URL) return CURRENT_API_URL;
  const input = $("#" + API_INPUT_ID);
  return input ? input.value.trim() : "";
}

// ---------- RÉCUP TABLES ----------
async function fetchTables() {
  const url = getApiUrl();
  if (!url) return [];
  try {
    const res = await fetch(url + "/tables");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    // on standardise un peu
    return Array.isArray(json.tables) ? json.tables : json;
  } catch (err) {
    console.warn("[STAFF] erreur tables", err);
    return [];
  }
}

// ---------- RÉCUP SUMMARY ----------
async function fetchSummary() {
  const url = getApiUrl();
  if (!url) return [];
  try {
    const res = await fetch(url + "/summary");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    return Array.isArray(json.tickets) ? json.tickets : json;
  } catch (err) {
    console.warn("[STAFF] erreur summary", err);
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
      // IMPORTANT : on récup le statut que renvoie l’API
      const status = table.status || "Vide";

      const card = document.createElement("div");
      card.className = "table";
      card.dataset.table = id;

      // on construit le header avec 3 chips :
      // [T1] [Commandée] [Dernier : 00:07]
      card.innerHTML = `
        <div class="table-head">
          <div class="chip"><b>${id}</b></div>
          <div class="chip chip-status ${statusClass(status)}">${status}</div>
          <div class="chip muted">Dernier : ${last}</div>
        </div>
        <button class="btn btn-primary btn-print">Imprimer maintenant</button>
        <button class="btn btn-primary btn-pay">Paiement confirmé</button>
      `;

      // actions boutons (on laisse comme mock)
      card.querySelector(".btn-print").onclick = () => {
        console.log("[STAFF] impression", id);
      };
      card.querySelector(".btn-pay").onclick = () => {
        console.log("[STAFF] paiement confirmé", id);
      };

      container.appendChild(card);
    });

  // si rien
  if (!container.children.length) {
    container.innerHTML = `<p class="muted" id="tablesEmpty">Aucune table</p>`;
  }
}

// classe css selon statut (tu peux styler dans style.css)
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
    // t.table, t.time, t.total, t.lines…
    const div = document.createElement("div");
    div.className = "table";
    div.innerHTML = `
      <div class="chip"><b>${t.table}</b></div>
      <div class="chip muted"><span class="icon">🕒</span> ${t.time || ""}</div>
      <div class="chip muted">Total : ${t.total || ""}</div>
      <p class="muted">${t.items || t.lines || ""}</p>
    `;
    container.appendChild(div);
  });

  if (!container.children.length) {
    container.innerHTML = `<p class="muted" id="summaryEmpty">Aucun ticket aujourd'hui.</p>`;
  }
}

// ---------- INIT ----------
async function refreshAll() {
  const [tables, summary] = await Promise.all([fetchTables(), fetchSummary()]);
  renderTables(tables);
  renderSummary(summary);
}

function init() {
  const input = $("#" + API_INPUT_ID);
  if (input) {
    CURRENT_API_URL = input.value.trim();
  }

  const btn = $("#" + REFRESH_BTN_ID);
  if (btn) btn.onclick = refreshAll;

  const btn2 = $("#" + REFRESH_SUMMARY_BTN_ID);
  if (btn2) btn2.onclick = refreshAll;

  const filter = $("#" + FILTER_SELECT_ID);
  if (filter) filter.onchange = refreshAll;

  refreshAll();
}

document.addEventListener("DOMContentLoaded", init);
