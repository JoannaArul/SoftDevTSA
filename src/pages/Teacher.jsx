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
    `${BACKEND_HTTP}/upload?code=${encodeURIComponent(code)}&numPages=${encodeURIComponent(
      String(numPages || 0)
    )}`,
    { method: "POST", body: form }
  );
  if (!res.ok) throw new Error("upload failed");
  return res.json();
}

function wsSend(ws, obj) {
  if (!ws || ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch {}
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

export default function Teacher({ onFullscreenChange }) {
  const fileInputRef = useRef(null);
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const fsViewportRef = useRef(null);
  const fsCanvasRef = useRef(null);
  const renderIdRef = useRef(0);
  const renderTaskRef = useRef(null); // Track normal canvas render task
  const fsRenderTaskRef = useRef(null); // Track fullscreen canvas render task
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
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [rendering, setRendering] = useState(false);

  const [pdfErr, setPdfErr] = useState("");
  const [wsErr, setWsErr] = useState("");

  const [micOn, setMicOn] = useState(false);
  const [captionMode, setCaptionMode] = useState("local");
  const [transcriptText, setTranscriptText] = useState("");
  const [captionStatus, setCaptionStatus] = useState("");

  const [joinCode, setJoinCode] = useState(() => makeCode());
  const [copied, setCopied] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [studentCount, setStudentCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const TRANSCRIBE_URL = `${BACKEND_HTTP}/transcribe`;

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const calc = () => {
      const h = window.innerHeight || 0;
      const w = window.innerWidth || 0;
      setIsShort(h < 760);
      setIsNarrow(w < 1024);
    };
    calc();
    window.addEventListener("resize", calc, { passive: true });
    return () => window.removeEventListener("resize", calc);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        closeFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [isFullscreen]);

  const maybeBroadcastTranscript = (text) => {
    const now = Date.now();
    if (now - lastTxRef.current < 250) return;
    lastTxRef.current = now;
    wsSend(wsRef.current, { type: "transcript", text });
  };

  const transcript = useMemo(() => {
    if (transcriptText) return transcriptText;
    if (captionStatus) return captionStatus;
    if (wsErr && !pdfDoc) return "Ready. Upload slides to begin.";
    return pdfDoc
      ? "Turn on your mic to start live captions."
      : "Upload slides to start. Live captions and transcript will appear here.";
  }, [pdfDoc, transcriptText, captionStatus, wsErr]);

  const connectRoom = (code) => {
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    if (!code) return;

    setWsErr("");

    try {
      const ws = new WebSocket(`${BACKEND_WS}/ws?code=${encodeURIComponent(code)}&role=teacher`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsErr("");
        if (pdfDoc) {
          wsSend(ws, { type: "pdf", url: "", name: pdfName || "", numPages: numPages || 0 });
          wsSend(ws, { type: "slide", page, numPages });
        } else {
          wsSend(ws, { type: "slide", page: 1, numPages: 0 });
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data || "{}");
          if (msg?.type === "presence" && typeof msg?.count === "number") setStudentCount(msg.count);
        } catch {}
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
      };

      ws.onerror = () => {
        setWsErr("Session server connection issue.");
      };
    } catch {
      setWsErr("Couldn't connect to session server.");
    }
  };

  useEffect(() => {
    if (!joinCode) return;
    connectRoom(joinCode);
    return () => {
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };
  }, [joinCode]);

  const broadcastSlide = (code, pageNum, total) => {
    const ws = wsRef.current;
    if (!code || !ws || ws.readyState !== 1) return;
    wsSend(ws, { type: "slide", page: pageNum, numPages: total });
  };

  useEffect(() => {
    if (!joinCode || !pdfDoc) return;
    broadcastSlide(joinCode, page, numPages);
  }, [joinCode, pdfDoc, page, numPages]);

  const openPicker = () => fileInputRef.current?.click();

  const acceptFile = async (file) => {
    if (!file) return;
    const ok = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!ok) {
      setPdfErr("Please upload a PDF file.");
      return;
    }

    const code = joinCode;

    setPdfErr("");
    setLoadingPdf(true);
    setPdfName(file.name);
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
        const data = await uploadPdfToRoom(file, code, doc.numPages);
        const url = data?.url || "";
        const name = data?.name || file.name;

        if (url) {
          wsSend(wsRef.current, { type: "pdf", url, name, numPages: doc.numPages });
          wsSend(wsRef.current, { type: "slide", page: 1, numPages: doc.numPages });
        } else {
          setPdfErr("PDF uploaded, but the server didn't return a URL. Check /upload response.");
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

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    acceptFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    acceptFile(f);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

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

    // CRITICAL: Cancel any ongoing render on this canvas
    if (taskRef.current) {
      try {
        taskRef.current.cancel();
      } catch (e) {
        console.log("Cancel render task:", e);
      }
      taskRef.current = null;
    }

    const myRenderId = ++renderIdRef.current;
    setRendering(true);
    setPdfErr("");

    try {
      const pdfPage = await doc.getPage(pageNum);
      
      // Check if this render is still valid
      if (myRenderId !== renderIdRef.current) return;
      
      // Calculate padding based on mode - REDUCED for fullscreen to use more space
      const padding = fullscreen ? 20 : 22;
      const maxW = Math.max(240, viewportEl.clientWidth - padding);
      const maxH = Math.max(240, viewportEl.clientHeight - padding);
      
      // Get viewport at scale 1
      const v1 = pdfPage.getViewport({ scale: 1 });
      
      // Calculate scale to fit
      const scale = Math.min(maxW / v1.width, maxH / v1.height);
      const viewport = pdfPage.getViewport({ scale });
      
      const dpr = window.devicePixelRatio || 1;

      // Set canvas dimensions
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = canvas.getContext("2d");
      
      // Clear and set transform
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Check again before rendering
      if (myRenderId !== renderIdRef.current) return;

      // Start the render and save the task
      const renderTask = pdfPage.render({ canvasContext: ctx, viewport });
      taskRef.current = renderTask;

      // Wait for render to complete
      await renderTask.promise;
      
      // Clear the task reference on success
      if (taskRef.current === renderTask) {
        taskRef.current = null;
      }
      
      if (myRenderId !== renderIdRef.current) return;
    } catch (err) {
      // Ignore cancellation errors
      if (err.name === 'RenderingCancelledException') {
        console.log("Render cancelled (expected)");
        return;
      }
      console.error("PDF render error:", err);
      if (myRenderId === renderIdRef.current) {
        setPdfErr("Couldn't render this slide.");
      }
    } finally {
      if (myRenderId === renderIdRef.current) setRendering(false);
    }
  };

  useEffect(() => {
    if (!pdfDoc || isFullscreen) return; // Don't render normal canvas when fullscreen is open
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
    return () => {
      cancelled = true;
    };
  }, [isFullscreen, pdfDoc, page]);

  useEffect(() => {
    if (!pdfDoc) return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (isFullscreen) {
          // Only render fullscreen canvas
          waitForStableBox(fsViewportRef.current, 10).then(() => renderPageToCanvas(pdfDoc, page, true));
        } else {
          // Only render normal canvas
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

  const canPrev = pdfDoc && page > 1 && !rendering && !loadingPdf;
  const canNext = pdfDoc && page < numPages && !rendering && !loadingPdf;
  const prev = () => setPage((p) => Math.max(1, p - 1));
  const next = () => setPage((p) => Math.min(numPages, p + 1));

  const stopCaptions = () => {
    isStoppingRef.current = true;
    setCaptionStatus("");

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    if (chunkTimerRef.current) {
      try {
        window.clearInterval(chunkTimerRef.current);
      } catch {}
      chunkTimerRef.current = null;
    }

    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }

    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks()?.forEach((t) => t.stop());
      } catch {}
      mediaStreamRef.current = null;
    }

    setTimeout(() => {
      isStoppingRef.current = false;
    }, 100);
  };

  useEffect(() => {
    return () => {
      // Cancel any ongoing renders when unmounting
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
      }
      if (fsRenderTaskRef.current) {
        try {
          fsRenderTaskRef.current.cancel();
        } catch (e) {}
      }
      stopCaptions();
    };
  }, []);

  const startLocalCaptions = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCaptionStatus("Local captions aren't supported in this browser. Try Chrome/Edge.");
      setMicOn(false);
      return;
    }

    isStoppingRef.current = false;
    setCaptionStatus("Listening (Local)…");
    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    let finalText = "";

    rec.onstart = () => {
      if (!isStoppingRef.current) setCaptionStatus("");
    };

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
      setTranscriptText(combined);
      maybeBroadcastTranscript(combined);
    };

    rec.onerror = (e) => {
      if (isStoppingRef.current) return;
      if (e.error === "no-speech") return;
      if (e.error === "aborted") return;
      const msg = e?.error ? `Local captions error: ${e.error}` : "Local captions error. Check microphone permissions.";
      setCaptionStatus(msg);
    };

    rec.onend = () => {
      if (isStoppingRef.current) return;
      if (micOn && captionMode === "local" && recognitionRef.current === rec) {
        setTimeout(() => {
          if (!isStoppingRef.current && micOn && captionMode === "local") {
            try {
              rec.start();
            } catch {
              if (!isStoppingRef.current) setCaptionStatus("Captions paused. Click mic to restart.");
            }
          }
        }, 100);
      }
    };

    try {
      rec.start();
    } catch {
      setCaptionStatus("Couldn't start local captions. Refresh and allow microphone access.");
      setMicOn(false);
    }
  };

  const startHostedCaptions = async () => {
    setCaptionStatus("Hosted captions are currently disabled.");
    setMicOn(false);
  };

  const toggleMic = async () => {
    if (micOn) {
      setMicOn(false);
      stopCaptions();
      setCaptionStatus("Mic off");
      return;
    }

    setTranscriptText("");
    setCaptionStatus("");
    setMicOn(true);

    if (captionMode === "local") startLocalCaptions();
    else await startHostedCaptions();
  };

  const switchMode = async (mode) => {
    if (mode === "hosted") {
      setCaptionStatus("Hosted captions are currently disabled.");
      return;
    }
    if (mode === captionMode) return;

    const wasOn = micOn;
    if (wasOn) {
      setMicOn(false);
      stopCaptions();
    }

    setCaptionMode(mode);
    setCaptionStatus("");
    setTranscriptText("");

    if (wasOn) {
      setMicOn(true);
      startLocalCaptions();
    }
  };

  const ensureJoinCode = async (openModal) => {
    const nextCode = joinCode || makeCode();
    setJoinCode(nextCode);
    try {
      await navigator.clipboard.writeText(nextCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
    if (openModal) setJoinModalOpen(true);
  };

  const closeJoinModal = () => setJoinModalOpen(false);

  const openFullscreen = async () => {
    setIsFullscreen(true);
    onFullscreenChange?.(true); // Notify parent to hide header
    requestAnimationFrame(async () => {
      await waitForStableBox(fsViewportRef.current);
      if (pdfDoc) renderPageToCanvas(pdfDoc, page, true);
    });
  };

  const closeFullscreen = () => {
    // Cancel fullscreen render task
    if (fsRenderTaskRef.current) {
      try {
        fsRenderTaskRef.current.cancel();
      } catch (e) {}
      fsRenderTaskRef.current = null;
    }
    setIsFullscreen(false);
    onFullscreenChange?.(false); // Notify parent to show header
  };

  const layoutStyle = isNarrow ? styles.layoutNarrow : styles.layoutWide;

  const shellPad = isShort ? "10px 12px" : "clamp(12px, 2.2vw, 20px) 16px";
  const gap = isShort ? "12px" : "14px";

  const pageStyle = {
    ...styles.page,
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0px)" : "translateY(10px)",
    overflowY: isFullscreen ? "hidden" : "auto",
    WebkitOverflowScrolling: "touch",
  };

  const shellStyle = isNarrow
    ? { ...styles.shell, padding: shellPad, height: "auto", minHeight: "calc(100vh - var(--header-h))", overflow: "visible" }
    : { ...styles.shell, padding: shellPad, height: "calc(100vh - var(--header-h))", overflow: "visible" };

  const layoutCombined = isNarrow
    ? { ...styles.layoutBase, ...layoutStyle, gap, height: "auto", minHeight: 0, alignContent: "start" }
    : { ...styles.layoutBase, ...layoutStyle, gap, height: "100%" };

  const slidesAreaStyle = isNarrow
    ? { ...styles.slidesArea, height: "clamp(500px, 65vh, 850px)" }
    : { ...styles.slidesArea, height: "100%" };

  const rightRailStyle = isNarrow
    ? { ...styles.rightRail, height: "auto", overflow: "visible" }
    : { ...styles.rightRail, height: "100%", overflow: "hidden" };

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
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={onPickFile}
                style={{ display: "none" }}
              />

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
                  <div style={styles.canvasWrap}>
                    <canvas ref={canvasRef} />
                  </div>

                  <div style={styles.slideTopBar}>
                    <div style={styles.fileChip} title={pdfName}>
                      {pdfName}
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", pointerEvents: "auto" }}>
                      <button type="button" onClick={openPicker} style={styles.topActionBtn}>
                        Change PDF
                      </button>
                      <button type="button" onClick={openFullscreen} style={styles.topActionBtn}>
                        Fullscreen
                      </button>
                    </div>
                  </div>

                  <div style={styles.slideControls}>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", pointerEvents: "auto" }}>
                      <button
                        type="button"
                        onClick={prev}
                        disabled={!canPrev}
                        style={{ ...styles.navBtn, opacity: canPrev ? 1 : 0.45 }}
                      >
                        Prev
                      </button>

                      <div style={styles.counterPill}>
                        Slide {page} / {numPages}
                      </div>

                      <button
                        type="button"
                        onClick={next}
                        disabled={!canNext}
                        style={{ ...styles.navBtn, opacity: canNext ? 1 : 0.45 }}
                      >
                        Next
                      </button>
                    </div>
                  </div>

                  {(rendering || loadingPdf) && <div style={styles.statusPillFloat}>Rendering…</div>}
                  {!!pdfErr && <div style={styles.errorPillFloat}>{pdfErr}</div>}
                </>
              )}
            </div>
          </section>

          <aside style={{ ...rightRailStyle, gap }} aria-label="Live transcript and session controls">
            <section style={styles.transcriptArea} aria-label="Transcript">
              <div style={styles.transcriptHeader}>
                <div style={styles.transcriptTitle}>Live Transcript</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <div style={styles.modePills} role="group" aria-label="Captions mode">
                    <button
                      type="button"
                      onClick={() => switchMode("local")}
                      style={{
                        ...styles.modePill,
                        backgroundColor: captionMode === "local" ? "rgba(44,177,166,0.16)" : "rgba(0,0,0,0.06)",
                        borderColor: captionMode === "local" ? "rgba(44,177,166,0.34)" : "rgba(0,0,0,0.10)",
                      }}
                      aria-pressed={captionMode === "local"}
                    >
                      Local
                    </button>
                    <button
                      type="button"
                      onClick={() => switchMode("hosted")}
                      style={{
                        ...styles.modePill,
                        opacity: 0.6,
                        cursor: "not-allowed",
                        backgroundColor: "rgba(0,0,0,0.06)",
                        borderColor: "rgba(0,0,0,0.10)",
                      }}
                      aria-pressed={false}
                    >
                      Hosted
                    </button>
                  </div>
                  <div style={styles.transcriptBadge}>{micOn ? "Listening" : "Mic off"}</div>
                </div>
              </div>

              <div style={styles.transcriptBody}>
                <div style={styles.transcriptText}>{transcript}</div>
              </div>
            </section>

            <section style={styles.controlDock} aria-label="Session controls">
              <div style={styles.dockHeader}>
                <div style={styles.dockTitle}>Session Controls</div>
                <div style={styles.dockSub}>{wsErr ? "Backend connection hiccup" : "Live session ready"}</div>
              </div>

              <div style={styles.dockGrid}>
                <button
                  type="button"
                  onClick={toggleMic}
                  style={{
                    ...styles.compactTile,
                    backgroundColor: micOn ? "rgba(44,177,166,0.14)" : "rgba(0,0,0,0.05)",
                    border: micOn ? "1px solid rgba(44,177,166,0.34)" : "1px solid rgba(0,0,0,0.10)",
                  }}
                  aria-pressed={micOn}
                >
                  <div style={styles.compactIcon}>{micOn ? "🎙️" : "🔇"}</div>
                  <div style={styles.compactLabel}>Mic</div>
                </button>

                <div style={styles.compactTile} aria-label="Viewers connected">
                  <div style={styles.compactIcon}>{studentCount}</div>
                  <div style={styles.compactLabel}>Viewers</div>
                </div>

                <button type="button" onClick={() => ensureJoinCode(true)} style={styles.joinCompactBtn}>
                  <div style={styles.joinCompactCode}>{joinCode || "CODE"}</div>
                  <div style={styles.joinCompactLabel}>Join Code</div>
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {joinModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={styles.modalOverlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeJoinModal();
          }}
        >
          <div style={styles.modalCard}>
            <div style={styles.modalTitle}>Join Code</div>
            <button type="button" onClick={() => ensureJoinCode(false)} style={styles.modalCodeBtn}>
              {joinCode || "Generate"}
            </button>
            <div style={styles.modalSub}>{copied ? "Copied to clipboard." : "Click the code to copy."}</div>
            <button type="button" onClick={closeJoinModal} style={styles.modalCloseBtn}>
              Close
            </button>
          </div>
        </div>
      )}

      {isFullscreen && (
        <div role="dialog" aria-modal="true" style={styles.fsOverlay}>
          <div style={styles.fsCard}>
            <button 
              type="button" 
              onClick={closeFullscreen} 
              style={styles.fsCloseBtn} 
              aria-label="Exit fullscreen"
            >
              Exit
            </button>

            <div ref={fsViewportRef} style={styles.fsViewport}>
              <div style={styles.fsCanvasWrap}>
                <canvas ref={fsCanvasRef} />
              </div>

              <div style={styles.fsControls}>
                <button
                  type="button"
                  onClick={prev}
                  disabled={!canPrev}
                  style={{ ...styles.fsNavBtn, opacity: canPrev ? 1 : 0.4 }}
                >
                  ← Prev
                </button>
                <div style={styles.fsCounter}>
                  Slide {page} / {numPages}
                </div>
                <button
                  type="button"
                  onClick={next}
                  disabled={!canNext}
                  style={{ ...styles.fsNavBtn, opacity: canNext ? 1 : 0.4 }}
                >
                  Next →
                </button>
              </div>

              {(rendering || loadingPdf) && <div style={styles.fsStatus}>Rendering…</div>}
              {!!pdfErr && <div style={styles.fsError}>{pdfErr}</div>}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const styles = {
  page: {
  minHeight: "100vh",
  paddingTop: "var(--header-h)",
  boxSizing: "border-box",
  backgroundColor: COLORS.pageBg,
  overflowX: "hidden",
  transition: "opacity 320ms ease, transform 420ms ease",
},
  shell: {
    maxWidth: "1440px",
    margin: "0 auto",
    boxSizing: "border-box",
  },
  layoutBase: {
    display: "grid",
    gap: "14px",
    alignItems: "stretch",
    minHeight: 0,
  },
  layoutWide: {
    gridTemplateColumns: "minmax(0, 1fr) clamp(340px, 32vw, 450px)",
    gridTemplateRows: "1fr",
  },
  layoutNarrow: {
    gridTemplateColumns: "1fr",
    gridTemplateRows: "auto auto",
  },
  slidesArea: {
    width: "100%",
    borderRadius: "22px",
    overflow: "hidden",
    minHeight: 0,
  },
  slideViewport: {
    position: "relative",
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.beige,
    borderRadius: "22px",
    border: "2px dashed rgba(0,0,0,0.14)",
    boxShadow: "0 6px 12px rgba(0,0,0,0.08)",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
    transition: "box-shadow 220ms ease, border-color 160ms ease",
  },
  uploadOverlayBtn: {
    width: "100%",
    height: "100%",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    padding: "18px",
  },
  uploadInner: {
    width: "min(720px, 100%)",
    textAlign: "center",
    display: "grid",
    gap: "10px",
    padding: "12px",
  },
  uploadTitle: {
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(30px, 3.6vw, 52px)",
    fontWeight: 900,
    letterSpacing: "-0.03em",
    color: COLORS.black,
    lineHeight: 1.05,
  },
  uploadSub: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(13px, 1.2vw, 16px)",
    fontWeight: 650,
    lineHeight: 1.65,
    color: "rgba(0,0,0,0.68)",
  },
  canvasWrap: {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    padding: "16px",
    boxSizing: "border-box",
  },
  slideTopBar: {
    position: "absolute",
    top: "10px",
    left: "10px",
    right: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    pointerEvents: "none",
  },
  fileChip: {
    pointerEvents: "auto",
    maxWidth: "62%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    backgroundColor: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(0,0,0,0.10)",
    borderRadius: "999px",
    padding: "8px 10px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(11px, 1.15vw, 12.5px)",
    fontWeight: 850,
    color: "rgba(0,0,0,0.74)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  },
  topActionBtn: {
    pointerEvents: "auto",
    border: "1px solid rgba(0,0,0,0.12)",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderRadius: "14px",
    padding: "8px 10px",
    cursor: "pointer",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(11px, 1.15vw, 12.5px)",
    fontWeight: 900,
    color: "rgba(0,0,0,0.74)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  },
  slideControls: {
    position: "absolute",
    left: "12px",
    right: "12px",
    bottom: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    pointerEvents: "none",
  },
  navBtn: {
    pointerEvents: "auto",
    border: "1px solid rgba(0,0,0,0.12)",
    backgroundColor: "rgba(255,255,255,0.82)",
    borderRadius: "14px",
    padding: "10px 12px",
    cursor: "pointer",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(12px, 1.2vw, 13px)",
    fontWeight: 900,
    color: "rgba(0,0,0,0.78)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  },
  counterPill: {
    pointerEvents: "none",
    backgroundColor: "rgba(44,177,166,0.14)",
    border: "1px solid rgba(44,177,166,0.28)",
    borderRadius: "999px",
    padding: "10px 12px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(12px, 1.2vw, 13px)",
    fontWeight: 950,
    color: "rgba(0,0,0,0.72)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  },
  statusPill: {
    justifySelf: "center",
    backgroundColor: "rgba(0,0,0,0.74)",
    color: COLORS.white,
    padding: "7px 10px",
    borderRadius: "999px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(11px, 1.1vw, 12px)",
    fontWeight: 900,
    width: "fit-content",
  },
  statusPillFloat: {
    position: "absolute",
    top: "54px",
    right: "12px",
    backgroundColor: "rgba(0,0,0,0.74)",
    color: COLORS.white,
    padding: "7px 10px",
    borderRadius: "999px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(11px, 1.1vw, 12px)",
    fontWeight: 900,
  },
  errorPill: {
    justifySelf: "center",
    backgroundColor: "rgba(232,91,91,0.92)",
    color: COLORS.white,
    padding: "10px 12px",
    borderRadius: "14px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(12px, 1.2vw, 13px)",
    fontWeight: 850,
    width: "fit-content",
    maxWidth: "min(900px, 92vw)",
  },
  errorPillFloat: {
    position: "absolute",
    left: "12px",
    right: "12px",
    top: "54px",
    backgroundColor: "rgba(232,91,91,0.92)",
    color: COLORS.white,
    padding: "10px 12px",
    borderRadius: "14px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(12px, 1.2vw, 13px)",
    fontWeight: 850,
    textAlign: "center",
  },
  rightRail: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    minHeight: 0,
  },
  transcriptArea: {
    width: "100%",
    flex: "1 1 0",
    minHeight: "clamp(280px, 48vh, 520px)",
    borderRadius: "22px",
    backgroundColor: COLORS.beigeDark,
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 4px 8px rgba(0,0,0,0.06)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  transcriptHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    padding: "12px 14px",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    backgroundColor: "rgba(255,255,255,0.55)",
    flexWrap: "wrap",
    flexShrink: 0,
  },
  transcriptTitle: {
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(16px, 1.7vw, 18px)",
    fontWeight: 900,
    letterSpacing: "-0.02em",
    color: COLORS.black,
  },
  transcriptBadge: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(11px, 1.1vw, 12px)",
    fontWeight: 900,
    padding: "6px 10px",
    borderRadius: "999px",
    backgroundColor: "rgba(0,0,0,0.08)",
    color: "rgba(0,0,0,0.70)",
    whiteSpace: "nowrap",
  },
  modePills: {
    display: "flex",
    gap: "6px",
    padding: "4px",
    borderRadius: "999px",
    border: "1px solid rgba(0,0,0,0.08)",
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  modePill: {
    border: "1px solid rgba(0,0,0,0.10)",
    borderRadius: "999px",
    padding: "6px 10px",
    cursor: "pointer",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(11px, 1.1vw, 12px)",
    fontWeight: 900,
    color: "rgba(0,0,0,0.72)",
    lineHeight: 1,
    appearance: "none",
    background: "rgba(0,0,0,0.06)",
  },
  transcriptBody: {
    flex: "1 1 0",
    minHeight: 0,
    padding: "14px",
    overflow: "auto",
  },
  transcriptText: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(14px, 1.25vw, 15px)",
    lineHeight: 1.7,
    fontWeight: 600,
    color: "rgba(0,0,0,0.76)",
    whiteSpace: "pre-wrap",
  },
  controlDock: {
    width: "100%",
    flexShrink: 0,
    borderRadius: "18px",
    backgroundColor: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 4px 8px rgba(0,0,0,0.06)",
    padding: "8px",
    boxSizing: "border-box",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  dockHeader: {
    display: "grid",
    gap: "3px",
    padding: "2px 4px 2px",
    flexShrink: 0,
  },
  dockTitle: {
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(12px, 1.3vw, 13px)",
    fontWeight: 900,
    letterSpacing: "-0.02em",
    color: COLORS.black,
    lineHeight: 1.1,
  },
  dockSub: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(11px, 1.1vw, 12px)",
    fontWeight: 650,
    color: "rgba(0,0,0,0.58)",
  },
  dockGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    flexShrink: 0,
  },
  compactTile: {
    borderRadius: "14px",
    padding: "clamp(7px, 1.1vw, 9px)",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
    textAlign: "center",
    boxShadow: "none",
    outline: "none",
    border: "1px solid rgba(0,0,0,0.10)",
    backgroundColor: "rgba(0,0,0,0.04)",
    minHeight: "clamp(52px, 7.8vh, 64px)",
  },
  compactIcon: {
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(16px, 2.0vw, 22px)",
    fontWeight: 900,
    color: "rgba(0,0,0,0.84)",
    lineHeight: 1,
  },
  compactLabel: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(9px, 1vw, 11px)",
    fontWeight: 900,
    color: "rgba(0,0,0,0.62)",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    lineHeight: 1.2,
  },
  joinCompactBtn: {
    gridColumn: "1 / span 2",
    border: "none",
    borderRadius: "16px",
    padding: "clamp(9px, 1.2vw, 11px)",
    cursor: "pointer",
    background: `linear-gradient(135deg, ${COLORS.teal}, rgba(44,177,166,0.82))`,
    color: COLORS.white,
    boxShadow: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
    textAlign: "center",
    minHeight: "clamp(58px, 8.6vh, 70px)",
  },
  joinCompactCode: {
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(17px, 2.2vw, 22px)",
    fontWeight: 900,
    letterSpacing: "0.08em",
    lineHeight: 1,
  },
  joinCompactLabel: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(9px, 1vw, 11px)",
    fontWeight: 900,
    color: "rgba(255,255,255,0.86)",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    lineHeight: 1.2,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.52)",
    display: "grid",
    placeItems: "center",
    padding: "18px",
    zIndex: 50,
  },
  modalCard: {
    width: "min(560px, 94vw)",
    borderRadius: "26px",
    backgroundColor: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.10)",
    boxShadow: "0 32px 88px rgba(0,0,0,0.34)",
    padding: "18px",
    boxSizing: "border-box",
    display: "grid",
    gap: "12px",
    justifyItems: "center",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  modalTitle: {
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(18px, 2vw, 20px)",
    fontWeight: 900,
    letterSpacing: "-0.02em",
    color: "rgba(0,0,0,0.84)",
  },
  modalCodeBtn: {
    width: "100%",
    border: "none",
    borderRadius: "22px",
    backgroundColor: COLORS.teal,
    color: COLORS.white,
    padding: "18px 16px",
    cursor: "pointer",
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(34px, 5vw, 54px)",
    fontWeight: 900,
    letterSpacing: "0.10em",
    boxShadow: "0 22px 54px rgba(0,0,0,0.20)",
  },
  modalSub: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(12px, 1.2vw, 13px)",
    fontWeight: 650,
    color: "rgba(0,0,0,0.64)",
    textAlign: "center",
  },
  modalCloseBtn: {
    border: "1px solid rgba(0,0,0,0.12)",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: "16px",
    padding: "10px 12px",
    cursor: "pointer",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(12px, 1.2vw, 13px)",
    fontWeight: 850,
    color: "rgba(0,0,0,0.72)",
    width: "fit-content",
  },
  fsOverlay: {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(5, 6, 7, 0.96)",
  zIndex: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
},

