import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

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

export default function Teacher() {
  const fileInputRef = useRef(null);
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const fsViewportRef = useRef(null);
  const fsCanvasRef = useRef(null);
  const renderIdRef = useRef(0);
  const recognitionRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunkTimerRef = useRef(null);
  const wsRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pdfName, setPdfName] = useState("");
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [err, setErr] = useState("");
  const [micOn, setMicOn] = useState(false);
  const [captionMode, setCaptionMode] = useState("local");
  const [transcriptText, setTranscriptText] = useState("");
  const [captionStatus, setCaptionStatus] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [studentCount, setStudentCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const TRANSCRIBE_URL = "http://localhost:5174/transcribe";

  const transcript = useMemo(() => {
    if (transcriptText) return transcriptText;
    if (captionStatus) return captionStatus;
    return pdfDoc
      ? "Turn on your mic to start live captions."
      : "Upload a PDF to start your lesson. Captions and transcript will appear here.";
  }, [pdfDoc, transcriptText, captionStatus]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 980px)");
    const onChange = () => setIsNarrow(!!mq.matches);
    onChange();
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  const openPicker = () => fileInputRef.current?.click();

  const acceptFile = async (file) => {
    if (!file) return;
    const ok = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!ok) {
      setErr("Please upload a PDF file.");
      return;
    }

    setErr("");
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
    } catch {
      setErr("That PDF couldn't be opened. Try a different file.");
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

  const renderPageToCanvas = async (doc, pageNum, fullscreen, triesLeft = 6) => {
    const viewportEl = fullscreen ? fsViewportRef.current : viewportRef.current;
    const canvas = fullscreen ? fsCanvasRef.current : canvasRef.current;
    if (!doc || !canvas || !viewportEl) return;

    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;
    if ((w < 60 || h < 60) && triesLeft > 0) {
      requestAnimationFrame(() => renderPageToCanvas(doc, pageNum, fullscreen, triesLeft - 1));
      return;
    }

    const myRenderId = ++renderIdRef.current;
    setRendering(true);
    setErr("");

    try {
      const pdfPage = await doc.getPage(pageNum);
      const padding = fullscreen ? 24 : 26;
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
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      if (myRenderId !== renderIdRef.current) return;
    } catch {
      setErr("Couldn't render this slide.");
    } finally {
      if (myRenderId === renderIdRef.current) setRendering(false);
    }
  };

  useEffect(() => {
    if (!pdfDoc) return;
    renderPageToCanvas(pdfDoc, page, false);
    if (isFullscreen) renderPageToCanvas(pdfDoc, page, true);
  }, [pdfDoc, page, isFullscreen]);

  useEffect(() => {
    if (!pdfDoc) return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        renderPageToCanvas(pdfDoc, page, false);
        if (isFullscreen) renderPageToCanvas(pdfDoc, page, true);
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
  };

  useEffect(() => {
    return () => stopCaptions();
  }, []);

  const startLocalCaptions = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCaptionStatus("Local captions aren't supported in this browser. Try Chrome/Edge or switch to Hosted.");
      setMicOn(false);
      return;
    }

    setCaptionStatus("Listening (Local)…");
    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    let finalText = "";

    rec.onresult = (event) => {
      setCaptionStatus("");
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += chunk + " ";
        } else {
          interim += chunk;
        }
      }
      setTranscriptText((finalText + interim).trim());
    };

    rec.onerror = (e) => {
      console.error("Speech recognition error:", e);
      const msg = e?.error ? `Local captions error: ${e.error}` : "Local captions error. Check permissions or switch to Hosted.";
      setCaptionStatus(msg);
    };

    rec.onend = () => {
      if (micOn && captionMode === "local" && recognitionRef.current === rec) {
        try {
          rec.start();
        } catch (err) {
          console.error("Failed to restart recognition:", err);
        }
      }
    };

    try {
      rec.start();
    } catch (err) {
      console.error("Failed to start recognition:", err);
      setCaptionStatus("Couldn't start local captions. Refresh and allow microphone access.");
      setMicOn(false);
    }
  };

  const pickMimeType = () => {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
    for (const t of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported?.(t)) return t;
    }
    return "";
  };

  const startHostedCaptions = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCaptionStatus("Hosted captions require microphone access (getUserMedia not supported).");
      setMicOn(false);
      return;
    }

    setCaptionStatus("Listening (Hosted)…");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setCaptionStatus("Microphone permission denied.");
      setMicOn(false);
      return;
    }

    mediaStreamRef.current = stream;
    const mimeType = pickMimeType();
    let recorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      setCaptionStatus("Couldn't start audio recorder in this browser. Try Local captions.");
      setMicOn(false);
      return;
    }

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = async (e) => {
      if (!e.data || e.data.size === 0) return;
      try {
        const form = new FormData();
        form.append("audio", e.data, "chunk.webm");
        const res = await fetch(TRANSCRIBE_URL, { method: "POST", body: form });
        if (!res.ok) throw new Error("bad response");
        const data = await res.json();
        const text = (data?.text || "").trim();
        if (text) setTranscriptText((prevText) => (prevText ? prevText + " " + text : text));
      } catch {
        setCaptionStatus("Hosted captions error (backend). Check your transcribe server URL.");
      }
    };

    recorder.start();
    chunkTimerRef.current = window.setInterval(() => {
      try {
        recorder.requestData();
      } catch {}
    }, 1500);
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

    if (captionMode === "local") {
      startLocalCaptions();
    } else {
      await startHostedCaptions();
    }
  };

  const switchMode = async (mode) => {
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
      if (mode === "local") {
        startLocalCaptions();
      } else {
        await startHostedCaptions();
      }
    }
  };

  const connectRoom = (code) => {
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    if (!code) return;

    try {
      const ws = new WebSocket(`ws://localhost:5174/ws?code=${encodeURIComponent(code)}&role=teacher`);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data || "{}");
          if (msg?.type === "presence" && typeof msg?.count === "number") setStudentCount(msg.count);
        } catch {}
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
      };
    } catch {}
  };

  const broadcastSlide = (code, pageNum, total) => {
    const ws = wsRef.current;
    if (!code || !ws || ws.readyState !== 1) return;
    try {
      ws.send(JSON.stringify({ type: "slide", page: pageNum, numPages: total }));
    } catch {}
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

  useEffect(() => {
    if (!joinCode || !pdfDoc) return;
    broadcastSlide(joinCode, page, numPages);
  }, [joinCode, pdfDoc, page, numPages]);

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

  const openFullscreen = () => {
    setIsFullscreen(true);
    requestAnimationFrame(() => {
      if (pdfDoc) renderPageToCanvas(pdfDoc, page, true);
    });
  };

  const closeFullscreen = () => setIsFullscreen(false);

  const layoutStyle = isNarrow ? styles.layoutNarrow : styles.layoutWide;

  return (
    <main
      style={{
        ...styles.page,
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0px)" : "translateY(10px)",
      }}
    >
      <div style={styles.shell}>
        <div style={{ ...styles.layoutBase, ...layoutStyle }}>
          <section style={styles.slidesArea} aria-label="Slides">
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
                <button
                  type="button"
                  onClick={openPicker}
                  style={styles.uploadOverlayBtn}
                  aria-label="Upload PDF"
                >
                  <div style={styles.uploadInner}>
                    <div style={styles.uploadTitle}>Upload PDF</div>
                    <div style={styles.uploadSub}>Click to choose a file or drag & drop a PDF here.</div>
                    {loadingPdf && <div style={styles.statusPill}>Opening…</div>}
                    {err && <div style={styles.errorPill}>{err}</div>}
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
                    </div>
                  </div>

                  <div style={styles.slideControls}>
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

                    <div style={{ display: "flex", gap: "10px", alignItems: "center", pointerEvents: "auto" }}>
                      <button
                        type="button"
                        onClick={next}
                        disabled={!canNext}
                        style={{ ...styles.navBtn, opacity: canNext ? 1 : 0.45 }}
                      >
                        Next
                      </button>
                      <button type="button" onClick={openFullscreen} style={styles.fsMiniBtn} aria-label="Full screen">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                          <path d="M6 2H2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M12 2h4v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M6 16H2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M12 16h4v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {(rendering || loadingPdf) && <div style={styles.statusPillFloat}>Rendering…</div>}
                  {err && <div style={styles.errorPillFloat}>{err}</div>}
                </>
              )}
            </div>
          </section>

          <div style={styles.rightCol}>
            <section style={styles.transcriptArea} aria-label="Transcript">
              <div style={styles.transcriptHeader}>
                <div style={styles.transcriptTitle}>Live Transcript</div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
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
                        backgroundColor: captionMode === "hosted" ? "rgba(44,177,166,0.16)" : "rgba(0,0,0,0.06)",
                        borderColor: captionMode === "hosted" ? "rgba(44,177,166,0.34)" : "rgba(0,0,0,0.10)",
                      }}
                      aria-pressed={captionMode === "hosted"}
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

            <aside style={styles.controlDock} aria-label="Class controls">
              <div style={styles.dockHeader}>
                <div style={styles.dockTitle}>Session Controls</div>
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

                <div style={styles.compactTile}>
                  <div style={styles.compactIcon}>{studentCount}</div>
                  <div style={styles.compactLabel}>Students</div>
                </div>

                <button
                  type="button"
                  onClick={() => ensureJoinCode(true)}
                  style={styles.joinCompactBtn}
                >
                  <div style={styles.joinCompactCode}>{joinCode || "CODE"}</div>
                  <div style={styles.joinCompactLabel}>Join Code</div>
                </button>
              </div>
            </aside>
          </div>
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
            <button
              type="button"
              onClick={() => ensureJoinCode(false)}
              style={styles.modalCodeBtn}
            >
              {joinCode || "Generate"}
            </button>
            <div style={styles.modalSub}>
              {copied ? "Copied to clipboard." : "Click the code to copy."}
            </div>
            <button type="button" onClick={closeJoinModal} style={styles.modalCloseBtn}>
              Close
            </button>
          </div>
        </div>
      )}

      {isFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          style={styles.fsOverlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeFullscreen();
          }}
        >
          <div style={styles.fsCard}>
            <div style={styles.fsTop}>
              <button type="button" onClick={closeFullscreen} style={styles.fsXBtn} aria-label="Close fullscreen">
                ×
              </button>
              <div style={styles.fsTitle}>{pdfName ? `${pdfName} • Slide ${page}/${numPages}` : "Slides"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={styles.fsMicPill}>{micOn ? "🎙️ Mic on" : "🔇 Mic off"}</div>
              </div>
            </div>

            <div ref={fsViewportRef} style={styles.fsViewport}>
              <div style={styles.fsCanvasWrap}>
                <canvas ref={fsCanvasRef} />
              </div>

              <div style={styles.fsControls}>
                <button
                  type="button"
                  onClick={prev}
                  disabled={!canPrev}
                  style={{ ...styles.fsNavBtn, opacity: canPrev ? 1 : 0.45 }}
                >
                  Prev
                </button>
                <div style={styles.fsCounter}>
                  Slide {page} / {numPages}
                </div>
                <button
                  type="button"
                  onClick={next}
                  disabled={!canNext}
                  style={{ ...styles.fsNavBtn, opacity: canNext ? 1 : 0.45 }}
                >
                  Next
                </button>
              </div>

              {(rendering || loadingPdf) && <div style={styles.fsStatus}>Rendering…</div>}
              {err && <div style={styles.fsError}>{err}</div>}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const styles = {
  page: {
    height: "100vh",
    paddingTop: "var(--header-h)",
    boxSizing: "border-box",
    overflow: "hidden",
    backgroundColor: COLORS.pageBg,
    overflowX: "clip",
    transition: "opacity 320ms ease, transform 420ms ease",
  },
  shell: {
    height: "100%",
    minHeight: 0,
    maxWidth: "1320px",
    margin: "0 auto",
    padding: "clamp(14px, 2.6vw, 26px) 18px",
    boxSizing: "border-box",
  },
  layoutBase: {
    height: "100%",
    minHeight: 0,
    display: "grid",
    gap: "14px",
    alignItems: "stretch",
  },
  layoutWide: {
    gridTemplateColumns: "minmax(0, 1.65fr) minmax(0, 1fr)",
    minHeight: 0,
  },
  layoutNarrow: {
    gridTemplateColumns: "1fr",
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
    minHeight: 0,
    backgroundColor: COLORS.beige,
    borderRadius: "22px",
    border: "2px dashed rgba(0,0,0,0.14)",
    boxShadow: "0 16px 38px rgba(0,0,0,0.10)",
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
    width: "min(640px, 100%)",
    textAlign: "center",
    display: "grid",
    gap: "10px",
    padding: "12px",
  },
  uploadTitle: {
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(30px, 3.3vw, 48px)",
    fontWeight: 900,
    letterSpacing: "-0.03em",
    color: COLORS.black,
    lineHeight: 1.05,
  },
  uploadSub: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(14px, 1.25vw, 16px)",
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
    fontSize: "12.5px",
    fontWeight: 850,
    color: "rgba(0,0,0,0.74)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  },
  topActionBtn: {
    border: "1px solid rgba(0,0,0,0.12)",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderRadius: "14px",
    padding: "8px 10px",
    cursor: "pointer",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "12.5px",
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
    justifyContent: "space-between",
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
    fontSize: "13px",
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
    fontSize: "13px",
    fontWeight: 950,
    color: "rgba(0,0,0,0.72)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
  },
  fsMiniBtn: {
    pointerEvents: "auto",
    border: "1px solid rgba(0,0,0,0.12)",
    backgroundColor: "rgba(255,255,255,0.82)",
    borderRadius: "14px",
    padding: "8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(0,0,0,0.78)",
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
    fontSize: "12px",
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
    fontSize: "12px",
    fontWeight: 900,
  },
  errorPill: {
    justifySelf: "center",
    backgroundColor: "rgba(232,91,91,0.92)",
    color: COLORS.white,
    padding: "10px 12px",
    borderRadius: "14px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "13px",
    fontWeight: 850,
    width: "fit-content",
    maxWidth: "min(720px, 92vw)",
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
    fontSize: "13px",
    fontWeight: 850,
    textAlign: "center",
  },
  rightCol: {
    position: "relative",
    minHeight: 0,
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr)",
    gap: "14px",
  },
  transcriptArea: {
    width: "100%",
    borderRadius: "22px",
    backgroundColor: COLORS.beigeDark,
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 14px 30px rgba(0,0,0,0.10)",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    minHeight: 0,
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
  },
  transcriptTitle: {
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(16px, 1.8vw, 18px)",
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
    padding: "14px",
    paddingRight: "clamp(14px, 30vw, 380px)",
    overflow: "auto",
  },
  transcriptText: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(14px, 1.4vw, 15px)",
    lineHeight: 1.7,
    fontWeight: 600,
    color: "rgba(0,0,0,0.76)",
    whiteSpace: "pre-wrap",
  },
  controlDock: {
    position: "absolute",
    bottom: "14px",
    right: "14px",
    width: "clamp(180px, 28vw, 240px)",
    zIndex: 5,
    borderRadius: "16px",
    backgroundColor: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 18px 46px rgba(0,0,0,0.12)",
    padding: "10px",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  dockHeader: {
    display: "grid",
    gap: "4px",
    padding: "4px 4px 8px",
  },
  dockTitle: {
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(12px, 1.3vw, 13px)",
    fontWeight: 900,
    letterSpacing: "-0.02em",
    color: COLORS.black,
    lineHeight: 1.1,
  },
  dockGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "8px",
  },
  compactTile: {
    borderRadius: "14px",
    padding: "8px 6px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    textAlign: "center",
    boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
    transition: "transform 160ms ease, box-shadow 220ms ease",
    outline: "none",
    border: "1px solid rgba(0,0,0,0.10)",
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  compactIcon: {
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(18px, 2vw, 22px)",
    fontWeight: 900,
    color: "rgba(0,0,0,0.84)",
    lineHeight: 1,
  },
  compactLabel: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(9px, 1vw, 10px)",
    fontWeight: 900,
    color: "rgba(0,0,0,0.62)",
    letterSpacing: "0.02em",
    textTransform: "uppercase",
    lineHeight: 1.2,
  },
  joinCompactBtn: {
    gridColumn: "1 / span 3",
    border: "none",
    borderRadius: "16px",
    padding: "10px 8px",
    cursor: "pointer",
    background: `linear-gradient(135deg, ${COLORS.teal}, rgba(44,177,166,0.82))`,
    color: COLORS.white,
    boxShadow: "0 16px 38px rgba(0,0,0,0.16)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    textAlign: "center",
  },
  joinCompactCode: {
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(16px, 2vw, 20px)",
    fontWeight: 900,
    letterSpacing: "0.08em",
    lineHeight: 1,
  },
  joinCompactLabel: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(9px, 1vw, 10px)",
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
    backgroundColor: "rgba(10,12,12,0.72)",
    zIndex: 60,
    display: "grid",
    placeItems: "center",
    padding: "14px",
  },
  fsCard: {
    width: "min(1400px, 99vw)",
    height: "min(960px, 96vh)",
    borderRadius: "26px",
    backgroundColor: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(255,255,255,0.20)",
    boxShadow: "0 34px 110px rgba(0,0,0,0.42)",
    overflow: "hidden",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  fsTop: {
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  fsTitle: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(12px, 1.2vw, 13px)",
    fontWeight: 900,
    color: "rgba(0,0,0,0.74)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "72%",
  },
  fsMicPill: {
    backgroundColor: "rgba(44,177,166,0.14)",
    border: "1px solid rgba(44,177,166,0.28)",
    borderRadius: "999px",
    padding: "8px 10px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(11px, 1.1vw, 12px)",
    fontWeight: 900,
    color: "rgba(0,0,0,0.72)",
    whiteSpace: "nowrap",
  },
  fsViewport: {
    position: "relative",
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.beige,
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
  },
  fsCanvasWrap: {
    width: "100%",
    height: "100%",
    display: "grid",
    placeItems: "center",
    padding: "10px",
    boxSizing: "border-box",
  },
  fsControls: {
    position: "absolute",
    left: "14px",
    right: "14px",
    bottom: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    pointerEvents: "none",
  },
  fsNavBtn: {
    pointerEvents: "auto",
    border: "1px solid rgba(0,0,0,0.12)",
    backgroundColor: "rgba(255,255,255,0.86)",
    borderRadius: "16px",
    padding: "12px 14px",
    cursor: "pointer",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(12px, 1.2vw, 13px)",
    fontWeight: 900,
    color: "rgba(0,0,0,0.78)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  fsCounter: {
    pointerEvents: "none",
    backgroundColor: "rgba(44,177,166,0.16)",
    border: "1px solid rgba(44,177,166,0.30)",
    borderRadius: "999px",
    padding: "12px 14px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(12px, 1.2vw, 13px)",
    fontWeight: 950,
    color: "rgba(0,0,0,0.72)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  fsStatus: {
    position: "absolute",
    top: "14px",
    right: "14px",
    backgroundColor: "rgba(0,0,0,0.74)",
    color: COLORS.white,
    padding: "8px 10px",
    borderRadius: "999px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(11px, 1.1vw, 12px)",
    fontWeight: 900,
  },
  fsError: {
    position: "absolute",
    left: "14px",
    right: "14px",
    top: "56px",
    backgroundColor: "rgba(232,91,91,0.92)",
    color: COLORS.white,
    padding: "10px 12px",
    borderRadius: "14px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(12px, 1.2vw, 13px)",
    fontWeight: 850,
    textAlign: "center",
  },
  fsXBtn: {
    border: "1px solid rgba(0,0,0,0.12)",
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: "14px",
    width: "clamp(36px, 4vw, 40px)",
    height: "clamp(36px, 4vw, 40px)",
    cursor: "pointer",
    fontSize: "clamp(20px, 2.2vw, 22px)",
    fontWeight: 900,
    lineHeight: 1,
    color: "rgba(0,0,0,0.72)",
  },
};
