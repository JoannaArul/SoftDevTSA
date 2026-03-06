import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const COLORS = {
  teal: "#2CB1A6",
  gray: "#494A48",
  beige: "#F5FCEF",
  black: "#000000",
  white: "#FFFFFF",
};

const FONT = "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Merriweather, serif";

/* ── tiny reusable hooks (same pattern as Home.jsx) ── */

function useInViewOnce(threshold = 0.3) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setSeen(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [seen, threshold]);
  return [ref, seen];
}

function useWindowWidth() {
  const [w, setW] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1200));
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

/* ── lightweight animation components (no extra deps) ── */

function SplitTextReveal({ text, delay = 0, as: Tag = "span", style = {} }) {
  const [ref, seen] = useInViewOnce(0.3);
  const words = text.split(" ");
  return (
    <Tag ref={ref} style={{ ...style, display: "inline" }}>
      {words.map((word, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            opacity: seen ? 1 : 0,
            transform: seen ? "translateY(0)" : "translateY(18px)",
            filter: seen ? "blur(0px)" : "blur(6px)",
            transition: `opacity 500ms ease ${delay + i * 60}ms, transform 500ms ease ${delay + i * 60}ms, filter 500ms ease ${delay + i * 60}ms`,
          }}
        >
          {word}{i < words.length - 1 ? "\u00A0" : ""}
        </span>
      ))}
    </Tag>
  );
}

/* ── rotating text (react-bits inspired) ── */

function RotatingText({ words, interval = 2400, color = COLORS.teal }) {
  const [index, setIndex] = useState(0);
  const [animState, setAnimState] = useState("in"); // "in" | "out"

  useEffect(() => {
    const id = setInterval(() => {
      setAnimState("out");
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % words.length);
        setAnimState("in");
      }, 350);
    }, interval);
    return () => clearInterval(id);
  }, [words.length, interval]);

  return (
    <span
      style={{
        display: "inline-block",
        position: "relative",
        color,
        minWidth: "3ch",
      }}
    >
      <span
        style={{
          display: "inline-block",
          transition: "opacity 300ms ease, transform 300ms ease, filter 300ms ease",
          opacity: animState === "in" ? 1 : 0,
          transform: animState === "in" ? "translateY(0)" : "translateY(-16px)",
          filter: animState === "in" ? "blur(0px)" : "blur(4px)",
        }}
      >
        {words[index]}
      </span>
    </span>
  );
}

function CountUpNumber({ to, duration = 2000, suffix = "", prefix = "" }) {
  const [ref, seen] = useInViewOnce(0.3);
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!seen) return;
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, duration]);
  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}{value.toLocaleString()}{suffix}
    </span>
  );
}

