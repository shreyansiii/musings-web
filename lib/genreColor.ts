export function genreColor(slugOrIndex: string | number): string {
  const palette = ["var(--pink)", "var(--green)"];
  if (typeof slugOrIndex === "number") {
    return palette[slugOrIndex % palette.length];
  }
  // Deterministic pick based on the slug string, so the same genre
  // always gets the same color across the whole site.
  const hash = [...slugOrIndex].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return palette[hash % palette.length];
}