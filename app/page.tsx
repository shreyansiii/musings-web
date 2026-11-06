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

const TRAIL_ROWS = 5; // lines of text in the trail
const TRAIL_SPACING = 18; // gap between lines at the widest part (px)
const TRAIL_LENS = 112; // magnifier diameter
const TRAIL_ZOOM = 1.9; // magnification inside the lens
const TRAIL_GAP_PX = 36; // space between snippets (px)
const TRAIL_ITEMS = 14; // snippets per line
const TRAIL_STEPS = 160; // how finely each curve is sampled
const TRAIL_HALF = ((TRAIL_ROWS - 1) / 2) * TRAIL_SPACING; // half the width of the ribbon

type Box = { left: number; top: number; right: number; bottom: number };

// How far the edge of the ribbon stays away from the title block (px). Raise
// this to push the trail further from the title.
const TRAIL_MARGIN = 34;

// x of the straight run down the left side of the title (kept on screen)
function trailLeft(box: Box, amp: number) {
  return Math.max(box.left - TRAIL_HALF - TRAIL_MARGIN - amp, TRAIL_HALF + 8);
}

type Pt = { x: number; y: number };

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Turns a list of points into a much denser, smooth curve (Catmull-Rom), so
// letters placed along it follow it without kinks.
function densify(pts: Pt[], sub = 4): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// A curve prepared for fast lookups: "what are the position and direction
// at distance s along the curve?"
type Lut = {
  n: number;
  len: number;
  x: Float32Array;
  y: Float32Array;
  cum: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
};

function buildLut(pts: Pt[]): Lut {
  const n = pts.length;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const cum = new Float32Array(n);
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = pts[i].x;
    y[i] = pts[i].y;
    if (i > 0) cum[i] = cum[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = x[b] - x[a];
    const dy = y[b] - y[a];
    const l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l;
    ty[i] = dy / l;
  }
  return { n, len: cum[n - 1], x, y, cum, tx, ty };
}

// All the letters of one line of the trail, with the distance each one sits
// at along the line (two or more repeats, so the line can scroll forever).
type GlyphRow = {
  n: number;
  P: number; // length of one repeat
  ch: string[];
  w: Float32Array;
  off: Float32Array;
  kind: Uint8Array; // 1 = title style, 0 = normal
};

type TrailFonts = { title: string; line: string };

// Ask the page which fonts it is really using, so the canvas text matches.
function trailFonts(): TrailFonts {
  const probe = (cls: string) => {
    const el = document.createElement("span");
    el.className = cls;
    el.style.cssText = "position:absolute;visibility:hidden";
    el.textContent = "x";
    document.body.appendChild(el);
    const family = getComputedStyle(el).fontFamily;
    el.remove();
    return family;
  };
  return {
    title: `13px ${probe("font-display")}`,
    line: `italic 13px ${probe("font-body")}`,
  };
}

function buildGlyphRows(items: Snippet[][], lens: number[], fonts: TrailFonts): GlyphRow[] {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return [];
  // split into whole letters (so scripts like Devanagari keep their shapes)
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  const seg = Seg ? new Seg(undefined, { granularity: "grapheme" }) : null;
  const split = (s: string): string[] =>
    seg ? Array.from(seg.segment(s), (g) => g.segment) : Array.from(s);

  return items.map((line, r) => {
    const ch: string[] = [];
    const w: number[] = [];
    const kind: number[] = [];
    line.forEach((sn) => {
      const isTitle = sn.kind === "title";
      ctx.font = isTitle ? fonts.title : fonts.line;
      split(sn.text).forEach((g) => {
        ch.push(g);
        w.push(ctx.measureText(g).width + (isTitle ? 1.3 : 0));
        kind.push(isTitle ? 1 : 0);
      });
      ch.push(" ");
      w.push(TRAIL_GAP_PX);
      kind.push(0);
    });
    const P = w.reduce((a, b) => a + b, 0) || 1;
    const copies = Math.max(2, Math.ceil((lens[r] || 0) / P) + 1);
    const n = ch.length * copies;
    const row: GlyphRow = {
      n,
      P,
      ch: new Array(n),
      w: new Float32Array(n),
      off: new Float32Array(n),
      kind: new Uint8Array(n),
    };
    let o = 0;
    for (let c = 0; c < copies; c++) {
      for (let i = 0; i < ch.length; i++) {
        const k = c * ch.length + i;
        row.ch[k] = ch[i];
        row.w[k] = w[i];
        row.off[k] = o;
        row.kind[k] = kind[i];
        o += w[i];
      }
    }
    return row;
  });
}

