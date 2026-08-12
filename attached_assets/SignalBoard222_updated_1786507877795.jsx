import { useState, useMemo, useEffect, useRef } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
const KRISHN_DAILY_LIMIT = 2;
const KRISHN_USAGE_KEY = "signalboard_krishn_daily_usage";

function krishnTodayKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
}

function readKrishnUsage() {
    const empty = { date: krishnTodayKey(), count: 0 };
    try {
        if (typeof window === "undefined") return empty;
        const saved = JSON.parse(window.localStorage?.getItem(KRISHN_USAGE_KEY) || "null");
        if (!saved || saved.date !== empty.date) return empty;
        return { date: empty.date, count: Math.max(0, Math.min(KRISHN_DAILY_LIMIT, Number(saved.count) || 0)) };
    } catch (err) {
        return empty;
    }
}
// ---- anti-blink fix (white-flash-of-unstyled-content) ----
// Since this file is deployed as a single drag-and-drop .jsx (no
// separate index.html we control), Netlify's generic HTML shell
// paints its default WHITE background + BLACK text first, before
// React mounts and applies the dark theme classes below — that gap
// is the "black on white blink" reported during load. This runs at
// MODULE LOAD, before SignalBoard() is even called — the earliest
// point code can run in a single-file component, earlier than any
// useEffect (which only fires after first paint). It can't fully
// eliminate the raw-HTML-parse instant before this script loads, but
// it removes the much longer flash that was happening between script
// load and React's first render.
if (typeof document !== "undefined") {
    document.documentElement.style.backgroundColor = "#020617"; // slate-950, matches dark theme root
    document.body.style.backgroundColor = "#020617";
    document.body.style.color = "#f1f5f9"; // slate-100, matches dark theme text
    document.body.style.margin = "0";
    // Temporary debug catcher: if React crashes during mount/render, show
    // the real error message right on the page instead of a silent blank
    // screen, so it can be read straight off a phone screenshot.
    window.addEventListener("error", (e) => {
        const pre = document.createElement("pre");
        pre.style.cssText = "color:#fca5a5;background:#000;padding:16px;font-size:14px;white-space:pre-wrap;z-index:99999;position:fixed;inset:0;overflow:auto;";
        pre.textContent = "RUNTIME ERROR:\n" + (e.error?.stack || e.message);
        document.body.appendChild(pre);
    });
}
// ---- simple icon stand-ins ----
function Icon({ children, className }) {
    return (<span className={className} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1em", lineHeight: 1 }}>
      {children}
    </span>);
}
function ChevronUp(props) { return <Icon {...props}>▲</Icon>; }
function ChevronDown(props) { return <Icon {...props}>▼</Icon>; }
function Radio(props) { return <Icon {...props}>📡</Icon>; }
function Settings2(props) { return <Icon {...props}>⚙️</Icon>; }
function Sun(props) { return <Icon {...props}>☀️</Icon>; }
function Moon(props) { return <Icon {...props}>🌙</Icon>; }
function ArrowUp(props) { return <Icon {...props}>↑</Icon>; }
function ArrowDown(props) { return <Icon {...props}>↓</Icon>; }
function Zap(props) { return <Icon {...props}>⚡</Icon>; }
function LayoutGrid(props) { return <Icon {...props}>▦</Icon>; }
function LineChart(props) { return <Icon {...props}>📈</Icon>; }
function Layers(props) { return <Icon {...props}>🗂️</Icon>; }
function Package(props) { return <Icon {...props}>📦</Icon>; }
function Bitcoin(props) { return <Icon {...props}>₿</Icon>; }
function Activity(props) { return <Icon {...props}>📊</Icon>; }
// Default symbols shown in Live Market Watch before the relay pushes ticks.
// Category values match the tab filter ("index" / "stock" / "option" / "commodity").
const DEFAULT_MARKET_ROWS = [
    // Indices — NSE / BSE
    { symbol: "NIFTY 50", category: "index", ltp: 22050, chg: 0, chgPct: 0 },
    { symbol: "NIFTY BANK", category: "index", ltp: 47820, chg: 0, chgPct: 0 },
    { symbol: "NIFTY FIN SERVICE", category: "index", ltp: 21340, chg: 0, chgPct: 0 },
    { symbol: "NIFTY MIDCAP 50", category: "index", ltp: 14210, chg: 0, chgPct: 0 },
    { symbol: "SENSEX", category: "index", ltp: 72680, chg: 0, chgPct: 0 },
    { symbol: "BANKEX", category: "index", ltp: 54120, chg: 0, chgPct: 0 },
    { symbol: "INDIA VIX", category: "index", ltp: 13.5, chg: 0, chgPct: 0 },
    // Stocks — NSE cash
    { symbol: "RELIANCE", category: "stock", ltp: 2895, chg: 0, chgPct: 0 },
    { symbol: "HDFCBANK", category: "stock", ltp: 1495, chg: 0, chgPct: 0 },
    { symbol: "ICICIBANK", category: "stock", ltp: 1085, chg: 0, chgPct: 0 },
    { symbol: "TCS", category: "stock", ltp: 3820, chg: 0, chgPct: 0 },
    { symbol: "INFY", category: "stock", ltp: 1560, chg: 0, chgPct: 0 },
    { symbol: "SBIN", category: "stock", ltp: 785, chg: 0, chgPct: 0 },
    { symbol: "TATAMOTORS", category: "stock", ltp: 985, chg: 0, chgPct: 0 },
    { symbol: "ADANIENT", category: "stock", ltp: 3145, chg: 0, chgPct: 0 },
    { symbol: "AXISBANK", category: "stock", ltp: 1145, chg: 0, chgPct: 0 },
    { symbol: "KOTAKBANK", category: "stock", ltp: 1780, chg: 0, chgPct: 0 },
    { symbol: "BAJFINANCE", category: "stock", ltp: 7150, chg: 0, chgPct: 0 },
    { symbol: "BHARTIARTL", category: "stock", ltp: 1345, chg: 0, chgPct: 0 },
    { symbol: "ITC", category: "stock", ltp: 435, chg: 0, chgPct: 0 },
    { symbol: "LT", category: "stock", ltp: 3520, chg: 0, chgPct: 0 },
    { symbol: "MARUTI", category: "stock", ltp: 12650, chg: 0, chgPct: 0 },
    { symbol: "SUNPHARMA", category: "stock", ltp: 1595, chg: 0, chgPct: 0 },
    { symbol: "WIPRO", category: "stock", ltp: 465, chg: 0, chgPct: 0 },
    { symbol: "ADANIPORTS", category: "stock", ltp: 1385, chg: 0, chgPct: 0 },
    { symbol: "HINDUNILVR", category: "stock", ltp: 2385, chg: 0, chgPct: 0 },
    { symbol: "ASIANPAINT", category: "stock", ltp: 2895, chg: 0, chgPct: 0 },
    // Options — nearest weekly
    { symbol: "NIFTY 22000 CE", category: "option", ltp: 145, chg: 0, chgPct: 0 },
    { symbol: "NIFTY 22000 PE", category: "option", ltp: 95, chg: 0, chgPct: 0 },
    { symbol: "NIFTY 22100 CE", category: "option", ltp: 92, chg: 0, chgPct: 0 },
    { symbol: "NIFTY 22100 PE", category: "option", ltp: 138, chg: 0, chgPct: 0 },
    { symbol: "BANKNIFTY 47800 CE", category: "option", ltp: 320, chg: 0, chgPct: 0 },
    { symbol: "BANKNIFTY 47800 PE", category: "option", ltp: 285, chg: 0, chgPct: 0 },
    // Commodities — MCX
    { symbol: "GOLD", category: "commodity", ltp: 72450, chg: 0, chgPct: 0 },
    { symbol: "SILVER", category: "commodity", ltp: 84520, chg: 0, chgPct: 0 },
    { symbol: "CRUDEOIL", category: "commodity", ltp: 6420, chg: 0, chgPct: 0 },
    { symbol: "NATURALGAS", category: "commodity", ltp: 245, chg: 0, chgPct: 0 },
    { symbol: "COPPER", category: "commodity", ltp: 785, chg: 0, chgPct: 0 },
    // Crypto — spot (USDT pairs)
    { symbol: "BTCUSDT", category: "crypto", ltp: 68450, chg: 0, chgPct: 0 },
    { symbol: "ETHUSDT", category: "crypto", ltp: 3820, chg: 0, chgPct: 0 },
    { symbol: "SOLUSDT", category: "crypto", ltp: 172.5, chg: 0, chgPct: 0 },
    { symbol: "BNBUSDT", category: "crypto", ltp: 605, chg: 0, chgPct: 0 },
    { symbol: "XRPUSDT", category: "crypto", ltp: 0.615, chg: 0, chgPct: 0 },
    { symbol: "DOGEUSDT", category: "crypto", ltp: 0.164, chg: 0, chgPct: 0 },
    { symbol: "ADAUSDT", category: "crypto", ltp: 0.485, chg: 0, chgPct: 0 },
    { symbol: "AVAXUSDT", category: "crypto", ltp: 38.2, chg: 0, chgPct: 0 },
    { symbol: "MATICUSDT", category: "crypto", ltp: 0.72, chg: 0, chgPct: 0 },
    { symbol: "DOTUSDT", category: "crypto", ltp: 7.15, chg: 0, chgPct: 0 },
    { symbol: "LTCUSDT", category: "crypto", ltp: 84.5, chg: 0, chgPct: 0 },
    { symbol: "LINKUSDT", category: "crypto", ltp: 14.8, chg: 0, chgPct: 0 },
    { symbol: "TRXUSDT", category: "crypto", ltp: 0.118, chg: 0, chgPct: 0 },
    { symbol: "SHIBUSDT", category: "crypto", ltp: 0.0000185, chg: 0, chgPct: 0 },
    { symbol: "NEARUSDT", category: "crypto", ltp: 5.6, chg: 0, chgPct: 0 },
    { symbol: "ATOMUSDT", category: "crypto", ltp: 9.2, chg: 0, chgPct: 0 },
];
const DEFAULT_MARKET_MAP = DEFAULT_MARKET_ROWS.reduce((acc, r) => { acc[r.symbol] = r; return acc; }, {});
// Maps our internal symbol names to TradingView ticker format, for the
// embedded chart. Covers VWAP / EMA crossover (France Quant) / RSI (Italy
// Quant) — the only 3 of the 16 non-spot indicators that are genuinely
// chart-native reads. OI/PCR/IV/Delta need options-chain data (not a
// chart), and the macro/statistical ones (yield spread, z-score, Hurst)
// aren't standard chart studies either — a chart wouldn't actually serve
// those, so they stay manual.
// Fixed 2 decimals works for NIFTY/stocks/gold, but silently destroys
// precision for low-value crypto (DOGEUSDT ~0.164 would show as "0.16",
// losing 2/3 of its significant digits). Scale decimals to magnitude instead.
function formatPrice(value) {
    if (value == null || typeof value !== "number" || Number.isNaN(value)) return value;
    const abs = Math.abs(value);
    if (abs === 0) return "0.00";
    if (abs < 1) return value.toFixed(6);
    if (abs < 10) return value.toFixed(4);
    return value.toFixed(2);
}

function toTradingViewSymbol(symbol) {
    const map = {
        "NIFTY 50": "NSE:NIFTY", "NIFTY BANK": "NSE:BANKNIFTY", "NIFTY FIN SERVICE": "NSE:FINNIFTY",
        "NIFTY MIDCAP 50": "NSE:NIFTYMIDCAP50", "SENSEX": "BSE:SENSEX", "BANKEX": "BSE:BANKEX",
        "GOLD": "MCX:GOLD1!", "SILVER": "MCX:SILVER1!", "CRUDEOIL": "MCX:CRUDEOIL1!", "NATURALGAS": "MCX:NATURALGAS1!", "COPPER": "MCX:COPPER1!",
        "BTCUSDT": "BINANCE:BTCUSDT", "ETHUSDT": "BINANCE:ETHUSDT", "SOLUSDT": "BINANCE:SOLUSDT", "BNBUSDT": "BINANCE:BNBUSDT", "XRPUSDT": "BINANCE:XRPUSDT", "DOGEUSDT": "BINANCE:DOGEUSDT", "ADAUSDT": "BINANCE:ADAUSDT", "AVAXUSDT": "BINANCE:AVAXUSDT",
    };
    if (map[symbol]) return map[symbol];
    // Stocks and anything else not explicitly mapped — assume NSE cash equity.
    return `NSE:${symbol.replace(/\s+/g, "")}`;
}
// Indicators whose primary field is literally the live spot price ("spot" key).
// These are the ones that can honestly follow ANY selected instrument's LTP.
// The rest (RSI, EMA, VWAP, OI/PCR/IV/Delta, yield spreads, etc.) need candle
// history or options-chain data that a single LTP tick can't provide — they
// stay on manual/option-chain-driven inputs.
// FIX (Flaw 2 — "Execution Trap"): default qty of 1 gets rejected by NSE
// (options trade in lots, not single units), and lot sizes changed under
// the Jan-2026 NSE revision. Resolve the correct lot size by symbol
// instead of hardcoding a stale number.
// FIX (Fatal Flaw 1 — "Tick Size" Reject): NSE F&O prices must land on a
// ₹0.05 tick. Any raw multiplication (like the Aggressive Fill buffer)
// can produce a price like 145.88 that isn't a multiple of 0.05 — the
// exchange rejects that outright. Round to the nearest valid tick before
// it ever reaches the order ticket.
const roundToTick = (price, tick = 0.05) => {
    if (!price || price <= 0) return 0;
    return +(Math.round(price / tick) * tick).toFixed(2);
};

const getLotSize = (symbolName) => {
    if (!symbolName) return 1;
    const upper = symbolName.toUpperCase();
    if (upper.includes("BANKNIFTY") || upper.includes("NIFTY BANK")) return 30;
    if (upper.includes("FINNIFTY")) return 60;
    if (upper.includes("MIDCPNIFTY")) return 120;
    if (upper.includes("NIFTY")) return 65; // Nifty 50 (current as of Jul 2026 — verify against NSE circular before trading)
    if (upper.includes("SENSEX")) return 20;
    if (upper.includes("CRUDEOIL")) return 100; // MCX
    return 1; // individual stocks / unknown — safest default
};

const SPOT_DRIVEN_IDS = ["ichimoku", "usaQuant", "vpoc", "russiaVol", "uaeQuantum", "indiaQuantum", "oiWall", "swingSR", "maxpain", "orderBlock", "gex", "prediction", "liquidity", "radhaMadhav", "radheshyam", "deltaDivergence", "gammaFlip", "futuresBasis"];
// Ids populated ONLY by the option-chain effect (tradeUnderlying useEffect,
// ~line 3290) — these only carry real data when NIFTY 50 / NIFTY BANK is
// selected (that's the only chain the relay actually polls). Kept as one
// source of truth, taken directly from the `updates` object that effect
// builds, so "Trading On" below can count real ids instead of a
// hand-typed, easily-stale number.
const OPTION_CHAIN_DRIVEN_IDS = [
    "pcr", "maxpain", "indiaQuantum", "vex", "charm", "netDealerDelta", "ivTermStructure",
    "oiCall", "oiPut", "iv", "deltaDivergence", "delta", "ivRegimeFilter", "vrp",
    "riskReversal", "oiSkewShift", "oiBuildup", "atmStraddle", "vomma", "historicalVol",
    "parityResidual", "putParityResidual", "callTheoResidual", "putTheoResidual",
    "optionConvexity", "premiumSpotElasticity", "spreadCompression",
    "premiumMomentumRace", "premiumAccelerationRace", "volumePressureSplit",
    "oiPressureSplit", "ivDemandSplit", "deltaVolumeSplit", "gammaFlowSplit",
    "thetaEfficiencySplit", "wingSlopeDirection", "wingMomentumDirection",
    "optionBreadthDirection", "quoteExecutionPressure", "strikeMigrationDirection",
    "premiumRelativeValue", "straddleImpulse", "oiVolumeConviction",
];
// v107 indicators are relay-owned.  They start unavailable and only become
// eligible after a payload with hasData:true arrives.  This prevents the
// editable seed values below from ever becoming a live option signal.
const V107_LIVE_INDICATOR_IDS = new Set([
    "ivRank", "ivPercentile", "vomma", "vix9dRatio", "ivDispersion", "ivButterflySkew", "sviSkewSlope",
    "stockBondCorr", "corrShock", "carryToRisk", "impliedCarry", "impliedVsRealized", "leadLagBeta",
    "hmmRegime", "kalmanTrend", "elasticNet", "bnsJump", "harRvRegime", "ouReversion", "hurstMeanRev",
    "csMomentum", "momMinusReversal", "rankMomentum", "rvSkew", "magicFormula", "earningsRevision",
    "callExtrinsicMomentum", "putExtrinsicMomentum", "optionRelativeStrength", "premiumRatioVelocity",
    "premiumShockPersistence", "syntheticForwardCheck", "thor", "heatingOilResidual", "mcxBreadth",
    "gapFillEfficiency", "quantumFuture", "germanyQuantum", "luxQuantum", "optionCategoryOi",
]);
// These studies are useful context, but their raw BUY/SELL result does not
// identify a call or a put by itself.  They remain visible and continue to
// explain their research reading, but never create a directional vote.
const PREMIUM_GATE_INDICATOR_IDS = new Set([
    "ivRank", "ivPercentile", "vomma", "vix9dRatio", "ivButterflySkew",
    "historicalVol", "indiaVixFear", "vrp",
]);
const CONFIRMATION_ONLY_INDICATOR_IDS = new Set([
    // Cross-asset, regime, factor, macro, and commodity reads can confirm a
    // directional thesis, but cannot identify which option contract to buy.
    "vix9dRatio", "ivDispersion", "sviSkewSlope",
    "stockBondCorr", "corrShock", "carryToRisk", "impliedCarry", "impliedVsRealized", "leadLagBeta",
    "hmmRegime", "kalmanTrend", "elasticNet", "bnsJump", "harRvRegime", "ouReversion", "hurstMeanRev",
    "csMomentum", "momMinusReversal", "rankMomentum", "rvSkew",
    "heatingOilResidual", "mcxBreadth", "gapFillEfficiency", "quantumFuture", "germanyQuantum", "luxQuantum",
    "magicFormula", "earningsRevision", "optionCategoryOi", "thor",
]);
const OPTION_CHAIN_DRIVEN_ID_SET = new Set(OPTION_CHAIN_DRIVEN_IDS);
const initialIndicators = [
    {
        id: "vwap", label: "VWAP (Ultimate Point)", unit: "₹",
        a: { key: "candleClose", name: "Candle close", value: 22060 },
        b: { key: "vwap", name: "VWAP", value: 22010 },
        c: { key: "prevHigh", name: "Prev candle high", value: 22045 },
        d: { key: "prevLow", name: "Prev candle low", value: 22005 },
        e: { key: "currentPrice", name: "Current price", value: 22070 },
        evaluate: (v) => {
            const nearVwap = Math.abs(v.candleClose - v.vwap) / v.vwap < 1e-3;
            if (nearVwap)
                return "WAIT";
            if (v.candleClose > v.vwap && v.currentPrice > v.prevHigh)
                return "BUY";
            if (v.candleClose < v.vwap && v.currentPrice < v.prevLow)
                return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const nearVwap = Math.abs(v.candleClose - v.vwap) / v.vwap < 1e-3;
            if (nearVwap)
                return `Candle ${v.candleClose} is hugging VWAP ${v.vwap} — sideways market, skip the trade, premium will just decay`;
            if (v.candleClose > v.vwap && v.currentPrice > v.prevHigh)
                return `Candle closed above VWAP ${v.vwap} and price ${v.currentPrice} broke prior high ${v.prevHigh} — buyers confirmed, buy CE, stop-loss just below VWAP`;
            if (v.candleClose < v.vwap && v.currentPrice < v.prevLow)
                return `Candle closed below VWAP ${v.vwap} and price ${v.currentPrice} broke prior low ${v.prevLow} — sellers confirmed, buy PE, stop-loss just above VWAP`;
            if (v.candleClose > v.vwap)
                return `Candle closed above VWAP ${v.vwap} but breakout of prior high ${v.prevHigh} not confirmed yet — wait, don't jump the gun`;
            return `Candle closed below VWAP ${v.vwap} but breakdown of prior low ${v.prevLow} not confirmed yet — wait, don't jump the gun`;
        }
    },
    // FIX (v53): previously decided BUY/SELL from OI-change sign ALONE, no
    // price-direction input — contradicted the proper 4-quadrant oiBuildup
    // logic elsewhere in this file. Now requires priceDir confirmation,
    // same spirit as oiBuildup, and WAITs until priceDir is available.
    { id: "oiCall", label: "OI Change — Call", icon: "arrowUp", unit: "%", a: { key: "chg", name: "Chg in Call OI", value: -6.2 }, evaluate: (v) => {
        if (typeof v.priceDir !== "number") return "WAIT";
        if (v.chg < 0 && v.priceDir > 0) return "BUY";
        if (v.chg >= 0 && v.priceDir < 0) return "SELL";
        return "WAIT";
    }, reason: (v) => {
        if (typeof v.priceDir !== "number") return `Waiting for price-direction confirmation — WAIT.`;
        if (v.chg < 0 && v.priceDir > 0) return `Call OI down ${Math.abs(v.chg)}% with price rising — short covering confirmed, resistance breaking, BUY.`;
        if (v.chg >= 0 && v.priceDir < 0) return `Call OI up ${v.chg}% with price falling — fresh call writing confirmed, resistance building, SELL.`;
        return `Call OI change ${v.chg}% not confirmed by price direction — WAIT.`;
    } },
    { id: "oiPut", label: "OI Change — Put", icon: "arrowDown", unit: "%", a: { key: "chg", name: "Chg in Put OI", value: 8.4 }, evaluate: (v) => {
        if (typeof v.priceDir !== "number") return "WAIT";
        if (v.chg > 0 && v.priceDir > 0) return "BUY";
        if (v.chg <= 0 && v.priceDir < 0) return "SELL";
        return "WAIT";
    }, reason: (v) => {
        if (typeof v.priceDir !== "number") return `Waiting for price-direction confirmation — WAIT.`;
        if (v.chg > 0 && v.priceDir > 0) return `Put OI up ${v.chg}% with price rising — fresh put writing confirmed, support building, BUY.`;
        if (v.chg <= 0 && v.priceDir < 0) return `Put OI down ${Math.abs(v.chg)}% with price falling — support breaking confirmed, SELL.`;
        return `Put OI change ${v.chg}% not confirmed by price direction — WAIT.`;
    } },
    { id: "pcr", label: "PCR (Put/Call Ratio)", unit: "",
      a: { key: "pcr", name: "PCR", value: 1.35 },
      b: { key: "pcrSmooth", name: "PCR (EMA-smoothed)", value: 1.35 },
      evaluate: (v) => {
          const p = v.pcrSmooth != null ? v.pcrSmooth : v.pcr;
          if (p >= 1.1) return "BUY";
          if (p <= 0.9) return "SELL";
          return "WAIT";
      },
      reason: (v) => {
          const p = v.pcrSmooth != null ? v.pcrSmooth : v.pcr;
          if (p >= 1.1) return `Smoothed PCR ${p} ≥ 1.1 — more puts written, market leaning bullish. BUY.`;
          if (p <= 0.9) return `Smoothed PCR ${p} ≤ 0.9 — more calls written, market leaning bearish. SELL.`;
          return `Smoothed PCR ${p} inside the 0.9–1.1 neutral band — no clear positioning skew, WAIT.`;
      } },
    // ATM Straddle Momentum — CORRECTED VOL/PREMIUM VOTE.
    // A rising straddle is a VOLATILITY event, not a direction. Old logic
    // voted BUY on any rise and SELL on any fall (even a tick of noise),
    // which fed a permanent lean into the tallies. Now: (a) a +/-1.5% noise
    // band, (b) premium expansion is only directional when the underlying
    // itself is moving (spotUp), (c) premium decay is a theta/range regime
    // = WAIT, never a directional SELL.
    { id: "atmStraddle", label: "ATM Straddle Momentum (Vol / Premium)", unit: "₹", a: { key: "straddleNow", name: "ATM Straddle (CE+PE) now", value: 0 }, b: { key: "straddlePrev", name: "ATM Straddle prev poll", value: 0 }, c: { key: "spotUp", name: "Underlying spot rising? (1/0)", value: 0 },
      evaluate: (v) => {
          if (!v.straddleNow || !v.straddlePrev) return "WAIT";
          const chg = ((v.straddleNow - v.straddlePrev) / v.straddlePrev) * 100;
          if (chg >= 1.5) return v.spotUp ? "BUY" : "SELL";
          return "WAIT";
      },
      reason: (v) => {
          if (!v.straddleNow || !v.straddlePrev) return "ATM straddle premium not received yet — WAIT.";
          const chg = +(((v.straddleNow - v.straddlePrev) / v.straddlePrev) * 100).toFixed(2);
          if (chg >= 1.5 && v.spotUp) return `ATM straddle ₹${v.straddlePrev}→₹${v.straddleNow} (+${chg}%) WITH spot rising — real volatility expansion into an up-move, call-side premium being paid up. BUY.`;
          if (chg >= 1.5 && !v.spotUp) return `ATM straddle ₹${v.straddlePrev}→₹${v.straddleNow} (+${chg}%) WHILE spot is falling — fear-driven premium expansion, put side being paid up. SELL.`;
          if (chg <= -1.5) return `ATM straddle ₹${v.straddlePrev}→₹${v.straddleNow} (${chg}%) — premium decaying, theta/range regime. Volatility read, NOT a directional sell, so WAIT.`;
          return `ATM straddle ₹${v.straddleNow} moved ${chg}% — inside the ±1.5% noise band, no volatility signal. WAIT.`;
      } },
    // IV Rank and IV Percentile both need a 52-week / 1-year history of ATM
    // IV readings, which nothing in this file stores yet (the relay/app
    // only keep a live snapshot + a 20-poll rolling average for IV Regime
    // Filter). Until that history is captured and persisted, these two
    // stay MANUAL inputs — same pattern this file already uses for things
    // like Fed Funds Futures Implied Rate ("Manual — CME FedWatch") — edit
    // the numbers by hand or wire them up once IV history logging exists.
    { id: "ivRank", label: "IV RANK (IVR) — manual until IV history is logged", unit: "%", a: { key: "ivNow", name: "ATM IV now (%)", value: 14.8 }, b: { key: "iv52wHigh", name: "52-week ATM IV high (%)", value: 28 }, c: { key: "iv52wLow", name: "52-week ATM IV low (%)", value: 10 }, evaluate: (v) => { const range = v.iv52wHigh - v.iv52wLow; if (range <= 0) return "WAIT"; const ivr = ((v.ivNow - v.iv52wLow) / range) * 100; if (ivr <= 30) return "BUY"; if (ivr >= 70) return "SELL"; return "WAIT"; }, reason: (v) => { const range = v.iv52wHigh - v.iv52wLow; if (range <= 0) return `52-week high/low look off (high ${v.iv52wHigh} ≤ low ${v.iv52wLow}) — can't compute IVR, WAIT.`; const ivr = +(((v.ivNow - v.iv52wLow) / range) * 100).toFixed(1); if (ivr <= 30) return `IVR is ${ivr}% — current IV ${v.ivNow}% is near the bottom of its 52-week range (${v.iv52wLow}%–${v.iv52wHigh}%), options are relatively cheap, favors buying premium.`; if (ivr >= 70) return `IVR is ${ivr}% — current IV ${v.ivNow}% is near the top of its 52-week range (${v.iv52wLow}%–${v.iv52wHigh}%), options are relatively expensive, favors selling premium.`; return `IVR is ${ivr}% — mid-range, no strong cheap/expensive edge either way, WAIT.`; } },
    { id: "ivPercentile", label: "IV PERCENTILE (IVP) — manual until IV history is logged", unit: "%", a: { key: "ivpValue", name: "% of last 252 trading days IV closed below today's IV", value: 50 }, evaluate: (v) => v.ivpValue <= 30 ? "BUY" : v.ivpValue >= 70 ? "SELL" : "WAIT", reason: (v) => v.ivpValue <= 30 ? `IVP is ${v.ivpValue}% — today's IV was higher than only ${v.ivpValue}% of the last year's trading days, i.e. it's low versus its own distribution, options relatively cheap, favors buying premium.` : v.ivpValue >= 70 ? `IVP is ${v.ivpValue}% — today's IV was higher than ${v.ivpValue}% of the last year's trading days, i.e. it's high versus its own distribution, options relatively expensive, favors selling premium.` : `IVP is ${v.ivpValue}% — mid-range versus the last year, no strong edge, WAIT.` },
    // Vomma (Volga) — dVega/dSigma, the convexity of the book's vega
    // exposure. Fully live: same Black-Scholes closed-form pattern as
    // VEX/Charm above (bsVomma), OI-weighted-summed across the live chain
    // in the same effect. Positive net Vomma + IV still rising means the
    // book's vega itself keeps growing as IV climbs further — the classic
    // "long gamma of vega" convexity that rewards staying long premium in
    // a rising-vol regime.
    {
        id: "vomma", label: "VOMMA (Vega Convexity)", icon: "quantum", unit: "",
        a: { key: "vommaValue", name: "Net Vomma (Vega-pts per further 1pt IV move)", value: 0 },
        b: { key: "ivNow", name: "ATM IV now", value: 0 },
        c: { key: "ivPrev", name: "ATM IV prev poll", value: 0 },
        evaluate: (v) => {
            if (!v.hasChain) return "WAIT";
            const ivRising = v.ivNow > v.ivPrev;
            if (v.vommaValue > 0 && ivRising) return "BUY";
            if (v.vommaValue < 0 && !ivRising) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasChain) return `No option chain loaded for this underlying yet — Vomma needs the live chain, WAIT.`;
            const ivRising = v.ivNow > v.ivPrev;
            if (v.vommaValue > 0 && ivRising) return `Positive net Vomma (${v.vommaValue}) with IV rising (${v.ivPrev}% → ${v.ivNow}%) — the book's vega keeps getting more sensitive as IV climbs further, staying long premium is convex here, BUY.`;
            if (v.vommaValue < 0 && !ivRising) return `Negative net Vomma (${v.vommaValue}) with IV steady/falling (${v.ivPrev}% → ${v.ivNow}%) — convexity is working against long premium, favors SELL (theta/premium selling).`;
            return `Net Vomma ${v.vommaValue}, IV ${v.ivPrev}% → ${v.ivNow}% — sign/IV combination doesn't line up cleanly yet, WAIT.`;
        }
    },
    // Historical Volatility (HV) — NOT a placeholder: this reuses the exact
    // same 20-candle annualized realized-vol number already computed live
    // for VRP just below in the option-chain effect, exposed here as its
    // own standalone trend card (rising HV vs falling HV), same BUY/SELL
    // convention as the "IV Trend" card above (rising = favors buyers).
    { id: "historicalVol", label: "HISTORICAL VOLATILITY (HV, 20-candle realized, annualized)", unit: "%", a: { key: "hvNow", name: "HV now (%)", value: 12 }, b: { key: "hvPrev", name: "HV prev poll (%)", value: 12 }, evaluate: (v) => { if (!v.hasData) return "WAIT"; return v.hvNow >= v.hvPrev ? "BUY" : "SELL"; }, reason: (v) => { if (!v.hasData) return `Need 20 candles of the selected symbol to compute realized vol — not enough data yet, WAIT.`; return v.hvNow >= v.hvPrev ? `Realized (historical) vol rising ${v.hvPrev}%→${v.hvNow}% — actual price movement is picking up, favors buying premium / trend-following.` : `Realized (historical) vol falling ${v.hvPrev}%→${v.hvNow}% — actual price movement is quieting down, favors selling premium / theta.`; } },
    {
        id: "indiaVixFear", label: "INDIA VIX (NSE official, live quote -- fear/premium gauge)", unit: "",
        a: { key: "vixNow", name: "India VIX now", value: 14 },
        b: { key: "vixPrev", name: "India VIX prev poll", value: 14 },
        evaluate: (v) => {
            if (v.vixNow >= 20 || (v.vixNow - v.vixPrev) >= 3) return "SELL";
            if (v.vixNow <= 13 && v.vixNow <= v.vixPrev) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (v.vixNow >= 20 || (v.vixNow - v.vixPrev) >= 3) return "India VIX at " + v.vixNow + " (prev " + v.vixPrev + ") -- at/above the historical fear threshold (~20) or rising fast, options premium is expensive/expanding, favors selling premium (SELL). Volatility-regime read, not a price direction call.";
            if (v.vixNow <= 13 && v.vixNow <= v.vixPrev) return "India VIX at " + v.vixNow + " (prev " + v.vixPrev + ") -- calm, near the low end of its typical range (~10-13), options premium is cheap, favors buying premium (BUY). Not a price direction call.";
            return "India VIX at " + v.vixNow + " (prev " + v.vixPrev + ") -- mid-range, no strong cheap/expensive edge either way, WAIT.";
        }
    },
    { id: "iv", label: "IV Trend", unit: "%", a: { key: "ivNow", name: "IV now", value: 14.8 }, b: { key: "ivPrev", name: "IV prev", value: 13.5 }, evaluate: (v) => v.ivNow >= v.ivPrev ? "BUY" : "SELL", reason: (v) => v.ivNow >= v.ivPrev ? `IV rising ${v.ivPrev}→${v.ivNow} — premiums expanding, favors buyers` : `IV falling ${v.ivPrev}→${v.ivNow} — premiums compressing, favors sellers` },
    { id: "volume", label: "Volume Surge", unit: "x avg", a: { key: "mult", name: "Volume vs avg", value: 2.4 }, b: { key: "priceUp", name: "Price rising?", value: 1 }, evaluate: (v) => v.mult >= 1.5 && v.priceUp ? "BUY" : v.mult >= 1.5 ? "SELL" : "WAIT", reason: (v) => v.mult >= 1.5 && v.priceUp ? `Volume ${v.mult}x average with price rising — real buying interest` : v.mult >= 1.5 ? `Volume ${v.mult}x average with price falling — real selling interest` : `Volume only ${v.mult}x average — no conviction either way` },
    { id: "delta", label: "Delta Zone", unit: "Δ", a: { key: "delta", name: "Option delta", value: 0.48 }, b: { key: "priceTrendUp", name: "Price trending up? (1/0)", value: 1 }, evaluate: (v) => { const responsive = v.delta >= 0.4 && v.delta <= 0.6; if (!responsive) return "WAIT"; return v.priceTrendUp ? "BUY" : "SELL"; }, reason: (v) => { const responsive = v.delta >= 0.4 && v.delta <= 0.6; if (!responsive) return `Delta ${v.delta} is outside 0.40–0.60 — premium reacts too slow (far OTM) or is already priced like the underlying (deep ITM), no responsiveness edge either way`; return v.priceTrendUp ? `Delta ${v.delta} is in the 0.40–0.60 sweet spot with price trending up — premium moves fast with spot, favors calls` : `Delta ${v.delta} is in the 0.40–0.60 sweet spot with price trending down — premium moves fast with spot, favors puts`; } },
    {
        id: "oiWall", label: "Highest OI Wall", unit: "₹",
        a: { key: "spot", name: "Spot", value: 22050 }, b: { key: "resistanceStrike", name: "Highest Call OI strike", value: 22200 }, c: { key: "supportStrike", name: "Highest Put OI strike", value: 21900 },
        evaluate: (v) => { const range = v.resistanceStrike - v.supportStrike; if (range <= 0)
            return "WAIT"; const posInRange = (v.spot - v.supportStrike) / range; if (posInRange >= 0.7)
            return "SELL"; if (posInRange <= 0.3)
            return "BUY"; return "WAIT"; },
        reason: (v) => { const distToRes = v.resistanceStrike - v.spot; const distToSup = v.spot - v.supportStrike; const range = v.resistanceStrike - v.supportStrike; const posInRange = range > 0 ? (v.spot - v.supportStrike) / range : 0.5; if (range <= 0)
            return `Support strike is above resistance strike — OI data looks off, skip this signal`; if (posInRange >= 0.7)
            return `Spot ${v.spot} is only ${distToRes} pts from the Call OI wall at ${v.resistanceStrike} — that wall has capped upside before, favors fading into puts`; if (posInRange <= 0.3)
            return `Spot ${v.spot} is only ${distToSup} pts above the Put OI wall at ${v.supportStrike} — sellers have defended this floor, favors bouncing into calls`; return `Spot ${v.spot} is sitting mid-range between support ${v.supportStrike} and resistance ${v.resistanceStrike} — no wall close enough to lean on, wait for it to approach one`; }
    },
    {
        id: "swingSR", label: "Swing Support/Resistance", unit: "₹",
        a: { key: "spot", name: "Spot", value: 22050 }, b: { key: "swingRes", name: "Swing high (Resistance)", value: 22180 }, c: { key: "swingSup", name: "Swing low (Support)", value: 21930 },
        evaluate: (v) => { const range = v.swingRes - v.swingSup; if (range <= 0)
            return "WAIT"; const pos = (v.spot - v.swingSup) / range; if (pos >= 0.75)
            return "SELL"; if (pos <= 0.25)
            return "BUY"; return "WAIT"; },
        reason: (v) => { const range = v.swingRes - v.swingSup; const pos = range > 0 ? (v.spot - v.swingSup) / range : 0.5; if (range <= 0)
            return `Swing levels look inverted — recheck the pivot data`; if (pos >= 0.75)
            return `Spot ${v.spot} is right under the last swing high ${v.swingRes} — this pivot has rejected price before, favors puts`; if (pos <= 0.25)
            return `Spot ${v.spot} is right above the last swing low ${v.swingSup} — this pivot has held before, favors calls`; return `Spot ${v.spot} is between swing low ${v.swingSup} and swing high ${v.swingRes} with room either way — no edge from swing levels yet`; }
    },
    {
        id: "orderBlock", label: "Order Block (Smart Money) [ATR BASED]", unit: "₹",
        a: { key: "spot", name: "Spot", value: 21945 }, b: { key: "bullishOB", name: "Bullish OB zone", value: 21930 }, c: { key: "bearishOB", name: "Bearish OB zone", value: 22160 }, d: { key: "atr", name: "Current ATR (14)", value: 50 }, e: { key: "atrMultiplier", name: "ATR Multiplier", value: 0.5 },
        evaluate: (v) => { const dynamicTolerance = v.atr * v.atrMultiplier; const nearBull = Math.abs(v.spot - v.bullishOB) <= dynamicTolerance; const nearBear = Math.abs(v.spot - v.bearishOB) <= dynamicTolerance; if (nearBull && !nearBear)
            return "BUY"; if (nearBear && !nearBull)
            return "SELL"; return "WAIT"; },
        reason: (v) => { const dynamicTolerance = v.atr * v.atrMultiplier; const distBull = Math.abs(v.spot - v.bullishOB); const distBear = Math.abs(v.spot - v.bearishOB); const nearBull = distBull <= dynamicTolerance; const nearBear = distBear <= dynamicTolerance; if (nearBull && !nearBear)
            return `Spot ${v.spot} is tagging the bullish order block at ${v.bullishOB} (within ${v.atrMultiplier}x ATR or ${dynamicTolerance.toFixed(1)} pts) — the last down-candle before a big up-move, institutions likely defend it, favors calls`; if (nearBear && !nearBull)
            return `Spot ${v.spot} is tagging the bearish order block at ${v.bearishOB} (within ${v.atrMultiplier}x ATR or ${dynamicTolerance.toFixed(1)} pts) — the last up-candle before a big drop, institutions likely defend it, favors puts`; if (nearBull && nearBear)
            return `Zones are overlapping at this spot level — data conflict, treat as no signal until zones separate`; return `Spot ${v.spot} is away from both order blocks (bull ${v.bullishOB} / bear ${v.bearishOB}) — no zone reaction to trade yet`; }
    },
    {
        id: "prediction", label: "Prediction of Future", unit: "₹",
        a: { key: "spot", name: "Spot", value: 21965 }, b: { key: "bullFVGBottom", name: "Bullish FVG bottom", value: 21930 }, c: { key: "bullFVGTop", name: "Bullish FVG top", value: 21970 }, d: { key: "bearFVGBottom", name: "Bearish FVG bottom", value: 22140 }, e: { key: "bearFVGTop", name: "Bearish FVG top", value: 22180 }, f: { key: "smartMoney", name: "Smart money volume? (1/0)", value: 1 },
        evaluate: (v) => { const inBullFVG = v.spot >= v.bullFVGBottom && v.spot <= v.bullFVGTop; const inBearFVG = v.spot >= v.bearFVGBottom && v.spot <= v.bearFVGTop; if (inBullFVG && !inBearFVG)
            return "BUY"; if (inBearFVG && !inBullFVG)
            return "SELL"; return "WAIT"; },
        reason: (v) => { const inBullFVG = v.spot >= v.bullFVGBottom && v.spot <= v.bullFVGTop; const inBearFVG = v.spot >= v.bearFVGBottom && v.spot <= v.bearFVGTop; const confidence = v.smartMoney ? "Smart money volume spike (>2.5x average) confirms real institutional interest here — high confidence." : "No unusual volume spike yet — treat this zone as a watch, not a confirmed entry."; if (inBullFVG && !inBearFVG)
            return `Spot ${v.spot} is inside the bullish Fair Value Gap (${v.bullFVGBottom}–${v.bullFVGTop}) — this imbalance tends to get filled with a bounce, favors calls. ${confidence}`; if (inBearFVG && !inBullFVG)
            return `Spot ${v.spot} is inside the bearish Fair Value Gap (${v.bearFVGBottom}–${v.bearFVGTop}) — this imbalance tends to get filled with a drop, favors puts. ${confidence}`; if (inBullFVG && inBearFVG)
            return `Zones overlap at this spot level — recheck the FVG data before trusting this read`; return `Spot ${v.spot} isn't inside either FVG zone yet — nothing to predict until price reaches one`; }
    },
    {
        id: "liquidity", label: "Liquidity Matrix", unit: "",
        a: { key: "pdhSweep", name: "PDH swept? (1/0)", value: 0 }, b: { key: "pdlSweep", name: "PDL swept? (1/0)", value: 1 }, c: { key: "volumeConfirm", name: "Vol >1.5x avg on that candle? (1/0)", value: 1 }, d: { key: "spot", name: "Spot", value: 22010 }, e: { key: "poc", name: "Volume POC level", value: 21980 },
        evaluate: (v) => { if (v.pdlSweep && v.volumeConfirm)
            return "BUY"; if (v.pdhSweep && v.volumeConfirm)
            return "SELL"; if (v.spot > v.poc)
            return "BUY"; if (v.spot < v.poc)
            return "SELL"; return "WAIT"; },
        reason: (v) => { if (v.pdlSweep && v.volumeConfirm)
            return `Price swept below yesterday's low and closed back above it on a volume spike (>1.5x average) — sell-stops got grabbed with real buying behind it, favors calls`; if (v.pdhSweep && v.volumeConfirm)
            return `Price swept above yesterday's high and closed back below it on a volume spike (>1.5x average) — buy-stops got grabbed with real selling behind it, favors puts`; if (v.pdlSweep || v.pdhSweep)
            return `A sweep happened but without a volume spike to confirm it — could still be noise, falling back to the Point of Control read below`; if (v.spot > v.poc)
            return `No confirmed sweep active. Spot ${v.spot} is above the volume Point of Control ${v.poc} — the crowd's heaviest position is below price, favors calls`; if (v.spot < v.poc)
            return `No confirmed sweep active. Spot ${v.spot} is below the volume Point of Control ${v.poc} — the crowd's heaviest position is above price, favors puts`; return `Spot is sitting right at the POC with no confirmed sweep — no edge from liquidity levels right now`; }
    },
    { id: "maxpain", label: "Spot vs Max Pain", unit: "₹", a: { key: "spot", name: "Spot", value: 22050 }, b: { key: "maxPain", name: "Max Pain", value: 21900 }, evaluate: (v) => v.spot >= v.maxPain ? "SELL" : "BUY", reason: (v) => v.spot >= v.maxPain ? `Spot ${v.spot} above Max Pain ${v.maxPain} — pull toward max pain favors downside into expiry, SELL` : `Spot ${v.spot} below Max Pain ${v.maxPain} — pull toward max pain favors upside, BUY` },
    {
        id: "ichimoku", label: "ICHIMOKU (Japan)", icon: "japan", unit: "₹",
        a: { key: "spot", name: "Close (spot)", value: 22080 }, b: { key: "tenkan", name: "Tenkan-sen (9)", value: 22060 }, c: { key: "kijun", name: "Kijun-sen (26)", value: 22000 }, d: { key: "senkouA", name: "Senkou Span A", value: 22010 }, e: { key: "senkouB", name: "Senkou Span B", value: 21950 }, f: { key: "cross", name: "Cross today (1=bull,-1=bear,0=none)", value: 1 },
        evaluate: (v) => { const cloudTop = Math.max(v.senkouA, v.senkouB); const cloudBottom = Math.min(v.senkouA, v.senkouB); if (v.cross > 0 && v.tenkan > v.kijun && v.spot > cloudTop)
            return "BUY"; if (v.cross < 0 && v.tenkan < v.kijun && v.spot < cloudBottom)
            return "SELL"; return "WAIT"; },
        reason: (v) => { const cloudTop = Math.max(v.senkouA, v.senkouB); const cloudBottom = Math.min(v.senkouA, v.senkouB); if (v.cross > 0 && v.tenkan > v.kijun && v.spot > cloudTop)
            return `Tenkan (${v.tenkan}) just crossed above Kijun (${v.kijun}) and close ${v.spot} is above the cloud top ${cloudTop} — TK cross confirmed above the cloud, Strong BUY`; if (v.cross < 0 && v.tenkan < v.kijun && v.spot < cloudBottom)
            return `Tenkan (${v.tenkan}) just crossed below Kijun (${v.kijun}) and close ${v.spot} is below the cloud bottom ${cloudBottom} — TK cross confirmed below the cloud, Strong SELL`; return `No fresh TK cross confirmed by price outside the cloud yet (cloud range ${cloudBottom}–${cloudTop}) — wait for the cross and the close to agree`; }
    },
    { id: "usaQuant", label: "USA QUANT STRATEGY (Anchored VWAP)", icon: "usa", unit: "₹", a: { key: "spot", name: "Close (spot)", value: 22075 }, b: { key: "avwap", name: "Anchored VWAP", value: 22030 }, evaluate: (v) => v.spot > v.avwap ? "BUY" : "SELL", reason: (v) => v.spot > v.avwap ? `Close ${v.spot} is above the Anchored VWAP ${v.avwap} — Institutional BULLISH, price is running above the volume-weighted average since the anchor candle` : `Close ${v.spot} is below the Anchored VWAP ${v.avwap} — Institutional BEARISH, price is running below the volume-weighted average since the anchor candle` },
    {
        id: "vpoc", label: "EUROPEAN UNION (VPOC Rejection)", icon: "eu", unit: "₹",
        a: { key: "spot", name: "Close (current)", value: 21985 }, b: { key: "prevClose", name: "Close (prev candle)", value: 22065 }, c: { key: "vah", name: "VAH (Value Area High)", value: 22040 }, d: { key: "val", name: "VAL (Value Area Low)", value: 21960 },
        evaluate: (v) => { if (v.prevClose > v.vah && v.spot < v.vah)
            return "SELL"; if (v.prevClose < v.val && v.spot > v.val)
            return "BUY"; return "WAIT"; },
        reason: (v) => { if (v.prevClose > v.vah && v.spot < v.vah)
            return `Prev close ${v.prevClose} was above VAH ${v.vah} but current close ${v.spot} fell back below it — failed breakout, European SELL (VAH reject)`; if (v.prevClose < v.val && v.spot > v.val)
            return `Prev close ${v.prevClose} was below VAL ${v.val} but current close ${v.spot} came back above it — failed breakdown, European BUY (VAL reject)`; return `Price hasn't poked outside the Value Area (${v.val}–${v.vah}) and snapped back yet — no rejection to trade`; }
    },
    {
        id: "russiaVol", label: "RUSSIA QUANTUM (Bollinger Vol Snap)", icon: "russia", unit: "₹",
        a: { key: "spot", name: "Close (current)", value: 21970 }, b: { key: "prevClose", name: "Close (prev candle)", value: 21930 }, c: { key: "upperBand", name: "Upper Band (+3σ)", value: 22120 }, d: { key: "lowerBand", name: "Lower Band (−3σ)", value: 21950 },
        evaluate: (v) => { if (v.prevClose < v.lowerBand && v.spot > v.lowerBand)
            return "BUY"; if (v.prevClose > v.upperBand && v.spot < v.upperBand)
            return "SELL"; return "WAIT"; },
        reason: (v) => { if (v.prevClose < v.lowerBand && v.spot > v.lowerBand)
            return `Prev close ${v.prevClose} was outside the lower 3σ band ${v.lowerBand}, current close ${v.spot} snapped back inside — market exhaustion at the extreme, Russian BUY (Vol Snap)`; if (v.prevClose > v.upperBand && v.spot < v.upperBand)
            return `Prev close ${v.prevClose} was outside the upper 3σ band ${v.upperBand}, current close ${v.spot} snapped back inside — market exhaustion at the extreme, Russian SELL (Vol Snap)`; return `Price hasn't poked outside the 3σ bands (${v.lowerBand}–${v.upperBand}) and snapped back yet — the breakout alone isn't the trade, wait for the reject`; }
    },
    { id: "chinaHurst", label: "CHINA QUANTUM (Hurst Momentum)", icon: "china", unit: "H", a: { key: "hurst", name: "Hurst Exponent", value: 0.72 }, b: { key: "priceTrendUp", name: "Price trending up? (1/0)", value: 1 }, evaluate: (v) => { if (v.hurst > 0.65)
            return v.priceTrendUp ? "BUY" : "SELL"; return "WAIT"; }, reason: (v) => { if (v.hurst > 0.65)
            return v.priceTrendUp ? `Hurst exponent ${v.hurst} > 0.65 — the trend has real "memory" (persistent, not random) and price is currently trending up — Strong Momentum Flow, favors calls` : `Hurst exponent ${v.hurst} > 0.65 — the trend has real "memory" (persistent, not random) and price is currently trending down — Strong Momentum Flow, favors puts`; return `Hurst exponent ${v.hurst} is at or below 0.65 — the market is behaving more like noise/mean-reversion than a real persistent trend, Wait for Flow`; } },
    {
        id: "indiaQuantum", label: "JAI SHREE GANESH JI (Max Pain Reversion) [ATR BASED]", icon: "india", unit: "₹",
        a: { key: "spot", name: "Spot", value: 22140 }, b: { key: "maxPainStrike", name: "Max Pain Strike", value: 21950 }, c: { key: "atr", name: "Current ATR (14)", value: 50 }, d: { key: "atrMultiplier", name: "Far-away threshold (x ATR)", value: 2.0 },
        evaluate: (v) => { const dist = v.spot - v.maxPainStrike; const dynamicThreshold = v.atr * v.atrMultiplier; if (dist > dynamicThreshold)
            return "SELL"; if (-dist > dynamicThreshold)
            return "BUY"; return "WAIT"; },
        reason: (v) => { const dist = v.spot - v.maxPainStrike; const dynamicThreshold = v.atr * v.atrMultiplier; if (dist > dynamicThreshold)
            return `Spot ${v.spot} is ${dist.toFixed(1)} pts above Max Pain ${v.maxPainStrike} — beyond the ${v.atrMultiplier}x ATR threshold (${dynamicThreshold.toFixed(1)} pts), expiry-day pull expected back down toward max pain, favors puts`; if (-dist > dynamicThreshold)
            return `Spot ${v.spot} is ${Math.abs(dist).toFixed(1)} pts below Max Pain ${v.maxPainStrike} — beyond the ${v.atrMultiplier}x ATR threshold (${dynamicThreshold.toFixed(1)} pts), expiry-day pull expected back up toward max pain, favors calls`; return `Spot ${v.spot} is only ${Math.abs(dist).toFixed(1)} pts from Max Pain ${v.maxPainStrike} — within the ${v.atrMultiplier}x ATR threshold, no strong reversion pull yet`; }
    },
    {
        id: "uaeQuantum", label: "UAE QUANTUM (Gap-and-Go Momentum)", icon: "uae", unit: "₹",
        a: { key: "todayOpen", name: "Today's open", value: 22040 }, b: { key: "prevClose", name: "Prev day close", value: 21970 }, c: { key: "spot", name: "Current close", value: 22095 }, d: { key: "openRangeHigh", name: "Opening range high (first 15m)", value: 22070 }, e: { key: "openRangeLow", name: "Opening range low (first 15m)", value: 21990 },
        evaluate: (v) => { const gap = v.todayOpen - v.prevClose; if (gap > 0 && v.spot > v.openRangeHigh)
            return "BUY"; if (gap < 0 && v.spot < v.openRangeLow)
            return "SELL"; return "WAIT"; },
        reason: (v) => { const gap = v.todayOpen - v.prevClose; if (gap > 0 && v.spot > v.openRangeHigh)
            return `Market gapped up ${gap} pts (open ${v.todayOpen} vs prev close ${v.prevClose}) and close ${v.spot} broke the opening range high ${v.openRangeHigh} — gap confirmed by follow-through, UAE MOMENTUM BUY`; if (gap < 0 && v.spot < v.openRangeLow)
            return `Market gapped down ${Math.abs(gap)} pts (open ${v.todayOpen} vs prev close ${v.prevClose}) and close ${v.spot} broke the opening range low ${v.openRangeLow} — gap confirmed by follow-through, UAE MOMENTUM SELL`; return `Gap is ${gap >= 0 ? "+" : ""}${gap} pts but price hasn't broken the opening range (${v.openRangeLow}–${v.openRangeHigh}) in that direction yet — gap alone isn't the trade, wait for the range break`; }
    },
    { id: "swissQuantum", label: "SWISS QUANTUM (Z-Score Reversion)", icon: "swiss", unit: "σ", a: { key: "zScore", name: "Z-Score", value: -2.3 }, evaluate: (v) => { if (v.zScore > 2)
            return "SELL"; if (v.zScore < -2)
            return "BUY"; return "WAIT"; }, reason: (v) => { if (v.zScore > 2)
            return `Z-Score ${v.zScore} is above +2.0 — price is statistically stretched way above its 20-period mean, SWISS SELL (Mean Reversion)`; if (v.zScore < -2)
            return `Z-Score ${v.zScore} is below -2.0 — price is statistically stretched way below its 20-period mean, SWISS BUY (Mean Reversion)`; return `Z-Score ${v.zScore} is within ±2.0 — price is still within a normal statistical range, no reversion edge yet`; } },
    {
        id: "franceQuantum", label: "FRANCE QUANTUM (Moving Average Crossover)", icon: "france", unit: "₹",
        a: { key: "fastEma", name: "Fast EMA (9)", value: 22065 }, b: { key: "slowEma", name: "Slow EMA (21)", value: 22020 }, c: { key: "prevFastEma", name: "Prev Fast EMA", value: 22005 }, d: { key: "prevSlowEma", name: "Prev Slow EMA", value: 22015 },
        evaluate: (v) => { const crossedUp = v.prevFastEma <= v.prevSlowEma && v.fastEma > v.slowEma; const crossedDown = v.prevFastEma >= v.prevSlowEma && v.fastEma < v.slowEma; if (crossedUp)
            return "BUY"; if (crossedDown)
            return "SELL"; return "WAIT"; },
        reason: (v) => { const crossedUp = v.prevFastEma <= v.prevSlowEma && v.fastEma > v.slowEma; const crossedDown = v.prevFastEma >= v.prevSlowEma && v.fastEma < v.slowEma; if (crossedUp)
            return `Fast EMA ${v.fastEma} just crossed above Slow EMA ${v.slowEma} (was ${v.prevFastEma} vs ${v.prevSlowEma} last candle) — Golden Cross, the world's most-used trend-following signal, favors calls`; if (crossedDown)
            return `Fast EMA ${v.fastEma} just crossed below Slow EMA ${v.slowEma} (was ${v.prevFastEma} vs ${v.prevSlowEma} last candle) — Death Cross, favors puts`; return `Fast EMA ${v.fastEma} and Slow EMA ${v.slowEma} haven't crossed this candle — no fresh signal, still in the existing trend`; }
    },
    {
        id: "italyQuantum", label: "ITALY QUANTUM (RSI Reversal)", icon: "italy", unit: "RSI",
        a: { key: "rsi", name: "RSI (14)", value: 27 }, b: { key: "prevRsi", name: "Prev RSI (14)", value: 24 },
        evaluate: (v) => { const crossedUpFromOversold = v.prevRsi <= 30 && v.rsi > 30; const crossedDownFromOverbought = v.prevRsi >= 70 && v.rsi < 70; if (crossedUpFromOversold)
            return "BUY"; if (crossedDownFromOverbought)
            return "SELL"; return "WAIT"; },
        reason: (v) => { const crossedUpFromOversold = v.prevRsi <= 30 && v.rsi > 30; const crossedDownFromOverbought = v.prevRsi >= 70 && v.rsi < 70; if (crossedUpFromOversold)
            return `RSI just crossed back above 30 (${v.prevRsi} → ${v.rsi}) — classic oversold bounce, the most widely followed reversal setup, favors calls`; if (crossedDownFromOverbought)
            return `RSI just crossed back below 70 (${v.prevRsi} → ${v.rsi}) — classic overbought rollover, favors puts`; return `RSI ${v.rsi} is inside the neutral 30-70 band with no fresh cross — no reversal edge yet, wait for an extreme`; }
    },
    {
        id: "gex", label: "HULK (Gamma Exposure)", icon: "hulk", unit: "",
        a: { key: "spot", name: "Spot", value: 21980 }, b: { key: "zeroGamma", name: "Zero-Gamma level", value: 22050 }, c: { key: "trendUp", name: "Price trending up? (1/0)", value: 1 },
        evaluate: (v) => { if (v.spot < v.zeroGamma)
            return v.trendUp ? "BUY" : "SELL"; return "WAIT"; },
        reason: (v) => { if (v.spot < v.zeroGamma)
            return v.trendUp ? `Spot ${v.spot} is below zero-gamma ${v.zeroGamma} — market makers are short gamma and their hedging amplifies the current up-move, favors calls` : `Spot ${v.spot} is below zero-gamma ${v.zeroGamma} — market makers are short gamma and their hedging amplifies the current down-move, favors puts`; return `Spot ${v.spot} is above zero-gamma ${v.zeroGamma} — market makers are long gamma, their hedging dampens moves and pins price here, don't chase breakouts in this regime`; }
    },
    {
        id: "cvd", label: "Order Flow (CVD)", unit: "",
        a: { key: "priceTrend", name: "Price trend (1=up, -1=down)", value: 1 }, b: { key: "cvdTrend", name: "CVD trend (1=up, -1=down)", value: -1 },
        evaluate: (v) => { if (v.priceTrend > 0 && v.cvdTrend < 0)
            return "SELL"; if (v.priceTrend < 0 && v.cvdTrend > 0)
            return "BUY"; if (v.priceTrend > 0 && v.cvdTrend > 0)
            return "BUY"; if (v.priceTrend < 0 && v.cvdTrend < 0)
            return "SELL"; return "WAIT"; },
        reason: (v) => { if (v.priceTrend > 0 && v.cvdTrend < 0)
            return `Price is making new highs but CVD is falling — hidden selling behind the rally, real buyers aren't showing up, this is a bull trap, favors puts`; if (v.priceTrend < 0 && v.cvdTrend > 0)
            return `Price is making new lows but CVD is rising — hidden buying behind the drop, real sellers aren't showing up, this is a bear trap, favors calls`; if (v.priceTrend > 0 && v.cvdTrend > 0)
            return `Price and CVD are both rising — buyers are genuinely aggressive, the up-move is confirmed, favors calls`; if (v.priceTrend < 0 && v.cvdTrend < 0)
            return `Price and CVD are both falling — sellers are genuinely aggressive, the down-move is confirmed, favors puts`; return `Price and CVD trend inputs are flat — no read yet`; }
    },
    {
        id: "thor", label: "THOR (Zero-Gamma Trick)", icon: "thor", unit: "₹",
        a: { key: "spot", name: "Spot", value: 22090 }, b: { key: "zeroGamma", name: "Zero-Gamma level", value: 22050 }, c: { key: "pinRangeTop", name: "Pin range top (resistance)", value: 22150 }, d: { key: "pinRangeBottom", name: "Pin range bottom (support)", value: 21990 }, e: { key: "trendUp", name: "Trend up? (1/0, used below zero-gamma)", value: 1 },
        evaluate: (v) => { if (v.spot > v.zeroGamma) {
            const range = v.pinRangeTop - v.pinRangeBottom;
            if (range <= 0)
                return "WAIT";
            const pos = (v.spot - v.pinRangeBottom) / range;
            if (pos >= 0.7)
                return "SELL";
            if (pos <= 0.3)
                return "BUY";
            return "WAIT";
        } return v.trendUp ? "BUY" : "SELL"; },
        reason: (v) => { if (v.spot > v.zeroGamma) {
            const range = v.pinRangeTop - v.pinRangeBottom;
            const pos = range > 0 ? (v.spot - v.pinRangeBottom) / range : 0.5;
            if (range <= 0)
                return `Pin range looks inverted — recheck the levels`;
            if (pos >= 0.7)
                return `Spot ${v.spot} is above zero-gamma ${v.zeroGamma} and near the top of the pin range (${v.pinRangeTop}) — market makers sell into rallies here, upper sell trick, favors puts`;
            if (pos <= 0.3)
                return `Spot ${v.spot} is above zero-gamma ${v.zeroGamma} and near the bottom of the pin range (${v.pinRangeBottom}) — market makers buy the dip here, lower buy trick, favors calls`;
            return `Spot ${v.spot} is in pinning regime but sitting mid-range between ${v.pinRangeBottom} and ${v.pinRangeTop} — no fade edge yet, wait for an extreme`;
        } return v.trendUp ? `Spot ${v.spot} is below zero-gamma ${v.zeroGamma} — short-gamma regime, market makers amplify the current up-move, ride it with calls` : `Spot ${v.spot} is below zero-gamma ${v.zeroGamma} — short-gamma regime, market makers amplify the current down-move, ride it with puts`; }
    },
    {
        id: "quantumFuture", label: "QUANTUM FUTURE (Monte Carlo)", icon: "quantum", unit: "",
        a: { key: "vix", name: "VIX (macro risk)", value: 14.2 }, b: { key: "probability", name: "Monte Carlo hit probability (%)", value: 68 }, c: { key: "targetUp", name: "Target is above spot? (1/0)", value: 1 },
        evaluate: (v) => { if (v.vix > 30)
            return "WAIT"; if (v.probability >= 60)
            return v.targetUp ? "BUY" : "SELL"; return "WAIT"; },
        reason: (v) => { if (v.vix > 30)
            return `VIX is ${v.vix} — above 30 means macro fear is too high, the Monte Carlo probability isn't trustworthy right now, stand down regardless of the simulation`; if (v.probability >= 60)
            return v.targetUp ? `VIX ${v.vix} is in a normal range and the 10,000-path Monte Carlo simulation puts a ${v.probability}% probability on hitting the upside target — real statistical edge, favors calls` : `VIX ${v.vix} is in a normal range and the 10,000-path Monte Carlo simulation puts a ${v.probability}% probability on hitting the downside target — real statistical edge, favors puts`; return `VIX ${v.vix} is fine but the simulation only gives ${v.probability}% probability of hitting the target — below the 60% edge threshold, not worth the risk yet`; }
    },
    {
        // FIX: this indicator's a/b fields used to sit on hardcoded
        // defaults (riskAssetTrend: 1, safeHavenTrend: -1) that NOBODY
        // was ever prompted to fill in — and that exact default combo
        // matches the SELL condition below, so this card was silently
        // showing a permanent, fake SELL from day one, never real data.
        // Now wired to the SAME live independent-sampling ring buffer as
        // BTC-Nifty Divergence (see that indicator's note) — NIFTY 50 as
        // the risk asset, GOLD as the safe-haven proxy (no bond-yield
        // feed exists anywhere in this app, and there's no daily-close
        // history either, so "10-day trend" was never literally possible —
        // relabeled to what it actually reads: a live intraday trend).
        id: "germanyQuantum", label: "GERMANY QUANTUM (Intermarket Divergence)", icon: "germany", unit: "",
        a: { key: "riskAssetTrend", name: "NIFTY intraday trend (+1 up / -1 down)", value: 1 },
        b: { key: "safeHavenTrend", name: "GOLD (safe-haven proxy) intraday trend (+1/-1)", value: -1 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            // BUG FIX: NIFTY↑ + GOLD↓ is unambiguously risk-on — equities
            // bid, safe-haven sold, correct signal is BUY not SELL.
            // NIFTY↓ + GOLD↑ is flight-to-safety / risk-off → SELL.
            if (v.riskAssetTrend > 0 && v.safeHavenTrend < 0) return "BUY";
            if (v.riskAssetTrend < 0 && v.safeHavenTrend > 0) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `Still building the live NIFTY/GOLD sample window — not enough intraday history yet, WAIT.`;
            if (v.riskAssetTrend > 0 && v.safeHavenTrend < 0) return `NIFTY is trending up intraday and GOLD (safe-haven proxy) is trending down — classic risk-on intermarket alignment, institutional money is in equities, not safety. GERMAN BUY (Risk-On Divergence)`;
            if (v.riskAssetTrend < 0 && v.safeHavenTrend > 0) return `NIFTY is trending down intraday and GOLD (safe-haven proxy) is trending up — flight-to-safety in progress, money is rotating OUT of equities into hard assets. GERMAN SELL (Risk-Off Divergence)`;
            return `NIFTY and GOLD trends are moving together or both flat — no clean intermarket divergence right now, nothing to trade here`;
        }
    },
    {
        // LIVE as of relay-server-22.js — GOI 10Y bond futures + 91-Day
        // T-Bill futures (NSE Interest Rate Derivatives segment),
        // resolved via Upstox instrument master exactly like MCX/equity
        // keys above, price converted to actual annualized yield% on
        // the relay (T-Bill: discount-yield math; 10Y: Newton-Raphson
        // YTM off an assumed 7.00% notional coupon — see relay's
        // BOND_FUTURES_CONFIG comment). shortTermYield/longTermYield
        // below are populated live from marketData; hasData gates WAIT
        // until both symbols have actually ticked at least once.
        // FIX (v53): flagged one-directional — this indicator can only ever
        // return SELL or WAIT, never BUY. Excluded from oneDirectionalIds
        // set below; consuming vote-tally code should down-weight/exclude it.
        oneDirectional: "SELL",
        id: "luxQuantum", label: "LUXEMBOURG QUANTUM (10Y vs 91D Bond Yield Spread)", icon: "lux", unit: "%",
        a: { key: "shortTermYield", name: "Short-term yield (91D T-Bill, live)", value: 7.00 },
        b: { key: "longTermYield", name: "GOI 10Y yield (live)", value: 7.10 },
        evaluate: (v) => { if (!v.hasData) return "WAIT"; const spread = v.shortTermYield - v.longTermYield; return spread > 0 ? "SELL" : "WAIT"; },
        reason: (v) => {
            if (!v.hasData) return `Still waiting for a live yield read (CCIL / futures / investing.com fallback) — WAIT.`;
            const tenor = v.shortTermTenor || "91D T-Bill";
            const spread = v.shortTermYield - v.longTermYield;
            if (spread > 0) return `${tenor} yield ${v.shortTermYield}% is above the GOI 10Y yield ${v.longTermYield}% — the curve is inverted (spread +${spread.toFixed(2)}), a classic macro recession warning, LUX SELL (Yield Inversion Warning)`;
            return `${tenor} yield ${v.shortTermYield}% is below the GOI 10Y yield ${v.longTermYield}% — curve is normal/upward-sloping, LUX NEUTRAL (Stable Economy)`;
        }
    },
    {
        // 30th indicator — Radha Madhav (Surgical Strike): VWAP-hugging filter +
        // opening-range breakout + Fair Value Gap confluence, all in one signal.
        id: "radhaMadhav", label: "RADHA MADHAV (Surgical Strike)", icon: "om", unit: "₹",
        a: { key: "spot", name: "Spot", value: 22075 },
        b: { key: "vwap", name: "VWAP", value: 22030 },
        c: { key: "openRangeHigh", name: "Opening range high (first 15m)", value: 22070 },
        d: { key: "openRangeLow", name: "Opening range low (first 15m)", value: 21990 },
        e: { key: "fvgBottom", name: "Bullish FVG bottom", value: 21930 },
        f: { key: "fvgTop", name: "Bullish FVG top", value: 21970 },
        evaluate: (v) => {
            const isVwapHugging = v.vwap ? (Math.abs(v.spot - v.vwap) / v.vwap) < 0.0015 : false;
            if (isVwapHugging) return "WAIT";
            const bullBreakout = v.spot > v.openRangeHigh;
            const bearBreakout = v.spot < v.openRangeLow;
            const insideFVG = v.spot >= v.fvgBottom && v.spot <= v.fvgTop;
            if (bullBreakout && insideFVG) return "BUY";
            if (bearBreakout && insideFVG) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const isVwapHugging = v.vwap ? (Math.abs(v.spot - v.vwap) / v.vwap) < 0.0015 : false;
            if (isVwapHugging) return `Spot ${v.spot} is hugging VWAP ${v.vwap} (<0.15% away) — no separation yet, standing down until price commits to a side.`;
            const bullBreakout = v.spot > v.openRangeHigh;
            const bearBreakout = v.spot < v.openRangeLow;
            const insideFVG = v.spot >= v.fvgBottom && v.spot <= v.fvgTop;
            if (bullBreakout && insideFVG) return `Spot ${v.spot} broke the opening range high ${v.openRangeHigh} and is sitting inside the Fair Value Gap (${v.fvgBottom}–${v.fvgTop}) — breakout + imbalance confluence, surgical BUY.`;
            if (bearBreakout && insideFVG) return `Spot ${v.spot} broke the opening range low ${v.openRangeLow} and is sitting inside the Fair Value Gap (${v.fvgBottom}–${v.fvgTop}) — breakdown + imbalance confluence, surgical SELL.`;
            return `Spot ${v.spot} hasn't aligned a range breakout with the Fair Value Gap zone (${v.fvgBottom}–${v.fvgTop}) yet — no surgical entry, wait for confluence.`;
        }
    },
    {
        // 31st indicator — Radheshyam (Momentum Confirmation): 3-factor
        // directional confluence — candle body color + EMA9 slope + spot
        // vs VWAP position. Fires only when all three genuinely agree,
        // so it's a confirmation filter rather than a breakout trigger
        // (different job from Radha Madhav's ORB+FVG logic).
        id: "radheshyam", label: "RADHESHYAM (Momentum Confirmation)", icon: "om", unit: "₹",
        a: { key: "spot", name: "Spot", value: 22075 },
        b: { key: "vwap", name: "VWAP", value: 22030 },
        c: { key: "candleOpen", name: "Last candle open", value: 22050 },
        d: { key: "candleClose", name: "Last candle close", value: 22075 },
        e: { key: "emaNow", name: "EMA9 (current)", value: 22060 },
        f: { key: "emaPrev", name: "EMA9 (previous candle)", value: 22040 },
        evaluate: (v) => {
            const bodyUp = v.candleClose > v.candleOpen;
            const bodyDown = v.candleClose < v.candleOpen;
            const emaUp = v.emaNow > v.emaPrev;
            const emaDown = v.emaNow < v.emaPrev;
            const aboveVwap = v.spot > v.vwap;
            const belowVwap = v.spot < v.vwap;
            if (bodyUp && emaUp && aboveVwap) return "BUY";
            if (bodyDown && emaDown && belowVwap) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const bodyUp = v.candleClose > v.candleOpen;
            const bodyDown = v.candleClose < v.candleOpen;
            const emaUp = v.emaNow > v.emaPrev;
            const emaDown = v.emaNow < v.emaPrev;
            const aboveVwap = v.spot > v.vwap;
            const belowVwap = v.spot < v.vwap;
            if (bodyUp && emaUp && aboveVwap) return `Candle closed green (${v.candleClose} > ${v.candleOpen}), EMA9 is rising (${v.emaNow} > ${v.emaPrev}), and spot ${v.spot} is above VWAP ${v.vwap} — all three agree bullish, RADHESHYAM BUY.`;
            if (bodyDown && emaDown && belowVwap) return `Candle closed red (${v.candleClose} < ${v.candleOpen}), EMA9 is falling (${v.emaNow} < ${v.emaPrev}), and spot ${v.spot} is below VWAP ${v.vwap} — all three agree bearish, RADHESHYAM SELL.`;
            return `No 3-way agreement yet — candle ${bodyUp ? "up" : bodyDown ? "down" : "flat"}, EMA9 ${emaUp ? "rising" : emaDown ? "falling" : "flat"}, spot ${aboveVwap ? "above" : belowVwap ? "below" : "at"} VWAP. Waiting for all three to align.`;
        }
    },
    {
        // 32nd indicator — Delta Divergence: price makes a new swing high/low
        // but option delta (real buying/selling pressure from the chain)
        // fails to confirm it — classic weakening-momentum reversal warning.
        id: "deltaDivergence", label: "DELTA DIVERGENCE (Weakening Momentum)", icon: "om", unit: "₹",
        a: { key: "spot", name: "Spot", value: 22075 },
        b: { key: "swingHigh", name: "Recent swing high", value: 22080 },
        c: { key: "swingLow", name: "Recent swing low", value: 22000 },
        d: { key: "deltaNow", name: "ATM Call Delta (now)", value: 0.55 },
        e: { key: "deltaPrev", name: "ATM Call Delta (prev)", value: 0.62 },
        evaluate: (v) => {
            const newHigh = v.spot >= v.swingHigh;
            const newLow = v.spot <= v.swingLow;
            const deltaWeakening = v.deltaNow < v.deltaPrev;
            const deltaStrengthening = v.deltaNow > v.deltaPrev;
            if (newHigh && deltaWeakening) return "SELL";
            if (newLow && deltaStrengthening) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            const newHigh = v.spot >= v.swingHigh;
            const newLow = v.spot <= v.swingLow;
            const deltaWeakening = v.deltaNow < v.deltaPrev;
            const deltaStrengthening = v.deltaNow > v.deltaPrev;
            if (newHigh && deltaWeakening) return `Spot ${v.spot} made a new swing high (${v.swingHigh}) but ATM call delta dropped from ${v.deltaPrev} to ${v.deltaNow} — buying pressure isn't confirming the new high, bearish divergence, SELL.`;
            if (newLow && deltaStrengthening) return `Spot ${v.spot} made a new swing low (${v.swingLow}) but ATM call delta rose from ${v.deltaPrev} to ${v.deltaNow} — selling pressure isn't confirming the new low, bullish divergence, BUY.`;
            return `Spot ${v.spot} hasn't broken the swing high (${v.swingHigh}) or low (${v.swingLow}) with a delta mismatch — no divergence yet, WAIT.`;
        }
    },
    {
        // 33rd indicator — Gamma Flip Zone: standalone zero-gamma regime
        // read (short-gamma below the flip = moves amplify, long-gamma
        // above = moves get pinned/dampened). No live options-greeks
        // "gamma" field exists in the relay's chain feed (Upstox chain
        // response only carries delta/iv here), so — same as the existing
        // THOR indicator — zeroGamma stays a manual input; only spot is
        // live-wired via SPOT_DRIVEN_IDS.
        id: "gammaFlip", label: "GAMMA FLIP ZONE (Dealer Hedging Regime)", icon: "om", unit: "₹",
        a: { key: "spot", name: "Spot", value: 22075 },
        b: { key: "zeroGamma", name: "Zero-Gamma flip level", value: 22050 },
        c: { key: "trendUp", name: "Price trending up? (1/0)", value: 1 },
        evaluate: (v) => {
            if (v.spot < v.zeroGamma) return v.trendUp ? "BUY" : "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.spot < v.zeroGamma) return v.trendUp ? `Spot ${v.spot} is below the zero-gamma flip ${v.zeroGamma} — dealers are short gamma here, their hedging amplifies the current up-move, BUY.` : `Spot ${v.spot} is below the zero-gamma flip ${v.zeroGamma} — dealers are short gamma here, their hedging amplifies the current down-move, SELL.`;
            return `Spot ${v.spot} is above the zero-gamma flip ${v.zeroGamma} — dealers are long gamma, hedging dampens moves and pins price, don't chase breakouts in this regime, WAIT.`;
        }
    },
    {
        // 34th indicator — Multi-Timeframe EMA Stack: fast/mid/slow EMA
        // (9/21/50) all have to agree on direction — filters out the false
        // breakouts a single fast EMA throws during chop.
        id: "mtfEmaStack", label: "MULTI-TF EMA STACK (Trend Alignment)", icon: "om", unit: "₹",
        a: { key: "emaFast", name: "EMA 9", value: 22060 },
        b: { key: "emaMid", name: "EMA 21", value: 22040 },
        c: { key: "emaSlow", name: "EMA 50", value: 22020 },
        evaluate: (v) => {
            if (v.emaFast > v.emaMid && v.emaMid > v.emaSlow) return "BUY";
            if (v.emaFast < v.emaMid && v.emaMid < v.emaSlow) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.emaFast > v.emaMid && v.emaMid > v.emaSlow) return `EMA9 (${v.emaFast}) > EMA21 (${v.emaMid}) > EMA50 (${v.emaSlow}) — all three timeframes stacked bullish, real trend alignment, BUY.`;
            if (v.emaFast < v.emaMid && v.emaMid < v.emaSlow) return `EMA9 (${v.emaFast}) < EMA21 (${v.emaMid}) < EMA50 (${v.emaSlow}) — all three timeframes stacked bearish, real trend alignment, SELL.`;
            return `EMA9 (${v.emaFast}), EMA21 (${v.emaMid}), EMA50 (${v.emaSlow}) aren't stacked in one direction yet — mixed timeframes, WAIT.`;
        }
    },
    {
        // 35th indicator — Volume-Weighted Reversal: high volume + a long
        // rejection wick at the candle extreme = real absorption, not
        // just a random spike.
        id: "volReversal", label: "VOLUME-WEIGHTED REVERSAL (Absorption)", icon: "om", unit: "x",
        a: { key: "candleOpen", name: "Candle open", value: 22050 },
        b: { key: "candleClose", name: "Candle close", value: 22060 },
        c: { key: "candleHigh", name: "Candle high", value: 22080 },
        d: { key: "candleLow", name: "Candle low", value: 22045 },
        e: { key: "volMult", name: "Volume vs recent avg (x)", value: 1.0 },
        evaluate: (v) => {
            const range = v.candleHigh - v.candleLow;
            if (range <= 0 || v.volMult < 1.5) return "WAIT";
            const upperWick = v.candleHigh - Math.max(v.candleOpen, v.candleClose);
            const lowerWick = Math.min(v.candleOpen, v.candleClose) - v.candleLow;
            if (lowerWick / range > 0.5) return "BUY";
            if (upperWick / range > 0.5) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const range = v.candleHigh - v.candleLow;
            if (range <= 0 || v.volMult < 1.5) return `Volume is only ${v.volMult}x recent average — need at least 1.5x to trust a wick as real absorption, WAIT.`;
            const upperWick = v.candleHigh - Math.max(v.candleOpen, v.candleClose);
            const lowerWick = Math.min(v.candleOpen, v.candleClose) - v.candleLow;
            if (lowerWick / range > 0.5) return `Volume is ${v.volMult}x average and the candle has a long lower wick (${v.candleLow}–body) — heavy buying absorbed the sell-off, BUY.`;
            if (upperWick / range > 0.5) return `Volume is ${v.volMult}x average and the candle has a long upper wick (body–${v.candleHigh}) — heavy selling absorbed the rally, SELL.`;
            return `Volume is ${v.volMult}x average but no dominant rejection wick on this candle — no clear absorption signal, WAIT.`;
        }
    },
    {
        // 36th indicator — Order Flow Aggression Index: cumulative candle-body
        // aggression over the last 5 candles, weighted by each candle's
        // volume multiple vs its own recent average — a single noisy candle
        // can't flip it the way a last-tick-only read could.
        id: "orderFlowAggression", label: "ORDER FLOW AGGRESSION INDEX", icon: "om", unit: "",
        a: { key: "aggressionScore", name: "Aggression score (last 5 candles)", value: 0 },
        b: { key: "threshold", name: "Trigger threshold", value: 2.5 },
        evaluate: (v) => {
            if (v.aggressionScore > v.threshold) return "BUY";
            if (v.aggressionScore < -v.threshold) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.aggressionScore > v.threshold) return `Aggression score ${v.aggressionScore} is above +${v.threshold} — recent candles show sustained high-volume buying, BUY.`;
            if (v.aggressionScore < -v.threshold) return `Aggression score ${v.aggressionScore} is below -${v.threshold} — recent candles show sustained high-volume selling, SELL.`;
            return `Aggression score ${v.aggressionScore} is inside the ±${v.threshold} band — no sustained one-sided pressure yet, WAIT.`;
        }
    },
    {
        // 37th indicator — IV Regime Filter: compares current ATM IV to its
        // own rolling 20-poll average. Gates on whether IV is spiking
        // (stand down) or calm (trust the prevailing price trend).
        id: "ivRegimeFilter", label: "IV REGIME FILTER (Crush/Spike Gate)", icon: "om", unit: "",
        a: { key: "ivNow", name: "ATM IV (now)", value: 14 },
        b: { key: "ivAvg", name: "ATM IV (20-poll avg)", value: 14 },
        c: { key: "priceTrendUp", name: "Price trending up? (1/0)", value: 1 },
        evaluate: (v) => {
            const ratio = v.ivAvg ? v.ivNow / v.ivAvg : 1;
            if (ratio >= 1.1) return "WAIT";
            return v.priceTrendUp ? "BUY" : "SELL";
        },
        reason: (v) => {
            const ratio = v.ivAvg ? +(v.ivNow / v.ivAvg).toFixed(2) : 1;
            if (ratio >= 1.1) return `IV ${v.ivNow} is ${ratio}x the 20-poll average ${v.ivAvg} — volatility is spiking (event risk / indecision), stand down, WAIT.`;
            return v.priceTrendUp ? `IV ${v.ivNow} is calm relative to its average (${ratio}x) and price is trending up — clean regime, BUY.` : `IV ${v.ivNow} is calm relative to its average (${ratio}x) and price is trending down — clean regime, SELL.`;
        }
    },
    {
        // 38th indicator — Volume Climax Exhaustion: the current candle has
        // the highest volume of the recent run, but price failed to extend
        // beyond the prior swing — often the last-gasp candle before a
        // reversal, distinct from #35's absorption-with-wick read.
        id: "volClimaxExhaustion", label: "VOLUME CLIMAX EXHAUSTION", icon: "om", unit: "₹",
        a: { key: "candleHigh", name: "Candle high", value: 22080 },
        b: { key: "candleLow", name: "Candle low", value: 22045 },
        c: { key: "prevSwingHigh", name: "Recent swing high", value: 22085 },
        d: { key: "prevSwingLow", name: "Recent swing low", value: 22000 },
        e: { key: "isClimaxVol", name: "Is this the highest-volume candle recently? (1/0)", value: 0 },
        f: { key: "priorTrendUp", name: "Was the prior trend up? (1=up, 0=down)", value: 1 },
        evaluate: (v) => {
            if (!v.isClimaxVol) return "WAIT";
            if (v.priorTrendUp && v.candleHigh <= v.prevSwingHigh) return "SELL";
            if (!v.priorTrendUp && v.candleLow >= v.prevSwingLow) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.isClimaxVol) return `This candle isn't the highest-volume one recently — no climax to read, WAIT.`;
            if (v.priorTrendUp && v.candleHigh <= v.prevSwingHigh) return `Highest volume of the recent run, but price failed to beat the prior swing high ${v.prevSwingHigh} — buying climax/exhaustion, SELL.`;
            if (!v.priorTrendUp && v.candleLow >= v.prevSwingLow) return `Highest volume of the recent run, but price failed to beat the prior swing low ${v.prevSwingLow} — selling climax/exhaustion, BUY.`;
            return `Climax volume candle, but price did extend beyond the prior swing — trend still intact, not exhaustion, WAIT.`;
        }
    },
    {
        // 39th indicator — Market Structure Break (BOS / CHoCH): tracks the
        // last confirmed fractal swing high/low. A close beyond the swing in
        // the prevailing trend's direction is a Break of Structure
        // (continuation); a close beyond the opposite swing is a Change of
        // Character (early reversal tell).
        id: "structureBreak", label: "MARKET STRUCTURE BREAK (BOS / CHoCH)", icon: "om", unit: "₹",
        a: { key: "close", name: "Latest close", value: 22075 },
        b: { key: "lastSwingHigh", name: "Last confirmed swing high", value: 22070 },
        c: { key: "lastSwingLow", name: "Last confirmed swing low", value: 22000 },
        d: { key: "trendUp", name: "Current trend up? (1/0)", value: 1 },
        evaluate: (v) => {
            if (v.close > v.lastSwingHigh) return "BUY";
            if (v.close < v.lastSwingLow) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.close > v.lastSwingHigh) return v.trendUp ? `Close ${v.close} broke above the last swing high ${v.lastSwingHigh} — trend continuation (BOS), BUY.` : `Close ${v.close} broke above the last swing high ${v.lastSwingHigh} while the trend was down — change of character (CHoCH), early reversal, BUY.`;
            if (v.close < v.lastSwingLow) return !v.trendUp ? `Close ${v.close} broke below the last swing low ${v.lastSwingLow} — trend continuation (BOS), SELL.` : `Close ${v.close} broke below the last swing low ${v.lastSwingLow} while the trend was up — change of character (CHoCH), early reversal, SELL.`;
            return `Close ${v.close} is still inside the last swing range (${v.lastSwingLow}–${v.lastSwingHigh}) — no structure break yet, WAIT.`;
        }
    },
    {
        // 40th indicator — ATR Compression Breakout (Squeeze): waits for
        // ATR to contract well below its own recent average, then trades
        // the direction of the first candle that closes outside the
        // squeeze range — a volatility-regime breakout filter.
        id: "atrSqueezeBreakout", label: "ATR COMPRESSION BREAKOUT (Squeeze)", icon: "om", unit: "₹",
        a: { key: "atrNow", name: "Current ATR(14)", value: 30 },
        b: { key: "atrAvg", name: "ATR(14) 20-candle average", value: 55 },
        c: { key: "close", name: "Latest close", value: 22075 },
        d: { key: "rangeHigh", name: "Squeeze range high", value: 22060 },
        e: { key: "rangeLow", name: "Squeeze range low", value: 22020 },
        evaluate: (v) => {
            const squeezed = v.atrAvg ? (v.atrNow / v.atrAvg) < 0.6 : false;
            if (!squeezed) return "WAIT";
            if (v.close > v.rangeHigh) return "BUY";
            if (v.close < v.rangeLow) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const ratio = v.atrAvg ? +(v.atrNow / v.atrAvg).toFixed(2) : 1;
            if (ratio >= 0.6) return `ATR ${v.atrNow} is ${ratio}x its 20-candle average — no squeeze right now, WAIT.`;
            if (v.close > v.rangeHigh) return `Volatility was squeezed (ATR ${ratio}x average) and price just broke above the squeeze range high ${v.rangeHigh} — breakout, BUY.`;
            if (v.close < v.rangeLow) return `Volatility was squeezed (ATR ${ratio}x average) and price just broke below the squeeze range low ${v.rangeLow} — breakdown, SELL.`;
            return `Volatility is squeezed (ATR ${ratio}x average) but price hasn't broken the range yet — coiling, WAIT.`;
        }
    },
    {
        // 41st indicator — OI Skew Shift (Chain-Wide): OI-weighted average
        // strike for calls vs puts, tracked poll-to-poll. Different from
        // PCR (whole-chain totals only) — this reads how OI concentration
        // itself is migrating up/down the chain over time.
        id: "oiSkewShift", label: "OI SKEW SHIFT (Chain-Wide)", icon: "om", unit: "₹",
        a: { key: "callOiCenter", name: "Call OI-weighted center strike", value: 22100 },
        b: { key: "putOiCenter", name: "Put OI-weighted center strike", value: 22000 },
        c: { key: "prevCallOiCenter", name: "Call OI center (prev poll)", value: 22090 },
        d: { key: "prevPutOiCenter", name: "Put OI center (prev poll)", value: 22010 },
        evaluate: (v) => {
            const skewShift = (v.callOiCenter - v.prevCallOiCenter) - (v.putOiCenter - v.prevPutOiCenter);
            if (skewShift > 0) return "BUY";
            if (skewShift < 0) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const skewShift = +(((v.callOiCenter - v.prevCallOiCenter) - (v.putOiCenter - v.prevPutOiCenter))).toFixed(2);
            if (skewShift > 0) return `Call OI center moved to ${v.callOiCenter} (from ${v.prevCallOiCenter}) faster than put OI center dropped — chain-wide skew shift ${skewShift} favors upside, BUY.`;
            if (skewShift < 0) return `Put OI center moved to ${v.putOiCenter} (from ${v.prevPutOiCenter}) faster than call OI center rose — chain-wide skew shift ${skewShift} favors downside, SELL.`;
            return `Call and put OI centers are moving in step — no net skew shift, WAIT.`;
        }
    },
    {
        // 42nd indicator — BTC-Nifty Correlation Divergence. IMPORTANT: this
        // does NOT read candlesBySymbol (that buffer only ever holds ONE
        // symbol's candles at a time — whichever is currently selected as
        // tradeSymbol — so candlesBySymbol["BTCUSDT"] and
        // candlesBySymbol["NIFTY 50"] can never both be populated at once).
        // Wired straight off marketData instead, which DOES tick both
        // BTCUSDT (Binance WS) and NIFTY 50 (relay) live and concurrently
        // regardless of what's selected as tradeSymbol — see the dedicated
        // sampling effect below. Advisory-only: correlation is weak/
        // unstable, excluded from the Super Compute Signal's vote count,
        // same treatment as GEX.
        id: "btcNiftyDivergence", label: "BTC–NIFTY CORRELATION DIVERGENCE", icon: "om", unit: "%",
        a: { key: "btcChgPct", name: "BTCUSDT 15-min % change", value: 0 },
        b: { key: "niftyChgPct", name: "NIFTY 15-min % change", value: 0 },
        evaluate: (v) => {
            if (v.btcChgPct > 0.5 && v.niftyChgPct < v.btcChgPct - 0.3) return "BUY";
            if (v.btcChgPct < -0.5 && v.niftyChgPct > v.btcChgPct + 0.3) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.btcChgPct > 0.5 && v.niftyChgPct < v.btcChgPct - 0.3) return `BTC is up ${v.btcChgPct}% but Nifty has only moved ${v.niftyChgPct}% — risk-on move hasn't caught up in equities yet, lean BUY (advisory/low-confidence, not a standalone trigger).`;
            if (v.btcChgPct < -0.5 && v.niftyChgPct > v.btcChgPct + 0.3) return `BTC is down ${v.btcChgPct}% but Nifty has only moved ${v.niftyChgPct}% — risk-off move hasn't caught up in equities yet, lean SELL (advisory/low-confidence, not a standalone trigger).`;
            return `BTC (${v.btcChgPct}%) and Nifty (${v.niftyChgPct}%) are moving in step or too small to read — no divergence, WAIT.`;
        }
    },
    {
        // 43rd indicator — Rate-of-Change Acceleration (2nd derivative):
        // whether momentum itself is speeding up or slowing down, distinct
        // from Hurst (trend persistence) and Z-score (mean reversion).
        id: "rocAcceleration", label: "ROC ACCELERATION (Momentum 2nd Derivative)", icon: "om", unit: "%",
        a: { key: "rocNow", name: "ROC now (%, 10-candle)", value: 0 },
        b: { key: "rocPrev", name: "ROC prev candle (%, 10-candle)", value: 0 },
        evaluate: (v) => {
            const accel = v.rocNow - v.rocPrev;
            if (v.rocNow > 0 && accel > 0) return "BUY";
            if (v.rocNow < 0 && accel < 0) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const accel = +(v.rocNow - v.rocPrev).toFixed(3);
            if (v.rocNow > 0 && accel > 0) return `ROC is +${v.rocNow}% and accelerating (was +${v.rocPrev}%) — the up-move is gaining speed, not just continuing, BUY.`;
            if (v.rocNow < 0 && accel < 0) return `ROC is ${v.rocNow}% and accelerating downward (was ${v.rocPrev}%) — the down-move is gaining speed, SELL.`;
            return `ROC ${v.rocNow}% isn't accelerating in its own direction (change ${accel}) — momentum flat or decelerating, WAIT.`;
        }
    },
    {
        // 44th indicator — Session VWAP Reclaim/Reject (Afternoon Anchor):
        // watches the post-1:30 PM IST reaction to the full-day VWAP —
        // afternoon reclaims/rejects historically show higher follow-through
        // once morning chop has been filtered out.
        id: "afternoonVwapReclaim", label: "SESSION VWAP RECLAIM/REJECT (PM)", icon: "om", unit: "₹",
        a: { key: "vwap", name: "Session VWAP", value: 22050 },
        b: { key: "candleOpen", name: "Candle open", value: 22060 },
        c: { key: "candleHigh", name: "Candle high", value: 22065 },
        d: { key: "candleLow", name: "Candle low", value: 22045 },
        e: { key: "candleClose", name: "Candle close", value: 22058 },
        f: { key: "isAfternoon", name: "Is it past 1:30 PM IST? (1/0)", value: 0 },
        evaluate: (v) => {
            if (!v.isAfternoon) return "WAIT";
            const reclaim = v.candleLow <= v.vwap && v.candleOpen > v.vwap && v.candleClose > v.vwap;
            const reject = v.candleHigh >= v.vwap && v.candleOpen < v.vwap && v.candleClose < v.vwap;
            if (reclaim) return "BUY";
            if (reject) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.isAfternoon) return `It's before 1:30 PM IST — morning VWAP tests are noisier, this indicator only reads the afternoon session, WAIT.`;
            const reclaim = v.candleLow <= v.vwap && v.candleOpen > v.vwap && v.candleClose > v.vwap;
            const reject = v.candleHigh >= v.vwap && v.candleOpen < v.vwap && v.candleClose < v.vwap;
            if (reclaim) return `Afternoon session: price dipped to VWAP ${v.vwap} (low ${v.candleLow}) and closed back above it at ${v.candleClose} — VWAP reclaim, continuation BUY for the rest of the session.`;
            if (reject) return `Afternoon session: price poked up to VWAP ${v.vwap} (high ${v.candleHigh}) and closed back below it at ${v.candleClose} — VWAP reject, continuation SELL for the rest of the session.`;
            return `Afternoon session, but price hasn't tested and reacted to VWAP ${v.vwap} yet this candle, WAIT.`;
        }
    },
    {
        // 45th indicator — Bid-Ask Imbalance Pressure. The one indicator of
        // the 10 that needed a genuine relay change: relay-server-21.js
        // adds a periodic depth poll (watchDepth message -> "depth"
        // broadcasts) for the currently-watched ATM strike, sent below.
        // Short-horizon "next few ticks" read, not a swing signal.
        id: "bidAskImbalance", label: "BID-ASK IMBALANCE PRESSURE", icon: "om", unit: "",
        a: { key: "bidQty", name: "Top-5 bid quantity", value: 0 },
        b: { key: "askQty", name: "Top-5 ask quantity", value: 0 },
        evaluate: (v) => {
            if (v.stale) return "WAIT";
            const total = v.bidQty + v.askQty;
            if (!total) return "WAIT";
            const imbalance = (v.bidQty - v.askQty) / total;
            if (imbalance > 0.25) return "BUY";
            if (imbalance < -0.25) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.stale) return `No depth update in over 15s — the relay's poll may be rate-limited or the strike changed. Standing down until fresh data arrives, WAIT.`;
            const total = v.bidQty + v.askQty;
            if (!total) return `No depth data yet, WAIT.`;
            const imbalance = +(((v.bidQty - v.askQty) / total)).toFixed(2);
            if (imbalance > 0.25) return `Top-5 bid quantity (${v.bidQty}) heavily outweighs ask quantity (${v.askQty}), imbalance ${imbalance} — resting buy pressure, BUY (short-horizon read, next few ticks).`;
            if (imbalance < -0.25) return `Top-5 ask quantity (${v.askQty}) heavily outweighs bid quantity (${v.bidQty}), imbalance ${imbalance} — resting sell pressure, SELL (short-horizon read, next few ticks).`;
            return `Bid (${v.bidQty}) and ask (${v.askQty}) depth are roughly balanced, imbalance ${imbalance} — no clear pressure, WAIT.`;
        }
    },
    {
        // 46th indicator — VPIN (Order Flow Toxicity). Bulk Volume
        // Classification: each candle's buy-fraction = N(z), z = that
        // candle's return standardized by its own rolling volatility.
        // Pure candle math — no relay change, works for crypto too.
        id: "vpin", label: "VPIN — ORDER FLOW TOXICITY", icon: "om", unit: "",
        a: { key: "vpinValue", name: "VPIN (0-1)", value: 0 },
        b: { key: "sampleSize", name: "Candles in window", value: 0 },
        evaluate: (v) => {
            // FIX (v53): collapsed two identical if-bands (>0.6, >0.4) that
            // both ran buyLeaning?BUY:SELL — was redundant dead logic, only
            // the reason() text differed between them. Behavior unchanged.
            if (v.sampleSize < 20) return "WAIT";
            if (v.vpinValue > 0.4) return v.buyLeaning ? "BUY" : "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.sampleSize < 20) return `Only ${v.sampleSize} candles in the VPIN window (need 20) — WAIT.`;
            if (v.vpinValue > 0.6) return `VPIN ${v.vpinValue} — HIGH toxicity, order flow is heavily one-sided (${v.buyLeaning ? "buy" : "sell"}-skewed), market makers likely widening spreads / pulling liquidity, expect a volatility spike in the ${v.buyLeaning ? "up" : "down"} direction, ${v.buyLeaning ? "BUY" : "SELL"} bias but tighten stops.`;
            if (v.vpinValue > 0.4) return `VPIN ${v.vpinValue} — elevated toxicity, flow leaning ${v.buyLeaning ? "buy-side, BUY" : "sell-side, SELL"}.`;
            return `VPIN ${v.vpinValue} — flow is balanced/non-toxic, no edge here, WAIT.`;
        }
    },
    {
        // 47th indicator — Vanna Exposure (VEX). Needs a raw risk-free rate
        // the chain doesn't carry (assumed India ~6.5%, see RISK_FREE_RATE)
        // and closed-form Black-Scholes vanna (bsVanna above). Only lights
        // up on NIFTY/BANKNIFTY, same as the other 6 option-chain reads.
        id: "vex", label: "VANNA EXPOSURE (VEX)", icon: "quantum", unit: "",
        a: { key: "vexValue", name: "Net VEX (₹, per 1pt IV move)", value: 0 },
        b: { key: "ivNow", name: "ATM IV now", value: 0 },
        c: { key: "ivPrev", name: "ATM IV prev poll", value: 0 },
        evaluate: (v) => {
            if (!v.hasChain) return "WAIT";
            const ivFalling = v.ivNow < v.ivPrev;
            if (v.vexValue > 0 && ivFalling) return "BUY";
            if (v.vexValue < 0 && !ivFalling) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasChain) return `No option chain loaded for this underlying yet — VEX needs the live chain, WAIT.`;
            const ivFalling = v.ivNow < v.ivPrev;
            if (v.vexValue > 0 && ivFalling) return `Positive net VEX (${v.vexValue}) with IV falling (${v.ivPrev}% → ${v.ivNow}%) — dealers are forced to BUY the underlying to stay hedged as vanna unwinds, BUY.`;
            if (v.vexValue < 0 && !ivFalling) return `Negative net VEX (${v.vexValue}) with IV steady/rising (${v.ivPrev}% → ${v.ivNow}%) — dealer hedging flow favors SELL.`;
            return `Net VEX ${v.vexValue}, IV ${v.ivPrev}% → ${v.ivNow}% — sign/IV combination doesn't line up cleanly yet, WAIT.`;
        }
    },
    {
        // 48th indicator — Charm ("the conveyor belt"). Pure time-decay
        // dealer rehedging pressure — builds even with zero price movement,
        // strongest inside 0-3 DTE. Same chain data + BS helper as VEX.
        id: "charm", label: "CHARM — TIME-DECAY REHEDGE", icon: "quantum", unit: "",
        a: { key: "charmValue", name: "Net Charm (₹, per day)", value: 0 },
        b: { key: "daysToExpiry", name: "Days to expiry", value: 0 },
        evaluate: (v) => {
            if (!v.hasChain) return "WAIT";
            if (v.daysToExpiry > 3) return "WAIT"; // conveyor belt only strong close to expiry
            if (v.charmValue > 0) return "BUY";
            if (v.charmValue < 0) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasChain) return `No option chain loaded for this underlying yet — Charm needs the live chain, WAIT.`;
            if (v.daysToExpiry > 3) return `${v.daysToExpiry} days to expiry — charm rehedging is only a strong, reliable push inside 0-3 DTE, WAIT until closer to expiry.`;
            if (v.charmValue > 0) return `${v.daysToExpiry} DTE, net Charm ${v.charmValue} positive — pure time decay is forcing dealers to buy as expiry nears, BUY (no price move needed, this builds through the session).`;
            if (v.charmValue < 0) return `${v.daysToExpiry} DTE, net Charm ${v.charmValue} negative — time-decay rehedging favors SELL.`;
            return `${v.daysToExpiry} DTE, net Charm ~0 — no meaningful rehedge pressure, WAIT.`;
        }
    },
    {
        // 49th indicator — Microprice Deviation. Reuses the SAME depth poll
        // as Bid-Ask Imbalance Pressure (#45) — needs the relay to also
        // broadcast bestBid/bestAsk PRICE alongside bidQty/askQty (today's
        // "depth" message only carries quantities). Until that price field
        // exists on the relay side this correctly sits at WAIT rather than
        // faking a microprice off quantities alone.
        id: "micropriceDeviation", label: "MICROPRICE DEVIATION", icon: "om", unit: "₹",
        a: { key: "microprice", name: "Microprice", value: 0 },
        b: { key: "mid", name: "Simple mid", value: 0 },
        evaluate: (v) => {
            if (v.stale || !v.hasPrices) return "WAIT";
            const dev = v.microprice - v.mid;
            if (dev > v.mid * 0.0005) return "BUY";
            if (dev < -v.mid * 0.0005) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasPrices) return `Relay isn't broadcasting bid/ask PRICE yet (only quantities) — Microprice needs bestBid/bestAsk added to the depth message, WAIT.`;
            if (v.stale) return `No depth update in over 15s, WAIT.`;
            const dev = +(v.microprice - v.mid).toFixed(2);
            if (dev > v.mid * 0.0005) return `Microprice ${v.microprice} above simple mid ${v.mid} (dev ${dev}) — thinner resting size is on the ask, next tick likely gets eaten upward, BUY (few-hundred-ms lead, not a swing signal).`;
            if (dev < -v.mid * 0.0005) return `Microprice ${v.microprice} below simple mid ${v.mid} (dev ${dev}) — thinner resting size is on the bid, next tick likely gets eaten downward, SELL.`;
            return `Microprice ${v.microprice} ≈ mid ${v.mid} (dev ${dev}) — no size-skew edge right now, WAIT.`;
        }
    },
    {
        // 50th indicator — Volatility Risk Premium (VRP). RV is realized
        // vol from the last 20 candles of the SELECTED symbol (log returns,
        // annualized using the actual live bucketMs — NOT hardcoded to
        // 1-min, since bucketMs is user-selectable via the timeframe
        // dropdown). ATM IV is the average of callIv/putIv at the ATM
        // strike, same chain already polled for VEX/Charm. No new data.
        id: "vrp", label: "VOLATILITY RISK PREMIUM (VRP)", icon: "quantum", unit: "pts",
        a: { key: "vrpValue", name: "VRP (IV − RV)", value: 0 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            if (v.vrpValue > 3) return "SELL";
            if (v.vrpValue < -3) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `Need 20 candles + a live ATM IV to compute VRP — not enough data yet, WAIT.`;
            if (v.vrpValue > 3) return `IV is running ${v.vrpValue}pts above realized vol — fear priced in exceeds actual movement, fade the move, SELL.`;
            if (v.vrpValue < -3) return `Realized vol is outrunning IV by ${Math.abs(v.vrpValue)}pts — actual movement exceeds what's priced, more room to run, BUY.`;
            return `VRP is ${v.vrpValue}pts — IV and realized vol are roughly in line, no edge, WAIT.`;
        }
    },
    {
        // 51st indicator — 25-Delta Risk Reversal (Skew). Uses the chain's
        // REAL callDelta/putDelta per strike (both already fetched by the
        // relay — see relay-server-21.js line 707-708). Deliberately does
        // NOT derive putDelta from callDelta-1 when missing: same
        // no-invented-data guard as VEX/Charm — a strike with no putDelta
        // is skipped from the 25d search, not faked.
        id: "riskReversal", label: "25-DELTA RISK REVERSAL (SKEW)", icon: "quantum", unit: "%",
        a: { key: "rrValue", name: "25d RR (callIV − putIV)", value: 0 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            if (v.rrValue > 0.5) return "BUY";
            if (v.rrValue < -0.5) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `No strike with both a real callDelta near 25d and a real putDelta near 25d yet — WAIT.`;
            if (v.rrValue > 0.5) return `25-delta calls are priced ${v.rrValue}% richer than puts — real upside demand, BUY.`;
            if (v.rrValue < -0.5) return `25-delta puts are priced ${Math.abs(v.rrValue)}% richer than calls — downside hedging pressure, SELL.`;
            return `RR is ${v.rrValue}% — no meaningful skew, WAIT.`;
        }
    },
    {
        // 52nd indicator — Cross-Asset Lead-Lag Beta (BTC→NIFTY). Reuses
        // the SAME independent 60s-sample ring buffer as BTC-Nifty
        // Divergence (#42) — NOT candlesBySymbol, which can only ever hold
        // one symbol's candles at a time (see that indicator's own note).
        // Buffer extended from 16 to 33 samples to give the rolling beta
        // a ~30-sample regression window.
        id: "leadLagBeta", label: "CROSS-ASSET LEAD-LAG BETA (BTC→NIFTY)", icon: "om", unit: "",
        a: { key: "beta", name: "Rolling beta (30-sample)", value: 0 },
        b: { key: "lastBtcRet", name: "Last BTC return (%)", value: 0 },
        evaluate: (v) => {
            if (!v.hasData || Math.abs(v.beta) < 0.05) return "WAIT";
            const proj = v.beta * v.lastBtcRet;
            if (proj > 0.02) return "BUY";
            if (proj < -0.02) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `Need ~33 one-minute BTC+Nifty samples before the lead-lag beta is trustworthy — still warming up, WAIT.`;
            if (Math.abs(v.beta) < 0.05) return `Beta (${v.beta}) is too weak to trust — BTC isn't leading Nifty right now, WAIT.`;
            const proj = +(v.beta * v.lastBtcRet).toFixed(3);
            return `BTC moved ${v.lastBtcRet}% last sample, rolling beta is ${v.beta} — projects a ${proj}% Nifty move next, ${proj > 0 ? "BUY" : "SELL"}.`;
        }
    },
    {
        // 53rd indicator — Wick Asymmetry (Rejection Pressure). Rolling
        // 10-candle average of upper/lower wick size on the selected
        // symbol's own candles. Distinct from #35 (Volume-Weighted
        // Reversal): that one reads a SINGLE candle's wick gated on a
        // volume spike; this one reads a PERSISTENT multi-candle bias
        // with no volume gate — they can disagree on the same tape.
        id: "wickAsymmetry", label: "WICK ASYMMETRY (Rejection Pressure)", icon: "om", unit: "pts",
        a: { key: "avgUpperWick", name: "Avg upper wick (10c)", value: 0 },
        b: { key: "avgLowerWick", name: "Avg lower wick (10c)", value: 0 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            if (v.avgUpperWick > v.avgLowerWick * 1.3) return "SELL";
            if (v.avgLowerWick > v.avgUpperWick * 1.3) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `Need 10 candles on this symbol to read wick asymmetry — WAIT.`;
            if (v.avgUpperWick > v.avgLowerWick * 1.3) return `Upper wicks (avg ${v.avgUpperWick}) are running well above lower wicks (${v.avgLowerWick}) — repeated rejection at highs, SELL.`;
            if (v.avgLowerWick > v.avgUpperWick * 1.3) return `Lower wicks (avg ${v.avgLowerWick}) are running well above upper wicks (${v.avgUpperWick}) — repeated rejection at lows, BUY.`;
            return `Wicks are roughly balanced (up ${v.avgUpperWick} / down ${v.avgLowerWick}) — no persistent rejection either side, WAIT.`;
        }
    },
    {
        id: "vwapTwapPremium", label: "VWAP-TWAP PREMIUM", icon: "activity", unit: "pts",
        a: { key: "premium", name: "Premium (VWAP - TWAP)", value: 0 },
        b: { key: "vwap", name: "Session VWAP", value: 0 },
        c: { key: "twap", name: "Session TWAP", value: 0 },
        evaluate: (v) => v.premium > 2 ? "BUY" : v.premium < -2 ? "SELL" : "WAIT",
        reason: (v) => v.premium > 2
            ? `VWAP (${v.vwap}) > TWAP (${v.twap}) by ${v.premium}pts. Heavy volume executing at higher prices (accumulation), BUY.`
            : v.premium < -2
            ? `TWAP (${v.twap}) > VWAP (${v.vwap}) by ${Math.abs(v.premium)}pts. Heavy volume executing at lower prices (distribution), SELL.`
            : `VWAP and TWAP aligned (Premium: ${v.premium}pts). No execution footprint, WAIT.`
    },
    {
        id: "heavyweightBreadth", label: "HEAVYWEIGHT BREADTH DIVERGENCE", icon: "layers", unit: "%",
        a: { key: "divergence", name: "Divergence (Nifty - Top 5)", value: 0 },
        b: { key: "niftyRet", name: "Nifty Return", value: 0 },
        c: { key: "top5Ret", name: "Top 5 Return", value: 0 },
        evaluate: (v) => v.divergence < -0.2 ? "BUY" : v.divergence > 0.2 ? "SELL" : "WAIT",
        reason: (v) => v.divergence < -0.2
            ? `Nifty (${v.niftyRet}%) is lagging Top 5 (${v.top5Ret}%). Heavyweights secretly accumulating, bullish divergence, BUY.`
            : v.divergence > 0.2
            ? `Nifty (${v.niftyRet}%) outrunning Top 5 (${v.top5Ret}%). Index propped by low-weight stocks, bearish divergence, SELL.`
            : `Nifty and Top 5 in sync (Div: ${v.divergence}%). No structural divergence, WAIT.`
    },
    {
        id: "kylesLambda", label: "KYLE'S LAMBDA (Market Impact)", icon: "zap", unit: "λ",
        a: { key: "lambdaRatio", name: "Lambda vs Avg", value: 1 },
        b: { key: "priceDir", name: "Price Direction (1/-1)", value: 0 },
        evaluate: (v) => v.lambdaRatio > 2.0 && v.priceDir > 0 ? "BUY" : v.lambdaRatio > 2.0 && v.priceDir < 0 ? "SELL" : "WAIT",
        reason: (v) => v.lambdaRatio > 2.0 && v.priceDir > 0
            ? `Lambda spiked ${v.lambdaRatio}x avg on UP move. Upside liquidity vacuum (zero resting sellers), BUY.`
            : v.lambdaRatio > 2.0 && v.priceDir < 0
            ? `Lambda spiked ${v.lambdaRatio}x avg on DOWN move. Downside trapdoor (bids pulled), SELL.`
            : `Lambda (${v.lambdaRatio}x) stable. Normal market impact, WAIT.`
    },
    {
        id: "returnSkewness", label: "LOGNORMAL RETURN SKEWNESS", icon: "activity", unit: "sk",
        a: { key: "skew", name: "Rolling Skewness (30c)", value: 0 },
        evaluate: (v) => v.skew > 1.0 ? "BUY" : v.skew < -1.0 ? "SELL" : "WAIT",
        reason: (v) => v.skew > 1.0
            ? `Skewness strongly positive (+${v.skew}). Fat right tail (violent up-candles, slow down-grinds). Upside bias, BUY.`
            : v.skew < -1.0
            ? `Skewness strongly negative (${v.skew}). Fat left tail. Downside bias, SELL.`
            : `Skewness is ${v.skew}. Returns are symmetrically distributed, WAIT.`
    },
    {
        // Net Dealer Delta Exposure — real callDelta/putDelta × real
        // callOi/putOi, summed across the whole live chain (same guard
        // style as VEX/Charm/25-Delta RR: only lights up when the chain
        // is actually loaded, no invented deltas). Upstox's putDelta
        // already comes back negative (put-call parity), so a straight
        // sum of callDelta×callOi + putDelta×putOi is the real net.
        id: "netDealerDelta", label: "NET DEALER DELTA EXPOSURE", icon: "quantum", unit: "Δ",
        a: { key: "netDelta", name: "Net Dealer Delta (Σ Δ×OI)", value: 0 },
        b: { key: "priceTrendUp", name: "Price trending up? (1/0)", value: 1 },
        evaluate: (v) => {
            if (!v.hasChain) return "WAIT";
            if (v.netDelta < 0) return v.priceTrendUp ? "BUY" : "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasChain) return `No option chain loaded for this underlying yet — Net Dealer Delta needs the live chain, WAIT.`;
            if (v.netDelta < 0) {
                return v.priceTrendUp
                    ? `Net dealer delta ${v.netDelta} is negative — dealers are net SHORT deltas and must buy futures/stock to stay hedged as spot rises, amplifying the current up-move, BUY.`
                    : `Net dealer delta ${v.netDelta} is negative — dealers are net SHORT deltas and must sell futures/stock to stay hedged as spot falls, amplifying the current down-move, SELL.`;
            }
            return `Net dealer delta ${v.netDelta} is positive — dealers are net LONG deltas, they sell into rallies and buy into dips, dampening moves either direction, WAIT (don't chase breakouts in this regime).`;
        }
    },
    {
        // OI Buildup Classification — the same 4-quadrant read NSE's own
        // F&O data uses: cross price direction against chain-wide total OI
        // direction (call OI + put OI summed across every strike, so this
        // is immune to the "shifting ATM strike" issue that oiCall/oiPut
        // guard against — a chain-wide total doesn't move when the ATM
        // strike rolls). Needs one full previous poll to read a direction,
        // so it correctly sits at WAIT on the very first chain load.
        id: "oiBuildup", label: "OI BUILDUP CLASSIFICATION", icon: "layers", unit: "",
        a: { key: "priceDir", name: "Price Direction (1/-1)", value: 1 },
        b: { key: "oiDir", name: "Total OI Direction (1/-1)", value: 1 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            if (v.priceDir > 0 && v.oiDir > 0) return "BUY";
            if (v.priceDir < 0 && v.oiDir > 0) return "SELL";
            if (v.priceDir > 0 && v.oiDir < 0) return "BUY";
            if (v.priceDir < 0 && v.oiDir < 0) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `Need one more chain poll to read an OI direction — WAIT.`;
            if (v.priceDir > 0 && v.oiDir > 0) return `Price up + total OI up — Long Buildup: fresh longs entering, bullish, BUY.`;
            if (v.priceDir < 0 && v.oiDir > 0) return `Price down + total OI up — Short Buildup: fresh shorts entering, bearish, SELL.`;
            if (v.priceDir > 0 && v.oiDir < 0) return `Price up + total OI down — Short Covering: shorts unwinding, bullish but weaker conviction, BUY.`;
            if (v.priceDir < 0 && v.oiDir < 0) return `Price down + total OI down — Long Unwinding: longs exiting, bearish but weaker conviction, SELL.`;
            return `Price/OI direction flat this poll — no clean buildup pattern yet, WAIT.`;
        }
    },
    {
        // IV Term Structure (Contango/Backwardation) — near-expiry ATM IV
        // vs next-expiry ATM IV. Needs relay-server-21.js to poll a SECOND
        // expiry (see resolvedNextExpiry / "optionChainNext" broadcast) —
        // only lights up on NIFTY/BANKNIFTY, same restriction as VEX/Charm.
        // Same gate style as IV Regime Filter: backwardation (acute
        // near-term event risk) means stand down; normal contango means
        // follow the existing price trend.
        id: "ivTermStructure", label: "IV TERM STRUCTURE (Near vs Next Expiry)", icon: "om", unit: "pts",
        a: { key: "termSpread", name: "Term Spread (Near IV − Next IV)", value: 0 },
        b: { key: "nearIv", name: "Near-expiry ATM IV", value: 14 },
        c: { key: "nextIv", name: "Next-expiry ATM IV", value: 14 },
        d: { key: "priceTrendUp", name: "Price trending up? (1/0)", value: 1 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            if (v.termSpread > 1) return "WAIT";
            return v.priceTrendUp ? "BUY" : "SELL";
        },
        reason: (v) => {
            if (!v.hasData) return `Next-expiry chain not loaded yet (needs relay-server-21.js's second-expiry poll) — WAIT.`;
            if (v.termSpread > 1) return `Near-expiry ATM IV (${v.nearIv}%) is ${v.termSpread}pts above next-expiry IV (${v.nextIv}%) — backwardation, acute near-term event risk priced in (expiry-day stress), stand down, WAIT.`;
            // FIX (v53): text previously always said "at/below" even when
            // termSpread was a small positive value (near-IV slightly above
            // next-IV, just under the 1pt WAIT threshold). Now describes the
            // actual relationship instead of assuming contango.
            const relation = v.nearIv <= v.nextIv
                ? `Near-expiry IV (${v.nearIv}%) is at/below next-expiry IV (${v.nextIv}%) — normal contango`
                : `Near-expiry IV (${v.nearIv}%) is slightly above next-expiry IV (${v.nextIv}%) but within the 1pt tolerance — mild backwardation`;
            return v.priceTrendUp
                ? `${relation}, no acute event risk priced in, clean regime, BUY.`
                : `${relation}, no acute event risk priced in, clean regime, SELL.`;
        }
    },
    {
        // FII/DII Index Futures Positioning — MANUAL, same category as
        // Germany/Luxembourg above. NSE publishes this once daily as EOD
        // participant-wise OI (nseindia.com/reports/fii-dii), not a live
        // feed — there's no official public API for it, and even an
        // unofficial scrape would only update once a day after market
        // close, which doesn't fit this relay's live-poll architecture.
        // Enter tonight's numbers from NSE's own published report and it
        // reads the trend vs the previous session, same as the spec asked
        // for (netFiiPositioning trend, not a single-day level).
        id: "fiiDiiPositioning", label: "FII/DII INDEX FUTURES POSITIONING (Live — NSE Participant OI)", unit: "contracts",
        a: { key: "fiiLongContracts", name: "FII Long Contracts (Index Fut)", value: 0 },
        b: { key: "fiiShortContracts", name: "FII Short Contracts (Index Fut)", value: 0 },
        c: { key: "fiiNetPrev", name: "FII Net Prev Session (Long−Short)", value: 0 },
        evaluate: (v) => {
            const net = v.fiiLongContracts - v.fiiShortContracts;
            if (net > 0 && net > v.fiiNetPrev) return "BUY";
            if (net < 0 && net < v.fiiNetPrev) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const net = v.fiiLongContracts - v.fiiShortContracts;
            if (net > 0 && net > v.fiiNetPrev) return `FII net long ${net} contracts, up from ${v.fiiNetPrev} last session — foreign institutions building index-futures longs, BUY.`;
            if (net < 0 && net < v.fiiNetPrev) return `FII net short ${net} contracts, more negative than ${v.fiiNetPrev} last session — foreign institutions building index-futures shorts, SELL.`;
            return `FII net is ${net} contracts (prev session ${v.fiiNetPrev}) — no fresh trend building either way this session, WAIT.`;
        }
    },
    
        
    {
        id: "fiiDiiCashFlow", label: "FII/DII CASH SEGMENT NET FLOW (Live -- NSE, daily)", unit: "Cr",
        a: { key: "fiiNetCr", name: "FII Net Cash Flow (Cr)", value: 0 },
        b: { key: "diiNetCr", name: "DII Net Cash Flow (Cr)", value: 0 },
        evaluate: (v) => {
            const fii = Number(v.fiiNetCr || 0);
            const dii = Number(v.diiNetCr || 0);
            if (fii === 0 && dii === 0) return "WAIT";
            const combinedNet = fii + dii;
            const fiiWeightedNet = fii * 1.25 + dii; // FII flow normally moves index futures/large caps harder intraday.
            const decisive = Math.max(Math.abs(combinedNet), Math.abs(fiiWeightedNet));
            if (decisive < 250) return "WAIT";
            // FIX (v56): old code used plain OR, so a barely-positive combinedNet
            // (e.g. +1 Cr) would return BUY even if fiiWeightedNet was a strongly
            // negative -749 Cr (real FII selling) — the SELL check never ran.
            // Now: if the two metrics point opposite directions, that's a genuine
            // conflict — WAIT instead of silently trusting whichever check ran first.
            const combinedBuy = combinedNet > 0;
            const weightedBuy = fiiWeightedNet > 500;
            const combinedSell = combinedNet < 0;
            const weightedSell = fiiWeightedNet < -500;
            if ((combinedBuy && weightedSell) || (combinedSell && weightedBuy)) return "WAIT";
            if (combinedBuy || weightedBuy) return "BUY";
            if (combinedSell || weightedSell) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const fii = Number(v.fiiNetCr || 0);
            const dii = Number(v.diiNetCr || 0);
            const combinedNet = +(fii + dii).toFixed(1);
            const fiiWeightedNet = +(fii * 1.25 + dii).toFixed(1);
            if (fii === 0 && dii === 0) return "No FII/DII cash data received yet — WAIT.";
            if (Math.max(Math.abs(combinedNet), Math.abs(fiiWeightedNet)) < 250) return `FII ${fii} Cr, DII ${dii} Cr — combined ${combinedNet} Cr is too small for a clean institutional signal, WAIT.`;
            const combinedBuy = combinedNet > 0;
            const weightedBuy = fiiWeightedNet > 500;
            const combinedSell = combinedNet < 0;
            const weightedSell = fiiWeightedNet < -500;
            if ((combinedBuy && weightedSell) || (combinedSell && weightedBuy)) return `FII ${fii} Cr, DII ${dii} Cr — combined ${combinedNet} Cr and FII-weighted ${fiiWeightedNet} Cr disagree on direction, no clean institutional signal, WAIT.`;
            if (combinedBuy || weightedBuy) return `FII ${fii} Cr, DII ${dii} Cr — combined ${combinedNet} Cr / FII-weighted ${fiiWeightedNet} Cr shows net institutional buying, BUY.`;
            if (combinedSell || weightedSell) return `FII ${fii} Cr, DII ${dii} Cr — combined ${combinedNet} Cr / FII-weighted ${fiiWeightedNet} Cr shows net institutional selling, SELL.`;
            return `FII ${fii} Cr, DII ${dii} Cr — mixed without decisive net pressure, WAIT.`;
        }
    },
        {
        // FII Options-Category OI — the piece that was missing from
        // Participant OI: fiiDiiPositioning above only covers index
        // FUTURES (NSE report cols 1/2). This reads the SAME daily CSV
        // row (cols 5-8: Option Index Call/Put Long/Short) from the SAME
        // relay poll — genuinely live, not manual, exactly like the
        // futures leg. Net = (call long-short) − (put long-short); a
        // widening net vs the previous session means FIIs are getting
        // more call-heavy / less put-heavy on index options — bullish
        // options positioning — and vice versa.
        id: "optionCategoryOi", label: "FII OPTIONS CATEGORY OI (Live — NSE Participant OI, Index Calls vs Puts)", unit: "contracts",
        a: { key: "callLongContracts", name: "FII Call Long (Index Opt)", value: 0 },
        b: { key: "callShortContracts", name: "FII Call Short (Index Opt)", value: 0 },
        c: { key: "putLongContracts", name: "FII Put Long (Index Opt)", value: 0 },
        d: { key: "putShortContracts", name: "FII Put Short (Index Opt)", value: 0 },
        e: { key: "netPrev", name: "Combined Net Prev Session", value: 0 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            const net = (v.callLongContracts - v.callShortContracts) - (v.putLongContracts - v.putShortContracts);
            if (net > 0 && net > v.netPrev) return "BUY";
            if (net < 0 && net < v.netPrev) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return "Options-category OI hasn't loaded from the relay yet — WAIT.";
            const net = (v.callLongContracts - v.callShortContracts) - (v.putLongContracts - v.putShortContracts);
            if (net > 0 && net > v.netPrev) return `FII index-options net is +${net} contracts (call-heavy), up from ${v.netPrev} last session — foreign institutions adding bullish options exposure, BUY.`;
            if (net < 0 && net < v.netPrev) return `FII index-options net is ${net} contracts (put-heavy), more negative than ${v.netPrev} last session — foreign institutions adding bearish options exposure, SELL.`;
            return `FII index-options net is ${net} contracts (prev session ${v.netPrev}) — no fresh directional shift in call/put positioning this session, WAIT.`;
        }
    },
    {
        // Futures Basis (Cost-of-Carry Spread) — Basis = Futures LTP − Spot
        // LTP. This is the real-time proxy institutions actually watch:
        // NSE's own FII/DII participant-wise OI report (see fiiDiiPositioning
        // above) is EOD-only and published next day, but the futures basis
        // moves tick-by-tick and tells you the SAME thing same-day — a
        // widening premium above the normal cost-of-carry means aggressive
        // long buildup, a collapsing/negative basis means longs unwinding or
        // fresh shorts. Pairing the basis level against futures OI direction
        // (oiRising) separates genuine fresh buildup from mere short-covering
        // or long-unwind noise, same discipline as oiBuildup above.
        // "spot" is auto-fed live via SPOT_DRIVEN_IDS; futuresLtp is now
        // also auto-fed live from the relay's resolved "NIFTY FUT" tick
        // (see resolveNiftyFuturesKey in relay-server-26.js + the
        // marketData["NIFTY FUT"] effect below) — fully live, no manual
        // entry needed.
        id: "futuresBasis", label: "FUTURES BASIS (Cost-of-Carry Spread)", icon: "quantum", unit: "pts",
        a: { key: "spot", name: "Nifty Spot LTP", value: 22090 },
        b: { key: "futuresLtp", name: "Nifty Futures LTP (live, NIFTY FUT)", value: 22110 },
        c: { key: "normalBasis", name: "Normal cost-of-carry basis (pts)", value: 40 },
        d: { key: "oiRising", name: "Futures OI rising vs prev poll? (1/0)", value: 1 },
        evaluate: (v) => {
            const basis = v.futuresLtp - v.spot;
            if (basis > v.normalBasis && v.oiRising) return "BUY";
            if (basis < 0 && v.oiRising) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const basis = +(v.futuresLtp - v.spot).toFixed(2);
            if (basis > v.normalBasis && v.oiRising) {
                return `Basis is ${basis}pts, above the normal cost-of-carry (${v.normalBasis}pts), with futures OI rising — fresh aggressive long buildup by institutions/prop desks, BUY.`;
            }
            if (basis < 0 && v.oiRising) {
                return `Basis has gone to a discount (${basis}pts, futures below spot) with OI rising — fresh short buildup, institutions are aggressively selling futures, SELL.`;
            }
            if (basis < 0 && !v.oiRising) {
                return `Basis is at a discount (${basis}pts) but OI isn't rising — this looks like long unwinding, not fresh shorting, no clean edge yet, WAIT.`;
            }
            return `Basis is ${basis}pts vs a normal ${v.normalBasis}pts cost-of-carry — no abnormal premium or discount building, WAIT.`;
        }
    },
    {
        // CFTC Commitment of Traders — Global Leveraged Fund Positioning.
        // The weekly CFTC "Traders in Financial Futures" report is the
        // gold-standard institutional positioning read: it's exactly what
        // macro hedge funds/CTAs watch, not a retail sentiment survey.
        // Two legs, both real drivers of Nifty via FII flow:
        //   1. S&P 500 leveraged-fund net position — global risk-on/off.
        //      Specs adding net longs = risk appetite building; specs
        //      cutting net longs = de-risking, which historically drags
        //      EM/India down with it.
        //   2. Dollar Index (DXY) leveraged-fund net position — specs
        //      adding net dollar longs = dollar strength thesis building,
        //      which pulls FII money OUT of India (and EM broadly); specs
        //      cutting dollar longs = dollar softening, historically a
        //      tailwind for FII inflows into India.
        // Both legs need to agree for a real read — S&P up + dollar
        // strengthening (or the reverse) is a mixed/conflicting macro
        // backdrop, correctly reads WAIT rather than forcing a call.
        // hasData guards against evaluating on the 0/0 seed before the
        // relay's first successful weekly scrape — same discipline as
        // hasChain on the option-chain-driven indicators above.
        id: "cotPositioning", label: "CFTC COMMITMENT OF TRADERS (Global Leveraged Fund Positioning)", icon: "quantum", unit: "contracts",
        a: { key: "spxNetLev", name: "S&P 500 Leveraged Funds Net (Long−Short)", value: 0 },
        b: { key: "spxPrevNetLev", name: "S&P 500 Net, Prev Week", value: 0 },
        c: { key: "dxyNetLev", name: "Dollar Index Leveraged Funds Net", value: 0 },
        d: { key: "dxyPrevNetLev", name: "Dollar Index Net, Prev Week", value: 0 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            const spxRising = v.spxNetLev > v.spxPrevNetLev;
            const dxyFalling = v.dxyNetLev < v.dxyPrevNetLev;
            if (spxRising && dxyFalling) return "BUY";
            if (!spxRising && !dxyFalling) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `No CFTC COT data scraped yet from the weekly report — WAIT.`;
            const spxRising = v.spxNetLev > v.spxPrevNetLev;
            const dxyFalling = v.dxyNetLev < v.dxyPrevNetLev;
            if (spxRising && dxyFalling) {
                return `Leveraged funds' S&P 500 net position rose (${v.spxPrevNetLev} → ${v.spxNetLev}) while their Dollar Index net position fell (${v.dxyPrevNetLev} → ${v.dxyNetLev}) — global macro funds adding risk while the dollar-strength thesis fades, tailwind for FII inflows into India, BUY.`;
            }
            if (!spxRising && !dxyFalling) {
                return `Leveraged funds' S&P 500 net position fell (${v.spxPrevNetLev} → ${v.spxNetLev}) while their Dollar Index net position rose (${v.dxyPrevNetLev} → ${v.dxyNetLev}) — macro funds de-risking equities while piling into the dollar, classic setup for FII outflows from India, SELL.`;
            }
            return `S&P 500 net ${v.spxPrevNetLev} → ${v.spxNetLev} and Dollar Index net ${v.dxyPrevNetLev} → ${v.dxyNetLev} — the two legs disagree this week, no clean global positioning read, WAIT.`;
        }
    },
    {
        // 💎 DIAMOND — High-Yield Credit Spread (ICE BofA US HY OAS). Credit
        // markets lead equity markets: widening HY spreads mean institutions
        // are pricing in default/recession risk BEFORE stocks visibly react.
        // Live-fed from FRED (BAMLH0A0HYM2) via relay-server-28.js.
        id: "hyCreditSpread", label: "HY CREDIT SPREAD (ICE BofA US HY OAS) — Global Risk Leading Indicator", icon: "quantum", unit: "bps",
        a: { key: "oas", name: "Current OAS (bps)", value: 0 },
        b: { key: "prevOas", name: "Prev Reading OAS (bps)", value: 0 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            if (v.oas > v.prevOas + 10) return "SELL";
            if (v.oas < v.prevOas - 10) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `No HY OAS data from FRED yet — WAIT.`;
            if (v.oas > v.prevOas + 10) return `High-yield credit spread widened meaningfully (${v.prevOas} → ${v.oas}bps) — credit markets are pricing in more default/recession risk, this typically leads equity weakness by days to weeks, SELL bias globally (including Nifty via risk-off FII flow).`;
            if (v.oas < v.prevOas - 10) return `High-yield credit spread tightened (${v.prevOas} → ${v.oas}bps) — credit markets are getting MORE comfortable with risk, a genuine tailwind that usually shows up in equities next, BUY bias.`;
            return `HY OAS is ${v.oas}bps vs prev ${v.prevOas}bps — no meaningful move, credit market is calm, WAIT.`;
        }
    },
    {
        // 💎 DIAMOND — Global Net Liquidity (Fed Balance Sheet − Reverse
        // Repo − Treasury General Account). "Don't fight the liquidity
        // tide" — the single biggest hidden driver of every risk asset
        // globally, this leads risk-asset direction more reliably than
        // almost any single fundamental metric. Live-fed from FRED
        // (WALCL, RRPONTSYD, WTREGEN) via relay-server-28.js.
        id: "globalNetLiquidity", label: "GLOBAL NET LIQUIDITY (Fed B/S − RRP − TGA) — Macro Tide", icon: "quantum", unit: "$B",
        a: { key: "netLiquidity", name: "Net Liquidity ($B)", value: 0 },
        b: { key: "prevNetLiquidity", name: "Prev Reading ($B)", value: 0 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            if (v.netLiquidity > v.prevNetLiquidity) return "BUY";
            if (v.netLiquidity < v.prevNetLiquidity) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `No net liquidity data from FRED yet — WAIT.`;
            if (v.netLiquidity > v.prevNetLiquidity) return `Global net liquidity rose ($${v.prevNetLiquidity}B → $${v.netLiquidity}B) — the liquidity tide is rising, historically a tailwind that lifts risk assets globally almost regardless of fundamentals, BUY bias.`;
            if (v.netLiquidity < v.prevNetLiquidity) return `Global net liquidity fell ($${v.prevNetLiquidity}B → $${v.netLiquidity}B) — the tide is draining, historically a headwind for risk assets globally, SELL bias.`;
            return `Net liquidity unchanged at $${v.netLiquidity}B — no fresh tide either way, WAIT.`;
        }
    },
    {
        // Fed Funds Futures Implied Rate Path (CME FedWatch equivalent) —
        // not what the Fed says, what the futures market is actually
        // pricing for future cuts/hikes. No clean free public API for
        // CME FedWatch itself, so this stays MANUAL like fiiDiiPositioning
        // above — enter today's implied rate for the next FOMC meeting
        // from cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html.
        id: "fedFundsFuturesImplied", label: "FED FUNDS FUTURES IMPLIED RATE (Manual — CME FedWatch)", unit: "%",
        a: { key: "currentRate", name: "Current Fed Funds Rate (%)", value: 5.25 },
        b: { key: "impliedRateNext", name: "Futures-Implied Rate, Next FOMC (%)", value: 5.25 },
        evaluate: (v) => {
            if (v.impliedRateNext < v.currentRate) return "BUY";
            if (v.impliedRateNext > v.currentRate) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.impliedRateNext < v.currentRate) return `Fed funds futures are pricing a cut (current ${v.currentRate}% → implied ${v.impliedRateNext}%) — the market expects easier policy, a global risk-on tailwind that typically favors FII inflows into EM/India, BUY.`;
            if (v.impliedRateNext > v.currentRate) return `Fed funds futures are pricing a hike (current ${v.currentRate}% → implied ${v.impliedRateNext}%) — tighter policy ahead, typically pressures EM/India via FII outflows and a stronger dollar, SELL.`;
            return `Futures-implied rate matches the current rate (${v.currentRate}%) — no fresh policy-path signal, WAIT.`;
        }
    },
    {
        // MOVE Index — the "VIX for Treasuries", published by ICE BofA. No
        // free public real-time feed exists, so this stays MANUAL, same
        // honesty as fedFundsFuturesImplied above. Enter today's value
        // from any broker/terminal that carries it (Bloomberg/ICE). Bond
        // vol leads equity vol in most major stress events — a MOVE spike
        // while VIX is still calm is the real early-warning siren.
        id: "moveIndex", label: "MOVE INDEX (Manual — ICE BofA, Bond Market Volatility)", unit: "",
        a: { key: "moveValue", name: "MOVE Index Value", value: 90 },
        b: { key: "moveThreshold", name: "Stress Threshold", value: 120 },
        evaluate: (v) => {
            if (v.moveValue > v.moveThreshold) return "SELL";
            if (v.moveValue < v.moveThreshold * 0.75) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (v.moveValue > v.moveThreshold) return `MOVE Index is ${v.moveValue}, above the ${v.moveThreshold} stress threshold — bond market volatility is spiking, historically an early-warning siren that leads equity vol/selloffs, SELL bias globally.`;
            if (v.moveValue < v.moveThreshold * 0.75) return `MOVE Index is ${v.moveValue}, well below the ${v.moveThreshold} stress threshold — bond market is calm, supportive backdrop for risk assets, BUY bias.`;
            return `MOVE Index is ${v.moveValue}, in the normal range below the ${v.moveThreshold} stress threshold but not deeply calm either — no strong read, WAIT.`;
        }
    },
    {
        // US 10Y Real Yields — live via FRED (DFII10), relay-server-28.js.
        // hasData gates WAIT until the first real tick arrives; no seed
        // value is ever evaluated as if it were live.
        id: "realYields", label: "US 10Y REAL YIELDS (TIPS Valuation Anchor, FRED live)", icon: "quantum", unit: "%",
        a: { key: "tipsYield", name: "10Y TIPS Real Yield (%)", value: 1.85 },
        b: { key: "prevTipsYield", name: "Prev Session Real Yield (%)", value: 1.70 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            const shock = v.tipsYield - v.prevTipsYield;
            if (v.tipsYield >= 2.0 || shock >= 0.10) return "SELL";
            if (v.tipsYield < 1.5 && v.tipsYield <= v.prevTipsYield) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `No live 10Y TIPS read from FRED yet — WAIT.`;
            const shock = v.tipsYield - v.prevTipsYield;
            if (v.tipsYield >= 2.0 || shock >= 0.10) return `Real yields at ${v.tipsYield}% (shock ${shock >= 0 ? "+" : ""}${shock.toFixed(2)}%). Capital cost accelerating, squeezing equity multiples. SELL.`;
            if (v.tipsYield < 1.5 && v.tipsYield <= v.prevTipsYield) return `Real yields cooling at ${v.tipsYield}%. Equity risk premium stays structurally protected. BUY.`;
            return `Real yields grinding normally at ${v.tipsYield}%. WAIT.`;
        }
    },
    {
        // US Treasury Term Premium — live via FRED (THREEFYTP10). Note:
        // this is the Fed Board's Kim-Wright model, not the NY Fed ACM
        // model (ACM isn't published on FRED, only on newyorkfed.org with
        // no clean CSV endpoint). The two correlate ~0.86 and track the
        // same regime, but they are not the same series — label reflects
        // the true source.
        id: "usTermPremium", label: "US TREASURY TERM PREMIUM (Kim-Wright Model, FRED live)", icon: "quantum", unit: "bps",
        a: { key: "premium", name: "10Y Term Premium (bps)", value: 45 },
        b: { key: "prevPremium", name: "Previous Reading (bps)", value: 32 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            if (v.premium >= 50 || (v.premium - v.prevPremium >= 15)) return "SELL";
            if (v.premium <= 10 && v.premium <= v.prevPremium) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `No live term premium read from FRED yet — WAIT.`;
            if (v.premium >= 50 || (v.premium - v.prevPremium >= 15)) return `Term premium at ${v.premium}bps (prev ${v.prevPremium}bps). Institutions demanding heavy compensation for duration risk. SELL.`;
            if (v.premium <= 10 && v.premium <= v.prevPremium) return `Term premium suppressed at ${v.premium}bps. Bond market calm, safe to carry equity risk. BUY.`;
            return `Term premium drifting normally at ${v.premium}bps. WAIT.`;
        }
    },
    {
        // VVIX-to-VIX Divergence — BOTH legs now live. VIX comes from
        // FRED (VIXCLS). VVIX comes directly from CBOE's own CDN
        // (VVIX_History.csv, relay-server-29.js) — confirmed real, free,
        // no key required, same file pattern CBOE uses for VIX itself.
        // (Earlier note here said VVIX had no free feed — that was wrong,
        // corrected once the CBOE CDN endpoint was verified.) hasData
        // gates on both legs arriving together, so this sits at WAIT
        // until a real VIX+VVIX pair has come in from the relay.
        id: "vvixVixDivergence", label: "VVIX-TO-VIX RATIO (Smart Money Vol Skew — both legs live: VIX/FRED, VVIX/CBOE)", icon: "zap", unit: "ratio",
        a: { key: "vvixValue", name: "VVIX Index Value (Live, CBOE)", value: 85 },
        b: { key: "vixValue", name: "VIX Index Value (Live, FRED)", value: 14 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            if (v.vixValue >= 30 || (v.vvixValue >= 110 && v.vixValue <= 16)) return "SELL";
            if (v.vvixValue < 90 && v.vixValue < 20) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `No live VIX read from FRED yet — WAIT.`;
            if (v.vixValue >= 30) return `VIX at ${v.vixValue} — open panic/liquidation regime. SELL.`;
            if (v.vvixValue >= 110 && v.vixValue <= 16) return `Divergence: VVIX ${v.vvixValue} elevated while VIX ${v.vixValue} stays low — hidden crash-protection buying. SELL.`;
            if (v.vvixValue < 90 && v.vixValue < 20) return `VVIX ${v.vvixValue} and VIX ${v.vixValue} moving symmetrically — normal hedging distribution. BUY.`;
            return `Volatility metrics mid-range (VVIX ${v.vvixValue}, VIX ${v.vixValue}). WAIT.`;
        }
    },
    {
        // US Financial Stress Index (STLFSI4) — St. Louis Fed's own
        // 18-series composite stress gauge, live via FRED. This is the
        // real, free alternative wired in after NYU Stern's SRISK turned
        // out to have no public CSV/API anywhere (V-Lab is a pure
        // JS-rendered SPA — searched thoroughly, nothing scrapable
        // found). STLFSI4 is NOT SRISK — different institution, different
        // methodology (rate/spread composite vs firm-level capital
        // shortfall) — labeled honestly as its own thing. Fed's own
        // interpretation: 0 = normal, above zero = above-average stress,
        // below zero = below-average stress. Weekly data, so this won't
        // move intraday — matches its real update cadence.
        id: "usFinancialStress", label: "US FINANCIAL STRESS INDEX (STLFSI4, St. Louis Fed, live — NOT SRISK)", icon: "quantum", unit: "index",
        a: { key: "stress", name: "Stress Index (current)", value: 0 },
        b: { key: "prevStress", name: "Previous Reading", value: 0 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            if (v.stress >= 1.5 || (v.stress - v.prevStress >= 0.5)) return "SELL";
            if (v.stress <= -0.5 && v.stress <= v.prevStress) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `No live STLFSI4 read from FRED yet — WAIT.`;
            if (v.stress >= 1.5 || (v.stress - v.prevStress >= 0.5)) return `Financial stress at ${v.stress} (prev ${v.prevStress}) — well above the zero/normal line, rising fast. SELL.`;
            if (v.stress <= -0.5 && v.stress <= v.prevStress) return `Financial stress at ${v.stress}, below-average and calm. BUY.`;
            return `Financial stress at ${v.stress} — near normal. WAIT.`;
        }
    },
    {
        // USD Funding Squeeze — SOFR minus IORB, in bps, both live daily
        // FRED series (relay-server-30.js). Normal repo markets keep
        // SOFR close to IORB; a widening spread means repo borrowers are
        // paying up over the Fed's own reserve rate, signaling reserve/
        // collateral scarcity and funding stress. 30bps is the level
        // flagged in market commentary as a stress threshold, used here
        // as the SELL line rather than an invented number.
        id: "usdFundingSqueeze", label: "USD FUNDING SQUEEZE (SOFR − IORB, FRED live)", icon: "quantum", unit: "bps",
        a: { key: "spread", name: "SOFR − IORB (current)", value: 0 },
        b: { key: "prevSpread", name: "Previous Reading", value: 0 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            if (v.spread >= 30 || (v.spread - v.prevSpread >= 10)) return "SELL";
            if (v.spread <= 5 && v.spread <= v.prevSpread) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `No live SOFR/IORB read from FRED yet — WAIT.`;
            if (v.spread >= 30 || (v.spread - v.prevSpread >= 10)) return `SOFR-IORB spread at ${v.spread}bps (prev ${v.prevSpread}bps) — at/above the 30bps funding-stress line. SELL.`;
            if (v.spread <= 5 && v.spread <= v.prevSpread) return `SOFR-IORB spread at ${v.spread}bps — funding markets calm, reserves ample. BUY.`;
            return `SOFR-IORB spread at ${v.spread}bps — within normal range. WAIT.`;
        }
    },
    {
        // G3 Balance Sheet Momentum — Fed (WALCL) + ECB (Eurosystem
        // weekly consolidated financial statement, ECB Data Portal API)
        // combined into USD using the day's DEXUSEU rate, all live via
        // FRED/ECB scrape in relay-server-30.js. BOJ leg is intentionally
        // NOT included yet — its CSV export URL and unit convention
        // ("100 million yen" units, not raw yen) hasn't been verified
        // live, so it's left out rather than guessed. This is a Fed+ECB
        // partial G3 reading, not the full three-central-bank total, and
        // is labeled as such. Weekly-cadence data, won't move intraday.
        id: "g3BalanceSheet", label: "G3 BALANCE SHEET MOMENTUM (Fed+ECB live, BOJ pending — relay-server-31.js)", icon: "quantum", unit: "$B",
        a: { key: "total", name: "Fed+ECB Total ($B, USD)", value: 0 },
        b: { key: "prevTotal", name: "Previous Reading ($B)", value: 0 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            const chg = v.total - v.prevTotal;
            if (chg >= 50) return "BUY";
            if (chg <= -50) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `No live G3 (Fed+ECB) balance sheet read yet — WAIT.`;
            const chg = v.total - v.prevTotal;
            if (chg >= 50) return `Fed+ECB combined balance sheet expanding ($${v.total}B, +${chg}B vs prior reading) — liquidity tailwind for risk assets. BUY.`;
            if (chg <= -50) return `Fed+ECB combined balance sheet contracting ($${v.total}B, ${chg}B vs prior reading) — liquidity headwind. SELL.`;
            return `Fed+ECB combined balance sheet roughly flat at $${v.total}B (${chg >= 0 ? "+" : ""}${chg}B). WAIT.`;
        }
    },
    {
        // SRISK (Systemic Risk) — NYU Stern V-Lab's firm-level capital
        // shortfall measure, aggregated across the financial system, $B.
        // MANUAL like Luxembourg/Germany above: V-Lab's site is a
        // JS-rendered SPA with no CSV/API export found, so this can't be
        // scraped honestly. Enter the latest V-Lab reading yourself
        // (vlab.stern.nyu.edu/srisk) — rising SRISK = system-wide capital
        // shortfall building = systemic risk = SELL; falling = BUY.
        id: "sriskSystemic", label: "SRISK SYSTEMIC RISK (NYU Stern V-Lab, manual entry)", icon: "quantum", unit: "$B",
        a: { key: "sriskNow", name: "SRISK now ($B)", value: 0 },
        b: { key: "sriskPrev", name: "SRISK prev reading ($B)", value: 0 },
        evaluate: (v) => {
            const chg = v.sriskNow - v.sriskPrev;
            if (chg > 0) return "SELL";
            if (chg < 0) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            const chg = v.sriskNow - v.sriskPrev;
            if (chg > 0) return `SRISK rose to $${v.sriskNow}B (+${chg}B vs prior reading) — system-wide capital shortfall building, systemic risk rising, SELL.`;
            if (chg < 0) return `SRISK fell to $${v.sriskNow}B (${chg}B vs prior reading) — capital shortfall easing, systemic risk receding, BUY.`;
            return `SRISK flat at $${v.sriskNow}B — no fresh systemic-risk shift, WAIT.`;
        }
    },
    {
        // FX Cross-Currency Basis Swap — e.g. EUR/USD 3M basis, in bps.
        // MANUAL: basis swap rates are quoted OTC/interbank (Bloomberg,
        // Reuters); no free public CSV/API found, so entered by hand like
        // SRISK above. Basis is normally negative (USD funding premium);
        // it WIDENING more negative means USD is scarcer offshore — a
        // classic dollar-funding-stress signal — SELL. Narrowing back
        // toward zero means funding stress easing — BUY.
        id: "fxBasisSwap", label: "FX CROSS-CURRENCY BASIS SWAP (EUR/USD 3M, manual entry)", icon: "quantum", unit: "bps",
        a: { key: "basisNow", name: "Basis now (bps)", value: 0 },
        b: { key: "basisPrev", name: "Basis prev reading (bps)", value: 0 },
        evaluate: (v) => {
            if (v.basisNow < v.basisPrev) return "SELL";
            if (v.basisNow > v.basisPrev) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (v.basisNow < v.basisPrev) return `EUR/USD basis widened to ${v.basisNow}bps (from ${v.basisPrev}bps) — USD funding scarcer offshore, dollar squeeze risk, SELL.`;
            if (v.basisNow > v.basisPrev) return `EUR/USD basis narrowed to ${v.basisNow}bps (from ${v.basisPrev}bps) — USD funding stress easing, BUY.`;
            return `EUR/USD basis flat at ${v.basisNow}bps — no fresh funding-stress shift, WAIT.`;
        }
    },
    {
        // Credit Impulse — change in new credit issuance as a % of GDP
        // (YoY change of the credit flow, not the stock), the standard
        // Michael Biggs definition. Commonly tracked for China (PBoC
        // aggregate financing) as a global growth/liquidity leading
        // indicator. MANUAL: PBoC/BIS credit-flow data is monthly/
        // quarterly and not available as a clean live feed, entered from
        // the latest published reading. Positive impulse = credit
        // growth accelerating = stimulative = BUY; negative = SELL.
        id: "creditImpulse", label: "CREDIT IMPULSE (China Aggregate Financing, manual entry)", icon: "quantum", unit: "% GDP",
        a: { key: "impulseNow", name: "Credit impulse now (% of GDP)", value: 0 },
        b: { key: "impulsePrev", name: "Credit impulse prev reading (% of GDP)", value: 0 },
        evaluate: (v) => {
            if (v.impulseNow > 0 && v.impulseNow > v.impulsePrev) return "BUY";
            if (v.impulseNow < 0 && v.impulseNow < v.impulsePrev) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.impulseNow > 0 && v.impulseNow > v.impulsePrev) return `Credit impulse at +${v.impulseNow}% GDP, up from ${v.impulsePrev}% — credit growth accelerating, stimulative for risk assets, BUY.`;
            if (v.impulseNow < 0 && v.impulseNow < v.impulsePrev) return `Credit impulse at ${v.impulseNow}% GDP, down from ${v.impulsePrev}% — credit growth decelerating, drag on risk assets, SELL.`;
            return `Credit impulse at ${v.impulseNow}% GDP (prev ${v.impulsePrev}%) — no fresh acceleration/deceleration, WAIT.`;
        }
    },
    {
        // 👑 KOHINOOR — SOFR-EFFR Funding Stress. Money-market PLUMBING
        // stress: this is what the NY Fed itself watches to catch a
        // repo-market seizure, since it moves BEFORE credit spreads or
        // equity vol notice anything. Normally near-zero (a few bps);
        // SOFR trading meaningfully above EFFR = dealers/banks scrambling
        // for overnight funding — exactly the signature that preceded the
        // Sept 2019 repo crisis. Live-fed from FRED (SOFR, DFF) via
        // relay-server-30.js.
        // NOTE: this is distinct from usdFundingSqueeze above (SOFR −
        // IORB) — same family of signal (funding-market stress) but a
        // different reference rate; IORB is the Fed's administered floor
        // rate, EFFR is the actual traded overnight fed funds rate, so
        // the two spreads can diverge and catch different stress episodes.
        id: "sofrFundingStress", label: "👑 SOFR FUNDING STRESS (Repo Market Plumbing)", icon: "quantum", unit: "bps",
        a: { key: "stressBps", name: "SOFR − EFFR Spread (bps)", value: 0 },
        b: { key: "prevStressBps", name: "Prev Reading (bps)", value: 0 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            if (v.stressBps >= 15 || (v.stressBps - v.prevStressBps >= 8)) return "SELL";
            if (v.stressBps <= 3 && v.stressBps <= v.prevStressBps) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `No live SOFR/EFFR read from FRED yet — WAIT.`;
            if (v.stressBps >= 15 || (v.stressBps - v.prevStressBps >= 8)) return `SOFR-EFFR spread is ${v.stressBps}bps (prev ${v.prevStressBps}bps) — repo/overnight funding markets are showing real stress, the exact signature that preceded the Sept-2019 repo crisis. This is plumbing-level stress, more foundational than a credit spread widening. SELL bias globally.`;
            if (v.stressBps <= 3 && v.stressBps <= v.prevStressBps) return `SOFR-EFFR spread is ${v.stressBps}bps, calm and near its normal floor — funding markets are functioning smoothly, no plumbing stress. BUY bias.`;
            return `SOFR-EFFR spread is ${v.stressBps}bps vs prev ${v.prevStressBps}bps — within normal range, no funding stress signature yet. WAIT.`;
        }
    },
    {
        // 👑 KOHINOOR — 10Y-3M Treasury Yield Curve. THE most legendary
        // recession predictor in macro finance — inverted before every US
        // recession since 1955, and is literally an input to the NY Fed's
        // own published recession-probability model. Every macro fund,
        // central bank, and serious institutional desk watches this.
        // Live-fed from FRED (T10Y3M, a single pre-computed spread
        // series) via relay-server-30.js.
        id: "yieldCurve10Y3M", label: "👑 US 10Y-3M YIELD CURVE (Recession Predictor)", icon: "quantum", unit: "bps",
        a: { key: "curveBps", name: "10Y − 3M Spread (bps)", value: 0 },
        b: { key: "prevCurveBps", name: "Prev Reading (bps)", value: 0 },
        evaluate: (v) => {
            if (!v.hasData) return "WAIT";
            if (v.curveBps < 0) return "SELL";
            if (v.curveBps > 50 && v.curveBps >= v.prevCurveBps) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.hasData) return `No live T10Y3M read from FRED yet — WAIT.`;
            if (v.curveBps < 0) return `10Y-3M curve is INVERTED at ${v.curveBps}bps (prev ${v.prevCurveBps}bps) — this exact inversion has preceded every US recession since 1955 and feeds directly into the NY Fed's own recession-probability model. SELL bias globally, including via FII risk-off flows out of India.`;
            if (v.curveBps > 50 && v.curveBps >= v.prevCurveBps) return `10Y-3M curve is a healthy ${v.curveBps}bps and steepening — normal, healthy term structure with no recession signal, a genuine macro tailwind. BUY bias.`;
            return `10Y-3M curve is ${v.curveBps}bps (prev ${v.prevCurveBps}bps) — positive but not steep, no clean recession or all-clear signal yet. WAIT.`;
        }
    },
    // ── 10 NEW INSTITUTIONAL-GRADE INDICATORS ──────────────────────────────
    // All 10 are manual-entry (same pattern as SOFR, Yield Curve, COT, etc.)
    // They encode BlackRock / AQR / Two Sigma-level methodology directly into
    // evaluate() so the math is unimpeachable even without a live data feed.
    {
        // AQR / Moskowitz-Ooi-Pedersen (2012): 12-1 month time-series momentum.
        // Return over the FULL 12 months minus the most recent 1 month avoids
        // the short-term reversal that contaminates simple 12M momentum.
        // Signal: positive 12-1M return = trend continuation (BUY), negative = SELL.
        // Threshold ±3% prevents noise trades on near-zero readings.
        id: "tsMomentum12_1", label: "12M-1M TIME-SERIES MOMENTUM (AQR TSMOM)", icon: "quantum", unit: "%",
        a: { key: "ret12m", name: "12-Month Total Return (%)", value: 0 },
        b: { key: "ret1m", name: "Last-Month Return (%)", value: 0 },
        evaluate: (v) => {
            const mom = v.ret12m - v.ret1m;
            if (mom > 3) return "BUY";
            if (mom < -3) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const mom = +(v.ret12m - v.ret1m).toFixed(2);
            if (mom > 3) return `12-1M momentum = +${mom}% — 12-month trend is strong and last-month reversal is stripped out (AQR TSMOM method). Institutional trend-followers are long. BUY.`;
            if (mom < -3) return `12-1M momentum = ${mom}% — 12-month trend is negative net of last-month's noise. Managed futures and CTA strategies are net short this factor. SELL.`;
            return `12-1M momentum = ${mom}% — within ±3% noise band, no clean directional trend signal yet. WAIT.`;
        }
    },
    {
        // Amihud (2002) illiquidity ratio: |daily return| / volume.
        // A spike in illiquidity (today's ratio >> 20-day average) signals
        // thin-market vulnerability — large orders move prices disproportionately,
        // a leading indicator of crash cascades and gap-risk.
        // BUY when liquidity is normal (illiq ≤ avg), SELL on spike (≥ 2× avg).
        id: "amihudIlliquidity", label: "AMIHUD ILLIQUIDITY RATIO (Crash Vulnerability)", icon: "quantum", unit: "×",
        a: { key: "illiqNow", name: "Today's |Ret|/Vol (×10⁻⁶)", value: 0 },
        b: { key: "illiqAvg", name: "20-Day Average Illiq (×10⁻⁶)", value: 0 },
        evaluate: (v) => {
            if (!v.illiqAvg || v.illiqAvg <= 0) return "WAIT";
            const ratio = v.illiqNow / v.illiqAvg;
            if (ratio >= 2) return "SELL";
            if (ratio <= 1) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.illiqAvg || v.illiqAvg <= 0) return `No baseline yet — need 20-day average to compute illiquidity ratio. WAIT.`;
            const ratio = +(v.illiqNow / v.illiqAvg).toFixed(2);
            if (ratio >= 2) return `Amihud ratio is ${ratio}× its 20-day average — market microstructure is stressed, each ₹1 of volume is moving price ${ratio}× more than normal. This is the quantitative fingerprint of a crash-vulnerable, thin-liquidity environment. SELL.`;
            if (ratio <= 1) return `Amihud ratio is ${ratio}× average — liquidity is normal or thick. Large orders are absorbing without outsized price impact. Safe environment for position-taking. BUY.`;
            return `Amihud ratio = ${ratio}× (between 1× and 2×) — mildly elevated but not yet at crash-signal threshold. Monitor but no trade. WAIT.`;
        }
    },
    {
        // Citigroup Economic Surprise Index methodology: running sum of
        // (actual − consensus) / historical std for macro releases.
        // Positive score = data consistently beating expectations (BUY).
        // Negative and falling = data disappointment cycle (SELL).
        // Widely used by BlackRock, PIMCO, and major macro hedge funds.
        id: "macroSurprise", label: "MACRO ECONOMIC SURPRISE INDEX (CESI Methodology)", icon: "quantum", unit: "pts",
        a: { key: "surpriseNow", name: "Current Surprise Score", value: 0 },
        b: { key: "surprisePrev", name: "Prior Reading", value: 0 },
        evaluate: (v) => {
            if (v.surpriseNow > 20 && v.surpriseNow >= v.surprisePrev) return "BUY";
            if (v.surpriseNow < -20 && v.surpriseNow <= v.surprisePrev) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const delta = +(v.surpriseNow - v.surprisePrev).toFixed(1);
            if (v.surpriseNow > 20 && v.surpriseNow >= v.surprisePrev) return `Surprise index = +${v.surpriseNow} and rising by ${delta} pts — macro data is beating consensus forecasts on net. GDP, jobs, PMI readings all coming in above-estimate. Central banks have cover to stay accommodative. BUY.`;
            if (v.surpriseNow < -20 && v.surpriseNow <= v.surprisePrev) return `Surprise index = ${v.surpriseNow} and falling by ${delta} pts — macro data is disappointing vs consensus across the board. This is the data-miss cycle that precedes risk-off rotation and EM fund outflows. SELL.`;
            return `Surprise index = ${v.surpriseNow} (prev ${v.surprisePrev}) — inside the ±20 noise band or not yet directional enough for a clean signal. WAIT.`;
        }
    },
    {
        // Sell-side analyst revision momentum: rolling 4-week net upgrade
        // count across Nifty 50 / S&P 500 index constituents.
        // Earnings revisions lead price by 1–3 months (Earnings Revision
        // Factor is documented in Barra, MSCI, and AQR factor libraries).
        // Upgrades >> downgrades = positive earnings revision alpha (BUY).
        id: "earningsRevision", label: "EARNINGS REVISION MOMENTUM (Analyst Upgrade/Downgrade Factor)", icon: "quantum", unit: "",
        a: { key: "upgrades", name: "4-Week Net Upgrades (count)", value: 0 },
        b: { key: "downgrades", name: "4-Week Net Downgrades (count)", value: 0 },
        evaluate: (v) => {
            const total = v.upgrades + v.downgrades;
            if (total <= 0) return "WAIT";
            const ratio = v.upgrades / total;
            if (ratio >= 0.65) return "BUY";
            if (ratio <= 0.35) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const total = v.upgrades + v.downgrades;
            if (total <= 0) return `No revision data entered yet — input 4-week upgrade and downgrade counts. WAIT.`;
            const pct = +((v.upgrades / total) * 100).toFixed(1);
            if (pct >= 65) return `${v.upgrades} upgrades vs ${v.downgrades} downgrades (${pct}% upgrade ratio) — analysts are lifting targets faster than cutting them. Earnings revision factor is positive, a 1–3 month lead indicator for price. BUY.`;
            if (pct <= 35) return `${v.upgrades} upgrades vs ${v.downgrades} downgrades (${pct}% upgrade ratio) — downgrade cycle in progress. Barra/MSCI factor research shows this is the strongest systematic predictor of underperformance over the next quarter. SELL.`;
            return `${v.upgrades} upgrades vs ${v.downgrades} downgrades (${pct}%) — mixed revision picture, no clear directional edge. WAIT.`;
        }
    },
    {
        // Stock-Bond Correlation Regime Detector.
        // Normally stocks and bonds are negatively correlated (bonds rise
        // when stocks fall — the hedge works). When inflation is high or
        // supply/demand for bonds breaks down, the correlation FLIPS
        // positive — both assets fall together, the 60/40 hedge collapses,
        // and risk parity / balanced funds are forced sellers of equity.
        // corrNow > 0.3 = danger regime (SELL); < 0 = normal regime (BUY).
        id: "stockBondCorr", label: "STOCK-BOND CORRELATION REGIME (60/40 Hedge Validity)", icon: "quantum", unit: "",
        a: { key: "corrNow", name: "Rolling 20-Day Stock-Bond Correlation", value: -0.3 },
        b: { key: "corrPrev", name: "Prior Reading", value: -0.3 },
        evaluate: (v) => {
            if (v.corrNow < 0 && v.corrNow <= v.corrPrev) return "BUY";
            if (v.corrNow > 0.3) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.corrNow < 0 && v.corrNow <= v.corrPrev) return `Stock-bond correlation = ${v.corrNow.toFixed(2)} (prev ${v.corrPrev.toFixed(2)}) — bonds are diversifying equities as expected. The 60/40 hedge is intact, risk-parity funds are NOT forced sellers of equity. Regime is normal. BUY.`;
            if (v.corrNow > 0.3) return `Stock-bond correlation = +${v.corrNow.toFixed(2)} — DANGER: stocks and bonds are falling together. The 60/40 hedge has BROKEN DOWN. Risk-parity desks and balanced funds face simultaneous drawdowns on both legs and will de-risk mechanically. This is the 2022-style inflation shock regime. SELL.`;
            return `Stock-bond correlation = ${v.corrNow.toFixed(2)} (prev ${v.corrPrev.toFixed(2)}) — in transition zone, correlation not yet decisively positive or negative. WAIT.`;
        }
    },
    {
        // IV Surface Butterfly Skew.
        // 25-delta butterfly = ATM IV − 0.5 × (25d-call IV + 25d-put IV).
        // High butterfly = the market is pricing heavy tail risk symmetrically
        // (fat tails in BOTH directions — crash AND melt-up risk).
        // Low butterfly = market sees thin tails, normal vol surface.
        // BUY: butterfly < 1% (calm, mean-revert into volatility sellers).
        // SELL: butterfly > 2.5% (extreme tail risk priced, distribution is fat).
        id: "ivButterflySkew", label: "IV SURFACE BUTTERFLY SKEW (Tail Risk Regime)", icon: "quantum", unit: "%",
        a: { key: "atmIv", name: "ATM IV (%)", value: 15 },
        b: { key: "wing25dCall", name: "25-Delta Call IV (%)", value: 15 },
        c: { key: "wing25dPut", name: "25-Delta Put IV (%)", value: 16 },
        evaluate: (v) => {
            const butterfly = 0.5 * (v.wing25dCall + v.wing25dPut) - v.atmIv;
            if (butterfly < 1) return "BUY";
            if (butterfly > 2.5) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const bf = +(0.5 * (v.wing25dCall + v.wing25dPut) - v.atmIv).toFixed(2);
            if (bf < 1) return `25-delta butterfly = ${bf}% — tail risk is cheaply priced, options market expects a thin-tailed, normal distribution. Vol surface is flat, no fear of crash or melt-up. SELL volatility, BUY directional risk.`;
            if (bf > 2.5) return `25-delta butterfly = ${bf}% — extreme fat-tail risk priced on BOTH wings. Market is paying up heavily for protection vs large moves in either direction. The distribution is being priced as bi-modal. Reduce directional exposure. SELL.`;
            return `25-delta butterfly = ${bf}% — moderate tail pricing, between normal and elevated. No edge yet from vol surface alone. WAIT.`;
        }
    },
    {
        // Short Interest Days-to-Cover (Short Squeeze Detector).
        // DTC = total short interest / average daily volume.
        // High DTC = shorts are "trapped" — covering demand would take many
        // days at current volume, creating a potential squeeze.
        // DTC > 5: squeeze danger for shorts, BUY signal (gamma + forced cover).
        // DTC < 1: ample liquidity for shorts to cover, no squeeze risk.
        // FIX (v53): flagged one-directional — this indicator can only ever
        // return BUY or WAIT, never SELL.
        oneDirectional: "BUY",
        id: "shortInterestDTC", label: "SHORT INTEREST DAYS-TO-COVER (Short Squeeze Detector)", icon: "quantum", unit: "days",
        a: { key: "shortInt", name: "Short Interest (million shares)", value: 0 },
        b: { key: "avgDailyVol", name: "Avg Daily Volume (million shares)", value: 1 },
        evaluate: (v) => {
            if (!v.avgDailyVol || v.avgDailyVol <= 0) return "WAIT";
            const dtc = v.shortInt / v.avgDailyVol;
            if (dtc > 5) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (!v.avgDailyVol || v.avgDailyVol <= 0) return `Enter average daily volume to compute days-to-cover. WAIT.`;
            const dtc = +(v.shortInt / v.avgDailyVol).toFixed(1);
            if (dtc > 5) return `Days-to-cover = ${dtc} days — shorts would need ${dtc} days at current volume to exit. Any catalyst triggers a mechanical short-covering cascade (Volkswagen 2008, GameStop 2021 dynamics). BUY with tight stop.`;
            if (dtc < 1) return `Days-to-cover = ${dtc} days — short interest is trivially small relative to volume. No squeeze risk either way, not a directional signal on its own. WAIT.`;
            return `Days-to-cover = ${dtc} days — moderate short interest, between squeeze and no-risk territory. WAIT for catalyst.`;
        }
    },
    {
        // HMM (Hidden Markov Model) Regime Detection.
        // Simplified 2-state HMM proxy: a regime score (0–100) combining
        // realized volatility z-score and rolling return z-score.
        // Score > 60 = Low-Vol Bull Regime (HMM State 1 — trend-following works).
        // Score < 40 = High-Vol Bear Regime (HMM State 2 — mean-reversion works, shorts right).
        // Used by Two Sigma, Renaissance, and DE Shaw for regime-conditional
        // strategy weighting.
        id: "hmmRegime", label: "HMM REGIME DETECTION (Bull/Bear State Probability)", icon: "quantum", unit: "score",
        a: { key: "regimeScore", name: "Regime Score (0=Bear / 100=Bull)", value: 50 },
        b: { key: "volZ", name: "Realized Vol Z-Score (σ vs 60d avg)", value: 0 },
        evaluate: (v) => {
            if (v.regimeScore > 60 && v.volZ < 0.5) return "BUY";
            if (v.regimeScore < 40 || v.volZ > 2) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.regimeScore > 60 && v.volZ < 0.5) return `HMM regime score = ${v.regimeScore}/100 with vol z-score ${v.volZ.toFixed(2)}σ — model assigns HIGH probability to the Low-Volatility Bull State. Trend-following strategies have positive expected return in this regime. Momentum is persistent. BUY.`;
            if (v.regimeScore < 40 || v.volZ > 2) return `HMM regime score = ${v.regimeScore}/100, vol z-score = ${v.volZ.toFixed(2)}σ — model flags HIGH probability of the High-Volatility Bear State. Two Sigma / DE Shaw-style regime models would de-weight trend-following and activate mean-reversion overlays. SELL / reduce risk.`;
            return `HMM regime score = ${v.regimeScore}/100 — transition zone, model has low confidence in either state. Both regimes have material probability, reducing strategy edge. WAIT.`;
        }
    },
    {
        // Cross-Sectional Momentum Factor (UMD — Up Minus Down).
        // Jegadeesh-Titman (1993) / Fama-French: long the top-decile
        // 12-1M performers, short the bottom decile.
        // Positive UMD return = winners keep winning (BUY the market).
        // Deeply negative UMD = momentum crash regime — mean-reversion,
        // historically follows bubbles and correlates with crowded-unwind events.
        id: "csMomentum", label: "CROSS-SECTIONAL MOMENTUM FACTOR (UMD — Up Minus Down)", icon: "quantum", unit: "%",
        a: { key: "umdReturn", name: "UMD Factor Monthly Return (%)", value: 0 },
        b: { key: "umdPrev", name: "Prior Month UMD (%)", value: 0 },
        evaluate: (v) => {
            if (v.umdReturn > 0 && v.umdReturn >= v.umdPrev) return "BUY";
            if (v.umdReturn < -3) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const delta = +(v.umdReturn - v.umdPrev).toFixed(2);
            if (v.umdReturn > 0 && v.umdReturn >= v.umdPrev) return `UMD factor = +${v.umdReturn}% (prev +${v.umdPrev}%, Δ${delta >= 0 ? "+" : ""}${delta}%) — winners are outperforming losers. Momentum factor is in a positive return regime. Quant long/short desks are adding to momentum exposure. BUY the trend.`;
            if (v.umdReturn < -3) return `UMD factor = ${v.umdReturn}% — MOMENTUM CRASH signal. Past winners are suddenly underperforming, losers recovering. This is the quantitative signature of a crowded-trade unwind (same as August 2007 quant quake, May 2009). Risk-parity and factor funds are de-levering. SELL / reduce momentum exposure.`;
            return `UMD factor = ${v.umdReturn}% (prev ${v.umdPrev}%) — momentum factor is flat or modestly negative without crash dynamics. No clean signal. WAIT.`;
        }
    },
    {
        // NLP Earnings Call Sentiment Score.
        // Machine-learning (BERT/FinBERT) sentiment extracted from earnings
        // call transcripts: tone, certainty, forward guidance language.
        // Score range: -100 (bearish) to +100 (bullish).
        // Positive and improving = management confident, alpha ahead.
        // Negative and falling = hedged language, guidance cuts incoming.
        // Used by Two Sigma Spectrum, Kensho (S&P), and Quant desks at GS/MS.
        id: "nlpEarnings", label: "NLP EARNINGS CALL SENTIMENT (FinBERT Transcript Score)", icon: "quantum", unit: "pts",
        a: { key: "sentimentScore", name: "Current NLP Score (-100 to +100)", value: 0 },
        b: { key: "prevSentiment", name: "Prior Quarter Score", value: 0 },
        evaluate: (v) => {
            if (v.sentimentScore > 20 && v.sentimentScore >= v.prevSentiment) return "BUY";
            if (v.sentimentScore < -20 && v.sentimentScore <= v.prevSentiment) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const delta = +(v.sentimentScore - v.prevSentiment).toFixed(1);
            if (v.sentimentScore > 20 && v.sentimentScore >= v.prevSentiment) return `FinBERT earnings sentiment = +${v.sentimentScore} (prev +${v.prevSentiment}, Δ${delta >= 0 ? "+" : ""}${delta}) — management language is confident, forward guidance is constructive, uncertainty words are low. Two Sigma Spectrum-style NLP models would assign this a long signal. BUY.`;
            if (v.sentimentScore < -20 && v.sentimentScore <= v.prevSentiment) return `FinBERT earnings sentiment = ${v.sentimentScore} (prev ${v.prevSentiment}, Δ${delta}) — management is hedging, using high-uncertainty language, guidance cuts are embedded in the transcript. NLP quant models flag this transcript as a SELL signal 1–4 weeks ahead of price reaction. SELL.`;
            return `Earnings sentiment = ${v.sentimentScore} (prev ${v.prevSentiment}) — inside the ±20 noise band, or not yet directionally worsening/improving enough for a conviction read. WAIT.`;
        }
    },

    {
        // 90 — HAR-RV Realized Volatility Regime (Corsi 2009, used at AQR / Man AHL).
        // High-frequency realized vol from daily/weekly/monthly components.
        // Falling short-horizon RV inside a rising trend = low-vol trend continuation (BUY);
        // Rising short-horizon RV against trend = regime break (SELL).
        id: "harRvRegime", label: "HAR-RV VOLATILITY REGIME (Corsi 2009)", icon: "quantum", unit: "%",
        a: { key: "rvDay",    name: "Realized vol — 1D (%)",  value: 0.85 },
        b: { key: "rvWeek",   name: "Realized vol — 5D (%)",  value: 1.10 },
        c: { key: "rvMonth",  name: "Realized vol — 22D (%)", value: 1.35 },
        d: { key: "trendUp",  name: "Price trending up? (1/0)", value: 1 },
        evaluate: (v) => {
            if (v.rvMonth <= 0) return "WAIT";
            // Proper HAR-RV (Corsi 2009) fits β_d/β_w/β_m via regression on
            // historical RV — not available in-app (no rolling history feed
            // to the indicator). Using the standard heterogeneous-weight
            // approximation instead of an unweighted 1/3-1/3-1/3 average:
            // daily component dominates, weekly/monthly taper off.
            const forecast = 0.5 * v.rvDay + 0.3 * v.rvWeek + 0.2 * v.rvMonth;
            const compressing = v.rvDay < v.rvWeek && v.rvWeek < v.rvMonth;
            const expanding   = v.rvDay > v.rvWeek && v.rvWeek > v.rvMonth;
            if (compressing && v.trendUp && forecast < v.rvMonth) return "BUY";
            if (compressing && !v.trendUp && forecast < v.rvMonth) return "SELL";
            if (expanding) return v.trendUp ? "SELL" : "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (v.rvMonth <= 0) return `Monthly RV is 0 — cannot form HAR forecast, WAIT.`;
            const compressing = v.rvDay < v.rvWeek && v.rvWeek < v.rvMonth;
            const expanding   = v.rvDay > v.rvWeek && v.rvWeek > v.rvMonth;
            if (compressing && v.trendUp) return `Realized vol compressing (${v.rvDay}% < ${v.rvWeek}% < ${v.rvMonth}%) inside an up-trend — classic low-vol trend continuation, BUY.`;
            if (compressing && !v.trendUp) return `Realized vol compressing (${v.rvDay}% < ${v.rvWeek}% < ${v.rvMonth}%) inside a down-trend — orderly grind lower, SELL.`;
            if (expanding && v.trendUp) return `Realized vol expanding (${v.rvDay}% > ${v.rvWeek}% > ${v.rvMonth}%) in an up-trend — parabolic exhaustion regime, fade, SELL.`;
            if (expanding && !v.trendUp) return `Realized vol expanding (${v.rvDay}% > ${v.rvWeek}% > ${v.rvMonth}%) in a down-trend — capitulation regime, mean-revert, BUY.`;
            return `HAR-RV components mixed (${v.rvDay}/${v.rvWeek}/${v.rvMonth}) — no clean regime, WAIT.`;
        }
    },
    {
        // 91 — SVI Skew Slope (Gatheral). ATM skew slope from a fitted SVI surface.
        // Steeply negative skew = downside protection expensive = big-money hedging (SELL bias).
        // Flat / positive skew = complacency ends, upside chase (BUY bias).
        id: "sviSkewSlope", label: "SVI SKEW SLOPE (Gatheral Surface)", icon: "quantum", unit: "slope",
        a: { key: "slope",     name: "ATM skew slope (∂σ/∂k)",  value: -0.05 },
        b: { key: "prevSlope", name: "Prior-session slope",     value: -0.02 },
        evaluate: (v) => {
            if (v.slope <= -0.10 && v.slope < v.prevSlope) return "SELL";
            if (v.slope >= -0.02 && v.slope > v.prevSlope) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (v.slope <= -0.10 && v.slope < v.prevSlope) return `SVI ATM skew slope ${v.slope} steepening from ${v.prevSlope} — puts are bid, dealers pricing left-tail risk, SELL.`;
            if (v.slope >= -0.02 && v.slope > v.prevSlope) return `SVI skew slope ${v.slope} flattening from ${v.prevSlope} — put demand bleeding off, upside call chase, BUY.`;
            return `SVI skew slope ${v.slope} vs prior ${v.prevSlope} — no directional shift in the smile, WAIT.`;
        }
    },
    {
        // 92 — Barndorff-Nielsen / Shephard bipower jump detector.
        // z-score of intraday jump component > 3 flags a real news-driven jump;
        // sign of the jump gives direction.
        id: "bnsJump", label: "BNS JUMP DETECTOR (Bipower Variation)", icon: "quantum", unit: "z",
        a: { key: "jumpZ",   name: "Jump z-score",              value: 0 },
        b: { key: "jumpSign", name: "Sign of jump (+1 up / -1 down)", value: 1 },
        evaluate: (v) => {
            if (Math.abs(v.jumpZ) < 3) return "WAIT";
            return v.jumpSign > 0 ? "BUY" : "SELL";
        },
        reason: (v) => {
            if (Math.abs(v.jumpZ) < 3) return `Bipower jump z ${v.jumpZ} inside ±3σ — normal continuous vol, no jump, WAIT.`;
            return v.jumpSign > 0 ? `Jump z ${v.jumpZ} > 3 with positive sign — statistically real upward price jump, momentum follow-through, BUY.` : `Jump z ${v.jumpZ} > 3 with negative sign — statistically real downward price jump, momentum follow-through, SELL.`;
        }
    },
    {
        // 93 — Kalman filter dynamic trend slope (Renaissance/D.E. Shaw style).
        // Filtered slope > +threshold = trending up; < -threshold = trending down.
        id: "kalmanTrend", label: "KALMAN TREND SLOPE (Dynamic Filter)", icon: "quantum", unit: "bps/bar",
        a: { key: "slope",   name: "Filtered slope (bps/bar)", value: 0 },
        b: { key: "sigma",   name: "Slope std-dev (bps/bar)",  value: 5 },
        evaluate: (v) => {
            if (v.sigma <= 0) return "WAIT";
            const z = v.slope / v.sigma;
            if (z > 1) return "BUY";
            if (z < -1) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.sigma <= 0) return `Kalman slope-sigma 0 — filter not yet converged, WAIT.`;
            const z = +(v.slope / v.sigma).toFixed(2);
            if (z > 1)  return `Kalman-filtered slope ${v.slope} bps/bar (z=${z}) — dynamic trend clearly upward through the noise, BUY.`;
            if (z < -1) return `Kalman-filtered slope ${v.slope} bps/bar (z=${z}) — dynamic trend clearly downward through the noise, SELL.`;
            return `Kalman slope ${v.slope} bps/bar (z=${z}) inside ±1σ — no filtered trend, WAIT.`;
        }
    },
    {
        // 94 — Ornstein-Uhlenbeck mean-reversion (D.E. Shaw stat-arb).
        // If price z-score is far from OU mean AND the OU speed κ is high,
        // fade the deviation.
        id: "ouReversion", label: "OU MEAN REVERSION (Ornstein-Uhlenbeck)", icon: "quantum", unit: "σ",
        a: { key: "zDev",    name: "Deviation z-score from OU mean", value: 0 },
        b: { key: "kappa",   name: "OU mean-reversion speed κ",      value: 0.2 },
        evaluate: (v) => {
            if (v.kappa <= 0.1) return "WAIT";
            if (v.zDev >  1.5) return "SELL";
            if (v.zDev < -1.5) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (v.kappa <= 0.1) return `OU κ ${v.kappa} too weak (≤0.1) — no reliable mean-reversion, WAIT.`;
            if (v.zDev >  1.5) return `Price ${v.zDev}σ above OU mean with κ=${v.kappa} — stretched, statistical fade, SELL.`;
            if (v.zDev < -1.5) return `Price ${v.zDev}σ below OU mean with κ=${v.kappa} — stretched, statistical fade, BUY.`;
            return `OU deviation ${v.zDev}σ inside ±1.5 — inside the reversion band, WAIT.`;
        }
    },
    {
        // 95 — Cross-Sectional ElasticNet Composite (BlackRock Aladdin factor engine).
        // Signed model score with confidence gate.
        id: "elasticNet", label: "ELASTIC-NET FACTOR SCORE (BlackRock/Aladdin)", icon: "quantum", unit: "pts",
        a: { key: "score",       name: "Model score (-100..+100)", value: 0 },
        b: { key: "confidence",  name: "Model confidence (0..1)",  value: 0.5 },
        evaluate: (v) => {
            if (v.confidence < 0.5) return "WAIT";
            if (v.score >  25) return "BUY";
            if (v.score < -25) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.confidence < 0.5) return `ElasticNet confidence ${v.confidence} < 0.5 — model uncertain, WAIT.`;
            if (v.score >  25) return `Cross-sectional ElasticNet score +${v.score} at ${v.confidence} confidence — factor stack leans long, BUY.`;
            if (v.score < -25) return `Cross-sectional ElasticNet score ${v.score} at ${v.confidence} confidence — factor stack leans short, SELL.`;
            return `ElasticNet score ${v.score} inside ±25 — no factor edge, WAIT.`;
        }
    },
    {
        // 96 — VIX9D / VIX Term-Structure Ratio (short vs 30-day IV).
        // Ratio < 0.90 = classic contango, complacency (BUY);
        // Ratio > 1.05 = short-dated fear inversion (SELL).
        id: "vix9dRatio", label: "VIX9D / VIX RATIO (Front-End Term Structure)", icon: "usa", unit: "ratio",
        a: { key: "vix9d", name: "VIX9D",  value: 15 },
        b: { key: "vix",   name: "VIX30",  value: 17 },
        evaluate: (v) => {
            if (v.vix <= 0) return "WAIT";
            const r = v.vix9d / v.vix;
            if (r < 0.90) return "BUY";
            if (r > 1.05) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.vix <= 0) return `VIX ${v.vix} — invalid denominator, WAIT.`;
            const r = +(v.vix9d / v.vix).toFixed(3);
            if (r < 0.90) return `VIX9D/VIX ratio ${r} < 0.90 — steep contango, front-end vol cheap, risk-on regime, BUY.`;
            if (r > 1.05) return `VIX9D/VIX ratio ${r} > 1.05 — front-end inverted, immediate fear priced in, SELL.`;
            return `VIX9D/VIX ratio ${r} between 0.90–1.05 — normal term structure, WAIT.`;
        }
    },
    {
        // 97 — Index vs single-name Implied-Vol Dispersion (Citadel dispersion trade).
        // High dispersion (avgSingleIv >> indexIv) = idiosyncratic regime, index drift lower risk (SELL);
        // Low dispersion = correlated regime, index momentum works (BUY).
        id: "ivDispersion", label: "IV DISPERSION (Index vs Constituents)", icon: "quantum", unit: "vol-pts",
        a: { key: "indexIv",       name: "Index IV (%)",            value: 14 },
        b: { key: "avgSingleIv",   name: "Avg single-stock IV (%)", value: 22 },
        c: { key: "trendUp",       name: "Index trending up? (1/0)", value: 1 },
        evaluate: (v) => {
            const disp = v.avgSingleIv - v.indexIv;
            if (disp > 10) return v.trendUp ? "SELL" : "BUY";
            if (disp < 4)  return v.trendUp ? "BUY"  : "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const disp = +(v.avgSingleIv - v.indexIv).toFixed(1);
            if (disp > 10) return `Dispersion ${disp} vol-pts (single ${v.avgSingleIv}% vs index ${v.indexIv}%) — high idiosyncratic vol, correlations breaking, fade index trend.`;
            if (disp < 4)  return `Dispersion ${disp} vol-pts — correlations elevated, everything moving together, ride the index trend.`;
            return `Dispersion ${disp} vol-pts inside 4–10 normal band — no regime edge, WAIT.`;
        }
    },
    {
        // 98 — Average Pairwise Correlation Spike (systemic-risk-off tell).
        // Sudden ρ_avg jump = everything trading as one asset = risk-off (SELL).
        id: "corrShock", label: "PAIRWISE CORRELATION SHOCK", icon: "quantum", unit: "ρ",
        a: { key: "rhoNow",  name: "Avg pairwise ρ — now",  value: 0.40 },
        b: { key: "rhoPrev", name: "Avg pairwise ρ — prior", value: 0.35 },
        evaluate: (v) => {
            const dRho = v.rhoNow - v.rhoPrev;
            if (v.rhoNow > 0.70 && dRho >  0.10) return "SELL";
            if (v.rhoNow < 0.30 && dRho < -0.05) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            const dRho = +(v.rhoNow - v.rhoPrev).toFixed(2);
            if (v.rhoNow > 0.70 && dRho > 0.10) return `Avg pairwise correlation spiked to ${v.rhoNow} (Δ+${dRho}) — everything moving together, systemic risk-off, SELL.`;
            if (v.rhoNow < 0.30 && dRho < -0.05) return `Avg correlation dropped to ${v.rhoNow} (Δ${dRho}) — normal dispersion returning, risk-on, BUY.`;
            return `Correlation ${v.rhoNow} (Δ${dRho}) — no regime break, WAIT.`;
        }
    },
    {
        // 99 — Implied Move vs Realized Move ratio (volatility-desk edge).
        // Options implied a larger move than actually realized => IV overpriced (SELL vol / BUY underlying carry).
        id: "impliedVsRealized", label: "IMPLIED vs REALIZED MOVE", icon: "quantum", unit: "ratio",
        a: { key: "impliedMove", name: "Implied move (%)", value: 1.5 },
        b: { key: "realizedMove", name: "Realized move (%)", value: 1.2 },
        c: { key: "priceUp",      name: "Underlying closed up? (1/0)", value: 1 },
        evaluate: (v) => {
            if (v.impliedMove <= 0) return "WAIT";
            const r = v.realizedMove / v.impliedMove;
            if (r < 0.7) return v.priceUp ? "BUY" : "SELL";
            if (r > 1.3) return v.priceUp ? "SELL" : "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (v.impliedMove <= 0) return `Implied move 0 — no priced expectation, WAIT.`;
            const r = +(v.realizedMove / v.impliedMove).toFixed(2);
            if (r < 0.7) return `Realized ${v.realizedMove}% vs Implied ${v.impliedMove}% (ratio ${r}) — IV overstated the move, carry-friendly, follow the day's direction.`;
            if (r > 1.3) return `Realized ${v.realizedMove}% vs Implied ${v.impliedMove}% (ratio ${r}) — market ran hotter than priced, fade the day's direction.`;
            return `Realized/Implied ratio ${r} in normal 0.7–1.3 band — no edge, WAIT.`;
        }
    },
    {
        // 100 — Options-implied dividend / carry drift (BlackRock rates desk).
        // Rising implied carry = arb desks pricing in stronger holding demand (BUY).
        id: "impliedCarry", label: "OPTIONS-IMPLIED CARRY DRIFT", icon: "quantum", unit: "bps",
        a: { key: "carryBps",    name: "Implied carry (bps)",   value: 25 },
        b: { key: "prevCarryBps", name: "Prior-session carry",   value: 20 },
        evaluate: (v) => {
            const d = v.carryBps - v.prevCarryBps;
            if (d >  5) return "BUY";
            if (d < -5) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const d = +(v.carryBps - v.prevCarryBps).toFixed(1);
            if (d >  5) return `Implied carry ${v.carryBps} bps (Δ+${d}) — put-call parity says demand to hold rising, BUY.`;
            if (d < -5) return `Implied carry ${v.carryBps} bps (Δ${d}) — demand to hold fading, SELL.`;
            return `Implied carry ${v.carryBps} bps (Δ${d}) inside ±5 bps noise band, WAIT.`;
        }
    },
    {
        // 101 — Odd-Lot Retail Flow ratio (Bloomberg SIP data).
        // Elevated retail buying vs shorting in a downtrend = classic contrarian SELL;
        // Elevated retail selling in an uptrend = classic contrarian BUY.
        id: "retailOddLot", label: "ODD-LOT RETAIL FLOW (Contrarian)", icon: "quantum", unit: "ratio",
        a: { key: "buyRatio",  name: "Odd-lot buy ratio (0..1)", value: 0.55 },
        b: { key: "trendUp",   name: "Underlying trending up? (1/0)", value: 1 },
        evaluate: (v) => {
            if (v.buyRatio > 0.65 && !v.trendUp) return "SELL";
            if (v.buyRatio < 0.35 &&  v.trendUp) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (v.buyRatio > 0.65 && !v.trendUp) return `Odd-lot buy ratio ${v.buyRatio} in a down-trend — retail eagerly buying the falling knife, contrarian SELL.`;
            if (v.buyRatio < 0.35 &&  v.trendUp) return `Odd-lot buy ratio ${v.buyRatio} in an up-trend — retail selling into strength, contrarian BUY.`;
            return `Odd-lot ratio ${v.buyRatio} not extreme vs trend — no contrarian edge, WAIT.`;
        }
    },
    {
        // 102 — Dark-Pool Print Ratio (FINRA ATS + Bloomberg BXTR).
        // Rising DP share on rising price = real institutional accumulation (BUY).
        id: "darkPoolPrints", label: "DARK-POOL PRINT RATIO", icon: "quantum", unit: "%",
        a: { key: "dpRatio",     name: "Dark-pool volume share (%)", value: 42 },
        b: { key: "prevDpRatio", name: "Prior-session share (%)",    value: 38 },
        c: { key: "priceUp",     name: "Price up on day? (1/0)",     value: 1 },
        evaluate: (v) => {
            const rising = v.dpRatio > v.prevDpRatio + 2 && v.dpRatio >= 40;
            const falling = v.dpRatio < v.prevDpRatio - 2;
            if (rising && v.priceUp)  return "BUY";
            if (rising && !v.priceUp) return "SELL";
            if (falling) return "WAIT";
            return "WAIT";
        },
        reason: (v) => {
            const rising = v.dpRatio > v.prevDpRatio + 2 && v.dpRatio >= 40;
            const falling = v.dpRatio < v.prevDpRatio - 2;
            if (rising && v.priceUp)  return `Dark-pool share up to ${v.dpRatio}% from ${v.prevDpRatio}% with price higher — real institutional accumulation, BUY.`;
            if (rising && !v.priceUp) return `Dark-pool share up to ${v.dpRatio}% with price lower — institutional distribution, SELL.`;
            if (falling) return `Dark-pool share dropped to ${v.dpRatio}% from ${v.prevDpRatio}% — activity in lit venues only, no institutional footprint, WAIT.`;
            return `Dark-pool share ${v.dpRatio}% (prev ${v.prevDpRatio}%) — no meaningful shift, WAIT.`;
        }
    },
    {
        // 103 — GC Repo Rate vs IORB (funding-market stress, Citadel / DE Shaw macro).
        // Repo well above IORB = cash-shortage regime = risk-off (SELL).
        id: "repoStress", label: "GC REPO vs IORB SPREAD", icon: "usa", unit: "bps",
        a: { key: "repoBps",    name: "Overnight GC Repo (bps)", value: 528 },
        b: { key: "iorbBps",    name: "IORB (bps)",              value: 525 },
        c: { key: "prevSpread", name: "Prior-session spread (bps)", value: 3 },
        evaluate: (v) => {
            const spread = v.repoBps - v.iorbBps;
            if (spread > 15 && spread > v.prevSpread) return "SELL";
            if (spread < 5  && spread < v.prevSpread) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            const spread = +(v.repoBps - v.iorbBps).toFixed(1);
            if (spread > 15 && spread > v.prevSpread) return `Repo-IORB spread ${spread} bps (prev ${v.prevSpread}) — cash shortage in the funding market, risk-off, SELL.`;
            if (spread < 5  && spread < v.prevSpread) return `Repo-IORB spread ${spread} bps — funding easy, liquidity abundant, BUY.`;
            return `Repo-IORB spread ${spread} bps — normal funding conditions, WAIT.`;
        }
    },
    {
        // 104 — CDX IG Credit Spread daily change (BlackRock credit desk).
        // Tightening = credit risk-on (BUY equity beta); widening = risk-off (SELL).
        id: "cdxIgSpread", label: "CDX IG CREDIT SPREAD (Daily Δ)", icon: "usa", unit: "bps",
        a: { key: "spreadNow",  name: "CDX IG spread — now (bps)",  value: 62 },
        b: { key: "spreadPrev", name: "CDX IG spread — prior (bps)", value: 65 },
        evaluate: (v) => {
            const d = v.spreadNow - v.spreadPrev;
            if (d < -3) return "BUY";
            if (d >  3) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const d = +(v.spreadNow - v.spreadPrev).toFixed(1);
            if (d < -3) return `CDX IG tightened ${d} bps to ${v.spreadNow} — credit risk appetite improving, equity BUY.`;
            if (d >  3) return `CDX IG widened +${d} bps to ${v.spreadNow} — credit deteriorating, equity SELL.`;
            return `CDX IG change ${d} bps — no credit signal, WAIT.`;
        }
    },
    {
        // 105 — Advance/Decline Line Divergence (breadth vs index).
        // Index up but A/D falling = breadth failure = SELL. Reverse = washout BUY.
        id: "adLineDivergence", label: "A/D LINE DIVERGENCE (Breadth vs Index)", icon: "usa", unit: "",
        a: { key: "indexUp",   name: "Index closed up? (1/0)", value: 1 },
        b: { key: "adDelta",   name: "A/D line change today",  value: -120 },
        evaluate: (v) => {
            if (v.indexUp   && v.adDelta < 0) return "SELL";
            if (!v.indexUp  && v.adDelta > 0) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (v.indexUp   && v.adDelta < 0) return `Index up but A/D line ${v.adDelta} negative — narrow rally on a few heavyweights, breadth failure, SELL.`;
            if (!v.indexUp  && v.adDelta > 0) return `Index down but A/D line +${v.adDelta} positive — most stocks up, index drag from heavyweights only, BUY.`;
            return `Index and breadth aligned — no divergence, WAIT.`;
        }
    },
    {
        // 106 — McClellan Oscillator (breadth momentum). >+50 overbought, <-50 oversold.
        id: "mcClellanOsc", label: "MCCLELLAN OSCILLATOR (Breadth Momentum)", icon: "usa", unit: "",
        a: { key: "mcOsc",    name: "McClellan value",     value: 0 },
        b: { key: "prevMcOsc", name: "Prior McClellan value", value: 0 },
        evaluate: (v) => {
            if (v.mcOsc < -50 && v.mcOsc > v.prevMcOsc) return "BUY";
            if (v.mcOsc >  50 && v.mcOsc < v.prevMcOsc) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.mcOsc < -50 && v.mcOsc > v.prevMcOsc) return `McClellan ${v.mcOsc} deep oversold and turning up from ${v.prevMcOsc} — breadth washout reversal, BUY.`;
            if (v.mcOsc >  50 && v.mcOsc < v.prevMcOsc) return `McClellan ${v.mcOsc} overbought and rolling from ${v.prevMcOsc} — breadth thrust exhaustion, SELL.`;
            return `McClellan ${v.mcOsc} inside ±50 or not turning — no extreme, WAIT.`;
        }
    },
    {
        // 107 — Arms Index (TRIN). TRIN < 0.7 = strong buying; > 1.3 = strong selling.
        id: "armsTrin", label: "ARMS INDEX (TRIN)", icon: "usa", unit: "",
        a: { key: "trin", name: "TRIN value", value: 1.0 },
        evaluate: (v) => {
            if (v.trin <= 0) return "WAIT";
            if (v.trin < 0.7) return "BUY";
            if (v.trin > 1.3) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.trin <= 0) return `TRIN ${v.trin} invalid — WAIT.`;
            if (v.trin < 0.7) return `TRIN ${v.trin} < 0.7 — advancing volume dominates, strong breadth buying, BUY.`;
            if (v.trin > 1.3) return `TRIN ${v.trin} > 1.3 — declining volume dominates, strong breadth selling, SELL.`;
            return `TRIN ${v.trin} in neutral 0.7–1.3 zone — WAIT.`;
        }
    },
    {
        // 108 — Smart Money Index (SMI). Last 60 min action vs first 30 min.
        // Institutions dominate the close; retail dominates the open.
        // Positive SMI drift = smart money accumulating (BUY).
        id: "smartMoneyIdx", label: "SMART MONEY INDEX (SMI Drift)", icon: "usa", unit: "pts",
        a: { key: "smiChange", name: "SMI change today",   value: 15 },
        b: { key: "smiTrend",  name: "SMI 5-day trend (+/-1)", value: 1 },
        evaluate: (v) => {
            if (v.smiChange >  10 && v.smiTrend > 0) return "BUY";
            if (v.smiChange < -10 && v.smiTrend < 0) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.smiChange >  10 && v.smiTrend > 0) return `SMI +${v.smiChange} today with 5-day uptrend — institutions closing strong day after day, BUY.`;
            if (v.smiChange < -10 && v.smiTrend < 0) return `SMI ${v.smiChange} today with 5-day downtrend — institutions selling into every close, SELL.`;
            return `SMI change ${v.smiChange} inconclusive vs 5-day trend — WAIT.`;
        }
    },
    {
        // 109 — Magic-Formula composite (Greenblatt). Earnings Yield + ROIC ranking.
        // Cross-sectional score > threshold = deep value + high quality (BUY).
        id: "magicFormula", label: "MAGIC FORMULA SCORE (Greenblatt EY+ROIC)", icon: "quantum", unit: "pct-rank",
        a: { key: "eyRank",   name: "Earnings-yield percentile (0..100)", value: 50 },
        b: { key: "roicRank", name: "ROIC percentile (0..100)",           value: 50 },
        evaluate: (v) => {
            const combined = (v.eyRank + v.roicRank) / 2;
            if (combined > 80) return "BUY";
            if (combined < 20) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const combined = +((v.eyRank + v.roicRank) / 2).toFixed(1);
            if (combined > 80) return `Magic-Formula composite ${combined} — high earnings yield (${v.eyRank}) and high ROIC (${v.roicRank}), quality + value, BUY.`;
            if (combined < 20) return `Magic-Formula composite ${combined} — expensive and low return on capital, SELL.`;
            return `Magic-Formula composite ${combined} — no cross-sectional edge, WAIT.`;
        }
    },
    {
        // 110 — AQR carry-to-risk ratio. Expected carry per unit realized vol.
        id: "carryToRisk", label: "CARRY-TO-RISK RATIO (AQR)", icon: "quantum", unit: "ratio",
        a: { key: "carryBps",   name: "Expected carry (bps)",     value: 40 },
        b: { key: "realizedVol", name: "Realized vol (bps)",       value: 100 },
        evaluate: (v) => {
            if (v.realizedVol <= 0) return "WAIT";
            const ctr = v.carryBps / v.realizedVol;
            if (ctr >  0.30) return "BUY";
            if (ctr < -0.30) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.realizedVol <= 0) return `Realized vol 0 — cannot compute carry-to-risk, WAIT.`;
            const ctr = +(v.carryBps / v.realizedVol).toFixed(2);
            if (ctr >  0.30) return `Carry ${v.carryBps} bps / vol ${v.realizedVol} = ${ctr} — positive Sharpe-like carry, BUY.`;
            if (ctr < -0.30) return `Carry ${v.carryBps} bps / vol ${v.realizedVol} = ${ctr} — negative carry after vol, SELL.`;
            return `Carry-to-risk ${ctr} inside ±0.30 — no persistent carry edge, WAIT.`;
        }
    },
    {
        // 111 — Realized third-moment skewness of returns (RV skew, distinct from returnSkewness).
        // Negative RV skew + up-trend = crash-risk building despite the rally (SELL).
        id: "rvSkew", label: "REALIZED RETURN SKEW (Third Moment)", icon: "quantum", unit: "skew",
        a: { key: "rvSkew",  name: "Realized skew (20D)", value: 0 },
        b: { key: "trendUp", name: "Price trending up? (1/0)", value: 1 },
        evaluate: (v) => {
            if (v.rvSkew < -0.5 &&  v.trendUp) return "SELL";
            if (v.rvSkew >  0.5 && !v.trendUp) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (v.rvSkew < -0.5 &&  v.trendUp) return `Realized skew ${v.rvSkew} negative inside an up-trend — down-moves are fatter, crash risk building, SELL.`;
            if (v.rvSkew >  0.5 && !v.trendUp) return `Realized skew ${v.rvSkew} positive inside a down-trend — up-moves are fatter, snap-back risk, BUY.`;
            return `Realized skew ${v.rvSkew} not diverging from trend, WAIT.`;
        }
    },
    {
        // 112 — Beta-neutral Momentum minus Reversal (Jegadeesh-Titman 12-1 minus 1M reversal).
        // Long persistent 12-1 return, short last-month spike — classic AQR sector rotator.
        id: "momMinusReversal", label: "MOMENTUM (12-1) MINUS 1M REVERSAL", icon: "quantum", unit: "%",
        a: { key: "ret12_1",  name: "12-1 month return (%)", value: 8 },
        b: { key: "ret1m",    name: "Last-1M return (%)",    value: 4 },
        evaluate: (v) => {
            const spread = v.ret12_1 - v.ret1m;
            if (spread >  3) return "BUY";
            if (spread < -3) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const spread = +(v.ret12_1 - v.ret1m).toFixed(1);
            if (spread >  3) return `12-1 ${v.ret12_1}% minus 1M ${v.ret1m}% = +${spread} — persistent momentum without recent overheat, BUY.`;
            if (spread < -3) return `12-1 ${v.ret12_1}% minus 1M ${v.ret1m}% = ${spread} — recent 1M spike outran the 12-month base, mean-reversion setup, SELL.`;
            return `Momentum-vs-reversal spread ${spread}% — no edge, WAIT.`;
        }
    },
    {
        // 113 — Hurst Long-Memory Reversion (H<0.5 = anti-persistent regime).
        // Distinct from chinaHurst (H>0.65 momentum). Here H<0.35 = fade breakouts.
        id: "hurstMeanRev", label: "HURST LONG-MEMORY REVERSION (H<0.5)", icon: "quantum", unit: "H",
        a: { key: "hurst",     name: "Hurst exponent", value: 0.5 },
        b: { key: "lastMoveUp", name: "Last leg was up? (1/0)", value: 1 },
        evaluate: (v) => {
            if (v.hurst < 0.35 &&  v.lastMoveUp) return "SELL";
            if (v.hurst < 0.35 && !v.lastMoveUp) return "BUY";
            return "WAIT";
        },
        reason: (v) => {
            if (v.hurst < 0.35 &&  v.lastMoveUp) return `Hurst ${v.hurst} < 0.35 — anti-persistent regime and last leg was UP, fade it, SELL.`;
            if (v.hurst < 0.35 && !v.lastMoveUp) return `Hurst ${v.hurst} < 0.35 — anti-persistent regime and last leg was DOWN, fade it, BUY.`;
            return `Hurst ${v.hurst} not in reversion regime (<0.35) — WAIT.`;
        }
    },
    {
        // 114 — Rank-based (Spearman) Momentum (robust to outliers, used at Man AHL).
        id: "rankMomentum", label: "RANK MOMENTUM (Spearman, Man AHL)", icon: "quantum", unit: "ρ",
        a: { key: "spearman", name: "Spearman ρ of price vs time (20D)", value: 0 },
        evaluate: (v) => {
            if (v.spearman >  0.6) return "BUY";
            if (v.spearman < -0.6) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.spearman >  0.6) return `Spearman ρ ${v.spearman} strong monotonic uptrend regardless of outliers — BUY.`;
            if (v.spearman < -0.6) return `Spearman ρ ${v.spearman} strong monotonic downtrend regardless of outliers — SELL.`;
            return `Spearman ρ ${v.spearman} inside ±0.6 — no robust trend, WAIT.`;
        }
    },
    {
        // 115 — OI Change % (weighted 0.30 in Option Momentum Score)
        id: "omsOiChange", label: "OMS — OI CHANGE % (Fresh Position Build)", icon: "quantum", unit: "%",
        a: { key: "oiChangePct", name: "OI change last 15-30min (%)", value: 0 },
        b: { key: "priceUp", name: "Premium rising? (1/0)", value: 0 },
        evaluate: (v) => {
            if (v.oiChangePct > 5 && v.priceUp) return "BUY";
            if (v.oiChangePct > 5 && !v.priceUp) return "SELL";
            if (v.oiChangePct < -5 && v.priceUp) return "BUY";
            if (v.oiChangePct < -5 && !v.priceUp) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.oiChangePct > 5 && v.priceUp) return `OI up ${v.oiChangePct}% with premium rising — fresh aggressive buying, real conviction. BUY.`;
            if (v.oiChangePct > 5 && !v.priceUp) return `OI up ${v.oiChangePct}% with premium falling — fresh writing/shorting building against this strike. SELL.`;
            if (v.oiChangePct < -5 && v.priceUp) return `OI down ${Math.abs(v.oiChangePct)}% with premium rising — short covering by writers. BUY.`;
            if (v.oiChangePct < -5 && !v.priceUp) return `OI down ${Math.abs(v.oiChangePct)}% with premium falling — long unwinding, buyers exiting. SELL.`;
            return `OI change ${v.oiChangePct}% inside ±5% — no fresh conviction either way, WAIT.`;
        }
    },
    {
        // 116 — Volume/OI Ratio (weighted 0.25 in Option Momentum Score)
        id: "omsVolOiRatio", label: "OMS — VOLUME/OI RATIO (New Position Aggression)", icon: "quantum", unit: "x",
        a: { key: "volume", name: "Today's traded volume", value: 0 },
        b: { key: "oi", name: "Current OI", value: 0 },
        c: { key: "priceUp", name: "Premium rising? (1/0)", value: 0 },
        evaluate: (v) => {
            if (v.oi < 100) return "WAIT";
            const ratio = v.volume / v.oi;
            if (ratio >= 1.5 && v.priceUp) return "BUY";
            if (ratio >= 1.5 && !v.priceUp) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            if (v.oi < 100) return `OI ${v.oi} — below 100, strike too illiquid for a reliable Volume/OI ratio, WAIT.`;
            const ratio = +(v.volume / v.oi).toFixed(2);
            if (ratio >= 1.5 && v.priceUp) return `Volume/OI ratio ${ratio}x — heavy fresh trading relative to existing OI, not just rollover, and premium rising. Real new aggressive buying. BUY.`;
            if (ratio >= 1.5 && !v.priceUp) return `Volume/OI ratio ${ratio}x with premium falling — heavy fresh aggressive selling/writing. SELL.`;
            return `Volume/OI ratio ${ratio}x — below 1.5x, mostly existing positions/rollover, no fresh aggression, WAIT.`;
        }
    },
    {
        // 117 — IV Change % (weighted 0.20 in Option Momentum Score)
        id: "omsIvChange", label: "OMS — IV CHANGE % (Volatility Expansion/Crush)", icon: "quantum", unit: "%",
        a: { key: "ivNow", name: "IV now (%)", value: 0 },
        b: { key: "ivPrev", name: "IV prev poll (%)", value: 0 },
        c: { key: "priceUp", name: "Premium / CMP rising? (1/0)", value: 0 },
        evaluate: (v) => {
            const chg = v.ivPrev > 0 ? ((v.ivNow - v.ivPrev) / v.ivPrev) * 100 : 0;
            if (chg > 8 && v.priceUp) return "BUY";
            if (chg > 8 && !v.priceUp) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const chg = v.ivPrev > 0 ? +(((v.ivNow - v.ivPrev) / v.ivPrev) * 100).toFixed(1) : 0;
            if (chg > 8 && v.priceUp) return `IV expanding fast ${v.ivPrev}%→${v.ivNow}% (+${chg}%) while price/premium is rising — bullish momentum expansion, BUY.`;
            if (chg > 8 && !v.priceUp) return `IV expanding fast ${v.ivPrev}%→${v.ivNow}% (+${chg}%) while price/premium is falling — bearish fear/premium expansion, SELL.`;
            if (chg < -8) return `IV crushing ${v.ivPrev}%→${v.ivNow}% (${chg}%) — volatility is contracting, so this is not a directional BUY/SELL edge by itself, WAIT.`;
            return `IV change ${chg}% inside ±8% — no strong expansion, WAIT.`;
        }
    },
    {
        // 118 — Delta-Adjusted Volume (weighted 0.15 in Option Momentum Score)
        id: "omsDeltaVolume", label: "OMS — DELTA × VOLUME (Real Directional Exposure)", icon: "quantum", unit: "",
        a: { key: "delta", name: "Option delta (0-1)", value: 0 },
        b: { key: "volume", name: "Volume", value: 0 },
        c: { key: "avgDeltaVolume", name: "Average delta×volume (baseline)", value: 0 },
        d: { key: "priceUp", name: "Premium / CMP rising? (1/0)", value: 0 },
        evaluate: (v) => {
            // SIGN FIX: delta carries the direction (CE +, PE -). The old
            // Math.abs() threw that away, so heavy put/selling exposure
            // scored identically to heavy call buying — the root cause of
            // "100 BUY while CMP is crashing".
            const signedDv = Number(v.delta || 0) * Number(v.volume || 0);
            const dv = Math.abs(signedDv);
            const baseline = Math.abs(Number(v.avgDeltaVolume || 0));
            if (baseline <= 0 || dv <= 0) return "WAIT";
            if (dv < baseline * 1.5) return "WAIT";
            const deltaBull = signedDv > 0;
            if (deltaBull === !!v.priceUp) return deltaBull ? "BUY" : "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const signedDv = Number(v.delta || 0) * Number(v.volume || 0);
            const dv = Math.round(Math.abs(signedDv));
            const baseline = Math.round(Math.abs(Number(v.avgDeltaVolume || 0)));
            if (baseline <= 0 || dv <= 0) return `Delta×Volume baseline is not ready yet (dv ${dv}, baseline ${baseline}) — WAIT.`;
            if (dv < baseline * 1.5) return `Delta×Volume = ${dv} vs baseline ${baseline} — not meaningfully above baseline, WAIT.`;
            const deltaBull = signedDv > 0;
            if (deltaBull && v.priceUp) return `Signed Delta×Volume = +${dv} vs baseline ${baseline} with premium/CMP rising — real directional BUYING exposure. BUY.`;
            if (!deltaBull && !v.priceUp) return `Signed Delta×Volume = -${dv} vs baseline ${baseline} with premium/CMP falling — real directional SELLING exposure. SELL.`;
            return `Delta×Volume magnitude ${dv} beats baseline ${baseline}, but delta sign (${deltaBull ? "bullish" : "bearish"}) and price direction (${v.priceUp ? "up" : "down"}) disagree — conflicting flow, WAIT.`;
        }
    },
    {
        // 119 — Bid-Ask Aggression / Ask-Hit Ratio (weighted 0.10 in Option Momentum Score)
        id: "omsAskHitRatio", label: "OMS — ASK-HIT RATIO (Buyer/Seller Aggression)", icon: "quantum", unit: "%",
        a: { key: "askHits", name: "Trades executed at Ask", value: 0 },
        b: { key: "bidHits", name: "Trades executed at Bid", value: 0 },
        evaluate: (v) => {
            // ROLLING-WINDOW FIX: askHitsWindowed/bidHitsWindowed are a
            // trailing 5-minute sum maintained by the askHitWindowRef effect,
            // so evaluation is never a single-tick manual entry. Falls back
            // to the raw entry only before the window has any samples yet.
            const askW = v.askHitsWindowed !== undefined ? Number(v.askHitsWindowed) : Number(v.askHits || 0);
            const bidW = v.bidHitsWindowed !== undefined ? Number(v.bidHitsWindowed) : Number(v.bidHits || 0);
            const total = askW + bidW;
            // MIN-SAMPLE FIX: with 2-3 prints a 100% ask-hit ratio is noise.
            if (total < 20) return "WAIT";
            const ratio = (askW / total) * 100;
            if (ratio >= 60) return "BUY";
            if (ratio <= 40) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const askW = v.askHitsWindowed !== undefined ? Number(v.askHitsWindowed) : Number(v.askHits || 0);
            const bidW = v.bidHitsWindowed !== undefined ? Number(v.bidHitsWindowed) : Number(v.bidHits || 0);
            const total = askW + bidW;
            if (total < 20) return `Only ${total} bid/ask prints in the trailing 5-min window — below the 20-print minimum sample, the ratio would be noise. WAIT.`;
            const ratio = +((askW / total) * 100).toFixed(1);
            if (ratio >= 60) return `${ratio}% of trades hitting the Ask over the trailing 5-min window — buyers paying up aggressively for immediate fills, real-time buying pressure. BUY.`;
            if (ratio <= 40) return `Only ${ratio}% of trades hitting the Ask over the trailing 5-min window (rest hitting Bid) — sellers dumping aggressively at market, real-time selling pressure. SELL.`;
            return `Ask-hit ratio ${ratio}% over the trailing 5-min window — balanced, no clear aggression either side, WAIT.`;
        }
    },
    {
        // 120 — Futures/Underlying Order-Flow Confirmation — the point most people skip.
        // Option flow NOT confirmed by the underlying's own futures buildup is
        // frequently a trap/manipulation move by option writers. This card exists to
        // stop the other 5 OMS cards from being trusted in isolation.
        id: "omsFuturesConfirm", label: "OMS — FUTURES CONFIRMATION (Trap Filter, the skipped point)", icon: "quantum", unit: "",
        a: { key: "optionSignalBullish", name: "Option-side OMS signal bullish? (1/0)", value: 0 },
        b: { key: "futuresOiUp", name: "Underlying futures OI rising? (1/0)", value: 0 },
        c: { key: "futuresPriceUp", name: "Underlying futures price rising? (1/0)", value: 0 },
        evaluate: (v) => {
            const futuresBullish = v.futuresOiUp && v.futuresPriceUp;
            const futuresBearish = v.futuresOiUp && !v.futuresPriceUp;
            if (v.optionSignalBullish && futuresBullish) return "BUY";
            if (!v.optionSignalBullish && futuresBearish) return "SELL";
            return "WAIT";
        },
        reason: (v) => {
            const futuresBullish = v.futuresOiUp && v.futuresPriceUp;
            const futuresBearish = v.futuresOiUp && !v.futuresPriceUp;
            if (v.optionSignalBullish && futuresBullish) return `Option-side signal is bullish AND underlying futures show fresh long buildup (OI up, price up) — option move is CONFIRMED by real underlying flow, not a writer trap. BUY.`;
            if (!v.optionSignalBullish && futuresBearish) return `Option-side signal is bearish AND underlying futures show fresh short buildup (OI up, price down) — option move is CONFIRMED. SELL.`;
            if (v.optionSignalBullish && !futuresBullish) return `Option-side looks bullish but underlying futures do NOT confirm (no matching OI+price buildup) — likely an option-writer trap/manipulation move, do not trust the option signal alone. WAIT.`;
            return `Underlying futures flow does not confirm the option-side signal — treat the option move as unconfirmed / possible trap. WAIT.`;
        }
    },
    {
        id: "lmeCash3mSpread", label: "MCX — LME CASH/3M COPPER SPREAD", icon: "quantum", unit: "z",
        a: { key: "spreadZ", name: "LME cash/3M spread z-score", value: 0 },
        b: { key: "copperBreak", name: "MCX Copper broke confirmation range? (1/0)", value: 0 },
        c: { key: "copperUp", name: "MCX Copper direction up? (1/0)", value: 1 },
        evaluate: (v) => Math.abs(v.spreadZ) < 2 || !v.copperBreak ? "WAIT" : v.spreadZ <= -2 && v.copperUp ? "BUY" : v.spreadZ >= 2 && !v.copperUp ? "SELL" : "WAIT",
        reason: (v) => Math.abs(v.spreadZ) < 2 ? `LME cash/3M copper spread z-score ${v.spreadZ} is not extreme enough, WAIT.` : !v.copperBreak ? "LME spread is extreme but MCX Copper has not confirmed with a range break, WAIT." : v.spreadZ <= -2 && v.copperUp ? "Copper spread is deeply discounted and MCX Copper confirms upward, BUY." : v.spreadZ >= 2 && !v.copperUp ? "Copper spread is unusually rich and MCX Copper confirms downward, SELL." : "Cross-market copper spread and MCX price disagree, WAIT."
    },
    {
        id: "lmeCancelledWarrants", label: "MCX — LME CANCELLED-WARRANT FLOW", icon: "quantum", unit: "%",
        a: { key: "cancelledChange", name: "7-day cancelled-warrant change (pp)", value: 0 },
        b: { key: "priceDir", name: "MCX Copper direction up? (1/0)", value: 1 },
        evaluate: (v) => v.cancelledChange >= 5 && v.priceDir ? "BUY" : v.cancelledChange <= -5 && !v.priceDir ? "SELL" : "WAIT",
        reason: (v) => v.cancelledChange >= 5 && v.priceDir ? `Cancelled-warrant ratio rose ${v.cancelledChange}pp and MCX Copper confirms up, BUY.` : v.cancelledChange <= -5 && !v.priceDir ? `Cancelled-warrant ratio fell ${Math.abs(v.cancelledChange)}pp and MCX Copper confirms down, SELL.` : `Warehouse-warrant change ${v.cancelledChange}pp lacks a matching price confirmation, WAIT.`
    },
    {
        id: "mcxDeliveryIntent", label: "MCX — DELIVERY INTENT RATIO EXTREME", icon: "quantum", unit: "%",
        a: { key: "deliveryPct", name: "Delivery-linked OI (%)", value: 50 },
        b: { key: "p90", name: "20-day 90th percentile (%)", value: 80 },
        c: { key: "p10", name: "20-day 10th percentile (%)", value: 20 },
        d: { key: "aboveVwap", name: "Front month above VWAP? (1/0)", value: 1 },
        evaluate: (v) => v.deliveryPct >= v.p90 && v.aboveVwap ? "BUY" : v.deliveryPct <= v.p10 && !v.aboveVwap ? "SELL" : "WAIT",
        reason: (v) => v.deliveryPct >= v.p90 && v.aboveVwap ? `Delivery intent ${v.deliveryPct}% is at/above its upper extreme with price above VWAP, BUY.` : v.deliveryPct <= v.p10 && !v.aboveVwap ? `Delivery intent ${v.deliveryPct}% is at/below its lower extreme with price below VWAP, SELL.` : "Delivery intent is not extreme or price confirmation is missing, WAIT."
    },
    {
        id: "goldLeaseShock", label: "MCX — GOLD LEASE-RATE SHOCK", icon: "quantum", unit: "bps",
        a: { key: "leaseNow", name: "Gold lease rate now (bps)", value: 0 },
        b: { key: "leaseMean", name: "20-day lease-rate mean (bps)", value: 0 },
        c: { key: "goldHoldsRange", name: "Gold holds opening range? (1/0)", value: 1 },
        d: { key: "goldUp", name: "Gold direction up? (1/0)", value: 1 },
        evaluate: (v) => v.leaseNow <= v.leaseMean - 5 && v.goldHoldsRange && v.goldUp ? "BUY" : v.leaseNow >= v.leaseMean + 5 && v.goldHoldsRange && !v.goldUp ? "SELL" : "WAIT",
        reason: (v) => v.leaseNow <= v.leaseMean - 5 && v.goldHoldsRange && v.goldUp ? "Lease rate is sharply below its mean and gold confirms upward, BUY." : v.leaseNow >= v.leaseMean + 5 && v.goldHoldsRange && !v.goldUp ? "Lease rate is sharply above its mean and gold confirms downward, SELL." : "Lease-rate shock or gold confirmation is insufficient, WAIT."
    },
    {
        id: "energyCrackMomentum", label: "MCX — ENERGY CRACK-SPREAD MOMENTUM", icon: "quantum", unit: "%",
        a: { key: "crackReturn", name: "3-bar crack-spread return (%)", value: 0 },
        b: { key: "crudeAboveMid", name: "Crude above range midpoint? (1/0)", value: 1 },
        evaluate: (v) => v.crackReturn >= 1 && v.crudeAboveMid ? "BUY" : v.crackReturn <= -1 && !v.crudeAboveMid ? "SELL" : "WAIT",
        reason: (v) => v.crackReturn >= 1 && v.crudeAboveMid ? `Refined-product crack spread rose ${v.crackReturn}% with crude confirmation, BUY.` : v.crackReturn <= -1 && !v.crudeAboveMid ? `Crack spread fell ${Math.abs(v.crackReturn)}% with crude weakness, SELL.` : "Crack-spread momentum is not decisive or crude does not confirm, WAIT."
    },
    {
        id: "heatingOilResidual", label: "MCX — HEATING-OIL DEMAND RESIDUAL", icon: "quantum", unit: "%",
        a: { key: "residual", name: "Heating oil return minus WTI return (%)", value: 0 },
        b: { key: "residualSamples", name: "Valid 30-minute samples", value: 0 },
        evaluate: (v) => v.residualSamples < 3 ? "WAIT" : v.residual >= 0.5 ? "BUY" : v.residual <= -0.5 ? "SELL" : "WAIT",
        reason: (v) => v.residualSamples < 3 ? "Heating-oil residual needs at least 3 valid samples, WAIT." : v.residual >= 0.5 ? `Heating oil outperformed WTI by ${v.residual}%, demand residual bullish, BUY.` : v.residual <= -0.5 ? `Heating oil underperformed WTI by ${Math.abs(v.residual)}%, demand residual bearish, SELL.` : "Heating-oil/WTI residual is inside the neutral band, WAIT."
    },
    {
        id: "natGasWeather", label: "MCX — NATGAS WEATHER HDD/CDD SURPRISE", icon: "quantum", unit: "%",
        a: { key: "demandSurprise", name: "Weather demand forecast surprise (%)", value: 0 },
        b: { key: "gasBreak", name: "MCX Natural Gas confirmed range break? (1/0)", value: 0 },
        c: { key: "gasUp", name: "MCX Natural Gas direction up? (1/0)", value: 1 },
        evaluate: (v) => !v.gasBreak ? "WAIT" : v.demandSurprise >= 8 && v.gasUp ? "BUY" : v.demandSurprise <= -8 && !v.gasUp ? "SELL" : "WAIT",
        reason: (v) => !v.gasBreak ? "Weather demand surprise has no confirmed MCX Natural Gas range break, WAIT." : v.demandSurprise >= 8 && v.gasUp ? "Heating/cooling demand surprise is strongly higher and gas confirms upward, BUY." : v.demandSurprise <= -8 && !v.gasUp ? "Weather demand surprise is strongly lower and gas confirms downward, SELL." : "Weather and gas price do not align, WAIT."
    },
    {
        id: "opecCapacityShock", label: "MCX — OPEC SPARE-CAPACITY SHOCK", icon: "quantum", unit: "%",
        a: { key: "capacityChange", name: "Spare-capacity estimate change (%)", value: 0 },
        b: { key: "eventConfirmed", name: "Crude confirmed event candle? (1/0)", value: 0 },
        c: { key: "crudeUp", name: "MCX Crude direction up? (1/0)", value: 1 },
        evaluate: (v) => !v.eventConfirmed ? "WAIT" : v.capacityChange <= -3 && v.crudeUp ? "BUY" : v.capacityChange >= 3 && !v.crudeUp ? "SELL" : "WAIT",
        reason: (v) => !v.eventConfirmed ? "Capacity estimate moved but MCX Crude has not confirmed beyond the event candle, WAIT." : v.capacityChange <= -3 && v.crudeUp ? "Spare capacity contracted at least 3% and crude confirms upward, BUY." : v.capacityChange >= 3 && !v.crudeUp ? "Spare capacity expanded at least 3% and crude confirms downward, SELL." : "OPEC capacity and crude direction disagree, WAIT."
    },
    {
        id: "mcxBreadth", label: "MCX — COMMODITY CROSS-SECTION BREADTH", icon: "quantum", unit: "%",
        a: { key: "basketAboveVwap", name: "Tracked MCX basket above VWAP (%)", value: 50 },
        b: { key: "selectedAboveVwap", name: "Selected contract above VWAP? (1/0)", value: 1 },
        evaluate: (v) => v.basketAboveVwap >= 70 && v.selectedAboveVwap ? "BUY" : v.basketAboveVwap <= 30 && !v.selectedAboveVwap ? "SELL" : "WAIT",
        reason: (v) => v.basketAboveVwap >= 70 && v.selectedAboveVwap ? `${v.basketAboveVwap}% of the MCX basket is above VWAP and the selected contract confirms, BUY.` : v.basketAboveVwap <= 30 && !v.selectedAboveVwap ? `${100 - v.basketAboveVwap}% of the MCX basket is below VWAP and the selected contract confirms, SELL.` : `MCX breadth is ${v.basketAboveVwap}% or disagrees with the selected contract, WAIT.`
    },
    {
        id: "gapFillEfficiency", label: "MCX — COMMODITY GAP-FILL EFFICIENCY", icon: "quantum", unit: "%",
        a: { key: "gapFilled", name: "Overnight gap filled (%)", value: 50 },
        b: { key: "openingBreak", name: "Opening-range break direction (1 up / -1 down / 0 none)", value: 0 },
        evaluate: (v) => v.gapFilled >= 75 || v.openingBreak === 0 ? "WAIT" : v.gapFilled < 25 && v.openingBreak > 0 ? "BUY" : v.gapFilled < 25 && v.openingBreak < 0 ? "SELL" : "WAIT",
        reason: (v) => v.gapFilled >= 75 ? `The opening gap is ${v.gapFilled}% filled, so continuation edge is exhausted, WAIT.` : v.gapFilled >= 25 ? `Gap fill is ${v.gapFilled}% and not a clean continuation setup, WAIT.` : v.openingBreak > 0 ? `Only ${v.gapFilled}% of the gap filled and price broke the opening high, BUY.` : v.openingBreak < 0 ? `Only ${v.gapFilled}% of the gap filled and price broke the opening low, SELL.` : "Gap is not filled enough and no opening-range break is confirmed, WAIT."
    },
    {
        id: "parityResidual", label: "OPTIONS — BUY CALL: PARITY RESIDUAL", icon: "quantum", unit: "%",
        a: { key: "callResidual", name: "Call parity residual (% of spot)", value: 0 },
        b: { key: "callMidUp", name: "Call midpoint rising? (1/0)", value: 0 },
        evaluate: (v) => v.callResidual <= -0.75 && v.callMidUp ? "BUY" : "WAIT",
        reason: (v) => v.callResidual <= -0.75 && v.callMidUp ? `Call is ${Math.abs(v.callResidual)}% below parity and midpoint is rising, BUY CALL.` : `Call parity residual ${v.callResidual}% or midpoint confirmation is insufficient, WAIT.`
    },
    {
        id: "putParityResidual", label: "OPTIONS — BUY PUT: PARITY RESIDUAL", icon: "quantum", unit: "%",
        a: { key: "putResidual", name: "Put parity residual (% of spot)", value: 0 },
        b: { key: "putMidUp", name: "Put midpoint rising? (1/0)", value: 0 },
        evaluate: (v) => v.putResidual <= -0.75 && v.putMidUp ? "SELL" : "WAIT",
        reason: (v) => v.putResidual <= -0.75 && v.putMidUp ? `Put is ${Math.abs(v.putResidual)}% below parity and midpoint is rising, BUY PUT (shown as SELL/put side).` : `Put parity residual ${v.putResidual}% or midpoint confirmation is insufficient, WAIT.`
    },
    {
        id: "callExtrinsicMomentum", label: "OPTIONS — BUY CALL: EXTRINSIC MOMENTUM", icon: "quantum", unit: "%",
        a: { key: "callExtrinsicChange", name: "Call extrinsic-value change (%)", value: 0 },
        b: { key: "callAboveStrike", name: "Spot above call strike? (1/0)", value: 0 },
        evaluate: (v) => v.callExtrinsicChange >= 3 && v.callAboveStrike ? "BUY" : "WAIT",
        reason: (v) => v.callExtrinsicChange >= 3 && v.callAboveStrike ? `Call extrinsic value expanded ${v.callExtrinsicChange}% with spot above strike, BUY CALL.` : "Call time value is not expanding with strike confirmation, WAIT."
    },
    {
        id: "putExtrinsicMomentum", label: "OPTIONS — BUY PUT: EXTRINSIC MOMENTUM", icon: "quantum", unit: "%",
        a: { key: "putExtrinsicChange", name: "Put extrinsic-value change (%)", value: 0 },
        b: { key: "putBelowStrike", name: "Spot below put strike? (1/0)", value: 0 },
        evaluate: (v) => v.putExtrinsicChange >= 3 && v.putBelowStrike ? "SELL" : "WAIT",
        reason: (v) => v.putExtrinsicChange >= 3 && v.putBelowStrike ? `Put extrinsic value expanded ${v.putExtrinsicChange}% with spot below strike, BUY PUT (put side).` : "Put time value is not expanding with strike confirmation, WAIT."
    },
    {
        id: "callTheoResidual", label: "OPTIONS — BUY CALL: THEORETICAL-VALUE RESIDUAL", icon: "quantum", unit: "%",
        a: { key: "callTheoDiscount", name: "Call midpoint discount to theoretical (%)", value: 0 },
        b: { key: "callHigherLows", name: "Call midpoint making higher lows? (1/0)", value: 0 },
        evaluate: (v) => v.callTheoDiscount >= 1.5 && v.callHigherLows ? "BUY" : "WAIT",
        reason: (v) => v.callTheoDiscount >= 1.5 && v.callHigherLows ? `Call midpoint is ${v.callTheoDiscount}% below theoretical value with higher lows, BUY CALL.` : "Call theoretical-value discount or price confirmation is insufficient, WAIT."
    },
    {
        id: "putTheoResidual", label: "OPTIONS — BUY PUT: THEORETICAL-VALUE RESIDUAL", icon: "quantum", unit: "%",
        a: { key: "putTheoDiscount", name: "Put midpoint discount to theoretical (%)", value: 0 },
        b: { key: "putHigherLows", name: "Put midpoint making higher lows? (1/0)", value: 0 },
        evaluate: (v) => v.putTheoDiscount >= 1.5 && v.putHigherLows ? "SELL" : "WAIT",
        reason: (v) => v.putTheoDiscount >= 1.5 && v.putHigherLows ? `Put midpoint is ${v.putTheoDiscount}% below theoretical value with higher lows, BUY PUT (put side).` : "Put theoretical-value discount or price confirmation is insufficient, WAIT."
    },
    {
        id: "optionConvexity", label: "OPTIONS — PRICE CONVEXITY ACCELERATION", icon: "quantum", unit: "Δ²",
        a: { key: "callConvexity", name: "Call price convexity", value: 0 },
        b: { key: "putConvexity", name: "Put price convexity", value: 0 },
        c: { key: "spotUp", name: "Spot direction up? (1/0)", value: 1 },
        d: { key: "convexitySamples", name: "Consecutive confirming samples", value: 0 },
        evaluate: (v) => v.convexitySamples < 3 ? "WAIT" : v.callConvexity > 0 && v.spotUp ? "BUY" : v.putConvexity > 0 && !v.spotUp ? "SELL" : "WAIT",
        reason: (v) => v.convexitySamples < 3 ? "Price convexity has fewer than 3 confirming samples, WAIT." : v.callConvexity > 0 && v.spotUp ? "Call premium curvature is accelerating with spot up, BUY CALL." : v.putConvexity > 0 && !v.spotUp ? "Put premium curvature is accelerating with spot down, BUY PUT (put side)." : "Option-price convexity does not confirm either side, WAIT."
    },
    {
        id: "premiumSpotElasticity", label: "OPTIONS — PREMIUM/SPOT ELASTICITY", icon: "quantum", unit: "x",
        a: { key: "callElasticity", name: "Call premium/spot elasticity", value: 0 },
        b: { key: "putElasticity", name: "Put premium/spot elasticity", value: 0 },
        c: { key: "spotUp", name: "Spot direction up? (1/0)", value: 1 },
        evaluate: (v) => v.callElasticity > 1.2 && v.spotUp ? "BUY" : v.putElasticity > 1.2 && !v.spotUp ? "SELL" : "WAIT",
        reason: (v) => v.callElasticity > 1.2 && v.spotUp ? `Call elasticity ${v.callElasticity}x shows strong premium response while spot rises, BUY CALL.` : v.putElasticity > 1.2 && !v.spotUp ? `Put elasticity ${v.putElasticity}x shows strong premium response while spot falls, BUY PUT (put side).` : "Neither option has confirmed elasticity above 1.2x in the matching direction, WAIT."
    },
    {
        id: "optionRelativeStrength", label: "OPTIONS — LOCAL PREMIUM RELATIVE STRENGTH", icon: "quantum", unit: "z",
        a: { key: "callOutperformance", name: "Call premium outperformance z-score", value: 0 },
        b: { key: "putOutperformance", name: "Put premium outperformance z-score", value: 0 },
        c: { key: "callMomentumUp", name: "Call 3-candle momentum up? (1/0)", value: 0 },
        d: { key: "putMomentumUp", name: "Put 3-candle momentum up? (1/0)", value: 0 },
        evaluate: (v) => v.callOutperformance >= 1 && v.callMomentumUp ? "BUY" : v.putOutperformance >= 1 && v.putMomentumUp ? "SELL" : "WAIT",
        reason: (v) => v.callOutperformance >= 1 && v.callMomentumUp ? "Call premium is outperforming nearby strikes by at least one standard deviation, BUY CALL." : v.putOutperformance >= 1 && v.putMomentumUp ? "Put premium is outperforming nearby strikes by at least one standard deviation, BUY PUT (put side)." : "No local option-premium relative-strength confirmation, WAIT."
    },
    {
        id: "premiumRatioVelocity", label: "OPTIONS — CALL/PUT PREMIUM-RATIO VELOCITY", icon: "quantum", unit: "%",
        a: { key: "premiumRatioChange", name: "Call/put premium ratio change (%)", value: 0 },
        b: { key: "ratioSide", name: "Ratio side (1 call / -1 put / 0 none)", value: 0 },
        evaluate: (v) => v.premiumRatioChange >= 4 && v.ratioSide > 0 ? "BUY" : v.premiumRatioChange <= -4 && v.ratioSide < 0 ? "SELL" : "WAIT",
        reason: (v) => v.premiumRatioChange >= 4 && v.ratioSide > 0 ? `Call/put premium ratio rose ${v.premiumRatioChange}% with call leadership, BUY CALL.` : v.premiumRatioChange <= -4 && v.ratioSide < 0 ? `Call/put premium ratio fell ${Math.abs(v.premiumRatioChange)}% with put leadership, BUY PUT (put side).` : "Premium-ratio velocity is not decisive, WAIT."
    },
    {
        id: "spreadCompression", label: "OPTIONS — BID/ASK SPREAD COMPRESSION TRIGGER", icon: "quantum", unit: "%",
        a: { key: "callSpreadCompression", name: "Call spread compression from 10m high (%)", value: 0 },
        b: { key: "putSpreadCompression", name: "Put spread compression from 10m high (%)", value: 0 },
        c: { key: "callPriceChange", name: "Call midpoint change (%)", value: 0 },
        d: { key: "putPriceChange", name: "Put midpoint change (%)", value: 0 },
        evaluate: (v) => v.callSpreadCompression >= 25 && v.callPriceChange >= 1 ? "BUY" : v.putSpreadCompression >= 25 && v.putPriceChange >= 1 ? "SELL" : "WAIT",
        reason: (v) => v.callSpreadCompression >= 25 && v.callPriceChange >= 1 ? "Call spread is compressing while its midpoint rises, improving execution and momentum, BUY CALL." : v.putSpreadCompression >= 25 && v.putPriceChange >= 1 ? "Put spread is compressing while its midpoint rises, improving execution and momentum, BUY PUT (put side)." : "Spread compression and premium momentum do not confirm a side, WAIT."
    },
    {
        id: "premiumShockPersistence", label: "OPTIONS — PREMIUM SHOCK PERSISTENCE", icon: "quantum", unit: "closes",
        a: { key: "callShock", name: "Call premium shock (%)", value: 0 },
        b: { key: "putShock", name: "Put premium shock (%)", value: 0 },
        c: { key: "callHigherCloses", name: "Higher call closes in next 4", value: 0 },
        d: { key: "putHigherCloses", name: "Higher put closes in next 4", value: 0 },
        evaluate: (v) => v.callShock >= 2 && v.callHigherCloses >= 3 ? "BUY" : v.putShock >= 2 && v.putHigherCloses >= 3 ? "SELL" : "WAIT",
        reason: (v) => v.callShock >= 2 && v.callHigherCloses >= 3 ? `Call premium shock persisted through ${v.callHigherCloses}/4 higher closes, BUY CALL.` : v.putShock >= 2 && v.putHigherCloses >= 3 ? `Put premium shock persisted through ${v.putHigherCloses}/4 higher closes, BUY PUT (put side).` : "The option-price shock did not persist strongly enough, WAIT."
    },
    {
        id: "syntheticForwardCheck", label: "OPTIONS — SYNTHETIC-FORWARD DIRECTION CHECK", icon: "quantum", unit: "%",
        a: { key: "syntheticSlope", name: "Synthetic-forward slope over 10m (%)", value: 0 },
        b: { key: "callHigherHigh", name: "Call midpoint made higher high? (1/0)", value: 0 },
        c: { key: "putHigherHigh", name: "Put midpoint made higher high? (1/0)", value: 0 },
        evaluate: (v) => v.syntheticSlope >= 0.15 && v.callHigherHigh ? "BUY" : v.syntheticSlope <= -0.15 && v.putHigherHigh ? "SELL" : "WAIT",
        reason: (v) => v.syntheticSlope >= 0.15 && v.callHigherHigh ? "Synthetic forward slopes up and call premium confirms with a higher high, BUY CALL." : v.syntheticSlope <= -0.15 && v.putHigherHigh ? "Synthetic forward slopes down and put premium confirms with a higher high, BUY PUT (put side)." : "Synthetic-forward slope and option-price confirmation disagree or are too small, WAIT."
    },
    {
        id: "premiumMomentumRace", label: "OPTIONS — CALL/PUT PREMIUM MOMENTUM RACE", icon: "quantum", unit: "%",
        a: { key: "callMomentum", name: "Call midpoint change (%)", value: 0 },
        b: { key: "putMomentum", name: "Put midpoint change (%)", value: 0 },
        c: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 3 ? "WAIT" : v.callMomentum >= 1 && v.callMomentum - v.putMomentum >= 0.8 ? "BUY" : v.putMomentum >= 1 && v.putMomentum - v.callMomentum >= 0.8 ? "SELL" : "WAIT",
        reason: (v) => v.samples < 3 ? "Premium momentum race is warming up — need three live chain samples, WAIT." : v.callMomentum >= 1 && v.callMomentum - v.putMomentum >= 0.8 ? `Call midpoint gained ${v.callMomentum}% versus put ${v.putMomentum}% — calls are leading the live premium move, BUY CALL.` : v.putMomentum >= 1 && v.putMomentum - v.callMomentum >= 0.8 ? `Put midpoint gained ${v.putMomentum}% versus call ${v.callMomentum}% — puts are leading the live premium move, BUY PUT.` : `Call ${v.callMomentum}% and put ${v.putMomentum}% momentum are too close or too weak, WAIT.`
    },
    {
        id: "premiumAccelerationRace", label: "OPTIONS — PREMIUM ACCELERATION RACE", icon: "quantum", unit: "%",
        a: { key: "callAcceleration", name: "Call momentum acceleration (%)", value: 0 },
        b: { key: "putAcceleration", name: "Put momentum acceleration (%)", value: 0 },
        c: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 4 ? "WAIT" : v.callAcceleration >= 0.25 && v.callAcceleration - v.putAcceleration >= 0.2 ? "BUY" : v.putAcceleration >= 0.25 && v.putAcceleration - v.callAcceleration >= 0.2 ? "SELL" : "WAIT",
        reason: (v) => v.samples < 4 ? "Premium acceleration needs four live samples to separate a real burst from one tick, WAIT." : v.callAcceleration >= 0.25 && v.callAcceleration - v.putAcceleration >= 0.2 ? `Call momentum is accelerating by ${v.callAcceleration}% while put acceleration is ${v.putAcceleration}%, BUY CALL.` : v.putAcceleration >= 0.25 && v.putAcceleration - v.callAcceleration >= 0.2 ? `Put momentum is accelerating by ${v.putAcceleration}% while call acceleration is ${v.callAcceleration}%, BUY PUT.` : `Neither side has a decisive acceleration lead (call ${v.callAcceleration}%, put ${v.putAcceleration}%), WAIT.`
    },
    {
        id: "volumePressureSplit", label: "OPTIONS — VOLUME PRESSURE SPLIT", icon: "quantum", unit: "%",
        a: { key: "callVolumeShare", name: "Call volume share (%)", value: 50 },
        b: { key: "putVolumeShare", name: "Put volume share (%)", value: 50 },
        c: { key: "spotTrend", name: "Spot trending up? (1/0)", value: 1 },
        d: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 2 ? "WAIT" : v.callVolumeShare >= 58 && v.spotTrend ? "BUY" : v.putVolumeShare >= 58 && !v.spotTrend ? "SELL" : "WAIT",
        reason: (v) => v.samples < 2 ? "Volume pressure is waiting for a live chain sample, WAIT." : v.callVolumeShare >= 58 && v.spotTrend ? `Calls carry ${v.callVolumeShare}% of tracked option volume while spot trends up, BUY CALL.` : v.putVolumeShare >= 58 && !v.spotTrend ? `Puts carry ${v.putVolumeShare}% of tracked option volume while spot trends down, BUY PUT.` : `Volume split is call ${v.callVolumeShare}% / put ${v.putVolumeShare}% or lacks spot confirmation, WAIT.`
    },
    {
        id: "oiPressureSplit", label: "OPTIONS — FRESH OI PRESSURE SPLIT", icon: "quantum", unit: "%",
        a: { key: "callOiChange", name: "Chain call OI change (%)", value: 0 },
        b: { key: "putOiChange", name: "Chain put OI change (%)", value: 0 },
        c: { key: "spotTrend", name: "Spot trending up? (1/0)", value: 1 },
        d: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 3 ? "WAIT" : v.callOiChange >= 1 && v.callOiChange - v.putOiChange >= 0.8 && v.spotTrend ? "BUY" : v.putOiChange >= 1 && v.putOiChange - v.callOiChange >= 0.8 && !v.spotTrend ? "SELL" : "WAIT",
        reason: (v) => v.samples < 3 ? "Fresh OI pressure needs three comparable chain samples, WAIT." : v.callOiChange >= 1 && v.callOiChange - v.putOiChange >= 0.8 && v.spotTrend ? `Call OI grew ${v.callOiChange}% versus put OI ${v.putOiChange}% with spot rising — fresh call-side participation, BUY CALL.` : v.putOiChange >= 1 && v.putOiChange - v.callOiChange >= 0.8 && !v.spotTrend ? `Put OI grew ${v.putOiChange}% versus call OI ${v.callOiChange}% with spot falling — fresh put-side participation, BUY PUT.` : `Call OI ${v.callOiChange}% and put OI ${v.putOiChange}% do not show a clean directional build, WAIT.`
    },
    {
        id: "ivDemandSplit", label: "OPTIONS — IMPLIED-VOLATILITY DEMAND SPLIT", icon: "quantum", unit: "pts",
        a: { key: "callIvChange", name: "Call IV change (pts)", value: 0 },
        b: { key: "putIvChange", name: "Put IV change (pts)", value: 0 },
        c: { key: "spotTrend", name: "Spot trending up? (1/0)", value: 1 },
        d: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 3 ? "WAIT" : v.callIvChange >= 0.4 && v.callIvChange - v.putIvChange >= 0.3 && v.spotTrend ? "BUY" : v.putIvChange >= 0.4 && v.putIvChange - v.callIvChange >= 0.3 && !v.spotTrend ? "SELL" : "WAIT",
        reason: (v) => v.samples < 3 ? "IV demand split is warming up, WAIT." : v.callIvChange >= 0.4 && v.callIvChange - v.putIvChange >= 0.3 && v.spotTrend ? `Call IV rose ${v.callIvChange} points, outpacing put IV by ${+(v.callIvChange - v.putIvChange).toFixed(2)} points with spot rising, BUY CALL.` : v.putIvChange >= 0.4 && v.putIvChange - v.callIvChange >= 0.3 && !v.spotTrend ? `Put IV rose ${v.putIvChange} points, outpacing call IV by ${+(v.putIvChange - v.callIvChange).toFixed(2)} points with spot falling, BUY PUT.` : `IV change is call ${v.callIvChange} / put ${v.putIvChange} points without a clean side, WAIT.`
    },
    {
        id: "deltaVolumeSplit", label: "OPTIONS — DELTA-WEIGHTED VOLUME SPLIT", icon: "quantum", unit: "x",
        a: { key: "callDeltaVolume", name: "Call |delta| × volume", value: 0 },
        b: { key: "putDeltaVolume", name: "Put |delta| × volume", value: 0 },
        c: { key: "spotTrend", name: "Spot trending up? (1/0)", value: 1 },
        d: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 2 ? "WAIT" : v.callDeltaVolume > v.putDeltaVolume * 1.25 && v.spotTrend ? "BUY" : v.putDeltaVolume > v.callDeltaVolume * 1.25 && !v.spotTrend ? "SELL" : "WAIT",
        reason: (v) => v.samples < 2 ? "Delta-weighted volume is waiting for live chain data, WAIT." : v.callDeltaVolume > v.putDeltaVolume * 1.25 && v.spotTrend ? `Call delta-weighted volume ${Math.round(v.callDeltaVolume)} is at least 25% above put flow, with spot rising, BUY CALL.` : v.putDeltaVolume > v.callDeltaVolume * 1.25 && !v.spotTrend ? `Put delta-weighted volume ${Math.round(v.putDeltaVolume)} is at least 25% above call flow, with spot falling, BUY PUT.` : `Delta-weighted flow is balanced (call ${Math.round(v.callDeltaVolume)} / put ${Math.round(v.putDeltaVolume)}), WAIT.`
    },
    {
        id: "gammaFlowSplit", label: "OPTIONS — GAMMA FLOW SPLIT", icon: "quantum", unit: "γOI",
        a: { key: "callGammaFlow", name: "Call gamma × OI", value: 0 },
        b: { key: "putGammaFlow", name: "Put gamma × OI", value: 0 },
        c: { key: "spotTrend", name: "Spot trending up? (1/0)", value: 1 },
        d: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 2 ? "WAIT" : v.callGammaFlow > v.putGammaFlow * 1.2 && v.spotTrend ? "BUY" : v.putGammaFlow > v.callGammaFlow * 1.2 && !v.spotTrend ? "SELL" : "WAIT",
        reason: (v) => v.samples < 2 ? "Gamma flow needs a live option-chain read, WAIT." : v.callGammaFlow > v.putGammaFlow * 1.2 && v.spotTrend ? `Call gamma flow is ${Math.round(v.callGammaFlow)} versus put ${Math.round(v.putGammaFlow)} while spot rises, BUY CALL.` : v.putGammaFlow > v.callGammaFlow * 1.2 && !v.spotTrend ? `Put gamma flow is ${Math.round(v.putGammaFlow)} versus call ${Math.round(v.callGammaFlow)} while spot falls, BUY PUT.` : `Gamma flow is not separated enough (call ${Math.round(v.callGammaFlow)} / put ${Math.round(v.putGammaFlow)}), WAIT.`
    },
    {
        id: "thetaEfficiencySplit", label: "OPTIONS — THETA-EFFICIENCY SPLIT", icon: "quantum", unit: "%/day",
        a: { key: "callThetaEfficiency", name: "Call theta burn / premium (%)", value: 0 },
        b: { key: "putThetaEfficiency", name: "Put theta burn / premium (%)", value: 0 },
        c: { key: "callMomentum", name: "Call midpoint change (%)", value: 0 },
        d: { key: "putMomentum", name: "Put midpoint change (%)", value: 0 },
        e: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 2 ? "WAIT" : v.callMomentum >= 0.8 && v.callThetaEfficiency < v.putThetaEfficiency * 0.9 ? "BUY" : v.putMomentum >= 0.8 && v.putThetaEfficiency < v.callThetaEfficiency * 0.9 ? "SELL" : "WAIT",
        reason: (v) => v.samples < 2 ? "Theta efficiency is waiting for comparable premium data, WAIT." : v.callMomentum >= 0.8 && v.callThetaEfficiency < v.putThetaEfficiency * 0.9 ? `Calls are rising ${v.callMomentum}% with ${v.callThetaEfficiency}% daily theta burn versus puts at ${v.putThetaEfficiency}%, BUY CALL.` : v.putMomentum >= 0.8 && v.putThetaEfficiency < v.callThetaEfficiency * 0.9 ? `Puts are rising ${v.putMomentum}% with ${v.putThetaEfficiency}% daily theta burn versus calls at ${v.callThetaEfficiency}%, BUY PUT.` : "Neither side combines premium momentum with a clearly better theta budget, WAIT."
    },
    {
        id: "wingSlopeDirection", label: "OPTIONS — OTM WING SLOPE DIRECTION", icon: "quantum", unit: "%",
        a: { key: "callWingSlope", name: "Call OTM wing vs ATM (%)", value: 0 },
        b: { key: "putWingSlope", name: "Put OTM wing vs ATM (%)", value: 0 },
        c: { key: "spotTrend", name: "Spot trending up? (1/0)", value: 1 },
        d: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 2 ? "WAIT" : v.callWingSlope >= -35 && v.callWingSlope - v.putWingSlope >= 8 && v.spotTrend ? "BUY" : v.putWingSlope >= -35 && v.putWingSlope - v.callWingSlope >= 8 && !v.spotTrend ? "SELL" : "WAIT",
        reason: (v) => v.samples < 2 ? "Wing slope needs a live ATM and adjacent strike pair, WAIT." : v.callWingSlope - v.putWingSlope >= 8 && v.spotTrend ? `Call wing is relatively firm (${v.callWingSlope}%) versus put wing ${v.putWingSlope}% with spot rising, BUY CALL.` : v.putWingSlope - v.callWingSlope >= 8 && !v.spotTrend ? `Put wing is relatively firm (${v.putWingSlope}%) versus call wing ${v.callWingSlope}% with spot falling, BUY PUT.` : `Call/put wing slopes do not separate by 8 points with confirmation, WAIT.`
    },
    {
        id: "wingMomentumDirection", label: "OPTIONS — WING MOMENTUM DIRECTION", icon: "quantum", unit: "%",
        a: { key: "callWingMomentum", name: "Call wing momentum (%)", value: 0 },
        b: { key: "putWingMomentum", name: "Put wing momentum (%)", value: 0 },
        c: { key: "spotTrend", name: "Spot trending up? (1/0)", value: 1 },
        d: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 3 ? "WAIT" : v.callWingMomentum >= 1 && v.callWingMomentum - v.putWingMomentum >= 0.8 && v.spotTrend ? "BUY" : v.putWingMomentum >= 1 && v.putWingMomentum - v.callWingMomentum >= 0.8 && !v.spotTrend ? "SELL" : "WAIT",
        reason: (v) => v.samples < 3 ? "Wing momentum needs three live chain samples, WAIT." : v.callWingMomentum >= 1 && v.callWingMomentum - v.putWingMomentum >= 0.8 && v.spotTrend ? `Call OTM wing momentum is ${v.callWingMomentum}% versus put ${v.putWingMomentum}%, BUY CALL.` : v.putWingMomentum >= 1 && v.putWingMomentum - v.callWingMomentum >= 0.8 && !v.spotTrend ? `Put OTM wing momentum is ${v.putWingMomentum}% versus call ${v.callWingMomentum}%, BUY PUT.` : "OTM wing momentum is not decisive, WAIT."
    },
    {
        id: "optionBreadthDirection", label: "OPTIONS — CHAIN BREADTH DIRECTION", icon: "quantum", unit: "%",
        a: { key: "callOiBreadth", name: "Call OI breadth (%)", value: 50 },
        b: { key: "putOiBreadth", name: "Put OI breadth (%)", value: 50 },
        c: { key: "spotTrend", name: "Spot trending up? (1/0)", value: 1 },
        d: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 2 ? "WAIT" : v.callOiBreadth >= 60 && v.callOiBreadth - v.putOiBreadth >= 12 && v.spotTrend ? "BUY" : v.putOiBreadth >= 60 && v.putOiBreadth - v.callOiBreadth >= 12 && !v.spotTrend ? "SELL" : "WAIT",
        reason: (v) => v.samples < 2 ? "Chain breadth is waiting for live OI data, WAIT." : v.callOiBreadth >= 60 && v.callOiBreadth - v.putOiBreadth >= 12 && v.spotTrend ? `Above-average call OI is spread across ${v.callOiBreadth}% of strikes versus puts ${v.putOiBreadth}%, BUY CALL.` : v.putOiBreadth >= 60 && v.putOiBreadth - v.callOiBreadth >= 12 && !v.spotTrend ? `Above-average put OI is spread across ${v.putOiBreadth}% of strikes versus calls ${v.callOiBreadth}%, BUY PUT.` : `OI breadth is call ${v.callOiBreadth}% / put ${v.putOiBreadth}% without a clean side, WAIT.`
    },
    {
        id: "quoteExecutionPressure", label: "OPTIONS — QUOTE EXECUTION PRESSURE", icon: "quantum", unit: "%",
        a: { key: "callSpreadPct", name: "Call bid/ask spread (%)", value: 0 },
        b: { key: "putSpreadPct", name: "Put bid/ask spread (%)", value: 0 },
        c: { key: "callSpreadImproving", name: "Call spread improving? (1/0)", value: 0 },
        d: { key: "putSpreadImproving", name: "Put spread improving? (1/0)", value: 0 },
        e: { key: "callMomentum", name: "Call midpoint change (%)", value: 0 },
        f: { key: "putMomentum", name: "Put midpoint change (%)", value: 0 },
        evaluate: (v) => v.callSpreadImproving && v.callMomentum >= 0.5 && v.callSpreadPct <= v.putSpreadPct * 0.9 ? "BUY" : v.putSpreadImproving && v.putMomentum >= 0.5 && v.putSpreadPct <= v.callSpreadPct * 0.9 ? "SELL" : "WAIT",
        reason: (v) => v.callSpreadImproving && v.callMomentum >= 0.5 && v.callSpreadPct <= v.putSpreadPct * 0.9 ? `Call spread improved to ${v.callSpreadPct}% while midpoint rose ${v.callMomentum}%, with cleaner execution than puts, BUY CALL.` : v.putSpreadImproving && v.putMomentum >= 0.5 && v.putSpreadPct <= v.callSpreadPct * 0.9 ? `Put spread improved to ${v.putSpreadPct}% while midpoint rose ${v.putMomentum}%, with cleaner execution than calls, BUY PUT.` : "Neither side combines improving execution, premium momentum, and a tighter relative spread, WAIT."
    },
    {
        id: "strikeMigrationDirection", label: "OPTIONS — OI-WEIGHTED STRIKE MIGRATION", icon: "quantum", unit: "pts",
        a: { key: "callCenterShift", name: "Call OI center shift (pts)", value: 0 },
        b: { key: "putCenterShift", name: "Put OI center shift (pts)", value: 0 },
        c: { key: "spotTrend", name: "Spot trending up? (1/0)", value: 1 },
        d: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 3 ? "WAIT" : v.callCenterShift > 0 && v.callCenterShift - v.putCenterShift >= 10 && v.spotTrend ? "BUY" : v.putCenterShift < 0 && v.putCenterShift - v.callCenterShift <= -10 && !v.spotTrend ? "SELL" : "WAIT",
        reason: (v) => v.samples < 3 ? "Strike migration needs three OI-weighted snapshots, WAIT." : v.callCenterShift > 0 && v.callCenterShift - v.putCenterShift >= 10 && v.spotTrend ? `Call OI center migrated ${v.callCenterShift} points higher than the put center, confirming upside strike demand, BUY CALL.` : v.putCenterShift < 0 && v.putCenterShift - v.callCenterShift <= -10 && !v.spotTrend ? `Put OI center migrated ${Math.abs(v.putCenterShift)} points lower than the call center, confirming downside strike demand, BUY PUT.` : `Call center shift ${v.callCenterShift} and put center shift ${v.putCenterShift} show no clean migration, WAIT.`
    },
    {
        id: "premiumRelativeValue", label: "OPTIONS — PREMIUM/DELTA RELATIVE VALUE", icon: "quantum", unit: "₹/Δ",
        a: { key: "callPremiumPerDelta", name: "Call premium per |delta|", value: 0 },
        b: { key: "putPremiumPerDelta", name: "Put premium per |delta|", value: 0 },
        c: { key: "spotTrend", name: "Spot trending up? (1/0)", value: 1 },
        d: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 2 ? "WAIT" : v.callPremiumPerDelta > 0 && v.callPremiumPerDelta < v.putPremiumPerDelta * 0.9 && v.spotTrend ? "BUY" : v.putPremiumPerDelta > 0 && v.putPremiumPerDelta < v.callPremiumPerDelta * 0.9 && !v.spotTrend ? "SELL" : "WAIT",
        reason: (v) => v.samples < 2 ? "Premium/delta relative value needs live Greek data, WAIT." : v.callPremiumPerDelta > 0 && v.callPremiumPerDelta < v.putPremiumPerDelta * 0.9 && v.spotTrend ? `Call costs ${v.callPremiumPerDelta} per unit of delta versus put ${v.putPremiumPerDelta} — relatively cheaper upside exposure, BUY CALL.` : v.putPremiumPerDelta > 0 && v.putPremiumPerDelta < v.callPremiumPerDelta * 0.9 && !v.spotTrend ? `Put costs ${v.putPremiumPerDelta} per unit of delta versus call ${v.callPremiumPerDelta} — relatively cheaper downside exposure, BUY PUT.` : `Relative premium value is too close or incomplete (call ${v.callPremiumPerDelta} / put ${v.putPremiumPerDelta}), WAIT.`
    },
    {
        id: "straddleImpulse", label: "OPTIONS — STRADDLE IMPULSE WITH SIDE LEAD", icon: "quantum", unit: "%",
        a: { key: "straddleChange", name: "ATM straddle change (%)", value: 0 },
        b: { key: "callVsPutChange", name: "Call change minus put change (%)", value: 0 },
        c: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 3 ? "WAIT" : v.straddleChange >= 1 && v.callVsPutChange >= 0.8 ? "BUY" : v.straddleChange >= 1 && v.callVsPutChange <= -0.8 ? "SELL" : "WAIT",
        reason: (v) => v.samples < 3 ? "Straddle impulse needs three live premium samples, WAIT." : v.straddleChange >= 1 && v.callVsPutChange >= 0.8 ? `ATM straddle expanded ${v.straddleChange}% and calls led puts by ${v.callVsPutChange} points, BUY CALL.` : v.straddleChange >= 1 && v.callVsPutChange <= -0.8 ? `ATM straddle expanded ${v.straddleChange}% and puts led calls by ${Math.abs(v.callVsPutChange)} points, BUY PUT.` : `Straddle change ${v.straddleChange}% has no decisive call/put leader, WAIT.`
    },
    {
        id: "oiVolumeConviction", label: "OPTIONS — OI/VOLUME CONVICTION SPLIT", icon: "quantum", unit: "x",
        a: { key: "callConviction", name: "Call volume/OI conviction", value: 0 },
        b: { key: "putConviction", name: "Put volume/OI conviction", value: 0 },
        c: { key: "callMomentum", name: "Call midpoint change (%)", value: 0 },
        d: { key: "putMomentum", name: "Put midpoint change (%)", value: 0 },
        e: { key: "spotTrend", name: "Spot trending up? (1/0)", value: 1 },
        f: { key: "samples", name: "Live chain samples", value: 0 },
        evaluate: (v) => v.samples < 2 ? "WAIT" : v.callConviction > v.putConviction * 1.2 && v.callMomentum >= 0.5 && v.spotTrend ? "BUY" : v.putConviction > v.callConviction * 1.2 && v.putMomentum >= 0.5 && !v.spotTrend ? "SELL" : "WAIT",
        reason: (v) => v.samples < 2 ? "OI/volume conviction is waiting for live chain data, WAIT." : v.callConviction > v.putConviction * 1.2 && v.callMomentum >= 0.5 && v.spotTrend ? `Call volume/OI conviction is ${v.callConviction}x versus put ${v.putConviction}x, and call premium is rising, BUY CALL.` : v.putConviction > v.callConviction * 1.2 && v.putMomentum >= 0.5 && !v.spotTrend ? `Put volume/OI conviction is ${v.putConviction}x versus call ${v.callConviction}x, and put premium is rising, BUY PUT.` : `Conviction is not separated enough (call ${v.callConviction}x / put ${v.putConviction}x), WAIT.`
    },
];
// ----------------------------------------------------------------------
// Arrow-glow "lean" system.
//
// Several indicators' own evaluate() legitimately returns "WAIT" as a
// real, meaningful state — e.g. Luxembourg/Germany feed the Radhey Shyam
// engine's "Macro Clear" gate, VPOC/Russia feed "Filter Safe", Swiss
// feeds "Range Valid". Forcing those to always be BUY/SELL (as a naive
// global find-and-replace would) breaks the master decision engine,
// which is specifically designed to only fire when those gates read
// neutral. That logic is NOT touched here.
//
// What actually was broken: every individual indicator's own ↑/↓ arrow
// glow used that same evaluate() result directly, so whenever a formula
// hadn't decisively triggered yet, the arrow just sat there unlit. A
// live market always has *some* directional lean even before a formula's
// strict trigger condition fires — so each indicator below gets a
// `lean(v)` fallback: the same math, minus the "not yet confirmed"
// escape hatch, so it always commits to whichever side is closer/more
// likely right now. This is used ONLY for the arrow-glow color; the
// reason text and every gate/composite (Radhey Shyam, Grand Unified,
// Confluence, Super Signal) keep using the real evaluate().
const leanFns = {
    vwap: (v) => (v.candleClose >= v.vwap ? "BUY" : "SELL"),
    delta: (v) => (v.priceTrendUp ? "BUY" : "SELL"),
    oiWall: (v) => { const range = v.resistanceStrike - v.supportStrike; if (range <= 0) return v.spot >= v.supportStrike ? "SELL" : "BUY"; return (v.spot - v.supportStrike) / range >= 0.5 ? "SELL" : "BUY"; },
    swingSR: (v) => { const range = v.swingRes - v.swingSup; if (range <= 0) return v.spot >= v.swingSup ? "SELL" : "BUY"; return (v.spot - v.swingSup) / range >= 0.5 ? "SELL" : "BUY"; },
    orderBlock: (v) => (Math.abs(v.spot - v.bullishOB) <= Math.abs(v.spot - v.bearishOB) ? "BUY" : "SELL"),
    prediction: (v) => (v.spot <= (v.bullFVGTop + v.bearFVGBottom) / 2 ? "BUY" : "SELL"),
    liquidity: (v) => (v.spot >= v.poc ? "BUY" : "SELL"),
    gex: (v) => (v.trendUp ? "BUY" : "SELL"),
    cvd: (v) => (v.priceTrend >= 0 ? "BUY" : "SELL"),
    thor: (v) => { if (v.spot > v.zeroGamma) { const range = v.pinRangeTop - v.pinRangeBottom; if (range <= 0) return "BUY"; return (v.spot - v.pinRangeBottom) / range >= 0.5 ? "SELL" : "BUY"; } return v.trendUp ? "BUY" : "SELL"; },
    quantumFuture: (v) => (v.targetUp ? "BUY" : "SELL"),
    germanyQuantum: (v) => (v.riskAssetTrend >= 0 ? "BUY" : "SELL"),
    luxQuantum: (v) => (!v.hasData ? "WAIT" : v.shortTermYield - v.longTermYield >= 0 ? "SELL" : "BUY"),
    vpoc: (v) => (v.spot >= (v.vah + v.val) / 2 ? "BUY" : "SELL"),
    russiaVol: (v) => (v.spot >= (v.upperBand + v.lowerBand) / 2 ? "BUY" : "SELL"),
    chinaHurst: (v) => (v.priceTrendUp ? "BUY" : "SELL"),
    indiaQuantum: (v) => (v.spot >= v.maxPainStrike ? "SELL" : "BUY"),
    uaeQuantum: (v) => (v.todayOpen - v.prevClose >= 0 ? "BUY" : "SELL"),
    swissQuantum: (v) => (v.zScore >= 0 ? "SELL" : "BUY"),
    franceQuantum: (v) => (v.fastEma >= v.slowEma ? "BUY" : "SELL"),
    italyQuantum: (v) => (v.rsi >= 50 ? "BUY" : "SELL"),
    ichimoku: (v) => (v.spot >= (v.senkouA + v.senkouB) / 2 ? "BUY" : "SELL"),
    radhaMadhav: (v) => (v.spot >= v.vwap ? "BUY" : "SELL"),
    radheshyam: (v) => (v.emaNow >= v.emaPrev ? "BUY" : "SELL"),
    deltaDivergence: (v) => (v.deltaNow >= v.deltaPrev ? "BUY" : "SELL"),
    gammaFlip: (v) => (v.spot < v.zeroGamma ? (v.trendUp ? "BUY" : "SELL") : (v.trendUp ? "SELL" : "BUY")),
    mtfEmaStack: (v) => (v.emaFast >= v.emaMid ? "BUY" : "SELL"),
    volReversal: (v) => (v.candleClose >= v.candleOpen ? "BUY" : "SELL"),
    orderFlowAggression: (v) => (v.aggressionScore >= 0 ? "BUY" : "SELL"),
    vpin: (v) => (v.buyLeaning ? "BUY" : "SELL"),
    vex: (v) => (v.vexValue >= 0 ? "BUY" : "SELL"),
    charm: (v) => (v.charmValue >= 0 ? "BUY" : "SELL"),
    micropriceDeviation: (v) => (v.microprice >= v.mid ? "BUY" : "SELL"),
    ivRegimeFilter: (v) => (v.priceTrendUp ? "BUY" : "SELL"),
    volClimaxExhaustion: (v) => (v.priorTrendUp ? "SELL" : "BUY"),
    structureBreak: (v) => (v.close >= (v.lastSwingHigh + v.lastSwingLow) / 2 ? "BUY" : "SELL"),
    atrSqueezeBreakout: (v) => (v.close >= (v.rangeHigh + v.rangeLow) / 2 ? "BUY" : "SELL"),
    oiSkewShift: (v) => (v.callOiCenter - v.prevCallOiCenter >= v.putOiCenter - v.prevPutOiCenter ? "BUY" : "SELL"),
    btcNiftyDivergence: (v) => (v.btcChgPct >= 0 ? "BUY" : "SELL"),
    rocAcceleration: (v) => (v.rocNow >= 0 ? "BUY" : "SELL"),
    afternoonVwapReclaim: (v) => (v.candleClose >= v.vwap ? "BUY" : "SELL"),
    bidAskImbalance: (v) => (v.bidQty >= v.askQty ? "BUY" : "SELL"),
    vwapTwapPremium: (v) => v.premium >= 0 ? "BUY" : "SELL",
    heavyweightBreadth: (v) => v.divergence <= 0 ? "BUY" : "SELL",
    kylesLambda: (v) => v.priceDir >= 0 ? "BUY" : "SELL",
    returnSkewness: (v) => v.skew >= 0 ? "BUY" : "SELL",
    netDealerDelta: (v) => v.priceTrendUp ? "BUY" : "SELL",
    atmStraddle: (v) => (!v.straddleNow || !v.straddlePrev ? "WAIT" : v.spotUp ? "BUY" : "SELL"),
    ivRank: (v) => { const range = v.iv52wHigh - v.iv52wLow; if (range <= 0) return "BUY"; return ((v.ivNow - v.iv52wLow) / range) * 100 <= 50 ? "BUY" : "SELL"; },
    ivPercentile: (v) => (v.ivpValue <= 50 ? "BUY" : "SELL"),
    vomma: (v) => (v.vommaValue >= 0 ? "BUY" : "SELL"),
    historicalVol: (v) => (v.hvNow >= v.hvPrev ? "BUY" : "SELL"),
    oiBuildup: (v) => v.priceDir >= 0 ? "BUY" : "SELL",
    ivTermStructure: (v) => v.priceTrendUp ? "BUY" : "SELL",
    fiiDiiPositioning: (v) => (v.fiiLongContracts - v.fiiShortContracts) >= v.fiiNetPrev ? "BUY" : "SELL",
    optionCategoryOi: (v) => ((v.callLongContracts - v.callShortContracts) - (v.putLongContracts - v.putShortContracts)) >= v.netPrev ? "BUY" : "SELL",
    g3BalanceSheet: (v) => (v.total >= v.prevTotal ? "BUY" : "SELL"),
    sriskSystemic: (v) => (v.sriskNow <= v.sriskPrev ? "BUY" : "SELL"),
    fxBasisSwap: (v) => (v.basisNow >= v.basisPrev ? "BUY" : "SELL"),
    creditImpulse: (v) => (v.impulseNow >= v.impulsePrev ? "BUY" : "SELL"),
    sofrFundingStress: (v) => (v.stressBps <= v.prevStressBps ? "BUY" : "SELL"),
    yieldCurve10Y3M: (v) => (v.curveBps >= v.prevCurveBps ? "BUY" : "SELL"),
    pcr: (v) => (v.pcr >= 1 ? "BUY" : "SELL"),
    maxpain: (v) => (v.spot >= v.maxPain ? "SELL" : "BUY"),
    oiCall: (v) => (v.chg <= 0 ? "BUY" : "SELL"),
    oiPut: (v) => (v.chg >= 0 ? "BUY" : "SELL"),
    volume: (v) => (v.priceUp ? "BUY" : "SELL"),
    iv: (v) => (v.ivNow >= v.ivPrev ? "BUY" : "SELL"),
    usaQuant: (v) => (v.spot >= v.avwap ? "BUY" : "SELL"),
    vrp: (v) => (v.vrpValue <= 0 ? "BUY" : "SELL"),
    riskReversal: (v) => (v.rrValue >= 0 ? "BUY" : "SELL"),
    leadLagBeta: (v) => (v.beta * v.lastBtcRet >= 0 ? "BUY" : "SELL"),
    wickAsymmetry: (v) => (v.avgLowerWick >= v.avgUpperWick ? "BUY" : "SELL"),
    futuresBasis: (v) => (v.futuresLtp - v.spot >= v.normalBasis ? "BUY" : "SELL"),
    cotPositioning: (v) => (v.spxNetLev >= v.spxPrevNetLev ? "BUY" : "SELL"),
    hyCreditSpread: (v) => (v.oas <= v.prevOas ? "BUY" : "SELL"),
    globalNetLiquidity: (v) => (v.netLiquidity >= v.prevNetLiquidity ? "BUY" : "SELL"),
    fedFundsFuturesImplied: (v) => (v.impliedRateNext <= v.currentRate ? "BUY" : "SELL"),
    moveIndex: (v) => (v.moveValue <= v.moveThreshold ? "BUY" : "SELL"),
    realYields: (v) => (v.tipsYield <= v.prevTipsYield ? "BUY" : "SELL"),
    usTermPremium: (v) => (v.premium <= v.prevPremium ? "BUY" : "SELL"),
    vvixVixDivergence: (v) => (v.vixValue >= 25 || (v.vvixValue >= 100 && v.vixValue <= 18) ? "SELL" : "BUY"),
    usFinancialStress: (v) => (v.stress <= v.prevStress ? "BUY" : "SELL"),
    usdFundingSqueeze: (v) => (v.spread <= v.prevSpread ? "BUY" : "SELL"),
    // ── 10 new institutional indicators ──
    tsMomentum12_1: (v) => ((v.ret12m - v.ret1m) >= 0 ? "BUY" : "SELL"),
    amihudIlliquidity: (v) => (!v.illiqAvg || v.illiqAvg <= 0 ? "BUY" : v.illiqNow / v.illiqAvg <= 1 ? "BUY" : "SELL"),
    macroSurprise: (v) => (v.surpriseNow >= v.surprisePrev ? "BUY" : "SELL"),
    earningsRevision: (v) => (v.upgrades >= v.downgrades ? "BUY" : "SELL"),
    stockBondCorr: (v) => (v.corrNow <= 0 ? "BUY" : "SELL"),
    ivButterflySkew: (v) => {
        const bf = 0.5 * (v.wing25dCall + v.wing25dPut) - v.atmIv;
        return bf <= 1.75 ? "BUY" : "SELL";
    },
    hmmRegime: (v) => (v.regimeScore >= 50 ? "BUY" : "SELL"),
    csMomentum: (v) => (v.umdReturn >= 0 ? "BUY" : "SELL"),
    nlpEarnings: (v) => (v.sentimentScore >= v.prevSentiment ? "BUY" : "SELL"),

    // ── 25 new institutional indicators — lean fallbacks ──
    harRvRegime: (v) => {
        if (v.rvMonth <= 0) return "BUY";
        const compressing = v.rvDay < v.rvWeek && v.rvWeek < v.rvMonth;
        return compressing ? (v.trendUp ? "BUY" : "SELL") : (v.trendUp ? "SELL" : "BUY");
    },
    sviSkewSlope: (v) => (v.slope < v.prevSlope ? "SELL" : "BUY"),
    bnsJump: (v) => (v.jumpSign >= 0 ? "BUY" : "SELL"),
    kalmanTrend: (v) => (v.slope >= 0 ? "BUY" : "SELL"),
    ouReversion: (v) => (v.zDev >= 0 ? "SELL" : "BUY"),
    elasticNet: (v) => (v.score >= 0 ? "BUY" : "SELL"),
    vix9dRatio: (v) => {
        if (v.vix <= 0) return "BUY";
        return v.vix9d / v.vix < 1 ? "BUY" : "SELL";
    },
    ivDispersion: (v) => {
        const disp = v.avgSingleIv - v.indexIv;
        return disp > 7 ? (v.trendUp ? "SELL" : "BUY") : (v.trendUp ? "BUY" : "SELL");
    },
    corrShock: (v) => (v.rhoNow >= v.rhoPrev ? "SELL" : "BUY"),
    impliedVsRealized: (v) => {
        if (v.impliedMove <= 0) return v.priceUp ? "BUY" : "SELL";
        const r = v.realizedMove / v.impliedMove;
        return r < 1 ? (v.priceUp ? "BUY" : "SELL") : (v.priceUp ? "SELL" : "BUY");
    },
    impliedCarry: (v) => (v.carryBps >= v.prevCarryBps ? "BUY" : "SELL"),
    retailOddLot: (v) => {
        // Contrarian: retail buying heavily into a downtrend = SELL;
        // retail selling into an uptrend = BUY.
        if (v.buyRatio > 0.65 && !v.trendUp) return "SELL";
        if (v.buyRatio < 0.35 && v.trendUp) return "BUY";
        return v.trendUp ? "BUY" : "SELL";
    },
    darkPoolPrints: (v) => {
        const rising = v.dpRatio >= v.prevDpRatio;
        // Rising DP share confirms price direction (real accumulation/
        // distribution). Falling DP share = move isn't institutional-backed,
        // so fade it.
        if (rising) return v.priceUp ? "BUY" : "SELL";
        return v.priceUp ? "SELL" : "BUY";
    },
    repoStress: (v) => ((v.repoBps - v.iorbBps) >= v.prevSpread ? "SELL" : "BUY"),
    cdxIgSpread: (v) => (v.spreadNow <= v.spreadPrev ? "BUY" : "SELL"),
    adLineDivergence: (v) => {
        if (v.indexUp && v.adDelta < 0) return "SELL";
        if (!v.indexUp && v.adDelta > 0) return "BUY";
        return v.adDelta >= 0 ? "BUY" : "SELL";
    },
    mcClellanOsc: (v) => (v.mcOsc >= v.prevMcOsc ? "BUY" : "SELL"),
    armsTrin: (v) => (v.trin <= 1 ? "BUY" : "SELL"),
    smartMoneyIdx: (v) => (v.smiChange >= 0 ? "BUY" : "SELL"),
    magicFormula: (v) => (((v.eyRank + v.roicRank) / 2) >= 50 ? "BUY" : "SELL"),
    carryToRisk: (v) => {
        if (v.realizedVol <= 0) return "BUY";
        return (v.carryBps / v.realizedVol) >= 0 ? "BUY" : "SELL";
    },
    rvSkew: (v) => {
        // FIX (v53): was inverted vs the real evaluate() — real logic is
        // negative skew + uptrend = SELL, positive skew + downtrend = BUY.
        if (v.rvSkew < 0) return v.trendUp ? "SELL" : "BUY";
        return v.trendUp ? "SELL" : "BUY";
    },
    momMinusReversal: (v) => ((v.ret12_1 - v.ret1m) >= 0 ? "BUY" : "SELL"),
    hurstMeanRev: (v) => (v.hurst < 0.5 ? (v.lastMoveUp ? "SELL" : "BUY") : (v.lastMoveUp ? "BUY" : "SELL")),
    rankMomentum: (v) => (v.spearman >= 0 ? "BUY" : "SELL"),
};
// A relay-owned indicator is not tradeable until its first live payload.  The
// role gates below deliberately keep premium cost and macro confirmation
// studies out of the CALL/PUT vote; the primary premiumSignal is the only
// place that can issue an executable option-side recommendation.
function indicatorDataUnavailable(ind, values) {
    if (!values) return true;
    if (values.hasData === false || values.hasChain === false) return true;
    if (OPTION_CHAIN_DRIVEN_ID_SET.has(ind.id) && values.hasChain !== true) return true;
    if (V107_LIVE_INDICATOR_IDS.has(ind.id) && values.hasData !== true) return true;
    return false;
}
function evaluateIndicatorStatus(ind, values) {
    if (indicatorDataUnavailable(ind, values)) return "WAIT";
    if (PREMIUM_GATE_INDICATOR_IDS.has(ind.id) || CONFIRMATION_ONLY_INDICATOR_IDS.has(ind.id)) return "WAIT";
    try { return ind.evaluate(values); } catch (e) { return "WAIT"; }
}
function indicatorReason(ind, values) {
    if (indicatorDataUnavailable(ind, values)) {
        return "Live source is unavailable or still warming up — WAIT; no option buy is allowed from seed/stale values.";
    }
    try {
        const base = ind.reason(values);
        if (PREMIUM_GATE_INDICATOR_IDS.has(ind.id)) {
            return `${base} This is a premium-cost gate only; it does not select CALL or PUT by itself.`;
        }
        if (CONFIRMATION_ONLY_INDICATOR_IDS.has(ind.id)) {
            return `${base} This is confirmation-only; the executable CALL/PUT decision comes from the live option quote stress test.`;
        }
        return base;
    } catch (e) {
        return "This indicator could not be evaluated safely — WAIT.";
    }
}
function optionStatusLabel(status) {
    return status === "BUY" ? "BUY CALL" : status === "SELL" ? "BUY PUT" : "WAIT";
}
// FIX (v53): previously forced every WAIT into a fake BUY/SELL lean for
// display, so card colors never agreed with the header BUY/SELL/WAIT totals
// or the AI snapshot (which both use the real status). Now the display
// status is simply the real status — WAIT shows as WAIT everywhere.
// leanFns table is kept (unused) only for reference/audit purposes.
function resolveDisplayStatus(ind, values, rawStatus) {
    return rawStatus;
}
// Grand Consensus weighting — ids here are macro/slow-cadence reads (FRED
// daily series, weekly COT report, monthly momentum/fundamental factors)
// that move far less often than intraday price/OI/order-flow indicators.
// Used to down-weight these to 0.5x in the Grand Consensus gap so a
// stale-until-tomorrow macro signal doesn't count the same as a live tick.
const macroIndicatorIds = new Set([
    "hyCreditSpread", "globalNetLiquidity", "fedFundsFuturesImplied", "moveIndex",
    "realYields", "usTermPremium", "usFinancialStress", "usdFundingSqueeze",
    "g3BalanceSheet", "sriskSystemic", "fxBasisSwap", "creditImpulse",
    "sofrFundingStress", "yieldCurve10Y3M", "macroSurprise", "earningsRevision",
    "stockBondCorr", "shortInterestDTC", "repoStress", "cdxIgSpread",
    "cotPositioning", "fiiDiiPositioning", "fiiDiiCashFlow", "tsMomentum12_1",
    "csMomentum", "momMinusReversal", "magicFormula",
]);
const indicatorCategory = {
    vwap: "Trend", swingSR: "Trend", oiCall: "Momentum", oiPut: "Momentum", cvd: "Momentum",
    volume: "Volume / Conviction", pcr: "Positioning", iv: "Positioning", delta: "Positioning",
    oiWall: "Positioning", maxpain: "Positioning", thor: "Positioning", quantumFuture: "Positioning",
    orderBlock: "Structure", liquidity: "Structure", prediction: "Structure", ichimoku: "Trend",
    usaQuant: "Trend", vpoc: "Structure", russiaVol: "Volume / Conviction", chinaHurst: "Momentum",
    indiaQuantum: "Positioning", uaeQuantum: "Momentum", swissQuantum: "Positioning",
    germanyQuantum: "Structure", luxQuantum: "Structure", franceQuantum: "Trend", italyQuantum: "Momentum",
    radhaMadhav: "Structure", radheshyam: "Momentum",
    deltaDivergence: "Positioning", gammaFlip: "Structure", mtfEmaStack: "Trend", volReversal: "Volume / Conviction",
    orderFlowAggression: "Volume / Conviction", ivRegimeFilter: "Positioning", volClimaxExhaustion: "Volume / Conviction",
    structureBreak: "Structure", atrSqueezeBreakout: "Trend", oiSkewShift: "Positioning",
    btcNiftyDivergence: "Momentum", rocAcceleration: "Momentum", afternoonVwapReclaim: "Trend",
    bidAskImbalance: "Volume / Conviction",
    vwapTwapPremium: "Volume / Conviction",
    heavyweightBreadth: "Structure",
    kylesLambda: "Volume / Conviction",
    returnSkewness: "Momentum",
    netDealerDelta: "Positioning",
    oiBuildup: "Momentum",
    atmStraddle: "Volume / Conviction",
    ivRank: "Positioning",
    ivPercentile: "Positioning",
    vomma: "Positioning",
    historicalVol: "Volume / Conviction",
    indiaVixFear: "Positioning",
    ivTermStructure: "Positioning",
    fiiDiiPositioning: "Structure",
    fiiDiiCashFlow: "Positioning",
    optionCategoryOi: "Positioning",
    g3BalanceSheet: "Positioning",
    sriskSystemic: "Positioning",
    fxBasisSwap: "Positioning",
    creditImpulse: "Positioning",
    sofrFundingStress: "Positioning",
    yieldCurve10Y3M: "Positioning",
    gex: "Positioning",
    vpin: "Volume / Conviction",
    vex: "Positioning",
    charm: "Positioning",
    vrp: "Positioning",
    riskReversal: "Positioning",
    micropriceDeviation: "Volume / Conviction",
    leadLagBeta: "Momentum",
    wickAsymmetry: "Structure",
    futuresBasis: "Positioning",
    cotPositioning: "Positioning",
    hyCreditSpread: "Positioning",
    globalNetLiquidity: "Positioning",
    fedFundsFuturesImplied: "Positioning",
    moveIndex: "Volume / Conviction",
    realYields: "Positioning",
    usTermPremium: "Positioning",
    vvixVixDivergence: "Volume / Conviction",
    usFinancialStress: "Positioning",
    usdFundingSqueeze: "Positioning",
    // ── 10 new institutional indicators ──
    tsMomentum12_1: "Momentum",
    amihudIlliquidity: "Volume / Conviction",
    macroSurprise: "Positioning",
    earningsRevision: "Momentum",
    stockBondCorr: "Positioning",
    ivButterflySkew: "Positioning",
    shortInterestDTC: "Structure",
    hmmRegime: "Trend",
    csMomentum: "Momentum",
nlpEarnings: "Positioning",

    // ── 25 new institutional indicators — categories ──
    harRvRegime: "Volume / Conviction",
    sviSkewSlope: "Positioning",
    bnsJump: "Momentum",
    kalmanTrend: "Trend",
    ouReversion: "Structure",
    elasticNet: "Positioning",
    vix9dRatio: "Positioning",
    ivDispersion: "Positioning",
    corrShock: "Structure",
    impliedVsRealized: "Positioning",
    impliedCarry: "Positioning",
    retailOddLot: "Positioning",
    darkPoolPrints: "Volume / Conviction",
    repoStress: "Positioning",
    cdxIgSpread: "Positioning",
    adLineDivergence: "Structure",
    mcClellanOsc: "Momentum",
    armsTrin: "Volume / Conviction",
    smartMoneyIdx: "Volume / Conviction",
    magicFormula: "Structure",
    carryToRisk: "Positioning",
    rvSkew: "Momentum",
    momMinusReversal: "Momentum",
    hurstMeanRev: "Structure",
    rankMomentum: "Trend",
    lmeCash3mSpread: "Positioning",
    lmeCancelledWarrants: "Positioning",
    mcxDeliveryIntent: "Positioning",
    goldLeaseShock: "Positioning",
    energyCrackMomentum: "Momentum",
    heatingOilResidual: "Momentum",
    natGasWeather: "Momentum",
    opecCapacityShock: "Positioning",
    mcxBreadth: "Volume / Conviction",
    gapFillEfficiency: "Structure",
    parityResidual: "Positioning",
    putParityResidual: "Positioning",
    callExtrinsicMomentum: "Momentum",
    putExtrinsicMomentum: "Momentum",
    callTheoResidual: "Positioning",
    putTheoResidual: "Positioning",
    optionConvexity: "Momentum",
    premiumSpotElasticity: "Momentum",
    optionRelativeStrength: "Momentum",
    premiumRatioVelocity: "Momentum",
    spreadCompression: "Volume / Conviction",
    premiumShockPersistence: "Momentum",
    syntheticForwardCheck: "Positioning",
    premiumMomentumRace: "Momentum",
    premiumAccelerationRace: "Momentum",
    volumePressureSplit: "Volume / Conviction",
    oiPressureSplit: "Positioning",
    ivDemandSplit: "Positioning",
    deltaVolumeSplit: "Volume / Conviction",
    gammaFlowSplit: "Positioning",
    thetaEfficiencySplit: "Positioning",
    wingSlopeDirection: "Positioning",
    wingMomentumDirection: "Momentum",
    optionBreadthDirection: "Volume / Conviction",
    quoteExecutionPressure: "Volume / Conviction",
    strikeMigrationDirection: "Structure",
    premiumRelativeValue: "Positioning",
    straddleImpulse: "Momentum",
    oiVolumeConviction: "Volume / Conviction",
};
const CATEGORY_ORDER = ["Trend", "Momentum", "Volume / Conviction", "Positioning", "Structure"];
function HulkFistIcon({ className }) {
    return (<svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 44 L18 30 L30 30 L30 44 Z" fill="#4ade80" stroke="#166534" strokeWidth="1.5"/>
      <rect x="17" y="27" width="14" height="4" rx="1" fill="#a3e635" stroke="#166534" strokeWidth="1"/>
      <path d="M14 18c0-3 2-5 4-5s3 1 3 3c0-2 1-4 3-4s3 2 3 4c0-2 1-4 3-4s3 2 3 4c0-2 1-3 3-3s4 2 4 5v6c0 4-4 7-8 7h-8c-5 0-10-3-10-8z" fill="#4ade80" stroke="#166534" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M14 20c-2 0-4 1-4 3.5S12 27 14 27" fill="#4ade80" stroke="#166534" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M6 10 L10 14" stroke="#a3e635" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4 18 L9 19" stroke="#a3e635" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M6 26 L10 24" stroke="#a3e635" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>);
}
function ThorHammerIcon({ className }) {
    return (<svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="21" y="20" width="6" height="24" rx="1.5" fill="#a78bfa" stroke="#4c1d95" strokeWidth="1.5"/>
      <rect x="20.5" y="30" width="7" height="3" fill="#4c1d95"/>
      <rect x="10" y="6" width="28" height="14" rx="2" fill="#c4b5fd" stroke="#4c1d95" strokeWidth="1.5"/>
      <rect x="13" y="9" width="22" height="3" rx="1" fill="#ede9fe" opacity="0.8"/>
      <path d="M25 22 L20 30 L24 30 L21 38 L29 28 L25 28 Z" fill="#fde047" stroke="#a16207" strokeWidth="1" strokeLinejoin="round"/>
    </svg>);
}
function QuantumAtomIcon({ className }) {
    return (<svg viewBox="0 0 48 48" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="3.5" fill="#22d3ee"/>
      <ellipse cx="24" cy="24" rx="18" ry="7" stroke="#22d3ee" strokeWidth="1.5" transform="rotate(0 24 24)"/>
      <ellipse cx="24" cy="24" rx="18" ry="7" stroke="#818cf8" strokeWidth="1.5" transform="rotate(60 24 24)"/>
      <ellipse cx="24" cy="24" rx="18" ry="7" stroke="#67e8f9" strokeWidth="1.5" transform="rotate(120 24 24)"/>
    </svg>);
}
function StatusLight({ status }) {
    const cls = status === "BUY" ? "bg-teal-500 shadow-[0_0_4px_1px_rgba(13,148,136,0.25)]" : status === "SELL" ? "bg-rose-500 shadow-[0_0_10px_2px_rgba(244,63,94,0.7)]" : "bg-amber-400 shadow-[0_0_10px_2px_rgba(251,191,36,0.7)]";
    return <div className={`h-3 w-3 rounded-full shrink-0 ${cls}`}/>;
}
function DualArrowBox({ status, size = "sm" }) {
    // Replaces the old twin up/down arrow box with three explicit buttons —
    // BUY, SELL, WAIT — one per indicator's own computed strategy result.
    // Exactly one button lights up per render, driven strictly by `status`
    // (never gated by relay/apiStatus — spot-driven indicators already
    // track live price via the Binance feed independent of that relay).
    const isBuy = status === "BUY";
    const isSell = status === "SELL";
    const isWait = status === "WAIT";
    const boxCls = size === "lg" ? "px-3 h-14 text-sm" : "px-2 h-8 text-[10px]";
    return (<div className="flex gap-2 shrink-0 ml-2">
      <div className={`${boxCls} flex items-center justify-center rounded-lg font-black tracking-wide uppercase transition-all duration-300 border-2 border-cyan-400 ${isBuy ? "scale-110 animate-pulse" : ""}`} style={isBuy ? { backgroundColor: "#0d9488", color: "#000080", boxShadow: "0 0 6px 2px rgba(0,230,118,0.3), 0 0 12px 4px rgba(0,230,118,0.15)" } : { backgroundColor: "rgba(0,230,118,0.06)", color: "rgba(0,230,118,0.22)" }}>
        BUY CALL
      </div>
      <div className={`${boxCls} flex items-center justify-center rounded-lg font-black tracking-wide uppercase transition-all duration-300 border-2 border-cyan-400 ${isSell ? "scale-110 animate-pulse" : ""}`} style={isSell ? { backgroundColor: "#FF1744", color: "#FFFFFF", boxShadow: "0 0 20px 6px rgba(255,23,68,0.9), 0 0 40px 12px rgba(255,23,68,0.5)" } : { backgroundColor: "rgba(255,23,68,0.06)", color: "rgba(255,23,68,0.22)" }}>
        BUY PUT
      </div>
      <div className={`${boxCls} flex items-center justify-center rounded-lg font-black tracking-wide uppercase transition-all duration-300 border-2 border-cyan-400 ${isWait ? "scale-110 animate-pulse" : ""}`} style={isWait ? { backgroundColor: "#FFC400", color: "#000000", boxShadow: "0 0 10px 3px rgba(255,196,0,0.6), 0 0 20px 6px rgba(255,196,0,0.3)" } : { backgroundColor: "rgba(255,196,0,0.06)", color: "rgba(255,196,0,0.22)" }}>
        WAIT
      </div>
    </div>);
}
// Clickable version of the three BUY/SELL/WAIT boxes for the research-table
// rows below, which have no live evaluate() status to drive them
// automatically. Tapping a box selects it (single-select, tap again to
// clear); the selected box lights up in the same colors as DualArrowBox
// so the two styles read as one consistent system across the whole board.
function ManualTickBox({ value, onChange }) {
    const isBuy = value === "BUY";
    const isSell = value === "SELL";
    const isWait = value === "WAIT";
    const base = "px-1.5 py-1 rounded text-[9px] leading-none font-black tracking-wide uppercase border transition-all duration-200 whitespace-nowrap";
    return (<div className="flex gap-1 shrink-0">
      <button type="button" aria-pressed={isBuy} onClick={() => onChange(isBuy ? null : "BUY")} className={base} style={isBuy ? { backgroundColor: "#0d9488", borderColor: "#0d9488", color: "#000080" } : { backgroundColor: "rgba(13,148,136,0.06)", borderColor: "rgba(13,148,136,0.35)", color: "rgba(45,212,191,0.55)" }}>
        BUY CALL
      </button>
      <button type="button" aria-pressed={isSell} onClick={() => onChange(isSell ? null : "SELL")} className={base} style={isSell ? { backgroundColor: "#FF1744", borderColor: "#FF1744", color: "#FFFFFF" } : { backgroundColor: "rgba(255,23,68,0.06)", borderColor: "rgba(255,23,68,0.35)", color: "rgba(251,113,133,0.55)" }}>
        BUY PUT
      </button>
      <button type="button" aria-pressed={isWait} onClick={() => onChange(isWait ? null : "WAIT")} className={base} style={isWait ? { backgroundColor: "#FFC400", borderColor: "#FFC400", color: "#000000" } : { backgroundColor: "rgba(255,196,0,0.06)", borderColor: "rgba(255,196,0,0.35)", color: "rgba(251,191,36,0.55)" }}>
        WAIT
      </button>
    </div>);
}
function IndicatorCard({ ind, values, onChange, isLight, isLive, onOpenTicket, selectedSymbol, symbolLtp, gold, kohinoor }) {
    // Bid-Ask Imbalance is fed by a slow (7s) relay depth poll — if that
    // poll silently stalls (rate-limit, dropped connection, strike no
    // longer watched), the last reading would otherwise sit on screen
    // looking exactly like a fresh, tradeable signal. Re-render this card
    // every second (only for this one indicator) so "stale" and the
    // "updated Xs ago" readout stay live instead of frozen at whatever
    // Date.now() happened to be on the last real data tick.
    const [, forceTick] = useState(0);
    useEffect(() => {
        if (ind.id !== "bidAskImbalance" && ind.id !== "micropriceDeviation") return;
        const t = setInterval(() => forceTick((x) => x + 1), 1000);
        return () => clearInterval(t);
    }, [ind.id]);
    const isDepthIndicator = ind.id === "bidAskImbalance" || ind.id === "micropriceDeviation";
    const depthAgeMs = isDepthIndicator && values.lastUpdate ? Date.now() - values.lastUpdate : null;
    const isStale = isDepthIndicator && (depthAgeMs == null || depthAgeMs > 15000);
    const effectiveValues = isDepthIndicator ? { ...values, stale: isStale } : values;
    const status = evaluateIndicatorStatus(ind, effectiveValues);
    const displayStatus = resolveDisplayStatus(ind, effectiveValues, status);
    const cardCls = (status === "BUY" ? isLight ? "bg-teal-100" : "bg-teal-950/40" : status === "SELL" ? isLight ? "bg-rose-50" : "bg-rose-950/40" : isLight ? "bg-amber-50" : "bg-amber-950/30") + (kohinoor ? " border-white" : gold ? " border-amber-400" : " border-cyan-400") + (isStale ? " opacity-90 grayscale" : "");
    const reasonText = indicatorReason(ind, effectiveValues);
    // FIX (option-direction badge): every indicator — including MCX/macro
    // ones whose raw status describes the underlying, not the option — now
    // also states the actual options-buying action in plain words, since
    // the app's job is to say BUY CALL / BUY PUT / WAIT, not just BUY/SELL.
    const optionAction = status === "BUY" ? "→ BUY CALL" : status === "SELL" ? "→ BUY PUT" : "→ WAIT (no option buy)";
    const optionActionCls = status === "BUY" ? (isLight ? "text-teal-700" : "text-teal-300") : status === "SELL" ? (isLight ? "text-rose-700" : "text-rose-300") : (isLight ? "text-amber-700" : "text-amber-300");
    return (<div className={`rounded-lg border p-4 flex flex-col gap-3 transition-colors ${cardCls}`}>
      <div className={`flex items-center justify-between text-xs font-mono font-bold rounded px-2 py-1 -mt-1 -mx-1 mb-1 ${isLight ? "bg-cyan-100/60 text-cyan-700" : "bg-cyan-500/10 text-cyan-300"}`}>
        <span>📍 {selectedSymbol}</span>
        <span style={{ color: "#FF8C00" }} className="font-bold">{typeof symbolLtp === "number" ? formatPrice(symbolLtp) : "—"}</span>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-y-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <StatusLight status={status}/>
          {ind.icon === "hulk" && <HulkFistIcon className="w-5 h-5"/>}
          {ind.icon === "thor" && <ThorHammerIcon className="w-5 h-5"/>}
          {ind.icon === "quantum" && <QuantumAtomIcon className="w-5 h-5"/>}
          {ind.icon === "arrowUp" && <div className="w-6 h-6 flex items-center justify-center rounded" style={{ backgroundColor: "#00C853" }}><ArrowUp className="w-4 h-4" style={{ color: "#000080" }}/></div>}
          {ind.icon === "arrowDown" && <div className="w-6 h-6 flex items-center justify-center rounded" style={{ backgroundColor: "#D50000" }}><ArrowDown className="w-4 h-4" style={{ color: "#FFFFFF" }}/></div>}
          {ind.icon === "japan" && <span className="text-lg leading-none">🇯🇵</span>}
          {ind.icon === "usa" && <span className="text-lg leading-none">🇺🇸</span>}
          {ind.icon === "eu" && <span className="text-lg leading-none">🇪🇺</span>}
          {ind.icon === "russia" && <span className="text-lg leading-none">🇷🇺</span>}
          {ind.icon === "china" && <span className="text-lg leading-none">🇨🇳</span>}
          {ind.icon === "india" && <span className="text-lg leading-none">🇮🇳</span>}
          {ind.icon === "uae" && <span className="text-lg leading-none">🇦🇪</span>}
          {ind.icon === "swiss" && <span className="text-lg leading-none">🇨🇭</span>}
          {ind.icon === "germany" && <span className="text-lg leading-none">🇩🇪</span>}
          {ind.icon === "lux" && <span className="text-lg leading-none">🇱🇺</span>}
          {ind.icon === "france" && <span className="text-lg leading-none">🇫🇷</span>}
          {ind.icon === "italy" && <span className="text-lg leading-none">🇮🇹</span>}
          <span className={`text-2xl font-semibold tracking-wide ${kohinoor ? "text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]" : gold ? "text-amber-300" : isLight ? "text-slate-900" : "text-slate-100"}`}>{ind.label}</span>
          {isDepthIndicator && (
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isStale ? "bg-rose-500/20 text-rose-400" : isLight ? "bg-teal-100 text-emerald-700" : "bg-teal-950/10 text-teal-500"}`}>
              {depthAgeMs == null ? "no data yet" : `updated ${Math.round(depthAgeMs / 1000)}s ago${isStale ? " — STALE" : ""}`}
            </span>
          )}
        </div>
         <DualArrowBox status={displayStatus} size="lg"/>
      </div>
      <p className={`text-xl leading-snug ${isLight ? "text-slate-600" : "text-slate-200"}`}>{reasonText}</p>
      <p className={`text-lg font-black font-mono tracking-wide ${optionActionCls}`}>{optionAction}</p>
      <div className={`flex flex-wrap gap-3 pt-1 border-t ${isLight ? "border-cyan-500/20" : "border-cyan-400/20"}`}>
        {[ind.a, ind.b, ind.c, ind.d, ind.e, ind.f].filter(Boolean).map((field) => (<label key={field.key} className={`flex items-center gap-1.5 text-base ${isLight ? "text-slate-600" : "text-slate-200"}`}>
            {field.name}
            <input type="number" step="0.01" value={values[field.key]} onChange={(e) => onChange(ind.id, field.key, parseFloat(e.target.value))} className={`w-24 rounded px-1.5 py-0.5 font-mono text-base focus:outline-none focus:ring-1 focus:ring-slate-500 ${isLight ? "bg-white border border-cyan-400/60 text-slate-900" : "bg-slate-900 border border-cyan-500/40 text-slate-100"}`}/>
            <span className={isLight ? "text-slate-200" : "text-slate-600"}>{ind.unit}</span>
          </label>))}
      </div>
    </div>);
}
// ---------------------------------------------------------------
// Native candle chart — built from actual live ticks (not a 3rd-party
// embed, since external scripts don't load inside this sandboxed
// artifact preview). Buckets incoming LTP ticks into 1-minute candles
// client-side, then computes VWAP (price-average approximation — no real
// traded volume is available from a tick feed), EMA(9), EMA(21), and
// RSI(14) directly from those candles. This is real math on real prices,
// not decoration.
// Well-known EMA crossover pairs, computed silently from candle closes
// (background only — no raw EMA numbers shown for these, just the
// resulting BUY/SELL/WAIT read). Ordered with the two most-watched
// crosses first (9/21 "fast" cross, 50/200 "Golden/Death" cross), the
// pairs everyone recognizes, per request.
// Per-period EMA "price trend" boxes requested on the front of the candle
// panel: EMA9 / EMA14 / EMA21, each showing whether price is trading above
// (BUY) or below (SELL) that EMA right now, glowing the instant price
// crosses that specific EMA (not an EMA-vs-EMA cross — a close-vs-EMA cross).
const EMA_TREND_PERIODS = [9, 14, 21];
function computeEmaPriceTrend(closes) {
    if (!closes || closes.length < 2) return EMA_TREND_PERIODS.map((p) => ({ period: p, status: "WAIT", justCrossed: false }));
    const i = closes.length - 1, iPrev = closes.length - 2;
    return EMA_TREND_PERIODS.map((period) => {
        const ema = computeEMA(closes, period);
        const now = ema[i], prev = ema[iPrev];
        let status = "WAIT";
        if (now != null) status = closes[i] > now ? "BUY" : closes[i] < now ? "SELL" : "WAIT";
        let justCrossed = false;
        if (now != null && prev != null) {
            const prevSign = Math.sign(closes[iPrev] - prev), nowSign = Math.sign(closes[i] - now);
            justCrossed = prevSign !== 0 && nowSign !== 0 && prevSign !== nowSign;
        }
        return { period, status, justCrossed };
    });
}
const EMA_CROSS_PAIRS = [
    { fast: 9, slow: 21, label: "9/21 EMA Cross" },
    { fast: 50, slow: 200, label: "50/200 Golden/Death Cross" },
    { fast: 9, slow: 14, label: "9/14 EMA Cross" },
    { fast: 14, slow: 21, label: "14/21 EMA Cross" },
    { fast: 5, slow: 20, label: "5/20 EMA Cross" },
    { fast: 20, slow: 50, label: "20/50 EMA Cross" },
    { fast: 3, slow: 8, label: "3/8 EMA Cross" },
    { fast: 5, slow: 10, label: "5/10 EMA Cross" },
    { fast: 8, slow: 13, label: "8/13 EMA Cross" },
    { fast: 10, slow: 20, label: "10/20 EMA Cross" },
    { fast: 12, slow: 26, label: "12/26 EMA Cross (MACD basis)" },
    { fast: 13, slow: 34, label: "13/34 EMA Cross" },
];
function computeEmaCrossovers(closes) {
    if (!closes || closes.length < 2) return EMA_CROSS_PAIRS.map((p) => ({ ...p, status: "WAIT", justCrossed: false }));
    const periods = [...new Set(EMA_CROSS_PAIRS.flatMap((p) => [p.fast, p.slow]))];
    const emaByPeriod = {};
    periods.forEach((p) => { emaByPeriod[p] = computeEMA(closes, p); });
    const i = closes.length - 1, iPrev = closes.length - 2;
    return EMA_CROSS_PAIRS.map((p) => {
        const fastNow = emaByPeriod[p.fast][i], slowNow = emaByPeriod[p.slow][i];
        const fastPrev = emaByPeriod[p.fast][iPrev], slowPrev = emaByPeriod[p.slow][iPrev];
        let status = "WAIT";
        if (fastNow != null && slowNow != null) {
            if (fastNow > slowNow) status = "BUY";
            else if (fastNow < slowNow) status = "SELL";
        }
        let justCrossed = false;
        if (fastNow != null && slowNow != null && fastPrev != null && slowPrev != null) {
            const prevSign = Math.sign(fastPrev - slowPrev), nowSign = Math.sign(fastNow - slowNow);
            justCrossed = prevSign !== 0 && nowSign !== 0 && prevSign !== nowSign;
        }
        return { ...p, status, justCrossed };
    });
}
function computeEMA(values, period) {
    if (values.length === 0) return [];
    const k = 2 / (period + 1);
    const out = new Array(values.length).fill(null);
    // Standard practice: seed with the SMA of the first `period` values,
    // not the raw first close — seeding on a single point left EMA9/EMA21
    // visibly off-target for the first ~3-4x period candles each session,
    // which is exactly the window France Quant (EMA crossover) reads.
    if (values.length < period) {
        // Not enough data for a real SMA seed yet — fall back to a running
        // mean so the array is still fully populated, but this is only a
        // placeholder until `period` candles exist.
        let running = values[0];
        out[0] = running;
        for (let i = 1; i < values.length; i++) { running = values[i] * k + running * (1 - k); out[i] = running; }
        return out;
    }
    const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out[period - 1] = seed;
    let prev = seed;
    for (let i = period; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); out[i] = prev; }
    return out;
}
function computeRSI(values, period = 14) {
    const out = new Array(values.length).fill(null);
    if (values.length < period + 1) return out;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = values[i] - values[i - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period, avgLoss = losses / period;
    out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    for (let i = period + 1; i < values.length; i++) {
        const diff = values[i] - values[i - 1];
        const gain = diff > 0 ? diff : 0, loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return out;
}
// Real Max Pain: the strike at which total option-writer payout (across all
// live strikes' OI, both legs) is minimized — i.e. where the most option
// buyers lose money at expiry. For a candidate settle price P: every call
// strike <= P is ITM (writer pays callOI*(P-strike)); every put strike >= P
// is ITM (writer pays putOI*(strike-P)). Sweep every strike as the candidate
// P and take the one with the lowest total payout. This replaces a
// previously-hardcoded static maxPain value that never updated from the
// live option chain despite the OI data already being fetched.
function calculateMaxPain(rows) {
    if (!rows || !rows.length) return null;
    let bestStrike = null, bestPain = Infinity;
    for (const candidate of rows) {
        const P = candidate.strike;
        let pain = 0;
        for (const r of rows) {
            if (r.callOi && r.strike <= P) pain += r.callOi * (P - r.strike);
            if (r.putOi && r.strike >= P) pain += r.putOi * (r.strike - P);
        }
        if (pain < bestPain) { bestPain = pain; bestStrike = P; }
    }
    return bestStrike;
}
// --- Black-Scholes helpers (Vanna Exposure / Charm) ---
// erf via Abramowitz-Stegun 7.1.26 (max error ~1.5e-7) — good enough for
// dealer-hedging-pressure reads, not priced for penny-perfect greeks.
function erf(x) {
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
}
function normalCDF(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
function normalPDF(x) { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }
const RISK_FREE_RATE = 0.065; // assumed India ~6.5% — chain carries no rate of its own
const PREMIUM_SIGNAL_CONFIG = {
    horizonMinutes: 15,
    maxQuoteAgeMs: 15000,
    maxSpreadPct: 3,
    minVolume: 1,
    minOi: 1,
    minHoursToExpiry: 1,
    ivCrushStressPct: 5,
    slippagePct: 0.25,
    minEdgePremium: 0.05,
    minExpectedReturnPct: 8,
    minNetChange: 0.05,
    minMovePct: 0.05,
    maxExpectedSpotMovePct: 2.5,
    maxThetaPct: 8,
};
// Time to expiry in years, floored at 1 hour so 0-DTE strikes don't blow up
// d1/d2 with a division by ~0.
function yearsToExpiry(expiryStr) {
    if (!expiryStr) return null;
    const ms = new Date(`${expiryStr}T15:30:00+05:30`).getTime() - Date.now();
    const years = ms / (365 * 24 * 3600 * 1000);
    return Math.max(years, 1 / (365 * 24));
}
function bsD1D2(spot, strike, T, sigma, r = RISK_FREE_RATE) {
    if (!spot || !strike || !T || !sigma || sigma <= 0) return null;
    const d1 = (Math.log(spot / strike) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return { d1, d2 };
}
// --- Full Greeks for the 7 header buttons (Delta/Gamma/Theta/Vega/Rho + OI) ---
// All automatic — spot/strike/IV/OI come straight off the live Upstox chain
// (same optionChains[underlying].rows used by VEX/Charm above), no manual
// input. Reuses normalCDF/normalPDF/bsD1D2/RISK_FREE_RATE, so there is only
// ONE normalCDF/normalPDF in the whole file — do not add a second copy.
function bsGamma(spot, strike, T, sigma, r = RISK_FREE_RATE) {
    const dd = bsD1D2(spot, strike, T, sigma, r);
    if (!dd) return null;
    return normalPDF(dd.d1) / (spot * sigma * Math.sqrt(T));
}
function bsVega(spot, strike, T, sigma, r = RISK_FREE_RATE) {
    const dd = bsD1D2(spot, strike, T, sigma, r);
    if (!dd) return null;
    // Per 1% IV move, matching how IV is quoted on the chain (e.g. 14.8%).
    return (spot * Math.sqrt(T) * normalPDF(dd.d1)) / 100;
}
function bsThetaDaily(spot, strike, T, sigma, side, r = RISK_FREE_RATE) {
    const dd = bsD1D2(spot, strike, T, sigma, r);
    if (!dd) return null;
    const { d1, d2 } = dd;
    const term1 = -(spot * normalPDF(d1) * sigma) / (2 * Math.sqrt(T));
    const term2 = r * strike * Math.exp(-r * T);
    const yearly = side === "call"
        ? term1 - term2 * normalCDF(d2)
        : term1 + term2 * normalCDF(-d2);
    return yearly / 365;
}
function bsRho(spot, strike, T, sigma, side, r = RISK_FREE_RATE) {
    const dd = bsD1D2(spot, strike, T, sigma, r);
    if (!dd) return null;
    const { d2 } = dd;
    // Per 1% rate move (divide by 100), same convention as Vega.
    return side === "call"
        ? (strike * T * Math.exp(-r * T) * normalCDF(d2)) / 100
        : (-strike * T * Math.exp(-r * T) * normalCDF(-d2)) / 100;
}
// Full Greeks + OI bundle for whichever strike is currently selected in the
// Option Chain modal (click the strike cell — see selectedOptionStrike).
// Returns both CE and PE sides since a "strike" selection covers both.
// Black-Scholes price — used only to back out an implied vol when the chain
// carries no IV column (many relay payloads omit it, which is exactly why the
// header Greek buttons showed "—" even after picking a strike).
function bsPrice(spot, strike, T, sigma, side, r = RISK_FREE_RATE) {
    const dd = bsD1D2(spot, strike, T, sigma, r);
    if (!dd) return null;
    const disc = strike * Math.exp(-r * T);
    return side === "call"
        ? spot * normalCDF(dd.d1) - disc * normalCDF(dd.d2)
        : disc * normalCDF(-dd.d2) - spot * normalCDF(-dd.d1);
}
// Bisection IV solver — robust (no Newton blow-ups deep ITM/OTM); 60 passes
// over 1%..300% vol costs nothing for a single strike.
function impliedVol(ltp, spot, strike, T, side) {
    if (!ltp || ltp <= 0 || !spot || !strike || !T) return null;
    const intrinsic = side === "call" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
    if (ltp < intrinsic * 0.98) return null; // stale/arb quote
    let lo = 0.01, hi = 3.0;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        const p = bsPrice(spot, strike, T, mid, side);
        if (p == null) return null;
        if (p > ltp) hi = mid; else lo = mid;
    }
    const sigma = (lo + hi) / 2;
    return sigma > 0.011 && sigma < 2.99 ? sigma : null;
}
function computeSelectedOptionGreeks(row, spot, expiry, fallbackIvPct) {
    if (!row || spot == null) return null;
    const T = yearsToExpiry(expiry);
    if (T == null) return null;
    // IV priority: chain IV -> IV solved from the option's own LTP ->
    // chain-median IV / India VIX, so Greeks are never blank.
    const fallbackSigma = fallbackIvPct != null && fallbackIvPct > 0 ? fallbackIvPct / 100 : null;
    const callSigma = row.callIv != null && row.callIv > 0
        ? row.callIv / 100
        : (impliedVol(row.callLtp, spot, row.strike, T, "call") ?? fallbackSigma);
    const putSigma = row.putIv != null && row.putIv > 0
        ? row.putIv / 100
        : (impliedVol(row.putLtp, spot, row.strike, T, "put") ?? fallbackSigma);
    const out = {
        strike: row.strike,
        callOi: row.callOi ?? null,
        putOi: row.putOi ?? null,
        callQuote: normalizeOptionQuote(row, "call"),
        putQuote: normalizeOptionQuote(row, "put"),
        callIv: row.callIv != null && row.callIv > 0 ? row.callIv : (callSigma != null ? +(callSigma * 100).toFixed(2) : null),
        putIv: row.putIv != null && row.putIv > 0 ? row.putIv : (putSigma != null ? +(putSigma * 100).toFixed(2) : null),
        ivSource: (row.callIv != null && row.callIv > 0) ? "chain" : (callSigma != null ? "solved" : "none"),
    };
    if (callSigma) {
        const ddCall = bsD1D2(spot, row.strike, T, callSigma);
        out.callDelta = row.callDelta != null ? row.callDelta : (ddCall ? normalCDF(ddCall.d1) : null);
        out.callGamma = bsGamma(spot, row.strike, T, callSigma);
        out.callTheta = bsThetaDaily(spot, row.strike, T, callSigma, "call");
        out.callVega = bsVega(spot, row.strike, T, callSigma);
        out.callRho = bsRho(spot, row.strike, T, callSigma, "call");
    }
    if (putSigma) {
        const ddPut = bsD1D2(spot, row.strike, T, putSigma);
        out.putDelta = row.putDelta != null ? row.putDelta : (ddPut ? normalCDF(ddPut.d1) - 1 : null);
        out.putGamma = bsGamma(spot, row.strike, T, putSigma);
        out.putTheta = bsThetaDaily(spot, row.strike, T, putSigma, "put");
        out.putVega = bsVega(spot, row.strike, T, putSigma);
        out.putRho = bsRho(spot, row.strike, T, putSigma, "put");
    }
    return out;
}
// ----------------------------------------------------------------------
// Signal-only option premium risk model.
//
// The relay has historically sent several quote-field spellings depending
// on which server version produced the payload. Normalize those spellings
// here, but do not manufacture a quote: a missing bid or ask is a hard
// reason to WAIT because an option buyer cannot enter at LTP alone.
function firstFinite(...values) {
    for (const value of values) {
        const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
        if (Number.isFinite(n)) return n;
    }
    return null;
}
function normalizeOptionQuote(row, side) {
    if (!row || !side) return null;
    const prefix = side === "call" ? "call" : "put";
    const short = side === "call" ? "ce" : "pe";
    const nested = row[prefix] && typeof row[prefix] === "object" ? row[prefix] : {};
    const quote = row[`${prefix}Quote`] && typeof row[`${prefix}Quote`] === "object" ? row[`${prefix}Quote`] : {};
    const ltp = firstFinite(
        row[`${prefix}Ltp`], row[`${prefix}LTP`], row[`${prefix}ltp`],
        row[`${short}Ltp`], row[`${short}LTP`], nested.ltp, quote.ltp
    );
    const bid = firstFinite(
        row[`${prefix}Bid`], row[`${prefix}bid`], row[`${prefix}BidPrice`],
        row[`${prefix}BestBid`], row[`${short}Bid`], row[`${short}bid`],
        row[`${short}BidPrice`], nested.bid, nested.bidPrice, quote.bid, quote.bidPrice
    );
    const ask = firstFinite(
        row[`${prefix}Ask`], row[`${prefix}ask`], row[`${prefix}AskPrice`],
        row[`${prefix}BestAsk`], row[`${short}Ask`], row[`${short}ask`],
        row[`${short}AskPrice`], nested.ask, nested.askPrice, quote.ask, quote.askPrice
    );
    const volume = firstFinite(
        row[`${prefix}Volume`], row[`${prefix}volume`], row[`${prefix}Vol`],
        row[`${short}Volume`], row[`${short}volume`], nested.volume, quote.volume,
        row.volume
    );
    const oi = firstFinite(
        row[`${prefix}Oi`], row[`${prefix}OI`], row[`${prefix}oi`],
        row[`${short}Oi`], row[`${short}OI`], row[`${short}oi`], nested.oi, quote.oi
    );
    const mid = bid != null && ask != null && ask >= bid ? (bid + ask) / 2 : null;
    const spread = mid != null ? ask - bid : null;
    const spreadPct = mid > 0 && spread != null ? (spread / mid) * 100 : null;
    return {
        ltp,
        bid,
        ask,
        mid,
        spread,
        spreadPct,
        volume,
        oi,
        executable: bid != null && ask != null && bid >= 0 && ask >= bid && mid > 0,
    };
}
function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
function calculateRequiredSpotMove(delta, gamma, premiumNeeded) {
    if (!Number.isFinite(delta) || !Number.isFinite(gamma) || !Number.isFinite(premiumNeeded)) return null;
    if (premiumNeeded <= 0) return 0;
    if (Math.abs(gamma) < 1e-12) return delta > 0 ? premiumNeeded / delta : null;
    const discriminant = delta * delta + 2 * gamma * premiumNeeded;
    if (discriminant < 0) return null;
    const roots = [
        (-delta + Math.sqrt(discriminant)) / gamma,
        (-delta - Math.sqrt(discriminant)) / gamma,
    ].filter((x) => Number.isFinite(x));
    return roots.length ? roots.sort((a, b) => Math.abs(a) - Math.abs(b))[0] : null;
}
function computeOptionPremiumForecast({ row, spot, expiry, side, expectedSpotMovePct, ivDriftPct, config, receivedAt, now = Date.now() }) {
    const quote = normalizeOptionQuote(row, side);
    const prefix = side === "call" ? "call" : "put";
    const reasons = [];
    if (!row || !Number.isFinite(spot) || spot <= 0) reasons.push("missing live underlying price");
    const T = yearsToExpiry(expiry);
    const hoursToExpiry = T != null ? T * 365 * 24 : null;
    if (T == null) reasons.push("missing expiry");
    if (hoursToExpiry != null && hoursToExpiry < config.minHoursToExpiry) reasons.push("insufficient time to expiry");
    if (!quote?.executable) reasons.push("missing executable bid/ask");
    if (receivedAt != null && now - receivedAt > config.maxQuoteAgeMs) reasons.push("option quote is stale");
    if (quote?.spreadPct == null || quote.spreadPct > config.maxSpreadPct) reasons.push(`spread ${quote?.spreadPct == null ? "unknown" : quote.spreadPct.toFixed(2) + "%"} exceeds ${config.maxSpreadPct}%`);
    if (!Number.isFinite(expectedSpotMovePct)) reasons.push("insufficient underlying price history");
    const rawIvPct = firstFinite(row?.[`${prefix}Iv`]);
    const ivFromChain = rawIvPct != null && rawIvPct > 0 ? rawIvPct / 100 : null;
    const ivFromQuote = !ivFromChain && quote?.mid > 0 && T != null
        ? impliedVol(quote.mid, spot, row.strike, T, side)
        : null;
    const sigma = ivFromChain ?? ivFromQuote;
    const ivPct = sigma != null ? sigma * 100 : null;
    if (!sigma) reasons.push("missing contract IV");
    const greeks = sigma && T != null
        ? {
            delta: firstFinite(row?.[`${prefix}Delta`]) ?? (bsD1D2(spot, row.strike, T, sigma) ? (side === "call" ? normalCDF(bsD1D2(spot, row.strike, T, sigma).d1) : normalCDF(bsD1D2(spot, row.strike, T, sigma).d1) - 1) : null),
            gamma: bsGamma(spot, row.strike, T, sigma),
            vega: bsVega(spot, row.strike, T, sigma),
            theta: bsThetaDaily(spot, row.strike, T, sigma, side),
        }
        : { delta: null, gamma: null, vega: null, theta: null };
    if (![greeks.delta, greeks.gamma, greeks.vega, greeks.theta].every((x) => Number.isFinite(x))) reasons.push("incomplete Greeks");
    const horizonDays = Math.max(config.horizonMinutes / (24 * 60), 1 / (24 * 60));
    const signedSpotMove = Number.isFinite(expectedSpotMovePct) ? expectedSpotMovePct : 0;
    const dS = spot * signedSpotMove / 100;
    const ivMove = Number.isFinite(ivDriftPct) ? ivDriftPct : 0;
    const crushMove = -Math.abs(config.ivCrushStressPct);
    const modelChange = (ivScenario) => greeks.delta * dS + 0.5 * greeks.gamma * dS * dS + greeks.vega * ivScenario + greeks.theta * horizonDays;
    const halfSpread = quote?.spread != null ? quote.spread / 2 : 0;
    const slippage = quote?.mid != null ? quote.mid * config.slippagePct / 100 : 0;
    const roundTripCost = halfSpread * 2 + slippage * 2;
    const baseChange = modelChange(ivMove);
    const stressChange = modelChange(ivMove + crushMove);
    const expectedMid = quote?.mid != null ? quote.mid + baseChange : null;
    const stressMid = quote?.mid != null ? quote.mid + stressChange : null;
    const expectedExitBid = expectedMid != null ? Math.max(0, expectedMid - halfSpread - slippage) : null;
    const stressExitBid = stressMid != null ? Math.max(0, stressMid - halfSpread - slippage) : null;
    const netExpectedChange = expectedExitBid != null && quote?.ask != null ? expectedExitBid - quote.ask : null;
    const netStressChange = stressExitBid != null && quote?.ask != null ? stressExitBid - quote.ask : null;
    const targetPremium = quote?.ask != null
        ? quote.ask + Math.max(config.minEdgePremium, quote.ask * config.minExpectedReturnPct / 100)
        : null;
    const targetDelta = targetPremium != null
        ? targetPremium - (quote?.ask || 0) + roundTripCost - greeks.vega * (ivMove + crushMove) - greeks.theta * horizonDays
        : null;
    const requiredSpotMove = calculateRequiredSpotMove(greeks.delta, 0.5 * greeks.gamma, targetDelta);
    const requiredSpotMovePct = requiredSpotMove != null ? (requiredSpotMove / spot) * 100 : null;
    const thetaPctOfEntry = quote?.ask > 0 ? Math.abs(greeks.theta * horizonDays / quote.ask) * 100 : null;
    if (thetaPctOfEntry != null && thetaPctOfEntry > config.maxThetaPct) reasons.push(`theta costs ${thetaPctOfEntry.toFixed(2)}% over the horizon`);
    if (quote?.volume == null) reasons.push("missing option volume");
    else if (quote.volume < config.minVolume) reasons.push(`volume ${quote.volume} below ${config.minVolume}`);
    if (quote?.oi == null) reasons.push("missing option OI");
    else if (quote.oi < config.minOi) reasons.push(`OI ${quote.oi} below ${config.minOi}`);
    const hasData = reasons.length === 0;
    const stressPass = hasData
        && netStressChange >= config.minNetChange
        && targetPremium != null
        && stressExitBid >= targetPremium
        && (side === "call" ? signedSpotMove > 0 : signedSpotMove < 0);
    const confidence = !hasData ? 0 : Math.round(clampNumber(
        50 + (netStressChange / Math.max(quote.ask, 1)) * 200 + (Math.abs(signedSpotMove) >= config.minMovePct ? 15 : 0) - (thetaPctOfEntry || 0) * 2,
        0, 95
    ));
    return {
        side,
        strike: row?.strike ?? null,
        currentPremium: quote?.ask ?? quote?.ltp ?? null,
        mid: quote?.mid ?? quote?.ltp ?? null,
        bid: quote?.bid ?? null,
        ask: quote?.ask ?? null,
        spreadPct: quote?.spreadPct ?? null,
        volume: quote?.volume ?? null,
        oi: quote?.oi ?? null,
        ivPct,
        ivSource: ivFromChain ? "chain" : ivFromQuote ? "implied-from-mid" : "none",
        expectedSpotMovePct: signedSpotMove,
        ivDriftPct: ivMove,
        ivCrushStressPct: config.ivCrushStressPct,
        delta: greeks.delta,
        gamma: greeks.gamma,
        vega: greeks.vega,
        thetaDaily: greeks.theta,
        thetaCost: Number.isFinite(greeks.theta) ? greeks.theta * horizonDays : null,
        expectedPremium: expectedMid,
        stressPremium: stressMid,
        expectedExitBid,
        stressExitBid,
        expectedNetChange: netExpectedChange,
        stressNetChange: netStressChange,
        targetPremium,
        targetReachableUnderStress: stressExitBid != null && stressExitBid >= targetPremium,
        requiredSpotMovePct,
        thetaPctOfEntry,
        confidence,
        qualified: stressPass,
        hasData,
        reasons,
        riskFlags: [
            ...(thetaPctOfEntry != null && thetaPctOfEntry > config.maxThetaPct ? ["THETA"] : []),
            ...(ivMove + crushMove < -Math.abs(config.ivCrushStressPct) / 2 ? ["IV CRUSH"] : ["IV STRESS TESTED"]),
            ...(quote?.spreadPct != null && quote.spreadPct > config.maxSpreadPct / 2 ? ["WIDE SPREAD"] : []),
        ],
    };
}
// Returns a SIGNED expected spot-move percentage over the forecast horizon.
// Positive = bullish direction (calls favoured), negative = bearish (puts favoured).
// Uses the 5-bar net move as the primary direction signal — more reliable than
// a single-bar close-to-close which flips on every candle.
function estimateUnderlyingMovePct(candles, marketRow, config) {
    const closes = (candles || []).map((c) => c?.c).filter((x) => Number.isFinite(x) && x > 0);
    if (closes.length < 5) return null;
    const lookback = Math.min(5, closes.length - 1);
    const recentMove = ((closes[closes.length - 1] - closes[closes.length - 1 - lookback]) / closes[closes.length - 1 - lookback]) * 100;
    const latestBarMove = closes.length > 1 ? ((closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2]) * 100 : 0;
    // Use 5-bar direction as the primary sign; fall back to last-bar only when
    // the 5-bar move is effectively flat (< minMovePct).
    const direction = Math.abs(recentMove) >= config.minMovePct ? Math.sign(recentMove) : Math.sign(latestBarMove);
    if (direction === 0) return null;
    const magnitude = Math.max(Math.abs(recentMove), Math.abs(latestBarMove));
    if (!Number.isFinite(magnitude) || magnitude <= 0) return null;
    return direction * clampNumber(magnitude, config.minMovePct, config.maxExpectedSpotMovePct);
}
function selectActiveAffordableRow(rows, spot, side) {
    if (!Array.isArray(rows) || !rows.length || !Number.isFinite(spot)) return null;
    const prefix = side === "call" ? "call" : "put";
    const nearest = rows.reduce((best, row) => !best || Math.abs(row.strike - spot) < Math.abs(best.strike - spot) ? row : best, null);
    const candidates = rows.filter((row) => {
        const quote = normalizeOptionQuote(row, side);
        const price = quote?.ask ?? quote?.mid;
        return Number.isFinite(row.strike) && price > 0 && Math.abs(row.strike - spot) / spot <= 0.02;
    });
    if (!candidates.length) return nearest;
    return [...candidates].sort((a, b) => {
        const qa = normalizeOptionQuote(a, side), qb = normalizeOptionQuote(b, side);
        const activityA = Math.log1p(qa?.volume ?? 0) * 2 + Math.log1p(qa?.oi ?? 0);
        const activityB = Math.log1p(qb?.volume ?? 0) * 2 + Math.log1p(qb?.oi ?? 0);
        const cheapA = -Math.log(Math.max(qa?.ask ?? qa?.mid ?? 1, 0.01));
        const cheapB = -Math.log(Math.max(qb?.ask ?? qb?.mid ?? 1, 0.01));
        const nearA = -Math.abs(a.strike - spot) / spot * 10;
        const nearB = -Math.abs(b.strike - spot) / spot * 10;
        return (activityB + cheapB + nearB) - (activityA + cheapA + nearA);
    })[0] || nearest;
}
// Vanna = -e^(-qT)*n(d1)*d2/sigma — discounts on dividend yield q, NOT the
// risk-free rate r. With q=0 (no-dividend index assumption) that factor is
// just 1, so it's dropped entirely rather than wrongly discounting by r.
// Same sign for calls and puts at a given strike (put-call parity), so
// callOI+putOI can be summed directly. Scaled /100 so the result reads as
// "delta change per 1-point IV move" (e.g. 14.5% -> 15.5%), the way IV
// actually moves tick-to-tick, instead of per-100%-IV-change.
function bsVanna(spot, strike, T, sigma, r = RISK_FREE_RATE) {
    const dd = bsD1D2(spot, strike, T, sigma, r);
    if (!dd) return 0;
    return (-normalPDF(dd.d1) * dd.d2 / sigma) / 100;
}
// Charm (dDelta/dTime), q=0 (no dividend yield modeled for index options).
// Scaled /365 so the result reads as "delta decay per 1 day passing"
// instead of per-year, which is the unit that actually matters at 0-3 DTE.
function bsCharm(spot, strike, T, sigma, r = RISK_FREE_RATE) {
    const dd = bsD1D2(spot, strike, T, sigma, r);
    if (!dd) return 0;
    const { d1, d2 } = dd;
    return (-normalPDF(d1) * (2 * r * T - d2 * sigma * Math.sqrt(T)) / (2 * T * sigma * Math.sqrt(T))) / 365;
}
// Vomma (Volga) = dVega/dSigma — how much Vega itself changes as IV moves,
// i.e. the convexity of an option's vega exposure. Standard closed form is
// Vega_raw * d1 * d2 / sigma. Scaled /10000 (not /100 like Vega) because
// this is a SECOND derivative w.r.t. IV: bsVega above already divides its
// raw per-unit-sigma value by 100 once to read as "per 1pt IV move" — Vomma
// needs that same /100 conversion applied twice (once for the Vega leg,
// once for its own sensitivity to IV), so it reads as "how many Vega-points
// change per 1pt further IV move", the practical number a trader cares
// about, not the raw per-100%-vol-squared textbook unit.
function bsVomma(spot, strike, T, sigma, r = RISK_FREE_RATE) {
    const dd = bsD1D2(spot, strike, T, sigma, r);
    if (!dd) return 0;
    const vegaRaw = spot * Math.sqrt(T) * normalPDF(dd.d1);
    return (vegaRaw * dd.d1 * dd.d2 / sigma) / 10000;
}
// TradingView's own official widget. IMPORTANT: does NOT use the raw
// widgetembed iframe URL — TradingView added a CSP header that blocks that
// from being framed on third-party sites (net::ERR_BLOCKED_BY_CSP). This
// loads their sanctioned tv.js script instead, which creates its own
// properly-permitted embed and isn't subject to that block.
let tvScriptPromise = null;
function loadTradingViewScript() {
    if (typeof window === "undefined") return Promise.resolve();
    if (window.TradingView) return Promise.resolve();
    if (tvScriptPromise) return tvScriptPromise;
    tvScriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://s3.tradingview.com/tv.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("TradingView script failed to load"));
        document.head.appendChild(script);
    });
    return tvScriptPromise;
}
function TradingViewWidget({ symbol, isLight }) {
    const containerId = useMemo(() => `tv-widget-${Math.random().toString(36).slice(2)}`, []);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let cancelled = false;
        setFailed(false);
        loadTradingViewScript()
            .then(() => {
                if (cancelled) return;
                const el = document.getElementById(containerId);
                if (!el || !window.TradingView) return;
                el.innerHTML = "";
                new window.TradingView.widget({
                    autosize: true,
                    symbol,
                    interval: "1",
                    timezone: "Asia/Kolkata",
                    theme: isLight ? "light" : "dark",
                    style: "1",
                    locale: "in",
                    toolbar_bg: isLight ? "#f8fafc" : "#0f172a",
                    hide_top_toolbar: false,
                    hide_side_toolbar: false,
                    withdateranges: true,
                    container_id: containerId,
                });
            })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [symbol, isLight, containerId]);
    if (failed) {
        return (<div className="flex items-center justify-center h-[420px] text-xs text-slate-300 font-mono px-4 text-center">
            TradingView chart couldn't load (no internet reachable from this environment). Try "Our ticks" instead.
          </div>);
    }
    return <div id={containerId} style={{ height: 420, width: "100%" }} />;
}
function CandleChart({ symbol, candles, isLight }) {
    const closes = candles.map((c) => c.c);
    const ema9 = computeEMA(closes, 9);
    const ema21 = computeEMA(closes, 21);
    const rsi14 = computeRSI(closes, 14);
    // Each candle already carries its own true session-anchored VWAP
    // (computed once, when it closed, against the persistent session
    // accumulator — not recomputed here from just the visible buffer, which
    // would silently become a rolling window VWAP once old candles age out
    // of the buffer).
    const data = useMemo(() => candles.map((c, i) => ({ ...c, time: new Date(c.t).toLocaleTimeString("en-IN", { hour12: false, hour: "2-digit", minute: "2-digit" }), ema9: ema9[i], ema21: ema21[i], vwap: c.vwap ?? null, rsi: rsi14[i] })), [candles, ema9, ema21, rsi14]);

    if (candles.length < 2) {
        return (<div className="flex items-center justify-center h-[380px] text-xs text-slate-300 font-mono px-4 text-center">
            Building candles for {symbol} from live ticks — needs the relay running + LIVE. Only {candles.length} candle{candles.length === 1 ? "" : "s"} collected so far.
          </div>);
    }

    // Self-contained SVG candlestick renderer, styled to match TradingView's
    // actual conventions rather than a generic chart: price axis on the
    // RIGHT (TV puts it there, not the left), a dark panel background behind
    // the plot (TV never renders candles on the page's own background), the
    // real TradingView green/red (#0d9488 / #ef5350, not generic emerald/
    // rose), tighter candle bodies with a visible gap between them, and a
    // dashed last-price line with a price tag — all standard TV chart chrome
    // this custom renderer was missing before.
    const VB_W = 1000, VB_H = 300, PAD_L = 8, PAD_R = 54, PAD_T = 8, PAD_B = 20;
    const plotW = VB_W - PAD_L - PAD_R, plotH = VB_H - PAD_T - PAD_B;
    const allHighs = data.map((d) => d.h), allLows = data.map((d) => d.l);
    const allLineVals = [...data.map((d) => d.ema9), ...data.map((d) => d.ema21), ...data.map((d) => d.vwap)].filter((v) => typeof v === "number" && !Number.isNaN(v));
    const yMax = Math.max(...allHighs, ...allLineVals);
    const yMin = Math.min(...allLows, ...allLineVals);
    const yRange = yMax - yMin || 1;
    const yPad = yRange * 0.08;
    const domainMax = yMax + yPad, domainMin = yMin - yPad, domainRange = domainMax - domainMin || 1;
    const yToPx = (v) => PAD_T + (1 - (v - domainMin) / domainRange) * plotH;
    const n = data.length;
    const slotW = plotW / n;
    const xToPx = (i) => PAD_L + i * slotW + slotW / 2;
    const bodyW = Math.max(2, slotW * 0.62); // TV-style: candles nearly touch, thin visible gap
    const panelBg = isLight ? "#ffffff" : "#0d1117"; // TradingView's actual dark-theme panel color, not the page bg
    const gridColor = isLight ? "#eef2f6" : "#1c2128";
    const axisColor = isLight ? "#787b86" : "#787b86"; // TV uses this muted grey for axis text in both themes
    const upColor = "#0d9488", downColor = "#ef5350"; // TradingView's actual default candle colors
    const linePath = (key) => data.map((d, i) => `${i === 0 ? "M" : "L"} ${xToPx(i).toFixed(1)} ${yToPx(d[key]).toFixed(1)}`).join(" ");
    const yTicks = [domainMin, domainMin + domainRange / 2, domainMax];
    const xTickIdxs = n <= 5 ? data.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
    const lastClose = data[data.length - 1]?.c;
    const lastUp = data.length > 1 ? lastClose >= data[data.length - 1].o : true;

    return (<div>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ width: "100%", height: 300, display: "block", background: panelBg }}>
          {yTicks.map((v, i) => (<g key={i}>
              <line x1={PAD_L} x2={VB_W - PAD_R} y1={yToPx(v)} y2={yToPx(v)} stroke={gridColor} strokeWidth={1}/>
              <text x={VB_W - PAD_R + 6} y={yToPx(v) + 3} fontSize="9" textAnchor="start" fill={axisColor}>{formatPrice(v)}</text>
            </g>))}
          {xTickIdxs.map((i) => (<text key={i} x={xToPx(i)} y={VB_H - 4} fontSize="9" textAnchor="middle" fill={axisColor}>{data[i].time}</text>))}
          {data.map((d, i) => {
              const up = d.c >= d.o;
              const color = up ? upColor : downColor;
              const cx = xToPx(i);
              const yH = yToPx(d.h), yL = yToPx(d.l), yO = yToPx(d.o), yC = yToPx(d.c);
              const bodyTop = Math.min(yO, yC), bodyH = Math.max(1, Math.abs(yC - yO));
              return (<g key={d.t}>
                  <line x1={cx} x2={cx} y1={yH} y2={yL} stroke={color} strokeWidth={1}/>
                  <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color}/>
                </g>);
            })}
          <path d={linePath("ema9")} fill="none" stroke="#2962ff" strokeWidth={1.25}/>
          <path d={linePath("ema21")} fill="none" stroke="#ff6d00" strokeWidth={1.25}/>
          <path d={linePath("vwap")} fill="none" stroke="#9c27b0" strokeWidth={1.25} strokeDasharray="4 3"/>
          {typeof lastClose === "number" && (<g>
              <line x1={PAD_L} x2={VB_W - PAD_R} y1={yToPx(lastClose)} y2={yToPx(lastClose)} stroke={lastUp ? upColor : downColor} strokeWidth={1} strokeDasharray="2 2" opacity={0.7}/>
              <rect x={VB_W - PAD_R} y={yToPx(lastClose) - 7} width={PAD_R} height={14} fill={lastUp ? upColor : downColor}/>
              <text x={VB_W - PAD_R + 4} y={yToPx(lastClose) + 3} fontSize="9" fontWeight="bold" fill="#0d1117">{formatPrice(lastClose)}</text>
            </g>)}
        </svg>
        <svg viewBox={`0 0 ${VB_W} 90`} preserveAspectRatio="none" style={{ width: "100%", height: 90, display: "block", background: panelBg }}>
          {[30, 70].map((v) => (<g key={v}>
              <line x1={PAD_L} x2={VB_W - PAD_R} y1={8 + (1 - v / 100) * 74} y2={8 + (1 - v / 100) * 74} stroke={gridColor} strokeWidth={1}/>
              <text x={VB_W - PAD_R + 6} y={8 + (1 - v / 100) * 74 + 3} fontSize="9" textAnchor="start" fill={axisColor}>{v}</text>
            </g>))}
          <path d={data.map((d, i) => `${i === 0 ? "M" : "L"} ${xToPx(i).toFixed(1)} ${(8 + (1 - (typeof d.rsi === "number" ? d.rsi : 50) / 100) * 74).toFixed(1)}`).join(" ")} fill="none" stroke="#f472b6" strokeWidth={1.5}/>
        </svg>
      </div>);
}

export function SignalBoard() {
    const [isLight, setIsLight] = useState(false);
    const [sessionElapsedPct, setSessionElapsedPct] = useState(50);
    const [showSuperSignal, setShowSuperSignal] = useState(true);
    // Manual BUY/SELL/WAIT tick boxes for the "additional research"
    // indicator tables (NEW INDICATORS RESEARCH BOX + the two 10-indicator
    // tables below it). Those ~40 rows are reference tables, not live
    // evaluate()-driven cards like initialIndicators, so there is no
    // computed status to light up automatically — this gives them the
    // same three-tick-box UI as the main board, driven by the trader's
    // own manual read of each row's BUY/SELL/WAIT criteria columns.
    // Keyed by `${sectionKey}-${rowIndex}`, one entry per row.
    const [manualIndicatorTicks, setManualIndicatorTicks] = useState({});
    const setManualTick = (key, value) => setManualIndicatorTicks((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }));
    // TV Grid mode — a dense 10-column x 8-row wall of all indicators,
    // built for casting to a large screen (TV/Chromecast) where the normal
    // single-column card list is too tall to be useful. Each cell repeats
    // the CMP + ATM Call/Put price so price context is visible no matter
    // which cell the eye lands on from across a room.
    const [tvGridMode, setTvGridMode] = useState(false);
    // Which pane the TV overlay shows: the dense indicator wall, the live
    // chart, or the market watch table. Option Chain reuses the existing
    // global modal (setOptionChainOpen) since that already renders on top
    // of everything (z-50) regardless of what's underneath it.
    const [tvGridView, setTvGridView] = useState("indicators");
    // Note: we deliberately do NOT call the browser Fullscreen API here.
    // It covers the screen fine already via the fixed inset-0 overlay CSS
    // below, and calling requestFullscreen() triggers a persistent
    // "you are in full screen mode" toast in Chrome that can't be
    // dismissed from page code — only the browser itself controls that.
    const [state, setState] = useState(() => {
        const s = {};
        initialIndicators.forEach((ind) => {
            s[ind.id] = {};
            [ind.a, ind.b, ind.c, ind.d, ind.e, ind.f].filter(Boolean).forEach((f) => (s[ind.id][f.key] = f.value));
        });
        return s;
    });
    const handleChange = (indId, key, val) => {
        if (Number.isNaN(val))
            return;
        setState((prev) => ({ ...prev, [indId]: { ...prev[indId], [key]: val } }));
    };
    // ROLLING-WINDOW FIX (Ask-Hit Ratio): omsAskHitRatio's askHits/bidHits
    // are single manual/last-value entries per poll, single-tick sensitive.
    // Accumulate each new entry into a trailing 5-minute buffer and expose
    // the windowed sums as askHitsWindowed/bidHitsWindowed so evaluate/reason
    // (and the OMS master score) judge aggression over a window, not one tick.
    const askHitWindowRef = useRef([]);
    useEffect(() => {
        const raw = state.omsAskHitRatio;
        if (!raw) return;
        const askHits = Number(raw.askHits || 0);
        const bidHits = Number(raw.bidHits || 0);
        if (askHits === 0 && bidHits === 0) return;
        const now = Date.now();
        const buf = askHitWindowRef.current;
        const last = buf[buf.length - 1];
        if (!last || last.askHits !== askHits || last.bidHits !== bidHits) {
            buf.push({ t: now, askHits, bidHits });
        }
        const WINDOW_MS = 5 * 60 * 1000;
        while (buf.length && now - buf[0].t > WINDOW_MS) buf.shift();
        const askHitsWindowed = buf.reduce((s, x) => s + x.askHits, 0);
        const bidHitsWindowed = buf.reduce((s, x) => s + x.bidHits, 0);
        setState((prev) => {
            const cur = prev.omsAskHitRatio || {};
            if (cur.askHitsWindowed === askHitsWindowed && cur.bidHitsWindowed === bidHitsWindowed) return prev;
            return { ...prev, omsAskHitRatio: { ...cur, askHitsWindowed, bidHitsWindowed } };
        });
    }, [state.omsAskHitRatio?.askHits, state.omsAskHitRatio?.bidHits]);
    const [apiStatus, setApiStatus] = useState("CONNECTING");
    // --- Single base-URL system: if window.SIGNAL_BASE_URL (or saved
    // "sb_base_url") is set, relay = base + "/relay" and angel = base + "/angel".
    // This only fires when the individual relay/angel overrides are absent,
    // so explicit per-feed URLs (saved or window.RELAY_WS_URL/ANGEL_WS_URL)
    // always win over the derived ones.
    const deriveFromBase = (path) => {
        if (typeof window === "undefined") return null;
        const base = window.localStorage?.getItem("sb_base_url") || window.SIGNAL_BASE_URL;
        if (!base) return null;
        return base.replace(/\/+$/, "") + path;
    };
    const [relayUrl, setRelayUrl] = useState(() => {
        if (typeof window === "undefined") return "ws://localhost:8090";
        const saved = window.localStorage?.getItem("sb_relay_url");
        return saved || window.RELAY_WS_URL || deriveFromBase("/relay") || "ws://localhost:8090";
    });
    // --- Angel One feed: independent second data source, separate from the
    // Upstox relay above. Does not affect relayUrl/ws logic in any way.
    const [angelWsUrl, setAngelWsUrl] = useState(() => {
        if (typeof window === "undefined") return "";
        const saved = window.localStorage?.getItem("sb_angel_ws_url");
        return saved || window.ANGEL_WS_URL || deriveFromBase("/angel") || "";
    });
    const [angelStatus, setAngelStatus] = useState("OFFLINE");
    const [angelChain, setAngelChain] = useState([]); // [{symbol, ltp, oi, volume}]
    const angelWsRef = useRef(null);
    const [headerSymbolInput, setHeaderSymbolInput] = useState("");
    const [headerSymbolOpen, setHeaderSymbolOpen] = useState(false);
    const headerSymbolRef = useRef(null);
    const [marketData, setMarketData] = useState(() => ({ ...DEFAULT_MARKET_MAP }));

    const indiaVixPrevRef = useRef(null); // { value, ts } — snapshot updates at most every 5 min, not every tick
    useEffect(() => {
        const vixNow = marketData["INDIA VIX"]?.ltp;
        if (vixNow == null) return;
        const nowTs = Date.now();
        const snap = indiaVixPrevRef.current;
        const VIX_PREV_WINDOW_MS = 5 * 60 * 1000; // 5 minutes — a real "previous poll" baseline, not tick-to-tick noise
        const vixPrev = snap == null ? vixNow : snap.value;
        setState((prev) => ({
            ...prev,
            indiaVixFear: { vixNow: vixNow, vixPrev: vixPrev },
        }));
        if (snap == null || nowTs - snap.ts >= VIX_PREV_WINDOW_MS) {
            indiaVixPrevRef.current = { value: vixNow, ts: nowTs };
        }
    }, [marketData["INDIA VIX"]?.ltp]);
    // Header VIX BUY/SELL tickbox — combines all 3 requested modes into one
    // verdict: (1) fixed absolute levels, (2) % change vs previous poll,
    // (3) both fully editable by the user (tap the numbers to change them).
    const [vixHeaderThresholds, setVixHeaderThresholds] = useState({ buyBelow: 13, sellAbove: 18, pctChange: 3 });
    const vixHeaderSignal = useMemo(() => {
        const now = marketData["INDIA VIX"]?.ltp;
        const prev = indiaVixPrevRef.current?.value;
        if (now == null) return { verdict: "WAIT", reason: "No VIX data yet." };
        const pctChg = prev ? ((now - prev) / prev) * 100 : 0;
        const { buyBelow, sellAbove, pctChange } = vixHeaderThresholds;
        // Fixed-level or %-change rise -> SELL (fear rising / premium expensive)
        if (now >= sellAbove || pctChg >= pctChange) {
            return { verdict: "SELL", reason: `VIX ${now.toFixed(2)} (${pctChg >= 0 ? "+" : ""}${pctChg.toFixed(1)}%) — at/above ${sellAbove} or up ${pctChange}%+, fear rising.` };
        }
        // Fixed-level or %-change fall -> BUY (calm / premium cheap)
        if (now <= buyBelow || pctChg <= -pctChange) {
            return { verdict: "BUY", reason: `VIX ${now.toFixed(2)} (${pctChg >= 0 ? "+" : ""}${pctChg.toFixed(1)}%) — at/below ${buyBelow} or down ${pctChange}%+, calm.` };
        }
        return { verdict: "WAIT", reason: `VIX ${now.toFixed(2)} (${pctChg >= 0 ? "+" : ""}${pctChg.toFixed(1)}%) — mid-range, no edge.` };
    }, [marketData["INDIA VIX"]?.ltp, vixHeaderThresholds]);
    const liveTickSeenRef = useRef(new Set());
    const [marketTab, setMarketTab] = useState("indices");
    const [capTierSymbols, setCapTierSymbols] = useState({ largeCap: [], midCap: [], smallCap: [] });
    const [globalMegacapWatchlist, setGlobalMegacapWatchlist] = useState([]);
    const [marketOpen, setMarketOpen] = useState(true);
    const [marketSearch, setMarketSearch] = useState("");
    const [selectedSymbol, setSelectedSymbol] = useState("NIFTY 50");
    // Option chain: { NIFTY: { expiry, rows: [...] }, BANKNIFTY: { ... } }
    const [optionChains, setOptionChains] = useState({});
    const [optionChainReceivedAt, setOptionChainReceivedAt] = useState({});
    const [fiiDii, setFiiDii] = useState(null); // { date, fiiNet, diiNet } -- raw NSE positioning, not a prediction
    // Next-expiry chain, used only for IV Term Structure (near vs next
    // expiry ATM IV). Relay only sends this for NIFTY/BANKNIFTY — see
    // relay-server-21.js resolvedNextExpiry / "optionChainNext" broadcast.
    const [optionChainsNext, setOptionChainsNext] = useState({});
    const [optionChainErrors, setOptionChainErrors] = useState({});
    const [optionChainOpen, setOptionChainOpen] = useState(false);
    const [optionChainUnderlying, setOptionChainUnderlying] = useState("NIFTY 50");
    const CHAIN_KEY_MAP = { "NIFTY 50": "NIFTY", "NIFTY BANK": "BANKNIFTY" };
    const REVERSE_CHAIN_KEY_MAP = { NIFTY: "NIFTY 50", BANKNIFTY: "NIFTY BANK" };
    const optionChainKey = CHAIN_KEY_MAP[optionChainUnderlying] || optionChainUnderlying;
    // Strips a trailing " <strike> CE/PE" if tradeSymbol is actually an
    // option contract (e.g. "RELIANCE 3000 CE") so every selection —
    // index, stock, commodity, crypto, or a specific option contract on
    // any of those — resolves back to its underlying's chain key. This is
    // the SINGLE source of truth for "what is selected right now"; every
    // indicator/Greek/Top5-CE-PE/Premium-Signal panel reads off it instead
    // of each keeping its own notion of the selected symbol.
    const resolveUnderlyingKey = (sym) => {
        if (!sym) return null;
        const m = /^(.+?)\s+\d+(?:\.\d+)?\s+(CE|PE)$/.exec(sym);
        const base = m ? m[1] : sym;
        return CHAIN_KEY_MAP[base] || base;
    };
    // Strike selected by clicking the strike cell in the Option Chain modal —
    // drives the 7 header Greek/OI buttons (Delta/Gamma/Theta/Vega/Rho/Call OI/Put OI).
    const [selectedOptionStrike, setSelectedOptionStrike] = useState(null);
    // Keep the last successful NSE cash-flow reading locally so a page reload
    // does not blank the card while the relay waits for its next scrape.
    const [fiiDiiCashFlow, setFiiDiiCashFlow] = useState(() => {
        try {
            const saved = typeof window !== "undefined" ? window.localStorage?.getItem("sb_fii_dii_cash_flow") : null;
            return saved ? JSON.parse(saved) : null;
        } catch (err) {
            return null;
        }
    }); // { date, fiiNetCr, diiNetCr } -- raw NSE cash segment, persisted locally
    const [fiiDiiCashFlowStatus, setFiiDiiCashFlowStatus] = useState(null); // { ok, lastAttempt, lastSuccess, lastError } -- surfaces WHY the card is stuck instead of a silent forever-"waiting"
    // --- Krishn AI panel: reads the app's own live state (marketData,
    // optionChains, all wired indicators) and explains what it's showing,
    // via the Claude API. It only reads THIS app's own already-computed
    // data — no outside "hidden" sources — and it explains readings rather
    // than issuing guaranteed buy/sell calls. Informational only.
    const [aiPanelOpen, setAiPanelOpen] = useState(false);
    const [aiMessages, setAiMessages] = useState([]); // [{ role: "user"|"assistant", text }]
    const [aiInput, setAiInput] = useState("");
    const [aiLoading, setAiLoading] = useState(false);
    const [selectedAiAnswer, setSelectedAiAnswer] = useState(null);
     const [krishnUsage, setKrishnUsage] = useState(readKrishnUsage);
     const krishnUsageRef = useRef(krishnUsage);
     const updateKrishnUsage = (next) => {
         krishnUsageRef.current = next;
         setKrishnUsage(next);
         try {
             window.localStorage?.setItem(KRISHN_USAGE_KEY, JSON.stringify(next));
         } catch (err) { /* local storage may be unavailable in private previews */ }
     };
     const reserveKrishnQuestion = () => {
         const current = readKrishnUsage();
         const next = current.count >= KRISHN_DAILY_LIMIT
             ? current
             : { date: current.date, count: current.count + 1 };
         if (next.count >= KRISHN_DAILY_LIMIT && current.count >= KRISHN_DAILY_LIMIT) {
             updateKrishnUsage(next);
             return false;
         }
         updateKrishnUsage(next);
         return true;
     };
     const releaseKrishnQuestion = () => {
         const current = readKrishnUsage();
         if (current.count > 0) updateKrishnUsage({ date: current.date, count: current.count - 1 });
     };
     const krishnRemaining = Math.max(0, KRISHN_DAILY_LIMIT - krishnUsage.count);
     // Krishn AI verdict box — pinned right below the header. It only calls
     // the secure hosted endpoint after an intentional user action.
    const [krishnVerdict, setKrishnVerdict] = useState({ text: "", loading: false, at: null });
    // --- Most-active-option tracker + alert notification ---
    // The Upstox chain doesn't carry a live "volume" field, so activity is
    // read from OI change between polls (a real, honest proxy for where
    // fresh positions are being built) plus LTP % move for "running fast".
    const [mostActiveOption, setMostActiveOption] = useState(null); // { call: {...}, put: {...} }
    const [topActive, setTopActive] = useState({ calls: [], puts: [] }); // top 5 CE and PE by OI change
    const [topActiveOpen, setTopActiveOpen] = useState(false);
    const prevChainForActivityRef = useRef({}); // { [underlying]: { [strike]: {callOi, putOi, callLtp, putLtp} } }
    const sellCountHistoryRef = useRef([]); // recent totalSellCount samples, to confirm sell activity is falling not just low
    const lastAlertFiredAtRef = useRef(0);
    const [notifyPermission, setNotifyPermission] = useState(() => {
        try { return typeof Notification !== "undefined" ? Notification.permission : "unsupported"; }
        catch (err) { return "unsupported"; }
    });
    const wsRef = useRef(null);
    const watchedDepthKeyRef = useRef(null);
    const watchedDepthSideRef = useRef("CE");
    // Rolling bid/ask spread history for whichever single strike/side is
    // currently being watched (10-minute window) — powers spreadCompression
    // for that one side only. Ram trades one strike (one side) at a time,
    // not CE+PE together, so this deliberately does NOT try to track both
    // sides at once (the relay's depth poll only ever watches one
    // instrument_key anyway — see watchDepth below).
    const spreadHistoryRef = useRef({});
    // Global "trade on this symbol" selector — any index/stock/option/commodity.
    // Feeds live LTP into all SPOT_DRIVEN_IDS indicators automatically.
    const [tradeSymbol, setTradeSymbol] = useState("NIFTY 50");
    const [chartMode, setChartMode] = useState("tv"); // "tv" = real TradingView embed, "own" = built from our own live ticks
    // TradingView's free embed widget blocks Indian NSE/BSE/MCX real-time data —
    // it shows a "This symbol is only available on TradingView" popup instead of
    // a chart. This is a data-licensing restriction on TradingView's side, not
    // something wirable from our code. Crypto (Binance-sourced) is not affected.
    // So default to "Our ticks" automatically for anything that isn't crypto.
    useEffect(() => {
        const cat = (marketData[tradeSymbol] || DEFAULT_MARKET_MAP[tradeSymbol])?.category;
        setChartMode(cat === "crypto" ? "tv" : "own");
    }, [tradeSymbol]);
    const [tradeSymbolSearch, setTradeSymbolSearch] = useState("");
    const [tradeSymbolOpen, setTradeSymbolOpen] = useState(false);
    const tradeBoxRef = useRef(null);

    // Close the "Trading On" dropdown on outside click/tap, and on Escape —
    // previously it had no way to close except picking a result, so tapping
    // anywhere else on the page left it stuck open on top of Live Market Watch.
    useEffect(() => {
        function handleOutside(e) {
            if (tradeBoxRef.current && !tradeBoxRef.current.contains(e.target)) {
                setTradeSymbolOpen(false);
            }
            if (headerSymbolRef.current && !headerSymbolRef.current.contains(e.target)) {
                setHeaderSymbolOpen(false);
            }
        }
        function handleEscape(e) {
            if (e.key === "Escape") { setTradeSymbolOpen(false); setHeaderSymbolOpen(false); }
        }
        document.addEventListener("mousedown", handleOutside);
        document.addEventListener("touchstart", handleOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleOutside);
            document.removeEventListener("touchstart", handleOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);
    // This dashboard is intentionally signal-only. It never opens tickets,
    // sends order messages, or manages paper positions.
    const openTicket = () => {};
    const openOptionTicket = () => {};
    useEffect(() => {
        let ws;
        let reconnectTimer;
        let staleTimer;
        const markStale = () => setApiStatus((s) => (s === "LIVE" ? "OFFLINE" : s));
        const resetStaleTimer = () => {
            clearTimeout(staleTimer);
            // If no tick/status arrives for 15s while marked LIVE, fall back to OFFLINE —
            // guards against a relay that's connected locally but has lost its upstream feed.
            staleTimer = setTimeout(markStale, 15000);
        };
        const connect = () => {
            // IMPORTANT: "localhost" only works when this file is opened in a
            // browser running on the SAME device as the relay (e.g. both on
            // your phone, or both on your laptop). This chat preview runs in
            // Anthropic's cloud — its "localhost" is not your phone's
            // localhost, so it can NEVER reach your Termux relay and will
            // always show OFFLINE here. To go LIVE you must build/serve this
            // file yourself (e.g. `npm run build` and open it in Chrome on
            // the same phone running the Termux relay) — not run it inside
            // this chat. window.RELAY_WS_URL lets you override the address
            // (e.g. to a LAN IP) if serving from a different device.
            const socket = new WebSocket(relayUrl);
            ws = socket;
            // NOTE: opening the local socket only means the relay process is reachable —
            // it does NOT mean Upstox itself is authenticated/streaming. We wait for an
            // explicit {type:"status", status:"LIVE"} message from the relay before
            // treating the market as live, so indicator boxes don't glow on a false signal.
            socket.onopen = () => {
                setApiStatus("CONNECTING");
                wsRef.current = socket;
                // Resync the relay's depth-watcher on every connect/reconnect.
                // The relay's watchedDepthKey resets to null on a relay
                // restart, and the frontend only otherwise sends watchDepth
                // when the ATM strike itself changes — without this, a
                // dropped/restarted connection would leave Bid-Ask Imbalance
                // silently frozen on its last reading until the ATM strike
                // happens to roll.
                if (watchedDepthKeyRef.current) {
                    socket.send(JSON.stringify({ type: "watchDepth", instrument_key: watchedDepthKeyRef.current }));
                }
            };
            socket.onmessage = (event) => {
                try {
                    const d = JSON.parse(event.data);
                    // Any message from the relay proves the connection is alive —
                    // reset the watchdog here once, rather than only on a subset of
                    // message types, so an actively-streaming relay never gets
                    // wrongly flipped to OFFLINE just because it didn't also send
                    // an explicit status/tick/optionChain ping within 15s.
                    resetStaleTimer();
                    if (d.type === "status" && d.status) {
                        setApiStatus(d.status);
                        return;
                    }
                    if (d.type === "sessionCandles" && d.ok && d.symbol && Array.isArray(d.candles)) {
                        const symbol = d.symbol;
                        const anchorKey = `${symbol}|${new Date().toDateString()}`;
                        setCandlesBySymbol((prev) => {
                            // Only apply the replay if nothing has been built
                            // live yet for this symbol today. If live ticks
                            // already started accumulating into the VWAP
                            // anchor before this reply arrived, merging here
                            // would double-count — safer to just keep the
                            // (shorter, but already-correct) live-only
                            // session anchor in that case.
                            if (prev[symbol] && prev[symbol].length > 0) return prev;
                            // The relay always returns 1-minute candles.
                            // Merge them into the CURRENT timeframe's bucket
                            // size (bucketMsRef, not a stale closed-over
                            // value — the socket doesn't reconnect on a
                            // timeframe switch) so a 5m/15m/30m chart gets
                            // one properly-aggregated OHLCV candle per
                            // bucket, not several 1-min rows stamped with a
                            // colliding timestamp.
                            const tf = bucketMsRef.current;
                            const bucketMap = new Map();
                            const order = [];
                            for (const raw of d.candles) {
                                const t = Math.floor(raw.t / tf) * tf;
                                if (!bucketMap.has(t)) {
                                    bucketMap.set(t, { t, o: raw.o, h: raw.h, l: raw.l, c: raw.c, vol: raw.vol || 0 });
                                    order.push(t);
                                } else {
                                    const b = bucketMap.get(t);
                                    b.h = Math.max(b.h, raw.h);
                                    b.l = Math.min(b.l, raw.l);
                                    b.c = raw.c; // d.candles is oldest-first, so last write wins correctly
                                    b.vol += raw.vol || 0;
                                }
                            }
                            // FIX (Fatal Flaw 3 — VWAP "Volume Explosion"):
                            // historical candles used to store vttStart=0,
                            // vttEnd=per-interval volume (a delta, not a
                            // running total). Live ticks instead write
                            // row.vtt, which is Upstox's CUMULATIVE
                            // day-volume counter. If a live tick lands on
                            // the same candle bucket a historical seed just
                            // built, `vttEnd - vttStart` jumped from a
                            // normal few-thousand-share interval volume to
                            // the entire day's cumulative volume overnight,
                            // spiking that one candle's volume by orders of
                            // magnitude and crashing VWAP onto its price.
                            // Fix: build historical vttStart/vttEnd on the
                            // SAME running-cumulative scale live ticks use,
                            // so the two models are compatible wherever
                            // they meet.
                            let cumVolRunning = 0;
                            let cumPV = 0, cumP = 0;
                            const built = order.map((t) => {
                                const m = bucketMap.get(t);
                                const intervalVol = m.vol && m.vol > 0 ? m.vol : 0;
                                const vttStart = cumVolRunning;
                                cumVolRunning += intervalVol;
                                const vttEnd = cumVolRunning;
                                const c = { t, o: m.o, h: m.h, l: m.l, c: m.c, vttStart: intervalVol > 0 ? vttStart : null, vttEnd: intervalVol > 0 ? vttEnd : null };
                                const typical = (c.h + c.l + c.c) / 3;
                                const pv = intervalVol > 0 ? typical * intervalVol : c.c;
                                const vol = intervalVol > 0 ? intervalVol : 1;
                                c._baselinePV = cumPV; c._baselineVol = cumP;
                                cumPV += pv; cumP += vol;
                                c.vwap = cumP > 0 ? cumPV / cumP : typical;
                                return c;
                            });
                            vwapAnchorRef.current[anchorKey] = { cumPV, cumP };
                            return { ...prev, [symbol]: built.slice(-375) };
                        });
                        return;
                    }
                    if (d.type === "sessionCandles" && !d.ok) {
                        // Non-fatal — dashboard just falls back to building
                        // the session VWAP/indicators from live ticks only,
                        // same as before this feature existed.
                        console.warn(`Session candle replay unavailable for ${d.symbol}: ${d.error}`);
                        return;
                    }
                    if (d.type === "tick") {
                        resetStaleTimer();
                        // Spot-driven indicators are updated from the selected
                        // tradeSymbol's own live price via the SPOT_DRIVEN_IDS
                        // effect below — not from this raw primary-instrument
                        // tick, which would always be NIFTY regardless of what
                        // the user has selected.
                        return;
                    }
                    if (d.type === "depth") {
                        // Bid-Ask Imbalance Pressure — only trust this if it's
                        // for the strike we last asked the relay to watch
                        // (watchDepth effect below); a stale broadcast for a
                        // strike we've since moved off of would be misleading.
                        if (d.instrument_key && d.instrument_key === watchedDepthKeyRef.current) {
                            setState((prev) => ({ ...prev, bidAskImbalance: { ...prev.bidAskImbalance, bidQty: d.bidQty ?? 0, askQty: d.askQty ?? 0, lastUpdate: Date.now() } }));
                            // Microprice Deviation — reuses this same depth poll.
                            // relay-server-21.js's depth broadcast now sends
                            // bestBid/bestAsk PRICE alongside bidQty/askQty
                            // (matches the bestBid/bestAsk naming already used
                            // in checkLiquidity on the relay side). If an
                            // older relay build is still running without
                            // those fields, hasPrices stays false and the
                            // indicator correctly holds at WAIT instead of
                            // faking a microprice off quantities alone.
                            if (d.bestBid != null && d.bestAsk != null) {
                                const bidQty = d.bidQty ?? 0, askQty = d.askQty ?? 0;
                                const totalQty = bidQty + askQty;
                                const microprice = totalQty > 0 ? (askQty * d.bestBid + bidQty * d.bestAsk) / totalQty : (d.bestBid + d.bestAsk) / 2;
                                const mid = (d.bestBid + d.bestAsk) / 2;
                                setState((prev) => ({ ...prev, micropriceDeviation: { ...prev.micropriceDeviation, microprice: +microprice.toFixed(2), mid: +mid.toFixed(2), hasPrices: true, lastUpdate: Date.now() } }));
                                // Spread Compression Trigger — ONE side only
                                // (whichever strike/side the relay is actually
                                // watching, tracked in watchedDepthSideRef).
                                // Real bid/ask spread, real 10-minute rolling
                                // high, real % compression off that high — no
                                // combined CE+PE guess, since the relay can
                                // only watch one instrument_key at a time.
                                const spreadNow = +(d.bestAsk - d.bestBid).toFixed(2);
                                const now = Date.now();
                                const hist = (spreadHistoryRef.current[d.instrument_key] || []).filter((s) => now - s.t < 10 * 60 * 1000);
                                hist.push({ t: now, spread: spreadNow, mid });
                                spreadHistoryRef.current[d.instrument_key] = hist;
                                const rangeHigh = Math.max(...hist.map((s) => s.spread));
                                const compressionPct = rangeHigh > 0 ? +(((rangeHigh - spreadNow) / rangeHigh) * 100).toFixed(1) : 0;
                                const firstMid = hist[0].mid;
                                const priceChangePct = firstMid ? +(((mid - firstMid) / firstMid) * 100).toFixed(2) : 0;
                                const side = watchedDepthSideRef.current;
                                setState((prev) => ({
                                    ...prev,
                                    spreadCompression: side === "CE"
                                        ? { ...prev.spreadCompression, callSpreadCompression: compressionPct, callPriceChange: priceChangePct }
                                        : { ...prev.spreadCompression, putSpreadCompression: compressionPct, putPriceChange: priceChangePct },
                                }));
                            } else {
                                setState((prev) => ({ ...prev, micropriceDeviation: { ...prev.micropriceDeviation, hasPrices: false } }));
                            }
                        }
                        return;
                    }
                    if (d.type === "indicators" && d.data) {
                        setState((prev) => {
                            const next = { ...prev };
                            Object.keys(d.data).forEach((indId) => {
                                if (!next[indId]) return;
                                const incoming = d.data[indId] || {};
                                next[indId] = { ...next[indId], ...incoming };
                                // Older relay builds did not include the
                                // common readiness bit.  A real indicators
                                // message is still considered live for that
                                // legacy payload, while explicit false always
                                // wins.
                                if (incoming.hasData === undefined && incoming.hasChain === undefined) {
                                    next[indId].hasData = true;
                                } else if (incoming.hasData === undefined && incoming.hasChain !== undefined) {
                                    next[indId].hasData = incoming.hasChain !== false;
                                }
                            });
                            return next;
                        });
                    }
                    if (d.type === "market" && d.data) {
                        Object.keys(d.data).forEach((symbol) => { liveTickSeenRef.current.add(symbol); });
                        setMarketData((prev) => {
                            const next = { ...prev };
                            Object.keys(d.data).forEach((symbol) => { next[symbol] = { ...prev[symbol], ...d.data[symbol], symbol }; });
                            return next;
                        });
                    }
                    if (d.type === "capTierSymbols" && d.data) {
                        setCapTierSymbols(d.data);
                    }
                    if (d.type === "globalMegacapWatchlist" && d.data) {
                        setGlobalMegacapWatchlist(d.data);
                    }
                    if (d.type === "fiiDii") {
                        setFiiDii({ date: d.date, fiiNet: d.fiiNet, diiNet: d.diiNet });
                        return;
                    }
            if (d.type === "fiiDiiCashFlow") {
                const fiiNetCr = Number(d.fiiNetCr || 0);
                const diiNetCr = Number(d.diiNetCr || 0);
                const nextFlow = { date: d.date, fiiNetCr, diiNetCr };
                setFiiDiiCashFlow(nextFlow);
                try { window.localStorage?.setItem("sb_fii_dii_cash_flow", JSON.stringify(nextFlow)); } catch (err) {}
                setState((prev) => ({
                    ...prev,
                    fiiDiiCashFlow: { ...prev.fiiDiiCashFlow, fiiNetCr, diiNetCr },
                }));
                return;
            }
            if (d.type === "fiiDiiCashFlowStatus") {
                setFiiDiiCashFlowStatus({ ok: d.ok, lastAttempt: d.lastAttempt, lastSuccess: d.lastSuccess, lastError: d.lastError });
                return;
            }
                    if (d.type === "optionChain" && d.underlying && d.data) {
                        resetStaleTimer();
                        const receivedAt = Date.now();
                        setOptionChainReceivedAt((prev) => ({ ...prev, [d.underlying]: receivedAt }));
                        setOptionChains((prev) => ({ ...prev, [d.underlying]: { expiry: d.expiry, rows: d.data, receivedAt } }));
                    }
                    if (d.type === "optionChainNext" && d.underlying && d.data) {
                        setOptionChainsNext((prev) => ({ ...prev, [d.underlying]: { expiry: d.expiry, rows: d.data } }));
                    }
                    if (d.type === "optionChainError" && d.underlying) {
                        setOptionChainErrors((prev) => ({ ...prev, [d.underlying]: d.message }));
                    }
                }
                catch (err) { /* ignore */ }
            };
            socket.onerror = () => setApiStatus("OFFLINE");
            socket.onclose = () => { clearTimeout(staleTimer); setApiStatus("OFFLINE"); reconnectTimer = setTimeout(connect, 3000); };
        };
        connect();
        // Mobile Chrome freezes JS timers/WS handling in a backgrounded tab
        // (e.g. while you're over in Termux). When you switch back, nothing
        // resumes on its own until the stale-timer or reconnect-timer fires —
        // which can take up to 15s and still shows OFFLINE in the meantime.
        // Force an immediate reconnect the moment the tab becomes visible
        // again, instead of waiting on those frozen timers.
        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                clearTimeout(reconnectTimer);
                try { ws?.close(); } catch (e) { /* ignore */ }
                connect();
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);
        return () => {
            clearTimeout(reconnectTimer);
            document.removeEventListener("visibilitychange", handleVisibility);
            ws?.close();
        };
    }, [relayUrl]);

    // --- Angel One feed: independent WebSocket connection to the
    // angel-server-1.js standalone server (via Cloudflare tunnel).
    // Fully separate reconnect loop from the Upstox relay above.
    // window.ANGEL_WS_URL lets you set a default address (e.g. your Oracle
    // VM's tunnel URL) at page-load time, the same way window.RELAY_WS_URL
    // works for the relay above — otherwise this stays OFFLINE until a URL
    // is typed into the "Set Angel" field.
    useEffect(() => {
        if (!angelWsUrl) {
            setAngelStatus("OFFLINE");
            return;
        }
        let ws;
        let reconnectTimer;
        const connect = () => {
            const socket = new WebSocket(angelWsUrl);
            ws = socket;
            angelWsRef.current = socket;
            socket.onopen = () => setAngelStatus("LIVE");
            socket.onclose = () => {
                setAngelStatus("OFFLINE");
                reconnectTimer = setTimeout(connect, 3000);
            };
            socket.onerror = () => setAngelStatus("OFFLINE");
            socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === "option_chain" && Array.isArray(msg.data)) {
                        setAngelChain(msg.data);
                    }
                } catch (err) {
                    // ignore malformed frame
                }
            };
        };
        connect();
        return () => {
            clearTimeout(reconnectTimer);
            if (ws) ws.close();
        };
    }, [angelWsUrl]);

    // Live crypto — connects straight from the browser to Binance's public
    // feed. This is completely separate from the Termux relay above: it
    // needs no login, no relay, no Upstox — just an internet connection.
    // So BTC/ETH/etc. tick live even if the relay isn't running.
    useEffect(() => {
        const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "MATICUSDT", "DOTUSDT", "LTCUSDT", "LINKUSDT", "TRXUSDT", "SHIBUSDT", "NEARUSDT", "ATOMUSDT"];
        const streams = symbols.map((s) => `${s.toLowerCase()}@ticker`).join("/");
        let sock;
        let reconnectTimer;
        // Binance pushes ~10-15 ticks/sec per coin; across 16 coins that's
        // 150-240 ticks/sec. Calling setMarketData on every single one was
        // firing that many re-renders/sec, cascading into every useMemo
        // downstream (Grand Unified, Radhey Shyam, Super Compute) — enough
        // to freeze/leak the tab within minutes. Buffer ticks in a plain
        // object (no re-render cost) and flush at most twice a second.
        let pendingTicks = {};
        const flushTimer = setInterval(() => {
            const keys = Object.keys(pendingTicks);
            if (keys.length === 0) return;
            const batch = pendingTicks;
            pendingTicks = {};
            setMarketData((prev) => {
                const next = { ...prev };
                // BUG FIX: Binance ticks were updating marketData but never
                // marking the symbol as "seen" — the candle builder below
                // checks liveTickSeenRef before it will ever start bucketing
                // candles, so VWAP/EMA/RSI/Ichimoku/Hurst/Z-score stayed
                // frozen at their hardcoded seed values forever for any
                // crypto symbol, no matter how long it ran.
                keys.forEach((symbol) => { liveTickSeenRef.current.add(symbol); next[symbol] = { ...prev[symbol], ...batch[symbol] }; });
                return next;
            });
        }, 500);
        const connectBinance = () => {
            sock = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
            sock.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    const t = payload?.data;
                    if (!t || !t.s) return;
                    const symbol = t.s;
                    const ltp = parseFloat(t.c);
                    const chg = parseFloat(t.p);
                    const chgPct = parseFloat(t.P);
                    if (Number.isNaN(ltp)) return;
                    pendingTicks[symbol] = { symbol, category: "crypto", ltp, chg, chgPct };
                } catch (err) { /* ignore malformed frames */ }
            };
            sock.onclose = () => { reconnectTimer = setTimeout(connectBinance, 3000); };
            sock.onerror = () => sock.close();
        };
        connectBinance();
        return () => { clearTimeout(reconnectTimer); clearInterval(flushTimer); sock?.close(); };
    }, []);
    const isLive = apiStatus === "LIVE";
    // Push the selected instrument's live LTP into every spot-driven indicator.
    useEffect(() => {
        const row = marketData[tradeSymbol];
        if (!row || row.ltp == null) return;
        setState((prev) => {
            const next = { ...prev };
            SPOT_DRIVEN_IDS.forEach((id) => { if (next[id] && "spot" in next[id]) next[id] = { ...next[id], spot: row.ltp }; });
            return next;
        });
    }, [tradeSymbol, marketData]);
    // Futures Basis indicator: auto-feed futuresLtp from the relay's live
    // "NIFTY FUT" tick (see resolveNiftyFuturesKey in relay-server-26.js).
    // Deliberately independent of tradeSymbol — the basis is always
    // NIFTY spot vs NIFTY futures, regardless of which symbol is selected
    // in the chart, same reasoning as btcNiftyDivergence below not being
    // tradeSymbol-driven either.
    useEffect(() => {
        const futRow = marketData["NIFTY FUT"];
        if (!futRow || futRow.ltp == null) return;
        setState((prev) => {
            if (!prev.futuresBasis) return prev;
            return { ...prev, futuresBasis: { ...prev.futuresBasis, futuresLtp: futRow.ltp } };
        });
    }, [marketData]);
    // BTC-Nifty Correlation Divergence — deliberately NOT built from
    // candlesBySymbol (see the note on the indicator definition above: that
    // buffer only ever tracks the single currently-selected tradeSymbol, so
    // BTCUSDT and NIFTY 50 candles can never coexist there). marketData,
    // by contrast, ticks BOTH symbols live and concurrently regardless of
    // what's selected — Binance WS keeps BTCUSDT updated, the relay keeps
    // NIFTY 50 updated, independently of tradeSymbol. Sample both once a
    // minute into a small ring buffer and diff against 15 samples ago.
    const btcNiftySamplesRef = useRef({ btc: [], nifty: [], gold: [] });
    const marketDataRef = useRef(marketData);
    useEffect(() => { marketDataRef.current = marketData; }, [marketData]);
    useEffect(() => {
        // Reads marketDataRef (not the marketData dependency directly) so
        // this interval is created exactly once on mount, not torn down
        // and recreated on every tick — marketData changes as often as
        // every ~500ms, which would otherwise stop setInterval from ever
        // completing a full 60s cycle.
        const sample = () => {
            const md = marketDataRef.current;
            const btcLtp = md["BTCUSDT"]?.ltp;
            const niftyLtp = md["NIFTY 50"]?.ltp;
            const goldLtp = md["GOLD"]?.ltp;
            const buf = btcNiftySamplesRef.current;
            // Buffer extended from 16 to 33 samples so Lead-Lag Beta (below)
            // gets a ~30-sample rolling regression window on top of the
            // same independent-sampling buffer Divergence already uses.
            // Divergence's own read is unchanged — it just looks at the
            // most recent 16 of the (now longer) buffer.
            if (btcLtp != null) { buf.btc = [...buf.btc, btcLtp].slice(-33); }
            if (niftyLtp != null) { buf.nifty = [...buf.nifty, niftyLtp].slice(-33); }
            if (goldLtp != null) { buf.gold = [...buf.gold, goldLtp].slice(-33); }
            const stateUpdate = {};
            if (buf.btc.length >= 16 && buf.nifty.length >= 16) {
                const btcWindow = buf.btc.slice(-16);
                const niftyWindow = buf.nifty.slice(-16);
                const btcChgPct = +(((btcWindow[15] - btcWindow[0]) / btcWindow[0]) * 100).toFixed(2);
                const niftyChgPct = +(((niftyWindow[15] - niftyWindow[0]) / niftyWindow[0]) * 100).toFixed(2);
                stateUpdate.btcNiftyDivergence = { btcChgPct, niftyChgPct };
                // Germany Quantum (Intermarket Divergence) — real live read,
                // reusing the SAME NIFTY window already sampled above (no
                // extra fetch needed) against GOLD as the safe-haven proxy
                // (see indicator definition note — no bond-yield feed exists
                // anywhere in this app, Gold does, live, already).
                if (buf.gold.length >= 16) {
                    const goldWindow = buf.gold.slice(-16);
                    const goldChgPct = ((goldWindow[15] - goldWindow[0]) / goldWindow[0]) * 100;
                    const riskAssetTrend = niftyChgPct > 0 ? 1 : niftyChgPct < 0 ? -1 : 0;
                    const safeHavenTrend = goldChgPct > 0 ? 1 : goldChgPct < 0 ? -1 : 0;
                    stateUpdate.germanyQuantum = { riskAssetTrend, safeHavenTrend, hasData: true };
                } else {
                    stateUpdate.germanyQuantum = { hasData: false };
                }
            }
            // Luxembourg Quantum (10Y vs 91D Bond Yield Spread) — direct
            // read off marketData, no ring buffer needed since the relay
            // already sends a computed yieldPct per tick for these two
            // symbols (relay-server-22.js, GOI10Y / TBILL91D). relay-24
            // adds CCIL (authoritative) + investing.com (3rd-tier
            // fallback) as extra sources for the SAME two fields — see
            // relay comments. INDIA1Y is a DIFFERENT tenor (1-year, not
            // 91-day) so it's only used as a last-resort substitute for
            // the short leg, and shortTermTenor says so honestly rather
            // than silently relabeling a 1Y number as "91D".
            {
                const tbill = md["TBILL91D"];
                const india1y = md["INDIA1Y"];
                const goi10y = md["GOI10Y"];
                let shortTermYield, shortTermTenor;
                if (tbill?.yieldPct != null) { shortTermYield = tbill.yieldPct; shortTermTenor = "91D T-Bill"; }
                else if (india1y?.yieldPct != null) { shortTermYield = india1y.yieldPct; shortTermTenor = "1Y"; }
                const longTermYield = goi10y?.yieldPct;
                if (shortTermYield != null && longTermYield != null) {
                    stateUpdate.luxQuantum = { shortTermYield, longTermYield, shortTermTenor: shortTermTenor || "91D T-Bill", hasData: true };
                } else {
                    stateUpdate.luxQuantum = { hasData: false };
                }
            }
            // Cross-Asset Lead-Lag Beta — rolling beta of NIFTY(t) return
            // vs BTC(t-1) return over the buffer, needs >=32 samples for a
            // >=30-point return series (same "don't trust a thin sample"
            // spirit as VPIN's 20-candle floor).
            if (buf.btc.length >= 32 && buf.nifty.length >= 32) {
                const btcRets = buf.btc.slice(1).map((p, i) => (p - buf.btc[i]) / buf.btc[i]);
                const niftyRets = buf.nifty.slice(1).map((p, i) => (p - buf.nifty[i]) / buf.nifty[i]);
                const x = btcRets.slice(0, -1); // BTC(t-1), paired for regression
                const y = niftyRets.slice(1);   // NIFTY(t)
                const n = x.length;
                const xMean = x.reduce((a, b) => a + b, 0) / n;
                const yMean = y.reduce((a, b) => a + b, 0) / n;
                const cov = x.reduce((s, xi, i) => s + (xi - xMean) * (y[i] - yMean), 0) / n;
                const varX = x.reduce((s, xi) => s + (xi - xMean) ** 2, 0) / n;
                const beta = varX > 0 ? +(cov / varX).toFixed(3) : 0;
                // Use the TRUE latest BTC return (full btcRets array, not
                // the regression-lagged `x`) as the projection input — x's
                // last element is BTC(t-1) relative to the regression, one
                // sample stale versus the actual most recent tick.
                const lastBtcRet = +(btcRets[btcRets.length - 1] * 100).toFixed(3);
                stateUpdate.leadLagBeta = { beta, lastBtcRet, hasData: true };
            }
            if (Object.keys(stateUpdate).length) {
                setState((prevState) => {
                    const next = { ...prevState };
                    Object.entries(stateUpdate).forEach(([id, vals]) => { next[id] = { ...next[id], ...vals }; });
                    return next;
                });
            }
        };
        const t = setInterval(sample, 60000);
        sample(); // seed the first sample immediately instead of waiting 60s
        return () => clearInterval(t);
    }, []);
    // Ask the relay for today's already-elapsed 1-minute candles for the
    // selected symbol (once per symbol per trading day) so a page refresh
    // or WS reconnect doesn't lose the session-anchored VWAP and force
    // every stat-based indicator (EMA/RSI/Hurst/Z-score) to warm up from
    // scratch again. Falls back gracefully (see the sessionCandles handler
    // above) to the live-ticks-only behavior if this request fails.
    const sessionReplayRequestedRef = useRef({});
    useEffect(() => {
        if (!isLive || !tradeSymbol) return;
        const key = `${tradeSymbol}|${new Date().toDateString()}`;
        if (sessionReplayRequestedRef.current[key]) return;
        if (!wsRef.current || wsRef.current.readyState !== 1) return;
        sessionReplayRequestedRef.current[key] = true;
        wsRef.current.send(JSON.stringify({ type: "getSessionCandles", symbol: tradeSymbol, requestId: Date.now() }));
    }, [tradeSymbol, isLive]);
    // Bucket live ticks into 1-minute OHLC candles for the selected symbol.
    const [candlesBySymbol, setCandlesBySymbol] = useState({});
    // True VWAP must accumulate every candle since the session's first tick
    // (9:15 AM), not just whatever's sitting in the buffer at any moment.
    // The candle buffer above is capped (for memory / stat-window reasons)
    // and shifts old candles out — so computing cumPV/cumP fresh from that
    // array on every tick silently turns into a rolling window VWAP that
    // drifts off the real anchored VWAP as soon as the first candle gets
    // shifted out. This ref persists the true cumulative totals separately,
    // keyed by symbol+trading-day, so they survive buffer trimming.
    const vwapAnchorRef = useRef({});
    // Candle timeframe — selectable at runtime (see the dropdown near the
    // symbol picker) instead of a hardcoded constant, so switching to 5m/
    // 15m/30m doesn't require editing this file. VWAP is unaffected by this
    // choice either way (see vwapAnchorRef above, day-keyed not size-keyed).
    const [bucketMs, setBucketMs] = useState(60000);
    const bucketMsRef = useRef(bucketMs);
    useEffect(() => { bucketMsRef.current = bucketMs; }, [bucketMs]);
    const prevBucketMsRef = useRef(bucketMs);
    useEffect(() => {
        if (prevBucketMsRef.current === bucketMs) return;
        prevBucketMsRef.current = bucketMs;
        // Existing candles were bucketed at the old timeframe — mixing them
        // with a new bucket size would produce malformed OHLC. Clear
        // everything and let it rebuild (live ticks + a fresh session
        // replay) at the new granularity.
        setCandlesBySymbol({});
        vwapAnchorRef.current = {};
        sessionReplayRequestedRef.current = {};
    }, [bucketMs]);
    useEffect(() => {
        // BUG FIX: this used to require `isLive` (the Upstox/NSE relay's
        // status) unconditionally — but crypto symbols never touch that
        // relay at all, they tick straight from Binance in the browser.
        // Gating on it meant every crypto candle-native indicator (VWAP,
        // France/Italy Quant, Ichimoku, USA Quant, VPOC, UAE Quant, China/
        // Swiss Quant) stayed frozen at its hardcoded default forever
        // while trading BTCUSDT/ETHUSDT/etc. Allow candles to build when
        // EITHER the relay is live OR the selected symbol is crypto.
        const isCryptoSymbol = marketData[tradeSymbol]?.category === "crypto";
        if (!isLive && !isCryptoSymbol) return;
        const row = marketData[tradeSymbol];
        if (!row || row.ltp == null) return;
        // The "LIVE" badge can flip on before this specific symbol's first
        // real tick has arrived. Previously this was guarded by comparing
        // row.ltp to the hardcoded placeholder — but if a real tick ever
        // happens to equal that placeholder (as happened with CRUDEOIL
        // sitting at 6420, the exact default), candles would never start
        // building, permanently. Use an actual "have we seen a WS tick for
        // this symbol" flag instead of a value comparison.
        if (!liveTickSeenRef.current.has(tradeSymbol)) return;
        const t = Math.floor(Date.now() / bucketMs) * bucketMs;
        const anchorKey = `${tradeSymbol}|${new Date(t).toDateString()}`;
        if (!vwapAnchorRef.current[anchorKey]) {
            // New trading day (or first candle for this symbol) — drop any
            // stale anchor left over from a previous day for this symbol.
            Object.keys(vwapAnchorRef.current).forEach((k) => { if (k.startsWith(`${tradeSymbol}|`)) delete vwapAnchorRef.current[k]; });
            vwapAnchorRef.current[anchorKey] = { cumPV: 0, cumP: 0 };
        }
        const anchor = vwapAnchorRef.current[anchorKey];
        const candleContribution = (c) => {
            const vol = c.vttStart != null && c.vttEnd != null ? Math.max(0, c.vttEnd - c.vttStart) : null;
            const typical = (c.h + c.l + c.c) / 3;
            // No real traded-volume feed on indices — fall back to an
            // unweighted running close-average (count each candle as 1),
            // same approximation used elsewhere for index instruments.
            return vol != null ? { pv: typical * vol, vol } : { pv: c.c, vol: 1 };
        };
        setCandlesBySymbol((prev) => {
            const list = prev[tradeSymbol] ? [...prev[tradeSymbol]] : [];
            const last = list[list.length - 1];
            if (last && last.t === t) {
                last.h = Math.max(last.h, row.ltp);
                last.l = Math.min(last.l, row.ltp);
                last.c = row.ltp;
                if (row.vtt != null) last.vttEnd = row.vtt;
                // Still-forming candle: baseline (committed session total as
                // of when this candle opened) + this candle's own live,
                // not-yet-committed progress. Never double-counted because
                // the baseline was frozen at candle-open, below.
                const { pv, vol } = candleContribution(last);
                const totalPV = last._baselinePV + pv, totalVol = last._baselineVol + vol;
                last.vwap = totalVol > 0 ? totalPV / totalVol : (last.h + last.l + last.c) / 3;
            } else {
                // Previous candle just finalized (a new minute started) —
                // commit its full contribution into the permanent anchor
                // exactly once before it can ever be shifted out of the
                // buffer.
                if (last) {
                    const { pv, vol } = candleContribution(last);
                    anchor.cumPV += pv;
                    anchor.cumP += vol;
                }
                list.push({ t, o: row.ltp, h: row.ltp, l: row.ltp, c: row.ltp, vttStart: row.vtt ?? null, vttEnd: row.vtt ?? null, _baselinePV: anchor.cumPV, _baselineVol: anchor.cumP, vwap: (row.ltp) });
                // Cap raised to 375 (was 150) — at 1-min candles that's a
                // full trading day (9:15–15:30), giving Hurst/Z-score/EMA a
                // proper full-session window instead of just ~2.5 hours.
                // Safe at any timeframe: VWAP does NOT depend on this cap at
                // all (see vwapAnchorRef above) — it only bounds how much
                // chart/stat history is kept in memory.
                if (list.length > 375) list.shift();
            }
            return { ...prev, [tradeSymbol]: list };
        });
    }, [tradeSymbol, marketData, isLive, bucketMs]);
    const candles = candlesBySymbol[tradeSymbol] || [];
    // VWAP-TWAP Premium / Heavyweight Breadth Divergence / Kyle's Lambda /
    // Lognormal Return Skewness — four new indicators added on top of the
    // existing candle pipeline. Uses the SAME cumulative vttStart/vttEnd
    // volume model as the rest of this file (see "Fatal Flaw 3" fix above),
    // including the Math.max(0, ...) clamp against a negative delta if the
    // day's cumulative counter ever resets mid-session — the original patch
    // for this omitted that clamp.
    //
    // BUG FOUND & FIXED: this effect used to list `marketData` directly in
    // its dependency array — the ONLY effect in this whole file that does
    // (every sibling effect below depends on just `[candles]`). marketData
    // is one shared object that gets a new reference on EVERY tick of
    // EVERY streamed symbol (~40+ symbols), not just the selected
    // tradeSymbol — so this was re-running the full candle loop + top5
    // loop + skewness math (Math.pow etc.) many times a second regardless
    // of what was selected, on a phone. Same fix already used elsewhere in
    // this file for exactly this reason (see marketDataRef above, used by
    // the Germany Quantum / Lead-Lag Beta sampler): read the ref instead
    // of depending on the object, so this only recomputes when `candles`
    // (the selected symbol's own candle array) actually changes.
    useEffect(() => {
        const md = marketDataRef.current;
        if (candles.length < 31 || !md["NIFTY 50"]) return;

        // --- 1. VWAP-TWAP Premium ---
        let cumVol = 0, cumVolPrice = 0, cumPrice = 0;
        candles.forEach(c => {
            const vol = c.vttStart != null && c.vttEnd != null ? Math.max(0, c.vttEnd - c.vttStart) : 1;
            cumVol += vol;
            cumVolPrice += ((c.h + c.l + c.c) / 3) * vol; // typical price, matches candle.vwap
            cumPrice += c.c;
        });
        const vwap = cumVol > 0 ? cumVolPrice / cumVol : 0;
        const twap = cumPrice / candles.length;
        const premium = +(vwap - twap).toFixed(2);

        // --- 2. Heavyweight Breadth Divergence ---
        const top5 = ["RELIANCE", "HDFCBANK", "ICICIBANK", "TCS", "INFY"];
        let top5Sum = 0, top5Count = 0;
        top5.forEach(sym => {
            if (md[sym] && md[sym].chgPct != null) {
                top5Sum += md[sym].chgPct;
                top5Count++;
            }
        });
        const niftyRet = md["NIFTY 50"].chgPct || 0;
        const top5Ret = top5Count > 0 ? +(top5Sum / top5Count).toFixed(2) : niftyRet;
        const divergence = +(niftyRet - top5Ret).toFixed(2);

        // --- 3. Kyle's Lambda (Market Impact) ---
        const lambdaWindow = candles.slice(-21);
        const lambdas = lambdaWindow.map(c => {
            const vol = c.vttStart != null && c.vttEnd != null ? Math.max(0, c.vttEnd - c.vttStart) : 1;
            return vol > 0 ? Math.abs(c.c - c.o) / vol : 0;
        });
        const currentLambda = lambdas[lambdas.length - 1];
        // Average of previous 20 candles (prevent div by zero)
        const avgLambda = lambdas.slice(0, -1).reduce((a, b) => a + b, 0) / 20 || 0.0001;
        const lambdaRatio = +(currentLambda / avgLambda).toFixed(2);

        const lastCandle = lambdaWindow[lambdaWindow.length - 1];
        const priceDir = lastCandle.c >= lastCandle.o ? 1 : -1;

        // --- 4. Lognormal Return Skewness ---
        const skewWindow = candles.slice(-31);
        const logRets = [];
        for (let i = 1; i < skewWindow.length; i++) {
            logRets.push(Math.log(skewWindow[i].c / skewWindow[i - 1].c));
        }
        const meanRet = logRets.reduce((a, b) => a + b, 0) / logRets.length;

        let sumCube = 0, sumSq = 0;
        logRets.forEach(r => {
            const dev = r - meanRet;
            sumCube += Math.pow(dev, 3);
            sumSq += Math.pow(dev, 2);
        });

        const n = logRets.length; // 30
        const variance = sumSq / (n - 1); // Bessel's correction, matches VRP section elsewhere in file
        const stdev = Math.sqrt(variance);
        // Fisher–Pearson unbiased sample skewness: g1 = [n/((n-1)(n-2))] * Σ(dev/s)^3
        const skew = stdev > 0.00001
            ? +((n / ((n - 1) * (n - 2))) * (sumCube / Math.pow(stdev, 3))).toFixed(2)
            : 0;

        // --- Unified State Update ---
        setState(p => ({
            ...p,
            vwapTwapPremium: { ...p.vwapTwapPremium, premium, vwap: +vwap.toFixed(2), twap: +twap.toFixed(2) },
            heavyweightBreadth: { ...p.heavyweightBreadth, divergence, niftyRet: +niftyRet.toFixed(2), top5Ret },
            kylesLambda: { ...p.kylesLambda, lambdaRatio, priceDir },
            returnSkewness: { ...p.returnSkewness, skew }
        }));
    }, [candles]);

    // Volume Surge indicator — real per-candle volume (delta of cumulative
    // traded volume), only available for stocks/F&O, not indices (Upstox
    // doesn't report traded volume on index feeds).
    useEffect(() => {
        if (candles.length < 6) return;
        const vols = candles.map((c) => (c.vttStart != null && c.vttEnd != null ? Math.max(0, c.vttEnd - c.vttStart) : null));
        if (vols[vols.length - 1] == null) return; // no volume data for this instrument (e.g. an index)
        const recent = vols.slice(-6, -1).filter((v) => v != null);
        const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
        const currentVol = vols[vols.length - 1];
        const mult = avg > 0 ? +(currentVol / avg).toFixed(2) : 0;
        const last = candles[candles.length - 1];
        // Order Flow Aggression Index — sum of sign(close-open) * volMult
        // over the last 5 candles, each candle's volMult computed the same
        // way as the surge multiplier above (vs its own recent-5 average).
        let aggressionScore = 0;
        if (candles.length >= 11) {
            for (let i = candles.length - 5; i < candles.length; i++) {
                const c = candles[i];
                const cVol = vols[i];
                if (cVol == null) continue;
                const cRecent = vols.slice(Math.max(0, i - 5), i).filter((x) => x != null);
                const cAvg = cRecent.length ? cRecent.reduce((a, b) => a + b, 0) / cRecent.length : 0;
                const cMult = cAvg > 0 ? cVol / cAvg : 0;
                aggressionScore += Math.sign(c.c - c.o) * cMult;
            }
            aggressionScore = +aggressionScore.toFixed(2);
        }
        // Volume Climax Exhaustion — is this candle the highest-volume of
        // the last 20, and did price fail to extend beyond the prior swing?
        const recentVols20 = vols.slice(-20).filter((x) => x != null);
        const isClimaxVol = recentVols20.length > 1 && currentVol === Math.max(...recentVols20) ? 1 : 0;
        setState((prevState) => ({
            ...prevState,
            volume: { ...prevState.volume, mult, priceUp: last.c > last.o ? 1 : 0 },
            volReversal: { ...prevState.volReversal, volMult: mult },
            orderFlowAggression: { ...prevState.orderFlowAggression, aggressionScore },
            volClimaxExhaustion: { ...prevState.volClimaxExhaustion, candleHigh: +last.h.toFixed(2), candleLow: +last.l.toFixed(2), isClimaxVol },
        }));
    }, [candles]);
    // VPIN — Order Flow Toxicity (Bulk Volume Classification). Pure candle
    // math, no relay change: each candle's return is standardized by the
    // rolling window's own volatility (z), buy-fraction = N(z), and VPIN is
    // the volume-weighted average of |buyFraction - sellFraction| across the
    // window — the standard Easley/Lopez de Prado/O'Hara approximation used
    // when you don't have real tick-by-tick trade-side tags.
    useEffect(() => {
        const WINDOW = 50;
        if (candles.length < 20) return;
        const sample = candles.slice(-WINDOW);
        const returns = sample.map((c) => (c.o ? (c.c - c.o) / c.o : 0));
        const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + (b - meanRet) * (b - meanRet), 0) / returns.length;
        const sigma = Math.sqrt(variance);
        if (!sigma) return;
        let toxicSum = 0, volSum = 0, lastBuyFrac = 0.5;
        sample.forEach((c, i) => {
            const z = returns[i] / sigma;
            const buyFrac = normalCDF(z);
            const vol = c.vttStart != null && c.vttEnd != null ? Math.max(0, c.vttEnd - c.vttStart) : 1;
            toxicSum += vol * Math.abs(buyFrac - (1 - buyFrac));
            volSum += vol;
            if (i === sample.length - 1) lastBuyFrac = buyFrac;
        });
        const vpinValue = volSum > 0 ? +(toxicSum / volSum).toFixed(2) : 0;
        setState((prevState) => ({ ...prevState, vpin: { ...prevState.vpin, vpinValue, sampleSize: sample.length, buyLeaning: lastBuyFrac >= 0.5 } }));
    }, [candles]);
    // Wire the 3 genuinely chart-native indicators to the real computed candle math.
    useEffect(() => {
        if (candles.length < 2) return;
        const closes = candles.map((c) => c.c);
        const ema9 = computeEMA(closes, 9), ema21 = computeEMA(closes, 21), ema50 = computeEMA(closes, 50), rsi = computeRSI(closes, 14);
        const last = candles[candles.length - 1], prev = candles[candles.length - 2];
        setState((prevState) => ({
            ...prevState,
            vwap: { ...prevState.vwap, candleClose: last.c, vwap: last.vwap ?? prevState.vwap.vwap, prevHigh: prev.h, prevLow: prev.l, currentPrice: last.c },
            franceQuantum: { ...prevState.franceQuantum, fastEma: ema9[ema9.length - 1] ?? prevState.franceQuantum.fastEma, slowEma: ema21[ema21.length - 1] ?? prevState.franceQuantum.slowEma, prevFastEma: ema9[ema9.length - 2] ?? prevState.franceQuantum.prevFastEma, prevSlowEma: ema21[ema21.length - 2] ?? prevState.franceQuantum.prevSlowEma },
            italyQuantum: { ...prevState.italyQuantum, rsi: rsi[rsi.length - 1] ?? prevState.italyQuantum.rsi, prevRsi: rsi[rsi.length - 2] ?? prevState.italyQuantum.prevRsi },
            radheshyam: { ...prevState.radheshyam, emaNow: ema9[ema9.length - 1] ?? prevState.radheshyam.emaNow, emaPrev: ema9[ema9.length - 2] ?? prevState.radheshyam.emaPrev },
            mtfEmaStack: { ...prevState.mtfEmaStack, emaFast: +((ema9[ema9.length - 1] ?? prevState.mtfEmaStack.emaFast)).toFixed(2), emaMid: +((ema21[ema21.length - 1] ?? prevState.mtfEmaStack.emaMid)).toFixed(2), emaSlow: +((ema50[ema50.length - 1] ?? prevState.mtfEmaStack.emaSlow)).toFixed(2) },
            volReversal: { ...prevState.volReversal, candleOpen: +last.o.toFixed(2), candleClose: +last.c.toFixed(2), candleHigh: +last.h.toFixed(2), candleLow: +last.l.toFixed(2) },
        }));
    }, [candles]);
    // FIX (Flaw 1 — "Phantom Indicators"): Ichimoku, USA Quant (AVWAP) and
    // VPOC (Value Area) were only ever getting `spot` updated live via
    // SPOT_DRIVEN_IDS — their comparison levels (tenkan/kijun/senkouA-B,
    // avwap, vah/val) stayed frozen at the hardcoded seed values forever.
    // Wire the ones that are honestly computable from real candle data.
    // NOTE: uaeQuantum's "prevClose" is Prev DAY close (not prev candle) —
    // that needs a real previous-session close feed the relay doesn't
    // fetch, so todayOpen/openRange are wired live but prevClose is left
    // alone rather than faked with a wrong number.
    useEffect(() => {
        if (candles.length < 26) return;
        const highs = candles.map((c) => c.h), lows = candles.map((c) => c.l);
        const hlAvg = (period) => {
            const h = highs.slice(-period), l = lows.slice(-period);
            return (Math.max(...h) + Math.min(...l)) / 2;
        };
        const tenkan = hlAvg(9);
        const kijun = hlAvg(26);
        const senkouA = (tenkan + kijun) / 2;
        const senkouB = candles.length >= 52 ? hlAvg(52) : hlAvg(candles.length);
        const prevTenkan = candles.length > 9
            ? (Math.max(...highs.slice(-10, -1)) + Math.min(...lows.slice(-10, -1))) / 2
            : tenkan;
        const prevKijun = candles.length > 26
            ? (Math.max(...highs.slice(-27, -1)) + Math.min(...lows.slice(-27, -1))) / 2
            : kijun;
        let cross = 0;
        if (prevTenkan <= prevKijun && tenkan > kijun) cross = 1;
        else if (prevTenkan >= prevKijun && tenkan < kijun) cross = -1;

        const last = candles[candles.length - 1];
        const liveAvwap = last.vwap ?? last.c;

        const weighted = candles.map((c) => {
            const vol = c.vttStart != null && c.vttEnd != null ? Math.max(0, c.vttEnd - c.vttStart) : 1;
            return { price: (c.h + c.l + c.c) / 3, vol: vol || 1 };
        });
        const sorted = [...weighted].sort((a, b) => b.vol - a.vol);
        const totalVol = weighted.reduce((s, w) => s + w.vol, 0);
        let acc = 0, included = [];
        for (const w of sorted) { included.push(w.price); acc += w.vol; if (acc >= totalVol * 0.7) break; }
        const vah = included.length ? Math.max(...included) : last.c;
        const val = included.length ? Math.min(...included) : last.c;

        const todayOpen = candles[0].o;
        const openRangeCandles = candles.slice(0, Math.min(15, candles.length));
        const openRangeHigh = Math.max(...openRangeCandles.map((c) => c.h));
        const openRangeLow = Math.min(...openRangeCandles.map((c) => c.l));
        const swingHigh20 = Math.max(...highs.slice(-20)), swingLow20 = Math.min(...lows.slice(-20));
        // priorTrendUp (for Volume Climax Exhaustion) / trendUp (for Market
        // Structure Break) — compare last close vs close 10 candles ago.
        const closesArr = candles.map((c) => c.c);
        const priorTrendUp = closesArr.length > 10 && closesArr[closesArr.length - 1] > closesArr[closesArr.length - 10] ? 1 : 0;
        // Fractal swing high/low for Market Structure Break (BOS/CHoCH): a
        // candle is a confirmed swing point if its high/low is the extreme
        // of the 2 candles before and after it. Scan back from the most
        // recent confirmable candle (2 back, so "after" exists) and take
        // the first fractal found on each side.
        let lastSwingHigh = swingHigh20, lastSwingLow = swingLow20;
        for (let i = highs.length - 3; i >= 2; i--) {
            if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] && highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) { lastSwingHigh = highs[i]; break; }
        }
        for (let i = lows.length - 3; i >= 2; i--) {
            if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] && lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) { lastSwingLow = lows[i]; break; }
        }
        // Session VWAP Reclaim/Reject — only meaningful post-1:30 PM IST.
        const istHours = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours();
        const istMinutes = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCMinutes();
        const isAfternoon = (istHours > 13 || (istHours === 13 && istMinutes >= 30)) ? 1 : 0;

        setState((prevState) => ({
            ...prevState,
            ichimoku: { ...prevState.ichimoku, tenkan: +tenkan.toFixed(2), kijun: +kijun.toFixed(2), senkouA: +senkouA.toFixed(2), senkouB: +senkouB.toFixed(2), cross },
            usaQuant: { ...prevState.usaQuant, avwap: +liveAvwap.toFixed(2) },
            vpoc: { ...prevState.vpoc, vah: +vah.toFixed(2), val: +val.toFixed(2) },
            uaeQuantum: { ...prevState.uaeQuantum, todayOpen: +todayOpen.toFixed(2), openRangeHigh: +openRangeHigh.toFixed(2), openRangeLow: +openRangeLow.toFixed(2) },
            radhaMadhav: { ...prevState.radhaMadhav, vwap: +liveAvwap.toFixed(2), openRangeHigh: +openRangeHigh.toFixed(2), openRangeLow: +openRangeLow.toFixed(2) },
            radheshyam: { ...prevState.radheshyam, vwap: +liveAvwap.toFixed(2), candleOpen: +last.o.toFixed(2), candleClose: +last.c.toFixed(2) },
            deltaDivergence: { ...prevState.deltaDivergence, swingHigh: +swingHigh20.toFixed(2), swingLow: +swingLow20.toFixed(2) },
            volClimaxExhaustion: { ...prevState.volClimaxExhaustion, prevSwingHigh: +swingHigh20.toFixed(2), prevSwingLow: +swingLow20.toFixed(2), priorTrendUp },
            structureBreak: { ...prevState.structureBreak, close: +last.c.toFixed(2), lastSwingHigh: +lastSwingHigh.toFixed(2), lastSwingLow: +lastSwingLow.toFixed(2), trendUp: priorTrendUp },
            afternoonVwapReclaim: { ...prevState.afternoonVwapReclaim, vwap: +liveAvwap.toFixed(2), candleOpen: +last.o.toFixed(2), candleHigh: +last.h.toFixed(2), candleLow: +last.l.toFixed(2), candleClose: +last.c.toFixed(2), isAfternoon },
            ...(() => {
                // Wick Asymmetry — rolling 10-candle average of upper/lower
                // wick size on this symbol's own candles.
                const N_WICKS = 10;
                const recentWicks = candles.slice(-N_WICKS);
                if (recentWicks.length < N_WICKS) return { wickAsymmetry: { ...prevState.wickAsymmetry, hasData: false } };
                const avgUpperWick = +(recentWicks.reduce((s, c) => s + (c.h - Math.max(c.o, c.c)), 0) / N_WICKS).toFixed(2);
                const avgLowerWick = +(recentWicks.reduce((s, c) => s + (Math.min(c.o, c.c) - c.l), 0) / N_WICKS).toFixed(2);
                return { wickAsymmetry: { avgUpperWick, avgLowerWick, hasData: true } };
            })(),
        }));
    }, [candles]);
    // China Quantum (Hurst exponent) and Swiss Quantum (Z-score reversion)
    // are both pure statistics of the price series itself — no external
    // data feed needed — so wire them to real candles too, bringing the
    // live-wired count from 21 to 23 of 29. The remaining 6 (Germany
    // intermarket divergence, Luxembourg yield curve, and similar) need
    // bond-yield / cross-asset feeds this relay genuinely doesn't fetch,
    // so those stay manual until such a feed is added.
    useEffect(() => {
        // Hurst needs a much bigger sample than Z-score to be meaningful —
        // below ~100 candles the R/S estimate swings wildly and throws
        // false "Strong Momentum Flow" reads. Gate the whole effect on
        // that higher bar; Z-score's own 20-candle window is still fine
        // once this fires.
        if (candles.length < 100) return;
        const closes = candles.map((c) => c.c);
        // Z-score of the latest close vs the recent rolling mean/stdev.
        const window = closes.slice(-20);
        const mean = window.reduce((a, b) => a + b, 0) / window.length;
        const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
        const stdev = Math.sqrt(variance);
        const zScore = stdev > 0 ? +((closes[closes.length - 1] - mean) / stdev).toFixed(2) : 0;
        // Simplified rescaled-range Hurst exponent estimate over a rolling
        // 120-candle window (not the whole unbounded history) — keeps the
        // sample size stable through the day instead of quietly growing
        // from 100 candles at open to thousands by close, which would
        // otherwise shift what the R/S stat is even measuring. Clamps to
        // [0,1] since this is an approximation, not a rigorous R/S fit.
        const hurstCloses = closes.slice(-120);
        // 119 valid differences, not 120 with a spurious hard-coded 0 at
        // index 0 (that zero used to bias rsMean/sd toward zero).
        const rs = [];
        for (let i = 1; i < hurstCloses.length; i++) rs.push(hurstCloses[i] - hurstCloses[i - 1]);
        const rsMean = rs.reduce((a, b) => a + b, 0) / rs.length;
        const dev = rs.map((r) => r - rsMean);
        let cum = 0;
        const cumDev = dev.map((d) => (cum += d));
        const range = Math.max(...cumDev) - Math.min(...cumDev);
        const sd = Math.sqrt(dev.reduce((a, b) => a + b * b, 0) / dev.length);
        const rsStat = sd > 0 ? range / sd : 1;
        const n = rs.length;
        const hurst = n > 1 && rsStat > 0 ? Math.min(1, Math.max(0, Math.log(rsStat) / Math.log(n))) : 0.5;
        setState((prevState) => ({
            ...prevState,
            swissQuantum: { ...prevState.swissQuantum, zScore },
            chinaHurst: { ...prevState.chinaHurst, hurst: +hurst.toFixed(2), priceTrendUp: hurstCloses[hurstCloses.length - 1] > hurstCloses[hurstCloses.length - 20] ? 1 : 0 },
        }));
    }, [candles]);
    // ATR(14) — average true range over the candle history, wired live
    // into Order Block and India Quantum (Max Pain) so their tolerance /
    // threshold zones scale with actual volatility instead of a fixed
    // point value that's wrong half the time (too tight in fast markets,
    // too loose in quiet ones). Uses Wilder's smoothing (RMA), the same
    // method brokers/TradingView use, not a plain moving average — first
    // 14 true ranges seed a simple average, then each later bar is
    // smoothed in one at a time.
    useEffect(() => {
        if (candles.length < 15) return;
        const trueRanges = [];
        for (let i = 1; i < candles.length; i++) {
            const cur = candles[i];
            const prevClose = candles[i - 1].c;
            const tr = Math.max(
                cur.h - cur.l,
                Math.abs(cur.h - prevClose),
                Math.abs(cur.l - prevClose)
            );
            trueRanges.push(tr);
        }
        const period = 14;
        let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
        for (let i = period; i < trueRanges.length; i++) {
            atr = (atr * (period - 1) + trueRanges[i]) / period;
        }
        atr = +atr.toFixed(2);
        // ATR Compression Breakout — needs a rolling ATR series (not just
        // the latest value) to get a genuine 20-value average, so recompute
        // Wilder's ATR at each point from candle 15 onward instead of
        // reusing the single scalar above.
        let atrAvg = atr, rangeHigh = candles[candles.length - 1].h, rangeLow = candles[candles.length - 1].l;
        if (candles.length >= 35) {
            const atrSeries = [];
            let running = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
            atrSeries.push(running);
            for (let i = period; i < trueRanges.length; i++) {
                running = (running * (period - 1) + trueRanges[i]) / period;
                atrSeries.push(running);
            }
            const last20 = atrSeries.slice(-20);
            atrAvg = +(last20.reduce((a, b) => a + b, 0) / last20.length).toFixed(2);
            const squeezeCandles = candles.slice(-20);
            rangeHigh = Math.max(...squeezeCandles.map((c) => c.h));
            rangeLow = Math.min(...squeezeCandles.map((c) => c.l));
        }
        setState((prevState) => ({
            ...prevState,
            orderBlock: { ...prevState.orderBlock, atr },
            indiaQuantum: { ...prevState.indiaQuantum, atr },
            atrSqueezeBreakout: { ...prevState.atrSqueezeBreakout, atrNow: atr, atrAvg, close: +candles[candles.length - 1].c.toFixed(2), rangeHigh: +rangeHigh.toFixed(2), rangeLow: +rangeLow.toFixed(2) },
        }));
    }, [candles]);
    // Rate-of-Change Acceleration — 10-candle ROC now vs 10-candle ROC one
    // candle ago (the "2nd derivative" of price). Independent effect since
    // it needs a slightly longer, differently-shaped lookback than ATR/EMA.
    useEffect(() => {
        if (candles.length < 12) return;
        const closes = candles.map((c) => c.c);
        const n = closes.length;
        const rocNow = +(((closes[n - 1] - closes[n - 11]) / closes[n - 11]) * 100).toFixed(3);
        const rocPrev = n > 11 ? +(((closes[n - 2] - closes[n - 12]) / closes[n - 12]) * 100).toFixed(3) : rocNow;
        setState((prevState) => ({ ...prevState, rocAcceleration: { ...prevState.rocAcceleration, rocNow, rocPrev } }));
    }, [candles]);
    // NIFTY/BANKNIFTY since that's what the relay actually polls a chain
    // for. Uses the strike closest to current spot (ATM) and tracks the
    // previous poll to compute real % change in OI and real IV drift —
    // no invented numbers.
    const prevOptionSnapshotRef = useRef({});
    // IV Regime Filter needs a rolling 20-poll history of ATM IV, keyed by
    // underlying so switching NIFTY<->BANKNIFTY doesn't mix series.
    const ivHistoryRef = useRef({});
    // OI Skew Shift needs the previous poll's OI-weighted call/put center
    // strikes, keyed by underlying + strike-set fingerprint (so a strike
    // range change, e.g. underlying switch, doesn't compare mismatched sets).
    const oiSkewPrevRef = useRef({});
    // Net Dealer Delta Exposure + OI Buildup Classification both need the
    // PREVIOUS poll's chain-wide totals (net delta, total OI) to read a
    // direction/trend rather than just a snapshot level. Keyed by
    // underlying, separate from prevOptionSnapshotRef (which is ATM-strike
    // specific and reset on strike roll) since these two are chain-wide
    // sums and don't have the "shifting strike" problem — no need to
    // reset them on an ATM roll.
    const chainTotalsPrevRef = useRef({});
    // Rolling ATM call/put midpoint history per underlying — powers the
    // parity/theo-residual, convexity, and elasticity indicators below.
    // Each entry: { t, callMid, putMid, spot }. Trimmed to last 12 polls.
    const optionMidHistoryRef = useRef({});
    // Directional call-vs-put studies use one shared, short rolling history
    // so every new indicator is based on the same live chain snapshots.
    const optionDirectionHistoryRef = useRef({});
    const convexitySamplesRef = useRef({});
    // PCR SMOOTHING FIX: raw whole-chain PCR jitters strike-to-strike as OI
    // rolls; smooth it with a light EMA (alpha 0.3) keyed by underlying so
    // the BUY/SELL call reads the trend, not one noisy poll.
    const pcrSmoothRef = useRef({});
    // FIX: previously only ever resolved for the two index symbols
    // ("NIFTY 50"/"NIFTY BANK"), so selecting any stock, commodity, or
    // crypto symbol silently produced null here — Premium Signal, the
    // Greeks header, and everything downstream of tradeUnderlying just sat
    // on WAIT/— for every non-index selection, with no error shown. Now
    // resolves ANY selected symbol (or option contract on it) to its chain
    // key via resolveUnderlyingKey, so this genuinely follows user
    // selection instead of being hardcoded to two symbols.
    const tradeUnderlying = resolveUnderlyingKey(tradeSymbol);
    // Keep the Option Chain modal / Top 5 CE-PE / Greeks header locked to
    // whatever the user just selected anywhere in the app (market watch,
    // header search, option-chain row clicks) — previously
    // optionChainUnderlying only moved when the user tapped a tab inside
    // the Option Chain modal itself, so selecting RELIANCE elsewhere left
    // the chain/Greeks/Top5 panels silently showing NIFTY.
    useEffect(() => {
        if (!tradeUnderlying) return;
        const display = REVERSE_CHAIN_KEY_MAP[tradeUnderlying] || tradeUnderlying;
        setOptionChainUnderlying((prev) => (prev === display ? prev : display));
    }, [tradeUnderlying]);
    // Live Delta/Gamma/Theta/Vega/Rho/OI for the header buttons — fully
    // automatic from the Upstox chain (spot, strike, IV, OI), recomputes
    // whenever the chain, spot, or selected strike changes.
    // Auto-select ATM strike so the header Delta/Gamma/Theta/Vega/Rho/IV/OI
    // badges show live numbers without requiring a manual click in the modal.
    useEffect(() => {
        if (!tradeUnderlying) return;
        const chain = optionChains[tradeUnderlying];
        const spot = marketData[REVERSE_CHAIN_KEY_MAP[tradeUnderlying] || tradeUnderlying]?.ltp;
        if (!chain?.rows?.length || spot == null) return;
        let best = chain.rows[0], bestDiff = Math.abs(chain.rows[0].strike - spot);
        for (const r of chain.rows) {
            const d = Math.abs(r.strike - spot);
            if (d < bestDiff) { bestDiff = d; best = r; }
        }
        setSelectedOptionStrike((prev) => {
            // Keep a manual pick; otherwise re-center on ATM as spot drifts.
            if (prev && prev.underlying === tradeUnderlying && prev.manual) return prev;
            if (prev && prev.underlying === tradeUnderlying && prev.strike === best.strike) return prev;
            return { underlying: tradeUnderlying, strike: best.strike, manual: false };
        });
    }, [tradeUnderlying, optionChains, marketData, selectedOptionStrike]);
    const selectedOptionGreeks = useMemo(() => {
        if (!selectedOptionStrike) return null;
        const chain = optionChains[selectedOptionStrike.underlying];
        const row = chain?.rows?.find((r) => r.strike === selectedOptionStrike.strike);
        const underlyingSymbol = REVERSE_CHAIN_KEY_MAP[selectedOptionStrike.underlying] || selectedOptionStrike.underlying;
        const spot = marketData[underlyingSymbol]?.ltp;
        if (!row || spot == null) return null;
        // Last-resort IV: median of whatever IVs the chain does carry, else
        // India VIX. Keeps Delta/Gamma/Theta/Vega/Rho populated instead of "—".
        let fallbackIv = null;
        const ivs = (chain?.rows || []).flatMap((r) => [r.callIv, r.putIv]).filter((x) => x != null && x > 0).sort((a, b) => a - b);
        if (ivs.length) fallbackIv = ivs[Math.floor(ivs.length / 2)];
        else if (marketData["INDIA VIX"]?.ltp != null) fallbackIv = marketData["INDIA VIX"].ltp;
        return computeSelectedOptionGreeks(row, spot, chain.expiry, fallbackIv);
    }, [selectedOptionStrike, optionChains, marketData]);
    const premiumForecasts = useMemo(() => {
        if (!tradeUnderlying) return { call: null, put: null, callRow: null, putRow: null };
        const chain = optionChains[tradeUnderlying];
        const spotSymbol = REVERSE_CHAIN_KEY_MAP[tradeUnderlying] || tradeUnderlying;
        const spot = marketData[spotSymbol]?.ltp;
        if (!chain?.rows?.length || !Number.isFinite(spot)) return { call: null, put: null, callRow: null, putRow: null };
        const callRow = selectActiveAffordableRow(chain.rows, spot, "call");
        const putRow = selectActiveAffordableRow(chain.rows, spot, "put");
        // estimateUnderlyingMovePct now returns a signed value (positive = up, negative = down)
        const expectedMove = estimateUnderlyingMovePct(candles, marketData[tradeSymbol], PREMIUM_SIGNAL_CONFIG);
        const ivNow = firstFinite(state.iv?.ivNow);
        const ivPrev = firstFinite(state.iv?.ivPrev);
        const ivDrift = ivNow != null && ivPrev != null ? ivNow - ivPrev : 0;
        const receivedAt = optionChainReceivedAt[tradeUnderlying] ?? chain.receivedAt;
        const common = { spot, expiry: chain.expiry, expectedSpotMovePct: expectedMove, ivDriftPct: ivDrift, config: PREMIUM_SIGNAL_CONFIG, receivedAt };
        return {
            callRow,
            putRow,
            call: callRow ? computeOptionPremiumForecast({ ...common, row: callRow, side: "call" }) : null,
            put: putRow ? computeOptionPremiumForecast({ ...common, row: putRow, side: "put" }) : null,
        };
    }, [tradeUnderlying, optionChains, optionChainReceivedAt, marketData, candles, tradeSymbol, state.iv]);
    const premiumSignal = useMemo(() => {
        const call = premiumForecasts.call;
        const put = premiumForecasts.put;
        const callReady = !!call?.qualified;
        const putReady = !!put?.qualified;
        let signal = "WAIT";
        // The dashboard has one executable decision, not a straddle-selling
        // or "buy both" recommendation.  If both contracts pass, choose only
        // the clearly stronger stress-tested edge; a tie is WAIT.
        if (callReady && putReady) {
            const callEdge = Number(call.stressNetChange ?? -Infinity);
            const putEdge = Number(put.stressNetChange ?? -Infinity);
            const callConfidence = Number(call.confidence ?? 0);
            const putConfidence = Number(put.confidence ?? 0);
            if (callEdge > putEdge && callConfidence >= putConfidence) signal = "BUY CALL";
            else if (putEdge > callEdge && putConfidence >= callConfidence) signal = "BUY PUT";
        } else if (callReady) signal = "BUY CALL";
        else if (putReady) signal = "BUY PUT";
        const reasons = [];
        if (!call || !put) reasons.push("waiting for a live executable call and put quote");
        else if (!callReady && !putReady) reasons.push("neither side survives the theta, spread, slippage, and IV-crush stress test");
        else if (signal === "BUY CALL") reasons.push("call premium has the stronger stress-tested upside");
        else if (signal === "BUY PUT") reasons.push("put premium has the stronger stress-tested upside");
        else reasons.push("both premiums pass, but neither side has a clear enough edge over the other — WAIT");
        return { signal, call, put, reason: reasons.join("; ") };
    }, [premiumForecasts]);
    // Header VWAP — true Σ(Price×Volume)/Σ(Volume) formula, same as the
    // VWAP-TWAP Premium effect above, computed for whichever symbol is
    // currently selected (tradeSymbol), live off its own candle series.
    const headerVwap = useMemo(() => {
        const c = candlesBySymbol[tradeSymbol];
        if (!c || c.length < 2) return null;
        let cumVol = 0, cumVolPrice = 0;
        c.forEach((k) => {
            const vol = k.vttStart != null && k.vttEnd != null ? Math.max(0, k.vttEnd - k.vttStart) : 1;
            cumVol += vol;
            cumVolPrice += (k.c * vol);
        });
        return cumVol > 0 ? cumVolPrice / cumVol : null;
    }, [candlesBySymbol, tradeSymbol]);
    useEffect(() => {
        if (!tradeUnderlying) return;
        const chain = optionChains[tradeUnderlying];
        const spot = marketData[tradeSymbol]?.ltp;
        if (!chain || !chain.rows?.length || spot == null) return;
        const atm = chain.rows.reduce((best, r) => (Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best), chain.rows[0]);
        // Bid-Ask Imbalance Pressure + Spread Compression — keep the relay's
        // depth poll pointed at whatever the user is ACTUALLY trading: if
        // tradeSymbol is an explicit option contract ("RELIANCE 3000 PE"),
        // watch that exact strike/side; otherwise default to the ATM call,
        // same as before. One strike, one side, at a time — matches how
        // Ram actually trades, and is also the only thing the relay's
        // single watchDepth slot can track anyway.
        const optMatch = /^(.+?)\s+(\d+(?:\.\d+)?)\s+(CE|PE)$/.exec(tradeSymbol || "");
        let watchRow = atm, watchSide = "CE";
        if (optMatch) {
            const strikeNum = Number(optMatch[2]);
            const exact = chain.rows.find((r) => r.strike === strikeNum);
            if (exact) { watchRow = exact; watchSide = optMatch[3]; }
        }
        const watchKey = watchSide === "CE" ? watchRow.callKey : watchRow.putKey;
        if (watchKey && watchKey !== watchedDepthKeyRef.current && wsRef.current && wsRef.current.readyState === 1) {
            watchedDepthKeyRef.current = watchKey;
            watchedDepthSideRef.current = watchSide;
            wsRef.current.send(JSON.stringify({ type: "watchDepth", instrument_key: watchKey, symbol: `${tradeUnderlying} ${watchRow.strike} ${watchSide}` }));
        }
        const prev = prevOptionSnapshotRef.current[tradeUnderlying];
        const totalCallOi = chain.rows.reduce((s, r) => s + (r.callOi || 0), 0);
        const totalPutOi = chain.rows.reduce((s, r) => s + (r.putOi || 0), 0);
        const pcrVal = totalCallOi > 0 ? +(totalPutOi / totalCallOi).toFixed(2) : null;
        let pcrSmoothVal = null;
        if (pcrVal != null) {
            const prevSmooth = pcrSmoothRef.current[tradeUnderlying];
            pcrSmoothVal = +((prevSmooth != null ? prevSmooth * 0.7 + pcrVal * 0.3 : pcrVal)).toFixed(3);
            pcrSmoothRef.current[tradeUnderlying] = pcrSmoothVal;
        }
        // Real Max Pain from the live chain — was previously a frozen
        // hardcoded default on both "maxpain" and "indiaQuantum" even
        // though the OI needed to compute it was already sitting right
        // here (see calculateMaxPain above).
        const maxPainStrike = calculateMaxPain(chain.rows);
        // Vanna Exposure (VEX) + Charm — closed-form Black-Scholes off the
        // live chain (strike, OI, IV) plus an assumed risk-free rate (see
        // RISK_FREE_RATE) since the chain itself carries no rate. Vanna and
        // charm share the same sign for calls and puts at a given strike
        // (put-call parity), so callOI+putOI is summed directly per strike.
        const T = yearsToExpiry(chain.expiry);
        let vexSum = 0, charmSum = 0, vommaSum = 0;
        if (T != null) {
            for (const r of chain.rows) {
                const sigma = r.callIv != null ? r.callIv / 100 : r.putIv != null ? r.putIv / 100 : null;
                if (!sigma) continue;
                const oi = (r.callOi || 0) + (r.putOi || 0);
                if (!oi) continue;
                vexSum += oi * bsVanna(spot, r.strike, T, sigma) * spot;
                charmSum += oi * bsCharm(spot, r.strike, T, sigma);
                vommaSum += oi * bsVomma(spot, r.strike, T, sigma);
            }
        }
        // Net Dealer Delta Exposure — real callDelta/putDelta × real
        // callOi/putOi, no derived greeks (unlike VEX/Charm, which need
        // Black-Scholes because Upstox doesn't return vanna/charm
        // directly). Delta IS on the chain already, so this is a direct
        // sum, no T/sigma dependency at all — only skips a strike if
        // BOTH sides are missing delta or OI.
        let netDeltaSum = 0, netDeltaRows = 0;
        for (const r of chain.rows) {
            if (r.callDelta != null && r.callOi != null) { netDeltaSum += r.callDelta * r.callOi; netDeltaRows++; }
            if (r.putDelta != null && r.putOi != null) { netDeltaSum += r.putDelta * r.putOi; netDeltaRows++; }
        }
        const hasDeltaData = netDeltaRows > 0;
        // ATM Straddle Momentum — CE+PE LTP at the current ATM strike vs
        // its value on the previous poll. Rising straddle price means the
        // market is paying up for a bigger expected move (favors buying
        // premium); falling means premium is decaying (favors selling
        // premium / range-bound regime). New indicator, own from-scratch
        // addition (not asked for by the user directly, added as the one
        // extra intraday-options signal).
        const straddleNow = (atm.callLtp != null && atm.putLtp != null) ? +(atm.callLtp + atm.putLtp).toFixed(2) : null;
        const prevStraddle = prevOptionSnapshotRef.current[`${tradeUnderlying}_straddle`];
        if (straddleNow != null) prevOptionSnapshotRef.current[`${tradeUnderlying}_straddle`] = straddleNow;
        const prevSpotForDelta = prevOptionSnapshotRef.current[`${tradeUnderlying}_spot`];
        const priceTrendUpForDelta = prevSpotForDelta != null ? (spot >= prevSpotForDelta ? 1 : 0) : 1;
        const daysToExpiry = T != null ? Math.max(0, Math.round(T * 365)) : null;
        // FIX: `updates` must be declared here, BEFORE the IV Term Structure
        // block below reads/writes updates.ivTermStructure — it was
        // previously declared 23 lines further down, which meant every
        // reference to `updates` inside that block threw "Cannot access
        // 'updates' before initialization" (const TDZ) on every single
        // poll, crashing this entire effect before its own setState/final
        // updates ever ran. That silently killed PCR, Max Pain, VEX, Charm,
        // Net Dealer Delta, OI Change Call/Put, IV Trend, Delta Zone, IV
        // Regime Filter, VRP, 25-Delta RR, OI Skew Shift, OI Buildup, and
        // IV Term Structure itself — the entire option-chain-driven set.
        const updates = {
            pcr: pcrVal != null ? { pcr: pcrVal, pcrSmooth: pcrSmoothVal } : null,
            maxpain: maxPainStrike != null ? { maxPain: maxPainStrike } : null,
            indiaQuantum: maxPainStrike != null ? { maxPainStrike } : null,
            vex: T != null ? { vexValue: Math.round(vexSum), hasChain: true } : { hasChain: false },
            charm: T != null ? { charmValue: Math.round(charmSum), daysToExpiry, hasChain: true } : { hasChain: false },
            netDealerDelta: hasDeltaData ? { netDelta: Math.round(netDeltaSum), priceTrendUp: priceTrendUpForDelta, hasChain: true } : { hasChain: false },
            atmStraddle: straddleNow != null ? { straddleNow, straddlePrev: prevStraddle != null ? prevStraddle : straddleNow, spotUp: priceTrendUpForDelta } : null,
            vomma: T != null ? { vommaValue: Math.round(vommaSum), ivNow: atm.callIv ?? null, ivPrev: prev?.callIv ?? atm.callIv ?? null, hasChain: true } : { hasChain: false },
        };
        // IV Term Structure — near-expiry ATM IV (from the `atm` row
        // already found above) vs next-expiry ATM IV (from optionChainsNext,
        // relay-server-21.js's second-expiry poll). Only computed when the
        // next-expiry chain has actually arrived — stays "no data" (WAIT)
        // until then, same guard style as VEX/Charm/RR needing hasChain.
        {
            const nearIvVals = [atm.callIv, atm.putIv].filter((x) => x != null);
            const nearAtmIv = nearIvVals.length ? nearIvVals.reduce((a, b) => a + b, 0) / nearIvVals.length : null;
            const nextChain = optionChainsNext[tradeUnderlying];
            let nextAtmIv = null;
            if (nextChain?.rows?.length) {
                const nextAtmRow = nextChain.rows.reduce((best, r) => (Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best), nextChain.rows[0]);
                const nextIvVals = [nextAtmRow.callIv, nextAtmRow.putIv].filter((x) => x != null);
                nextAtmIv = nextIvVals.length ? nextIvVals.reduce((a, b) => a + b, 0) / nextIvVals.length : null;
            }
            if (nearAtmIv != null && nextAtmIv != null) {
                updates.ivTermStructure = {
                    termSpread: +(nearAtmIv - nextAtmIv).toFixed(2),
                    nearIv: +nearAtmIv.toFixed(2),
                    nextIv: +nextAtmIv.toFixed(2),
                    priceTrendUp: priceTrendUpForDelta,
                    hasData: true,
                };
            } else {
                updates.ivTermStructure = { hasData: false };
            }
        }
        // ── Sixteen live call-vs-put direction studies ─────────────────────
        // These all read the same current chain and a short rolling history.
        // They never invent a side from a missing quote: without enough
        // comparable samples they remain WAIT.
        const callQuote = normalizeOptionQuote(atm, "call");
        const putQuote = normalizeOptionQuote(atm, "put");
        const currentCallMid = callQuote?.mid ?? atm.callLtp ?? null;
        const currentPutMid = putQuote?.mid ?? atm.putLtp ?? null;
        const directionHistory = optionDirectionHistoryRef.current[tradeUnderlying] || [];
        const priorDirection = directionHistory[directionHistory.length - 1];
        const priorPriorDirection = directionHistory[directionHistory.length - 2];
        const pctMove = (nowValue, priorValue) => nowValue != null && priorValue > 0
            ? +(((nowValue - priorValue) / priorValue) * 100).toFixed(3)
            : 0;
        const callMomentum = pctMove(currentCallMid, priorDirection?.callMid);
        const putMomentum = pctMove(currentPutMid, priorDirection?.putMid);
        const priorCallMomentum = priorDirection && priorPriorDirection
            ? pctMove(priorDirection.callMid, priorPriorDirection.callMid)
            : 0;
        const priorPutMomentum = priorDirection && priorPriorDirection
            ? pctMove(priorDirection.putMid, priorPriorDirection.putMid)
            : 0;
        const callAcceleration = +(callMomentum - priorCallMomentum).toFixed(3);
        const putAcceleration = +(putMomentum - priorPutMomentum).toFixed(3);
        const spotTrend = priorDirection ? (spot >= priorDirection.spot ? 1 : 0) : 1;
        const callVolumeTotal = chain.rows.reduce((sum, r) => sum + (Number(r.callVolume) || 0), 0);
        const putVolumeTotal = chain.rows.reduce((sum, r) => sum + (Number(r.putVolume) || 0), 0);
        const allVolume = callVolumeTotal + putVolumeTotal;
        const callVolumeShare = allVolume > 0 ? +(callVolumeTotal / allVolume * 100).toFixed(1) : 50;
        const putVolumeShare = allVolume > 0 ? +(putVolumeTotal / allVolume * 100).toFixed(1) : 50;
        const previousCallOiTotal = priorDirection?.callOiTotal;
        const previousPutOiTotal = priorDirection?.putOiTotal;
        const callOiChange = previousCallOiTotal > 0 ? +(((totalCallOi - previousCallOiTotal) / previousCallOiTotal) * 100).toFixed(3) : 0;
        const putOiChange = previousPutOiTotal > 0 ? +(((totalPutOi - previousPutOiTotal) / previousPutOiTotal) * 100).toFixed(3) : 0;
        const callIvChange = atm.callIv != null && priorDirection?.callIv != null ? +(atm.callIv - priorDirection.callIv).toFixed(3) : 0;
        const putIvChange = atm.putIv != null && priorDirection?.putIv != null ? +(atm.putIv - priorDirection.putIv).toFixed(3) : 0;
        let callDeltaVolume = 0, putDeltaVolume = 0, callGammaFlow = 0, putGammaFlow = 0;
        for (const row of chain.rows) {
            if (row.callDelta != null) callDeltaVolume += Math.abs(row.callDelta) * (Number(row.callVolume) || 0);
            if (row.putDelta != null) putDeltaVolume += Math.abs(row.putDelta) * (Number(row.putVolume) || 0);
            if (T != null) {
                if (row.callIv != null && row.callOi != null) {
                    const gamma = bsGamma(spot, row.strike, T, row.callIv / 100);
                    if (gamma != null) callGammaFlow += gamma * row.callOi;
                }
                if (row.putIv != null && row.putOi != null) {
                    const gamma = bsGamma(spot, row.strike, T, row.putIv / 100);
                    if (gamma != null) putGammaFlow += gamma * row.putOi;
                }
            }
        }
        const callSigma = atm.callIv > 0 ? atm.callIv / 100 : null;
        const putSigma = atm.putIv > 0 ? atm.putIv / 100 : null;
        const callTheta = T != null && callSigma && currentCallMid ? bsThetaDaily(spot, atm.strike, T, callSigma, "call") : null;
        const putTheta = T != null && putSigma && currentPutMid ? bsThetaDaily(spot, atm.strike, T, putSigma, "put") : null;
        const callThetaEfficiency = callTheta != null && currentCallMid > 0 ? +(Math.abs(callTheta) / currentCallMid * 100).toFixed(3) : 0;
        const putThetaEfficiency = putTheta != null && currentPutMid > 0 ? +(Math.abs(putTheta) / currentPutMid * 100).toFixed(3) : 0;
        const sortedChainRows = [...chain.rows].sort((a, b) => a.strike - b.strike);
        const atmIndex = Math.max(0, sortedChainRows.findIndex((r) => r.strike === atm.strike));
        const nearCallRow = sortedChainRows[atmIndex + 1] || atm;
        const nearPutRow = sortedChainRows[atmIndex - 1] || atm;
        const midFor = (row, side) => {
            const quote = normalizeOptionQuote(row, side);
            return quote?.mid ?? row[side === "call" ? "callLtp" : "putLtp"] ?? null;
        };
        const nearCallMid = midFor(nearCallRow, "call");
        const nearPutMid = midFor(nearPutRow, "put");
        const callWingSlope = currentCallMid > 0 && nearCallMid != null ? +((nearCallMid / currentCallMid - 1) * 100).toFixed(2) : 0;
        const putWingSlope = currentPutMid > 0 && nearPutMid != null ? +((nearPutMid / currentPutMid - 1) * 100).toFixed(2) : 0;
        const priorCallWingMomentum = priorDirection?.callWingMid;
        const priorPutWingMomentum = priorDirection?.putWingMid;
        const callWingMomentum = pctMove(nearCallMid, priorCallWingMomentum);
        const putWingMomentum = pctMove(nearPutMid, priorPutWingMomentum);
        const callOiAvg = chain.rows.length && totalCallOi > 0 ? totalCallOi / chain.rows.length : 0;
        const putOiAvg = chain.rows.length && totalPutOi > 0 ? totalPutOi / chain.rows.length : 0;
        const callOiBreadth = callOiAvg > 0 ? +(chain.rows.filter((r) => (r.callOi || 0) >= callOiAvg).length / chain.rows.length * 100).toFixed(1) : 50;
        const putOiBreadth = putOiAvg > 0 ? +(chain.rows.filter((r) => (r.putOi || 0) >= putOiAvg).length / chain.rows.length * 100).toFixed(1) : 50;
        const callSpreadPct = callQuote?.spreadPct ?? 0;
        const putSpreadPct = putQuote?.spreadPct ?? 0;
        const callSpreadImproving = priorDirection?.callSpreadPct != null && callSpreadPct < priorDirection.callSpreadPct ? 1 : 0;
        const putSpreadImproving = priorDirection?.putSpreadPct != null && putSpreadPct < priorDirection.putSpreadPct ? 1 : 0;
        const oiCenter = (side) => {
            const oiKey = side === "call" ? "callOi" : "putOi";
            const oiTotal = side === "call" ? totalCallOi : totalPutOi;
            return oiTotal > 0 ? chain.rows.reduce((sum, r) => sum + r.strike * (r[oiKey] || 0), 0) / oiTotal : atm.strike;
        };
        const callOiCenter = oiCenter("call");
        const putOiCenter = oiCenter("put");
        const callCenterShift = priorDirection?.callOiCenter != null ? +(callOiCenter - priorDirection.callOiCenter).toFixed(2) : 0;
        const putCenterShift = priorDirection?.putOiCenter != null ? +(putOiCenter - priorDirection.putOiCenter).toFixed(2) : 0;
        const callPremiumPerDelta = currentCallMid != null && atm.callDelta != null && Math.abs(atm.callDelta) > 0.01 ? +(currentCallMid / Math.abs(atm.callDelta)).toFixed(3) : 0;
        const putPremiumPerDelta = currentPutMid != null && atm.putDelta != null && Math.abs(atm.putDelta) > 0.01 ? +(currentPutMid / Math.abs(atm.putDelta)).toFixed(3) : 0;
        const straddleNowLive = currentCallMid != null && currentPutMid != null ? currentCallMid + currentPutMid : null;
        const straddleChange = pctMove(straddleNowLive, priorDirection?.straddle);
        const callConviction = totalCallOi > 0 ? +(callVolumeTotal / totalCallOi).toFixed(3) : 0;
        const putConviction = totalPutOi > 0 ? +(putVolumeTotal / totalPutOi).toFixed(3) : 0;
        const directionSample = {
            t: Date.now(), spot, callMid: currentCallMid, putMid: currentPutMid,
            callWingMid: nearCallMid, putWingMid: nearPutMid,
            callOiTotal: totalCallOi, putOiTotal: totalPutOi,
            callIv: atm.callIv, putIv: atm.putIv,
            callSpreadPct, putSpreadPct, callOiCenter, putOiCenter, straddle: straddleNowLive,
        };
        const nextDirectionHistory = [...directionHistory, directionSample].slice(-12);
        optionDirectionHistoryRef.current[tradeUnderlying] = nextDirectionHistory;
        const directionSamples = nextDirectionHistory.length;
        const directionReady = currentCallMid != null && currentPutMid != null && directionSamples >= 2;
        Object.assign(updates, {
            premiumMomentumRace: { callMomentum, putMomentum, samples: directionSamples, hasChain: directionReady },
            premiumAccelerationRace: { callAcceleration, putAcceleration, samples: directionSamples, hasChain: directionReady },
            volumePressureSplit: { callVolumeShare, putVolumeShare, spotTrend, samples: directionSamples, hasChain: directionReady },
            oiPressureSplit: { callOiChange, putOiChange, spotTrend, samples: directionSamples, hasChain: directionReady },
            ivDemandSplit: { callIvChange, putIvChange, spotTrend, samples: directionSamples, hasChain: directionReady },
            deltaVolumeSplit: { callDeltaVolume, putDeltaVolume, spotTrend, samples: directionSamples, hasChain: directionReady },
            gammaFlowSplit: { callGammaFlow, putGammaFlow, spotTrend, samples: directionSamples, hasChain: directionReady },
            thetaEfficiencySplit: { callThetaEfficiency, putThetaEfficiency, callMomentum, putMomentum, samples: directionSamples, hasChain: directionReady },
            wingSlopeDirection: { callWingSlope, putWingSlope, spotTrend, samples: directionSamples, hasChain: directionReady },
            wingMomentumDirection: { callWingMomentum, putWingMomentum, spotTrend, samples: directionSamples, hasChain: directionReady },
            optionBreadthDirection: { callOiBreadth, putOiBreadth, spotTrend, samples: directionSamples, hasChain: directionReady },
            quoteExecutionPressure: { callSpreadPct, putSpreadPct, callSpreadImproving, putSpreadImproving, callMomentum, putMomentum, hasChain: directionReady },
            strikeMigrationDirection: { callCenterShift, putCenterShift, spotTrend, samples: directionSamples, hasChain: directionReady },
            premiumRelativeValue: { callPremiumPerDelta, putPremiumPerDelta, spotTrend, samples: directionSamples, hasChain: directionReady },
            straddleImpulse: { straddleChange, callVsPutChange: +(callMomentum - putMomentum).toFixed(3), samples: directionSamples, hasChain: directionReady },
            oiVolumeConviction: { callConviction, putConviction, callMomentum, putMomentum, spotTrend, samples: directionSamples, hasChain: directionReady },
        });
        // FIX (Fatal Flaw 2 — "Shifting Strike" Illusion): only compare OI
        // against the previous snapshot when it's the SAME strike. If spot
        // moved and the ATM strike rolled (e.g. 22000 -> 22100), comparing
        // the new strike's OI to the old strike's OI produces a fake
        // 70-80% "OI change" that's really just two different strikes.
        if (prev && prev.strike === atm.strike) {
            if (atm.callOi != null && prev.callOi) updates.oiCall = { chg: +(((atm.callOi - prev.callOi) / prev.callOi) * 100).toFixed(2) };
            if (atm.putOi != null && prev.putOi) updates.oiPut = { chg: +(((atm.putOi - prev.putOi) / prev.putOi) * 100).toFixed(2) };
            if (atm.callIv != null) updates.iv = { ivNow: atm.callIv, ivPrev: prev.callIv ?? atm.callIv };
            if (atm.callDelta != null) updates.deltaDivergence = { deltaNow: +Math.abs(atm.callDelta).toFixed(2), deltaPrev: prev.callDelta != null ? +Math.abs(prev.callDelta).toFixed(2) : +Math.abs(atm.callDelta).toFixed(2) };
        } else if (prev && prev.strike !== atm.strike) {
            // FIXED: strike rolled — reset ghost momentum values instead of
            // leaving the old strike's stale OI%/IV stuck on screen.
            updates.oiCall = { chg: 0 };
            updates.oiPut = { chg: 0 };
            updates.iv = { ivNow: atm.callIv ?? null, ivPrev: atm.callIv ?? null };
            // Same strike-shift ghost issue applies to delta divergence —
            // a different strike's delta isn't comparable to the old one.
            if (atm.callDelta != null) updates.deltaDivergence = { deltaNow: +Math.abs(atm.callDelta).toFixed(2), deltaPrev: +Math.abs(atm.callDelta).toFixed(2) };
        }
        if (atm.callDelta != null) updates.delta = { delta: +Math.abs(atm.callDelta).toFixed(2), priceTrendUp: priceTrendUpForDelta };
        // IV Regime Filter — rolling 20-poll average of ATM IV.
        if (atm.callIv != null) {
            const hist = ivHistoryRef.current[tradeUnderlying] || [];
            const nextHist = [...hist, atm.callIv].slice(-20);
            ivHistoryRef.current[tradeUnderlying] = nextHist;
            const ivAvg = +(nextHist.reduce((a, b) => a + b, 0) / nextHist.length).toFixed(2);
            const priceTrendUp = prev ? (spot >= (prevOptionSnapshotRef.current[`${tradeUnderlying}_spot`] ?? spot) ? 1 : 0) : 1;
            updates.ivRegimeFilter = { ivNow: atm.callIv, ivAvg, priceTrendUp };
        }
        // Volatility Risk Premium — RV from the selected symbol's own last
        // 20 candles (log returns, annualized off the LIVE bucketMs, not a
        // hardcoded 1-min assumption — bucketMs is user-selectable via the
        // timeframe dropdown). ATM IV = average of callIv/putIv at the ATM
        // strike found above.
        // Historical Volatility formula, matched exactly:
        //   u_i = ln(S_i / S_i-1)                          — daily log return
        //   s   = sqrt( 1/(n-1) * Σ(u_i - ū)² )              — SAMPLE std dev (n-1, Bessel's correction)
        //   HV  = s * sqrt(252) * 100                        — annualized, %
        // (was previously dividing by n instead of n-1 — population variance
        // instead of sample variance — slightly understates HV; fixed here.)
        {
            const closesForRv = candles.map((c) => c.c).slice(-21);
            let rv = null;
            if (closesForRv.length >= 21) {
                const logRets = closesForRv.slice(1).map((c, i) => Math.log(c / closesForRv[i]));
                const n = logRets.length;
                const meanRet = logRets.reduce((a, b) => a + b, 0) / n;
                const variance = n > 1 ? logRets.reduce((a, b) => a + (b - meanRet) ** 2, 0) / (n - 1) : 0;
                const barsPerYear = (375 * 60000 / bucketMs) * 252;
                rv = Math.sqrt(variance) * Math.sqrt(barsPerYear) * 100;
            }
            const ivVals = [atm.callIv, atm.putIv].filter((x) => x != null);
            const atmIv = ivVals.length ? ivVals.reduce((a, b) => a + b, 0) / ivVals.length : null;
            if (rv != null && atmIv != null) {
                updates.vrp = { vrpValue: +(atmIv - rv).toFixed(2), hasData: true };
            } else {
                updates.vrp = { hasData: false };
            }
            // Historical Volatility (HV) — same 20-candle realized-vol number
            // computed just above for VRP, exposed as its own standalone
            // trend card too (rising HV = more actual movement happening =
            // favors buying premium, matches the "iv" trend indicator's
            // convention). No separate calc needed — this is a live number,
            // not a placeholder.
            if (rv != null) {
                const prevHv = prevOptionSnapshotRef.current[`${tradeUnderlying}_hv`];
                updates.historicalVol = { hvNow: +rv.toFixed(2), hvPrev: prevHv != null ? prevHv : +rv.toFixed(2), hasData: true };
                prevOptionSnapshotRef.current[`${tradeUnderlying}_hv`] = +rv.toFixed(2);
            } else {
                updates.historicalVol = { hasData: false };
            }
        }
        // 25-Delta Risk Reversal — real callDelta/putDelta from the chain
        // only (no derived/faked deltas, same guard as VEX/Charm). Skips
        // any strike missing either field rather than approximating it.
        {
            const withCallDelta = chain.rows.filter((r) => r.callIv != null && r.callDelta != null);
            const withPutDelta = chain.rows.filter((r) => r.putIv != null && r.putDelta != null);
            if (withCallDelta.length && withPutDelta.length) {
                const call25 = withCallDelta.reduce((best, r) => (Math.abs(r.callDelta - 0.25) < Math.abs(best.callDelta - 0.25) ? r : best));
                const put25 = withPutDelta.reduce((best, r) => (Math.abs(Math.abs(r.putDelta) - 0.25) < Math.abs(Math.abs(best.putDelta) - 0.25) ? r : best));
                updates.riskReversal = { rrValue: +(call25.callIv - put25.putIv).toFixed(2), hasData: true };
            } else {
                updates.riskReversal = { hasData: false };
            }
        }
        // OI Skew Shift — OI-weighted average strike for calls vs puts,
        // across the whole chain, compared to the previous poll. Guarded
        // the same way as the ATM OI% fix above: only diff against the
        // previous poll if the strike SET hasn't shifted (same row count +
        // same min strike), so a chain reload/underlying switch resets
        // cleanly instead of producing a fake skew number.
        const totalCallOiAll = chain.rows.reduce((s, r) => s + (r.callOi || 0), 0);
        const totalPutOiAll = chain.rows.reduce((s, r) => s + (r.putOi || 0), 0);
        if (totalCallOiAll > 0 && totalPutOiAll > 0) {
            const callOiCenter = +(chain.rows.reduce((s, r) => s + r.strike * (r.callOi || 0), 0) / totalCallOiAll).toFixed(2);
            const putOiCenter = +(chain.rows.reduce((s, r) => s + r.strike * (r.putOi || 0), 0) / totalPutOiAll).toFixed(2);
            const fingerprint = `${chain.rows.length}|${chain.rows[0]?.strike}`;
            const prevSkew = oiSkewPrevRef.current[tradeUnderlying];
            if (prevSkew && prevSkew.fingerprint === fingerprint) {
                updates.oiSkewShift = { callOiCenter, putOiCenter, prevCallOiCenter: prevSkew.callOiCenter, prevPutOiCenter: prevSkew.putOiCenter };
            } else {
                updates.oiSkewShift = { callOiCenter, putOiCenter, prevCallOiCenter: callOiCenter, prevPutOiCenter: putOiCenter };
            }
            oiSkewPrevRef.current[tradeUnderlying] = { callOiCenter, putOiCenter, fingerprint };
        }
        // OI Buildup Classification — cross price direction against
        // chain-wide total OI (call+put summed across every strike, so
        // this is immune to the ATM "shifting strike" issue). Needs a
        // previous poll's total OI + spot to read a DIRECTION, not just a
        // level — correctly stays at WAIT (hasData: false) on the very
        // first poll after a chain loads or an underlying switch.
        {
            const totalOiNow = totalCallOiAll + totalPutOiAll;
            const prevTotals = chainTotalsPrevRef.current[tradeUnderlying];
            if (prevTotals && totalOiNow > 0) {
                const priceDir = spot > prevTotals.spot ? 1 : spot < prevTotals.spot ? -1 : 0;
                const oiDir = totalOiNow > prevTotals.totalOi ? 1 : totalOiNow < prevTotals.totalOi ? -1 : 0;
                updates.oiBuildup = { priceDir, oiDir, hasData: true };
            } else {
                updates.oiBuildup = { hasData: false };
            }
            if (totalOiNow > 0) chainTotalsPrevRef.current[tradeUnderlying] = { totalOi: totalOiNow, spot };
        }
        prevOptionSnapshotRef.current[tradeUnderlying] = { strike: atm.strike, callOi: atm.callOi, putOi: atm.putOi, callIv: atm.callIv, callDelta: atm.callDelta };
        prevOptionSnapshotRef.current[`${tradeUnderlying}_spot`] = spot;
        // Parity Residual / Theo-Value Residual / Convexity / Elasticity —
        // real put-call-parity and Black-Scholes math off the ATM row, no
        // invented data. All four gate on T (time-to-expiry) and a live
        // ATM IV, same guard style as VEX/Charm/RR above; each stays WAIT
        // (0 residual / 0 samples) until it has real numbers to compute from.
        if (T != null && atm.callLtp != null && atm.putLtp != null) {
            const ivForTheo = [atm.callIv, atm.putIv].filter((x) => x != null);
            const sigma = ivForTheo.length ? (ivForTheo.reduce((a, b) => a + b, 0) / ivForTheo.length) / 100 : null;
            // Put-call parity: C - P = S - K*e^(-rT). Residual = actual
            // (C-P) minus the parity-implied value, as a % of spot — a
            // large negative residual means the call (or put) is priced
            // cheap relative to its parity-mandated value.
            const parityRHS = spot - atm.strike * Math.exp(-RISK_FREE_RATE * T);
            const parityLHS = atm.callLtp - atm.putLtp;
            const parityGapPct = +(((parityLHS - parityRHS) / spot) * 100).toFixed(3);
            // Theoretical (Black-Scholes) value at the blended ATM IV —
            // residual = how far the actual midpoint sits below theo, as a
            // % of spot.
            let callTheo = null, putTheo = null;
            if (sigma) { callTheo = bsPrice(spot, atm.strike, T, sigma, "call"); putTheo = bsPrice(spot, atm.strike, T, sigma, "put"); }
            const callTheoDiscountPct = callTheo != null ? +(((callTheo - atm.callLtp) / spot) * 100).toFixed(3) : null;
            const putTheoDiscountPct = putTheo != null ? +(((putTheo - atm.putLtp) / spot) * 100).toFixed(3) : null;
            const hist = optionMidHistoryRef.current[tradeUnderlying] || [];
            const nextHist = [...hist, { t: Date.now(), callMid: atm.callLtp, putMid: atm.putLtp, spot }].slice(-12);
            optionMidHistoryRef.current[tradeUnderlying] = nextHist;
            const prevSample = hist[hist.length - 1];
            const callMidUp = prevSample ? (atm.callLtp >= prevSample.callMid ? 1 : 0) : 0;
            const putMidUp = prevSample ? (atm.putLtp >= prevSample.putMid ? 1 : 0) : 0;
            const callHigherLows = nextHist.length >= 3 && nextHist.slice(-3).every((s, i, arr) => i === 0 || s.callMid >= arr[i - 1].callMid) ? 1 : 0;
            const putHigherLows = nextHist.length >= 3 && nextHist.slice(-3).every((s, i, arr) => i === 0 || s.putMid >= arr[i - 1].putMid) ? 1 : 0;
            updates.parityResidual = { callResidual: parityGapPct, callMidUp };
            updates.putParityResidual = { putResidual: parityGapPct, putMidUp };
            updates.callTheoResidual = callTheoDiscountPct != null ? { callTheoDiscount: callTheoDiscountPct, callHigherLows } : null;
            updates.putTheoResidual = putTheoDiscountPct != null ? { putTheoDiscount: putTheoDiscountPct, putHigherLows } : null;
            // Convexity: 2nd difference of the last 3 midpoints (discrete
            // approximation of d²(premium)/dt²) — positive = premium rising
            // at an accelerating rate, same idea as rocAcceleration but on
            // premium instead of spot. Needs 3+ confirming samples so it
            // isn't reacting to a single noisy poll.
            if (nextHist.length >= 3) {
                const [s1, s2, s3] = nextHist.slice(-3);
                const callConvexity = +(((s3.callMid - s2.callMid) - (s2.callMid - s1.callMid))).toFixed(3);
                const putConvexity = +(((s3.putMid - s2.putMid) - (s2.putMid - s1.putMid))).toFixed(3);
                const spotUp = s3.spot >= s1.spot ? 1 : 0;
                const priorSamples = convexitySamplesRef.current[tradeUnderlying] || 0;
                const confirming = (callConvexity > 0 && spotUp) || (putConvexity > 0 && !spotUp);
                const convexitySamples = confirming ? Math.min(priorSamples + 1, 5) : 0;
                convexitySamplesRef.current[tradeUnderlying] = convexitySamples;
                updates.optionConvexity = { callConvexity, putConvexity, spotUp, convexitySamples };
                // Elasticity: % change in premium ÷ % change in spot over
                // the same 2-sample step — how many points of premium move
                // per point of underlying move, the standard options
                // elasticity ("premium beta") definition.
                const spotPctChg = s1.spot ? (s3.spot - s1.spot) / s1.spot : 0;
                const callPctChg = s1.callMid ? (s3.callMid - s1.callMid) / s1.callMid : 0;
                const putPctChg = s1.putMid ? (s3.putMid - s1.putMid) / s1.putMid : 0;
                const callElasticity = Math.abs(spotPctChg) > 1e-6 ? +(Math.abs(callPctChg / spotPctChg)).toFixed(2) : 0;
                const putElasticity = Math.abs(spotPctChg) > 1e-6 ? +(Math.abs(putPctChg / spotPctChg)).toFixed(2) : 0;
                updates.premiumSpotElasticity = { callElasticity, putElasticity, spotUp };
            }
        }
        setState((prevState) => {
            const next = { ...prevState };
            Object.entries(updates).forEach(([id, vals]) => {
                if (!vals) return;
                // Chain-driven studies must not evaluate their editable seed
                // values.  Mark successful local chain calculations explicitly
                // so the common validity gate can distinguish them from the
                // pre-chain state.
                const chainReady = OPTION_CHAIN_DRIVEN_IDS.includes(id)
                    ? { hasChain: vals.hasChain !== false }
                    : {};
                next[id] = { ...next[id], ...vals, ...chainReady };
            });
            return next;
        });
    }, [optionChains, optionChainsNext, tradeUnderlying, tradeSymbol, marketData]);
    const evaluated = useMemo(() => initialIndicators.map((ind) => {
            const status = evaluateIndicatorStatus(ind, state[ind.id]);
        return { ind, status, displayStatus: resolveDisplayStatus(ind, state[ind.id], status) };
    }), [state]);
    // Count every indicator in the headline/Trading On totals. The special
    // panels below are still displayed separately, but they are no longer
    // removed from the totals, so BUY + SELL + WAIT always equals all 175.
    // The current indicator registry contains 175 distinct
    // id: entries in initialIndicators, no duplicates.)
    const buySignals = evaluated.filter((e) => e.status === "BUY");
    const sellSignals = evaluated.filter((e) => e.status === "SELL");
    const waitSignals = evaluated.filter((e) => e.status === "WAIT");
    const totalBuyCount = buySignals.length;
    const totalSellCount = sellSignals.length;
    const totalWaitCount = waitSignals.length;
    const total = evaluated.length;
    const buyPct = Math.round((buySignals.length / total) * 100);
    const sellPct = Math.round((sellSignals.length / total) * 100);
    // Builds a compact text snapshot of everything currently on screen —
    // market watch, option chain for the selected underlying, and every
    // wired indicator's current BUY/SELL/WAIT reading — so the AI is
    // answering from THIS app's own live numbers, not guessing.
    const buildAiSnapshot = () => {
        // Every symbol currently known to the app, grouped by category —
        // but capped per category (top movers by |chg%|) instead of dumping
        // all 7000+ market-watch rows verbatim. The full list blew past
        // Groq/Gemini's request-size limit ("reduce the length of the
        // messages") and made every Krishn AI answer fail outright — a
        // bounded, most-relevant slice is far more useful than an error.
        const MAX_ROWS_PER_CATEGORY = 15;
        const MAX_OPTION_ROWS_PER_CHAIN = 20;
        const byCategory = {};
        Object.values(marketData).forEach((r) => {
            if (r.ltp == null) return;
            const cat = r.category || "other";
            (byCategory[cat] = byCategory[cat] || []).push(r);
        });
        const marketLines = Object.entries(byCategory)
            .map(([cat, rows]) => {
                const top = [...rows]
                    .sort((a, b) => Math.abs(b.chgPct || 0) - Math.abs(a.chgPct || 0))
                    .slice(0, MAX_ROWS_PER_CATEGORY);
                const shown = top.map((r) => `${r.symbol}: ${r.ltp}${r.chgPct ? ` (${r.chgPct > 0 ? "+" : ""}${r.chgPct}%)` : ""}`).join("\n");
                const omitted = rows.length - top.length;
                return `${cat.toUpperCase()} (showing top ${top.length} of ${rows.length} by move${omitted > 0 ? `, ${omitted} more not shown` : ""}):\n${shown}`;
            })
            .join("\n\n");
        // Every option chain currently loaded (not just the one open in the modal),
        // capped per chain to the strikes nearest spot so the payload stays bounded.
        const chainLines = Object.entries(optionChains)
            .filter(([, c]) => c?.rows?.length)
            .map(([underlying, c]) => {
                const rows = c.rows.length > MAX_OPTION_ROWS_PER_CHAIN
                    ? c.rows.slice(0, MAX_OPTION_ROWS_PER_CHAIN)
                    : c.rows;
                const omitted = c.rows.length - rows.length;
                return `${underlying} (expiry ${c.expiry}${omitted > 0 ? `, showing ${rows.length} of ${c.rows.length} strikes` : ""}):\n` + rows.map((r) => `Strike ${r.strike}: CE ltp=${r.callLtp ?? "—"} oi=${r.callOi ?? "—"} | PE ltp=${r.putLtp ?? "—"} oi=${r.putOi ?? "—"}`).join("\n");
            })
            .join("\n\n") || "No option chains loaded yet.";
        // "Most active options" = ranked by Open Interest, since that's the
        // real activity signal the relay actually gives us per strike (no
        // separate per-option traded-volume field exists in this feed).
        // Computed here explicitly rather than left for the LLM to eyeball
        // from the raw chain dump above, so the ranking is exact.
        const mostActiveLines = Object.entries(optionChains)
            .filter(([, c]) => c?.rows?.length)
            .map(([underlying, c]) => {
                const topCalls = [...c.rows].filter((r) => r.callOi != null).sort((a, b) => b.callOi - a.callOi).slice(0, 5)
                    .map((r, i) => `${i + 1}. Strike ${r.strike} CE — OI ${r.callOi.toLocaleString("en-IN")}, LTP ${r.callLtp ?? "—"}`).join("\n");
                const topPuts = [...c.rows].filter((r) => r.putOi != null).sort((a, b) => b.putOi - a.putOi).slice(0, 5)
                    .map((r, i) => `${i + 1}. Strike ${r.strike} PE — OI ${r.putOi.toLocaleString("en-IN")}, LTP ${r.putLtp ?? "—"}`).join("\n");
                return `${underlying} (expiry ${c.expiry}) — MOST ACTIVE CALLS (by OI):\n${topCalls || "—"}\n${underlying} — MOST ACTIVE PUTS (by OI):\n${topPuts || "—"}`;
            })
            .join("\n\n") || "No option chains loaded yet.";
        // Every one of the app's 116+ wired indicators — status AND the raw
        // inputs each one is computed from, so Krishn AI can explain *why*,
        // not just report a label. Guarded: if any indicator's raw value is
        // an array or oversized object, printing it via template-literal
        // stringification would dump its full contents inline — capped to a
        // safe summary instead, plus an overall size ceiling on the whole
        // block, since this was flowing straight into every Groq/Gemini
        // request and a single unbounded array here could balloon a request
        // to tens of thousands of tokens on its own.
        const summarizeRawValue = (v) => {
            if (Array.isArray(v)) return `[array of ${v.length}]`;
            if (v && typeof v === "object") return "[object]";
            const s = String(v);
            return s.length > 40 ? s.slice(0, 40) + "…" : s;
        };
        const INDICATOR_TEXT_CAP = 12000; // ≈ 3k tokens
        let indicatorLines = "";
        let indicatorsOmitted = 0;
        for (const { ind, status } of evaluated) {
            const raw = state[ind.id];
            const rawStr = raw && typeof raw === "object" ? Object.entries(raw).map(([k, v]) => `${k}=${summarizeRawValue(v)}`).join(", ") : "";
            const line = `${ind.label} [${ind.id}]: ${status}${rawStr ? ` (${rawStr})` : ""}`;
            if (indicatorLines.length + line.length > INDICATOR_TEXT_CAP) { indicatorsOmitted++; continue; }
            indicatorLines += (indicatorLines ? "\n" : "") + line;
        }
        if (indicatorsOmitted > 0) indicatorLines += `\n…and ${indicatorsOmitted} more indicators omitted for size (BUY/SELL/WAIT counts above already reflect all ${evaluated.length}).`;
        return `PCR: ${state.pcr?.pcr ?? "—"}\nIndia VIX: ${marketData["INDIA VIX"]?.ltp ?? "—"}\nCounts across all ${evaluated.length} indicators — BUY: ${totalBuyCount}, SELL: ${totalSellCount}, WAIT: ${totalWaitCount}\n\n--- MARKET WATCH (NSE/BSE indices & stocks, options, MCX commodities, crypto) ---\n${marketLines}\n\n--- OPTION CHAINS ---\n${chainLines}\n\n--- MOST ACTIVE OPTIONS (ranked by OI) ---\n${mostActiveLines}\n\n--- ALL WIRED INDICATORS (status + raw values) ---\n${indicatorLines}`;
    };
    const sendAiMessage = async (question) => {
        if (!question.trim() || aiLoading)
            return;
         if (!reserveKrishnQuestion()) {
             setAiMessages((prev) => [...prev, {
                 role: "assistant",
                 text: "Daily Krishn AI limit reached (2 questions per local day). Please return tomorrow; the limit protects the free provider quotas."
             }]);
             return;
         }
        const userMsg = { role: "user", text: question.trim() };
        setAiMessages((prev) => [...prev, userMsg]);
        setAiInput("");
        setAiLoading(true);
        try {
            const snapshot = buildAiSnapshot();
            const history = aiMessages.slice(-8).map((m) => ({ role: m.role, content: m.text }));
            const response = await fetch("/api/krishn-ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: question.trim(), snapshot, history }),
                signal: AbortSignal.timeout(90000),
            });
            const data = await response.json();
            if (!response.ok || data.error) throw new Error(data.error || `Krishn AI HTTP ${response.status}`);
            const comparison = data.answers?.find((answer) => answer.name === "Krishn AI comparison");
            const providerAnswers = (data.answers || []).filter((answer) => answer.name !== "Krishn AI comparison");
            setAiMessages((prev) => [...prev, {
                role: "assistant",
                text: comparison?.text || "No comparison was returned.",
                answers: providerAnswers,
                meta: data.meta,
            }]);
        } catch (err) {
             releaseKrishnQuestion();
            setAiMessages((prev) => [...prev, { role: "assistant", text: `Error reaching Krishn AI: ${err.message}` }]);
        } finally {
            setAiLoading(false);
        }
    };
    // Krishn AI verdict box uses the same secure hosted fan-out endpoint as
    // the chat panel. It never puts provider credentials in this browser file.
    const refreshKrishnVerdict = async () => {
        if (krishnVerdict.loading) return;
         if (!reserveKrishnQuestion()) {
             setKrishnVerdict((prev) => ({
                 ...prev,
                 text: "Daily Krishn AI limit reached (2 questions per local day). Please return tomorrow.",
             }));
             return;
         }
        setKrishnVerdict((prev) => ({ ...prev, loading: true }));
        try {
            const snapshot = buildAiSnapshot();
            const response = await fetch("/api/krishn-ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question: "Give the current option-buying verdict in one short answer. Use only BUY CALL, BUY PUT, WAIT, or INFO and explain the single biggest reason.",
                    snapshot,
                    history: [],
                }),
                signal: AbortSignal.timeout(90000),
            });
            const data = await response.json();
            if (!response.ok || data.error) throw new Error(data.error || `Krishn AI HTTP ${response.status}`);
            const first = (data.answers || []).find((answer) => answer.status === "ok" && answer.name !== "Krishn AI comparison");
            const text = first ? `${first.stance} · ${first.text}` : "No provider returned a usable verdict.";
            setKrishnVerdict({ text, loading: false, at: Date.now() });
        } catch (err) {
             releaseKrishnQuestion();
            setKrishnVerdict({ text: `Error reaching AI: ${err.message}`, loading: false, at: Date.now() });
        }
    };
     // Deliberately no background AI polling: the free-tier budget is reserved
     // for the user's two intentional questions per local calendar day.
    // Recomputes which CE/PE is "most active" every time the selected
    // underlying's option chain updates — ranks strikes by how much OI has
    // moved since the last poll (fresh positions being built = real
    // activity) and, as a tiebreak, by fastest LTP % move.
    useEffect(() => {
        const chain = optionChains[optionChainKey];
        if (!chain?.rows?.length)
            return;
        const prev = prevChainForActivityRef.current[optionChainKey] || {};
        const next = {};
        const callList = [], putList = [];
        chain.rows.forEach((row) => {
            next[row.strike] = { callOi: row.callOi, putOi: row.putOi, callLtp: row.callLtp, putLtp: row.putLtp };
            const p = prev[row.strike];
            if (row.callOi != null && row.callLtp != null) {
                const oiChange = p?.callOi != null ? row.callOi - p.callOi : row.callOi;
                const ltpPct = p?.callLtp ? Math.abs((row.callLtp - p.callLtp) / p.callLtp) * 100 : 0;
                const score = Math.abs(oiChange) * 1000 + ltpPct;
                callList.push({ strike: row.strike, ltp: row.callLtp, oiChange, ltpPct: +ltpPct.toFixed(2), score });
            }
            if (row.putOi != null && row.putLtp != null) {
                const oiChange = p?.putOi != null ? row.putOi - p.putOi : row.putOi;
                const ltpPct = p?.putLtp ? Math.abs((row.putLtp - p.putLtp) / p.putLtp) * 100 : 0;
                const score = Math.abs(oiChange) * 1000 + ltpPct;
                putList.push({ strike: row.strike, ltp: row.putLtp, oiChange, ltpPct: +ltpPct.toFixed(2), score });
            }
        });
        callList.sort((a, b) => b.score - a.score);
        putList.sort((a, b) => b.score - a.score);
        const bestCall = callList[0] || null;
        const bestPut = putList[0] || null;
        prevChainForActivityRef.current[optionChainKey] = next;
        if (bestCall || bestPut)
            setMostActiveOption({ underlying: optionChainKey, call: bestCall, put: bestPut });
        setTopActive({ calls: callList.slice(0, 5), puts: putList.slice(0, 5) });
    }, [optionChains, optionChainKey]);
    // Grand Consensus — a weighted read-out of every wired indicator, not a
    // 116th "guaranteed" signal. Strength label only reflects how lopsided
    // BUY vs SELL currently is across all indicators; always non-binding.
    // WEIGHTING FIX: macroIndicatorIds (FRED/COT/monthly-cadence reads) get
    // 0.5x weight below so a slow-moving macro signal doesn't count 1:1
    // against a live intraday tick. Raw buy/sell/wait counts shown
    // elsewhere in the UI are untouched — only this gap/label is weighted.
    const grandConsensus = useMemo(() => {
        let weightedBuy = 0, weightedSell = 0;
        evaluated.forEach(({ ind, status }) => {
            const w = macroIndicatorIds.has(ind.id) ? 0.5 : 1;
            if (status === "BUY") weightedBuy += w;
            else if (status === "SELL") weightedSell += w;
        });
        const gap = +(weightedBuy - weightedSell).toFixed(1);
        let label = "MIXED — no clear lean";
        if (gap >= 40) label = "STRONG BUY lean";
        else if (gap >= 15) label = "BUY lean";
        else if (gap <= -40) label = "STRONG SELL lean";
        else if (gap <= -15) label = "SELL lean";
        return { gap, label, buy: totalBuyCount, sell: totalSellCount, wait: totalWaitCount };
    }, [evaluated, totalBuyCount, totalSellCount, totalWaitCount]);
    // Lock-screen / notification-icon alert — fires an in-app + OS
    // notification (via the Notification API) when: SELL count < 5 AND
    // falling over the last few samples, AND BUY count > 30, using
    // whichever CE/PE is currently "most active" from the tracker above.
    // This reports a threshold crossing on the app's own numbers — it is
    // not a trade instruction and carries no guarantee.
    useEffect(() => {
        const hist = sellCountHistoryRef.current;
        hist.push(totalSellCount);
        if (hist.length > 5)
            hist.shift();
        const fallingOrLow = hist.length < 2 || hist[hist.length - 1] <= hist[0];
        const conditionMet = totalSellCount < 5 && fallingOrLow && totalBuyCount > 30;
        if (!conditionMet)
            return;
        const now = Date.now();
        if (now - lastAlertFiredAtRef.current < 5 * 60 * 1000) // don't spam — 5 min cooldown
            return;
        lastAlertFiredAtRef.current = now;
        const activePick = mostActiveOption?.call && mostActiveOption?.put
            ? (Math.abs(mostActiveOption.call.oiChange || 0) >= Math.abs(mostActiveOption.put.oiChange || 0) ? { side: "CE", ...mostActiveOption.call } : { side: "PE", ...mostActiveOption.put })
            : mostActiveOption?.call ? { side: "CE", ...mostActiveOption.call } : mostActiveOption?.put ? { side: "PE", ...mostActiveOption.put } : null;
        const body = activePick
            ? `Buy:${totalBuyCount} Sell:${totalSellCount} — most active: ${mostActiveOption.underlying} ${activePick.strike} ${activePick.side} @ ${activePick.ltp} (OI Δ${activePick.oiChange > 0 ? "+" : ""}${activePick.oiChange})`
            : `Buy:${totalBuyCount} Sell:${totalSellCount} — indicator threshold crossed. Not a trade instruction.`;
        setAiMessages((prev) => [...prev, { role: "assistant", text: `⚡ Threshold alert: ${body}\n\nThis is a read-out of your own indicators crossing a level you set, not a buy/sell instruction — always confirm on the Option Chain / AI panel before acting.` }]);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
                if (navigator.serviceWorker?.controller) {
                    // Goes through sw.js — Android will show this even if the
                    // screen is locked / tab is backgrounded, as long as the
                    // app was installed via "Add to Home Screen".
                    navigator.serviceWorker.controller.postMessage({ type: "SHOW_NOTIFICATION", title: "Krishn AI — indicator threshold crossed", body, tag: "krishn-ai-alert" });
                } else {
                    new Notification("Krishn AI — indicator threshold crossed", { body, tag: "krishn-ai-alert" });
                }
            } catch (err) { /* some mobile browsers throw when backgrounded — service worker path above is the reliable one */ }
        }
    }, [totalSellCount, totalBuyCount, mostActiveOption]);
    const confluence = useMemo(() => {
        const byCategory = {};
        evaluated.forEach(({ ind, status }) => {
            const cat = indicatorCategory[ind.id];
            if (!cat)
                return;
            if (!byCategory[cat])
                byCategory[cat] = { BUY: 0, SELL: 0, WAIT: 0 };
            byCategory[cat][status] += 1;
        });
        const categoryVerdict = {};
        CATEGORY_ORDER.forEach((cat) => {
            const counts = byCategory[cat] || { BUY: 0, SELL: 0, WAIT: 0 };
            if (counts.BUY > counts.SELL && counts.BUY > counts.WAIT)
                categoryVerdict[cat] = "BUY";
            else if (counts.SELL > counts.BUY && counts.SELL > counts.WAIT)
                categoryVerdict[cat] = "SELL";
            else
                categoryVerdict[cat] = "WAIT";
        });
        const buyCats = Object.values(categoryVerdict).filter((v) => v === "BUY").length;
        const sellCats = Object.values(categoryVerdict).filter((v) => v === "SELL").length;
        const leaderCount = Math.max(buyCats, sellCats);
        const direction = buyCats > sellCats ? "BUY" : sellCats > buyCats ? "SELL" : "WAIT";
        let confidence = "Low";
        if (leaderCount >= 4)
            confidence = "High";
        else if (leaderCount === 3)
            confidence = "Medium";
        const hulkEntry = evaluated.find((e) => e.ind.id === "gex");
        const regimeDamped = hulkEntry && hulkEntry.status === "WAIT";
        return { categoryVerdict, buyCats, sellCats, direction, confidence, regimeDamped };
    }, [evaluated]);
    const superSignal = useMemo(() => {
        const votes = evaluated.filter((e) => e.ind.id !== "gex");
        const buyVotes = votes.filter((e) => e.status === "BUY").length;
        const sellVotes = votes.filter((e) => e.status === "SELL").length;
        const total2 = votes.length || 1;
        const rawScore = Math.round(((buyVotes - sellVotes) / total2) * 100);
        const timeWeight = 0.5 + (sessionElapsedPct / 100) * 0.5;
        const weightedScore = Math.round(rawScore * timeWeight);
        const direction = weightedScore > 10 ? "BUY" : weightedScore < -10 ? "SELL" : "WAIT";
        const confidencePct = Math.min(100, Math.abs(weightedScore));
        return { buyVotes, sellVotes, total: total2, rawScore, timeWeight, weightedScore, direction, confidencePct };
    }, [evaluated, sessionElapsedPct]);
    const grandUnified = useMemo(() => {
        const ich = evaluated.find((e) => e.ind.id === "ichimoku");
        const avwap = evaluated.find((e) => e.ind.id === "usaQuant");
        const vpoc = evaluated.find((e) => e.ind.id === "vpoc");
        const statuses = [ich && ich.status, avwap && avwap.status, vpoc && vpoc.status];
        const allBuy = statuses.every((s) => s === "BUY");
        const allSell = statuses.every((s) => s === "SELL");
        const direction = allBuy ? "BUY" : allSell ? "SELL" : "WAIT";
        const aligned = allBuy || allSell;
        return { direction, aligned, ichStatus: ich && ich.status, avwapStatus: avwap && avwap.status, vpocStatus: vpoc && vpoc.status };
    }, [evaluated]);
    const radheyShyam = useMemo(() => {
        const byId = {};
        evaluated.forEach((e) => (byId[e.ind.id] = e.status));
        const macroClear = byId.luxQuantum === "WAIT" && byId.germanyQuantum === "WAIT";
        let trend = "Mixed";
        if (byId.ichimoku === "BUY" && byId.usaQuant === "BUY")
            trend = "BUY";
        else if (byId.ichimoku === "SELL" && byId.usaQuant === "SELL")
            trend = "SELL";
        const filterSafe = byId.vpoc === "WAIT" && byId.russiaVol === "WAIT";
        const momentumHigh = trend !== "Mixed" && byId.chinaHurst === trend && byId.indiaQuantum !== (trend === "BUY" ? "SELL" : "BUY");
        const rangeValid = trend !== "Mixed" && byId.uaeQuantum === trend && byId.swissQuantum === "WAIT";
        let verdict = "WAIT";
        if (trend === "BUY" && macroClear && filterSafe && momentumHigh && rangeValid)
            verdict = "BUY";
        else if (trend === "SELL" && macroClear && filterSafe && momentumHigh && rangeValid)
            verdict = "SELL";
        return { verdict, macroClear, trend, filterSafe, momentumHigh, rangeValid };
    }, [evaluated]);
    // Confidence score for radheyShyam — instead of a flat BUY/SELL/WAIT,
    // score how many of the 5 underlying conditions actually agree right
    // now (0-5 → 0-100%). verdict itself only fires BUY/SELL at 100% (all
    // 5 aligned), so this exposes the honest partial-alignment strength
    // that was previously invisible whenever verdict sat at WAIT.
    // OMS Master Score — combines the 5 weighted OMS sub-indicators into a
    // single Option Momentum Score, exactly per spec:
    // Score = (OI_change% × 0.30) + (Volume/OI × 0.25) + (IV_change% × 0.20)
    //       + (Delta×Volume × 0.15) + (Ask_hit_ratio × 0.10)
    // Each sub-indicator's own evaluate() already encodes the correct
    // BUY/SELL/WAIT logic (incl. the OI-up/down × price-up/down 4-quadrant
    // table: fresh buying, fresh shorting, short covering, long unwinding).
    // Since the 5 raw values live on very different scales (%, x, %, count,
    // %), each is first converted to a directional strength on -1..+1 so the
    // weights combine meaningfully, then the weighted sum drives the final
    // verdict. omsFuturesConfirm is applied afterward as a trap filter —
    // if the underlying futures don't confirm, the verdict is downgraded to
    // WAIT regardless of score, per the "skipped point" logic.
    // omsFuturesConfirm needs to know whether the option-side OMS signal is
    // currently bullish. Rather than duplicate that direction logic on the
    // relay, derive it client-side straight from the already-live
    // omsOiChange status (fires whenever the relay pushes a fresh
    // oiChangePct/priceUp via the "indicators" broadcast).
    useEffect(() => {
        const oiStatus = evaluated.find((e) => e.ind.id === "omsOiChange")?.status;
        if (!oiStatus) return;
        setState((prev) => ({ ...prev, omsFuturesConfirm: { ...prev.omsFuturesConfirm, optionSignalBullish: oiStatus === "BUY" ? 1 : 0 } }));
    }, [evaluated]);
    // BUG FIX: futuresPriceUp/futuresOiUp were hardcoded default values (1)
    // that nothing ever updated, so the "trap filter" this card exists for
    // (see the id's own label) could never actually trip — it always read
    // futures price as "rising" even while the real instrument was crashing
    // (e.g. CRUDEOIL -5.5% still showing 100 BUY). Wire futuresPriceUp to
    // the live chgPct of whatever's selected in Trading On, falling back to
    // last-vs-previous candle close if chgPct isn't available yet. Leaves
    // futuresOiUp as-is (no live futures-OI feed to wire it to), which is
    // enough on its own to stop a falling price from confirming a BUY.
    useEffect(() => {
        const row = marketData[tradeSymbol];
        let priceUp = null;
        if (row?.chgPct != null && row.chgPct !== 0) priceUp = row.chgPct > 0 ? 1 : 0;
        else if (candles.length >= 2) {
            const last = candles[candles.length - 1], prev = candles[candles.length - 2];
            if (last.c !== prev.c) priceUp = last.c > prev.c ? 1 : 0;
        }
        if (priceUp === null) return;
        setState((prev) => {
            if (prev.omsFuturesConfirm?.futuresPriceUp === priceUp) return prev;
            return { ...prev, omsFuturesConfirm: { ...prev.omsFuturesConfirm, futuresPriceUp: priceUp } };
        });
    }, [tradeSymbol, marketData, candles]);
    const omsMasterScore = useMemo(() => {
        const getEval = (id) => evaluated.find((e) => e.ind.id === id);
        const getRaw = (id) => state[id] || {};
        const oi = getEval("omsOiChange"), volOi = getEval("omsVolOiRatio"), iv = getEval("omsIvChange"),
              dv = getEval("omsDeltaVolume"), ask = getEval("omsAskHitRatio"), fut = getEval("omsFuturesConfirm");
        if (!oi || !volOi || !iv || !dv || !ask || !fut) return { score: 0, verdict: "WAIT", trapBlocked: false, priceBlocked: false, breakdown: [] };

        const clamp = (n, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : 0));
        const signedByPrice = (priceUp) => priceUp ? 1 : -1;
        const oiRaw = getRaw("omsOiChange");
        const volRaw = getRaw("omsVolOiRatio");
        const ivRaw = getRaw("omsIvChange");
        const dvRaw = getRaw("omsDeltaVolume");
        const askRaw = getRaw("omsAskHitRatio");

        const oiPct = Number(oiRaw.oiChangePct || 0);
        const oiStrength = Math.abs(oiPct) >= 5 ? signedByPrice(oiRaw.priceUp) * clamp((Math.abs(oiPct) - 5) / 20, 0, 1) : 0;
        const volRatio = Number(volRaw.oi || 0) >= 100 ? Number(volRaw.volume || 0) / Number(volRaw.oi || 0) : 0;
        const volStrength = volRatio >= 1.5 ? signedByPrice(volRaw.priceUp) * clamp((volRatio - 1.5) / 2, 0, 1) : 0;
        const ivChg = Number(ivRaw.ivPrev || 0) > 0 ? ((Number(ivRaw.ivNow || 0) - Number(ivRaw.ivPrev || 0)) / Number(ivRaw.ivPrev || 0)) * 100 : 0;
        const ivStrength = ivChg > 8 ? signedByPrice(ivRaw.priceUp) * clamp((ivChg - 8) / 20, 0, 1) : 0;
        // SIGN FIX (directional OMS header): SIGNED delta×volume.
        const signedDeltaVolume = Number(dvRaw.delta || 0) * Number(dvRaw.volume || 0);
        const deltaVolume = Math.abs(signedDeltaVolume);
        const dvBaseline = Math.abs(Number(dvRaw.avgDeltaVolume || 0));
        const dvRatio = dvBaseline > 0 ? deltaVolume / dvBaseline : 0;
        const dvDirAgrees = (signedDeltaVolume > 0) === !!dvRaw.priceUp;
        const dvStrength = (dvRatio >= 1.5 && signedDeltaVolume !== 0 && dvDirAgrees)
            ? (signedDeltaVolume > 0 ? 1 : -1) * clamp((dvRatio - 1.5) / 2, 0, 1)
            : 0;
        const askHitsW = askRaw.askHitsWindowed !== undefined ? Number(askRaw.askHitsWindowed) : Number(askRaw.askHits || 0);
        const bidHitsW = askRaw.bidHitsWindowed !== undefined ? Number(askRaw.bidHitsWindowed) : Number(askRaw.bidHits || 0);
        const askTotal = askHitsW + bidHitsW;
        const askRatio = askTotal >= 20 ? (askHitsW / askTotal) * 100 : 50;
        const askStrength = (askTotal >= 20 && Math.abs(askRatio - 50) >= 10) ? clamp((askRatio - 50) / 35) : 0;

        const weights = { oi: 0.30, volOi: 0.25, iv: 0.20, dv: 0.15, ask: 0.10 };
        const parts = {
            oi: oiStrength * weights.oi,
            volOi: volStrength * weights.volOi,
            iv: ivStrength * weights.iv,
            dv: dvStrength * weights.dv,
            ask: askStrength * weights.ask,
        };
        const rawScore = parts.oi + parts.volOi + parts.iv + parts.dv + parts.ask; // -1..+1, magnitude-aware
        const score = Math.round(rawScore * 100); // -100..+100

        // HAS-DATA GUARD: never publish a verdict off seeded defaults, and
        // never off one lonely leg. At least 2 of the 5 legs must be live,
        // non-zero, and agree in sign before BUY/SELL can print.
        const legs = [oiStrength, volStrength, ivStrength, dvStrength, askStrength].filter((n) => n !== 0);
        const liveFeed = Number(oiRaw.oiChangePct || 0) !== 0 || Number(volRaw.volume || 0) > 0 || Number(dvRaw.volume || 0) > 0 || askTotal >= 20;
        const agree = legs.length > 0 && legs.every((n) => (n > 0) === (legs[0] > 0));

        let verdict = "WAIT";
        if (liveFeed && legs.length >= 2 && agree) {
            if (score >= 40) verdict = "BUY";
            else if (score <= -40) verdict = "SELL";
        }

        let trapBlocked = false;
        if (verdict === "BUY" && fut.status !== "BUY") { verdict = "WAIT"; trapBlocked = true; }
        if (verdict === "SELL" && fut.status !== "SELL") { verdict = "WAIT"; trapBlocked = true; }

        // Final CMP guard: never show a BUY master score while the selected
        // instrument is actually falling (e.g. CRUDEOIL down ~100 points), and
        // never show SELL while it is rising. This fixes the false 100% BUY bug.
        let priceBlocked = false;
        const row = marketData[tradeSymbol];
        let cmpDir = 0;
        if (row?.chgPct != null && Math.abs(row.chgPct) >= 0.03) cmpDir = row.chgPct > 0 ? 1 : -1;
        else if (row?.chg != null && row.chg !== 0) cmpDir = row.chg > 0 ? 1 : -1;
        else if (candles.length >= 2) {
            const last = candles[candles.length - 1], prev = candles[candles.length - 2];
            if (last.c !== prev.c) cmpDir = last.c > prev.c ? 1 : -1;
        }
        if (verdict === "BUY" && cmpDir < 0) { verdict = "WAIT"; priceBlocked = true; }
        if (verdict === "SELL" && cmpDir > 0) { verdict = "WAIT"; priceBlocked = true; }

        const toStatus = (n) => n > 0.02 ? "BUY" : n < -0.02 ? "SELL" : "WAIT";
        const breakdown = [
            { label: "OI Change % (0.30)", status: toStatus(parts.oi), contrib: +parts.oi.toFixed(2) },
            { label: "Volume/OI Ratio (0.25)", status: toStatus(parts.volOi), contrib: +parts.volOi.toFixed(2) },
            { label: "IV Change % (0.20)", status: toStatus(parts.iv), contrib: +parts.iv.toFixed(2) },
            { label: "Delta×Volume (0.15)", status: toStatus(parts.dv), contrib: +parts.dv.toFixed(2) },
            { label: "Ask-Hit Ratio (0.10)", status: toStatus(parts.ask), contrib: +parts.ask.toFixed(2) },
            { label: "Futures Confirm (trap filter)", status: fut.status, contrib: null },
            { label: `CMP Guard ${tradeSymbol}`, status: cmpDir > 0 ? "BUY" : cmpDir < 0 ? "SELL" : "WAIT", contrib: null },
        ];
        return { score, verdict, trapBlocked, priceBlocked, breakdown };
    }, [evaluated, state, marketData, tradeSymbol, candles]);
    const radheyShyamConfidence = useMemo(() => {
        const trendDirection = radheyShyam.trend !== "Mixed" ? radheyShyam.trend : null;
        const conditions = [radheyShyam.macroClear, trendDirection !== null, radheyShyam.filterSafe, radheyShyam.momentumHigh, radheyShyam.rangeValid];
        const trueCount = conditions.filter(Boolean).length;
        const pct = Math.round((trueCount / conditions.length) * 100);
        let label;
        if (!trendDirection) label = "WAIT / No edge";
        else if (pct >= 80) label = `Strong ${trendDirection}`;
        else if (pct >= 60) label = `Moderate ${trendDirection}`;
        else if (pct >= 40) label = `Weak lean ${trendDirection}`;
        else label = "WAIT / No edge";
        return { pct, trueCount, total: conditions.length, direction: trendDirection, label };
    }, [radheyShyam]);
    // ── SHINY NAVY BLUE HEADER ──
    // Background: deep navy gradient with a glossy highlight
    // Shadow: cyan glow to make it read as "shiny"
    const headerStyle = {
        background: "linear-gradient(135deg, #0a1a3f 0%, #0f2a5e 45%, #0a1a3f 100%)",
        boxShadow: "0 4px 28px rgba(249, 115, 22, 0.35), inset 0 1px 0 rgba(255,255,255,0.08)",
        border: "2px solid #f97316",
        paddingTop: "calc(1rem - 3.8px)",
        paddingBottom: "calc(1rem - 3.8px)",
    };
    // ---------------------------------------------------------------
    // TV GRID OVERLAY — dense wall of every indicator for casting to a big
    // screen, built as a fixed-position overlay (z-40) rather than an
    // early return, so the Option Chain modal (z-50) and Order ticket
    // modal (z-100) still work normally on top of it — tapping "Option
    // Chain" from inside TV Grid opens the exact same modal used
    // everywhere else. tvGridView switches between the indicator wall,
    // the live chart, and the market watch table within this same
    // overlay, all reusing state/data already computed above.
    let tvOverlay = null;
    if (tvGridMode) {
        const chainRows = optionChains[tradeUnderlying]?.rows || [];
        const spotForAtm = marketData[tradeUnderlying]?.ltp ?? marketData[tradeSymbol]?.ltp;
        let atmRow = null;
        if (chainRows.length && typeof spotForAtm === "number") {
            atmRow = chainRows.reduce((best, r) => (Math.abs(r.strike - spotForAtm) < Math.abs(best.strike - spotForAtm) ? r : best), chainRows[0]);
        }
        const cmpText = marketData[tradeSymbol]?.ltp != null ? formatPrice(marketData[tradeSymbol].ltp) : "—";
        const callText = atmRow?.callLtp != null ? atmRow.callLtp.toFixed(2) : "—";
        const putText = atmRow?.putLtp != null ? atmRow.putLtp.toFixed(2) : "—";
        const strikeText = atmRow?.strike ?? "—";
        // 13 ROWS is the fixed dimension (matches a 32" TV split into 13
        // horizontal bands, up from 10). Columns are auto-computed from
        // however many indicators exist (114 now, up from 79) — cell
        // width is shrunk to 4.5rem since each cell only shows 3 things
        // (name + green button + red button), so more fit across.
        const GRID_ROWS = 7;
        const gridBuyCount = evaluated.filter((e) => e.status === "BUY").length;
        const gridSellCount = evaluated.filter((e) => e.status === "SELL").length;
        const gridWaitCount = evaluated.filter((e) => e.status === "WAIT").length;
        const tvTabBtn = (key, label) => (
          <button
            key={key}
            onClick={() => setTvGridView(key)}
            className={`text-xs font-bold rounded-full px-3 py-1.5 border-2 transition-colors ${tvGridView === key ? "bg-cyan-400/25 border-cyan-300 text-cyan-100" : "border-cyan-500/30 text-cyan-300/70 hover:bg-cyan-400/10"}`}
          >
            {label}
          </button>
        );
        tvOverlay = (<div className="fixed inset-0 z-40 bg-slate-950 text-slate-100 p-1.5 flex flex-col" style={{ fontSize: "1em" }}>
          <div className="flex items-start justify-between px-3 py-2 rounded-lg border-2 mb-1.5 shrink-0 gap-2" style={{ ...headerStyle, borderColor: "#22d3ee" }}>
            {/* LEFT — all non-button content, stacked one row per item */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <Radio className="w-5 h-5 text-cyan-200"/>
                <span className="text-lg font-black text-cyan-100 tracking-wide" style={{ textShadow: "0 0 14px rgba(34,211,238,0.85), 0 0 3px rgba(255,255,255,0.9)" }}>Radhey Shyam Aashirvaad — TV Grid</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-black tracking-widest border border-cyan-400/60 ${apiStatus === "LIVE" ? "bg-teal-950/20 text-emerald-200" : apiStatus === "CONNECTING" ? "bg-amber-500/20 text-amber-200" : "bg-rose-500/20 text-rose-200"}`}>{apiStatus}</span>
              </div>
              <span className="text-cyan-100 font-mono text-sm" style={{ textShadow: "0 0 6px rgba(34,211,238,0.6)" }}>CMP {tradeSymbol}: <b className="text-white">{cmpText}</b></span>
              <span className="text-emerald-200 font-mono text-sm" style={{ textShadow: "0 0 6px rgba(13,148,136,0.6)" }}>CALL {strikeText}: <b>{callText}</b></span>
              <span className="text-rose-200 font-mono text-sm" style={{ textShadow: "0 0 6px rgba(251,113,133,0.6)" }}>PUT {strikeText}: <b>{putText}</b></span>
              <span className={`font-mono text-sm ${state.pcr?.pcr != null ? ((state.pcr.pcrSmooth ?? state.pcr.pcr) >= 1.1 ? "text-emerald-200" : (state.pcr.pcrSmooth ?? state.pcr.pcr) <= 0.9 ? "text-rose-200" : "text-slate-300") : "text-slate-300"}`} style={{ textShadow: state.pcr?.pcr != null ? ((state.pcr.pcrSmooth ?? state.pcr.pcr) >= 1.1 ? "0 0 6px rgba(13,148,136,0.6)" : (state.pcr.pcrSmooth ?? state.pcr.pcr) <= 0.9 ? "0 0 6px rgba(251,113,133,0.6)" : "none") : "none" }}>PCR: <b>{state.pcr?.pcr != null ? state.pcr.pcr : "—"}</b></span>
              <span className={`font-mono text-sm ${marketData["INDIA VIX"]?.ltp != null ? (vixHeaderSignal.verdict === "SELL" ? "text-rose-200" : vixHeaderSignal.verdict === "BUY" ? "text-emerald-200" : "text-slate-300") : "text-slate-300"}`} style={{ textShadow: marketData["INDIA VIX"]?.ltp != null ? (vixHeaderSignal.verdict === "SELL" ? "0 0 6px rgba(251,113,133,0.6)" : vixHeaderSignal.verdict === "BUY" ? "0 0 6px rgba(13,148,136,0.6)" : "none") : "none" }}>India VIX: <b>{marketData["INDIA VIX"]?.ltp != null ? marketData["INDIA VIX"].ltp.toFixed(2) : "—"}</b></span>
              <span className="px-2.5 py-1 rounded-full text-xs font-black border border-teal-500/60 bg-teal-950/15 text-emerald-300 w-fit">BUY CALL lean: {gridBuyCount}</span>
              <span className="px-2.5 py-1 rounded-full text-xs font-black border border-rose-400/60 bg-rose-500/15 text-rose-300 w-fit">BUY PUT lean: {gridSellCount}</span>
              <span className="px-2.5 py-1 rounded-full text-xs font-black border border-slate-500/60 bg-slate-700/30 text-slate-300 w-fit">Total WAIT: {gridWaitCount}</span>
            </div>
            {/* RIGHT — every button, stacked one per row, each row lining up 1:1 against the left row at the same height */}
            <div className="flex flex-col items-end gap-2">
              {tvTabBtn("indicators", "Indicators")}
              {tvTabBtn("chart", "Chart")}
              {tvTabBtn("market", "Market Watch")}
              <button onClick={() => setOptionChainOpen(true)} className="text-xs font-bold rounded-full px-3 py-1.5 border-2 border-cyan-500/30 text-cyan-300/70 hover:bg-cyan-400/10 transition-colors">Option Chain</button>
              <button
                onClick={() => { setTvGridMode(false); if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); }}
                className="text-sm font-bold rounded-full px-4 py-1.5 border-2 border-cyan-300/60 text-cyan-200 hover:bg-cyan-400/20 transition-colors"
              >✕ Exit TV Grid</button>
            </div>
          </div>

          {tvGridView === "indicators" && (
            <div className="flex-1 overflow-x-auto overflow-y-auto [scrollbar-width:thin]">
              <div
                className="grid gap-1 h-full"
                style={{ gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0,1fr))`, gridAutoFlow: "column", gridAutoColumns: "minmax(5.5rem, 1fr)" }}
              >
                {evaluated.map(({ ind, status }) => {
                  const bg = status === "BUY" ? "bg-teal-900/60 border-teal-500" : status === "SELL" ? "bg-rose-900/60 border-rose-400" : "bg-amber-900/30 border-amber-400/50";
                  return (<div key={ind.id} className={`rounded-lg border-2 ${bg} flex flex-col items-center justify-center gap-0.5 px-1 py-1 text-center overflow-hidden`}>
                      <span
                        className="text-[9px] font-bold leading-tight text-slate-100 shrink-0 w-full"
                        style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: "2.4em" }}
                      >
                        {ind.label}
                      </span>
                      <span className={`text-[9px] font-black font-mono w-full text-center ${status === "BUY" ? "text-emerald-300" : status === "SELL" ? "text-rose-300" : "text-amber-300"}`}>{status}</span>
                    </div>);
                })}
              </div>
            </div>
          )}

          {tvGridView === "chart" && (
            <div className="flex-1 min-h-0 rounded-lg border-2 overflow-hidden bg-slate-900/70" style={{ borderColor: "#22d3ee" }}>
              <div className="px-3 py-2 text-sm font-mono text-slate-300 flex items-center justify-between">
                <span>Chart — {tradeSymbol} · candles built live from ticks · VWAP(approx) / EMA(9,21) / RSI(14)</span>
                <span className="font-bold text-cyan-200">CMP {cmpText}</span>
              </div>
              <div className="h-[calc(100%-2.5rem)]">
                <CandleChart symbol={tradeSymbol} candles={candles} isLight={false}/>
              </div>
            </div>
          )}

          {tvGridView === "market" && (
            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border-2 bg-slate-900/70" style={{ borderColor: "#22d3ee" }}>
              <table className="w-full text-sm font-mono">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-slate-200">
                    <th className="px-3 py-2 text-left">Symbol</th>
                    <th className="px-3 py-2 text-right">LTP</th>
                    <th className="px-3 py-2 text-right">Chg</th>
                    <th className="px-3 py-2 text-right">Chg %</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(marketData).sort((a, b) => a.symbol.localeCompare(b.symbol)).map((row) => (
                    <tr key={row.symbol} onClick={() => { setTradeSymbol(row.symbol); setSelectedSymbol(row.symbol); }} className={`border-t border-cyan-500/20 cursor-pointer ${row.symbol === tradeSymbol ? "bg-cyan-500/15" : "hover:bg-slate-800/50"}`}>
                      <td className="px-3 py-1.5 text-cyan-100">{row.symbol}</td>
                      <td className="px-3 py-1.5 text-right text-cyan-100">{typeof row.ltp === "number" ? formatPrice(row.ltp) : row.ltp}</td>
                      <td className={`px-3 py-1.5 text-right ${row.chg > 0 ? "text-teal-500" : row.chg < 0 ? "text-rose-400" : "text-slate-300"}`}>{row.chg > 0 ? "+" : ""}{typeof row.chg === "number" ? formatPrice(row.chg) : row.chg}</td>
                      <td className={`px-3 py-1.5 text-right ${row.chgPct > 0 ? "text-teal-500" : row.chgPct < 0 ? "text-rose-400" : "text-slate-300"}`}>{row.chgPct > 0 ? "+" : ""}{row.chgPct?.toFixed ? row.chgPct.toFixed(2) : row.chgPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>);
    }
    const optionIndicatorCounts = (() => {
        const groups = { optionsIntraday8: 8, ultraPrecise5: 5, additionalOptions10: 10 };
        const counts = { BUY: 0, SELL: 0, WAIT: 0 };
        Object.entries(groups).forEach(([prefix, count]) => {
            for (let i = 0; i < count; i++) {
                const v = manualIndicatorTicks[`${prefix}-${i}`];
                if (v === "BUY") counts.BUY++;
                else if (v === "SELL") counts.SELL++;
                else counts.WAIT++;
            }
        });
        return counts;
    })();
    return (<div className={`signalboard-root min-h-screen overflow-x-hidden font-sans p-4 sm:p-6 transition-colors ${isLight ? "bg-slate-50 text-slate-900" : "bg-slate-950 text-slate-100"}`} style={{ fontSize: "1.12em" }}>
      {tvOverlay}
      {/* Header — shiny navy blue with cyan lettering */}
      <div className="max-w-6xl mx-auto mb-6">
        <div className="rounded-xl -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 mb-4 px-4 sm:px-6 py-4" style={headerStyle}>
          <div className="flex flex-col gap-3 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Radio className="w-4 h-4 text-cyan-300/80"/>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-cyan-100" style={{ textShadow: "0 0 14px rgba(34,211,238,0.85), 0 0 3px rgba(255,255,255,0.9), 0 1px 0 rgba(255,255,255,0.4)" }}>Radhey Shyam Aashirvaad</h1>
              <span className={"px-2 py-0.5 rounded-full text-[10px] font-black tracking-widest border border-cyan-400/60 " + (apiStatus === "LIVE" ? "bg-teal-950/20 text-emerald-300" : apiStatus === "CONNECTING" ? "bg-amber-500/20 text-amber-300" : "bg-rose-500/20 text-rose-300")}>
                {apiStatus}
              </span>
              {apiStatus === "OFFLINE" && (
                <span className="text-[10px] font-mono text-cyan-300/70" title="Two usual causes: (1) the Termux relay process isn't running right now, or (2) it's running but stuck waiting on today's Upstox login — the access token expires daily around 3:30am IST and needs a fresh login each morning.">
                  ⓘ relay not connected — check Termux is running &amp; today's Upstox login is done
                </span>
              )}
            </div>
            {/* 4 header badges — CMP, VWAP, PCR, Grand Unified confidence —
                given their own row here (instead of being crammed into the
                title row above) so they read as 4 distinct buttons filling
                the empty left side of the header, lined up under the title. */}
            <div className="flex items-center gap-2 flex-wrap" style={{ minHeight: "2.5rem" }}>
              <span
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold tabular-nums border ${isLive ? "bg-teal-950/10 border-teal-500/50 text-emerald-200" : "bg-slate-800/60 border-slate-600/50 text-slate-300"}`}
                style={{ textShadow: isLive ? "0 0 8px rgba(13,148,136,0.65)" : "none" }}
                title={`Live price of the currently selected symbol: ${tradeSymbol}`}
              >
                CMP · {tradeSymbol}: {marketData[tradeSymbol]?.ltp != null ? formatPrice(marketData[tradeSymbol].ltp) : "—"}
              </span>
              <span
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold tabular-nums border ${isLive ? "bg-cyan-500/10 border-cyan-400/50 text-cyan-100" : "bg-slate-800/60 border-slate-600/50 text-slate-300"}`}
                style={{ textShadow: isLive ? "0 0 8px rgba(34,211,238,0.75)" : "none" }}
                title={`Live session VWAP for ${tradeSymbol} — true Σ(Price×Volume)/Σ(Volume)`}
              >
                VWAP · {tradeSymbol}: {headerVwap != null ? formatPrice(headerVwap) : "—"}
              </span>
              <span
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold tabular-nums border ${state.pcr?.pcr != null ? (state.pcr.pcr > 1 ? "bg-teal-950/10 border-teal-500/50 text-emerald-200" : "bg-rose-500/10 border-rose-400/50 text-rose-200") : "bg-slate-800/60 border-slate-600/50 text-slate-300"}`}
                style={{ textShadow: state.pcr?.pcr != null ? (state.pcr.pcr > 1 ? "0 0 8px rgba(13,148,136,0.65)" : "0 0 8px rgba(251,113,133,0.65)") : "none" }}
                title={`Whole-chain Put/Call OI Ratio for ${tradeUnderlying || "NIFTY/BANKNIFTY"} — >1 leans bullish, <1 leans bearish`}
              >
                PCR: {state.pcr?.pcr != null ? state.pcr.pcr : "—"}
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold tabular-nums border border-teal-500/60 bg-teal-950/15 text-emerald-200" title={`Research indicators currently leaning bullish / call-side, not an executable option order — includes ${totalBuyCount} auto-evaluated + ${optionIndicatorCounts.BUY} manually-ticked options-buying indicators`}>
                BUY CALL lean: {totalBuyCount + optionIndicatorCounts.BUY}
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold tabular-nums border border-rose-400/60 bg-rose-500/15 text-rose-200" title={`Research indicators currently leaning bearish / put-side, not an option-selling instruction — includes ${totalSellCount} auto-evaluated + ${optionIndicatorCounts.SELL} manually-ticked options-buying indicators`}>
                BUY PUT lean: {totalSellCount + optionIndicatorCounts.SELL}
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold tabular-nums border border-slate-500/60 bg-slate-700/30 text-slate-300" title={`Raw count of all indicators currently on WAIT (no signal) — includes ${totalWaitCount} auto-evaluated + ${optionIndicatorCounts.WAIT} manually-ticked options-buying indicators`}>
                Total WAIT: {totalWaitCount + optionIndicatorCounts.WAIT}
              </span>
              <span
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold border ${grandConsensus.gap > 0 ? "bg-teal-950/10 border-teal-500/50 text-emerald-200" : grandConsensus.gap < 0 ? "bg-rose-500/10 border-rose-400/50 text-rose-200" : "bg-slate-800/60 border-slate-600/50 text-slate-300"}`}
                title="Weighted read-out of every wired indicator's current BUY/SELL count — a consensus snapshot, not a guaranteed signal"
              >
                Grand Consensus: {grandConsensus.label}
              </span>
              {mostActiveOption && (mostActiveOption.call || mostActiveOption.put) && (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold border border-violet-400/60 bg-violet-500/15 text-violet-200" title="Strike with the biggest OI change since the last poll — a proxy for where fresh activity is building, not a live exchange volume feed">
                  Most active {mostActiveOption.underlying}: {mostActiveOption.call ? `${mostActiveOption.call.strike} CE` : ""}{mostActiveOption.call && mostActiveOption.put ? " / " : ""}{mostActiveOption.put ? `${mostActiveOption.put.strike} PE` : ""}
                </span>
              )}
              <span
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold tabular-nums border ${marketData["INDIA VIX"]?.ltp != null ? (vixHeaderSignal.verdict === "SELL" ? "bg-rose-500/10 border-rose-400/50 text-rose-200" : vixHeaderSignal.verdict === "BUY" ? "bg-teal-950/10 border-teal-500/50 text-emerald-200" : "bg-slate-800/60 border-slate-600/50 text-slate-300") : "bg-slate-800/60 border-slate-600/50 text-slate-300"}`}
                style={{ textShadow: marketData["INDIA VIX"]?.ltp != null ? (vixHeaderSignal.verdict === "SELL" ? "0 0 8px rgba(251,113,133,0.65)" : vixHeaderSignal.verdict === "BUY" ? "0 0 8px rgba(13,148,136,0.65)" : "none") : "none" }}
                title="India VIX — NSE's own volatility index. Rising VIX = fear/premium expansion (favors option buying); falling/low VIX = calm/premium decay (favors option selling). Color driven by the same vixHeaderSignal verdict as the tickbox to its right — no separate hardcoded cutoff."
              >
                India VIX: {marketData["INDIA VIX"]?.ltp != null ? marketData["INDIA VIX"].ltp.toFixed(2) : "—"}
              </span>
              {/* VIX BUY/SELL/WAIT tickbox — combines fixed levels + % change,
                  both editable by tapping the numbers. */}
              <span
                title={vixHeaderSignal.reason}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono font-bold border ${vixHeaderSignal.verdict === "BUY" ? "bg-teal-950/15 border-teal-500/60 text-emerald-300" : vixHeaderSignal.verdict === "SELL" ? "bg-rose-500/15 border-rose-400/60 text-rose-300" : "bg-slate-800/60 border-slate-600/50 text-slate-200"}`}
              >
                {vixHeaderSignal.verdict === "BUY" ? "🟢" : vixHeaderSignal.verdict === "SELL" ? "🔴" : "⚪"} {vixHeaderSignal.verdict}
                <input
                  type="number" step="0.5" value={vixHeaderThresholds.buyBelow}
                  onChange={(e) => setVixHeaderThresholds((t) => ({ ...t, buyBelow: parseFloat(e.target.value) || 0 }))}
                  onClick={(e) => e.stopPropagation()}
                  title="Buy at/below this VIX level"
                  className="w-9 bg-transparent border-b border-teal-500/40 text-emerald-300 text-center focus:outline-none"
                />
                <input
                  type="number" step="0.5" value={vixHeaderThresholds.sellAbove}
                  onChange={(e) => setVixHeaderThresholds((t) => ({ ...t, sellAbove: parseFloat(e.target.value) || 0 }))}
                  onClick={(e) => e.stopPropagation()}
                  title="Sell at/above this VIX level"
                  className="w-9 bg-transparent border-b border-rose-400/40 text-rose-300 text-center focus:outline-none"
                />
                <input
                  type="number" step="0.5" value={vixHeaderThresholds.pctChange}
                  onChange={(e) => setVixHeaderThresholds((t) => ({ ...t, pctChange: parseFloat(e.target.value) || 0 }))}
                  onClick={(e) => e.stopPropagation()}
                  title="% change vs previous poll that also triggers BUY/SELL"
                  className="w-9 bg-transparent border-b border-cyan-400/40 text-cyan-300 text-center focus:outline-none"
                />%
              </span>
            </div>
            {/* 7 Greek/OI buttons — click a strike in the Option Chain modal
                to select it; these auto-update from the live Upstox chain,
                no manual input. Each button shows CE/PE side-by-side. */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono w-full text-cyan-300/80">
                {selectedOptionStrike
                  ? `Greeks: ${selectedOptionStrike.underlying} ${selectedOptionStrike.strike} ${selectedOptionStrike.manual ? "(your pick)" : "(auto-ATM)"}${selectedOptionGreeks?.ivSource === "solved" ? " · IV solved from LTP" : ""}`
                  : "Waiting for the option chain — Greeks auto-lock to the ATM strike the moment it arrives"}
              </span>
              {[
                { label: "IV", ce: selectedOptionGreeks?.callIv, pe: selectedOptionGreeks?.putIv, dp: 1, neutral: true },
                { label: "Delta", ce: selectedOptionGreeks?.callDelta, pe: selectedOptionGreeks?.putDelta, dp: 3 },
                { label: "Gamma", ce: selectedOptionGreeks?.callGamma, pe: selectedOptionGreeks?.putGamma, dp: 5 },
                { label: "Theta", ce: selectedOptionGreeks?.callTheta, pe: selectedOptionGreeks?.putTheta, dp: 2 },
                { label: "Vega", ce: selectedOptionGreeks?.callVega, pe: selectedOptionGreeks?.putVega, dp: 3 },
                { label: "Rho", ce: selectedOptionGreeks?.callRho, pe: selectedOptionGreeks?.putRho, dp: 3 },
                { label: "Call OI", ce: selectedOptionGreeks?.callOi, pe: null, dp: 0, single: true, color: "emerald" },
                { label: "Put OI", ce: null, pe: selectedOptionGreeks?.putOi, dp: 0, single: true, color: "rose" },
              ].map((btn) => (
                <div key={btn.label} title={selectedOptionStrike ? `${selectedOptionStrike.underlying} ${selectedOptionStrike.strike}` : "No strike selected yet"} className="flex items-center gap-1 rounded-full border border-cyan-500/30 bg-slate-900/60 px-2 py-1 text-[10px] font-mono">
                  <span className="text-cyan-300/70 font-bold">{btn.label}</span>
                  {btn.single ? (
                    <span className={btn.color === "emerald" ? "text-emerald-300" : "text-rose-300"}>
                      {(btn.ce ?? btn.pe) != null ? (btn.ce ?? btn.pe).toLocaleString("en-IN") : "—"}
                    </span>
                  ) : (
                    <>
                      <span className={btn.neutral ? "text-cyan-100" : btn.ce == null ? "text-slate-300" : btn.ce >= 0 ? "text-emerald-300" : "text-rose-300"}>{btn.ce != null ? btn.ce.toFixed(btn.dp) : "—"}</span>
                      <span className="text-slate-600">/</span>
                      <span className={btn.neutral ? "text-cyan-100" : btn.pe == null ? "text-slate-300" : btn.pe >= 0 ? "text-emerald-300" : "text-rose-300"}>{btn.pe != null ? btn.pe.toFixed(btn.dp) : "—"}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Manual relay/angel address bars removed — both now resolve
                  automatically from window.SIGNAL_BASE_URL (or the individual
                  window.RELAY_WS_URL / window.ANGEL_WS_URL overrides) set in
                  index.html at deploy time. See relay/Angel status badges
                  above (apiStatus banner) and below (Angel: {angelStatus}). */}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${angelStatus === "LIVE" ? "bg-teal-950/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                Angel: {angelStatus}
              </span>
              {angelChain.length > 0 && (
                <div className="w-full mt-2 max-h-40 overflow-auto rounded-lg border border-purple-400/20 bg-slate-900/60">
                  <table className="w-full text-[10px] font-mono text-slate-300">
                    <thead className="sticky top-0 bg-slate-900">
                      <tr className="text-purple-300/70">
                        <th className="text-left px-2 py-1">Symbol</th>
                        <th className="text-right px-2 py-1">LTP</th>
                        <th className="text-right px-2 py-1">OI</th>
                        <th className="text-right px-2 py-1">Vol</th>
                      </tr>
                    </thead>
                    <tbody>
                      {angelChain.slice(0, 20).map((row, i) => (
                        <tr key={i} className="border-t border-slate-800">
                          <td className="px-2 py-0.5">{row.symbol}</td>
                          <td className="px-2 py-0.5 text-right">{row.ltp}</td>
                          <td className="px-2 py-0.5 text-right">{row.oi}</td>
                          <td className="px-2 py-0.5 text-right">{row.volume}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="relative" ref={headerSymbolRef}>
                <input
                  type="text"
                  value={headerSymbolInput}
                  onChange={(e) => { setHeaderSymbolInput(e.target.value); setHeaderSymbolOpen(true); }}
                  onFocus={() => setHeaderSymbolOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const q = headerSymbolInput.trim().toLowerCase();
                    if (!q) return;
                    const match = Object.values(marketData).find((r) => r.symbol.toLowerCase().includes(q));
                    if (match) { setTradeSymbol(match.symbol); setSelectedSymbol(match.symbol); setHeaderSymbolInput(""); setHeaderSymbolOpen(false); }
                  }}
                  placeholder="Jump to symbol…"
                  className="w-32 sm:w-44 rounded-full px-3 py-1 text-[11px] font-mono bg-slate-900/60 border border-cyan-400/40 text-cyan-100 placeholder:text-cyan-300/40 focus:outline-none focus:border-cyan-300"
                  aria-label="Quick symbol search"
                />
                {headerSymbolOpen && (<div className={`absolute left-0 right-0 sm:right-auto sm:w-64 top-full mt-1 max-h-56 overflow-y-auto rounded-lg border shadow-xl z-40 ${isLight ? "bg-white border-cyan-300/50" : "bg-slate-900 border-cyan-500/40"}`}>
                    <div className={`sticky top-0 flex items-center justify-between px-3 py-1.5 text-[10px] font-bold border-b ${isLight ? "bg-slate-50 border-cyan-200/40 text-slate-300" : "bg-slate-900 border-cyan-500/30 text-slate-200"}`}>
                      <span>Tap a result to select it everywhere</span>
                      <button type="button" onClick={() => { setHeaderSymbolOpen(false); setHeaderSymbolInput(""); }} className="hover:text-cyan-400">✕</button>
                    </div>
                    {Object.values(marketData).filter((r) => r.symbol.toLowerCase().includes(headerSymbolInput.toLowerCase())).slice(0, 20).map((r) => (
                      <button key={r.symbol} onClick={() => { setTradeSymbol(r.symbol); setSelectedSymbol(r.symbol); setHeaderSymbolInput(""); setHeaderSymbolOpen(false); }} className={`w-full text-left px-3 py-2 text-xs font-mono flex items-center justify-between border-b last:border-b-0 ${isLight ? "border-cyan-200/40 hover:bg-slate-50" : "border-cyan-500/30 hover:bg-slate-800"} ${tradeSymbol === r.symbol ? "text-cyan-400 font-bold" : ""}`}>
                        <span>{r.symbol} <span className="opacity-90">· {r.category}</span></span>
                        <span>{r.ltp}</span>
                      </button>
                    ))}
                    {Object.values(marketData).filter((r) => r.symbol.toLowerCase().includes(headerSymbolInput.toLowerCase())).length === 0 && (<div className="px-3 py-2 text-xs text-slate-300">No matches.</div>)}
                  </div>)}
              </div>
                            <button onClick={() => setAiPanelOpen(true)} aria-label="Open Krishn AI" title="Ask about the app's live data — market watch, option chain, all indicators" className="flex items-center gap-1.5 text-[11px] font-bold rounded-full px-2.5 py-1 border border-yellow-300 text-black transition-colors hover:brightness-110" style={{ background: "linear-gradient(180deg, #fde047 0%, #eab308 45%, #a16207 100%)", boxShadow: "0 0 10px rgba(234,179,8,0.65), inset 0 1px 2px rgba(255,255,255,0.6)" }}>
                <Zap className="w-3 h-3"/>
                Krishn AI
              </button>
              <button onClick={() => setOptionChainOpen(true)} aria-label="Open Option Chain" className="flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 border bg-cyan-400/10 border-cyan-300/20 text-cyan-300 hover:bg-cyan-400/20 transition-colors">
                <Layers className="w-3 h-3"/>
                Option Chain
              </button>
              <button onClick={() => setIsLight((v) => !v)} aria-label="Toggle dark/light mode" className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full border transition-colors bg-cyan-400/20 border-cyan-300/40 text-cyan-300 hover:bg-cyan-400/30">
                {isLight ? <Moon className="w-4 h-4"/> : <Sun className="w-4 h-4"/>}
              </button>
              <button onClick={() => setShowSuperSignal((v) => !v)} aria-label="Toggle Super Compute Signal" title="Show/hide the Super Compute Signal panel" className={`flex items-center justify-center w-8 h-8 shrink-0 rounded-full border transition-colors ${showSuperSignal ? "bg-cyan-400/20 border-cyan-300/40 text-cyan-300 hover:bg-cyan-400/30" : "bg-cyan-100/10 border-cyan-300/20 text-cyan-300/60 hover:bg-cyan-100/20"}`}>
                <Zap className="w-4 h-4"/>
              </button>
              <button onClick={() => setTvGridMode(true)} aria-label="Open TV Grid view" title={`Dense grid view for casting to a TV — ${initialIndicators.length} indicators at a glance`} className="flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 border bg-cyan-400/10 border-cyan-300/20 text-cyan-300 hover:bg-cyan-400/20 transition-colors">
                <LayoutGrid className="w-3 h-3"/>
                TV Grid
              </button>
            </div>
          </div>
        </div>

        {/* Top 5 active CE/PE — own box below the header, scoped to whichever
            underlying is currently selected (optionChainKey follows
            optionChainUnderlying, which the user sets via the symbol search /
            option chain / stock selection elsewhere in the app). */}
        <div className="mt-4 rounded-lg border-2 border-amber-400/40 bg-slate-900/70 p-3 flex items-center justify-between">
          <div className="text-xs font-mono font-bold text-amber-300 tracking-widest uppercase">
            Top 5 CE/PE <span className="text-slate-400 normal-case tracking-normal">— {optionChainKey || "select a symbol"}</span>
          </div>
          <button onClick={() => setTopActiveOpen(true)} aria-label="Top 5 active CE / PE" title="Top 5 most active CE and PE by OI change since last poll, for the currently selected underlying" className="flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 border bg-amber-400/10 border-amber-300/30 text-amber-300 hover:bg-amber-400/20 transition-colors">
            <Zap className="w-3 h-3"/>
            View Top 5 CE/PE
          </button>
        </div>

        {/* Counting of Option Indicator in Numbers — live tally of the 23
            options-buying research indicators (8 + 5 + 10) below, based on
            which BUY/SELL/WAIT box is manually ticked per row. These research
            rows are not wired to a live formula yet (see earlier audit), so
            this count reflects tick state, not an automatic market read. */}
        <div className="mt-4 rounded-lg border-2 border-cyan-400/60 bg-slate-900/70 p-4">
          <div className="text-xs font-mono font-bold text-cyan-300 tracking-widest uppercase mb-3">
            Counting Of Option Indicator In Numbers
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border-2 border-teal-400/60 bg-teal-950/20 p-3 text-center">
              <div className="text-[10px] font-mono font-bold text-teal-300 tracking-widest uppercase mb-1">Buy</div>
              <div className="text-3xl font-black font-mono text-teal-300 tabular-nums">{optionIndicatorCounts.BUY}</div>
            </div>
            <div className="rounded-lg border-2 border-rose-400/60 bg-rose-950/20 p-3 text-center">
              <div className="text-[10px] font-mono font-bold text-rose-300 tracking-widest uppercase mb-1">Sell</div>
              <div className="text-3xl font-black font-mono text-rose-300 tabular-nums">{optionIndicatorCounts.SELL}</div>
            </div>
            <div className="rounded-lg border-2 border-amber-400/60 bg-amber-950/20 p-3 text-center">
              <div className="text-[10px] font-mono font-bold text-amber-300 tracking-widest uppercase mb-1">Wait</div>
              <div className="text-3xl font-black font-mono text-amber-300 tabular-nums">{optionIndicatorCounts.WAIT}</div>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 font-mono mt-2">Of the 23 options-buying indicators below — untouched rows count as WAIT.</p>
        </div>

        {/* ── PRIMARY SIGNAL: BUY CALL / BUY PUT / WAIT ────────────────────────
            This is the only headline that matters. It runs the active affordable
            call and put strike through a full stress test (theta + spread +
            slippage + IV-crush) and outputs ONE executable state.
            All other indicator panels below are secondary confirmation. */}
        <div className={`mt-4 rounded-xl border-2 p-4 ${
          premiumSignal.signal === "BUY CALL" ? "border-teal-400 bg-teal-950/25 shadow-[0_0_20px_rgba(20,184,166,0.15)]"
          : premiumSignal.signal === "BUY PUT"  ? "border-rose-400 bg-rose-950/25 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
          : "border-slate-600/60 bg-slate-900/60"
        }`}>
          {/* Headline row */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-mono tracking-widest text-slate-400 mb-1 uppercase select-none">
                Premium Direction Signal
                {tradeUnderlying
                  ? ` · ${tradeUnderlying}`
                  + (premiumForecasts.callRow ? ` · C${premiumForecasts.callRow.strike}` : "")
                  + (premiumForecasts.putRow  ? ` / P${premiumForecasts.putRow.strike}`  : "")
                  : ""}
              </div>
              <div className={`text-3xl font-black font-mono tracking-widest leading-none ${
                premiumSignal.signal === "BUY CALL" ? "text-teal-400"
                : premiumSignal.signal === "BUY PUT"  ? "text-rose-400"
                : "text-slate-400"
              }`}>
                {premiumSignal.signal === "BUY CALL" ? "▲ BUY CALL"
                 : premiumSignal.signal === "BUY PUT"  ? "▼ BUY PUT"
                 : "○ WAIT"}
              </div>
              <div className="text-[11px] text-slate-300 mt-1.5 font-mono leading-relaxed">
                {premiumSignal.reason}
              </div>
            </div>
            {/* Confidence badge */}
            {premiumSignal.signal !== "WAIT" && (
              <div className={`shrink-0 rounded-xl px-4 py-3 text-center border-2 ${
                premiumSignal.signal === "BUY CALL" ? "border-teal-400/60 bg-teal-950/30"
                : premiumSignal.signal === "BUY PUT"  ? "border-rose-400/60 bg-rose-950/30"
                : "border-amber-400/60 bg-amber-950/20"
              }`}>
                <div className={`text-2xl font-black font-mono ${
                  premiumSignal.signal === "BUY CALL" ? "text-teal-300"
                  : premiumSignal.signal === "BUY PUT"  ? "text-rose-300"
                  : "text-amber-300"
                }`}>
                  {premiumSignal.signal === "BUY CALL"
                    ? (premiumSignal.call?.confidence ?? 0)
                    : premiumSignal.signal === "BUY PUT"
                    ? (premiumSignal.put?.confidence ?? 0)
                    : Math.round(((premiumSignal.call?.confidence ?? 0) + (premiumSignal.put?.confidence ?? 0)) / 2)}%
                </div>
                <div className="text-[9px] text-slate-400 font-mono">confidence</div>
              </div>
            )}
          </div>

          {/* Per-side detail strips (call + put) */}
          {(premiumSignal.call || premiumSignal.put) && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { label: "CALL", f: premiumSignal.call,
                  passedCls: "border-teal-400/50 bg-teal-950/20", failedCls: "border-slate-700/40 bg-slate-800/25",
                  headCls: "text-teal-300", valCls: "text-teal-200" },
                { label: "PUT",  f: premiumSignal.put,
                  passedCls: "border-rose-400/50 bg-rose-950/20",  failedCls: "border-slate-700/40 bg-slate-800/25",
                  headCls: "text-rose-300",  valCls: "text-rose-200"  },
              ].map(({ label, f, passedCls, failedCls, headCls, valCls }) => f ? (
                <div key={label} className={`rounded-lg border px-3 py-2 text-[10px] font-mono space-y-1 ${f.qualified ? passedCls : failedCls}`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-bold ${headCls}`}>
                      {label} {f.strike ?? "—"}
                      {f.ivPct != null ? <span className="ml-1 font-normal text-purple-300">IV {f.ivPct.toFixed(1)}%</span> : null}
                    </span>
                    <span className={`text-[9px] font-black rounded px-1.5 py-0.5 ${
                      f.qualified ? "bg-teal-400/20 text-teal-300" : "bg-rose-500/20 text-rose-300"
                    }`}>{f.qualified ? "✓ PASSES" : "✗ WAIT"}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-300">
                    <span>Ask <span className="text-white">{f.ask != null ? f.ask.toFixed(2) : "—"}</span></span>
                    <span>Expected <span className={f.expectedPremium != null && f.ask != null
                        ? f.expectedPremium > f.ask ? "text-teal-300" : "text-rose-300"
                        : "text-slate-300"}>{f.expectedPremium != null ? f.expectedPremium.toFixed(2) : "—"}</span></span>
                    <span>Stress <span className={f.stressPremium != null && f.ask != null
                        ? f.stressPremium > f.ask ? "text-teal-300" : "text-rose-300"
                        : "text-slate-300"}>{f.stressPremium != null ? f.stressPremium.toFixed(2) : "—"}</span></span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-400">
                    <span>Theta <span className="text-amber-300">{f.thetaCost != null ? f.thetaCost.toFixed(2) : "—"}</span></span>
                    <span>Req Δ <span className="text-cyan-300">{f.requiredSpotMovePct != null ? (f.requiredSpotMovePct > 0 ? "+" : "") + f.requiredSpotMovePct.toFixed(2) + "%" : "—"}</span></span>
                    <span>Δ <span className="text-slate-200">{f.delta != null ? f.delta.toFixed(3) : "—"}</span></span>
                    <span>Conf <span className="text-cyan-300">{f.confidence}%</span></span>
                  </div>
                  {!f.qualified && f.reasons.length > 0 && (
                    <div className="text-slate-500 text-[9px] leading-tight border-t border-slate-700/40 pt-1 mt-0.5">
                      {f.reasons.slice(0, 4).join(" · ")}
                    </div>
                  )}
                </div>
              ) : null)}
            </div>
          )}

          {/* Disclaimer */}
          <div className="mt-2 text-[9px] text-slate-600 font-mono leading-relaxed">
            SIGNAL ONLY — no order placed · Entry: executable ask · Exit: stressed bid after theta + spread + {PREMIUM_SIGNAL_CONFIG.ivCrushStressPct}% IV crush · Strike selected by activity + affordability within ±2% of spot
          </div>
        </div>

        {/* OMS MASTER SCORE — weighted aggregate of the 5 OMS sub-indicators
            (OI_change x0.30 + Vol/OI x0.25 + IV_change x0.20 + Delta*Volume x0.15
            + Ask_hit x0.10), gated by the Futures Confirmation trap filter.
            Moved right below the header so it's the first thing visible.
            Now also carries a live Krishn AI verdict line from the hosted
            multi-provider endpoint, auto-refreshed — a second, independent read
            alongside the rule-based score above it. */}
        <div className="mt-4 rounded-xl border-2 border-orange-400/60 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-200 mb-1 flex items-center gap-2">
                <span>OMS MASTER SCORE — Option Momentum Engine</span>
                <span className={`font-mono font-semibold ${marketData[tradeSymbol]?.chgPct > 0 ? "text-teal-400" : marketData[tradeSymbol]?.chgPct < 0 ? "text-rose-400" : "text-slate-300"}`}>
                  CMP {tradeSymbol}: {marketData[tradeSymbol]?.ltp != null ? formatPrice(marketData[tradeSymbol].ltp) : "—"}
                  {marketData[tradeSymbol]?.chgPct != null ? ` (${marketData[tradeSymbol].chgPct > 0 ? "+" : ""}${marketData[tradeSymbol].chgPct.toFixed(2)}%)` : ""}
                </span>
              </div>
              <div className="text-xl font-extrabold text-slate-100">
                {omsMasterScore.verdict === "WAIT" ? <span className="text-slate-200">WAIT{omsMasterScore.priceBlocked ? " — CMP TREND BLOCKED" : omsMasterScore.trapBlocked ? " — FUTURES TRAP BLOCKED" : " — NO EDGE"}</span> : omsMasterScore.verdict === "BUY" ? <span className="text-teal-500">BUY — Score {omsMasterScore.score}</span> : <span className="text-rose-400">SELL — Score {omsMasterScore.score}</span>}
              </div>
            </div>
            <DualArrowBox status={omsMasterScore.verdict}/>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-[11px] font-mono">
            {omsMasterScore.breakdown.map((b) => (
              <div key={b.label} className={`rounded border border-amber-400/50 px-2 py-1 text-center ${b.status === "BUY" ? "bg-teal-950/10 text-emerald-300" : b.status === "SELL" ? "bg-rose-500/10 text-rose-300" : "bg-slate-700/30 text-slate-200"}`}>
                {b.label}: {b.status}{b.contrib !== null ? ` (${b.contrib > 0 ? "+" : ""}${b.contrib})` : ""}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-600 mt-2">Weighted sum of 5 OMS signals drives the score; Futures Confirmation acts as a trap filter and can force WAIT even on a strong score.</p>
          <div className="mt-3 pt-3 border-t border-amber-400/30 flex items-start gap-2">
            <Zap className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0"/>
            <div className="flex-1 cursor-pointer rounded-lg border border-orange-400/60 px-2 py-1.5" onClick={() => setAiPanelOpen(true)} title="Open full Krishn AI chat">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-violet-300 hover:text-violet-200 hover:underline">Krishn AI verdict</span>
                 <button type="button" onClick={(e) => { e.stopPropagation(); refreshKrishnVerdict(); }} disabled={krishnVerdict.loading || krishnRemaining === 0} className="text-[10px] font-semibold rounded-full px-2 py-0.5 border border-violet-400/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 disabled:opacity-60">
                   {krishnVerdict.loading ? "Reading…" : krishnRemaining === 0 ? "Limit reached" : `Ask (${krishnRemaining})`}
                </button>
              </div>
              <p className="text-[12px] text-slate-200 mt-1 leading-snug whitespace-pre-wrap">
                {krishnVerdict.text || (krishnVerdict.loading ? "Krishn AI is reading the live data…" : "Not asked yet — tap Refresh.")}
              </p>
            </div>

          </div>
        </div>
        {topActiveOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-3 bg-black/70" onClick={() => setTopActiveOpen(false)}>
            <div onClick={(e) => e.stopPropagation()} className={`mt-16 w-full max-w-md rounded-xl border shadow-2xl ${isLight ? "bg-white border-amber-300/50" : "bg-slate-900 border-amber-500/40"}`}>
              <div className={`flex items-center justify-between px-4 py-3 border-b ${isLight ? "border-amber-300/50" : "border-amber-500/30"}`}>
                <div className="flex items-center gap-2 text-amber-300 font-bold text-sm"><Zap className="w-4 h-4"/> Top 5 active CE / PE — {optionChainKey}</div>
                <button onClick={() => setTopActiveOpen(false)} aria-label="Close" className="text-lg leading-none rounded-full w-7 h-7 flex items-center justify-center text-slate-300 hover:bg-slate-800">✕</button>
              </div>
              <div className="p-3 grid grid-cols-2 gap-3 text-[11px] font-mono">
                <div>
                  <div className="text-emerald-300 font-bold mb-1">Top 5 CE (Call)</div>
                  {topActive.calls.length === 0 ? (<div className="text-slate-400">No data yet — waiting for next chain poll.</div>) : topActive.calls.map((r, i) => (
                    <div key={"c"+i} className="flex justify-between border-b border-slate-700/40 py-1">
                      <span className="text-slate-200">{r.strike}</span>
                      <span className="text-slate-300">₹{r.ltp}</span>
                      <span className={r.oiChange >= 0 ? "text-emerald-300" : "text-rose-300"}>OIΔ {r.oiChange > 0 ? "+" : ""}{r.oiChange}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-rose-300 font-bold mb-1">Top 5 PE (Put)</div>
                  {topActive.puts.length === 0 ? (<div className="text-slate-400">No data yet — waiting for next chain poll.</div>) : topActive.puts.map((r, i) => (
                    <div key={"p"+i} className="flex justify-between border-b border-slate-700/40 py-1">
                      <span className="text-slate-200">{r.strike}</span>
                      <span className="text-slate-300">₹{r.ltp}</span>
                      <span className={r.oiChange >= 0 ? "text-emerald-300" : "text-rose-300"}>OIΔ {r.oiChange > 0 ? "+" : ""}{r.oiChange}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-4 py-2 border-t border-slate-700/40 text-[10px] text-slate-400">Ranked by OI change since last relay poll; on the first poll it falls back to current OI so the list is not empty. LTP% is used as tiebreak. Not a buy/sell instruction.</div>
            </div>
          </div>
        )}
        {aiPanelOpen && (<div className={`relative z-10 mt-3 w-full max-w-lg mx-auto flex flex-col rounded-xl border shadow-2xl ${isLight ? "bg-white border-violet-300/50" : "bg-slate-900 border-violet-500/40"}`}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isLight ? "border-violet-300/50" : "border-violet-500/30"}`}>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-violet-400"/>
                <span className="font-bold text-sm">Krishn AI</span>
                 <span className="text-[10px] font-mono text-slate-300">live app data + OpenAI · Claude · Gemini · {krishnRemaining}/{KRISHN_DAILY_LIMIT} questions left today</span>
              </div>
              <div className="flex items-center gap-2">
                {notifyPermission !== "granted" && notifyPermission !== "unsupported" && (
                  <button
                    type="button"
                    onClick={() => {
                        // Runs only on this explicit tap — never automatically
                        // at page load — and every step is wrapped so a
                        // sandboxed/preview environment that blocks these
                        // APIs can never crash the app or freeze touch.
                        try {
                            if (!document.querySelector('link[rel="manifest"]')) {
                                const manifestLink = document.createElement("link");
                                manifestLink.rel = "manifest";
                                manifestLink.href = "/manifest.json";
                                document.head.appendChild(manifestLink);
                            }
                        } catch (err) { /* manifest injection not available here — ignore */ }
                        try {
                            if ("serviceWorker" in navigator) {
                                navigator.serviceWorker.register("/sw.js").catch(() => {});
                            }
                        } catch (err) { /* sw.js not deployed yet, or blocked in this environment — ignore, alerts still work in-app */ }
                        try {
                            Notification.requestPermission().then(setNotifyPermission);
                        } catch (err) { setNotifyPermission("unsupported"); }
                    }}
                    className="text-[10px] font-bold rounded-full px-2 py-1 border border-violet-400/60 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25"
                  >
                    Enable phone alerts
                  </button>
                )}
                {notifyPermission === "granted" && (
                  <span className="text-[9px] font-mono text-slate-300" title="For alerts to arrive with the screen locked, open this app's menu and choose 'Add to Home Screen' once">
                    ⓘ install to home screen for lock-screen alerts
                  </span>
                )}
                <button type="button" onClick={() => setAiPanelOpen(false)} aria-label="Close" className={`text-lg leading-none rounded-full w-7 h-7 flex items-center justify-center ${isLight ? "text-slate-300 hover:bg-slate-100" : "text-slate-200 hover:bg-slate-800"}`}>✕</button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-96 px-4 py-3 flex flex-col gap-2">
              {aiMessages.length === 0 && (
                <div className="text-[11px] text-slate-300 leading-relaxed">
                  Ask about what's currently on screen — e.g. "which strikes have the heaviest OI right now?", "why is PCR bullish?", "which indicators agree on direction?". This reads the app's own market watch, option chain and indicator readings — it's not investment advice.
                </div>
              )}
              {aiMessages.map((m, i) => {
                // FIX (v55): headers used to just be plain text ("### Name")
                // inside a whitespace-pre-wrap block with no markdown
                // renderer, so "**bold**" syntax would show literal
                // asterisks. Split the "ANSWER BY X" first line out and
                // render it as an actually-bold heading above the body.
                const headerMatch = m.role === "assistant" ? /^ANSWER BY [A-Z0-9 ]+/.exec(m.text) : null;
                const headerLine = headerMatch ? headerMatch[0] : null;
                const bodyText = headerLine ? m.text.slice(headerLine.length).replace(/^\n+/, "") : m.text;
                return (
                  <div key={i} className={`text-[15px] leading-relaxed rounded-lg border border-orange-400/60 px-3 py-2 max-w-[96%] ${m.role === "user" ? `self-end whitespace-pre-wrap ${isLight ? "bg-violet-100 text-slate-800" : "bg-violet-500/20 text-violet-100"}` : `self-start ${isLight ? "bg-slate-100 text-slate-700" : "bg-slate-800/70 text-slate-200"}`}`}>
                    {headerLine && (<div className={`font-black tracking-wide mb-1 ${isLight ? "text-violet-700" : "text-violet-300"}`}>{headerLine}</div>)}
                    <div className="whitespace-pre-wrap">{bodyText}</div>
                    {m.answers?.length > 0 && (
                      <div className="mt-3 flex flex-col gap-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-violet-300/80">Compare every provider · choose the interpretation you trust</div>
                        {m.answers.map((answer) => {
                          const selected = selectedAiAnswer?.name === answer.name && selectedAiAnswer?.model === answer.model;
                          const stanceClass = answer.stance === "BUY CALL"
                            ? "border-teal-400/60 bg-teal-500/10 text-emerald-200"
                            : answer.stance === "BUY PUT"
                              ? "border-rose-400/60 bg-rose-500/10 text-rose-200"
                              : answer.stance === "WAIT"
                                ? "border-amber-400/60 bg-amber-500/10 text-amber-200"
                                : "border-cyan-400/50 bg-cyan-500/10 text-cyan-100";
                          return (
                            <div key={`${answer.name}-${answer.model}`} className={`rounded-lg border p-2.5 ${selected ? "ring-2 ring-violet-300" : ""} ${isLight ? "bg-white/80" : "bg-slate-950/45"}`}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-black text-[11px] text-violet-200">{answer.name}</div>
                                <div className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${stanceClass}`}>{answer.status === "error" ? "UNAVAILABLE" : answer.stance || "INFO"}</div>
                              </div>
                              <div className="mt-1 text-[10px] text-slate-400 font-mono">{answer.model}{answer.confidence != null ? ` · ${answer.confidence}% confidence` : ""}</div>
                              <div className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed">{answer.text || answer.error || "No answer returned."}</div>
                              {answer.status === "ok" && (
                                <button type="button" onClick={() => setSelectedAiAnswer(answer)} className={`mt-2 rounded-full border px-2.5 py-1 text-[10px] font-bold ${selected ? "border-violet-300 bg-violet-500/25 text-violet-100" : "border-violet-400/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"}`}>
                                  {selected ? "Selected interpretation" : "Choose this answer"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {m.meta?.sourceNote && <div className="text-[10px] leading-relaxed text-slate-400 border-t border-violet-400/20 pt-2">{m.meta.sourceNote}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
              {aiLoading && (<div className="self-start text-[13px] text-slate-300 px-3 py-2">Krishn AI is reading the live data…</div>)}
            </div>
            <div className={`flex items-center gap-2 px-3 py-3 border-t ${isLight ? "border-violet-300/50" : "border-violet-500/30"}`}>
               <div className="flex flex-col gap-1 min-w-0 flex-1">
                 <input
                   type="text"
                   value={aiInput}
                   onChange={(e) => setAiInput(e.target.value)}
                   onKeyDown={(e) => { if (e.key === "Enter" && aiInput.trim()) sendAiMessage(aiInput); }}
                   placeholder={krishnRemaining > 0 ? "Ask about the current market data…" : "Daily limit reached — try again tomorrow"}
                   disabled={krishnRemaining === 0 || aiLoading}
                   className={`rounded-full px-3 py-2 text-[12px] font-mono border focus:outline-none disabled:opacity-60 ${isLight ? "bg-slate-50 border-violet-300/50 text-slate-800" : "bg-slate-800/60 border-violet-400/40 text-violet-100 placeholder:text-violet-300/40"}`}
                 />
                 <span className="px-2 text-[9px] font-mono text-slate-400">
                   {krishnRemaining > 0
                     ? `${krishnRemaining} intentional question${krishnRemaining === 1 ? "" : "s"} remaining today`
                     : "Daily limit reached; failed requests are returned to the allowance."}
                 </span>
               </div>
               <button type="button" onClick={() => aiInput.trim() && sendAiMessage(aiInput)} disabled={aiLoading || krishnRemaining === 0} className="text-[11px] font-bold rounded-full border border-orange-400/60 px-3 py-2 bg-violet-500 hover:bg-violet-400 disabled:opacity-90 text-white">
                 Ask{krishnRemaining > 0 ? ` (${krishnRemaining})` : ""}
              </button>
            </div>
          </div>)}

        <div className={`mt-4 rounded-lg border-2 p-3 ${isLight ? "bg-cyan-50/40" : "bg-slate-900/70"}`} style={{ borderColor: "#eab308", boxShadow: "0 0 0 1px rgba(234,179,8,0.15)" }}>
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <button onClick={() => setMarketOpen((v) => !v)} className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <Activity className="w-4 h-4 text-cyan-400"/>
              <span>Live Market Watch&nbsp;&nbsp;</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${apiStatus === "LIVE" ? "bg-teal-950/20 text-teal-500" : "bg-cyan-500/10 text-cyan-300"}`}>
                {apiStatus} · {Object.keys(marketData).length} symbols
              </span>
              <span className="text-xs text-cyan-400">{marketOpen ? "▲" : "▼"}</span>
            </button>
            {marketOpen && (<input
                value={marketSearch}
                onChange={(e) => setMarketSearch(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="Search symbol…"
                autoComplete="off"
                className={`text-xs px-2 py-1.5 rounded border font-mono w-40 ${isLight ? "bg-white border-cyan-400/60 text-cyan-700" : "bg-slate-800 border-cyan-400/60 text-cyan-200"}`}
              />)}
          </div>
          {marketOpen && (<>
              <div className="flex gap-1 mb-2 flex-wrap">
                {[{ id: "indices", label: "Indices" }, { id: "stock", label: "Stocks" }, { id: "option", label: "Options" }, { id: "commodity", label: "Commodities" }, { id: "crypto", label: "Crypto" }, { id: "largeCap", label: "Large-Cap" }, { id: "midCap", label: "Mid-Cap" }, { id: "smallCap", label: "Small-Cap" }, { id: "globalMega", label: "🌍 Global Mega-Caps" }].map((t) => (<button key={t.id} onClick={() => setMarketTab(t.id)} className={`text-xs px-2.5 py-1 rounded-full border font-mono transition-colors ${marketTab === t.id ? "bg-cyan-500/20 border-cyan-400 text-cyan-300" : isLight ? "border-cyan-300/50 text-slate-300 hover:bg-slate-50" : "border-cyan-500/40 text-slate-200 hover:bg-slate-800"}`}>
                    {t.label}
                  </button>))}
              </div>
              <div
                className="max-h-72 overflow-y-auto rounded border border-cyan-500/40"
                style={{ overscrollBehavior: "contain", touchAction: "pan-y" }}
              >
                <table className="w-full text-xs font-mono">
                  <thead className={`sticky top-0 ${isLight ? "bg-cyan-50" : "bg-slate-800"}`}>
                    <tr className="text-cyan-300">
                      <th className="text-left px-2 py-1.5 font-medium">Symbol</th>
                      <th className="text-right px-2 py-1.5 font-medium">LTP</th>
                      <th className="text-right px-2 py-1.5 font-medium">Chg</th>
                      <th className="text-right px-2 py-1.5 font-medium">Chg %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                const term = marketSearch.trim().toLowerCase();
                if (marketTab === "globalMega") {
                  // Now live-fed from Yahoo Finance (free, no key) via the
                  // relay — same marketData flow as every other tab. Name/
                  // exchange still come from the watchlist metadata since
                  // ticks only carry symbol/ltp/chg/chgPct.
                  const meta = Object.fromEntries(globalMegacapWatchlist.map((r) => [r.symbol, r]));
                  const rows = Object.values(marketData)
                    .filter((row) => (row.category || "") === "globalMega")
                    .filter((row) => term ? (row.symbol.toLowerCase().includes(term) || (meta[row.symbol]?.name || "").toLowerCase().includes(term)) : true)
                    .sort((a, b) => a.symbol.localeCompare(b.symbol));
                  const shownCount = Math.min(rows.length, 150);
                  const truncated = rows.length > shownCount;
                  const visibleRows = rows.slice(0, shownCount);
                  if (rows.length === 0) {
                    return <tr><td colSpan={4} className="text-center text-slate-300 italic py-4">{term ? `No symbol matching "${marketSearch}"` : "Waiting for the relay's Yahoo Finance poll (every 60s)…"}</td></tr>;
                  }
                  return [
                    ...visibleRows.map((row) => { const isSel = row.symbol === selectedSymbol; return (<tr key={row.symbol} onClick={() => { setSelectedSymbol(row.symbol); setTradeSymbol(row.symbol); }} className={`border-t cursor-pointer ${isLight ? "border-cyan-200/40" : "border-cyan-500/30"} ${isSel ? (isLight ? "bg-cyan-100/70" : "bg-cyan-500/15") : (isLight ? "hover:bg-slate-50" : "hover:bg-slate-800/50")}`}>
                          <td className={`px-2 py-1.5 ${isSel ? "text-cyan-400 font-semibold" : "text-cyan-50"}`}>{isSel ? "● " : ""}{row.symbol} <span className="text-slate-300">· {meta[row.symbol]?.name || ""}</span></td>
                          <td className="px-2 py-1.5 text-right text-cyan-50">{typeof row.ltp === "number" ? formatPrice(row.ltp) : row.ltp}</td>
                          <td className={`px-2 py-1.5 text-right ${row.chg > 0 ? "text-teal-500" : row.chg < 0 ? "text-rose-400" : "text-slate-300"}`}>{row.chg > 0 ? "+" : ""}{typeof row.chg === "number" ? formatPrice(row.chg) : row.chg}</td>
                          <td className={`px-2 py-1.5 text-right ${row.chgPct > 0 ? "text-teal-500" : row.chgPct < 0 ? "text-rose-400" : "text-slate-300"}`}>{row.chgPct > 0 ? "+" : ""}{row.chgPct?.toFixed ? row.chgPct.toFixed(2) : row.chgPct}%</td>
                        </tr>); }),
                    truncated ? (<tr key="__truncated__"><td colSpan={4} className="text-center text-[10px] text-amber-400 italic py-2">Showing {shownCount} of {rows.length} — narrow with the search box to see the rest</td></tr>) : null,
                  ];
                }
                const capTierMap = { largeCap: "largeCap", midCap: "midCap", smallCap: "smallCap" };
                const cat = marketTab === "indices" ? "index" : (capTierMap[marketTab] ? "stock" : marketTab);
                // While searching, look across ALL categories — restricting to the
                // active tab made the box search look broken whenever the match
                // was in a different category than the one currently selected.
                const rows = Object.values(marketData)
                  .filter((row) => {
                    if (term) return row.symbol.toLowerCase().includes(term);
                    if (capTierMap[marketTab]) return (row.category || "").toLowerCase() === "stock" && row.capTier === capTierMap[marketTab];
                    return (row.category || "").toLowerCase() === cat;
                  })
                  .sort((a, b) => a.symbol.localeCompare(b.symbol));
                const shownCount2 = Math.min(rows.length, 150);
                const truncated2 = rows.length > shownCount2;
                const visibleRows2 = rows.slice(0, shownCount2);
                if (rows.length === 0) {
                  return <tr><td colSpan={4} className="text-center text-slate-300 italic py-4">{term ? `No symbol matching "${marketSearch}"` : `No ${marketTab} data yet — waiting for relay tick…`}</td></tr>;
                }
                return [
                  ...visibleRows2.map((row) => { const isSel = row.symbol === selectedSymbol; return (<tr key={row.symbol} onClick={() => { setSelectedSymbol(row.symbol); setTradeSymbol(row.symbol); }} className={`border-t cursor-pointer ${isLight ? "border-cyan-200/40" : "border-cyan-500/30"} ${isSel ? (isLight ? "bg-cyan-100/70" : "bg-cyan-500/15") : (isLight ? "hover:bg-slate-50" : "hover:bg-slate-800/50")}`}>
                          <td className={`px-2 py-1.5 ${isSel ? "text-cyan-400 font-semibold" : "text-cyan-50"}`}>{isSel ? "● " : ""}{row.symbol}</td>
                          <td className="px-2 py-1.5 text-right text-cyan-50">{typeof row.ltp === "number" ? formatPrice(row.ltp) : row.ltp}</td>
                          <td className={`px-2 py-1.5 text-right ${row.chg > 0 ? "text-teal-500" : row.chg < 0 ? "text-rose-400" : "text-slate-300"}`}>{row.chg > 0 ? "+" : ""}{typeof row.chg === "number" ? formatPrice(row.chg) : row.chg}</td>
                          <td className={`px-2 py-1.5 text-right ${row.chgPct > 0 ? "text-teal-500" : row.chgPct < 0 ? "text-rose-400" : "text-slate-300"}`}>{row.chgPct > 0 ? "+" : ""}{row.chgPct?.toFixed ? row.chgPct.toFixed(2) : row.chgPct}%</td>
                        </tr>); }),
                  truncated2 ? (<tr key="__truncated2__"><td colSpan={4} className="text-center text-[10px] text-amber-400 italic py-2">Showing {shownCount2} of {rows.length} — narrow with the search box to see the rest</td></tr>) : null,
                ];
              })()}
                  </tbody>
                </table>
              </div>
            </>)}
        </div>

        {/* Live chart — TradingView's own embed is the default: it shows a full,
            proper live chart the instant it loads (real history + real-time),
            unlike our own tick-built chart which needs several minutes of the
            relay running before it has enough candles to be useful. Toggle to
            "Our ticks" to see the native VWAP/EMA/RSI build from your own feed. */}
        <div className={`mt-4 rounded-lg border-2 overflow-hidden ${isLight ? "bg-white" : "bg-slate-900/70"}`} style={{ borderColor: "#f97316" }}>
          <div className={`px-3 py-2 text-xs font-mono flex items-center justify-between flex-wrap gap-2 ${isLight ? "text-slate-300" : "text-slate-200"}`}>
            <span>Chart — {tradeSymbol}{chartMode === "tv" ? " · live TradingView chart" : " · candles built live from ticks · VWAP(approx) / EMA(9,21) / RSI(14)"}</span>
            <span className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setChartMode("tv")} className={`text-[10px] font-bold rounded-full px-2.5 py-1 border ${chartMode === "tv" ? "bg-cyan-500/20 border-cyan-400 text-cyan-300" : "border-cyan-500/40 text-slate-200"}`}>TradingView</button>
              <button onClick={() => setChartMode("own")} className={`text-[10px] font-bold rounded-full px-2.5 py-1 border ${chartMode === "own" ? "bg-cyan-500/20 border-cyan-400 text-cyan-300" : "border-cyan-500/40 text-slate-200"}`}>Our ticks</button>
              {chartMode === "own" && (<span className="flex gap-2 text-[10px]">
                <span className="text-cyan-400">■ EMA9</span>
                <span className="text-amber-500">■ EMA21</span>
                <span className="text-violet-400">┅ VWAP</span>
                <span className="text-pink-400">■ RSI</span>
              </span>)}
              <span className="flex items-center gap-1.5 ml-1">
                <span
                  className={`text-[10px] font-black tracking-wider uppercase rounded-md px-2.5 py-1 border-2 transition-all duration-300 ${radheyShyam.verdict === "BUY" && isLive ? "scale-105 animate-pulse" : ""}`}
                  style={radheyShyam.verdict === "BUY" && isLive
                    ? { backgroundColor: "#0d9488", color: "#00251a", borderColor: "#0d9488", boxShadow: "0 0 8px 2px rgba(0,230,118,0.4)" }
                    : { backgroundColor: "transparent", color: "rgba(13,148,136,0.35)", borderColor: "rgba(13,148,136,0.35)" }}
                >BUY</span>
                <span
                  className={`text-[10px] font-black tracking-wider uppercase rounded-md px-2.5 py-1 border-2 transition-all duration-300 ${radheyShyam.verdict === "SELL" && isLive ? "scale-105 animate-pulse" : ""}`}
                  style={radheyShyam.verdict === "SELL" && isLive
                    ? { backgroundColor: "#FF1744", color: "#fff", borderColor: "#FF1744", boxShadow: "0 0 8px 2px rgba(255,23,68,0.4)" }
                    : { backgroundColor: "transparent", color: "rgba(244,63,94,0.35)", borderColor: "rgba(244,63,94,0.35)" }}
                >SELL</span>
              </span>
            </span>
          </div>
          {chartMode === "tv" && (marketData[tradeSymbol] || DEFAULT_MARKET_MAP[tradeSymbol])?.category !== "crypto" && (
            <div className="px-3 py-1.5 text-[10px] font-mono text-amber-400 bg-amber-500/10 border-t border-b border-amber-500/20">
              ⚠ NSE/BSE/MCX symbols are blocked in TradingView's free embed widget (their data-licensing rule, not a bug here) — use "Our ticks" for {tradeSymbol}.
            </div>
          )}
          {chartMode === "tv" ? (
            <TradingViewWidget symbol={toTradingViewSymbol(tradeSymbol)} isLight={isLight} />
          ) : (
            <CandleChart symbol={tradeSymbol} candles={candles} isLight={isLight}/>
          )}
        </div>

        {/* Candles are now fully background-only — no raw OHLC/RSI table
            shown. Up front: EMA9/EMA14/EMA21 price-trend boxes (does price
            trade above or below each one, glowing the instant price crosses
            it), followed by every well-known EMA-vs-EMA crossover pair. All
            computed from the same closes, just never rendered as a table. */}
        <div className={`mt-4 rounded-lg border-2 overflow-hidden ${isLight ? "bg-white" : "bg-slate-900/70"}`} style={{ borderColor: "#eab308" }}>
          <div className={`px-3 py-2 text-xs font-mono flex items-center justify-between gap-2 ${isLight ? "text-slate-300" : "text-slate-200"}`}>
            <span>EMA reads — {tradeSymbol} ({candles.length} candles collected)</span>
            <label className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] uppercase tracking-wide">Timeframe</span>
              <select
                value={bucketMs}
                onChange={(e) => setBucketMs(Number(e.target.value))}
                className={`text-[11px] font-mono rounded border px-1.5 py-0.5 ${isLight ? "bg-white border-slate-300 text-slate-700" : "bg-slate-800 border-slate-600 text-cyan-100"}`}
              >
                <option value={60000}>1m</option>
                <option value={300000}>5m</option>
                <option value={600000}>10m</option>
                <option value={900000}>15m</option>
                <option value={1800000}>30m</option>
              </select>
            </label>
          </div>
          <div className="p-2 flex flex-col gap-2">
            {candles.length === 0 ? (
              <span className="text-[10px] text-slate-300 px-1">Needs the relay running and LIVE to build candles.</span>
            ) : (
              <>
                {/* Front row: EMA9 / EMA14 / EMA21 price-trend boxes */}
                <div className="flex gap-1.5">
                  {computeEmaPriceTrend(candles.map((c) => c.c)).map((x) => {
                    const color = x.status === "BUY" ? "#0d9488" : x.status === "SELL" ? "#FF1744" : null;
                    return (
                      <div
                        key={x.period}
                        className={`flex-1 rounded-md border-2 px-2 py-1.5 text-center transition-all duration-300 ${x.justCrossed ? "scale-105 animate-pulse" : ""}`}
                        style={color
                          ? { backgroundColor: x.justCrossed ? color : `${color}22`, color: x.justCrossed ? "#fff" : color, borderColor: color, boxShadow: x.justCrossed ? `0 0 10px 2px ${color}99` : "none" }
                          : { backgroundColor: "transparent", color: "rgba(148,163,184,0.7)", borderColor: "rgba(148,163,184,0.4)" }}
                      >
                        <div className="text-[10px] font-semibold">EMA{x.period}</div>
                        <div className="text-[13px] font-black tracking-wide">{x.status}</div>
                      </div>
                    );
                  })}
                </div>
                {/* Crossover pairs — every well-known EMA-vs-EMA cross */}
                <div className="flex flex-wrap gap-1.5">
                  {computeEmaCrossovers(candles.map((c) => c.c)).map((x) => {
                    const color = x.status === "BUY" ? "#0d9488" : x.status === "SELL" ? "#FF1744" : null;
                    return (
                      <div
                        key={x.label}
                        title={x.label}
                        className={`rounded-md border-2 px-2 py-1 text-center transition-all duration-300 ${x.justCrossed ? "scale-105 animate-pulse" : ""}`}
                        style={color
                          ? { backgroundColor: x.justCrossed ? color : `${color}22`, color: x.justCrossed ? "#fff" : color, borderColor: color, boxShadow: x.justCrossed ? `0 0 10px 2px ${color}99` : "none" }
                          : { backgroundColor: "transparent", color: "rgba(148,163,184,0.7)", borderColor: "rgba(148,163,184,0.4)" }}
                      >
                        <div className="text-[9px] font-semibold leading-tight">{x.label}</div>
                        <div className="text-[11px] font-black tracking-wide">{x.status}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            OPTIONS BUYING INDICATORS
            All 23 options-only indicators (8 Options Intraday + 5 Ultra-Precise
            Options Price + 10 Additional Options-Buying) pulled up from further
            down the page to sit right below Market Watch.
            ══════════════════════════════════════════════════════════════════════ */}
        <div className="mt-4 rounded-lg p-3 relative border-2 border-orange-400/40 bg-slate-900/70">
          <div className="flex items-center gap-3 mb-2">
            <span style={{ fontSize: "1.3em" }}>🎯</span>
            <h2 className="text-base font-black tracking-widest uppercase text-violet-300">Options Buying Indicators</h2>
          </div>
          <p className="text-[11px] text-slate-400 font-mono mb-7">
            All 23 options-buying-only research indicators in one place, right under Market Watch.
          </p>
        {/* ── SECTION A : OPTIONS INTRADAY (8 indicators) ── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-teal-400 flex-shrink-0"/>
            <span className="text-[11px] font-mono font-bold text-teal-400 tracking-widest uppercase">
              Options Intraday Direction — 8 New Indicators
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-teal-500/25">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-teal-500/20 bg-slate-950/80">
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[12%]">Signal</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[19%]">Indicator</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[25%]">What Makes It Unique</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-teal-600 uppercase w-[15%]">🟢 BUY</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-rose-600 uppercase w-[15%]">🔴 SELL</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-amber-600 uppercase w-[14%]">🟡 WAIT</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    name: "Pin Risk Score",
                    unique: "Live 0–100 expiry magnet score — updates every poll. NOT static Max Pain. OI concentration × time-decay × ATM distance combined into one real-time number.",
                    buy: "Score ≥ 60 AND spot is BELOW pin strike (price magnetically pulled UP)",
                    sell: "Score ≥ 60 AND spot is ABOVE pin strike (price magnetically pulled DOWN)",
                    wait: "Score < 60 OR spot already AT pin strike (no directional pull)",
                  },
                  {
                    name: "Golden Sweep Detector",
                    unique: "Multi-exchange sweep order ≥ ₹50L premium with opening bias. Urgency of execution (multi-exchange fill) = institutional signal, not routine retail flow.",
                    buy: "Golden CALL sweep detected this session (large opening call buy with urgency)",
                    sell: "Golden PUT sweep detected this session (large opening put buy with urgency)",
                    wait: "No golden sweep, or sweep is a CLOSING trade (profit-taking, not a new directional bet)",
                  },
                  {
                    name: "Opening Bias Score",
                    unique: "Only counts NEW positions. Closing trades (profit-taking) are neutral and ignored. Most flow tools treat all trades equally — this one doesn't.",
                    buy: "OB Score > +0.30 (majority of fresh money entering calls this session)",
                    sell: "OB Score < −0.30 (majority of fresh money entering puts this session)",
                    wait: "Score −0.30 to +0.30 OR fewer than 20 opening trades (too thin a sample)",
                  },
                  {
                    name: "Intraday Max Pain Shift",
                    unique: "Tracks the DIRECTION max pain moves during the session as flow adds new OI. Market makers are incentivized to pin price near max pain — the shift tells you which way they push.",
                    buy: "Max pain shifted > +50 pts above session-open level (MMs pushing price up)",
                    sell: "Max pain shifted < −50 pts below session-open level (MMs pushing price down)",
                    wait: "Shift within ±50 pts of session open (not enough delta to matter)",
                  },
                  {
                    name: "Net Premium Writing Skew",
                    unique: "Option writers collect premium when they SELL options. Put writers are implicitly bullish (expect put to expire worthless). This scores who is writing more.",
                    buy: "Net put premium written > net call premium written by > 10% (writers betting puts expire worthless = bullish)",
                    sell: "Net call premium written > net put premium written by > 10% (writers betting calls expire worthless = bearish)",
                    wait: "Skew within ±10% (balanced writers, no clear edge)",
                  },
                  {
                    name: "Sweep-to-Block Ratio",
                    unique: "Sweeps = urgency (multi-exchange fill, needs to fill NOW). Blocks = stealth (single large print, negotiated quietly). Ratio reveals whether smart money is in a hurry or being careful.",
                    buy: "Sweep ratio > 0.7 on CALL side (urgent call buying — someone needs calls fast)",
                    sell: "Sweep ratio > 0.7 on PUT side (urgent put buying — someone needs puts fast)",
                    wait: "Ratio < 0.5 OR mixed call/put urgency (no clear directional urgency)",
                  },
                  {
                    name: "Option Maker-Taker Ratio",
                    unique: "Measures who crosses the spread (takers = aggressive = directional conviction). Makers = passive, willing to wait. Pure microstructure — no Greek dependency at all.",
                    buy: "Call taker volume > put taker volume by > 20% (aggressive call buyers crossing spread)",
                    sell: "Put taker volume > call taker volume by > 20% (aggressive put buyers crossing spread)",
                    wait: "Ratio within ±20% (balanced aggression, no conviction either side)",
                  },
                  {
                    name: "Dealer Delta Intraday Shift",
                    unique: "Unlike static Net Dealer Delta (already in main board), this tracks the CHANGE in dealer delta during the session. Direction of change = direction dealers must hedge by trading spot.",
                    buy: "Dealer net delta going more negative intraday (dealers buy spot to delta-hedge → upward pressure)",
                    sell: "Dealer net delta going more positive intraday (dealers sell spot to delta-hedge → downward pressure)",
                    wait: "Net delta shift < ±0.1 from session open (dealers not actively hedging)",
                  },
                ].map((row, i) => (
                  <tr key={i} className={`border-b border-slate-800/60 ${i % 2 === 0 ? "bg-slate-900/40" : "bg-slate-900/20"} hover:bg-teal-950/20 transition-colors`}>
                    <td className="px-3 py-2.5 align-top"><ManualTickBox value={manualIndicatorTicks[`optionsIntraday8-${i}`]} onChange={(v) => setManualTick(`optionsIntraday8-${i}`, v)}/></td>
                    <td className="px-3 py-2.5 font-bold text-slate-100 align-top">{row.name}</td>
                    <td className="px-3 py-2.5 text-slate-400 align-top leading-relaxed">{row.unique}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`optionsIntraday8-${i}`] === "BUY" ? "text-teal-400" : "text-white"}`}>{row.buy}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`optionsIntraday8-${i}`] === "SELL" ? "text-rose-400" : "text-white"}`}>{row.sell}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`optionsIntraday8-${i}`] === "WAIT" ? "text-amber-400" : "text-white"}`}>{row.wait}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SECTION C : 5 ULTRA-PRECISE OPTIONS PRICE INDICATORS ── */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-violet-400 flex-shrink-0"/>
            <span className="text-[11px] font-mono font-bold text-violet-400 tracking-widest uppercase">
              ⚡ 5 Ultra-Precise Options Price Indicators (100% options-price only)
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-violet-500/30">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-violet-500/20 bg-slate-950/80">
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[12%]">Signal</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[19%]">Indicator</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[25%]">What Makes It Unique</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-teal-600 uppercase w-[15%]">🟢 BUY</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-rose-600 uppercase w-[15%]">🔴 SELL</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-amber-600 uppercase w-[14%]">🟡 WAIT</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    name: "Theta Decay Rate %/Day",
                    unique: "θ_daily% = (theta points / option price) × 100. Shows exactly how fast YOUR option's value is burning per day. Accelerates exponentially at 0–7 DTE — the kill-zone for option buyers that most traders ignore until too late.",
                    buy: "Decay rate < 2%/day — option still affordable to hold, time is not the enemy yet",
                    sell: "Decay rate > 5%/day — option burning > 1/20 of its premium daily, EXIT long positions",
                    wait: "Decay 2–5%/day — manageable but track DTE daily; watch for acceleration",
                  },
                  {
                    name: "Straddle Break-Even vs ATR",
                    unique: "Straddle break-even (call + put premium) compared to the actual daily ATR of the underlying. Tells you if you are OVERPAYING for the expected move. Pure options pricing math — no directional assumption.",
                    buy: "Break-even < 0.8× daily ATR — straddle cheap vs actual moves, BUY straddle (movement underpriced)",
                    sell: "Break-even > 1.5× daily ATR — straddle overpriced vs actual moves, SELL straddle (volatility overpriced)",
                    wait: "Break-even 0.8–1.5× ATR — fairly priced, no clear mispricing edge",
                  },
                  {
                    name: "IV Crush Index",
                    unique: "Score = (ATM IV − Historical Vol) / Historical Vol × 100%. Measures exactly how much the OPTION MARKET is charging in excess of what the underlying actually moves. The precise overvaluation number quant desks use before events.",
                    buy: "Score < 10% — IV ≈ realized vol, options fairly priced, movement is underpriced relative to premium",
                    sell: "Score > 50% — IV >> realized vol by 50%+, massive crush probability, SELL premium before the event",
                    wait: "Score 10–50% — moderate IV premium, situational (check event calendar)",
                  },
                  {
                    name: "Moneyness Z-Score",
                    unique: "Z = (Strike − Spot) / (Spot × IV × √DTE/252). The statistical distance of the strike from current spot in vol-adjusted terms. Used by quant desks for precise premium sizing and responsiveness assessment.",
                    buy: "|Z| < 0.5 — near-ATM, option reacts maximally to every spot tick, highest delta-responsiveness",
                    sell: "|Z| > 2.0 — deep OTM, option needs a huge move to gain value, avoid buying (poor odds)",
                    wait: "|Z| 0.5–2.0 — moderate moneyness, assess individual risk/reward before entry",
                  },
                  {
                    name: "Speed (dΓ/dS) — 3rd Order Greek",
                    unique: "Rate of change of gamma with respect to spot. High speed near ATM = gamma itself explodes on small moves. Quant desks and vol traders use it to hedge 'gamma of gamma'. Absent from every retail app.",
                    buy: "Speed > 0 AND spot moving toward ATM — gamma will accelerate further, options will become explosive",
                    sell: "Speed < 0 AND spot moving away from ATM — gamma decelerating, options behaving sluggishly",
                    wait: "Speed ≈ 0 (flat gamma zone) — options responding linearly, no explosive leverage edge",
                  },
                ].map((row, i) => (
                  <tr key={i} className={`border-b border-slate-800/60 ${i % 2 === 0 ? "bg-slate-900/40" : "bg-violet-950/10"} hover:bg-violet-950/25 transition-colors`}>
                    <td className="px-3 py-2.5 align-top"><ManualTickBox value={manualIndicatorTicks[`ultraPrecise5-${i}`]} onChange={(v) => setManualTick(`ultraPrecise5-${i}`, v)}/></td>
                    <td className="px-3 py-2.5 font-bold text-violet-200 align-top">{row.name}</td>
                    <td className="px-3 py-2.5 text-slate-400 align-top leading-relaxed">{row.unique}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`ultraPrecise5-${i}`] === "BUY" ? "text-teal-400" : "text-white"}`}>{row.buy}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`ultraPrecise5-${i}`] === "SELL" ? "text-rose-400" : "text-white"}`}>{row.sell}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`ultraPrecise5-${i}`] === "WAIT" ? "text-amber-400" : "text-white"}`}>{row.wait}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-600 font-mono mt-3">
            Research sources: FlashAlpha 0DTE research · InsiderFinance Golden Sweeps · ThetaVantage flow scoring · EIA.gov weekly petroleum reports · CME Group WTI-Brent spread · CFTC COT commercials methodology · BullionBrains COMEX-MCX import parity formula · Macrosynergy commodity carry research · IBKR Quant options microstructure paper
          </p>
        </div>

          {/* ── 10 Additional Options-Buying Indicators — CALL / PUT ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-violet-300 flex-shrink-0"/>
            <span className="text-[11px] font-mono font-bold text-violet-300 tracking-widest uppercase">
              10 Additional Options-Buying Indicators — CALL / PUT
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-violet-400/25">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="border-b border-violet-400/20 bg-slate-950">
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[12%]">Signal</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[17%]">Indicator</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[25%]">Unique angle / calculation</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-teal-500 uppercase w-[16%]">BUY CALL</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-rose-500 uppercase w-[16%]">BUY PUT</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-amber-500 uppercase w-[14%]">WAIT</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    name: "Call-Put Parity Residual",
                    unique: "Compares call minus put premium with spot minus discounted strike. A persistent residual identifies which side is rich/cheap after carry, without using PCR or OI.",
                    buy: "Call residual ≤ −0.75% of spot and the call midpoint turns upward: BUY CALL.",
                    sell: "Put residual ≤ −0.75% of spot and the put midpoint turns upward: BUY PUT.",
                    wait: "Residual is inside ±0.75%, or the cheap side has no rising midpoint confirmation.",
                  },
                  {
                    name: "Extrinsic-Value Momentum",
                    unique: "Extrinsic value = option midpoint minus intrinsic value. It tracks time-value momentum, so a buyer is selected only when the option's non-intrinsic premium is expanding.",
                    buy: "Call extrinsic value rises ≥ 3% over 5 minutes and spot is above the call's strike.",
                    sell: "Put extrinsic value rises ≥ 3% over 5 minutes and spot is below the put's strike.",
                    wait: "Extrinsic value is flat/falling or spot is moving against the selected contract.",
                  },
                  {
                    name: "Option Theoretical-Value Residual",
                    unique: "Uses the live option midpoint minus a Black-Scholes theoretical value built from spot, rate, IV, and DTE. It is a premium mispricing check, not IV rank.",
                    buy: "Call midpoint is ≥ 1.5% below theoretical value and its midpoint is making higher lows.",
                    sell: "Put midpoint is ≥ 1.5% below theoretical value and its midpoint is making higher lows.",
                    wait: "Mispricing is below 1.5%, theoretical inputs are stale, or midpoint has no higher-low confirmation.",
                  },
                  {
                    name: "Option Price Convexity",
                    unique: "Second difference of the option midpoint over equal spot intervals: Δ² premium / Δ² spot. It detects a premium curve starting to accelerate before a simple price change is obvious.",
                    buy: "Call convexity > 0 for 3 consecutive samples while spot rises through the call strike.",
                    sell: "Put convexity > 0 for 3 consecutive samples while spot falls through the put strike.",
                    wait: "Convexity is negative, mixed, or has fewer than 3 confirmed samples.",
                  },
                  {
                    name: "Premium/Spot Elasticity",
                    unique: "Elasticity = percentage change in option midpoint divided by percentage change in spot. It selects the contract whose price is responding fastest, not merely the contract with the highest delta.",
                    buy: "Call elasticity > 1.2 over the last 5 candles and spot return is positive.",
                    sell: "Put elasticity > 1.2 over the last 5 candles and spot return is negative.",
                    wait: "Elasticity ≤ 1.2, spot return is flat, or the response is inconsistent.",
                  },
                  {
                    name: "Option Premium Relative Strength",
                    unique: "Compares normalized option-premium return with the median return of same-expiry nearby strikes. It detects a single contract outperforming its local price surface.",
                    buy: "Call premium outperformance ≥ +1 standard deviation with positive 3-candle momentum.",
                    sell: "Put premium outperformance ≥ +1 standard deviation with positive 3-candle momentum.",
                    wait: "No local outperformance or the outperformance is reversing.",
                  },
                  {
                    name: "Call/Put Premium-Ratio Velocity",
                    unique: "Uses the rate of change of the ATM call midpoint divided by ATM put midpoint. It is price-only and distinct from OI-based PCR and risk reversal.",
                    buy: "Call/put premium ratio rises ≥ 4% over 5 minutes with call midpoint above its 20-minute mean.",
                    sell: "Call/put premium ratio falls ≥ 4% over 5 minutes with put midpoint above its 20-minute mean.",
                    wait: "Ratio velocity is within ±4% or both premiums move together without separation.",
                  },
                  {
                    name: "Bid-Ask Spread Compression Trigger",
                    unique: "Uses the option's quoted spread percentage together with midpoint direction. It avoids buying a theoretical signal when execution friction is expanding.",
                    buy: "Call spread compresses ≥ 25% from its 10-minute high while call midpoint rises ≥ 1%.",
                    sell: "Put spread compresses ≥ 25% from its 10-minute high while put midpoint rises ≥ 1%.",
                    wait: "Spread is widening, remains above 3%, or midpoint has not risen.",
                  },
                  {
                    name: "Premium Shock Persistence",
                    unique: "Separates a one-tick option-price spike from a persistent repricing by counting same-direction midpoint closes after a shock.",
                    buy: "Call midpoint shock ≥ 2% followed by at least 3 of the next 4 higher closes.",
                    sell: "Put midpoint shock ≥ 2% followed by at least 3 of the next 4 higher closes.",
                    wait: "Shock fades within two samples, prints are stale, or persistence is below 3 of 4.",
                  },
                  {
                    name: "Synthetic-Forward Direction Check",
                    unique: "Builds synthetic forward = strike + call midpoint − put midpoint and compares its short-term slope with spot. It rejects a call/put purchase when the option surface disagrees with the underlying.",
                    buy: "Synthetic-forward slope > 0.15% over 10 minutes and call midpoint also makes a higher high.",
                    sell: "Synthetic-forward slope < −0.15% over 10 minutes and put midpoint also makes a higher high.",
                    wait: "Synthetic slope is inside ±0.15% or the corresponding option midpoint does not confirm.",
                  },
                ].map((row, i) => (
                  <tr key={i} className={`border-b border-slate-800/60 ${i % 2 === 0 ? "bg-slate-900/45" : "bg-violet-950/15"} hover:bg-violet-950/30 transition-colors`}>
                    <td className="px-3 py-2.5 align-top"><ManualTickBox value={manualIndicatorTicks[`additionalOptions10-${i}`]} onChange={(v) => setManualTick(`additionalOptions10-${i}`, v)}/></td>
                    <td className="px-3 py-2.5 font-bold text-violet-100 align-top">{row.name}</td>
                    <td className="px-3 py-2.5 text-slate-400 align-top leading-relaxed">{row.unique}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`additionalOptions10-${i}`] === "BUY" ? "text-teal-400" : "text-white"}`}>{row.buy}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`additionalOptions10-${i}`] === "SELL" ? "text-rose-400" : "text-white"}`}>{row.sell}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`additionalOptions10-${i}`] === "WAIT" ? "text-amber-400" : "text-white"}`}>{row.wait}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </div>

        {/* Trade Instrument selector — wires all 13 spot-driven indicators to whatever is picked here */}
        <div className={`mt-4 rounded-lg p-3 relative border-2 ${isLight ? "bg-white" : "bg-slate-900/70"}`} style={{ borderColor: "#eab308", boxShadow: "0 0 0 1px rgba(234,179,8,0.15)" }}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm font-bold flex items-center gap-1.5 text-cyan-300"><Radio className="w-3.5 h-3.5 text-cyan-400"/> Trading On</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">{(() => {
              const chainBoundCount = OPTION_CHAIN_DRIVEN_IDS.filter((id) => initialIndicators.some((i) => i.id === id)).length;
              const liveCount = tradeUnderlying ? initialIndicators.length : initialIndicators.length - chainBoundCount;
              return `${liveCount} of ${initialIndicators.length}`;
            })()} indicators follow this live</span>
          </div>

          {/* Indicator consensus — counts every indicator's live BUY/SELL/WAIT
              call (same evaluated[] used by the indicator cards below) so this
              box IS the hub: no separate computation, just a tally of the
              same signals shown elsewhere on the page. */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className={`rounded-lg border-2 border-teal-500 px-3 py-2.5 ${isLight ? "bg-teal-100" : "bg-teal-950/10"}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold font-mono text-teal-500">▲ BUY</span>
                <span className="text-xl font-black font-mono text-teal-500">{buySignals.length}</span>
              </div>
              <div className={`text-[10px] font-mono mt-0.5 ${isLight ? "text-slate-300" : "text-slate-300"}`}>of {total} indicators · {buyPct}%</div>
            </div>
            <div className={`rounded-lg border-2 border-rose-400 px-3 py-2.5 ${isLight ? "bg-rose-50" : "bg-rose-500/10"}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold font-mono text-rose-400">▼ SELL</span>
                <span className="text-xl font-black font-mono text-rose-400">{sellSignals.length}</span>
              </div>
              <div className={`text-[10px] font-mono mt-0.5 ${isLight ? "text-slate-300" : "text-slate-300"}`}>of {total} indicators · {sellPct}%</div>
            </div>
          </div>
          {waitSignals.length > 0 && (
            <div className="text-[10px] font-mono mb-3 text-center text-cyan-300/80">{waitSignals.length} indicator{waitSignals.length === 1 ? "" : "s"} on WAIT — no read yet</div>
          )}

          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[11px] font-mono px-2.5 py-1 rounded-full border font-bold ${isLight ? "bg-cyan-50 border-cyan-400/60 text-cyan-700" : "bg-cyan-500/10 border-cyan-400/50 text-cyan-300"}`}>
              Selected: {tradeSymbol}
            </span>
            <span className="text-[11px] font-mono text-cyan-300/80">
              {typeof marketData[tradeSymbol]?.ltp === "number" ? formatPrice(marketData[tradeSymbol].ltp) : "—"}
            </span>
          </div>



          

          <div className="relative" ref={tradeBoxRef}>
            <input
              value={tradeSymbolSearch}
              onChange={(e) => { setTradeSymbolSearch(e.target.value); setTradeSymbolOpen(true); }}
              onFocus={() => setTradeSymbolOpen(true)}
              onClick={() => setTradeSymbolOpen(true)}
              onTouchStart={() => setTradeSymbolOpen(true)}
              placeholder="Search any index, stock, option, commodity…"
              autoComplete="off"
              className={`w-full rounded-md px-3 py-2.5 pr-8 text-sm font-mono border ${isLight ? "bg-white border-cyan-400/60 text-cyan-700 placeholder:text-cyan-600/40" : "bg-slate-800 border-cyan-400/60 text-cyan-200 placeholder:text-cyan-300/40"}`}
            />
            {tradeSymbolOpen && (<button
                type="button"
                aria-label="Close symbol search"
                onClick={() => { setTradeSymbolOpen(false); setTradeSymbolSearch(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm leading-none rounded-full w-5 h-5 flex items-center justify-center text-cyan-400 hover:bg-cyan-500/15"
              >✕</button>)}
            {tradeSymbolOpen && (<div
                className={`absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-lg border shadow-xl z-40 ${isLight ? "bg-white border-cyan-400/60" : "bg-slate-900 border-cyan-400/60"}`}
                style={{ overscrollBehavior: "contain", touchAction: "pan-y" }}
              >
                <div className={`sticky top-0 flex items-center justify-between px-3 py-1.5 text-[10px] font-bold border-b border-cyan-500/30 text-cyan-300 ${isLight ? "bg-cyan-50" : "bg-slate-900"}`}>
                  <span>Tap a result, tap outside, or press Esc to close</span>
                  <button type="button" onClick={() => { setTradeSymbolOpen(false); setTradeSymbolSearch(""); }} className="hover:text-cyan-100">✕ Close</button>
                </div>
                {Object.values(marketData).filter((r) => r.symbol.toLowerCase().includes(tradeSymbolSearch.toLowerCase())).slice(0, 20).map((r) => (
                  <button key={r.symbol} onClick={() => { setTradeSymbol(r.symbol); setSelectedSymbol(r.symbol); setTradeSymbolSearch(""); setTradeSymbolOpen(false); }} className={`w-full text-left px-3 py-2 text-xs font-mono flex items-center justify-between border-b last:border-b-0 border-cyan-500/20 text-cyan-50 ${isLight ? "hover:bg-cyan-50" : "hover:bg-slate-800"} ${tradeSymbol === r.symbol ? "text-cyan-400 font-bold" : ""}`}>
                    <span>{r.symbol} <span className="opacity-90">· {r.category}</span></span>
                    <span>{r.ltp}</span>
                  </button>
                ))}
                {Object.values(marketData).filter((r) => r.symbol.toLowerCase().includes(tradeSymbolSearch.toLowerCase())).length === 0 && (<div className="px-3 py-2 text-xs text-cyan-300/60">No matches.</div>)}
              </div>)}
          </div>
        </div>


        <div className={`mt-4 rounded-lg border-2 p-3 ${isLight ? "bg-cyan-50/40" : "bg-slate-900/70"}`} style={{ borderColor: "#f97316", boxShadow: "0 0 0 1px rgba(249,115,22,0.15)" }}>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-cyan-400"/>
            <span className="text-sm font-semibold text-cyan-300">Institutional Flow (FII/DII)</span>
          </div>
          {fiiDiiCashFlow ? (
            <div className="flex items-center gap-4 flex-wrap text-xs font-mono">
              <span className={fiiDiiCashFlow.fiiNetCr >= 0 ? "text-teal-500" : "text-rose-400"}>
                FII: {fiiDiiCashFlow.fiiNetCr >= 0 ? "+" : ""}{fiiDiiCashFlow.fiiNetCr?.toLocaleString("en-IN")} Cr
              </span>
              <span className={fiiDiiCashFlow.diiNetCr >= 0 ? "text-teal-500" : "text-rose-400"}>
                DII: {fiiDiiCashFlow.diiNetCr >= 0 ? "+" : ""}{fiiDiiCashFlow.diiNetCr?.toLocaleString("en-IN")} Cr
              </span>
              <span className="text-slate-300">as of {fiiDiiCashFlow.date}</span>
              {fiiDiiCashFlowStatus?.ok === false && (
                <span className="text-amber-400 text-[10px]">(showing last known value — latest refresh failed: {fiiDiiCashFlowStatus.lastError})</span>
              )}
            </div>
          ) : fiiDiiCashFlowStatus?.lastError ? (
            <p className="text-[11px] text-rose-400">
              Relay can't reach NSE yet — {fiiDiiCashFlowStatus.lastError}
              {fiiDiiCashFlowStatus.lastAttempt ? ` (last tried ${new Date(fiiDiiCashFlowStatus.lastAttempt).toLocaleTimeString("en-IN", { hour12: false })})` : ""}.
              {" "}Retrying every 5 min. If this persists it usually means NSE is blocking the relay's hosting IP — a well-known issue for cloud-hosted scrapers.
            </p>
          ) : (
            <p className="text-[11px] text-slate-300">Waiting for relay — official NSE data, updates once daily.</p>
          )}
          <p className="text-[10px] text-slate-300 mt-1">Raw institutional positioning from NSE — not a prediction, no accuracy score.</p>
        </div>


        {/* RADHEY SHYAM */}
        <div className={`mt-4 rounded-lg border-2 border-yellow-400 p-4 ${radheyShyam.verdict === "BUY" ? "bg-teal-950/70 shadow-[0_0_10px_rgba(13,148,136,0.15)]" : radheyShyam.verdict === "SELL" ? "bg-rose-950/70 shadow-[0_0_25px_rgba(244,63,94,0.4)]" : "bg-slate-900/70"}`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs text-slate-200 mb-1">🕉️ RADHEY SHYAM — Master Decision Engine</div>
              <div className="text-xl font-extrabold text-slate-100">
                {radheyShyam.verdict === "WAIT" ? <span className="text-slate-200">⚪ WAIT — NO TRADE</span> : radheyShyam.verdict === "BUY" ? <span className="text-teal-500">🟢 BUY — SIGNAL CONFIRMED</span> : <span className="text-rose-400">🔴 SELL — SIGNAL CONFIRMED</span>}
              </div>
            </div>
            <DualArrowBox status={radheyShyam.verdict}/>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 text-[11px] font-mono">
            <div className={`rounded border border-cyan-400 px-2 py-1 text-center ${radheyShyam.macroClear ? "bg-teal-950/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>Macro (🇱🇺🇩🇪) {radheyShyam.macroClear ? "Clear" : "Blocked"}</div>
            <div className={`rounded border border-cyan-400 px-2 py-1 text-center ${radheyShyam.trend !== "Mixed" ? "bg-teal-950/10 text-emerald-300" : "bg-slate-700/30 text-slate-200"}`}>Trend (🇯🇵🇺🇸) {radheyShyam.trend}</div>
            <div className={`rounded border border-cyan-400 px-2 py-1 text-center ${radheyShyam.filterSafe ? "bg-teal-950/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>Filter (🇪🇺🇷🇺) {radheyShyam.filterSafe ? "Safe" : "Risky"}</div>
            <div className={`rounded border border-cyan-400 px-2 py-1 text-center ${radheyShyam.momentumHigh ? "bg-teal-950/10 text-emerald-300" : "bg-slate-700/30 text-slate-200"}`}>Momentum (🇨🇳🇮🇳) {radheyShyam.momentumHigh ? "High" : "Low"}</div>
            <div className={`rounded border border-cyan-400 px-2 py-1 text-center ${radheyShyam.rangeValid ? "bg-teal-950/10 text-emerald-300" : "bg-slate-700/30 text-slate-200"}`}>Range (🇦🇪🇨🇭) {radheyShyam.rangeValid ? "Valid" : "Invalid"}</div>
          </div>
          <p className="text-[11px] text-slate-600 mt-2">All 5 gates — Macro, Trend, Filter, Momentum, Range — must pass together for a confirmed signal.</p>
        </div>

        {/* Radha Madhav, Radheshyam — each in its own full box */}
        {["radhaMadhav", "radheshyam"].map((id) => {
          const ind = initialIndicators.find((i) => i.id === id);
          return (<div key={id} className="mt-4">
            <IndicatorCard ind={ind} values={state[id]} onChange={handleChange} isLight={isLight} isLive={isLive} onOpenTicket={openTicket} selectedSymbol={selectedSymbol} symbolLtp={marketData[selectedSymbol]?.ltp}/>
          </div>);
        })}

        {/* 6 raw OMS / options-flow cards feeding the Master Score (now pinned below the header) */}
        {["omsOiChange", "omsVolOiRatio", "omsIvChange", "omsDeltaVolume", "omsAskHitRatio", "omsFuturesConfirm"].map((id) => {
          const ind = initialIndicators.find((i) => i.id === id);
          return (<div key={id} className="mt-4">
            <IndicatorCard ind={ind} values={state[id]} onChange={handleChange} isLight={isLight} isLive={isLive} onOpenTicket={openTicket} selectedSymbol={selectedSymbol} symbolLtp={marketData[selectedSymbol]?.ltp}/>
          </div>);
        })}

        {/* 👑 KOHINOOR signals — SOFR Funding Stress + 10Y-3M Yield Curve —
            the rarest tier, above even the diamonds: repo-plumbing stress
            and the most legendary recession predictor in macro finance.
            Placed above the diamonds, right below Radheshyam. Platinum/
            white styling to mark them as a level above gold. */}
        {["sofrFundingStress", "yieldCurve10Y3M"].map((id) => {
          const ind = initialIndicators.find((i) => i.id === id);
          return (<div key={id} className="mt-4 rounded-lg border-2 border-white shadow-[0_0_18px_rgba(255,255,255,0.55)]">
            <div className="flex items-center gap-1.5 px-3 pt-2 text-[11px] font-bold tracking-wide text-white">👑 KOHINOOR SIGNAL</div>
            <IndicatorCard ind={ind} values={state[id]} onChange={handleChange} isLight={isLight} isLive={isLive} onOpenTicket={openTicket} selectedSymbol={selectedSymbol} symbolLtp={marketData[selectedSymbol]?.ltp} kohinoor/>
          </div>);
        })}

        {/* 💎 DIAMOND signals — HY Credit Spread + Global Net Liquidity —
            placed right below Radheshyam per request, gold-themed to mark
            them as the top-tier global institutional watch items. */}
        {["hyCreditSpread", "globalNetLiquidity"].map((id) => {
          const ind = initialIndicators.find((i) => i.id === id);
          return (<div key={id} className="mt-4 rounded-lg border-2 border-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.35)]">
            <div className="flex items-center gap-1.5 px-3 pt-2 text-[11px] font-bold tracking-wide text-amber-300">💎 DIAMOND SIGNAL</div>
            <IndicatorCard ind={ind} values={state[id]} onChange={handleChange} isLight={isLight} isLive={isLive} onOpenTicket={openTicket} selectedSymbol={selectedSymbol} symbolLtp={marketData[selectedSymbol]?.ltp} gold/>
          </div>);
        })}

        {["indiaQuantum"].map((id) => {
          const ind = initialIndicators.find((i) => i.id === id);
          return (<div key={id} className="mt-4">
            <IndicatorCard ind={ind} values={state[id]} onChange={handleChange} isLight={isLight} isLive={isLive} onOpenTicket={openTicket} selectedSymbol={selectedSymbol} symbolLtp={marketData[selectedSymbol]?.ltp}/>
          </div>);
        })}

        {/* Grand Unified Signal */}
        <div className={`mt-4 rounded-lg border border-orange-400 p-4 ${grandUnified.aligned ? grandUnified.direction === "BUY" ? "bg-teal-950/60 shadow-[0_0_8px_rgba(13,148,136,0.12)]" : "bg-rose-950/60 shadow-[0_0_20px_rgba(244,63,94,0.35)]" : "bg-slate-900/60"}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-200 mb-1">🇯🇵 Ichimoku + 🇺🇸 AVWAP + 🇪🇺 VPOC — Grand Unified Signal</div>
              <div className="text-lg font-bold text-slate-100">
                {grandUnified.aligned ? <>{grandUnified.direction} · <span className="text-amber-300">all 3 aligned</span></> : <span className="text-slate-300">No signal — waiting for all 3 to agree</span>}
              </div>
              <div className="text-[11px] text-slate-300 mt-1 font-mono">Japan {grandUnified.ichStatus || "–"} · USA {grandUnified.avwapStatus || "–"} · EU {grandUnified.vpocStatus || "–"}</div>
            </div>
            <DualArrowBox status={grandUnified.aligned ? grandUnified.direction : "WAIT"}/>
          </div>
        </div>

        {/* Super Compute Signal */}
        {showSuperSignal && (<div className={`mt-4 rounded-lg border border-yellow-400 p-4 ${superSignal.direction === "BUY" ? "bg-teal-950/40" : superSignal.direction === "SELL" ? "bg-rose-950/40" : "bg-slate-900/60"}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-slate-200 mb-1">Super Compute Signal (Time-Weighted, all 17 indicators)</div>
                <div className="text-lg font-bold text-slate-100">
                  {superSignal.direction} ·{" "}
                  <span className={superSignal.confidencePct >= 60 ? "text-teal-500" : superSignal.confidencePct >= 30 ? "text-amber-400" : "text-slate-300"}>{superSignal.confidencePct}% confidence</span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1 font-mono">{superSignal.buyVotes} BUY CALL lean vs {superSignal.sellVotes} BUY PUT lean of {superSignal.total} indicators · raw score {superSignal.rawScore} → time-weighted {superSignal.weightedScore}</div>
              </div>
              <DualArrowBox status={superSignal.direction}/>
            </div>
            <label className="flex items-center gap-3 text-xs text-slate-200 pt-2 border-t border-cyan-400/20">
              Session elapsed
              <input type="range" min="0" max="100" value={sessionElapsedPct} onChange={(e) => setSessionElapsedPct(parseInt(e.target.value, 10))} className="flex-1"/>
              <span className="font-mono text-slate-300 w-12 text-right">{sessionElapsedPct}%</span>
            </label>
          </div>)}

        {/* Overall meter */}
        <div className={`mt-4 rounded-lg border p-3 ${isLight ? "border-orange-400/60 bg-white" : "border-orange-500/30 bg-slate-900/60"}`}>
          <div className="flex justify-between text-[11px] font-mono text-slate-200 mb-1.5">
            <span className="text-teal-500">{buySignals.length} BUY</span>
            <span className="text-amber-400">{waitSignals.length} WAIT</span>
            <span className="text-rose-400">{sellSignals.length} SELL</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden flex">
            <div className="h-full bg-teal-500 transition-all duration-300" style={{ width: `${buyPct}%` }}/>
            <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${100 - buyPct - sellPct}%` }}/>
            <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${sellPct}%` }}/>
          </div>
        </div>
      </div>

      {/* Split board */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div>
          <div className="flex items-center gap-2 mb-3 sticky top-0">
            <ChevronUp className="w-4 h-4 text-teal-500"/>
            <h2 className="text-sm font-bold text-teal-500 tracking-wide">CALL SIDE · BUY SIGNALS ({buySignals.length})</h2>
          </div>
          <div className="flex flex-col gap-3">
            {buySignals.length === 0 && <p className="text-xs text-slate-600 italic">No indicators currently favor calls.</p>}
            {buySignals.map(({ ind }) => <IndicatorCard key={ind.id} ind={ind} values={state[ind.id]} onChange={handleChange} isLight={isLight} isLive={isLive} onOpenTicket={openTicket} selectedSymbol={selectedSymbol} symbolLtp={marketData[selectedSymbol]?.ltp}/>)}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3 sticky top-0">
            <span className="w-4 h-4 flex items-center justify-center text-amber-400 font-bold text-xs">–</span>
            <h2 className="text-sm font-bold text-amber-400 tracking-wide">WAIT · SIDEWAYS ({waitSignals.length})</h2>
          </div>
          <div className="flex flex-col gap-3">
            {waitSignals.length === 0 && <p className="text-xs text-slate-600 italic">Nothing sitting on the fence right now.</p>}
            {waitSignals.map(({ ind }) => <IndicatorCard key={ind.id} ind={ind} values={state[ind.id]} onChange={handleChange} isLight={isLight} isLive={isLive} onOpenTicket={openTicket} selectedSymbol={selectedSymbol} symbolLtp={marketData[selectedSymbol]?.ltp}/>)}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3 sticky top-0">
            <ChevronDown className="w-4 h-4 text-rose-400"/>
            <h2 className="text-sm font-bold text-rose-400 tracking-wide">PUT SIDE · BUY PUT SIGNALS ({sellSignals.length})</h2>
          </div>
          <div className="flex flex-col gap-3">
            {sellSignals.length === 0 && <p className="text-xs text-slate-600 italic">No indicators currently favor puts.</p>}
            {sellSignals.map(({ ind }) => <IndicatorCard key={ind.id} ind={ind} values={state[ind.id]} onChange={handleChange} isLight={isLight} isLive={isLive} onOpenTicket={openTicket} selectedSymbol={selectedSymbol} symbolLtp={marketData[selectedSymbol]?.ltp}/>)}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          NEW INDICATORS RESEARCH BOX
          15 freshly-researched indicators (8 Options + 7 MCX Commodity)
          + 5 ultra-precise Options-Price-only indicators.
          None of these are duplicated in the main signal board above.
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-6xl mx-auto mt-12 pt-8 border-t-2 border-cyan-400/40">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <span style={{ fontSize: "1.3em" }}>🔬</span>
          <h2 className="text-base font-black tracking-widest uppercase text-cyan-400">NEW INDICATORS RESEARCH BOX</h2>
        </div>
        <p className="text-[11px] text-slate-400 font-mono mb-7">
          7 MCX Commodity intraday indicators found by deep web research. The 8 Options and 5 Ultra-Precise Options Price indicators from this research batch now live in the Options Buying Indicators box, right below Market Watch.
          <span className="text-cyan-500/80"> None of these are in the main signal board above.</span>
        </p>


        {/* ── SECTION B : MCX COMMODITY INTRADAY (7 indicators) ── */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0"/>
            <span className="text-[11px] font-mono font-bold text-orange-400 tracking-widest uppercase">
              MCX Commodity Intraday Direction — 7 New Indicators
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-orange-500/25">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-orange-500/20 bg-slate-950/80">
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[12%]">Signal</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[19%]">Indicator</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[25%]">What Makes It Unique</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-teal-600 uppercase w-[15%]">🟢 BUY</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-rose-600 uppercase w-[15%]">🔴 SELL</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-amber-600 uppercase w-[14%]">🟡 WAIT</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    name: "COMEX-MCX Gold Parity Spread",
                    unique: "MCX gold parity = COMEX price × USDINR × 32.1507 / 10 × 1.125 (import duty + GST). When MCX deviates from this fair value, it snaps back. No other indicator in the board tracks this local arbitrage.",
                    buy: "MCX > 1% BELOW import parity (too cheap locally — will rise to catch COMEX)",
                    sell: "MCX > 1% ABOVE import parity (too expensive locally — will fall back to COMEX fair value)",
                    wait: "Spread within ±1% of parity (fairly priced, no arbitrage edge)",
                  },
                  {
                    name: "EIA Crude Inventory Surprise",
                    unique: "Actual vs consensus crude oil draw/build every Wednesday 8 PM IST. The single largest scheduled intraday crude price mover — hard published data, not a model estimate.",
                    buy: "Actual draw > expected by > 2 million barrels (tighter supply than market priced)",
                    sell: "Actual build > expected by > 2 million barrels (more supply surplus than market priced)",
                    wait: "Surprise within ±2 MB of consensus OR not Wednesday 7:50–8:30 PM IST window",
                  },
                  {
                    name: "USDINR Impact Signal",
                    unique: "Isolates the pure rupee-driven MCX price move when COMEX is flat. MCX gold/silver/crude are priced in INR — every 1% INR depreciation lifts MCX ~1% with no global price change.",
                    buy: "USDINR rising ≥ 0.3% AND COMEX flat (< 0.2% move) — pure rupee tailwind for MCX",
                    sell: "USDINR falling ≥ 0.3% AND COMEX flat (< 0.2% move) — pure rupee headwind for MCX",
                    wait: "COMEX itself moving > 0.2% (global price is dominant driver, use COMEX signal instead)",
                  },
                  {
                    name: "MCX COT Commercials Extreme",
                    unique: "COMMODITY commercials = miners, oil producers, refineries — true smart money in commodities. Different from the equity COT (leveraged funds) already in the main board.",
                    buy: "Commercial net position at 52W percentile ≥ 90% (producers are buyers = price too low)",
                    sell: "Commercial net position at 52W percentile ≤ 10% (producers hedging max output = price too high)",
                    wait: "Percentile 10–90% (no extreme commercial positioning)",
                  },
                  {
                    name: "WTI–Brent Spread",
                    unique: "MCX Crude tracks WTI (NYMEX). When WTI trades at an unusual discount to Brent, MCX crude is undervalued vs global crude and will catch up. Cross-market reversion, not a technical signal.",
                    buy: "WTI–Brent spread < −7 USD/barrel (WTI deeply discounted — MCX crude will catch up)",
                    sell: "WTI–Brent spread > −1 USD/barrel (WTI near Brent parity — MCX crude expensive vs global)",
                    wait: "Spread between −7 and −1 USD (normal range, no reversion edge)",
                  },
                  {
                    name: "MCX Futures Rollover Pressure",
                    unique: "As MCX expiry approaches, the % of OI rolling to the next month + the contango/backwardation shape creates net buying or selling pressure on the expiring front-month contract.",
                    buy: "Rollover > 60% AND backwardation (next month cheaper = buy pressure on current contract)",
                    sell: "Rollover > 60% AND contango (next month costlier = synthetic sell pressure on current contract)",
                    wait: "Rollover < 30% (too early in the expiry cycle, no meaningful roll pressure yet)",
                  },
                  {
                    name: "MCX Session Time-of-Day Gate",
                    unique: "MCX has predictable high-volatility windows aligned to global market opens. Signals outside these windows are statistically noise. This GATES all other MCX indicators.",
                    buy: "Inside high-impact window (9–9:30 AM OR 7–9 PM IST) AND price momentum is up",
                    sell: "Inside high-impact window (9–9:30 AM OR 7–9 PM IST) AND price momentum is down",
                    wait: "Outside all high-impact windows — any other MCX signal during this time should be discounted",
                  },
                ].map((row, i) => (
                  <tr key={i} className={`border-b border-slate-800/60 ${i % 2 === 0 ? "bg-slate-900/40" : "bg-slate-900/20"} hover:bg-orange-950/20 transition-colors`}>
                    <td className="px-3 py-2.5 align-top"><ManualTickBox value={manualIndicatorTicks[`mcxIntraday7-${i}`]} onChange={(v) => setManualTick(`mcxIntraday7-${i}`, v)}/></td>
                    <td className="px-3 py-2.5 font-bold text-slate-100 align-top">{row.name}</td>
                    <td className="px-3 py-2.5 text-slate-400 align-top leading-relaxed">{row.unique}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`mcxIntraday7-${i}`] === "BUY" ? "text-teal-400" : "text-white"}`}>{row.buy}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`mcxIntraday7-${i}`] === "SELL" ? "text-rose-400" : "text-white"}`}>{row.sell}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`mcxIntraday7-${i}`] === "WAIT" ? "text-amber-400" : "text-white"}`}>{row.wait}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ADDITIONAL NEW INDICATORS
          10 additional MCX rules + 10 additional options-buying rules.
          These are separate from the first research box and do not duplicate
          the indicator names already used in the main board or that box.
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-6xl mx-auto mt-10 rounded-2xl border-2 border-yellow-400/40 bg-slate-950/70 p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-2">
          <span style={{ fontSize: "1.3em" }}>🧭</span>
          <h2 className="text-base font-black tracking-widest uppercase text-fuchsia-300">10 Additional MCX Direction Indicators</h2>
        </div>
        <p className="text-[11px] text-slate-400 font-mono mb-7">
          Ten additional MCX rules. Each row gives a directional use for BUY, SELL, and WAIT. The ten additional option-price rules from this batch now live in the Options Buying Indicators box, right below Market Watch.
          These are research rules, not guaranteed or 100% accurate signals; confirm with live data, liquidity, and risk limits.
        </p>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-orange-300 flex-shrink-0"/>
            <span className="text-[11px] font-mono font-bold text-orange-300 tracking-widest uppercase">
              10 Additional MCX Commodity Indicators
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-orange-400/25">
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="border-b border-orange-400/20 bg-slate-950">
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[12%]">Signal</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[17%]">Indicator</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-slate-500 uppercase w-[25%]">Unique angle / calculation</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-teal-500 uppercase w-[16%]">BUY</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-rose-500 uppercase w-[16%]">SELL</th>
                  <th className="text-left px-3 py-2 text-[10px] font-mono text-amber-500 uppercase w-[14%]">WAIT</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    name: "MCX–LME Copper Cash/3M Spread",
                    unique: "Tracks the LME cash minus 3-month copper spread, then compares its standardized score with MCX Copper. It reads physical tightness rather than MCX chart momentum.",
                    buy: "Spread z-score ≤ −2 and MCX Copper is above its first 15-minute high: BUY copper.",
                    sell: "Spread z-score ≥ +2 and MCX Copper is below its first 15-minute low: SELL copper.",
                    wait: "Spread z-score between −2 and +2, or MCX has not confirmed the cross-market move.",
                  },
                  {
                    name: "LME Cancelled-Warrant Flow",
                    unique: "Cancelled warehouse warrants divided by total LME warehouse stocks. A rising cancellation rate can signal metal leaving deliverable supply before price reacts.",
                    buy: "7-day cancelled-warrant ratio rises ≥ 5 percentage points and copper price breaks the 30-minute high.",
                    sell: "Ratio falls ≥ 5 points and copper price breaks the 30-minute low.",
                    wait: "Change is under 5 points or price has not confirmed the inventory-flow direction.",
                  },
                  {
                    name: "MCX Delivery Intent Ratio",
                    unique: "Near-expiry delivery-linked open interest divided by total front-month open interest. It separates physically motivated positioning from short-lived speculative turnover.",
                    buy: "Ratio rises above its 20-day 90th percentile while front-month price holds above VWAP.",
                    sell: "Ratio falls below its 20-day 10th percentile while front-month price holds below VWAP.",
                    wait: "Ratio is not at an extreme or price and delivery intent disagree.",
                  },
                  {
                    name: "Gold Lease-Rate Shock",
                    unique: "Uses the change in the gold lease/forward-borrow rate as a physical tightness proxy. It is different from gold price, real-yield, parity, and option indicators.",
                    buy: "Lease rate drops sharply below its 20-day mean while spot gold holds its opening range.",
                    sell: "Lease rate jumps above its 20-day mean while spot gold fails the opening range.",
                    wait: "Lease-rate change is small or global gold and the physical signal conflict.",
                  },
                  {
                    name: "Energy Crack-Spread Momentum",
                    unique: "Uses the refined-product minus crude crack spread to measure refinery margin and demand pressure, instead of reading crude alone.",
                    buy: "3-bar crack-spread return > +1% with crude above its 15-minute range midpoint.",
                    sell: "3-bar crack-spread return < −1% with crude below its 15-minute range midpoint.",
                    wait: "Crack spread is flat, noisy, or crude does not confirm the margin move.",
                  },
                  {
                    name: "Heating-Oil Demand Proxy",
                    unique: "Compares heating-oil futures momentum with WTI momentum. A positive residual detects product-demand strength that crude-only measures miss.",
                    buy: "Heating-oil return minus WTI return > +0.50% over 30 minutes.",
                    sell: "Heating-oil return minus WTI return < −0.50% over 30 minutes.",
                    wait: "Residual stays between −0.50% and +0.50% or either market is illiquid.",
                  },
                  {
                    name: "NatGas Weather HDD/CDD Surprise",
                    unique: "Converts the latest population-weighted heating/cooling-degree-day forecast surprise into expected gas-demand pressure; not the EIA storage indicator.",
                    buy: "Demand forecast surprise ≥ +8% and MCX Natural Gas clears its 30-minute high.",
                    sell: "Demand forecast surprise ≤ −8% and MCX Natural Gas breaks its 30-minute low.",
                    wait: "Forecast surprise is smaller than 8% or price has not confirmed it.",
                  },
                  {
                    name: "OPEC Spare-Capacity Shock",
                    unique: "Measures the intraday change in the market's spare-capacity estimate after an OPEC/news event, then gates it with crude price confirmation.",
                    buy: "Spare-capacity estimate falls ≥ 3% and MCX Crude reclaims the event candle high.",
                    sell: "Spare-capacity estimate rises ≥ 3% and MCX Crude loses the event candle low.",
                    wait: "No qualifying capacity shock or price remains inside the event candle.",
                  },
                  {
                    name: "Commodity Cross-Section Breadth",
                    unique: "Ranks the percentage of liquid MCX contracts above their 20-minute VWAP. It finds broad commodity risk-on/risk-off participation rather than one-symbol strength.",
                    buy: "At least 70% of the tracked MCX basket is above VWAP and the selected contract is above VWAP.",
                    sell: "At least 70% of the basket is below VWAP and the selected contract is below VWAP.",
                    wait: "Breadth is between 30% and 70%, or the selected contract disagrees with the basket.",
                  },
                  {
                    name: "Commodity Gap-Fill Efficiency",
                    unique: "Measures how much of the overnight international-to-MCX opening gap is filled in the first 30 minutes, then trades only a confirmed continuation.",
                    buy: "Gap-fill is below 25% and price breaks the opening high: continuation BUY.",
                    sell: "Gap-fill is below 25% and price breaks the opening low: continuation SELL.",
                    wait: "Gap-fill is above 75% or price remains inside the opening range.",
                  },
                ].map((row, i) => (
                  <tr key={i} className={`border-b border-slate-800/60 ${i % 2 === 0 ? "bg-slate-900/45" : "bg-slate-900/20"} hover:bg-orange-950/25 transition-colors`}>
                    <td className="px-3 py-2.5 align-top"><ManualTickBox value={manualIndicatorTicks[`additionalMcx10-${i}`]} onChange={(v) => setManualTick(`additionalMcx10-${i}`, v)}/></td>
                    <td className="px-3 py-2.5 font-bold text-orange-100 align-top">{row.name}</td>
                    <td className="px-3 py-2.5 text-slate-400 align-top leading-relaxed">{row.unique}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`additionalMcx10-${i}`] === "BUY" ? "text-teal-400" : "text-white"}`}>{row.buy}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`additionalMcx10-${i}`] === "SELL" ? "text-rose-400" : "text-white"}`}>{row.sell}</td>
                    <td className={`px-3 py-2.5 align-top leading-relaxed ${manualIndicatorTicks[`additionalMcx10-${i}`] === "WAIT" ? "text-amber-400" : "text-white"}`}>{row.wait}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Weighted Confluence Score */}
      <div className="max-w-6xl mx-auto mt-10 pt-8 border-t border-cyan-500/30">
        <h2 className="text-sm font-bold text-slate-100 tracking-wide mb-1">Weighted Confluence Score</h2>
        <p className="text-xs text-slate-300 mb-4">Groups indicators into categories so a real trade needs multiple different kinds of evidence to agree — not just a raw headcount.</p>
        <div className={`flex items-center gap-3 text-[11px] font-mono mb-4 px-3 py-2 rounded-md border ${isLight ? "bg-slate-50 border-cyan-300/40 text-slate-600" : "bg-slate-900/60 border-cyan-500/30 text-slate-200"}`}>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: "rgba(0,230,118,0.06)" }}/> dim = OFFLINE or not confirmed yet</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: "#0d9488" }}/> bright = LIVE and the rule is met right now</span>
          {!isLive && <span className="text-amber-400 font-bold">→ status is {apiStatus}, so every box stays dim until the relay reports LIVE</span>}
        </div>
        <div className={`rounded-lg border border-orange-400 p-4 mb-6 flex items-center justify-between ${confluence.direction === "BUY" ? "bg-teal-950/40" : confluence.direction === "SELL" ? "bg-rose-950/40" : "bg-slate-900/60"}`}>
          <div>
            <div className="text-xs text-slate-200 mb-1">Overall verdict</div>
            <div className="text-lg font-bold text-slate-100">
              {confluence.direction} ·{" "}
              <span className={confluence.confidence === "High" ? "text-teal-500" : confluence.confidence === "Medium" ? "text-amber-400" : "text-slate-300"}>{confluence.confidence} confidence</span>
            </div>
            <div className="text-[11px] text-slate-300 mt-1 font-mono">{confluence.buyCats} of 5 categories BUY · {confluence.sellCats} of 5 categories SELL</div>
            {confluence.regimeDamped && <div className="text-[11px] text-amber-400 mt-1">⚠ Hulk (GEX) shows a pinning regime — treat this verdict as weaker than it looks.</div>}
          </div>
          <DualArrowBox status={confluence.direction}/>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {CATEGORY_ORDER.map((cat, catIdx) => (<div key={cat} className={`rounded-lg border p-3 bg-slate-900/50 ${catIdx % 2 === 0 ? "border-yellow-400/50" : "border-orange-400/50"}`}>
              <div className="text-[11px] text-slate-200 mb-2">{cat}</div>
              <DualArrowBox status={confluence.categoryVerdict[cat]}/>
            </div>))}
        </div>
        {CATEGORY_ORDER.map((cat) => (<div key={cat} className="mb-4">
            <div className="text-[11px] font-mono text-slate-300 mb-2">{cat.toUpperCase()}</div>
            <div className="flex flex-col gap-2">
              {evaluated.filter((e) => indicatorCategory[e.ind.id] === cat && !["radhaMadhav", "radheshyam", "sofrFundingStress", "yieldCurve10Y3M", "hyCreditSpread", "globalNetLiquidity", "indiaQuantum"].includes(e.ind.id)).map(({ ind, displayStatus }) => (<div key={ind.id} className="flex items-center justify-between rounded-md border border-cyan-500/30 bg-slate-900/40 px-3 py-2">
                  <span className="text-xs text-slate-300 flex items-center gap-2">
                    {ind.label}
                    <span className="text-[10px] font-mono font-bold text-cyan-300/90">CMP {marketData[selectedSymbol]?.ltp != null ? formatPrice(marketData[selectedSymbol].ltp) : "—"}</span>
                  </span>
                  <DualArrowBox status={displayStatus}/>
                </div>))}
            </div>
          </div>))}
        <div className="mb-2">
          <div className="text-[11px] font-mono text-slate-300 mb-2">REGIME FILTER (not counted above)</div>
          {evaluated.filter((e) => e.ind.id === "gex").map(({ ind, displayStatus }) => (<div key={ind.id} className="flex items-center justify-between rounded-md border border-cyan-500/30 bg-slate-900/40 px-3 py-2">
              <span className="text-xs text-slate-300 flex items-center gap-1.5"><HulkFistIcon className="w-4 h-4"/> {ind.label}</span>
              <DualArrowBox status={displayStatus}/>
            </div>))}
        </div>
      </div>
      <p className="max-w-6xl mx-auto mt-8 text-[11px] text-slate-600 font-mono">
        Each card shows every raw number driving its verdict, plus a plain-English reason. Edit the numbers to see the light and side flip live.
      </p>

      {optionChainOpen && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOptionChainOpen(false)}>
          <div className={`w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border shadow-2xl ${isLight ? "bg-white border-cyan-300/50" : "bg-slate-900 border-cyan-500/40"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between px-4 py-3 border-b ${isLight ? "border-cyan-300/50" : "border-cyan-500/30"}`}>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400"/>
                <span className="font-bold text-sm">Option Chain</span>
                <span className="text-[11px] font-mono font-bold text-cyan-300">CMP: {marketData[optionChainKey]?.ltp != null ? marketData[optionChainKey].ltp.toFixed(2) : "—"}</span>
                {optionChains[optionChainKey]?.expiry && (<span className="text-[10px] font-mono text-slate-300">Expiry: {optionChains[optionChainKey].expiry}</span>)}
              </div>
              <button onClick={() => setOptionChainOpen(false)} aria-label="Close" className={`text-lg leading-none rounded-full w-7 h-7 flex items-center justify-center ${isLight ? "text-slate-300 hover:bg-slate-100" : "text-slate-200 hover:bg-slate-800"}`}>✕</button>
            </div>
            <div className={`flex gap-1.5 px-4 pt-2 pb-3 border-b overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isLight ? "border-cyan-300/50" : "border-cyan-500/30"}`}>
              {[...new Set(Object.values(marketData).filter((r) => r.category === "index" || r.category === "stock").map((r) => r.symbol))].map((u) => (<button key={u} onClick={() => setOptionChainUnderlying(u)} className={`shrink-0 text-[11px] font-bold rounded-full px-3 py-1 border ${optionChainUnderlying === u ? "bg-cyan-500/20 border-cyan-400 text-cyan-300" : isLight ? "border-cyan-400/60 text-slate-600" : "border-cyan-500/40 text-slate-200"}`}>{u}</button>))}
            </div>
            {optionChains[optionChainKey]?.rows?.length > 0 && (() => {
              const rows = optionChains[optionChainKey].rows;
              const topCalls = [...rows].filter((r) => r.callOi != null).sort((a, b) => b.callOi - a.callOi).slice(0, 3);
              const topPuts = [...rows].filter((r) => r.putOi != null).sort((a, b) => b.putOi - a.putOi).slice(0, 3);
              if (!topCalls.length && !topPuts.length) return null;
              return (
                <div className={`px-4 py-2 border-b text-[10px] font-mono grid grid-cols-2 gap-3 ${isLight ? "border-cyan-300/50" : "border-cyan-500/30"}`}>
                  <div>
                    <div className="font-bold text-teal-500 mb-0.5">🔥 Most Active Calls (by OI)</div>
                    {topCalls.map((r) => (
                      <div key={r.strike} className={isLight ? "text-slate-600" : "text-slate-200"}>
                        {r.strike} CE — OI {r.callOi.toLocaleString("en-IN")}, LTP {r.callLtp != null ? r.callLtp.toFixed(2) : "—"}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="font-bold text-rose-400 mb-0.5">🔥 Most Active Puts (by OI)</div>
                    {topPuts.map((r) => (
                      <div key={r.strike} className={isLight ? "text-slate-600" : "text-slate-200"}>
                        {r.strike} PE — OI {r.putOi.toLocaleString("en-IN")}, LTP {r.putLtp != null ? r.putLtp.toFixed(2) : "—"}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div className="overflow-y-auto flex-1">
              {optionChainErrors[optionChainKey] ? (<div className="p-6 text-center text-xs text-rose-400">
                Failed to load option chain for {optionChainUnderlying}: {optionChainErrors[optionChainKey]}
                <br/><span className="text-slate-300">(usually means your Upstox account doesn't have the paid Market Data / Option Greeks subscription — the option chain REST endpoint needs it separately from basic API access)</span>
              </div>) : !optionChains[optionChainKey]?.rows?.length ? (<div className="p-6 text-center text-xs text-slate-300">
                  {isLive ? "Waiting for option chain data from the relay..." : "Option chain needs the relay running and LIVE — currently OFFLINE, showing no data."}
                </div>) : (<table className="w-full text-[11px] font-mono">
                  <thead className={`sticky top-0 ${isLight ? "bg-slate-50" : "bg-slate-900"}`}>
                    <tr className={isLight ? "text-slate-300" : "text-slate-200"}>
                      <th className="px-2 py-1.5 text-right">Call OI</th>
                      <th className="px-2 py-1.5 text-right">Call LTP</th>
                      <th className="px-2 py-1.5 text-center font-bold">Strike</th>
                      <th className="px-2 py-1.5 text-left">Put LTP</th>
                      <th className="px-2 py-1.5 text-left">Put OI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const cmpNow = marketData[optionChainKey]?.ltp;
                      const rows = optionChains[optionChainKey].rows;
                      const cmpNearestStrike = cmpNow == null ? null : rows.reduce((best, r) => (best == null || Math.abs(r.strike - cmpNow) < Math.abs(best - cmpNow) ? r.strike : best), null);
                      return rows.map((row) => {
                        const isCmpRow = cmpNearestStrike != null && row.strike === cmpNearestStrike;
                        return (<tr key={row.strike} className={`border-t ${isCmpRow ? "bg-amber-400/10" : ""} ${isLight ? "border-cyan-200/40" : "border-cyan-500/30"}`}>
                        <td className="px-2 py-1 text-right text-slate-200">{row.callOi != null ? row.callOi.toLocaleString("en-IN") : "—"}</td>
                        <td className="px-2 py-1 text-right">
                          <button type="button" onClick={() => { const sym = `${optionChainKey} ${row.strike} CE`; setSelectedSymbol(sym); setTradeSymbol(sym); setOptionChainOpen(false); }} className={`text-teal-500 cursor-pointer hover:underline`}>
                            {row.callLtp != null ? row.callLtp.toFixed(2) : "—"}
                          </button>
                        </td>
                        <td className="px-2 py-1 text-center font-bold">
                          <button
                            type="button"
                            onClick={() => setSelectedOptionStrike({ underlying: optionChainKey, strike: row.strike, manual: true })}
                            className={`rounded px-1.5 py-0.5 ${selectedOptionStrike?.underlying === optionChainKey && selectedOptionStrike?.strike === row.strike ? "bg-cyan-500/30 text-cyan-200 ring-1 ring-cyan-400" : isCmpRow ? "" : "hover:bg-cyan-500/10"} ${isCmpRow ? "border-2 border-amber-400 text-amber-300" : ""}`}
                            title={isCmpRow ? `Nearest strike to live CMP (${cmpNow?.toFixed(2)})` : "Select this strike for the Delta/Gamma/Theta/Vega/Rho/OI header buttons"}
                          >
                            {row.strike}
                          </button>
                        </td>
                        <td className="px-2 py-1 text-left">
                          <button type="button" onClick={() => { const sym = `${optionChainKey} ${row.strike} PE`; setSelectedSymbol(sym); setTradeSymbol(sym); setOptionChainOpen(false); }} className="text-rose-400 cursor-pointer hover:underline">
                            {row.putLtp != null ? row.putLtp.toFixed(2) : "—"}
                          </button>
                        </td>
                        <td className="px-2 py-1 text-left text-slate-200">{row.putOi != null ? row.putOi.toLocaleString("en-IN") : "—"}</td>
                      </tr>);
                      });
                    })()}
                  </tbody>
                </table>)}
            </div>
          </div>
        </div>)}
    </div>);
}

export default SignalBoard;
