(function () {
  const MONTH_NAMES = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];
  const WEEKDAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];
  const POLL_MS = 7000;

  let state = { names: { a: "Маша Т.", b: "Маша І." }, data: {} };
  let saveTimer = null;
  let saveStatusEl = null;
  let pollInterval = null;

  function dateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  async function loadSchedule() {
    const res = await fetch("/api/schedule");
    const json = await res.json();
    state.names = json.names || state.names;
    state.data = json.data || {};
  }

  async function saveSchedule() {
    if (saveStatusEl) saveStatusEl.textContent = "Збереження...";
    try {
      await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: state.names, data: state.data }),
      });
      if (saveStatusEl) saveStatusEl.textContent = "Збережено";
    } catch (e) {
      if (saveStatusEl) saveStatusEl.textContent = "Помилка збереження";
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSchedule, 400);
  }

  function cycleState(key) {
    const cur = state.data[key];
    let next;
    if (!cur) next = "A";
    else if (cur === "A") next = "B";
    else if (cur === "B") next = "OFF";
    else next = null;
    if (next) state.data[key] = next; else delete state.data[key];
    scheduleSave();
    render();
  }

  function buildApp() {
    const app = document.getElementById("app");
    app.innerHTML = `
      <div class="topbar">
        <img src="/logo.png" alt="italica" class="logo-img" />
        <span class="save-status" id="saveStatus"></span>
      </div>
      <h1>Графік роботи менеджерів italica</h1>
      <p class="subtitle">Клікай на день, щоб призначити чергування. Ціль — 15 робочих днів на місяць для кожної. Графік спільний — зміни бачать усі, хто відкрив цю сторінку.</p>

      <div class="names-row">
        <div class="name-field"><span class="swatch a"></span><input id="nameA" type="text" /></div>
        <div class="name-field"><span class="swatch b"></span><input id="nameB" type="text" /></div>
      </div>

      <div class="legend">
        <span><span class="swatch a"></span> — робочий день</span>
        <span><span class="swatch b"></span> — робочий день</span>
        <span><span class="swatch off"></span> — вихідний / не призначено</span>
        <span>Клік по дню: порожньо → перша → друга → вихідний → порожньо</span>
      </div>

      <div class="months" id="months"></div>

      <button class="reset-btn" id="resetBtn">Очистити весь графік</button>

      <p class="instructions">
        Графік зберігається на сервері — усі, хто відкриє це посилання, бачать однакові дані.
        Сторінка автоматично оновлюється кожні кілька секунд, щоб підхопити зміни інших людей.
        Показуються поточний місяць і 5 наступних.
      </p>

      <div class="rules-box">
        <h3>Основні правила</h3>
        <ul>
          <li>Працюємо з 9:00 до 21:00.</li>
          <li>З 18:00 до 21:00 — чергувальний режим.</li>
        </ul>
      </div>
    `;

    saveStatusEl = document.getElementById("saveStatus");

    const nameAInput = document.getElementById("nameA");
    const nameBInput = document.getElementById("nameB");
    nameAInput.value = state.names.a;
    nameBInput.value = state.names.b;
    nameAInput.addEventListener("input", () => { state.names.a = nameAInput.value; scheduleSave(); renderMonths(); });
    nameBInput.addEventListener("input", () => { state.names.b = nameBInput.value; scheduleSave(); renderMonths(); });

    document.getElementById("resetBtn").addEventListener("click", () => {
      if (confirm("Точно очистити весь графік? Це вплине на всіх, хто ним користується.")) {
        state.data = {};
        scheduleSave();
        renderMonths();
      }
    });
  }

  function renderMonths() {
    const monthsEl = document.getElementById("months");
    if (!monthsEl) return;
    monthsEl.innerHTML = "";

    const now = new Date();
    const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;

      const card = document.createElement("div");
      card.className = "month-card";

      const title = document.createElement("h2");
      title.className = "month-title";
      title.textContent = `${MONTH_NAMES[month]} ${year}`;
      card.appendChild(title);

      let countA = 0, countB = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const key = dateKey(year, month, day);
        if (state.data[key] === "A") countA++;
        if (state.data[key] === "B") countB++;
      }

      const totals = document.createElement("div");
      totals.className = "totals";
      const pillA = document.createElement("span");
      pillA.className = "pill " + (countA === 15 ? "ok" : "warn");
      pillA.textContent = `${state.names.a}: ${countA}/15`;
      const pillB = document.createElement("span");
      pillB.className = "pill " + (countB === 15 ? "ok" : "warn");
      pillB.textContent = `${state.names.b}: ${countB}/15`;
      totals.appendChild(pillA);
      totals.appendChild(pillB);
      card.appendChild(totals);

      const weekdaysRow = document.createElement("div");
      weekdaysRow.className = "weekdays";
      WEEKDAYS.forEach((wd) => {
        const el = document.createElement("div");
        el.textContent = wd;
        weekdaysRow.appendChild(el);
      });
      card.appendChild(weekdaysRow);

      const daysGrid = document.createElement("div");
      daysGrid.className = "days";
      for (let i2 = 0; i2 < firstWeekday; i2++) {
        const empty = document.createElement("div");
        empty.className = "day empty";
        daysGrid.appendChild(empty);
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const key = dateKey(year, month, day);
        const cell = document.createElement("div");
        cell.className = "day";
        const st = state.data[key];
        if (st === "A") cell.classList.add("a");
        else if (st === "B") cell.classList.add("b");
        else if (st === "OFF") cell.classList.add("off");
        if (key === todayKey) cell.classList.add("today");
        cell.textContent = day;
        cell.addEventListener("click", () => cycleState(key));
        daysGrid.appendChild(cell);
      }
      card.appendChild(daysGrid);

      monthsEl.appendChild(card);
    }
  }

  function render() {
    renderMonths();
  }

  async function poll() {
    if (saveTimer) return;
    try {
      const res = await fetch("/api/schedule");
      const json = await res.json();
      const activeEl = document.activeElement;
      const isTypingName = activeEl && (activeEl.id === "nameA" || activeEl.id === "nameB");
      state.data = json.data || {};
      if (!isTypingName) state.names = json.names || state.names;
      renderMonths();
      if (!isTypingName) {
        const nameAInput = document.getElementById("nameA");
        const nameBInput = document.getElementById("nameB");
        if (nameAInput) nameAInput.value = state.names.a;
        if (nameBInput) nameBInput.value = state.names.b;
      }
    } catch (e) { /* ignore transient errors */ }
  }

  async function boot() {
    await loadSchedule();
    buildApp();
    render();
    pollInterval = setInterval(poll, POLL_MS);
  }

  boot();
})();
