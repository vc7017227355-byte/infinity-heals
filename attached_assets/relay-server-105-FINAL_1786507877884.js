/**
 * Upstox → Signal Board relay (Node.js)
 * ---------------------------------------------------------------
 * What this does:
 *   1. Logs you into Upstox (OAuth authorization-code flow).
 *   2. Opens Upstox's live Market Data Feed V3 WebSocket using the
 *      official upstox-js-sdk (it handles the protobuf decoding).
 *   3. Re-broadcasts simplified JSON ticks on ws://localhost:8090 —
 *      exactly what the Signal Board dashboard (jai_Shri_radhekrishn_ji.jsx)
 *      already expects.
 *
 * The dashboard only shows "LIVE" (and only then do the green/red boxes
 * glow) once this relay sends an explicit {type:"status", status:"LIVE"}
 * message — that only happens once Upstox has actually authenticated and
 * started streaming, not just because this process is running.
 *
 * SETUP
 *   npm install upstox-js-sdk ws axios dotenv cheerio
 *
 *   Create a .env file next to this script:
 *     UPSTOX_API_KEY=your_client_id
 *     UPSTOX_API_SECRET=your_client_secret
 *     UPSTOX_REDIRECT_URI=http://localhost:3000/callback
 *
 *   The redirect URI above MUST exactly match the "Redirect URI" you
 *   configured for your app at https://developer.upstox.com/apps
 *
 * RUN
 *   node relay-server.js
 *   -> it prints a login URL. Open it, log into Upstox, approve access.
 *   -> once redirected back, the relay exchanges the code for an access
 *      token and starts streaming. Leave this process running while you
 *      use the dashboard.
 *
 * NOTE ON TOKENS
 *   Upstox access tokens expire daily (around 3:30am IST). You'll need
 *   to re-run this script (and log in again) each trading day.
 */

require("dotenv").config();
const http = require("http");
const { URL, URLSearchParams } = require("url");
const axios = require("axios");
const WebSocket = require("ws");
const UpstoxClient = require("upstox-js-sdk");

// --- Jai Shree Radhey Krishn: crash guard ---
// upstox-js-sdk's internal Streamer.js reconnect logic can throw
// "this.streamer.clearSubscriptions is not a function" when the
// underlying WebSocket drops (network switch, market close, etc.)
// and it tries to auto-reconnect before its internal streamer
// reference is ready. Without this guard, that single throw crashes
// the ENTIRE relay process (Node exits), which is why the dashboard
// goes permanently OFFLINE until you manually restart start-signalboard.sh.
// This keeps the relay process alive and just logs the error instead.
process.on("uncaughtException", (err) => {
  console.error("[crash-guard] Uncaught exception (relay kept alive):", err && err.message);
  if (err && err.stack) console.error(err.stack);
});
process.on("unhandledRejection", (err) => {
  console.error("[crash-guard] Unhandled rejection (relay kept alive):", err && err.message);
});
const cheerio = require("cheerio");

const API_KEY = process.env.UPSTOX_API_KEY;
const API_SECRET = process.env.UPSTOX_API_SECRET;
const REDIRECT_URI = process.env.UPSTOX_REDIRECT_URI || "http://localhost:3000/callback";
const CALLBACK_PORT = Number(new URL(REDIRECT_URI).port) || 3000;
const RELAY_PORT = 8090;

// Instruments to track. The first entry is the "primary" spot price that
// drives the dashboard's spot-based indicators (ichimoku, usaQuant, vpoc,
// russiaVol, uaeQuantum, indiaQuantum). Add/remove rows freely — anything
// here also shows up in the dashboard's "Live Market Watch" table.
//
// EXPANDED to cover the whole market instead of just 2 indices:
// all major NSE/BSE indices, a spread of large-cap stocks across sectors,
// and MCX commodities. Crypto (BTCUSDT etc.) is NOT included — Upstox does
// not offer crypto; those rows stay on manual/default data only.
const INSTRUMENTS = [
  // --- Indices (NSE + BSE) ---
  { key: "NSE_INDEX|Nifty 50", symbol: "NIFTY 50", category: "index" },
  { key: "NSE_INDEX|Nifty Bank", symbol: "NIFTY BANK", category: "index" },
  { key: "NSE_INDEX|Nifty Fin Service", symbol: "NIFTY FIN SERVICE", category: "index" },
  { key: "NSE_INDEX|Nifty Midcap 50", symbol: "NIFTY MIDCAP 50", category: "index" },
  { key: "BSE_INDEX|SENSEX", symbol: "SENSEX", category: "index" },
  { key: "BSE_INDEX|BANKEX", symbol: "BANKEX", category: "index" },
  // --- Large-cap stocks (NSE cash, spread across sectors) ---
  { key: "NSE_EQ|INE002A01018", symbol: "RELIANCE", category: "stock" },
  { key: "NSE_EQ|INE040A01034", symbol: "HDFCBANK", category: "stock" },
  { key: "NSE_EQ|INE090A01021", symbol: "ICICIBANK", category: "stock" },
  { key: "NSE_EQ|INE467B01029", symbol: "TCS", category: "stock" },
  { key: "NSE_EQ|INE009A01021", symbol: "INFY", category: "stock" },
  { key: "NSE_EQ|INE062A01020", symbol: "SBIN", category: "stock" },
  { key: "NSE_EQ|INE155A01022", symbol: "TATAMOTORS", category: "stock" },
  { key: "NSE_EQ|INE423A01024", symbol: "ADANIENT", category: "stock" },
  // --- Commodities (MCX) — keys are resolved AUTOMATICALLY at startup
  // from Upstox's live instrument master (see resolveMcxKeys() below),
  // because MCX futures roll to a new contract every month and a
  // hardcoded key would go stale every ~30 days. Do not hardcode these.
];
const MCX_SYMBOLS = ["GOLD", "SILVER", "CRUDEOIL", "NATURALGAS", "COPPER"];
let PRIMARY_INSTRUMENT_KEY = null; // set once indices are pushed (see below)

// Official NSE trading symbols for the current Nifty 50 and Bank Nifty index
// constituents. These are just the standard exchange ticker symbols (public,
// unambiguous identifiers) — the actual instrument_key for each is resolved
// live against Upstox's instrument master below, so a stale/wrong ISIN can
// never sneak in. If NSE reshuffles the index, only this list needs editing.
const NIFTY50_SYMBOLS = [
  "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY", "HINDUNILVR", "ITC", "SBIN",
  "BHARTIARTL", "KOTAKBANK", "LT", "AXISBANK", "BAJFINANCE", "ASIANPAINT", "MARUTI",
  "HCLTECH", "SUNPHARMA", "TITAN", "ULTRACEMCO", "NESTLEIND", "WIPRO", "ONGC", "NTPC",
  "POWERGRID", "M&M", "TATASTEEL", "TATAMOTORS", "ADANIENT", "ADANIPORTS", "COALINDIA",
  "BAJAJFINSV", "DRREDDY", "GRASIM", "HDFCLIFE", "BRITANNIA", "EICHERMOT", "CIPLA",
  "DIVISLAB", "APOLLOHOSP", "HEROMOTOCO", "INDUSINDBK", "JSWSTEEL", "SBILIFE",
  "TATACONSUM", "BPCL", "UPL", "HINDALCO", "BAJAJ-AUTO", "LTIM", "TECHM",
];
const BANKNIFTY_SYMBOLS = [
  "HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK", "INDUSINDBK",
  "BANKBARODA", "PNB", "AUBANK", "FEDERALBNK", "IDFCFIRSTB", "BANDHANBNK",
];
const EQUITY_SYMBOLS_CORE = [...new Set([...NIFTY50_SYMBOLS, ...BANKNIFTY_SYMBOLS])];
let EQUITY_SYMBOLS = [...EQUITY_SYMBOLS_CORE]; // extended live below with cap-tier lists

// ---------------------------------------------------------------
// Small/Mid/Large-cap universe — live-fetched from NSE's own official
// index constituent CSVs rather than hardcoded. This is deliberate:
// hand-typing ~300 ticker symbols from memory risks silently wrong or
// stale symbols (index constituents get reshuffled every 6 months),
// and a wrong equity ISIN is worse than no data at all. Fetching NSE's
// own published list means it's always the CURRENT official set, same
// safety principle as resolveMcxKeys/resolveBondFuturesKeys above.
//
// Nifty 100 = large-cap (100 names), Nifty Midcap 100 = mid-cap (100),
// Nifty Smallcap 100 = small-cap (100) — NSE's own standard tier
// definitions, so "100 each" maps exactly onto real published indices.
//
// KNOWN RISK: archives.nseindia.com sometimes 403s requests that don't
// look like a real browser (needs a plausible User-Agent + Referer,
// occasionally a session cookie from nseindia.com's homepage first). If
// this keeps failing, the whole cap-tier feature just silently stays
// empty — Nifty 50 / Bank Nifty above are UNAFFECTED either way, since
// they're a separate hardcoded list.
const NSE_CAP_TIER_CSVS = {
  largeCap: "https://archives.nseindia.com/content/indices/ind_nifty100list.csv",
  midCap: "https://archives.nseindia.com/content/indices/ind_niftymidcap100list.csv",
  smallCap: "https://archives.nseindia.com/content/indices/ind_niftysmallcap100list.csv",
};
let CAP_TIER_SYMBOLS = { largeCap: [], midCap: [], smallCap: [] }; // filled in below, exposed to frontend via broadcast

async function fetchNseIndexSymbols(url) {
  // NSE's archive server wants a browser-shaped request; a plain session
  // cookie grab from the homepage first makes this far more reliable.
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Referer": "https://www.nseindia.com/",
    "Accept": "text/csv,*/*",
  };
  let cookieJar = "";
  try {
    const home = await axios.get("https://www.nseindia.com/", { headers, timeout: 15000 });
    cookieJar = (home.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
  } catch (err) {
    console.error(`  NSE cookie warm-up failed (${err.code || err.message}) — trying CSV fetch anyway.`);
  }
  const resp = await axios.get(url, { headers: { ...headers, Cookie: cookieJar }, timeout: 20000 });
  const lines = resp.data.trim().split("\n");
  const header = splitCsvLine(lines[0]);
  const symCol = header.findIndex((h) => h.trim().toUpperCase() === "SYMBOL");
  if (symCol < 0) throw new Error("no Symbol column in NSE CSV");
  const symbols = [];
  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]);
    if (row[symCol]) symbols.push(row[symCol].trim());
  }
  return symbols;
}

