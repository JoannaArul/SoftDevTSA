// Join.jsx
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

function cleanCode(v) {
  return (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function absolutizeUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `http://localhost:5174${url}`;
  return `http://localhost:5174/${url}`;
}

export default function Join() {
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const fsViewportRef = useRef(null);
  const fsCanvasRef = useRef(null);
  const renderIdRef = useRef(0);
  const wsRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);

  const [code, setCode] = useState("");
  const [joined, setJoined] = useState(false);

  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [pdfDoc, setPdfDoc] = useState(null);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);

  const [transcriptText, setTranscriptText] = useState("");
  const [status, setStatus] = useState("Enter a join code to connect.");
  const [rendering, setRendering] = useState(false);
  const [err, setErr] = useState("");

  const [isFullscreen, setIsFullscreen] = useState(false);

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

  const connect = (joinCode) => {
    const c = cleanCode(joinCode);
    if (!c) return;

    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    setErr("");
    setStatus("Connecting…");
    setJoined(false);

    try {
      const ws = new WebSocket(`ws://localhost:5174/ws?code=${encodeURIComponent(c)}&role=student`);
      wsRef.current = ws;

      ws.onopen = () => {
        setJoined(true);
        setStatus("Connected. Waiting for host…");
      };

      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data || "{}");
        } catch {
          return;
        }

        if (msg.type === "sync") {
          if (msg.pdf?.url) {
            setPdfUrl(absolutizeUrl(msg.pdf.url));
            setPdfName(msg.pdf.name || "");
          }
          if (msg.slide?.page) setPage(Number(msg.slide.page) || 1);
          if (msg.slide?.numPages) setNumPages(Number(msg.slide.numPages) || 0);
          if (typeof msg.transcript === "string") setTranscriptText(msg.transcript);
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

        if (msg.type === "transcript") {
          if (typeof msg.text === "string") setTranscriptText(msg.text);
          return;
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setStatus("Disconnected.");
        setJoined(false);
      };

      ws.onerror = () => {
        setErr("WebSocket error. Is your backend running on :5174?");
      };
    } catch {
      setErr("Couldn't connect. Check backend and join code.");
    }
  };

  const leave = () => {
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    setJoined(false);
    setPdfUrl("");
    setPdfName("");
    setPdfDoc(null);
    setNumPages(0);
    setPage(1);
    setTranscriptText("");
    setStatus("Enter a join code to connect.");
    setErr("");
    setIsFullscreen(false);
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
      setErr("Could not load slides. Make sure the host uploaded a PDF and the backend serves /files.");
      setStatus("Waiting for host…");
    }
  };

  useEffect(() => {
    if (!pdfUrl) return;
    loadPdfFromUrl(pdfUrl);
  }, [pdfUrl]);

  const renderPageToCanvas = async (doc, pageNum, fullscreen, triesLeft = 8) => {
    const viewportEl = fullscreen ? fsViewportRef.current : viewportRef.current;
    const canvas = fullscreen ? fsCanvasRef.current : canvasRef.current;
    if (!doc || !canvas || !viewportEl) return;

    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;
    if ((w < 80 || h < 80) && triesLeft > 0) {
      requestAnimationFrame(() => renderPageToCanvas(doc, pageNum, fullscreen, triesLeft - 1));
      return;
    }

    const myRenderId = ++renderIdRef.current;
    setRendering(true);
    setErr("");

    try {
      const pdfPage = await doc.getPage(pageNum);
      const padding = fullscreen ? 56 : 26;
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
    const safePage = Math.min(Math.max(1, page), pdfDoc.numPages);
    if (safePage !== page) setPage(safePage);
    renderPageToCanvas(pdfDoc, safePage, false);
    if (isFullscreen) renderPageToCanvas(pdfDoc, safePage, true);
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

  useEffect(() => {
    return () => {
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };
  }, []);

  const transcript = useMemo(() => {
    if (transcriptText) return transcriptText;
    if (!joined) return "Enter the join code shown by the host to connect.";
    if (!pdfDoc) return "Connected. Waiting for slides…";
    return "Connected. Waiting for captions…";
  }, [transcriptText, joined, pdfDoc]);

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
      <div style={styles.centerFrame}>
        <div style={styles.shell}>
          {!joined ? (
            <div style={styles.joinCard}>
              <div style={styles.joinTitle}>Join Session</div>
              <div style={styles.joinSub}>Enter the 6-character code from your host.</div>

              <div style={styles.joinRow}>
                <input
                  value={code}
                  onChange={(e) => setCode(cleanCode(e.target.value))}
                  placeholder="ABC123"
                  style={styles.joinInput}
                  maxLength={6}
                />
                <button type="button" onClick={() => connect(code)} style={styles.joinBtn}>
                  Join
                </button>
              </div>

              <div style={styles.joinHint}>{err ? err : status}</div>
            </div>
          ) : (
            <div style={{ ...styles.layoutBase, ...layoutStyle }}>
              <section style={styles.slidesArea} aria-label="Slides">
                <div ref={viewportRef} style={styles.slideViewport}>
                  {!pdfDoc ? (
                    <div style={styles.waitWrap}>
                      <div style={styles.waitTitle}>Waiting for slides…</div>
                      <div style={styles.waitSub}>{status}</div>
                      {err && <div style={styles.errorPill}>{err}</div>}
                      <button type="button" onClick={leave} style={styles.leaveBtn}>
                        Leave
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={styles.canvasWrap}>
                        <canvas ref={canvasRef} />
                      </div>

                      <div style={styles.slideTopBar}>
                        <div style={styles.fileChip} title={pdfName}>
                          {pdfName || "Slides"}
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <button type="button" onClick={openFullscreen} style={styles.topActionBtn}>
                            Fullscreen
                          </button>
                          <button type="button" onClick={leave} style={styles.topActionBtn}>
                            Leave
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

              <section style={styles.transcriptArea} aria-label="Transcript">
                <div style={styles.transcriptHeader}>
                  <div style={styles.transcriptTitle}>Live Captions</div>
                  <div style={styles.transcriptBadge}>{joined ? "Connected" : "Not connected"}</div>
                </div>
                <div style={styles.transcriptBody}>
                  <div style={styles.transcriptText}>{transcript}</div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      {isFullscreen && (
        <div role="dialog" aria-modal="true" style={styles.fsOverlay}>
          <div style={styles.fsCard}>
            <button type="button" onClick={closeFullscreen} style={styles.fsXBtn} aria-label="Close fullscreen">
              ×
            </button>

            <div ref={fsViewportRef} style={styles.fsViewport}>
              <div style={styles.fsCanvasWrap}>
                <canvas ref={fsCanvasRef} />
              </div>

              <div style={styles.fsFooter}>
                <div style={styles.fsCounter}>
                  Slide {page} / {numPages || (pdfDoc ? pdfDoc.numPages : 0)}
                </div>
              </div>

              {rendering && <div style={styles.fsStatus}>Rendering…</div>}
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
    minHeight: "calc(100vh - var(--header-h))",
    paddingTop: "var(--header-h)",
    boxSizing: "border-box",
    backgroundColor: COLORS.pageBg,
    overflowX: "clip",
    overflowY: "hidden",
    transition: "opacity 320ms ease, transform 420ms ease",
  },
  centerFrame: {
    minHeight: "calc(100vh - var(--header-h))",
    width: "100%",
    display: "grid",
    placeItems: "center",
    padding: "clamp(14px, 2.6vw, 26px) 18px",
    boxSizing: "border-box",
  },
  shell: {
    width: "min(1320px, 100%)",
    minHeight: 0,
    margin: "0 auto",
    boxSizing: "border-box",
  },
  joinCard: {
    width: "min(640px, 100%)",
    margin: "0 auto",
    borderRadius: "24px",
    backgroundColor: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.10)",
    boxShadow: "0 28px 74px rgba(0,0,0,0.18)",
    padding: "18px",
    display: "grid",
    gap: "10px",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  },
  joinTitle: {
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(22px, 2.4vw, 28px)",
    fontWeight: 900,
    letterSpacing: "-0.02em",
    color: COLORS.black,
  },
  joinSub: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(13px, 1.3vw, 15px)",
    fontWeight: 650,
    lineHeight: 1.6,
    color: "rgba(0,0,0,0.66)",
  },
  joinRow: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: "6px",
  },
  joinInput: {
    flex: "1 1 220px",
    height: "52px",
    borderRadius: "16px",
    border: "1px solid rgba(0,0,0,0.14)",
    backgroundColor: "rgba(245,252,239,0.65)",
    padding: "0 14px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "18px",
    fontWeight: 900,
    letterSpacing: "0.12em",
    outline: "none",
    color: "rgba(0,0,0,0.80)",
    textTransform: "uppercase",
  },
  joinBtn: {
    height: "52px",
    padding: "0 16px",
    borderRadius: "16px",
    border: "none",
    cursor: "pointer",
    background: `linear-gradient(135deg, ${COLORS.teal}, rgba(44,177,166,0.82))`,
    color: COLORS.white,
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "14px",
    fontWeight: 900,
    boxShadow: "0 16px 38px rgba(0,0,0,0.16)",
  },
  joinHint: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "13px",
    fontWeight: 650,
    color: "rgba(0,0,0,0.62)",
  },
  layoutBase: {
    width: "min(1320px, 100%)",
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
    minHeight: "min(560px, calc(100vh - var(--header-h) - 90px))",
    backgroundColor: COLORS.beige,
    borderRadius: "22px",
    border: "1px solid rgba(0,0,0,0.10)",
    boxShadow: "0 16px 38px rgba(0,0,0,0.10)",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
  },
  waitWrap: {
    width: "min(680px, 92%)",
    display: "grid",
    gap: "10px",
    textAlign: "center",
    padding: "16px",
  },
  waitTitle: {
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(20px, 2.4vw, 28px)",
    fontWeight: 900,
    color: "rgba(0,0,0,0.84)",
  },
  waitSub: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(13px, 1.3vw, 15px)",
    fontWeight: 650,
    lineHeight: 1.6,
    color: "rgba(0,0,0,0.62)",
  },
  leaveBtn: {
    justifySelf: "center",
    border: "1px solid rgba(0,0,0,0.12)",
    backgroundColor: "rgba(0,0,0,0.06)",
    borderRadius: "16px",
    padding: "10px 12px",
    cursor: "pointer",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "13px",
    fontWeight: 850,
    color: "rgba(0,0,0,0.74)",
    width: "fit-content",
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
  },
  fileChip: {
    maxWidth: "62%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    backgroundColor: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(0,0,0,0.10)",
    borderRadius: "999px",
    padding: "8px 10px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "12px",
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
    fontSize: "12px",
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
    pointerEvents: "none",
  },
  counterPill: {
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
  },
  transcriptTitle: {
    fontFamily: "Merriweather, serif",
    fontSize: "18px",
    fontWeight: 900,
    letterSpacing: "-0.02em",
    color: COLORS.black,
  },
  transcriptBadge: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "12px",
    fontWeight: 900,
    padding: "6px 10px",
    borderRadius: "999px",
    backgroundColor: "rgba(0,0,0,0.08)",
    color: "rgba(0,0,0,0.70)",
    whiteSpace: "nowrap",
  },
  transcriptBody: {
    padding: "14px",
    overflow: "auto",
  },
  transcriptText: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "15px",
    lineHeight: 1.7,
    fontWeight: 600,
    color: "rgba(0,0,0,0.76)",
    whiteSpace: "pre-wrap",
  },
  fsOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(10,12,12,0.95)",
    zIndex: 80,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
  },
  fsCard: {
    width: "100vw",
    height: "100vh",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  fsXBtn: {
    position: "absolute",
    top: "clamp(12px, 2vw, 20px)",
    right: "clamp(12px, 2vw, 20px)",
    zIndex: 90,
    border: "1px solid rgba(255,255,255,0.20)",
    backgroundColor: "rgba(0,0,0,0.60)",
    borderRadius: "50%",
    width: "clamp(40px, 5vw, 56px)",
    height: "clamp(40px, 5vw, 56px)",
    cursor: "pointer",
    fontSize: "clamp(24px, 3vw, 32px)",
    fontWeight: 900,
    lineHeight: 1,
    color: "rgba(255,255,255,0.90)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  fsViewport: {
    position: "relative",
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  fsCanvasWrap: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "clamp(20px, 4vw, 64px)",
    boxSizing: "border-box",
  },
  fsFooter: {
    position: "absolute",
    left: "clamp(14px, 2vw, 24px)",
    right: "clamp(14px, 2vw, 24px)",
    bottom: "clamp(14px, 2vw, 24px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  fsCounter: {
    pointerEvents: "none",
    backgroundColor: "rgba(44,177,166,0.80)",
    border: "1px solid rgba(44,177,166,0.40)",
    borderRadius: "999px",
    padding: "clamp(10px, 1.5vw, 14px) clamp(14px, 2vw, 18px)",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(13px, 1.4vw, 16px)",
    fontWeight: 950,
    color: "rgba(255,255,255,0.95)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  },
  fsStatus: {
    position: "absolute",
    top: "clamp(14px, 2vw, 20px)",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "rgba(0,0,0,0.74)",
    color: COLORS.white,
    padding: "8px 12px",
    borderRadius: "999px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(11px, 1.2vw, 13px)",
    fontWeight: 900,
  },
  fsError: {
    position: "absolute",
    left: "clamp(14px, 2vw, 24px)",
    right: "clamp(14px, 2vw, 24px)",
    top: "clamp(14px, 2vw, 20px)",
    backgroundColor: "rgba(232,91,91,0.92)",
    color: COLORS.white,
    padding: "12px 16px",
    borderRadius: "16px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(12px, 1.3vw, 14px)",
    fontWeight: 850,
    textAlign: "center",
  },
};
