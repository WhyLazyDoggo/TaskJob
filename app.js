const STATUS_LABELS = {
  todo: "Chưa làm",
  checking: "Đang kiểm",
  done: "Hoàn tất",
};

const PRIORITY_LABELS = {
  Low: "Thấp",
  Medium: "Trung bình",
  High: "Cao",
};

const STORAGE_THEME_KEY = "taskjob-theme";
const STORAGE_DRAFT_KEY = "taskjob-draft-data";

let tasks = [];
let seq = 1;
let currentFilter = "all";
let draggedRow = null;
let toastTimer = null;

const els = {
  form: document.getElementById("task-form"),
  title: document.getElementById("task-title"),
  priority: document.getElementById("task-priority"),
  deadline: document.getElementById("task-deadline"),
  search: document.getElementById("task-search"),
  table: document.getElementById("task-table"),
  filterButtons: document.querySelectorAll("[data-filter]"),
  themeToggle: document.getElementById("theme-toggle"),
  exportData: document.getElementById("export-data"),
  downloadData: document.getElementById("download-data"),
  importFile: document.getElementById("import-file"),
  exportPanel: document.getElementById("export-panel"),
  exportOutput: document.getElementById("export-output"),
  closeExport: document.getElementById("close-export"),
  toast: document.getElementById("toast"),
  saveState: document.getElementById("save-state"),
  dataSource: document.getElementById("data-source"),
  total: document.getElementById("st-total"),
  todo: document.getElementById("st-todo"),
  checking: document.getElementById("st-checking"),
  done: document.getElementById("st-done"),
  progressLabel: document.getElementById("progress-label"),
  progressBar: document.getElementById("progress-bar"),
};

init();

async function init() {
  applySavedTheme();
  bindEvents();
  await loadInitialData();
  render();
}

function bindEvents() {
  els.form.addEventListener("submit", addTask);
  els.search.addEventListener("input", render);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.exportData.addEventListener("click", exportData);
  els.downloadData.addEventListener("click", downloadData);
  els.importFile.addEventListener("change", importDataFile);
  els.closeExport.addEventListener("click", () => {
    els.exportPanel.hidden = true;
  });

  els.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      els.filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });

  els.table.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = Number(button.dataset.id);
    const action = button.dataset.action;

    if (action === "delete") {
      deleteTask(id);
      return;
    }

    if (["todo", "checking", "done"].includes(action)) {
      setStatus(id, action);
    }
  });

  els.table.addEventListener("dragover", handleDragOver);
  els.table.addEventListener("drop", commitDragOrder);
}

async function loadInitialData() {
  try {
    const response = await fetch("./data.txt", { cache: "no-store" });
    if (!response.ok) throw new Error(`Không đọc được data.txt (${response.status})`);

    const text = await response.text();
    tasks = normalizeTasks(parseDataText(text));
    syncSequence();
    setDataSource("Nguồn: data.txt");
    setSaveState("Đã tải data.txt", "ok");
  } catch (error) {
    const draft = localStorage.getItem(STORAGE_DRAFT_KEY);
    if (draft) {
      tasks = normalizeTasks(parseDataText(draft));
      syncSequence();
      setDataSource("Nguồn: bản lưu trình duyệt");
      setSaveState("Đang dùng bản lưu cục bộ", "warn");
      showToast("Không tải được data.txt, đã dùng bản lưu cục bộ.");
      return;
    }

    tasks = [];
    syncSequence();
    setDataSource("Nguồn: chưa có dữ liệu");
    setSaveState("Chưa tải được data.txt", "warn");
    showToast("Không tải được data.txt. Hãy chạy bằng server nội bộ hoặc nhập file data.");
  }
}

function addTask(event) {
  event.preventDefault();

  const title = els.title.value.trim();
  if (!title) {
    els.title.focus();
    showToast("Nhập tên task trước khi thêm.");
    return;
  }

  const id = getNextId();
  tasks.push({
    id,
    code: formatCode(id),
    title,
    priority: els.priority.value,
    deadline: els.deadline.value,
    status: "todo",
    created: new Date().toLocaleString("vi-VN", { hour12: false }),
  });

  els.title.value = "";
  els.deadline.value = "";
  syncSequence();
  markDirty("Đã thêm task mới");
  render();
}