// ---------------------------------------------------------------
// FII/DII CASH SEGMENT net buy/sell (Cr) -- NSE official daily report.
// Publishes once per day after market close (usually ~6-8pm IST).
// Distinct from fiiDiiPositioning above, which is index-FUTURES OI.
// ---------------------------------------------------------------
async function fetchFiiDiiCashFlow() {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/report-detail/fii_archive",
    "Origin": "https://www.nseindia.com",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
  };
  let cookieJar = "";
  let resp;
  let lastErr;
  // BUG FIX: this used to try the cookie warm-up + fetch exactly once, so
  // any transient NSE block (the same anti-bot cookie gate that hits every
  // other NSE scrape in this file) meant "no data" for the whole day. Now
  // retries 3x with backoff, same pattern as scrapeCcilYields() above —
  // a fresh cookie jar is fetched on every attempt since NSE cookies are
  // often single-use / short-lived.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const home = await axios.get("https://www.nseindia.com/report-detail/fii_archive", { headers, timeout: 15000 });
      cookieJar = (home.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
    } catch (err) {
      console.error(`  FII/DII cash-flow cookie warm-up failed on attempt ${attempt}/3 (${err.response?.status || err.code || err.message}) -- trying fetch anyway.`);
    }
    try {
      resp = await axios.get("https://www.nseindia.com/api/fiidiiTradeReact", {
        headers: { ...headers, Cookie: cookieJar },
        timeout: 20000,
      });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      console.error(`  FII/DII cash-flow request failed on attempt ${attempt}/3, status=${status || "none"}, code=${err.code || "none"}, msg=${err.message}`);
      if (err.response?.data) console.error(`  Response body (first 300 chars): ${JSON.stringify(err.response.data).slice(0, 300)}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  if (lastErr) throw lastErr;
  const rows = resp.data;
  if (!Array.isArray(rows)) {
    console.error(`  FII/DII cash-flow: unexpected response shape, got: ${JSON.stringify(rows).slice(0, 300)}`);
    throw new Error("unexpected fiidiiTradeReact response shape");
  }
  const fiiRow = rows.find((r) => /FII|FPI/i.test(r.category));
  const diiRow = rows.find((r) => /DII/i.test(r.category));
  if (!fiiRow || !diiRow) {
    console.error(`  FII/DII cash-flow: rows received but no FII/DII match. Categories seen: ${rows.map(r => r.category).join(", ")}`);
    throw new Error("could not find FII/DII rows in NSE response");
  }
  return {
    date: fiiRow.date,
    fiiNetCr: parseFloat(fiiRow.netValue),
    diiNetCr: parseFloat(diiRow.netValue),
  };
}

let fiiDiiCashFlowStatus = { ok: false, lastAttempt: null, lastSuccess: null, lastError: null };
let lastFiiDiiCashFlow = null; // BUG FIX: cache last known {date, fiiNetCr, diiNetCr} — a client connecting between scrapes previously got only the status broadcast, never the actual numbers, until the next ~30min cycle.

async function scrapeFiiDiiCashFlow() {
  fiiDiiCashFlowStatus.lastAttempt = new Date().toISOString();
  try {
    const data = await fetchFiiDiiCashFlow();
    fiiDiiCashFlowStatus = { ok: true, lastAttempt: fiiDiiCashFlowStatus.lastAttempt, lastSuccess: new Date().toISOString(), lastError: null };
    lastFiiDiiCashFlow = { date: data.date, fiiNetCr: data.fiiNetCr, diiNetCr: data.diiNetCr };
    broadcast({ type: "fiiDiiCashFlow", ...lastFiiDiiCashFlow });
    broadcast({ type: "fiiDiiCashFlowStatus", ...fiiDiiCashFlowStatus });
    // ── retailOddLot proxy (relay-106) ──
    // Retail behavior = inverse of institutional FII flow direction.
    const fiiNet   = data.fiiNetCr;
    const niftyUp  = fiiNet >= 0;
    const buyRatio = fiiNet < 0
      ? +Math.min(0.85, 0.5 + Math.abs(fiiNet) / 5000).toFixed(2)
      : +Math.max(0.15, 0.5 - Math.abs(fiiNet) / 5000).toFixed(2);
    broadcast({ type: "indicators", data: { retailOddLot: { buyRatio, trendUp: niftyUp ? 1 : 0, hasData: true } } });
    // ────────────────────────────────────
    console.log(`  FII/DII cash flow: FII ${data.fiiNetCr} Cr, DII ${data.diiNetCr} Cr (${data.date})`);
    return true;
  } catch (err) {
    // BUG FIX: failures used to be swallowed to the server console only —
    // the frontend card just sat on "Waiting for relay" forever with no
    // way to tell a transient hiccup from NSE permanently blocking this
    // host's IP (very common for cloud-hosted scrapers hitting nseindia.com
    // — its anti-bot gate allow-lists real browser traffic, not datacenter
    // IPs, and no amount of retrying fixes that server-side). Now the
    // actual status (including the HTTP code, when there is one) is
    // broadcast so the UI can say what's actually happening.
    const status = err.response?.status;
    fiiDiiCashFlowStatus = { ok: false, lastAttempt: fiiDiiCashFlowStatus.lastAttempt, lastSuccess: fiiDiiCashFlowStatus.lastSuccess, lastError: status ? `NSE HTTP ${status}` : (err.code || err.message || "unknown error") };
    broadcast({ type: "fiiDiiCashFlowStatus", ...fiiDiiCashFlowStatus });
    console.error(`  FII/DII cash-flow scrape FAILED (${err.code || err.message}) -- card stays on last known value.`);
    return false;
  }
}

function startFiiDiiCashFlowPolling() {
  scrapeFiiDiiCashFlow(); // fire-and-forget, NOT awaited
  // BUG FIX: on a failed scrape (no data ever received yet), waiting the
  // full 30min before retrying meant the card could stay empty for hours
  // on a bad run. Now checks every 5min until a scrape actually succeeds,
  // then settles into the normal 30min cadence.
  const interval = setInterval(async () => {
    const ok = await scrapeFiiDiiCashFlow();
    if (ok) {
      clearInterval(interval);
      setInterval(scrapeFiiDiiCashFlow, 30 * 60 * 1000);
    }
  }, 5 * 60 * 1000); // NSE updates this once/day after close; 30min poll catches it promptly
}

async function resolveCapTierSymbols() {
  console.log("Fetching NSE cap-tier universes (Large/Mid/Small-cap 100 each)...");
  for (const [tier, url] of Object.entries(NSE_CAP_TIER_CSVS)) {
    try {
      const symbols = await fetchNseIndexSymbols(url);
      CAP_TIER_SYMBOLS[tier] = symbols;
      EQUITY_SYMBOLS = [...new Set([...EQUITY_SYMBOLS, ...symbols])];
      console.log(`  ${tier}: got ${symbols.length} symbols from NSE.`);
    } catch (err) {
      console.error(`  ${tier}: FAILED (${err.code || err.message}) — this cap tier will stay empty, Nifty 50/Bank Nifty unaffected.`);
    }
  }
  broadcast({ type: "capTierSymbols", data: CAP_TIER_SYMBOLS });
}

// ---------------------------------------------------------------
// 🌍 Global mega-caps (Apple, Samsung, Tesla, Microsoft, etc.) — HONEST
// LIMITATION: Upstox's API only covers NSE/BSE/MCX segments, there is
// no US/Korean/global exchange segment available here. These names are
// listed for the dashboard's reference/watchlist button ONLY — they
// will NOT get live ticks through this relay. A separate global market
// data provider (e.g. a US broker's API) would be needed for that; this
// relay cannot honestly provide it. Kept to the ~40 truly globally
// recognized mega-caps rather than padding to 100 with less-certain
// tickers.
const GLOBAL_MEGACAP_WATCHLIST = [
  { symbol: "AAPL", name: "Apple", exchange: "NASDAQ", yahoo: "AAPL" },
  { symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ", yahoo: "MSFT" },
  { symbol: "GOOGL", name: "Alphabet (Google)", exchange: "NASDAQ", yahoo: "GOOGL" },
  { symbol: "AMZN", name: "Amazon", exchange: "NASDAQ", yahoo: "AMZN" },
  { symbol: "NVDA", name: "Nvidia", exchange: "NASDAQ", yahoo: "NVDA" },
  { symbol: "META", name: "Meta Platforms", exchange: "NASDAQ", yahoo: "META" },
  { symbol: "TSLA", name: "Tesla", exchange: "NASDAQ", yahoo: "TSLA" },
  { symbol: "BRK.B", name: "Berkshire Hathaway", exchange: "NYSE", yahoo: "BRK-B" },
  { symbol: "TSM", name: "Taiwan Semiconductor", exchange: "NYSE", yahoo: "TSM" },
  { symbol: "AVGO", name: "Broadcom", exchange: "NASDAQ", yahoo: "AVGO" },
  { symbol: "JPM", name: "JPMorgan Chase", exchange: "NYSE", yahoo: "JPM" },
  { symbol: "V", name: "Visa", exchange: "NYSE", yahoo: "V" },
  { symbol: "MA", name: "Mastercard", exchange: "NYSE", yahoo: "MA" },
  { symbol: "WMT", name: "Walmart", exchange: "NYSE", yahoo: "WMT" },
  { symbol: "005930", name: "Samsung Electronics", exchange: "KRX", yahoo: "005930.KS" },
  { symbol: "LLY", name: "Eli Lilly", exchange: "NYSE", yahoo: "LLY" },
  { symbol: "UNH", name: "UnitedHealth Group", exchange: "NYSE", yahoo: "UNH" },
  { symbol: "XOM", name: "ExxonMobil", exchange: "NYSE", yahoo: "XOM" },
  { symbol: "ORCL", name: "Oracle", exchange: "NYSE", yahoo: "ORCL" },
  { symbol: "HD", name: "Home Depot", exchange: "NYSE", yahoo: "HD" },
  { symbol: "COST", name: "Costco", exchange: "NASDAQ", yahoo: "COST" },
  { symbol: "PG", name: "Procter & Gamble", exchange: "NYSE", yahoo: "PG" },
  { symbol: "NFLX", name: "Netflix", exchange: "NASDAQ", yahoo: "NFLX" },
  { symbol: "KO", name: "Coca-Cola", exchange: "NYSE", yahoo: "KO" },
  { symbol: "PEP", name: "PepsiCo", exchange: "NASDAQ", yahoo: "PEP" },
  { symbol: "BAC", name: "Bank of America", exchange: "NYSE", yahoo: "BAC" },
  { symbol: "ADBE", name: "Adobe", exchange: "NASDAQ", yahoo: "ADBE" },
  { symbol: "CRM", name: "Salesforce", exchange: "NYSE", yahoo: "CRM" },
  { symbol: "AMD", name: "AMD", exchange: "NASDAQ", yahoo: "AMD" },
  { symbol: "TMO", name: "Thermo Fisher", exchange: "NYSE", yahoo: "TMO" },
  { symbol: "MCD", name: "McDonald's", exchange: "NYSE", yahoo: "MCD" },
  { symbol: "CSCO", name: "Cisco", exchange: "NASDAQ", yahoo: "CSCO" },
  { symbol: "ABT", name: "Abbott Labs", exchange: "NYSE", yahoo: "ABT" },
  { symbol: "DIS", name: "Disney", exchange: "NYSE", yahoo: "DIS" },
  { symbol: "PFE", name: "Pfizer", exchange: "NYSE", yahoo: "PFE" },
  { symbol: "NKE", name: "Nike", exchange: "NYSE", yahoo: "NKE" },
  { symbol: "INTC", name: "Intel", exchange: "NASDAQ", yahoo: "INTC" },
  { symbol: "IBM", name: "IBM", exchange: "NYSE", yahoo: "IBM" },
  { symbol: "BABA", name: "Alibaba", exchange: "NYSE (ADR)", yahoo: "BABA" },
  { symbol: "TCEHY", name: "Tencent", exchange: "OTC (ADR)", yahoo: "TCEHY" },
  { symbol: "SONY", name: "Sony", exchange: "NYSE (ADR)", yahoo: "SONY" },
];

// ---------------------------------------------------------------
// Live global mega-cap quotes — Yahoo Finance's public quote endpoint.
// This is FREE, no API key/signup required, which is exactly what was
// asked for. Honest caveat: it's an UNOFFICIAL/undocumented endpoint —
// Yahoo doesn't publish it as a supported public API, so it can rate-
// limit or change shape without notice. If it ever breaks, this feature
// alone goes quiet (falls back to "no feed" on the dashboard) — every
// other part of the relay (NSE, options, FRED, CFTC, etc.) is on
// completely separate code paths and stays unaffected.
const YAHOO_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote";

async function scrapeGlobalMegacapQuotes() {
  console.log(`Fetching live quotes for ${GLOBAL_MEGACAP_WATCHLIST.length} global mega-caps from Yahoo Finance (free, no key)...`);
  const symbols = GLOBAL_MEGACAP_WATCHLIST.map((r) => r.yahoo).join(",");
  let results;
  try {
    const resp = await axios.get(YAHOO_QUOTE_URL, {
      params: { symbols },
      timeout: 20000,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
    });
    results = resp.data?.quoteResponse?.result || [];
  } catch (err) {
    console.error(`  Yahoo Finance quote fetch FAILED (${err.code || err.message}) — global mega-caps will show "no feed" on the dashboard, nothing else affected.`);
    return;
  }
  if (!results.length) {
    console.error("  Yahoo Finance returned no results — endpoint may have changed shape or started blocking. Global mega-caps stay quiet.");
    return;
  }
  const byYahoo = new Map(results.map((r) => [r.symbol, r]));
  const data = {};
  for (const entry of GLOBAL_MEGACAP_WATCHLIST) {
    const q = byYahoo.get(entry.yahoo);
    if (!q || q.regularMarketPrice == null) continue;
    data[entry.symbol] = {
      symbol: entry.symbol,
      category: "globalMega",
      ltp: q.regularMarketPrice,
      chg: q.regularMarketChange,
      chgPct: q.regularMarketChangePercent,
    };
  }
  if (Object.keys(data).length) {
    broadcast({ type: "market", data });
    console.log(`  Got live quotes for ${Object.keys(data).length}/${GLOBAL_MEGACAP_WATCHLIST.length} global mega-caps.`);
  }
}

function startGlobalMegacapPolling() {
  scrapeGlobalMegacapQuotes(); // fire-and-forget, NOT awaited
  // US markets move fast during their session — poll every 60s. Harmless
  // when US markets are closed too, Yahoo just returns the last close.
  setInterval(scrapeGlobalMegacapQuotes, 60 * 1000);
}

// ---------------------------------------------------------------
// Auto-resolve current-month MCX instrument_keys AND every Nifty 50 /
// Bank Nifty equity's instrument_key from Upstox's live instrument master.
// Fetched once at startup and shared between both resolvers so we don't
// download the ~large CSV twice.
// ---------------------------------------------------------------
const zlib = require("zlib");
let masterCsvLines = null;

async function fetchInstrumentMaster() {
  if (masterCsvLines) return masterCsvLines;
  console.log("Downloading Upstox instrument master…");
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await axios.get(
        "https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz",
        { responseType: "arraybuffer", timeout: 60000 }
      );
      const csv = zlib.gunzipSync(resp.data).toString("utf-8");
      masterCsvLines = csv.split("\n");
      console.log(`Instrument master loaded (${masterCsvLines.length} rows).`);
      return masterCsvLines;
    } catch (err) {
      lastErr = err;
      console.error(`  download attempt ${attempt}/3 failed (${err.code || err.message}), retrying...`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

// Robust column finder: tries an exact (case-insensitive) name match first,
// then falls back to a "contains" search over a list of likely substrings.
// This survives Upstox silently renaming/reordering the CSV header, which is
// what broke the old exact-match-only lookup.
function findColumn(header, exactNames, containsHints) {
  const lower = header.map((h) => h.trim().toLowerCase());
  for (const name of exactNames) {
    const i = lower.indexOf(name.toLowerCase());
    if (i >= 0) return i;
  }
  for (const hint of containsHints) {
    const i = lower.findIndex((h) => h.includes(hint.toLowerCase()));
    if (i >= 0) return i;
  }
  return -1;
}

// Splits one CSV line respecting double-quoted fields, so a comma inside a
// quoted value (e.g. a company name like "Foo, Bar Ltd") doesn't shift every
// column after it out of alignment — a plain .split(",") silently breaks
// this and misresolves instrument_keys with no error at all.
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function resolveMcxKeys() {
  console.log("Resolving current MCX contract keys from instrument master...");
  const lines = await fetchInstrumentMaster();
  const header = splitCsvLine(lines[0].replace(/\r$/, ""));
  console.log("  [DEBUG] Instrument master header columns:", JSON.stringify(header));
  const iKey = findColumn(header, ["instrument_key"], ["instrument_key", "instrumentkey"]);
  const iName = findColumn(header, ["name"], ["name"]);
  const iExpiry = findColumn(header, ["expiry"], ["expiry"]);
  const iSeg = findColumn(header, ["segment", "exchange_segment", "exchange"], ["segment", "exchange"]);
  const iType = findColumn(header, ["instrument_type"], ["instrument_type"]);
  if (iKey < 0 || iSeg < 0 || iName < 0 || iExpiry < 0) {
    console.error(`  [ERROR] Could not find required MCX columns (iKey=${iKey}, iSeg=${iSeg}, iName=${iName}, iExpiry=${iExpiry}). Check the [DEBUG] header line above — share it so the column-name list can be updated.`);
  }
  if (iType < 0) {
    console.error(`  [WARN] No instrument_type column found — cannot exclude option strikes from MCX futures matching. Results may be wrong for heavily-optioned commodities like CRUDEOIL.`);
  }

  const mcxRolledKeys = []; // populated when a periodic refresh finds a rolled contract

  for (const sym of MCX_SYMBOLS) {
    // Among all MCX_FO rows for this commodity, pick the soonest expiry
    // that's still in the future — the current active/front-month
    // contract, i.e. the one Upstox is actually streaming ticks for.
    //
    // BUG FIX: this used to match on segment+name alone, with no filter
    // on instrument_type. For lightly-optioned commodities (GOLD, SILVER,
    // NATURALGAS) that happened to work by luck, but CRUDEOIL has dozens
    // of CE/PE option strikes sharing the exact same name ("CRUDEOIL")
    // and the exact same expiry as the future — so the "soonest expiry"
    // tie-break could silently resolve to an OPTION STRIKE's instrument_key
    // instead of the FUTURE's. Upstox then had no live LTP feed for that
    // key in the way the dashboard expects, so CRUDEOIL never went live.
    // Explicitly require instrument_type === "FUT" so only real futures
    // contracts are ever candidates.
    let best = null;
    let matchedRowsSeen = 0;
    let optionStrikesSkipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const row = splitCsvLine(lines[i]);
      if (!row[iSeg] || !row[iSeg].toUpperCase().includes("MCX")) continue;
      // BUG FIX: Upstox sometimes writes commodity names with a space
      // ("CRUDE OIL" instead of "CRUDEOIL"), which made a plain .includes()
      // match zero rows at all for CRUDEOIL even though the contract
      // exists — strip all whitespace from both sides before comparing.
      const normName = (row[iName] || "").toUpperCase().replace(/\s+/g, "");
      if (!normName.includes(sym)) continue;
      matchedRowsSeen++;
      // BUG FIX: this used to require instrument_type === "FUT" exactly,
      // which is the code NSE stock/index futures use. MCX commodity
      // futures come back under a different type value (e.g. "FUTCOM"),
      // so every single MCX row was being classified as an "option
      // strike" and skipped — GOLD/SILVER/NATURALGAS never went live
      // even though thousands of name-matched rows existed. Any type
      // that STARTS WITH "FUT" is a futures contract; only OPT*/CE/PE
      // types are option strikes.
      if (iType >= 0 && row[iType] && !row[iType].toUpperCase().startsWith("FUT")) {
        optionStrikesSkipped++;
        continue; // skip CE/PE option strikes — futures only
      }
      const expiryRaw = row[iExpiry];
      // Upstox's complete.csv.gz has shipped expiry as either epoch-ms
      // (plain number) or an ISO date string ("2026-07-28") — Number()
      // on the ISO form is NaN, which silently skipped EVERY row here
      // (not just CRUDEOIL) once the format changed. Try numeric first,
      // fall back to Date.parse for ISO strings.
      let expiryMs = Number(expiryRaw);
      if (!expiryMs) expiryMs = Date.parse(expiryRaw);
      if (!expiryMs || expiryMs < Date.now()) continue; // skip expired contracts
      if (!best || expiryMs < best.expiryMs) best = { key: row[iKey], expiryMs };
    }
    if (best) {
      // Re-run safe: if this symbol is already in INSTRUMENTS (e.g. this is
      // a periodic rollover refresh, not the first run), update the
      // existing entry's key in place instead of pushing a duplicate —
      // and report the change so the caller can resubscribe the live feed.
      const existing = INSTRUMENTS.find((i) => i.category === "commodity" && i.symbol === sym);
      if (existing) {
        if (existing.key !== best.key) {
          console.log(`  MCX ${sym}: contract rolled -> ${best.key} (was ${existing.key}, expires ${new Date(best.expiryMs).toDateString()})`);
          mcxRolledKeys.push({ symbol: sym, oldKey: existing.key, newKey: best.key });
          existing.key = best.key;
        }
      } else {
        INSTRUMENTS.push({ key: best.key, symbol: sym, category: "commodity" });
        console.log(`  MCX ${sym}: resolved -> ${best.key} (expires ${new Date(best.expiryMs).toDateString()}, ${matchedRowsSeen} name-matched rows, ${optionStrikesSkipped} option strikes skipped)`);
      }
    } else {
      console.error(`  MCX ${sym}: no active FUT contract found (${matchedRowsSeen} name-matched rows seen, ${optionStrikesSkipped} were option strikes) — will stay OFFLINE`);
    }
  }
  const liveMcx = INSTRUMENTS.filter((i) => i.category === "commodity").map((i) => i.symbol);
  const failedMcx = MCX_SYMBOLS.filter((s) => !liveMcx.includes(s));
  console.log(`  MCX SUMMARY: live=[${liveMcx.join(", ") || "none"}] failed=[${failedMcx.join(", ") || "none"}]`);
  return mcxRolledKeys;
}

// BUG FIX: resolveMcxKeys() only ever ran once, at process startup. MCX
// futures (CRUDEOIL especially) roll to a new front-month contract
// mid-month, not at a clean day boundary — and this relay is meant to be
// left running for days/weeks in Termux, not restarted every session.
// Once the previously-resolved contract expired, Upstox silently stopped
// sending ticks for that instrument_key, so the dashboard just kept
// displaying whatever the last live tick had been — looking like "rates
// frozen a month ago" instead of an obvious error. Also, fetchInstrumentMaster()
// caches the CSV forever (masterCsvLines), so a naive re-call would just
// re-read the same stale snapshot from startup — the cache must be
// cleared first so the refresh actually sees new contracts.
async function refreshMcxKeysIfRolled() {
  try {
    masterCsvLines = null; // force a fresh instrument-master download
    const rolled = await resolveMcxKeys();
    if (rolled.length && activeStreamer) {
      const newKeys = rolled.map((r) => r.newKey);
      console.log(`MCX rollover: subscribing ${newKeys.length} new contract key(s):`, newKeys.join(", "));
      activeStreamer.subscribe(newKeys, "full");
      // Best-effort — old expired keys just go quiet once Upstox stops
      // streaming them; not fatal if unsubscribe isn't supported/throws.
      try { activeStreamer.unsubscribe(rolled.map((r) => r.oldKey), "full"); } catch (e) { /* ignore */ }
    }
  } catch (err) {
    console.error("MCX rollover refresh failed (will retry on next scheduled check):", err.message);
  }
}

// ---------------------------------------------------------------
// GOI Bond Futures (10Y notional) + 91-Day T-Bill Futures — NSE
// Interest Rate Derivatives (IRD) segment. Same live-resolve pattern
// as resolveMcxKeys() above: contracts roll to a new expiry, so we
// find the current front-month contract from the instrument master
// instead of hardcoding a key.
//
// HONEST LIMITATION, read before touching couponPct/maturityYears
// below: these futures trade on PRICE, not yield. NSE's 10Y IRF
// contract is cash-settled against a notional 10-year GOI bond with
// a fixed notional coupon (7.00% as of this write-up — NSE can and
// does change this notional coupon between contract series; verify
// on nseindia.com's IRD contract specs page if the resolved yield
// looks obviously wrong, e.g. miles away from RBI's published G-Sec
// rate). couponPct/maturityYears/freq below are that assumption, not
// a fetched fact — and only matters when CCIL hasn't published a
// fresher number yet (see scrapeCcilYields() below, which overrides
// this the moment it succeeds). The 91-day T-Bill has no such ambiguity — it's a
// pure discount instrument, day-count math only, no coupon guess
// involved.
const BOND_FUTURES_CONFIG = [
  {
    symbol: "GOI10Y", category: "bond", kind: "bond",
    nameHints: ["NBF", "10Y", "10 YR", "10YR", "GOI", "GSEC", "G-SEC", "GS"],
    couponPct: 7.00, maturityYears: 10, freq: 2,
  },
  {
    symbol: "TBILL91D", category: "bond", kind: "tbill",
    nameHints: ["91DTB", "91D", "91 D", "T-BILL", "TBILL"],
    daysToMaturity: 91,
  },
];

function tbillYieldFromPrice(price, daysToMaturity) {
  if (price == null || price <= 0) return null;
  // Standard T-Bill discount-to-yield conversion (money-market
  // convention, face value 100): annualized simple yield off the
  // discount, not a compounding YTM — matches how RBI/FBIL quote
  // T-Bill cut-off yields.
  return ((100 - price) / price) * (365 / daysToMaturity) * 100;
}

function bondYtmFromPrice(price, couponPct, years, freq = 2) {
  if (price == null || price <= 0) return null;
  const periods = Math.round(years * freq);
  const coupon = (couponPct / 100) * 100 / freq; // per-period cash flow, face value 100
  const face = 100;
  const pv = (r) => {
    let sum = 0;
    for (let t = 1; t <= periods; t++) sum += coupon / Math.pow(1 + r, t);
    return sum + face / Math.pow(1 + r, periods);
  };
  const dPv = (r) => {
    let sum = 0;
    for (let t = 1; t <= periods; t++) sum += (-t * coupon) / Math.pow(1 + r, t + 1);
    return sum + (-periods * face) / Math.pow(1 + r, periods + 1);
  };
  // Newton-Raphson solve for per-period yield, starting from the
  // coupon rate itself (a bond priced near par has YTM ~= coupon, so
  // this converges in a handful of iterations for realistic prices).
  let r = couponPct / 100 / freq;
  for (let i = 0; i < 100; i++) {
    const diff = pv(r) - price;
    if (Math.abs(diff) < 1e-7) break;
    const deriv = dPv(r);
    if (!deriv) break;
    const next = r - diff / deriv;
    if (!isFinite(next) || next <= -0.99) break; // guard against divergence on bad input
    r = next;
  }
  return r * freq * 100; // annualized %, matches how G-Sec yields are quoted
}

async function resolveBondFuturesKeys() {
  console.log("Resolving current GOI 10Y / 91D T-Bill futures keys from instrument master...");
  const lines = await fetchInstrumentMaster();
  const header = splitCsvLine(lines[0].replace(/\r$/, ""));
  const iKey = findColumn(header, ["instrument_key"], ["instrument_key", "instrumentkey"]);
  const iName = findColumn(header, ["name"], ["name"]);
  const iExpiry = findColumn(header, ["expiry"], ["expiry"]);
  const iSeg = findColumn(header, ["segment", "exchange_segment", "exchange"], ["segment", "exchange"]);
  if (iKey < 0 || iSeg < 0 || iName < 0 || iExpiry < 0) {
    console.error(`  [ERROR] Could not find required bond-futures columns (iKey=${iKey}, iSeg=${iSeg}, iName=${iName}, iExpiry=${iExpiry}).`);
    return;
  }

  for (const cfg of BOND_FUTURES_CONFIG) {
    let best = null;
    const candidates = [];
    for (let i = 1; i < lines.length; i++) {
      const row = splitCsvLine(lines[i]);
      if (!row[iSeg] || !row[iSeg].toUpperCase().includes("NSE_FO")) continue;
      const nameUp = (row[iName] || "").toUpperCase();
      if (!cfg.nameHints.some((h) => nameUp.includes(h))) continue;
      candidates.push(row[iName]);
      const expiryRaw = row[iExpiry];
      let expiryMs = Number(expiryRaw);
      if (!expiryMs) expiryMs = Date.parse(expiryRaw);
      if (!expiryMs || expiryMs < Date.now()) continue;
      if (!best || expiryMs < best.expiryMs) best = { key: row[iKey], expiryMs, name: row[iName] };
    }
    if (best) {
      INSTRUMENTS.push({ key: best.key, symbol: cfg.symbol, category: cfg.category, bondMeta: cfg });
      console.log(`  ${cfg.symbol}: resolved -> ${best.key} ("${best.name}", expires ${new Date(best.expiryMs).toDateString()})`);
    } else {
      console.error(`  ${cfg.symbol}: no active NSE_FO contract found matching hints [${cfg.nameHints.join(", ")}].` +
        (candidates.length ? ` Similarly-named rows seen (any expiry): ${[...new Set(candidates)].slice(0, 10).join(" | ")}` : " No name matches at all — check nameHints against actual NSE contract naming.") +
        " Will stay OFFLINE.");
    }
  }
}

// ---------------------------------------------------------------
// CCIL Tenorwise Indicative Yields — scraper, NOT an API (CCIL
// doesn't offer one). This is the "authoritative" yield source: once
// a scrape succeeds, its 91-day/10-year values OVERRIDE whatever the
// futures-price-derived yieldPct (bondYtmFromPrice/tbillYieldFromPrice
// above) was showing, because these are the actual RBI-backed
// published yields instead of a price->yield estimate off an assumed
// notional coupon. If a scrape ever fails (selector break, network,
// site down), we simply skip that cycle and whatever was last
// broadcast (CCIL or futures-derived fallback) keeps standing — never
// blank it out over one failed fetch.
//
// LEGAL NOTE, read before deploying this beyond personal/non-commercial
// use: ccilindia.com's own site states it does not authorize
// commercial use of this data without written permission. This is
// built for a personal dashboard, not resale — if that ever changes,
// get CCIL's permission first or switch to a licensed data vendor.
//
// Runs once at startup, then every 60 minutes (CCIL updates once
// daily; hourly is already more than enough and keeps load on their
// site minimal, per their own fair-use expectation).
const CCIL_URL = "https://www.ccilindia.com/tenorwise-indicative-yields";
const CCIL_TENOR_HINTS = {
  TBILL91D: ["91 day", "91day", "91-day", "91d"],
  GOI10Y: ["10 year", "10year", "10-year", "10 yr", "10yr"],
};

async function scrapeCcilYields() {
  console.log("Scraping CCIL tenorwise indicative yields...");
  let html;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await axios.get(CCIL_URL, {
        timeout: 20000,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
      });
      html = resp.data;
      break;
    } catch (err) {
      console.error(`  CCIL fetch attempt ${attempt}/3 failed (${err.code || err.message})${attempt < 3 ? ", retrying..." : ", giving up this cycle."}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  if (!html) return;

  const $ = cheerio.load(html);
  // Generic row scan: every <tr> on the page is checked as text, so
  // this survives CCIL reordering/relabeling columns (same defensive
  // spirit as findColumn() above) — we don't depend on a specific
  // table id or column position, just "does this row's text mention
  // the tenor, and does it contain a decimal number".
  const rows = [];
  $("tr").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text) rows.push(text);
  });

  const found = {};
  for (const [symbol, hints] of Object.entries(CCIL_TENOR_HINTS)) {
    const match = rows.find((r) => hints.some((h) => r.toLowerCase().includes(h)));
    if (!match) {
      console.error(`  CCIL: no row found for ${symbol} (hints: ${hints.join(", ")}). Page structure may have changed.`);
      continue;
    }
    const numMatch = match.match(/(\d+\.\d+)/g);
    if (!numMatch || !numMatch.length) {
      console.error(`  CCIL: matched a row for ${symbol} but found no decimal number in it: "${match}"`);
      continue;
    }
    // Tenorwise yield tables typically list the yield% as the last
    // number in the row (tenor label first, then rate). Take the last
    // match rather than the first to avoid picking up a tenor-in-days
    // number (e.g. "91") being mistaken for the yield itself.
    const yieldPct = Number(numMatch[numMatch.length - 1]);
    if (!yieldPct || yieldPct <= 0 || yieldPct > 20) {
      console.error(`  CCIL: parsed an out-of-range value (${yieldPct}) for ${symbol} from row "${match}" — skipping, looks like a mis-parse.`);
      continue;
    }
    found[symbol] = yieldPct;
  }

  if (Object.keys(found).length) {
    const data = {};
    for (const [symbol, yieldPct] of Object.entries(found)) {
      data[symbol] = { symbol, category: "bond", yieldPct, yieldSource: "CCIL" };
    }
    broadcast({ type: "market", data });
    console.log(`  CCIL yields updated: ${Object.entries(found).map(([s, y]) => `${s}=${y}%`).join(", ")}`);
  } else {
    console.error("  CCIL: scrape ran but no tenor matched — keeping previous yield values standing.");
  }
}