fsCard: {
  width: "100vw",
  height: "100vh",
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  justifyContent: "space-between",
},

fsCloseBtn: {
  position: "absolute",
  top: "clamp(8px, 1.2vw, 14px)",
  right: "clamp(8px, 1.2vw, 14px)",
  zIndex: 1001,
  border: "1px solid rgba(255,182,193,0.40)",
  backgroundColor: "rgba(255,182,193,0.25)",
  borderRadius: "12px",
  padding: "clamp(6px, 1vw, 8px) clamp(12px, 1.5vw, 16px)",
  cursor: "pointer",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  fontSize: "clamp(12px, 1.3vw, 14px)",
  fontWeight: 700,
  letterSpacing: "0.02em",
  color: "rgba(255,105,130,0.95)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 4px 12px rgba(255,105,130,0.15)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  transition: "all 0.2s ease",
},

fsViewport: {
  position: "relative",
  width: "100%",
  flex: "1 1 0",
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  paddingTop: "clamp(50px, 8vh, 60px)",
  paddingBottom: "clamp(70px, 12vh, 90px)",
},

fsCanvasWrap: {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "clamp(8px, 1.2vw, 16px)",
  boxSizing: "border-box",
},

fsControls: {
  position: "absolute",
  left: "clamp(8px, 1.5vw, 20px)",
  right: "clamp(8px, 1.5vw, 20px)",
  bottom: "clamp(8px, 1.5vw, 20px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "clamp(6px, 1.5vw, 16px)",
  pointerEvents: "none",
  zIndex: 1000,
},

