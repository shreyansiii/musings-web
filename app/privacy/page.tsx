import Link from "next/link";

export const metadata = {
  title: "Privacy Policy | Musings by Shreyansi",
};

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 sm:pt-24 pb-16 sm:pb-24">
      {/* Top-right nav */}
      <div className="fixed top-3 right-3 sm:top-5 sm:right-6 z-50 flex items-center gap-1.5 sm:gap-4">
        <Link
          href="/"
          className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-white bg-white text-black shadow-md transition hover:bg-black hover:text-white whitespace-nowrap"
        >
          HOME
        </Link>
        <Link
          href="/contact"
          className="font-display text-xs sm:text-base tracking-wide px-3 py-1.5 sm:px-6 sm:py-3 rounded-full border-2 border-white bg-black text-white shadow-md transition hover:bg-white hover:text-black whitespace-nowrap"
        >
          CONTACT
        </Link>
      </div>

      <h1
        className="font-accent text-5xl sm:text-6xl md:text-7xl mb-4 sm:mb-6 break-words"
        style={{ color: "var(--green)" }}
      >
        Privacy
      </h1>
      <p
        className="font-body text-base sm:text-lg leading-relaxed mb-8"
        style={{ color: "var(--text-muted)" }}
      >
        Last updated: November 2026
      </p>

      <div
        className="font-body text-base sm:text-lg leading-relaxed space-y-6"
        style={{ color: "var(--text)" }}
      >
        <p>
          Musings by Shreyansi is an independent magazine. This page explains,
          in plain words, what information the website collects and what we do
          with it.
        </p>

        <section>
          <h2 className="font-display text-2xl tracking-wide mb-2" style={{ color: "var(--pink)" }}>
            WHAT WE COLLECT
          </h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong>Contact form:</strong> the name, email address and message
              you type in, so we can read and reply to you.
            </li>
            <li>
              <strong>Newsletter:</strong> the email address you enter when you
              subscribe, so we can send you new pieces.
            </li>
          </ul>
          <p className="mt-3">
            We do not ask for passwords, payment details or any other personal
            information, and we do not use advertising trackers.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl tracking-wide mb-2" style={{ color: "var(--pink)" }}>
            HOW WE USE IT
          </h2>
          <p>
            Messages are used only to respond to you. Newsletter addresses are
            used only to email you new pieces from the magazine. We never sell,
            rent or share your information with anyone else.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl tracking-wide mb-2" style={{ color: "var(--pink)" }}>
            EMAIL
          </h2>
          <p>
            The site sends emails (for example, forwarding a contact message to
            the magazine&apos;s inbox) through the magazine&apos;s own Google
            account. It only sends email from that account. It does not read,
            access or store the email of visitors or readers.
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl tracking-wide mb-2" style={{ color: "var(--pink)" }}>
            STORAGE AND YOUR CHOICES
          </h2>
          <p>
            Your details are stored on the magazine&apos;s server for as long as
            they are needed for the purposes above. You can unsubscribe from the
            newsletter at any time, and you can ask us to delete your
            information by using the{" "}
            <Link href="/contact" className="underline" style={{ color: "var(--pink)" }}>
              contact page
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="font-display text-2xl tracking-wide mb-2" style={{ color: "var(--pink)" }}>
            CHANGES
          </h2>
          <p>
            If this policy changes, the new version will be posted on this page
            with a new date.
          </p>
        </section>
      </div>
    </main>
  );
}