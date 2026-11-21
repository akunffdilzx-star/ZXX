require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");
const Database = require("better-sqlite3");
const api = require("./routes");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.PUBLIC_URL || false } });
const dbFile = path.resolve(process.env.DATABASE_FILE || "./database/parent-monitor.sqlite");
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
fs.mkdirSync(path.resolve(process.env.UPLOAD_DIR || "./storage/uploads"), { recursive: true });
const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(__dirname, "../database/schema.sql"), "utf8"));
app.set("db", db); app.set("io", io);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: process.env.PUBLIC_URL || true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
app.use(express.static(path.join(__dirname, "../public")));
app.use("/api", api);
app.get("/health", (_req, res) => res.json({ ok: true, service: "ZXZ PARENT MONITOR", time: new Date().toISOString() }));

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));
  try {
    const jwt = require("jsonwebtoken");
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { next(new Error("Invalid token")); }
});
io.on("connection", socket => {
  socket.join(`user:${socket.user.id}`);
  socket.on("device:join", async ({ deviceId, credential } = {}) => {
    const row = db.prepare("SELECT * FROM devices WHERE id=? AND revoked_at IS NULL").get(deviceId);
    if (!row || !require("bcryptjs").compareSync(String(credential || ""), row.device_credential_hash || "")) return;
    socket.join(`device:${deviceId}`);
    db.prepare("UPDATE devices SET status='online',last_seen=? WHERE id=?").run(new Date().toISOString(), deviceId);
    io.to(`user:${row.user_id}`).emit("device:status", { deviceId, status: "online" });
  });
  socket.on("webrtc:signal", ({ deviceId, payload } = {}) => {
    if (typeof deviceId !== "string" || !payload || typeof payload !== "object") return;
    socket.to(`device:${deviceId}`).emit("webrtc:signal", { from: socket.id, payload });
  });
  socket.on("disconnect", () => {});
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => console.log(`ZXZ Parent Monitor listening on ${port}`));
