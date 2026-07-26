"use client";

import { useEffect, useRef, useState } from "react";
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

export default function HomePage() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [pieces, setPieces] = useState<ContentPiece[]>([]);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    setLoading(true);
    if (searchQuery.trim()) {
      searchContentPieces(searchQuery.trim())
        .then((data) => {
          setPieces(data);
          setLoading(false);
        })
        .catch(() => {
          setError("Search failed. Is the backend awake?");
          setLoading(false);
        });
      return;
    }
    getContentPieces(activeGenre ?? undefined)
      .then((data) => {
        setPieces(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load content. Is the backend awake?");
        setLoading(false);
      });
  }, [activeGenre, searchQuery]);

  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const COLUMNS = 3; // matches the lg:grid-cols-3 below, used to compute row parity

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

    const tick = () => {
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const raw = (triggerStart - rect.top) / triggerRange;
        const linear = Math.min(Math.max(raw, 0), 1);
        // Ease-in cubic: gentle at first, so the mid-transition doesn't
        // look like an abrupt flip — the card eases into the spiral instead.
        const progress = linear * linear * linear;

        const row = Math.floor(i / COLUMNS);
        const col = i % COLUMNS;
        const rowIsOdd = row % 2 === 1;

        // Middle column: shrink only, no rotation, same on every row.
        // Left/right columns: spin opposite directions, and that pairing
        // flips depending on whether the row is odd or even.
        let direction = 0;
        if (col === 0) direction = rowIsOdd ? -1 : 1; // left column
        if (col === COLUMNS - 1) direction = rowIsOdd ? 1 : -1; // right column

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
  }, [pieces]);

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
    <main className="max-w-6xl mx-auto px-6 pt-22 pb-16">
      {/* Top-right nav: About + Subscribe — fixed so it always sits above the photo cluster and everything else */}
      {/* Top-right nav: About + Contact + Subscribe — fixed so it always sits above the photo cluster and everything else */}
<div className="fixed top-5 right-6 z-50 flex items-center gap-4">
  <Link
    href="/about"
    className="font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white"
  >
    ABOUT
  </Link>

  <button
    onClick={() => setShowSubscribe(true)}
    className="font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-black text-white shadow-md transition hover:bg-white hover:text-black"
  >
    SUBSCRIBE
  </button>

  <Link
    href="/contact"
    className="font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white"
  >
    CONTACT
  </Link>
  
</div>

      <header className="relative mb-6 px-6 py-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-10">
          <div>
            <h1
              className="relative z-10 font-accent text-7xl sm:text-8xl text-center"
              style={{ color: "var(--green)" }}
            >
              MUSINGS by Shreyansi
            </h1>
           <p
  className="font-display text-[1.8rem] tracking-widest text-center mt-2"
  style={{ color: "var(--text-muted)" }}
>
  AN INDEPENDENT MAGAZINE
</p>
          </div>

          {/* Scattered scrapbook-style photo cluster */}
          <div className="relative" style={{ width: 300, height: 260 }}>
            <img
              src="/hero-portrait.png"
              alt="Hand-drawn portrait illustration"
              className="absolute shadow-lg"
              style={{
                width: 130,
                border: "2px solid var(--border)",
                borderRadius: "50% 48% 52% 49% / 52% 50% 50% 48%",
                transform: "rotate(-8deg)",
                left: 0,
                top: 10,
                zIndex: 1,
              }}
            />
            <img
              src="/hero-shadow.png"
              alt="Shadow silhouette photograph"
              className="absolute rounded-xl shadow-lg"
              style={{
                width: 120,
                border: "4px solid white",
                boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
                transform: "rotate(6deg)",
                left: 150,
                top: 0,
                zIndex: 2,
              }}
            />
            <img
              src="/hero-mirror.png"
              alt="Mirror self-portrait photograph"
              className="absolute rounded-xl shadow-lg"
              style={{
                width: 110,
                border: "4px solid white",
                boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
                transform: "rotate(-4deg)",
                left: 100,
                top: 140,
                zIndex: 3,
              }}
            />
          </div>
        </div>
      </header>

      <div className="max-w-xl mx-auto mb-10 relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full font-body text-lg px-5 py-3 rounded-full border-2 outline-none focus:border-current transition relative bg-transparent"
          style={{
            borderColor: "var(--pink)",
            color: "var(--text)",
            background: "var(--surface)",
          }}
        />
        {searchQuery.length === 0 && (
          <span
            className="font-body text-lg absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none select-none"
            style={{ color: "var(--text-muted)" }}
          >
            {animatedPlaceholder}
            <span className="animate-pulse">|</span>
          </span>
        )}
      </div>

      {error && <p className="text-red-500 mb-6">{error}</p>}

      <div className="flex flex-wrap justify-center gap-3 mb-12">
        <button
          onClick={() => setActiveGenre(null)}
          className="font-display text-base tracking-wide px-5 py-2 rounded-full border-2 transition"
          style={{
            borderColor: activeGenre === null ? "var(--text)" : "var(--border)",
            color: "var(--text)",
          }}
        >
          ALL
        </button>
        {genres.map((genre, i) => {
          const active = activeGenre === genre.slug;
          const btnColor = genreColor(i);
          return (
            <button
              key={genre.id}
              onClick={() => setActiveGenre(genre.slug)}
              className="font-display text-base tracking-wide px-5 py-2 rounded-full border-2 transition"
              style={{
                borderColor: active ? btnColor : "var(--border)",
                color: active ? btnColor : "var(--text-muted)",
                background: active ? "var(--surface)" : "transparent",
              }}
            >
              {genre.name.toUpperCase()}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p
          className="font-accent text-2xl text-center"
          style={{ color: "var(--text-muted)" }}
        >
          loading…
        </p>
      ) : pieces.length === 0 ? (
        <p
          className="font-accent text-2xl text-center"
          style={{ color: "var(--text-muted)" }}
        >
          nothing published here yet.
        </p>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {pieces.map((piece, i) => {
            const cardColor = genreColor(i);
            const preview = piece.excerpt?.trim() ?? "";
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
                      className="w-full h-48 object-cover"
                    />
                  )}
                  <div className="p-6">
                    <span
                      className="font-display text-sm tracking-wide px-3 py-1.5 rounded-full inline-block mb-3"
                      style={{ color: "white", background: cardColor }}
                    >
                      {piece.genre.name.toUpperCase()} · {piece.content_type.toUpperCase()}
                    </span>
                    <h2 className="font-display text-3xl leading-snug">{piece.title}</h2>
                    {piece.subtitle && (
                      <p className="text-lg mt-1" style={{ color: "var(--text-muted)" }}>
                        {piece.subtitle}
                      </p>
                    )}
                  </div>
                </div>

                {preview.length > 0 && (
                  <div
                    className="absolute left-1/2 w-72 z-20 opacity-0 scale-95 pointer-events-none
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => setShowSubscribe(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border-2 border-black bg-white p-8 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowSubscribe(false)}
              className="absolute top-4 right-4 font-display text-sm text-black"
              aria-label="Close"
            >
              ✕
            </button>

            <h3 className="font-accent text-3xl mb-2 text-black">Subscribe</h3>
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