function setStatus(id, status) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  task.status = status;
  markDirty("Đã cập nhật trạng thái");
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((item) => item.id !== id);
  markDirty("Đã xóa task");
  render();
}

function render() {
  const filteredTasks = getFilteredTasks();
  const canDrag = canReorder();

  els.table.innerHTML = "";

  if (!filteredTasks.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="empty-row" colspan="6">${tasks.length ? "Không có task phù hợp." : "Chưa có task nào."}</td>`;
    els.table.appendChild(tr);
  } else {
    filteredTasks.forEach((task) => {
      const tr = document.createElement("tr");
      tr.dataset.id = task.id;
      tr.draggable = canDrag;
      bindRowDrag(tr);
      tr.innerHTML = buildRowHtml(task, canDrag);
      els.table.appendChild(tr);
    });
  }

  renderStats();
}

function buildRowHtml(task, canDrag) {
  const statusClass = normalizeStatus(task.status);
  const priorityClass = normalizePriority(task.priority).toLowerCase();
  const deadline = task.deadline ? `<span>Hạn: ${escapeHtml(formatDate(task.deadline))}</span>` : "";

  return `
    <td class="drag-cell">
      <button class="handle" type="button" title="Kéo để đổi vị trí" aria-label="Kéo để đổi vị trí" ${canDrag ? "" : "disabled"}>☰</button>
    </td>
    <td class="task-cell" data-label="Tasks">
      <div class="task-card ${statusClass}">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">
          <span>${escapeHtml(task.created || "")}</span>
          ${deadline}
        </div>
      </div>
    </td>
    <td data-label="Code"><strong>${escapeHtml(task.code)}</strong></td>
    <td data-label="Priority"><span class="pill priority-${priorityClass}">${escapeHtml(PRIORITY_LABELS[task.priority] || task.priority)}</span></td>
    <td data-label="Status"><span class="pill status-${statusClass}">${escapeHtml(STATUS_LABELS[statusClass])}</span></td>
    <td class="actions-cell" data-label="Actions">
      <div class="row-actions">
        <button class="row-button" type="button" data-action="todo" data-id="${task.id}" title="Đưa về chưa làm" aria-label="Đưa về chưa làm">↺</button>
        <button class="row-button" type="button" data-action="checking" data-id="${task.id}" title="Đang kiểm" aria-label="Đang kiểm">✓</button>
        <button class="row-button" type="button" data-action="done" data-id="${task.id}" title="Hoàn tất" aria-label="Hoàn tất">✔</button>
        <button class="row-button delete" type="button" data-action="delete" data-id="${task.id}" title="Xóa" aria-label="Xóa">×</button>
      </div>
    </td>
  `;
}

function renderStats() {
  const total = tasks.length;
  const todo = tasks.filter((task) => task.status === "todo").length;
  const checking = tasks.filter((task) => task.status === "checking").length;
  const done = tasks.filter((task) => task.status === "done").length;
  const progress = total ? Math.round((done / total) * 100) : 0;

  els.total.textContent = total;
  els.todo.textContent = todo;
  els.checking.textContent = checking;
  els.done.textContent = done;
  els.progressLabel.textContent = `${progress}%`;
  els.progressBar.style.width = `${progress}%`;
}

function getFilteredTasks() {
  const query = els.search.value.trim().toLowerCase();

  return tasks.filter((task) => {
    const matchesQuery = !query
      || task.title.toLowerCase().includes(query)
      || task.code.toLowerCase().includes(query);
    const matchesFilter = currentFilter === "all" || task.status === currentFilter;
    return matchesQuery && matchesFilter;
  });
}

function canReorder() {
  return currentFilter === "all" && els.search.value.trim() === "";
}

function bindRowDrag(tr) {
  tr.addEventListener("dragstart", () => {
    if (!canReorder()) return;
    draggedRow = tr;
    tr.classList.add("dragging");
  });

  tr.addEventListener("dragend", () => {
    tr.classList.remove("dragging");
    commitDragOrder();
  });
}

function handleDragOver(event) {
  if (!draggedRow || !canReorder()) return;

  event.preventDefault();
  const after = [...els.table.querySelectorAll("tr:not(.dragging)")].find((row) => {
    const box = row.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2;
  });

  if (after) {
    els.table.insertBefore(draggedRow, after);
  } else {
    els.table.appendChild(draggedRow);
  }
}

function commitDragOrder() {
  if (!draggedRow || !canReorder()) return;

  const ids = [...els.table.querySelectorAll("tr[data-id]")].map((row) => Number(row.dataset.id));
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  tasks = ids.map((id) => taskMap.get(id)).filter(Boolean);
  draggedRow = null;
  markDirty("Đã cập nhật thứ tự task");
  renderStats();
}

async function exportData() {
  const data = buildDataText();
  els.exportOutput.value = data;
  els.exportPanel.hidden = false;
  els.exportOutput.focus();
  els.exportOutput.select();

  try {
    await navigator.clipboard.writeText(data);
    showToast("Đã copy nội dung data.txt.");
  } catch (error) {
    document.execCommand("copy");
    showToast("Đã mở nội dung data.txt để copy.");
  }
}

function downloadData() {
  const blob = new Blob([buildDataText()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "data.txt";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Đã tạo file data.txt.");
}

async function importDataFile(event) {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const text = await file.text();
    tasks = normalizeTasks(parseDataText(text));
    syncSequence();
    markDirty("Đã nhập data mới");
    setDataSource(`Nguồn: ${file.name}`);
    render();
    showToast("Đã nhập data thành công.");
  } catch (error) {
    showToast("File data không hợp lệ.");
  } finally {
    event.target.value = "";
  }
}

function buildDataText() {
  return `${JSON.stringify(tasks, null, 2)}\n`;
}

function parseDataText(text) {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];

  const parsed = JSON.parse(clean);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.tasks)) return parsed.tasks;

  throw new Error("Data phải là mảng task hoặc object có trường tasks.");
}

function normalizeTasks(input) {
  const usedIds = new Set();

  return input.map((item, index) => {
    const id = normalizeId(item.id, index + 1, usedIds);
    const priority = normalizePriority(item.priority);
    const status = normalizeStatus(item.status);

    return {
      id,
      code: String(item.code || formatCode(id)),
      title: String(item.title || "Task chưa đặt tên"),
      priority,
      deadline: String(item.deadline || ""),
      status,
      created: String(item.created || new Date().toLocaleString("vi-VN", { hour12: false })),
    };
  });
}

function normalizeId(value, fallback, usedIds) {
  let id = Number(value);
  if (!Number.isInteger(id) || id <= 0 || usedIds.has(id)) {
    id = fallback;
    while (usedIds.has(id)) id += 1;
  }
  usedIds.add(id);
  return id;
}

function normalizePriority(value) {
  return ["Low", "Medium", "High"].includes(value) ? value : "Low";
}

function normalizeStatus(value) {
  return ["todo", "checking", "done"].includes(value) ? value : "todo";
}

function syncSequence() {
  seq = tasks.reduce((max, task) => Math.max(max, task.id), 0) + 1;
}

function getNextId() {
  while (tasks.some((task) => task.id === seq)) {
    seq += 1;
  }
  return seq;
}

function formatCode(id) {
  return `TASK${String(id).padStart(3, "0")}`;
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("vi-VN");
}

function markDirty(message) {
  localStorage.setItem(STORAGE_DRAFT_KEY, buildDataText());
  setSaveState("Có thay đổi cần xuất data.txt", "warn");
  showToast(message);
}

function setSaveState(text, type) {
  els.saveState.textContent = text;
  els.saveState.classList.toggle("is-ok", type === "ok");
  els.saveState.classList.toggle("is-warn", type === "warn");
}

function setDataSource(text) {
  els.dataSource.textContent = text;
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  localStorage.setItem(STORAGE_THEME_KEY, document.body.classList.contains("dark") ? "dark" : "light");
}

function applySavedTheme() {
  const savedTheme = localStorage.getItem(STORAGE_THEME_KEY);
  if (savedTheme === "dark") {
    document.body.classList.add("dark");
  }
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-showing");
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("is-showing");
  }, 2600);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