fsNavBtn: {
  pointerEvents: "auto",
  border: "1px solid rgba(44,177,166,0.40)",
  backgroundColor: "rgba(255,255,255,0.92)",
  borderRadius: "12px",
  padding: "clamp(8px, 1.2vw, 12px) clamp(10px, 1.8vw, 16px)",
  cursor: "pointer",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  fontSize: "clamp(12px, 1.3vw, 15px)",
  fontWeight: 900,
  color: COLORS.teal,
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  transition: "background-color 0.2s ease",
  whiteSpace: "nowrap",
},

fsCounter: {
  pointerEvents: "none",
  backgroundColor: "rgba(44,177,166,0.82)",
  border: "1px solid rgba(44,177,166,0.40)",
  borderRadius: "999px",
  padding: "clamp(8px, 1.2vw, 12px) clamp(12px, 2vw, 18px)",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  fontSize: "clamp(11px, 1.3vw, 15px)",
  fontWeight: 950,
  color: "rgba(255,255,255,0.96)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  whiteSpace: "nowrap",
},

fsStatus: {
  position: "absolute",
  top: "clamp(8px, 1.5vw, 20px)",
  left: "50%",
  transform: "translateX(-50%)",
  backgroundColor: "rgba(0,0,0,0.74)",
  color: COLORS.white,
  padding: "6px 12px",
  borderRadius: "999px",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  fontSize: "clamp(10px, 1.1vw, 13px)",
  fontWeight: 900,
  zIndex: 1000,
},

fsError: {
  position: "absolute",
  left: "clamp(8px, 1.5vw, 20px)",
  right: "clamp(8px, 1.5vw, 20px)",
  top: "clamp(8px, 1.5vw, 20px)",
  backgroundColor: "rgba(232,91,91,0.92)",
  color: COLORS.white,
  padding: "10px 14px",
  borderRadius: "14px",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  fontSize: "clamp(11px, 1.2vw, 14px)",
  fontWeight: 850,
  textAlign: "center",
  zIndex: 1000,
},
};