import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HomeClassroom from "../assets/HomeClassroom.jpg";
import DailyInteraction from "../assets/DailyInteraction.png";
import HearingEnvironment from "../assets/HearingEnvironment.png";
import Speak from "../assets/Speak.png";

const COLORS = {
  teal: "#2CB1A6",
  gray: "#494A48",
  beige: "#F5FCEF",
  black: "#000000",
  white: "#FFFFFF",
};

function useInViewOnce(options = { threshold: 0.35, root: null, rootMargin: "0px" }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (e && e.isIntersecting) {
          setSeen(true);
          obs.disconnect();
        }
      },
      { threshold: options.threshold ?? 0.35, root: options.root ?? null, rootMargin: options.rootMargin ?? "0px" }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [seen, options.threshold, options.root, options.rootMargin]);

  return [ref, seen];
}

export default function Home() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(0);
  const [btnHover, setBtnHover] = useState(null);

  const [statRef, statSeen] = useInViewOnce({ threshold: 0.35 });

  const [statPct, setStatPct] = useState(1);
  const [ringPct, setRingPct] = useState(0);

  const slides = useMemo(
    () => [
      {
        title: "Upload PDF",
        desc: "Import your slideshow as a PDF so students see the same slide you’re presenting.",
        variant: "light",
      },
      {
        title: "Start Session",
        desc: "Launch a live room and instantly get a join code so students can enter and follow along.",
        variant: "teal",
      },
      {
        title: "Speak",
        desc: "Teach naturally—captions appear live and the transcript updates as students join.",
        variant: "light",
      },
    ],
    []
  );

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActive((v) => (v + 1) % slides.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [slides.length]);

  useEffect(() => {
    if (!statSeen) return;

    setStatPct(1);
    setRingPct(0);

    const target = 85;
    const durationMs = 2400;
    const start = performance.now();

    let raf = 0;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);

      const nextRing = Math.max(0, Math.min(target, Math.round(eased * target)));
      const nextCount = Math.max(1, Math.min(target, Math.round(1 + eased * (target - 1))));

      setRingPct(nextRing);
      setStatPct(nextCount);

      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [statSeen]);

  return (
    <main
      style={{
        ...styles.page,
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0px)" : "translateY(14px)",
      }}
    >
      <section style={styles.heroSection}>
        <div
          style={{
            ...styles.heroBg,
            backgroundImage: `linear-gradient(rgba(0,0,0,0.62), rgba(0,0,0,0.62)), url(${HomeClassroom})`,
          }}
        />

        <div style={styles.heroInner}>
          <div style={styles.heroGrid}>
            <div style={styles.leftCol}>
              <div style={styles.slideStage} aria-label="How it works (rotating preview)">
                <div style={styles.slideStack}>
                  {slides.map((s, i) => (
                    <SlideCard
                      key={s.title}
                      slide={s}
                      active={i === active}
                      index={i}
                      step={i + 1}
                    />
                  ))}
                </div>

                <div style={styles.dots} aria-label="Slide indicators">
                  {slides.map((_, i) => (
                    <span
                      key={i}
                      style={{
                        ...styles.dot,
                        opacity: i === active ? 1 : 0.45,
                        transform: i === active ? "scale(1.15)" : "scale(1)",
                        backgroundColor: i === active ? COLORS.teal : "rgba(255,255,255,0.55)",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div style={styles.rightCol}>
              <h1 style={styles.heroTitle}>Make every lesson accessible.</h1>

              <p style={styles.heroDesc}>
                Teachers upload a PDF, start a session, and speak naturally. Students join with a
                code to view slides and real-time transcription in one place.
              </p>

              <div style={styles.heroActions}>
                <button
                  type="button"
                  onClick={() => navigate("/host")}
                  onMouseEnter={() => setBtnHover("teacher")}
                  onMouseLeave={() => setBtnHover(null)}
                  style={{
                    ...styles.primaryBtn,
                    transform: btnHover === "teacher" ? "translateY(-2px)" : "translateY(0px)",
                    boxShadow:
                      btnHover === "teacher"
                        ? "0 16px 30px rgba(0,0,0,0.34)"
                        : "0 10px 20px rgba(0,0,0,0.26)",
                  }}
                >
                  Start Slideshow
                </button>

                <button
                  type="button"
                  onClick={() => navigate("/join")}
                  onMouseEnter={() => setBtnHover("student")}
                  onMouseLeave={() => setBtnHover(null)}
                  style={{
                    ...styles.primaryBtn,
                    transform: btnHover === "student" ? "translateY(-2px)" : "translateY(0px)",
                    boxShadow:
                      btnHover === "student"
                        ? "0 16px 30px rgba(0,0,0,0.34)"
                        : "0 10px 20px rgba(0,0,0,0.26)",
                  }}
                >
                  Join 
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={styles.missionSection}>
        <div style={styles.missionInner}>
          <h2 style={styles.missionTitle}>Our Mission</h2>

          <p style={styles.missionDesc}>
            We remove barriers in classrooms by making lessons accessible in real time. Teachers can
            present naturally while students follow synced slides and live transcription in one
            place, supporting deaf and hard of hearing learners and helping everyone stay engaged.
          </p>

          <div style={styles.missionChecks}>
            <div style={styles.missionCheckRow}>
              <span style={styles.checkmark} aria-hidden="true">
                ✓
              </span>
              <span style={styles.checkText}>Built-in Accessibility</span>
            </div>

            <div style={styles.missionCheckRow}>
              <span style={styles.checkmark} aria-hidden="true">
                ✓
              </span>
              <span style={styles.checkText}>Real-Time Captions</span>
            </div>

            <div style={styles.missionCheckRow}>
              <span style={styles.checkmark} aria-hidden="true">
                ✓
              </span>
              <span style={styles.checkText}>Synced Slides for Students</span>
            </div>
          </div>
        </div>
      </section>

      <section style={styles.mainstreamSection}>
        <div style={styles.mainstreamInner}>
          <div style={styles.mainstreamGrid}>
            <div style={styles.mainstreamLeft}>
              <div style={styles.mainstreamLeftInner}>
                <h2 style={styles.mainstreamTitle}>
                  What is{" "}
                  <span style={{ color: COLORS.teal, fontWeight: 900 }}>mainstreaming</span>?
                </h2>

                <p style={styles.mainstreamDesc}>
                  In the past, many deaf or hard of hearing students attended residential deaf schools.
                  Today, more families choose mainstreaming instead. Mainstreaming means enrolling a
                  deaf child in a hearing school, often a public school, rather than a residential deaf
                  school. You may also hear it called inclusion or integration.
                </p>
              </div>
            </div>

            <div style={styles.mainstreamRight}>
              <div style={styles.flowStackTight}>
                <InfoCard
                  img={DailyInteraction}
                  title="More daily interaction"
                  desc="Students learn alongside hearing peers, which can make social and academic collaboration feel more normal and consistent."
                />
                <InfoCard
                  img={Speak}
                  title="Stronger spoken access"
                  desc="Many students build oral communication and lip-reading skills that support participation in higher education and careers."
                />
                <InfoCard
                  img={HearingEnvironment}
                  title="Easier transition later"
                  desc="Being in a hearing environment early can make it smoother to navigate mainstream spaces in adulthood."
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={styles.statSection} ref={statRef}>
        <div style={styles.statInner}>
          <div style={styles.statTopLine}>Accessibility starts with Voxia.</div>

          <div style={styles.statGrid}>
            <div style={styles.statVizWrap}>
              <div
                style={{
                  ...styles.ring,
                  background: `conic-gradient(${COLORS.teal} ${ringPct * 3.6}deg, rgba(0,0,0,0.10) 0deg)`,
                }}
                aria-label={`Pie chart showing ${ringPct}%`}
              >
                <div style={styles.ringInner}>
                  <div style={styles.ringCenterPct}>
                    <span style={{ color: COLORS.teal, fontWeight: 900 }}>{ringPct}%</span>
                  </div>
                  <div style={styles.ringCenterLabel}>Mainstream</div>
                </div>
              </div>
            </div>

            <div style={styles.statCopy}>
              <div style={styles.statTextCol}>
                <div style={styles.statLead}>
                  <span style={styles.statLeadBold}>
                    Around <span style={styles.statPct}>{statPct}%</span> of deaf children learn in mainstream public schools
                  </span>
                </div>

                <div style={styles.statBody}>
                  That’s why Voxia focuses on making mainstream classrooms accessible in real time. While
                  teachers teach naturally, students don’t have to wait, guess, or fall behind, staying
                  engaged in real time.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function SlideCard({ slide, active, index, step }) {
  const isTeal = slide.variant === "teal";
  const baseZ = 10 - index;

  return (
    <div
      style={{
        ...styles.card,
        zIndex: active ? 20 : baseZ,
        opacity: active ? 1 : 0,
        transform: active ? "translateY(0px) scale(1)" : "translateY(10px) scale(0.99)",
        pointerEvents: active ? "auto" : "none",
        backgroundColor: isTeal ? COLORS.teal : COLORS.beige,
        color: isTeal ? COLORS.white : COLORS.black,
        border: isTeal ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(0,0,0,0.10)",
      }}
      aria-hidden={!active}
    >
      <div style={styles.cardTop}>
        <h3 style={styles.cardTitle}>{slide.title}</h3>
        <span
          style={{
            ...styles.pill,
            backgroundColor: isTeal ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.08)",
            color: isTeal ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.72)",
          }}
        >
          Step {step}
        </span>
      </div>

      <p style={{ ...styles.cardDesc, opacity: isTeal ? 0.92 : 0.82 }}>{slide.desc}</p>

      <div
        style={{
          ...styles.cardAccent,
          background: isTeal ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.08)",
        }}
      />
    </div>
  );
}

function InfoCard({ img, title, desc }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.infoCardBtn,
        ...(hovered ? styles.infoCardHover : null),
      }}
      aria-label={`${title}`}
    >
      <div
        style={{
          ...styles.infoThumb,
          backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${img})`,
        }}
      />
      <div style={styles.infoBody}>
        <div style={styles.infoTitle}>{title}</div>
        <div style={styles.infoDesc}>{desc}</div>
      </div>
    </button>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: COLORS.beige,
    paddingTop: "var(--header-h)",
    transition: "opacity 380ms ease, transform 420ms ease",
    overflowX: "hidden",
  },

  heroSection: {
    width: "100%",
    position: "relative",
    overflow: "hidden",
  },

  heroBg: {
    position: "absolute",
    inset: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
    transform: "scale(1.02)",
    filter: "saturate(0.95) contrast(1.05)",
  },

  heroInner: {
    position: "relative",
    width: "100%",
    minHeight: "clamp(520px, 72vh, 680px)",
    display: "grid",
    alignItems: "center",
    padding: "clamp(18px, 3vw, 44px) 18px",
    boxSizing: "border-box",
  },

  heroGrid: {
    width: "100%",
    maxWidth: "1150px",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "clamp(16px, 3vw, 46px)",
    alignItems: "center",
  },

  leftCol: {
    width: "100%",
    display: "grid",
    justifyItems: "center",
  },

  rightCol: {
    width: "100%",
    display: "grid",
    gap: "12px",
    alignContent: "center",
  },

  heroTitle: {
    margin: 0,
    color: COLORS.white,
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(32px, 4vw, 54px)",
    lineHeight: 1.05,
    letterSpacing: "-0.03em",
    fontWeight: 900,
    textShadow: "0 16px 42px rgba(0,0,0,0.45)",
  },

  heroDesc: {
    margin: 0,
    maxWidth: "70ch",
    color: "rgba(255,255,255,0.88)",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(14px, 1.25vw, 17px)",
    lineHeight: 1.65,
    fontWeight: 500,
    textShadow: "0 14px 36px rgba(0,0,0,0.35)",
  },

  heroActions: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    marginTop: "8px",
  },

  primaryBtn: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    backgroundColor: COLORS.teal,
    color: COLORS.white,
    border: "none",
    borderRadius: "14px",
    padding: "11px 15px",
    fontSize: "15px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "transform 160ms ease, box-shadow 220ms ease, opacity 200ms ease",
  },

  slideStage: {
    width: "min(380px, 100%)",
    display: "grid",
    gap: "10px",
    justifyItems: "center",
  },

  slideStack: {
    position: "relative",
    width: "100%",
    height: "200px",
  },

  card: {
    position: "absolute",
    inset: 0,
    borderRadius: "20px",
    padding: "16px 16px",
    boxSizing: "border-box",
    textAlign: "left",
    boxShadow: "0 16px 38px rgba(0,0,0,0.26)",
    transition: "opacity 420ms ease, transform 520ms ease",
    overflow: "hidden",
    background: "transparent",
  },

  cardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },

  cardTitle: {
    margin: 0,
    fontFamily: "Merriweather, serif",
    fontSize: "19px",
    fontWeight: 900,
    letterSpacing: "-0.02em",
  },

  pill: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "12px",
    fontWeight: 700,
    padding: "6px 10px",
    borderRadius: "999px",
    whiteSpace: "nowrap",
  },

  cardDesc: {
    margin: "8px 0 0",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "13.5px",
    lineHeight: 1.45,
    fontWeight: 600,
  },

  cardAccent: {
    position: "absolute",
    bottom: "-44px",
    right: "-44px",
    width: "150px",
    height: "150px",
    borderRadius: "999px",
  },

  dots: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    justifyContent: "center",
  },

  dot: {
    width: "10px",
    height: "10px",
    borderRadius: "999px",
    display: "inline-block",
    transition: "opacity 220ms ease, transform 220ms ease, background-color 220ms ease",
  },

  missionSection: {
    width: "100%",
    backgroundColor: COLORS.teal,
    padding: "clamp(34px, 4vw, 50px) 18px",
    boxSizing: "border-box",
  },

  missionInner: {
    maxWidth: "1100px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: "14px",
  },

  missionTitle: {
    margin: 0,
    color: COLORS.beige,
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(32px, 4vw, 54px)",
    fontWeight: 700,
    letterSpacing: "-0.02em",
  },

  missionDesc: {
    margin: 0,
    maxWidth: "82ch",
    color: COLORS.beige,
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(15px, 1.15vw, 18px)",
    lineHeight: 1.75,
    fontWeight: 500,
  },

  missionChecks: {
    marginTop: "12px",
    display: "flex",
    gap: "clamp(16px, 3vw, 40px)",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
  },

  missionCheckRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    whiteSpace: "nowrap",
  },

  checkmark: {
    width: "22px",
    height: "22px",
    borderRadius: "999px",
    border: `2px solid ${COLORS.beige}`,
    color: COLORS.beige,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontWeight: 900,
    flex: "0 0 auto",
  },

  checkText: {
    color: COLORS.beige,
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "16px",
    fontWeight: 600,
    flex: "0 0 auto",
  },

  mainstreamSection: {
    width: "100%",
    backgroundColor: COLORS.beige,
    padding: "clamp(34px, 4.2vw, 58px) 18px",
    boxSizing: "border-box",
  },

  mainstreamInner: {
    maxWidth: "1150px",
    margin: "0 auto",
  },

  mainstreamGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: "clamp(10px, 1.6vw, 16px)",
    alignItems: "center",
  },

  mainstreamLeft: {
    display: "grid",
    justifyItems: "center",
    textAlign: "center",
  },

  mainstreamLeftInner: {
    width: "min(60ch, 100%)",
    display: "grid",
    gap: "14px",
    transform: "translateY(clamp(10px, 1.2vw, 18px))",
  },

  mainstreamRight: {
    display: "grid",
    justifyItems: "start",
    alignContent: "start",
  },

  mainstreamTitle: {
    margin: 0,
    color: COLORS.black,
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(38px, 4.2vw, 58px)",
    lineHeight: 1.04,
    letterSpacing: "-0.03em",
    fontWeight: 900,
  },

  mainstreamDesc: {
    margin: 0,
    color: "rgba(0,0,0,0.88)",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(16px, 1.35vw, 19px)",
    lineHeight: 1.78,
    fontWeight: 500,
  },

  flowStackTight: {
    width: "min(520px, 100%)",
    display: "grid",
    gap: "12px",
  },

  infoCardBtn: {
    width: "100%",
    border: "1px solid rgba(0,0,0,0.10)",
    backgroundColor: COLORS.beige,
    borderRadius: "16px",
    boxShadow: "0 14px 28px rgba(0,0,0,0.12)",
    padding: "14px",
    boxSizing: "border-box",
    display: "grid",
    gridTemplateColumns: "84px 1fr",
    gap: "14px",
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
    transition: "transform 180ms ease, box-shadow 220ms ease, filter 180ms ease",
  },

  infoCardHover: {
    transform: "translateY(-2px)",
    boxShadow: "0 18px 40px rgba(0,0,0,0.16)",
    filter: "brightness(0.97)",
  },

  infoThumb: {
    width: "84px",
    height: "84px",
    borderRadius: "14px",
    backgroundSize: "cover",
    backgroundPosition: "center",
    border: "1px solid rgba(0,0,0,0.10)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.12)",
    flexShrink: 0,
  },

  infoBody: {
    minWidth: 0,
    display: "grid",
    gap: "8px",
  },

  infoTitle: {
    color: COLORS.teal,
    fontFamily: "Merriweather, serif",
    fontWeight: 900,
    letterSpacing: "-0.01em",
    fontSize: "clamp(18px, 1.7vw, 22px)",
    lineHeight: 1.12,
  },

  infoDesc: {
    color: "rgba(0,0,0,0.84)",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(14px, 1.12vw, 16px)",
    lineHeight: 1.6,
    fontWeight: 500,
  },

  statSection: {
    width: "100%",
    backgroundColor: "#EBF2E4",
    padding: "clamp(44px, 5.6vw, 78px) 18px",
    boxSizing: "border-box",
  },

  statInner: {
    maxWidth: "1150px",
    margin: "0 auto",
    display: "grid",
    gap: "clamp(18px, 3vw, 30px)",
  },

  statTopLine: {
    textAlign: "center",
    color: COLORS.black,
    fontFamily: "Merriweather, serif",
    fontWeight: 900,
    letterSpacing: "-0.02em",
    fontSize: "clamp(32px, 3.8vw, 52px)",
    lineHeight: 1.08,
  },

  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "clamp(18px, 3vw, 44px)",
    alignItems: "center",
  },

  statVizWrap: {
    display: "grid",
    justifyItems: "center",
  },

  statCopy: {
    display: "grid",
    justifyItems: "start",
    textAlign: "left",
  },

  statTextCol: {
    width: "min(62ch, 100%)",
    display: "grid",
    gap: "12px",
    paddingLeft: "clamp(0px, -1vw, 0px)",
    transform: "translateX(clamp(-26px, -2.2vw, -12px))",
  },

  statLead: {
    color: COLORS.black,
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(22px, 2.25vw, 34px)",
    lineHeight: 1.25,
    letterSpacing: "-0.02em",
  },

  statLeadBold: {
    fontWeight: 850,
  },

  statBody: {
    color: "rgba(0,0,0,0.80)",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(15px, 1.15vw, 18px)",
    lineHeight: 1.75,
    fontWeight: 500,
  },

  statPct: {
    color: COLORS.teal,
    fontWeight: 900,
  },

  ring: {
    width: "clamp(190px, 22vw, 260px)",
    height: "clamp(190px, 22vw, 260px)",
    borderRadius: "999px",
    display: "grid",
    placeItems: "center",
    boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
    border: "1px solid rgba(0,0,0,0.10)",
  },

  ringInner: {
    width: "72%",
    height: "72%",
    borderRadius: "999px",
    backgroundColor: "#EBF2E4",
    border: "1px solid rgba(0,0,0,0.08)",
    display: "grid",
    placeItems: "center",
    gap: "6px",
  },

  ringCenterPct: {
    color: COLORS.black,
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(22px, 2.3vw, 34px)",
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: "-0.02em",
  },

  ringCenterLabel: {
    color: "rgba(0,0,0,0.72)",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(12px, 1.1vw, 14px)",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
};