function startCcilYieldPolling() {
  scrapeCcilYields();
  setInterval(scrapeCcilYields, 60 * 60 * 1000);
}

// ---------------------------------------------------------------
// CFTC Commitment of Traders (Traders in Financial Futures, short
// format) — feeds the dashboard's cotPositioning indicator. This is
// the CFTC's own weekly "Traders in Financial Futures" report, the
// same institutional positioning data macro hedge funds/CTAs watch.
// Published every Friday ~3:30pm ET, reflecting the prior Tuesday's
// positions — it does NOT change intraday, so this is polled slowly.
//
// PARSING APPROACH (read before touching column offsets below): the
// page is fixed-width text-in-HTML, one block per contract, e.g.:
//   E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE ... Open Interest is X
//   Positions  <Dealer L> <Dealer S> <Dealer Sprd> <AssetMgr L> <AssetMgr S>
//              <AssetMgr Sprd> <LevFunds L> <LevFunds S> <LevFunds Sprd> ...
// So after finding the "Positions" line inside a contract's own block,
// the 7th and 8th numbers are Leveraged Funds Long/Short. This is a
// documented, honest guess about a fixed column order CFTC has used
// for years — same defensive spirit as findColumn()/CCIL's row-hint
// scan elsewhere in this file: if CFTC ever reorders the format, this
// will very likely just fail to parse 8+ numbers and skip the symbol
// with a clear error, not silently return a wrong number (guarded by
// the nums.length < 8 check below).
const COT_URL = "https://www.cftc.gov/dea/futures/financial_lf.htm";
const COT_SECTIONS = {
  SPX: { hints: ["E-MINI S&P 500", "S&P 500 CONSOLIDATED"] },
  DXY: { hints: ["USD INDEX", "U.S. DOLLAR INDEX", "DOLLAR INDEX"] },
};
let lastCotNet = {}; // { SPX: <net contracts from last successful scrape>, DXY: ... } — used to compute week-over-week trend

async function scrapeCotPositioning() {
  console.log("Scraping CFTC Commitment of Traders (Traders in Financial Futures)...");
  let text;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await axios.get(COT_URL, {
        timeout: 20000,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
      });
      text = cheerio.load(resp.data).text().replace(/\r/g, "");
      break;
    } catch (err) {
      console.error(`  CFTC COT fetch attempt ${attempt}/3 failed (${err.code || err.message})${attempt < 3 ? ", retrying..." : ", giving up this cycle."}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  if (!text) return;
  const textUpper = text.toUpperCase();

  const found = {};
  for (const [symbol, cfg] of Object.entries(COT_SECTIONS)) {
    let sectionStart = -1;
    for (const hint of cfg.hints) {
      const idx = textUpper.indexOf(hint);
      if (idx >= 0) { sectionStart = idx; break; }
    }
    if (sectionStart < 0) {
      console.error(`  CFTC COT: no section found for ${symbol} (hints: ${cfg.hints.join(", ")}). Page structure may have changed.`);
      continue;
    }
    // Grab a bounded window after the section header — enough to contain
    // the "Positions" line and its numbers, not so much it bleeds into
    // the NEXT contract's block.
    const windowText = text.slice(sectionStart, sectionStart + 1200);
    const posIdx = windowText.search(/Positions/i);
    if (posIdx < 0) {
      console.error(`  CFTC COT: found ${symbol}'s section but no "Positions" line inside it — skipping.`);
      continue;
    }
    const numsText = windowText.slice(posIdx, posIdx + 400);
    const nums = (numsText.match(/-?[\d,]+/g) || [])
      .map((n) => Number(n.replace(/,/g, "")))
      .filter((n) => !Number.isNaN(n));
    if (nums.length < 8) {
      console.error(`  CFTC COT: only parsed ${nums.length} numbers for ${symbol}, need at least 8 (Dealer L/S/Sprd, AssetMgr L/S/Sprd, LevFunds L/S) — skipping, format may have shifted.`);
      continue;
    }
    const levLong = nums[6];
    const levShort = nums[7];
    const net = levLong - levShort;
    found[symbol] = { levLong, levShort, net };
  }

  if (Object.keys(found).length) {
    const data = {};
    if (found.SPX) {
      data.spxNetLev = found.SPX.net;
      data.spxPrevNetLev = lastCotNet.SPX != null ? lastCotNet.SPX : found.SPX.net;
    }
    if (found.DXY) {
      data.dxyNetLev = found.DXY.net;
      data.dxyPrevNetLev = lastCotNet.DXY != null ? lastCotNet.DXY : found.DXY.net;
    }
    if (data.spxNetLev != null && data.dxyNetLev != null) {
      data.hasData = true;
      broadcast({ type: "indicators", data: { cotPositioning: data } });
      console.log(`  CFTC COT updated: S&P500 Leveraged Funds net=${found.SPX?.net} (prev ${data.spxPrevNetLev}), DXY Leveraged Funds net=${found.DXY?.net} (prev ${data.dxyPrevNetLev})`);
      // Only roll the "previous week" baseline forward once we've
      // actually broadcast a real trend off it — keeps prev/current
      // distinct across polls within the same week (page unchanged) and
      // only advances when CFTC actually republishes new numbers.
      if (found.SPX) lastCotNet.SPX = found.SPX.net;
      if (found.DXY) lastCotNet.DXY = found.DXY.net;
    } else {
      console.error("  CFTC COT: scrape ran but couldn't resolve both S&P 500 and Dollar Index legs — keeping previous indicator values standing.");
    }
  } else {
    console.error("  CFTC COT: scrape ran but no section matched at all — keeping previous indicator values standing.");
  }
}

