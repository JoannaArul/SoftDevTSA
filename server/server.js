import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import multer from "multer";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${randomUUID()}-${file.originalname}`),
});
const upload = multer({ storage });

app.use("/files", express.static(uploadsDir));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const rooms = new Map();

function getRoom(code) {
  const key = (code || "").toUpperCase().trim();
  if (!rooms.has(key)) {
    rooms.set(key, {
      teacher: null,
      students: new Set(),
      pdfUrl: "",
      pdfName: "",
      numPages: 0,
      page: 1,
      transcript: "",
    });
  }
  return rooms.get(key);
}

function broadcastPresence(code) {
  const room = getRoom(code);
  const payload = JSON.stringify({ type: "presence", count: room.students.size });
  if (room.teacher && room.teacher.readyState === 1) room.teacher.send(payload);
}

function broadcastToStudents(code, msgObj) {
  const room = getRoom(code);
  const payload = JSON.stringify(msgObj);
  for (const ws of room.students) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

app.post("/upload", upload.single("pdf"), (req, res) => {
  try {
    const code = (req.query.code || "").toUpperCase().trim();
    if (!code) return res.status(400).json({ error: "Missing code" });
    if (!req.file) return res.status(400).json({ error: "Missing file" });

    const room = getRoom(code);

    const url = `http://localhost:5174/files/${encodeURIComponent(req.file.filename)}`;
    room.pdfUrl = url;
    room.pdfName = req.file.originalname;

    const np = Number(req.query.numPages || 0);
    if (Number.isFinite(np) && np > 0) room.numPages = np;

    broadcastToStudents(code, {
      type: "pdf",
      url: room.pdfUrl,
      name: room.pdfName,
      numPages: room.numPages || 0,
    });

    if (room.page && room.numPages) {
      broadcastToStudents(code, { type: "slide", page: room.page, numPages: room.numPages });
    }

    res.json({ url, name: room.pdfName, numPages: room.numPages || 0 });
  } catch {
    res.status(500).json({ error: "Upload failed" });
  }
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const code = (url.searchParams.get("code") || "").toUpperCase().trim();
  const role = (url.searchParams.get("role") || "student").toLowerCase();

  if (!code) {
    ws.close();
    return;
  }

  const room = getRoom(code);

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString("utf8"));
    } catch {
      return;
    }

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
    }
  });

  ws.on("close", () => {
    if (role === "teacher") {
      if (room.teacher === ws) room.teacher = null;
    } else {
      room.students.delete(ws);
      broadcastPresence(code);
    }

    if (!room.teacher && room.students.size === 0) rooms.delete(code);
  });

  if (role === "teacher") {
    if (room.teacher && room.teacher.readyState === 1) {
      try {
        room.teacher.close();
      } catch {}
    }
    room.teacher = ws;
    broadcastPresence(code);
  } else {
    room.students.add(ws);

    ws.send(
      JSON.stringify({
        type: "sync",
        pdf: room.pdfUrl ? { url: room.pdfUrl, name: room.pdfName, numPages: room.numPages } : null,
        slide: { page: room.page || 1, numPages: room.numPages || 0 },
        transcript: room.transcript || "",
      })
    );

    broadcastPresence(code);
  }
});

server.listen(5174, () => {
  console.log("Server on http://localhost:5174");
  console.log("Health: http://localhost:5174/health");
  console.log("WS: ws://localhost:5174/ws");
});
