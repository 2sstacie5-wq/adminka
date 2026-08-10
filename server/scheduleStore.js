const fs = require("fs");
const path = require("path");
const store = require("./store");

const FILE = path.join(store.DATA_DIR, "schedule.json");

const DEFAULT_SCHEDULE = {
  names: { a: "Маша Т.", b: "Маша І." },
  data: {}, // { "2026-08-10": "A" | "B" | "OFF" }
};

function readSchedule() {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      names: parsed.names || DEFAULT_SCHEDULE.names,
      data: parsed.data || {},
    };
  } catch (e) {
    return DEFAULT_SCHEDULE;
  }
}

function writeSchedule(obj) {
  fs.mkdirSync(store.DATA_DIR, { recursive: true });
  const toSave = {
    names: obj.names || DEFAULT_SCHEDULE.names,
    data: obj.data || {},
  };
  fs.writeFileSync(FILE, JSON.stringify(toSave, null, 2));
  return toSave;
}

module.exports = { readSchedule, writeSchedule };
