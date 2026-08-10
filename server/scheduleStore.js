const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "schedule.json");

const DEFAULT_SCHEDULE = {
  names: { a: "Маша Т.", b: "Маша І." },
  data: {}, // { "2026-08-10": "A" | "B" | "OFF" }
  bonus: {}, // { "2026-08-10": { speed: true, crm: false, ... } }
};

function readSchedule() {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      names: parsed.names || DEFAULT_SCHEDULE.names,
      data: parsed.data || {},
      bonus: parsed.bonus || {},
    };
  } catch (e) {
    return DEFAULT_SCHEDULE;
  }
}

function writeSchedule(obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const toSave = {
    names: obj.names || DEFAULT_SCHEDULE.names,
    data: obj.data || {},
    bonus: obj.bonus || {},
  };
  fs.writeFileSync(FILE, JSON.stringify(toSave, null, 2));
  return toSave;
}

module.exports = { readSchedule, writeSchedule, DATA_DIR };