// Builds the trail so it hugs the title block. It is drawn from the genre bar
// (`end`) up the LEFT side of the title, over the TOP of it, and up to the
// SUBSCRIBE button (`origin`). Drawn this way the text always reads upright
// (left to right along the top), and the text is scrolled the other way, so it
// looks like it pours out of the button, runs over the top of the title, down
// its left side and into the genre bar.
//   - the lines are bunched at the button (the fume's source), fan out, and
//     tighten again as they reach the bar
//   - a small snake wiggle is added along the whole route
function buildTrail(origin: Pt, end: Pt, box: Box, amp: number) {
  const K = 0.5523; // bezier constant for a quarter circle
  const L = trailLeft(box, amp); // left side of the route
  const T = Math.max(box.top - TRAIL_HALF - TRAIL_MARGIN - amp, origin.y + 40); // top side of the route
  const r = 70; // roundness of the top-left corner
  const Yb = Math.max(end.y - 80, T + r + 20); // where the left run starts bending into the bar
  const a = Math.max(20, Math.min(240, origin.x - L - r)); // width of the top-right bend
  const sx = origin.x - a;
  const b = T - origin.y; // height of the top-right bend

  // dense raw points along the route, in order from the bar to the button
  const raw: Pt[] = [end];
  const cubic = (p0: Pt, c1: Pt, c2: Pt, p3: Pt, n = 24) => {
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const A = (1 - u) ** 3;
      const B = 3 * (1 - u) ** 2 * u;
      const C = 3 * (1 - u) * u * u;
      const D = u ** 3;
      raw.push({
        x: A * p0.x + B * c1.x + C * c2.x + D * p3.x,
        y: A * p0.y + B * c1.y + C * c2.y + D * p3.y,
      });
    }
  };
  const line = (p0: Pt, p1: Pt) => {
    const n = Math.max(1, Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y) / 10));
    for (let i = 1; i <= n; i++) {
      raw.push({ x: p0.x + ((p1.x - p0.x) * i) / n, y: p0.y + ((p1.y - p0.y) * i) / n });
    }
  };

  // 1. from the bar, curving onto the straight run up the left side
  cubic(end, { x: end.x, y: end.y - 40 }, { x: L, y: Yb + 40 }, { x: L, y: Yb });
  // 2. up the left side of the title
  line({ x: L, y: Yb }, { x: L, y: T + r });
  // 3. round the top-left corner
  cubic(
    { x: L, y: T + r },
    { x: L, y: T + r - K * r },
    { x: L + r - K * r, y: T },
    { x: L + r, y: T }
  );
  // 4. along the top of the title
  line({ x: L + r, y: T }, { x: sx, y: T });
  // 5. up to the button
  cubic(
    { x: sx, y: T },
    { x: sx + K * a, y: T },
    { x: origin.x, y: origin.y + K * b },
    origin
  );

  // resample so points are evenly spaced along the route
  const cum = [0];
  for (let i = 1; i < raw.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y));
  }
  const total = cum[cum.length - 1] || 1;
  const pts: Pt[] = [];
  let j = 0;
  for (let i = 0; i <= TRAIL_STEPS; i++) {
    const s = (total * i) / TRAIL_STEPS;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const k = Math.min(1, Math.max(0, (s - cum[j]) / seg));
    pts.push({
      x: raw[j].x + (raw[j + 1].x - raw[j].x) * k,
      y: raw[j].y + (raw[j + 1].y - raw[j].y) * k,
    });
  }

  // centre line = route + a small sideways wiggle (zero at both ends)
  const WAVE = 240; // length of one wiggle along the route (px)
  const center: Pt[] = pts.map((pt, i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(TRAIL_STEPS, i + 1)];
    const len = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
    const nx = (next.y - prev.y) / len;
    const ny = -(next.x - prev.x) / len;
    const s = i / TRAIL_STEPS;
    const env = smoothstep(0, 0.1, s) * smoothstep(0, 0.1, 1 - s);
    const w = amp * Math.sin((2 * Math.PI * ((total * i) / TRAIL_STEPS)) / WAVE + 0.6) * env;
    return { x: pt.x + nx * w, y: pt.y + ny * w };
  });

  // fan the lines out around the centre line
  const rowPts: Pt[][] = Array.from({ length: TRAIL_ROWS }, () => []);
  for (let i = 0; i <= TRAIL_STEPS; i++) {
    const s = i / TRAIL_STEPS;
    const pa = center[Math.max(0, i - 1)];
    const pc = center[Math.min(TRAIL_STEPS, i + 1)];
    const len = Math.hypot(pc.x - pa.x, pc.y - pa.y) || 1;
    const nx = (pc.y - pa.y) / len;
    const ny = -(pc.x - pa.x) / len;
    // 0 at the button, 1 along the route, a little pinched at the bar
    const fan = smoothstep(0, 0.18, 1 - s) * (0.4 + 0.6 * smoothstep(0, 0.1, s));
    for (let rr = 0; rr < TRAIL_ROWS; rr++) {
      const off = (rr - (TRAIL_ROWS - 1) / 2) * TRAIL_SPACING * fan;
      rowPts[rr].push({ x: center[i].x + nx * off, y: center[i].y + ny * off });
    }
  }

  return { center, rowPts, origin, end };
}