function startCotPositioningPolling() {
  scrapeCotPositioning(); // fire-and-forget, NOT awaited — same reasoning as startInvestingYieldPolling below
  // Data only changes once a week (Fridays ~3:30pm ET) — poll every 6h,
  // frequent enough to pick up the update same-day without hammering CFTC.
  setInterval(scrapeCotPositioning, 6 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------
// 💎 Global macro diamonds — HY Credit Spread + Global Net Liquidity.
// Both pulled from FRED (Federal Reserve Economic Data), a free public
// data source with no API key required for the plain CSV endpoint used
// here. FRED updates these series once a day (HY OAS, RRP) or once a
// week (Fed balance sheet, TGA) — not intraday — so this is polled on
// the same slow cadence as the CCIL/COT scrapers above, not every tick.
const FRED_CSV_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=";
const FRED_SERIES = {
  hyOas: "BAMLH0A0HYM2",   // ICE BofA US High Yield Index OAS, in percent (e.g. 3.45 = 345bps)
  fedAssets: "WALCL",       // Fed total assets, in millions of USD, weekly
  reverseRepo: "RRPONTSYD", // ON Reverse Repo, in billions of USD, daily
  treasuryGenAcct: "WTREGEN", // Treasury General Account, in billions of USD, weekly
  realYields10Y: "DFII10",  // 10Y TIPS real yield, percent, daily
  termPremium: "THREEFYTP10", // 10Y term premium, Kim-Wright model (NOT NY Fed ACM — ACM has no FRED/CSV endpoint), percent, daily
  vixIndex: "VIXCLS",       // CBOE VIX close, daily
  usFinStress: "STLFSI4",  // St. Louis Fed Financial Stress Index, weekly. This is
                            // NOT NYU Stern's SRISK — different institution, different
                            // methodology (18-series composite vs firm-level capital
                            // shortfall). Used because SRISK itself has no public
                            // CSV/API anywhere (V-Lab is a JS-rendered SPA with nothing
                            // scrapable found after a full search) — this is a real,
                            // free, live alternative systemic-stress gauge, labeled
                            // honestly as its own thing, not as a SRISK substitute.
  // 👑 KOHINOOR #1 — SOFR-EFFR spread. Money-market PLUMBING stress —
  // this is what the NY Fed itself watches for repo-market seizures
  // (this exact spread blew out in the Sept-2019 repo crisis, days
  // before anyone else noticed). More foundational than a credit
  // spread: this isn't "are markets nervous", it's "is the overnight
  // funding system itself jamming up".
  sofr: "SOFR",   // Secured Overnight Financing Rate, percent, daily
  effr: "DFF",    // Effective Federal Funds Rate, percent, daily
  // 👑 KOHINOOR #2 — 10Y-3M Treasury yield curve. THE most legendary
  // recession predictor in macro finance — preceded every US recession
  // since 1955, and is literally an input to the NY Fed's own published
  // recession-probability model. FRED computes this spread itself as
  // one series, so this is a single clean fetch.
  yieldCurve10Y3M: "T10Y3M", // 10Y Treasury minus 3M Treasury, percent, daily
  // IORB — Interest on Reserve Balances, the Fed's administered floor
  // rate. Paired with SOFR for usdFundingSqueeze below (distinct from
  // sofrFundingStress's SOFR-EFFR leg — IORB and EFFR are different
  // reference rates, both genuinely watched by Fed-watchers).
  iorb: "IORB", // percent, daily
  // ── NEW (relay-106) ──
  igOas:         "BAMLC0A0CM",  // ICE BofA US IG Corporate Bond OAS — cdxIgSpread proxy, percent
  natGasStorage: "NGSUPPSC",    // US Natural Gas in Underground Storage, Bcf, weekly (natGasWeather)
  // ─────────────────────
  // ECB total assets (Eurosystem consolidated weekly financial
  // statement), mirrored on FRED in millions of EUR, weekly — same
  // cadence as WALCL. Combined with WALCL (via the day's EUR/USD rate)
  // for g3BalanceSheet below. BOJ leg intentionally left out (see note
  // at g3BalanceSheet in SignalBoard.jsx).
  ecbAssets: "ECBASSETSW", // millions of EUR, weekly
  eurUsdFx: "DEXUSEU", // USD per EUR, daily
};
let lastHyOasBps = null;
let lastNetLiquidityB = null;
let lastRealYieldPct = null;
let lastTermPremiumBps = null;
let lastVixValue = null;
let lastUsFinStressBps = null;
let lastSofrStressBps = null;
let lastYieldCurveBps = null;
let lastUsdFundingSqueezeBps = null;
let lastG3TotalB = null;
// ── NEW (relay-106) ──
let lastIgOasBps      = null;   // cdxIgSpread prev reading
let lastRepoSpreadBps = null;   // repoStress prev reading
let lastNatGasBcf     = null;   // natGasWeather curr storage level
let prevNatGasBcf     = null;   // natGasWeather prior-week level

async function fetchFredLatest(seriesId) {
  const resp = await axios.get(`${FRED_CSV_BASE}${seriesId}`, {
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
  });
  const lines = resp.data.trim().split("\n");
  // FRED CSVs sometimes have a "." (missing) for the most recent row(s)
  // before the data catches up — walk backward from the end to find the
  // last row that actually has a real number.
  for (let i = lines.length - 1; i >= 1; i--) {
    const parts = lines[i].split(",");
    if (parts.length < 2) continue;
    const value = Number(parts[1]);
    if (parts[1] && parts[1].trim() !== "." && !Number.isNaN(value)) {
      return { date: parts[0], value };
    }
  }
  return null;
}

// ---------------------------------------------------------------
// VVIX — CBOE's own CDN, same file pattern as VIX_History.csv, free,
// no key required, updated once a day. Format is "DATE,VVIX" with DATE
// as MM/DD/YYYY (NOT FRED's YYYY-MM-DD), so this gets its own tiny
// parser instead of reusing fetchFredLatest. Confirmed live on CBOE's
// CDN — this is the real VIX-of-VIX index, not a proxy or estimate.
// (Earlier claim that VVIX had "no free feed" was wrong — corrected here.)
const VVIX_CSV_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VVIX_History.csv";

async function fetchVvixLatest() {
  const resp = await axios.get(VVIX_CSV_URL, {
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" },
  });
  const lines = resp.data.trim().split("\n");
  for (let i = lines.length - 1; i >= 1; i--) {
    const parts = lines[i].split(",");
    if (parts.length < 2) continue;
    const value = Number(parts[1]);
    if (parts[1] && parts[1].trim() !== "" && !Number.isNaN(value)) {
      return { date: parts[0], value };
    }
  }
  return null;
}

async function scrapeGlobalMacroDiamonds() {
  console.log("Scraping FRED for HY Credit Spread + Global Net Liquidity + Real Yields + Term Premium + VIX + SOFR Funding Stress + Yield Curve + USD Funding Squeeze (IORB) + G3 Balance Sheet (ECB+FX), and CBOE for VVIX...");
  let hyOas, fedAssets, reverseRepo, tga, realYield, termPremium, vix, vvix;
  try { hyOas = await fetchFredLatest(FRED_SERIES.hyOas); } catch (err) { console.error(`  FRED ${FRED_SERIES.hyOas} fetch failed: ${err.code || err.message}`); }
  try { fedAssets = await fetchFredLatest(FRED_SERIES.fedAssets); } catch (err) { console.error(`  FRED ${FRED_SERIES.fedAssets} fetch failed: ${err.code || err.message}`); }
  try { reverseRepo = await fetchFredLatest(FRED_SERIES.reverseRepo); } catch (err) { console.error(`  FRED ${FRED_SERIES.reverseRepo} fetch failed: ${err.code || err.message}`); }
  try { tga = await fetchFredLatest(FRED_SERIES.treasuryGenAcct); } catch (err) { console.error(`  FRED ${FRED_SERIES.treasuryGenAcct} fetch failed: ${err.code || err.message}`); }
  try { realYield = await fetchFredLatest(FRED_SERIES.realYields10Y); } catch (err) { console.error(`  FRED ${FRED_SERIES.realYields10Y} fetch failed: ${err.code || err.message}`); }
  try { termPremium = await fetchFredLatest(FRED_SERIES.termPremium); } catch (err) { console.error(`  FRED ${FRED_SERIES.termPremium} fetch failed: ${err.code || err.message}`); }
  try { vix = await fetchFredLatest(FRED_SERIES.vixIndex); } catch (err) { console.error(`  FRED ${FRED_SERIES.vixIndex} fetch failed: ${err.code || err.message}`); }
  let usFinStress;
  try { usFinStress = await fetchFredLatest(FRED_SERIES.usFinStress); } catch (err) { console.error(`  FRED ${FRED_SERIES.usFinStress} fetch failed: ${err.code || err.message}`); }
  try { vvix = await fetchVvixLatest(); } catch (err) { console.error(`  CBOE VVIX fetch failed: ${err.code || err.message}`); }
  let sofr, effr, yieldCurve;
  try { sofr = await fetchFredLatest(FRED_SERIES.sofr); } catch (err) { console.error(`  FRED ${FRED_SERIES.sofr} fetch failed: ${err.code || err.message}`); }
  try { effr = await fetchFredLatest(FRED_SERIES.effr); } catch (err) { console.error(`  FRED ${FRED_SERIES.effr} fetch failed: ${err.code || err.message}`); }
  try { yieldCurve = await fetchFredLatest(FRED_SERIES.yieldCurve10Y3M); } catch (err) { console.error(`  FRED ${FRED_SERIES.yieldCurve10Y3M} fetch failed: ${err.code || err.message}`); }
  let iorb, ecbAssets, eurUsdFx;
  try { iorb = await fetchFredLatest(FRED_SERIES.iorb); } catch (err) { console.error(`  FRED ${FRED_SERIES.iorb} fetch failed: ${err.code || err.message}`); }
  try { ecbAssets = await fetchFredLatest(FRED_SERIES.ecbAssets); } catch (err) { console.error(`  FRED ${FRED_SERIES.ecbAssets} fetch failed: ${err.code || err.message}`); }
  try { eurUsdFx = await fetchFredLatest(FRED_SERIES.eurUsdFx); } catch (err) { console.error(`  FRED ${FRED_SERIES.eurUsdFx} fetch failed: ${err.code || err.message}`); }
  // ── NEW (relay-106) ──
  let igOas, natGasStorageNow;
  try { igOas = await fetchFredLatest(FRED_SERIES.igOas); } catch (err) { console.error(`  FRED ${FRED_SERIES.igOas} fetch failed: ${err.code || err.message}`); }
  try { natGasStorageNow = await fetchFredLatest(FRED_SERIES.natGasStorage); } catch (err) { console.error(`  FRED ${FRED_SERIES.natGasStorage} fetch failed: ${err.code || err.message}`); }
  // ────────────────────

  const data = {};

  if (hyOas) {
    const oasBps = Math.round(hyOas.value * 100); // FRED gives percent, dashboard shows bps
    data.hyCreditSpread = {
      oas: oasBps,
      prevOas: lastHyOasBps != null ? lastHyOasBps : oasBps,
      hasData: true,
    };
    console.log(`  HY OAS (${hyOas.date}): ${oasBps}bps (prev ${data.hyCreditSpread.prevOas}bps)`);
    lastHyOasBps = oasBps;
  } else {
    console.error("  HY Credit Spread: could not parse FRED series — keeping previous value standing.");
  }

  if (fedAssets && reverseRepo && tga) {
    // WALCL is in millions -> /1000 to billions, to match RRP/TGA's own units.
    const netLiquidityB = Math.round(fedAssets.value / 1000 - reverseRepo.value - tga.value);
    data.globalNetLiquidity = {
      netLiquidity: netLiquidityB,
      prevNetLiquidity: lastNetLiquidityB != null ? lastNetLiquidityB : netLiquidityB,
      hasData: true,
    };
    console.log(`  Global Net Liquidity: $${netLiquidityB}B (prev $${data.globalNetLiquidity.prevNetLiquidity}B) — Fed B/S=$${Math.round(fedAssets.value / 1000)}B, RRP=$${reverseRepo.value}B, TGA=$${tga.value}B`);
    lastNetLiquidityB = netLiquidityB;
  } else {
    console.error("  Global Net Liquidity: one or more FRED legs (WALCL/RRPONTSYD/WTREGEN) failed — keeping previous value standing.");
  }

  if (realYield) {
    const tipsYield = Number(realYield.value);
    data.realYields = {
      tipsYield,
      prevTipsYield: lastRealYieldPct != null ? lastRealYieldPct : tipsYield,
      hasData: true,
    };
    console.log(`  10Y Real Yield (${realYield.date}): ${tipsYield}% (prev ${data.realYields.prevTipsYield}%)`);
    lastRealYieldPct = tipsYield;
  } else {
    console.error("  US 10Y Real Yields: could not parse FRED series — keeping previous value standing.");
  }

  if (termPremium) {
    const tpBps = Math.round(termPremium.value * 100);
    data.usTermPremium = {
      premium: tpBps,
      prevPremium: lastTermPremiumBps != null ? lastTermPremiumBps : tpBps,
      hasData: true,
    };
    console.log(`  Term Premium (${termPremium.date}, Kim-Wright): ${tpBps}bps (prev ${data.usTermPremium.prevPremium}bps)`);
    lastTermPremiumBps = tpBps;
  } else {
    console.error("  US Term Premium: could not parse FRED series — keeping previous value standing.");
  }

  if (vix && vvix) {
    // Both legs are now live: VIX from FRED (VIXCLS), VVIX from CBOE's
    // own CDN (VVIX_History.csv). Same evaluate()/reason() thresholds
    // in SignalBoard.jsx are untouched — only the data source for the
    // vvixValue leg moved from manual entry to a live feed.
    const vixVal = Number(vix.value);
    const vvixVal = Number(vvix.value);
    data.vvixVixDivergence = { vixValue: vixVal, vvixValue: vvixVal, hasData: true };
    console.log(`  VIX (${vix.date}): ${vixVal}, VVIX (${vvix.date}): ${vvixVal}`);
    lastVixValue = vixVal;
  } else if (vix) {
    // VVIX leg failed this poll — send VIX alone so that leg still
    // updates; vvixValue is left out of this broadcast so the
    // frontend's shallow-merge keeps standing on the last known-good
    // VVIX rather than overwriting it with something stale/undefined.
    const vixVal = Number(vix.value);
    data.vvixVixDivergence = { vixValue: vixVal, hasData: true };
    console.log(`  VIX (${vix.date}): ${vixVal} (VVIX leg failed this poll — keeping previous VVIX standing)`);
    lastVixValue = vixVal;
  } else {
    console.error("  VVIX/VIX divergence: could not parse VIX from FRED — keeping previous value standing.");
  }

  if (usFinStress) {
    // STLFSI4 is already in "stress units" (roughly a z-score), not a
    // percent, so used as-is — no bps conversion like HY OAS/Term
    // Premium get. Fed's own interpretation: 0 = normal, above zero =
    // above-average stress, below zero = below-average stress. This is
    // St. Louis Fed's own index — NOT NYU Stern's SRISK, a different
    // measure by a different institution, labeled as such on purpose.
    const stressVal = Number(usFinStress.value);
    data.usFinancialStress = {
      stress: stressVal,
      prevStress: lastUsFinStressBps != null ? lastUsFinStressBps : stressVal,
      hasData: true,
    };
    console.log(`  US Financial Stress Index (${usFinStress.date}, STLFSI4): ${stressVal} (prev ${data.usFinancialStress.prevStress})`);
    lastUsFinStressBps = stressVal;
  } else {
    console.error("  US Financial Stress Index (STLFSI4): could not parse FRED series — keeping previous value standing.");
  }

  if (sofr && effr) {
    // Normally near-zero (a few bps) — SOFR trading meaningfully above
    // EFFR is the classic repo-stress signature (collateral scarcity /
    // dealer balance-sheet strain), exactly what happened Sept 2019.
    const stressBps = Math.round((sofr.value - effr.value) * 100);
    data.sofrFundingStress = {
      stressBps,
      prevStressBps: lastSofrStressBps != null ? lastSofrStressBps : stressBps,
      hasData: true,
    };
    console.log(`  👑 SOFR-EFFR Funding Stress: SOFR(${sofr.date})=${sofr.value}% − EFFR(${effr.date})=${effr.value}% = ${stressBps}bps (prev ${data.sofrFundingStress.prevStressBps}bps)`);
    lastSofrStressBps = stressBps;
  } else {
    console.error("  👑 SOFR Funding Stress: SOFR or EFFR leg failed from FRED — keeping previous value standing.");
  }

  if (yieldCurve) {
    const curveBps = Math.round(yieldCurve.value * 100);
    data.yieldCurve10Y3M = {
      curveBps,
      prevCurveBps: lastYieldCurveBps != null ? lastYieldCurveBps : curveBps,
      hasData: true,
    };
    console.log(`  👑 10Y-3M Yield Curve (${yieldCurve.date}): ${curveBps}bps (prev ${data.yieldCurve10Y3M.prevCurveBps}bps)`);
    lastYieldCurveBps = curveBps;
  } else {
    console.error("  👑 10Y-3M Yield Curve: could not parse FRED T10Y3M series — keeping previous value standing.");
  }

  if (sofr && iorb) {
    // SOFR − IORB: normal repo markets keep SOFR close to IORB (the
    // Fed's administered floor); a widening spread signals reserve/
    // collateral scarcity. Distinct leg from sofrFundingStress's
    // SOFR-EFFR above — IORB and EFFR are different reference rates.
    const squeezeBps = Math.round((sofr.value - iorb.value) * 100);
    data.usdFundingSqueeze = {
      spread: squeezeBps,
      prevSpread: lastUsdFundingSqueezeBps != null ? lastUsdFundingSqueezeBps : squeezeBps,
      hasData: true,
    };
    console.log(`  USD Funding Squeeze: SOFR(${sofr.date})=${sofr.value}% − IORB(${iorb.date})=${iorb.value}% = ${squeezeBps}bps (prev ${data.usdFundingSqueeze.prevSpread}bps)`);
    lastUsdFundingSqueezeBps = squeezeBps;
  } else {
    console.error("  USD Funding Squeeze: SOFR or IORB leg failed from FRED — keeping previous value standing.");
  }

  if (fedAssets && ecbAssets && eurUsdFx) {
    // WALCL in millions USD -> billions. ECBASSETSW in millions EUR ->
    // convert to USD via the day's EUR/USD rate (DEXUSEU, USD per EUR)
    // -> billions. BOJ leg intentionally excluded (see comment at
    // g3BalanceSheet in SignalBoard.jsx) — this is a Fed+ECB partial
    // G3 reading, labeled as such.
    const fedB = fedAssets.value / 1000;
    const ecbUsdB = (ecbAssets.value * eurUsdFx.value) / 1000;
    const totalB = Math.round(fedB + ecbUsdB);
    data.g3BalanceSheet = {
      total: totalB,
      prevTotal: lastG3TotalB != null ? lastG3TotalB : totalB,
      hasData: true,
    };
    console.log(`  G3 Balance Sheet (Fed+ECB): Fed(${fedAssets.date})=$${Math.round(fedB)}B + ECB(${ecbAssets.date})=$${Math.round(ecbUsdB)}B (FX ${eurUsdFx.date}=${eurUsdFx.value}) = $${totalB}B (prev $${data.g3BalanceSheet.prevTotal}B)`);
    lastG3TotalB = totalB;
  } else {
    console.error("  G3 Balance Sheet: Fed/ECB/FX leg failed from FRED — keeping previous value standing.");
  }

  // ── NEW (relay-106): repoStress ──
  if (sofr && iorb) {
    const sofrBps   = Math.round(sofr.value * 100);
    const iorbBps   = Math.round(iorb.value * 100);
    const spreadNow = sofrBps - iorbBps;
    data.repoStress = {
      repoBps:    sofrBps,
      iorbBps:    iorbBps,
      prevSpread: lastRepoSpreadBps != null ? lastRepoSpreadBps : spreadNow,
      hasData:    true,
    };
    console.log(`  Repo Stress (SOFR-IORB): ${sofrBps}bps − ${iorbBps}bps = ${spreadNow}bps`);
    lastRepoSpreadBps = spreadNow;
  } else {
    console.error("  repoStress: SOFR or IORB leg failed — keeping previous value standing.");
  }

  // ── NEW (relay-106): cdxIgSpread ──
  if (igOas) {
    const spreadBps = Math.round(igOas.value * 100);
    data.cdxIgSpread = {
      spreadNow:  spreadBps,
      spreadPrev: lastIgOasBps != null ? lastIgOasBps : spreadBps,
      hasData:    true,
    };
    console.log(`  CDX IG proxy (BAMLC0A0CM, ${igOas.date}): ${spreadBps}bps`);
    lastIgOasBps = spreadBps;
  } else {
    console.error("  cdxIgSpread: BAMLC0A0CM fetch failed — keeping previous value standing.");
  }

  // ── NEW (relay-106): natGasWeather (FRED storage leg) ──
  if (natGasStorageNow) {
    const bcfNow = natGasStorageNow.value;
    if (prevNatGasBcf != null && lastNatGasBcf != null) {
      const changeThis = bcfNow - lastNatGasBcf;
      const changePrev = lastNatGasBcf - prevNatGasBcf;
      const surprise   = changePrev !== 0
        ? +((changePrev - changeThis) / Math.abs(changePrev) * 100).toFixed(1)
        : 0;
      data.natGasWeather = { demandSurprise: surprise, hasData: true };
      console.log(`  NatGas Storage (${natGasStorageNow.date}): ${bcfNow}Bcf W-o-W surprise=${surprise}%`);
    }
    prevNatGasBcf = lastNatGasBcf;
    lastNatGasBcf = bcfNow;
  } else {
    console.error("  natGasWeather: NGSUPPSC fetch failed — keeping previous value standing.");
  }
  // ─────────────────────────────────────────────────────────

  if (Object.keys(data).length) {
    broadcast({ type: "indicators", data });
  }
}

function startGlobalMacroDiamondsPolling() {
  scrapeGlobalMacroDiamonds(); // fire-and-forget, NOT awaited
  // Underlying series update daily/weekly, not intraday — poll every 6h,
  // same cadence as the CFTC COT scraper above.
  setInterval(scrapeGlobalMacroDiamonds, 6 * 60 * 60 * 1000);
}

// =============================================================
// ── NEW POLLING FUNCTIONS (relay-106 additions) ──────────────
// =============================================================

// ── Amihud Illiquidity
const NIFTY50_YAHOO_SYMBOLS = [
  "RELIANCE.NS","TCS.NS","HDFCBANK.NS","ICICIBANK.NS","INFY.NS","HINDUNILVR.NS",
  "ITC.NS","SBIN.NS","BHARTIARTL.NS","KOTAKBANK.NS","LT.NS","AXISBANK.NS",
  "BAJFINANCE.NS","ASIANPAINT.NS","MARUTI.NS","HCLTECH.NS","SUNPHARMA.NS",
  "TITAN.NS","ULTRACEMCO.NS","NESTLEIND.NS","WIPRO.NS","ONGC.NS","NTPC.NS",
  "POWERGRID.NS","M&M.NS","TATASTEEL.NS","TATAMOTORS.NS","ADANIENT.NS",
  "ADANIPORTS.NS","COALINDIA.NS","BAJAJFINSV.NS","DRREDDY.NS","GRASIM.NS",
  "HDFCLIFE.NS","BRITANNIA.NS","EICHERMOT.NS","CIPLA.NS","DIVISLAB.NS",
  "APOLLOHOSP.NS","HEROMOTOCO.NS","INDUSINDBK.NS","JSWSTEEL.NS","SBILIFE.NS",
  "TATACONSUM.NS","BPCL.NS","HINDALCO.NS","LTIM.NS","TECHM.NS",
];
const amihudHistory = [];

async function scrapeAmihudIlliquidity() {
  console.log("Amihud: fetching NIFTY 50 quotes from Yahoo Finance (.NS)...");
  let results;
  try {
    const resp = await axios.get(YAHOO_QUOTE_URL, {
      params: { symbols: NIFTY50_YAHOO_SYMBOLS.join(",") },
      timeout: 25000,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    results = resp.data?.quoteResponse?.result || [];
  } catch (err) {
    console.error(`  Amihud: Yahoo fetch failed (${err.code || err.message}) — skipping.`);
    return;
  }
  const ratios = [];
  for (const q of results) {
    const ltp = q.regularMarketPrice, vol = q.regularMarketVolume, chgPct = q.regularMarketChangePercent;
    if (!ltp || !vol || vol <= 0 || chgPct == null) continue;
    const dollarVol = ltp * vol;
    if (dollarVol <= 0) continue;
    ratios.push((Math.abs(chgPct / 100) / dollarVol) * 1e8);
  }
  if (ratios.length < 5) { console.error(`  Amihud: only ${ratios.length} stocks — skipping.`); return; }
  const illiqNow = +(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(4);
  amihudHistory.push({ t: Date.now(), ratio: illiqNow });
  if (amihudHistory.length > 20) amihudHistory.shift();
  const illiqAvg = +(amihudHistory.reduce((a, b) => a + b.ratio, 0) / amihudHistory.length).toFixed(4);
  broadcast({ type: "indicators", data: { amihudIlliquidity: { illiqNow, illiqAvg, hasData: amihudHistory.length >= 3 } } });
  console.log(`  Amihud: illiqNow=${illiqNow} illiqAvg=${illiqAvg} (${ratios.length} stocks)`);
}
function startAmihudPolling() {
  scrapeAmihudIlliquidity();
  setInterval(scrapeAmihudIlliquidity, 15 * 60 * 1000);
}

// ── Yahoo Finance Commodity Polling
// Feeds: energyCrackMomentum, goldLeaseShock, lmeCash3mSpread, natGasWeather, lmeCancelledWarrants
const COMMODITY_YAHOO = ["CL=F", "RB=F", "GC=F", "HG=F", "HGZ26.CMX", "NG=F"];
// NOTE: HGZ26.CMX = COMEX Copper Dec 2026 deferred leg for lmeCancelledWarrants term structure.
// When Dec 2026 expires (Nov 2026), update to HGH27.CMX (Mar), then HGK27.CMX (May), etc.
// COMEX months: H=Mar K=May N=Jul U=Sep Z=Dec
const commodityHistory = {};
const lmeSpreadHistory = []; // rolling 20-reading spread% for lmeCancelledWarrants p90/p10

async function scrapeYahooCommodities() {
  console.log("Yahoo Commodities: fetching CL=F, RB=F, GC=F, HG=F, HGZ26.CMX, NG=F...");
  let results;
  try {
    const resp = await axios.get(YAHOO_QUOTE_URL, {
      params: { symbols: COMMODITY_YAHOO.join(",") },
      timeout: 20000,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    results = resp.data?.quoteResponse?.result || [];
  } catch (err) {
    console.error(`  Yahoo Commodities: fetch failed (${err.code || err.message}) — skipping.`);
    return;
  }
  const bySymbol = {};
  for (const q of results) {
    if (q.regularMarketPrice != null)
      bySymbol[q.symbol] = { ltp: q.regularMarketPrice, chgPct: q.regularMarketChangePercent ?? 0, high52: q.fiftyTwoWeekHigh, low52: q.fiftyTwoWeekLow };
  }
  const now = Date.now();
  for (const sym of COMMODITY_YAHOO) {
    if (!bySymbol[sym]) continue;
    if (!commodityHistory[sym]) commodityHistory[sym] = [];
    commodityHistory[sym].push({ t: now, ...bySymbol[sym] });
    if (commodityHistory[sym].length > 5) commodityHistory[sym].shift();
  }
  const indData = {};

  // energyCrackMomentum
  const cl = bySymbol["CL=F"], rb = bySymbol["RB=F"];
  if (cl && rb && cl.ltp > 0) {
    const rbBarrel = rb.ltp * 42, crackNow = rbBarrel - cl.ltp;
    const clHist = commodityHistory["CL=F"], rbHist = commodityHistory["RB=F"];
    let crackReturn = 0;
    if (clHist && rbHist && clHist.length >= 3 && rbHist.length >= 3) {
      const oldCrack = rbHist[0].ltp * 42 - clHist[0].ltp;
      if (Math.abs(oldCrack) > 0.1) crackReturn = +((crackNow - oldCrack) / Math.abs(oldCrack) * 100).toFixed(2);
    }
    const crudeAboveMid = cl.high52 && cl.low52 ? (cl.ltp > (cl.high52 + cl.low52) / 2 ? 1 : 0) : (cl.chgPct > 0 ? 1 : 0);
    indData.energyCrackMomentum = { crackReturn, crudeAboveMid, hasData: true };
    console.log(`  Crack spread: ${crackNow.toFixed(2)} (3-bar return: ${crackReturn}%)`);
  }

  // goldLeaseShock
  const gc = bySymbol["GC=F"];
  if (gc) {
    const leaseNow = +Math.abs(gc.chgPct * 100).toFixed(1);
    const gcHist = commodityHistory["GC=F"] || [];
    const leaseMean = gcHist.length ? +(gcHist.reduce((a, b) => a + Math.abs(b.chgPct) * 100, 0) / gcHist.length).toFixed(1) : leaseNow;
    indData.goldLeaseShock = { leaseNow, leaseMean, goldHoldsRange: Math.abs(gc.chgPct) < 1.5 ? 1 : 0, goldUp: gc.chgPct > 0 ? 1 : 0, hasData: true };
    console.log(`  Gold lease proxy: now=${leaseNow}bps mean=${leaseMean}bps`);
  }

  // lmeCash3mSpread
  const hg = bySymbol["HG=F"];
  if (hg) {
    const hgHist = commodityHistory["HG=F"] || [];
    let spreadZ = 0;
    if (hgHist.length >= 3) {
      const returns = hgHist.map((p) => p.chgPct);
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const std = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length) || 1;
      spreadZ = +((hg.chgPct - mean) / std).toFixed(2);
    } else {
      spreadZ = +(hg.chgPct / 0.8).toFixed(2);
    }
    indData.lmeCash3mSpread = { spreadZ, copperBreak: Math.abs(hg.chgPct) > 0.8 ? 1 : 0, copperUp: hg.chgPct > 0 ? 1 : 0, hasData: true };
    console.log(`  COMEX Copper z-score: ${spreadZ}`);
  }

  // lmeCancelledWarrants — COMEX term structure (HG=F vs HGZ26.CMX)
  const hgDeferred = bySymbol["HGZ26.CMX"];
  if (hg && hgDeferred && hg.ltp > 0 && hgDeferred.ltp > 0) {
    const spreadPct = +((hg.ltp - hgDeferred.ltp) / hgDeferred.ltp * 100).toFixed(3);
    const backwardation = hg.ltp > hgDeferred.ltp;
    lmeSpreadHistory.push(spreadPct);
    if (lmeSpreadHistory.length > 20) lmeSpreadHistory.shift();
    const sorted = [...lmeSpreadHistory].sort((a, b) => a - b);
    const p90 = +sorted[Math.floor(sorted.length * 0.9)].toFixed(3);
    const p10 = +sorted[Math.floor(sorted.length * 0.1)].toFixed(3);
    const risingVsPrev = lmeSpreadHistory.length >= 2 ? spreadPct > lmeSpreadHistory[lmeSpreadHistory.length - 2] : false;
    indData.lmeCancelledWarrants = { spreadPct, backwardation, p90, p10, risingVsPrev, hasData: lmeSpreadHistory.length >= 3 };
    console.log(`  LME proxy (COMEX term): spread=${spreadPct}% back=${backwardation} p90=${p90} p10=${p10}`);
  } else {
    console.error("  lmeCancelledWarrants: HGZ26.CMX not returned — check contract code, update when expired.");
  }

  // natGasWeather price legs
  const ng = bySymbol["NG=F"];
  if (ng) {
    indData.natGasWeather = { gasBreak: Math.abs(ng.chgPct) > 0.8 ? 1 : 0, gasUp: ng.chgPct > 0 ? 1 : 0, hasData: true };
    console.log(`  NatGas (NG=F): chg=${ng.chgPct.toFixed(2)}%`);
  }

  if (Object.keys(indData).length) broadcast({ type: "indicators", data: indData });
}
function startYahooCommodityPolling() {
  scrapeYahooCommodities();
  setInterval(scrapeYahooCommodities, 10 * 60 * 1000);
}

// ── Squeeze Metrics DIX — Dark Pool
const DIX_JSON_URL = "https://squeezemetrics.com/monitor/static/dix.json";
const DIX_PAGE_URL = "https://squeezemetrics.com/monitor/dix";
const DIX_HISTORY  = [];
let lastDixPct     = null;

async function scrapeDix() {
  console.log("DIX: fetching Squeeze Metrics dark-pool index...");
  let dixPct = null;
  try {
    const resp = await axios.get(DIX_JSON_URL, { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" } });
    const d = resp.data;
    if (Array.isArray(d) && d.length) {
      const last = d[d.length - 1];
      dixPct = (last.dix ?? last.DIX ?? last.value) != null ? +(Number(last.dix ?? last.DIX ?? last.value) * 100).toFixed(2) : null;
    } else if (d && d.dix != null) {
      dixPct = +(Number(d.dix) * 100).toFixed(2);
    }
  } catch (err) { console.error(`  DIX JSON failed (${err.code || err.message}) — trying page scrape.`); }
  if (dixPct == null) {
    try {
      const resp = await axios.get(DIX_PAGE_URL, { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "text/html" } });
      const $ = cheerio.load(resp.data);
      const bodyText = $("body").text();
      const match = bodyText.match(/DIX[:\s]*([0-9]{2,3}(?:\.[0-9]{1,2})?)\s*%/i) || bodyText.match(/([3-6][0-9](?:\.[0-9]{1,2})?)\s*%/);
      if (match) dixPct = +Number(match[1]).toFixed(2);
    } catch (err2) { console.error(`  DIX page scrape failed (${err2.code || err2.message}) — skipping.`); }
  }
  if (dixPct == null || dixPct < 20 || dixPct > 80) { console.error(`  DIX: value (${dixPct}) out of range — skipping.`); return; }
  let priceUp = 1;
  try {
    const spyResp = await axios.get(YAHOO_QUOTE_URL, { params: { symbols: "SPY" }, timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } });
    const spyQ = spyResp.data?.quoteResponse?.result?.[0];
    if (spyQ) priceUp = (spyQ.regularMarketChangePercent ?? 0) >= 0 ? 1 : 0;
  } catch (_) {}
  broadcast({ type: "indicators", data: { darkPoolPrints: { dpRatio: dixPct, prevDpRatio: lastDixPct != null ? lastDixPct : dixPct, priceUp, hasData: true } } });
  console.log(`  DIX: ${dixPct}% priceUp=${priceUp}`);
  lastDixPct = dixPct;
}
function startDixPolling() { scrapeDix(); setInterval(scrapeDix, 4 * 60 * 60 * 1000); }

// ── NLP Earnings Sentiment
const NLP_STOCKS = ["RELIANCE.NS","TCS.NS","HDFCBANK.NS","ICICIBANK.NS","INFY.NS","HCLTECH.NS","WIPRO.NS","SBIN.NS","BHARTIARTL.NS","LT.NS"];
let lastNlpSentiment = null, lastNlpPollTime = 0;
const NLP_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function scrapeNlpEarnings() {
  const now = Date.now();
  if (now - lastNlpPollTime < NLP_POLL_INTERVAL_MS) return;
  lastNlpPollTime = now;
  console.log("NLP Earnings: fetching EPS data from Yahoo Finance...");
  const surprises = [];
  for (const sym of NLP_STOCKS) {
    try {
      const resp = await axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}`, {
        params: { modules: "earnings,earningsTrend" }, timeout: 12000,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      const quarters = resp.data?.quoteSummary?.result?.[0]?.earnings?.earningsChart?.quarterly || [];
      const latest = quarters[quarters.length - 1];
      if (latest?.actual?.raw != null && latest?.estimate?.raw != null && latest.estimate.raw !== 0) {
        surprises.push({ symbol: sym, surpPct: +((latest.actual.raw - latest.estimate.raw) / Math.abs(latest.estimate.raw) * 100).toFixed(2), period: latest.date });
      }
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) { console.error(`  NLP Earnings: ${sym} failed (${err.code || err.message})`); }
  }
  if (!surprises.length) { console.error("  NLP Earnings: no data — skipping AI call."); return; }
  const avgSurprise = surprises.reduce((a, b) => a + b.surpPct, 0) / surprises.length;
  const summary = surprises.map((s) => `${s.symbol}: ${s.surpPct > 0 ? "+" : ""}${s.surpPct}% EPS ${s.surpPct >= 0 ? "beat" : "miss"} (${s.period})`).join(", ");
  let sentimentScore = Math.max(-100, Math.min(100, Math.round(avgSurprise * 5)));
  if (ANTHROPIC_API_KEY || GROQ_API_KEY) {
    const prompt = `You are a financial NLP model. Based on NIFTY 50 earnings surprise data, provide a single integer score from -100 (bearish) to +100 (bullish). Data: ${summary} Average EPS surprise: ${avgSurprise.toFixed(2)}%. Respond with ONLY a single integer.`;
    try {
      let aiText = "";
      if (ANTHROPIC_API_KEY) aiText = (await askAnthropic(prompt)).text;
      else if (GROQ_API_KEY) aiText = (await askGroq(prompt)).text;
      const parsed = parseInt(aiText.trim().replace(/[^-0-9]/g, ""), 10);
      if (!isNaN(parsed) && parsed >= -100 && parsed <= 100) sentimentScore = parsed;
    } catch (err) { console.error(`  NLP Earnings: AI call failed (${err.message})`); }
  }
  broadcast({ type: "indicators", data: { nlpEarnings: { sentimentScore, prevSentiment: lastNlpSentiment != null ? lastNlpSentiment : sentimentScore, hasData: true } } });
  console.log(`  NLP Earnings: score=${sentimentScore}`);
  lastNlpSentiment = sentimentScore;
}
function startNlpEarningsPolling() { scrapeNlpEarnings(); setInterval(scrapeNlpEarnings, NLP_POLL_INTERVAL_MS); }

// ── NSE Short Selling
let lastNseShortData = null;
async function scrapeNseShortSelling() {
  console.log("NSE Short Selling: fetching daily data...");
  const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9", "Referer": "https://www.nseindia.com/", "Origin": "https://www.nseindia.com" };
  let cookieJar = "";
  try { const home = await axios.get("https://www.nseindia.com/", { headers, timeout: 15000 }); cookieJar = (home.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; "); } catch (_) {}
  let data;
  try {
    const resp = await axios.get("https://www.nseindia.com/api/shortSelling?type=S", { headers: { ...headers, Cookie: cookieJar }, timeout: 20000 });
    data = resp.data;
  } catch (err) { console.error(`  NSE Short Sell failed (${err.code || err.message}) — skipping.`); return; }
  const rows = data?.data || [];
  if (!rows.length) { console.error("  NSE Short Sell: empty response."); return; }
  let totalShort = 0, totalVol = 0;
  for (const row of rows) {
    totalShort += Number(row.shortSellQuantity || row.shortQuantity || 0);
    totalVol   += Number(row.totalTradedQuantity || row.totalQuantity || row.tradedQuantity || 0);
  }
  if (totalVol <= 0) { console.error("  NSE Short Sell: zero volume."); return; }
  const shortIntM = +(totalShort / 1e6).toFixed(4), avgDailyM = +(totalVol / 1e6).toFixed(4);
  broadcast({ type: "indicators", data: { shortInterestDTC: { shortInt: shortIntM, avgDailyVol: avgDailyM, hasData: true } } });
  console.log(`  NSE Short Sell: shortInt=${shortIntM}M avgDailyVol=${avgDailyM}M`);
  lastNseShortData = { shortIntM, avgDailyM };
}
function startNseShortSellPolling() { scrapeNseShortSelling(); setInterval(scrapeNseShortSelling, 4 * 60 * 60 * 1000); }

// ── OPEC Spare Capacity
const OPEC_MOMR_URL = "https://www.opec.org/opec_web/en/publications/338.htm";
let lastOpecCapacityChange = null, lastOpecPollTime = 0;
const OPEC_POLL_INTERVAL_MS = 12 * 60 * 60 * 1000;

async function scrapeOpecCapacity() {
  const now = Date.now();
  if (now - lastOpecPollTime < OPEC_POLL_INTERVAL_MS) return;
  lastOpecPollTime = now;
  if (!ANTHROPIC_API_KEY && !GROQ_API_KEY) { console.error("  OPEC: No AI key — skipping."); return; }
  let pageHtml;
  try {
    const resp = await axios.get(OPEC_MOMR_URL, { timeout: 25000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
    pageHtml = resp.data;
  } catch (err) { console.error(`  OPEC page fetch failed (${err.code || err.message})`); return; }
  const $ = cheerio.load(pageHtml);
  let pageText = "";
  $("p, h1, h2, h3, li, td, div.content, div.article, .intro, .summary, .highlight").each((_, el) => { const t = $(el).text().replace(/\s+/g, " ").trim(); if (t.length > 30) pageText += t + " "; });
  pageText = pageText.slice(0, 4000);
  if (!pageText.includes("spare") && !pageText.includes("capacity") && !pageText.includes("production")) { console.error("  OPEC: keywords not found in page."); return; }
  const prompt = `You are an oil market analyst. Based on OPEC MOMR text, determine change in spare capacity. Contracting=negative, expanding=positive. Text: ${pageText}. Respond with ONLY a single number (e.g. -2.5 or +1.2). No explanation.`;
  let aiText = "";
  try {
    if (ANTHROPIC_API_KEY) aiText = (await askAnthropic(prompt)).text;
    else if (GROQ_API_KEY) aiText = (await askGroq(prompt)).text;
  } catch (err) { console.error(`  OPEC AI failed (${err.message})`); return; }
  const capacityChange = parseFloat(aiText.trim().replace(/[^-0-9.]/g, ""));
  if (isNaN(capacityChange)) { console.error(`  OPEC AI unparseable: "${aiText.trim()}"`); return; }
  let eventConfirmed = 0, crudeUp = 1;
  try {
    const clResp = await axios.get(YAHOO_QUOTE_URL, { params: { symbols: "CL=F" }, timeout: 10000, headers: { "User-Agent": "Mozilla/5.0" } });
    const clQ = clResp.data?.quoteResponse?.result?.[0];
    if (clQ) { eventConfirmed = Math.abs(clQ.regularMarketChangePercent ?? 0) > 1.0 ? 1 : 0; crudeUp = (clQ.regularMarketChangePercent ?? 0) > 0 ? 1 : 0; }
  } catch (_) {}
  broadcast({ type: "indicators", data: { opecCapacityShock: { capacityChange: +capacityChange.toFixed(2), eventConfirmed, crudeUp, hasData: true } } });
  console.log(`  OPEC Spare Capacity: change=${capacityChange.toFixed(2)}%`);
  lastOpecCapacityChange = +capacityChange.toFixed(2);
}
function startOpecPolling() { scrapeOpecCapacity(); setInterval(scrapeOpecCapacity, OPEC_POLL_INTERVAL_MS); }

// ── MCX Delivery Intent
const MCX_DELIVERY_URL  = "https://www.mcxindia.com/market-data/deliverables";
const MCX_BHAVCOPY_BASE = "https://www.mcxindia.com/DesktopModules/MCX_SiteManagement/App_ClientSide/MCXWebPart_Bhavcopy/BhavCopyCSV.aspx";
const MCX_DELIVERY_HISTORY = [];
const MCX_POLL_INTERVAL_MS  = 4 * 60 * 60 * 1000;

async function scrapeMcxDeliveryIntent() {
  console.log("MCX Delivery: fetching deliverable position from mcxindia.com...");
  let deliveryPct = null;
  try {
    const resp = await axios.get(MCX_DELIVERY_URL, { timeout: 20000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "text/html,application/xhtml+xml", "Referer": "https://www.mcxindia.com/" } });
    const $ = cheerio.load(resp.data);
    const headers = [];
    $("table thead th, table tr:first-child th").each((_, el) => headers.push($(el).text().trim().toLowerCase()));
    const longIdx = headers.findIndex(h => h.includes("long")), shortIdx = headers.findIndex(h => h.includes("short")), totalIdx = headers.findIndex(h => h.includes("total"));
    if (longIdx < 0 || totalIdx < 0) throw new Error(`Header columns not found: [${headers.join(", ")}]`);
    const pcts = [];
    $("table tbody tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < Math.max(longIdx, shortIdx, totalIdx) + 1) return;
      const longOI = parseFloat($(cells[longIdx]).text().replace(/,/g, "")) || 0;
      const shortOI = shortIdx >= 0 ? parseFloat($(cells[shortIdx]).text().replace(/,/g, "")) || 0 : 0;
      const totalOI = parseFloat($(cells[totalIdx]).text().replace(/,/g, "")) || 0;
      if (totalOI <= 0) return;
      pcts.push(((longOI + shortOI) / totalOI) * 100);
    });
    if (pcts.length >= 1) { deliveryPct = +(pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(2); console.log(`  MCX Delivery (page): ${pcts.length} contracts, avg=${deliveryPct}%`); }
    else throw new Error("No valid rows parsed.");
  } catch (err) { console.error(`  MCX Delivery page failed (${err.message}) — trying bhavcopy.`); }
  if (deliveryPct == null) {
    try {
      const today = new Date();
      const dDate = `${String(today.getDate()).padStart(2,"0")}-${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][today.getMonth()]}-${today.getFullYear()}`;
      const resp = await axios.get(MCX_BHAVCOPY_BASE, { params: { dDate }, timeout: 20000, headers: { "User-Agent": "Mozilla/5.0" } });
      const lines = resp.data.trim().split("\n").slice(1);
      let totalOI = 0, totalVol = 0;
      for (const line of lines) { const cols = line.split(","); if (cols.length < 8) continue; totalOI += parseFloat(cols[7]) || 0; totalVol += parseFloat(cols[6]) || 0; }
      if (totalOI > 0 && totalVol > 0) { deliveryPct = +Math.min(95, Math.max(5, (totalOI / (totalVol || 1)) * 8)).toFixed(2); console.log(`  MCX Delivery (bhavcopy fallback): deliveryPct proxy=${deliveryPct}%`); }
    } catch (err2) { console.error(`  MCX Delivery bhavcopy failed (${err2.message}) — skipping.`); return; }
  }
  if (deliveryPct == null) return;
  MCX_DELIVERY_HISTORY.push(deliveryPct);
  if (MCX_DELIVERY_HISTORY.length > 20) MCX_DELIVERY_HISTORY.shift();
  const sorted = [...MCX_DELIVERY_HISTORY].sort((a, b) => a - b);
  const p90 = +sorted[Math.floor(sorted.length * 0.9)].toFixed(2), p10 = +sorted[Math.floor(sorted.length * 0.1)].toFixed(2);
  const rising = MCX_DELIVERY_HISTORY.length >= 2 ? deliveryPct > MCX_DELIVERY_HISTORY[MCX_DELIVERY_HISTORY.length - 2] : false;
  const mcxGoldLtp = indicators?.mcxGold?.ltp ?? null, mcxGoldOpen = indicators?.mcxGold?.open ?? null;
  const aboveVwap = mcxGoldLtp != null && mcxGoldOpen != null ? mcxGoldLtp > mcxGoldOpen : false;
  broadcast({ type: "indicators", data: { mcxDeliveryIntent: { deliveryPct, p90, p10, rising, aboveVwap, hasData: MCX_DELIVERY_HISTORY.length >= 3 } } });
  console.log(`  MCX Delivery: pct=${deliveryPct}% p90=${p90} p10=${p10} rising=${rising} aboveVwap=${aboveVwap}`);
}
function startMcxDeliveryPolling() { scrapeMcxDeliveryIntent(); setInterval(scrapeMcxDeliveryIntent, MCX_POLL_INTERVAL_MS); }

// =============================================================
// ── END NEW POLLING FUNCTIONS ─────────────────────────────────
// =============================================================

// ---------------------------------------------------------------
// Investing.com — THIRD-tier fallback only, not a replacement for
// CCIL above. Two honest constraints kept from the CCIL version:
//   1. Same symbol (GOI10Y) when it's actually the same tenor (10Y),
//      since that's a legitimate second provider for the same number.
//   2. A SEPARATE symbol (INDIA1Y) for the 1-year yield, rather than
//      overwriting TBILL91D — a 1-year yield and a 91-day T-Bill
//      yield are not the same tenor, and silently swapping one for
//      the other in the same field would make the spread dishonest.
//      The frontend only uses INDIA1Y as a labeled last-resort
//      substitute for the short leg, and says so (shortTermTenor).
//
// Investing.com is Cloudflare-fronted and its price blocks are
// JS-rendered more often than not — this selector is a best-effort
// guess (data-test="instrument-price-last"), so failures here are
// expected sometimes. Polls every 30 min (not more, to avoid an IP
// block) and, like CCIL, never broadcasts on a failed/unparseable
// fetch — last known good value just keeps standing.
const INVESTING_URLS = {
  yield1Y: "https://in.investing.com/rates-bonds/india-1-year-bond-yield",
  yield10Y: "https://in.investing.com/rates-bonds/india-10-year-bond-yield",
};

async function fetchInvestingYield(url) {
  const resp = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    timeout: 15000,
  });
  const $ = cheerio.load(resp.data);
  const text = $('[data-test="instrument-price-last"]').text().trim();
  return parseFloat(text);
}

async function scrapeInvestingYieldCurve() {
  console.log("[YIELD CURVE FALLBACK] Polling investing.com...");
  let yield1Y, yield10Y;
  try {
    yield1Y = await fetchInvestingYield(INVESTING_URLS.yield1Y);
  } catch (err) {
    console.error(`  investing.com 1Y fetch failed: ${err.code || err.message}`);
  }
  try {
    yield10Y = await fetchInvestingYield(INVESTING_URLS.yield10Y);
  } catch (err) {
    console.error(`  investing.com 10Y fetch failed: ${err.code || err.message}`);
  }

  const data = {};
  if (!isNaN(yield1Y) && yield1Y > 0 && yield1Y < 20) {
    data.INDIA1Y = { symbol: "INDIA1Y", category: "bond", yieldPct: +yield1Y.toFixed(3), yieldSource: "INVESTING.COM", tenor: "1Y" };
  }
  if (!isNaN(yield10Y) && yield10Y > 0 && yield10Y < 20) {
    data.GOI10Y = { symbol: "GOI10Y", category: "bond", yieldPct: +yield10Y.toFixed(3), yieldSource: "INVESTING.COM" };
  }
  if (Object.keys(data).length) {
    broadcast({ type: "market", data });
    console.log(`  investing.com yields: ${Object.entries(data).map(([s, o]) => `${s}=${o.yieldPct}%`).join(", ") || "none parsed"}`);
  } else {
    console.error("  investing.com: nothing parsed this cycle (likely Cloudflare/JS-render block) — previous values keep standing.");
  }
}

function startInvestingYieldPolling() {
  scrapeInvestingYieldCurve(); // fire-and-forget, NOT awaited — a blocking while(true) here would stall startMarketStream/option-chain/depth polling forever
  setInterval(scrapeInvestingYieldCurve, 30 * 60 * 1000);
}

// ---------------------------------------------------------------
// Nifty 50 current-month Index Futures — feeds the Futures Basis
// (Cost-of-Carry Spread) indicator on the dashboard. Same live-resolve
// pattern as resolveMcxKeys/resolveBondFuturesKeys above: the front-month
// contract rolls every month, so we look it up fresh instead of
// hardcoding a key that would go stale in ~30 days.
//
// NIFTY has hundreds of NSE_FO rows under the name "NIFTY" (one future
// per expiry, PLUS every option strike/expiry combo) — so unlike
// MCX/bond futures we can't match on name alone, we also need to
// exclude option rows. Prefer an instrument_type column (FUT vs
// CE/PE) when the CSV header has one; if it doesn't, fall back to
// excluding any row that has a real (nonzero) strike_price, since
// only options carry a strike.
async function resolveNiftyFuturesKey() {
  console.log("Resolving current-month NIFTY futures key from instrument master...");
  const lines = await fetchInstrumentMaster();
  const header = splitCsvLine(lines[0].replace(/\r$/, ""));
  const iKey = findColumn(header, ["instrument_key"], ["instrument_key", "instrumentkey"]);
  const iName = findColumn(header, ["name"], ["name"]);
  const iExpiry = findColumn(header, ["expiry"], ["expiry"]);
  const iSeg = findColumn(header, ["segment", "exchange_segment", "exchange"], ["segment", "exchange"]);
  const iType = findColumn(header, ["instrument_type"], ["instrument_type", "instrumenttype"]);
  const iStrike = findColumn(header, ["strike_price", "strike"], ["strike"]);
  if (iKey < 0 || iSeg < 0 || iName < 0 || iExpiry < 0) {
    console.error(`  [ERROR] Could not find required NIFTY-futures columns (iKey=${iKey}, iSeg=${iSeg}, iName=${iName}, iExpiry=${iExpiry}). Will stay OFFLINE for futures basis.`);
    return;
  }

  let best = null;
  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]);
    if (!row[iSeg] || !row[iSeg].toUpperCase().includes("NSE_FO")) continue;
    if (!row[iName] || row[iName].trim().toUpperCase() !== "NIFTY") continue;
    if (iType >= 0) {
      if (!row[iType] || !row[iType].toUpperCase().includes("FUT")) continue;
    } else if (iStrike >= 0) {
      const strike = Number(row[iStrike]);
      if (strike && strike > 0) continue; // has a real strike -> it's an option, skip
    }
    const expiryRaw = row[iExpiry];
    let expiryMs = Number(expiryRaw);
    if (!expiryMs) expiryMs = Date.parse(expiryRaw);
    if (!expiryMs || expiryMs < Date.now()) continue; // skip expired contracts
    if (!best || expiryMs < best.expiryMs) best = { key: row[iKey], expiryMs };
  }

  if (best) {
    INSTRUMENTS.push({ key: best.key, symbol: "NIFTY FUT", category: "future" });
    console.log(`  NIFTY FUT: resolved -> ${best.key} (expires ${new Date(best.expiryMs).toDateString()})`);
  } else {
    console.error(`  NIFTY FUT: no active NSE_FO future found for name "NIFTY" — check instrument_type/strike_price columns exist in the CSV. Will stay OFFLINE for futures basis.`);
  }
}

async function resolveEquityKeys() {
  console.log(`Resolving ${EQUITY_SYMBOLS.length} Nifty 50 / Bank Nifty equity keys from instrument master...`);
  const lines = await fetchInstrumentMaster();
  const header = splitCsvLine(lines[0].replace(/\r$/, ""));
  console.log("  [DEBUG] Instrument master header columns:", JSON.stringify(header));
  const iKey = findColumn(header, ["instrument_key"], ["instrument_key", "instrumentkey"]);
  // Try known historical/likely column names for segment + symbol first,
  // then fall back to a "contains" search — since Upstox has changed this
  // CSV schema before and a silent -1 index here is what caused the
  // 0-resolved bug.
  const iSeg = findColumn(header, ["segment", "exchange_segment", "exchange"], ["segment", "exchange"]);
  const iSym = findColumn(
    header,
    ["trading_symbol", "tradingsymbol", "trading_symbol_name"],
    ["trading_symbol", "tradingsymbol", "symbol"]
  );
  if (iKey < 0 || iSeg < 0 || iSym < 0) {
    console.error(`  [ERROR] Could not find required columns (iKey=${iKey}, iSeg=${iSeg}, iSym=${iSym}). Check the [DEBUG] header line above — share it so the column-name list can be updated.`);
  }
  const already = new Set(INSTRUMENTS.map((i) => i.symbol));
  let resolved = 0, missing = [];

  for (const sym of EQUITY_SYMBOLS) {
    if (already.has(sym)) continue; // already hardcoded above, don't duplicate
    let found = null;
    for (let i = 1; i < lines.length; i++) {
      const row = splitCsvLine(lines[i]);
      if (!row[iSeg] || !row[iSeg].toUpperCase().includes("NSE_EQ")) continue;
      if (row[iSym] === sym) { found = row[iKey]; break; }
    }
    if (found) {
      let capTier = "core"; // Nifty50/BankNifty — not part of the 3 cap-tier lists
      if (CAP_TIER_SYMBOLS.largeCap.includes(sym)) capTier = "largeCap";
      else if (CAP_TIER_SYMBOLS.midCap.includes(sym)) capTier = "midCap";
      else if (CAP_TIER_SYMBOLS.smallCap.includes(sym)) capTier = "smallCap";
      INSTRUMENTS.push({ key: found, symbol: sym, category: "stock", capTier });
      already.add(sym);
      resolved++;
    } else {
      missing.push(sym);
    }
  }
  console.log(`  Resolved ${resolved} equity keys.${missing.length ? ` Not found in master (skipped): ${missing.join(", ")}` : ""}`);
}

if (!API_KEY || !API_SECRET) {
  console.error("Missing UPSTOX_API_KEY / UPSTOX_API_SECRET. Create a .env file — see the header comment in this file.");
  process.exit(1);
}

// ---------------------------------------------------------------
// 1. Local relay WebSocket server — the dashboard connects here
// ---------------------------------------------------------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
// FIX (v105): Anthropic added as the "master" seeker (answered first,
// listed first in the panel) plus DeepSeek as an additional plain seeker.
// Both keys stay server-side in the relay .env — never sent to the
// browser, unlike the existing Groq/Gemini keys hardcoded in the frontend.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
// FIX (v106): OpenRouter added as a fallback seeker — free-tier gateway to
// many open models via one API. Its :free model roster rotates (models get
// added/removed by OpenRouter without notice), so we try a short list of
// known-good free IDs in order and fall through on a 404/400 "not found"
// style error rather than failing the whole seeker on one dead model ID.
// Free tier: 20 req/min, 50 req/day ($0 balance) / 1000 req/day (after a
// one-time $10 credit top-up). Key stays server-side, same as the others.
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODELS = (process.env.OPENROUTER_MODELS || "meta-llama/llama-3.3-70b-instruct:free,qwen/qwen3-235b-a22b:free,deepseek/deepseek-r1:free")
  .split(",").map((m) => m.trim()).filter(Boolean);
// FIX (v104): "groq/compound" is an AGENTIC model — it silently runs its
// own web search + code execution on every call regardless of what the
// prompt says, which is why verdict questions ("use only snapshot data")
// came back citing unrelated crypto articles (Solana/Remittix/Cardano),
// and why a single call burned ~20k tokens and blew the 30k TPM/min cap
// in one shot. We already do our own scoped web search via gatherContext()
// above, so compound's autonomous search is redundant AND misbehaving.
// Switched to a plain instruct model: obeys the prompt, ~5-10x fewer
// tokens per call, far higher headroom under the same TPM limit.
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

// ---- Real web search: Tavily first, Serper as fallback if Tavily fails/empty ----
async function tavilySearch(query) {
  if (!TAVILY_API_KEY) return null;
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: TAVILY_API_KEY, query, search_depth: "basic", max_results: 5, include_answer: true }),
    });
    const d = await r.json();
    if (!r.ok) return null;
    const items = (d.results || []).map((x) => `- ${x.title}: ${x.content?.slice(0, 300)} (${x.url})`).join("\n");
    return { source: "Tavily", text: (d.answer ? `Answer: ${d.answer}\n` : "") + items };
  } catch (e) { return null; }
}

async function serperSearch(query) {
  if (!SERPER_API_KEY) return null;
  try {
    const r = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query }),
    });
    const d = await r.json();
    if (!r.ok) return null;
    const items = (d.organic || []).slice(0, 5).map((x) => `- ${x.title}: ${x.snippet} (${x.link})`).join("\n");
    return { source: "Serper", text: items };
  } catch (e) { return null; }
}

async function webSearch(query) {
  const tavily = await tavilySearch(query);
  if (tavily && tavily.text) return tavily;
  const serper = await serperSearch(query);
  if (serper && serper.text) return serper;
  return null;
}

// ---- Instant news: NewsData.io ----
async function newsSearch(query) {
  if (!NEWSDATA_API_KEY) return null;
  try {
    const url = `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_API_KEY}&q=${encodeURIComponent(query)}&language=en`;
    const r = await fetch(url);
    const d = await r.json();
    if (!r.ok || d.status !== "success") return null;
    const items = (d.results || []).slice(0, 6).map((x) => `- [${x.pubDate}] ${x.title} (${x.link})`).join("\n");
    return { source: "NewsData", text: items };
  } catch (e) { return null; }
}

// ---- IPO calendar: Finnhub (global, not India-specific but useful for AGM/IPO tracking) ----
async function ipoCalendar() {
  if (!FINNHUB_API_KEY) return null;
  try {
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    const r = await fetch(`https://finnhub.io/api/v1/calendar/ipo?from=${from}&to=${to}&token=${FINNHUB_API_KEY}`);
    const d = await r.json();
    if (!r.ok) return null;
    const items = (d.ipoCalendar || []).slice(0, 8).map((x) => `- ${x.name} (${x.symbol}) — ${x.date}, price ${x.price || "TBD"}`).join("\n");
    return { source: "Finnhub IPO Calendar", text: items || "No IPOs listed in the next 30 days." };
  } catch (e) { return null; }
}

// ---- Router: decide which external source(s) a question needs ----
function needsWebRouting(question) {
  const q = question.toLowerCase();
  const wantsIPO = /\bipo\b|listing|subscription/.test(q);
  const wantsAGM = /\bagm\b|annual general meeting|board meeting/.test(q);
  const wantsNews = /news|update|announcement|headline|today|latest/.test(q);
  const wantsWeb = wantsIPO || wantsAGM || wantsNews || /crypto|bitcoin|global|world|price of|why did|why is/.test(q);
  return { wantsIPO, wantsAGM, wantsNews, wantsWeb };
}

async function gatherContext(question, routing) {
  const { wantsIPO, wantsAGM, wantsNews, wantsWeb } = routing;
  const jobs = [];
  if (wantsIPO) jobs.push(ipoCalendar());
  if (wantsNews || wantsAGM) jobs.push(newsSearch(question));
  if (wantsWeb) jobs.push(webSearch(question));

  if (!jobs.length) return "";
  const results = (await Promise.all(jobs)).filter(Boolean);
  if (!results.length) return "";
  return "\n\nExternal live data fetched for this question:\n" + results.map((r) => `### ${r.source}\n${r.text}`).join("\n\n");
}

async function askGemini(prompt, allowSearch) {
  if (!GEMINI_API_KEY) return { name: "Gemini", text: "", error: "GEMINI_API_KEY missing in relay .env" };
  // FIX (v104): google_search tool used to be hard-wired ON for every
  // call, so Gemini ran its own autonomous search even for snapshot-only
  // questions (e.g. the OMS verdict, which explicitly says "use only
  // snapshot data") — that's why the verdict came back citing unrelated
  // crypto listicles. Now only attached when the question actually needs
  // live external info (same routing gatherContext already uses), and we
  // already hand Gemini that fetched context directly in the prompt.
  const body = { contents: [{ parts: [{ text: prompt }] }] };
  if (allowSearch) body.tools = [{ google_search: {} }];
  const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const geminiData = await geminiRes.json();
  if (!geminiRes.ok || geminiData.error) {
    return { name: "Gemini", text: "", error: geminiData.error?.message || `Gemini API HTTP ${geminiRes.status}` };
  }
  const text = geminiData.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || `No response (finishReason: ${geminiData.candidates?.[0]?.finishReason || "none"}).`;
  return { name: "Gemini", text, audits: {} };
}

async function askGroq(prompt) {
  if (!GROQ_API_KEY) return { name: "Groq", text: "", error: "GROQ_API_KEY missing in relay .env" };
  const call = async () => {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await r.json();
    return { ok: r.ok, status: r.status, d };
  };
  let { ok, status, d } = await call();
  // FIX (v104): a 429 is often just a short cooldown (Groq's own error
  // message includes "Please try again in Xs"). Wait that long once and
  // retry automatically instead of dumping an error on the user every time
  // — with the lighter model above this now rarely fires at all.
  if (!ok && status === 429) {
    const waitMatch = /try again in ([\d.]+)s/i.exec(d?.error?.message || "");
    const waitMs = waitMatch ? Math.min(Math.ceil(parseFloat(waitMatch[1]) * 1000) + 250, 15000) : 3000;
    await new Promise((res) => setTimeout(res, waitMs));
    ({ ok, status, d } = await call());
  }
  if (!ok || d.error) {
    return { name: "Groq", text: "", error: d.error?.message || `Groq API HTTP ${status}` };
  }
  const text = d.choices?.[0]?.message?.content || "No response.";
  return { name: "Groq", text, audits: {} };
}

async function askAnthropic(prompt) {
  if (!ANTHROPIC_API_KEY) return { name: "Anthropic", text: "", error: "ANTHROPIC_API_KEY missing in relay .env" };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const d = await r.json();
  if (!r.ok || d.error) {
    return { name: "Anthropic", text: "", error: d.error?.message || `Anthropic API HTTP ${r.status}` };
  }
  const text = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("") || "No response.";
  return { name: "Anthropic", text, audits: {} };
}

async function askDeepseek(prompt) {
  if (!DEEPSEEK_API_KEY) return { name: "DeepSeek", text: "", error: "DEEPSEEK_API_KEY missing in relay .env" };
  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, messages: [{ role: "user", content: prompt }] }),
  });
  const d = await r.json();
  if (!r.ok || d.error) {
    return { name: "DeepSeek", text: "", error: d.error?.message || `DeepSeek API HTTP ${r.status}` };
  }
  const text = d.choices?.[0]?.message?.content || "No response.";
  return { name: "DeepSeek", text, audits: {} };
}

