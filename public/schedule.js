(function () {
  const MONTH_NAMES = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];
  const WEEKDAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];
  const POLL_MS = 7000;
  const RATE_PER_DAY = 960;

  const BONUS_CRITERIA = [
    { key: "speed", label: "Швидкість відповіді", weight: 800 },
    { key: "crm", label: "CRM без помилок", weight: 800 },
    { key: "resolution", label: "Швидке вирішення проблеми", weight: 800 },
    { key: "initiative", label: "Ініціативність", weight: 600 },
    { key: "chats", label: "Перевірка чатів викладачів", weight: 500 },
  ];
  const BONUS_TOTAL = BONUS_CRITERIA.reduce((sum, c) => sum + c.weight, 0);

  let state = { names: { a: "Маша Т.", b: "Маша І." }, data: {}, bonus: {} };
  let saveTimer = null;
  let saveStatusEl = null;
  let pollInterval = null;
  let openModalKey = null;

  function dateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function fmtMoney(n) {
    return Math.round(n).toLocaleString("uk-UA");
  }

  async function loadSchedule() {
    const res = await fetch("/api/schedule");
    const json = await res.json();
    state.names = json.names || state.names;
    state.data = json.data || {};
    state.bonus = json.bonus || {};
  }

  async function saveSchedule() {
    if (saveStatusEl) saveStatusEl.textContent = "Збереження...";
    try {
      await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: state.names, data: state.data, bonus: state.bonus }),
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

  function computeMonthTotals(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let countA = 0, countB = 0;
    const workDays = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const key = dateKey(year, month, day);
      const assigned = state.data[key];
      if (assigned === "A") countA++;
      if (assigned === "B") countB++;
      if (assigned === "A" || assigned === "B") workDays.push({ key, assigned });
    }
    let bonusA = 0, bonusB = 0;
    for (const { key, assigned } of workDays) {
      const count = assigned === "A" ? countA : countB;
      if (!count) continue;
      const checks = state.bonus[key] || {};
      for (const c of BONUS_CRITERIA) {
        if (checks[c.key]) {
          const val = c.weight / count;
          if (assigned === "A") bonusA += val; else bonusB += val;
        }
      }
    }
    const payA = countA * RATE_PER_DAY;
    const payB = countB * RATE_PER_DAY;
    return { countA, countB, payA, payB, bonusA, bonusB, totalA: payA + bonusA, totalB: payB + bonusB };
  }

  function buildApp() {
    const app = document.getElementById("app");
    app.innerHTML = `
      <div class="topbar">
        <img src="/logo.png" alt="italica" class="logo-img" />
        <span class="save-status" id="saveStatus"></span>
      </div>
      <h1>Графік роботи менеджерів italica</h1>
      <p class="subtitle">Клікай на день, щоб призначити чергування. На призначеному дні з'являється значок € — там можна відмітити виконані критерії та нарахувати бонус (до ${fmtMoney(BONUS_TOTAL)} грн/міс). Графік спільний — зміни бачать усі, хто відкрив цю сторінку.</p>

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
        Оклад — ${RATE_PER_DAY} грн/робочий день. Бонус (до ${fmtMoney(BONUS_TOTAL)} грн/міс) ділиться на 5 критеріїв і розподіляється по днях залежно від кількості робочих днів у місяці.
        Графік зберігається на сервері — усі, хто відкриє це посилання, бачать однакові дані. Сторінка оновлюється кожні кілька секунд.
      </p>

      <div class="rules-box">
        <h3>Основні правила</h3>
        <ul>
          <li>Працюємо з 9:00 до 21:00.</li>
          <li>З 18:00 до 21:00 — чергувальний режим.</li>
        </ul>
      </div>

      <div class="rules-box bonus-legend">
        <h3>Критерії бонусу (максимум ${fmtMoney(BONUS_TOTAL)} грн/міс)</h3>
        <ul>
          ${BONUS_CRITERIA.map((c) => `<li>${c.label} — ${fmtMoney(c.weight)} грн/міс</li>`).join("")}
        </ul>
      </div>

      <div id="modalRoot"></div>
    `;

    saveStatusEl = document.getElementById("saveStatus");

    const nameAInput = document.getElementById("nameA");
    const nameBInput = document.getElementById("nameB");
    nameAInput.value = state.names.a;
    nameBInput.value = state.names.b;
    nameAInput.addEventListener("input", () => { state.names.a = nameAInput.value; scheduleSave(); renderMonths(); });
    nameBInput.addEventListener("input", () => { state.names.b = nameBInput.value; scheduleSave(); renderMonths(); });

    document.getElementById("resetBtn").addEventListener("click", () => {
      if (confirm("Точно очистити весь графік і всі бонуси? Це вплине на всіх, хто ним користується.")) {
        state.data = {};
        state.bonus = {};
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

      const totals = computeMonthTotals(year, month);

      const card = document.createElement("div");
      card.className = "month-card";

      const title = document.createElement("h2");
      title.className = "month-title";
      title.textContent = `${MONTH_NAMES[month]} ${year}`;
      card.appendChild(title);

      const totalsEl = document.createElement("div");
      totalsEl.className = "totals";
      const pillA = document.createElement("span");
      pillA.className = "pill wallet";
      pillA.title = `Оклад: ${fmtMoney(totals.payA)} грн + Бонус: ${fmtMoney(totals.bonusA)} грн`;
      pillA.textContent = `${state.names.a}: ${totals.countA} дн. · ${fmtMoney(totals.totalA)} грн`;
      const pillB = document.createElement("span");
      pillB.className = "pill wallet";
      pillB.title = `Оклад: ${fmtMoney(totals.payB)} грн + Бонус: ${fmtMoney(totals.bonusB)} грн`;
      pillB.textContent = `${state.names.b}: ${totals.countB} дн. · ${fmtMoney(totals.totalB)} грн`;
      totalsEl.appendChild(pillA);
      totalsEl.appendChild(pillB);
      card.appendChild(totalsEl);

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
        cell.className = "day-wrap";

        const dayBtn = document.createElement("div");
        dayBtn.className = "day";
        const st = state.data[key];
        if (st === "A") dayBtn.classList.add("a");
        else if (st === "B") dayBtn.classList.add("b");
        else if (st === "OFF") dayBtn.classList.add("off");
        if (key === todayKey) dayBtn.classList.add("today");
        dayBtn.textContent = day;
        dayBtn.addEventListener("click", () => cycleState(key));
        cell.appendChild(dayBtn);

        if (st === "A" || st === "B") {
          const checks = state.bonus[key] || {};
          const checkedCount = BONUS_CRITERIA.filter((c) => checks[c.key]).length;
          const bonusBtn = document.createElement("button");
          bonusBtn.className = "bonus-btn" + (checkedCount === BONUS_CRITERIA.length ? " full" : checkedCount > 0 ? " partial" : "");
          bonusBtn.type = "button";
          bonusBtn.title = "Позначити критерії бонусу за цей день";
          bonusBtn.textContent = "€";
          bonusBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            openModalKey = key;
            renderModal();
          });
          cell.appendChild(bonusBtn);
        }

        daysGrid.appendChild(cell);
      }
      card.appendChild(daysGrid);

      monthsEl.appendChild(card);
    }
  }

  function renderModal() {
    const root = document.getElementById("modalRoot");
    if (!root) return;
    if (!openModalKey) { root.innerHTML = ""; return; }

    const key = openModalKey;
    const [y, m] = key.split("-").map(Number);
    const year = y, month = m - 1;
    const assigned = state.data[key];
    if (assigned !== "A" && assigned !== "B") { openModalKey = null; root.innerHTML = ""; return; }

    const totals = computeMonthTotals(year, month);
    const count = assigned === "A" ? totals.countA : totals.countB;
    const managerName = assigned === "A" ? state.names.a : state.names.b;
    const checks = state.bonus[key] || {};

    const rowsHtml = BONUS_CRITERIA.map((c) => {
      const perDay = count ? c.weight / count : 0;
      const isChecked = !!checks[c.key];
      return `
        <label class="bonus-row">
          <input type="checkbox" data-crit="${c.key}" ${isChecked ? "checked" : ""} />
          <span class="bonus-row-label">${c.label}</span>
          <span class="bonus-row-value">+${fmtMoney(perDay)} грн</span>
        </label>
      `;
    }).join("");

    const dayEarned = BONUS_CRITERIA.reduce((sum, c) => {
      if (checks[c.key] && count) return sum + c.weight / count;
      return sum;
    }, 0);

    root.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal-card">
          <h3>${key} — ${managerName}</h3>
          <p class="muted" style="margin-top:-4px;">Бонус за день ділиться на ${count || "?"} робочих дн. цього місяця для ${managerName}.</p>
          ${rowsHtml}
          <div class="modal-total">Разом за цей день: <strong>+${fmtMoney(dayEarned)} грн</strong></div>
          <button class="btn-close" id="modalCloseBtn">Закрити</button>
        </div>
      </div>
    `;

    document.getElementById("modalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "modalOverlay") { openModalKey = null; renderModal(); }
    });
    document.getElementById("modalCloseBtn").addEventListener("click", () => { openModalKey = null; renderModal(); });

    root.querySelectorAll('input[type="checkbox"][data-crit]').forEach((el) => {
      el.addEventListener("change", () => {
        if (!state.bonus[key]) state.bonus[key] = {};
        state.bonus[key][el.dataset.crit] = el.checked;
        scheduleSave();
        renderMonths();
        renderModal();
      });
    });
  }

  function render() {
    renderMonths();
    renderModal();
  }

  async function poll() {
    if (saveTimer) return;
    try {
      const res = await fetch("/api/schedule");
      const json = await res.json();
      const activeEl = document.activeElement;
      const isTypingName = activeEl && (activeEl.id === "nameA" || activeEl.id === "nameB");
      state.data = json.data || {};
      state.bonus = json.bonus || {};
      if (!isTypingName) state.names = json.names || state.names;
      renderMonths();
      renderModal();
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
