(function () {
  const MONTH_NAMES = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];
  const WEEKDAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];
  const POLL_MS = 7000;
  const RATE_PER_DAY = 960;
  const EDIT_PW_KEY = "adminka_edit_pw";

  const BONUS_CRITERIA = [
    { key: "speed", label: "Швидкість відповіді", weight: 800 },
    { key: "crm", label: "CRM без помилок", weight: 800 },
    { key: "resolution", label: "Швидке вирішення проблеми", weight: 800 },
    { key: "initiative", label: "Пунктуальність", weight: 600 },
    { key: "chats", label: "Перевірка чатів викладачів", weight: 500 },
  ];
  const BONUS_TOTAL = BONUS_CRITERIA.reduce((sum, c) => sum + c.weight, 0);

  let state = { names: { a: "Маша Т.", b: "Маша І.", c: "Віка" }, data: {}, bonus: {} };
  let saveTimer = null;
  let saveStatusEl = null;
  let pollInterval = null;
  let openModalKey = null;
  let editPassword = sessionStorage.getItem(EDIT_PW_KEY) || "";
  let isEditMode = false;
  let showLoginModal = false;
  let loginError = "";

  function dateKey(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function fmtMoney(n) {
    return Math.round(n).toLocaleString("uk-UA");
  }

  function nameFor(assigned) {
    if (assigned === "A") return state.names.a;
    if (assigned === "B") return state.names.b;
    if (assigned === "C") return state.names.c;
    return "";
  }

  async function loadSchedule() {
    const res = await fetch("/api/schedule");
    const json = await res.json();
    state.names = json.names || state.names;
    if (!state.names.c) state.names.c = "Віка";
    state.data = json.data || {};
    state.bonus = json.bonus || {};
  }

  async function verifyEditPassword(pw) {
    try {
      const res = await fetch("/api/verify-edit-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async function saveSchedule() {
    if (saveStatusEl) saveStatusEl.textContent = "Збереження...";
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-edit-password": editPassword },
        body: JSON.stringify({ names: state.names, data: state.data, bonus: state.bonus }),
      });
      if (res.status === 401) {
        isEditMode = false;
        editPassword = "";
        sessionStorage.removeItem(EDIT_PW_KEY);
        if (saveStatusEl) saveStatusEl.textContent = "Сесія редагування закінчилась";
        alert("Сесія редагування закінчилась. Увійди ще раз, щоб продовжити редагувати.");
        buildApp();
        render();
        return;
      }
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
    if (!isEditMode) return;
    const cur = state.data[key];
    let next;
    if (!cur) next = "A";
    else if (cur === "A") next = "B";
    else if (cur === "B") next = "C";
    else if (cur === "C") next = "OFF";
    else next = null;
    if (next) state.data[key] = next; else delete state.data[key];
    scheduleSave();
    render();
  }

  function computeMonthTotals(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let countA = 0, countB = 0, countC = 0;
    const workDays = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const key = dateKey(year, month, day);
      const assigned = state.data[key];
      if (assigned === "A") countA++;
      if (assigned === "B") countB++;
      if (assigned === "C") countC++;
      if (assigned === "A" || assigned === "B" || assigned === "C") workDays.push({ key, assigned });
    }
    let bonusA = 0, bonusB = 0, bonusC = 0;
    for (const { key, assigned } of workDays) {
      const count = assigned === "A" ? countA : assigned === "B" ? countB : countC;
      if (!count) continue;
      const checks = state.bonus[key] || {};
      for (const c of BONUS_CRITERIA) {
        if (checks[c.key]) {
          const val = c.weight / count;
          if (assigned === "A") bonusA += val;
          else if (assigned === "B") bonusB += val;
          else bonusC += val;
        }
      }
    }
    const payA = countA * RATE_PER_DAY;
    const payB = countB * RATE_PER_DAY;
    const payC = countC * RATE_PER_DAY;
    return {
      countA, countB, countC,
      payA, payB, payC,
      bonusA, bonusB, bonusC,
      totalA: payA + bonusA, totalB: payB + bonusB, totalC: payC + bonusC,
    };
  }

  function buildApp() {
    const app = document.getElementById("app");
    const lockHtml = isEditMode
      ? `<button class="lock-btn edit" id="lockBtn">🔓 Режим редагування · вийти</button>`
      : `<button class="lock-btn" id="lockBtn">🔒 Перегляд · увійти для редагування</button>`;

    app.innerHTML = `
      <div class="topbar">
        <img src="/logo.png" alt="italica" class="logo-img" />
        <span class="save-status" id="saveStatus"></span>
        ${lockHtml}
      </div>
      <h1>Графік роботи менеджерів italica</h1>
      <p class="subtitle">${isEditMode
        ? "Клікай на день, щоб призначити чергування. На призначеному дні з'являється значок € — там можна відмітити виконані критерії та нарахувати бонус."
        : "Це режим перегляду — дані видно всім, але змінювати графік і бонуси може тільки той, хто увійшов з паролем."}
      </p>

      <div class="names-row">
        <div class="name-field"><span class="swatch a"></span><input id="nameA" type="text" ${isEditMode ? "" : "readonly"} /></div>
        <div class="name-field"><span class="swatch b"></span><input id="nameB" type="text" ${isEditMode ? "" : "readonly"} /></div>
        <div class="name-field"><span class="swatch c"></span><input id="nameC" type="text" ${isEditMode ? "" : "readonly"} /></div>
      </div>

      <div class="legend">
        <span><span class="swatch a"></span> — робочий день</span>
        <span><span class="swatch b"></span> — робочий день</span>
        <span><span class="swatch c"></span> — операційний директор (заміна)</span>
        <span><span class="swatch off"></span> — вихідний / не призначено</span>
        ${isEditMode ? `<span>Клік по дню: порожньо → перша → друга → директор → вихідний → порожньо</span>` : ""}
      </div>

      <div class="months" id="months"></div>

      ${isEditMode ? `<button class="reset-btn" id="resetBtn">Очистити весь графік</button>` : ""}

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
      <div id="loginModalRoot"></div>
    `;

    saveStatusEl = document.getElementById("saveStatus");

    document.getElementById("lockBtn").addEventListener("click", () => {
      if (isEditMode) {
        isEditMode = false;
        editPassword = "";
        sessionStorage.removeItem(EDIT_PW_KEY);
        buildApp();
        render();
      } else {
        showLoginModal = true;
        loginError = "";
        renderLoginModal();
      }
    });

    const nameAInput = document.getElementById("nameA");
    const nameBInput = document.getElementById("nameB");
    const nameCInput = document.getElementById("nameC");
    nameAInput.value = state.names.a;
    nameBInput.value = state.names.b;
    nameCInput.value = state.names.c;
    if (isEditMode) {
      nameAInput.addEventListener("input", () => { state.names.a = nameAInput.value; scheduleSave(); renderMonths(); });
      nameBInput.addEventListener("input", () => { state.names.b = nameBInput.value; scheduleSave(); renderMonths(); });
      nameCInput.addEventListener("input", () => { state.names.c = nameCInput.value; scheduleSave(); renderMonths(); });
    }

    const resetBtn = document.getElementById("resetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (confirm("Точно очистити весь графік і всі бонуси? Це вплине на всіх, хто ним користується.")) {
          state.data = {};
          state.bonus = {};
          scheduleSave();
          renderMonths();
        }
      });
    }
  }

  function renderLoginModal() {
    const root = document.getElementById("loginModalRoot");
    if (!root) return;
    if (!showLoginModal) { root.innerHTML = ""; return; }

    root.innerHTML = `
      <div class="modal-overlay" id="loginOverlay">
        <div class="modal-card">
          <h3>Увійти для редагування</h3>
          ${loginError ? `<p style="color:#c94c4c;font-size:13px;">${loginError}</p>` : ""}
          <input type="password" id="editPwInput" placeholder="Пароль" class="pw-input" />
          <button class="btn-close" id="loginSubmitBtn" style="background:var(--orange);color:#fff;border:none;">Увійти</button>
          <button class="btn-close" id="loginCancelBtn">Скасувати</button>
        </div>
      </div>
    `;
    const input = document.getElementById("editPwInput");
    input.focus();
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submitLogin(); });
    document.getElementById("loginSubmitBtn").addEventListener("click", submitLogin);
    document.getElementById("loginCancelBtn").addEventListener("click", () => { showLoginModal = false; renderLoginModal(); });
    document.getElementById("loginOverlay").addEventListener("click", (e) => {
      if (e.target.id === "loginOverlay") { showLoginModal = false; renderLoginModal(); }
    });

    async function submitLogin() {
      const pw = input.value;
      const ok = await verifyEditPassword(pw);
      if (ok) {
        editPassword = pw;
        sessionStorage.setItem(EDIT_PW_KEY, pw);
        isEditMode = true;
        showLoginModal = false;
        buildApp();
        render();
      } else {
        loginError = "Невірний пароль.";
        renderLoginModal();
      }
    }
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
      if (totals.countC > 0) {
        const pillC = document.createElement("span");
        pillC.className = "pill wallet-c";
        pillC.title = `Оклад: ${fmtMoney(totals.payC)} грн + Бонус: ${fmtMoney(totals.bonusC)} грн`;
        pillC.textContent = `${state.names.c}: ${totals.countC} дн. · ${fmtMoney(totals.totalC)} грн`;
        totalsEl.appendChild(pillC);
      }
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
        if (!isEditMode) dayBtn.classList.add("readonly");
        const st = state.data[key];
        if (st === "A") dayBtn.classList.add("a");
        else if (st === "B") dayBtn.classList.add("b");
        else if (st === "C") dayBtn.classList.add("c");
        else if (st === "OFF") dayBtn.classList.add("off");
        if (key === todayKey) dayBtn.classList.add("today");
        dayBtn.textContent = day;
        dayBtn.addEventListener("click", () => cycleState(key));
        cell.appendChild(dayBtn);

        if (st === "A" || st === "B" || st === "C") {
          const checks = state.bonus[key] || {};
          const checkedCount = BONUS_CRITERIA.filter((c) => checks[c.key]).length;
          const bonusBtn = document.createElement("button");
          bonusBtn.className = "bonus-btn" + (checkedCount === BONUS_CRITERIA.length ? " full" : checkedCount > 0 ? " partial" : "");
          bonusBtn.type = "button";
          bonusBtn.title = isEditMode ? "Позначити критерії бонусу за цей день" : "Переглянути критерії бонусу за цей день";
          bonusBtn.textContent = "€";
          bonusBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            openModalKey = key;
            renderModal();
          });
