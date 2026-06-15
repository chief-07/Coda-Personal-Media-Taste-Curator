const axios = require("axios");
const BASE_URL = "http://localhost:8080";

const makePayload = (mediaType, specificTastes) => ({
  core_identity: `An introspective person drawn to emotionally heavy stories. Specific Tastes in ${mediaType}: ${specificTastes}`,
  recent_context: "Looking for something compelling this week.",
  guardrails: "No childish tone.",
  seen: ["Steins;Gate", "Monster", "Interstellar", "The Road"],
  not_for_me: [],
  watchlist: [],
  requested_media_type: mediaType,
  limit: 1
});

const TESTS = [
  { mediaType: "book",  specificTastes: "Loves literary fiction, Haruki Murakami, translated Japanese literature" },
  { mediaType: "anime", specificTastes: "Loves psychological anime, Steins;Gate, Monster" },
  { mediaType: "movie", specificTastes: "Prefers arthouse films, loved Interstellar" },
  { mediaType: "game",  specificTastes: "None" },
];

const run = async (t) => {
  const t0 = Date.now();
  console.log("\n" + "-".repeat(60));
  console.log(">> " + t.mediaType.toUpperCase());
  try {
    const r = await axios.post(BASE_URL + "/api/recommend", makePayload(t.mediaType, t.specificTastes), { timeout: 180000 });
    const ms = Date.now() - t0;
    const d = r.data;
    console.log("OK in " + (ms/1000).toFixed(1) + "s  title=" + d.title);
    console.log("   genres=" + (d.genres||[]).join(", "));
    console.log("   poster=" + (d.poster_url?"yes":"no") + " trailer=" + (d.trailer_url?"yes":"no"));
    return { mediaType: t.mediaType, ms, title: d.title, ok: true };
  } catch(e) {
    const ms = Date.now() - t0;
    const msg = e.response?.data?.details || e.message;
    console.log("FAIL in " + (ms/1000).toFixed(1) + "s: " + msg);
    return { mediaType: t.mediaType, ms, ok: false, error: msg };
  }
};

(async () => {
  console.log("=".repeat(60));
  console.log("  CODA PIPELINE TIMING TEST");
  console.log("=".repeat(60));
  const results = [];
  for (const t of TESTS) {
    results.push(await run(t));
    await new Promise(r => setTimeout(r, 500));
  }
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  for (const r of results) {
    console.log(r.mediaType.padEnd(8) + " | " + (r.ms/1000).toFixed(1).padStart(5) + "s | " + (r.ok?"OK  ":"FAIL") + " | " + (r.title||r.error||"").substring(0,30));
  }
  const ok = results.filter(r=>r.ok);
  console.log("avg=" + (ok.reduce((s,r)=>s+r.ms,0)/ok.length/1000).toFixed(1) + "s  passed=" + ok.length + "/" + results.length);
})();