async function askOpenRouter(prompt) {
  if (!OPENROUTER_API_KEY) return { name: "OpenRouter", text: "", error: "OPENROUTER_API_KEY missing in relay .env" };
  let lastError = "No free models configured";
  for (const model of OPENROUTER_MODELS) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          // Optional but recommended by OpenRouter for free-tier routing/attribution.
          "HTTP-Referer": "https://trading.infinityheal.org",
          "X-Title": "Krishn AI",
        },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
      });
      const d = await r.json();
      if (!r.ok || d.error) {
        // Free model roster rotates — a dead/retired :free id typically
        // comes back as 404/400. Try the next model instead of failing
        // this seeker outright.
        lastError = d.error?.message || `OpenRouter API HTTP ${r.status} (model: ${model})`;
        continue;
      }
      const text = d.choices?.[0]?.message?.content || "No response.";
      return { name: "OpenRouter", text, audits: { model } };
    } catch (err) {
      lastError = err.message || String(err);
    }
  }
  return { name: "OpenRouter", text: "", error: `OpenRouter: ${lastError}` };
}

const relayHttp = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/ask-ai-panel") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "application/json");
      try {
        if (!GEMINI_API_KEY && !GROQ_API_KEY && !ANTHROPIC_API_KEY && !DEEPSEEK_API_KEY && !OPENROUTER_API_KEY) {
          res.writeHead(200);
          res.end(JSON.stringify({ error: "No seeker AI keys found — set at least one of GEMINI_API_KEY, GROQ_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY in relay .env" }));
          return;
        }
        const { question, snapshot, history } = JSON.parse(body || "{}");
        // Cap history to the last 6 turns — unbounded history was the other
        // half of the "Request Entity Too Large" bug: it grows every turn
        // in a session and eventually pushes the request over Groq's limit
        // even with the snapshot capped.
        const HISTORY_TURNS_CAP = 6;
        // PER-TURN CAP FIX: capping turn COUNT alone doesn't bound total
        // size — 6 turns of a chatty AI answer echoed back into history
        // (each easily 3-5k chars) still blew past Groq's request-size
        // limit, which is the actual cause of "Request Entity Too Large"
        // even with HISTORY_TURNS_CAP in place. Cap each turn's own
        // content length too, so the bound is turns × per-turn-cap, not
        // turns × unbounded.
        const HISTORY_TURN_CHAR_CAP = 500;
        const cappedHistory = (history || []).slice(-HISTORY_TURNS_CAP);
        const historyText = cappedHistory
          .map((h) => {
            const content = h.content.length > HISTORY_TURN_CHAR_CAP
              ? h.content.slice(0, HISTORY_TURN_CHAR_CAP) + "...[truncated]"
              : h.content;
            return `${h.role}: ${content}`;
          })
          .join("\n");
        // Hard cap on the snapshot's JSON size — this is a defense-in-depth
        // guard, not a trust-the-frontend assumption. A single oversized
        // request here (~94k tokens seen in practice) burns through Groq's
        // whole daily token budget in one call and gets every subsequent
        // question in this app rate-limited for hours. Truncate rather than
        // reject, so the panel still answers from a partial snapshot.
        const SNAPSHOT_CHAR_CAP = 24000; // ≈ 6-7k tokens, leaves headroom for context+history+question
        let snapshotStr = JSON.stringify(snapshot);
        if (snapshotStr.length > SNAPSHOT_CHAR_CAP) {
          snapshotStr = snapshotStr.slice(0, SNAPSHOT_CHAR_CAP) + `..."[truncated — snapshot was ${snapshotStr.length} chars, capped to ${SNAPSHOT_CHAR_CAP}]`;
        }

        // Fetch real external facts ourselves (Tavily/Serper web search,
        // NewsData news, Finnhub IPO calendar) instead of just hoping the
        // seeker AI's own built-in search fires and stays under budget.
        // This also means Groq/Gemini get grounded facts even on a bad day.
        const EXTERNAL_CONTEXT_CAP = 6000;
        const routing = needsWebRouting(question);
        let externalContext = await gatherContext(question, routing);
        if (externalContext.length > EXTERNAL_CONTEXT_CAP) {
          externalContext = externalContext.slice(0, EXTERNAL_CONTEXT_CAP) + "...[truncated]";
        }

        const prompt = `You are Krishn AI, embedded in this Indian stock/commodity trading dashboard. You have three sources: (1) this app's own live snapshot below, (2) external live data already fetched for you (web search / news / IPO calendar — use it as-is, don't say you can't access the web), and (3) your own reasoning.\n\nLive snapshot (JSON):\n${snapshotStr}${externalContext}\n\nConversation so far:\n${historyText}\n\nQuestion: ${question}\n\nRules: If the question is about a number already in the snapshot (NIFTY/BANKNIFTY/option chain/indicator values shown in this app), answer from the snapshot and say so. If external live data was fetched above, use it and cite the source name. If neither covers it, say plainly what's missing rather than guessing.`;

        // Fan out to every configured seeker AI in parallel — whichever
        // keys are present in .env answer; missing keys are silently
        // skipped so you can run with just one configured.
        const seekers = [];
        // Anthropic pushed first — the "master" seeker, so its answer is
        // first in the returned array and shows first in the panel.
        if (ANTHROPIC_API_KEY) seekers.push(askAnthropic(prompt));
        if (GEMINI_API_KEY) seekers.push(askGemini(prompt, routing.wantsWeb));
        if (GROQ_API_KEY) seekers.push(askGroq(prompt));
        if (DEEPSEEK_API_KEY) seekers.push(askDeepseek(prompt));
        // OpenRouter pushed last — it's the fallback layer, so it only
        // shows up in the panel alongside (not ahead of) the primary
        // seekers. Still runs in parallel with the others, not gated
        // behind their failure — cheap and keeps latency the same.
        if (OPENROUTER_API_KEY) seekers.push(askOpenRouter(prompt));
        const results = await Promise.all(seekers);

        const answers = results.filter((r) => !r.error).map((r) => ({ name: r.name, text: r.text, audits: r.audits || {} }));
        const errors = results.filter((r) => r.error).map((r) => `${r.name}: ${r.error}`);

        if (!answers.length) {
          res.writeHead(200);
          res.end(JSON.stringify({ error: errors.join(" | ") || "All seeker AIs failed." }));
          return;
        }
        res.writeHead(200);
        res.end(JSON.stringify({ answers, ...(errors.length ? { partialErrors: errors } : {}) }));
      } catch (err) {
        res.writeHead(200);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.writeHead(204);
    res.end();
    return;
  }
  res.writeHead(404);
  res.end();
});
const relay = new WebSocket.Server({ server: relayHttp });
relayHttp.listen(RELAY_PORT);
relay.on("listening", () => console.log(`Relay ready for the dashboard at ws://localhost:${RELAY_PORT}`));

