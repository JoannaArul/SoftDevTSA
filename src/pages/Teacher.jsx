// Teacher.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
import { BACKEND_HTTP, BACKEND_WS } from "../backend";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const COLORS = {
  teal: "#2CB1A6",
  gray: "#494A48",
  beige: "#F5FCEF",
  beigeDark: "#E7F0E3",
  black: "#000000",
  white: "#FFFFFF",
  pageBg: "#EEF3EF",
};

const HC = {
  pageBg: "#0B0F14",
  panelBg: "#121A22",
  headerBg: "#0F1620",
  divider: "#2A3642",
  text: "#FFFFFF",
  text2: "#D7DEE7",
  text3: "#AAB6C2",
  teal: "#2CB1A6",
};

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function uploadPdfToRoom(file, code, numPages) {
  const form = new FormData();
  form.append("pdf", file);
  const res = await fetch(
    `${BACKEND_HTTP}/upload?code=${encodeURIComponent(code)}&numPages=${encodeURIComponent(String(numPages || 0))}`,
    { method: "POST", body: form }
  );
  if (!res.ok) throw new Error("upload failed");
  return res.json();
}

function wsSend(ws, obj) {
  if (!ws || ws.readyState !== 1) return;
  try { ws.send(JSON.stringify(obj)); } catch {}
}

const waitForStableBox = (el, tries = 18) =>
  new Promise((resolve) => {
    const tick = (t) => {
      const w = el?.clientWidth || 0;
      const h = el?.clientHeight || 0;
      if (w > 240 && h > 240) return resolve({ w, h });
      if (t <= 0) return resolve({ w, h });
      requestAnimationFrame(() => tick(t - 1));
    };
    tick(tries);
  });

