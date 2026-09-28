"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  getGenres,
  getContentPieces,
  searchContentPieces,
  subscribeToNewsletter,
  Genre,
  ContentPiece,
} from "@/lib/api";
import { genreColor } from "@/lib/genreColor";
import IntroTitle from "@/components/IntroTitle";

// Strips HTML tags from rich-text excerpt content so the hover preview
// shows clean plain text instead of raw markup.
function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type FilterOption = { key: string | null; label: string; color: string };

// ---------------------------------------------------------------------------
// Kinetic reader: a strip of drifting lines pulled from Shreyansi's real
// pieces (titles, subtitles, excerpts). A magnifying glass wanders across it,
// enlarging whatever it passes over. Both layers use the same CSS marquee
// timing, so the enlarged text inside the lens stays perfectly in sync with
// the text underneath it.
// ---------------------------------------------------------------------------
type Snippet = { text: string; kind: "title" | "line" };

const READER_H = 140; // strip height (px)
const READER_ROW = 28; // height of each line of text
const READER_ROWS = READER_H / READER_ROW; // 5 lines
const READER_LENS = 112; // magnifier diameter
const READER_ZOOM = 1.9; // magnification inside the lens

const READER_FALLBACK: Snippet[] = [
  { text: "MUSINGS", kind: "title" },
  { text: "words, images and noise", kind: "line" },
  { text: "STREET STYLE", kind: "title" },
  { text: "notes on spirituality", kind: "line" },
  { text: "FILMS", kind: "title" },
  { text: "poems, essays and small obsessions", kind: "line" },
  { text: "MUSIC", kind: "title" },
  { text: "an independent magazine", kind: "line" },
];

