// angel-server-101-FINAL.js
// Angel One live data server — standalone option chain relay for SignalBoard.
// ─────────────────────────────────────────────────────────────────────────────
// MERGED: relay-106 macro-indicator additions are included below.
// All 14 indicators are broadcast on the same WebSocket so one connection
// to this server gives the frontend both option-chain data AND macro signals.
//
// Usage:
//   node angel-server-101-FINAL.js <EXPIRY e.g. 11AUG2026> <PORT e.g. 8766>
//
// Required .env-angel keys:
//   ANGEL_CLIENT_CODE, ANGEL_PIN, ANGEL_TOTP_SECRET, ANGEL_API_KEY
// Optional (for NLP Earnings + OPEC AI calls):
//   ANTHROPIC_API_KEY, GROQ_API_KEY

require('dotenv').config({ path: '.env-angel' });
const http         = require('http');
const axios        = require('axios');
const cheerio      = require('cheerio');
const { authenticator } = require('otplib');
const fs           = require('fs');
const WebSocket    = require('ws');

// ── Angel One constants ──────────────────────────────────────────────────────
const BASE_URL        = 'https://apiconnect.angelone.in';
const TOKEN_CACHE_FILE = '.angel_token_cache.json';
const UNDERLYING      = 'NIFTY';
const POLL_INTERVAL_MS = 3000;

const EXPIRY = process.argv[2] || getAutoExpiry();
const PORT   = parseInt(process.argv[3] || '8766', 10);

function getAutoExpiry() {
  const now = new Date();
  const targetMonthFirstDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const lastDayOfTargetMonth = new Date(targetMonthFirstDayNextMonth - 24 * 60 * 60 * 1000);
  const d = new Date(lastDayOfTargetMonth);
  while (d.getDay() !== 4) d.setDate(d.getDate() - 1);
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${String(d.getDate()).padStart(2,'0')}${MONTHS[d.getMonth()]}${d.getFullYear()}`;
}

const HEADERS_BASE = {
  'Content-Type':     'application/json',
  'Accept':           'application/json',
  'X-UserType':       'USER',
  'X-SourceID':       'WEB',
  'X-ClientLocalIP':  '127.0.0.1',
  'X-ClientPublicIP': '127.0.0.1',
  'X-MACAddress':     '00:00:00:00:00:00',
};

// ── Macro indicator constants (relay-106) ────────────────────────────────────
const YAHOO_QUOTE_URL  = "https://query1.finance.yahoo.com/v7/finance/quote";
const FRED_CSV_BASE    = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=";
const GROQ_API_KEY     = process.env.GROQ_API_KEY;
const GROQ_MODEL       = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL  = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

// ── AI Panel & Web Search constants (mirrored from Relay 105) ────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODELS = (process.env.OPENROUTER_MODELS || "meta-llama/llama-3.3-70b-instruct:free,qwen/qwen3-235b-a22b:free,deepseek/deepseek-r1:free")
  .split(",").map((m) => m.trim()).filter(Boolean);
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

const FRED_SERIES = {
  hyOas:         "BAMLH0A0HYM2",
  fedAssets:     "WALCL",
  reverseRepo:   "RRPONTSYD",
  treasuryGenAcct: "WTREGEN",
  realYields10Y: "DFII10",
  termPremium:   "THREEFYTP10",
  vixIndex:      "VIXCLS",
  usFinStress:   "STLFSI4",
  sofr:          "SOFR",
  effr:          "DFF",
  yieldCurve10Y3M: "T10Y3M",
  iorb:          "IORB",
  igOas:         "BAMLC0A0CM",
  natGasStorage: "NGSUPPSC",
  ecbAssets:     "ECBASSETSW",
  eurUsdFx:      "DEXUSEU",
};
const VVIX_CSV_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VVIX_History.csv";

// Rolling state vars for macro indicators
let lastIgOasBps      = null;
let lastRepoSpreadBps = null;
let lastNatGasBcf     = null;
let prevNatGasBcf     = null;
let lastNlpSentiment  = null;
let lastNlpPollTime   = 0;
let lastDixPct        = null;
let lastOpecPollTime  = 0;
// ── Global macro diamonds state (mirrored from Relay 105) ──
let lastHyOasBps            = null;
let lastNetLiquidityB       = null;
let lastRealYieldPct        = null;
let lastTermPremiumBps      = null;
let lastVixValue            = null;
let lastUsFinStressBps      = null;
let lastSofrStressBps       = null;
let lastYieldCurveBps       = null;
let lastUsdFundingSqueezeBps = null;
let lastG3TotalB            = null;
let lastCotNet = {};
let lastFiiDiiCashFlow = null;
let fiiDiiCashFlowStatus = { ok: false, lastAttempt: null, lastSuccess: null, lastError: null };

// ── Web Search & Context Gatherers (mirrored from Relay 105) ─────────────────
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

// ── Full AI Seeker Implementations (mirrored from Relay 105) ─────────────────
async function askGemini(prompt, allowSearch) {
  if (!GEMINI_API_KEY) return { name: "Gemini", text: "", error: "GEMINI_API_KEY missing" };
  const body = { contents: [{ parts: [{ text: prompt }] }] };
  if (allowSearch) body.tools = [{ google_search: {} }];
  try {
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const geminiData = await geminiRes.json();
    if (!geminiRes.ok || geminiData.error) return { name: "Gemini", text: "", error: geminiData.error?.message || `HTTP ${geminiRes.status}` };
    const text = geminiData.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "No response.";
    return { name: "Gemini", text, audits: {} };
  } catch (err) {
    return { name: "Gemini", text: "", error: err.message };
  }
}

async function askGroq(prompt) {
  if (!GROQ_API_KEY) return { name: "Groq", text: "", error: "GROQ_API_KEY missing" };
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
  if (!ok && status === 429) {
    const waitMatch = /try again in ([\d.]+)s/i.exec(d?.error?.message || "");
    const waitMs = waitMatch ? Math.min(Math.ceil(parseFloat(waitMatch[1]) * 1000) + 250, 15000) : 3000;
    await new Promise((res) => setTimeout(res, waitMs));
    ({ ok, status, d } = await call());
  }
  if (!ok || d.error) return { name: "Groq", text: "", error: d.error?.message || `HTTP ${status}` };
  return { name: "Groq", text: d.choices?.[0]?.message?.content || "No response.", audits: {} };
}

async function askAnthropic(prompt) {
  if (!ANTHROPIC_API_KEY) return { name: "Anthropic", text: "", error: "ANTHROPIC_API_KEY missing" };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await r.json();
    if (!r.ok || d.error) return { name: "Anthropic", text: "", error: d.error?.message || `HTTP ${r.status}` };
    const text = (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("") || "No response.";
    return { name: "Anthropic", text, audits: {} };
  } catch (err) {
    return { name: "Anthropic", text: "", error: err.message };
  }
}

async function askDeepseek(prompt) {
  if (!DEEPSEEK_API_KEY) return { name: "DeepSeek", text: "", error: "DEEPSEEK_API_KEY missing" };
  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model: DEEPSEEK_MODEL, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await r.json();
    if (!r.ok || d.error) return { name: "DeepSeek", text: "", error: d.error?.message || `HTTP ${r.status}` };
    return { name: "DeepSeek", text: d.choices?.[0]?.message?.content || "No response.", audits: {} };
  } catch (err) {
    return { name: "DeepSeek", text: "", error: err.message };
  }
}

async function askOpenRouter(prompt) {
  if (!OPENROUTER_API_KEY) return { name: "OpenRouter", text: "", error: "OPENROUTER_API_KEY missing" };
  let lastError = "No free models configured";
  for (const model of OPENROUTER_MODELS) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://trading.infinityheal.org", "X-Title": "Krishn AI" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
      });
      const d = await r.json();
      if (!r.ok || d.error) {
        lastError = d.error?.message || `HTTP ${r.status} (model: ${model})`;
        continue;
      }
      return { name: "OpenRouter", text: d.choices?.[0]?.message?.content || "No response.", audits: { model } };
    } catch (err) { lastError = err.message || String(err); }
  }
  return { name: "OpenRouter", text: "", error: `OpenRouter: ${lastError}` };
}

// ── HTTP Server (mirrored from Relay 105 for AI Panel routing) ───────────────
const angelHttpServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/ask-ai-panel") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "application/json");
      try {
        if (!GEMINI_API_KEY && !GROQ_API_KEY && !ANTHROPIC_API_KEY && !DEEPSEEK_API_KEY && !OPENROUTER_API_KEY) {
          res.writeHead(200);
          res.end(JSON.stringify({ error: "No seeker AI keys found in .env-angel" }));
          return;
        }

        const { question, snapshot, history } = JSON.parse(body || "{}");
        const HISTORY_TURNS_CAP = 6;
        const HISTORY_TURN_CHAR_CAP = 500;
        const cappedHistory = (history || []).slice(-HISTORY_TURNS_CAP);
        const historyText = cappedHistory
          .map((h) => {
            const content = h.content.length > HISTORY_TURN_CHAR_CAP ? h.content.slice(0, HISTORY_TURN_CHAR_CAP) + "...[truncated]" : h.content;
            return `${h.role}: ${content}`;
          }).join("\n");

        const SNAPSHOT_CHAR_CAP = 24000;
        let snapshotStr = JSON.stringify(snapshot);
        if (snapshotStr.length > SNAPSHOT_CHAR_CAP) {
          snapshotStr = snapshotStr.slice(0, SNAPSHOT_CHAR_CAP) + `..."[truncated — snapshot capped to ${SNAPSHOT_CHAR_CAP}]`;
        }

        const EXTERNAL_CONTEXT_CAP = 6000;
        const routing = needsWebRouting(question);
        let externalContext = await gatherContext(question, routing);
        if (externalContext.length > EXTERNAL_CONTEXT_CAP) {
          externalContext = externalContext.slice(0, EXTERNAL_CONTEXT_CAP) + "...[truncated]";
        }

        const prompt = `You are Krishn AI, embedded in this Indian stock/commodity trading dashboard. You have three sources: (1) this app's own live snapshot below, (2) external live data already fetched for you (web search / news / IPO calendar — use it as-is, don't say you can't access the web), and (3) your own reasoning.\n\nLive snapshot (JSON):\n${snapshotStr}${externalContext}\n\nConversation so far:\n${historyText}\n\nQuestion: ${question}\n\nRules: If the question is about a number already in the snapshot (NIFTY/BANKNIFTY/option chain/indicator values shown in this app), answer from the snapshot and say so. If external live data was fetched above, use it and cite the source name. If neither covers it, say plainly what's missing rather than guessing.`;

        const seekers = [];
        if (ANTHROPIC_API_KEY) seekers.push(askAnthropic(prompt));
        if (GEMINI_API_KEY) seekers.push(askGemini(prompt, routing.wantsWeb));
        if (GROQ_API_KEY) seekers.push(askGroq(prompt));
        if (DEEPSEEK_API_KEY) seekers.push(askDeepseek(prompt));
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

