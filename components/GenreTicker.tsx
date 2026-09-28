"use client";

type TickerItem = { label: string; slug: string };

export default function GenreTicker({
  items,
  activeSlug,
  onSelect,
  speed = 40, // seconds for one full loop; higher = slower
}: {
  items: TickerItem[];
  activeSlug: string | null;
  onSelect: (slug: string | null) => void;
  speed?: number;
}) {
  if (items.length === 0) return null;

  // Repeat the list so one group is always wider than the screen,
  // then render two identical groups for a seamless -50% loop.
  const group = [...items, ...items, ...items];

  const renderGroup = (hidden: boolean) => (
    <div className="ticker-group" aria-hidden={hidden}>
      {group.map((item, i) => {
        const active = activeSlug === item.slug;
        return (
          <span key={`${item.slug}-${i}`} className="ticker-item">
            <button
              type="button"
              tabIndex={hidden ? -1 : 0}
              onClick={() => onSelect(active ? null : item.slug)}
              className="ticker-btn font-display"
              style={{ color: "var(--text)", opacity: active ? 1 : 0.6 }}
            >
              {item.label.toUpperCase()}
            </button>
            <span
              className="ticker-dot"
              style={{ color: "var(--text)" }}
              aria-hidden="true"
            >
              ·
            </span>
          </span>
        );
      })}
    </div>
  );

  const lineColor =
    "color-mix(in srgb, var(--text-muted) 45%, transparent)";

  return (
    <div
      className="ticker-wrap my-6 sm:my-8"
      style={{
        borderTop: `1px solid ${lineColor}`,
        borderBottom: `1px solid ${lineColor}`,
      }}
    >
      <div className="ticker-track" style={{ animationDuration: `${speed}s` }}>
        {renderGroup(false)}
        {renderGroup(true)}
      </div>

      <style>{`
        .ticker-wrap {
          overflow: hidden;
          padding: 14px 0;
          -webkit-mask-image: linear-gradient(to right, transparent, #000 8%, #000 92%, transparent);
          mask-image: linear-gradient(to right, transparent, #000 8%, #000 92%, transparent);
        }
        .ticker-track {
          display: flex;
          width: max-content;
          animation-name: ticker-scroll;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        .ticker-wrap:hover .ticker-track {
          animation-play-state: paused;
        }
        .ticker-group {
          display: flex;
          flex-shrink: 0;
          align-items: center;
        }
        .ticker-item {
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
        }
        .ticker-btn {
          font-size: 0.95rem;
          letter-spacing: 0.25em;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          transition: opacity 0.2s ease;
        }
        .ticker-btn:hover {
          opacity: 1 !important;
        }
        .ticker-dot {
          margin: 0 2.25rem;
          opacity: 0.4;
        }
        @media (min-width: 640px) {
          .ticker-btn { font-size: 1.05rem; }
        }
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ticker-track { animation: none; }
        }
      `}</style>
    </div>
  );
}