// point along the centre line at position u (0 = bar end, 1 = button end)
function trailPointAt(center: Pt[], u: number): Pt {
  const f = Math.min(1, Math.max(0, u)) * (center.length - 1);
  const i = Math.min(center.length - 2, Math.floor(f));
  const k = f - i;
  return {
    x: center[i].x + (center[i + 1].x - center[i].x) * k,
    y: center[i].y + (center[i + 1].y - center[i].y) * k,
  };
}

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

type TrailGeo = {
  W: number; // page width
  H: number; // overlay height (page top -> just into the genre bar)
  top: number; // where the wrapper starts on the page
  left: number;
  origin: Pt; // bottom of the SUBSCRIBE button
  end: Pt; // spot on the genre bar's top line where the trail lands
  box: Box; // the title block the trail hugs
  amp: number; // size of the snake wiggle
};

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

// A trail of text that pours out of the SUBSCRIBE button like fumes, runs over
// the top of the title, down its left side and into the genre bar. A magnifying
// glass rides along it. `children` (the header) is drawn on top of the trail.
//
// The text is drawn on <canvas>, one letter at a time, from one animation loop.
// That is what keeps it smooth: letters are placed at exact sub-pixel
// positions every frame instead of asking the browser to re-flow text along a
// curve.
function TextTrail({
  pieces,
  navKey,
  children,
}: {
  pieces: ContentPiece[];
  navKey: number; // changes when the genre bar appears, so we re-measure
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const lensCanvasRef = useRef<HTMLCanvasElement>(null);
  const lutsRef = useRef<Lut[]>([]);
  const glyphRowsRef = useRef<GlyphRow[]>([]);
  const fontsRef = useRef<TrailFonts>({ title: "13px sans-serif", line: "italic 13px serif" });
  const clockRef = useRef(0); // seconds since the page loaded; survives re-measuring
  const [geo, setGeo] = useState<TrailGeo | null>(null);

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
  const items = useMemo(() => {
    const n = snippets.length;
    return Array.from({ length: TRAIL_ROWS }, (_, r) => {
      const start = Math.floor((r * n) / TRAIL_ROWS) + r;
      return Array.from({ length: TRAIL_ITEMS }, (_, k) => snippets[(start + k) % n]);
    });
  }, [snippets]);

  const trail = useMemo(
    () => (geo ? buildTrail(geo.origin, geo.end, geo.box, geo.amp) : null),
    [geo]
  );

  // Work out where the button, the title and the genre bar are on the page.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const measure = () => {
      const vw = document.documentElement.clientWidth;
      const sy = window.scrollY;
      const wr = wrap.getBoundingClientRect();
      const amp = Math.round(Math.min(14, Math.max(8, vw * 0.012)));

      // The button is fixed to the screen, so at the top of the page its
      // screen position equals its page position.
      const btn = document.getElementById("subscribe-btn")?.getBoundingClientRect();
      const origin: Pt = btn
        ? { x: btn.left + btn.width / 2, y: btn.bottom - 6 }
        : { x: vw - 150, y: 64 };

      // The title block (MUSINGS by Shreyansi + AN INDEPENDENT MAGAZINE) is what
      // the trail hugs.
      const tb = document.getElementById("title-block")?.getBoundingClientRect();
      const box: Box = tb
        ? { left: tb.left, top: tb.top + sy, right: tb.right, bottom: tb.bottom + sy }
        : { left: vw * 0.08, top: wr.top + sy + 120, right: vw * 0.6, bottom: wr.top + sy + 340 };

      // The trail lands on the genre bar's arched top line, just below the
      // left side of the title.
      const nav = document.getElementById("genre-nav")?.getBoundingClientRect();
      const L = trailLeft(box, amp);
      let end: Pt;
      if (nav) {
        const ex = L; // land straight below the left run, so there is no sideways kink
        const u = (ex - (nav.left + nav.width / 2)) / (nav.width / 2);
        end = { x: ex, y: nav.top + sy + 1 + navArch(nav.width) * u * u - 3 };
      } else {
        end = { x: L, y: wr.bottom + sy };
      }

      const next: TrailGeo = {
        W: vw,
        H: Math.round(Math.max(end.y, wr.bottom + sy) + 24),
        top: Math.round(wr.top + sy),
        left: Math.round(wr.left),
        origin: { x: Math.round(origin.x), y: Math.round(origin.y) },
        end: { x: Math.round(end.x), y: Math.round(end.y) },
        box: {
          left: Math.round(box.left),
          top: Math.round(box.top),
          right: Math.round(box.right),
          bottom: Math.round(box.bottom),
        },
        amp,
      };
      setGeo((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    document.fonts?.ready.then(measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [navKey]);

  // Prepare the curves and the letters (again once fonts have really loaded).
  useEffect(() => {
    if (!trail) return;
    lutsRef.current = trail.rowPts.map((p) => buildLut(densify(p, 4)));
    let alive = true;
    const build = () => {
      if (!alive) return;
      fontsRef.current = trailFonts();
      glyphRowsRef.current = buildGlyphRows(
        items,
        lutsRef.current.map((l) => l.len),
        fontsRef.current
      );
    };
    build();
    document.fonts?.ready.then(build);
    document.fonts?.addEventListener("loadingdone", build);
    return () => {
      alive = false;
      document.fonts?.removeEventListener("loadingdone", build);
    };
  }, [trail, items]);

  // The animation loop: draws the trail and moves the lens.
  useEffect(() => {
    const canvas = baseCanvasRef.current;
    const lensCanvas = lensCanvasRef.current;
    const lensEl = lensRef.current;
    const wrap = wrapRef.current;
    if (!trail || !geo || !canvas || !lensCanvas || !lensEl || !wrap) return;
    const ctx = canvas.getContext("2d");
    const lctx = lensCanvas.getContext("2d");
    if (!ctx || !lctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cs = getComputedStyle(document.documentElement);
    const colMuted = cs.getPropertyValue("--text-muted").trim() || "#9a9a9a";
    const colText = cs.getPropertyValue("--text").trim() || "#f5f5f5";
    const colPink = cs.getPropertyValue("--pink").trim() || "#fe81d4";

    const R = TRAIL_LENS / 2;
    const reach2 = (R / TRAIL_ZOOM + 20) ** 2;

    // scratch space for the letters that are on screen this frame (for the lens)
    const maxVis = 8000;
    const vx = new Float32Array(maxVis);
    const vy = new Float32Array(maxVis);
    const vtx = new Float32Array(maxVis);
    const vty = new Float32Array(maxVis);
    const va = new Float32Array(maxVis);
    const vrow = new Uint8Array(maxVis);
    const vidx = new Int32Array(maxVis);

    let raf = 0;
    let last = 0;
    let drawnRows: GlyphRow[] | null = null;

    const frame = (now: number) => {
      // advance our clock by the real time between frames (capped, so a
      // background-tab pause can never cause a big jump)
      if (!reduce) {
        clockRef.current += last ? Math.min((now - last) / 1000, 0.05) : 0;
      }
      last = now;
      const clock = clockRef.current;
      const rows = glyphRowsRef.current;
      const luts = lutsRef.current;

      // Reveal: the fume front travels from the button to the genre bar over ~5s.
      // f is how far it has got (it overshoots 1 so the wobble settles everywhere).
      const f = reduce ? 3 : easeInOut(Math.min(1, Math.max(0, (clock - 0.3) / 5.2))) * 1.5;

      // skip all drawing while the trail is scrolled off screen
      const wr = wrap.getBoundingClientRect();
      const onScreen = wr.bottom > -80 && wr.top < window.innerHeight + 400;
      const skip = !onScreen || (reduce && drawnRows === rows);

      if (!skip) {
        drawnRows = rows;

        // lens position: slides back and forth along the trail
        const u = 0.5 + 0.3 * Math.sin(clock * 0.4);
        const c = trailPointAt(trail.center, u);
        const cx = c.x;
        const cy = c.y + 4 * Math.sin(clock * 0.9 + 1);
        lensEl.style.transform = `translate(${cx - R}px, ${cy - R}px)`;
        lensEl.style.opacity = String(smoothstep(0.7, 1.15, f));

        // ---- the trail ----
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = colMuted;
        ctx.textBaseline = "alphabetic";
        const fonts = fontsRef.current;
        let nv = 0;

        for (let r = 0; r < rows.length && r < luts.length; r++) {
          const row = rows[r];
          const lut = luts[r];
          const speed = 115 + r * 12; // px per second; each line a touch different
          const phase = (clock * speed) % row.P;
          let j = 0;
          let curKind = -1;

          for (let i = 0; i < row.n; i++) {
            const s = row.off[i] + row.w[i] * 0.5 - phase;
            if (s < 0) continue;
            if (s > lut.len) break;

            // 0 at the button, 1 at the genre bar
            const q = 1 - s / lut.len;
            const behind = f - q; // how far behind the fume front this letter is
            if (behind <= 0) continue;

            const a =
              smoothstep(0, 0.1, q) *
              (1 - smoothstep(0.88, 1, q)) *
              smoothstep(0, 0.14, behind);
            if (a < 0.02) continue;

            while (j < lut.n - 2 && lut.cum[j + 1] < s) j++;
            const seg = lut.cum[j + 1] - lut.cum[j] || 1;
            const k = (s - lut.cum[j]) / seg;
            let x = lut.x[j] + (lut.x[j + 1] - lut.x[j]) * k;
            let y = lut.y[j] + (lut.y[j + 1] - lut.y[j]) * k;
            let tx = lut.tx[j] + (lut.tx[j + 1] - lut.tx[j]) * k;
            let ty = lut.ty[j] + (lut.ty[j + 1] - lut.ty[j]) * k;
            const tl = Math.hypot(tx, ty) || 1;
            tx /= tl;
            ty /= tl;

            // smoke: letters near the front sway sideways, then settle; a
            // gentle sway stays near the button where the fume comes out
            const wob =
              7 * (1 - smoothstep(0, 0.3, behind)) * Math.sin(q * 40 + clock * 5 + r * 1.7) +
              3 * (1 - smoothstep(0, 0.18, q)) * Math.sin(q * 30 - clock * 2.5 + r * 2.1);
            x += ty * wob;
            y -= tx * wob;

            const ch = row.ch[i];
            if (ch === " ") continue;

            const kind = row.kind[i];
            if (kind !== curKind) {
              curKind = kind;
              ctx.font = kind ? fonts.title : fonts.line;
            }
            ctx.globalAlpha = a * 0.6;
            ctx.setTransform(dpr * tx, dpr * ty, -dpr * ty, dpr * tx, dpr * x, dpr * y);
            ctx.fillText(ch, -row.w[i] * 0.5, 0);

            if (nv < maxVis) {
              vx[nv] = x;
              vy[nv] = y;
              vtx[nv] = tx;
              vty[nv] = ty;
              va[nv] = a;
              vrow[nv] = r;
              vidx[nv] = i;
              nv++;
            }
          }
        }
        ctx.globalAlpha = 1;

        // ---- inside the lens: the same letters, magnified and brighter ----
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.clearRect(0, 0, lensCanvas.width, lensCanvas.height);
        lctx.textBaseline = "alphabetic";
        let lk = -1;
        for (let v = 0; v < nv; v++) {
          const dx = vx[v] - cx;
          const dy = vy[v] - cy;
          if (dx * dx + dy * dy > reach2) continue;
          const row = rows[vrow[v]];
          const i = vidx[v];
          const kind = row.kind[i];
          if (kind !== lk) {
            lk = kind;
            lctx.font = kind ? fonts.title : fonts.line;
            lctx.fillStyle = kind ? colPink : colText;
          }
          const z = dpr * TRAIL_ZOOM;
          lctx.globalAlpha = va[v];
          lctx.setTransform(
            z * vtx[v],
            z * vty[v],
            -z * vty[v],
            z * vtx[v],
            dpr * (dx * TRAIL_ZOOM + R),
            dpr * (dy * TRAIL_ZOOM + R)
          );
          lctx.fillText(row.ch[i], -row.w[i] * 0.5, 0);
        }
        lctx.globalAlpha = 1;
      }

      if (!reduce || drawnRows !== glyphRowsRef.current) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [trail, geo]);

  // the overlay covers the whole page width, from the very top of the page
  const layer: React.CSSProperties | undefined = geo
    ? { top: -geo.top, left: -geo.left, width: geo.W, height: geo.H }
    : undefined;
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

  return (
    <div ref={wrapRef} className="relative">
      {/* the trail itself, behind the header */}
      {geo && trail && (
        <div
          aria-hidden="true"
          className="absolute z-[1] pointer-events-none select-none"
          style={layer}
        >
          <canvas
            ref={baseCanvasRef}
            width={Math.round(geo.W * dpr)}
            height={Math.round(geo.H * dpr)}
            style={{ width: geo.W, height: geo.H, display: "block" }}
          />
        </div>
      )}

      <div className="relative z-10">
        {/* room under the buttons where the fume first appears */}
        <div className="h-28 sm:h-32" />
        {children}
      </div>

      {/* the magnifying glass, above everything in the header */}
      {geo && trail && (
        <div
          aria-hidden="true"
          className="absolute z-20 pointer-events-none select-none"
          style={layer}
        >
          <div
            ref={lensRef}
            className="absolute left-0 top-0"
            style={{
              width: TRAIL_LENS,
              height: TRAIL_LENS,
              willChange: "transform",
              opacity: 0,
            }}
          >
            <div
              className="absolute inset-0 rounded-full overflow-hidden"
              style={{
                background: "var(--bg)",
                boxShadow:
                  "0 0 0 3px var(--pink), 0 10px 24px rgba(254,129,212,0.28)",
              }}
            >
              <canvas
                ref={lensCanvasRef}
                width={Math.round(TRAIL_LENS * dpr)}
                height={Math.round(TRAIL_LENS * dpr)}
                style={{ width: TRAIL_LENS, height: TRAIL_LENS, display: "block" }}
              />
            </div>
            {/* handle */}
            <div
              className="absolute"
              style={{
                left: TRAIL_LENS * 0.86,
                top: TRAIL_LENS * 0.86,
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
      )}
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
const NAV_H = 56; // height of the genre strip (px)

// how far the ends of the genre bar drop below its middle (px); shared with the text trail
function navArch(W: number) {
  return Math.round(Math.min(56, Math.max(18, W * 0.04)));
}

// An exact parabola as a quadratic bezier: ends sit `arch` px lower than the
// middle, so the strip bows upward like a rainbow.
function archPath(W: number, y: number, arch: number) {
  return `M 0 ${y + arch} Q ${W / 2} ${y - arch} ${W} ${y + arch}`;
}

function MovingGenreBar({
  options,
  active,
  onSelect,
}: {
  options: FilterOption[];
  active: string | null;
  onSelect: (key: string | null) => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  const linesRef = useRef<SVGSVGElement>(null);
  const revealStartRef = useRef<number | null>(null); // when the fume reaches the bar
  const revealDoneRef = useRef(false);
  const [W, setW] = useState(1200);
  // nothing to show until the genres have loaded (just "ALL" repeated looks broken)
  const hasBar = options.length >= 2;
  // how much the ends drop; scales with screen width so phones stay gentle
  const arch = navArch(W);
  const H = NAV_H + arch + 4;

  // track the bar's width
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => setW(nav.offsetWidth || window.innerWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [hasBar]);

  // Fume entrance, part 1: hide the genres before the first paint, so they
  // don't flash on screen before the smoke reaches them.
  useLayoutEffect(() => {
    if (!hasBar || revealDoneRef.current) return;
    const nav = navRef.current;
    if (!nav) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      revealDoneRef.current = true;
      return;
    }
    nav.querySelectorAll<HTMLElement>(".musings-navitem").forEach((el) => {
      el.style.opacity = "0";
    });
    if (linesRef.current) linesRef.current.style.opacity = "0";
  }, [hasBar, options.length]);

  // Every frame: lift each genre onto the arch and tilt it to follow the
  // curve. The buttons stay real buttons, so clicking still works.
  //
  // Fume entrance, part 2: right after the text trail reaches the bar, the
  // genres appear from left to right as if the smoke is flowing along it. Each
  // one starts blurred, faint and swaying, then settles.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const items = Array.from(nav.querySelectorAll<HTMLElement>(".musings-navitem"));
    let raf = 0;

    const frame = () => {
      const nr = nav.getBoundingClientRect();
      const half = nr.width / 2;
      const mid = nr.left + half;
      const xs = items.map((el) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      });
      // how far the smoke front has got along the bar (0 = left edge, 1 = right edge)
      let prog = 2;
      const nowS = performance.now() / 1000;
      const revealing = !revealDoneRef.current;
      if (revealing) {
        // the trail reaches the bar about 3.4s after load, so start just before that
        if (revealStartRef.current === null) revealStartRef.current = Math.max(3.1, nowS);
        const p = Math.max(0, (nowS - revealStartRef.current) / 2.6);
        prog = easeInOut(Math.min(1, p)) * 1.3; // overshoots 1 so everything settles
        if (linesRef.current) linesRef.current.style.opacity = smoothstep(0, 0.35, prog).toFixed(3);
        if (p >= 1) revealDoneRef.current = true;
      }

      items.forEach((el, i) => {
        const cx = xs[i];
        if (cx < nr.left - 300 || cx > nr.right + 300) return;
        const u = (cx - mid) / half;
        let dy = arch * u * u;
        let ang = (Math.atan((2 * arch * u) / half) * 180) / Math.PI;
        if (revealing) {
          const xn = (cx - nr.left) / nr.width;
          const behind = prog - xn; // how far behind the smoke front this genre is
          const settle = 1 - smoothstep(0, 0.3, behind);
          el.style.opacity = smoothstep(0, 0.12, behind).toFixed(3);
          const blur = 7 * (1 - smoothstep(0, 0.25, behind));
          el.style.filter = blur > 0.15 ? `blur(${blur.toFixed(2)}px)` : "none";
          dy += settle * 9 * Math.sin(xn * 28 + nowS * 5);
          ang += settle * 6 * Math.sin(xn * 19 - nowS * 4);
        }
        el.style.transform = `translateY(${dy}px) rotate(${ang}deg)`;
      });

      // finished: hand control back to normal styling
      if (revealing && revealDoneRef.current) {
        items.forEach((el) => {
          el.style.opacity = "";
          el.style.filter = "";
        });
        if (linesRef.current) linesRef.current.style.opacity = "";
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hasBar, W, arch, options.length]);

  if (!hasBar) return null;

  // repeat the list so one copy is always wider than the screen
  const repeat = Math.max(2, Math.ceil(24 / options.length));
  const loop = Array.from({ length: repeat }).flatMap(() => options);
  const duration = Math.max(24, loop.length * 3);

  const fade =
    "linear-gradient(to right, transparent, black 6%, black 94%, transparent)";

  return (
    <nav
      ref={navRef}
      id="genre-nav"
      aria-label="Genres"
      className="musings-navwrap relative overflow-hidden mb-8 sm:mb-10 w-screen ml-[calc(50%-50vw)]"
      style={{
        height: H,
        maskImage: fade,
        WebkitMaskImage: fade,
      }}
    >
      {/* the two hairlines, bent into the same arch as the words */}
      <svg
        ref={linesRef}
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ overflow: "visible" }}
      >
        <path d={archPath(W, 1, arch)} fill="none" stroke="var(--text)" strokeWidth="1" />
        <path
          d={archPath(W, 1 + NAV_H, arch)}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1"
        />
      </svg>

      <div
        className="musings-marquee absolute left-0 w-max"
        style={{
          top: 1,
          ["--dur" as string]: `${duration}s`,
        } as React.CSSProperties}
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
                  className={`musings-navitem font-display text-lg sm:text-2xl tracking-[0.08em] px-6 whitespace-nowrap flex items-center transition-colors duration-300 ${
                    isActive ? "is-on" : ""
                  }`}
                  style={{
                    height: NAV_H,
                    color: isActive ? "var(--pink)" : "var(--text-muted)",
                  }}
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

// ---------------------------------------------------------------------------
// Top-left hover dropdowns ("CITIES" and "PEOPLE"). They open on hover on a
// mouse, on tap on a phone, and close on Escape or a tap elsewhere.
// ---------------------------------------------------------------------------
const CITIES = [
  "Mexico",
  "Sydney",
  "Bristol",
  "Bharatpur (Chitwan)",
  "Mumbai",
  "Kolkata",
  "Mirik ( Darjeeling )",
  "Kathmandu",
  "San Francisco",
  "Lalitpur",
];

const PEOPLE = [
  "National Geographic",
  "Amazon Prime",
  "Netflix",
  "POPxo",
  "Jugaad Motion Pictures",
  "Coke Studio Bharat",
  "Myntra",
  "Fujifilm",
  "Astro Boyz Crew",
];

function NavDropdown({
  label,
  title,
  items,
  footer,
}: {
  label: string;
  title: string;
  items: string[];
  footer: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const hoverOpened = useRef(false);
  const canHover = () => window.matchMedia("(hover: hover)").matches;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={boxRef}
      className="relative"
      onMouseEnter={() => {
        if (canHover()) {
          hoverOpened.current = true;
          setOpen(true);
        }
      }}
      onMouseLeave={() => {
        if (canHover()) {
          hoverOpened.current = false;
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          // a click right after a hover-open should not close it again
          setOpen((o) => (hoverOpened.current ? true : !o));
          hoverOpened.current = false;
        }}
        className={`font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-white shadow-md transition whitespace-nowrap ${
          open ? "bg-white text-black" : "bg-black text-white hover:bg-white hover:text-black"
        }`}
      >
        {label}
      </button>

      {/* the padding at the top keeps the panel "attached" so the hover doesn't drop */}
      <div
        aria-hidden={!open}
        className={`absolute left-0 top-full pt-3 z-50 transition-all duration-200 ${
          open
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-1 pointer-events-none"
        }`}
      >
        <div className="w-60 sm:w-80 max-w-[85vw] rounded-3xl border-2 border-white bg-black px-5 py-4 shadow-xl">
          <p
            className="font-display tracking-[0.12em] text-sm sm:text-base mb-3"
            style={{ color: "var(--pink)" }}
          >
            {title}
          </p>
          <ul className="font-body text-sm sm:text-base text-white leading-relaxed">
            {items.map((it) => (
              <li key={it} className="flex gap-2">
                <span aria-hidden="true" style={{ color: "var(--green)" }}>
                  •
                </span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
          <p
            className="font-body italic text-sm sm:text-base mt-3"
            style={{ color: "var(--text-muted)" }}
          >
            {footer}
          </p>
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

      {/* Top-left nav: hover dropdowns for the cities and the people we've covered */}
      <div className="fixed top-3 left-3 sm:top-5 sm:left-6 z-50 flex items-start gap-1.5 sm:gap-4">
        <NavDropdown
          label="CITIES"
          title="CITIES WE'VE COVERED"
          items={CITIES}
          footer="& more to come :)"
        />
        <NavDropdown
          label="PEOPLE"
          title="PEOPLE ASSOCIATED WITH"
          items={PEOPLE}
          footer="& many more talented individuals :)"
        />
      </div>

      {/* Top-right nav: About + Contact + Subscribe — fixed so it always sits above the photo cluster and everything else.
          Sized down on mobile so three buttons never overflow a narrow viewport. */}
      <div className="fixed top-3 right-3 sm:top-5 sm:right-6 z-50 flex items-center gap-1.5 sm:gap-4">
        <Link
          href="/about"
          className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-white bg-black text-white shadow-md transition hover:bg-white hover:text-black whitespace-nowrap"
        >
          ABOUT
        </Link>

        <button
          id="subscribe-btn"
          onClick={() => setShowSubscribe(true)}
          className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-white bg-white text-black shadow-md transition hover:bg-black hover:text-white whitespace-nowrap"
        >
          SUBSCRIBE
        </button>

        <Link
          href="/contact"
          className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-white bg-black text-white shadow-md transition hover:bg-white hover:text-black whitespace-nowrap"
        >
          CONTACT
        </Link>
      </div>

      {/* Text trail: pours out of SUBSCRIBE, snakes behind the header, flows into the genre bar */}
      <TextTrail pieces={allPieces} navKey={genres.length}>
      <header className="relative mb-2 px-2 sm:px-6 py-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
          {/* Mobile min-height trimmed from 150px to 100px — it was reserving
              more vertical space than the title actually needs on narrow
              screens, which pushed "AN INDEPENDENT MAGAZINE" down and created
              a large visible gap under the title. Desktop (sm:) height is
              unchanged since that layout already looked right. See also the
              matching min-h change inside IntroTitle.tsx itself. */}
          <div
            id="title-block"
            className="relative max-w-full min-h-[100px] sm:min-h-[230px] flex flex-col justify-center"
          >
            {intro === "play" && <KineticIntro />}
            <div
              key={intro}
              style={{ visibility: intro === "done" ? "visible" : "hidden" }}
            >
              <IntroTitle />
            </div>
            <p
              className="font-display text-lg sm:text-2xl md:text-4xl tracking-[0.2em] sm:tracking-[0.25em] text-center mt-3"
              style={{
                color: "var(--pink)",
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
      </TextTrail>

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
                      className="font-display text-sm sm:text-base tracking-wide px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full inline-block mb-4"
                      style={{ color: "#111", background: cardColor }}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 sm:px-6"
          onClick={() => setShowSubscribe(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border-2 border-white bg-black p-6 sm:p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowSubscribe(false)}
              className="absolute top-4 right-4 font-display text-sm text-white"
              aria-label="Close"
            >
              ✕
            </button>

            <h3 className="font-accent text-2xl sm:text-3xl mb-2 text-white">Subscribe</h3>
            <p className="font-body text-sm text-white/70 mb-6">
              New pieces, straight to your inbox. No spam, unsubscribe anytime.
            </p>

            {subscribeStatus === "success" ? (
              <p className="font-body text-white">You&apos;re in — thanks for subscribing!</p>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full font-body px-4 py-3 rounded-full border-2 border-white bg-transparent outline-none text-white placeholder:text-white/50"
                  disabled={subscribeStatus === "loading"}
                />
                {subscribeError && (
                  <p className="text-red-500 text-sm">{subscribeError}</p>
                )}
                <button
                  type="submit"
                  disabled={subscribeStatus === "loading"}
                  className="font-display text-sm tracking-wide px-4 py-3 rounded-full border-2 border-white bg-white text-black transition hover:bg-black hover:text-white disabled:opacity-50"
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











