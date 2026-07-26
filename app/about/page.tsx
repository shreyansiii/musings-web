"use client";

import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 pt-20 pb-24">
      {/* Top-right nav: Home + Contact */}
      <div className="fixed top-5 right-6 z-50 flex items-center gap-4">
        <Link
          href="/"
          className="font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white"
        >
          HOME
        </Link>
        <Link
          href="/contact"
          className="font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white"
        >
          CONTACT
        </Link>
      </div>

      <h1
        className="font-accent text-6xl sm:text-7xl mb-8"
        style={{ color: "var(--green)" }}
      >
        About
      </h1>

      <div className="flex flex-col sm:flex-row gap-10 items-start mb-12">
        <img
          src="/hero-portrait.png"
          alt="Shreyansi portrait illustration"
          className="shadow-lg"
          style={{
            width: 160,
            border: "2px solid var(--border)",
            borderRadius: "50% 48% 52% 49% / 52% 50% 50% 48%",
            transform: "rotate(-6deg)",
          }}
        />

        <div className="flex-1">
          <p
            className="font-body text-lg leading-relaxed"
            style={{ color: "var(--text)" }}
          >
            Every mind is unique. Every feeling is real and valid. Every story counts & every journey matters. 'MUSINGS by Shreyansi' is an independent magazine that gives all those thoughts inside your brain a place to belong, call it a home for your brain !
          </p>
          <p
            className="font-body text-lg leading-relaxed mt-4"
            style={{ color: "var(--text)" }}
          >
             Embracing flawed & flaws to curate the unimagined, featuring everybody & everything, just stories worth sitting with. Cheers to the adventure !
          </p>
        </div>
      </div>
{/* 
      <div className="grid sm:grid-cols-3 gap-6 mb-12">
        {[
          { label: "STYLE", color: "var(--pink)" },
          { label: "Street", color: "var(--green)" },
          { label: "Music", color: "var(--pink)" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-3xl border-2 p-6 text-center"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <span
              className="font-display text-lg tracking-wide"
              style={{ color: item.color }}
            >
              {item.label.toUpperCase()}
            </span>
          </div>
        ))}
      </div> */}

      <p
        className="font-body text-xl leading-relaxed"
        style={{ color: "var(--text-muted)" }}
      >
        Want to collaborate, or just say hello?{" "}
        <Link
          href="/contact"
          className="underline font-display"
          style={{ color: "var(--text)" }}
        >
          Get in touch
        </Link>
        .
      </p>
    </main>
  );
}