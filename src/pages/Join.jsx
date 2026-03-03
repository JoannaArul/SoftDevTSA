// Join.jsx
import { useEffect, useMemo, useRef, useState } from "react";
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

function cleanCode(v) {
  return (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function absolutizeUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `${BACKEND_HTTP}${url}`;
  return `${BACKEND_HTTP}/${url}`;
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

// Deterministic color from string
function hslFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 58%, 44%)`;
}

function GearIcon({ size = 18, color = "rgba(0,0,0,0.70)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// Labeled transcript segments display
function TranscriptSegments({ segments, fontSize, contrastMode, hcFontStack }) {
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [segments]);

  if (!segments || segments.length === 0) return null;

  return (
    <div ref={bodyRef} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {segments.map((seg, i) => {
        const isTeacherSeg = seg.role === "teacher";
        const initials = (seg.speakerName || "?")[0].toUpperCase();
        const avatarBg = isTeacherSeg
          ? COLORS.teal
          : hslFromString(seg.speakerId || seg.speakerName || "x");

        return (
          <div key={`${seg.speakerId}-${seg.ts}-${i}`} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <div style={{
              flexShrink: 0,
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              backgroundColor: avatarBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Merriweather, serif",
              fontSize: "11px",
              fontWeight: 900,
              color: "#fff",
              marginTop: "2px",
            }}>
              {initials}
            </div>
            <div style={{ flex: "1 1 0", minWidth: 0 }}>
              <div style={{
                fontFamily: contrastMode ? hcFontStack : "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
                fontSize: "11px",
                fontWeight: 800,
                color: isTeacherSeg
                  ? COLORS.teal
                  : contrastMode ? HC.text3 : "rgba(0,0,0,0.52)",
                letterSpacing: "0.03em",
                textTransform: "uppercase",
                marginBottom: "2px",
              }}>
                {seg.speakerName}
              </div>
              <div style={{
                fontFamily: contrastMode ? hcFontStack : "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
                fontSize: `${fontSize}px`,
                color: contrastMode ? HC.text : "rgba(0,0,0,0.76)",
                lineHeight: 1.65,
                fontWeight: contrastMode ? 700 : 600,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                letterSpacing: contrastMode ? "0.01em" : undefined,
              }}>
                {seg.text}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Join({ onFullscreenChange }) {
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const fsViewportRef = useRef(null);
  const fsCanvasRef = useRef(null);
  const renderIdRef = useRef(0);
  const renderTaskRef = useRef(null);
  const fsRenderTaskRef = useRef(null);
  const wsRef = useRef(null);
  const recognitionRef = useRef(null);
  const isStoppingRef = useRef(false);
  const lastTxRef = useRef(0);
  const myStudentNameRef = useRef("Student");

  const [mounted, setMounted] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [isShort, setIsShort] = useState(false);

  const [code, setCode] = useState("");
  const [studentName, setStudentName] = useState("");
  const [joined, setJoined] = useState(false);
  const [kicked, setKicked] = useState(false);

  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [pdfDoc, setPdfDoc] = useState(null);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);

  // Labeled transcript segments
  const [transcriptSegments, setTranscriptSegments] = useState([]);

  const [status, setStatus] = useState("Enter a join code to connect.");
  const [rendering, setRendering] = useState(false);
  const [err, setErr] = useState("");

  const [isFullscreen, setIsFullscreen] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(15);
  const [contrastMode, setContrastMode] = useState(false);

  // Student mic state (controlled by teacher permission)
  const [studentMicEnabled, setStudentMicEnabled] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [captionStatus, setCaptionStatus] = useState("");

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
    const onKey = (e) => {
      if (e.key === "Escape") closeFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = isFullscreen ? "hidden" : "";
    return () => {
      document.body.style.overflow = prev || "";
    };
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

  useEffect(() => {
    return () => {
      try { renderTaskRef.current?.cancel(); } catch {}
      try { fsRenderTaskRef.current?.cancel(); } catch {}
      stopCaptions();
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, []);

  // When studentMicEnabled is turned off by teacher, stop mic if running
  useEffect(() => {
    if (!studentMicEnabled && micOn) {
      setMicOn(false);
      stopCaptions();
    }
  }, [studentMicEnabled]);

  const resetSessionState = () => {
    setPdfUrl("");
    setPdfName("");
    setPdfDoc(null);
    setNumPages(0);
    setPage(1);
    setTranscriptSegments([]);
    setErr("");
    setIsFullscreen(false);
    setStudentMicEnabled(false);
    setMicOn(false);
    stopCaptions();
  };

  const leave = () => {
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    setJoined(false);
    setKicked(false);
    resetSessionState();
    setStatus("Enter a join code to connect.");
  };

  const connect = (joinCode) => {
    const c = cleanCode(joinCode);
    if (!c) return;

    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;

    setErr("");
    setKicked(false);
    setStatus("Connecting…");
    setJoined(false);

    const name = studentName.trim() || "Student";
    myStudentNameRef.current = name;

    const ws = new WebSocket(`${BACKEND_WS}/ws?code=${encodeURIComponent(c)}&role=student&name=${encodeURIComponent(name)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setJoined(true);
      setStatus("Connected. Waiting for host…");
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data || "{}"); } catch { return; }

      if (msg.type === "ended") {
        wsRef.current = null;
        setJoined(false);
        setKicked(true);
        resetSessionState();
        setStatus("The host ended the session.");
        try { ws.close(); } catch {}
        return;
      }

      if (msg.type === "kicked") {
        wsRef.current = null;
        setJoined(false);
        setKicked(true);
        resetSessionState();
        setStatus("You were removed from the session.");
        try { ws.close(); } catch {}
        return;
      }

      if (msg.type === "sync") {
        if (msg.pdf?.url) {
          setPdfUrl(absolutizeUrl(msg.pdf.url));
          setPdfName(msg.pdf.name || "");
        }
        if (msg.slide?.page) setPage(Number(msg.slide.page) || 1);
        if (msg.slide?.numPages) setNumPages(Number(msg.slide.numPages) || 0);
        if (Array.isArray(msg.transcriptSegments)) setTranscriptSegments(msg.transcriptSegments);
        if (typeof msg.studentMicEnabled === "boolean") setStudentMicEnabled(msg.studentMicEnabled);
        return;
      }

      if (msg.type === "pdf") {
        if (msg.url) setPdfUrl(absolutizeUrl(msg.url));
        if (msg.name) setPdfName(msg.name);
        if (msg.numPages) setNumPages(Number(msg.numPages) || 0);
        setStatus("Slides received.");
        return;
      }

      if (msg.type === "slide") {
        if (msg.page) setPage(Number(msg.page) || 1);
        if (msg.numPages) setNumPages(Number(msg.numPages) || 0);
        return;
      }

      // Labeled transcript segments from server
      if (msg.type === "transcript_segments") {
        if (Array.isArray(msg.segments)) setTranscriptSegments(msg.segments);
        return;
      }

      // Student mic permission toggled by teacher
      if (msg.type === "student_mic_setting") {
        setStudentMicEnabled(!!msg.enabled);
        return;
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setJoined(false);
      resetSessionState();
      setStatus("Disconnected.");
    };

    ws.onerror = () => {
      setErr("Connection error. Check your join code and try again.");
    };
  };

  const loadPdfFromUrl = async (url) => {
    if (!url) return;
    setErr("");
    setStatus("Loading slides…");
    setPdfDoc(null);
    try {
      const task = pdfjsLib.getDocument({ url, withCredentials: false });
      const doc = await task.promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setStatus("Slides loaded.");
      setPage((p) => Math.min(Math.max(1, p), doc.numPages));
    } catch {
      setErr("Could not load slides.");
      setStatus("Waiting for host…");
    }
  };

  useEffect(() => {
    if (!pdfUrl) return;
    loadPdfFromUrl(pdfUrl);
  }, [pdfUrl]);

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
    setErr("");

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
    } catch (e) {
      if (e?.name === "RenderingCancelledException") return;
      if (myRenderId === renderIdRef.current) setErr("Couldn't render this slide.");
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
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [pdfDoc, page, isFullscreen]);

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

  // Student mic / speech recognition
  const stopCaptions = () => {
    isStoppingRef.current = true;
    setCaptionStatus("");
    try { recognitionRef.current?.stop(); } catch {}
    recognitionRef.current = null;
    setTimeout(() => { isStoppingRef.current = false; }, 100);
  };

  const maybeBroadcastTranscript = (text) => {
    const now = Date.now();
    if (now - lastTxRef.current < 250) return;
    lastTxRef.current = now;
    if (wsRef.current && wsRef.current.readyState === 1) {
      try { wsRef.current.send(JSON.stringify({ type: "transcript", text })); } catch {}
    }
  };

  const startLocalCaptions = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCaptionStatus("Not supported in this browser. Try Chrome/Edge.");
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
    let finalText = "";

    rec.onstart = () => { if (!isStoppingRef.current) setCaptionStatus(""); };
    rec.onresult = (event) => {
      if (isStoppingRef.current) return;
      setCaptionStatus("");
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk + " ";
        else interim += chunk;
      }
      const combined = (finalText + interim).trim();
      maybeBroadcastTranscript(combined);
    };
    rec.onerror = (e) => {
      if (isStoppingRef.current) return;
      if (e.error === "no-speech" || e.error === "aborted") return;
      setCaptionStatus(`Error: ${e.error || "unknown"}`);
    };
    rec.onend = () => {
      if (isStoppingRef.current) return;
      if (micOn && recognitionRef.current === rec) {
        setTimeout(() => {
          if (!isStoppingRef.current && micOn) {
            try { rec.start(); } catch {
              if (!isStoppingRef.current) setCaptionStatus("Paused. Tap mic to restart.");
            }
          }
        }, 100);
      }
    };
    try { rec.start(); } catch {
      setCaptionStatus("Couldn't start mic. Allow microphone access and try again.");
      setMicOn(false);
    }
  };

  const toggleMic = () => {
    if (!studentMicEnabled) return;
    if (micOn) {
      setMicOn(false);
      stopCaptions();
      return;
    }
    setCaptionStatus("");
    setMicOn(true);
    startLocalCaptions();
  };

  const showSegments = transcriptSegments.length > 0;

  const placeholderText = useMemo(() => {
    if (!joined) return "Enter the join code shown by the host to connect.";
    if (!pdfDoc) return "Connected. Waiting for slides…";
    return "Connected. Waiting for captions…";
  }, [joined, pdfDoc]);

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
    : { ...styles.shell, padding: shellPad, height: "calc(100vh - var(--header-h))", overflow: "hidden" };

  const layoutCombined = isNarrow
    ? { ...styles.layoutBase, ...layoutStyle, gap, height: "auto", minHeight: 0, alignContent: "start" }
    : { ...styles.layoutBase, ...layoutStyle, gap, height: "100%", minHeight: 0 };

  const slidesAreaStyle = isNarrow
    ? { ...styles.slidesArea, height: "clamp(500px, 65vh, 850px)" }
    : { ...styles.slidesArea, height: "100%", minHeight: 0 };

  const rightRailStyle = isNarrow
    ? { ...styles.rightRail, height: "auto", overflow: "visible" }
    : { ...styles.rightRail, height: "100%", overflow: "hidden", minHeight: 0 };

  const transcriptAreaStyle = isNarrow
    ? { ...styles.transcriptArea, minHeight: "clamp(280px, 48vh, 520px)" }
    : styles.transcriptArea;

  if (!joined) {
    return (
      <main style={pageStyle}>
        <div style={styles.centerFrame}>
          <div style={{ ...styles.joinCard, ...(contrastMode ? { backgroundColor: HC.panelBg, border: `1px solid ${HC.divider}` } : null) }}>
            <div style={{ ...styles.joinTitle, color: contrastMode ? HC.text : COLORS.black }}>
              {kicked ? "Session Ended" : "Join Session"}
            </div>
            <div style={{ ...styles.joinSub, color: contrastMode ? HC.text2 : "rgba(0,0,0,0.66)" }}>
              {kicked ? status : "Enter your name and the 6-character code from your host."}
            </div>

            <input
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              onKeyPress={(e) => { if (e.key === "Enter") connect(code); }}
              placeholder="Your name"
              style={{
                ...styles.joinInput,
                textTransform: "none",
                letterSpacing: "0.01em",
                fontSize: "16px",
                fontWeight: 800,
                ...(contrastMode ? { backgroundColor: "#0E151D", border: `1px solid ${HC.divider}`, color: HC.text, fontFamily: hcFontStack } : null),
              }}
              maxLength={40}
            />

            <div style={styles.joinRow}>
              <input
                value={code}
                onChange={(e) => setCode(cleanCode(e.target.value))}
                onKeyPress={(e) => { if (e.key === "Enter") connect(code); }}
                placeholder="ABC123"
                style={{
                  ...styles.joinInput,
                  ...(contrastMode ? { backgroundColor: "#0E151D", border: `1px solid ${HC.divider}`, color: HC.text, fontFamily: hcFontStack } : null),
                }}
                maxLength={6}
              />
              <button
                type="button"
                onClick={() => { setKicked(false); connect(code); }}
                style={{ ...styles.joinBtn, ...(contrastMode ? { background: `linear-gradient(135deg, ${HC.teal}, rgba(44,177,166,0.82))` } : null) }}
              >
                Join
              </button>
            </div>

            <div style={{
              ...styles.joinHint,
              color: err ? "rgba(200,50,50,0.90)" : contrastMode ? HC.text3 : kicked ? "rgba(200,50,50,0.70)" : "rgba(0,0,0,0.62)",
              fontFamily: contrastMode ? hcFontStack : styles.joinHint.fontFamily,
            }}>
              {err || (kicked ? "" : status)}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={layoutCombined}>
          {/* Slides */}
          <section style={slidesAreaStyle} aria-label="Slides">
            <div
              ref={viewportRef}
              style={{
                ...styles.slideViewport,
                ...(contrastMode ? { backgroundColor: "#0E151D", border: `2px solid ${HC.divider}` } : null),
              }}
            >
              {!pdfDoc ? (
                <div style={styles.waitWrap}>
                  <div style={{ ...styles.waitTitle, color: contrastMode ? HC.text : "rgba(0,0,0,0.84)" }}>Waiting for slides…</div>
                  <div style={{ ...styles.waitSub, color: contrastMode ? HC.text2 : "rgba(0,0,0,0.62)" }}>{status}</div>
                  {err && <div style={styles.errorPill}>{err}</div>}
                  <button type="button" onClick={leave} style={styles.leaveBtn}>
                    Leave Session
                  </button>
                </div>
              ) : (
                <>
                  <div style={styles.canvasWrap}>
                    <canvas ref={canvasRef} />
                  </div>

                  <div style={styles.slideTopBar}>
                    <button type="button" onClick={leave} style={styles.leaveTopBtn}>
                      ← Leave
                    </button>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", pointerEvents: "auto" }}>
                      <div style={styles.fileChip} title={pdfName}>
                        {pdfName || "Slides"}
                      </div>
                      <button type="button" onClick={openFullscreen} style={styles.topActionBtn}>
                        Fullscreen
                      </button>
                    </div>
                  </div>

                  <div style={styles.slideControls}>
                    <div style={styles.counterPill}>
                      Slide {page} / {numPages || pdfDoc.numPages}
                    </div>
                  </div>

                  {rendering && <div style={styles.statusPillFloat}>Rendering…</div>}
                  {err && <div style={styles.errorPillFloat}>{err}</div>}
                </>
              )}
            </div>
          </section>

          {/* Right Rail */}
          <aside style={{ ...rightRailStyle, gap }} aria-label="Live captions">
            {/* Transcript Panel */}
            <section
              style={{
                ...transcriptAreaStyle,
                backgroundColor: contrastMode ? HC.panelBg : COLORS.beigeDark,
                border: contrastMode ? `1px solid ${HC.divider}` : "1px solid rgba(0,0,0,0.08)",
              }}
            >
              <div
                style={{
                  ...styles.transcriptHeader,
                  backgroundColor: contrastMode ? HC.headerBg : "rgba(255,255,255,0.55)",
                  borderBottom: contrastMode ? `1px solid ${HC.divider}` : "1px solid rgba(0,0,0,0.08)",
                }}
              >
                <div style={{ ...styles.transcriptTitle, color: contrastMode ? HC.text : COLORS.black }}>Live Captions</div>

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
                    <div
                      data-settings-modal="true"
                      role="dialog"
                      style={{
                        ...styles.settingsPopup,
                        ...(contrastMode ? { backgroundColor: HC.panelBg, border: `1px solid ${HC.divider}` } : null),
                      }}
                    >
                      <div style={{ ...styles.settingsTitle, color: contrastMode ? HC.text : "rgba(0,0,0,0.84)" }}>Caption Settings</div>

                      <div style={styles.settingsRow}>
                        <label style={{ ...styles.settingsLabel, color: contrastMode ? HC.text2 : "rgba(0,0,0,0.72)" }}>
                          Font Size
                          <span style={{ ...styles.settingsValue, color: contrastMode ? HC.text3 : COLORS.teal }}>{fontSize}px</span>
                        </label>
                        <div style={styles.sliderTrackWrap}>
                          <input type="range" min={12} max={24} step={1} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={styles.slider} />
                          <div style={{ ...styles.sliderLabels, color: contrastMode ? HC.text3 : "rgba(0,0,0,0.46)" }}>
                            <span>A</span>
                            <span style={{ fontSize: "18px", fontWeight: 900 }}>A</span>
                          </div>
                        </div>
                      </div>

                      <div style={styles.settingsRow}>
                        <label style={{ ...styles.settingsLabel, color: contrastMode ? HC.text2 : "rgba(0,0,0,0.72)" }} htmlFor="contrast-toggle">
                          High Contrast
                          <span style={{ ...styles.settingsValue, color: contrastMode ? HC.teal : "rgba(0,0,0,0.44)" }}>{contrastMode ? "On" : "Off"}</span>
                        </label>
                        <button
                          id="contrast-toggle"
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

              <div style={{ ...styles.transcriptBody, backgroundColor: contrastMode ? HC.panelBg : undefined }}>
                {showSegments ? (
                  <TranscriptSegments
                    segments={transcriptSegments}
                    fontSize={fontSize}
                    contrastMode={contrastMode}
                    hcFontStack={hcFontStack}
                  />
                ) : (
                  <div
                    style={{
                      fontFamily: contrastMode ? hcFontStack : "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
                      fontSize: `${fontSize + (contrastMode ? 1 : 0)}px`,
                      color: contrastMode ? HC.text : "rgba(0,0,0,0.76)",
                      fontWeight: contrastMode ? 700 : 600,
                      lineHeight: contrastMode ? 1.85 : 1.7,
                      letterSpacing: contrastMode ? "0.01em" : undefined,
                      whiteSpace: "pre-wrap",
                      fontStyle: "italic",
                      transition: "font-size 150ms ease",
                    }}
                  >
                    {placeholderText}
                  </div>
                )}
              </div>
            </section>

            {/* Student Mic Dock — only shown when teacher has enabled student mics */}
            {studentMicEnabled && (
              <section
                style={{
                  ...styles.micDock,
                  backgroundColor: contrastMode ? HC.panelBg : "rgba(255,255,255,0.92)",
                  border: contrastMode ? `1px solid ${HC.divider}` : "1px solid rgba(0,0,0,0.08)",
                }}
                aria-label="Microphone"
              >
                <div style={styles.micDockInner}>
                  <div style={styles.micDockLeft}>
                    <div style={{ ...styles.micDockTitle, color: contrastMode ? HC.text : COLORS.black }}>
                      Your Mic
                    </div>
                    <div style={{ ...styles.micDockSub, color: contrastMode ? HC.text3 : "rgba(0,0,0,0.52)" }}>
                      {micOn
                        ? captionStatus || "Speaking — others can hear you"
                        : "Tap to speak in the session"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleMic}
                    style={{
                      ...styles.micToggleBtn,
                      backgroundColor: micOn
                        ? "rgba(44,177,166,0.14)"
                        : contrastMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                      border: micOn
                        ? "1px solid rgba(44,177,166,0.40)"
                        : contrastMode ? `1px solid ${HC.divider}` : "1px solid rgba(0,0,0,0.12)",
                    }}
                    aria-pressed={micOn}
                    aria-label={micOn ? "Turn off microphone" : "Turn on microphone"}
                  >
                    <span style={styles.micToggleIcon}>{micOn ? "🎙️" : "🔇"}</span>
                    <span style={{
                      ...styles.micToggleLabel,
                      color: micOn ? COLORS.teal : contrastMode ? HC.text3 : "rgba(0,0,0,0.58)",
                    }}>
                      {micOn ? "On" : "Off"}
                    </span>
                  </button>
                </div>

                {/* Animated mic-active indicator */}
                {micOn && (
                  <div style={styles.micActiveBar}>
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        style={{
                          ...styles.micBar,
                          animationDelay: `${i * 0.1}s`,
                          backgroundColor: COLORS.teal,
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </aside>
        </div>
      </div>

      {/* Fullscreen */}
      {isFullscreen && (
        <div role="dialog" aria-modal="true" style={styles.fsOverlay}>
          <div style={styles.fsCard}>
            <button type="button" onClick={closeFullscreen} style={styles.fsCloseBtn} aria-label="Exit fullscreen">
              Exit
            </button>
            <div ref={fsViewportRef} style={styles.fsViewport}>
              <div style={styles.fsCanvasWrap}>
                <canvas ref={fsCanvasRef} />
              </div>
            </div>
            <div style={styles.fsControls}>
              <div style={styles.fsCounter}>
                {page}/{numPages || (pdfDoc ? pdfDoc.numPages : 0)}
              </div>
            </div>
            {rendering && <div style={styles.fsStatus}>Rendering…</div>}
            {err && <div style={styles.fsError}>{err}</div>}
          </div>
        </div>
      )}

      {/* Mic animation keyframes injected once */}
      <style>{`
        @keyframes micPulse {
          0%, 100% { transform: scaleY(0.3); opacity: 0.5; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        [data-mic-bar] {
          animation: micPulse 0.8s ease-in-out infinite;
        }
      `}</style>
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", paddingTop: "var(--header-h)", boxSizing: "border-box", overflowX: "hidden", transition: "opacity 320ms ease, transform 420ms ease" },
  centerFrame: { minHeight: "calc(100vh - var(--header-h))", width: "100%", display: "grid", placeItems: "center", padding: "18px", boxSizing: "border-box" },
  shell: { maxWidth: "1440px", margin: "0 auto", boxSizing: "border-box" },
  joinCard: { width: "min(640px, 100%)", margin: "0 auto", borderRadius: "24px", backgroundColor: "rgba(255,255,255,0.92)", border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 28px 74px rgba(0,0,0,0.18)", padding: "18px", display: "grid", gap: "10px", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" },
  joinTitle: { fontFamily: "Merriweather, serif", fontSize: "clamp(22px, 2.4vw, 28px)", fontWeight: 900, letterSpacing: "-0.02em", color: COLORS.black },
  joinSub: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(13px, 1.3vw, 15px)", fontWeight: 650, lineHeight: 1.6, color: "rgba(0,0,0,0.66)" },
  joinRow: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" },
  joinInput: { width: "100%", boxSizing: "border-box", height: "52px", borderRadius: "16px", border: "1px solid rgba(0,0,0,0.14)", backgroundColor: "rgba(245,252,239,0.65)", padding: "0 14px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "18px", fontWeight: 900, letterSpacing: "0.12em", outline: "none", color: "rgba(0,0,0,0.80)", textTransform: "uppercase" },
  joinBtn: { height: "52px", padding: "0 20px", borderRadius: "16px", border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${COLORS.teal}, rgba(44,177,166,0.82))`, color: COLORS.white, fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "14px", fontWeight: 900, boxShadow: "0 16px 38px rgba(0,0,0,0.16)", flexShrink: 0 },
  joinHint: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "13px", fontWeight: 650 },
  layoutBase: { display: "grid", gap: "14px", alignItems: "stretch", minHeight: 0 },
  layoutWide: { gridTemplateColumns: "minmax(0, 1fr) clamp(340px, 32vw, 450px)", gridTemplateRows: "1fr" },
  layoutNarrow: { gridTemplateColumns: "1fr", gridTemplateRows: "auto auto" },
  slidesArea: { width: "100%", borderRadius: "22px", overflow: "hidden", minHeight: 0 },
  slideViewport: { position: "relative", width: "100%", height: "100%", backgroundColor: COLORS.beige, borderRadius: "22px", border: "2px dashed rgba(0,0,0,0.14)", boxShadow: "0 6px 12px rgba(0,0,0,0.08)", overflow: "hidden", display: "grid", placeItems: "center", transition: "box-shadow 220ms ease, border-color 160ms ease", minHeight: 0 },
  waitWrap: { width: "min(680px, 92%)", display: "grid", gap: "10px", textAlign: "center", padding: "16px" },
  waitTitle: { fontFamily: "Merriweather, serif", fontSize: "clamp(20px, 2.4vw, 28px)", fontWeight: 900, color: "rgba(0,0,0,0.84)" },
  waitSub: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(13px, 1.3vw, 15px)", fontWeight: 650, lineHeight: 1.6, color: "rgba(0,0,0,0.62)" },
  leaveBtn: { justifySelf: "center", border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "rgba(0,0,0,0.06)", borderRadius: "16px", padding: "10px 16px", cursor: "pointer", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "13px", fontWeight: 850, color: "rgba(0,0,0,0.74)", width: "fit-content" },
  canvasWrap: { width: "100%", height: "100%", display: "grid", placeItems: "center", padding: "16px", boxSizing: "border-box" },
  slideTopBar: { position: "absolute", top: "10px", left: "10px", right: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", pointerEvents: "none" },
  leaveTopBtn: { pointerEvents: "auto", border: "1px solid rgba(220,60,60,0.28)", backgroundColor: "rgba(255,255,255,0.82)", borderRadius: "14px", padding: "8px 12px", cursor: "pointer", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(11px, 1.15vw, 12.5px)", fontWeight: 900, color: "rgba(200,50,50,0.90)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" },
  fileChip: { pointerEvents: "auto", maxWidth: "46%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", backgroundColor: "rgba(255,255,255,0.75)", border: "1px solid rgba(0,0,0,0.10)", borderRadius: "999px", padding: "8px 10px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(11px, 1.15vw, 12.5px)", fontWeight: 850, color: "rgba(0,0,0,0.74)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" },
  topActionBtn: { pointerEvents: "auto", border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "rgba(255,255,255,0.78)", borderRadius: "14px", padding: "8px 10px", cursor: "pointer", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(11px, 1.15vw, 12.5px)", fontWeight: 900, color: "rgba(0,0,0,0.74)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" },
  slideControls: { position: "absolute", left: "12px", right: "12px", bottom: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", pointerEvents: "none" },
  counterPill: { pointerEvents: "none", backgroundColor: "rgba(44,177,166,0.14)", border: "1px solid rgba(44,177,166,0.28)", borderRadius: "999px", padding: "10px 12px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(12px, 1.2vw, 13px)", fontWeight: 950, color: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" },
  statusPillFloat: { position: "absolute", top: "54px", right: "12px", backgroundColor: "rgba(0,0,0,0.74)", color: COLORS.white, padding: "7px 10px", borderRadius: "999px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(11px, 1.1vw, 12px)", fontWeight: 900 },
  errorPill: { justifySelf: "center", backgroundColor: "rgba(232,91,91,0.92)", color: COLORS.white, padding: "10px 12px", borderRadius: "14px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(12px, 1.2vw, 13px)", fontWeight: 850, width: "fit-content", maxWidth: "min(900px, 92vw)" },
  errorPillFloat: { position: "absolute", left: "12px", right: "12px", top: "54px", backgroundColor: "rgba(232,91,91,0.92)", color: COLORS.white, padding: "10px 12px", borderRadius: "14px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(12px, 1.2vw, 13px)", fontWeight: 850, textAlign: "center" },
  rightRail: { width: "100%", display: "flex", flexDirection: "column", gap: "14px", minHeight: 0 },
  transcriptArea: { width: "100%", flex: "1 1 0", minHeight: 0, borderRadius: "22px", backgroundColor: COLORS.beigeDark, border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 4px 8px rgba(0,0,0,0.06)", overflow: "hidden", display: "flex", flexDirection: "column" },
  transcriptHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "12px 14px", borderBottom: "1px solid rgba(0,0,0,0.08)", backgroundColor: "rgba(255,255,255,0.55)", flexWrap: "wrap", flexShrink: 0 },
  transcriptTitle: { fontFamily: "Merriweather, serif", fontSize: "clamp(16px, 1.7vw, 18px)", fontWeight: 900, letterSpacing: "-0.02em" },
  transcriptBody: { flex: "1 1 0", minHeight: 0, padding: "14px", overflow: "auto" },
  gearBtn: { display: "flex", alignItems: "center", justifyContent: "center", width: "34px", height: "34px", borderRadius: "10px", cursor: "pointer", padding: 0, transition: "background-color 140ms ease, border-color 140ms ease" },
  settingsPopup: { position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 200, width: "clamp(220px, 30vw, 260px)", borderRadius: "18px", backgroundColor: "rgba(255,255,255,0.97)", border: "1px solid rgba(0,0,0,0.10)", boxShadow: "0 20px 54px rgba(0,0,0,0.20)", padding: "14px", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "grid", gap: "14px" },
  settingsTitle: { fontFamily: "Merriweather, serif", fontSize: "14px", fontWeight: 900, color: "rgba(0,0,0,0.84)", letterSpacing: "-0.01em" },
  settingsRow: { display: "grid", gap: "8px" },
  settingsLabel: { display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "12px", fontWeight: 800, color: "rgba(0,0,0,0.72)", letterSpacing: "0.02em", textTransform: "uppercase" },
  settingsValue: { fontWeight: 700, color: COLORS.teal, textTransform: "none", letterSpacing: 0, fontSize: "12px" },
  sliderTrackWrap: { display: "grid", gap: "4px" },
  slider: { width: "100%", accentColor: COLORS.teal, cursor: "pointer", height: "4px" },
  sliderLabels: { display: "flex", justifyContent: "space-between", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "11px", fontWeight: 700, color: "rgba(0,0,0,0.46)", paddingTop: "2px" },
  toggleTrack: { position: "relative", width: "44px", height: "24px", borderRadius: "999px", border: "none", cursor: "pointer", padding: 0, transition: "background-color 200ms ease", flexShrink: 0 },
  toggleThumb: { position: "absolute", top: "3px", width: "18px", height: "18px", borderRadius: "50%", backgroundColor: COLORS.white, boxShadow: "0 1px 4px rgba(0,0,0,0.28)", transition: "transform 200ms ease", display: "block" },
  // Mic dock
  micDock: { width: "100%", flexShrink: 0, borderRadius: "18px", boxShadow: "0 4px 8px rgba(0,0,0,0.06)", padding: "12px 14px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "10px" },
  micDockInner: { display: "flex", alignItems: "center", gap: "12px" },
  micDockLeft: { flex: "1 1 0", display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 },
  micDockTitle: { fontFamily: "Merriweather, serif", fontSize: "clamp(13px, 1.4vw, 15px)", fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.1 },
  micDockSub: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(11px, 1.1vw, 12px)", fontWeight: 650, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  micToggleBtn: { flexShrink: 0, borderRadius: "14px", padding: "10px 14px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", transition: "background-color 150ms ease, border-color 150ms ease", minWidth: "60px" },
  micToggleIcon: { fontSize: "clamp(20px, 2.6vw, 26px)", lineHeight: 1 },
  micToggleLabel: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "clamp(9px, 1vw, 11px)", fontWeight: 900, letterSpacing: "0.03em", textTransform: "uppercase", lineHeight: 1.2 },
  micActiveBar: { display: "flex", alignItems: "center", justifyContent: "center", gap: "3px", height: "20px" },
  micBar: { width: "3px", borderRadius: "2px", height: "100%", animationName: "micPulse", animationDuration: "0.8s", animationTimingFunction: "ease-in-out", animationIterationCount: "infinite" },
  // Fullscreen
  fsOverlay: { position: "fixed", inset: 0, backgroundColor: "rgba(5,6,7,0.96)", zIndex: 20000, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  fsCard: { width: "100vw", height: "100vh", position: "relative", display: "flex", flexDirection: "column" },
  fsCloseBtn: { position: "fixed", top: "8px", right: "8px", zIndex: 20003, border: "1px solid rgba(255,182,193,0.40)", backgroundColor: "rgba(255,182,193,0.25)", borderRadius: "12px", padding: "8px 14px", cursor: "pointer", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "13px", fontWeight: 700, color: "rgba(255,105,130,0.95)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" },
  fsViewport: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", zIndex: 20001 },
  fsCanvasWrap: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "8px", boxSizing: "border-box" },
  fsControls: { position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "clamp(12px, 3vh, 20px)", display: "flex", alignItems: "center", justifyContent: "center", gap: "clamp(6px, 2vw, 10px)", pointerEvents: "none", zIndex: 20002 },
  fsCounter: { pointerEvents: "none", backgroundColor: "rgba(44,177,166,0.82)", border: "1px solid rgba(44,177,166,0.40)", borderRadius: "999px", padding: "10px 16px", fontFamily: "Inter, system-ui, -apple-system, sans-serif", fontSize: "14px", fontWeight: 950, color: "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", whiteSpace: "nowrap" },
  fsStatus: { position: "fixed", top: "8px", left: "50%", transform: "translateX(-50%)", backgroundColor: "rgba(0,0,0,0.74)", color: COLORS.white, padding: "6px 12px", borderRadius: "999px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "11px", fontWeight: 900, zIndex: 20002 },
  fsError: { position: "fixed", left: "8px", right: "8px", top: "8px", backgroundColor: "rgba(232,91,91,0.92)", color: COLORS.white, padding: "10px 14px", borderRadius: "14px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif", fontSize: "12px", fontWeight: 850, textAlign: "center", zIndex: 20002 },
};