let lastStatus = "OFFLINE";
function broadcast(msg) {
  const payload = JSON.stringify(msg);
  relay.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}
function setStatus(status) {
  lastStatus = status;
  broadcast({ type: "status", status });
}
// Tell any dashboard that connects the current status immediately
// ---------------------------------------------------------------
// Order placement — OPTIONS ONLY by design (per priority: options
// trading is the only thing this routes real orders for). Equity/
// commodity order routing is intentionally NOT wired here.
// ---------------------------------------------------------------
// Hardcoded safety guardrails — a bug or accidental double-click can't
// blow past these no matter what the dashboard sends.
const MAX_QTY_PER_ORDER = 650;     // ~10 lots at current Nifty lot size (65); raise/lower per your risk comfort — was hardcoded 75, which blocked anything beyond 1 stale lot
const MAX_ORDERS_PER_DAY = 20;
let ordersPlacedToday = 0;
let optionOrderAccessToken = null;
// Currently-watched strike for the depth poll (Bid-Ask Imbalance +
// Microprice Deviation indicators). Set via the "watchDepth" message above.
let watchedDepthKey = null;
// FIX: tracks which underlying watchedDepthKey actually belongs to (set
// in the option-chain poll loop below, right where watchedDepthKey is
// matched to a chain row). Needed so omsFuturesConfirm (below) can check
// "is the future that just ticked actually the one for what the user is
// watching?" instead of broadcasting whatever future happened to tick.
let watchedUnderlyingSymbol = null;

// ---------------------------------------------------------------
// OMS (Order-Flow Momentum) history buffers — feeds the 6 OMS cards on
// the dashboard (omsOiChange, omsVolOiRatio, omsIvChange, omsDeltaVolume,
// omsAskHitRatio, omsFuturesConfirm). These all read the SAME strike the
// user is already watching via "watchDepth" (same strike Bid-Ask
// Imbalance / Microprice Deviation use) — no new subscription needed.
// oiChangePct / ivChangePct are measured against the OLDEST sample still
// inside the 30-minute rolling window, per the "OI Change % (last
// 15-30min)" spec.
// ---------------------------------------------------------------
const OMS_HISTORY_WINDOW_MS = 30 * 60 * 1000;
let omsStrikeHistory = []; // [{t, oi, iv, volume, ltp, delta}] for the watched option leg
let omsFuturesHistory = []; // [{t, oi, price}] for NIFTY FUT (futures trap-filter confirmation)

function isOptionInstrumentKey(key) {
  // Upstox option instrument keys live in the F&O segment. This is a
  // coarse guard — real safety comes from only ever using callKey/putKey
  // values that came straight out of the option chain response itself.
  return typeof key === "string" && key.startsWith("NSE_FO|");
}

const MAX_SPREAD_PERCENTAGE = 3.0; // reject if best-ask/best-bid gap exceeds this

