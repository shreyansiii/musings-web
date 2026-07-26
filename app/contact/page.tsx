"use client";

import { useState } from "react";
import Link from "next/link";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim() || status === "loading")
      return;

    setStatus("loading");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/contact/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });

      if (!res.ok) throw new Error("Request failed");

      setStatus("success");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setStatus("error");
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-6 pt-20 pb-24">
      {/* Top-right nav: Home + About */}
      <div className="fixed top-5 right-6 z-50 flex items-center gap-4">
        <Link
          href="/"
          className="font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white"
        >
          HOME
        </Link>
        <Link
          href="/about"
          className="font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-black text-white shadow-md transition hover:bg-white hover:text-black"
        >
          ABOUT
        </Link>
      </div>

      <h1
        className="font-accent text-7xl sm:text-8xl mb-6"
        style={{ color: "var(--green)" }}
      >
        Contact
      </h1>
      <p
        className="font-body text-xl leading-relaxed mb-12"
        style={{ color: "var(--text-muted)" }}
      >
        Got a pitch, a piece to share, or just want to say hi? Drop a note
        below.
      </p>

      {status === "success" ? (
        <div
          className="rounded-3xl border-2 border-black p-10 text-center"
          style={{ background: "var(--surface)" }}
        >
          <p className="font-accent text-3xl" style={{ color: "var(--text)" }}>
            Message sent!
          </p>
          <p
            className="font-body text-lg mt-3"
            style={{ color: "var(--text-muted)" }}
          >
            Thanks for reaching out — we'll get back to you soon.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-7">
          <div>
            <label
              className="block font-display text-lg tracking-wide mb-3"
              style={{ color: "var(--text)" }}
            >
              NAME
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full font-body text-xl px-7 py-5 rounded-full border-2 border-black outline-none text-black"
              disabled={status === "loading"}
            />
          </div>

          <div>
            <label
              className="block font-display text-lg tracking-wide mb-3"
              style={{ color: "var(--text)" }}
            >
              EMAIL
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="w-full font-body text-xl px-7 py-5 rounded-full border-2 border-black outline-none text-black"
              disabled={status === "loading"}
            />
          </div>

          <div>
            <label
              className="block font-display text-lg tracking-wide mb-3"
              style={{ color: "var(--text)" }}
            >
              MESSAGE
            </label>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's on your mind?"
              rows={7}
              className="w-full font-body text-xl px-7 py-6 rounded-3xl border-2 border-black outline-none text-black resize-none"
              disabled={status === "loading"}
            />
          </div>

          {status === "error" && (
            <p className="text-red-500 text-base font-body">
              Something went wrong. Please try again.
            </p>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="font-display text-base tracking-wide px-8 py-4 rounded-full border-2 border-black bg-black text-white transition hover:bg-white hover:text-black disabled:opacity-50 self-start"
          >
            {status === "loading" ? "SENDING…" : "SEND MESSAGE"}
          </button>
        </form>
      )}
    </main>
  );
}

// "use client";

// import { useState } from "react";
// import Link from "next/link";

// export default function ContactPage() {
//   const [name, setName] = useState("");
//   const [email, setEmail] = useState("");
//   const [message, setMessage] = useState("");
//   const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
//     "idle"
//   );

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!name.trim() || !email.trim() || !message.trim() || status === "loading")
//       return;

//     setStatus("loading");
//     try {
//       // TODO: wire this up to your backend contact endpoint once it exists,
//       // e.g. POST to `${process.env.NEXT_PUBLIC_API_URL}/api/contact/`
//       // For now this just simulates success.
//       await new Promise((resolve) => setTimeout(resolve, 800));
//       setStatus("success");
//       setName("");
//       setEmail("");
//       setMessage("");
//     } catch {
//       setStatus("error");
//     }
//   };

//   return (
//     <main className="max-w-2xl mx-auto px-6 pt-20 pb-24">
//       <Link
//         href="/"
//         className="inline-block font-display text-base tracking-wide px-6 py-3 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white mb-12"
//       >
//         ← HOME
//       </Link>

//       <h1
//         className="font-accent text-6xl sm:text-7xl mb-4"
//         style={{ color: "var(--green)" }}
//       >
//         Contact
//       </h1>
//       <p
//         className="font-body text-lg leading-relaxed mb-10"
//         style={{ color: "var(--text-muted)" }}
//       >
//         Got a pitch, a piece to share, or just want to say hi? Drop a note
//         below.
//       </p>

//       {status === "success" ? (
//         <div
//           className="rounded-3xl border-2 border-black p-8 text-center"
//           style={{ background: "var(--surface)" }}
//         >
//           <p className="font-accent text-2xl" style={{ color: "var(--text)" }}>
//             Message sent!
//           </p>
//           <p
//             className="font-body text-base mt-2"
//             style={{ color: "var(--text-muted)" }}
//           >
//             Thanks for reaching out — we'll get back to you soon.
//           </p>
//         </div>
//       ) : (
//         <form onSubmit={handleSubmit} className="flex flex-col gap-5">
//           <div>
//             <label
//               className="block font-display text-sm tracking-wide mb-2"
//               style={{ color: "var(--text)" }}
//             >
//               NAME
//             </label>
//             <input
//               type="text"
//               required
//               value={name}
//               onChange={(e) => setName(e.target.value)}
//               placeholder="Your name"
//               className="w-full font-body px-5 py-3 rounded-full border-2 border-black outline-none text-black"
//               disabled={status === "loading"}
//             />
//           </div>

//           <div>
//             <label
//               className="block font-display text-sm tracking-wide mb-2"
//               style={{ color: "var(--text)" }}
//             >
//               EMAIL
//             </label>
//             <input
//               type="email"
//               required
//               value={email}
//               onChange={(e) => setEmail(e.target.value)}
//               placeholder="you@email.com"
//               className="w-full font-body px-5 py-3 rounded-full border-2 border-black outline-none text-black"
//               disabled={status === "loading"}
//             />
//           </div>

//           <div>
//             <label
//               className="block font-display text-sm tracking-wide mb-2"
//               style={{ color: "var(--text)" }}
//             >
//               MESSAGE
//             </label>
//             <textarea
//               required
//               value={message}
//               onChange={(e) => setMessage(e.target.value)}
//               placeholder="What's on your mind?"
//               rows={6}
//               className="w-full font-body px-5 py-4 rounded-3xl border-2 border-black outline-none text-black resize-none"
//               disabled={status === "loading"}
//             />
//           </div>

//           {status === "error" && (
//             <p className="text-red-500 text-sm font-body">
//               Something went wrong. Please try again.
//             </p>
//           )}

//           <button
//             type="submit"
//             disabled={status === "loading"}
//             className="font-display text-sm tracking-wide px-6 py-3 rounded-full border-2 border-black bg-black text-white transition hover:bg-white hover:text-black disabled:opacity-50 self-start"
//           >
//             {status === "loading" ? "SENDING…" : "SEND MESSAGE"}
//           </button>
//         </form>
//       )}
//     </main>
//   );
// }