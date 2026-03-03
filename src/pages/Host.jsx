import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const COLORS = {
  teal: "#2CB1A6",
  gray: "#494A48",
  beige: "#F5FCEF",
  black: "#000000",
  white: "#FFFFFF",
  pageBg: "#EEF3EF",
};

export default function Host() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [pressed, setPressed] = useState(null);
  const [compact, setCompact] = useState(false);
  const [studentMic, setStudentMic] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, []);

  useEffect(() => {
    const calc = () => {
      const h = window.innerHeight || 0;
      const w = window.innerWidth || 0;
      setCompact(h < 760 || w < 520);
    };
    calc();
    window.addEventListener("resize", calc, { passive: true });
    return () => window.removeEventListener("resize", calc);
  }, []);

  const roles = useMemo(
    () => [
      {
        key: "Teacher",
        label: "Teacher",
        route: "/teacher",
        tint: "rgba(44,177,166,0.14)",
        border: "rgba(44,177,166,0.32)",
        iconBg: "rgba(44,177,166,0.22)",
        icon: "🎓",
      },
      {
        key: "Professional",
        label: "Professional",
        route: "/professional",
        tint: "rgba(73,74,72,0.10)",
        border: "rgba(73,74,72,0.22)",
        iconBg: "rgba(73,74,72,0.16)",
        icon: "💼",
      },
      {
        key: "Student",
        label: "Student",
        route: "/student",
        tint: "rgba(255,206,96,0.24)",
        border: "rgba(210,160,28,0.28)",
        iconBg: "rgba(210,160,28,0.18)",
        icon: "📚",
      },
      {
        key: "FamilyAndFriends",
        label: "Family and friends",
        route: "/family-and-friends",
        tint: "rgba(72,148,255,0.12)",
        border: "rgba(72,148,255,0.24)",
        iconBg: "rgba(72,148,255,0.16)",
        icon: "👥",
      },
    ],
    []
  );

  const handlePick = (roleKey, route) => {
    try {
      localStorage.setItem("voxia_role", roleKey);
      // Store student mic preference so the session inherits it
      localStorage.setItem("voxia_student_mic", studentMic ? "1" : "0");
    } catch {}
    navigate(route, { state: { studentMicEnabled: studentMic } });
  };

  const cardStyle = {
    ...styles.card,
    padding: compact ? "14px" : styles.card.padding,
    gap: compact ? "8px" : styles.card.gap,
    maxHeight: "calc(100vh - var(--header-h) - 36px)",
  };

  const titleStyle = {
    ...styles.title,
    fontSize: compact ? "clamp(20px, 3vw, 28px)" : styles.title.fontSize,
    marginBottom: compact ? "0" : styles.title.marginBottom,
  };

  const subStyle = {
    ...styles.sub,
    fontSize: compact ? "13px" : styles.sub.fontSize,
    maxWidth: compact ? "56ch" : styles.sub.maxWidth,
  };

  const gridStyle = {
    ...styles.grid,
    gap: compact ? "10px" : styles.grid.gap,
    marginTop: compact ? "2px" : styles.grid.marginTop,
  };

  return (
    <main
      style={{
        ...styles.page,
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0px)" : "translateY(12px)",
      }}
    >
      <div style={styles.stage}>
        <div style={styles.bgArc} aria-hidden="true" />
        <div style={styles.bgArc2} aria-hidden="true" />
        <div style={styles.bgArc3} aria-hidden="true" />

        <section style={cardStyle} aria-label="Choose your role">
          <h1 style={titleStyle}>Choose what fits you best.</h1>
          <p style={subStyle}>Pick what describes you best.</p>

          <div style={gridStyle} role="list">
            {roles.map((r) => {
              const isHover = hovered === r.key;
              const isPress = pressed === r.key;

              return (
                <button
                  key={r.key}
                  type="button"
                  role="listitem"
                  onClick={() => handlePick(r.key, r.route)}
                  onMouseEnter={() => setHovered(r.key)}
                  onMouseLeave={() => setHovered(null)}
                  onMouseDown={() => setPressed(r.key)}
                  onMouseUp={() => setPressed(null)}
                  onBlur={() => setPressed(null)}
                  style={{
                    ...styles.roleBtn,
                    backgroundColor: r.tint,
                    borderColor: r.border,
                    minHeight: compact ? "76px" : styles.roleBtn.minHeight,
                    padding: compact ? "12px" : styles.roleBtn.padding,
                    transform: isPress
                      ? "translateY(1px) scale(0.995)"
                      : isHover
                      ? "translateY(-2px)"
                      : "translateY(0px)",
                    boxShadow: isHover
                      ? "0 18px 42px rgba(0,0,0,0.14)"
                      : "0 14px 28px rgba(0,0,0,0.10)",
                  }}
                >
                  <span
                    style={{
                      ...styles.roleIcon,
                      width: compact ? "38px" : styles.roleIcon.width,
                      height: compact ? "38px" : styles.roleIcon.height,
                      borderRadius: compact ? "12px" : styles.roleIcon.borderRadius,
                      backgroundColor: r.iconBg,
                      fontSize: compact ? "17px" : styles.roleIcon.fontSize,
                    }}
                    aria-hidden="true"
                  >
                    {r.icon}
                  </span>
                  <span
                    style={{
                      ...styles.roleText,
                      fontSize: compact ? "14px" : styles.roleText.fontSize,
                    }}
                  >
                    {r.label}
                  </span>
                  <span
                    style={{
                      ...styles.roleHint,
                      fontSize: compact ? "11.5px" : styles.roleHint.fontSize,
                    }}
                  >
                    Continue
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer row: Student Mic toggle left, Joining link right */}
          <div style={{
            ...styles.footerRow,
            marginTop: compact ? "2px" : styles.footerRow.marginTop,
            gap: compact ? "8px" : "12px",
          }}>
            {/* Student Mic Toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={studentMic}
              onClick={() => setStudentMic((v) => !v)}
              style={{
                ...styles.micToggleWrap,
                backgroundColor: studentMic
                  ? "rgba(44,177,166,0.10)"
                  : "rgba(0,0,0,0.04)",
                border: studentMic
                  ? "1px solid rgba(44,177,166,0.32)"
                  : "1px solid rgba(0,0,0,0.10)",
              }}
              title="Allow students to use microphones in this session"
            >
              <span style={styles.micToggleIcon} aria-hidden="true">
                {studentMic ? "🎙️" : "🔇"}
              </span>
              <span style={styles.micToggleTextWrap}>
                <span style={{
                  ...styles.micToggleLabel,
                  color: studentMic ? COLORS.teal : "rgba(0,0,0,0.70)",
                }}>
                  Student Mic
                </span>
                <span style={{
                  ...styles.micToggleState,
                  color: studentMic ? COLORS.teal : "rgba(0,0,0,0.40)",
                }}>
                  {studentMic ? "On" : "Off"}
                </span>
              </span>
              {/* Toggle pill */}
              <span style={{
                ...styles.toggleTrack,
                backgroundColor: studentMic ? COLORS.teal : "rgba(0,0,0,0.16)",
              }}>
                <span style={{
                  ...styles.toggleThumb,
                  transform: studentMic ? "translateX(18px)" : "translateX(2px)",
                }} />
              </span>
            </button>

            {/* Joining instead link */}
            <button
              type="button"
              onClick={() => navigate("/join")}
              style={styles.linkBtn}
            >
              Joining instead?&nbsp;Enter a code →
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "calc(100vh - var(--header-h))",
    height: "calc(100vh - var(--header-h))",
    paddingTop: "var(--header-h)",
    backgroundColor: COLORS.pageBg,
    transition: "opacity 320ms ease, transform 420ms ease",
    overflow: "hidden",
  },

  stage: {
    position: "relative",
    width: "100%",
    height: "calc(100vh - var(--header-h))",
    display: "grid",
    placeItems: "center",
    padding: "18px",
    boxSizing: "border-box",
    overflow: "hidden",
  },

  bgArc: {
    position: "absolute",
    top: "clamp(40px, 8vh, 120px)",
    left: "clamp(-320px, -22vw, -180px)",
    width: "clamp(520px, 62vw, 900px)",
    height: "clamp(520px, 62vw, 900px)",
    backgroundColor: COLORS.beige,
    borderRadius: "999px",
    boxShadow: "0 24px 70px rgba(0,0,0,0.10)",
    zIndex: 0,
    pointerEvents: "none",
  },

  bgArc2: {
    position: "absolute",
    right: "clamp(-320px, -22vw, -170px)",
    bottom: "clamp(-320px, -24vw, -170px)",
    width: "clamp(520px, 62vw, 920px)",
    height: "clamp(520px, 62vw, 920px)",
    backgroundColor: "rgba(44,177,166,0.10)",
    borderRadius: "999px",
    boxShadow: "0 18px 60px rgba(0,0,0,0.08)",
    zIndex: 0,
    pointerEvents: "none",
  },

  bgArc3: {
    position: "absolute",
    right: "clamp(18px, 6vw, 80px)",
    top: "clamp(14px, 5vh, 70px)",
    width: "clamp(120px, 18vw, 220px)",
    height: "clamp(120px, 18vw, 220px)",
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: "999px",
    zIndex: 0,
    pointerEvents: "none",
  },

  card: {
    position: "relative",
    zIndex: 2,
    width: "min(720px, 100%)",
    backgroundColor: COLORS.white,
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: "22px",
    boxShadow: "0 18px 46px rgba(0,0,0,0.14)",
    padding: "clamp(16px, 3vw, 28px)",
    boxSizing: "border-box",
    display: "grid",
    gap: "10px",
  },

  title: {
    margin: 0,
    marginBottom: "0px",
    color: COLORS.black,
    fontFamily: "Merriweather, serif",
    fontSize: "clamp(24px, 3.2vw, 38px)",
    lineHeight: 1.08,
    letterSpacing: "-0.03em",
    fontWeight: 900,
    textAlign: "center",
  },

  sub: {
    margin: 0,
    color: "rgba(0,0,0,0.72)",
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "clamp(13px, 1.25vw, 15px)",
    lineHeight: 1.55,
    fontWeight: 500,
    textAlign: "center",
    maxWidth: "62ch",
    justifySelf: "center",
  },

  grid: {
    marginTop: "4px",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
    alignItems: "stretch",
  },

  roleBtn: {
    border: "1px solid rgba(0,0,0,0.10)",
    borderRadius: "18px",
    padding: "14px",
    cursor: "pointer",
    transition: "transform 160ms ease, box-shadow 220ms ease",
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr)",
    gridTemplateRows: "auto auto",
    columnGap: "11px",
    rowGap: "3px",
    alignItems: "center",
    textAlign: "left",
    minHeight: "90px",
    outline: "none",
    background: "transparent",
  },

  roleIcon: {
    width: "44px",
    height: "44px",
    borderRadius: "14px",
    display: "grid",
    placeItems: "center",
    fontSize: "20px",
    border: "1px solid rgba(0,0,0,0.08)",
    boxShadow: "0 10px 22px rgba(0,0,0,0.10)",
    gridRow: "1 / span 2",
  },

  roleText: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "15px",
    fontWeight: 850,
    letterSpacing: "-0.01em",
    color: COLORS.black,
    lineHeight: 1.15,
    minWidth: 0,
    display: "block",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  },

  roleHint: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "12.5px",
    fontWeight: 650,
    color: "rgba(0,0,0,0.62)",
    minWidth: 0,
    display: "block",
  },

  footerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "4px",
    flexWrap: "wrap",
    gap: "10px",
  },

  // Student mic toggle button
  micToggleWrap: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    borderRadius: "14px",
    padding: "8px 12px 8px 10px",
    cursor: "pointer",
    transition: "background-color 160ms ease, border-color 160ms ease",
    outline: "none",
    flexShrink: 0,
  },

  micToggleIcon: {
    fontSize: "16px",
    lineHeight: 1,
    flexShrink: 0,
  },

  micToggleTextWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "1px",
  },

  micToggleLabel: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.01em",
    lineHeight: 1.1,
  },

  micToggleState: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "11px",
    fontWeight: 650,
    lineHeight: 1.1,
  },

  toggleTrack: {
    position: "relative",
    width: "38px",
    height: "22px",
    borderRadius: "999px",
    flexShrink: 0,
    transition: "background-color 200ms ease",
    display: "inline-block",
  },

  toggleThumb: {
    position: "absolute",
    top: "2px",
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    backgroundColor: COLORS.white,
    boxShadow: "0 1px 4px rgba(0,0,0,0.28)",
    transition: "transform 200ms ease",
    display: "block",
  },

  linkBtn: {
    appearance: "none",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: COLORS.teal,
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontSize: "13.5px",
    fontWeight: 750,
    padding: "8px 10px",
    borderRadius: "12px",
    whiteSpace: "nowrap",
    flexShrink: 0,
  },
};
