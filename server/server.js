// server.js
import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";

const app = express();
app.set("trust proxy", 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, randomUUID() + "-" + file.originalname),
});
const upload = multer({ storage });

function getBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "http").toString().split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim();
  return host ? proto + "://" + host : "http://localhost:5174";
}

app.use("/files", express.static(uploadsDir));
app.get("/health", (_req, res) => res.json({ ok: true }));

const rooms = new Map();

function getRoom(code) {
  const key = (code || "").toUpperCase().trim();
  if (!rooms.has(key)) {
    rooms.set(key, {
      teacher: null,
      students: new Map(),
      pdfUrl: "",
      pdfName: "",
      numPages: 0,
      page: 1,
      transcript: "",
      // When true, student close events are from an intentional session end
      // and should NOT trigger student_left / broadcastPresence back to teacher
      ending: false,
    });
  }
  return rooms.get(key);
}

function getParticipantList(room) {
  return Array.from(room.students.values()).map((s) => ({ id: s.id, name: s.name }));
}

function sendToTeacher(room, obj) {
  if (room.teacher && room.teacher.readyState === 1) {
    try { room.teacher.send(JSON.stringify(obj)); } catch (_) {}
  }
}

function broadcastPresence(code) {
  const room = getRoom(code);
  sendToTeacher(room, {
    type: "presence",
    count: room.students.size,
    participants: getParticipantList(room),
  });
}

function broadcastToStudents(code, msgObj) {
  const room = getRoom(code);
  const payload = JSON.stringify(msgObj);
  for (const student of room.students.values()) {
    if (student.ws.readyState === 1) {
      try { student.ws.send(payload); } catch (_) {}
    }
  }
}

function endRoomSession(code) {
  const room = getRoom(code);

  const snapshot = Array.from(room.students.values());
  room.students.clear();

  // Just close each socket. This fires ws.onclose on the student side
  // which runs the exact same code as clicking the Leave button.
  for (const student of snapshot) {
    try { student.ws.close(); } catch (_) {}
  }

  room.pdfUrl = "";
  room.pdfName = "";
  room.numPages = 0;
  room.page = 1;
  room.transcript = "";

  sendToTeacher(room, { type: "session_ended" });
}

app.post("/upload", upload.single("pdf"), (req, res) => {
  try {
    const code = (req.query.code || "").toUpperCase().trim();
    if (!code) return res.status(400).json({ error: "Missing code" });
    if (!req.file) return res.status(400).json({ error: "Missing file" });

    const room = getRoom(code);
    const baseUrl = getBaseUrl(req);
    const url = baseUrl + "/files/" + encodeURIComponent(req.file.filename);

    room.pdfUrl = url;
    room.pdfName = req.file.originalname;

    const np = Number(req.query.numPages || 0);
    if (Number.isFinite(np) && np > 0) room.numPages = np;

    broadcastToStudents(code, { type: "pdf", url: room.pdfUrl, name: room.pdfName, numPages: room.numPages || 0 });
    if (room.page && room.numPages) {
      broadcastToStudents(code, { type: "slide", page: room.page, numPages: room.numPages });
    }

    res.json({ url, name: room.pdfName, numPages: room.numPages || 0 });
  } catch (_) {
    res.status(500).json({ error: "Upload failed" });
  }
});

wss.on("connection", (ws, req) => {
  const u = new URL(req.url, "http://localhost");
  const code = (u.searchParams.get("code") || "").toUpperCase().trim();
  const role = (u.searchParams.get("role") || "student").toLowerCase();
  const name = (u.searchParams.get("name") || "Student").trim().slice(0, 60);

  if (!code) { ws.close(); return; }

  const room = getRoom(code);

  ws.on("message", (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString("utf8")); } catch (_) { return; }

    if (role === "teacher") {
      if (msg.type === "pdf") {
        room.pdfUrl = msg.url || room.pdfUrl;
        room.pdfName = msg.name || room.pdfName;
        room.numPages = Number(msg.numPages || room.numPages || 0);
        broadcastToStudents(code, { type: "pdf", url: room.pdfUrl, name: room.pdfName, numPages: room.numPages });
        return;
      }
      if (msg.type === "slide") {
        room.page = Number(msg.page || room.page || 1);
        room.numPages = Number(msg.numPages || room.numPages || 0);
        broadcastToStudents(code, { type: "slide", page: room.page, numPages: room.numPages });
        return;
      }
      if (msg.type === "transcript") {
        room.transcript = String(msg.text || "");
        broadcastToStudents(code, { type: "transcript", text: room.transcript });
        return;
      }
      if (msg.type === "kick") {
        const target = room.students.get(msg.id);
        if (target) {
          try {
            if (target.ws.readyState === 1) {
              target.ws.send(JSON.stringify({ type: "kicked" }));
            }
          } catch (_) {}
          try { target.ws.close(); } catch (_) {}
          room.students.delete(msg.id);
          broadcastPresence(code);
        }
        return;
      }
      if (msg.type === "end") {
        endRoomSession(code);
        return;
      }
    }
  });

  ws.on("close", (code_ws, reason) => {
    if (role === "teacher") {
      if (room.teacher === ws) room.teacher = null;
    } else {
      // If room.ending is true, the teacher intentionally ended the session.
      // Don't fire student_left or broadcastPresence — room is already cleared.
      if (room.ending) return;

      let found = false;
      for (const [id, student] of room.students.entries()) {
        if (student.ws === ws) {
          room.students.delete(id);
          sendToTeacher(room, { type: "student_left", id });
          found = true;
          break;
        }
      }
      if (found) broadcastPresence(code);
    }
    if (!room.teacher && room.students.size === 0) rooms.delete(code);
  });

  if (role === "teacher") {
    if (room.teacher && room.teacher.readyState === 1) {
      try { room.teacher.close(); } catch (_) {}
    }
    room.teacher = ws;
    broadcastPresence(code);
  } else {
    const id = randomUUID();
    room.students.set(id, { ws, name, id });

    ws.send(JSON.stringify({
      type: "sync",
      pdf: room.pdfUrl ? { url: room.pdfUrl, name: room.pdfName, numPages: room.numPages } : null,
      slide: { page: room.page || 1, numPages: room.numPages || 0 },
      transcript: room.transcript || "",
    }));

    sendToTeacher(room, { type: "student_joined", id, name });
    broadcastPresence(code);
  }
});

const PORT = process.env.PORT || 5174;
server.listen(PORT, () => console.log("Server running on port " + PORT));