function FadeInSection({ children, delay = 0, style = {} }) {
  const [ref, seen] = useInViewOnce(0.2);
  return (
    <div
      ref={ref}
      style={{
        ...style,
        opacity: seen ? 1 : 0,
        transform: seen ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 600ms ease ${delay}ms, transform 600ms ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ── floating dots background ── */

function FloatingDots({ count = 24, color = COLORS.teal }) {
  const dots = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: 3 + Math.random() * 5,
      delay: Math.random() * 6,
      dur: 4 + Math.random() * 4,
    }));
  }, [count]);

  return (
    <>
      <style>{`
        @keyframes whyDotFloat {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.18; }
          50% { transform: translateY(-14px) scale(1.2); opacity: 0.35; }
        }
      `}</style>
      {dots.map((d) => (
        <div
          key={d.id}
          style={{
            position: "absolute",
            left: d.left,
            top: d.top,
            width: d.size,
            height: d.size,
            borderRadius: "50%",
            backgroundColor: color,
            animation: `whyDotFloat ${d.dur}s ease-in-out ${d.delay}s infinite`,
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}

/* ── spotlight card ── */

function SpotlightCard({ children, style = {} }) {
  const cardRef = useRef(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);

  const onMove = useCallback((e) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={onMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "20px",
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: hovering ? "0 18px 44px rgba(0,0,0,0.15)" : "0 12px 32px rgba(0,0,0,0.10)",
        transition: "transform 200ms ease, box-shadow 200ms ease",
        transform: hovering ? "translateY(-3px)" : "translateY(0)",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: hovering
            ? `radial-gradient(320px circle at ${pos.x}px ${pos.y}px, rgba(44,177,166,0.12), transparent 60%)`
            : "none",
          transition: "opacity 200ms ease",
          zIndex: 1,
        }}
      />
      <div style={{ position: "relative", zIndex: 2 }}>{children}</div>
    </div>
  );
}

/* ── tilt card ── */

function TiltCard({ children, style = {} }) {
  const ref = useRef(null);
  const [transform, setTransform] = useState("perspective(600px) rotateX(0deg) rotateY(0deg)");

  const onMove = useCallback((e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTransform(`perspective(600px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`);
  }, []);

  const onLeave = useCallback(() => {
    setTransform("perspective(600px) rotateX(0deg) rotateY(0deg)");
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        transition: "transform 200ms ease",
        transform,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ── main page ── */

export default function WhyVoxia() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const width = useWindowWidth();
  const isNarrow = width <= 900;
  const isSmall = width <= 520;

  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <main
      style={{
        minHeight: "calc(100vh - var(--header-h))",
        paddingTop: "var(--header-h)",
        backgroundColor: COLORS.beige,
        overflowX: "hidden",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(14px)",
        transition: "opacity 380ms ease, transform 420ms ease",
      }}
    >
      {/* ── HERO ── */}
      <section
        style={{
          position: "relative",
          width: "100%",
          padding: isSmall ? "60px 18px 50px" : "80px 24px 70px",
          boxSizing: "border-box",
          backgroundColor: COLORS.gray,
          overflow: "hidden",
          textAlign: "center",
        }}
      >
        <FloatingDots count={30} />

        <div style={{ position: "relative", zIndex: 2, maxWidth: "900px", margin: "0 auto" }}>
          <h1
            style={{
              margin: 0,
              fontFamily: SERIF,
              fontSize: "clamp(36px, 5.5vw, 64px)",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              lineHeight: 1.15,
              color: COLORS.white,
            }}
          >
            <SplitTextReveal text="Accessible in" />
            <br />
            <RotatingText
              words={["classrooms", "workplaces", "homes", "communities"]}
              interval={2600}
            />
          </h1>

          <FadeInSection delay={500} style={{ marginTop: "20px" }}>
            <p
              style={{
                margin: 0,
                fontFamily: FONT,
                fontSize: "clamp(15px, 1.3vw, 19px)",
                lineHeight: 1.7,
                fontWeight: 500,
                color: "rgba(255,255,255,0.82)",
                maxWidth: "62ch",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              Voxia converts teacher speech into live captions and keeps slideshows synced in real time. This means students can follow the lesson clearly on their own device without having to shift their attention between an interpreter and the board.
            </p>
          </FadeInSection>
        </div>
      </section>

      {/* ── THE PROBLEM (Stats) ── */}
      <section
        style={{
          width: "100%",
          padding: isSmall ? "44px 18px" : "64px 24px",
          boxSizing: "border-box",
          backgroundColor: COLORS.beige,
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <FadeInSection>
            <h2
              style={{
                margin: 0,
                fontFamily: SERIF,
                fontSize: "clamp(28px, 3.8vw, 48px)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: COLORS.black,
                textAlign: "center",
              }}
            >
              The accessibility gap
            </h2>
            <p
              style={{
                margin: "12px auto 0",
                fontFamily: FONT,
                fontSize: "clamp(14px, 1.15vw, 17px)",
                lineHeight: 1.75,
                fontWeight: 500,
                color: "rgba(0,0,0,0.75)",
                textAlign: "center",
                maxWidth: "72ch",
              }}
            >
              Schools typically rely on three primary methods to support accessibility: lip reading, ASL interpreters, and CART live transcription. While these are valuable, they are not always consistently available and are resource-intensive.
            </p>
          </FadeInSection>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr" : "repeat(2, 1fr)",
              gap: "20px",
              marginTop: "40px",
            }}
          >
            <FadeInSection delay={0}>
              <TiltCard>
                <SpotlightCard style={{ padding: "28px 24px", backgroundColor: COLORS.white, minHeight: "160px" }}>
                  <div style={{ fontFamily: SERIF, fontSize: "clamp(32px, 3vw, 44px)", fontWeight: 900, color: COLORS.teal }}>
                    <CountUpNumber to={85} suffix="%" />
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: "15px", fontWeight: 700, color: COLORS.black, marginTop: "8px" }}>
                    Mainstream enrollment
                  </div>
                  <p style={{ fontFamily: FONT, fontSize: "14px", lineHeight: 1.6, color: "rgba(0,0,0,0.7)", marginTop: "8px", fontWeight: 500 }}>
                    of deaf children attend mainstream public schools. That means they learn in classrooms that are not specialized for deaf students.
                  </p>
                </SpotlightCard>
              </TiltCard>
            </FadeInSection>

            <FadeInSection delay={120}>
              <TiltCard>
                <SpotlightCard style={{ padding: "28px 24px", backgroundColor: COLORS.white, minHeight: "160px" }}>
                  <div style={{ fontFamily: SERIF, fontSize: "clamp(32px, 3vw, 44px)", fontWeight: 900, color: COLORS.teal }}>
                    <CountUpNumber to={30} />–<CountUpNumber to={40} suffix="%" />
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: "15px", fontWeight: 700, color: COLORS.black, marginTop: "8px" }}>
                    Lip reading accuracy
                  </div>
                  <p style={{ fontFamily: FONT, fontSize: "14px", lineHeight: 1.6, color: "rgba(0,0,0,0.7)", marginTop: "8px", fontWeight: 500 }}>
                    Research shows that only 30–40% of spoken English is visually distinguishable through lip reading alone, which means students often rely on context to fill in the rest of the information.
                  </p>
                </SpotlightCard>
              </TiltCard>
            </FadeInSection>

            <FadeInSection delay={240}>
              <TiltCard>
                <SpotlightCard style={{ padding: "28px 24px", backgroundColor: COLORS.white, minHeight: "160px" }}>
                  <div style={{ fontFamily: SERIF, fontSize: "clamp(32px, 3vw, 44px)", fontWeight: 900, color: COLORS.teal }}>
                    ~$<CountUpNumber to={32} suffix="K" /><span style={{ fontSize: "clamp(18px, 1.5vw, 24px)" }}>/yr</span>
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: "15px", fontWeight: 700, color: COLORS.black, marginTop: "8px" }}>
                    ASL interpreter cost
                  </div>
                  <p style={{ fontFamily: FONT, fontSize: "14px", lineHeight: 1.6, color: "rgba(0,0,0,0.7)", marginTop: "8px", fontWeight: 500 }}>
                    Although ASL interpreters are highly effective, they cost around $30 per hour. Over a 180-day school year with six hours per day, that comes out to around $32,000 for a single student.
                  </p>
                </SpotlightCard>
              </TiltCard>
            </FadeInSection>

            <FadeInSection delay={360}>
              <TiltCard>
                <SpotlightCard style={{ padding: "28px 24px", backgroundColor: COLORS.white, minHeight: "160px" }}>
                  <div style={{ fontFamily: SERIF, fontSize: "clamp(32px, 3vw, 44px)", fontWeight: 900, color: COLORS.teal }}>
                    $<CountUpNumber to={100} />–$<CountUpNumber to={150} /><span style={{ fontSize: "clamp(18px, 1.5vw, 24px)" }}>/hr</span>
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: "15px", fontWeight: 700, color: COLORS.black, marginTop: "8px" }}>
                    CART live captioning
                  </div>
                  <p style={{ fontFamily: FONT, fontSize: "14px", lineHeight: 1.6, color: "rgba(0,0,0,0.7)", marginTop: "8px", fontWeight: 500 }}>
                    CART provides human-driven, word-for-word transcription through a stenograph machine and ranges from $100 to $150 per hour. Similarly, it is not always consistently available.
                  </p>
                </SpotlightCard>
              </TiltCard>
            </FadeInSection>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section
        style={{
          width: "100%",
          padding: isSmall ? "44px 18px" : "64px 24px",
          boxSizing: "border-box",
          backgroundColor: "#EBF2E4",
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <FadeInSection>
            <h2
              style={{
                margin: 0,
                fontFamily: SERIF,
                fontSize: "clamp(28px, 3.8vw, 48px)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: COLORS.black,
                textAlign: "center",
              }}
            >
              How Voxia works
            </h2>
            <p
              style={{
                margin: "12px auto 0",
                fontFamily: FONT,
                fontSize: "clamp(14px, 1.15vw, 17px)",
                lineHeight: 1.75,
                fontWeight: 500,
                color: "rgba(0,0,0,0.72)",
                textAlign: "center",
                maxWidth: "64ch",
              }}
            >
              From the teacher's side, a session can be created in seconds and generates a unique code for students to join. From the student's perspective, they simply enter the code and slides automatically synchronize in real time.
            </p>
          </FadeInSection>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr" : "repeat(3, 1fr)",
              gap: "20px",
              marginTop: "36px",
            }}
          >
            {[
              {
                step: "1",
                title: "Teacher creates a session",
                desc: "A unique join code is generated instantly. The teacher uploads their presentation slides as a PDF. This ensures that every student sees the exact same slide formatting, regardless of device or screen size.",
              },
              {
                step: "2",
                title: "Students join with a code",
                desc: "Students enter the session code on any device. Slides automatically synchronize in real time. No accounts, downloads, or setup is required.",
              },
              {
                step: "3",
                title: "Speak and caption",
                desc: "The teacher unmutes their microphone and speaks naturally. As they speak, it captures their speech and converts it into live captions instantly, showing up on every student's screen.",
              },
            ].map((item, i) => (
              <FadeInSection key={item.step} delay={i * 120}>
                <div
                  style={{
                    padding: "28px 24px",
                    borderRadius: "18px",
                    backgroundColor: COLORS.white,
                    border: "1px solid rgba(0,0,0,0.06)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.07)",
                    minHeight: "200px",
                  }}
                >
                  <div
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "50%",
                      backgroundColor: COLORS.teal,
                      color: COLORS.white,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "17px",
                      fontWeight: 900,
                      fontFamily: FONT,
                      marginBottom: "14px",
                    }}
                  >
                    {item.step}
                  </div>
                  <div
                    style={{
                      fontFamily: SERIF,
                      fontSize: "clamp(18px, 1.6vw, 22px)",
                      fontWeight: 800,
                      color: COLORS.black,
                    }}
                  >
                    {item.title}
                  </div>
                  <p
                    style={{
                      margin: "10px 0 0",
                      fontFamily: FONT,
                      fontSize: "clamp(13px, 1.05vw, 15px)",
                      lineHeight: 1.65,
                      fontWeight: 500,
                      color: "rgba(0,0,0,0.72)",
                    }}
                  >
                    {item.desc}
                  </p>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT SETS US APART ── */}
      <section
        style={{
          width: "100%",
          padding: isSmall ? "44px 18px" : "64px 24px",
          boxSizing: "border-box",
          backgroundColor: COLORS.teal,
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <FadeInSection>
            <h2
              style={{
                margin: 0,
                fontFamily: SERIF,
                fontSize: "clamp(28px, 3.8vw, 48px)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: COLORS.beige,
                textAlign: "center",
              }}
            >
              What makes Voxia unique
            </h2>
            <p
              style={{
                margin: "12px auto 0",
                fontFamily: FONT,
                fontSize: "clamp(14px, 1.15vw, 17px)",
                lineHeight: 1.75,
                fontWeight: 500,
                color: "rgba(245,252,239,0.80)",
                textAlign: "center",
                maxWidth: "64ch",
              }}
            >
              Since students have everything delivered to their device, they do not have to shift their attention between an interpreter and the board.
            </p>
          </FadeInSection>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr" : "repeat(2, 1fr)",
              gap: "20px",
              marginTop: "36px",
            }}
          >
            {[
              {
                title: "Zero barrier to entry",
                desc: "Students join with a session code on any device. No accounts, no apps, and no installs are required. Sessions can be created and joined in a matter of seconds.",
              },
              {
                title: "Live speech-to-text captions",
                desc: "As the teacher speaks, captions appear on every connected screen in real time. This allows students to read along without having to rely on lip reading or filling in missing context.",
              },
              {
                title: "Synced slides across devices",
                desc: "Teachers upload a PDF and every student sees the exact same slide formatting, regardless of device or screen size. When the teacher advances, every screen updates automatically.",
              },
              {
                title: "Late-join & refresh sync",
                desc: "If a student joins late or refreshes their browser, the server immediately sends them the current slide, transcript, and full session state. This means they are never out of sync with the rest of the class.",
              },
              {
                title: "Built with real-time architecture",
                desc: "Voxia uses WebSockets to create a two-way connection between the teacher's browser, the server, and all connected students. This allows slide changes and live captions to update instantly across every device.",
              },
              {
                title: "Fraction of the cost",
                desc: "Traditional accommodations like ASL interpreters can cost around $32,000 per student per year. Voxia runs entirely in the browser and only requires a teacher's voice and an internet connection.",
              },
            ].map((item, i) => (
              <FadeInSection key={item.title} delay={i * 80}>
                <div
                  style={{
                    padding: "24px",
                    borderRadius: "16px",
                    backgroundColor: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  <div
                    style={{
                      fontFamily: SERIF,
                      fontSize: "clamp(18px, 1.6vw, 22px)",
                      fontWeight: 800,
                      color: COLORS.white,
                    }}
                  >
                    {item.title}
                  </div>
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontFamily: FONT,
                      fontSize: "clamp(14px, 1.1vw, 16px)",
                      lineHeight: 1.65,
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    {item.desc}
                  </p>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHO WE REACH ── */}
      <section
        style={{
          width: "100%",
          padding: isSmall ? "44px 18px" : "64px 24px",
          boxSizing: "border-box",
          backgroundColor: COLORS.beige,
        }}
      >
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <FadeInSection>
            <h2
              style={{
                margin: 0,
                fontFamily: SERIF,
                fontSize: "clamp(28px, 3.8vw, 48px)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: COLORS.black,
                textAlign: "center",
              }}
            >
              Built for every environment
            </h2>
            <p
              style={{
                margin: "12px auto 0",
                fontFamily: FONT,
                fontSize: "clamp(14px, 1.15vw, 17px)",
                lineHeight: 1.75,
                fontWeight: 500,
                color: "rgba(0,0,0,0.72)",
                textAlign: "center",
                maxWidth: "64ch",
              }}
            >
              We plan to expand Voxia beyond schools into workplaces and home environments. Our long-term vision is to make Voxia a platform that supports communication in any environment.
            </p>
          </FadeInSection>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr" : "repeat(3, 1fr)",
              gap: "20px",
              marginTop: "36px",
            }}
          >
            {[
              {
                label: "Schools",
                desc: "85% of deaf children attend mainstream public schools. Voxia lets teachers present naturally while students follow live captions and synced slides on their own device.",
              },
              {
                label: "Workplaces",
                desc: "Meetings, presentations, and trainings can be made accessible without specialized equipment or additional personnel. It only requires a browser and a voice.",
              },
              {
                label: "Home & Community",
                desc: "Family gatherings, religious services, and community events are all environments where communication barriers exist. Voxia can support accessibility in any setting where someone is speaking.",
              },
            ].map((env, i) => (
              <FadeInSection key={env.label} delay={i * 120}>
                <TiltCard>
                  <SpotlightCard
                    style={{
                      padding: "32px 24px",
                      backgroundColor: COLORS.white,
                      textAlign: "center",
                      minHeight: "200px",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: SERIF,
                        fontSize: "clamp(22px, 2vw, 28px)",
                        fontWeight: 800,
                        color: COLORS.teal,
                      }}
                    >
                      {env.label}
                    </div>
                    <p
                      style={{
                        margin: "12px 0 0",
                        fontFamily: FONT,
                        fontSize: "clamp(13px, 1.05vw, 15px)",
                        lineHeight: 1.65,
                        fontWeight: 500,
                        color: "rgba(0,0,0,0.72)",
                      }}
                    >
                      {env.desc}
                    </p>
                  </SpotlightCard>
                </TiltCard>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── FUTURE VISION ── */}
      <section
        style={{
          width: "100%",
          padding: isSmall ? "44px 18px" : "64px 24px",
          boxSizing: "border-box",
          backgroundColor: "#EBF2E4",
        }}
      >
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <FadeInSection>
            <h2
              style={{
                margin: 0,
                fontFamily: SERIF,
                fontSize: "clamp(28px, 3.8vw, 48px)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: COLORS.black,
                textAlign: "center",
              }}
            >
              What's next
            </h2>
            <p
              style={{
                margin: "12px auto 0",
                fontFamily: FONT,
                fontSize: "clamp(14px, 1.15vw, 17px)",
                lineHeight: 1.75,
                fontWeight: 500,
                color: "rgba(0,0,0,0.72)",
                textAlign: "center",
                maxWidth: "60ch",
              }}
            >
              We are currently working on several improvements to make Voxia more accurate, more customizable, and more useful across different environments.
            </p>
          </FadeInSection>

          <div style={{ display: "grid", gap: "14px", marginTop: "32px" }}>
            {[
              "Enhanced speech-to-text accuracy",
              "Downloadable transcripts after every session",
              "AI-generated notes and study sets from session content",
              "Customizable caption display and accessibility settings",
              "Improved fullscreen navigation for phones and tablets",
              "Teacher dashboard with participant lists and session management",
            ].map((item, i) => (
              <FadeInSection key={item} delay={i * 80}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "16px 20px",
                    borderRadius: "14px",
                    backgroundColor: COLORS.white,
                    border: "1px solid rgba(0,0,0,0.06)",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.05)",
                  }}
                >
                  <span
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      backgroundColor: COLORS.teal,
                      color: COLORS.white,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "14px",
                      fontWeight: 800,
                      flexShrink: 0,
                      fontFamily: FONT,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    style={{
                      fontFamily: FONT,
                      fontSize: "clamp(14px, 1.1vw, 16px)",
                      fontWeight: 600,
                      color: COLORS.black,
                    }}
                  >
                    {item}
                  </span>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FOOTER ── */}
      <section
        style={{
          width: "100%",
          padding: isSmall ? "50px 18px" : "72px 24px",
          boxSizing: "border-box",
          backgroundColor: COLORS.gray,
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <FloatingDots count={18} color="rgba(255,255,255,0.25)" />

        <div style={{ position: "relative", zIndex: 2, maxWidth: "700px", margin: "0 auto" }}>
          <FadeInSection>
            <h2
              style={{
                margin: 0,
                fontFamily: SERIF,
                fontSize: "clamp(26px, 3.5vw, 44px)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: COLORS.white,
                lineHeight: 1.15,
              }}
            >
              Ready to make your{" "}
              <RotatingText
                words={["classroom", "workplace", "community"]}
                interval={2800}
              />{" "}
              accessible?
            </h2>

            <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "24px", flexWrap: "wrap" }}>
              <CTAButton label="Start a Session" onClick={() => navigate("/host")} primary />
              <CTAButton label="Join a Session" onClick={() => navigate("/join")} />
            </div>
          </FadeInSection>
        </div>
      </section>
    </main>
  );
}

function CTAButton({ label, onClick, primary = false }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: FONT,
        fontSize: "15px",
        fontWeight: 600,
        padding: "12px 24px",
        borderRadius: "14px",
        border: primary ? "none" : "1px solid rgba(255,255,255,0.35)",
        backgroundColor: primary ? COLORS.teal : "transparent",
        color: COLORS.white,
        cursor: "pointer",
        transition: "transform 160ms ease, box-shadow 200ms ease",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hover ? "0 14px 30px rgba(0,0,0,0.30)" : "0 8px 18px rgba(0,0,0,0.18)",
      }}
    >
      {label}
    </button>
  );
}