function GearIcon({ size = 18, color = "rgba(0,0,0,0.70)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function Teacher({ onFullscreenChange }) {
  const navigate = useNavigate();

  const fileInputRef = useRef(null);
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const fsViewportRef = useRef(null);
  const fsCanvasRef = useRef(null);
  const renderIdRef = useRef(0);
  const renderTaskRef = useRef(null);
  const fsRenderTaskRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunkTimerRef = useRef(null);
  const wsRef = useRef(null);
  const isStoppingRef = useRef(false);
  const lastTxRef = useRef(0);

  const [mounted, setMounted] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [isShort, setIsShort] = useState(false);

  const [dragOver, setDragOver] = useState(false);
  const [pdfName, setPdfName] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [rendering, setRendering] = useState(false);

  const [pdfErr, setPdfErr] = useState("");
  const [wsErr, setWsErr] = useState("");

  const [micOn, setMicOn] = useState(false);

  // ✅ Transcript history that NEVER clears when mic toggles
  const finalTranscriptRef = useRef("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [captionStatus, setCaptionStatus] = useState("");

  const [joinCode] = useState(() => makeCode());
  const [copied, setCopied] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [studentCount, setStudentCount] = useState(0);
  const [participants, setParticipants] = useState([]);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(15);
  const [contrastMode, setContrastMode] = useState(false);

  const pdfStateRef = useRef({ pdfDoc: null, pdfUrl: "", pdfName: "", numPages: 0, page: 1 });
  useEffect(() => {
    pdfStateRef.current = { pdfDoc, pdfUrl, pdfName, numPages, page };
  }, [pdfDoc, pdfUrl, pdfName, numPages, page]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const calc = () => {
      setIsShort(window.innerHeight < 760);
      setIsNarrow(window.innerWidth < 1024);
    };
    calc();
    window.addEventListener("resize", calc, { passive: true });
    return () => window.removeEventListener("resize", calc);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e) => { if (e.key === "Escape") closeFullscreen(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  useEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isFullscreen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e) => {
      if (!e.target.closest("[data-settings-modal]") && !e.target.closest("[data-settings-btn]")) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [settingsOpen]);

  const resetTranscript = () => {
    finalTranscriptRef.current = "";
    setFinalTranscript("");
    setInterimTranscript("");
    setCaptionStatus("");
  };

  const leaveTeacherRoom = () => {
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;

    setParticipants([]);
    setStudentCount(0);
    setParticipantsOpen(false);

    setPdfDoc(null);
    setPdfUrl("");
    setPdfName("");
    setNumPages(0);
    setPage(1);
    setPdfErr("");
    setWsErr("");

    stopCaptions();
    resetTranscript();
  };

  useEffect(() => {
    if (!joinCode) return;
    let dead = false;
    const ws = new WebSocket(`${BACKEND_WS}/ws?code=${encodeURIComponent(joinCode)}&role=teacher`);

    ws.onopen = () => {
      if (dead) return;
      wsRef.current = ws;
      setWsErr("");
      const { pdfDoc: doc, pdfUrl: url, pdfName: name, numPages: np, page: pg } = pdfStateRef.current;
      if (doc && url) {
        wsSend(ws, { type: "pdf", url, name: name || "", numPages: np || 0 });
        wsSend(ws, { type: "slide", page: pg, numPages: np });
      } else {
        wsSend(ws, { type: "slide", page: 1, numPages: 0 });
      }
    };

    ws.onmessage = (ev) => {
      if (dead) return;
      try {
        const msg = JSON.parse(ev.data || "{}");

        if (msg.type === "presence") {
          if (typeof msg.count === "number") setStudentCount(msg.count);
          if (Array.isArray(msg.participants)) {
            setParticipants(msg.participants.map((p) => ({
              id: p?.id,
              name: (p?.name || "Student").toString().slice(0, 60),
            })));
          }
        }

        if (msg.type === "student_joined") {
          setParticipants((prev) => {
            if (!msg.id || prev.find((p) => p.id === msg.id)) return prev;
            return [...prev, { id: msg.id, name: (msg.name || "Student").toString().slice(0, 60) }];
          });
        }

        if (msg.type === "student_left") {
          setParticipants((prev) => prev.filter((p) => p.id !== msg.id));
        }

        // ✅ If the room is ended (by you or server), take teacher back to Host page
        if (msg.type === "session_ended") {
          setParticipants([]);
          setStudentCount(0);
          setParticipantsOpen(false);
          try { wsRef.current?.close(); } catch {}
          wsRef.current = null;
          stopCaptions();
          onFullscreenChange?.(false);
          setIsFullscreen(false);
          navigate("/host");
        }
      } catch {}
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
    };

    ws.onerror = () => {
      if (dead) return;
      setWsErr("Session server connection issue.");
    };

    return () => {
      dead = true;
      if (ws.readyState === 1 || ws.readyState === 2) {
        try { ws.close(); } catch {}
      }
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [joinCode, navigate, onFullscreenChange]);

  useEffect(() => {
    setStudentCount(participants.length);
  }, [participants]);

  useEffect(() => {
    if (!pdfDoc) return;
    wsSend(wsRef.current, { type: "slide", page, numPages });
  }, [page, numPages, pdfDoc]);

  const removeParticipant = (participantId) => {
    if (!participantId) return;
    wsSend(wsRef.current, { type: "kick", id: participantId });
    setParticipants((prev) => prev.filter((p) => p.id !== participantId));
  };

  // ✅ End session + navigate teacher back to Host page
  const endSession = () => {
    wsSend(wsRef.current, { type: "end" });
    stopCaptions();
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    setParticipants([]);
    setStudentCount(0);
    setParticipantsOpen(false);
    onFullscreenChange?.(false);
    setIsFullscreen(false);
    navigate("/host");
  };

  const maybeBroadcastTranscript = (text) => {
    const now = Date.now();
    if (now - lastTxRef.current < 250) return;
    lastTxRef.current = now;
    wsSend(wsRef.current, { type: "transcript", text });
  };

  const transcript = useMemo(() => {
    const combined = (finalTranscript + (interimTranscript ? (finalTranscript ? " " : "") + interimTranscript : "")).trim();
    if (combined) return combined;
    if (captionStatus) return captionStatus;
    return pdfDoc
      ? "Turn on your mic to start live captions."
      : "Upload your slides to begin your lesson. Voxia helps students follow along with synchronized slides and real-time captions in the classroom or online.";
  }, [pdfDoc, finalTranscript, interimTranscript, captionStatus]);

  const openPicker = () => fileInputRef.current?.click();

  const acceptFile = async (file) => {
    if (!file) return;
    const ok = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!ok) { setPdfErr("Please upload a PDF file."); return; }

    setPdfErr("");
    setLoadingPdf(true);
    setPdfName(file.name);
    setPdfUrl("");
    setPdfDoc(null);
    setNumPages(0);
    setPage(1);

    try {
      const ab = await file.arrayBuffer();
      const task = pdfjsLib.getDocument({ data: ab });
      const doc = await task.promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setPage(1);

      try {
        const data = await uploadPdfToRoom(file, joinCode, doc.numPages);
        const url = data?.url || "";
        const name = data?.name || file.name;
        if (url) {
          setPdfUrl(url);
          setPdfName(name);
          wsSend(wsRef.current, { type: "pdf", url, name, numPages: doc.numPages });
          wsSend(wsRef.current, { type: "slide", page: 1, numPages: doc.numPages });
        } else {
          setPdfErr("PDF uploaded, but the server didn't return a URL.");
        }
      } catch {
        setPdfErr("PDF opened, but couldn't upload for viewers. Check your backend URL.");
      }
    } catch {
      setPdfErr("That PDF couldn't be opened. Try a different file.");
    } finally {
      setLoadingPdf(false);
    }
  };

  const onPickFile = (e) => { acceptFile(e.target.files?.[0]); };
  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };

  const renderPageToCanvas = async (doc, pageNum, fullscreen, triesLeft = 10) => {
    const viewportEl = fullscreen ? fsViewportRef.current : viewportRef.current;
    const canvas = fullscreen ? fsCanvasRef.current : canvasRef.current;
    const taskRef = fullscreen ? fsRenderTaskRef : renderTaskRef;

    if (!doc || !canvas || !viewportEl) return;
    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;
    if ((w < 120 || h < 120) && triesLeft > 0) {
      requestAnimationFrame(() => renderPageToCanvas(doc, pageNum, fullscreen, triesLeft - 1));
      return;
    }

    if (taskRef.current) {
      try { taskRef.current.cancel(); } catch {}
      taskRef.current = null;
    }

    const myRenderId = ++renderIdRef.current;
    setRendering(true);
    setPdfErr("");

    try {
      const pdfPage = await doc.getPage(pageNum);
      if (myRenderId !== renderIdRef.current) return;

      const padding = fullscreen ? 4 : 22;
      const maxW = Math.max(240, viewportEl.clientWidth - padding);
      const maxH = Math.max(240, viewportEl.clientHeight - padding);
      const v1 = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(maxW / v1.width, maxH / v1.height);
      const viewport = pdfPage.getViewport({ scale });
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (myRenderId !== renderIdRef.current) return;

      const renderTask = pdfPage.render({ canvasContext: ctx, viewport });
      taskRef.current = renderTask;
      await renderTask.promise;
      if (taskRef.current === renderTask) taskRef.current = null;
      if (myRenderId !== renderIdRef.current) return;
    } catch (err) {
      if (err?.name === "RenderingCancelledException") return;
      if (myRenderId === renderIdRef.current) setPdfErr("Couldn't render this slide.");
    } finally {
      if (myRenderId === renderIdRef.current) setRendering(false);
    }
  };

  useEffect(() => {
    if (!pdfDoc || isFullscreen) return;
    renderPageToCanvas(pdfDoc, page, false);
  }, [pdfDoc, page, isFullscreen]);

  useEffect(() => {
    if (!isFullscreen || !pdfDoc) return;
    let cancelled = false;
    const run = async () => {
      await waitForStableBox(fsViewportRef.current);
      if (!cancelled) renderPageToCanvas(pdfDoc, page, true);
    };
    run();
    return () => { cancelled = true; };
  }, [isFullscreen, pdfDoc, page]);

  useEffect(() => {
    if (!pdfDoc) return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (isFullscreen) {
          waitForStableBox(fsViewportRef.current, 10).then(() => renderPageToCanvas(pdfDoc, page, true));
        } else {
          renderPageToCanvas(pdfDoc, page, false);
        }
      });
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [pdfDoc, page, isFullscreen]);

  useEffect(() => {
    return () => {
      try { renderTaskRef.current?.cancel(); } catch {}
      try { fsRenderTaskRef.current?.cancel(); } catch {}
      stopCaptions();
      onFullscreenChange?.(false);
    };
  }, [onFullscreenChange]);

  const canPrev = pdfDoc && page > 1 && !rendering && !loadingPdf;
  const canNext = pdfDoc && page < numPages && !rendering && !loadingPdf;
  const prev = () => setPage((p) => Math.max(1, p - 1));
  const next = () => setPage((p) => Math.min(numPages, p + 1));

  const stopCaptions = () => {
    isStoppingRef.current = true;
    setCaptionStatus("");
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    try { window.clearInterval(chunkTimerRef.current); } catch {}
    chunkTimerRef.current = null;
    try { mediaRecorderRef.current?.stop(); } catch {}
    mediaRecorderRef.current = null;
    try { mediaStreamRef.current?.getTracks()?.forEach((t) => t.stop()); } catch {}
    mediaStreamRef.current = null;
    setInterimTranscript("");
    setTimeout(() => { isStoppingRef.current = false; }, 100);
  };

  const startLocalCaptions = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCaptionStatus("Local captions aren't supported in this browser. Try Chrome/Edge.");
      setMicOn(false);
      return;
    }
    isStoppingRef.current = false;
    setCaptionStatus("Listening…");
    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => { if (!isStoppingRef.current) setCaptionStatus(""); };

    rec.onresult = (event) => {
      if (isStoppingRef.current) return;
      setCaptionStatus("");

      let interim = "";
      let finalAdded = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = (event.results[i][0]?.transcript || "").trim();
        if (!chunk) continue;

        if (event.results[i].isFinal) {
          finalTranscriptRef.current = (finalTranscriptRef.current + " " + chunk).trim();
          finalAdded = true;
        } else {
          interim += (interim ? " " : "") + chunk;
        }
      }

      if (finalAdded) setFinalTranscript(finalTranscriptRef.current);
      setInterimTranscript(interim.trim());

      const combined = (finalTranscriptRef.current + (interim ? " " + interim : "")).trim();
      if (combined) maybeBroadcastTranscript(combined);
    };

    rec.onerror = (e) => {
      if (isStoppingRef.current) return;
      if (e.error === "no-speech" || e.error === "aborted") return;
      setCaptionStatus(`Captions error: ${e.error || "unknown"}`);
    };

    rec.onend = () => {
      if (isStoppingRef.current) return;
      if (micOn && recognitionRef.current === rec) {
        setTimeout(() => {
          if (!isStoppingRef.current && micOn) {
            try { rec.start(); } catch {
              if (!isStoppingRef.current) setCaptionStatus("Captions paused. Click mic to restart.");
            }
          }
        }, 100);
      }
    };

    try { rec.start(); } catch {
      setCaptionStatus("Couldn't start captions. Refresh and allow microphone access.");
      setMicOn(false);
    }
  };

  // ✅ No more clearing transcript history on mute/unmute
  const toggleMic = async () => {
    if (micOn) {
      setMicOn(false);
      stopCaptions();
      setCaptionStatus("Mic off");
      return;
    }
    setCaptionStatus("");
    setMicOn(true);
    startLocalCaptions();
  };

  const ensureJoinCode = async (openModal) => {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch { setCopied(false); }
    if (openModal) setJoinModalOpen(true);
  };

  const openFullscreen = async () => {
    setIsFullscreen(true);
    onFullscreenChange?.(true);
    requestAnimationFrame(async () => {
      await waitForStableBox(fsViewportRef.current);
      if (pdfDoc) renderPageToCanvas(pdfDoc, page, true);
    });
  };

  const closeFullscreen = () => {
    try { fsRenderTaskRef.current?.cancel(); } catch {}
    fsRenderTaskRef.current = null;
    setIsFullscreen(false);
    onFullscreenChange?.(false);
  };

  const hcFontStack = 'Atkinson Hyperlegible, "Lexend", Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
  const layoutStyle = isNarrow ? styles.layoutNarrow : styles.layoutWide;
  const shellPad = isShort ? "10px 12px" : "clamp(12px, 2.2vw, 20px) 16px";
  const gap = isShort ? "12px" : "14px";

  const pageStyle = {
    ...styles.page,
    backgroundColor: contrastMode ? HC.pageBg : COLORS.pageBg,
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0px)" : "translateY(10px)",
    overflowY: isFullscreen ? "hidden" : "auto",
  };

  const shellStyle = isNarrow
    ? { ...styles.shell, padding: shellPad, height: "auto", minHeight: "calc(100vh - var(--header-h))", overflow: "visible" }
    : { ...styles.shell, padding: shellPad, height: "calc(100vh - var(--header-h))", overflow: "visible" };

  const layoutCombined = isNarrow
    ? { ...styles.layoutBase, ...layoutStyle, gap, height: "auto", minHeight: 0, alignContent: "start" }
    : { ...styles.layoutBase, ...layoutStyle, gap, height: "100%" };

  const slidesAreaStyle = isNarrow ? { ...styles.slidesArea, height: "clamp(500px, 65vh, 850px)" } : { ...styles.slidesArea, height: "100%" };
  const rightRailStyle = isNarrow ? { ...styles.rightRail, height: "auto", overflow: "visible" } : { ...styles.rightRail, height: "100%", overflow: "hidden" };

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={layoutCombined}>
          <section style={slidesAreaStyle} aria-label="Slides">
            <div
              ref={viewportRef}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              style={{
                ...styles.slideViewport,
                border: dragOver ? `2px solid ${COLORS.teal}` : styles.slideViewport.border,
                boxShadow: dragOver ? "0 18px 42px rgba(44,177,166,0.20)" : styles.slideViewport.boxShadow,
              }}
            >
              <input ref={fileInputRef} type="file" accept="application/pdf" onChange={onPickFile} style={{ display: "none" }} />

              {!pdfDoc ? (
                <button type="button" onClick={openPicker} style={styles.uploadOverlayBtn} aria-label="Upload PDF">
                  <div style={styles.uploadInner}>
                    <div style={styles.uploadTitle}>Upload PDF</div>
                    <div style={styles.uploadSub}>Click to choose a file or drag & drop a PDF here.</div>
                    {loadingPdf && <div style={styles.statusPill}>Opening…</div>}
                    {!!pdfErr && <div style={styles.errorPill}>{pdfErr}</div>}
                  </div>
                </button>
              ) : (
                <>
                  <div style={styles.canvasWrap}><canvas ref={canvasRef} /></div>
                  <div style={styles.slideTopBar}>
                    <div style={styles.fileChip} title={pdfName}>{pdfName}</div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", pointerEvents: "auto" }}>
                      <button type="button" onClick={openPicker} style={styles.topActionBtn}>Change PDF</button>
                      <button type="button" onClick={openFullscreen} style={styles.topActionBtn}>Fullscreen</button>
                    </div>
                  </div>
                  <div style={styles.slideControls}>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", pointerEvents: "auto" }}>
                      <button type="button" onClick={prev} disabled={!canPrev} style={{ ...styles.navBtn, opacity: canPrev ? 1 : 0.45 }}>Prev</button>
                      <div style={styles.counterPill}>Slide {page} / {numPages}</div>
                      <button type="button" onClick={next} disabled={!canNext} style={{ ...styles.navBtn, opacity: canNext ? 1 : 0.45 }}>Next</button>
                    </div>
                  </div>
                  {(rendering || loadingPdf) && <div style={styles.statusPillFloat}>Rendering…</div>}
                  {!!pdfErr && <div style={styles.errorPillFloat}>{pdfErr}</div>}
                </>
              )}
            </div>
          </section>

          <aside style={{ ...rightRailStyle, gap }} aria-label="Live transcript and session controls">
            <section style={{
              ...styles.transcriptArea,
              backgroundColor: contrastMode ? HC.panelBg : COLORS.beigeDark,
              border: contrastMode ? `1px solid ${HC.divider}` : "1px solid rgba(0,0,0,0.08)",
            }}>
              <div style={{
                ...styles.transcriptHeader,
                backgroundColor: contrastMode ? HC.headerBg : "rgba(255,255,255,0.55)",
                borderBottom: contrastMode ? `1px solid ${HC.divider}` : "1px solid rgba(0,0,0,0.08)",
              }}>
                <div style={{ ...styles.transcriptTitle, color: contrastMode ? HC.text : COLORS.black }}>Live Transcript</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{
                    ...styles.transcriptBadge,
                    backgroundColor: micOn ? "rgba(44,177,166,0.16)" : "rgba(0,0,0,0.08)",
                    color: micOn ? COLORS.teal : "rgba(0,0,0,0.60)",
                  }}>
                    {micOn ? "Listening" : "Mic off"}
                  </div>
                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      data-settings-btn="true"
                      onClick={() => setSettingsOpen((v) => !v)}
                      style={{
                        ...styles.gearBtn,
                        backgroundColor: settingsOpen ? "rgba(44,177,166,0.18)" : contrastMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
                        border: settingsOpen ? "1px solid rgba(44,177,166,0.40)" : contrastMode ? `1px solid ${HC.divider}` : "1px solid rgba(0,0,0,0.10)",
                      }}
                      aria-label="Open settings"
                    >
                      <GearIcon size={17} color={contrastMode ? HC.text2 : "rgba(0,0,0,0.68)"} />
                    </button>
                    {settingsOpen && (
                      <div data-settings-modal="true" role="dialog" style={{
                        ...styles.settingsPopup,
                        ...(contrastMode ? { backgroundColor: HC.panelBg, border: `1px solid ${HC.divider}` } : null),
                      }}>
                        <div style={{ ...styles.settingsTitle, color: contrastMode ? HC.text : "rgba(0,0,0,0.84)" }}>Caption Settings</div>
                        <div style={styles.settingsRow}>
                          <label style={{ ...styles.settingsLabel, color: contrastMode ? HC.text2 : "rgba(0,0,0,0.72)" }}>
                            Font Size
                            <span style={{ ...styles.settingsValue, color: contrastMode ? HC.text3 : COLORS.teal }}>{fontSize}px</span>
                          </label>
                          <div style={styles.sliderTrackWrap}>
                            <input type="range" min={12} max={24} step={1} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={styles.slider} />
                            <div style={{ ...styles.sliderLabels, color: contrastMode ? HC.text3 : "rgba(0,0,0,0.46)" }}>
                              <span>A</span><span style={{ fontSize: "18px", fontWeight: 900 }}>A</span>
                            </div>
                          </div>
                        </div>
                        <div style={styles.settingsRow}>
                          <label style={{ ...styles.settingsLabel, color: contrastMode ? HC.text2 : "rgba(0,0,0,0.72)" }} htmlFor="teacher-contrast-toggle">
                            High Contrast
                            <span style={{ ...styles.settingsValue, color: contrastMode ? HC.teal : "rgba(0,0,0,0.44)" }}>{contrastMode ? "On" : "Off"}</span>
                          </label>
                          <button
                            id="teacher-contrast-toggle"
                            type="button"
                            role="switch"
                            aria-checked={contrastMode}
                            onClick={() => setContrastMode((v) => !v)}
                            style={{ ...styles.toggleTrack, backgroundColor: contrastMode ? COLORS.teal : "rgba(0,0,0,0.16)" }}
                          >
                            <span style={{ ...styles.toggleThumb, transform: contrastMode ? "translateX(20px)" : "translateX(2px)" }} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ ...styles.transcriptBody, backgroundColor: contrastMode ? HC.panelBg : undefined }}>
                <div style={{
                  ...styles.transcriptText,
                  fontSize: `${fontSize + (contrastMode ? 1 : 0)}px`,
                  color: contrastMode ? HC.text : "rgba(0,0,0,0.76)",
                  fontFamily: contrastMode ? hcFontStack : styles.transcriptText.fontFamily,
                  fontWeight: contrastMode ? 700 : styles.transcriptText.fontWeight,
                  lineHeight: contrastMode ? 1.85 : styles.transcriptText.lineHeight,
                  letterSpacing: contrastMode ? "0.01em" : undefined,
                }}>
                  {transcript}
                </div>
              </div>
            </section>

            <section style={{
              ...styles.controlDock,
              backgroundColor: contrastMode ? HC.panelBg : "rgba(255,255,255,0.92)",
              border: contrastMode ? `1px solid ${HC.divider}` : "1px solid rgba(0,0,0,0.08)",
            }} aria-label="Session controls">
              <div style={styles.dockHeader}>
                <div style={{ ...styles.dockTitle, color: contrastMode ? HC.text : COLORS.black }}>Session Controls</div>
                {!wsErr && <div style={{ ...styles.dockSub, color: contrastMode ? HC.text3 : "rgba(0,0,0,0.58)" }}>Live session ready</div>}
                {!!wsErr && <div style={{ ...styles.dockSub, color: "rgba(200,50,50,0.80)" }}>{wsErr}</div>}
              </div>
              <div style={styles.dockGrid}>
                <button
                  type="button"
                  onClick={toggleMic}
                  style={{
                    ...styles.compactTile,
                    backgroundColor: micOn ? "rgba(44,177,166,0.14)" : contrastMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                    border: micOn ? "1px solid rgba(44,177,166,0.34)" : contrastMode ? `1px solid ${HC.divider}` : "1px solid rgba(0,0,0,0.10)",
                  }}
                  aria-pressed={micOn}
                >
                  <div style={styles.compactIcon}>{micOn ? "🎙️" : "🔇"}</div>
                  <div style={{ ...styles.compactLabel, color: contrastMode ? HC.text3 : "rgba(0,0,0,0.62)" }}>Mic</div>
                </button>

                <button
                  type="button"
                  onClick={() => setParticipantsOpen(true)}
                  style={{
                    ...styles.compactTile,
                    cursor: "pointer",
                    backgroundColor: contrastMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                    border: contrastMode ? `1px solid ${HC.divider}` : "1px solid rgba(0,0,0,0.10)",
                  }}
                  aria-label={`${studentCount} viewers — click to manage`}
                >
                  <div style={{ ...styles.compactIcon, color: contrastMode ? HC.text : "rgba(0,0,0,0.84)" }}>{studentCount}</div>
                  <div style={{ ...styles.compactLabel, color: contrastMode ? HC.text3 : "rgba(0,0,0,0.62)" }}>Viewers</div>
                </button>

                <button type="button" onClick={() => ensureJoinCode(true)} style={styles.joinCompactBtn}>
                  <div style={styles.joinCompactCode}>{joinCode}</div>
                  <div style={styles.joinCompactLabel}>Join Code</div>
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {joinModalOpen && (
        <div role="dialog" aria-modal="true" style={styles.modalOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setJoinModalOpen(false); }}>
          <div style={styles.modalCard}>
            <div style={styles.modalTitle}>Join Code</div>
            <button type="button" onClick={() => ensureJoinCode(false)} style={styles.modalCodeBtn}>{joinCode}</button>
            <div style={styles.modalSub}>{copied ? "Copied to clipboard." : "Click the code to copy."}</div>
            <button type="button" onClick={() => setJoinModalOpen(false)} style={styles.modalCloseBtn}>Close</button>
          </div>
        </div>
      )}

      {participantsOpen && (
        <div role="dialog" aria-modal="true" style={styles.modalOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setParticipantsOpen(false); }}>
          <div style={styles.modalCard}>
            <div style={styles.modalTitle}>
              Participants
              <span style={styles.participantCount}>{participants.length}</span>
            </div>

            {participants.length === 0 ? (
              <div style={styles.emptyParticipants}>No participants yet. Share the join code to get started.</div>
            ) : (
              <div style={styles.participantList}>
                {participants.map((p) => (
                  <div key={p.id} style={styles.participantRow}>
                    <div style={styles.participantAvatar}>{(p.name || "?")[0].toUpperCase()}</div>
                    <div style={styles.participantName}>{p.name || "Student"}</div>
                    <button type="button" onClick={() => removeParticipant(p.id)} style={styles.removeBtn} aria-label={`Remove ${p.name}`}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ width: "100%", display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap", marginTop: "2px" }}>
              <button
                type="button"
                onClick={endSession}
                style={{ ...styles.modalCloseBtn, border: "1px solid rgba(220,60,60,0.28)", backgroundColor: "rgba(232,91,91,0.08)", color: "rgba(200,50,50,0.92)" }}
              >
                End Session
              </button>
              <button type="button" onClick={() => setParticipantsOpen(false)} style={styles.modalCloseBtn}>Close</button>
            </div>
          </div>
        </div>
      )}

      {isFullscreen && (
        <div role="dialog" aria-modal="true" style={styles.fsOverlay}>
          <div style={styles.fsCard}>
            <button type="button" onClick={closeFullscreen} style={styles.fsCloseBtn} aria-label="Exit fullscreen">Exit</button>
            <div ref={fsViewportRef} style={styles.fsViewport}>
              <div style={styles.fsCanvasWrap}><canvas ref={fsCanvasRef} /></div>
            </div>
            <div style={styles.fsControls}>
              <button type="button" onClick={prev} disabled={!canPrev} style={{ ...styles.fsNavBtn, opacity: canPrev ? 1 : 0.4 }}>←</button>
              <div style={styles.fsCounter}>{page}/{numPages}</div>
              <button type="button" onClick={next} disabled={!canNext} style={{ ...styles.fsNavBtn, opacity: canNext ? 1 : 0.4 }}>→</button>
            </div>
            {(rendering || loadingPdf) && <div style={styles.fsStatus}>Rendering…</div>}
            {!!pdfErr && <div style={styles.fsError}>{pdfErr}</div>}
          </div>
        </div>
      )}
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", paddingTop: "var(--header-h)", boxSizing: "border-box", overflowX: "hidden", transition: "opacity 320ms ease, transform 420ms ease" },
  shell: { maxWidth: "1440px", margin: "0 auto", boxSizing: "border-box" },
  layoutBase: { display: "grid", gap: "14px", alignItems: "stretch", minHeight: 0 },
  layoutWide: { gridTemplateColumns: "minmax(0, 1fr) clamp(300px, 32vw, 450px)", gridTemplateRows: "1fr" },
  layoutNarrow: { gridTemplateColumns: "1fr", gridTemplateRows: "auto auto" },
  slidesArea: { width: "100%", borderRadius: "22px", overflow: "hidden", minHeight: 0 },
  slideViewport: { position: "relative", width: "100%", height: "100%", backgroundColor: COLORS.beige, borderRadius: "22px", border: "2px dashed rgba(0,0,0,0.14)", boxShadow: "0 6px 12px rgba(0,0,0,0.08)", overflow: "hidden", display: "grid", placeItems: "center", transition: "box-shadow 220ms ease, border-color 160ms ease" },
  uploadOverlayBtn: { width: "100%", height: "100%", border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", padding: "18px" },
  uploadInner: { width: "min(720px, 100%)", textAlign: "center", display: "grid", gap: "10px", padding: "12px" },
  uploadTitle: { fontFamily: "Merriweather, serif", fontSize: "clamp(30px, 3.6vw, 52px)", fontWeight: 900, letterSpacing: "-0.03em", color: COLORS.black, lineHeight: 1.05 },
  uploadSub: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(13px, 1.2vw, 16px)", fontWeight: 650, lineHeight: 1.65, color: "rgba(0,0,0,0.68)" },
  canvasWrap: { width: "100%", height: "100%", display: "grid", placeItems: "center", padding: "16px", boxSizing: "border-box" },
  slideTopBar: { position: "absolute", top: "10px", left: "10px", right: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", pointerEvents: "none" },
  fileChip: { pointerEvents: "auto", maxWidth: "62%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", backgroundColor: "rgba(255,255,255,0.75)", border: "1px solid rgba(0,0,0,0.10)", borderRadius: "999px", padding: "8px 10px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(11px, 1.15vw, 12.5px)", fontWeight: 850, color: "rgba(0,0,0,0.74)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" },
  topActionBtn: { pointerEvents: "auto", border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "rgba(255,255,255,0.78)", borderRadius: "14px", padding: "8px 10px", cursor: "pointer", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(11px, 1.15vw, 12.5px)", fontWeight: 900, color: "rgba(0,0,0,0.74)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" },
  slideControls: { position: "absolute", left: "12px", right: "12px", bottom: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", pointerEvents: "none" },
  navBtn: { pointerEvents: "auto", border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "rgba(255,255,255,0.82)", borderRadius: "14px", padding: "10px 12px", cursor: "pointer", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(12px, 1.2vw, 13px)", fontWeight: 900, color: "rgba(0,0,0,0.78)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" },
  counterPill: { pointerEvents: "none", backgroundColor: "rgba(44,177,166,0.14)", border: "1px solid rgba(44,177,166,0.28)", borderRadius: "999px", padding: "10px 12px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(12px, 1.2vw, 13px)", fontWeight: 950, color: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" },
  statusPill: { justifySelf: "center", backgroundColor: "rgba(0,0,0,0.74)", color: COLORS.white, padding: "7px 10px", borderRadius: "999px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(11px, 1.1vw, 12px)", fontWeight: 900, width: "fit-content" },
  statusPillFloat: { position: "absolute", top: "54px", right: "12px", backgroundColor: "rgba(0,0,0,0.74)", color: COLORS.white, padding: "7px 10px", borderRadius: "999px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(11px, 1.1vw, 12px)", fontWeight: 900 },
  errorPill: { justifySelf: "center", backgroundColor: "rgba(232,91,91,0.92)", color: COLORS.white, padding: "10px 12px", borderRadius: "14px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(12px, 1.2vw, 13px)", fontWeight: 850, width: "fit-content", maxWidth: "min(900px, 92vw)" },
  errorPillFloat: { position: "absolute", left: "12px", right: "12px", top: "54px", backgroundColor: "rgba(232,91,91,0.92)", color: COLORS.white, padding: "10px 12px", borderRadius: "14px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(12px, 1.2vw, 13px)", fontWeight: 850, textAlign: "center" },
  rightRail: { width: "100%", display: "flex", flexDirection: "column", gap: "14px", minHeight: 0 },
  transcriptArea: { width: "100%", flex: "1 1 0", minHeight: "clamp(280px, 48vh, 520px)", borderRadius: "22px", boxShadow: "0 4px 8px rgba(0,0,0,0.06)", overflow: "hidden", display: "flex", flexDirection: "column" },
  transcriptHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "12px 14px", flexWrap: "wrap", flexShrink: 0 },
  transcriptTitle: { fontFamily: "Merriweather, serif", fontSize: "clamp(16px, 1.7vw, 18px)", fontWeight: 900, letterSpacing: "-0.02em" },
  transcriptBadge: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(11px, 1.1vw, 12px)", fontWeight: 900, padding: "6px 10px", borderRadius: "999px", whiteSpace: "nowrap" },
  transcriptBody: { flex: "1 1 0", minHeight: 0, padding: "14px", overflow: "auto" },
  transcriptText: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", lineHeight: 1.7, fontWeight: 600, whiteSpace: "pre-wrap", transition: "font-size 150ms ease" },
  gearBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", borderRadius: "10px", cursor: "pointer", padding: 0, transition: "background-color 140ms ease, border-color 140ms ease" },
  settingsPopup: { position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 200, width: "clamp(220px, 30vw, 260px)", borderRadius: "18px", backgroundColor: "rgba(255,255,255,0.97)", border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 20px 54px rgba(0,0,0,0.20)", padding: "14px", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "grid", gap: "14px" },
  settingsTitle: { fontFamily: "Merriweather, serif", fontSize: "14px", fontWeight: 900, letterSpacing: "-0.01em" },
  settingsRow: { display: "grid", gap: "8px" },
  settingsLabel: { display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "12px", fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase" },
  settingsValue: { fontWeight: 700, textTransform: "none", letterSpacing: 0, fontSize: "12px" },
  sliderTrackWrap: { display: "grid", gap: "4px" },
  slider: { width: "100%", accentColor: COLORS.teal, cursor: "pointer", height: "4px" },
  sliderLabels: { display: "flex", justifyContent: "space-between", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "11px", fontWeight: 700, paddingTop: "2px" },
  toggleTrack: { position: "relative", width: "44px", height: "24px", borderRadius: "999px", border: "none", cursor: "pointer", padding: 0, transition: "background-color 200ms ease", flexShrink: 0 },
  toggleThumb: { position: "absolute", top: "3px", width: "18px", height: "18px", borderRadius: "50%", backgroundColor: COLORS.white, boxShadow: "0 1px 4px rgba(0,0,0,0.28)", transition: "transform 200ms ease", display: "block" },
  controlDock: { width: "100%", flexShrink: 0, borderRadius: "18px", boxShadow: "0 4px 8px rgba(0,0,0,0.06)", padding: "8px", boxSizing: "border-box", overflow: "hidden", display: "flex", flexDirection: "column", gap: "6px" },
  dockHeader: { display: "grid", gap: "3px", padding: "2px 4px", flexShrink: 0 },
  dockTitle: { fontFamily: "Merriweather, serif", fontSize: "clamp(12px, 1.3vw, 13px)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1 },
  dockSub: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(11px, 1.1vw, 12px)", fontWeight: 650 },
  dockGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", flexShrink: 0 },
  compactTile: { borderRadius: "14px", padding: "clamp(7px, 1.1vw, 9px)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", textAlign: "center", boxShadow: "none", outline: "none", minHeight: "clamp(52px, 7.8vh, 64px)" },
  compactIcon: { fontFamily: "Merriweather, serif", fontSize: "clamp(16px, 2.0vw, 22px)", fontWeight: 900, lineHeight: 1 },
  compactLabel: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(9px, 1vw, 11px)", fontWeight: 900, letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: 1.2 },
  joinCompactBtn: { gridColumn: "1 / span 2", border: "none", borderRadius: "16px", padding: "clamp(9px, 1.2vw, 11px)", cursor: "pointer", background: `linear-gradient(135deg, ${COLORS.teal}, rgba(44,177,166,0.82))`, color: COLORS.white, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", textAlign: "center", minHeight: "clamp(58px, 8.6vh, 70px)" },
  joinCompactCode: { fontFamily: "Merriweather, serif", fontSize: "clamp(17px, 2.2vw, 22px)", fontWeight: 900, letterSpacing: "0.08em", lineHeight: 1 },
  joinCompactLabel: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(9px, 1vw, 11px)", fontWeight: 900, color: "rgba(255,255,255,0.86)", letterSpacing: "0.02em", textTransform: "uppercase", lineHeight: 1.2 },
  modalOverlay: { position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.52)", display: "grid", placeItems: "center", padding: "18px", zIndex: 50 },
  modalCard: { width: "min(560px, 94vw)", borderRadius: "26px", backgroundColor: "rgba(255,255,255,0.92)", border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 32px 88px rgba(0,0,0,0.34)", padding: "18px", boxSizing: "border-box", display: "grid", gap: "12px", justifyItems: "center", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", maxHeight: "80vh", overflowY: "auto" },
  modalTitle: { fontFamily: "Merriweather, serif", fontSize: "clamp(18px, 2vw, 20px)", fontWeight: 900, letterSpacing: "-0.02em", color: "rgba(0,0,0,0.84)", display: "flex", alignItems: "center", gap: "10px" },
  participantCount: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "13px", fontWeight: 900, backgroundColor: "rgba(44,177,166,0.14)", border: "1px solid rgba(44,177,166,0.28)", color: COLORS.teal, borderRadius: "999px", padding: "3px 10px" },
  emptyParticipants: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "14px", fontWeight: 600, color: "rgba(0,0,0,0.54)", textAlign: "center", padding: "16px 8px", lineHeight: 1.6 },
  participantList: { width: "100%", display: "grid", gap: "8px" },
  participantRow: { display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "14px", backgroundColor: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.07)" },
  participantAvatar: { width: "32px", height: "32px", borderRadius: "50%", backgroundColor: COLORS.teal, color: COLORS.white, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Merriweather, serif", fontSize: "13px", fontWeight: 900, flexShrink: 0 },
  participantName: { flex: "1 1 0", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "14px", fontWeight: 700, color: "rgba(0,0,0,0.80)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  removeBtn: { flexShrink: 0, border: "1px solid rgba(232,91,91,0.30)", backgroundColor: "rgba(232,91,91,0.08)", borderRadius: "10px", padding: "6px 10px", cursor: "pointer", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "12px", fontWeight: 850, color: "rgba(200,50,50,0.90)" },
  modalCodeBtn: { width: "100%", border: "none", borderRadius: "22px", backgroundColor: COLORS.teal, color: COLORS.white, padding: "18px 16px", cursor: "pointer", fontFamily: "Merriweather, serif", fontSize: "clamp(34px, 5vw, 54px)", fontWeight: 900, letterSpacing: "0.10em", boxShadow: "0 22px 54px rgba(0,0,0,0.20)" },
  modalSub: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(12px, 1.2vw, 13px)", fontWeight: 650, color: "rgba(0,0,0,0.64)", textAlign: "center" },
  modalCloseBtn: { border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "rgba(0,0,0,0.05)", borderRadius: "16px", padding: "10px 12px", cursor: "pointer", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(12px, 1.2vw, 13px)", fontWeight: 850, color: "rgba(0,0,0,0.72)", width: "fit-content" },
  fsOverlay: { position: "fixed", inset: 0, backgroundColor: "rgba(5,6,7,0.96)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  fsCard: { width: "100vw", height: "100vh", position: "relative", display: "flex", flexDirection: "column" },
  fsCloseBtn: { position: "fixed", top: "8px", right: "8px", zIndex: 1003, border: "1px solid rgba(255,182,193,0.40)", backgroundColor: "rgba(255,182,193,0.25)", borderRadius: "12px", padding: "8px 14px", cursor: "pointer", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "13px", fontWeight: 700, color: "rgba(255,105,130,0.95)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" },
  fsViewport: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", zIndex: 999 },
  fsCanvasWrap: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "8px", boxSizing: "border-box" },
  fsControls: { position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "clamp(12px, 3vh, 20px)", display: "flex", alignItems: "center", justifyContent: "center", gap: "clamp(6px, 2vw, 10px)", pointerEvents: "none", zIndex: 1002 },
  fsNavBtn: { pointerEvents: "auto", border: "1px solid rgba(44,177,166,0.40)", backgroundColor: "rgba(255,255,255,0.92)", borderRadius: "50%", width: "clamp(40px, 8vw, 50px)", height: "clamp(40px, 8vw, 50px)", minWidth: "40px", minHeight: "40px", cursor: "pointer", fontSize: "clamp(18px, 4vw, 22px)", fontWeight: 900, color: COLORS.teal, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, touchAction: "manipulation" },
  fsCounter: { pointerEvents: "none", backgroundColor: "rgba(44,177,166,0.82)", border: "1px solid rgba(44,177,166,0.40)", borderRadius: "999px", padding: "10px 16px", fontFamily: "Inter, system-ui, -apple-system, sans-serif", fontSize: "14px", fontWeight: 950, color: "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", whiteSpace: "nowrap" },
  fsStatus: { position: "fixed", top: "8px", left: "50%", transform: "translateX(-50%)", backgroundColor: "rgba(0,0,0,0.74)", color: COLORS.white, padding: "6px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 900, zIndex: 1000 },
  fsError: { position: "fixed", left: "8px", right: "8px", top: "8px", backgroundColor: "rgba(232,91,91,0.92)", color: COLORS.white, padding: "10px 14px", borderRadius: "14px", fontSize: "12px", fontWeight: 850, textAlign: "center", zIndex: 1000 },
};