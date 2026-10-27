(function () {
  const MONTH_NAMES = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];
  const WEEKDAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];
  const POLL_MS = 7000;
  // Ставка за день: до вересня 2026 включно — 960 грн, з жовтня 2026 — 1000 грн.
  const RATE_OLD = 960;
  const RATE_PER_DAY = 1000;
  const RATE_CHANGE_INDEX = 2026 * 12 + 9; // жовтень 2026
  function rateFor(year, month) { return year * 12 + month >= RATE_CHANGE_INDEX ? RATE_PER_DAY : RATE_OLD; }
  const EDIT_PW_KEY = "adminka_edit_pw";

  const BONUS_CRITERIA = [
    { key: "speed", label: "Швидкість відповіді", weight: 800 },
    { key: "crm", label: "CRM без помилок", weight: 800 },
    { key: "resolution", label: "Швидке вирішення проблеми", weight: 800 },
    { key: "initiative", label: "Заповнення KCrm", weight: 600 },
    { key: "chats", label: "Перевірка чатів викладачів", weight: 500 },
  ];
  const BONUS_TOTAL = BONUS_CRITERIA.reduce((sum, c) => sum + c.weight, 0);

  // Дірект-менеджер: ставка за робочий день + бонус за кожного закритого ліда
  const DIRECT_RATE = 235;
  const LEAD_BONUS = 100;
  const DIRECT_START = 2026 * 12 + 9; // з жовтня 2026
  const MAX_LEADS = 20;
  let activeTab = location.hash === "#direct" ? "direct" : "managers";
  let openLeadKey = null;

  let state = { names: { a: "Маша Т.", b: "Маша І.", c: "Віка" }, data: {}, bonus: {}, direct: { name: "Настя", days: {} } };
  function normDirect(d) { d = d || {}; return { name: d.name || "Настя", days: d.days || {} }; }
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
    state.direct = normDirect(json.direct);
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
        body: JSON.stringify({ names: state.names, data: state.data, bonus: state.bonus, direct: state.direct }),
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
    // Марію (A) прибрано: нові дні їй не призначаються, старі лишаються як були
    if (!cur) next = "B";
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
    const rate = rateFor(year, month);
    const payA = countA * rate;
    const payB = countB * rate;
    const payC = countC * rate;
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
      <nav class="tabs">
        <button class="tab ${activeTab === "managers" ? "active" : ""}" data-tab="managers">Менеджери</button>
        <button class="tab ${activeTab === "direct" ? "active" : ""}" data-tab="direct">Дірект-менеджер · ${escapeHtml(state.direct.name)}</button>
      </nav>
      ${activeTab === "direct" ? directPageHtml() : `
      <h1>Графік роботи менеджерів italica</h1>
      <p class="subtitle">${isEditMode
        ? "Клікай на день, щоб призначити чергування. На призначеному дні з'являється значок € — там можна відмітити виконані критерії та нарахувати бонус."
        : "Це режим перегляду — дані видно всім, але змінювати графік і бонуси може тільки той, хто увійшов з паролем."}
      </p>

      <div class="names-row">
        <input id="nameA" type="hidden" />
        <div class="name-field"><span class="swatch b"></span><input id="nameB" type="text" ${isEditMode ? "" : "readonly"} /></div>
        <div class="name-field"><span class="swatch c"></span><input id="nameC" type="text" ${isEditMode ? "" : "readonly"} /></div>
      </div>

      <div class="legend">
        <span><span class="swatch b"></span> — робочий день</span>
        <span><span class="swatch c"></span> — операційний директор (заміна)</span>
        <span><span class="swatch off"></span> — вихідний / не призначено</span>
        ${isEditMode ? `<span>Клік по дню: порожньо → ${state.names.b} → директор → вихідний → порожньо</span>` : ""}
      </div>

      <div class="months" id="months"></div>

      ${isEditMode ? `<button class="reset-btn" id="resetBtn">Очистити весь графік</button>` : ""}

      <p class="instructions">
        Оклад — ${RATE_PER_DAY} грн/робочий день (до вересня 2026 включно — ${RATE_OLD} грн). Бонус (до ${fmtMoney(BONUS_TOTAL)} грн/міс) ділиться на 5 критеріїв і розподіляється по днях залежно від кількості робочих днів у місяці.
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
      `}

      <div id="modalRoot"></div>
      <div id="loginModalRoot"></div>
    `;

    saveStatusEl = document.getElementById("saveStatus");
    app.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
      activeTab = b.dataset.tab;
      history.replaceState(null, "", activeTab === "direct" ? "#direct" : "#");
      openModalKey = null; openLeadKey = null;
      buildApp(); render();
    }));
    if (activeTab === "direct") { wireDirect(); return; }

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
    if (activeTab === "direct") return renderDirectMonths();
    const monthsEl = document.getElementById("months");
    if (!monthsEl) return;
    monthsEl.innerHTML = "";

        const now = new Date();
    const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

    const START_YEAR = 2026;
    const START_MONTH = 7; // серпень — місяць, з якого ведеться графік
    const startIndex = START_YEAR * 12 + START_MONTH;
    const endIndex = now.getFullYear() * 12 + now.getMonth() + 5;
    const totalMonths = endIndex - startIndex + 1;

    for (let i = 0; i < totalMonths; i++) {
      const d = new Date(START_YEAR, START_MONTH + i, 1);
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
      if (totals.countA > 0) totalsEl.appendChild(pillA);
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
    if (!root || activeTab === "direct") return;
    if (!openModalKey) { root.innerHTML = ""; return; }

    const key = openModalKey;
    const [y, m] = key.split("-").map(Number);
    const year = y, month = m - 1;
    const assigned = state.data[key];
    if (assigned !== "A" && assigned !== "B" && assigned !== "C") { openModalKey = null; root.innerHTML = ""; return; }

    const totals = computeMonthTotals(year, month);
    const count = assigned === "A" ? totals.countA : assigned === "B" ? totals.countB : totals.countC;
    const managerName = nameFor(assigned);
    const checks = state.bonus[key] || {};

    const rowsHtml = BONUS_CRITERIA.map((c) => {
      const perDay = count ? c.weight / count : 0;
      const isChecked = !!checks[c.key];
      return `
        <label class="bonus-row ${isEditMode ? "" : "disabled"}">
          <input type="checkbox" data-crit="${c.key}" ${isChecked ? "checked" : ""} ${isEditMode ? "" : "disabled"} />
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

    if (isEditMode) {
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
  }

  function render() {
    renderMonths();
    renderModal();
    renderLeadModal();
    renderLoginModal();
  }

  /* ---------- Дірект-менеджер ---------- */
  function escapeHtml(t) { return String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function directPageHtml() {
    return `
      <h1>Дірект-менеджер italica</h1>
      <p class="subtitle">${isEditMode
        ? "Клікай на день, щоб позначити робочий день. На робочому дні з'являється кружечок із кількістю закритих лідів — натисни на нього й обери кількість зі списку."
        : "Це режим перегляду — дані видно всім, але змінювати графік і ліди може тільки той, хто увійшов з паролем."}</p>
      <div class="names-row">
        <div class="name-field"><span class="swatch d"></span><input id="nameD" type="text" ${isEditMode ? "" : "readonly"} /></div>
      </div>
      <div class="legend">
        <span><span class="swatch d"></span> — робочий день (${DIRECT_RATE} грн)</span>
        <span><span class="lead-dot">2</span> — закриті ліди за день (по ${LEAD_BONUS} грн)</span>
      </div>
      <div class="months" id="months"></div>
      <p class="instructions">
        Ставка — ${DIRECT_RATE} грн за робочий день. Бонус — ${LEAD_BONUS} грн за кожного закритого ліда. Сума за місяць = робочі дні × ${DIRECT_RATE} грн + ліди × ${LEAD_BONUS} грн.
        Дані зберігаються на сервері разом із графіком менеджерів.
      </p>`;
  }

  function wireDirect() {
    const inp = document.getElementById("nameD");
    if (!inp) return;
    inp.value = state.direct.name;
    if (isEditMode) inp.addEventListener("input", () => {
      state.direct.name = inp.value;
      const t = document.querySelector('.tab[data-tab="direct"]');
      if (t) t.textContent = "Дірект-менеджер · " + inp.value;
      scheduleSave(); renderDirectMonths();
    });
  }

  function directTotals(year, month) {
    const n = new Date(year, month + 1, 0).getDate();
    let days = 0, leads = 0;
    for (let d = 1; d <= n; d++) {
      const v = state.direct.days[dateKey(year, month, d)];
      if (v && v.work) days++;
      if (v && v.leads) leads += v.leads;
    }
    return { days, leads, pay: days * DIRECT_RATE, bonus: leads * LEAD_BONUS, total: days * DIRECT_RATE + leads * LEAD_BONUS };
  }

  function renderDirectMonths() {
    const monthsEl = document.getElementById("months");
    if (!monthsEl) return;
    monthsEl.innerHTML = "";
    const now = new Date();
    const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
    const end = now.getFullYear() * 12 + now.getMonth() + 5;
    for (let idx = DIRECT_START; idx <= end; idx++) {
      const year = Math.floor(idx / 12), month = idx % 12;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
      const t = directTotals(year, month);
      const card = document.createElement("div");
      card.className = "month-card";
      card.innerHTML = `<h2 class="month-title">${MONTH_NAMES[month]} ${year}</h2>
        <div class="totals">
          <span class="pill wallet-d" title="Ставка: ${fmtMoney(t.pay)} грн + Ліди: ${fmtMoney(t.bonus)} грн">${escapeHtml(state.direct.name)}: ${t.days} дн. · ${fmtMoney(t.total)} грн</span>
          <span class="pill lead-pill">ліди: ${t.leads} · +${fmtMoney(t.bonus)} грн</span>
        </div>
        <div class="weekdays">${WEEKDAYS.map((w) => `<div>${w}</div>`).join("")}</div>`;
      const grid = document.createElement("div");
      grid.className = "days";
      for (let i = 0; i < firstWeekday; i++) { const e = document.createElement("div"); e.className = "day empty"; grid.appendChild(e); }
      for (let day = 1; day <= daysInMonth; day++) {
        const key = dateKey(year, month, day);
        const v = state.direct.days[key] || {};
        const cell = document.createElement("div");
        cell.className = "day-wrap";
        const btn = document.createElement("div");
        btn.className = "day" + (v.work ? " dw" : "") + (isEditMode ? "" : " readonly") + (key === todayKey ? " today" : "");
        btn.textContent = day;
        btn.addEventListener("click", () => {
          if (!isEditMode) return;
          const cur = state.direct.days[key] || {};
          if (cur.work) { if (cur.leads) state.direct.days[key] = { work: false, leads: cur.leads }; else delete state.direct.days[key]; }
          else state.direct.days[key] = { work: true, leads: cur.leads || 0 };
          scheduleSave(); renderDirectMonths();
        });
        cell.appendChild(btn);
        if (v.work || v.leads) {
          const lb = document.createElement("button");
          lb.type = "button";
          lb.className = "lead-btn" + (v.leads ? " has" : "");
          lb.textContent = v.leads || 0;
          lb.title = isEditMode ? "Скільки лідів закрито цього дня" : "Закриті ліди за день";
          lb.addEventListener("click", (e) => { e.stopPropagation(); openLeadKey = key; renderLeadModal(); });
          cell.appendChild(lb);
        }
        grid.appendChild(cell);
      }
      card.appendChild(grid);
      monthsEl.appendChild(card);
    }
  }

  function renderLeadModal() {
    const root = document.getElementById("modalRoot");
    if (!root || activeTab !== "direct") return;
    if (!openLeadKey) { root.innerHTML = ""; return; }
    const key = openLeadKey;
    const v = state.direct.days[key] || { work: false, leads: 0 };
    const leads = v.leads || 0;
    const opts = Array.from({ length: MAX_LEADS + 1 }, (_, n) => `<option value="${n}" ${n === leads ? "selected" : ""}>${n}</option>`).join("");
    root.innerHTML = `
      <div class="modal-overlay" id="leadOverlay">
        <div class="modal-card">
          <h3>${key} — ${escapeHtml(state.direct.name)}</h3>
          <p class="muted" style="margin-top:-4px;">${v.work ? "Робочий день: " + DIRECT_RATE + " грн." : "День не позначено як робочий."}</p>
          <label class="bonus-row ${isEditMode ? "" : "disabled"}">
            <span class="bonus-row-label">Закритих лідів</span>
            <select id="leadSel" class="lead-select" ${isEditMode ? "" : "disabled"}>${opts}</select>
          </label>
          <div class="modal-total">Бонус за цей день: <strong id="leadSum">+${fmtMoney(leads * LEAD_BONUS)} грн</strong></div>
          <div class="modal-total">Разом за день: <strong id="daySum">${fmtMoney((v.work ? DIRECT_RATE : 0) + leads * LEAD_BONUS)} грн</strong></div>
          <button class="btn-close" id="leadCloseBtn">Закрити</button>
        </div>
      </div>`;
    const close = () => { openLeadKey = null; renderLeadModal(); };
    document.getElementById("leadOverlay").addEventListener("click", (e) => { if (e.target.id === "leadOverlay") close(); });
    document.getElementById("leadCloseBtn").addEventListener("click", close);
    if (isEditMode) document.getElementById("leadSel").addEventListener("change", (e) => {
      const n = Number(e.target.value) || 0;
      const cur = state.direct.days[key] || { work: false };
      if (!cur.work && !n) delete state.direct.days[key]; else state.direct.days[key] = { work: !!cur.work, leads: n };
      scheduleSave(); renderDirectMonths(); renderLeadModal();
    });
  }

  async function poll() {
    if (saveTimer) return;
    try {
      const res = await fetch("/api/schedule");
      const json = await res.json();
      const activeEl = document.activeElement;
      const isTypingName = activeEl && (activeEl.id === "nameA" || activeEl.id === "nameB" || activeEl.id === "nameC");
      state.data = json.data || {};
      state.bonus = json.bonus || {};
      if (!(activeEl && activeEl.id === "nameD")) state.direct = normDirect(json.direct);
      if (!isTypingName) {
        state.names = json.names || state.names;
        if (!state.names.c) state.names.c = "Віка";
      }
      if (openLeadKey && document.activeElement && document.activeElement.id === "leadSel") return;
      renderMonths();
      renderModal();
      renderLeadModal();
      if (!isTypingName) {
        const nameAInput = document.getElementById("nameA");
        const nameBInput = document.getElementById("nameB");
        const nameCInput = document.getElementById("nameC");
        if (nameAInput) nameAInput.value = state.names.a;
        if (nameBInput) nameBInput.value = state.names.b;
        if (nameCInput) nameCInput.value = state.names.c;
      }
    } catch (e) { /* ignore transient errors */ }
  }

  async function boot() {
    await loadSchedule();
    if (editPassword) {
      const ok = await verifyEditPassword(editPassword);
      if (ok) {
        isEditMode = true;
      } else {
        editPassword = "";
        sessionStorage.removeItem(EDIT_PW_KEY);
      }
    }
    buildApp();
    render();
    pollInterval = setInterval(poll, POLL_MS);
  }

  boot();
})();
