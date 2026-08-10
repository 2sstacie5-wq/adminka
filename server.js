const path = require("path");
const express = require("express");
const scheduleStore = require("./server/scheduleStore");

const app = express();
const PORT = process.env.PORT || 3000;
const EDIT_PASSWORD = process.env.EDIT_PASSWORD || "italica2026";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function requireEditPassword(req, res, next) {
  const pw = req.header("x-edit-password");
  if (pw !== EDIT_PASSWORD) return res.status(401).json({ error: "Password errata" });
  next();
}

app.get("/api/schedule", (req, res) => {
  res.json(scheduleStore.readSchedule());
});

app.post("/api/verify-edit-password", (req, res) => {
  const { password } = req.body || {};
  if (password === EDIT_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ ok: false });
});

app.post("/api/schedule", requireEditPassword, (req, res) => {
  const { names, data, bonus } = req.body || {};
  if (!data) return res.status(400).json({ error: "Dati mancanti" });
  const saved = scheduleStore.writeSchedule({ names, data, bonus });
  res.json({ ok: true, saved });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Adminka in ascolto su http://localhost:${PORT}`);
});
