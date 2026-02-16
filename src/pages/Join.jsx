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

export default function Join({ onFullscreenChange }) {
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const fsViewportRef = useRef(null);
  const fsCanvasRef = useRef(null);
  const renderIdRef = useRef(0);
  const renderTaskRef = useRef(null);
  const fsRenderTaskRef = useRef(null);
  const wsRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [isShort, setIsShort] = useState(false);

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
      const ws = new WebSocket(`${BACKEND_WS}/ws?code=${encodeURIComponent(c)}&role=student`);
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
        setErr("WebSocket error. Check your backend URL and that /ws is reachable.");
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
      try {
        taskRef.current.cancel();
      } catch {}
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

  useEffect(() => {
    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
      if (fsRenderTaskRef.current) {
        try {
          fsRenderTaskRef.current.cancel();
        } catch {}
      }
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

  const openFullscreen = async () => {
    setIsFullscreen(true);
    onFullscreenChange?.(true);
    requestAnimationFrame(async () => {
      await waitForStableBox(fsViewportRef.current);
      if (pdfDoc) renderPageToCanvas(pdfDoc, page, true);
    });
  };

  const closeFullscreen = () => {
    if (fsRenderTaskRef.current) {
      try {
        fsRenderTaskRef.current.cancel();
      } catch {}
      fsRenderTaskRef.current = null;
    }
    setIsFullscreen(false);
    onFullscreenChange?.(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") connect(code);
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
          <div style={styles.joinCard}>
            <div style={styles.joinTitle}>Join Session</div>
            <div style={styles.joinSub}>Enter the 6-character code from your host.</div>

            <div style={styles.joinRow}>
              <input
                value={code}
                onChange={(e) => setCode(cleanCode(e.target.value))}
                onKeyPress={handleKeyPress}
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
        </div>

        {isFullscreen && (
          <div role="dialog" aria-modal="true" style={styles.fsOverlay}>
            <div style={styles.fsCard}>
              <button type="button" onClick={closeFullscreen} style={styles.fsCloseBtn} aria-label="Exit fullscreen">
                Exit
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={layoutCombined}>
          <section style={slidesAreaStyle} aria-label="Slides">
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
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", pointerEvents: "auto" }}>
                      <button type="button" onClick={openFullscreen} style={styles.topActionBtn}>
                        Fullscreen
                      </button>
                      <button type="button" onClick={leave} style={styles.topActionBtn}>
                        Leave
                      </button>
                    </div>
                  </div>

                  <div style={styles.slideControls}>
                    <div style={styles.counterPill}>Slide {page} / {numPages || pdfDoc.numPages}</div>
                  </div>

                  {rendering && <div style={styles.statusPillFloat}>Rendering…</div>}
                  {err && <div style={styles.errorPillFloat}>{err}</div>}
                </>
              )}
            </div>
          </section>

          <aside style={{ ...rightRailStyle, gap }} aria-label="Live transcript">
            <section style={transcriptAreaStyle} aria-label="Transcript">
              <div style={styles.transcriptHeader}>
                <div style={styles.transcriptTitle}>Live Captions</div>
                <div style={styles.transcriptBadge}>{joined ? "Connected" : "Not connected"}</div>
              </div>
              <div style={styles.transcriptBody}>
                <div style={styles.transcriptText}>{transcript}</div>
              </div>
            </section>
          </aside>
        </div>
      </div>

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
  centerFrame: {
    minHeight: "calc(100vh - var(--header-h))",
    width: "100%",
    display: "grid",
    placeItems: "center",
    padding: "18px",
    boxSizing: "border-box",
  },
  shell: {
    maxWidth: "1440px",
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
    minHeight: 0,
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
    minHeight: 0,
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
  fsOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(5, 6, 7, 0.96)",
    zIndex: 20000,
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
  },
  fsCloseBtn: {
    position: "fixed",
    top: "8px",
    right: "8px",
    zIndex: 20003,
    border: "1px solid rgba(255,182,193,0.40)",
    backgroundColor: "rgba(255,182,193,0.25)",
    borderRadius: "12px",
    padding: "8px 14px",
    cursor: "pointer",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "13px",
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
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 20001,
  },
  fsCanvasWrap: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "8px",
    boxSizing: "border-box",
  },
  fsControls: {
    position: "fixed",
    left: "50%",
    transform: "translateX(-50%)",
    bottom: "clamp(12px, 3vh, 20px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "clamp(6px, 2vw, 10px)",
    pointerEvents: "none",
    zIndex: 20002,
  },
  fsCounter: {
    pointerEvents: "none",
    backgroundColor: "rgba(44,177,166,0.82)",
    border: "1px solid rgba(44,177,166,0.40)",
    borderRadius: "999px",
    padding: "10px 16px",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    fontSize: "14px",
    fontWeight: 950,
    color: "rgba(255,255,255,0.96)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    whiteSpace: "nowrap",
  },
  fsStatus: {
    position: "fixed",
    top: "8px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "rgba(0,0,0,0.74)",
    color: COLORS.white,
    padding: "6px 12px",
    borderRadius: "999px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "11px",
    fontWeight: 900,
    zIndex: 20002,
  },
  fsError: {
    position: "fixed",
    left: "8px",
    right: "8px",
    top: "8px",
    backgroundColor: "rgba(232,91,91,0.92)",
    color: COLORS.white,
    padding: "10px 14px",
    borderRadius: "14px",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "12px",
    fontWeight: 850,
    textAlign: "center",
    zIndex: 20002,
  },
};