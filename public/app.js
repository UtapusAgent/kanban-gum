const $ = (selector) => document.querySelector(selector);

const columns = [
  ["backlog", "Backlog"],
  ["doing", "Doing"],
  ["done", "Done"],
];

let cards = [];
let editingId = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function priorityClass(priority) {
  return `priority-${String(priority || "Medium").toLowerCase()}`;
}

function cardsFor(status) {
  return cards
    .filter((card) => card.status === status)
    .sort((a, b) => {
      const order = { High: 0, Medium: 1, Low: 2 };
      return (order[a.meta?.priority] ?? 1) - (order[b.meta?.priority] ?? 1) || b.updated_at - a.updated_at;
    });
}

function render() {
  const total = cards.length;
  const editing = cards.find((card) => card.id === editingId);
  $("#app").innerHTML = `
    <section class="panel">
      <form id="cardForm" class="card-form">
        <input id="title" placeholder="Card title" required value="${escapeHtml(editing?.title || "")}">
        <select id="priority">
          ${["Medium", "High", "Low"].map((priority) => `<option ${editing?.meta?.priority === priority ? "selected" : ""}>${priority}</option>`).join("")}
        </select>
        <textarea id="body" placeholder="Details, acceptance criteria, links...">${escapeHtml(editing?.body || "")}</textarea>
        <div class="row"><button>${editing ? "Save card" : "Add card"}</button>${editing ? `<button type="button" class="ghost" id="cancelEdit">Cancel</button>` : ""}</div>
      </form>
    </section>
    <section class="stats">
      <div class="stat"><span class="muted">Cards</span><strong>${total}</strong></div>
      ${columns.map(([status, label]) => `<div class="stat"><span class="muted">${label}</span><strong>${cardsFor(status).length}</strong></div>`).join("")}
    </section>
    <section class="board">
      ${columns.map(([status, label]) => `
        <div class="kanban-column" data-status="${status}">
          <h2>${label}</h2>
          <div class="drop-zone" data-status="${status}">
            ${cardsFor(status).map(renderCard).join("") || `<p class="muted empty-col">Drop cards here</p>`}
          </div>
        </div>
      `).join("")}
    </section>
  `;
  bindEvents();
}

function renderCard(card) {
  const priority = card.meta?.priority || "Medium";
  return `
    <article class="kanban-card" draggable="true" data-id="${card.id}">
      <div class="row space">
        <strong>${escapeHtml(card.title)}</strong>
        <span class="priority ${priorityClass(priority)}">${escapeHtml(priority)}</span>
      </div>
      <p>${escapeHtml(card.body || "")}</p>
      <div class="row">
        ${columns.map(([status, label]) => `<button class="ghost" onclick="moveCard(${card.id}, '${status}')">${label}</button>`).join("")}
        <button class="ghost" onclick="editCard(${card.id})">Edit</button>
        <button class="danger" onclick="deleteCard(${card.id})">Delete</button>
      </div>
    </article>
  `;
}

function bindEvents() {
  $("#cardForm").addEventListener("submit", saveCard);
  const cancel = $("#cancelEdit");
  if (cancel) cancel.addEventListener("click", () => { editingId = null; render(); });
  document.querySelectorAll(".kanban-card").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", card.dataset.id);
    });
  });
  document.querySelectorAll(".drop-zone").forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", async (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");
      await moveCard(Number(event.dataTransfer.getData("text/plain")), zone.dataset.status);
    });
  });
}

async function saveCard(event) {
  event.preventDefault();
  const payload = { title: $("#title").value.trim(), body: $("#body").value.trim(), status: "backlog", meta: { priority: $("#priority").value } };
  if (editingId) {
    const old = cards.find((card) => card.id === editingId);
    await api(`/api/items/${editingId}`, { method: "PUT", body: JSON.stringify({ ...old, ...payload, status: old.status, id: editingId }) });
    editingId = null;
  } else {
    await api("/api/items", { method: "POST", body: JSON.stringify(payload) });
  }
  await loadCards();
}

function editCard(id) {
  editingId = id;
  render();
}

async function moveCard(id, status) {
  const card = cards.find((item) => item.id === id);
  if (!card) return;
  await api(`/api/items/${id}`, {
    method: "PUT",
    body: JSON.stringify({ ...card, status }),
  });
  await loadCards();
}

async function deleteCard(id) {
  if (!confirm("Delete this card?")) return;
  await api(`/api/items/${id}`, { method: "DELETE" });
  await loadCards();
}

async function loadCards() {
  cards = await api("/api/items");
  render();
}

document.body.innerHTML = `
  <main class="kanban-app">
    <header class="top">
      <div>
        <h1>${escapeHtml(APP.name)}</h1>
        <p class="muted">${escapeHtml(APP.desc)}</p>
      </div>
    </header>
    <div id="app"></div>
  </main>
`;

loadCards();
window.editCard = editCard;
window.moveCard = moveCard;
window.deleteCard = deleteCard;