// Pulls live market depth. Always refuses if the strike has no two-sided
// book at all (that's a real risk for any order type — the order may
// simply never fill, or fill against a single stale quote). The wide-
// spread rejection, however, only applies when the order is actually
// exposed to that spread:
//   - MARKET orders always are (price isn't user-controlled at all).
//   - LIMIT orders only are if the submitted price is "marketable" — a BUY
//     limit at/above the best ask, or a SELL limit at/below the best bid —
//     because that order would cross and fill immediately, behaving
//     exactly like a market order despite being labeled LIMIT.
// A passive LIMIT resting at/near the bid (or ask, for a sell) is the
// correct, low-risk way to trade an illiquid strike — its execution price
// is capped by the price the trader chose, so a wide spread is not a
// slippage risk for it and must not be blocked.
async function checkLiquidity(instrument_key, { order_type, transaction_type, price } = {}) {
  const quoteUrl = `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${instrument_key}`;
  const quoteRes = await axios.get(quoteUrl, {
    headers: { Accept: "application/json", Authorization: `Bearer ${optionOrderAccessToken}` },
  });

  const quoteData = quoteRes.data?.data?.[instrument_key];
  if (!quoteData || !quoteData.depth) {
    throw new Error("Refused: no market depth for this strike — it looks illiquid.");
  }

  const buyDepth = quoteData.depth.buy;
  const sellDepth = quoteData.depth.sell;
  if (!buyDepth?.length || !sellDepth?.length) {
    throw new Error("Refused: no active buyer or seller in the book — order blocked.");
  }

  const bestBid = buyDepth[0].price;
  const bestAsk = sellDepth[0].price;
  const spreadPct = ((bestAsk - bestBid) / bestBid) * 100;

  const isMarketable =
    order_type === "MARKET" ||
    (order_type === "LIMIT" && transaction_type === "BUY" && Number(price) >= bestAsk) ||
    (order_type === "LIMIT" && transaction_type === "SELL" && Number(price) <= bestBid);

  if (isMarketable && spreadPct > MAX_SPREAD_PERCENTAGE) {
    const why = order_type === "MARKET" ? "a MARKET order" : "a LIMIT order priced to cross immediately (same as a market fill)";
    throw new Error(`Refused: spread too wide (${spreadPct.toFixed(2)}%) for ${why}. Bid ₹${bestBid} / Ask ₹${bestAsk}. Place a passive LIMIT at/near the bid or ask instead.`);
  }

  return { bestBid, bestAsk, spreadPct, isMarketable };
}

async function placeOptionOrder({ instrument_key, quantity, transaction_type, order_type, price, product }) {
  if (!isOptionInstrumentKey(instrument_key)) {
    throw new Error("Refused: instrument_key is not an options contract. This relay only routes options orders.");
  }
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QTY_PER_ORDER) {
    throw new Error(`Refused: quantity must be 1–${MAX_QTY_PER_ORDER}.`);
  }
  if (ordersPlacedToday >= MAX_ORDERS_PER_DAY) {
    throw new Error(`Refused: daily order cap (${MAX_ORDERS_PER_DAY}) reached.`);
  }
  if (!["BUY", "SELL"].includes(transaction_type)) {
    throw new Error("Refused: transaction_type must be BUY or SELL.");
  }
  if (order_type === "LIMIT" && !(Number(price) > 0)) {
    throw new Error("Refused: LIMIT order needs a positive price.");
  }
  // FIX (Fatal Flaw 1 — "Tick Size" Reject): NSE F&O prices must be a
  // multiple of ₹0.05. Don't rely solely on the frontend to send a clean
  // tick — reject anything malformed here too, before it ever reaches
  // Upstox, so a bad client value fails fast with a clear reason instead
  // of a cryptic exchange rejection.
  if (order_type === "LIMIT") {
    const ticks = Number(price) / 0.05;
    if (Math.abs(Math.round(ticks) - ticks) > 1e-6) {
      throw new Error(`Refused: price ₹${price} is not a valid ₹0.05 tick. Round to the nearest tick before placing.`);
    }
  }

  const depth = await checkLiquidity(instrument_key, { order_type, transaction_type, price });
  console.log(`[LIQUIDITY OK] ${instrument_key} bid=${depth.bestBid} ask=${depth.bestAsk} spread=${depth.spreadPct.toFixed(2)}% marketable=${depth.isMarketable}`);

  const body = {
    quantity,
    product: product || "MIS",
    validity: "DAY",
    price: order_type === "MARKET" ? 0 : price,
    instrument_token: instrument_key,
    order_type: order_type || "MARKET",
    transaction_type,
    disclosed_quantity: 0,
    trigger_price: 0,
    is_amo: false,
  };

  const resp = await axios.post("https://api.upstox.com/v2/order/place", body, {
    headers: {
      Authorization: `Bearer ${optionOrderAccessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  ordersPlacedToday += 1;
  return resp.data;
}

// ---------------------------------------------------------------
// Session-candle replay — lets the dashboard reconstruct today's candles
// (and therefore the true 9:15-anchored VWAP, plus EMA/RSI/Hurst warmup)
// after a page refresh or WS reconnect, instead of only ever starting from
// an empty buffer built up tick-by-tick from the moment the page opened.
// ---------------------------------------------------------------
async function fetchSessionCandles(instrument_key) {
  // Upstox's 1-minute intraday endpoint returns every candle from today's
  // market open up to the last completed minute. Response candles are
  // [timestamp, open, high, low, close, volume, oi], newest-first.
  const url = `https://api.upstox.com/v2/historical-candle/intraday/${encodeURIComponent(instrument_key)}/1minute`;
  const res = await axios.get(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${optionOrderAccessToken}` },
  });
  const raw = res.data?.data?.candles || [];
  // Oldest-first, and only today's date (the endpoint is documented as
  // "intraday" / current-day-only, but this guards against any stray
  // rows if Upstox ever changes that).
  const todayStr = todayIST();
  return raw
    .filter((row) => String(row[0]).slice(0, 10) === todayStr)
    .map((row) => ({
      // FIXED: was parsing row[1] (the open price) as a date, which silently
      // resolved to ~Jan 1 1970 instead of throwing/NaN — trashing the VWAP
      // anchor. row[0] is the actual candle timestamp.
      t: new Date(row[0]).getTime() || Date.parse(row[0]),
      o: row[1], h: row[2], l: row[3], c: row[4],
      vol: row[5] ?? null,
    }))
    .sort((a, b) => a.t - b.t);
}

relay.on("connection", (client) => {
  client.send(JSON.stringify({ type: "status", status: lastStatus }));
  client.send(JSON.stringify({ type: "capTierSymbols", data: CAP_TIER_SYMBOLS }));
  client.send(JSON.stringify({ type: "globalMegacapWatchlist", data: GLOBAL_MEGACAP_WATCHLIST }));
  client.send(JSON.stringify({ type: "fiiDiiCashFlowStatus", ...fiiDiiCashFlowStatus }));
  if (lastFiiDiiCashFlow) client.send(JSON.stringify({ type: "fiiDiiCashFlow", ...lastFiiDiiCashFlow }));
  // Two-way: dashboard can now send order requests over this same socket.
  client.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === "getSessionCandles") {
      const symbol = msg.symbol;
      const meta = INSTRUMENTS.find((i) => i.symbol === symbol);
      if (!meta) {
        client.send(JSON.stringify({ type: "sessionCandles", ok: false, symbol, error: "Unknown symbol — not in this relay's INSTRUMENTS list (e.g. crypto has no Upstox history).", requestId: msg.requestId }));
        return;
      }
      try {
        const candles = await fetchSessionCandles(meta.key);
        client.send(JSON.stringify({ type: "sessionCandles", ok: true, symbol, candles, requestId: msg.requestId }));
      } catch (err) {
        const reason = err?.response?.data?.errors?.[0]?.message || err.message;
        client.send(JSON.stringify({ type: "sessionCandles", ok: false, symbol, error: reason, requestId: msg.requestId }));
      }
      return;
    }
    if (msg.type === "watchDepth") {
      // Microprice Deviation / Bid-Ask Imbalance depth poll — just record
      // which strike to watch; startDepthPolling's own loop below reads
      // this on its next 7s tick, same as optionAccessToken is read fresh
      // each poll rather than captured once.
      watchedDepthKey = msg.instrument_key || null;
      omsFuturesHistory = []; // FIX: clear stale futures history on symbol switch (see omsFuturesConfirm scoping above)
      console.log(`[DEPTH] Now watching: ${watchedDepthKey}`);
      return;
    }
    if (msg.type !== "placeOrder") return;
    try {
      const result = await placeOptionOrder(msg.data || {});
      client.send(JSON.stringify({ type: "orderUpdate", ok: true, result, requestId: msg.requestId }));
    } catch (err) {
      const reason = err?.response?.data?.errors?.[0]?.message || err.message;
      client.send(JSON.stringify({ type: "orderUpdate", ok: false, error: reason, requestId: msg.requestId }));
    }
  });
});


// ---------------------------------------------------------------
// 2. OAuth login flow
// ---------------------------------------------------------------
function loginUrl() {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: API_KEY,
    redirect_uri: REDIRECT_URI,
  });
  return `https://api.upstox.com/v2/login/authorization/dialog?${params.toString()}`;
}

function waitForAuthCode() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      const code = url.searchParams.get("code");
      if (code) {
        res.end("Upstox login successful — you can close this tab and return to the terminal.");
        server.close();
        resolve(code);
      } else if (url.pathname === "/" || url.pathname === "/login") {
        // Short local link so you never have to copy/paste the long Upstox URL.
        res.writeHead(302, { Location: loginUrl() });
        res.end();
      } else {
        res.end("Waiting for Upstox login…");
      }
    });
    server.listen(CALLBACK_PORT, () => {
      console.log("\nJust open this in your browser (no copy-paste needed): http://localhost:3000\n");
    });
  });
}

// ---------------------------------------------------------------
// Token cache — so switching to a new relay-server-N.js file mid-day
// doesn't force a fresh browser login. Upstox tokens are valid for the
// rest of the calendar day (they expire ~3:30am IST), so any process
// started on the same day can safely reuse one saved by an earlier run.
// ---------------------------------------------------------------
const fs = require("fs");
const path = require("path");
const TOKEN_CACHE_FILE = path.join(__dirname, ".token_cache.json");

function todayIST() {
  // IST = UTC+5:30. Simple offset add is fine for a same-day check like this.
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10); // YYYY-MM-DD
}

function loadCachedToken() {
  try {
    const raw = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, "utf-8"));
    if (raw.date === todayIST() && raw.access_token) {
      console.log(`Reusing cached Upstox access token from today (${TOKEN_CACHE_FILE}) — no login needed.`);
      return raw.access_token;
    }
    console.log("Cached token is from a previous day — a fresh login is needed.");
  } catch {
    console.log("No cached token found — a fresh login is needed.");
  }
  return null;
}

function saveTokenToCache(token) {
  try {
    fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({ date: todayIST(), access_token: token }, null, 2));
  } catch (err) {
    console.error("Could not save token cache (non-fatal):", err.message);
  }
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    code,
    client_id: API_KEY,
    client_secret: API_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });
  const resp = await axios.post("https://api.upstox.com/v2/login/authorization/token", body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
  });
  return resp.data.access_token;
}

// ---------------------------------------------------------------
// 3. Upstox live market data stream
// ---------------------------------------------------------------
// BUGFIX — this is almost always why "LIVE" stops showing mid-session:
// the original code had NO reconnect logic. Once Upstox's socket closed
// (idle timeout, brief network blip, etc.) the relay just sat there
// broadcasting OFFLINE forever until you manually restarted the process.
// We now auto-reconnect with the same access token (no re-login needed,
// as long as it's still the same trading day) using exponential backoff,
// and log every stage so failures show up in the terminal instead of
// silently going dark.
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY_MS = 30000;

// Live-streamed options: instrument_key -> {symbol, category:"option"}.
// Populated as the option chain poller discovers strikes, so option LTPs
// arrive tick-by-tick over the same WebSocket instead of waiting for the
// next 5s REST poll. Also tracks which keys are already subscribed so we
// don't re-subscribe the same strikes every poll cycle.
const dynamicMeta = {};
const subscribedOptionKeys = new Set();
let activeStreamer = null; // set once the market stream connects

function startMarketStream(accessToken) {
  const defaultClient = UpstoxClient.ApiClient.instance;
  defaultClient.authentications["OAUTH2"].accessToken = accessToken;

  const keys = INSTRUMENTS.map((i) => i.key);
  console.log(`Subscribing to ${keys.length} instruments:`, keys.join(", "));
  const streamer = new UpstoxClient.MarketDataStreamerV3(keys, "full");
  activeStreamer = streamer;

  const scheduleReconnect = () => {
    reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
    console.log(`Reconnecting to Upstox feed in ${delay / 1000}s (attempt ${reconnectAttempts})...`);
    setTimeout(() => startMarketStream(accessToken), delay);
  };

  streamer.on("open", () => {
    reconnectAttempts = 0; // reset backoff once actually connected
    console.log("Connected to Upstox market data feed — dashboard will show LIVE");
    setStatus("LIVE");
  });

  streamer.on("message", (raw) => {
    try {
      const payload = JSON.parse(raw.toString("utf-8"));
      const feeds = payload.feeds || {};
      Object.entries(feeds).forEach(([instrumentKey, feed]) => {
        const meta = INSTRUMENTS.find((i) => i.key === instrumentKey) || dynamicMeta[instrumentKey];
        if (!meta) return;
        const ltpc =
          feed?.fullFeed?.marketFF?.ltpc ||
          feed?.fullFeed?.indexFF?.ltpc ||
          feed?.ltpc;
        if (!ltpc || ltpc.ltp == null) return;

        const ltp = ltpc.ltp;
        const prevClose = ltpc.cp; // previous day close, when present
        const chg = prevClose ? ltp - prevClose : 0;
        const chgPct = prevClose ? (chg / prevClose) * 100 : 0;
        // Cumulative volume traded today — real field from Upstox's full
        // feed, previously discarded. Not available on indexFF (indices
        // don't have traded volume), only on marketFF (stocks/F&O).
        const vtt = feed?.fullFeed?.marketFF?.vtt ?? null;
        // Open Interest — only meaningful for F&O legs (futures/options),
        // not indices/equities. Feeds the OMS Futures Confirmation trap
        // filter below (futuresOiUp / futuresPriceUp).
        const oi = feed?.fullFeed?.marketFF?.oi ?? null;
        if (meta.category === "future" && oi != null) {
            // FIX: previously broadcast omsFuturesConfirm for ANY futures
            // tick, regardless of what the user is actually watching — so
            // if you were on RELIANCE options, this indicator was silently
            // showing NIFTY FUT's OI/price confirmation (currently the
            // ONLY future this relay subscribes to — see INSTRUMENTS.push
            // "NIFTY FUT" above), mislabeled as if it confirmed RELIANCE.
            // Now only broadcasts when the ticking future's underlying
            // actually matches what watchedDepthKey is pointed at, so it
            // correctly goes silent (WAIT on the dashboard) instead of
            // showing a different symbol's futures data.
            const futuresUnderlying = meta.symbol.replace(/\s*FUT$/i, "").trim();
            if (watchedUnderlyingSymbol && futuresUnderlying === watchedUnderlyingSymbol) {
                const now = Date.now();
                omsFuturesHistory.push({ t: now, oi, price: ltp });
                omsFuturesHistory = omsFuturesHistory.filter((p) => now - p.t <= OMS_HISTORY_WINDOW_MS);
                const oldest = omsFuturesHistory[0];
                if (oldest) {
                    const futuresOiUp = oldest.oi != null ? (oi >= oldest.oi ? 1 : 0) : 0;
                    const futuresPriceUp = oldest.price != null && ltp != null ? (ltp >= oldest.price ? 1 : 0) : 0;
                    broadcast({ type: "indicators", data: { omsFuturesConfirm: { futuresOiUp, futuresPriceUp } } });
                }
            }
        }

        // GOI 10Y / 91D T-Bill futures: these are PRICE feeds. Convert
        // to an actual annualized yield% right here so the dashboard
        // never has to (and never mislabels a price move as a yield
        // move). See BOND_FUTURES_CONFIG comment for the notional
        // coupon assumption behind the 10Y conversion.
        let yieldPct = null;
        if (meta.category === "bond" && meta.bondMeta) {
          yieldPct = meta.bondMeta.kind === "tbill"
            ? tbillYieldFromPrice(ltp, meta.bondMeta.daysToMaturity)
            : bondYtmFromPrice(ltp, meta.bondMeta.couponPct, meta.bondMeta.maturityYears, meta.bondMeta.freq);
          if (yieldPct != null) yieldPct = +yieldPct.toFixed(3);
        }

        broadcast({
          type: "market",
          data: { [meta.symbol]: { symbol: meta.symbol, category: meta.category, capTier: meta.capTier, ltp, chg, chgPct, vtt, ...(yieldPct != null ? { yieldPct } : {}) } },
        });

        if (instrumentKey === PRIMARY_INSTRUMENT_KEY) {
          broadcast({ type: "tick", ltp });
        }
      });
    } catch (err) {
      // ignore malformed/heartbeat frames
    }
  });

  streamer.on("error", (err) => {
    console.error("Upstox stream error:", err?.message || err);
    if (activeStreamer === streamer) activeStreamer = null;
    setStatus("OFFLINE");
    scheduleReconnect();
  });

  streamer.on("close", () => {
    console.log("Upstox stream closed — dashboard will show OFFLINE, attempting reconnect...");
    if (activeStreamer === streamer) activeStreamer = null;
    setStatus("OFFLINE");
    scheduleReconnect();
  });

  streamer.connect();
}

// ---------------------------------------------------------------
// 4. Option chain polling (REST — Upstox doesn't push option chain over
//    the websocket, so we poll it on an interval instead)
// ---------------------------------------------------------------
// Underlyings to fetch chains for, with their nearest weekly/monthly
// expiry. In production, fetch the expiry list from Upstox's
// /v2/option/contract endpoint instead of hardcoding — left simple here
// so this runs out of the box.
// Indices use weekly expiry; individual stocks only get monthly options
// on NSE, so each underlying is tagged with which cadence to poll for.
// BUG FIX: this used to be a `const` built ONCE at module load from
// `INSTRUMENTS.filter(...)`. The ~300 large/mid/small-cap stocks get
// pushed into INSTRUMENTS asynchronously (after resolveCapTierSymbols
// finishes its NSE fetches), which happens AFTER this line already ran —
// so those 300 stocks were silently never included, no matter how long
// the relay had been running. Fixed by making this a `let` array that
// syncOptionUnderlyings() re-scans and grows at runtime.
let OPTION_UNDERLYINGS = [
  { key: "NSE_INDEX|Nifty 50", symbol: "NIFTY", expiryType: "weekly" },
  { key: "NSE_INDEX|Nifty Bank", symbol: "BANKNIFTY", expiryType: "weekly" },
];
const optionUnderlyingSymbols = new Set(OPTION_UNDERLYINGS.map((u) => u.symbol));
// Re-scans INSTRUMENTS for any "stock" OR "commodity" category entries not
// yet in OPTION_UNDERLYINGS (this is how the 300 cap-tier stocks — added
// long after startup — actually make it into the option-chain poll),
// resolves each NEW one's real expiry from Upstox, then appends it in place
// so the running poll loop picks it up on its next round automatically.
// FIX: previously only ever matched category === "stock", so MCX
// commodities (GOLD/SILVER/CRUDEOIL/NATURALGAS/COPPER — resolved into
// INSTRUMENTS as category "commodity" by resolveMcxKeys()) never got their
// option chain polled at all — the 5 OMS indicators just sat at WAIT for
// any commodity forever, not because of a selection bug but because this
// relay never fetched that chain in the first place. Upstox's
// /v2/option/chain and /v2/option/contract endpoints both just take
// whatever instrument_key you pass, and resolveMcxKeys() already resolves
// the correct current-month MCX futures key per commodity, so the same
// fetchOptionChain/fetchUpcomingExpiries calls work unchanged here.
async function syncOptionUnderlyings(accessToken) {
  const fallbackMonthly = nextMonthlyExpiry();
  const newOnes = INSTRUMENTS.filter((i) => (i.category === "stock" || i.category === "commodity") && !optionUnderlyingSymbols.has(i.symbol));
  if (newOnes.length === 0) return;
  console.log(`syncOptionUnderlyings: found ${newOnes.length} new stock/commodity underlying(s) to add to option-chain polling.`);
  for (const inst of newOnes) {
    const underlying = { key: inst.key, symbol: inst.symbol, expiryType: "monthly" };
    try {
      const upcoming = await fetchUpcomingExpiries(underlying.key, accessToken);
      underlying.resolvedExpiry = upcoming[0] || fallbackMonthly;
      underlying.resolvedNextExpiry = null;
    } catch (err) {
      underlying.resolvedExpiry = fallbackMonthly;
      underlying.resolvedNextExpiry = null;
      // MCX commodities can legitimately have NO listed options chain
      // (e.g. NATURALGAS/COPPER often don't) — log it plainly instead of
      // looking like a generic failure, so this isn't mistaken for a bug
      // on every restart.
      const hint = inst.category === "commodity" ? " (commodity options may simply not be listed for this contract — not necessarily an error)" : "";
      console.error(`  syncOptionUnderlyings: could not resolve expiry for ${underlying.symbol}, falling back to ${fallbackMonthly}${hint}:`, err?.response?.data || err.message);
    }
    OPTION_UNDERLYINGS.push(underlying);
    optionUnderlyingSymbols.add(underlying.symbol);
    await sleep(200); // gentle pacing — this can add ~300 symbols in one go the first time cap-tier data lands
  }
  console.log(`syncOptionUnderlyings: option-chain polling now covers ${OPTION_UNDERLYINGS.length} underlyings.`);
}
const OPTION_CHAIN_POLL_MS = 30000; // full-cycle rest between rounds
const OPTION_CHAIN_REQUEST_GAP_MS = 600; // gap between each symbol's request within a round
let optionAccessToken = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOptionChain(underlying, expiryDate, token) {
  const resp = await axios.get("https://api.upstox.com/v2/option/chain", {
    params: { instrument_key: underlying.key, expiry_date: expiryDate },
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    timeout: 8000, // was missing — a hung request used to block the entire poll loop forever with no error printed
  });
  // FIX (v103): removed leftover debug log that dumped the raw NIFTY
  // option chain response to console every poll cycle (every 30s).
  const rows = resp.data?.data || [];
  return rows.map((r) => ({
    strike: r.strike_price,
    callLtp: r.call_options?.market_data?.ltp ?? null,
    callOi: r.call_options?.market_data?.oi ?? null,
    callVolume: r.call_options?.market_data?.volume ?? null,
    callIv: r.call_options?.option_greeks?.iv ?? null,
    callDelta: r.call_options?.option_greeks?.delta ?? null,
    callKey: r.call_options?.instrument_key ?? null,
    putLtp: r.put_options?.market_data?.ltp ?? null,
    putOi: r.put_options?.market_data?.oi ?? null,
    putVolume: r.put_options?.market_data?.volume ?? null,
    putIv: r.put_options?.option_greeks?.iv ?? null,
    putDelta: r.put_options?.option_greeks?.delta ?? null,
    putKey: r.put_options?.instrument_key ?? null,
  }));
}