function ReaderRows({ rows, lens }: { rows: Snippet[][]; lens: boolean }) {
  return (
    <div style={{ height: READER_H }}>
      {rows.map((items, r) => (
        <div
          key={r}
          className="overflow-hidden whitespace-nowrap"
          style={{ height: READER_ROW }}
        >
          <div
            className={`musings-reel ${r % 2 ? "rev" : ""}`}
            style={{ ["--dur" as string]: `${100 + r * 12}s` } as React.CSSProperties}
          >
            {[0, 1].map((copy) => (
              <span key={copy} className="inline-flex shrink-0">
                {items.map((s, j) => (
                  <span
                    key={j}
                    className={
                      s.kind === "title"
                        ? "font-display tracking-[0.1em]"
                        : "font-body italic"
                    }
                    style={{
                      fontSize: 13,
                      lineHeight: `${READER_ROW}px`,
                      paddingRight: "2.5rem",
                      color: lens
                        ? s.kind === "title"
                          ? "var(--pink)"
                          : "var(--text)"
                        : "var(--text-muted)",
                      opacity: lens ? 1 : 0.5,
                    }}
                  >
                    {s.text}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opening sequence: sits exactly where "MUSINGS by Shreyansi" lives. Words pop
// in one after another, each with its own typeface, size, colour and entrance,
// composed as a small poster over three lines. Then everything dissolves and
// the real title animates in.
// ---------------------------------------------------------------------------
type IntroWord = {
  text: string;
  font: "display" | "accent" | "serif" | "mono";
  size: number; // rem at full (desktop) size
  color: string;
  anim: "pop" | "spin" | "slide" | "drop" | "rise" | "flip" | "type";
  at: number; // seconds after load
  rot?: number; // resting tilt in degrees
  stroke?: boolean; // outlined instead of filled
  br?: boolean; // start a new line before this word
  spacing?: string;
  italic?: boolean;
};

const INTRO_WORDS: IntroWord[] = [
  { text: "IDEAS", font: "display", size: 5, color: "var(--pink)", anim: "pop", at: 0.1, rot: -4 },
  { text: "&", font: "accent", size: 3.6, color: "var(--green)", anim: "spin", at: 0.7 },
  { text: "creativity", font: "accent", size: 3.2, color: "var(--text)", anim: "slide", at: 1.2, rot: 2 },
  { text: "FROM", font: "mono", size: 1.1, color: "var(--text-muted)", anim: "type", at: 1.9, br: true, spacing: "0.35em" },
  { text: "around", font: "serif", size: 3.4, color: "var(--pink)", anim: "drop", at: 2.4, rot: -3, italic: true },
  { text: "THE", font: "display", size: 2, color: "var(--text)", anim: "rise", at: 2.9, rot: -8, stroke: true },
  { text: "WORLD", font: "display", size: 5.6, color: "var(--green)", anim: "flip", at: 3.2, br: true },
];

function introFont(f: IntroWord["font"]): { className?: string; style?: React.CSSProperties } {
  switch (f) {
    case "display":
      return { className: "font-display" };
    case "accent":
      return { className: "font-accent" };
    case "serif":
      return { style: { fontFamily: "var(--font-body), Georgia, serif" } };
    default:
      return { style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } };
  }
}

function KineticIntro() {
  return (
    <div
      aria-hidden="true"
      className="musings-stage absolute inset-0 z-10 flex flex-wrap items-center content-center justify-center gap-x-3 sm:gap-x-5 gap-y-0 text-center pointer-events-none"
      style={{ animation: "musings-introout 0.6s ease 4.6s forwards" }}
    >
      {INTRO_WORDS.map((w, wi) => {
        const f = introFont(w.font);
        const split = w.anim === "flip" || w.anim === "type";
        const step = w.anim === "type" ? 0.09 : 0.07;
        const base = {
          ...f.style,
          display: "inline-block",
          fontSize: `calc(var(--s) * ${w.size}rem)`,
          lineHeight: 1.05,
          color: w.stroke ? "transparent" : w.color,
          WebkitTextStroke: w.stroke ? `1.5px ${w.color}` : undefined,
          letterSpacing: w.spacing,
          fontStyle: w.italic ? "italic" : undefined,
          ["--rot" as string]: `${w.rot ?? 0}deg`,
        } as React.CSSProperties;

        return (
          <Fragment key={wi}>
            {w.br && <span className="basis-full h-0" />}
            <span
              className={f.className}
              style={
                split
                  ? { ...base, transform: `rotate(${w.rot ?? 0}deg)` }
                  : {
                      ...base,
                      animation: `mw-${w.anim} 0.8s cubic-bezier(0.2,1.5,0.4,1) ${w.at}s both, mw-float ${
                        2.6 + wi * 0.3
                      }s ease-in-out ${w.at + 1}s infinite alternate`,
                    }
              }
            >
              {split
                ? Array.from(w.text).map((ch, ci) => (
                    <span
                      key={ci}
                      style={{
                        display: "inline-block",
                        animation: `mw-${w.anim} 0.7s cubic-bezier(0.2,1.4,0.4,1) ${
                          w.at + ci * step
                        }s both`,
                      }}
                    >
                      {ch}
                    </span>
                  ))
                : w.text}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

// Hero photo entrance: each photo swings down from above like it's hanging on
// a nail, overshoots a few times, settles at its tilt, then keeps swaying
// gently. Each photo lands together with one of the opening words
// (IDEAS, &, creativity), so photos and words arrive at the same time.
function heroSwing(done: boolean, rot: number, delay: number, i: number): React.CSSProperties {
  return {
    ["--rot" as string]: `${rot}deg`,
    transformOrigin: "50% 0%",
    opacity: done ? undefined : 0,
    animation: done
      ? `mw-swing 1.8s ease-in-out ${delay}s both, mw-sway ${3.2 + i * 0.6}s ease-in-out ${
          delay + 1.9
        }s infinite alternate`
      : "none",
  } as React.CSSProperties;
}

function KineticReader({ pieces }: { pieces: ContentPiece[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  const snippets = useMemo(() => {
    const out: Snippet[] = [];
    const clip = (t: string) =>
      t.length > 90 ? t.slice(0, 88).trimEnd() + "…" : t;
    pieces.forEach((p) => {
      const title = p.title?.replace(/\s+/g, " ").trim();
      if (title) out.push({ text: title, kind: "title" });
      const sub = p.subtitle?.replace(/\s+/g, " ").trim();
      if (sub) out.push({ text: clip(sub), kind: "line" });
      const ex = stripHtml(p.excerpt?.trim() ?? "");
      if (ex) out.push({ text: clip(ex), kind: "line" });
    });
    return out.length ? out : READER_FALLBACK;
  }, [pieces]);

  // Each line starts at a different point in the list so the lines differ.
  const rows = useMemo(() => {
    const n = snippets.length;
    return Array.from({ length: READER_ROWS }, (_, r) => {
      const start = Math.floor((r * n) / READER_ROWS) + r;
      return Array.from({ length: 16 }, (_, k) => snippets[(start + k) % n]);
    });
  }, [snippets]);

  // Drive the magnifier along a smooth wandering path.
  useEffect(() => {
    const box = boxRef.current;
    const lens = lensRef.current;
    const inner = innerRef.current;
    if (!box || !lens || !inner) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let lastW = 0;

    const frame = (now: number) => {
      const W = box.offsetWidth;
      if (W !== lastW) {
        lastW = W;
        box.style.setProperty("--w", `${W}px`);
      }
      const t = reduce ? 0 : now;
      const cx = W / 2 + (W / 2 - READER_LENS / 2) * Math.sin(t * 0.00023);
      const cy =
        READER_H / 2 +
        ((READER_H - READER_LENS) / 2 + 6) * Math.sin(t * 0.00061 + 1);

      lens.style.transform = `translate(${cx - READER_LENS / 2}px, ${
        cy - READER_LENS / 2
      }px)`;
      inner.style.transform = `translate(${READER_LENS / 2 - cx * READER_ZOOM}px, ${
        READER_LENS / 2 - cy * READER_ZOOM
      }px) scale(${READER_ZOOM})`;

      if (!reduce) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fade =
    "linear-gradient(to right, transparent, black 8%, black 92%, transparent)";

  return (
    <div
      ref={boxRef}
      aria-hidden="true"
      className="relative z-[5] w-full mb-2 sm:mb-4 select-none pointer-events-none"
      style={{ height: READER_H }}
    >
      {/* the drifting text */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ maskImage: fade, WebkitMaskImage: fade }}
      >
        <ReaderRows rows={rows} lens={false} />
      </div>

      {/* the magnifying glass */}
      <div
        ref={lensRef}
        className="absolute left-0 top-0"
        style={{ width: READER_LENS, height: READER_LENS, willChange: "transform" }}
      >
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{
            background: "var(--bg)",
            boxShadow:
              "0 0 0 3px var(--pink), 0 10px 24px rgba(254,129,212,0.28)",
          }}
        >
          <div
            ref={innerRef}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "var(--w)",
              height: READER_H,
              transformOrigin: "0 0",
              willChange: "transform",
            }}
          >
            <ReaderRows rows={rows} lens />
          </div>
        </div>
        {/* handle */}
        <div
          className="absolute"
          style={{
            left: READER_LENS * 0.86,
            top: READER_LENS * 0.86,
            width: 44,
            height: 8,
            borderRadius: 999,
            background: "var(--pink)",
            transformOrigin: "0 50%",
            transform: "rotate(45deg)",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Moving genre bar (replaces GenreTicker): a thin editorial strip between two
// hairlines. It scrolls continuously, pauses on hover, and a pink underline
// draws itself under the selected genre. Clicking filters the cards.
// The bar is full-bleed: it breaks out of the centered <main> container and
// spans the entire viewport width, with soft faded edges.
// ---------------------------------------------------------------------------
function MovingGenreBar({
  options,
  active,
  onSelect,
}: {
  options: FilterOption[];
  active: string | null;
  onSelect: (key: string | null) => void;
}) {
  // nothing to show until the genres have loaded (just "ALL" repeated looks broken)
  if (options.length < 2) return null;

  // repeat the list so one copy is always wider than the screen
  const repeat = Math.max(2, Math.ceil(24 / options.length));
  const loop = Array.from({ length: repeat }).flatMap(() => options);
  const duration = Math.max(24, loop.length * 3);

  const fade =
    "linear-gradient(to right, transparent, black 6%, black 94%, transparent)";

  return (
    <nav
      aria-label="Genres"
      className="musings-navwrap overflow-hidden border-y mb-8 sm:mb-10 w-screen ml-[calc(50%-50vw)]"
      style={{
        borderTopColor: "var(--text)",
        borderBottomColor: "var(--border)",
        maskImage: fade,
        WebkitMaskImage: fade,
      }}
    >
      <div
        className="musings-marquee"
        style={{ ["--dur" as string]: `${duration}s` } as React.CSSProperties}
      >
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
            {loop.map((opt, i) => {
              const isActive = opt.key === active;
              return (
                <button
                  key={`${copy}-${i}`}
                  tabIndex={copy === 1 ? -1 : 0}
                  onClick={() => onSelect(opt.key)}
                  className={`musings-navitem font-display text-sm sm:text-base tracking-[0.08em] px-6 py-3 transition-colors duration-300 ${
                    isActive ? "is-on" : ""
                  }`}
                  style={{ color: isActive ? "var(--pink)" : "var(--text-muted)" }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Squeezable filters: two pills — "GENRE : ALL ⌄" and "CONTENT TYPE : ALL ⌄" —
// sharing one drawer. Tapping a pill squeezes the drawer open with that
// filter's options as hairline text; an underline glides to whichever option
// you hover (and rests on your current choice). Picking one squeezes it shut.
// ---------------------------------------------------------------------------
function FilterDrawer({
  genreOptions,
  typeOptions,
  activeGenre,
  activeType,
  onGenre,
  onType,
}: {
  genreOptions: FilterOption[];
  typeOptions: FilterOption[];
  activeGenre: string | null;
  activeType: string | null;
  onGenre: (key: string | null) => void;
  onType: (key: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"genre" | "type">("genre");
  const [tick, setTick] = useState(0); // bumps on every open so options re-rise
  const [hover, setHover] = useState<number | null>(null);
  const optRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [ul, setUl] = useState<{ left: number; top: number; width: number } | null>(null);

  // the type pill only appears once content types have loaded
  const showType = typeOptions.length > 1;
  const showing = kind === "type" && showType ? "type" : "genre";
  const options = showing === "genre" ? genreOptions : typeOptions;
  const active = showing === "genre" ? activeGenre : activeType;
  const activeIdx = Math.max(0, options.findIndex((o) => o.key === active));
  const idx = hover ?? activeIdx;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Slide the underline to the hovered (or current) option. Measured from the
  // real button positions, so it also works when the options wrap onto
  // several lines.
  useLayoutEffect(() => {
    const measure = () => {
      const el = optRefs.current[idx];
      if (!el) return;
      setUl({
        left: el.offsetLeft,
        top: el.offsetTop + el.offsetHeight - 2,
        width: el.offsetWidth,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, [idx, showing, options.length, tick]);

  const toggle = (k: "genre" | "type") => {
    if (open && showing === k) {
      setOpen(false);
    } else {
      setKind(k);
      setOpen(true);
      setTick((t) => t + 1);
      setHover(null);
    }
  };

  const pick = (key: string | null) => {
    if (showing === "genre") onGenre(key);
    else onType(key);
    setOpen(false);
    setHover(null);
  };

  const genreCurrent =
    genreOptions.find((o) => o.key === activeGenre) ?? genreOptions[0];
  const typeCurrent = typeOptions.find((o) => o.key === activeType) ?? typeOptions[0];

  const pill = (
    id: "genre" | "type",
    label: string,
    current: FilterOption | undefined
  ) => {
    if (!current) return null;
    const isOpen = open && showing === id;
    return (
      <button
        onClick={() => toggle(id)}
        aria-expanded={isOpen}
        className="font-display text-sm sm:text-base tracking-wide flex items-center gap-2 px-4 py-1.5 sm:px-5 sm:py-2 rounded-full border-2 transition-all duration-300"
        style={{
          borderColor: isOpen ? current.color : "var(--border)",
          background: isOpen ? "var(--surface)" : "transparent",
        }}
      >
        <span style={{ color: "var(--text-muted)" }}>{label} :</span>
        <span style={{ color: current.color }}>{current.label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-300"
          style={{
            color: "var(--text-muted)",
            transform: isOpen ? "rotate(180deg)" : "none",
          }}
          aria-hidden="true"
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
        {pill("genre", "GENRE", genreCurrent)}
        {showType && pill("type", "CONTENT TYPE", typeCurrent)}
      </div>

      {/* The squeeze: grid-template-rows animates 0fr -> 1fr, so the drawer
          grows to exactly its content height and pushes the cards down. */}
      <div
        className="grid"
        aria-hidden={!open}
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transition:
            "grid-template-rows .5s cubic-bezier(.3,.8,.2,1), opacity .35s ease",
        }}
      >
        <div className="overflow-hidden">
          <div
            className="mt-4 border-t"
            style={{ borderColor: "var(--text)" }}
          />
          <div
            className="relative flex flex-wrap justify-center gap-x-5 sm:gap-x-7 gap-y-0 px-2"
            onMouseLeave={() => setHover(null)}
          >
            {ul && (
              <span
                aria-hidden="true"
                className="absolute pointer-events-none"
                style={{
                  left: ul.left,
                  top: ul.top,
                  width: ul.width,
                  height: 2,
                  background: options[idx]?.color ?? "var(--pink)",
                  transition:
                    "left .5s cubic-bezier(.34,1.3,.64,1), top .5s cubic-bezier(.34,1.3,.64,1), width .5s cubic-bezier(.34,1.3,.64,1), background .3s",
                }}
              />
            )}
            {options.map((opt, i) => {
              const isActive = opt.key === active;
              return (
                <button
                  key={`${showing}-${tick}-${opt.key ?? "all"}`}
                  ref={(el) => {
                    optRefs.current[i] = el;
                  }}
                  tabIndex={open ? 0 : -1}
                  onClick={() => pick(opt.key)}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  className="musings-rise font-display text-sm sm:text-base tracking-[0.08em] px-1 py-3 transition-colors duration-300"
                  style={{
                    animationDelay: `${i * 50}ms`,
                    color: isActive
                      ? opt.color
                      : hover === i
                      ? "var(--text)"
                      : "var(--text-muted)",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div
            className="border-b"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [pieces, setPieces] = useState<ContentPiece[]>([]);
  // full unfiltered feed, used by the kinetic reader at the top
  const [allPieces, setAllPieces] = useState<ContentPiece[]>([]);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  // content type filter (article, film, poem, ...)
  const [contentTypes, setContentTypes] = useState<string[]>([]);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Opening sequence: the kinetic words pop in where the title sits (~5s),
  // then dissolve and the real title animates in.
  const [intro, setIntro] = useState<"play" | "done">("play");
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIntro("done");
      return;
    }
    const id = setTimeout(() => setIntro("done"), 5200);
    return () => clearTimeout(id);
  }, []);

  // --- Subscribe modal state ---
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  useEffect(() => {
    getGenres()
      .then(setGenres)
      .catch(() => setError("Could not load genres. Is the backend awake?"));
  }, []);

  // Build the list of content types once, from the unfiltered feed, so the
  // options don't disappear when one of them is selected.
  useEffect(() => {
    getContentPieces()
      .then((all) => {
        const unique = Array.from(new Set(all.map((p) => p.content_type)));
        setContentTypes(unique);
        setAllPieces(all);
      })
      .catch(() => {
        /* the main fetch below already shows an error if the backend is down */
      });
  }, []);

  // Debounced, race-condition-safe search/filter fetch.
  useEffect(() => {
    setLoading(true);
    let cancelled = false;

    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        searchContentPieces(searchQuery.trim())
          .then((data) => {
            if (cancelled) return;
            setError(null);
            setPieces(data);
            setLoading(false);
          })
          .catch(() => {
            if (cancelled) return;
            setError("Search failed. Is the backend awake?");
            setLoading(false);
          });
        return;
      }
      getContentPieces(activeGenre ?? undefined)
        .then((data) => {
          if (cancelled) return;
          setError(null);
          setPieces(data);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("content fetch failed:", err);
          setError("Could not load content. Is the backend awake?");
          setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [activeGenre, searchQuery]);

  // Apply the content type filter on top of whatever the genre/search fetch
  // returned. Memoised so the scroll-spiral effect below only re-runs when
  // the visible list actually changes.
  const visiblePieces = useMemo(
    () =>
      activeType ? pieces.filter((p) => p.content_type === activeType) : pieces,
    [pieces, activeType]
  );

  // Options shared by the moving bar and the genre pill.
  const genreOptions: FilterOption[] = [
    { key: null, label: "ALL", color: "var(--text)" },
    ...genres.map((genre, i) => ({
      key: genre.slug,
      label: genre.name.toUpperCase(),
      color: genreColor(i),
    })),
  ];
  const typeOptions: FilterOption[] =
    contentTypes.length > 0
      ? [
          { key: null, label: "ALL", color: "var(--green)" },
          ...contentTypes.map((type) => ({
            key: type,
            label: type.toUpperCase(),
            color: "var(--green)",
          })),
        ]
      : [];

  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  // Tracks the ACTUAL number of grid columns currently rendered
  // (1 on mobile, 2 on sm, 3 on lg) so the scroll-spiral animation's
  // row/column math stays correct at every screen size, not just desktop.
  const [columns, setColumns] = useState(3);
  useEffect(() => {
    const updateColumns = () => {
      if (window.innerWidth < 640) setColumns(1);
      else if (window.innerWidth < 1024) setColumns(2);
      else setColumns(3);
    };
    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  // Continuous scroll-linked spiral: as a card's top edge approaches the
  // top of the viewport, it shrinks, rotates, and fades — like being pulled
  // into a vortex. Direction alternates per row: even rows spin clockwise
  // and drift from the left, odd rows spin counter-clockwise and drift
  // from the right. Since this runs every frame off the card's *current*
  // position, scrolling back up naturally reverses it — no extra logic needed.
  useEffect(() => {
    let rafId: number;
    const triggerStart = 200; // px from top where the effect begins
    const triggerRange = 260; // px over which it completes

    // Drop stale refs left over from a longer, previous list.
    cardRefs.current.length = visiblePieces.length;

    const tick = () => {
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const raw = (triggerStart - rect.top) / triggerRange;
        const linear = Math.min(Math.max(raw, 0), 1);
        // Ease-in cubic: gentle at first, so the mid-transition doesn't
        // look like an abrupt flip — the card eases into the spiral instead.
        const progress = linear * linear * linear;

        const row = Math.floor(i / columns);
        const col = i % columns;
        const rowIsOdd = row % 2 === 1;

        // Middle column: shrink only, no rotation, same on every row.
        // Left/right columns: spin opposite directions, and that pairing
        // flips depending on whether the row is odd or even.
        // On a single-column layout every card behaves like the middle
        // column (no rotation) so mobile scrolling never looks skewed.
        let direction = 0;
        if (columns > 1) {
          if (col === 0) direction = rowIsOdd ? -1 : 1; // left column
          if (col === columns - 1) direction = rowIsOdd ? 1 : -1; // right column
        }

        const scale = 1 - progress * 0.45;
        const rotate = progress * 70 * direction; // capped well under 90°, never flips upside-down
        const translateX = progress * 30 * direction;
        const opacity = 1 - progress * 0.95;

        el.style.transform = `translateX(${translateX}px) scale(${scale}) rotate(${rotate}deg)`;
        el.style.opacity = `${opacity}`;
        el.style.transformOrigin = "center top";
        el.style.pointerEvents = progress > 0.7 ? "none" : "auto";
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [visiblePieces, columns]);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || subscribeStatus === "loading") return;

    setSubscribeStatus("loading");
    setSubscribeError(null);
    try {
      await subscribeToNewsletter(trimmed);
      setSubscribeStatus("success");
      setEmail("");
      // auto-close after a moment so the person sees the confirmation
      setTimeout(() => {
        setShowSubscribe(false);
        setSubscribeStatus("idle");
      }, 1800);
    } catch (err) {
      setSubscribeStatus("error");
      setSubscribeError("Something went wrong. Try again in a moment.");
    }
  };

  // close modal on Escape key
  useEffect(() => {
    if (!showSubscribe) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowSubscribe(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSubscribe]);

  // --- Animated typewriter placeholder for the search bar ---
  // Types a phrase out, pauses, erases it, pauses briefly, then types
  // the next phrase — looping forever through the list below.
  const searchPhrases = [
    "Hey, search articles, poems, and more…",
    "Try “street style”…",
    "Try “spirituality”…",
    "Try “sports & fitness”…",
    "Try “music”…",
  ];
  const [animatedPlaceholder, setAnimatedPlaceholder] = useState("");
  const phraseIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      const current = searchPhrases[phraseIndexRef.current];

      if (!isDeletingRef.current) {
        charIndexRef.current += 1;
        setAnimatedPlaceholder(current.slice(0, charIndexRef.current));

        if (charIndexRef.current === current.length) {
          isDeletingRef.current = true;
          timeoutId = setTimeout(tick, 1400); // pause while fully typed
          return;
        }
        timeoutId = setTimeout(tick, 65); // typing speed
      } else {
        charIndexRef.current -= 1;
        setAnimatedPlaceholder(current.slice(0, charIndexRef.current));

        if (charIndexRef.current === 0) {
          isDeletingRef.current = false;
          phraseIndexRef.current = (phraseIndexRef.current + 1) % searchPhrases.length;
          timeoutId = setTimeout(tick, 400); // pause while empty
          return;
        }
        timeoutId = setTimeout(tick, 35); // deleting speed
      }
    };

    timeoutId = setTimeout(tick, 500);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 sm:pt-[4.5rem] pb-16">
      {/* Animations for the moving genre bar and the filter drawer. Kept
          inline so this file is self-contained; move to globals.css if you
          prefer. Everything stops for people who prefer reduced motion. */}
      <style>{`
        @keyframes musings-marquee {
          to { transform: translateX(-50%); }
        }
        .musings-marquee {
          display: inline-flex;
          white-space: nowrap;
          animation: musings-marquee var(--dur, 40s) linear infinite;
        }
        .musings-navwrap:hover .musings-marquee {
          animation-play-state: paused;
        }
        .musings-navitem { position: relative; }
        .musings-navitem::after {
          content: "";
          position: absolute;
          left: 1.5rem;
          right: 1.5rem;
          bottom: 0;
          height: 2px;
          background: var(--pink);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.45s cubic-bezier(0.3, 0.8, 0.2, 1);
        }
        .musings-navitem.is-on::after { transform: scaleX(1); }
        .musings-navitem:hover { color: var(--text) !important; }

        .musings-reel {
          display: inline-flex;
          white-space: nowrap;
          animation: musings-marquee var(--dur, 100s) linear infinite;
        }
        .musings-reel.rev { animation-direction: reverse; }

        @keyframes mw-pop {
          from { opacity: 0; transform: scale(0) rotate(-14deg); }
          60% { opacity: 1; transform: scale(1.3) rotate(6deg); }
          to { opacity: 1; transform: scale(1) rotate(var(--rot, 0deg)); }
        }
        @keyframes mw-spin {
          from { opacity: 0; transform: rotate(-420deg) scale(0); }
          to { opacity: 1; transform: rotate(var(--rot, 0deg)) scale(1); }
        }
        @keyframes mw-slide {
          from { opacity: 0; transform: translateX(-90px) skewX(-32deg); filter: blur(8px); }
          to { opacity: 1; transform: translateX(0) skewX(0) rotate(var(--rot, 0deg)); filter: blur(0); }
        }
        @keyframes mw-drop {
          from { opacity: 0; transform: translateY(-90px) rotate(-18deg) scaleY(1.4); }
          to { opacity: 1; transform: translateY(0) rotate(var(--rot, 0deg)) scaleY(1); }
        }
        @keyframes mw-rise {
          from { opacity: 0; transform: translateY(30px) scale(1.8) rotate(0deg); }
          to { opacity: 1; transform: translateY(0) scale(1) rotate(var(--rot, 0deg)); }
        }
        @keyframes mw-flip {
          from { opacity: 0; transform: perspective(500px) rotateX(-100deg) translateY(30px); filter: blur(8px); }
          to { opacity: 1; transform: perspective(500px) rotateX(0) translateY(0); filter: blur(0); }
        }
        @keyframes mw-type {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes mw-float {
          from { translate: 0 0; }
          to { translate: 0 -6px; }
        }
        @keyframes musings-introout {
          to { opacity: 0; transform: scale(1.08); filter: blur(8px); }
        }
        .musings-stage { --s: 0.6; }
        @media (min-width: 640px) { .musings-stage { --s: 1; } }

        @keyframes mw-swing {
          0%   { opacity: 0; transform: translateY(-120px) rotate(calc(var(--rot, 0deg) + 55deg)); }
          25%  { opacity: 1; }
          45%  { transform: translateY(0) rotate(calc(var(--rot, 0deg) - 22deg)); }
          65%  { transform: translateY(0) rotate(calc(var(--rot, 0deg) + 11deg)); }
          82%  { transform: translateY(0) rotate(calc(var(--rot, 0deg) - 4deg)); }
          100% { opacity: 1; transform: translateY(0) rotate(var(--rot, 0deg)); }
        }
        @keyframes mw-sway {
          from { rotate: -1.6deg; translate: 0 0; }
          to   { rotate: 1.6deg; translate: 0 -5px; }
        }

        @keyframes musings-rise {
          from { opacity: 0; transform: translateY(8px); }
        }
        .musings-rise {
          animation: musings-rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .musings-marquee { animation: none; }
          .musings-reel { animation: none; }
          .musings-hero { animation: none !important; opacity: 1 !important; }
          .musings-navwrap { overflow-x: auto; }
          .musings-rise { animation: none; }
        }
      `}</style>

      {/* Top-right nav: About + Contact + Subscribe — fixed so it always sits above the photo cluster and everything else.
          Sized down on mobile so three buttons never overflow a narrow viewport. */}
      <div className="fixed top-3 right-3 sm:top-5 sm:right-6 z-50 flex items-center gap-1.5 sm:gap-4">
        <Link
          href="/about"
          className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white whitespace-nowrap"
        >
          ABOUT
        </Link>

        <button
          onClick={() => setShowSubscribe(true)}
          className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-black bg-black text-white shadow-md transition hover:bg-white hover:text-black whitespace-nowrap"
        >
          SUBSCRIBE
        </button>

        <Link
          href="/contact"
          className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white whitespace-nowrap"
        >
          CONTACT
        </Link>
      </div>

      {/* Kinetic reader: magnifying glass drifting over lines from the pieces */}
      <KineticReader pieces={allPieces} />

      <header className="relative mb-6 px-2 sm:px-6 py-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
          <div className="relative max-w-full min-h-[150px] sm:min-h-[230px] flex flex-col justify-center">
            {intro === "play" && <KineticIntro />}
            <div
              key={intro}
              style={{ visibility: intro === "done" ? "visible" : "hidden" }}
            >
              <IntroTitle />
            </div>
            <p
              className="font-display text-lg sm:text-2xl md:text-3xl tracking-[0.2em] sm:tracking-[0.25em] text-center mt-3"
              style={{
                color: "var(--text-muted)",
                opacity: intro === "done" ? 1 : 0,
                transition: "opacity 1s ease 0.6s",
              }}
            >
              AN INDEPENDENT MAGAZINE
            </p>
          </div>

          {/* Scattered scrapbook-style photo cluster — sized in relative
              units so it scales down cleanly instead of overflowing on
              narrow screens. */}
          <div className="relative w-[220px] h-[190px] sm:w-[260px] sm:h-[225px] md:w-[300px] md:h-[260px] shrink-0">
            <img
              src="/hero-portrait.png"
              alt="Hand-drawn portrait illustration"
              className="musings-hero absolute shadow-lg"
              style={{
                ...heroSwing(true, -8, 0.1, 0),
                width: "43%",
                border: "2px solid var(--border)",
                borderRadius: "50% 48% 52% 49% / 52% 50% 50% 48%",
                transform: "rotate(-8deg)",
                left: "0%",
                top: "4%",
                zIndex: 1,
              }}
            />
            <img
              src="/hero-shadow.png"
              alt="Shadow silhouette photograph"
              className="musings-hero absolute rounded-xl shadow-lg"
              style={{
                ...heroSwing(true, 6, 0.7, 1),
                width: "40%",
                border: "4px solid white",
                boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
                transform: "rotate(6deg)",
                left: "50%",
                top: "0%",
                zIndex: 2,
              }}
            />
            <img
              src="/hero-mirror.png"
              alt="Mirror self-portrait photograph"
              className="musings-hero absolute rounded-xl shadow-lg"
              style={{
                ...heroSwing(true, -4, 1.2, 2),
                width: "37%",
                border: "4px solid white",
                boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
                transform: "rotate(-4deg)",
                left: "33%",
                top: "54%",
                zIndex: 3,
              }}
            />
          </div>
        </div>
      </header>

      {/* Moving genre bar (full-bleed, edge to edge) */}
      <MovingGenreBar
        options={genreOptions}
        active={activeGenre}
        onSelect={setActiveGenre}
      />

      <div className="w-full max-w-xl mx-auto mb-8 sm:mb-10 relative px-2 sm:px-0">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full font-body text-base sm:text-lg px-4 sm:px-5 py-2.5 sm:py-3 rounded-full border-2 outline-none focus:border-current transition relative bg-transparent"
          style={{
            borderColor: "var(--pink)",
            color: "var(--text)",
            background: "var(--surface)",
          }}
        />
        {searchQuery.length === 0 && (
          <span
            className="font-body text-sm sm:text-lg absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 pointer-events-none select-none truncate max-w-[85%]"
            style={{ color: "var(--text-muted)" }}
          >
            {animatedPlaceholder}
            <span className="animate-pulse">|</span>
          </span>
        )}
      </div>

      {error && <p className="text-red-500 mb-6 text-center px-4">{error}</p>}

      {/* Squeezable filters: GENRE and CONTENT TYPE */}
      {genreOptions.length > 1 && (
        <div className="max-w-3xl mx-auto mb-10 sm:mb-12 px-2">
          <FilterDrawer
            genreOptions={genreOptions}
            typeOptions={typeOptions}
            activeGenre={activeGenre}
            activeType={activeType}
            onGenre={setActiveGenre}
            onType={setActiveType}
          />
        </div>
      )}

      {loading ? (
        <p
          className="font-accent text-xl sm:text-2xl text-center"
          style={{ color: "var(--text-muted)" }}
        >
          loading…
        </p>
      ) : visiblePieces.length === 0 ? (
        <p
          className="font-accent text-xl sm:text-2xl text-center px-4"
          style={{ color: "var(--text-muted)" }}
        >
          nothing published here yet.
        </p>
      ) : (
        <div className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePieces.map((piece, i) => {
            const cardColor = genreColor(i);
            // Strip HTML markup from the excerpt so the hover preview
            // shows plain text instead of raw tags.
            const preview = stripHtml(piece.excerpt?.trim() ?? "");
            return (
              <a
                key={piece.id}
                ref={(el) => {
                  cardRefs.current[i] = el;
                }}
                href={`/piece/${piece.slug}`}
                className="group relative block rounded-3xl border-2 hover:shadow-lg"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                  willChange: "transform, opacity",
                  overflow: "visible",
                }}
              >
                <div className="rounded-3xl overflow-hidden">
                  {piece.cover_image && (
                    <img
                      src={piece.cover_image}
                      alt={piece.title}
                      className="w-full h-40 sm:h-48 object-cover"
                    />
                  )}
                  <div className="p-4 sm:p-6">
                    <span
                      className="font-display text-xs sm:text-sm tracking-wide px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full inline-block mb-3"
                      style={{ color: "white", background: cardColor }}
                    >
                      {piece.genre.name.toUpperCase()} · {piece.content_type.toUpperCase()}
                    </span>
                    <h2 className="font-display text-2xl sm:text-3xl leading-snug break-words">
                      {piece.title}
                    </h2>
                    {piece.subtitle && (
                      <p className="text-base sm:text-lg mt-1" style={{ color: "var(--text-muted)" }}>
                        {piece.subtitle}
                      </p>
                    )}
                  </div>
                </div>

                {/* Hover preview: desktop only (hover doesn't really exist
                    on touch), and clamped so it can't run off-screen on
                    narrower viewports. */}
                {preview.length > 0 && (
                  <div
                    className="hidden md:block absolute left-1/2 w-72 max-w-[90vw] z-20 opacity-0 scale-95 pointer-events-none
                               group-hover:opacity-100 group-hover:scale-100
                               transition-all duration-200 ease-out"
                    style={{
                      top: 0,
                      transform: "translate(-50%, calc(-100% - 20px))",
                    }}
                  >
                    <div
                      className="relative rounded-2xl px-5 py-4 shadow-xl border-2 font-body text-sm leading-relaxed"
                      style={{
                        background: "var(--surface)",
                        borderColor: cardColor,
                        color: "var(--text)",
                      }}
                    >
                      {preview}
                      <div
                        className="absolute left-1/2 w-4 h-4 border-b-2 border-r-2"
                        style={{
                          bottom: -9,
                          transform: "translateX(-50%) rotate(45deg)",
                          background: "var(--surface)",
                          borderColor: cardColor,
                        }}
                      />
                    </div>
                  </div>
                )}
              </a>
            );
          })}
        </div>
      )}

      {/* Subscribe modal */}
      {showSubscribe && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 sm:px-6"
          onClick={() => setShowSubscribe(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border-2 border-black bg-white p-6 sm:p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowSubscribe(false)}
              className="absolute top-4 right-4 font-display text-sm text-black"
              aria-label="Close"
            >
              ✕
            </button>

            <h3 className="font-accent text-2xl sm:text-3xl mb-2 text-black">Subscribe</h3>
            <p className="font-body text-sm text-black/70 mb-6">
              New pieces, straight to your inbox. No spam, unsubscribe anytime.
            </p>

            {subscribeStatus === "success" ? (
              <p className="font-body text-black">You&apos;re in — thanks for subscribing!</p>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full font-body px-4 py-3 rounded-full border-2 border-black outline-none text-black"
                  disabled={subscribeStatus === "loading"}
                />
                {subscribeError && (
                  <p className="text-red-500 text-sm">{subscribeError}</p>
                )}
                <button
                  type="submit"
                  disabled={subscribeStatus === "loading"}
                  className="font-display text-sm tracking-wide px-4 py-3 rounded-full border-2 border-black bg-black text-white transition hover:bg-white hover:text-black disabled:opacity-50"
                >
                  {subscribeStatus === "loading" ? "SUBSCRIBING…" : "SUBSCRIBE"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}








// "use client";

// import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
// import Link from "next/link";
// import {
//   getGenres,
//   getContentPieces,
//   searchContentPieces,
//   subscribeToNewsletter,
//   Genre,
//   ContentPiece,
// } from "@/lib/api";
// import { genreColor } from "@/lib/genreColor";
// import IntroTitle from "@/components/IntroTitle";

// // Strips HTML tags from rich-text excerpt content so the hover preview
// // shows clean plain text instead of raw markup.
// function stripHtml(html: string) {
//   return html
//     .replace(/<[^>]*>/g, " ")
//     .replace(/\s+/g, " ")
//     .trim();
// }

// type FilterOption = { key: string | null; label: string; color: string };

// // ---------------------------------------------------------------------------
// // Moving genre bar (replaces GenreTicker): a thin editorial strip between two
// // hairlines. It scrolls continuously, pauses on hover, and a pink underline
// // draws itself under the selected genre. Clicking filters the cards.
// // The bar is full-bleed: it breaks out of the centered <main> container and
// // spans the entire viewport width, with soft faded edges.
// // ---------------------------------------------------------------------------
// function MovingGenreBar({
//   options,
//   active,
//   onSelect,
// }: {
//   options: FilterOption[];
//   active: string | null;
//   onSelect: (key: string | null) => void;
// }) {
//   // nothing to show until the genres have loaded (just "ALL" repeated looks broken)
//   if (options.length < 2) return null;

//   // repeat the list so one copy is always wider than the screen
//   const repeat = Math.max(2, Math.ceil(24 / options.length));
//   const loop = Array.from({ length: repeat }).flatMap(() => options);
//   const duration = Math.max(24, loop.length * 3);

//   const fade =
//     "linear-gradient(to right, transparent, black 6%, black 94%, transparent)";

//   return (
//     <nav
//       aria-label="Genres"
//       className="musings-navwrap overflow-hidden border-y mb-8 sm:mb-10 w-screen ml-[calc(50%-50vw)]"
//       style={{
//         borderTopColor: "var(--text)",
//         borderBottomColor: "var(--border)",
//         maskImage: fade,
//         WebkitMaskImage: fade,
//       }}
//     >
//       <div
//         className="musings-marquee"
//         style={{ ["--dur" as string]: `${duration}s` } as React.CSSProperties}
//       >
//         {[0, 1].map((copy) => (
//           <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
//             {loop.map((opt, i) => {
//               const isActive = opt.key === active;
//               return (
//                 <button
//                   key={`${copy}-${i}`}
//                   tabIndex={copy === 1 ? -1 : 0}
//                   onClick={() => onSelect(opt.key)}
//                   className={`musings-navitem font-display text-sm sm:text-base tracking-[0.08em] px-6 py-3 transition-colors duration-300 ${
//                     isActive ? "is-on" : ""
//                   }`}
//                   style={{ color: isActive ? "var(--pink)" : "var(--text-muted)" }}
//                 >
//                   {opt.label}
//                 </button>
//               );
//             })}
//           </div>
//         ))}
//       </div>
//     </nav>
//   );
// }

// // ---------------------------------------------------------------------------
// // Squeezable filters: two pills — "GENRE : ALL ⌄" and "CONTENT TYPE : ALL ⌄" —
// // sharing one drawer. Tapping a pill squeezes the drawer open with that
// // filter's options as hairline text; an underline glides to whichever option
// // you hover (and rests on your current choice). Picking one squeezes it shut.
// // ---------------------------------------------------------------------------
// function FilterDrawer({
//   genreOptions,
//   typeOptions,
//   activeGenre,
//   activeType,
//   onGenre,
//   onType,
// }: {
//   genreOptions: FilterOption[];
//   typeOptions: FilterOption[];
//   activeGenre: string | null;
//   activeType: string | null;
//   onGenre: (key: string | null) => void;
//   onType: (key: string | null) => void;
// }) {
//   const [open, setOpen] = useState(false);
//   const [kind, setKind] = useState<"genre" | "type">("genre");
//   const [tick, setTick] = useState(0); // bumps on every open so options re-rise
//   const [hover, setHover] = useState<number | null>(null);
//   const optRefs = useRef<(HTMLButtonElement | null)[]>([]);
//   const [ul, setUl] = useState<{ left: number; top: number; width: number } | null>(null);

//   // the type pill only appears once content types have loaded
//   const showType = typeOptions.length > 1;
//   const showing = kind === "type" && showType ? "type" : "genre";
//   const options = showing === "genre" ? genreOptions : typeOptions;
//   const active = showing === "genre" ? activeGenre : activeType;
//   const activeIdx = Math.max(0, options.findIndex((o) => o.key === active));
//   const idx = hover ?? activeIdx;

//   useEffect(() => {
//     if (!open) return;
//     const onKey = (e: KeyboardEvent) => {
//       if (e.key === "Escape") setOpen(false);
//     };
//     window.addEventListener("keydown", onKey);
//     return () => window.removeEventListener("keydown", onKey);
//   }, [open]);

//   // Slide the underline to the hovered (or current) option. Measured from the
//   // real button positions, so it also works when the options wrap onto
//   // several lines.
//   useLayoutEffect(() => {
//     const measure = () => {
//       const el = optRefs.current[idx];
//       if (!el) return;
//       setUl({
//         left: el.offsetLeft,
//         top: el.offsetTop + el.offsetHeight - 2,
//         width: el.offsetWidth,
//       });
//     };
//     measure();
//     window.addEventListener("resize", measure);
//     document.fonts?.ready.then(measure);
//     return () => window.removeEventListener("resize", measure);
//   }, [idx, showing, options.length, tick]);

//   const toggle = (k: "genre" | "type") => {
//     if (open && showing === k) {
//       setOpen(false);
//     } else {
//       setKind(k);
//       setOpen(true);
//       setTick((t) => t + 1);
//       setHover(null);
//     }
//   };

//   const pick = (key: string | null) => {
//     if (showing === "genre") onGenre(key);
//     else onType(key);
//     setOpen(false);
//     setHover(null);
//   };

//   const genreCurrent =
//     genreOptions.find((o) => o.key === activeGenre) ?? genreOptions[0];
//   const typeCurrent = typeOptions.find((o) => o.key === activeType) ?? typeOptions[0];

//   const pill = (
//     id: "genre" | "type",
//     label: string,
//     current: FilterOption | undefined
//   ) => {
//     if (!current) return null;
//     const isOpen = open && showing === id;
//     return (
//       <button
//         onClick={() => toggle(id)}
//         aria-expanded={isOpen}
//         className="font-display text-sm sm:text-base tracking-wide flex items-center gap-2 px-4 py-1.5 sm:px-5 sm:py-2 rounded-full border-2 transition-all duration-300"
//         style={{
//           borderColor: isOpen ? current.color : "var(--border)",
//           background: isOpen ? "var(--surface)" : "transparent",
//         }}
//       >
//         <span style={{ color: "var(--text-muted)" }}>{label} :</span>
//         <span style={{ color: current.color }}>{current.label}</span>
//         <svg
//           width="12"
//           height="12"
//           viewBox="0 0 12 12"
//           fill="none"
//           stroke="currentColor"
//           strokeWidth="2"
//           strokeLinecap="round"
//           strokeLinejoin="round"
//           className="transition-transform duration-300"
//           style={{
//             color: "var(--text-muted)",
//             transform: isOpen ? "rotate(180deg)" : "none",
//           }}
//           aria-hidden="true"
//         >
//           <path d="M2 4l4 4 4-4" />
//         </svg>
//       </button>
//     );
//   };

//   return (
//     <div>
//       <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
//         {pill("genre", "GENRE", genreCurrent)}
//         {showType && pill("type", "CONTENT TYPE", typeCurrent)}
//       </div>

//       {/* The squeeze: grid-template-rows animates 0fr -> 1fr, so the drawer
//           grows to exactly its content height and pushes the cards down. */}
//       <div
//         className="grid"
//         aria-hidden={!open}
//         style={{
//           gridTemplateRows: open ? "1fr" : "0fr",
//           opacity: open ? 1 : 0,
//           transition:
//             "grid-template-rows .5s cubic-bezier(.3,.8,.2,1), opacity .35s ease",
//         }}
//       >
//         <div className="overflow-hidden">
//           <div
//             className="mt-4 border-t"
//             style={{ borderColor: "var(--text)" }}
//           />
//           <div
//             className="relative flex flex-wrap justify-center gap-x-5 sm:gap-x-7 gap-y-0 px-2"
//             onMouseLeave={() => setHover(null)}
//           >
//             {ul && (
//               <span
//                 aria-hidden="true"
//                 className="absolute pointer-events-none"
//                 style={{
//                   left: ul.left,
//                   top: ul.top,
//                   width: ul.width,
//                   height: 2,
//                   background: options[idx]?.color ?? "var(--pink)",
//                   transition:
//                     "left .5s cubic-bezier(.34,1.3,.64,1), top .5s cubic-bezier(.34,1.3,.64,1), width .5s cubic-bezier(.34,1.3,.64,1), background .3s",
//                 }}
//               />
//             )}
//             {options.map((opt, i) => {
//               const isActive = opt.key === active;
//               return (
//                 <button
//                   key={`${showing}-${tick}-${opt.key ?? "all"}`}
//                   ref={(el) => {
//                     optRefs.current[i] = el;
//                   }}
//                   tabIndex={open ? 0 : -1}
//                   onClick={() => pick(opt.key)}
//                   onMouseEnter={() => setHover(i)}
//                   onFocus={() => setHover(i)}
//                   className="musings-rise font-display text-sm sm:text-base tracking-[0.08em] px-1 py-3 transition-colors duration-300"
//                   style={{
//                     animationDelay: `${i * 50}ms`,
//                     color: isActive
//                       ? opt.color
//                       : hover === i
//                       ? "var(--text)"
//                       : "var(--text-muted)",
//                   }}
//                 >
//                   {opt.label}
//                 </button>
//               );
//             })}
//           </div>
//           <div
//             className="border-b"
//             style={{ borderColor: "var(--border)" }}
//           />
//         </div>
//       </div>
//     </div>
//   );
// }

// export default function HomePage() {
//   const [genres, setGenres] = useState<Genre[]>([]);
//   const [pieces, setPieces] = useState<ContentPiece[]>([]);
//   const [activeGenre, setActiveGenre] = useState<string | null>(null);
//   // content type filter (article, film, poem, ...)
//   const [contentTypes, setContentTypes] = useState<string[]>([]);
//   const [activeType, setActiveType] = useState<string | null>(null);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   // --- Subscribe modal state ---
//   const [showSubscribe, setShowSubscribe] = useState(false);
//   const [email, setEmail] = useState("");
//   const [subscribeStatus, setSubscribeStatus] = useState<
//     "idle" | "loading" | "success" | "error"
//   >("idle");
//   const [subscribeError, setSubscribeError] = useState<string | null>(null);

//   useEffect(() => {
//     getGenres()
//       .then(setGenres)
//       .catch(() => setError("Could not load genres. Is the backend awake?"));
//   }, []);

//   // Build the list of content types once, from the unfiltered feed, so the
//   // options don't disappear when one of them is selected.
//   useEffect(() => {
//     getContentPieces()
//       .then((all) => {
//         const unique = Array.from(new Set(all.map((p) => p.content_type)));
//         setContentTypes(unique);
//       })
//       .catch(() => {
//         /* the main fetch below already shows an error if the backend is down */
//       });
//   }, []);

//   // Debounced, race-condition-safe search/filter fetch.
//   useEffect(() => {
//     setLoading(true);
//     let cancelled = false;

//     const timeoutId = setTimeout(() => {
//       if (searchQuery.trim()) {
//         searchContentPieces(searchQuery.trim())
//           .then((data) => {
//             if (cancelled) return;
//             setError(null);
//             setPieces(data);
//             setLoading(false);
//           })
//           .catch(() => {
//             if (cancelled) return;
//             setError("Search failed. Is the backend awake?");
//             setLoading(false);
//           });
//         return;
//       }
//       getContentPieces(activeGenre ?? undefined)
//         .then((data) => {
//           if (cancelled) return;
//           setError(null);
//           setPieces(data);
//           setLoading(false);
//         })
//         .catch((err) => {
//           if (cancelled) return;
//           console.error("content fetch failed:", err);
//           setError("Could not load content. Is the backend awake?");
//           setLoading(false);
//         });
//     }, 300);

//     return () => {
//       cancelled = true;
//       clearTimeout(timeoutId);
//     };
//   }, [activeGenre, searchQuery]);

//   // Apply the content type filter on top of whatever the genre/search fetch
//   // returned. Memoised so the scroll-spiral effect below only re-runs when
//   // the visible list actually changes.
//   const visiblePieces = useMemo(
//     () =>
//       activeType ? pieces.filter((p) => p.content_type === activeType) : pieces,
//     [pieces, activeType]
//   );

//   // Options shared by the moving bar and the genre pill.
//   const genreOptions: FilterOption[] = [
//     { key: null, label: "ALL", color: "var(--text)" },
//     ...genres.map((genre, i) => ({
//       key: genre.slug,
//       label: genre.name.toUpperCase(),
//       color: genreColor(i),
//     })),
//   ];
//   const typeOptions: FilterOption[] =
//     contentTypes.length > 0
//       ? [
//           { key: null, label: "ALL", color: "var(--green)" },
//           ...contentTypes.map((type) => ({
//             key: type,
//             label: type.toUpperCase(),
//             color: "var(--green)",
//           })),
//         ]
//       : [];

//   const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);

//   // Tracks the ACTUAL number of grid columns currently rendered
//   // (1 on mobile, 2 on sm, 3 on lg) so the scroll-spiral animation's
//   // row/column math stays correct at every screen size, not just desktop.
//   const [columns, setColumns] = useState(3);
//   useEffect(() => {
//     const updateColumns = () => {
//       if (window.innerWidth < 640) setColumns(1);
//       else if (window.innerWidth < 1024) setColumns(2);
//       else setColumns(3);
//     };
//     updateColumns();
//     window.addEventListener("resize", updateColumns);
//     return () => window.removeEventListener("resize", updateColumns);
//   }, []);

//   // Continuous scroll-linked spiral: as a card's top edge approaches the
//   // top of the viewport, it shrinks, rotates, and fades — like being pulled
//   // into a vortex. Direction alternates per row: even rows spin clockwise
//   // and drift from the left, odd rows spin counter-clockwise and drift
//   // from the right. Since this runs every frame off the card's *current*
//   // position, scrolling back up naturally reverses it — no extra logic needed.
//   useEffect(() => {
//     let rafId: number;
//     const triggerStart = 200; // px from top where the effect begins
//     const triggerRange = 260; // px over which it completes

//     // Drop stale refs left over from a longer, previous list.
//     cardRefs.current.length = visiblePieces.length;

//     const tick = () => {
//       cardRefs.current.forEach((el, i) => {
//         if (!el) return;
//         const rect = el.getBoundingClientRect();
//         const raw = (triggerStart - rect.top) / triggerRange;
//         const linear = Math.min(Math.max(raw, 0), 1);
//         // Ease-in cubic: gentle at first, so the mid-transition doesn't
//         // look like an abrupt flip — the card eases into the spiral instead.
//         const progress = linear * linear * linear;

//         const row = Math.floor(i / columns);
//         const col = i % columns;
//         const rowIsOdd = row % 2 === 1;

//         // Middle column: shrink only, no rotation, same on every row.
//         // Left/right columns: spin opposite directions, and that pairing
//         // flips depending on whether the row is odd or even.
//         // On a single-column layout every card behaves like the middle
//         // column (no rotation) so mobile scrolling never looks skewed.
//         let direction = 0;
//         if (columns > 1) {
//           if (col === 0) direction = rowIsOdd ? -1 : 1; // left column
//           if (col === columns - 1) direction = rowIsOdd ? 1 : -1; // right column
//         }

//         const scale = 1 - progress * 0.45;
//         const rotate = progress * 70 * direction; // capped well under 90°, never flips upside-down
//         const translateX = progress * 30 * direction;
//         const opacity = 1 - progress * 0.95;

//         el.style.transform = `translateX(${translateX}px) scale(${scale}) rotate(${rotate}deg)`;
//         el.style.opacity = `${opacity}`;
//         el.style.transformOrigin = "center top";
//         el.style.pointerEvents = progress > 0.7 ? "none" : "auto";
//       });
//       rafId = requestAnimationFrame(tick);
//     };

//     rafId = requestAnimationFrame(tick);
//     return () => cancelAnimationFrame(rafId);
//   }, [visiblePieces, columns]);

//   const handleSubscribe = async (e: React.FormEvent) => {
//     e.preventDefault();
//     const trimmed = email.trim();
//     if (!trimmed || subscribeStatus === "loading") return;

//     setSubscribeStatus("loading");
//     setSubscribeError(null);
//     try {
//       await subscribeToNewsletter(trimmed);
//       setSubscribeStatus("success");
//       setEmail("");
//       // auto-close after a moment so the person sees the confirmation
//       setTimeout(() => {
//         setShowSubscribe(false);
//         setSubscribeStatus("idle");
//       }, 1800);
//     } catch (err) {
//       setSubscribeStatus("error");
//       setSubscribeError("Something went wrong. Try again in a moment.");
//     }
//   };

//   // close modal on Escape key
//   useEffect(() => {
//     if (!showSubscribe) return;
//     const onKey = (e: KeyboardEvent) => {
//       if (e.key === "Escape") setShowSubscribe(false);
//     };
//     window.addEventListener("keydown", onKey);
//     return () => window.removeEventListener("keydown", onKey);
//   }, [showSubscribe]);

//   // --- Animated typewriter placeholder for the search bar ---
//   // Types a phrase out, pauses, erases it, pauses briefly, then types
//   // the next phrase — looping forever through the list below.
//   const searchPhrases = [
//     "Hey, search articles, poems, and more…",
//     "Try “street style”…",
//     "Try “spirituality”…",
//     "Try “sports & fitness”…",
//     "Try “music”…",
//   ];
//   const [animatedPlaceholder, setAnimatedPlaceholder] = useState("");
//   const phraseIndexRef = useRef(0);
//   const charIndexRef = useRef(0);
//   const isDeletingRef = useRef(false);

//   useEffect(() => {
//     let timeoutId: ReturnType<typeof setTimeout>;

//     const tick = () => {
//       const current = searchPhrases[phraseIndexRef.current];

//       if (!isDeletingRef.current) {
//         charIndexRef.current += 1;
//         setAnimatedPlaceholder(current.slice(0, charIndexRef.current));

//         if (charIndexRef.current === current.length) {
//           isDeletingRef.current = true;
//           timeoutId = setTimeout(tick, 1400); // pause while fully typed
//           return;
//         }
//         timeoutId = setTimeout(tick, 65); // typing speed
//       } else {
//         charIndexRef.current -= 1;
//         setAnimatedPlaceholder(current.slice(0, charIndexRef.current));

//         if (charIndexRef.current === 0) {
//           isDeletingRef.current = false;
//           phraseIndexRef.current = (phraseIndexRef.current + 1) % searchPhrases.length;
//           timeoutId = setTimeout(tick, 400); // pause while empty
//           return;
//         }
//         timeoutId = setTimeout(tick, 35); // deleting speed
//       }
//     };

//     timeoutId = setTimeout(tick, 500);
//     return () => clearTimeout(timeoutId);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   return (
//     <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-32 sm:pt-28 md:pt-24 pb-16">
//       {/* Animations for the moving genre bar and the filter drawer. Kept
//           inline so this file is self-contained; move to globals.css if you
//           prefer. Everything stops for people who prefer reduced motion. */}
//       <style>{`
//         @keyframes musings-marquee {
//           to { transform: translateX(-50%); }
//         }
//         .musings-marquee {
//           display: inline-flex;
//           white-space: nowrap;
//           animation: musings-marquee var(--dur, 40s) linear infinite;
//         }
//         .musings-navwrap:hover .musings-marquee {
//           animation-play-state: paused;
//         }
//         .musings-navitem { position: relative; }
//         .musings-navitem::after {
//           content: "";
//           position: absolute;
//           left: 1.5rem;
//           right: 1.5rem;
//           bottom: 0;
//           height: 2px;
//           background: var(--pink);
//           transform: scaleX(0);
//           transform-origin: left;
//           transition: transform 0.45s cubic-bezier(0.3, 0.8, 0.2, 1);
//         }
//         .musings-navitem.is-on::after { transform: scaleX(1); }
//         .musings-navitem:hover { color: var(--text) !important; }

//         @keyframes musings-rise {
//           from { opacity: 0; transform: translateY(8px); }
//         }
//         .musings-rise {
//           animation: musings-rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
//         }
//         @media (prefers-reduced-motion: reduce) {
//           .musings-marquee { animation: none; }
//           .musings-navwrap { overflow-x: auto; }
//           .musings-rise { animation: none; }
//         }
//       `}</style>

//       {/* Top-right nav: About + Contact + Subscribe — fixed so it always sits above the photo cluster and everything else.
//           Sized down on mobile so three buttons never overflow a narrow viewport. */}
//       <div className="fixed top-3 right-3 sm:top-5 sm:right-6 z-50 flex items-center gap-1.5 sm:gap-4">
//         <Link
//           href="/about"
//           className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white whitespace-nowrap"
//         >
//           ABOUT
//         </Link>

//         <button
//           onClick={() => setShowSubscribe(true)}
//           className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-black bg-black text-white shadow-md transition hover:bg-white hover:text-black whitespace-nowrap"
//         >
//           SUBSCRIBE
//         </button>

//         <Link
//           href="/contact"
//           className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white whitespace-nowrap"
//         >
//           CONTACT
//         </Link>
//       </div>

//       <header className="relative mb-6 px-2 sm:px-6 py-6 overflow-hidden">
//         <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
//           <div className="max-w-full">
//             <IntroTitle />
//             <p
//               className="font-display text-sm sm:text-lg md:text-2xl tracking-[0.2em] sm:tracking-widest text-center mt-2"
//               style={{ color: "var(--text-muted)" }}
//             >
//               AN INDEPENDENT MAGAZINE
//             </p>
//           </div>

//           {/* Scattered scrapbook-style photo cluster — sized in relative
//               units so it scales down cleanly instead of overflowing on
//               narrow screens. */}
//           <div className="relative w-[220px] h-[190px] sm:w-[260px] sm:h-[225px] md:w-[300px] md:h-[260px] shrink-0">
//             <img
//               src="/hero-portrait.png"
//               alt="Hand-drawn portrait illustration"
//               className="absolute shadow-lg"
//               style={{
//                 width: "43%",
//                 border: "2px solid var(--border)",
//                 borderRadius: "50% 48% 52% 49% / 52% 50% 50% 48%",
//                 transform: "rotate(-8deg)",
//                 left: "0%",
//                 top: "4%",
//                 zIndex: 1,
//               }}
//             />
//             <img
//               src="/hero-shadow.png"
//               alt="Shadow silhouette photograph"
//               className="absolute rounded-xl shadow-lg"
//               style={{
//                 width: "40%",
//                 border: "4px solid white",
//                 boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
//                 transform: "rotate(6deg)",
//                 left: "50%",
//                 top: "0%",
//                 zIndex: 2,
//               }}
//             />
//             <img
//               src="/hero-mirror.png"
//               alt="Mirror self-portrait photograph"
//               className="absolute rounded-xl shadow-lg"
//               style={{
//                 width: "37%",
//                 border: "4px solid white",
//                 boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
//                 transform: "rotate(-4deg)",
//                 left: "33%",
//                 top: "54%",
//                 zIndex: 3,
//               }}
//             />
//           </div>
//         </div>
//       </header>

//       {/* Moving genre bar (full-bleed, edge to edge) */}
//       <MovingGenreBar
//         options={genreOptions}
//         active={activeGenre}
//         onSelect={setActiveGenre}
//       />

//       <div className="w-full max-w-xl mx-auto mb-8 sm:mb-10 relative px-2 sm:px-0">
//         <input
//           type="text"
//           value={searchQuery}
//           onChange={(e) => setSearchQuery(e.target.value)}
//           className="w-full font-body text-base sm:text-lg px-4 sm:px-5 py-2.5 sm:py-3 rounded-full border-2 outline-none focus:border-current transition relative bg-transparent"
//           style={{
//             borderColor: "var(--pink)",
//             color: "var(--text)",
//             background: "var(--surface)",
//           }}
//         />
//         {searchQuery.length === 0 && (
//           <span
//             className="font-body text-sm sm:text-lg absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 pointer-events-none select-none truncate max-w-[85%]"
//             style={{ color: "var(--text-muted)" }}
//           >
//             {animatedPlaceholder}
//             <span className="animate-pulse">|</span>
//           </span>
//         )}
//       </div>

//       {error && <p className="text-red-500 mb-6 text-center px-4">{error}</p>}

//       {/* Squeezable filters: GENRE and CONTENT TYPE */}
//       {genreOptions.length > 1 && (
//         <div className="max-w-3xl mx-auto mb-10 sm:mb-12 px-2">
//           <FilterDrawer
//             genreOptions={genreOptions}
//             typeOptions={typeOptions}
//             activeGenre={activeGenre}
//             activeType={activeType}
//             onGenre={setActiveGenre}
//             onType={setActiveType}
//           />
//         </div>
//       )}

//       {loading ? (
//         <p
//           className="font-accent text-xl sm:text-2xl text-center"
//           style={{ color: "var(--text-muted)" }}
//         >
//           loading…
//         </p>
//       ) : visiblePieces.length === 0 ? (
//         <p
//           className="font-accent text-xl sm:text-2xl text-center px-4"
//           style={{ color: "var(--text-muted)" }}
//         >
//           nothing published here yet.
//         </p>
//       ) : (
//         <div className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
//           {visiblePieces.map((piece, i) => {
//             const cardColor = genreColor(i);
//             // Strip HTML markup from the excerpt so the hover preview
//             // shows plain text instead of raw tags.
//             const preview = stripHtml(piece.excerpt?.trim() ?? "");
//             return (
//               <a
//                 key={piece.id}
//                 ref={(el) => {
//                   cardRefs.current[i] = el;
//                 }}
//                 href={`/piece/${piece.slug}`}
//                 className="group relative block rounded-3xl border-2 hover:shadow-lg"
//                 style={{
//                   borderColor: "var(--border)",
//                   background: "var(--surface)",
//                   willChange: "transform, opacity",
//                   overflow: "visible",
//                 }}
//               >
//                 <div className="rounded-3xl overflow-hidden">
//                   {piece.cover_image && (
//                     <img
//                       src={piece.cover_image}
//                       alt={piece.title}
//                       className="w-full h-40 sm:h-48 object-cover"
//                     />
//                   )}
//                   <div className="p-4 sm:p-6">
//                     <span
//                       className="font-display text-xs sm:text-sm tracking-wide px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full inline-block mb-3"
//                       style={{ color: "white", background: cardColor }}
//                     >
//                       {piece.genre.name.toUpperCase()} · {piece.content_type.toUpperCase()}
//                     </span>
//                     <h2 className="font-display text-2xl sm:text-3xl leading-snug break-words">
//                       {piece.title}
//                     </h2>
//                     {piece.subtitle && (
//                       <p className="text-base sm:text-lg mt-1" style={{ color: "var(--text-muted)" }}>
//                         {piece.subtitle}
//                       </p>
//                     )}
//                   </div>
//                 </div>

//                 {/* Hover preview: desktop only (hover doesn't really exist
//                     on touch), and clamped so it can't run off-screen on
//                     narrower viewports. */}
//                 {preview.length > 0 && (
//                   <div
//                     className="hidden md:block absolute left-1/2 w-72 max-w-[90vw] z-20 opacity-0 scale-95 pointer-events-none
//                                group-hover:opacity-100 group-hover:scale-100
//                                transition-all duration-200 ease-out"
//                     style={{
//                       top: 0,
//                       transform: "translate(-50%, calc(-100% - 20px))",
//                     }}
//                   >
//                     <div
//                       className="relative rounded-2xl px-5 py-4 shadow-xl border-2 font-body text-sm leading-relaxed"
//                       style={{
//                         background: "var(--surface)",
//                         borderColor: cardColor,
//                         color: "var(--text)",
//                       }}
//                     >
//                       {preview}
//                       <div
//                         className="absolute left-1/2 w-4 h-4 border-b-2 border-r-2"
//                         style={{
//                           bottom: -9,
//                           transform: "translateX(-50%) rotate(45deg)",
//                           background: "var(--surface)",
//                           borderColor: cardColor,
//                         }}
//                       />
//                     </div>
//                   </div>
//                 )}
//               </a>
//             );
//           })}
//         </div>
//       )}

//       {/* Subscribe modal */}
//       {showSubscribe && (
//         <div
//           className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 sm:px-6"
//           onClick={() => setShowSubscribe(false)}
//         >
//           <div
//             className="w-full max-w-sm rounded-3xl border-2 border-black bg-white p-6 sm:p-8 relative"
//             onClick={(e) => e.stopPropagation()}
//           >
//             <button
//               onClick={() => setShowSubscribe(false)}
//               className="absolute top-4 right-4 font-display text-sm text-black"
//               aria-label="Close"
//             >
//               ✕
//             </button>

//             <h3 className="font-accent text-2xl sm:text-3xl mb-2 text-black">Subscribe</h3>
//             <p className="font-body text-sm text-black/70 mb-6">
//               New pieces, straight to your inbox. No spam, unsubscribe anytime.
//             </p>

//             {subscribeStatus === "success" ? (
//               <p className="font-body text-black">You&apos;re in — thanks for subscribing!</p>
//             ) : (
//               <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
//                 <input
//                   type="email"
//                   required
//                   value={email}
//                   onChange={(e) => setEmail(e.target.value)}
//                   placeholder="you@email.com"
//                   className="w-full font-body px-4 py-3 rounded-full border-2 border-black outline-none text-black"
//                   disabled={subscribeStatus === "loading"}
//                 />
//                 {subscribeError && (
//                   <p className="text-red-500 text-sm">{subscribeError}</p>
//                 )}
//                 <button
//                   type="submit"
//                   disabled={subscribeStatus === "loading"}
//                   className="font-display text-sm tracking-wide px-4 py-3 rounded-full border-2 border-black bg-black text-white transition hover:bg-white hover:text-black disabled:opacity-50"
//                 >
//                   {subscribeStatus === "loading" ? "SUBSCRIBING…" : "SUBSCRIBE"}
//                 </button>
//               </form>
//             )}
//           </div>
//         </div>
//       )}
//     </main>
//   );
// }



// "use client";

// import { useEffect, useRef, useState } from "react";
// import Link from "next/link";
// import {
//   getGenres,
//   getContentPieces,
//   searchContentPieces,
//   subscribeToNewsletter,
//   Genre,
//   ContentPiece,
// } from "@/lib/api";
// import { genreColor } from "@/lib/genreColor";

// // Strips HTML tags from rich-text excerpt content so the hover preview
// // shows clean plain text instead of raw markup.
// function stripHtml(html: string) {
//   return html
//     .replace(/<[^>]*>/g, " ")
//     .replace(/\s+/g, " ")
//     .trim();
// }

// export default function HomePage() {
//   const [genres, setGenres] = useState<Genre[]>([]);
//   const [pieces, setPieces] = useState<ContentPiece[]>([]);
//   const [activeGenre, setActiveGenre] = useState<string | null>(null);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   // --- Subscribe modal state ---
//   const [showSubscribe, setShowSubscribe] = useState(false);
//   const [email, setEmail] = useState("");
//   const [subscribeStatus, setSubscribeStatus] = useState<
//     "idle" | "loading" | "success" | "error"
//   >("idle");
//   const [subscribeError, setSubscribeError] = useState<string | null>(null);

//   useEffect(() => {
//     getGenres()
//       .then(setGenres)
//       .catch(() => setError("Could not load genres. Is the backend awake?"));
//   }, []);

//   // Debounced, race-condition-safe search/filter fetch.
//   useEffect(() => {
//     setLoading(true);
//     let cancelled = false;

//     const timeoutId = setTimeout(() => {
//       if (searchQuery.trim()) {
//         searchContentPieces(searchQuery.trim())
//           .then((data) => {
//             if (cancelled) return;
//             setPieces(data);
//             setLoading(false);
//           })
//           .catch(() => {
//             if (cancelled) return;
//             setError("Search failed. Is the backend awake?");
//             setLoading(false);
//           });
//         return;
//       }
//       getContentPieces(activeGenre ?? undefined)
//         .then((data) => {
//           if (cancelled) return;
//           setPieces(data);
//           setLoading(false);
//         })
//         .catch(() => {
//           if (cancelled) return;
//           setError("Could not load content. Is the backend awake?");
//           setLoading(false);
//         });
//     }, 300);

//     return () => {
//       cancelled = true;
//       clearTimeout(timeoutId);
//     };
//   }, [activeGenre, searchQuery]);

//   const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);

//   // Tracks the ACTUAL number of grid columns currently rendered
//   // (1 on mobile, 2 on sm, 3 on lg) so the scroll-spiral animation's
//   // row/column math stays correct at every screen size, not just desktop.
//   const [columns, setColumns] = useState(3);
//   useEffect(() => {
//     const updateColumns = () => {
//       if (window.innerWidth < 640) setColumns(1);
//       else if (window.innerWidth < 1024) setColumns(2);
//       else setColumns(3);
//     };
//     updateColumns();
//     window.addEventListener("resize", updateColumns);
//     return () => window.removeEventListener("resize", updateColumns);
//   }, []);

//   // Continuous scroll-linked spiral: as a card's top edge approaches the
//   // top of the viewport, it shrinks, rotates, and fades — like being pulled
//   // into a vortex. Direction alternates per row: even rows spin clockwise
//   // and drift from the left, odd rows spin counter-clockwise and drift
//   // from the right. Since this runs every frame off the card's *current*
//   // position, scrolling back up naturally reverses it — no extra logic needed.
//   useEffect(() => {
//     let rafId: number;
//     const triggerStart = 200; // px from top where the effect begins
//     const triggerRange = 260; // px over which it completes

//     const tick = () => {
//       cardRefs.current.forEach((el, i) => {
//         if (!el) return;
//         const rect = el.getBoundingClientRect();
//         const raw = (triggerStart - rect.top) / triggerRange;
//         const linear = Math.min(Math.max(raw, 0), 1);
//         // Ease-in cubic: gentle at first, so the mid-transition doesn't
//         // look like an abrupt flip — the card eases into the spiral instead.
//         const progress = linear * linear * linear;

//         const row = Math.floor(i / columns);
//         const col = i % columns;
//         const rowIsOdd = row % 2 === 1;

//         // Middle column: shrink only, no rotation, same on every row.
//         // Left/right columns: spin opposite directions, and that pairing
//         // flips depending on whether the row is odd or even.
//         // On a single-column layout every card behaves like the middle
//         // column (no rotation) so mobile scrolling never looks skewed.
//         let direction = 0;
//         if (columns > 1) {
//           if (col === 0) direction = rowIsOdd ? -1 : 1; // left column
//           if (col === columns - 1) direction = rowIsOdd ? 1 : -1; // right column
//         }

//         const scale = 1 - progress * 0.45;
//         const rotate = progress * 70 * direction; // capped well under 90°, never flips upside-down
//         const translateX = progress * 30 * direction;
//         const opacity = 1 - progress * 0.95;

//         el.style.transform = `translateX(${translateX}px) scale(${scale}) rotate(${rotate}deg)`;
//         el.style.opacity = `${opacity}`;
//         el.style.transformOrigin = "center top";
//         el.style.pointerEvents = progress > 0.7 ? "none" : "auto";
//       });
//       rafId = requestAnimationFrame(tick);
//     };

//     rafId = requestAnimationFrame(tick);
//     return () => cancelAnimationFrame(rafId);
//   }, [pieces, columns]);

//   const handleSubscribe = async (e: React.FormEvent) => {
//     e.preventDefault();
//     const trimmed = email.trim();
//     if (!trimmed || subscribeStatus === "loading") return;

//     setSubscribeStatus("loading");
//     setSubscribeError(null);
//     try {
//       await subscribeToNewsletter(trimmed);
//       setSubscribeStatus("success");
//       setEmail("");
//       // auto-close after a moment so the person sees the confirmation
//       setTimeout(() => {
//         setShowSubscribe(false);
//         setSubscribeStatus("idle");
//       }, 1800);
//     } catch (err) {
//       setSubscribeStatus("error");
//       setSubscribeError("Something went wrong. Try again in a moment.");
//     }
//   };

//   // close modal on Escape key
//   useEffect(() => {
//     if (!showSubscribe) return;
//     const onKey = (e: KeyboardEvent) => {
//       if (e.key === "Escape") setShowSubscribe(false);
//     };
//     window.addEventListener("keydown", onKey);
//     return () => window.removeEventListener("keydown", onKey);
//   }, [showSubscribe]);

//   // --- Animated typewriter placeholder for the search bar ---
//   // Types a phrase out, pauses, erases it, pauses briefly, then types
//   // the next phrase — looping forever through the list below.
//   const searchPhrases = [
//     "Hey, search articles, poems, and more…",
//     "Try “street style”…",
//     "Try “spirituality”…",
//     "Try “sports & fitness”…",
//     "Try “music”…",
//   ];
//   const [animatedPlaceholder, setAnimatedPlaceholder] = useState("");
//   const phraseIndexRef = useRef(0);
//   const charIndexRef = useRef(0);
//   const isDeletingRef = useRef(false);

//   useEffect(() => {
//     let timeoutId: ReturnType<typeof setTimeout>;

//     const tick = () => {
//       const current = searchPhrases[phraseIndexRef.current];

//       if (!isDeletingRef.current) {
//         charIndexRef.current += 1;
//         setAnimatedPlaceholder(current.slice(0, charIndexRef.current));

//         if (charIndexRef.current === current.length) {
//           isDeletingRef.current = true;
//           timeoutId = setTimeout(tick, 1400); // pause while fully typed
//           return;
//         }
//         timeoutId = setTimeout(tick, 65); // typing speed
//       } else {
//         charIndexRef.current -= 1;
//         setAnimatedPlaceholder(current.slice(0, charIndexRef.current));

//         if (charIndexRef.current === 0) {
//           isDeletingRef.current = false;
//           phraseIndexRef.current = (phraseIndexRef.current + 1) % searchPhrases.length;
//           timeoutId = setTimeout(tick, 400); // pause while empty
//           return;
//         }
//         timeoutId = setTimeout(tick, 35); // deleting speed
//       }
//     };

//     timeoutId = setTimeout(tick, 500);
//     return () => clearTimeout(timeoutId);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   return (
//     <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-32 sm:pt-28 md:pt-24 pb-16">
//       {/* Top-right nav: About + Contact + Subscribe — fixed so it always sits above the photo cluster and everything else.
//           Sized down on mobile so three buttons never overflow a narrow viewport. */}
//       <div className="fixed top-3 right-3 sm:top-5 sm:right-6 z-50 flex items-center gap-1.5 sm:gap-4">
//         <Link
//           href="/about"
//           className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white whitespace-nowrap"
//         >
//           ABOUT
//         </Link>

//         <button
//           onClick={() => setShowSubscribe(true)}
//           className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-black bg-black text-white shadow-md transition hover:bg-white hover:text-black whitespace-nowrap"
//         >
//           SUBSCRIBE
//         </button>

//         <Link
//           href="/contact"
//           className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white whitespace-nowrap"
//         >
//           CONTACT
//         </Link>
//       </div>

//       <header className="relative mb-6 px-2 sm:px-6 py-6 overflow-hidden">
//         <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
//           <div className="max-w-full">
//             <h1
//               className="relative z-10 font-accent text-4xl xs:text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-center break-words"
//               style={{ color: "var(--green)" }}
//             >
//               MUSINGS by Shreyansi
//             </h1>
//             <p
//               className="font-display text-sm sm:text-lg md:text-2xl tracking-[0.2em] sm:tracking-widest text-center mt-2"
//               style={{ color: "var(--text-muted)" }}
//             >
//               AN INDEPENDENT MAGAZINE
//             </p>
//           </div>

//           {/* Scattered scrapbook-style photo cluster — sized in relative
//               units so it scales down cleanly instead of overflowing on
//               narrow screens. */}
//           <div className="relative w-[220px] h-[190px] sm:w-[260px] sm:h-[225px] md:w-[300px] md:h-[260px] shrink-0">
//             <img
//               src="/hero-portrait.png"
//               alt="Hand-drawn portrait illustration"
//               className="absolute shadow-lg"
//               style={{
//                 width: "43%",
//                 border: "2px solid var(--border)",
//                 borderRadius: "50% 48% 52% 49% / 52% 50% 50% 48%",
//                 transform: "rotate(-8deg)",
//                 left: "0%",
//                 top: "4%",
//                 zIndex: 1,
//               }}
//             />
//             <img
//               src="/hero-shadow.png"
//               alt="Shadow silhouette photograph"
//               className="absolute rounded-xl shadow-lg"
//               style={{
//                 width: "40%",
//                 border: "4px solid white",
//                 boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
//                 transform: "rotate(6deg)",
//                 left: "50%",
//                 top: "0%",
//                 zIndex: 2,
//               }}
//             />
//             <img
//               src="/hero-mirror.png"
//               alt="Mirror self-portrait photograph"
//               className="absolute rounded-xl shadow-lg"
//               style={{
//                 width: "37%",
//                 border: "4px solid white",
//                 boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
//                 transform: "rotate(-4deg)",
//                 left: "33%",
//                 top: "54%",
//                 zIndex: 3,
//               }}
//             />
//           </div>
//         </div>
//       </header>

//       <div className="w-full max-w-xl mx-auto mb-8 sm:mb-10 relative px-2 sm:px-0">
//         <input
//           type="text"
//           value={searchQuery}
//           onChange={(e) => setSearchQuery(e.target.value)}
//           className="w-full font-body text-base sm:text-lg px-4 sm:px-5 py-2.5 sm:py-3 rounded-full border-2 outline-none focus:border-current transition relative bg-transparent"
//           style={{
//             borderColor: "var(--pink)",
//             color: "var(--text)",
//             background: "var(--surface)",
//           }}
//         />
//         {searchQuery.length === 0 && (
//           <span
//             className="font-body text-sm sm:text-lg absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 pointer-events-none select-none truncate max-w-[85%]"
//             style={{ color: "var(--text-muted)" }}
//           >
//             {animatedPlaceholder}
//             <span className="animate-pulse">|</span>
//           </span>
//         )}
//       </div>

//       {error && <p className="text-red-500 mb-6 text-center px-4">{error}</p>}

//       <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-10 sm:mb-12 px-2">
//         <button
//           onClick={() => setActiveGenre(null)}
//           className="font-display text-sm sm:text-base tracking-wide px-4 py-1.5 sm:px-5 sm:py-2 rounded-full border-2 transition"
//           style={{
//             borderColor: activeGenre === null ? "var(--text)" : "var(--border)",
//             color: "var(--text)",
//           }}
//         >
//           ALL
//         </button>
//         {genres.map((genre, i) => {
//           const active = activeGenre === genre.slug;
//           const btnColor = genreColor(i);
//           return (
//             <button
//               key={genre.id}
//               onClick={() => setActiveGenre(genre.slug)}
//               className="font-display text-sm sm:text-base tracking-wide px-4 py-1.5 sm:px-5 sm:py-2 rounded-full border-2 transition"
//               style={{
//                 borderColor: active ? btnColor : "var(--border)",
//                 color: active ? btnColor : "var(--text-muted)",
//                 background: active ? "var(--surface)" : "transparent",
//               }}
//             >
//               {genre.name.toUpperCase()}
//             </button>
//           );
//         })}
//       </div>

//       {loading ? (
//         <p
//           className="font-accent text-xl sm:text-2xl text-center"
//           style={{ color: "var(--text-muted)" }}
//         >
//           loading…
//         </p>
//       ) : pieces.length === 0 ? (
//         <p
//           className="font-accent text-xl sm:text-2xl text-center px-4"
//           style={{ color: "var(--text-muted)" }}
//         >
//           nothing published here yet.
//         </p>
//       ) : (
//         <div className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
//           {pieces.map((piece, i) => {
//             const cardColor = genreColor(i);
//             // Strip HTML markup from the excerpt so the hover preview
//             // shows plain text instead of raw tags.
//             const preview = stripHtml(piece.excerpt?.trim() ?? "");
//             return (
//               <a
//                 key={piece.id}
//                 ref={(el) => {
//                   cardRefs.current[i] = el;
//                 }}
//                 href={`/piece/${piece.slug}`}
//                 className="group relative block rounded-3xl border-2 hover:shadow-lg"
//                 style={{
//                   borderColor: "var(--border)",
//                   background: "var(--surface)",
//                   willChange: "transform, opacity",
//                   overflow: "visible",
//                 }}
//               >
//                 <div className="rounded-3xl overflow-hidden">
//                   {piece.cover_image && (
//                     <img
//                       src={piece.cover_image}
//                       alt={piece.title}
//                       className="w-full h-40 sm:h-48 object-cover"
//                     />
//                   )}
//                   <div className="p-4 sm:p-6">
//                     <span
//                       className="font-display text-xs sm:text-sm tracking-wide px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full inline-block mb-3"
//                       style={{ color: "white", background: cardColor }}
//                     >
//                       {piece.genre.name.toUpperCase()} · {piece.content_type.toUpperCase()}
//                     </span>
//                     <h2 className="font-display text-2xl sm:text-3xl leading-snug break-words">
//                       {piece.title}
//                     </h2>
//                     {piece.subtitle && (
//                       <p className="text-base sm:text-lg mt-1" style={{ color: "var(--text-muted)" }}>
//                         {piece.subtitle}
//                       </p>
//                     )}
//                   </div>
//                 </div>

//                 {/* Hover preview: desktop only (hover doesn't really exist
//                     on touch), and clamped so it can't run off-screen on
//                     narrower viewports. */}
//                 {preview.length > 0 && (
//                   <div
//                     className="hidden md:block absolute left-1/2 w-72 max-w-[90vw] z-20 opacity-0 scale-95 pointer-events-none
//                                group-hover:opacity-100 group-hover:scale-100
//                                transition-all duration-200 ease-out"
//                     style={{
//                       top: 0,
//                       transform: "translate(-50%, calc(-100% - 20px))",
//                     }}
//                   >
//                     <div
//                       className="relative rounded-2xl px-5 py-4 shadow-xl border-2 font-body text-sm leading-relaxed"
//                       style={{
//                         background: "var(--surface)",
//                         borderColor: cardColor,
//                         color: "var(--text)",
//                       }}
//                     >
//                       {preview}
//                       <div
//                         className="absolute left-1/2 w-4 h-4 border-b-2 border-r-2"
//                         style={{
//                           bottom: -9,
//                           transform: "translateX(-50%) rotate(45deg)",
//                           background: "var(--surface)",
//                           borderColor: cardColor,
//                         }}
//                       />
//                     </div>
//                   </div>
//                 )}
//               </a>
//             );
//           })}
//         </div>
//       )}

//       {/* Subscribe modal */}
//       {showSubscribe && (
//         <div
//           className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 sm:px-6"
//           onClick={() => setShowSubscribe(false)}
//         >
//           <div
//             className="w-full max-w-sm rounded-3xl border-2 border-black bg-white p-6 sm:p-8 relative"
//             onClick={(e) => e.stopPropagation()}
//           >
//             <button
//               onClick={() => setShowSubscribe(false)}
//               className="absolute top-4 right-4 font-display text-sm text-black"
//               aria-label="Close"
//             >
//               ✕
//             </button>

//             <h3 className="font-accent text-2xl sm:text-3xl mb-2 text-black">Subscribe</h3>
//             <p className="font-body text-sm text-black/70 mb-6">
//               New pieces, straight to your inbox. No spam, unsubscribe anytime.
//             </p>

//             {subscribeStatus === "success" ? (
//               <p className="font-body text-black">You&apos;re in — thanks for subscribing!</p>
//             ) : (
//               <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
//                 <input
//                   type="email"
//                   required
//                   value={email}
//                   onChange={(e) => setEmail(e.target.value)}
//                   placeholder="you@email.com"
//                   className="w-full font-body px-4 py-3 rounded-full border-2 border-black outline-none text-black"
//                   disabled={subscribeStatus === "loading"}
//                 />
//                 {subscribeError && (
//                   <p className="text-red-500 text-sm">{subscribeError}</p>
//                 )}
//                 <button
//                   type="submit"
//                   disabled={subscribeStatus === "loading"}
//                   className="font-display text-sm tracking-wide px-4 py-3 rounded-full border-2 border-black bg-black text-white transition hover:bg-white hover:text-black disabled:opacity-50"
//                 >
//                   {subscribeStatus === "loading" ? "SUBSCRIBING…" : "SUBSCRIBE"}
//                 </button>
//               </form>
//             )}
//           </div>
//         </div>
//       )}
//     </main>
//   );
// }












// "use client";

// import { useEffect, useRef, useState } from "react";
// import Link from "next/link";
// import {
//   getGenres,
//   getContentPieces,
//   searchContentPieces,
//   subscribeToNewsletter,
//   Genre,
//   ContentPiece,
// } from "@/lib/api";
// import { genreColor } from "@/lib/genreColor";

// // Strips HTML tags from rich-text excerpt content so the hover preview
// // shows clean plain text instead of raw markup.
// function stripHtml(html: string) {
//   return html
//     .replace(/<[^>]*>/g, " ")
//     .replace(/\s+/g, " ")
//     .trim();
// }

// export default function HomePage() {
//   const [genres, setGenres] = useState<Genre[]>([]);
//   const [pieces, setPieces] = useState<ContentPiece[]>([]);
//   const [activeGenre, setActiveGenre] = useState<string | null>(null);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   // --- Subscribe modal state ---
//   const [showSubscribe, setShowSubscribe] = useState(false);
//   const [email, setEmail] = useState("");
//   const [subscribeStatus, setSubscribeStatus] = useState<
//     "idle" | "loading" | "success" | "error"
//   >("idle");
//   const [subscribeError, setSubscribeError] = useState<string | null>(null);

//   useEffect(() => {
//     getGenres()
//       .then(setGenres)
//       .catch(() => setError("Could not load genres. Is the backend awake?"));
//   }, []);

//   useEffect(() => {
//     setLoading(true);
//     if (searchQuery.trim()) {
//       searchContentPieces(searchQuery.trim())
//         .then((data) => {
//           setPieces(data);
//           setLoading(false);
//         })
//         .catch(() => {
//           setError("Search failed. Is the backend awake?");
//           setLoading(false);
//         });
//       return;
//     }
//     getContentPieces(activeGenre ?? undefined)
//       .then((data) => {
//         setPieces(data);
//         setLoading(false);
//       })
//       .catch(() => {
//         setError("Could not load content. Is the backend awake?");
//         setLoading(false);
//       });
//   }, [activeGenre, searchQuery]);

//   const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);
//   const COLUMNS = 3; // matches the lg:grid-cols-3 below, used to compute row parity

//   // Continuous scroll-linked spiral: as a card's top edge approaches the
//   // top of the viewport, it shrinks, rotates, and fades — like being pulled
//   // into a vortex. Direction alternates per row: even rows spin clockwise
//   // and drift from the left, odd rows spin counter-clockwise and drift
//   // from the right. Since this runs every frame off the card's *current*
//   // position, scrolling back up naturally reverses it — no extra logic needed.
//   useEffect(() => {
//     let rafId: number;
//     const triggerStart = 200; // px from top where the effect begins
//     const triggerRange = 260; // px over which it completes

//     const tick = () => {
//       cardRefs.current.forEach((el, i) => {
//         if (!el) return;
//         const rect = el.getBoundingClientRect();
//         const raw = (triggerStart - rect.top) / triggerRange;
//         const linear = Math.min(Math.max(raw, 0), 1);
//         // Ease-in cubic: gentle at first, so the mid-transition doesn't
//         // look like an abrupt flip — the card eases into the spiral instead.
//         const progress = linear * linear * linear;

//         const row = Math.floor(i / COLUMNS);
//         const col = i % COLUMNS;
//         const rowIsOdd = row % 2 === 1;

//         // Middle column: shrink only, no rotation, same on every row.
//         // Left/right columns: spin opposite directions, and that pairing
//         // flips depending on whether the row is odd or even.
//         let direction = 0;
//         if (col === 0) direction = rowIsOdd ? -1 : 1; // left column
//         if (col === COLUMNS - 1) direction = rowIsOdd ? 1 : -1; // right column

//         const scale = 1 - progress * 0.45;
//         const rotate = progress * 70 * direction; // capped well under 90°, never flips upside-down
//         const translateX = progress * 30 * direction;
//         const opacity = 1 - progress * 0.95;

//         el.style.transform = `translateX(${translateX}px) scale(${scale}) rotate(${rotate}deg)`;
//         el.style.opacity = `${opacity}`;
//         el.style.transformOrigin = "center top";
//         el.style.pointerEvents = progress > 0.7 ? "none" : "auto";
//       });
//       rafId = requestAnimationFrame(tick);
//     };

//     rafId = requestAnimationFrame(tick);
//     return () => cancelAnimationFrame(rafId);
//   }, [pieces]);

//   const handleSubscribe = async (e: React.FormEvent) => {
//     e.preventDefault();
//     const trimmed = email.trim();
//     if (!trimmed || subscribeStatus === "loading") return;

//     setSubscribeStatus("loading");
//     setSubscribeError(null);
//     try {
//       await subscribeToNewsletter(trimmed);
//       setSubscribeStatus("success");
//       setEmail("");
//       // auto-close after a moment so the person sees the confirmation
//       setTimeout(() => {
//         setShowSubscribe(false);
//         setSubscribeStatus("idle");
//       }, 1800);
//     } catch (err) {
//       setSubscribeStatus("error");
//       setSubscribeError("Something went wrong. Try again in a moment.");
//     }
//   };

//   // close modal on Escape key
//   useEffect(() => {
//     if (!showSubscribe) return;
//     const onKey = (e: KeyboardEvent) => {
//       if (e.key === "Escape") setShowSubscribe(false);
//     };
//     window.addEventListener("keydown", onKey);
//     return () => window.removeEventListener("keydown", onKey);
//   }, [showSubscribe]);

//   // --- Animated typewriter placeholder for the search bar ---
//   // Types a phrase out, pauses, erases it, pauses briefly, then types
//   // the next phrase — looping forever through the list below.
//   const searchPhrases = [
//     "Hey, search articles, poems, and more…",
//     "Try “street style”…",
//     "Try “spirituality”…",
//     "Try “sports & fitness”…",
//     "Try “music”…",
//   ];
//   const [animatedPlaceholder, setAnimatedPlaceholder] = useState("");
//   const phraseIndexRef = useRef(0);
//   const charIndexRef = useRef(0);
//   const isDeletingRef = useRef(false);

//   useEffect(() => {
//     let timeoutId: ReturnType<typeof setTimeout>;

//     const tick = () => {
//       const current = searchPhrases[phraseIndexRef.current];

//       if (!isDeletingRef.current) {
//         charIndexRef.current += 1;
//         setAnimatedPlaceholder(current.slice(0, charIndexRef.current));

//         if (charIndexRef.current === current.length) {
//           isDeletingRef.current = true;
//           timeoutId = setTimeout(tick, 1400); // pause while fully typed
//           return;
//         }
//         timeoutId = setTimeout(tick, 65); // typing speed
//       } else {
//         charIndexRef.current -= 1;
//         setAnimatedPlaceholder(current.slice(0, charIndexRef.current));

//         if (charIndexRef.current === 0) {
//           isDeletingRef.current = false;
//           phraseIndexRef.current = (phraseIndexRef.current + 1) % searchPhrases.length;
//           timeoutId = setTimeout(tick, 400); // pause while empty
//           return;
//         }
//         timeoutId = setTimeout(tick, 35); // deleting speed
//       }
//     };

//     timeoutId = setTimeout(tick, 500);
//     return () => clearTimeout(timeoutId);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   return (
//     <main className="max-w-6xl mx-auto px-6 pt-22 pb-16">
//       {/* Top-right nav: About + Contact + Subscribe — fixed so it always sits above the photo cluster and everything else */}
//       <div className="fixed top-5 right-6 z-50 flex items-center gap-4">
//         <Link
//           href="/about"
//           className="font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white"
//         >
//           ABOUT
//         </Link>

//         <button
//           onClick={() => setShowSubscribe(true)}
//           className="font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-black text-white shadow-md transition hover:bg-white hover:text-black"
//         >
//           SUBSCRIBE
//         </button>

//         <Link
//           href="/contact"
//           className="font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white"
//         >
//           CONTACT
//         </Link>
//       </div>

//       <header className="relative mb-6 px-6 py-6 overflow-hidden">
//         <div className="flex flex-col sm:flex-row items-center justify-center gap-10">
//           <div>
//             <h1
//               className="relative z-10 font-accent text-7xl sm:text-8xl text-center"
//               style={{ color: "var(--green)" }}
//             >
//               MUSINGS by Shreyansi
//             </h1>
//             <p
//               className="font-display text-[1.8rem] tracking-widest text-center mt-2"
//               style={{ color: "var(--text-muted)" }}
//             >
//               AN INDEPENDENT MAGAZINE
//             </p>
//           </div>

//           {/* Scattered scrapbook-style photo cluster */}
//           <div className="relative" style={{ width: 300, height: 260 }}>
//             <img
//               src="/hero-portrait.png"
//               alt="Hand-drawn portrait illustration"
//               className="absolute shadow-lg"
//               style={{
//                 width: 130,
//                 border: "2px solid var(--border)",
//                 borderRadius: "50% 48% 52% 49% / 52% 50% 50% 48%",
//                 transform: "rotate(-8deg)",
//                 left: 0,
//                 top: 10,
//                 zIndex: 1,
//               }}
//             />
//             <img
//               src="/hero-shadow.png"
//               alt="Shadow silhouette photograph"
//               className="absolute rounded-xl shadow-lg"
//               style={{
//                 width: 120,
//                 border: "4px solid white",
//                 boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
//                 transform: "rotate(6deg)",
//                 left: 150,
//                 top: 0,
//                 zIndex: 2,
//               }}
//             />
//             <img
//               src="/hero-mirror.png"
//               alt="Mirror self-portrait photograph"
//               className="absolute rounded-xl shadow-lg"
//               style={{
//                 width: 110,
//                 border: "4px solid white",
//                 boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
//                 transform: "rotate(-4deg)",
//                 left: 100,
//                 top: 140,
//                 zIndex: 3,
//               }}
//             />
//           </div>
//         </div>
//       </header>

//       <div className="max-w-xl mx-auto mb-10 relative">
//         <input
//           type="text"
//           value={searchQuery}
//           onChange={(e) => setSearchQuery(e.target.value)}
//           className="w-full font-body text-lg px-5 py-3 rounded-full border-2 outline-none focus:border-current transition relative bg-transparent"
//           style={{
//             borderColor: "var(--pink)",
//             color: "var(--text)",
//             background: "var(--surface)",
//           }}
//         />
//         {searchQuery.length === 0 && (
//           <span
//             className="font-body text-lg absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none select-none"
//             style={{ color: "var(--text-muted)" }}
//           >
//             {animatedPlaceholder}
//             <span className="animate-pulse">|</span>
//           </span>
//         )}
//       </div>

//       {error && <p className="text-red-500 mb-6">{error}</p>}

//       <div className="flex flex-wrap justify-center gap-3 mb-12">
//         <button
//           onClick={() => setActiveGenre(null)}
//           className="font-display text-base tracking-wide px-5 py-2 rounded-full border-2 transition"
//           style={{
//             borderColor: activeGenre === null ? "var(--text)" : "var(--border)",
//             color: "var(--text)",
//           }}
//         >
//           ALL
//         </button>
//         {genres.map((genre, i) => {
//           const active = activeGenre === genre.slug;
//           const btnColor = genreColor(i);
//           return (
//             <button
//               key={genre.id}
//               onClick={() => setActiveGenre(genre.slug)}
//               className="font-display text-base tracking-wide px-5 py-2 rounded-full border-2 transition"
//               style={{
//                 borderColor: active ? btnColor : "var(--border)",
//                 color: active ? btnColor : "var(--text-muted)",
//                 background: active ? "var(--surface)" : "transparent",
//               }}
//             >
//               {genre.name.toUpperCase()}
//             </button>
//           );
//         })}
//       </div>

//       {loading ? (
//         <p
//           className="font-accent text-2xl text-center"
//           style={{ color: "var(--text-muted)" }}
//         >
//           loading…
//         </p>
//       ) : pieces.length === 0 ? (
//         <p
//           className="font-accent text-2xl text-center"
//           style={{ color: "var(--text-muted)" }}
//         >
//           nothing published here yet.
//         </p>
//       ) : (
//         <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
//           {pieces.map((piece, i) => {
//             const cardColor = genreColor(i);
//             // Strip HTML markup from the excerpt so the hover preview
//             // shows plain text instead of raw tags.
//             const preview = stripHtml(piece.excerpt?.trim() ?? "");
//             return (
//               <a
//                 key={piece.id}
//                 ref={(el) => {
//                   cardRefs.current[i] = el;
//                 }}
//                 href={`/piece/${piece.slug}`}
//                 className="group relative block rounded-3xl border-2 hover:shadow-lg"
//                 style={{
//                   borderColor: "var(--border)",
//                   background: "var(--surface)",
//                   willChange: "transform, opacity",
//                   overflow: "visible",
//                 }}
//               >
//                 <div className="rounded-3xl overflow-hidden">
//                   {piece.cover_image && (
//                     <img
//                       src={piece.cover_image}
//                       alt={piece.title}
//                       className="w-full h-48 object-cover"
//                     />
//                   )}
//                   <div className="p-6">
//                     <span
//                       className="font-display text-sm tracking-wide px-3 py-1.5 rounded-full inline-block mb-3"
//                       style={{ color: "white", background: cardColor }}
//                     >
//                       {piece.genre.name.toUpperCase()} · {piece.content_type.toUpperCase()}
//                     </span>
//                     <h2 className="font-display text-3xl leading-snug">{piece.title}</h2>
//                     {piece.subtitle && (
//                       <p className="text-lg mt-1" style={{ color: "var(--text-muted)" }}>
//                         {piece.subtitle}
//                       </p>
//                     )}
//                   </div>
//                 </div>

//                 {preview.length > 0 && (
//                   <div
//                     className="absolute left-1/2 w-72 z-20 opacity-0 scale-95 pointer-events-none
//                                group-hover:opacity-100 group-hover:scale-100
//                                transition-all duration-200 ease-out"
//                     style={{
//                       top: 0,
//                       transform: "translate(-50%, calc(-100% - 20px))",
//                     }}
//                   >
//                     <div
//                       className="relative rounded-2xl px-5 py-4 shadow-xl border-2 font-body text-sm leading-relaxed"
//                       style={{
//                         background: "var(--surface)",
//                         borderColor: cardColor,
//                         color: "var(--text)",
//                       }}
//                     >
//                       {preview}
//                       <div
//                         className="absolute left-1/2 w-4 h-4 border-b-2 border-r-2"
//                         style={{
//                           bottom: -9,
//                           transform: "translateX(-50%) rotate(45deg)",
//                           background: "var(--surface)",
//                           borderColor: cardColor,
//                         }}
//                       />
//                     </div>
//                   </div>
//                 )}
//               </a>
//             );
//           })}
//         </div>
//       )}

//       {/* Subscribe modal */}
//       {showSubscribe && (
//         <div
//           className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
//           onClick={() => setShowSubscribe(false)}
//         >
//           <div
//             className="w-full max-w-sm rounded-3xl border-2 border-black bg-white p-8 relative"
//             onClick={(e) => e.stopPropagation()}
//           >
//             <button
//               onClick={() => setShowSubscribe(false)}
//               className="absolute top-4 right-4 font-display text-sm text-black"
//               aria-label="Close"
//             >
//               ✕
//             </button>

//             <h3 className="font-accent text-3xl mb-2 text-black">Subscribe</h3>
//             <p className="font-body text-sm text-black/70 mb-6">
//               New pieces, straight to your inbox. No spam, unsubscribe anytime.
//             </p>

//             {subscribeStatus === "success" ? (
//               <p className="font-body text-black">You&apos;re in — thanks for subscribing!</p>
//             ) : (
//               <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
//                 <input
//                   type="email"
//                   required
//                   value={email}
//                   onChange={(e) => setEmail(e.target.value)}
//                   placeholder="you@email.com"
//                   className="w-full font-body px-4 py-3 rounded-full border-2 border-black outline-none text-black"
//                   disabled={subscribeStatus === "loading"}
//                 />
//                 {subscribeError && (
//                   <p className="text-red-500 text-sm">{subscribeError}</p>
//                 )}
//                 <button
//                   type="submit"
//                   disabled={subscribeStatus === "loading"}
//                   className="font-display text-sm tracking-wide px-4 py-3 rounded-full border-2 border-black bg-black text-white transition hover:bg-white hover:text-black disabled:opacity-50"
//                 >
//                   {subscribeStatus === "loading" ? "SUBSCRIBING…" : "SUBSCRIBE"}
//                 </button>
//               </form>
//             )}
//           </div>
//         </div>
//       )}
//     </main>
//   );
// }














// "use client";

// import { useEffect, useRef, useState } from "react";
// import Link from "next/link";
// import {
//   getGenres,
//   getContentPieces,
//   searchContentPieces,
//   subscribeToNewsletter,
//   Genre,
//   ContentPiece,
// } from "@/lib/api";
// import { genreColor } from "@/lib/genreColor";

// export default function HomePage() {
//   const [genres, setGenres] = useState<Genre[]>([]);
//   const [pieces, setPieces] = useState<ContentPiece[]>([]);
//   const [activeGenre, setActiveGenre] = useState<string | null>(null);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   // --- Subscribe modal state ---
//   const [showSubscribe, setShowSubscribe] = useState(false);
//   const [email, setEmail] = useState("");
//   const [subscribeStatus, setSubscribeStatus] = useState<
//     "idle" | "loading" | "success" | "error"
//   >("idle");
//   const [subscribeError, setSubscribeError] = useState<string | null>(null);

//   useEffect(() => {
//     getGenres()
//       .then(setGenres)
//       .catch(() => setError("Could not load genres. Is the backend awake?"));
//   }, []);

//   useEffect(() => {
//     setLoading(true);
//     if (searchQuery.trim()) {
//       searchContentPieces(searchQuery.trim())
//         .then((data) => {
//           setPieces(data);
//           setLoading(false);
//         })
//         .catch(() => {
//           setError("Search failed. Is the backend awake?");
//           setLoading(false);
//         });
//       return;
//     }
//     getContentPieces(activeGenre ?? undefined)
//       .then((data) => {
//         setPieces(data);
//         setLoading(false);
//       })
//       .catch(() => {
//         setError("Could not load content. Is the backend awake?");
//         setLoading(false);
//       });
//   }, [activeGenre, searchQuery]);

//   const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);
//   const COLUMNS = 3; // matches the lg:grid-cols-3 below, used to compute row parity

//   // Continuous scroll-linked spiral: as a card's top edge approaches the
//   // top of the viewport, it shrinks, rotates, and fades — like being pulled
//   // into a vortex. Direction alternates per row: even rows spin clockwise
//   // and drift from the left, odd rows spin counter-clockwise and drift
//   // from the right. Since this runs every frame off the card's *current*
//   // position, scrolling back up naturally reverses it — no extra logic needed.
//   useEffect(() => {
//     let rafId: number;
//     const triggerStart = 200; // px from top where the effect begins
//     const triggerRange = 260; // px over which it completes

//     const tick = () => {
//       cardRefs.current.forEach((el, i) => {
//         if (!el) return;
//         const rect = el.getBoundingClientRect();
//         const raw = (triggerStart - rect.top) / triggerRange;
//         const linear = Math.min(Math.max(raw, 0), 1);
//         // Ease-in cubic: gentle at first, so the mid-transition doesn't
//         // look like an abrupt flip — the card eases into the spiral instead.
//         const progress = linear * linear * linear;

//         const row = Math.floor(i / COLUMNS);
//         const col = i % COLUMNS;
//         const rowIsOdd = row % 2 === 1;

//         // Middle column: shrink only, no rotation, same on every row.
//         // Left/right columns: spin opposite directions, and that pairing
//         // flips depending on whether the row is odd or even.
//         let direction = 0;
//         if (col === 0) direction = rowIsOdd ? -1 : 1; // left column
//         if (col === COLUMNS - 1) direction = rowIsOdd ? 1 : -1; // right column

//         const scale = 1 - progress * 0.45;
//         const rotate = progress * 70 * direction; // capped well under 90°, never flips upside-down
//         const translateX = progress * 30 * direction;
//         const opacity = 1 - progress * 0.95;

//         el.style.transform = `translateX(${translateX}px) scale(${scale}) rotate(${rotate}deg)`;
//         el.style.opacity = `${opacity}`;
//         el.style.transformOrigin = "center top";
//         el.style.pointerEvents = progress > 0.7 ? "none" : "auto";
//       });
//       rafId = requestAnimationFrame(tick);
//     };

//     rafId = requestAnimationFrame(tick);
//     return () => cancelAnimationFrame(rafId);
//   }, [pieces]);

//   const handleSubscribe = async (e: React.FormEvent) => {
//     e.preventDefault();
//     const trimmed = email.trim();
//     if (!trimmed || subscribeStatus === "loading") return;

//     setSubscribeStatus("loading");
//     setSubscribeError(null);
//     try {
//       await subscribeToNewsletter(trimmed);
//       setSubscribeStatus("success");
//       setEmail("");
//       // auto-close after a moment so the person sees the confirmation
//       setTimeout(() => {
//         setShowSubscribe(false);
//         setSubscribeStatus("idle");
//       }, 1800);
//     } catch (err) {
//       setSubscribeStatus("error");
//       setSubscribeError("Something went wrong. Try again in a moment.");
//     }
//   };

//   // close modal on Escape key
//   useEffect(() => {
//     if (!showSubscribe) return;
//     const onKey = (e: KeyboardEvent) => {
//       if (e.key === "Escape") setShowSubscribe(false);
//     };
//     window.addEventListener("keydown", onKey);
//     return () => window.removeEventListener("keydown", onKey);
//   }, [showSubscribe]);

//   // --- Animated typewriter placeholder for the search bar ---
//   // Types a phrase out, pauses, erases it, pauses briefly, then types
//   // the next phrase — looping forever through the list below.
//   const searchPhrases = [
//     "Hey, search articles, poems, and more…",
//     "Try “street style”…",
//     "Try “spirituality”…",
//     "Try “sports & fitness”…",
//     "Try “music”…",
//   ];
//   const [animatedPlaceholder, setAnimatedPlaceholder] = useState("");
//   const phraseIndexRef = useRef(0);
//   const charIndexRef = useRef(0);
//   const isDeletingRef = useRef(false);

//   useEffect(() => {
//     let timeoutId: ReturnType<typeof setTimeout>;

//     const tick = () => {
//       const current = searchPhrases[phraseIndexRef.current];

//       if (!isDeletingRef.current) {
//         charIndexRef.current += 1;
//         setAnimatedPlaceholder(current.slice(0, charIndexRef.current));

//         if (charIndexRef.current === current.length) {
//           isDeletingRef.current = true;
//           timeoutId = setTimeout(tick, 1400); // pause while fully typed
//           return;
//         }
//         timeoutId = setTimeout(tick, 65); // typing speed
//       } else {
//         charIndexRef.current -= 1;
//         setAnimatedPlaceholder(current.slice(0, charIndexRef.current));

//         if (charIndexRef.current === 0) {
//           isDeletingRef.current = false;
//           phraseIndexRef.current = (phraseIndexRef.current + 1) % searchPhrases.length;
//           timeoutId = setTimeout(tick, 400); // pause while empty
//           return;
//         }
//         timeoutId = setTimeout(tick, 35); // deleting speed
//       }
//     };

//     timeoutId = setTimeout(tick, 500);
//     return () => clearTimeout(timeoutId);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, []);

//   return (
//     <main className="max-w-6xl mx-auto px-6 pt-22 pb-16">
//       {/* Top-right nav: About + Subscribe — fixed so it always sits above the photo cluster and everything else */}
//       {/* Top-right nav: About + Contact + Subscribe — fixed so it always sits above the photo cluster and everything else */}
// <div className="fixed top-5 right-6 z-50 flex items-center gap-4">
//   <Link
//     href="/about"
//     className="font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white"
//   >
//     ABOUT
//   </Link>

//   <button
//     onClick={() => setShowSubscribe(true)}
//     className="font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-black text-white shadow-md transition hover:bg-white hover:text-black"
//   >
//     SUBSCRIBE
//   </button>

//   <Link
//     href="/contact"
//     className="font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white"
//   >
//     CONTACT
//   </Link>
  
// </div>

//       <header className="relative mb-6 px-6 py-6 overflow-hidden">
//         <div className="flex flex-col sm:flex-row items-center justify-center gap-10">
//           <div>
//             <h1
//               className="relative z-10 font-accent text-7xl sm:text-8xl text-center"
//               style={{ color: "var(--green)" }}
//             >
//               MUSINGS by Shreyansi
//             </h1>
//            <p
//   className="font-display text-[1.8rem] tracking-widest text-center mt-2"
//   style={{ color: "var(--text-muted)" }}
// >
//   AN INDEPENDENT MAGAZINE
// </p>
//           </div>

//           {/* Scattered scrapbook-style photo cluster */}
//           <div className="relative" style={{ width: 300, height: 260 }}>
//             <img
//               src="/hero-portrait.png"
//               alt="Hand-drawn portrait illustration"
//               className="absolute shadow-lg"
//               style={{
//                 width: 130,
//                 border: "2px solid var(--border)",
//                 borderRadius: "50% 48% 52% 49% / 52% 50% 50% 48%",
//                 transform: "rotate(-8deg)",
//                 left: 0,
//                 top: 10,
//                 zIndex: 1,
//               }}
//             />
//             <img
//               src="/hero-shadow.png"
//               alt="Shadow silhouette photograph"
//               className="absolute rounded-xl shadow-lg"
//               style={{
//                 width: 120,
//                 border: "4px solid white",
//                 boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
//                 transform: "rotate(6deg)",
//                 left: 150,
//                 top: 0,
//                 zIndex: 2,
//               }}
//             />
//             <img
//               src="/hero-mirror.png"
//               alt="Mirror self-portrait photograph"
//               className="absolute rounded-xl shadow-lg"
//               style={{
//                 width: 110,
//                 border: "4px solid white",
//                 boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
//                 transform: "rotate(-4deg)",
//                 left: 100,
//                 top: 140,
//                 zIndex: 3,
//               }}
//             />
//           </div>
//         </div>
//       </header>

//       <div className="max-w-xl mx-auto mb-10 relative">
//         <input
//           type="text"
//           value={searchQuery}
//           onChange={(e) => setSearchQuery(e.target.value)}
//           className="w-full font-body text-lg px-5 py-3 rounded-full border-2 outline-none focus:border-current transition relative bg-transparent"
//           style={{
//             borderColor: "var(--pink)",
//             color: "var(--text)",
//             background: "var(--surface)",
//           }}
//         />
//         {searchQuery.length === 0 && (
//           <span
//             className="font-body text-lg absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none select-none"
//             style={{ color: "var(--text-muted)" }}
//           >
//             {animatedPlaceholder}
//             <span className="animate-pulse">|</span>
//           </span>
//         )}
//       </div>

//       {error && <p className="text-red-500 mb-6">{error}</p>}

//       <div className="flex flex-wrap justify-center gap-3 mb-12">
//         <button
//           onClick={() => setActiveGenre(null)}
//           className="font-display text-base tracking-wide px-5 py-2 rounded-full border-2 transition"
//           style={{
//             borderColor: activeGenre === null ? "var(--text)" : "var(--border)",
//             color: "var(--text)",
//           }}
//         >
//           ALL
//         </button>
//         {genres.map((genre, i) => {
//           const active = activeGenre === genre.slug;
//           const btnColor = genreColor(i);
//           return (
//             <button
//               key={genre.id}
//               onClick={() => setActiveGenre(genre.slug)}
//               className="font-display text-base tracking-wide px-5 py-2 rounded-full border-2 transition"
//               style={{
//                 borderColor: active ? btnColor : "var(--border)",
//                 color: active ? btnColor : "var(--text-muted)",
//                 background: active ? "var(--surface)" : "transparent",
//               }}
//             >
//               {genre.name.toUpperCase()}
//             </button>
//           );
//         })}
//       </div>

//       {loading ? (
//         <p
//           className="font-accent text-2xl text-center"
//           style={{ color: "var(--text-muted)" }}
//         >
//           loading…
//         </p>
//       ) : pieces.length === 0 ? (
//         <p
//           className="font-accent text-2xl text-center"
//           style={{ color: "var(--text-muted)" }}
//         >
//           nothing published here yet.
//         </p>
//       ) : (
//         <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
//           {pieces.map((piece, i) => {
//             const cardColor = genreColor(i);
//             const preview = piece.excerpt?.trim() ?? "";
//             return (
//               <a
//                 key={piece.id}
//                 ref={(el) => {
//                   cardRefs.current[i] = el;
//                 }}
//                 href={`/piece/${piece.slug}`}
//                 className="group relative block rounded-3xl border-2 hover:shadow-lg"
//                 style={{
//                   borderColor: "var(--border)",
//                   background: "var(--surface)",
//                   willChange: "transform, opacity",
//                   overflow: "visible",
//                 }}
//               >
//                 <div className="rounded-3xl overflow-hidden">
//                   {piece.cover_image && (
//                     <img
//                       src={piece.cover_image}
//                       alt={piece.title}
//                       className="w-full h-48 object-cover"
//                     />
//                   )}
//                   <div className="p-6">
//                     <span
//                       className="font-display text-sm tracking-wide px-3 py-1.5 rounded-full inline-block mb-3"
//                       style={{ color: "white", background: cardColor }}
//                     >
//                       {piece.genre.name.toUpperCase()} · {piece.content_type.toUpperCase()}
//                     </span>
//                     <h2 className="font-display text-3xl leading-snug">{piece.title}</h2>
//                     {piece.subtitle && (
//                       <p className="text-lg mt-1" style={{ color: "var(--text-muted)" }}>
//                         {piece.subtitle}
//                       </p>
//                     )}
//                   </div>
//                 </div>

//                 {preview.length > 0 && (
//                   <div
//                     className="absolute left-1/2 w-72 z-20 opacity-0 scale-95 pointer-events-none
//                                group-hover:opacity-100 group-hover:scale-100
//                                transition-all duration-200 ease-out"
//                     style={{
//                       top: 0,
//                       transform: "translate(-50%, calc(-100% - 20px))",
//                     }}
//                   >
//                     <div
//                       className="relative rounded-2xl px-5 py-4 shadow-xl border-2 font-body text-sm leading-relaxed"
//                       style={{
//                         background: "var(--surface)",
//                         borderColor: cardColor,
//                         color: "var(--text)",
//                       }}
//                     >
//                       {preview}
//                       <div
//                         className="absolute left-1/2 w-4 h-4 border-b-2 border-r-2"
//                         style={{
//                           bottom: -9,
//                           transform: "translateX(-50%) rotate(45deg)",
//                           background: "var(--surface)",
//                           borderColor: cardColor,
//                         }}
//                       />
//                     </div>
//                   </div>
//                 )}
//               </a>
//             );
//           })}
//         </div>
//       )}

//       {/* Subscribe modal */}
//       {showSubscribe && (
//         <div
//           className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
//           onClick={() => setShowSubscribe(false)}
//         >
//           <div
//             className="w-full max-w-sm rounded-3xl border-2 border-black bg-white p-8 relative"
//             onClick={(e) => e.stopPropagation()}
//           >
//             <button
//               onClick={() => setShowSubscribe(false)}
//               className="absolute top-4 right-4 font-display text-sm text-black"
//               aria-label="Close"
//             >
//               ✕
//             </button>

//             <h3 className="font-accent text-3xl mb-2 text-black">Subscribe</h3>
//             <p className="font-body text-sm text-black/70 mb-6">
//               New pieces, straight to your inbox. No spam, unsubscribe anytime.
//             </p>

//             {subscribeStatus === "success" ? (
//               <p className="font-body text-black">You&apos;re in — thanks for subscribing!</p>
//             ) : (
//               <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
//                 <input
//                   type="email"
//                   required
//                   value={email}
//                   onChange={(e) => setEmail(e.target.value)}
//                   placeholder="you@email.com"
//                   className="w-full font-body px-4 py-3 rounded-full border-2 border-black outline-none text-black"
//                   disabled={subscribeStatus === "loading"}
//                 />
//                 {subscribeError && (
//                   <p className="text-red-500 text-sm">{subscribeError}</p>
//                 )}
//                 <button
//                   type="submit"
//                   disabled={subscribeStatus === "loading"}
//                   className="font-display text-sm tracking-wide px-4 py-3 rounded-full border-2 border-black bg-black text-white transition hover:bg-white hover:text-black disabled:opacity-50"
//                 >
//                   {subscribeStatus === "loading" ? "SUBSCRIBING…" : "SUBSCRIBE"}
//                 </button>
//               </form>
//             )}
//           </div>
//         </div>
//       )}
//     </main>
//   );
// }


