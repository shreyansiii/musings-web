"use client";

import { useEffect, useState, type CSSProperties } from "react";

const BIG = "clamp(1.7rem, 5vw, 3.6rem)";
const MED = "clamp(1.3rem, 3.8vw, 2.6rem)";
const SMALL = "clamp(0.9rem, 2.4vw, 1.4rem)";

type Word = { text: string; className: string; style: CSSProperties };

// Each word has its own font, size, and style. Edit freely.
const WORDS: Word[] = [
  { text: "ideas", className: "font-accent", style: { fontSize: BIG } },
  { text: "and", className: "italic", style: { fontSize: SMALL } },
  {
    text: "creativity",
    className: "font-display",
    style: { fontSize: MED, textTransform: "uppercase", letterSpacing: "0.06em" },
  },
  {
    text: "from",
    className: "",
    style: { fontSize: SMALL, textTransform: "uppercase", letterSpacing: "0.25em" },
  },
  { text: "around", className: "font-accent italic", style: { fontSize: MED } },
  { text: "the", className: "italic", style: { fontSize: SMALL } },
  {
    text: "world",
    className: "font-display",
    style: { fontSize: BIG, textTransform: "uppercase", letterSpacing: "0.1em" },
  },
];

const START_MS = 400; // wait before the first word
const STEP_MS = 330; // gap between words
const HOLD_MS = 900; // how long the full phrase stays
const OUT_MS = 650; // phrase fade-out, finishes before the title appears

export default function IntroTitle() {
  const [count, setCount] = useState(0); // how many words are showing
  const [phase, setPhase] = useState<"words" | "out" | "title">("words");

  useEffect(() => {
    // Plays once per session; skipped for reduced-motion users.
    const seen = sessionStorage.getItem("musings-intro-v2") === "1";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (seen || reduce) {
      timers.push(setTimeout(() => setPhase("title"), 0));
      return () => timers.forEach(clearTimeout);
    }

    WORDS.forEach((_, i) => {
      timers.push(setTimeout(() => setCount(i + 1), START_MS + i * STEP_MS));
    });
    const wordsEnd = START_MS + WORDS.length * STEP_MS + HOLD_MS;
    timers.push(setTimeout(() => setPhase("out"), wordsEnd));
    timers.push(
      setTimeout(() => {
        setPhase("title");
        sessionStorage.setItem("musings-intro-v2", "1");
      }, wordsEnd + OUT_MS)
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="relative flex items-center justify-center min-h-[7rem] sm:min-h-[8rem]">
      {/* Real title: always in the layout, invisible until the phrase is gone. */}
      <h1
        className="relative z-10 font-accent text-4xl xs:text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-center break-words"
        style={{
          color: "var(--green)",
          opacity: phase === "title" ? 1 : 0,
          transition: "opacity 0.9s ease",
        }}
      >
        MUSINGS by Shreyansi
      </h1>

      {/* The phrase. Every word holds its place so nothing shifts;
          each one pops in when its turn comes. */}
      <div
        className="absolute inset-0 z-10 flex flex-wrap items-baseline justify-center content-center gap-x-3 sm:gap-x-4 gap-y-1 px-2 pointer-events-none"
        style={{
          color: "var(--green)",
          opacity: phase === "words" ? 1 : 0,
          transition: `opacity ${OUT_MS}ms ease`,
        }}
        aria-hidden="true"
      >
        {WORDS.map((w, i) => {
          const on = i < count;
          return (
            <span
              key={w.text}
              className={w.className}
              style={{
                ...w.style,
                opacity: on ? 1 : 0,
                transform: on ? "none" : "translateY(12px) scale(0.9)",
                filter: on ? "blur(0)" : "blur(6px)",
                transition:
                  "opacity 0.55s ease-out, transform 0.55s ease-out, filter 0.55s ease-out",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}