import { getContentPieceBySlug, getContentPieces } from "@/lib/api";
import { genreColor } from "@/lib/genreColor";
import { notFound } from "next/navigation";

export default async function PiecePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const piece = await getContentPieceBySlug(slug);

  if (!piece) {
    notFound();
  }

  const color = genreColor(piece.genre?.slug ?? "");
  const dateStr = piece.published_at
    ? new Date(piece.published_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "UNDATED";

  // Find the previous and next piece within the same genre, so we can link to
  // them below. Either can end up null (no genre, lookup fails, or this piece
  // sits at the start/end of the genre's list) — the corresponding arrow/button
  // is simply hidden in that case.
  let previousPiece: { slug: string; title: string } | null = null;
  let nextPiece: { slug: string; title: string } | null = null;
  if (piece.genre?.slug) {
    try {
      const genrePieces = await getContentPieces(piece.genre.slug);
      const currentIndex = genrePieces.findIndex((p) => p.slug === slug);
      if (currentIndex > 0) {
        previousPiece = genrePieces[currentIndex - 1];
      }
      if (currentIndex !== -1 && currentIndex < genrePieces.length - 1) {
        nextPiece = genrePieces[currentIndex + 1];
      }
    } catch {
      previousPiece = null;
      nextPiece = null;
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-16 relative">
      {/* Fixed nav: "Back to Musings" + "Previous" stacked in the left
          margin, "Next on [Genre]" in the right margin — both vertically
          centered beside the article content, staying put as you scroll. */}
      <div className="hidden lg:flex flex-col items-start gap-3 fixed left-4 xl:left-10 top-1/2 -translate-y-1/2 z-50">
        <a
          href="/"
          className="font-display text-lg tracking-wide px-7 py-3.5 rounded-full border-2 border-black bg-black text-white shadow-md transition hover:bg-white hover:text-black whitespace-nowrap"
        >
          ← BACK TO HOME
        </a>

        {previousPiece && (
          <a
            href={`/piece/${previousPiece.slug}`}
            className="font-display text-lg tracking-wide px-7 py-3.5 rounded-full border-2 border-black bg-black text-white shadow-md transition hover:bg-white hover:text-black whitespace-nowrap"
          >
            ← PREVIOUS
          </a>
        )}
      </div>

      {nextPiece && (
        <a
          href={`/piece/${nextPiece.slug}`}
          className="hidden lg:block fixed right-4 xl:right-10 top-1/2 -translate-y-1/2 z-50 font-display text-lg tracking-wide px-7 py-3.5 rounded-full border-2 border-black bg-white text-black shadow-md transition hover:bg-black hover:text-white whitespace-nowrap"
        >
          NEXT ON {piece.genre?.name?.toUpperCase()} →
        </a>
      )}

      <div className="sketchy-wrap mt-10">
        <svg className="sketchy-edge sketchy-top" viewBox="0 0 300 28" preserveAspectRatio="none" fill="none">
          <path
            d="M0,14 C35,3 65,24 100,12 C135,1 165,23 200,10 C230,0 265,20 300,13"
            stroke="var(--pink)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <svg className="sketchy-edge sketchy-bottom" viewBox="0 0 300 28" preserveAspectRatio="none" fill="none">
          <path
            d="M0,15 C30,26 70,4 105,16 C140,27 170,3 205,15 C240,26 270,5 300,14"
            stroke="var(--pink)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <svg className="sketchy-edge sketchy-left" viewBox="0 0 28 300" preserveAspectRatio="none" fill="none">
          <path
            d="M14,0 C3,35 24,65 12,100 C1,135 23,165 10,200 C0,230 20,265 13,300"
            stroke="var(--pink)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <svg className="sketchy-edge sketchy-right" viewBox="0 0 28 300" preserveAspectRatio="none" fill="none">
          <path
            d="M15,0 C26,30 4,70 16,105 C27,140 3,170 15,205 C26,240 5,270 14,300"
            stroke="var(--pink)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>

        <article className="sketchy-frame px-8 pt-5 pb-8 sm:px-12 sm:pt-6 sm:pb-12" style={{ background: "var(--surface)" }}>
          {/* Dateline strip */}
          <div
            className="flex items-center justify-end font-display text-2xl tracking-widest pb-2"
            style={{
              color: "var(--text-muted)",
            }}
          >
            <span>{dateStr.toUpperCase()}</span>
          </div>

          <span
            className="font-display text-lg tracking-wide px-4 py-2 rounded-full inline-block"
            style={{ color: "white", background: color }}
          >
            {piece.genre?.name?.toUpperCase()} · {piece.content_type.toUpperCase()}
          </span>

          <h1
            className="font-display text-7xl leading-[1.1] tracking-tight mt-5"
            style={{ color: "var(--pink)" }}
          >
            {piece.title}
          </h1>
          {piece.subtitle && (
            <p className="text-xl mt-3" style={{ color: "var(--text-muted)" }}>
              {piece.subtitle}
            </p>
          )}

          {/* <p className="font-accent text-2xl mt-6" style={{ color: "var(--green)" }}>
            by {piece.author?.display_name}
          </p> */}

        {piece.cover_image && piece.content_type !== "video" && (
  <img
    src={piece.cover_image}
    alt={piece.title}
    className="w-full mt-8 border-2"
    style={{ borderColor: "var(--border)" }}
  />
)}

          <div
            className="newspaper-body mt-10 whitespace-pre-wrap leading-relaxed text-xl"
            style={{ color: "var(--text)" }}
          >
            {piece.body}
          </div>

          {piece.media_files?.length > 0 && (
            <div className="mt-12 space-y-6">
              {piece.media_files.map((media) => (
                <div key={media.id}>
                  {media.kind === "image" && (
                    <img src={media.file} alt={media.caption} className="w-full" />
                  )}
                  {media.kind === "audio" && (
                    <audio controls src={media.file} className="w-full" />
                  )}
                  {media.kind === "video" && (
                    <video controls src={media.file} className="w-full" />
                  )}
                  {media.caption && (
                    <p className="font-accent text-lg mt-1" style={{ color: "var(--text-muted)" }}>
                      {media.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

    </main>
  );
}

// import { getContentPieceBySlug } from "@/lib/api";
// import { genreColor } from "@/lib/genreColor";
// import { notFound } from "next/navigation";

// export default async function PiecePage({
//   params,
// }: {
//   params: Promise<{ slug: string }>;
// }) {
//   const { slug } = await params;
//   const piece = await getContentPieceBySlug(slug);

//   if (!piece) {
//     notFound();
//   }

//   const color = genreColor(piece.genre?.slug ?? "");
//   const dateStr = piece.published_at
//     ? new Date(piece.published_at).toLocaleDateString("en-US", {
//         year: "numeric",
//         month: "long",
//         day: "numeric",
//       })
//     : "UNDATED";

//   return (
//     <main className="max-w-3xl mx-auto px-6 py-16">
//       {/* <a href="/" className="back-link block font-accent text-4xl mb-16" style={{ color: "var(--green)" }}>
//         <span className="back-arrow">←</span> Back To MUSINGS
//       </a> */}

//       <div className="sketchy-wrap">
//         <svg className="sketchy-edge sketchy-top" viewBox="0 0 300 28" preserveAspectRatio="none" fill="none">
//           <path
//             d="M0,14 C35,3 65,24 100,12 C135,1 165,23 200,10 C230,0 265,20 300,13"
//             stroke="var(--pink)"
//             strokeWidth="3"
//             strokeLinecap="round"
//           />
//         </svg>
//         <svg className="sketchy-edge sketchy-bottom" viewBox="0 0 300 28" preserveAspectRatio="none" fill="none">
//           <path
//             d="M0,15 C30,26 70,4 105,16 C140,27 170,3 205,15 C240,26 270,5 300,14"
//             stroke="var(--pink)"
//             strokeWidth="3"
//             strokeLinecap="round"
//           />
//         </svg>
//         <svg className="sketchy-edge sketchy-left" viewBox="0 0 28 300" preserveAspectRatio="none" fill="none">
//           <path
//             d="M14,0 C3,35 24,65 12,100 C1,135 23,165 10,200 C0,230 20,265 13,300"
//             stroke="var(--pink)"
//             strokeWidth="3"
//             strokeLinecap="round"
//           />
//         </svg>
//         <svg className="sketchy-edge sketchy-right" viewBox="0 0 28 300" preserveAspectRatio="none" fill="none">
//           <path
//             d="M15,0 C26,30 4,70 16,105 C27,140 3,170 15,205 C26,240 5,270 14,300"
//             stroke="var(--pink)"
//             strokeWidth="3"
//             strokeLinecap="round"
//           />
//         </svg>

//         <article className="sketchy-frame px-8 pt-5 pb-8 sm:px-12 sm:pt-6 sm:pb-12" style={{ background: "var(--surface)" }}>
//           {/* Dateline strip */}
//           <div
//             className="flex items-center justify-end font-display text-base tracking-widest pb-2"
//             style={{
//               color: "var(--text-muted)",
//             }}
//           >
//             <span>{dateStr.toUpperCase()}</span>
//           </div>

//           <span
//             className="font-display text-base tracking-wide px-3 py-1.5 rounded-full inline-block"
//             style={{ color: "white", background: color }}
//           >
//             {piece.genre?.name?.toUpperCase()} · {piece.content_type.toUpperCase()}
//           </span>

//           <h1
//             className="font-display text-6xl leading-[1.1] tracking-tight mt-4"
//             style={{ color: "var(--pink)" }}
//           >
//             {piece.title}
//           </h1>
//           {piece.subtitle && (
//             <p className="text-xl mt-3" style={{ color: "var(--text-muted)" }}>
//               {piece.subtitle}
//             </p>
//           )}

//           {/* <p className="font-accent text-2xl mt-6" style={{ color: "var(--green)" }}>
//             by {piece.author?.display_name}
//           </p> */}

//           {piece.cover_image && (
//             <img
//               src={piece.cover_image}
//               alt={piece.title}
//               className="w-full mt-8 border-2"
//               style={{ borderColor: "var(--border)" }}
//             />
//           )}

//           <div
//             className="newspaper-body mt-10 whitespace-pre-wrap leading-relaxed text-xl"
//             style={{ color: "var(--text)" }}
//           >
//             {piece.body}
//           </div>

//           {piece.media_files?.length > 0 && (
//             <div className="mt-12 space-y-6">
//               {piece.media_files.map((media) => (
//                 <div key={media.id}>
//                   {media.kind === "image" && (
//                     <img src={media.file} alt={media.caption} className="w-full" />
//                   )}
//                   {media.kind === "audio" && (
//                     <audio controls src={media.file} className="w-full" />
//                   )}
//                   {media.kind === "video" && (
//                     <video controls src={media.file} className="w-full" />
//                   )}
//                   {media.caption && (
//                     <p className="font-accent text-lg mt-1" style={{ color: "var(--text-muted)" }}>
//                       {media.caption}
//                     </p>
//                   )}
//                 </div>
//               ))}
//             </div>
//           )}
//         </article>
//       </div>

//         <a href="/" className="back-link block font-accent text-4xl mb-16" style={{ color: "var(--green)" }}>
//         <span className="back-arrow">←</span> Back To MUSINGS
//       </a>
//     </main>
//   );
// }



// import { getContentPieceBySlug } from "@/lib/api";
// import { genreColor } from "@/lib/genreColor";
// import { notFound } from "next/navigation";

// export default async function PiecePage({
//   params,
// }: {
//   params: Promise<{ slug: string }>;
// }) {
//   const { slug } = await params;
//   const piece = await getContentPieceBySlug(slug);

//   if (!piece) {
//     notFound();
//   }

//   const color = genreColor(piece.genre?.slug ?? "");
//   const dateStr = piece.published_at
//     ? new Date(piece.published_at).toLocaleDateString("en-US", {
//         year: "numeric",
//         month: "long",
//         day: "numeric",
//       })
//     : "UNDATED";

//   return (
//     <main className="max-w-3xl mx-auto px-6 py-16">
//       <a href="/" className="back-link block font-accent text-3xl mb-8" style={{ color: "var(--green)" }}>
//         <span className="back-arrow">←</span> Back To MUSINGS
//       </a>

//       <div className="sketchy-wrap">
//         <svg className="sketchy-edge sketchy-top" viewBox="0 0 300 28" preserveAspectRatio="none" fill="none">
//           <path
//             d="M0,14 C35,3 65,24 100,12 C135,1 165,23 200,10 C230,0 265,20 300,13"
//             stroke="var(--pink)"
//             strokeWidth="3"
//             strokeLinecap="round"
//           />
//         </svg>
//         <svg className="sketchy-edge sketchy-bottom" viewBox="0 0 300 28" preserveAspectRatio="none" fill="none">
//           <path
//             d="M0,15 C30,26 70,4 105,16 C140,27 170,3 205,15 C240,26 270,5 300,14"
//             stroke="var(--pink)"
//             strokeWidth="3"
//             strokeLinecap="round"
//           />
//         </svg>
//         <svg className="sketchy-edge sketchy-left" viewBox="0 0 28 300" preserveAspectRatio="none" fill="none">
//           <path
//             d="M14,0 C3,35 24,65 12,100 C1,135 23,165 10,200 C0,230 20,265 13,300"
//             stroke="var(--pink)"
//             strokeWidth="3"
//             strokeLinecap="round"
//           />
//         </svg>
//         <svg className="sketchy-edge sketchy-right" viewBox="0 0 28 300" preserveAspectRatio="none" fill="none">
//           <path
//             d="M15,0 C26,30 4,70 16,105 C27,140 3,170 15,205 C26,240 5,270 14,300"
//             stroke="var(--pink)"
//             strokeWidth="3"
//             strokeLinecap="round"
//           />
//         </svg>

//         <article className="sketchy-frame p-8 sm:p-12" style={{ background: "var(--surface)" }}>
//          {/* Dateline strip */}
//           <div
//             className="flex items-center justify-end font-display text-base tracking-widest pb-6"
//             style={{
//               color: "var(--text-muted)",
//             }}
//           >
//             <span>{dateStr.toUpperCase()}</span>
//           </div>

//           <span
//             className="font-display text-base tracking-wide px-3 py-1.5 rounded-full inline-block"
//             style={{ color: "white", background: color }}
//           >
//             {piece.genre?.name?.toUpperCase()} · {piece.content_type.toUpperCase()}
//           </span>

//           <h1 className="font-display text-6xl leading-tight mt-5" style={{ color: "var(--pink)" }}>
//             {piece.title}
//           </h1>
//           {piece.subtitle && (
//             <p className="text-xl mt-3" style={{ color: "var(--text-muted)" }}>
//               {piece.subtitle}
//             </p>
//           )}

//           {/* <p className="font-accent text-2xl mt-6" style={{ color: "var(--green)" }}>
//             by {piece.author?.display_name}
//           </p> */}

//           {piece.cover_image && (
//             <img
//               src={piece.cover_image}
//               alt={piece.title}
//               className="w-full mt-8 border-2"
//               style={{ borderColor: "var(--border)" }}
//             />
//           )}

//           <div
//             className="newspaper-body mt-10 whitespace-pre-wrap leading-relaxed text-xl"
//             style={{ color: "var(--text)" }}
//           >
//             {piece.body}
//           </div>

//           {piece.media_files?.length > 0 && (
//             <div className="mt-12 space-y-6">
//               {piece.media_files.map((media) => (
//                 <div key={media.id}>
//                   {media.kind === "image" && (
//                     <img src={media.file} alt={media.caption} className="w-full" />
//                   )}
//                   {media.kind === "audio" && (
//                     <audio controls src={media.file} className="w-full" />
//                   )}
//                   {media.kind === "video" && (
//                     <video controls src={media.file} className="w-full" />
//                   )}
//                   {media.caption && (
//                     <p className="font-accent text-lg mt-1" style={{ color: "var(--text-muted)" }}>
//                       {media.caption}
//                     </p>
//                   )}
//                 </div>
//               ))}
//             </div>
//           )}
//         </article>
//       </div>
//     </main>
//   );
// }
// import { getContentPieceBySlug } from "@/lib/api";
// import { genreColor } from "@/lib/genreColor";
// import { notFound } from "next/navigation";

// export default async function PiecePage({
//   params,
// }: {
//   params: Promise<{ slug: string }>;
// }) {
//   const { slug } = await params;
//   const piece = await getContentPieceBySlug(slug);

//   if (!piece) {
//     notFound();
//   }

//   const color = genreColor(piece.genre?.slug ?? "");

//   return (
//     <main className="max-w-2xl mx-auto px-6 py-16">
//       <a href="/" className="block font-accent text-2xl" style={{ color: "var(--green)" }}>
//         ← back to MUSINGS
//       </a>

//       <span
//         className="font-display text-sm tracking-wide px-3 py-1.5 rounded-full inline-block mt-10"
//         style={{ color: "white", background: color }}
//       >
//         {piece.genre?.name?.toUpperCase()} · {piece.content_type.toUpperCase()}
//       </span>

//       <h1 className="font-display text-6xl leading-tight mt-5" style={{ color: "var(--pink)" }}>
//         {piece.title}
//       </h1>
//       {piece.subtitle && (
//         <p className="text-xl mt-3" style={{ color: "var(--text-muted)" }}>
//           {piece.subtitle}
//         </p>
//       )}

//       <p className="font-accent text-2xl mt-6" style={{ color: "var(--green)" }}>
//         by {piece.author?.display_name}
//       </p>

//       {piece.cover_image && (
//         <img
//           src={piece.cover_image}
//           alt={piece.title}
//           className="w-full rounded-3xl mt-8 border-2"
//           style={{ borderColor: "var(--border)" }}
//         />
//       )}

//       <div className="mt-10 whitespace-pre-wrap leading-relaxed text-xl">
//         {piece.body}
//       </div>

//       {piece.media_files?.length > 0 && (
//         <div className="mt-12 space-y-6">
//           {piece.media_files.map((media) => (
//             <div key={media.id}>
//               {media.kind === "image" && (
//                 <img src={media.file} alt={media.caption} className="w-full rounded-2xl" />
//               )}
//               {media.kind === "audio" && (
//                 <audio controls src={media.file} className="w-full" />
//               )}
//               {media.kind === "video" && (
//                 <video controls src={media.file} className="w-full rounded-2xl" />
//               )}
//               {media.caption && (
//                 <p className="font-accent text-lg mt-1" style={{ color: "var(--text-muted)" }}>
//                   {media.caption}
//                 </p>
//               )}
//             </div>
//           ))}
//         </div>
//       )}
//     </main>
//   );
// }