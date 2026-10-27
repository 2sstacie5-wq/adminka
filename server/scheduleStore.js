const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "schedule.json");

const DEFAULT_SCHEDULE = {
  names: { a: "Маша Т.", b: "Маша І." },
  data: {}, // { "2026-08-10": "A" | "B" | "OFF" }
  bonus: {}, // { "2026-08-10": { speed: true, crm: false, ... } }
};

// Резервна копія в репозиторії: якщо на сервері файлу ще немає (наприклад, після деплою на Render
// без диска), дані підтягуються з seed/schedule.json.
const SEED = path.join(__dirname, "..", "seed", "schedule.json");

function readSchedule() {
  try {
    const raw = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : fs.readFileSync(SEED, "utf8");
    const parsed = JSON.parse(raw);
    return {
      names: parsed.names || DEFAULT_SCHEDULE.names,
      data: parsed.data || {},
      bonus: parsed.bonus || {},
      direct: parsed.direct || { name: "Настя", days: {} },
    };
  } catch (e) {
    return { ...DEFAULT_SCHEDULE, direct: { name: "Настя", days: {} } };
  }
}

function writeSchedule(obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const prev = readSchedule();
  const toSave = {
    names: obj.names || DEFAULT_SCHEDULE.names,
    data: obj.data || {},
    bonus: obj.bonus || {},
    // дірект-менеджер: { name, days: { "2026-10-27": { work: true, leads: 2 } } }
    // якщо старий клієнт не надіслав direct — зберігаємо те, що вже є
    direct: obj.direct || prev.direct || { name: "Настя", days: {} },
  };
  fs.writeFileSync(FILE, JSON.stringify(toSave, null, 2));
  return toSave;
}

module.exports = { readSchedule, writeSchedule, DATA_DIR };