async function fetchUpcomingExpiries(instrumentKey, token) {
  // NSE changed weekly-options expiry days a while back, so guessing
  // "next Thursday" is no longer reliable — ask Upstox directly for the
  // real list of contract expiries. Returns ALL upcoming expiries
  // (soonest first), not just the nearest one, so callers can also read
  // the SECOND upcoming expiry for IV Term Structure (near vs next).
  const resp = await axios.get("https://api.upstox.com/v2/option/contract", {
    params: { instrument_key: instrumentKey },
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    timeout: 8000,
  });
  const rows = resp.data?.data || [];
  const today = new Date().toISOString().slice(0, 10);
  const expiries = [...new Set(rows.map((r) => r.expiry).filter(Boolean))].sort();
  const upcoming = expiries.filter((e) => e >= today);
  return upcoming.length ? upcoming : expiries.slice(-1); // fallback: last known expiry if nothing "upcoming" resolves
}
async function fetchNearestExpiry(instrumentKey, token) {
  const upcoming = await fetchUpcomingExpiries(instrumentKey, token);
  return upcoming[0] || null;
}

function nextWeeklyExpiry() {
  // Nearest upcoming Thursday, formatted YYYY-MM-DD (NSE's usual weekly
  // expiry day). If today itself IS Thursday, that's today's expiry — this
  // fallback is only used when the real expiry lookup (fetchNearestExpiry,
  // which already handles today correctly via `>= today`) fails, so it
  // must not silently skip today and jump a week ahead on expiry day.
  const d = new Date();
  const day = d.getDay();
  const daysToThu = (4 - day + 7) % 7; // 0 when today is Thursday
  d.setDate(d.getDate() + daysToThu);
  return d.toISOString().slice(0, 10);
}

function nextMonthlyExpiry() {
  // Last Thursday of the current month, formatted YYYY-MM-DD (NSE's usual
  // monthly stock-options expiry day). If that date has already passed
  // this month, roll to the last Thursday of next month instead.
  const lastThursdayOf = (year, month) => {
    const d = new Date(year, month + 1, 0); // last day of `month`
    const day = d.getDay();
    const diff = (day - 4 + 7) % 7; // days back to Thursday
    d.setDate(d.getDate() - diff);
    return d;
  };
  const now = new Date();
  let d = lastThursdayOf(now.getFullYear(), now.getMonth());
  if (d < now) d = lastThursdayOf(now.getFullYear(), now.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// Periodic depth poll for whichever strike the dashboard last asked to
// watch (see the "watchDepth" message handler above) — feeds Bid-Ask
// Imbalance and Microprice Deviation. Deliberately reads the mutable
// optionOrderAccessToken GLOBAL on every iteration instead of a captured
// parameter, same as startOptionChainPolling's optionAccessToken below —
// the token gets refreshed daily (~3:30am IST) by a separate login flow,
// and a captured snapshot would silently start 401ing after that refresh
// with no visible error (the catch below is a deliberate silent skip on
// real network blips, not a place to also hide auth failures).
async function startDepthPolling() {
  while (true) {
    if (watchedDepthKey && optionOrderAccessToken) {
      try {
        const quoteRes = await axios.get(`https://api.upstox.com/v2/market-quote/quotes?instrument_key=${watchedDepthKey}`, {
          headers: { Authorization: `Bearer ${optionOrderAccessToken}`, Accept: "application/json" },
        });
        const data = quoteRes.data?.data?.[watchedDepthKey];
        if (data?.depth?.buy?.length && data?.depth?.sell?.length) {
          // Bid-Ask Imbalance Pressure is labeled "Top-5 bid/ask quantity"
          // on the dashboard (top-5 depth is a more robust, harder-to-spoof
          // imbalance read than raw level-1 size). Sum whatever levels
          // Upstox gives us, up to 5, on each side.
          const top5Bid = data.depth.buy.slice(0, 5).reduce((sum, lvl) => sum + (lvl?.quantity || 0), 0);
          const top5Ask = data.depth.sell.slice(0, 5).reduce((sum, lvl) => sum + (lvl?.quantity || 0), 0);
          broadcast({
            type: "depth",
            instrument_key: watchedDepthKey,
            bidQty: top5Bid,
            askQty: top5Ask,
            bestBid: data.depth.buy[0]?.price || 0,
            bestAsk: data.depth.sell[0]?.price || 0,
          });
          // OMS Ask-Hit Ratio — APPROXIMATION NOTE: Upstox's REST API does
          // not expose true trade-tape data (which side actually got hit),
          // so this reuses top-5 resting depth as a proxy: heavier resting
          // size on the ask vs bid is treated as buyer aggression pressure.
          // This is directionally useful but is NOT the same as real
          // executed-trade aggressor-side data. Swap this for genuine
          // tick-by-tick trade data if/when the broker feed exposes it.
          broadcast({ type: "indicators", data: { omsAskHitRatio: { askHits: top5Ask, bidHits: top5Bid } } });
        }
      } catch (e) { /* silent skip on network blip — auth failures show up as a stuck "no data yet" on the dashboard rather than a crash */ }
    }
    await sleep(7000); // 7s poll rate — matches the existing depth-poll cadence noted on the frontend
  }
}
async function startOptionChainPolling(accessToken) {
  optionAccessToken = accessToken;
  // Resolve each underlying's REAL nearest expiry from Upstox directly,
  // instead of guessing Thursday — falls back to the guessed date only
  // if the contract lookup itself fails.
  const fallbackWeekly = nextWeeklyExpiry();
  const fallbackMonthly = nextMonthlyExpiry();
  for (const underlying of OPTION_UNDERLYINGS) {
    try {
      const upcoming = await fetchUpcomingExpiries(underlying.key, accessToken);
      underlying.resolvedExpiry = upcoming[0] || (underlying.expiryType === "monthly" ? fallbackMonthly : fallbackWeekly);
      // IV Term Structure (near vs next expiry) only needs this for
      // NIFTY/BANKNIFTY — same restriction the dashboard already applies
      // to VEX/Charm/other chain reads, and it avoids doubling the chain
      // poll load across all 25 monthly stock symbols for a feature that
      // only lights up on the two index underlyings anyway.
      underlying.resolvedNextExpiry = underlying.expiryType === "weekly" ? (upcoming[1] || null) : null;
      console.log(`Resolved real expiry for ${underlying.symbol}: ${underlying.resolvedExpiry}${underlying.resolvedNextExpiry ? ` (next: ${underlying.resolvedNextExpiry})` : ""}`);
    } catch (err) {
      underlying.resolvedExpiry = underlying.expiryType === "monthly" ? fallbackMonthly : fallbackWeekly;
      underlying.resolvedNextExpiry = null;
      console.error(`Could not resolve real expiry for ${underlying.symbol}, falling back to ${underlying.resolvedExpiry}:`, err?.response?.data || err.message);
    }
    await sleep(300);
  }

  const pollOnce = async () => {
    await syncOptionUnderlyings(accessToken);
    console.log(`--- option chain round starting (${OPTION_UNDERLYINGS.length} symbols) ---`);
    for (const underlying of OPTION_UNDERLYINGS) {
      console.log(`  fetching option chain for ${underlying.symbol}...`);
      try {
        const expiry = underlying.resolvedExpiry;
        // space requests out so we don't slam Upstox's rate limit
        // (was firing all symbols back-to-back every 5s -> UDAPI10005)
        await sleep(OPTION_CHAIN_REQUEST_GAP_MS);
        const chain = await fetchOptionChain(underlying, expiry, optionAccessToken);
        console.log(`Option chain OK for ${underlying.symbol}: ${chain.length} strikes (expiry ${expiry})`);
        broadcast({ type: "optionChain", underlying: underlying.symbol, expiry, data: chain });

        // BUG FIX: the option chain table's LTP came from this REST poll,
        // but CMP/trade-ticket pricing only ever read marketData, which
        // was populated exclusively by live Upstox WS ticks. An option
        // strike with no tick yet this cycle (illiquid strike, or simply
        // outside market hours) showed CMP "—" even though this same
        // poll just fetched a perfectly good LTP for it. Merge every
        // strike's LTP into marketData here too, so the two sources
        // stay in sync regardless of whether a live tick has arrived.
        const chainMarketUpdates = {};
        chain.forEach((row) => {
          if (row.callKey && row.callLtp != null) {
            const sym = `${underlying.symbol} ${row.strike} CE`;
            chainMarketUpdates[sym] = { symbol: sym, category: "option", ltp: row.callLtp };
          }
          if (row.putKey && row.putLtp != null) {
            const sym = `${underlying.symbol} ${row.strike} PE`;
            chainMarketUpdates[sym] = { symbol: sym, category: "option", ltp: row.putLtp };
          }
        });
        if (Object.keys(chainMarketUpdates).length) {
          broadcast({ type: "market", data: chainMarketUpdates });
        }

        // --- OMS wiring: if the user is currently watching a strike (same
        // watchDepth mechanism Bid-Ask Imbalance already uses), compute the
        // 5 live OMS sub-indicators for that exact leg and push them via
        // the existing generic "indicators" broadcast, which the dashboard
        // already merges straight into state[indicatorId]. ---
        if (watchedDepthKey) {
          const row = chain.find((r) => r.callKey === watchedDepthKey || r.putKey === watchedDepthKey);
          if (row) {
            watchedUnderlyingSymbol = underlying.symbol; // FIX: for omsFuturesConfirm scoping below
            const isCall = row.callKey === watchedDepthKey;
            const oiNow = isCall ? row.callOi : row.putOi;
            const ivNow = isCall ? row.callIv : row.putIv;
            const volNow = isCall ? row.callVolume : row.putVolume;
            const deltaNow = isCall ? row.callDelta : row.putDelta;
            const ltpNow = isCall ? row.callLtp : row.putLtp;
            const now = Date.now();
            const prevSample = omsStrikeHistory.length ? omsStrikeHistory[omsStrikeHistory.length - 1] : null;
            omsStrikeHistory.push({ t: now, oi: oiNow, iv: ivNow, volume: volNow, ltp: ltpNow, delta: deltaNow, key: watchedDepthKey });
            omsStrikeHistory = omsStrikeHistory.filter((p) => now - p.t <= OMS_HISTORY_WINDOW_MS && p.key === watchedDepthKey);
            const oldest = omsStrikeHistory[0];

            const oiChangePct = oldest && oldest.oi ? +(((oiNow - oldest.oi) / oldest.oi) * 100).toFixed(2) : 0;
            const ivPrev = oldest && oldest.iv != null ? oldest.iv : ivNow;
            const priceUp = prevSample && prevSample.ltp != null && ltpNow != null ? (ltpNow >= prevSample.ltp ? 1 : 0) : 1;
            // Rolling average |delta|*volume over the window -> baseline
            // for the Delta×Volume indicator (flags genuine above-normal
            // directional exposure, not just noisy far-OTM activity).
            const dvSamples = omsStrikeHistory.filter((p) => p.delta != null && p.volume != null).map((p) => Math.abs(p.delta) * p.volume);
            const avgDeltaVolume = dvSamples.length ? Math.round(dvSamples.reduce((a, b) => a + b, 0) / dvSamples.length) : 0;

            broadcast({
              type: "indicators",
              data: {
                omsOiChange: { oiChangePct, priceUp },
                omsVolOiRatio: { volume: volNow ?? 0, oi: oiNow ?? 0, priceUp },
                omsIvChange: { ivNow: ivNow ?? 0, ivPrev: ivPrev ?? 0 },
                omsDeltaVolume: { delta: Math.abs(deltaNow ?? 0), volume: volNow ?? 0, avgDeltaVolume },
              },
            });
          }
        }

        // Register meta + subscribe any newly-seen strikes so their LTP
        // streams tick-by-tick over the WebSocket instead of only updating
        // once per 5s poll. Already-subscribed keys are skipped.
        const newKeys = [];
        chain.forEach((row) => {
          if (row.callKey && !dynamicMeta[row.callKey]) {
            dynamicMeta[row.callKey] = { key: row.callKey, symbol: `${underlying.symbol} ${row.strike} CE`, category: "option" };
          }
          if (row.putKey && !dynamicMeta[row.putKey]) {
            dynamicMeta[row.putKey] = { key: row.putKey, symbol: `${underlying.symbol} ${row.strike} PE`, category: "option" };
          }
          [row.callKey, row.putKey].forEach((k) => {
            if (k && !subscribedOptionKeys.has(k)) { subscribedOptionKeys.add(k); newKeys.push(k); }
          });
        });
        if (newKeys.length && activeStreamer) {
          console.log(`Subscribing ${newKeys.length} option strikes for live ticks (${underlying.symbol})`);
          activeStreamer.subscribe(newKeys, "full");
        }

        // IV Term Structure — fetch the NEXT expiry's chain too (only for
        // NIFTY/BANKNIFTY, see resolvedNextExpiry above). Deliberately a
        // separate try/catch: a failure here should never take down the
        // near-expiry chain the rest of the dashboard depends on, it
        // should just leave the term-structure indicator at "no data yet".
        if (underlying.resolvedNextExpiry) {
          try {
            await sleep(OPTION_CHAIN_REQUEST_GAP_MS);
            const nextChain = await fetchOptionChain(underlying, underlying.resolvedNextExpiry, optionAccessToken);
            console.log(`Next-expiry option chain OK for ${underlying.symbol}: ${nextChain.length} strikes (expiry ${underlying.resolvedNextExpiry})`);
            broadcast({ type: "optionChainNext", underlying: underlying.symbol, expiry: underlying.resolvedNextExpiry, data: nextChain });
          } catch (err) {
            const detail = err?.response?.data || err.message;
            console.error(`Next-expiry option chain fetch failed for ${underlying.symbol}:`, detail);
            // no broadcast on failure — the frontend just keeps whatever
            // next-expiry data it last had (or none), same "supplementary,
            // don't flip apiStatus" treatment as the near-expiry error path.
          }
        }
      } catch (err) {
        const detail = err?.response?.data || err.message;
        const isRateLimited = err?.response?.status === 429 ||
          (typeof detail === "object" && JSON.stringify(detail).includes("UDAPI10005"));
        if (isRateLimited) {
          // back off harder than the normal per-symbol gap when we get
          // explicitly rate-limited, then continue with the next symbol
          await sleep(3000);
        }
        console.error(`Option chain fetch failed for ${underlying.symbol}:`, detail);
        // don't flip apiStatus for this — option chain is supplementary,
        // spot ticks from the websocket are the primary LIVE signal.
        // But DO tell the dashboard so it stops showing "Waiting..."
        // forever with no clue why (usually a 403 — Upstox's option chain
        // endpoint needs the paid Market Data / Option Greeks subscription
        // on your Upstox account, separate from basic API access).
        broadcast({
          type: "optionChainError",
          underlying: underlying.symbol,
          message: typeof detail === "string" ? detail : JSON.stringify(detail),
        });
      }
    }
  };

  // Run rounds back-to-back-with-rest instead of a fixed setInterval,
  // so a slow/rate-limited round never overlaps with the next one
  // (overlapping rounds is what was compounding the 429s).
  let stopped = false;
  (async () => {
    while (!stopped) {
      await pollOnce();
      console.log(`--- option chain round finished, resting ${OPTION_CHAIN_POLL_MS / 1000}s ---`);
      await sleep(OPTION_CHAIN_POLL_MS);
    }
  })().catch((err) => console.error("Option chain poll loop crashed:", err));
  console.log(`Polling option chains for ${OPTION_UNDERLYINGS.map((u) => `${u.symbol}(${u.resolvedExpiry})`).join(", ")} — ${OPTION_CHAIN_REQUEST_GAP_MS}ms between symbols, ${OPTION_CHAIN_POLL_MS / 1000}s rest between rounds`);
}

// ---------------------------------------------------------------
// NOTE on crypto: there is intentionally NO backend Binance stream here.
// An earlier version of this file ran its own Binance WebSocket and
// broadcast every tick to the dashboard unthrottled (no batching at all —
// worse than the flooding bug already fixed on the frontend's own direct
// Binance connection), AND covered a different, smaller symbol set (8
// coins here vs 16 on the frontend) than the dashboard's own direct
// connection — so the two feeds were racing to overwrite the same
// marketData keys for the 8 overlapping symbols, on top of doubling
// bandwidth/CPU for data the dashboard already gets directly from Binance
// (a public, unauthenticated feed — no reason to proxy it through this
// relay at all). Removed rather than throttled, since it was pure
// redundant work once the frontend's own connection exists.
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// main
// ---------------------------------------------------------------
(async () => {
  setStatus("OFFLINE");
  PRIMARY_INSTRUMENT_KEY = INSTRUMENTS[0].key; // NIFTY 50, always present
  let accessToken = loadCachedToken();
  if (!accessToken) {
    const code = await waitForAuthCode();
    console.log("Got authorization code, exchanging for access token…");
    accessToken = await exchangeCodeForToken(code);
    console.log("Access token obtained (valid until ~3:30am IST tonight).");
    saveTokenToCache(accessToken);
  }
  optionOrderAccessToken = accessToken;
  await resolveMcxKeys(); // pulls fresh contract keys every single run
  await resolveBondFuturesKeys(); // pulls GOI 10Y / 91D T-Bill futures keys
  await resolveNiftyFuturesKey(); // pulls current-month NIFTY futures key — feeds Futures Basis indicator
  await resolveCapTierSymbols(); // fetches NSE Large/Mid/Small-cap 100 symbol lists, extends EQUITY_SYMBOLS
  await resolveEquityKeys(); // pulls all Nifty 50 / Bank Nifty + cap-tier equity keys
  startGlobalMegacapPolling(); // free Yahoo Finance quotes for the 40 global mega-caps
  startMarketStream(accessToken);
  startOptionChainPolling(accessToken);
  startDepthPolling();
  setInterval(refreshMcxKeysIfRolled, 60 * 60 * 1000); // catch mid-month CRUDEOIL/GOLD/SILVER/NATURALGAS contract rollovers without needing a restart
  startCcilYieldPolling(); // overrides futures-derived yieldPct with real CCIL published yields once available
  startInvestingYieldPolling(); // third-tier fallback, distinct INDIA1Y symbol — see comment above
  startCotPositioningPolling(); // weekly CFTC Traders in Financial Futures scrape — feeds cotPositioning indicator
  startGlobalMacroDiamondsPolling(); // FRED scrape for HY Credit Spread + Global Net Liquidity (the 💎 diamonds)
  startFiiDiiCashFlowPolling(); // NSE official daily FII/DII cash-segment net buy/sell (Cr) + retailOddLot proxy
  // ── NEW (relay-106 additions) ──────────────────────────────
  startAmihudPolling();          // amihudIlliquidity — Yahoo Finance .NS stocks
  startYahooCommodityPolling();  // energyCrackMomentum + goldLeaseShock + lmeCash3mSpread + natGasWeather + lmeCancelledWarrants
  startDixPolling();             // darkPoolPrints — Squeeze Metrics DIX
  startNlpEarningsPolling();     // nlpEarnings — Yahoo Finance EPS + AI
  startNseShortSellPolling();    // shortInterestDTC — NSE short selling daily
  startOpecPolling();            // opecCapacityShock — OPEC MOMR + AI
  startMcxDeliveryPolling();     // mcxDeliveryIntent — MCX Deliverable Position page
  // ───────────────────────────────────────────────────────────
})().catch((err) => {
  console.error("Fatal error during startup:", err?.response?.data || err.message || err);
  process.exit(1);
});