// ── WebSocket server (now attached to the HTTP server) ───────────────────────
const wss = new WebSocket.Server({ server: angelHttpServer });
angelHttpServer.listen(PORT, () => {
  console.log(`[angel-server] HTTP & WebSocket server listening on port ${PORT}`);
});

wss.on('connection', (ws) => {
  console.log('[angel-server] frontend client connected');
  ws.send(JSON.stringify({ type: 'status', source: 'angel', message: 'connected' }));

  // ── Dashboard command listeners (mirrored from Relay 105) ──
  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === "watchDepth") return;

    if (msg.type === "getSessionCandles") {
      ws.send(JSON.stringify({
        type: "sessionCandles",
        ok: false,
        symbol: msg.symbol,
        error: "Angel One Server Note: Historical candle endpoint needs to be mapped to SmartAPI.",
        requestId: msg.requestId,
      }));
      return;
    }

    if (msg.type === "placeOrder") {
      ws.send(JSON.stringify({
        type: "orderUpdate",
        ok: false,
        error: "Angel One Server Note: Order placement mapping for SmartAPI is required.",
        requestId: msg.requestId,
      }));
      return;
    }
  });

  ws.on('close', () => console.log('[angel-server] client disconnected'));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// ── Angel One auth ───────────────────────────────────────────────────────────
