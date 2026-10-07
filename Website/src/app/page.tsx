export const dynamic = "force-static";

/**
 * This repository ships a pure Node.js + Express + Socket.IO backend with a
 * vanilla HTML/CSS/JS frontend (see `server.js` and `public/index.html`).
 *
 * The Next.js shell only exists so the sandbox tooling (typegen/tsc/build and
 * the `/api/health` probe) keeps working; it forwards visitors to the real
 * TBRide single page app which is served as static files from /public.
 */
export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "48px", lineHeight: 1.6 }}>
      <h1>TBRide</h1>
      <p>
        Ride-hailing &amp; operator dispatch platform — Node.js, Express, Socket.IO,
        PostgreSQL and a vanilla JavaScript + Leaflet frontend.
      </p>
      <p>
        <a href="/index.html">Open the TBRide console →</a>
      </p>
    </main>
  );
}
