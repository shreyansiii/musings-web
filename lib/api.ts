python manage.py shell

// const API_URL = process.env.NEXT_PUBLIC_API_URL;

// export type Genre = {
//   id: number;
//   name: string;
//   slug: string;
//   description: string;
//   cover_image: string | null;
// };

// export type Author = {
//   id: number;
//   display_name: string;
//   bio: string;
//   avatar: string | null;
//   instagram_handle: string;
// };

// export type ContentPiece = {
//   id: number;
//   title: string;
//   slug: string;
//   subtitle: string;
//   content_type: string;
//   author: Author;
//   genre: Genre;
//   cover_image: string | null;
//   is_featured: boolean;
//   published_at: string | null;
//   excerpt: string;
// };

// export async function getGenres(): Promise<Genre[]> {
//   const res = await fetch(`${API_URL}/genres/`, { cache: "no-store" });
//   if (!res.ok) throw new Error("Failed to fetch genres");
//   const data = await res.json();
//   // DRF paginates by default (returns { results: [...] }) unless pagination is off
//   return data.results ?? data;
// }

// export async function getContentPieces(genreSlug?: string): Promise<ContentPiece[]> {
//   const url = genreSlug
//     ? `${API_URL}/content-pieces/?genre=${genreSlug}`
//     : `${API_URL}/content-pieces/`;
//   const res = await fetch(url, { cache: "no-store" });
//   if (!res.ok) throw new Error("Failed to fetch content pieces");
//   const data = await res.json();
//   return data.results ?? data;
// }



// export type MediaFile = {
//   id: number;
//   kind: "image" | "audio" | "video";
//   file: string;
//   caption: string;
//   order: number;
// };

// export type ContentPieceDetail = ContentPiece & {
//   body: string;
//   media_files: MediaFile[];
// };

// export async function getContentPieceBySlug(slug: string): Promise<ContentPieceDetail | null> {
//   const res = await fetch(`${API_URL}/content-pieces/${slug}/`, { cache: "no-store" });
//   if (res.status === 404) return null;
//   if (!res.ok) throw new Error("Failed to fetch content piece");
//   return res.json();
// }


// export async function searchContentPieces(query: string): Promise<ContentPiece[]> {
//   const res = await fetch(`${API_URL}/content-pieces/?search=${encodeURIComponent(query)}`, {
//     cache: "no-store",
//   });
//   if (!res.ok) throw new Error("Search failed");
//   const data = await res.json();
//   return data.results ?? data;
// }


// export async function subscribeToNewsletter(email: string): Promise<void> {
//   const res = await fetch(`${API_URL}/newsletter/subscribe/`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ email }),
//   });
 
//   if (!res.ok) {
//     throw new Error("Subscription failed");
//   }
// }