async function login() {
  const totp = authenticator.generate(process.env.ANGEL_TOTP_SECRET);
  const payload = { clientcode: process.env.ANGEL_CLIENT_CODE, password: process.env.ANGEL_PIN, totp };
  const headers = { ...HEADERS_BASE, 'X-PrivateKey': process.env.ANGEL_API_KEY };
  const res = await axios.post(`${BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`, payload, { headers });
  if (!res.data.status) throw new Error(`Angel login failed: ${JSON.stringify(res.data)}`);
  const { jwtToken, refreshToken, feedToken } = res.data.data;
  const cache = { jwtToken, refreshToken, feedToken, cachedAt: Date.now() };
  fs.writeFileSync(TOKEN_CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log('[angel-server] login OK');
  return cache;
}

function loadCachedTokens() {
  if (!fs.existsSync(TOKEN_CACHE_FILE)) return null;
  const cache = JSON.parse(fs.readFileSync(TOKEN_CACHE_FILE, 'utf8'));
  if ((Date.now() - cache.cachedAt) / (1000 * 60 * 60) > 6) return null;
  return cache;
}

async function getSession() {
  let cache = loadCachedTokens();
  if (!cache) { console.log('[angel-server] logging in...'); cache = await login(); }
  else { console.log('[angel-server] using cached session'); }
  return cache;
}

let instrumentMaster = null;
let optionTokens = [];
const OMS_HISTORY_WINDOW_MS = 30 * 60 * 1000;
const angelOiHistory = new Map();

function trackOiHistory(token, oi, ltp) {
  const now  = Date.now();
  const hist = angelOiHistory.get(token) || [];
  hist.push({ t: now, oi, ltp });
  const pruned = hist.filter((p) => now - p.t <= OMS_HISTORY_WINDOW_MS);
  angelOiHistory.set(token, pruned);
  const oldest = pruned[0];
  const oiChangePct = oldest && oldest.oi ? +(((oi - oldest.oi) / oldest.oi) * 100).toFixed(2) : 0;
  const priceUp = oldest && oldest.ltp != null && ltp != null ? (ltp >= oldest.ltp ? 1 : 0) : 1;
  return { oiChangePct, priceUp };
}

async function fetchInstrumentMaster() {
  const url = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
  const res = await axios.get(url);
  return res.data;
}

function findOptionTokens(master, underlying, expiryStr) {
  return master.filter(
    (i) => i.name === underlying && i.expiry === expiryStr &&
           (i.instrumenttype === 'OPTIDX' || i.instrumenttype === 'OPTSTK')
  );
}

async function fetchQuotes(session, exchange, tokens) {
  const headers = { ...HEADERS_BASE, Authorization: `Bearer ${session.jwtToken}`, 'X-PrivateKey': process.env.ANGEL_API_KEY };
  const payload = { mode: 'FULL', exchangeTokens: { [exchange]: tokens } };
  const res = await axios.post(`${BASE_URL}/rest/secure/angelbroking/market/v1/quote/`, payload, { headers });
  if (!res.data.status) throw new Error(`Quote fetch failed: ${JSON.stringify(res.data)}`);
  return res.data.data.fetched;
}

// ── GOI 10Y / 91D T-Bill futures (NSE Interest Rate Derivatives segment) ─────
// CONFIRMED against Angel's own SmartAPI developer forum (a user who
// parsed the live OpenAPIScripMaster.json posted the full instrumenttype
// enum): FUTIRC and FUTIRT are both real values in Angel's master.
// Source: https://smartapi.angelone.in/smartapi/forum/topic/5135/how-many-instrument-type-is-there-in-instrument-list
// FUTIRC = Interest Rate futures, Corporate/GOI-bond-style contract.
// FUTIRT = Interest Rate futures, T-Bill-style contract.
// That maps cleanly onto GOI10Y -> FUTIRC and TBILL91D -> FUTIRT below.
// A name-hint fallback (scanning NSE rows for GOI/GSEC/91D/T-BILL-style
// names) is kept as a second layer in case a specific series' naming
// doesn't match cleanly. If neither path resolves a contract, this
// feature just logs and stays quiet — CCIL/investing.com above are
// unaffected either way. The 10Y conversion still assumes a fixed 7.00%
// notional coupon (NSE's contract spec as of this write-up) — verify
// against nseindia.com's IRD contract specs if the resolved yield looks
// obviously wrong.
const BOND_FUTURES_CONFIG = [
  {
    symbol: "GOI10Y", category: "bond", kind: "bond",
    nameHints: ["10Y", "10YR", "10 YR", "GOI", "GSEC", "G-SEC", "GS", "NBF"],
    instrumenttypeHints: ["FUTIRC"],
    couponPct: 7.00, maturityYears: 10, freq: 2,
  },
  {
    symbol: "TBILL91D", category: "bond", kind: "tbill",
    nameHints: ["91D", "91 D", "91DTB", "T-BILL", "TBILL"],
    instrumenttypeHints: ["FUTIRT"],
    daysToMaturity: 91,
  },
];

function tbillYieldFromPrice(price, daysToMaturity) {
  if (price == null || price <= 0) return null;
  return ((100 - price) / price) * (365 / daysToMaturity) * 100;
}

function bondYtmFromPrice(price, couponPct, years, freq = 2) {
  if (price == null || price <= 0) return null;
  const periods = Math.round(years * freq);
  const coupon = (couponPct / 100) * 100 / freq;
  const face = 100;
  const pv = (r) => { let sum = 0; for (let t = 1; t <= periods; t++) sum += coupon / Math.pow(1 + r, t); return sum + face / Math.pow(1 + r, periods); };
  const dPv = (r) => { let sum = 0; for (let t = 1; t <= periods; t++) sum += (-t * coupon) / Math.pow(1 + r, t + 1); return sum + (-periods * face) / Math.pow(1 + r, periods + 1); };
  let r = couponPct / 100 / freq;
  for (let i = 0; i < 100; i++) {
    const diff = pv(r) - price;
    if (Math.abs(diff) < 1e-7) break;
    const deriv = dPv(r);
    if (!deriv) break;
    const next = r - diff / deriv;
    if (!isFinite(next) || next <= -0.99) break;
    r = next;
  }
  return r * freq * 100;
}

function resolveBondFuturesTokens(master) {
  const resolved = [];
  for (const cfg of BOND_FUTURES_CONFIG) {
    let best = null;
    const candidates = [];
    for (const row of master) {
      const seg = (row.exch_seg || row.exchange || "").toUpperCase();
      if (seg && !seg.includes("NSE")) continue; // only exclude when we KNOW it's not NSE; skip check if field absent
      const typeUp = (row.instrumenttype || "").toUpperCase();
      const nameUp = (row.name || row.symbol || "").toUpperCase();
      const typeMatches = cfg.instrumenttypeHints.some((h) => typeUp === h);
      const nameMatches = cfg.nameHints.some((h) => nameUp.includes(h));
      if (!typeMatches && !nameMatches) continue;
      candidates.push(row.name || row.symbol);
      const expiryMs = Date.parse(row.expiry);
      if (!expiryMs || expiryMs < Date.now()) continue;
      if (!best || expiryMs < best.expiryMs) best = { token: row.token, expiryMs, name: row.name || row.symbol };
    }
    if (best) {
      resolved.push({ token: best.token, symbol: cfg.symbol, bondMeta: cfg });
      console.log(`  [angel] Bond futures: ${cfg.symbol} -> token ${best.token} ("${best.name}", expires ${new Date(best.expiryMs).toDateString()})`);
    } else {
      console.error(`  [angel] Bond futures: ${cfg.symbol} — no active NSE contract resolved.` +
        (candidates.length ? ` Similarly-named rows seen (any expiry): ${[...new Set(candidates)].slice(0, 10).join(" | ")}` : " No matches at all — instrumenttype/name hints may need updating for Angel's current master.") +
        " CCIL/investing.com yield feeds are unaffected.");
    }
  }
  return resolved;
}

let bondFuturesResolved = [];
async function scrapeBondFuturesYields(session) {
  if (!bondFuturesResolved.length) return;
  try {
    const tokens = bondFuturesResolved.map((b) => b.token);
    const quotes = await fetchQuotes(session, 'NSE', tokens);
    const byToken = new Map(quotes.map((q) => [String(q.token), q]));
    const data = {};
    for (const b of bondFuturesResolved) {
      const q = byToken.get(String(b.token));
      if (!q || q.ltp == null) continue;
      let yieldPct = b.bondMeta.kind === "tbill"
        ? tbillYieldFromPrice(q.ltp, b.bondMeta.daysToMaturity)
        : bondYtmFromPrice(q.ltp, b.bondMeta.couponPct, b.bondMeta.maturityYears, b.bondMeta.freq);
      if (yieldPct == null) continue;
      yieldPct = +yieldPct.toFixed(3);
      data[b.symbol] = { symbol: b.symbol, category: "bond", yieldPct, yieldSource: "NSE_FUTURES" };
    }
    if (Object.keys(data).length) {
      broadcast({ type: "market", data });
      console.log(`  [angel] Bond futures yields: ${Object.entries(data).map(([s, o]) => `${s}=${o.yieldPct}%`).join(", ")}`);
    }
  } catch (err) {
    console.error(`  [angel] Bond futures quote poll failed (${err.message}) — CCIL/investing.com feeds unaffected.`);
  }
}
function startBondFuturesPolling(session, master) {
  bondFuturesResolved = resolveBondFuturesTokens(master);
  if (!bondFuturesResolved.length) return;
  scrapeBondFuturesYields(session);
  setInterval(() => scrapeBondFuturesYields(session), 60 * 1000);
}

// ── FRED helper ──────────────────────────────────────────────────────────────
async function fetchFredLatest(seriesId) {
  const resp = await axios.get(`${FRED_CSV_BASE}${seriesId}`, {
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const lines = resp.data.trim().split("\n");
  for (let i = lines.length - 1; i >= 1; i--) {
    const parts = lines[i].split(",");
    if (parts.length < 2) continue;
    const val = parseFloat(parts[1]);
    if (!isNaN(val)) return { date: parts[0], value: val };
  }
  throw new Error(`No valid data in FRED series ${seriesId}`);
}

// =============================================================================
// ── MACRO INDICATOR POLLING (relay-106 + relay-105 diamonds, merged) ────────
// =============================================================================

async function fetchVvixLatest() {
  const resp = await axios.get(VVIX_CSV_URL, {
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const lines = resp.data.trim().split("\n");
  for (let i = lines.length - 1; i >= 1; i--) {
    const parts = lines[i].split(",");
    if (parts.length < 2) continue;
    const value = Number(parts[1]);
    if (parts[1] && parts[1].trim() !== "" && !Number.isNaN(value)) return { date: parts[0], value };
  }
  return null;
}

// ── Global macro diamonds — HY spread, net liquidity, real yields, term
// premium, VIX/VVIX divergence, US financial stress, SOFR funding stress,
// yield curve, USD funding squeeze, G3 balance sheet, plus repoStress /
// cdxIgSpread / natGasWeather (mirrored fully from Relay 105 / relay-106).
async function scrapeGlobalMacroDiamonds() {
  console.log("[angel] FRED/CBOE: fetching macro diamonds (HY OAS, net liquidity, real yields, term premium, VIX/VVIX, fin stress, SOFR/EFFR, yield curve, IORB, G3 B/S, igOas, natGas)...");
  let hyOas, fedAssets, reverseRepo, tga, realYield, termPremium, vix, vvix, usFinStress;
  try { hyOas = await fetchFredLatest(FRED_SERIES.hyOas); } catch (e) { console.error("  FRED hyOas failed:", e.message); }
  try { fedAssets = await fetchFredLatest(FRED_SERIES.fedAssets); } catch (e) { console.error("  FRED fedAssets failed:", e.message); }
  try { reverseRepo = await fetchFredLatest(FRED_SERIES.reverseRepo); } catch (e) { console.error("  FRED reverseRepo failed:", e.message); }
  try { tga = await fetchFredLatest(FRED_SERIES.treasuryGenAcct); } catch (e) { console.error("  FRED tga failed:", e.message); }
  try { realYield = await fetchFredLatest(FRED_SERIES.realYields10Y); } catch (e) { console.error("  FRED realYield failed:", e.message); }
  try { termPremium = await fetchFredLatest(FRED_SERIES.termPremium); } catch (e) { console.error("  FRED termPremium failed:", e.message); }
  try { vix = await fetchFredLatest(FRED_SERIES.vixIndex); } catch (e) { console.error("  FRED vix failed:", e.message); }
  try { usFinStress = await fetchFredLatest(FRED_SERIES.usFinStress); } catch (e) { console.error("  FRED usFinStress failed:", e.message); }
  try { vvix = await fetchVvixLatest(); } catch (e) { console.error("  CBOE VVIX failed:", e.message); }
  let sofr, effr, yieldCurve, iorb, ecbAssets, eurUsdFx, igOas, natGasStorageNow;
  try { sofr = await fetchFredLatest(FRED_SERIES.sofr); } catch (e) { console.error("  FRED sofr failed:", e.message); }
  try { effr = await fetchFredLatest(FRED_SERIES.effr); } catch (e) { console.error("  FRED effr failed:", e.message); }
  try { yieldCurve = await fetchFredLatest(FRED_SERIES.yieldCurve10Y3M); } catch (e) { console.error("  FRED yieldCurve failed:", e.message); }
  try { iorb = await fetchFredLatest(FRED_SERIES.iorb); } catch (e) { console.error("  FRED iorb failed:", e.message); }
  try { ecbAssets = await fetchFredLatest(FRED_SERIES.ecbAssets); } catch (e) { console.error("  FRED ecbAssets failed:", e.message); }
  try { eurUsdFx = await fetchFredLatest(FRED_SERIES.eurUsdFx); } catch (e) { console.error("  FRED eurUsdFx failed:", e.message); }
  try { igOas = await fetchFredLatest(FRED_SERIES.igOas); } catch (e) { console.error("  FRED igOas failed:", e.message); }
  try { natGasStorageNow = await fetchFredLatest(FRED_SERIES.natGasStorage); } catch (e) { console.error("  FRED natGas failed:", e.message); }

  const indData = {};

  if (hyOas) {
    const oasBps = Math.round(hyOas.value * 100);
    indData.hyCreditSpread = { oas: oasBps, prevOas: lastHyOasBps != null ? lastHyOasBps : oasBps, hasData: true };
    lastHyOasBps = oasBps;
  }
  if (fedAssets && reverseRepo && tga) {
    const netLiquidityB = Math.round(fedAssets.value / 1000 - reverseRepo.value - tga.value);
    indData.globalNetLiquidity = { netLiquidity: netLiquidityB, prevNetLiquidity: lastNetLiquidityB != null ? lastNetLiquidityB : netLiquidityB, hasData: true };
    lastNetLiquidityB = netLiquidityB;
  }
  if (realYield) {
    const tipsYield = Number(realYield.value);
    indData.realYields = { tipsYield, prevTipsYield: lastRealYieldPct != null ? lastRealYieldPct : tipsYield, hasData: true };
    lastRealYieldPct = tipsYield;
  }
  if (termPremium) {
    const tpBps = Math.round(termPremium.value * 100);
    indData.usTermPremium = { premium: tpBps, prevPremium: lastTermPremiumBps != null ? lastTermPremiumBps : tpBps, hasData: true };
    lastTermPremiumBps = tpBps;
  }
  if (vix && vvix) {
    indData.vvixVixDivergence = { vixValue: Number(vix.value), vvixValue: Number(vvix.value), hasData: true };
    lastVixValue = Number(vix.value);
  } else if (vix) {
    indData.vvixVixDivergence = { vixValue: Number(vix.value), hasData: true };
    lastVixValue = Number(vix.value);
  }
  if (usFinStress) {
    const stressVal = Number(usFinStress.value);
    indData.usFinancialStress = { stress: stressVal, prevStress: lastUsFinStressBps != null ? lastUsFinStressBps : stressVal, hasData: true };
    lastUsFinStressBps = stressVal;
  }
  if (sofr && effr) {
    const stressBps = Math.round((sofr.value - effr.value) * 100);
    indData.sofrFundingStress = { stressBps, prevStressBps: lastSofrStressBps != null ? lastSofrStressBps : stressBps, hasData: true };
    lastSofrStressBps = stressBps;
  }
  if (yieldCurve) {
    const curveBps = Math.round(yieldCurve.value * 100);
    indData.yieldCurve10Y3M = { curveBps, prevCurveBps: lastYieldCurveBps != null ? lastYieldCurveBps : curveBps, hasData: true };
    lastYieldCurveBps = curveBps;
  }
  if (sofr && iorb) {
    const squeezeBps = Math.round((sofr.value - iorb.value) * 100);
    indData.usdFundingSqueeze = { spread: squeezeBps, prevSpread: lastUsdFundingSqueezeBps != null ? lastUsdFundingSqueezeBps : squeezeBps, hasData: true };
    lastUsdFundingSqueezeBps = squeezeBps;
    const sofrBps = Math.round(sofr.value * 100), iorbBps = Math.round(iorb.value * 100);
    const spreadNow = sofrBps - iorbBps;
    indData.repoStress = { repoBps: sofrBps, iorbBps, prevSpread: lastRepoSpreadBps != null ? lastRepoSpreadBps : spreadNow, hasData: true };
    lastRepoSpreadBps = spreadNow;
  }
  if (fedAssets && ecbAssets && eurUsdFx) {
    const fedB = fedAssets.value / 1000;
    const ecbUsdB = (ecbAssets.value * eurUsdFx.value) / 1000;
    const totalB = Math.round(fedB + ecbUsdB);
    indData.g3BalanceSheet = { total: totalB, prevTotal: lastG3TotalB != null ? lastG3TotalB : totalB, hasData: true };
    lastG3TotalB = totalB;
  }
  if (igOas) {
    const spreadBps = Math.round(igOas.value * 100);
    indData.cdxIgSpread = { spreadNow: spreadBps, spreadPrev: lastIgOasBps != null ? lastIgOasBps : spreadBps, hasData: true };
    lastIgOasBps = spreadBps;
  }
  if (natGasStorageNow) {
    const bcfNow = natGasStorageNow.value;
    if (prevNatGasBcf != null && lastNatGasBcf != null) {
      const changeThis = bcfNow - lastNatGasBcf, changePrev = lastNatGasBcf - prevNatGasBcf;
      const surprise = changePrev !== 0 ? +((changePrev - changeThis) / Math.abs(changePrev) * 100).toFixed(1) : 0;
      indData.natGasWeather = { demandSurprise: surprise, hasData: true };
    }
    prevNatGasBcf = lastNatGasBcf;
    lastNatGasBcf = bcfNow;
  }

  if (Object.keys(indData).length) {
    broadcast({ type: "indicators", data: indData });
    console.log(`  Global macro diamonds: broadcast ${Object.keys(indData).length} indicator(s).`);
  }
}
function startFredPolling() { scrapeGlobalMacroDiamonds(); setInterval(scrapeGlobalMacroDiamonds, 6 * 60 * 60 * 1000); }

// ── Global mega-cap quotes (Apple, Samsung, Tesla, etc.) via Yahoo — free,
// no key required (mirrored from Relay 105). Reference/watchlist feed only.
const GLOBAL_MEGACAP_WATCHLIST = [
  { symbol: "AAPL", yahoo: "AAPL" }, { symbol: "MSFT", yahoo: "MSFT" }, { symbol: "GOOGL", yahoo: "GOOGL" },
  { symbol: "AMZN", yahoo: "AMZN" }, { symbol: "NVDA", yahoo: "NVDA" }, { symbol: "META", yahoo: "META" },
  { symbol: "TSLA", yahoo: "TSLA" }, { symbol: "BRK.B", yahoo: "BRK-B" }, { symbol: "TSM", yahoo: "TSM" },
  { symbol: "AVGO", yahoo: "AVGO" }, { symbol: "JPM", yahoo: "JPM" }, { symbol: "V", yahoo: "V" },
  { symbol: "MA", yahoo: "MA" }, { symbol: "WMT", yahoo: "WMT" }, { symbol: "005930", yahoo: "005930.KS" },
  { symbol: "LLY", yahoo: "LLY" }, { symbol: "UNH", yahoo: "UNH" }, { symbol: "XOM", yahoo: "XOM" },
  { symbol: "ORCL", yahoo: "ORCL" }, { symbol: "HD", yahoo: "HD" }, { symbol: "COST", yahoo: "COST" },
  { symbol: "PG", yahoo: "PG" }, { symbol: "NFLX", yahoo: "NFLX" }, { symbol: "KO", yahoo: "KO" },
  { symbol: "BAC", yahoo: "BAC" }, { symbol: "ADBE", yahoo: "ADBE" }, { symbol: "AMD", yahoo: "AMD" },
];
async function scrapeGlobalMegacapQuotes() {
  console.log(`[angel] Global mega-caps: fetching ${GLOBAL_MEGACAP_WATCHLIST.length} quotes from Yahoo...`);
  let results;
  try {
    const resp = await axios.get(YAHOO_QUOTE_URL, { params: { symbols: GLOBAL_MEGACAP_WATCHLIST.map(r => r.yahoo).join(",") }, timeout: 20000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
    results = resp.data?.quoteResponse?.result || [];
  } catch (err) { console.error(`  Global mega-caps: fetch failed (${err.code || err.message})`); return; }
  const byYahoo = new Map(results.map((r) => [r.symbol, r]));
  const data = {};
  for (const entry of GLOBAL_MEGACAP_WATCHLIST) {
    const q = byYahoo.get(entry.yahoo);
    if (!q || q.regularMarketPrice == null) continue;
    data[entry.symbol] = { symbol: entry.symbol, category: "globalMega", ltp: q.regularMarketPrice, chg: q.regularMarketChange, chgPct: q.regularMarketChangePercent };
  }
  if (Object.keys(data).length) { broadcast({ type: "market", data }); console.log(`  Global mega-caps: ${Object.keys(data).length}/${GLOBAL_MEGACAP_WATCHLIST.length} quotes.`); }
}
function startGlobalMegacapPolling() { scrapeGlobalMegacapQuotes(); setInterval(scrapeGlobalMegacapQuotes, 60 * 1000); }

// ── CCIL Tenorwise Indicative Yields — 91D T-Bill / 10Y GOI (mirrored from Relay 105)
const CCIL_URL = "https://www.ccilindia.com/tenorwise-indicative-yields";
const CCIL_TENOR_HINTS = { TBILL91D: ["91 day", "91day", "91-day", "91d"], GOI10Y: ["10 year", "10year", "10-year", "10 yr", "10yr"] };
async function scrapeCcilYields() {
  console.log("[angel] CCIL: scraping tenorwise indicative yields...");
  let html;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await axios.get(CCIL_URL, { timeout: 20000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
      html = resp.data; break;
    } catch (err) { console.error(`  CCIL fetch attempt ${attempt}/3 failed (${err.code || err.message})`); if (attempt < 3) await new Promise((r) => setTimeout(r, 3000 * attempt)); }
  }
  if (!html) return;
  const $ = cheerio.load(html);
  const rows = [];
  $("tr").each((_, el) => { const text = $(el).text().replace(/\s+/g, " ").trim(); if (text) rows.push(text); });
  const found = {};
  for (const [symbol, hints] of Object.entries(CCIL_TENOR_HINTS)) {
    const match = rows.find((r) => hints.some((h) => r.toLowerCase().includes(h)));
    if (!match) continue;
    const numMatch = match.match(/(\d+\.\d+)/g);
    if (!numMatch || !numMatch.length) continue;
    const yieldPct = Number(numMatch[numMatch.length - 1]);
    if (!yieldPct || yieldPct <= 0 || yieldPct > 20) continue;
    found[symbol] = yieldPct;
  }
  if (Object.keys(found).length) {
    const data = {};
    for (const [symbol, yieldPct] of Object.entries(found)) data[symbol] = { symbol, category: "bond", yieldPct, yieldSource: "CCIL" };
    broadcast({ type: "market", data });
    console.log(`  CCIL yields: ${Object.entries(found).map(([s, y]) => `${s}=${y}%`).join(", ")}`);
  }
}
function startCcilYieldPolling() { scrapeCcilYields(); setInterval(scrapeCcilYields, 60 * 60 * 1000); }

// ── CFTC Commitment of Traders (S&P500 / DXY leveraged funds net) — mirrored from Relay 105
const COT_URL = "https://www.cftc.gov/dea/futures/financial_lf.htm";
const COT_SECTIONS = { SPX: { hints: ["E-MINI S&P 500", "S&P 500 CONSOLIDATED"] }, DXY: { hints: ["USD INDEX", "U.S. DOLLAR INDEX", "DOLLAR INDEX"] } };
async function scrapeCotPositioning() {
  console.log("[angel] CFTC COT: scraping Traders in Financial Futures...");
  let text;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await axios.get(COT_URL, { timeout: 20000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
      text = cheerio.load(resp.data).text().replace(/\r/g, ""); break;
    } catch (err) { console.error(`  CFTC COT fetch attempt ${attempt}/3 failed (${err.code || err.message})`); if (attempt < 3) await new Promise((r) => setTimeout(r, 3000 * attempt)); }
  }
  if (!text) return;
  const textUpper = text.toUpperCase();
  const found = {};
  for (const [symbol, cfg] of Object.entries(COT_SECTIONS)) {
    let sectionStart = -1;
    for (const hint of cfg.hints) { const idx = textUpper.indexOf(hint); if (idx >= 0) { sectionStart = idx; break; } }
    if (sectionStart < 0) continue;
    const windowText = text.slice(sectionStart, sectionStart + 1200);
    const posIdx = windowText.search(/Positions/i);
    if (posIdx < 0) continue;
    const numsText = windowText.slice(posIdx, posIdx + 400);
    const nums = (numsText.match(/-?[\d,]+/g) || []).map((n) => Number(n.replace(/,/g, ""))).filter((n) => !Number.isNaN(n));
    if (nums.length < 8) continue;
    const levLong = nums[6], levShort = nums[7];
    found[symbol] = { levLong, levShort, net: levLong - levShort };
  }
  if (Object.keys(found).length) {
    const data = {};
    if (found.SPX) { data.spxNetLev = found.SPX.net; data.spxPrevNetLev = lastCotNet.SPX != null ? lastCotNet.SPX : found.SPX.net; }
    if (found.DXY) { data.dxyNetLev = found.DXY.net; data.dxyPrevNetLev = lastCotNet.DXY != null ? lastCotNet.DXY : found.DXY.net; }
    if (data.spxNetLev != null && data.dxyNetLev != null) {
      data.hasData = true;
      broadcast({ type: "indicators", data: { cotPositioning: data } });
      console.log(`  CFTC COT: S&P500 net=${found.SPX?.net}, DXY net=${found.DXY?.net}`);
      if (found.SPX) lastCotNet.SPX = found.SPX.net;
      if (found.DXY) lastCotNet.DXY = found.DXY.net;
    }
  }
}
function startCotPositioningPolling() { scrapeCotPositioning(); setInterval(scrapeCotPositioning, 6 * 60 * 60 * 1000); }

// ── FII/DII cash-segment net buy/sell (NSE daily report) — mirrored from Relay 105
async function fetchFiiDiiCashFlow() {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.nseindia.com/report-detail/fii_archive",
    "Origin": "https://www.nseindia.com",
  };
  let cookieJar = "", resp, lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const home = await axios.get("https://www.nseindia.com/report-detail/fii_archive", { headers, timeout: 15000 });
      cookieJar = (home.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
    } catch (err) { console.error(`  FII/DII cookie warm-up failed on attempt ${attempt}/3 (${err.code || err.message})`); }
    try {
      resp = await axios.get("https://www.nseindia.com/api/fiidiiTradeReact", { headers: { ...headers, Cookie: cookieJar }, timeout: 20000 });
      lastErr = null; break;
    } catch (err) { lastErr = err; if (attempt < 3) await new Promise((r) => setTimeout(r, 3000 * attempt)); }
  }
  if (lastErr) throw lastErr;
  const rows = resp.data;
  if (!Array.isArray(rows)) throw new Error("unexpected fiidiiTradeReact response shape");
  const fiiRow = rows.find((r) => /FII|FPI/i.test(r.category));
  const diiRow = rows.find((r) => /DII/i.test(r.category));
  if (!fiiRow || !diiRow) throw new Error("could not find FII/DII rows in NSE response");
  return { date: fiiRow.date, fiiNetCr: parseFloat(fiiRow.netValue), diiNetCr: parseFloat(diiRow.netValue) };
}
async function scrapeFiiDiiCashFlow() {
  fiiDiiCashFlowStatus.lastAttempt = new Date().toISOString();
  try {
    const data = await fetchFiiDiiCashFlow();
    fiiDiiCashFlowStatus = { ok: true, lastAttempt: fiiDiiCashFlowStatus.lastAttempt, lastSuccess: new Date().toISOString(), lastError: null };
    lastFiiDiiCashFlow = { date: data.date, fiiNetCr: data.fiiNetCr, diiNetCr: data.diiNetCr };
    broadcast({ type: "fiiDiiCashFlow", ...lastFiiDiiCashFlow });
    broadcast({ type: "fiiDiiCashFlowStatus", ...fiiDiiCashFlowStatus });
    const fiiNet = data.fiiNetCr, niftyUp = fiiNet >= 0;
    const buyRatio = fiiNet < 0 ? +Math.min(0.85, 0.5 + Math.abs(fiiNet) / 5000).toFixed(2) : +Math.max(0.15, 0.5 - Math.abs(fiiNet) / 5000).toFixed(2);
    broadcast({ type: "indicators", data: { retailOddLot: { buyRatio, trendUp: niftyUp ? 1 : 0, hasData: true } } });
    console.log(`  FII/DII cash flow: FII ${data.fiiNetCr} Cr, DII ${data.diiNetCr} Cr (${data.date})`);
    return true;
  } catch (err) {
    const status = err.response?.status;
    fiiDiiCashFlowStatus = { ok: false, lastAttempt: fiiDiiCashFlowStatus.lastAttempt, lastSuccess: fiiDiiCashFlowStatus.lastSuccess, lastError: status ? `NSE HTTP ${status}` : (err.code || err.message || "unknown error") };
    broadcast({ type: "fiiDiiCashFlowStatus", ...fiiDiiCashFlowStatus });
    console.error(`  FII/DII cash-flow scrape FAILED (${err.code || err.message})`);
    return false;
  }
}
function startFiiDiiCashFlowPolling() {
  scrapeFiiDiiCashFlow();
  const interval = setInterval(async () => {
    const ok = await scrapeFiiDiiCashFlow();
    if (ok) { clearInterval(interval); setInterval(scrapeFiiDiiCashFlow, 30 * 60 * 1000); }
  }, 5 * 60 * 1000);
}

// ── investing.com India bond yield fallback (1Y / 10Y) — mirrored from Relay 105
const INVESTING_URLS = {
  yield1Y: "https://in.investing.com/rates-bonds/india-1-year-bond-yield",
  yield10Y: "https://in.investing.com/rates-bonds/india-10-year-bond-yield",
};
async function fetchInvestingYield(url) {
  const resp = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    timeout: 15000,
  });
  const $ = cheerio.load(resp.data);
  return parseFloat($('[data-test="instrument-price-last"]').text().trim());
}
async function scrapeInvestingYieldCurve() {
  console.log("[angel] investing.com yield fallback: polling India 1Y/10Y...");
  let yield1Y, yield10Y;
  try { yield1Y = await fetchInvestingYield(INVESTING_URLS.yield1Y); } catch (err) { console.error(`  investing.com 1Y fetch failed: ${err.code || err.message}`); }
  try { yield10Y = await fetchInvestingYield(INVESTING_URLS.yield10Y); } catch (err) { console.error(`  investing.com 10Y fetch failed: ${err.code || err.message}`); }
  const data = {};
  if (!isNaN(yield1Y) && yield1Y > 0 && yield1Y < 20) data.INDIA1Y = { symbol: "INDIA1Y", category: "bond", yieldPct: +yield1Y.toFixed(3), yieldSource: "INVESTING.COM", tenor: "1Y" };
  if (!isNaN(yield10Y) && yield10Y > 0 && yield10Y < 20) data.GOI10Y = { symbol: "GOI10Y", category: "bond", yieldPct: +yield10Y.toFixed(3), yieldSource: "INVESTING.COM" };
  if (Object.keys(data).length) { broadcast({ type: "market", data }); console.log(`  investing.com yields: ${Object.entries(data).map(([s, o]) => `${s}=${o.yieldPct}%`).join(", ")}`); }
}
function startInvestingYieldPolling() { scrapeInvestingYieldCurve(); setInterval(scrapeInvestingYieldCurve, 30 * 60 * 1000); }

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
  console.log("[angel] Amihud: fetching NIFTY 50 quotes...");
  let results;
  try {
    const resp = await axios.get(YAHOO_QUOTE_URL, { params: { symbols: NIFTY50_YAHOO_SYMBOLS.join(",") }, timeout: 25000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
    results = resp.data?.quoteResponse?.result || [];
  } catch (err) { console.error(`  Amihud: fetch failed (${err.code || err.message})`); return; }
  const ratios = [];
  for (const q of results) {
    const ltp = q.regularMarketPrice, vol = q.regularMarketVolume, chgPct = q.regularMarketChangePercent;
    if (!ltp || !vol || vol <= 0 || chgPct == null) continue;
    const dollarVol = ltp * vol;
    if (dollarVol <= 0) continue;
    ratios.push((Math.abs(chgPct / 100) / dollarVol) * 1e8);
  }
  if (ratios.length < 5) { console.error(`  Amihud: only ${ratios.length} stocks`); return; }
  const illiqNow = +(ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(4);
  amihudHistory.push({ t: Date.now(), ratio: illiqNow });
  if (amihudHistory.length > 20) amihudHistory.shift();
  const illiqAvg = +(amihudHistory.reduce((a, b) => a + b.ratio, 0) / amihudHistory.length).toFixed(4);
  broadcast({ type: "indicators", data: { amihudIlliquidity: { illiqNow, illiqAvg, hasData: amihudHistory.length >= 3 } } });
  console.log(`  Amihud: illiqNow=${illiqNow} illiqAvg=${illiqAvg}`);
}
function startAmihudPolling() { scrapeAmihudIlliquidity(); setInterval(scrapeAmihudIlliquidity, 15 * 60 * 1000); }

// ── Yahoo Finance Commodity Polling
// Feeds: energyCrackMomentum, goldLeaseShock, lmeCash3mSpread, natGasWeather, lmeCancelledWarrants
const COMMODITY_YAHOO = ["CL=F", "RB=F", "GC=F", "HG=F", "HGZ26.CMX", "NG=F"];
// NOTE: HGZ26.CMX = COMEX Copper Dec 2026 deferred leg.
// Update when expired: HGH27.CMX (Mar) → HGK27.CMX (May) → HGN27.CMX (Jul) → HGU27.CMX (Sep) → HGZ27.CMX (Dec)
const commodityHistory = {};
const lmeSpreadHistory = [];

async function scrapeYahooCommodities() {
  console.log("[angel] Yahoo Commodities: fetching CL=F, RB=F, GC=F, HG=F, HGZ26.CMX, NG=F...");
  let results;
  try {
    const resp = await axios.get(YAHOO_QUOTE_URL, { params: { symbols: COMMODITY_YAHOO.join(",") }, timeout: 20000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
    results = resp.data?.quoteResponse?.result || [];
  } catch (err) { console.error(`  Yahoo Commodities: failed (${err.code || err.message})`); return; }

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
    console.log(`  Crack: ${crackNow.toFixed(2)} (3-bar: ${crackReturn}%)`);
  }

  // goldLeaseShock
  const gc = bySymbol["GC=F"];
  if (gc) {
    const leaseNow = +Math.abs(gc.chgPct * 100).toFixed(1);
    const gcHist = commodityHistory["GC=F"] || [];
    const leaseMean = gcHist.length ? +(gcHist.reduce((a, b) => a + Math.abs(b.chgPct) * 100, 0) / gcHist.length).toFixed(1) : leaseNow;
    indData.goldLeaseShock = { leaseNow, leaseMean, goldHoldsRange: Math.abs(gc.chgPct) < 1.5 ? 1 : 0, goldUp: gc.chgPct > 0 ? 1 : 0, hasData: true };
    console.log(`  Gold lease: now=${leaseNow}bps mean=${leaseMean}bps`);
  }

  // lmeCash3mSpread
  const hg = bySymbol["HG=F"];
  if (hg) {
    const hgHist = commodityHistory["HG=F"] || [];
    let spreadZ = hgHist.length >= 3
      ? (() => { const returns = hgHist.map(p => p.chgPct); const mean = returns.reduce((a,b)=>a+b,0)/returns.length; const std = Math.sqrt(returns.reduce((a,b)=>a+(b-mean)**2,0)/returns.length)||1; return +((hg.chgPct-mean)/std).toFixed(2); })()
      : +(hg.chgPct / 0.8).toFixed(2);
    indData.lmeCash3mSpread = { spreadZ, copperBreak: Math.abs(hg.chgPct) > 0.8 ? 1 : 0, copperUp: hg.chgPct > 0 ? 1 : 0, hasData: true };
    console.log(`  COMEX Copper z-score: ${spreadZ}`);
  }

  // lmeCancelledWarrants — COMEX term structure proxy
  const hgDeferred = bySymbol["HGZ26.CMX"];
  if (hg && hgDeferred && hg.ltp > 0 && hgDeferred.ltp > 0) {
    const spreadPct = +((hg.ltp - hgDeferred.ltp) / hgDeferred.ltp * 100).toFixed(3);
    lmeSpreadHistory.push(spreadPct);
    if (lmeSpreadHistory.length > 20) lmeSpreadHistory.shift();
    const sorted = [...lmeSpreadHistory].sort((a, b) => a - b);
    indData.lmeCancelledWarrants = {
      spreadPct, backwardation: hg.ltp > hgDeferred.ltp,
      p90: +sorted[Math.floor(sorted.length * 0.9)].toFixed(3),
      p10: +sorted[Math.floor(sorted.length * 0.1)].toFixed(3),
      risingVsPrev: lmeSpreadHistory.length >= 2 ? spreadPct > lmeSpreadHistory[lmeSpreadHistory.length - 2] : false,
      hasData: lmeSpreadHistory.length >= 3,
    };
    console.log(`  LME proxy: spread=${spreadPct}% back=${hg.ltp > hgDeferred.ltp}`);
  } else {
    console.error("  lmeCancelledWarrants: HGZ26.CMX missing — update contract code if expired.");
  }

  // natGasWeather price legs
  const ng = bySymbol["NG=F"];
  if (ng) {
    indData.natGasWeather = { gasBreak: Math.abs(ng.chgPct) > 0.8 ? 1 : 0, gasUp: ng.chgPct > 0 ? 1 : 0, hasData: true };
    console.log(`  NatGas (NG=F): chg=${ng.chgPct.toFixed(2)}%`);
  }

  if (Object.keys(indData).length) broadcast({ type: "indicators", data: indData });
}
function startYahooCommodityPolling() { scrapeYahooCommodities(); setInterval(scrapeYahooCommodities, 10 * 60 * 1000); }

// ── Squeeze Metrics DIX — Dark Pool
const DIX_JSON_URL = "https://squeezemetrics.com/monitor/static/dix.json";
const DIX_PAGE_URL = "https://squeezemetrics.com/monitor/dix";

async function scrapeDix() {
  console.log("[angel] DIX: fetching dark-pool index...");
  let dixPct = null;
  try {
    const resp = await axios.get(DIX_JSON_URL, { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0" } });
    const d = resp.data;
    if (Array.isArray(d) && d.length) { const last = d[d.length-1]; dixPct = (last.dix ?? last.DIX ?? last.value) != null ? +(Number(last.dix ?? last.DIX ?? last.value) * 100).toFixed(2) : null; }
    else if (d && d.dix != null) { dixPct = +(Number(d.dix) * 100).toFixed(2); }
  } catch (err) { console.error(`  DIX JSON failed (${err.code || err.message})`); }
  if (dixPct == null) {
    try {
      const resp = await axios.get(DIX_PAGE_URL, { timeout: 15000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "text/html" } });
      const $ = cheerio.load(resp.data);
      const bodyText = $("body").text();
      const match = bodyText.match(/DIX[:\s]*([0-9]{2,3}(?:\.[0-9]{1,2})?)\s*%/i) || bodyText.match(/([3-6][0-9](?:\.[0-9]{1,2})?)\s*%/);
      if (match) dixPct = +Number(match[1]).toFixed(2);
    } catch (err2) { console.error(`  DIX page scrape failed (${err2.code || err2.message})`); }
  }
  if (dixPct == null || dixPct < 20 || dixPct > 80) { console.error(`  DIX: value (${dixPct}) out of range`); return; }
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
const NLP_POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function scrapeNlpEarnings() {
  const now = Date.now();
  if (now - lastNlpPollTime < NLP_POLL_INTERVAL_MS) return;
  lastNlpPollTime = now;
  console.log("[angel] NLP Earnings: fetching EPS data...");
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
    } catch (err) { console.error(`  NLP: ${sym} failed (${err.code || err.message})`); }
  }
  if (!surprises.length) { console.error("  NLP Earnings: no data"); return; }
  const avgSurprise = surprises.reduce((a, b) => a + b.surpPct, 0) / surprises.length;
  const summary = surprises.map(s => `${s.symbol}: ${s.surpPct > 0 ? "+" : ""}${s.surpPct}% EPS ${s.surpPct >= 0 ? "beat" : "miss"} (${s.period})`).join(", ");
  let sentimentScore = Math.max(-100, Math.min(100, Math.round(avgSurprise * 5)));
  if (ANTHROPIC_API_KEY || GROQ_API_KEY) {
    const prompt = `You are a financial NLP model. Based on NIFTY 50 earnings surprise data, provide a single integer score from -100 (bearish) to +100 (bullish). Data: ${summary} Average EPS surprise: ${avgSurprise.toFixed(2)}%. Respond with ONLY a single integer.`;
    try {
      let aiText = "";
      if (ANTHROPIC_API_KEY) aiText = (await askAnthropic(prompt)).text;
      else if (GROQ_API_KEY) aiText = (await askGroq(prompt)).text;
      const parsed = parseInt(aiText.trim().replace(/[^-0-9]/g, ""), 10);
      if (!isNaN(parsed) && parsed >= -100 && parsed <= 100) sentimentScore = parsed;
    } catch (err) { console.error(`  NLP: AI failed (${err.message})`); }
  }
  broadcast({ type: "indicators", data: { nlpEarnings: { sentimentScore, prevSentiment: lastNlpSentiment != null ? lastNlpSentiment : sentimentScore, hasData: true } } });
  console.log(`  NLP Earnings: score=${sentimentScore}`);
  lastNlpSentiment = sentimentScore;
}
function startNlpEarningsPolling() { scrapeNlpEarnings(); setInterval(scrapeNlpEarnings, NLP_POLL_INTERVAL_MS); }

// ── NSE Short Selling
async function scrapeNseShortSelling() {
  console.log("[angel] NSE Short Selling: fetching daily data...");
  const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "application/json, text/plain, */*", "Referer": "https://www.nseindia.com/", "Origin": "https://www.nseindia.com" };
  let cookieJar = "";
  try { const home = await axios.get("https://www.nseindia.com/", { headers, timeout: 15000 }); cookieJar = (home.headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; "); } catch (_) {}
  let data;
  try {
    const resp = await axios.get("https://www.nseindia.com/api/shortSelling?type=S", { headers: { ...headers, Cookie: cookieJar }, timeout: 20000 });
    data = resp.data;
  } catch (err) { console.error(`  NSE Short Sell failed (${err.code || err.message})`); return; }
  const rows = data?.data || [];
  if (!rows.length) { console.error("  NSE Short Sell: empty response"); return; }
  let totalShort = 0, totalVol = 0;
  for (const row of rows) { totalShort += Number(row.shortSellQuantity || row.shortQuantity || 0); totalVol += Number(row.totalTradedQuantity || row.totalQuantity || row.tradedQuantity || 0); }
  if (totalVol <= 0) { console.error("  NSE Short Sell: zero volume"); return; }
  const shortIntM = +(totalShort / 1e6).toFixed(4), avgDailyM = +(totalVol / 1e6).toFixed(4);
  broadcast({ type: "indicators", data: { shortInterestDTC: { shortInt: shortIntM, avgDailyVol: avgDailyM, hasData: true } } });
  console.log(`  NSE Short Sell: shortInt=${shortIntM}M avgDailyVol=${avgDailyM}M`);
}
function startNseShortSellPolling() { scrapeNseShortSelling(); setInterval(scrapeNseShortSelling, 4 * 60 * 60 * 1000); }

// ── OPEC Spare Capacity
const OPEC_MOMR_URL = "https://www.opec.org/opec_web/en/publications/338.htm";
const OPEC_POLL_INTERVAL_MS = 12 * 60 * 60 * 1000;

async function scrapeOpecCapacity() {
  const now = Date.now();
  if (now - lastOpecPollTime < OPEC_POLL_INTERVAL_MS) return;
  lastOpecPollTime = now;
  if (!ANTHROPIC_API_KEY && !GROQ_API_KEY) { console.error("[angel] OPEC: No AI key — skipping."); return; }
  let pageHtml;
  try {
    const resp = await axios.get(OPEC_MOMR_URL, { timeout: 25000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" } });
    pageHtml = resp.data;
  } catch (err) { console.error(`  OPEC page fetch failed (${err.code || err.message})`); return; }
  const $ = cheerio.load(pageHtml);
  let pageText = "";
  $("p, h1, h2, h3, li, td, div.content, .intro, .summary").each((_, el) => { const t = $(el).text().replace(/\s+/g," ").trim(); if (t.length > 30) pageText += t + " "; });
  pageText = pageText.slice(0, 4000);
  if (!pageText.includes("spare") && !pageText.includes("capacity")) { console.error("  OPEC: keywords not found"); return; }
  const prompt = `Oil market analyst. Based on OPEC MOMR text, determine spare capacity change. Contracting=negative, expanding=positive. Text: ${pageText}. Respond ONLY a single number (e.g. -2.5 or +1.2). No explanation.`;
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
}
function startOpecPolling() { scrapeOpecCapacity(); setInterval(scrapeOpecCapacity, OPEC_POLL_INTERVAL_MS); }

// ── MCX Delivery Intent
const MCX_DELIVERY_URL   = "https://www.mcxindia.com/market-data/deliverables";
const MCX_BHAVCOPY_BASE  = "https://www.mcxindia.com/DesktopModules/MCX_SiteManagement/App_ClientSide/MCXWebPart_Bhavcopy/BhavCopyCSV.aspx";
const MCX_DELIVERY_HISTORY = [];
const MCX_POLL_INTERVAL_MS  = 4 * 60 * 60 * 1000;

async function scrapeMcxDeliveryIntent() {
  console.log("[angel] MCX Delivery: fetching deliverable position...");
  let deliveryPct = null;
  try {
    const resp = await axios.get(MCX_DELIVERY_URL, { timeout: 20000, headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "text/html,application/xhtml+xml", "Referer": "https://www.mcxindia.com/" } });
    const $ = cheerio.load(resp.data);
    const hdrs = [];
    $("table thead th, table tr:first-child th").each((_, el) => hdrs.push($(el).text().trim().toLowerCase()));
    const longIdx = hdrs.findIndex(h => h.includes("long")), shortIdx = hdrs.findIndex(h => h.includes("short")), totalIdx = hdrs.findIndex(h => h.includes("total"));
    if (longIdx < 0 || totalIdx < 0) throw new Error(`Headers not found: [${hdrs.join(", ")}]`);
    const pcts = [];
    $("table tbody tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < Math.max(longIdx, shortIdx, totalIdx) + 1) return;
      const longOI = parseFloat($(cells[longIdx]).text().replace(/,/g,"")) || 0;
      const shortOI = shortIdx >= 0 ? parseFloat($(cells[shortIdx]).text().replace(/,/g,"")) || 0 : 0;
      const totalOI = parseFloat($(cells[totalIdx]).text().replace(/,/g,"")) || 0;
      if (totalOI <= 0) return;
      pcts.push(((longOI + shortOI) / totalOI) * 100);
    });
    if (pcts.length >= 1) { deliveryPct = +(pcts.reduce((a,b)=>a+b,0)/pcts.length).toFixed(2); console.log(`  MCX Delivery: ${pcts.length} contracts, avg=${deliveryPct}%`); }
    else throw new Error("No valid rows parsed.");
  } catch (err) { console.error(`  MCX Delivery page failed (${err.message}) — trying bhavcopy.`); }
  if (deliveryPct == null) {
    try {
      const today = new Date();
      const dDate = `${String(today.getDate()).padStart(2,"0")}-${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][today.getMonth()]}-${today.getFullYear()}`;
      const resp = await axios.get(MCX_BHAVCOPY_BASE, { params: { dDate }, timeout: 20000, headers: { "User-Agent": "Mozilla/5.0" } });
      const lines = resp.data.trim().split("\n").slice(1);
      let totalOI = 0, totalVol = 0;
      for (const line of lines) { const cols = line.split(","); if (cols.length < 8) continue; totalOI += parseFloat(cols[7])||0; totalVol += parseFloat(cols[6])||0; }
      if (totalOI > 0 && totalVol > 0) { deliveryPct = +Math.min(95, Math.max(5, (totalOI/(totalVol||1))*8)).toFixed(2); console.log(`  MCX Delivery (bhavcopy fallback): ${deliveryPct}%`); }
    } catch (err2) { console.error(`  MCX Delivery bhavcopy failed (${err2.message})`); return; }
  }
  if (deliveryPct == null) return;
  MCX_DELIVERY_HISTORY.push(deliveryPct);
  if (MCX_DELIVERY_HISTORY.length > 20) MCX_DELIVERY_HISTORY.shift();
  const sorted = [...MCX_DELIVERY_HISTORY].sort((a,b)=>a-b);
  const p90 = +sorted[Math.floor(sorted.length*0.9)].toFixed(2), p10 = +sorted[Math.floor(sorted.length*0.1)].toFixed(2);
  const rising = MCX_DELIVERY_HISTORY.length >= 2 ? deliveryPct > MCX_DELIVERY_HISTORY[MCX_DELIVERY_HISTORY.length-2] : false;
  broadcast({ type: "indicators", data: { mcxDeliveryIntent: { deliveryPct, p90, p10, rising, aboveVwap: false, hasData: MCX_DELIVERY_HISTORY.length >= 3 } } });
  console.log(`  MCX Delivery: pct=${deliveryPct}% p90=${p90} p10=${p10} rising=${rising}`);
}
function startMcxDeliveryPolling() { scrapeMcxDeliveryIntent(); setInterval(scrapeMcxDeliveryIntent, MCX_POLL_INTERVAL_MS); }

// =============================================================================
// ── Angel One option-chain poll loop ─────────────────────────────────────────
// =============================================================================
async function pollLoop() {
  let session;
  try {
    session = await getSession();
  } catch (err) {
    console.error('[angel-server] FATAL login error:', err.message);
    process.exit(1);
  }

  console.log('[angel-server] fetching instrument master...');
  instrumentMaster = await fetchInstrumentMaster();
  const optionRows = findOptionTokens(instrumentMaster, UNDERLYING, EXPIRY);
  console.log(`[angel-server] tracking ${optionRows.length} contracts for ${UNDERLYING} ${EXPIRY}`);

  if (optionRows.length === 0) {
    console.error('[angel-server] no contracts found - check expiry format');
    process.exit(1);
  }

  optionTokens = optionRows.slice(0, 50).map((r) => r.token);

  // ── Start macro indicator polling
  startFredPolling();
  startAmihudPolling();
  startYahooCommodityPolling();
  startDixPolling();
  startNlpEarningsPolling();
  startNseShortSellPolling();
  startOpecPolling();
  startMcxDeliveryPolling();
  startGlobalMegacapPolling();
  startBondFuturesPolling(session, instrumentMaster);
  startCcilYieldPolling();
  startCotPositioningPolling();
  startFiiDiiCashFlowPolling();
  startInvestingYieldPolling();

  // ── Option chain poll loop
  setInterval(async () => {
    try {
      const quotes = await fetchQuotes(session, 'NFO', optionTokens);
      broadcast({
        type: 'option_chain',
        source: 'angel',
        underlying: UNDERLYING,
        expiry: EXPIRY,
        timestamp: Date.now(),
        data: quotes.map((q) => {
          const { oiChangePct, priceUp } = trackOiHistory(q.token, q.opnInterest, q.ltp);
          return { symbol: q.tradingSymbol, ltp: q.ltp, oi: q.opnInterest, volume: q.tradeVolume, oiChangePct, priceUp };
        }),
      });
      console.log(`[angel-server] broadcast ${quotes.length} quotes @ ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      console.error('[angel-server] poll error:', err.message);
      if (err.message.includes('401') || err.message.includes('Invalid')) {
        try { fs.unlinkSync(TOKEN_CACHE_FILE); } catch (_) {}
        try {
          console.log('[angel-server] session invalid — re-logging in...');
          session = await login();
          console.log('[angel-server] re-login OK, resuming polling.');
        } catch (loginErr) {
          console.error('[angel-server] re-login FAILED, will retry next tick:', loginErr.message);
        }
      }
    }
  }, POLL_INTERVAL_MS);
}

pollLoop().catch((err) => {
  console.error('[angel-server] FATAL:', err.message);
  process.exit(1);
});
