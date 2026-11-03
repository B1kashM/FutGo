// "use client";

// import { useEffect, useMemo, useState } from "react";

// // Change this if your Django players endpoint is different.
// const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
// const PLAYERS_URL = `${API_BASE}/api/players/`;

// type PlayerRow = {
//   id?: number | string;
//   name: string;
//   image_url: string | null;
// };

// function initials(name: string) {
//   return name
//     .split(" ")
//     .map((part) => part[0])
//     .slice(0, 2)
//     .join("")
//     .toUpperCase();
// }

// export default function TestPlayersPage() {
//   const [players, setPlayers] = useState<PlayerRow[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState("");
//   const [search, setSearch] = useState("");
//   const [onlyMissing, setOnlyMissing] = useState(false);

//   useEffect(() => {
//     let cancelled = false;

//     async function loadAll() {
//       try {
//         const all: PlayerRow[] = [];
//         let url: string | null = PLAYERS_URL;

//         // Handles both a plain list and a paginated { results, next } response.
//         while (url) {
//           const res: Response = await fetch(url, { cache: "no-store" });
//           if (!res.ok) throw new Error(`Request failed (${res.status}) for ${url}`);
//           const data = await res.json();

//           if (Array.isArray(data)) {
//             all.push(...data);
//             url = null;
//           } else {
//             all.push(...(data.results ?? []));
//             url = data.next ?? null;
//           }
//         }

//         if (!cancelled) setPlayers(all);
//       } catch (err) {
//         if (!cancelled) setError(err instanceof Error ? err.message : "Could not load players.");
//       } finally {
//         if (!cancelled) setLoading(false);
//       }
//     }

//     loadAll();
//     return () => { cancelled = true; };
//   }, []);

//   const missingCount = useMemo(
//     () => players.filter((player) => !player.image_url).length,
//     [players],
//   );

//   const visible = useMemo(() => {
//     const term = search.trim().toLowerCase();
//     return players.filter((player) => {
//       if (onlyMissing && player.image_url) return false;
//       return !term || player.name.toLowerCase().includes(term);
//     });
//   }, [players, search, onlyMissing]);

//   return (
//     <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
//       <h1 style={{ fontSize: 28, fontWeight: 800 }}>Players test page</h1>
//       <p style={{ marginTop: 6, color: "#777", fontSize: 14 }}>
//         Source: {PLAYERS_URL}
//       </p>

//       <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", margin: "20px 0" }}>
//         <input
//           value={search}
//           onChange={(event) => setSearch(event.target.value)}
//           placeholder="Search by name..."
//           style={{ padding: "10px 14px", border: "1px solid #bbb", borderRadius: 8, minWidth: 240 }}
//         />
//         <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
//           <input type="checkbox" checked={onlyMissing} onChange={(event) => setOnlyMissing(event.target.checked)} />
//           Only players without an image
//         </label>
//         <span style={{ fontSize: 14, color: "#777" }}>
//           Showing {visible.length} of {players.length} · {missingCount} missing image
//         </span>
//       </div>

//       {loading && <p>Loading players...</p>}
//       {error && (
//         <p role="alert" style={{ padding: 14, border: "1px solid #e55", borderRadius: 8, color: "#c33" }}>
//           {error}
//         </p>
//       )}

//       <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 16 }}>
//         {visible.map((player, index) => (
//           <div
//             key={player.id ?? `${player.name}-${index}`}
//             style={{ border: "1px solid #ccc", borderRadius: 12, padding: 12, textAlign: "center" }}
//           >
//             {player.image_url ? (
//               // eslint-disable-next-line @next/next/no-img-element
//               <img
//                 src={player.image_url}
//                 alt={player.name}
//                 loading="lazy"
//                 style={{ width: "100%", height: 150, objectFit: "contain", borderRadius: 8, background: "#f3f3f3" }}
//               />
//             ) : (
//               <div
//                 style={{
//                   width: "100%", height: 150, display: "flex", alignItems: "center", justifyContent: "center",
//                   borderRadius: 8, background: "#f3f3f3", color: "#999", fontSize: 32, fontWeight: 800,
//                 }}
//               >
//                 {initials(player.name)}
//               </div>
//             )}
//             <p style={{ marginTop: 10, fontWeight: 700, fontSize: 14 }}>{player.name}</p>
//             <p style={{ marginTop: 4, fontSize: 11, color: "#999", wordBreak: "break-all" }}>
//               {player.image_url ?? "no image_url"}
//             </p>
//           </div>
//         ))}
//       </div>
//     </main>
//   );
// }