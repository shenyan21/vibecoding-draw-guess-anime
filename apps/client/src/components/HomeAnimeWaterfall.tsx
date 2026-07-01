import type { CSSProperties } from "react";

const HOME_POSTER_PATHS = [
  "/anime/covers/100205.webp",
  "/anime/covers/100403.webp",
  "/anime/covers/100443.webp",
  "/anime/covers/100444.webp",
  "/anime/covers/100449.webp",
  "/anime/covers/1010.webp",
  "/anime/covers/1014.webp",
  "/anime/covers/101442.webp",
  "/anime/covers/101820.webp",
  "/anime/covers/102134.webp",
  "/anime/covers/10226.webp",
  "/anime/covers/1029.webp",
  "/anime/covers/10339.webp",
  "/anime/covers/10377.webp",
  "/anime/covers/10380.webp",
  "/anime/covers/10440.webp",
  "/anime/covers/10459.webp",
  "/anime/covers/105075.webp",
  "/anime/covers/105426.webp",
  "/anime/covers/106060.webp",
  "/anime/covers/10639.webp",
  "/anime/covers/106693.webp",
  "/anime/covers/106818.webp",
  "/anime/covers/10739.webp",
  "/anime/covers/10843.webp",
  "/anime/covers/109375.webp",
  "/anime/covers/109386.webp",
  "/anime/covers/110048.webp",
  "/anime/covers/110049.webp",
  "/anime/covers/1103.webp",
  "/anime/covers/110467.webp",
  "/anime/covers/1104.webp",
  "/anime/covers/11145.webp",
  "/anime/covers/111762.webp",
  "/anime/covers/112146.webp",
  "/anime/covers/113292.webp",
  "/anime/covers/114685.webp",
  "/anime/covers/114758.webp",
  "/anime/covers/115292.webp",
  "/anime/covers/11577.webp",
  "/anime/covers/115780.webp",
  "/anime/covers/115908.webp",
  "/anime/covers/115932.webp",
  "/anime/covers/11602.webp",
  "/anime/covers/116287.webp",
  "/anime/covers/11629.webp",
  "/anime/covers/116461.webp",
  "/anime/covers/117777.webp",
] as const;

const COLUMN_COUNT = 12;
const POSTER_COLUMNS = Array.from({ length: COLUMN_COUNT }, (_, columnIndex) =>
  HOME_POSTER_PATHS.filter((_, posterIndex) => posterIndex % COLUMN_COUNT === columnIndex),
);

export function HomeAnimeWaterfall() {
  return (
    <div className="home-poster-stage" aria-hidden="true">
      <div className="home-poster-waterfall">
        {POSTER_COLUMNS.map((posters, columnIndex) => (
          <div
            className="home-poster-column"
            key={columnIndex}
            style={{ "--poster-column": columnIndex } as CSSProperties}
          >
            <div className="home-poster-track">
              {[...posters, ...posters].map((poster, posterIndex) => (
                <figure className="home-poster-tile" key={`${poster}-${posterIndex}`}>
                  <img src={poster} alt="" decoding="async" />
                </figure>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="home-poster-veil" />
    </div>
  );
}
