import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import {
  useWallet, useFlip, useSeats, useProtocol, useToasts, addToast, dismissToast, EXPLORER,
  useGlobalFeed, useTokenBalance, useUserProfile,
} from "./hooks.js";

const Coin3D = lazy(() => import("./Coin3D.jsx"));
import {
  getPlayerInfo, getTreasuryMaxBet, getSeatInfo, decodeError,
  mintSeat as mintSeatFn, buyOutSeat as buyOutSeatFn, takeOverMultiple as takeOverMultipleFn,
  approveFlipperForSeats as approveFlipperFn, mintSeatNoApprove as mintSeatNoApproveFn,
  addDeposit as addDepositFn, withdrawDeposit as withdrawDepositFn,
  claimRewards as claimRewardsFn, claimMultipleRewards as claimMultipleRewardsFn,
  updateSeatPrice as updateSeatPriceFn, abandonSeat as abandonSeatFn,
  distributeYield as distributeYieldFn, claimMockFlipper as claimMockFlipperFn,
  fmtTokens,
} from "./contract.js";
import {
  COINFLIP_ADDRESS, SEATS_ADDRESS, MOCK_FLIPPER_ADDRESS,
  TIERS, CHAIN_ID, CHAIN_ID_HEX, TOTAL_SEATS,
  LEVEL_NAMES, LEVEL_COLORS,
  PROFILES_API, ADMIN_PASSWORD, FLAUNCH_URL, TWITTER_URL, WEBSITE_URL,
} from "./config.js";
import { parseEther, parseUnits, formatEther, formatUnits } from "ethers";
import { audio, vibrate } from "./audio.js";
import confetti from "canvas-confetti";

// V7 used a single `CONTRACT_ADDRESS` for the house/treasury; in V8 that role is Coinflip's address.
const CONTRACT_ADDRESS = COINFLIP_ADDRESS;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function getReferralFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    return ref ? parseInt(ref, 10) || 0 : 0;
  } catch { return 0; }
}

// V8: single source of truth for number formatting. American format:
// `.` decimal separator, `,` thousands separator. Replaces scattered
// `.toFixed()` / `toLocaleString()` calls so the whole app is consistent.
function fmtNum(n, decimals = 4) {
  const v = typeof n === "bigint" ? Number(n) : Number(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

const shortAddr = (a) => a ? `${a.slice(0,6)}...${a.slice(-4)}` : "???";
const addrColor = (a) => {
  if (!a || a === ZERO_ADDRESS) return "#444";
  const h = parseInt(a.slice(2,8), 16);
  const hue = h % 360;
  return `hsl(${hue}, 60%, 55%)`;
};

// ═══════════════════════════════════════
//  CASINO CSS — No Tailwind
// ═══════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

:root {
  --bg-deep: #07090d;
  --bg-main: #0a0d13;
  --bg-card: #0d1118;
  --bg-card-hover: #131820;
  --bg-elevated: #131820;
  --border: rgba(255,255,255,0.04);
  --border-light: rgba(255,255,255,0.06);
  --border-strong: rgba(255,255,255,0.1);
  --border-gold: rgba(247,179,43,0.2);

  --gold: #f7b32b;
  --gold-bright: #ffc94a;
  --gold-glow: rgba(247,179,43,0.25);
  --gold-dark: #d4a020;
  --gold-deep: #a87a18;

  --green: #22c55e;
  --green-glow: rgba(34,197,94,0.3);
  --red: #ef4444;
  --red-glow: rgba(239,68,68,0.3);

  --text: #e8eef5;
  --text-dim: #c0c8d4;
  --text-muted: #5a6577;
  --text-faint: #3d4756;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg-deep); color: var(--text); font-family: 'Chakra Petch', sans-serif; }
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }

/* ═══ KEYFRAMES ═══ */
@keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
@keyframes coinGlow { 0%,100% { opacity: 0.2; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.05); } }
@keyframes float { 0% { transform: translateY(0) translateX(0); opacity: 0.3; } 50% { transform: translateY(-20px) translateX(10px); opacity: 0.7; } 100% { transform: translateY(0) translateX(0); opacity: 0.3; } }
@keyframes shimmer { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes shake { 0%,100% { transform: translateX(0); } 15% { transform: translateX(-8px); } 30% { transform: translateX(8px); } 45% { transform: translateX(-6px); } 60% { transform: translateX(6px); } 75% { transform: translateX(-3px); } 90% { transform: translateX(3px); } }
@keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 20px var(--gold-glow), 0 0 40px #f7b32b20; }
  50% { box-shadow: 0 0 35px var(--gold-glow), 0 0 70px #f7b32b30; }
}
@keyframes borderGlow {
  0% { box-shadow: 0 0 15px #f7b32b30, 0 0 30px #f7b32b15, inset 0 0 30px #f7b32b08; }
  33% { box-shadow: 0 0 15px #ffd70030, 0 0 30px #ffd70015, inset 0 0 30px #ffd70008; }
  66% { box-shadow: 0 0 15px #b8860b30, 0 0 30px #b8860b15, inset 0 0 30px #b8860b08; }
  100% { box-shadow: 0 0 15px #f7b32b30, 0 0 30px #f7b32b15, inset 0 0 30px #f7b32b08; }
}
@keyframes searchPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
@keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes flashBright { 0%, 100% { opacity: 0.1; } 50% { opacity: 0.6; } }
@keyframes scrollTicker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.2); } }
@keyframes scaleIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes roomPulse { 0%, 100% { border-color: #22c55e15; } 50% { border-color: #22c55e35; } }
@keyframes liveDot { 0%, 100% { opacity: 1; box-shadow: 0 0 8px var(--gold); } 50% { opacity: 0.4; box-shadow: 0 0 4px var(--gold); } }
@keyframes cardTopGlow { 0%, 100% { box-shadow: 0 0 30px rgba(247,179,43,0.08); } 50% { box-shadow: 0 0 50px rgba(247,179,43,0.18); } }
@keyframes feedSlide { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes shimmerLine { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }

/* ═══ COIN STAGE — DUEL LAYOUT ═══ */
.coin-wrapper {
  position: relative; border-radius: 16px; padding: 3px;
  margin: 0 auto 20px; max-width: 620px;
}

/* Spinning border: oversized pseudo-element rotated with transform */
.coin-wrapper .border-spin {
  position: absolute; inset: -2px; border-radius: 18px;
  opacity: 0; overflow: hidden; transition: opacity 0.3s;
}
.coin-wrapper.spinning .border-spin { opacity: 1; }
.coin-wrapper .border-spin::before {
  content: ''; position: absolute; inset: -50%;
  background: conic-gradient(
    transparent 0deg, transparent 60deg,
    #b8860b 120deg, #f7b32b 160deg, #ffd700 200deg,
    #f7b32b 240deg, #b8860b 280deg,
    transparent 300deg, transparent 360deg
  );
  animation: spinBorderReal 0.8s linear infinite;
}
@keyframes spinBorderReal { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* Result flash */
.coin-wrapper .border-flash { position: absolute; inset: 0; border-radius: 16px; opacity: 0; }
.coin-wrapper.result-win .border-flash { animation: flashToGreen 1.8s ease forwards; }
.coin-wrapper.result-lose .border-flash { animation: flashToRed 1.8s ease forwards; }

@keyframes flashToGreen {
  0% { background: #f7b32b; opacity: 0.5; } 30% { background: #f7b32b; opacity: 0.03; }
  50% { background: #22c55e; opacity: 0; } 70% { background: #22c55e; opacity: 0.45; }
  100% { background: #22c55e; opacity: 0.12; }
}
@keyframes flashToRed {
  0% { background: #f7b32b; opacity: 0.5; } 30% { background: #f7b32b; opacity: 0.03; }
  50% { background: #ef4444; opacity: 0; } 70% { background: #ef4444; opacity: 0.45; }
  100% { background: #ef4444; opacity: 0.12; }
}

.coin-stage-inner {
  position: relative; z-index: 1; border-radius: 13px; overflow: hidden;
  background: #0b0e11; padding: 20px 16px 16px;
}
.coin-stage-inner .grid-overlay {
  position: absolute; inset: 0; opacity: 0.03; pointer-events: none;
  background-image: linear-gradient(#f7b32b 1px, transparent 1px), linear-gradient(90deg, #f7b32b 1px, transparent 1px);
  background-size: 28px 28px;
}
.coin-stage-inner .glow-bg {
  position: absolute; inset: 0; pointer-events: none; transition: all 0.8s ease;
  background: radial-gradient(ellipse at 50% 45%, #f7b32b08 0%, transparent 50%);
}
.coin-wrapper.spinning .glow-bg { background: radial-gradient(ellipse at 50% 45%, #f7b32b1a 0%, transparent 55%); }
.coin-wrapper.result-win .glow-bg { background: radial-gradient(ellipse at 50% 45%, #22c55e15 0%, transparent 55%); }
.coin-wrapper.result-lose .glow-bg { background: radial-gradient(ellipse at 50% 45%, #ef444412 0%, transparent 55%); }

.connector-line {
  position: absolute; top: 50%; left: 0; right: 0; height: 1px; z-index: 1;
  background: linear-gradient(90deg, transparent 5%, #f7b32b10 25%, #f7b32b10 75%, transparent 95%);
  transition: all 0.5s;
}
.coin-wrapper.spinning .connector-line {
  background: linear-gradient(90deg, transparent 5%, #f7b32b25 25%, #f7b32b25 75%, transparent 95%);
  animation: connPulse 0.8s ease infinite;
}
@keyframes connPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.coin-wrapper.result-win .connector-line { background: linear-gradient(90deg, transparent 5%, #22c55e18 25%, #22c55e18 75%, transparent 95%); }
.coin-wrapper.result-lose .connector-line { background: linear-gradient(90deg, transparent 5%, #ef444415 25%, #ef444415 75%, transparent 95%); }

.arena { display: flex; align-items: center; justify-content: space-between; padding: 20px 10px; position: relative; z-index: 2; min-height: 200px; }
.arena-player { display: flex; flex-direction: column; align-items: center; width: 120px; flex-shrink: 0; transition: all 0.6s ease; }
.arena-player.winner { transform: scale(1.06); }
.arena-player.loser { transform: scale(0.9); opacity: 0.45; }

.arena-avatar {
  width: 52px; height: 52px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: 'Orbitron', sans-serif; font-size: 15px; font-weight: 800; color: #fff;
  border: 3px solid #1c2430; transition: all 0.6s;
}
.arena-avatar.avatar-you { background: linear-gradient(135deg, #2563eb, #3b82f6); border-color: #3b82f640; }
.arena-avatar.avatar-opp { background: linear-gradient(135deg, #b8860b, #f7b32b); border-color: #f7b32b40; }
.arena-avatar.avatar-win { border-color: #22c55e; box-shadow: 0 0 18px #22c55e30; }
.arena-avatar.avatar-lose { border-color: #ef4444; box-shadow: 0 0 12px #ef444420; opacity: 0.6; }
.arena-avatar.avatar-bounce { animation: avatarBounce 1s ease infinite; }
@keyframes avatarBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }

.arena-name { font-size: 12px; font-weight: 700; color: #c8d0da; margin-top: 8px; transition: color 0.5s; }
.arena-name.name-win { color: #22c55e; }
.arena-name.name-lose { color: #94a3b8; opacity: 0.5; }

.arena-bet {
  margin-top: 4px; padding: 3px 10px; border-radius: 6px;
  background: #131820; border: 1px solid #1c2430;
  font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #f7b32b;
  transition: all 0.5s;
}
.arena-bet.bet-win { border-color: #22c55e30; color: #22c55e; background: #22c55e08; }
.arena-bet.bet-lose { border-color: #ef444425; color: #ef4444; background: #ef444408; }

.vs-area { display: flex; flex-direction: column; align-items: center; flex: 1; min-width: 160px; max-width: 240px; padding: 0 8px; }
.vs-text { font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 700; color: #374151; letter-spacing: 4px; margin-bottom: 8px; height: 14px; transition: opacity 0.3s; }
.coin-wrapper.spinning .vs-text { opacity: 0; }

.coin-3d-container { width: 160px; height: 160px; position: relative; }

.prize-pool { margin-top: 10px; text-align: center; }
.prize-label { font-size: 8px; color: #374151; letter-spacing: 2px; font-weight: 700; }
.prize-value { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; color: #f7b32b; margin-top: 1px; transition: color 0.5s; }
.prize-value.prize-win { color: #22c55e; }
.prize-value.prize-lose { color: #ef4444; }

.result-zone { min-height: 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; z-index: 10; margin-top: 8px; }
.result-text-new { font-family: 'Orbitron', sans-serif; font-size: 20px; font-weight: 900; letter-spacing: 5px; opacity: 0; transition: opacity 0.4s ease 0.5s; }
.result-text-new.visible { opacity: 1; }
.result-text-new.win-text { color: #22c55e; }
.result-text-new.lose-text { color: #ef4444; }

.result-amount { font-family: 'JetBrains Mono', monospace; font-size: 12px; opacity: 0; transition: opacity 0.4s ease 0.8s; margin-top: 3px; }
.result-amount.visible { opacity: 1; }
.result-amount.win-amount { color: #22c55e90; }
.result-amount.lose-amount { color: #ef444490; }

.result-actions { display: flex; gap: 8px; margin-top: 10px; opacity: 0; transition: opacity 0.4s ease 1.2s; }
.result-actions.visible { opacity: 1; }
.action-btn { padding: 8px 20px; border-radius: 8px; font-family: 'Chakra Petch', sans-serif; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; border: none; }
.action-btn:hover { transform: translateY(-1px); }
.action-btn.btn-rematch { background: linear-gradient(135deg, #b8860b, #f7b32b); color: #0b0e11; box-shadow: 0 0 15px #f7b32b25; }
.action-btn.btn-rematch:hover { box-shadow: 0 0 25px #f7b32b40; }
.action-btn.btn-double { background: transparent; border: 1px solid #22c55e50; color: #22c55e; }
.action-btn.btn-double:hover { background: #22c55e10; box-shadow: 0 0 15px #22c55e20; }
.action-btn.btn-change { background: transparent; border: 1px solid #1c2430; color: #94a3b8; }
.action-btn.btn-change:hover { background: #151a22; }

.streak-bar { display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 10px; min-height: 20px; position: relative; z-index: 2; }
.streak-dot { width: 18px; height: 18px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 800; font-family: 'JetBrains Mono', monospace; transition: all 0.3s; }
.streak-dot.streak-win { background: #22c55e18; border: 1px solid #22c55e40; color: #22c55e; }
.streak-dot.streak-lose { background: #ef444418; border: 1px solid #ef444440; color: #ef4444; }
.streak-dot.streak-new { animation: streakPop 0.3s ease; }
@keyframes streakPop { 0% { transform: scale(0); } 50% { transform: scale(1.3); } 100% { transform: scale(1); } }

.jackpot-bar { margin-top: 14px; padding: 0 4px; position: relative; z-index: 2; }
.jackpot-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.jackpot-label { font-size: 9px; color: #475569; letter-spacing: 1.5px; font-weight: 700; }
.jackpot-value { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #f7b32b; font-weight: 600; }
.jackpot-track { height: 4px; background: #151a22; border-radius: 2px; overflow: hidden; }
.jackpot-fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg, #b8860b, #f7b32b, #ffd700); transition: width 1s ease; }
.jackpot-note { font-size: 9px; color: #374151; text-align: center; margin-top: 4px; transition: color 0.3s; }
.jackpot-note.jackpot-hot { color: #f7b32b80; animation: jackpotPulse 1.5s ease infinite; }
@keyframes jackpotPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }

/* ═══ 3-COLUMN LAYOUT ═══ */
.app-root {
  height: 100vh; width: 100vw; overflow: hidden;
  display: grid;
  grid-template-columns: 280px 1fr 300px;
  background: linear-gradient(180deg, #07090d 0%, #0a0d13 100%);
  position: relative;
}
.app-root::before {
  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  opacity: 0.015;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
}

/* ═══ SIDEBAR TEXTURE ═══ */
.sidebar-texture { position: relative; }
.sidebar-texture::after {
  content: ''; position: absolute; inset: 0; opacity: 0.02; pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* ═══ CHAT SIDEBAR (LEFT) ═══ */
.chat-sidebar {
  display: flex; flex-direction: column; height: 100%;
  background: linear-gradient(180deg, #0a0d14 0%, #07090d 100%);
  border-right: 1px solid var(--border);
  position: relative; z-index: 1;
}
.chat-header {
  padding: 16px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 8px;
}
.chat-header h2 { font-size: 14px; font-weight: 700; color: var(--text); }
.online-badge { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim); }
.online-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px #22c55e60; animation: blink 2s infinite; }

.chat-messages { flex: 1; overflow-y: auto; padding: 0; display: flex; flex-direction: column; gap: 0; background: transparent; }
.chat-msg { display: flex; align-items: flex-start; gap: 8px; padding: 10px 18px; border-bottom: 1px solid #0e1219; }
.chat-avatar {
  width: 32px; height: 32px; min-width: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700; color: #fff;
  font-family: 'JetBrains Mono', monospace;
}
.chat-msg-content { flex: 1; min-width: 0; }
.chat-name { font-size: 12px; font-weight: 600; }
.chat-level {
  display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 6px;
  border-radius: 4px; background: #f7b32b20; color: var(--gold);
  margin-left: 6px; vertical-align: middle; font-family: 'JetBrains Mono', monospace;
}
.chat-text { font-size: 12px; color: var(--text-dim); word-break: break-word; margin-top: 2px; }
.chat-input-area { padding: 12px; border-top: 1px solid var(--border); }
.chat-input-wrap {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-elevated); border-radius: 8px; padding: 8px 12px;
}
.chat-input-wrap input {
  flex: 1; background: transparent; border: none; outline: none;
  font-size: 12px; color: var(--text); font-family: 'Chakra Petch', sans-serif;
}
.chat-input-wrap input::placeholder { color: var(--text-muted); }
.chat-send-btn {
  padding: 6px 10px; border-radius: 6px; border: none; cursor: pointer;
  background: #f7b32b20; color: var(--gold); font-size: 14px; transition: all 0.2s;
}
.chat-send-btn:hover { background: #f7b32b30; }

/* ═══ CENTER GAME AREA ═══ */
.game-center {
  border-left: 1px solid var(--border); border-right: 1px solid var(--border);
  overflow: hidden; display: flex; flex-direction: column;
  position: relative; z-index: 1;
  background: transparent;
}
.game-topbar {
  height: 56px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(247,179,43,0.02), transparent); flex-shrink: 0;
  position: relative;
}
.game-topbar::after {
  content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent 10%, rgba(247,179,43,0.15) 50%, transparent 90%);
}
.logo { display: flex; align-items: center; gap: 8px; }
.logo-text { font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 900; letter-spacing: 3px; }
.logo-gold { color: var(--gold); }
.logo-dim { color: var(--text-muted); }
.logo-badge {
  font-size: 9px; font-weight: 800; letter-spacing: 1px; padding: 3px 8px;
  border-radius: 4px; background: linear-gradient(135deg, var(--gold), var(--gold-dark));
  color: #07090d; border: none;
}
.nav { display: flex; gap: 4px; padding: 3px; background: rgba(255,255,255,0.03); border-radius: 8px; }
.nav-btn {
  padding: 8px 18px; border: none; background: transparent; color: var(--text-muted);
  font-size: 12px; font-weight: 600; font-family: 'Chakra Petch', sans-serif;
  cursor: pointer; border-radius: 6px; transition: all 0.2s; position: relative;
}
.nav-btn:hover { color: var(--text-dim); }
.nav-btn.active { background: linear-gradient(135deg, var(--gold), #c98c1d); color: #07090d; font-weight: 700; }
.nav-btn.active::after { display: none; }
.header-right { display: flex; align-items: center; gap: 10px; }
.connect-btn {
  padding: 8px 20px; border: none; border-radius: 10px; font-size: 13px;
  font-weight: 800; font-family: 'Chakra Petch', sans-serif; cursor: pointer;
  background: linear-gradient(135deg, var(--gold), var(--gold-dark)); color: #07090d;
  box-shadow: 0 4px 16px rgba(247,179,43,0.3); transition: all 0.2s; letter-spacing: 0.5px;
}
.connect-btn:hover { box-shadow: 0 6px 24px rgba(247,179,43,0.45); transform: translateY(-1px); }
.addr-pill {
  padding: 6px 14px; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; font-size: 12px; color: var(--text-dim); cursor: pointer;
  font-family: 'JetBrains Mono', monospace; transition: all 0.2s;
}
.addr-pill:hover { border-color: var(--border-light); }

.game-scroll { flex: 1; overflow-y: auto; }

/* Hero section */
.hero-section {
  position: relative; padding: 36px 24px 24px; text-align: center;
}
.hero-section::before {
  content: ''; position: absolute; inset: 0;
  background-image: linear-gradient(rgba(247,179,43,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(247,179,43,0.03) 1px, transparent 1px);
  background-size: 40px 40px; opacity: 0.5; pointer-events: none;
}
.hero-section::after {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, rgba(247,179,43,0.06) 0%, transparent 60%);
  pointer-events: none;
}
.hero-inner { position: relative; z-index: 1; }
.hero-title-text {
  font-family: 'Orbitron', sans-serif;
  font-size: 56px; font-weight: 900; letter-spacing: 8px; margin-bottom: 4px;
  background: linear-gradient(180deg, #ffc94a 0%, #f7b32b 50%, #a87a18 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text; line-height: 1;
}
.hero-sub { color: var(--text-muted); font-size: 13px; margin-bottom: 20px; letter-spacing: 0.5px; }

/* (coin stage styles above in DUEL LAYOUT section) */

/* Flip button */
.flip-btn-main {
  width: 100%; max-width: 400px; padding: 24px 0; border-radius: 14px; border: none;
  background: linear-gradient(135deg, #b8860b, #f7b32b, #ffd700);
  color: #0b0e11; font-size: 20px; font-weight: 800; cursor: pointer;
  font-family: 'Chakra Petch', sans-serif; letter-spacing: 1px;
  box-shadow: 0 0 30px #f7b32b40, 0 0 60px #f7b32b15;
  transition: all 0.2s; position: relative; overflow: hidden;
}
.flip-btn-main:not(:disabled) { animation: pulse-glow 2.5s ease infinite; }
.flip-btn-main::before {
  content: ''; position: absolute; top: -50%; left: -50%;
  width: 200%; height: 200%;
  background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%);
  transform: translateX(-100%); transition: transform 0.6s;
}
.flip-btn-main:hover::before { transform: translateX(100%); }
.flip-btn-main:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 0 40px #f7b32b60, 0 0 80px #f7b32b25; }
.flip-btn-main:disabled { opacity: 0.4; cursor: not-allowed; transform: none; animation: none; }
.flip-btn-main:disabled::before { display: none; }
.flip-sub { font-size: 12px; font-weight: 500; opacity: 0.7; margin-top: 4px; }

/* Tier bar */
.tier-bar { display: flex; gap: 6px; justify-content: center; margin-bottom: 24px; }
.tier-btn {
  padding: 10px 16px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg-card); color: var(--text-muted); font-size: 13px; font-weight: 600;
  font-family: 'JetBrains Mono', monospace; cursor: pointer; transition: all 0.25s;
}
.tier-btn:hover { border-color: var(--border-light); color: var(--text-dim); }
.tier-btn.active {
  border-color: var(--gold); color: var(--gold); background: #f7b32b12;
  box-shadow: 0 0 20px #f7b32b30;
}

/* Game lobby */
.games-section { padding: 0 24px 24px; }
.games-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
}
.games-header h2 {
  font-size: 15px; font-weight: 700; color: var(--text);
  display: flex; align-items: center; gap: 8px;
}
.games-count { font-size: 12px; color: var(--text-muted); }

.game-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; margin-bottom: 8px;
  background: linear-gradient(135deg, var(--bg-card), #121720);
  border: 1px solid var(--border); border-radius: 12px;
  transition: all 0.25s; gap: 12px;
}
.game-row:hover { border-color: #f7b32b40; box-shadow: 0 0 15px #f7b32b10; }

.game-players { display: flex; align-items: center; gap: 10px; }
.game-avatar {
  width: 40px; height: 40px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; font-size: 12px;
  font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace;
}
.game-avatar-empty {
  width: 40px; height: 40px; border-radius: 50%;
  border: 2px dashed var(--border); display: flex;
  align-items: center; justify-content: center;
  font-size: 18px; color: var(--text-muted);
}
.game-vs { font-size: 12px; color: var(--text-muted); font-weight: 700; }
.game-amount { text-align: center; }
.game-amount-val {
  font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 700; color: var(--gold);
}
.game-amount-prize { font-size: 11px; color: var(--text-muted); }

.game-actions { display: flex; align-items: center; gap: 10px; }
.game-status {
  display: inline-block; padding: 4px 12px; border-radius: 20px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
}
.status-open { background: #22c55e20; color: var(--green); border: 1px solid #22c55e30; }
.status-searching { background: #f7b32b20; color: var(--gold); border: 1px solid #f7b32b40; animation: searchPulse 1.5s ease infinite; }
.status-done { background: var(--bg-elevated); color: var(--text-muted); }

.join-btn {
  padding: 8px 20px; border: none; border-radius: 8px;
  background: linear-gradient(135deg, #16a34a, #22c55e);
  color: #fff; font-size: 12px; font-weight: 700; cursor: pointer;
  font-family: 'Chakra Petch', sans-serif; transition: all 0.2s;
  box-shadow: 0 0 12px #22c55e25;
}
.join-btn:hover { box-shadow: 0 0 20px #22c55e50; transform: scale(1.05); }
.cancel-btn {
  padding: 8px 16px; border: 1px solid var(--red); border-radius: 8px;
  background: transparent; color: var(--red); font-size: 11px; font-weight: 600;
  cursor: pointer; font-family: 'Chakra Petch', sans-serif; transition: all 0.2s;
}
.cancel-btn:hover { background: #ef444410; }

/* ═══ STATS SIDEBAR (RIGHT) ═══ */
.stats-sidebar {
  display: flex; flex-direction: column; height: 100%;
  background: linear-gradient(180deg, #0a0d14 0%, #07090d 100%);
  border-left: 1px solid var(--border);
  overflow-y: auto; position: relative; z-index: 1;
}
.stats-section { padding: 16px; border-bottom: 1px solid var(--border); }
.stats-label {
  font-size: 11px; font-weight: 700; color: var(--text-muted);
  letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px;
}
.balance-display {
  font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 700;
  color: var(--gold); transition: all 0.3s;
}
.balance-display.has-bal { text-shadow: 0 0 20px #f7b32b50, 0 0 40px #f7b32b30; }
.balance-unit { font-size: 14px; color: var(--text-dim); }

.quick-btns { display: flex; flex-wrap: wrap; gap: 6px; }
.quick-btn {
  padding: 6px 12px; border: none; border-radius: 8px;
  background: var(--bg-elevated); color: var(--text-muted); font-size: 11px;
  font-family: 'JetBrains Mono', monospace; font-weight: 600; cursor: pointer;
  transition: all 0.2s;
}
.quick-btn:hover { background: #f7b32b15; color: var(--gold); }
.quick-btn.active { background: #f7b32b20; color: var(--gold); box-shadow: 0 0 15px #f7b32b30; }

.stats-input {
  width: 100%; background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: 8px; padding: 10px 12px; color: var(--text); font-size: 13px;
  font-family: 'JetBrains Mono', monospace; outline: none; transition: all 0.2s;
}
.stats-input:focus { border-color: var(--gold); box-shadow: 0 0 10px #f7b32b15; }

.action-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.btn-deposit {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px; border-radius: 8px; font-size: 12px;
  font-weight: 700; font-family: 'Chakra Petch', sans-serif; cursor: pointer;
  background: #f7b32b20; color: var(--gold); border: 1px solid #f7b32b30;
  transition: all 0.2s;
}
.btn-deposit:hover { background: #f7b32b30; }
.btn-deposit:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-withdraw {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px; border: 1px solid #ef444430; border-radius: 8px; font-size: 12px;
  font-weight: 700; font-family: 'Chakra Petch', sans-serif; cursor: pointer;
  background: #ef444420; color: var(--red); transition: all 0.2s;
}
.btn-withdraw:hover { background: #ef444430; }
.btn-withdraw:disabled { opacity: 0.4; cursor: not-allowed; }

.protocol-row {
  display: flex; align-items: center; justify-content: space-between; padding: 6px 0;
}
.protocol-row-label { display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 13px; }
.protocol-row-label::before { content: ''; width: 4px; height: 4px; border-radius: 50%; background: #f7b32b40; flex-shrink: 0; }
.protocol-row-val { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; color: var(--text); }

.player-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.player-stat-card {
  background: var(--bg-elevated); border-radius: 8px; padding: 12px; text-align: center;
}
.player-stat-val { font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 700; }
.player-stat-label { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

.streak-banner {
  padding: 12px; border-radius: 8px; margin-top: 12px;
  background: linear-gradient(135deg, #f7b32b15, #ef444415);
  border: 1px solid #f7b32b30;
}

/* (result styles in DUEL LAYOUT section) */

/* Toasts */
.toast-container { position: fixed; top: 16px; right: 16px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; }
.toast {
  padding: 12px 18px; border-radius: 10px; font-size: 12px; font-weight: 500;
  animation: slideIn 0.3s ease; min-width: 250px; border: 1px solid; cursor: pointer;
  backdrop-filter: blur(8px);
}
.toast-success { background: #22c55e18; border-color: #22c55e30; color: var(--green); }
.toast-error { background: #ef444418; border-color: #ef444430; color: var(--red); }
.toast-pending { background: #f7b32b18; border-color: #f7b32b30; color: var(--gold); }
.toast-info { background: #f7b32b18; border-color: #f7b32b30; color: var(--gold); }

.empty-state { text-align: center; padding: 30px 20px; color: var(--text-muted); font-size: 13px; }

/* Section label */
.section-label {
  font-size: 12px; font-weight: 700; color: var(--text-muted);
  letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px;
}

/* Fair page */
.fair-section { padding: 24px; max-width: 600px; }
.fair-section p { font-size: 13px; color: var(--text-dim); line-height: 1.8; margin-bottom: 20px; }
.fair-code {
  padding: 18px; background: var(--bg-card); border-radius: 10px;
  border: 1px solid var(--border); font-family: 'JetBrains Mono', monospace;
  font-size: 11px; line-height: 2; color: var(--text-dim);
}
.fee-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.fee-item {
  display: flex; justify-content: space-between; padding: 10px 14px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
}

/* ═══ BOARD ═══ */
.board-container { display: flex; height: 100%; overflow: hidden; }
.board-left { width: 200px; min-width: 200px; border-right: 1px solid #151b25; padding: 14px; overflow-y: auto; background: linear-gradient(180deg, #0d1118, #0a0d13); }
.board-grid-area { flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; }
.board-right { width: 200px; min-width: 200px; border-left: 1px solid #151b25; padding: 14px; overflow-y: auto; background: linear-gradient(180deg, #0d1118, #0a0d13); }
.board-label { font-size: 10px; color: #475569; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 10px; }
.board-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 16px; }
.board-stat-card { background: #131820; border-radius: 8px; padding: 10px 8px; text-align: center; }
.board-stat-value { font-size: 18px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
.board-stat-label { font-size: 9px; color: #475569; margin-top: 2px; }
.board-info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #111820; font-size: 11px; }
.board-info-label { color: #475569; }
.board-info-value { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: #e2e8f0; }
.holder-row { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid #111820; }
.holder-rank { font-size: 11px; font-weight: 700; color: #475569; width: 16px; }
.holder-avatar { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 7px; font-weight: 800; color: #fff; }
.holder-name { font-size: 11px; font-weight: 600; color: #c8d0da; flex: 1; }
.holder-count { font-size: 11px; font-weight: 700; color: #f7b32b; font-family: 'JetBrains Mono', monospace; }
.seat-grid { display: grid; grid-template-columns: repeat(16, 1fr); gap: 2px; }
.seat-tile { aspect-ratio: 1; border-radius: 4px; cursor: pointer; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; transition: all 0.15s; border: 2px solid transparent; }
.seat-tile:hover { transform: scale(1.15); z-index: 5; }
.seat-tile.tile-empty { background: #0d1118; border-color: #131820; }
.seat-tile.tile-empty:hover { border-color: #1c2430; }
.seat-tile.tile-owned { border-color: #1c2430; }
.seat-tile.tile-owned:hover { border-color: #f7b32b50; }
.seat-tile.tile-mine { border-color: #f7b32b60; }
.seat-tile.tile-mine:hover { border-color: #f7b32b; }
.tile-avatar { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 6px; font-weight: 800; color: #fff; margin-bottom: 1px; }
.tile-id { font-size: 7px; color: #374151; font-weight: 600; }
.tile-price { position: absolute; bottom: 0; left: 0; right: 0; text-align: center; font-size: 7px; font-weight: 700; color: #f7b32b; font-family: 'JetBrains Mono', monospace; background: #0b0e11cc; padding: 1px 0; border-radius: 0 0 2px 2px; }
.activity-item { padding: 8px 0; border-bottom: 1px solid #111820; }
.activity-head { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.activity-avatar { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 6px; font-weight: 800; color: #fff; }
.activity-name { font-size: 10px; font-weight: 600; color: #c8d0da; }
.activity-detail { display: flex; justify-content: space-between; font-size: 9px; }
.activity-action { color: #475569; }
.activity-price { color: #f7b32b; font-family: 'JetBrains Mono', monospace; font-weight: 700; }
.my-seat-card { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; margin-bottom: 3px; border-radius: 6px; background: #131820; border: 1px solid #f7b32b15; cursor: pointer; transition: all 0.2s; }
.my-seat-card:hover { border-color: #f7b32b40; background: #151e2a; }

/* Modal */
.seat-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.2s ease; }
.seat-modal { background: #131820; border: 1px solid #1c2430; border-radius: 16px; width: 420px; max-width: 95vw; max-height: 90vh; overflow-y: auto; padding: 24px; animation: fadeInUp 0.3s ease; }
.modal-top-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
.modal-top-card { background: #0d1118; border: 1px solid #1c2430; border-radius: 10px; padding: 12px; }
.mtc-label { font-size: 9px; color: #475569; letter-spacing: 1px; font-weight: 700; margin-bottom: 4px; }
.mtc-value { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; }
.mtc-note { font-size: 9px; color: #475569; margin-top: 2px; }
.modal-holder { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; padding: 10px 12px; background: #0d1118; border-radius: 8px; border: 1px solid #1c2430; }
.price-options { display: flex; gap: 6px; margin-bottom: 16px; }
.price-option { flex: 1; padding: 10px 4px; border-radius: 8px; border: 1px solid #1c2430; background: #0d1118; cursor: pointer; text-align: center; transition: all 0.2s; }
.price-option:hover { border-color: #f7b32b40; }
.price-option.active { border-color: #f7b32b; background: #f7b32b08; }
.price-option-value { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; color: #e2e8f0; }
.price-option.active .price-option-value { color: #f7b32b; }
.price-option-mult { font-size: 9px; color: #475569; margin-top: 2px; }
.price-option.active .price-option-mult { color: #f7b32b90; }
.duration-options { display: flex; gap: 4px; margin-bottom: 16px; }
.duration-btn { padding: 3px 10px; border-radius: 5px; border: 1px solid #1c2430; background: #0d1118; color: #475569; font-size: 10px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s; }
.duration-btn:hover { border-color: #f7b32b40; }
.duration-btn.active { border-color: #f7b32b; color: #f7b32b; background: #f7b32b08; }
.cost-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #1c243030; font-size: 12px; }
.cost-label { color: #475569; }
.cost-value { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: #e2e8f0; }
.total-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; margin-bottom: 16px; }
.total-label { font-size: 14px; font-weight: 700; color: #e2e8f0; }
.total-value { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 700; color: #f7b32b; }
.modal-buy-btn { width: 100%; padding: 14px; border-radius: 10px; border: none; background: linear-gradient(135deg, #b8860b, #f7b32b, #ffd700); color: #0b0e11; font-size: 15px; font-weight: 800; cursor: pointer; font-family: 'Chakra Petch', sans-serif; transition: all 0.2s; }
.modal-buy-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 20px #f7b32b30; }
.modal-buy-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.modal-cancel-btn { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #1c2430; background: transparent; color: #94a3b8; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; margin-top: 8px; }
.modal-cancel-btn:hover { background: #151a22; }
.modal-action-btn { width: 100%; padding: 10px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; margin-top: 6px; transition: all 0.2s; }
.modal-section-label { font-size: 10px; color: #94a3b8; font-weight: 700; letter-spacing: 1px; margin-bottom: 8px; }
.seat-modal-input { width: 100%; padding: 10px 14px; background: #0d1118; border: 1px solid #1c2430; border-radius: 8px; color: var(--text); font-size: 12px; font-family: 'Chakra Petch', sans-serif; outline: none; margin-bottom: 8px; transition: border-color 0.2s; }
.seat-modal-input:focus { border-color: var(--gold); }

/* ═══ RESPONSIVE ═══ */
.stats-drawer-toggle { display: none !important; }
.chat-drawer-toggle  { display: none !important; }

/* ═══ RESPONSIVE: TABLET ═══ */
@media (max-width: 1100px) {
  .stats-drawer-toggle { display: flex !important; }
  .chat-drawer-toggle  { display: flex !important; }
  .drawer-backdrop { display: block !important; }
  .app-root { grid-template-columns: 1fr; }
  .chat-sidebar {
    position: fixed; top: 0; left: -300px; width: 300px;
    height: 100vh; z-index: 200; transition: left 0.3s ease;
    box-shadow: 4px 0 20px rgba(0,0,0,0.4);
  }
  .chat-sidebar.drawer-open { left: 0; }
  .stats-sidebar {
    position: fixed; top: 0; right: -300px; width: 300px;
    height: 100vh; z-index: 200; transition: right 0.3s ease;
    box-shadow: -4px 0 20px rgba(0,0,0,0.4);
  }
  .stats-sidebar.drawer-open { right: 0; }
}

/* ═══ RESPONSIVE: MOBILE ═══ */
@media (max-width: 640px) {
  .app-root { padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
  .game-topbar { height: 48px; padding: 0 12px; gap: 6px; }
  .logo-text { font-size: 14px !important; letter-spacing: 2px !important; }
  .logo-badge { font-size: 7px; padding: 2px 5px; }
  .nav { padding: 2px; gap: 2px; overflow-x: auto; flex-wrap: nowrap; -webkit-overflow-scrolling: touch; }
  .nav-btn { padding: 6px 12px; font-size: 11px; white-space: nowrap; flex-shrink: 0; min-height: 36px; }
  .header-right { gap: 6px; }

  .hero-section { padding: 20px 14px 16px; }
  .hero-title-text { font-size: 36px !important; letter-spacing: 4px !important; }
  .hero-sub { font-size: 12px; margin-bottom: 14px; }

  .games-section { padding: 0 14px 14px; }

  .coin-3d-container { width: 120px !important; height: 120px !important; }
  .arena { padding: 12px 4px; min-height: 160px; }
  .arena-player { width: 80px; }
  .arena-avatar { width: 40px !important; height: 40px !important; font-size: 12px !important; }
  .arena-name { font-size: 10px; }
  .arena-bet { font-size: 10px; padding: 2px 6px; }
  .vs-area { min-width: 120px; }
  .prize-value { font-size: 11px; }

  .board-container { flex-direction: column !important; }
  .board-left { width: 100% !important; min-width: 0 !important; max-height: 200px; border-right: none !important; border-bottom: 1px solid var(--border); }
  .board-grid-area { padding: 8px !important; }
  .board-right { display: none !important; }

  .seat-modal { width: calc(100vw - 24px) !important; max-height: 85vh; border-radius: 16px 16px 0 0 !important; }
  .seat-modal-overlay { align-items: flex-end !important; padding: 0 !important; }

  .join-btn, .cancel-btn { min-height: 44px; min-width: 44px; }
  .modal-action-btn { min-height: 44px; }
  .modal-buy-btn { min-height: 48px; }
}

@keyframes tickerChipEnter {
  from { transform: translateX(20px) scale(0.8); opacity: 0; }
  to { transform: translateX(0) scale(1); opacity: 1; }
}
@keyframes dramaFlash {
  0% { opacity: 0; } 50% { opacity: 0.3; } 100% { opacity: 0; }
}
@keyframes dramaPulse {
  0%, 100% { box-shadow: 0 0 20px rgba(247,179,43,0.1); }
  50% { box-shadow: 0 0 40px rgba(247,179,43,0.4), 0 0 80px rgba(247,179,43,0.15); }
}
.coin-wrapper.spinning .coin-stage-inner {
  animation: dramaPulse 1.2s ease infinite;
}
.coin-wrapper.spinning::before {
  content: ''; position: absolute; inset: 0; z-index: 0; border-radius: 14px;
  background: radial-gradient(circle, transparent 40%, rgba(0,0,0,0.6));
  pointer-events: none; animation: dramaFlash 1.5s ease infinite;
}
`;


// ═══ Animated Number Counter ═══
function AnimatedNumber({ value, duration = 500, decimals = 4 }) {
  const [displayValue, setDisplayValue] = useState(parseFloat(value) || 0);
  const previousValue = useRef(displayValue);

  useEffect(() => {
    const startValue = previousValue.current;
    const targetValue = parseFloat(value) || 0;
    if (startValue === targetValue) return;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (targetValue - startValue) * eased;
      setDisplayValue(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        previousValue.current = targetValue;
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return <>{displayValue.toFixed(decimals)}</>;
}

// ═══ Confetti Helpers ═══
function triggerWinConfetti() {
  confetti({
    particleCount: 50,
    spread: 60,
    origin: { y: 0.6 },
    colors: ['#f7b32b', '#ffc94a', '#d4a020'],
    zIndex: 9999,
  });
}

function triggerJackpotConfetti() {
  const end = Date.now() + 2000;
  const frame = () => {
    confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors: ['#f7b32b', '#ffc94a'], zIndex: 9999 });
    confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors: ['#f7b32b', '#ffc94a'], zIndex: 9999 });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

function GameAvatar({ address, size = 40 }) {
  const color = addrColor(address);
  return (
    <div className="game-avatar" style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}, ${color}99)` }}>
      {address && address !== ZERO_ADDRESS ? address.slice(2, 4).toUpperCase() : "??"}
    </div>
  );
}

// ═══════════════════════════════════════
//  CHAT SIDEBAR
// ═══════════════════════════════════════
function LiveFeedSidebar({ recentFlips, address, drawerOpen }) {
  // Hide sub-0.0005 ETH dust (wallet-test noise) while still showing
  // the lowest live tier (0.001). Treasury-involved rows are formatted
  // without leaking the contract address or a misleading "+amount"
  // on the house side.
  const visibleFlips = recentFlips.filter(f => parseFloat(f.amount || 0) >= 0.0005);
  return (
    <div className={"chat-sidebar sidebar-texture" + (drawerOpen ? " drawer-open" : "")}>
      <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(247,179,43,0.15), transparent)" }} />
      <div style={{
        padding: "14px 16px", borderBottom: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e", animation: "liveDot 1.5s ease infinite" }} />
          <span style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>Live activity</span>
        </div>
        <span style={{ fontSize: 9, color: "var(--text-faint)" }}>{visibleFlips.length} recent</span>
      </div>
      <div className="chat-messages" style={{ padding: "8px 10px" }}>
        {visibleFlips.map((flip, i) => {
          const myAddr = (address || "").toLowerCase();
          const winner = (flip.winner || "").toLowerCase();
          const loser  = (flip.loser  || "").toLowerCase();
          const treasury = CONTRACT_ADDRESS.toLowerCase();
          const isMyWin  = !!myAddr && winner === myAddr;
          const isMyLoss = !!myAddr && loser  === myAddr;
          const isTrW    = winner === treasury;
          const isTrL    = loser  === treasury;

          const winnerName = isTrW ? "Treasury" : shortAddr(flip.winner);
          const loserName  = isTrL ? "Treasury" : shortAddr(flip.loser);
          const payoutNum  = parseFloat(flip.payout || 0);
          const amountNum  = parseFloat(flip.amount || 0);

          // tone palette:
          //   "myWin"    — gold (my own win, most salient)
          //   "myLoss"   — red
          //   "otherWin" — green (someone else beat the Treasury)
          //   "otherLoss"— red (someone else lost to the Treasury)
          //   "neutral"  — PvP, dim
          let title, subtitle, tone;
          if (isMyWin) {
            title = `You won +${fmtNum(payoutNum)} ETH`;
            subtitle = `vs ${loserName}`;
            tone = "myWin";
          } else if (isMyLoss) {
            title = `You lost -${fmtNum(amountNum)} ETH`;
            subtitle = `vs ${winnerName}`;
            tone = "myLoss";
          } else if (isTrW || isTrL) {
            // Flip against Treasury: show the human player's perspective
            // with proper win/loss coloring, not Treasury's.
            const playerAddr = isTrW ? flip.loser : flip.winner;
            const playerName = shortAddr(playerAddr);
            const playerWon  = isTrL;
            if (playerWon) {
              title = `${playerName} won +${fmtNum(payoutNum)} ETH`;
              tone = "otherWin";
            } else {
              title = `${playerName} lost -${fmtNum(amountNum)} ETH`;
              tone = "otherLoss";
            }
            subtitle = `vs Treasury`;
          } else {
            title = `${winnerName} won +${fmtNum(payoutNum)} ETH`;
            subtitle = `vs ${loserName}`;
            tone = "neutral";
          }

          const palette = {
            myWin:     { color: "#f7b32b", border: "#f7b32b",           bg: "linear-gradient(90deg, rgba(247,179,43,0.10), transparent)" },
            myLoss:    { color: "#ef4444", border: "#ef4444",           bg: "linear-gradient(90deg, rgba(239,68,68,0.08), transparent)"  },
            otherWin:  { color: "#22c55e", border: "rgba(34,197,94,0.6)",  bg: "linear-gradient(90deg, rgba(34,197,94,0.06), transparent)"  },
            otherLoss: { color: "#ef4444", border: "rgba(239,68,68,0.5)",  bg: "linear-gradient(90deg, rgba(239,68,68,0.05), transparent)"  },
            neutral:   { color: "var(--text)", border: "rgba(148,163,184,0.25)", bg: "linear-gradient(90deg, rgba(148,163,184,0.03), transparent)" },
          }[tone];
          const titleColor = palette.color;
          const borderColor = palette.border;
          const bg = palette.bg;
          return (
            <div key={flip.id + "-" + i} style={{
              background: bg,
              borderLeft: "2px solid " + borderColor,
              padding: "8px 10px 8px 12px", borderRadius: "0 8px 8px 0",
              marginBottom: 4, animation: flip.isNew ? "tickerChipEnter 0.4s ease" : "none",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                <span style={{ fontSize: 11, color: titleColor, fontWeight: tone === "neutral" ? 600 : 700 }}>
                  {title}
                </span>
              </div>
              <div style={{ fontSize: 9, color: "var(--text-faint)" }}>
                {subtitle}
              </div>
            </div>
          );
        })}
        {visibleFlips.length === 0 && (
          <div style={{ padding: 30, textAlign: "center", fontSize: 11, color: "var(--text-faint)" }}>
            No flips yet. Be the first!
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  STATS SIDEBAR
// ═══════════════════════════════════════
function StatsSidebar({ sessionBalance, walletBalance, connected, playerStats, protocolStats, treasuryMax, contract, address, isAdmin, drawerOpen, onCloseDrawer, tokenBalance, mySeats, seats, graduation, userProfile, seatsContract, refreshSeats }) {
  const jackpotPercent = protocolStats ? Math.min(100, (parseFloat(protocolStats.jackpotPool || 0) / 0.05) * 100) : 0;
  const flipBal = tokenBalance ? parseFloat(formatUnits(tokenBalance, 18)) : 0;
  // Derive from `seats` as a fallback — if the hook's mySeats is ever
  // stale (e.g. refresh raced ahead of the address being set), this
  // pulls the truth from the same seat array the board shows.
  const derivedMySeats = useMemo(() => {
    if (!address || !Array.isArray(seats)) return [];
    const lc = address.toLowerCase();
    return seats.filter(s => s.active && s.owner?.toLowerCase() === lc).map(s => s.id);
  }, [address, seats]);
  const effectiveMySeats = (mySeats && mySeats.length > 0) ? mySeats : derivedMySeats;
  const mySeatsCount = effectiveMySeats.length;

  return (
    <div className={"stats-sidebar sidebar-texture" + (drawerOpen ? " drawer-open" : "")}>
      <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(247,179,43,0.15), transparent)" }} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* BALANCE CARD */}
        <div style={{
          background: "linear-gradient(135deg, rgba(247,179,43,0.08), rgba(247,179,43,0.02))",
          border: "1px solid rgba(247,179,43,0.2)", borderRadius: 12, padding: 16,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(247,179,43,0.5), transparent)" }} />
          <div style={{ fontSize: 9, color: "#d4a020", fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>YOUR BALANCE</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#f7b32b", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1, marginBottom: 4, textShadow: "0 0 20px rgba(247,179,43,0.3)" }}>
            <AnimatedNumber value={walletBalance || 0} />
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {"\u2248"} ${(parseFloat(walletBalance || 0) * 2500).toFixed(2)} USD
          </span>
        </div>

        {/* WINS / LOSSES */}
        {connected && playerStats && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ padding: 12, background: "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.01))", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 8 }}>
                <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 1, marginBottom: 2 }}>WINS</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}><AnimatedNumber value={playerStats.wins} decimals={0} duration={300} /></div>
              </div>
              <div style={{ padding: 12, background: "linear-gradient(135deg, rgba(239,68,68,0.06), rgba(239,68,68,0.01))", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8 }}>
                <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 1, marginBottom: 2 }}>LOSSES</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#ef4444", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}><AnimatedNumber value={playerStats.losses} decimals={0} duration={300} /></div>
              </div>
            </div>

            {/* WIN STREAK */}
            {playerStats.streak > 0 && (
              <div style={{ background: "linear-gradient(90deg, rgba(247,179,43,0.05), transparent)", borderLeft: "2px solid #f7b32b", padding: "10px 12px", borderRadius: "0 6px 6px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="#f7b32b"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67z"/></svg>
                  <span style={{ fontSize: 12, color: "#f7b32b", fontWeight: 700 }}>{playerStats.streak} win streak</span>
                </div>
                <div style={{ fontSize: 9, color: "var(--text-muted)" }}>Best: {playerStats.bestStreak}</div>
              </div>
            )}
          </>
        )}

        {/* LEVEL / XP / YIELD / COOLDOWN — from FlipperSeats.getUserProfile */}
        {connected && userProfile && (() => {
          // Contract level thresholds (binary-searched on-chain):
          // L1[0), L2[500), L3[2000), L4[5000), L5[15000), L6[50000).
          const LEVEL_XP = [0, 500, 2000, 5000, 15000, 50000];
          const lvl = Math.max(1, Math.min(6, userProfile.level || 1));
          const name = LEVEL_NAMES[lvl - 1] || "Rookie";
          const color = LEVEL_COLORS[lvl - 1] || "#6b7280";
          const xp = userProfile.xp || 0;
          const base = LEVEL_XP[lvl - 1];
          const next = LEVEL_XP[lvl] || (xp + 1);
          const pct = lvl >= 6 ? 100 : Math.min(100, Math.max(0, ((xp - base) / (next - base)) * 100));
          const multX = (userProfile.yieldMultiplier || 100) / 100;
          const cd = userProfile.priceCooldownSec;
          const cdMin = cd != null ? Math.round(cd / 60) : null;
          return (
            <div style={{
              padding: 12, borderRadius: 10,
              background: `linear-gradient(135deg, ${color}22, ${color}08)`,
              border: `1px solid ${color}55`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 800, color }}>Lv.{lvl}</span>
                  <span style={{ fontSize: 11, color: "var(--text)", fontWeight: 700 }}>{name}</span>
                </div>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {lvl >= 6 ? `${xp.toLocaleString()} XP` : `${xp.toLocaleString()} / ${next.toLocaleString()}`}
                </span>
              </div>
              <div style={{ height: 4, background: "rgba(0,0,0,0.3)", borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
                <div style={{ height: "100%", width: pct + "%", background: `linear-gradient(90deg, ${color}, ${color}aa)`, boxShadow: `0 0 6px ${color}88`, transition: "width 0.5s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: 8, letterSpacing: 1, fontWeight: 700 }}>YIELD MULT</div>
                  <div style={{ color: "#22c55e", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{multX.toFixed(2)}x</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "var(--text-muted)", fontSize: 8, letterSpacing: 1, fontWeight: 700 }}>PRICE COOLDOWN</div>
                  <div style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                    {cdMin != null ? `${cdMin} min` : "—"}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* PROTOCOL STATS */}
        <div>
          <div style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 700, letterSpacing: 1.5, marginBottom: 10, paddingLeft: 4 }}>PROTOCOL</div>
          {!protocolStats ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3].map(i => <div key={i} style={{ height: 40, borderRadius: 6, background: "rgba(255,255,255,0.02)", animation: "pulse 1.5s ease infinite", animationDelay: i * 0.1 + "s" }} />)}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {[
                { l: "Treasury", v: fmtNum(protocolStats.treasuryBalance, 4) },
                { l: "Max bet", v: treasuryMax ? fmtNum(treasuryMax, 4) : "0.0000" },
                { l: "Total bets", v: fmtNum(protocolStats.totalFlips, 0) },
                { l: "Volume", v: fmtNum(protocolStats.totalVolume, 3) },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent", borderRadius: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{r.l}</span>
                  <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{r.v}</span>
                </div>
              ))}

              {/* JACKPOT */}
              <div style={{ display: "flex", flexDirection: "column", padding: 12, background: "linear-gradient(135deg, rgba(247,179,43,0.06), rgba(247,179,43,0.01))", border: "1px solid rgba(247,179,43,0.15)", borderRadius: 8, marginTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="#f7b32b"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    <div>
                      <div style={{ fontSize: 10, color: "#f7b32b", fontWeight: 700 }}>JACKPOT</div>
                      <div style={{ fontSize: 8, color: "var(--text-muted)" }}>1% chance per flip</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 14, color: "#f7b32b", fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{fmtNum(protocolStats.jackpotPool, 4)}</span>
                </div>
                <div style={{ height: 4, background: "rgba(0,0,0,0.3)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: jackpotPercent + "%", background: "linear-gradient(90deg, #f7b32b, #d4a020)", borderRadius: 2, boxShadow: "0 0 6px rgba(247,179,43,0.4)", transition: "width 0.5s ease" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 8, color: "var(--text-faint)" }}>Pool growing</span>
                  <span style={{ fontSize: 8, color: "var(--text-muted)", fontWeight: 600 }}>Target: 0.05 ETH</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* $FLIPPER BALANCE — V8 */}
        <div style={{ padding: 12, background: "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.01))", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#22c55e"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>
            <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700, letterSpacing: 1 }}>$FLIPPER BALANCE</span>
          </div>
          <div style={{ fontSize: 20, color: "#22c55e", fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4, lineHeight: 1 }}>
            {connected ? flipBal.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}
          </div>
          <div style={{ fontSize: 9, color: "var(--text-faint)", marginBottom: 8 }}>
            Used to mint & maintain seats
          </div>
          <button onClick={() => window.open("https://flaunch.gg/base/coin/0xb28CdC10232e0E3bE033Fd2C01e01b4E514e06bB", "_blank")} style={{
            width: "100%", padding: "8px 12px", background: "transparent", border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: 6, color: "#22c55e", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5, fontFamily: "inherit",
          }}>{"BUY $FLIPPER \u2192"}</button>
        </div>

        {/* YOUR SEATS — V8 */}
        {connected && (
          <div style={{ padding: 12, background: "rgba(247,179,43,0.04)", border: "1px solid rgba(247,179,43,0.15)", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: "var(--gold)", fontWeight: 700, letterSpacing: 1 }}>YOUR SEATS</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)", fontFamily: "'JetBrains Mono', monospace" }}>
                {mySeatsCount}
              </span>
            </div>
            {mySeatsCount === 0 ? (
              <div style={{ fontSize: 10, color: "var(--text-faint)", padding: "4px 0" }}>
                You don't own any seats yet.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  {effectiveMySeats.slice(0, 12).map(id => (
                    <span key={id} style={{
                      fontSize: 10, padding: "3px 8px", background: "rgba(247,179,43,0.08)",
                      border: "1px solid rgba(247,179,43,0.25)", borderRadius: 4,
                      color: "var(--gold)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                    }}>#{id}</span>
                  ))}
                  {mySeatsCount > 12 && (
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>+{mySeatsCount - 12}</span>
                  )}
                </div>
                <button onClick={async () => {
                  if (!seatsContract) return;
                  try {
                    await claimMultipleRewardsFn(seatsContract, effectiveMySeats);
                    addToast("success", `Claimed rewards from ${mySeatsCount} seats`);
                    refreshSeats?.();
                  } catch (e) { addToast("error", decodeError(e)); }
                }} style={{
                  width: "100%", padding: "8px 10px",
                  background: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))",
                  border: "1px solid rgba(34,197,94,0.35)", borderRadius: 6,
                  color: "#22c55e", fontSize: 10, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit", letterSpacing: 0.5,
                }}>Claim All Rewards</button>
              </>
            )}
          </div>
        )}

        {/* GRADUATION STATUS — V8 */}
        {graduation && (
          <div style={{
            padding: 12,
            background: graduation.graduated
              ? "linear-gradient(135deg, rgba(34,197,94,0.05), rgba(34,197,94,0.01))"
              : "linear-gradient(135deg, rgba(247,179,43,0.04), rgba(247,179,43,0.01))",
            border: "1px solid " + (graduation.graduated ? "rgba(34,197,94,0.2)" : "rgba(247,179,43,0.15)"),
            borderRadius: 8,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1,
              color: graduation.graduated ? "#22c55e" : "var(--gold)", marginBottom: 8 }}>
              GRADUATION
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { l: "Minted", v: `${graduation.totalMinted || 0} / ${TOTAL_SEATS}` },
                { l: "Active", v: `${graduation.activeCount || 0}` },
                { l: "Status", v: graduation.graduated ? "Graduated" : "Open",
                  c: graduation.graduated ? "#22c55e" : "var(--gold)" },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "var(--text-dim)" }}>{r.l}</span>
                  <span style={{
                    color: r.c || "var(--text)", fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{r.v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  BOARD TAB — TAKEOVER.FUN STYLE
// ═══════════════════════════════════════
// Accept "1000", "1,000", "0,001", "0.001", "1 000"; return a cleaned
// decimal string that `parseUnits` can consume, or "" if unparseable.
function sanitizeNum(raw) {
  if (raw == null) return "";
  const s = String(raw).replace(/\s+/g, "").replace(",", ".");
  // strip anything other than digits and a single dot
  const cleaned = s.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
  return cleaned;
}

function BoardView({ seatHook, address, connected, seatsContract, tokenContract, readSeats, tokenBalance, refreshBalance, refreshTokenBalance, protocolStats }) {
  // V7 compatibility alias — BoardView's seat calls all go to FlipperSeats in V8.
  const contract = seatsContract || readSeats;
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [seatDetail, setSeatDetail] = useState(null);
  const [seatBuyName, setSeatBuyName] = useState("");
  const [seatBuyDeposit, setSeatBuyDeposit] = useState("0.002");
  const [seatBuyPrice, setSeatBuyPrice] = useState("1000");
  const [recentActivity, setRecentActivity] = useState([]);
  // V8: deposit duration is measured in hours. Contract min is 1h.
  const [selectedDuration, setSelectedDuration] = useState(24); // 1h | 24h | 168h | 720h
  const [selectedMult, setSelectedMult] = useState(0); // index into [1.1x, 1.2x, 2x, 5x]
  const [mintDepositHours, setMintDepositHours] = useState(24); // 1 | 24 | 168 | 720
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [boardFilter, setBoardFilter] = useState("all");
  const [newPriceInput, setNewPriceInput] = useState("");
  const [showBulkBuy, setShowBulkBuy] = useState(false);
  const [bulkCount, setBulkCount] = useState(3);
  const [bulkBuying, setBulkBuying] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, seatIds: [] });
  const [bulkListPrice, setBulkListPrice] = useState("1000"); // FLIP per seat
  const [bulkDepositHours, setBulkDepositHours] = useState(24);
  const [onChainMintPriceWei, setOnChainMintPriceWei] = useState(null); // bigint
  const [showTakeOver, setShowTakeOver] = useState(false);
  const [takeOverSelected, setTakeOverSelected] = useState([]); // seat ids
  // Multiplier tenths: 11 = 1.1x (strictly > current), 12, 20, 50
  const [takeOverMult, setTakeOverMult] = useState(11);
  // V8 deposit hours. Contract min is MIN_DEPOSIT_HOURS=1.
  const [takeOverDuration, setTakeOverDuration] = useState(24);
  const [takeOverBusy, setTakeOverBusy] = useState(false);

  // Fetch detailed seat info when modal opens. V8 getSeatInfo returns BigInts;
  // adapt to the V7-shaped object the render code expects (human-readable strings).
  const loadSeatDetail = useCallback(async (id) => {
    if (!contract) return;
    try {
      const r = await getSeatInfo(contract, id);
      setSeatDetail({
        owner: r.owner,
        price: formatUnits(r.price, 18),
        priceWei: r.price,
        deposit: formatUnits(r.deposit, 18),
        depositWei: r.deposit,
        pendingTax: formatUnits(r.pendingTax, 18),
        rewards: formatUnits(r.pendingRewards, 18),
        earned: formatUnits(r.totalEarned, 18),
        runway: r.depositRunway,
        forfeitable: r.forfeitable,
        name: r.name,
      });
    } catch { setSeatDetail(null); }
  }, [contract]);

  useEffect(() => {
    if (!selectedSeat) { setSeatDetail(null); return; }
    loadSeatDetail(selectedSeat.id);
  }, [selectedSeat, loadSeatDetail]);

  // V8 has no on-chain price-change cooldown — keep slot so UI stays stable.
  useEffect(() => { setCooldownRemaining(0); }, [seatDetail]);

  // Read calculateMintPrice() once so every modal displays the real
  // on-chain number (was hardcoded 50K; actual is 50M). V8 BF7: when the
  // on-chain price lands, pre-seed the single-seat/bulk price inputs so
  // the recommended default equals what the user just paid to mint.
  useEffect(() => {
    if (!contract || onChainMintPriceWei) return;
    (async () => {
      try {
        const mp = await contract.calculateMintPrice();
        setOnChainMintPriceWei(mp);
        try {
          const mpNum = parseFloat(formatUnits(mp, 18));
          const rec = Math.round(mpNum).toString();
          setSeatBuyPrice(prev => (prev === "1000" ? rec : prev));
          setBulkListPrice(prev => (prev === "1000" ? rec : prev));
        } catch {}
      } catch {}
    })();
  }, [contract, onChainMintPriceWei]);

  // Fetch recent seat activity — V8 emits SeatMinted (new owner) + SeatBoughtOut (transfer).
  useEffect(() => {
    if (!contract || !contract.runner?.provider) return;
    (async () => {
      try {
        const block = await contract.runner.provider.getBlockNumber();
        const from = Math.max(0, block - 2000);
        const [mints, buyouts] = await Promise.all([
          contract.queryFilter("SeatMinted", from, block),
          contract.queryFilter("SeatBoughtOut", from, block),
        ]);
        const merged = [
          ...mints.map(e => ({
            seatId: Number(e.args.seatId),
            newOwner: e.args.buyer,
            prevOwner: ZERO_ADDRESS,
            price: formatUnits(e.args.price, 18),
            block: e.blockNumber,
          })),
          ...buyouts.map(e => ({
            seatId: Number(e.args.seatId),
            newOwner: e.args.newOwner,
            prevOwner: e.args.oldOwner,
            price: formatUnits(e.args.salePrice, 18),
            block: e.blockNumber,
          })),
        ].sort((a, b) => b.block - a.block).slice(0, 15);
        setRecentActivity(merged);
      } catch {}
    })();
  }, [contract, seatHook.seats]);

  const topHolders = useMemo(() => {
    if (!seatHook.seats || seatHook.seats.length === 0) return [];
    const counts = {};
    seatHook.seats.forEach(s => {
      if (s.owner && s.owner !== ZERO_ADDRESS && s.active) {
        counts[s.owner] = (counts[s.owner] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([addr, count]) => ({ address: addr, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [seatHook.seats]);

  // Prefer the contract's own activeSeatsCount (via graduation info) —
  // resilient to partial seat-array hydration races.
  const ownedCount = useMemo(() => {
    const fromArray = seatHook.seats?.filter(s => s.active).length || 0;
    const fromChain = seatHook.graduation?.activeCount;
    return (fromChain != null && fromChain > fromArray) ? fromChain : fromArray;
  }, [seatHook.seats, seatHook.graduation]);

  const floorPrice = useMemo(() => {
    const active = seatHook.seats?.filter(s => s.active);
    if (!active || active.length === 0) return "0";
    const prices = active.map(s => s.priceNum).filter(p => p > 0);
    return prices.length > 0 ? fmtNum(Math.min(...prices), 0) : "0";
  }, [seatHook.seats]);

  // "Total locked" = sum of active seat DEPOSITS (FLIPPER sitting in
  // the contract as tax runway), not listing prices.
  const totalValue = useMemo(() => {
    const active = seatHook.seats?.filter(s => s.active);
    if (!active || active.length === 0) return "0";
    return fmtNum(active.reduce((sum, s) => sum + (s.depositNum || 0), 0), 0);
  }, [seatHook.seats]);

  const estYieldPerSeat = useMemo(() => {
    const activeSeatCount = seatHook.seats?.filter(s => s.active).length || 1;
    // V8: per-seat pending yield comes from FlipperSeats.yieldPoolETH
    const seatPoolEth = seatHook.yieldPool ? parseFloat(formatEther(seatHook.yieldPool)) : 0;
    return (seatPoolEth / activeSeatCount).toFixed(6);
  }, [seatHook.seats, seatHook.yieldPool]);

  const myAddrLower = address?.toLowerCase();
  const isMineSeat = useCallback((seat) => !!(seat?.active && myAddrLower && seat.owner?.toLowerCase() === myAddrLower), [myAddrLower]);

  // Always materialise 256 rows so the grid is visible even before
  // getAllSeatsBasic() resolves. Cells merge any real data as it arrives.
  const filteredSeats = useMemo(() => {
    const real = seatHook.seats || [];
    const byId = new Map(real.map(s => [s.id, s]));
    const full = [];
    for (let i = 1; i <= 256; i++) {
      full.push(byId.get(i) || { id: i, owner: ZERO_ADDRESS, active: false, priceNum: 0, name: "", daysLeft: 999 });
    }
    if (boardFilter === "all") return full;
    return full.map(seat => {
      if (boardFilter === "owned" && !seat.active) return { ...seat, hidden: true };
      if (boardFilter === "mine" && !isMineSeat(seat)) return { ...seat, hidden: true };
      if (boardFilter === "empty" && seat.active) return { ...seat, hidden: true };
      return seat;
    });
  }, [seatHook.seats, boardFilter, isMineSeat]);

  // Calculate buyout cost breakdown (V8: denominated in FLIPPER tokens, 18-decimal)
  // Tenths — 1.1x minimum because the contract requires a strictly higher new price.
  const buyoutCalc = useMemo(() => {
    if (!selectedSeat || !selectedSeat.active || !selectedSeat.price) return null;
    try {
      const price = selectedSeat.price; // BigInt tokens
      const mults = [11n, 12n, 20n, 50n]; // /10 → 1.1x, 1.2x, 2x, 5x
      const newPrice = price * mults[selectedMult] / 10n;
      const weeklyTax = newPrice * 500n / 10000n;
      const deposit = weeklyTax * BigInt(selectedDuration) / 168n;
      const totalVal = price + deposit; // total FLIPPER needed (approval)
      return { newPrice, weeklyTax, deposit, totalVal, buyoutPrice: price };
    } catch { return null; }
  }, [selectedSeat, selectedMult, selectedDuration]);

  return (
    <div className="board-container">
      {/* LEFT PANEL */}
      <div className="board-left">
        {/* Yield estimate - prominent */}
        <div style={{ padding: "14px 12px", background: "#22c55e08", borderRadius: 8, border: "1px solid #22c55e15", marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: "#22c55e80", fontWeight: 700, letterSpacing: 1 }}>YOU COULD EARN</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#22c55e", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{estYieldPerSeat} ETH</div>
          <div style={{ fontSize: 9, color: "#475569" }}>per week based on current volume</div>
        </div>

        <div className="board-label">THE BOARD</div>
        <div className="board-stats-grid">
          <div className="board-stat-card">
            <div className="board-stat-value" style={{ color: "#f7b32b" }}>{ownedCount}</div>
            <div className="board-stat-label">TAKEN</div>
          </div>
          <div className="board-stat-card">
            <div className="board-stat-value" style={{ color: "#e2e8f0" }}>{256 - ownedCount}</div>
            <div className="board-stat-label">AVAILABLE</div>
          </div>
        </div>

        {[
          { l: "Cheapest seat", v: `${floorPrice} FLIP`, c: "#f7b32b" },
          { l: "Total locked", v: `${totalValue} FLIP`, c: "#e2e8f0" },
          { l: "Rent per week", v: "5%", c: "#e2e8f0" },
          { l: "You own", v: `${seatHook.mySeats.length}`, c: "#f7b32b" },
          { l: "Yield pool", v: `${seatHook.yieldPool ? fmtNum(parseFloat(formatEther(seatHook.yieldPool)), 4) : "0"} \u039E`, c: "#22c55e" },
        ].map((r, i) => (
          <div className="board-info-row" key={i}>
            <span className="board-info-label">{r.l}</span>
            <span className="board-info-value" style={{ color: r.c }}>{r.v}</span>
          </div>
        ))}

        {/* Buy CTA */}
        {connected && (<>
          <button onClick={() => {
            const firstEmpty = seatHook.seats.find(s => !s.active);
            if (firstEmpty) { setSelectedSeat(firstEmpty); setSelectedMult(0); setSelectedDuration(24); }
          }} style={{
            width: "100%", padding: 10, borderRadius: 8, marginTop: 12,
            background: "linear-gradient(135deg, #b8860b, #f7b32b)", color: "#0b0e11",
            fontSize: 12, fontWeight: 800, border: "none", cursor: "pointer",
            fontFamily: "'Chakra Petch', sans-serif",
          }}>Buy a Seat</button>
          <button onClick={() => setShowBulkBuy(true)} style={{
            width: "100%", padding: 8, borderRadius: 8, marginTop: 6,
            background: "transparent", border: "1px solid #f7b32b30",
            color: "#f7b32b80", fontSize: 10, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>Buy Several at Once</button>
          {(() => {
            const emptyCount = seatHook.seats?.filter(s => !s.active).length || 0;
            return (
              <button
                disabled={emptyCount === 0}
                onClick={() => { setBulkCount(Math.min(emptyCount, 64)); setShowBulkBuy(true); }}
                style={{
                  width: "100%", padding: 10, borderRadius: 8, marginTop: 6,
                  background: emptyCount > 0
                    ? "linear-gradient(135deg, rgba(247,179,43,0.12), rgba(247,179,43,0.04))"
                    : "rgba(255,255,255,0.02)",
                  border: "1px solid " + (emptyCount > 0 ? "#f7b32b" : "#1c2430"),
                  color: emptyCount > 0 ? "#f7b32b" : "#475569",
                  fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
                  cursor: emptyCount > 0 ? "pointer" : "not-allowed", fontFamily: "inherit",
                  textShadow: emptyCount > 0 ? "0 0 10px rgba(247,179,43,0.25)" : "none",
                }}>
                Take Over All Empty {emptyCount > 0 ? `(${emptyCount})` : ""}
              </button>
            );
          })()}
          {(() => {
            const graduated = seatHook.graduation?.graduated;
            return (
              <button
                disabled={!graduated}
                title={graduated ? "Buy out other holders in one TX" : "Unlocks after all 256 seats minted"}
                onClick={() => {
                  if (!graduated) { addToast("info", "Buyouts unlock after graduation"); return; }
                  const occupied = seatHook.seats?.filter(s => s.active && s.owner?.toLowerCase() !== address?.toLowerCase()).map(s => s.id) || [];
                  if (occupied.length === 0) { addToast("info", "No seats to take over"); return; }
                  setTakeOverSelected(occupied.slice(0, 10));
                  setTakeOverMult(11);
                  setTakeOverDuration(24);
                  setShowTakeOver(true);
                }}
                style={{
                  width: "100%", padding: 8, borderRadius: 8, marginTop: 6,
                  background: "transparent", border: "1px dashed rgba(239,68,68,0.3)",
                  color: graduated ? "#fca5a5" : "#475569", fontSize: 10, fontWeight: 600,
                  cursor: graduated ? "pointer" : "not-allowed", opacity: graduated ? 1 : 0.5,
                  fontFamily: "inherit",
                }}>
                Take Over Multiple {graduated ? "(buyout)" : "(locked)"}
              </button>
            );
          })()}
          {seatHook.mySeats.length > 0 && (
            <button onClick={async () => {
              if (!seatsContract) { addToast("error", "Wallet not ready"); return; }
              try {
                await claimMultipleRewardsFn(seatsContract, seatHook.mySeats);
                addToast("success", "Claimed rewards from " + seatHook.mySeats.length + " seats");
                seatHook.refreshSeats();
              } catch (err) { addToast("error", decodeError(err)); }
            }} style={{
              width: "100%", padding: 10, borderRadius: 8, marginTop: 8,
              background: "#22c55e10", border: "1px solid #22c55e30",
              color: "#22c55e", fontSize: 11, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}>
              Claim All Rewards ({seatHook.mySeats.length} seats)
            </button>
          )}
        </>)}

        <div className="board-label" style={{ marginTop: 16 }}>TOP HOLDERS</div>
        {topHolders.length === 0 && <div style={{ fontSize: 10, color: "#475569" }}>No seats owned yet</div>}
        {topHolders.map((h, i) => (
          <div className="holder-row" key={i}>
            <span className="holder-rank">{i + 1}</span>
            <div className="holder-avatar" style={{ background: addrColor(h.address) }}>{h.address.slice(2, 4).toUpperCase()}</div>
            <span className="holder-name">{shortAddr(h.address)}</span>
            <span className="holder-count">{h.count}</span>
          </div>
        ))}
      </div>

      {/* CENTER GRID */}
      <div className="board-grid-area">
        {/* Title + Filters */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, padding: "0 2px" }}>
          <div>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700, color: "#e2e8f0", letterSpacing: 1, marginBottom: 4 }}>
              256 Seats. Passive ETH.
            </div>
            <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.5, maxWidth: 400 }}>
              Own a seat. Earn from every flip. Others can buy yours for your listed price.
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[{l:"All 256",v:"all"},{l:"Taken",v:"owned"},{l:"Yours",v:"mine"},{l:"Available",v:"empty"}].map(f => (
              <button key={f.v} onClick={() => setBoardFilter(f.v)} style={{
                padding: "4px 10px", borderRadius: 5, fontSize: 9, fontWeight: 600,
                border: "1px solid " + (boardFilter === f.v ? "#f7b32b" : "#1c2430"),
                background: boardFilter === f.v ? "#f7b32b08" : "#131820",
                color: boardFilter === f.v ? "#f7b32b" : "#475569",
                cursor: "pointer", fontFamily: "inherit",
              }}>{f.l}</button>
            ))}
          </div>
        </div>

        {/* 16x16 Scrollable Grid — always renders 256 cells */}
        {(
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(16, 1fr)", gap: 3, maxHeight: "calc(100vh - 200px)", overflowY: "auto", padding: "0 2px 2px" }}>
              {filteredSeats.map(seat => {
                const isMine = isMineSeat(seat);
                const isExpiring = seat.active && seat.daysLeft < 3 && !isMine;
                return (
                  <div key={seat.id}
                    onClick={() => { setSelectedSeat(seat); setSelectedMult(0); setSelectedDuration(24); audio.playClick(); }}
                    style={{
                      aspectRatio: "1", borderRadius: 6, cursor: "pointer", position: "relative",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      padding: 4, transition: "all 0.15s",
                      opacity: seat.hidden ? 0.1 : 1,
                      // Three clear states: mine (gold), occupied-other (teal/blue),
                      // empty (dashed gray). No per-owner hue so occupied seats
                      // actually pop against the empty grid.
                      border: isMine ? "1px solid #f7b32b"
                        : isExpiring ? "2px solid #ef4444"
                        : seat.active ? "1px solid #1e5064"
                        : "1px dashed #1c2430",
                      animation: isExpiring ? "roomPulse 1s ease infinite" : "none",
                      boxShadow: isMine ? "0 0 12px rgba(247,179,43,0.35)" : "none",
                      background: isMine
                        ? "rgba(180,130,20,0.3)"
                        : seat.active
                        ? "rgba(30,80,100,0.4)"
                        : "rgba(20,25,35,0.5)",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.transform = "scale(1.08)";
                      e.currentTarget.style.zIndex = "5";
                      e.currentTarget.style.boxShadow = isMine ? "0 0 20px rgba(247,179,43,0.5)" : seat.active ? "0 0 12px " + addrColor(seat.owner) + "40" : "0 0 10px rgba(247,179,43,0.15)";
                      if (!seat.active) e.currentTarget.style.borderColor = "rgba(247,179,43,0.3)";
                      if (!seat.active) e.currentTarget.style.background = "rgba(247,179,43,0.05)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = "scale(1)";
                      e.currentTarget.style.zIndex = "1";
                      e.currentTarget.style.boxShadow = isMine ? "0 0 16px rgba(247,179,43,0.3)" : "none";
                      if (!seat.active) e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                      if (!seat.active) e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    }}
                  >
                    {seat.active ? (
                      <>
                        {isMine && <div style={{ position: "absolute", top: 1, right: 2, width: 5, height: 5, borderRadius: "50%", background: "#f7b32b", boxShadow: "0 0 4px #f7b32b" }} />}
                        {isExpiring && <div style={{ position: "absolute", top: 1, right: 2, width: 5, height: 5, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 4px #ef4444" }} />}
                        <div style={{
                          width: "70%", aspectRatio: "1", borderRadius: "50%",
                          background: addrColor(seat.owner),
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 8, fontWeight: 800, color: "#fff",
                        }}>{seat.owner?.slice(2, 4).toUpperCase()}</div>
                        <div style={{
                          position: "absolute", bottom: 1, left: 2,
                          fontSize: 7, color: "#475569", fontFamily: "'JetBrains Mono', monospace",
                        }}>#{seat.id}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 9, color: "#3d4756", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                        {seat.id}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* RIGHT PANEL */}
      <div className="board-right">
        <div className="board-label">RECENT ACTIVITY</div>
        {recentActivity.length === 0 && (
          <div style={{ padding: "12px 0", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>Nothing yet.</div>
            {connected && <button onClick={() => {
              const firstEmpty = seatHook.seats.find(s => !s.active);
              if (firstEmpty) { setSelectedSeat(firstEmpty); setSelectedMult(0); setSelectedDuration(24); }
            }} style={{
              fontSize: 10, color: "#f7b32b", background: "none", border: "none",
              cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
            }}>Be the first to claim a seat {"\u2192"}</button>}
          </div>
        )}
        {recentActivity.map((a, i) => (
          <div className="activity-item" key={i}>
            <div className="activity-head">
              <div className="activity-avatar" style={{ background: addrColor(a.newOwner) }}>{a.newOwner.slice(2, 4).toUpperCase()}</div>
              <span className="activity-name">{shortAddr(a.newOwner)}</span>
            </div>
            <div className="activity-detail">
              <span className="activity-action">{a.prevOwner === ZERO_ADDRESS ? "Claimed" : "Bought"} #{a.seatId}</span>
              <span className="activity-price">{parseFloat(a.price).toFixed(4)} {"\u039E"}</span>
            </div>
          </div>
        ))}

        {connected && seatHook.mySeats.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="board-label">YOUR SEATS</div>
            {seatHook.mySeats.map(seatId => {
              const seat = seatHook.seats.find(s => s.id === seatId);
              if (!seat) return null;
              return (
                <div key={seatId} className="my-seat-card" onClick={() => { setSelectedSeat(seat); audio.playClick(); }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#f7b32b" }}>#{seatId}</span>
                  <span style={{ fontSize: 10, color: "#e2e8f0" }}>{seat.name || `Seat #${seatId}`}</span>
                  <span style={{ fontSize: 9, color: "#f7b32b", fontFamily: "'JetBrains Mono', monospace" }}>{(seat.priceNum || 0).toFixed(0)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SEAT DETAIL MODAL */}
      {selectedSeat && (
        <div className="seat-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedSeat(null); }}>
          <div className="seat-modal">
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 20, fontWeight: 800, color: "#e2e8f0" }}>Seat #{selectedSeat.id}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{selectedSeat.active ? (selectedSeat.name || "Occupied") : "Available"}</div>
              </div>
              <button onClick={() => setSelectedSeat(null)} style={{ background: "none", border: "none", color: "#475569", fontSize: 18, cursor: "pointer" }}>{"\u2715"}</button>
            </div>

            {/* Top cards: cost + yield */}
            <div className="modal-top-cards">
              <div className="modal-top-card">
                <div className="mtc-label">{selectedSeat.active ? "BUYOUT COST" : "MINT"}</div>
                <div className="mtc-value" style={{ color: "#f7b32b" }}>{selectedSeat.active ? (selectedSeat.priceNum || 0).toFixed(2) : "~50K"}</div>
                <div className="mtc-note">FLIPPER tokens</div>
              </div>
              <div className="modal-top-card">
                <div className="mtc-label">YOU COULD EARN</div>
                <div className="mtc-value" style={{ color: "#22c55e" }}>+{estYieldPerSeat}</div>
                <div className="mtc-note">ETH / week</div>
              </div>
            </div>

            {/* Holder info (only for occupied seats) */}
            {selectedSeat.active && (
              <div className="modal-holder">
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800, color: "#fff", border: "2px solid",
                  background: `linear-gradient(135deg, ${addrColor(selectedSeat.owner)}, ${addrColor(selectedSeat.owner)}88)`,
                  borderColor: `${addrColor(selectedSeat.owner)}60`,
                }}>{selectedSeat.owner.slice(2, 4).toUpperCase()}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{shortAddr(selectedSeat.owner)}</div>
                  <div style={{ fontSize: 10, color: "#475569" }}>Current holder</div>
                </div>
              </div>
            )}

            {/* Detail rows */}
            {seatDetail && (
              <div style={{ marginBottom: 16 }}>
                {(() => {
                  const deposit = parseFloat(seatDetail.deposit);
                  const tax = parseFloat(seatDetail.pendingTax);
                  const effectiveDeposit = Math.max(0, deposit - tax);
                  const runway = seatDetail.runway;
                  const runwayDays = Math.floor(runway / 86400);
                  const runwayHours = Math.floor((runway % 86400) / 3600);
                  return [
                    { l: "Price", v: `${parseFloat(seatDetail.price).toFixed(4)} FLIP`, c: "#f7b32b" },
                    { l: "Deposit", v: `${effectiveDeposit.toFixed(4)} FLIP`, c: "#e2e8f0" },
                    { l: "Pending Tax", v: `${tax.toFixed(4)} FLIP`, c: "#ef4444" },
                    { l: "Claimable Rewards", v: `${parseFloat(seatDetail.rewards).toFixed(4)} ETH`, c: "#22c55e" },
                    { l: "Total Earned", v: `${parseFloat(seatDetail.earned).toFixed(4)} ETH`, c: "#f7b32b" },
                    { l: "Time to Forfeit", v: runway > 0 ? `${runwayDays}d ${runwayHours}h` : "\u2014", c: runway > 0 && runway < 259200 ? "#ef4444" : "#94a3b8" },
                  ];
                })().map((r, i) => (
                  <div className="cost-row" key={i}>
                    <span className="cost-label">{r.l}</span>
                    <span className="cost-value" style={{ color: r.c }}>{r.v}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            {!connected ? (
              <div style={{ textAlign: "center", fontSize: 12, color: "#475569" }}>Connect wallet to interact</div>
            ) : !selectedSeat.active ? (
              /* MINT empty seat — V8 uses FLIPPER tokens (approve + mint) */
              <div>
                <input className="seat-modal-input" placeholder="Seat name (optional)" maxLength={32}
                  value={seatBuyName} onChange={e => setSeatBuyName(e.target.value)} />
                <div className="modal-section-label">LIST PRICE (FLIP)</div>
                <input className="seat-modal-input" inputMode="decimal"
                  placeholder="e.g. 1000" value={seatBuyPrice}
                  onChange={e => setSeatBuyPrice(e.target.value)} />
                <div style={{ fontSize: 9, color: "#475569", marginTop: -6, marginBottom: 6 }}>
                  Amount in whole FLIPPER tokens. Decimals allowed (dot or comma).
                </div>

                <div className="modal-section-label">DEPOSIT DURATION (min 1h)</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {[
                    { l: "1h", h: 1,   sub: "min" },
                    { l: "1d", h: 24,  sub: "" },
                    { l: "7d", h: 168, sub: "" },
                    { l: "1m", h: 720, sub: "" },
                  ].map(opt => (
                    <button key={opt.h} type="button" onClick={() => setMintDepositHours(opt.h)} style={{
                      flex: 1, padding: "8px 4px", borderRadius: 6,
                      border: "1px solid " + (mintDepositHours === opt.h ? "#f7b32b" : "#1c2430"),
                      background: mintDepositHours === opt.h ? "#f7b32b12" : "#0b0e11",
                      color: mintDepositHours === opt.h ? "#f7b32b" : "#94a3b8",
                      fontSize: 11, fontWeight: 700, cursor: "pointer",
                      fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                    }}>
                      <span>{opt.l}</span>
                      {opt.sub && <span style={{ fontSize: 8, opacity: 0.6 }}>{opt.sub}</span>}
                    </button>
                  ))}
                </div>

                <div style={{ padding: 10, background: "#0b0e11", borderRadius: 8, marginBottom: 12, marginTop: 8 }}>
                  {(() => {
                    // V8 math: deposit = weeklyTax * (hours / 168).
                    const cleaned = sanitizeNum(seatBuyPrice);
                    let listedWei = 0n;
                    try { listedWei = cleaned ? parseUnits(cleaned, 18) : 0n; } catch { listedWei = 0n; }
                    const weeklyTaxWei = listedWei * 500n / 10000n;
                    const depositWei = weeklyTaxWei * BigInt(mintDepositHours) / 168n;
                    const mintWei = onChainMintPriceWei || 0n;
                    const totalWei = mintWei + depositWei;
                    const fmt = (w) => fmtNum(Number(formatUnits(w, 18)), 2);
                    const durLabel = mintDepositHours === 1 ? "1h"
                      : mintDepositHours === 24 ? "1d"
                      : mintDepositHours === 168 ? "7d"
                      : mintDepositHours === 720 ? "1m"
                      : mintDepositHours + "h";
                    return [
                      { l: "Mint price",            v: (onChainMintPriceWei ? fmt(mintWei) : "loading…") + " FLIP", c: "#94a3b8" },
                      { l: "Weekly tax",            v: fmt(weeklyTaxWei) + " FLIP/wk" },
                      { l: `Deposit (${durLabel})`, v: fmt(depositWei) + " FLIP" },
                      { l: "Total approve",         v: fmt(totalWei) + " FLIP", c: "#f7b32b", bold: true },
                    ];
                  })().map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 10 }}>
                      <span style={{ color: "#475569" }}>{r.l}</span>
                      <span style={{ color: r.c || "#e2e8f0", fontWeight: r.bold ? 700 : 400, fontFamily: "'JetBrains Mono', monospace" }}>{r.v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: "#475569", marginBottom: 8, textAlign: "center" }}>
                  Two transactions: approve FLIPPER → mint seat
                </div>
                <button className="modal-buy-btn" onClick={async () => {
                  if (!tokenContract || !seatsContract) { addToast("error", "Wallet not ready"); return; }
                  const cleaned = sanitizeNum(seatBuyPrice);
                  let initialPrice;
                  try { initialPrice = parseUnits(cleaned, 18); } catch { addToast("error", "Invalid price"); return; }
                  if (initialPrice <= 0n) { addToast("error", "Price must be > 0"); return; }
                  // Live-check: our cached seats feed can be stale. Re-query
                  // on-chain ownership right before sending; if it's owned,
                  // surface that and refresh the board.
                  try {
                    const live = await getSeatInfo(seatsContract, selectedSeat.id);
                    if (live.owner && live.owner.toLowerCase() !== ZERO_ADDRESS) {
                      addToast("error", `Seat #${selectedSeat.id} just got taken — refreshing.`);
                      seatHook.refreshSeats();
                      setSelectedSeat(null);
                      return;
                    }
                  } catch {}
                  const pendingId = addToast("pending", "Approving FLIPPER…");
                  try {
                    const weeklyTax = initialPrice * 500n / 10000n;
                    const deposit = weeklyTax * BigInt(mintDepositHours) / 168n;
                    // Balance pre-check so we fail fast with a useful message
                    // instead of a generic revert downstream.
                    try {
                      const mp = await seatsContract.calculateMintPrice();
                      const needed = mp + deposit;
                      const bal = await tokenContract.balanceOf(address);
                      if (bal < needed) {
                        dismissToast(pendingId);
                        addToast("error", `Need ${Number(formatUnits(needed, 18)).toLocaleString()} FLIPPER, have ${Number(formatUnits(bal, 18)).toLocaleString()}`);
                        return;
                      }
                    } catch {}
                    await mintSeatFn(seatsContract, tokenContract, selectedSeat.id, initialPrice, seatBuyName, 0n, deposit);
                    dismissToast(pendingId);
                    addToast("success", `Minted Seat #${selectedSeat.id}!`);
                    setSelectedSeat(null); setSeatBuyName("");
                    seatHook.refreshSeats(); refreshTokenBalance?.();
                    // RPC indexers lag by a block or two — re-query after 2s
                    // so the board shows the freshly minted seat.
                    setTimeout(() => seatHook.refreshSeats(), 2000);
                  } catch (err) {
                    dismissToast(pendingId);
                    console.error(`[mintSeat #${selectedSeat.id}]`, err);
                    addToast("error", decodeError(err));
                  }
                }}>Mint Seat</button>
                <button className="modal-cancel-btn" onClick={() => setSelectedSeat(null)}>Cancel</button>
              </div>
            ) : selectedSeat.owner?.toLowerCase() === address?.toLowerCase() ? (
              /* YOUR seat — manage */
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {cooldownRemaining > 0 && (
                  <div style={{
                    padding: "8px 12px", borderRadius: 8, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                    background: "#f59e0b10", border: "1px solid #f59e0b30", color: "#f59e0b",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ fontSize: 14 }}>&#9202;</span>
                    <span>Cooldown: {Math.floor(cooldownRemaining / 60)}m {cooldownRemaining % 60}s remaining</span>
                  </div>
                )}
                <button className="modal-action-btn" style={{ background: "#22c55e15", border: "1px solid #22c55e40", color: "#22c55e" }}
                  onClick={async () => {
                    if (!seatsContract) return;
                    try {
                      await claimRewardsFn(seatsContract, selectedSeat.id);
                      addToast("success", "Rewards claimed!");
                      refreshBalance(); seatHook.refreshSeats();
                      loadSeatDetail(selectedSeat.id);
                    } catch (err) { addToast("error", decodeError(err)); }
                  }}>
                  Claim Rewards {seatDetail?.rewards && parseFloat(seatDetail.rewards) > 0 ? `(${parseFloat(seatDetail.rewards).toFixed(4)} ETH)` : ""}
                </button>
                <div style={{ fontSize: 9, color: "#475569", marginTop: -2, marginBottom: 4, textAlign: "center" }}>Rewards sent directly to your wallet</div>

                {/* Top Up Deposit (V8: FLIPPER tokens, approve + addDeposit) */}
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>Add deposit to extend seat life</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[
                      { label: "+1d", hours: 24 },
                      { label: "+7d", hours: 168 },
                      { label: "+30d", hours: 720 },
                    ].map(d => {
                      const seatPriceTokens = parseFloat(selectedSeat?.priceNum || formatUnits(selectedSeat?.price || 0n, 18));
                      const weeklyTax = seatPriceTokens * 0.05;
                      const depositAmt = (weeklyTax * d.hours / 168).toFixed(4);
                      return (
                        <button key={d.hours} onClick={async () => {
                          if (!seatsContract || !tokenContract) return;
                          try {
                            const amt = parseUnits(depositAmt, 18);
                            await addDepositFn(seatsContract, tokenContract, selectedSeat.id, amt);
                            addToast("success", "Deposit added! " + d.label);
                            seatHook.refreshSeats(); refreshTokenBalance?.();
                            loadSeatDetail(selectedSeat.id);
                          } catch (err) { addToast("error", decodeError(err)); }
                        }} className="modal-action-btn" style={{
                          flex: 1, padding: "8px 4px",
                          background: "#22c55e08", border: "1px solid #22c55e20",
                          color: "#22c55e", fontSize: 10, textAlign: "center",
                        }}>
                          <div>{d.label}</div>
                          <div style={{ fontSize: 8, color: "#475569", marginTop: 2 }}>{depositAmt} FLIP</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Withdraw Excess Deposit (V8: FLIPPER tokens) */}
                {seatDetail && parseFloat(seatDetail.deposit) > 0 && (
                  <button className="modal-action-btn" style={{
                    background: "#f7b32b08", border: "1px solid #f7b32b20", color: "#f7b32b", fontSize: 10, marginTop: 4,
                  }} onClick={async () => {
                    if (!seatsContract) return;
                    try {
                      const currentDeposit = parseFloat(seatDetail.deposit);
                      const seatPriceTokens = parseFloat(seatDetail.price || "0");
                      const minDeposit = seatPriceTokens * 0.05 * 4; // keep 4 weeks runway
                      const withdrawable = currentDeposit - minDeposit;
                      if (withdrawable <= 0.0001) {
                        addToast("error", "No excess deposit to withdraw");
                        return;
                      }
                      const amt = parseUnits(withdrawable.toFixed(4), 18);
                      await withdrawDepositFn(seatsContract, selectedSeat.id, amt);
                      addToast("success", "Withdrew " + withdrawable.toFixed(4) + " FLIP");
                      seatHook.refreshSeats(); refreshTokenBalance?.();
                      loadSeatDetail(selectedSeat.id);
                    } catch (err) { addToast("error", decodeError(err)); }
                  }}>
                    Withdraw Excess Deposit
                    <span style={{ fontSize: 8, color: "#475569", marginLeft: 4 }}>
                      ({parseFloat(seatDetail.deposit).toFixed(2)} FLIP)
                    </span>
                  </button>
                )}

                {/* Update Price */}
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input type="number" step="100" min="1" placeholder="New price (FLIP)"
                    value={newPriceInput} onChange={e => setNewPriceInput(e.target.value)}
                    className="seat-modal-input" style={{ marginBottom: 0, flex: 1, fontSize: 10 }} />
                  <button className="modal-action-btn" disabled={cooldownRemaining > 0}
                    style={{
                      background: "#3b82f608", border: "1px solid #3b82f620", color: "#3b82f6",
                      fontSize: 10, padding: "8px 14px", width: "auto", marginTop: 0,
                      opacity: cooldownRemaining > 0 ? 0.4 : 1, cursor: cooldownRemaining > 0 ? "not-allowed" : "pointer",
                    }}
                    onClick={async () => {
                      if (!seatsContract) return;
                      const cleaned = sanitizeNum(newPriceInput);
                      const price = parseFloat(cleaned);
                      if (!price || price < 1) { addToast("error", "Price must be > 0"); return; }
                      try {
                        await updateSeatPriceFn(seatsContract, selectedSeat.id, parseUnits(cleaned, 18));
                        addToast("success", "Price updated to " + cleaned + " FLIP");
                        setNewPriceInput(""); seatHook.refreshSeats();
                        loadSeatDetail(selectedSeat.id);
                      } catch (err) { addToast("error", decodeError(err)); }
                    }}>Update Price</button>
                </div>

                <button className="modal-action-btn" style={{ background: "#f7b32b10", border: "1px solid #f7b32b30", color: "#f7b32b" }}
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}?ref=${selectedSeat.id}`);
                    addToast("success", "Referral link copied!");
                  }}>Copy Referral Link</button>
                <button className="modal-action-btn" disabled={cooldownRemaining > 0}
                  style={{
                    background: "transparent", border: "1px solid #ef444450", color: "#ef4444",
                    opacity: cooldownRemaining > 0 ? 0.4 : 1, cursor: cooldownRemaining > 0 ? "not-allowed" : "pointer",
                  }}
                  onClick={async () => {
                    if (!seatsContract) return;
                    if (!confirm("Are you sure? You will lose your seat position. Pending rewards will be auto-claimed.")) return;
                    try {
                      await abandonSeatFn(seatsContract, selectedSeat.id);
                      addToast("success", "Seat #" + selectedSeat.id + " abandoned");
                      setSelectedSeat(null); seatHook.refreshSeats(); refreshBalance();
                    } catch (err) { addToast("error", decodeError(err)); }
                  }}>Abandon Seat</button>
              </div>
            ) : (
              /* BUYOUT another's seat */
              <div>
                <div className="modal-section-label">NEW PRICE (min 1.1x)</div>
                <div className="price-options">
                  {[{l:"1.1x",m:0,t:11n},{l:"1.2x",m:1,t:12n},{l:"2x",m:2,t:20n},{l:"5x",m:3,t:50n}].map(opt => (
                    <div key={opt.m} className={`price-option ${selectedMult === opt.m ? "active" : ""}`}
                      onClick={() => setSelectedMult(opt.m)}>
                      <div className="price-option-value">
                        {selectedSeat?.price ? fmtNum(parseFloat(formatUnits(selectedSeat.price * opt.t / 10n, 18)), 0) : "..."}
                      </div>
                      <div className="price-option-mult">{opt.l}</div>
                    </div>
                  ))}
                </div>

                <div className="modal-section-label">DEPOSIT DURATION (min 1h)</div>
                <div className="duration-options">
                  {[{l:"1h",h:1},{l:"1d",h:24},{l:"7d",h:168},{l:"1m",h:720}].map(d => (
                    <button key={d.h} className={`duration-btn ${selectedDuration === d.h ? "active" : ""}`}
                      onClick={() => setSelectedDuration(d.h)}>{d.l}</button>
                  ))}
                </div>

                {buyoutCalc && (() => {
                  const durLabel = selectedDuration === 1 ? "1h"
                    : selectedDuration === 24 ? "1d"
                    : selectedDuration === 168 ? "7d"
                    : selectedDuration === 720 ? "1m"
                    : selectedDuration + "h";
                  return (
                  <>
                    <div className="cost-row">
                      <span className="cost-label">Buyout price</span>
                      <span className="cost-value">{fmtNum(parseFloat(formatUnits(buyoutCalc.buyoutPrice, 18)), 2)} FLIP</span>
                    </div>
                    <div className="cost-row">
                      <span className="cost-label">Your new price</span>
                      <span className="cost-value">{fmtNum(parseFloat(formatUnits(buyoutCalc.newPrice, 18)), 2)} FLIP</span>
                    </div>
                    <div className="cost-row">
                      <span className="cost-label">Tax deposit ({durLabel})</span>
                      <span className="cost-value">{fmtNum(parseFloat(formatUnits(buyoutCalc.deposit, 18)), 2)} FLIP</span>
                    </div>
                    <div className="total-row">
                      <span className="total-label">Approve</span>
                      <span className="total-value">{fmtNum(parseFloat(formatUnits(buyoutCalc.totalVal, 18)), 2)} FLIP</span>
                    </div>
                  </>
                  );
                })()}

                <div style={{ fontSize: 9, color: "#475569", margin: "4px 0 8px", textAlign: "center" }}>
                  {seatHook.graduation?.graduated
                    ? "Two transactions: approve FLIPPER → buy out"
                    : "Buyouts unlock after all 256 seats are minted."}
                </div>
                <button className="modal-buy-btn"
                  disabled={!seatHook.graduation?.graduated}
                  style={!seatHook.graduation?.graduated ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                  onClick={async () => {
                    if (!seatHook.graduation?.graduated) { addToast("info", "Buyouts unlock after graduation"); return; }
                    if (!buyoutCalc || !seatsContract || !tokenContract) return;
                    try {
                      await buyOutSeatFn(seatsContract, tokenContract, selectedSeat.id, buyoutCalc.newPrice, buyoutCalc.deposit);
                      addToast("success", `Bought Seat #${selectedSeat.id}!`);
                      setSelectedSeat(null); seatHook.refreshSeats();
                      refreshBalance(); refreshTokenBalance?.();
                      setTimeout(() => seatHook.refreshSeats(), 2000);
                    } catch (err) { addToast("error", decodeError(err)); }
                  }}>{seatHook.graduation?.graduated ? "Buy Seat" : "Locked (pre-graduation)"}</button>
                <button className="modal-cancel-btn" onClick={() => setSelectedSeat(null)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BULK BUY MODAL — empty seats (mint) */}
      {showBulkBuy && (() => {
        // BigInt math so the approve is correct regardless of locale/float.
        const emptyAll = seatHook.seats.filter(s => !s.active);
        // If the seats feed hasn't populated yet, fall back to the batch
        // ceiling (64) — pre-graduation virtually everything is empty.
        const seatsLoaded = seatHook.seats.length > 0;
        const maxQty = seatsLoaded ? Math.max(1, emptyAll.length) : 64;
        const qty = Math.min(Math.max(1, bulkCount), maxQty);

        const cleanedPrice = sanitizeNum(bulkListPrice);
        let listedWei = 0n;
        try { listedWei = cleanedPrice ? parseUnits(cleanedPrice, 18) : 0n; } catch { listedWei = 0n; }
        const weeklyTaxWei = listedWei * 500n / 10000n;
        // V8: deposit = weeklyTax * (hours / 168)
        const depositPerWei = weeklyTaxWei * BigInt(bulkDepositHours) / 168n;
        const mintWei = onChainMintPriceWei || 0n;
        const approvePerWei = mintWei + depositPerWei;
        const grandTotalWei = approvePerWei * BigInt(qty);
        const fmt = (w) => fmtNum(Number(formatUnits(w, 18)), 2);

        const plannedIds = (bulkProgress.total > 0 ? bulkProgress.seatIds : emptyAll.slice(0, qty).map(s => s.id));
        const progressPct = bulkProgress.total > 0 ? Math.round((bulkProgress.done / bulkProgress.total) * 100) : 0;

        return (
          <div onClick={e => { if (e.target === e.currentTarget && !bulkBuying) setShowBulkBuy(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: "#131820", border: "1px solid #1c2430", borderRadius: 14, padding: 24, width: 440, maxHeight: "85vh", overflowY: "auto" }}>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 16, fontWeight: 800, color: "#f7b32b", marginBottom: 6 }}>
                {bulkBuying ? "Minting…" : "Buy Several at Once"}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 14, lineHeight: 1.5 }}>
                One approve for the grand total, then one mint per seat. Approve = (mint price + deposit) × qty.
              </div>

              {!bulkBuying && (<>
                {/* Quantity — numeric input + quick buttons */}
                <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>QUANTITY (1–{maxQty})</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <input type="number" min={1} max={maxQty} step={1}
                    value={bulkCount}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setBulkCount(Math.min(Math.max(1, v), maxQty));
                      else if (e.target.value === "") setBulkCount(1);
                    }}
                    style={{
                      width: 90, padding: "8px 10px", borderRadius: 6,
                      border: "1px solid #1c2430", background: "#0b0e11",
                      color: "#f7b32b", fontSize: 13, fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                    }} />
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {[1, 3, 5, 10, 20, 50].map(n => (
                      <button key={n} disabled={n > maxQty} onClick={() => setBulkCount(Math.min(n, maxQty))} style={{
                        padding: "6px 10px", borderRadius: 5,
                        border: "1px solid " + (qty === n ? "#f7b32b" : "#1c2430"),
                        background: qty === n ? "#f7b32b10" : "#0b0e11",
                        color: qty === n ? "#f7b32b" : (n > maxQty ? "#2a3040" : "#94a3b8"),
                        fontSize: 10, fontWeight: 700,
                        cursor: n > maxQty ? "not-allowed" : "pointer", fontFamily: "inherit",
                      }}>{n}</button>
                    ))}
                    <button onClick={() => setBulkCount(Math.min(maxQty, 64))} style={{
                      padding: "6px 10px", borderRadius: 5,
                      border: "1px solid #f7b32b50", background: "transparent",
                      color: "#f7b32b", fontSize: 10, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit",
                    }}>All ({Math.min(maxQty, 64)})</button>
                  </div>
                </div>

                {/* List price per seat */}
                <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>LIST PRICE PER SEAT (FLIP)</div>
                <input inputMode="decimal" value={bulkListPrice}
                  onChange={e => setBulkListPrice(e.target.value)}
                  placeholder="e.g. 1000"
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: 6,
                    border: "1px solid #1c2430", background: "#0b0e11",
                    color: "#e2e8f0", fontSize: 12, fontWeight: 600,
                    fontFamily: "'JetBrains Mono', monospace", marginBottom: 10,
                  }} />

                {/* V8 deposit duration (hours) */}
                <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>DEPOSIT DURATION (min 1h)</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  {[{l:"1h",h:1},{l:"1d",h:24},{l:"7d",h:168},{l:"1m",h:720}].map(opt => (
                    <button key={opt.h} onClick={() => setBulkDepositHours(opt.h)} style={{
                      flex: 1, padding: "6px 0", borderRadius: 6,
                      border: "1px solid " + (bulkDepositHours === opt.h ? "#f7b32b" : "#1c2430"),
                      background: bulkDepositHours === opt.h ? "#f7b32b12" : "#0b0e11",
                      color: bulkDepositHours === opt.h ? "#f7b32b" : "#94a3b8",
                      fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}>{opt.l}</button>
                  ))}
                </div>
              </>)}

              <div style={{ padding: 12, background: "#0b0e11", borderRadius: 8, marginBottom: 12 }}>
                {(() => {
                  const bulkDurLabel = bulkDepositHours === 1 ? "1h"
                    : bulkDepositHours === 24 ? "1d"
                    : bulkDepositHours === 168 ? "7d"
                    : bulkDepositHours === 720 ? "1m"
                    : bulkDepositHours + "h";
                  return [
                  { l: "Seats",               v: String(qty) },
                  { l: "Mint price (chain)",  v: (onChainMintPriceWei ? fmt(mintWei) : "loading…") + " FLIP", c: "#94a3b8" },
                  { l: "List price / seat",   v: fmt(listedWei) + " FLIP" },
                  { l: `Deposit / seat (${bulkDurLabel})`, v: fmt(depositPerWei) + " FLIP" },
                  { l: "Approve / seat",      v: fmt(approvePerWei) + " FLIP", c: "#94a3b8" },
                  { l: "Total approve",       v: fmt(grandTotalWei) + " FLIP", c: "#f7b32b", bold: true },
                  ];
                })().map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11 }}>
                    <span style={{ color: "#475569" }}>{r.l}</span>
                    <span style={{ color: r.c || "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: r.bold ? 700 : 600 }}>{r.v}</span>
                  </div>
                ))}
              </div>

              {/* Seat IDs that will be minted */}
              {plannedIds.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>SEATS TO MINT</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {plannedIds.slice(0, 40).map((id, i) => {
                      const done = bulkProgress.total > 0 && i < bulkProgress.done;
                      const active = bulkProgress.total > 0 && i === bulkProgress.done;
                      return (
                        <span key={id} style={{
                          fontSize: 10, padding: "3px 8px", borderRadius: 4,
                          fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
                          border: "1px solid " + (done ? "#22c55e40" : active ? "#f7b32b" : "#1c2430"),
                          background: done ? "#22c55e15" : active ? "#f7b32b18" : "#0b0e11",
                          color: done ? "#22c55e" : active ? "#f7b32b" : "#94a3b8",
                        }}>#{id}{done ? " \u2713" : ""}</span>
                      );
                    })}
                    {plannedIds.length > 40 && <span style={{ fontSize: 10, color: "#475569" }}>+{plannedIds.length - 40}</span>}
                  </div>
                </div>
              )}

              {bulkBuying && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>
                    <span>Progress</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#f7b32b" }}>
                      {bulkProgress.done}/{bulkProgress.total} ({progressPct}%)
                    </span>
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: progressPct + "%",
                      background: "linear-gradient(90deg, #b8860b, #f7b32b)",
                      transition: "width 0.3s ease",
                    }}/>
                  </div>
                </div>
              )}

              <button disabled={bulkBuying || qty === 0 || listedWei <= 0n || !onChainMintPriceWei} onClick={async () => {
                if (!seatsContract || !tokenContract) { addToast("error", "Wallet not ready"); return; }
                // If the seats feed is empty (still loading), refresh + pull the
                // live list before slicing, so we don't bail on a stale array.
                let empties = emptyAll;
                if (empties.length === 0) {
                  try {
                    await seatHook.refreshSeats();
                    empties = (seatHook.seats || []).filter(s => !s.active);
                  } catch {}
                }
                if (empties.length === 0) { addToast("error", "No empty seats to mint"); return; }
                const toBuy = empties.slice(0, qty);
                setBulkBuying(true);
                setBulkProgress({ done: 0, total: toBuy.length, seatIds: toBuy.map(s => s.id) });
                try {
                  // 1) Fresh on-chain mint price + 1% safety margin on the approve
                  //    to absorb any rounding drift between calls.
                  const mpNow = await seatsContract.calculateMintPrice();
                  const needPerSeat = mpNow + depositPerWei;
                  const grand = needPerSeat * BigInt(toBuy.length);
                  const withMargin = grand + (grand / 100n); // +1%

                  // 2) Balance pre-check so we surface the real problem instead
                  //    of an opaque "execution reverted".
                  try {
                    const bal = await tokenContract.balanceOf(address);
                    if (bal < grand) {
                      addToast("error", `Need ${fmt(grand)} FLIPPER, only have ${fmt(bal)}`);
                      setBulkBuying(false); return;
                    }
                  } catch {}

                  // V8 F6: one approve + one batchMint call. The contract
                  // handles all N seats atomically (all succeed or all fail).
                  const approvePendingId = addToast("pending", `Approving ${fmt(withMargin)} FLIPPER for ${toBuy.length} seats…`);
                  try {
                    await approveFlipperFn(tokenContract, withMargin);
                  } finally {
                    dismissToast(approvePendingId);
                  }

                  try {
                    const allow = await tokenContract.allowance(address, SEATS_ADDRESS);
                    if (allow < grand) {
                      addToast("error", "Approve didn't land. Try again.");
                      setBulkBuying(false); return;
                    }
                  } catch {}

                  // batchMint has no on-chain cap; 256 covers all seats in 1 TX.
                  const CHUNK = 256;
                  let bought = 0;
                  const failedIds = [];
                  for (let i = 0; i < toBuy.length; i += CHUNK) {
                    const wave = toBuy.slice(i, i + CHUNK);
                    const ids = wave.map(s => s.id);
                    const pId = addToast("pending", `Minting batch ${i + 1}–${i + wave.length}…`);
                    try {
                      const tx = await seatsContract.batchMint(ids, listedWei, depositPerWei);
                      await tx.wait();
                      bought += wave.length;
                    } catch (err) {
                      console.error("[batchMint]", err);
                      failedIds.push(...ids);
                    } finally {
                      dismissToast(pId);
                    }
                    setBulkProgress(p => ({ ...p, done: bought }));
                  }
                  if (bought > 0) addToast("success", `Minted ${bought}/${toBuy.length} seats in 1 TX`);
                  if (failedIds.length > 0) addToast("error", `Skipped seats: ${failedIds.slice(0, 8).map(id => "#" + id).join(", ")}${failedIds.length > 8 ? "…" : ""}`);
                  if (bought === toBuy.length) {
                    setTimeout(() => { setShowBulkBuy(false); setBulkProgress({ done: 0, total: 0, seatIds: [] }); }, 800);
                  }
                } catch (err) {
                  addToast("error", decodeError(err));
                } finally {
                  setBulkBuying(false);
                  seatHook.refreshSeats(); refreshTokenBalance?.();
                  setTimeout(() => seatHook.refreshSeats(), 2000);
                }
              }} style={{
                width: "100%", padding: 14, borderRadius: 10,
                background: bulkBuying ? "#475569" : "linear-gradient(135deg, #b8860b, #f7b32b)",
                color: "#0b0e11", fontSize: 14, fontWeight: 800, border: "none",
                cursor: bulkBuying ? "wait" : "pointer", fontFamily: "'Chakra Petch', sans-serif",
              }}>
                {bulkBuying ? `Minting ${bulkProgress.done + 1}/${bulkProgress.total}…` : `Mint ${qty} Seat${qty === 1 ? "" : "s"}`}
              </button>
              <div style={{ fontSize: 9, color: "#475569", marginTop: 8, textAlign: "center" }}>V8: 1 approve + 1 batchMint for all seats (atomic)</div>
            </div>
          </div>
        );
      })()}

      {/* TAKE OVER MULTIPLE MODAL — occupied seats (batch buyout) */}
      {showTakeOver && (() => {
        const occupiedAll = seatHook.seats
          .filter(s => s.active && s.owner?.toLowerCase() !== address?.toLowerCase());
        const selected = occupiedAll.filter(s => takeOverSelected.includes(s.id));
        // Tenths — 1.1x is the min that is strictly above current on-chain price.
        const multOptions = [
          { tenths: 11, label: "1.1x" },
          { tenths: 12, label: "1.2x" },
          { tenths: 20, label: "2x"   },
          { tenths: 50, label: "5x"   },
        ];
        const computed = selected.map(s => {
          const newPrice = s.price * BigInt(takeOverMult) / 10n;
          const weeklyTax = newPrice * 500n / 10000n;
          const deposit = weeklyTax * BigInt(takeOverDuration) / 168n;
          const buyoutCost = s.price; // paid to prior owner
          return { id: s.id, price: s.price, newPrice, deposit, buyoutCost };
        });
        const totalBuyout = computed.reduce((a, c) => a + c.buyoutCost, 0n);
        const totalDeposit = computed.reduce((a, c) => a + c.deposit, 0n);
        const totalApprove = totalBuyout + totalDeposit;
        const approveFlip = parseFloat(formatUnits(totalApprove, 18));
        const usd = approveFlip / 1000 * 10; // 1000 FLIP ≈ $10 (mint-price convention)

        const toggle = (id) => setTakeOverSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(0, 64));

        return (
          <div onClick={e => { if (e.target === e.currentTarget && !takeOverBusy) setShowTakeOver(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: "#131820", border: "1px solid #1c2430", borderRadius: 14, padding: 24, width: 460, maxHeight: "85vh", overflowY: "auto" }}>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 16, fontWeight: 800, color: "#ef4444", marginBottom: 6 }}>
                Take Over Multiple
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 14, lineHeight: 1.5 }}>
                Buy {selected.length} occupied seat{selected.length === 1 ? "" : "s"} in a single transaction. Max 64 per TX.
              </div>

              {/* Multiplier — min 1.1x because on-chain requires new price > current */}
              <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>NEW PRICE MULTIPLIER</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {multOptions.map(opt => (
                  <button key={opt.tenths} onClick={() => setTakeOverMult(opt.tenths)} style={{
                    flex: 1, padding: "6px 0", borderRadius: 6,
                    border: "1px solid " + (takeOverMult === opt.tenths ? "#f7b32b" : "#1c2430"),
                    background: takeOverMult === opt.tenths ? "#f7b32b10" : "#0b0e11",
                    color: takeOverMult === opt.tenths ? "#f7b32b" : "#475569",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}>{opt.label}</button>
                ))}
              </div>

              {/* V8: duration is hours; contract min is MIN_DEPOSIT_HOURS=1 */}
              <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>DEPOSIT DURATION (min 1h)</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[{l:"1h",h:1},{l:"1d",h:24},{l:"7d",h:168},{l:"1m",h:720}].map(d => (
                  <button key={d.h} onClick={() => setTakeOverDuration(d.h)} style={{
                    flex: 1, padding: "6px 0", borderRadius: 6,
                    border: "1px solid " + (takeOverDuration === d.h ? "#f7b32b" : "#1c2430"),
                    background: takeOverDuration === d.h ? "#f7b32b10" : "#0b0e11",
                    color: takeOverDuration === d.h ? "#f7b32b" : "#475569",
                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  }}>{d.l}</button>
                ))}
              </div>

              {/* Selection grid */}
              <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                TARGETS ({selected.length}/{Math.min(occupiedAll.length, 64)})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: 8, background: "#0b0e11", borderRadius: 6, marginBottom: 12, maxHeight: 140, overflowY: "auto" }}>
                {occupiedAll.map(s => {
                  const on = takeOverSelected.includes(s.id);
                  return (
                    <button key={s.id} onClick={() => toggle(s.id)} style={{
                      fontSize: 10, padding: "3px 8px", borderRadius: 4,
                      border: "1px solid " + (on ? "#ef4444" : "#1c2430"),
                      background: on ? "rgba(239,68,68,0.15)" : "transparent",
                      color: on ? "#fca5a5" : "#94a3b8",
                      fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, cursor: "pointer",
                    }}>#{s.id} · {s.priceNum.toFixed(0)}</button>
                  );
                })}
              </div>

              {/* Totals */}
              <div style={{ padding: 12, background: "#0b0e11", borderRadius: 8, marginBottom: 12 }}>
                {[
                  { l: "Seats",          v: String(selected.length) },
                  { l: "Buyouts total",  v: `${fmtNum(parseFloat(formatUnits(totalBuyout, 18)), 0)} FLIP` },
                  { l: "Deposits total", v: `${fmtNum(parseFloat(formatUnits(totalDeposit, 18)), 0)} FLIP` },
                  { l: "Total approve",  v: `${fmtNum(approveFlip, 0)} FLIP`, c: "#f7b32b" },
                  { l: "USD equivalent", v: `~$${fmtNum(usd, 0)}`, c: "#22c55e" },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11 }}>
                    <span style={{ color: "#475569" }}>{r.l}</span>
                    <span style={{ color: r.c || "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{r.v}</span>
                  </div>
                ))}
              </div>

              <button disabled={takeOverBusy || selected.length === 0} onClick={async () => {
                if (!seatsContract || !tokenContract) { addToast("error", "Wallet not ready"); return; }
                setTakeOverBusy(true);
                try {
                  const ids = computed.map(c => c.id);
                  const prices = computed.map(c => c.newPrice);
                  const deposits = computed.map(c => c.deposit);
                  await takeOverMultipleFn(seatsContract, tokenContract, ids, prices, deposits, totalApprove);
                  addToast("success", `Took over ${selected.length} seats`);
                  seatHook.refreshSeats(); refreshTokenBalance?.();
                  setTimeout(() => seatHook.refreshSeats(), 2000);
                  setShowTakeOver(false);
                } catch (err) {
                  addToast("error", decodeError(err));
                }
                setTakeOverBusy(false);
              }} style={{
                width: "100%", padding: 14, borderRadius: 10,
                background: takeOverBusy ? "#475569" : "linear-gradient(135deg, #ef4444, #b91c1c)",
                color: "#fff", fontSize: 14, fontWeight: 800, border: "none",
                cursor: takeOverBusy ? "wait" : "pointer", fontFamily: "'Chakra Petch', sans-serif",
              }}>
                {takeOverBusy ? "Taking over…" : `Take Over ${selected.length} Seat${selected.length === 1 ? "" : "s"}`}
              </button>
              <div style={{ fontSize: 9, color: "#475569", marginTop: 8, textAlign: "center" }}>
                Two transactions: approve FLIPPER → takeOverMultiple
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════
function AdminPanel({ contract, seatsContract, protocolStats, graduation, yieldPoolWei }) {
  const [loading, setLoading] = useState("");
  const [confirm, setConfirm] = useState(null); // { label, run }
  const [lastWithdrawAt, setLastWithdrawAt] = useState(() => {
    try { return parseInt(localStorage.getItem("admin_last_withdraw") || "0", 10) || 0; }
    catch { return 0; }
  });
  const [nowSec, setNowSec] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const iv = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);

  const COOLDOWN = 24 * 60 * 60; // 24h
  const untilNext = Math.max(0, lastWithdrawAt + COOLDOWN - nowSec);
  const countdownStr = (() => {
    const h = Math.floor(untilNext / 3600);
    const m = Math.floor((untilNext % 3600) / 60);
    const s = untilNext % 60;
    return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  })();

  const exec = async (label, fn, { gated = false } = {}) => {
    const run = async () => {
      setLoading(label);
      try {
        const tx = await fn();
        await tx.wait();
        addToast("success", label + " done");
        if (gated) {
          const t = Math.floor(Date.now() / 1000);
          setLastWithdrawAt(t);
          try { localStorage.setItem("admin_last_withdraw", String(t)); } catch {}
        }
      } catch (e) { addToast("error", decodeError(e)); }
      setLoading("");
      setConfirm(null);
    };
    setConfirm({ label, run });
  };

  const btnStyle = (color) => ({
    padding: "12px", borderRadius: 8, cursor: "pointer", width: "100%",
    background: color + "10", border: "1px solid " + color + "30",
    color, fontSize: 11, fontWeight: 700, fontFamily: "inherit",
    opacity: loading ? 0.5 : 1, marginBottom: 6,
  });

  const stat = (label, value, color = "#e2e8f0") => (
    <div style={{
      padding: "10px 12px", background: "#0b0e11", border: "1px solid #1c2430",
      borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <span style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 0.5 }}>{label}</span>
      <span style={{ fontSize: 13, color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </span>
    </div>
  );

  const protocolBal = protocolStats?.protocolBalance || "0";
  const treasuryBal = protocolStats?.treasuryBalance || "0";
  const jackpotBal  = protocolStats?.jackpotPool || "0";
  const yieldPoolEth = yieldPoolWei ? parseFloat(formatEther(yieldPoolWei)) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* STATS GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {stat("Total Flips",        fmtNum(protocolStats?.totalFlips || 0, 0))}
        {stat("Total Volume (ETH)", fmtNum(protocolStats?.totalVolume || 0, 4))}
        {stat("Treasury (ETH)",     fmtNum(treasuryBal, 4), "#f7b32b")}
        {stat("Protocol fees (ETH)", fmtNum(protocolBal, 4), "#22c55e")}
        {stat("Jackpot pool (ETH)", fmtNum(jackpotBal, 4), "#3b82f6")}
        {stat("Yield pool (ETH)",   fmtNum(yieldPoolEth, 4), "#22c55e")}
        {stat("Active seats",       `${graduation?.activeCount ?? 0}`)}
        {stat("Total minted",       `${graduation?.totalMinted ?? 0}/256`)}
      </div>

      {/* COUNTDOWN */}
      <div style={{
        padding: "12px 14px", background: "rgba(239,68,68,0.06)",
        border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8,
      }}>
        <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, letterSpacing: 0.5 }}>NEXT TREASURY CLAIM</div>
        <div style={{ fontSize: 16, color: untilNext === 0 ? "#22c55e" : "#e2e8f0", fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
          {untilNext === 0 ? "Available now" : `in ${countdownStr}`}
        </div>
      </div>

      {/* ACTIONS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button disabled={loading !== ""} onClick={() => exec("Withdraw Protocol", () => contract.withdrawProtocol())} style={btnStyle("#22c55e")}>
          Withdraw Protocol
        </button>
        <button disabled={loading !== ""} onClick={() => exec("Withdraw Jackpot", () => contract.withdrawJackpot())} style={btnStyle("#3b82f6")}>
          Withdraw Jackpot
        </button>
        <button disabled={loading !== ""} onClick={() => exec("Distribute Yield", () => seatsContract.distributeYield())} style={btnStyle("#f7b32b")}>
          Distribute Seat Yield
        </button>
        <button disabled={loading !== "" || untilNext > 0}
          onClick={() => exec("Withdraw Treasury", () => contract.withdrawTreasury(), { gated: true })}
          style={btnStyle("#ef4444")}>
          {untilNext > 0 ? "Treasury locked" : "Withdraw Treasury"}
        </button>
        <button disabled={loading !== ""} onClick={() => exec("Fund Treasury +0.01", () => contract.fundTreasury({ value: parseEther("0.01") }))} style={btnStyle("#94a3b8")}>
          Fund Treasury +0.01 ETH
        </button>
        <button disabled={loading !== ""} onClick={() => exec("Pause", () => contract.pause())} style={btnStyle("#94a3b8")}>
          Pause
        </button>
        <button disabled={loading !== ""} onClick={() => exec("Unpause", () => contract.unpause())} style={btnStyle("#94a3b8")}>
          Unpause
        </button>
      </div>

      {/* CONFIRM MODAL */}
      {confirm && (
        <div onClick={e => { if (e.target === e.currentTarget) setConfirm(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#131820", border: "1px solid #ef444440", borderRadius: 12, padding: 24, maxWidth: 400, width: "100%" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#ef4444", marginBottom: 8 }}>Confirm action</div>
            <div style={{ fontSize: 12, color: "#e2e8f0", marginBottom: 16 }}>
              {confirm.label} — this is irreversible. Proceed?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirm(null)} style={{ flex: 1, padding: 10, borderRadius: 8, background: "#0b0e11", border: "1px solid #1c2430", color: "#94a3b8", fontWeight: 700, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={confirm.run} disabled={loading !== ""} style={{ flex: 1, padding: 10, borderRadius: 8, background: "#ef4444", border: "none", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
                {loading ? "Sending…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
//  F4: PERSISTENT FLIP TICKER
// ═══════════════════════════════════════
function FlipTicker({ recentFlips }) {
  const treasuryLC = COINFLIP_ADDRESS.toLowerCase();
  const flips = recentFlips.filter(f => parseFloat(f.amount || 0) >= 0.0005).slice(0, 20);
  if (flips.length === 0) return null;
  return (
    <div style={{
      background: "linear-gradient(180deg, #07090d, #0b0e11)",
      borderBottom: "1px solid #1c2430",
      overflow: "hidden", position: "relative",
    }}>
      <div style={{
        display: "flex", gap: 14, padding: "6px 16px",
        whiteSpace: "nowrap", overflowX: "auto",
        fontFamily: "'JetBrains Mono', monospace",
        scrollbarWidth: "none", msOverflowStyle: "none",
      }}>
        {flips.map((f, i) => {
          const winner = (f.winner || "").toLowerCase();
          const loser  = (f.loser  || "").toLowerCase();
          const isTrW = winner === treasuryLC;
          const isTrL = loser  === treasuryLC;
          const trInvolved = isTrW || isTrL;
          const payoutNum = parseFloat(f.payout || 0);
          const amountNum = parseFloat(f.amount || 0);

          // From the human player's perspective when Treasury is involved.
          const playerAddr = trInvolved ? (isTrW ? f.loser : f.winner) : f.winner;
          const playerName = shortAddr(playerAddr);
          const outcomeWin = trInvolved ? isTrL : true; // PvP: color by winner side
          const label = trInvolved
            ? (outcomeWin ? "WON" : "LOST")
            : "PVP";

          const accent = outcomeWin ? "#22c55e" : "#ef4444";
          return (
            <div key={f.id + "-" + i} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 12,
              background: `${accent}14`,
              border: `1px solid ${accent}33`,
              fontSize: 10, color: accent, fontWeight: 700,
              flexShrink: 0,
            }}>
              <span>{label}</span>
              <span>{outcomeWin ? "+" : "−"}{fmtNum(outcomeWin ? payoutNum || amountNum : amountNum)} ETH</span>
              <span style={{ color: "#94a3b8" }}>{playerName}</span>
              {trInvolved && (
                <span style={{ color: "#64748b", fontSize: 9 }}>vs Treasury</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  F1: PROFILE VIEW — takeover.fun-inspired layout
// ═══════════════════════════════════════

// XP thresholds mirror getLevelForXP() in FlipperSeats.sol.
// Level 1 starts at 0 XP; Level 6 (Whale) is the cap.
const XP_THRESHOLDS = [0, 500, 2000, 5000, 15000, 50000];

function levelProgress(xp, level) {
  // Contract returns levels 1..6. Map to name indices 0..5.
  const lvl = Math.max(1, Math.min(6, level || 1));
  const currentMin = XP_THRESHOLDS[lvl - 1];
  const nextMin = lvl >= 6 ? currentMin : XP_THRESHOLDS[lvl];
  const capped = lvl >= 6;
  const progressPct = capped ? 100
    : Math.max(0, Math.min(100, ((xp - currentMin) / (nextMin - currentMin)) * 100));
  return { currentMin, nextMin, progressPct, capped };
}

function ProfileView({ address, isOwnProfile, seats, seatsContract, tokenBalance, playerStats, userProfile, linkTwitter, twitterUser, onBack }) {
  const [profileData, setProfileData] = useState({ name: "", avatar: "", twitter: "" });
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("seats");
  const [seatsExpanded, setSeatsExpanded] = useState(false);

  const targetAddr = (address || "").toLowerCase();

  useEffect(() => {
    if (!targetAddr) return;
    fetch(`${PROFILES_API}/api/profiles/${targetAddr}`)
      .then(r => r.json())
      .then(data => {
        setProfileData({
          name: data.name || "",
          avatar: data.avatar || "",
          twitter: data.twitter || "",
        });
        setNameInput(data.name || "");
      })
      .catch(() => {});
  }, [targetAddr]);

  // If this is MY profile and Privy has my Twitter info, auto-sync it.
  useEffect(() => {
    if (!isOwnProfile || !twitterUser || !targetAddr) return;
    const handle = twitterUser.username || "";
    const avatar = twitterUser.profilePictureUrl || "";
    if (!handle && !avatar) return;
    if (profileData.twitter === handle && profileData.avatar === avatar) return;
    fetch(`${PROFILES_API}/api/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: targetAddr,
        name: profileData.name || handle,
        avatar,
        twitter: handle,
      }),
    }).then(() => setProfileData(p => ({ ...p, avatar, twitter: handle })))
      .catch(() => {});
  }, [twitterUser, isOwnProfile, targetAddr, profileData.twitter, profileData.avatar, profileData.name]);

  const mySeats = useMemo(() => {
    if (!Array.isArray(seats)) return [];
    return seats.filter(s => s.active && (s.owner || "").toLowerCase() === targetAddr);
  }, [seats, targetAddr]);

  // ── derived stats ─────────────────────────────
  const totalSeatValueFlip = mySeats.reduce((sum, s) => sum + (s.priceNum || 0), 0);
  const totalDepositFlip = mySeats.reduce((sum, s) => sum + (s.depositNum || 0), 0);
  const netWeekFlip = totalSeatValueFlip * 0.05; // rough: 5% weekly yield scale
  const lowestPriceFlip = mySeats.length
    ? Math.min(...mySeats.map(s => s.priceNum || Infinity))
    : 0;

  // PNL = coinflip winnings - wagered (in ETH). No stablecoin price on testnet,
  // so keep PNL in the native unit and tag it "ETH".
  const wageredEth = parseFloat(playerStats?.wagered || 0);
  const wonEth     = parseFloat(playerStats?.won || 0);
  const pnlEth = wonEth - wageredEth;
  const pnlPositive = pnlEth >= 0;

  // XP + level
  const xp = userProfile?.xp ?? 0;
  const level = userProfile?.level ?? 1;
  const levelName = LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)] || LEVEL_NAMES[0];
  const levelColor = LEVEL_COLORS[Math.min(level - 1, 5)] || LEVEL_COLORS[0];
  const { currentMin, nextMin, progressPct, capped } = levelProgress(xp, level);

  const saveName = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${PROFILES_API}/api/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: targetAddr, name: nameInput }),
      });
      // `fetch` only rejects on network errors, not on HTTP 4xx/5xx. Surface
      // the status code so a bad request doesn't silently look like success.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setProfileData(p => ({ ...p, name: nameInput }));
      setEditing(false);
      addToast("success", "Profile saved");
    } catch (err) {
      console.error("[profile save]", err);
      addToast("error", `Save failed: ${err?.message || "network error"}`);
    }
    setSaving(false);
  };

  const avatarBg = profileData.avatar
    ? `url(${profileData.avatar}) center/cover`
    : `linear-gradient(135deg, ${addrColor(address)}, ${addrColor(address)}99)`;

  // Shared card style
  const card = {
    background: "#0b0e11",
    border: "1px solid #1c2430",
    borderRadius: 12,
  };

  const winRate = userProfile?.totalFlips > 0
    ? (userProfile.wins / userProfile.totalFlips) * 100
    : 0;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 20px" }}>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: "#94a3b8", cursor: "pointer",
        fontSize: 12, marginBottom: 16, padding: "6px 0",
      }}>← Back</button>

      {/* ── HEADER ──────────────────────────────────── */}
      <div style={{
        ...card,
        padding: 20, marginBottom: 16,
        background: "linear-gradient(135deg, rgba(247,179,43,0.04), #0b0e11)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%", background: avatarBg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 800, color: "#0b0e11", flexShrink: 0,
            border: "2px solid " + levelColor,
          }}>
            {!profileData.avatar && address?.slice(2, 4).toUpperCase()}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input value={nameInput} onChange={e => setNameInput(e.target.value)} maxLength={32}
                  style={{ flex: 1, padding: "8px 10px", borderRadius: 6, background: "#07090d", border: "1px solid #1c2430", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit" }}
                  placeholder="Display name" autoFocus />
                <button onClick={saveName} disabled={saving} style={{ padding: "8px 14px", borderRadius: 6, background: "#f7b32b", color: "#0b0e11", border: "none", fontWeight: 800, cursor: "pointer" }}>
                  {saving ? "…" : "Save"}
                </button>
                <button onClick={() => { setEditing(false); setNameInput(profileData.name); }} style={{ padding: "8px 10px", borderRadius: 6, background: "transparent", color: "#94a3b8", border: "1px solid #1c2430", cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 22, fontWeight: 900, color: "#e2e8f0" }}>
                  {profileData.name || shortAddr(address)}
                </div>
                <span style={{
                  padding: "3px 8px", borderRadius: 10, background: levelColor + "22",
                  color: levelColor, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                }}>Lv.{level} {levelName}</span>
                {profileData.twitter && (
                  <a href={`https://x.com/${profileData.twitter}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: "#1da1f2", textDecoration: "none" }}>@{profileData.twitter}</a>
                )}
                {isOwnProfile && (
                  <button onClick={() => setEditing(true)} style={{ fontSize: 11, background: "none", border: "1px solid #1c2430", color: "#94a3b8", padding: "4px 10px", borderRadius: 6, cursor: "pointer" }}>
                    Edit
                  </button>
                )}
              </div>
            )}

            {/* Address + copy */}
            <div onClick={() => { navigator.clipboard.writeText(address); addToast("success", "Address copied"); }}
              style={{ fontSize: 11, color: "#475569", marginTop: 6, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-all" }}>
              {address} <span style={{ color: "#f7b32b" }}>↗ copy</span>
            </div>

            {/* Connect X */}
            {isOwnProfile && !profileData.twitter && linkTwitter && (
              <button onClick={() => linkTwitter()} style={{
                marginTop: 10, padding: "6px 14px", borderRadius: 6,
                background: "#1da1f215", border: "1px solid #1da1f240",
                color: "#1da1f2", fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}>Connect X</button>
            )}
          </div>
        </div>

        {/* XP BAR */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
              XP · Level {level}
            </span>
            <span style={{ fontSize: 10, color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
              {capped ? `${fmtNum(xp, 0)} XP · MAX` : `${fmtNum(xp, 0)} / ${fmtNum(nextMin, 0)} XP`}
            </span>
          </div>
          <div style={{ height: 6, background: "#07090d", border: "1px solid #1c2430", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${progressPct}%`,
              background: `linear-gradient(90deg, ${levelColor}, ${levelColor}aa)`,
              boxShadow: `0 0 8px ${levelColor}66`,
              transition: "width 0.4s ease",
            }} />
          </div>
        </div>
      </div>

      {/* ── 3 STAT CARDS ────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
        {/* PNL */}
        <div style={{ ...card, padding: "14px 16px" }}>
          <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1, fontWeight: 700, textTransform: "uppercase" }}>PNL</div>
          <div style={{
            fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", marginTop: 4,
            color: pnlEth === 0 ? "#e2e8f0" : pnlPositive ? "#22c55e" : "#ef4444",
          }}>
            {pnlEth === 0 ? "0" : (pnlPositive ? "+" : "−") + fmtNum(Math.abs(pnlEth), 4)} ETH
          </div>
          <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>
            Coinflip wins − wagered
          </div>
        </div>

        {/* Seats Held */}
        <div style={{ ...card, padding: "14px 16px" }}>
          <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1, fontWeight: 700, textTransform: "uppercase" }}>Seats Held</div>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", marginTop: 4, color: "#e2e8f0" }}>
            {fmtNum(mySeats.length, 0)}
          </div>
          <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>
            Active of {TOTAL_SEATS}
          </div>
        </div>

        {/* Seat Value */}
        <div style={{ ...card, padding: "14px 16px" }}>
          <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1, fontWeight: 700, textTransform: "uppercase" }}>Seat Value</div>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", marginTop: 4, color: "#f7b32b" }}>
            {fmtNum(totalSeatValueFlip, 0)}
          </div>
          <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>
            FLIP listed
          </div>
        </div>
      </div>

      {/* ── TABS ────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1c2430", marginBottom: 16 }}>
        {[
          { k: "seats", l: `Seats (${mySeats.length})` },
          { k: "flips", l: "Flips" },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: "10px 20px", background: "none", border: "none",
            color: tab === t.k ? "#f7b32b" : "#94a3b8",
            borderBottom: "2px solid " + (tab === t.k ? "#f7b32b" : "transparent"),
            fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>{t.l}</button>
        ))}
      </div>

      {/* ── SEATS TAB ─────────────────────────────── */}
      {tab === "seats" && (
        mySeats.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#475569", fontSize: 12 }}>
            No seats owned yet.
          </div>
        ) : (
          <div>
            {/* Summary card (always visible) */}
            <div onClick={() => setSeatsExpanded(e => !e)}
              style={{
                ...card, padding: "16px 18px", cursor: "pointer",
                transition: "border-color 0.2s",
              }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>🎰</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0", fontFamily: "'Orbitron', sans-serif" }}>
                      FLIPPERROOMS
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>
                      {mySeats.length} seat{mySeats.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 10, color: "#f7b32b", fontWeight: 700 }}>
                  {seatsExpanded ? "− Collapse" : "+ Expand"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {[
                  { l: "$ Lowest",      v: fmtNum(lowestPriceFlip, 0), sub: "FLIP" },
                  { l: "⏱ Min duration", v: "1d",                      sub: "default" },
                  { l: "📈 Net / week",  v: "+" + fmtNum(netWeekFlip, 0), sub: "FLIP (est.)" },
                  { l: "💰 Deposit",     v: fmtNum(totalDepositFlip, 0), sub: "FLIP locked" },
                ].map((m, i) => (
                  <div key={i} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: "#475569", letterSpacing: 0.5, fontWeight: 700, marginBottom: 3 }}>{m.l}</div>
                    <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1 }}>
                      {m.v}
                    </div>
                    <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{m.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expanded grid */}
            {seatsExpanded && (
              <div style={{
                marginTop: 10,
                display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 8,
              }}>
                {mySeats.map(s => (
                  <div key={s.id} style={{ ...card, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#f7b32b" }}>#{s.id}</span>
                      {s.name && <span style={{ fontSize: 10, color: "#94a3b8" }}>"{s.name}"</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      Price:{" "}
                      <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtNum(s.priceNum, 0)} FLIP
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      Deposit:{" "}
                      <span style={{ color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace" }}>
                        {fmtNum(s.depositNum, 0)} FLIP
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* ── FLIPS TAB ─────────────────────────────── */}
      {tab === "flips" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {[
            { l: "Total wagered", v: `${fmtNum(wageredEth, 4)} ETH`, c: "#e2e8f0" },
            { l: "Total won",     v: `${fmtNum(wonEth, 4)} ETH`,     c: "#22c55e" },
            { l: "Win rate",      v: `${fmtNum(winRate, 1)}%`,       c: "#e2e8f0" },
            { l: "Flips",         v: `${userProfile?.wins || 0}/${userProfile?.totalFlips || 0}`, c: "#e2e8f0" },
            { l: "Current streak", v: `${playerStats?.streak || 0}`,  c: "#f7b32b" },
            { l: "Best streak",    v: `${playerStats?.bestStreak || 0}`, c: "#f7b32b" },
          ].map((r, i) => (
            <div key={i} style={{ ...card, padding: "12px 14px" }}>
              <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1, fontWeight: 700, textTransform: "uppercase" }}>{r.l}</div>
              <div style={{ fontSize: 16, color: r.c, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", marginTop: 3 }}>{r.v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HowItWorksModal({ onClose }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#131820", border: "1px solid #1c2430", borderRadius: 16, maxWidth: 520, width: "100%",
        maxHeight: "85vh", overflowY: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 800, color: "#f7b32b" }}>How it works</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", fontSize: 20, cursor: "pointer" }}>x</button>
        </div>

        {[
          { n: "1", title: "Flip coins, win ETH", color: "#f7b32b",
            text: "Create a room with any amount (0.0005 - 1 ETH) or join an existing one. 50/50 coinflip \u2014 winner takes 96% of the pot. No deposit needed, play directly from your wallet." },
          { n: "2", title: "Own a seat, earn yield", color: "#22c55e",
            text: "256 revenue seats on the board. Buy one and earn ETH from every coinflip. More volume = more yield. Harberger tax keeps prices fair \u2014 anyone can buy out your seat." },
          { n: "3", title: "Refer and earn more", color: "#3b82f6",
            text: "Each seat has a referral link. Share it \u2014 when someone plays through your link, your seat earns extra yield weighted by the volume you bring." },
        ].map(s => (
          <div key={s.n} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: s.color + "15", border: "1px solid " + s.color + "40",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: s.color,
                fontFamily: "'Orbitron', sans-serif" }}>{s.n}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{s.title}</div>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6, paddingLeft: 38 }}>{s.text}</div>
          </div>
        ))}

        <div style={{ padding: 14, background: "#0b0e11", borderRadius: 10, border: "1px solid #1c2430", marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 1.5, marginBottom: 8 }}>FEE BREAKDOWN (4% of pot)</div>
          {[
            { label: "Seat holders", pct: "1.25%", color: "#f7b32b" },
            { label: "Protocol", pct: "2.0%", color: "#94a3b8" },
            { label: "Referral", pct: "0.5%", color: "#3b82f6" },
            { label: "Jackpot pool", pct: "0.25%", color: "#ef4444" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11 }}>
              <span style={{ color: "#94a3b8" }}>{item.label}</span>
              <span style={{ color: item.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{item.pct}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", borderTop: "1px solid #1c2430", marginTop: 4, fontSize: 11 }}>
            <span style={{ color: "#e2e8f0", fontWeight: 700 }}>Winner receives</span>
            <span style={{ color: "#22c55e", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>96%</span>
          </div>
        </div>

        <button onClick={onClose} style={{
          width: "100%", padding: 12, borderRadius: 10,
          background: "linear-gradient(135deg, #b8860b, #f7b32b)", color: "#0b0e11",
          fontSize: 14, fontWeight: 800, border: "none", cursor: "pointer",
          fontFamily: "'Chakra Petch', sans-serif",
        }}>Got it</button>
      </div>
    </div>
  );
}

export default function FlipperRooms() {
  const wallet = useWallet();
  const {
    connected, address, chainId, connect, disconnect, ready, isEmbedded,
    seatsContract, coinflipContract, tokenContract,
    readSeats, readCoinflip, readToken,
  } = wallet;
  // V7 compatibility aliases: legacy code expects `contract` = coinflip, `readContract` = readCoinflip.
  const contract = coinflipContract;
  const readContract = readCoinflip;
  const sessionBalance = "0"; // V8 removed session deposits — kept as 0 for layout compatibility
  const wrongNetwork = connected && chainId && chainId !== CHAIN_ID;

  const flipHook = useFlip(coinflipContract, readCoinflip, address);
  const seatHook = useSeats(seatsContract, readSeats, address);
  const protocol = useProtocol(coinflipContract, readCoinflip);
  const tokenHook = useTokenBalance(tokenContract, readToken, address);
  const userProfile = useUserProfile(seatsContract, readSeats, address);
  const { toasts, remove: removeToastFn } = useToasts();

  const refreshBalance = useCallback(() => {
    tokenHook.refreshBalance?.();
    userProfile.refreshProfile?.();
  }, [tokenHook, userProfile]);

  const [view, setView] = useState("flip");
  const [tier, setTier] = useState(1);
  const [playerStats, setPlayerStats] = useState(null);
  const [treasuryMax, setTreasuryMax] = useState(null);
  const referral = useRef(getReferralFromUrl()).current;

  // V7 state
  const [customBet, setCustomBet] = useState("0.01");
  const [openRooms, setOpenRooms] = useState(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [walletBalance, setWalletBalance] = useState("0.0000");
  const [showCoinStage, setShowCoinStage] = useState(false);
  const OWNER = "0xE5678F8659d229a303ABecdD0D0113Cf1F4F83aE";

  // Data loading timeout
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Global feeds
  const { recentFlips, liveFlip } = useGlobalFeed(coinflipContract, readCoinflip);

  // Coin state
  const [coinState, setCoinState] = useState("idle");
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const pendingResultRef = useRef(null);
  const [waitingConfirm, setWaitingConfirm] = useState(false);
  const [flipHistory, setFlipHistory] = useState([]);
  const [lastPayout, setLastPayout] = useState("0");
  const [borderState, setBorderState] = useState("idle");
  const spinStartRef = useRef(0);
  const [currentOpponent, setCurrentOpponent] = useState(null);
  const [currentBet, setCurrentBet] = useState("0");
  const [myRoomId, setMyRoomId] = useState(null);
  const myRoomIdRef = useRef(null);
  const [roomCountdown, setRoomCountdown] = useState(0);
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [showStatsDrawer, setShowStatsDrawer] = useState(false);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [matchFoundAnim, setMatchFoundAnim] = useState(false);
  const [vsFlash, setVsFlash] = useState(null);
  const [jackpotWin, setJackpotWin] = useState(null);
  const processingFlipRef = useRef(false);
  const processedFlipsRef = useRef(new Set());
  const showCoinStageRef = useRef(false);
  const roomGoneDetectedRef = useRef(false);
  const fallbackTimeoutRef = useRef(null);
  const droneCleanupRef = useRef(null);

  // Keep refs in sync so timers/closures always see current values
  useEffect(() => { myRoomIdRef.current = myRoomId; }, [myRoomId]);
  useEffect(() => { showCoinStageRef.current = showCoinStage; }, [showCoinStage]);

  const startSpinAudio = useCallback(() => {
    if (droneCleanupRef.current) { droneCleanupRef.current(); droneCleanupRef.current = null; }
    droneCleanupRef.current = audio.playSpinDrone();
  }, []);

  const stopSpinAudio = useCallback(() => {
    if (droneCleanupRef.current) { droneCleanupRef.current(); droneCleanupRef.current = null; }
  }, []);

  const resetFlip = useCallback(() => {
    setCoinState("idle");
    setBorderState("idle");
    setShowResult(false);
    setResult(null);
  }, []);

  // Called by Coin3D when landing animation completes.
  //
  // Truth source for the win/loss toast is the RAW winner/loser addresses
  // captured at event-parse time — we re-derive `won` here instead of
  // trusting a cached boolean, and we refuse to toast at all if the
  // current user isn't in {winner, loser} (that flip wasn't theirs).
  const onFlipDone = useCallback(() => {
    const pending = pendingResultRef.current;
    if (!pending) return;
    pendingResultRef.current = null;
    processingFlipRef.current = false;

    const myAddr = (address || "").toLowerCase();
    const winnerAddr = (pending.winner || "").toLowerCase();
    const loserAddr  = (pending.loser  || "").toLowerCase();
    const iAmWinner = !!myAddr && winnerAddr === myAddr;
    const iAmLoser  = !!myAddr && loserAddr  === myAddr;

    // Guard: if neither address matches, this `pending` was mis-routed.
    // Do not render a toast at all.
    if (!iAmWinner && !iAmLoser) return;

    // A winner toast also requires a non-zero payout.
    const won = iAmWinner && parseFloat(pending.payout || "0") > 0;

    setShowResult(true);
    setResult(won ? "win" : "lose");
    setLastPayout(pending.payout);
    setFlipHistory(prev => [{ won }, ...prev].slice(0, 12));

    // Immediate: play sound + confetti as the coin finishes its landing
    // flourish, but defer the toast ~2.5s so it lands AFTER the result
    // text has been read. Keeps the reveal in sync with the animation.
    if (won) {
      audio.playWin(); triggerWinConfetti();
      vibrate([30, 50, 30, 50, 30]);
      setTimeout(
        () => addToast("success", `You won +${fmtNum(parseFloat(pending.payout))} ETH`),
        2500,
      );
    } else {
      audio.playLoss();
      vibrate(20);
      setTimeout(
        () => addToast("error", `You lost -${fmtNum(parseFloat(pending.amount))} ETH`),
        2500,
      );
    }
    refreshBalance();
    getPlayerInfo(contract, address).then(setPlayerStats).catch(() => {});
    // Chain needs a beat to commit the transfer, then pull the new ETH
    // balance so the sidebar reflects the win/loss immediately.
    setTimeout(() => refreshWalletBalanceRef.current?.(), 2000);
    setTimeout(() => refreshWalletBalanceRef.current?.(), 6000);
  }, [address, refreshBalance, contract]);

  // Data loading timeout — show error if nothing loads in 10s
  useEffect(() => {
    if (dataLoaded) return;
    const timeout = setTimeout(() => {
      if (!dataLoaded) setLoadError(true);
    }, 10000);
    return () => clearTimeout(timeout);
  }, [dataLoaded]);

  // Mark data as loaded when stats arrive
  useEffect(() => {
    if (protocol.stats && !dataLoaded) setDataLoaded(true);
  }, [protocol.stats, dataLoaded]);

  // Load data — works with readContract even without wallet
  const dataContract = contract || readContract;
  useEffect(() => {
    if (!dataContract) return;
    flipHook.refreshChallenges();
    protocol.refreshStats();
    getTreasuryMaxBet(dataContract).then(v => setTreasuryMax(v)).catch(() => {});
  }, [dataContract]);

  // Polling — works without wallet
  useEffect(() => {
    if (!dataContract) return;
    const iv = setInterval(() => {
      if (contract) refreshBalance();
      protocol.refreshStats();
      flipHook.refreshChallenges();
      getTreasuryMaxBet(dataContract).then(v => setTreasuryMax(v)).catch(() => {});
    }, 15000);
    return () => clearInterval(iv);
  }, [dataContract, contract, refreshBalance]);

  // Player stats
  useEffect(() => {
    if (!contract || !address) return;
    getPlayerInfo(contract, address).then(setPlayerStats).catch(() => {});
  }, [contract, address, sessionBalance]);

  // Referral URL support
  useEffect(() => {
    if (referral && referral > 0) {
      localStorage.setItem('flipper_ref', referral.toString());
    }
  }, [referral]);

  // V7: Stable refresh function for open rooms — works without wallet
  const refreshOpenRooms = useCallback(async () => {
    const c = contract || readContract;
    if (!c) return;
    try {
      const data = await c.getAllOpenChallenges();
      const rooms = [];
      for (let i = 0; i < data.ids.length; i++) {
        rooms.push({
          id: Number(data.ids[i]),
          creator: data.creators[i],
          amount: formatEther(data.amounts[i]),
          amountWei: data.amounts[i],
          createdAt: Number(data.createdAts[i]),
        });
      }
      setOpenRooms(rooms.reverse());
    } catch {}
  }, [contract, readContract]);

  // V7: Poll open rooms every 3s + event-driven updates
  useEffect(() => {
    const c = contract || readContract;
    if (!c) return;
    refreshOpenRooms();
    const iv = setInterval(refreshOpenRooms, 3000);
    const onRoomChange = () => refreshOpenRooms();
    c.on("ChallengeCreated", onRoomChange);
    c.on("ChallengeCancelled", onRoomChange);
    return () => {
      clearInterval(iv);
      c.off("ChallengeCreated", onRoomChange);
      c.off("ChallengeCancelled", onRoomChange);
    };
  }, [refreshOpenRooms, contract, readContract]);

  // V7: Wallet native balance — exposed via a ref so onFlipDone can
  // trigger an immediate refresh after a flip resolves.
  const refreshWalletBalanceRef = useRef(null);
  useEffect(() => {
    if (!contract?.runner?.provider || !address) {
      refreshWalletBalanceRef.current = null;
      return;
    }
    const fetch = async () => {
      try {
        const bal = await contract.runner.provider.getBalance(address);
        setWalletBalance(parseFloat(formatEther(bal)).toFixed(4));
      } catch {}
    };
    refreshWalletBalanceRef.current = fetch;
    fetch();
    const iv = setInterval(fetch, 10000);
    return () => clearInterval(iv);
  }, [contract, address]);

  const isAdmin = address?.toLowerCase() === OWNER.toLowerCase();
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [profileViewAddr, setProfileViewAddr] = useState(null);

  const openAdmin = useCallback(() => {
    if (adminUnlocked) { setView("admin"); return; }
    const guess = window.prompt("Admin password:");
    if (guess === ADMIN_PASSWORD) {
      setAdminUnlocked(true);
      setView("admin");
    } else if (guess != null) {
      addToast("error", "Wrong password");
    }
  }, [adminUnlocked]);

  // Close wallet menu on outside click
  useEffect(() => {
    if (!showWalletMenu) return;
    const close = (e) => { if (!e.target.closest('.wallet-dropdown')) setShowWalletMenu(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [showWalletMenu]);

  // V7: Listen for FlipResolved where we are a participant
  // Uses refs to avoid stale closures — listener is stable, not recreated on state changes

  useEffect(() => {
    if (!contract || !address) return;
    const myAddr = address.toLowerCase();

    const onFlipResolved = (...args) => {
      try {
        const challengeId = Number(args[0]);
        const winner = String(args[1]);
        const loser = String(args[2]);
        const payout = args[3];
        const betAmount = args[4];

        if (!winner || !loser) return;

        const isMyFlip = winner.toLowerCase() === myAddr || loser.toLowerCase() === myAddr;

        // Always refresh rooms when ANY flip resolves
        refreshOpenRooms();

        if (!isMyFlip) return;

        // Skip if we already processed this challengeId (e.g. via receipt in executeFlip)
        if (processedFlipsRef.current.has(challengeId)) return;

        // If we're already processing a flip (executeFlip active),
        // the receipt handler manages the result — skip to avoid duplicate sounds/alerts
        if (processingFlipRef.current) return;

        // Only react if user has an active room OR the poll already detected it gone.
        // Without this, stale/replayed events on page load trigger ghost animations.
        if (!myRoomIdRef.current && !roomGoneDetectedRef.current) return;

        // Mark as processed
        processedFlipsRef.current.add(challengeId);
        if (processedFlipsRef.current.size > 50) {
          processedFlipsRef.current = new Set([...processedFlipsRef.current].slice(-20));
        }

        const winnerLC = winner.toLowerCase();
        const loserLC = loser.toLowerCase();
        // Explicit XOR — refuse to show a win unless we're the winner AND not the loser.
        const won = winnerLC === myAddr && loserLC !== myAddr;
        const opponent = won ? loser : winner;

        // Clear room state + cancel fallback timeout
        roomGoneDetectedRef.current = false;
        if (fallbackTimeoutRef.current) {
          clearTimeout(fallbackTimeoutRef.current);
          fallbackTimeoutRef.current = null;
        }
        setMyRoomId(null);
        myRoomIdRef.current = null;
        setRoomCountdown(0);

        // Show MATCH FOUND → then flip animation
        setMatchFoundAnim(true);
        audio.playMatchFound();
        vibrate([50, 100, 50]);

        setTimeout(() => {
          setMatchFoundAnim(false);
          setCurrentOpponent(opponent);
          setCurrentBet(formatEther(betAmount));
          setShowCoinStage(true);
          setCoinState("spinning");
          setBorderState("spinning");
          spinStartRef.current = Date.now();
          startSpinAudio();
          audio.playFlip();

          setTimeout(() => {
            stopSpinAudio();
            pendingResultRef.current = {
              won,
              winner, loser,
              payout: formatEther(payout),
              amount: formatEther(betAmount),
            };
            setCoinState(won ? "win" : "lose");
            setTimeout(() => setBorderState(won ? "win" : "lose"), 500);
          }, 2500);
        }, 2000);

      } catch {}
    };

    contract.on("FlipResolved", onFlipResolved);
    return () => { contract.off("FlipResolved", onFlipResolved); };
  }, [contract, address]);

  // Host room monitor + belt-and-suspenders poll.
  // Privy embedded wallets are unreliable with contract.on(), so the host
  // can miss the FlipResolved event. This effect:
  //   1) Polls getAllOpenChallenges() every 2s; when our room disappears,
  //      fires the "MATCH FOUND" intro immediately.
  //   2) THEN actively scans recent blocks for FlipResolved matching our
  //      challengeId, and triggers the animation + pendingResultRef
  //      directly — without waiting on the event-listener effect.
  useEffect(() => {
    if (!myRoomId || !contract) return;
    roomGoneDetectedRef.current = false;

    const queryForMyFlip = async (challengeId) => {
      const provider = contract.runner?.provider;
      if (!provider) return null;
      try {
        const head = await provider.getBlockNumber();
        // Alchemy free tier caps eth_getLogs at 10 blocks — walk recent windows.
        for (let end = head, loops = 0; loops < 12; loops++, end -= 10) {
          const from = Math.max(0, end - 9);
          let evs;
          try {
            evs = await contract.queryFilter("FlipResolved", from, end);
          } catch { continue; }
          const mine = evs.find(e => Number(e.args[0]) === challengeId);
          if (mine) return mine;
          if (from === 0) break;
        }
      } catch {}
      return null;
    };

    const playHostAnimation = (ev) => {
      const myAddr = address.toLowerCase();
      const winner = String(ev.args[1]);
      const loser  = String(ev.args[2]);
      const payout = ev.args[3];
      const betAmount = ev.args[4];
      const winnerLC = winner.toLowerCase();
      const loserLC  = loser.toLowerCase();
      const iAmWinner = winnerLC === myAddr && loserLC !== myAddr;
      const iAmLoser  = loserLC  === myAddr && winnerLC !== myAddr;
      if (!iAmWinner && !iAmLoser) return; // not ours (safety)

      // Mark processed so the event listener doesn't double-fire.
      processedFlipsRef.current.add(Number(ev.args[0]));

      // Clear room state
      if (fallbackTimeoutRef.current) { clearTimeout(fallbackTimeoutRef.current); fallbackTimeoutRef.current = null; }
      roomGoneDetectedRef.current = false;
      setMyRoomId(null);
      myRoomIdRef.current = null;
      setRoomCountdown(0);

      const opponent = iAmWinner ? loser : winner;

      setTimeout(() => {
        setMatchFoundAnim(false);
        setCurrentOpponent(opponent);
        setCurrentBet(formatEther(betAmount));
        setShowCoinStage(true);
        setCoinState("spinning");
        setBorderState("spinning");
        spinStartRef.current = Date.now();
        startSpinAudio();
        audio.playFlip();

        setTimeout(() => {
          stopSpinAudio();
          pendingResultRef.current = {
            won: iAmWinner,
            winner, loser,
            payout: formatEther(payout),
            amount: formatEther(betAmount),
          };
          setCoinState(iAmWinner ? "win" : "lose");
          setTimeout(() => setBorderState(iAmWinner ? "win" : "lose"), 500);
        }, 2500);
      }, 2000);
    };

    const check = async () => {
      try {
        if (!myRoomIdRef.current) return;
        // 1) Still open?
        const data = await contract.getAllOpenChallenges();
        const stillOpen = data.ids.some(id => Number(id) === myRoomIdRef.current);
        if (stillOpen) return;

        // Room disappeared — someone accepted.
        if (!roomGoneDetectedRef.current) {
          roomGoneDetectedRef.current = true;
          setMatchFoundAnim(true);
          audio.playMatchFound();
          vibrate([50, 100, 50]);

          fallbackTimeoutRef.current = setTimeout(() => {
            if (myRoomIdRef.current) {
              setMyRoomId(null);
              myRoomIdRef.current = null;
              setRoomCountdown(0);
              roomGoneDetectedRef.current = false;
              setMatchFoundAnim(false);
              addToast("info", "Match completed. Check your balance.");
              refreshOpenRooms();
              refreshBalance();
            }
          }, 12000);
        }

        // 2) Actively query for the FlipResolved — don't rely on contract.on().
        const challengeId = myRoomIdRef.current;
        const ev = await queryForMyFlip(challengeId);
        if (!ev) return;
        if (processedFlipsRef.current.has(challengeId)) return; // listener already handled
        playHostAnimation(ev);
      } catch {}
    };

    const iv = setInterval(check, 2000);
    return () => {
      clearInterval(iv);
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
        fallbackTimeoutRef.current = null;
      }
    };
  }, [myRoomId, contract, address]);


  // ═══════════════════════════════════════
  //  UNIFIED FLIP EXECUTION
  // ═══════════════════════════════════════

  // Parse FlipResolved + JackpotWon from a receipt.
  // Only accepts a FlipResolved where the current user is a participant
  // (winner OR loser) — guards against stale receipts or unrelated logs
  // leaking the previous flip's result into the next one.
  const parseFlipResult = (receipt) => {
    let result = null;
    let jackpot = null;
    const myAddr = address?.toLowerCase();
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === "FlipResolved") {
          const winnerAddr = String(parsed.args.winner || "").toLowerCase();
          const loserAddr = String(parsed.args.loser || "").toLowerCase();
          const iAmWinner = !!myAddr && winnerAddr === myAddr;
          const iAmLoser  = !!myAddr && loserAddr  === myAddr;
          if (!iAmWinner && !iAmLoser) continue; // not my flip — ignore log
          const challengeId = Number(parsed.args[0]);
          processedFlipsRef.current.add(challengeId);
          if (processedFlipsRef.current.size > 50) {
            processedFlipsRef.current = new Set([...processedFlipsRef.current].slice(-20));
          }
          result = {
            won: iAmWinner,
            winner: String(parsed.args.winner || ""),
            loser: String(parsed.args.loser || ""),
            payout: formatEther(parsed.args.payout),
            amount: formatEther(parsed.args.betAmount),
          };
        }
        if (parsed?.name === "JackpotWon") {
          jackpot = {
            winner: String(parsed.args.winner || parsed.args[0]),
            amount: formatEther(parsed.args.amount || parsed.args[1]),
          };
        }
      } catch {}
    }
    if (jackpot && jackpot.winner?.toLowerCase() === myAddr) {
      setJackpotWin(jackpot);
      audio.playJackpot(); triggerJackpotConfetti();
      vibrate([100, 50, 100, 50, 100, 50, 200]);
    }
    return result || { won: false, winner: "", loser: "", payout: "0", amount: "0" };
  };

  // Core: send a flip TX, show coin animation, display result
  const executeFlip = async (txPromise, opponent, betAmount, isPvP) => {
    processingFlipRef.current = true;
    pendingResultRef.current = null; // clear any stale result from a previous flip
    setCurrentOpponent(opponent);
    setCurrentBet(betAmount);
    setShowCoinStage(true);

    if (!isEmbedded) setWaitingConfirm(true);
    try {
      const tx = await txPromise;

      // Wallet confirmed — VS flash for PvP
      setWaitingConfirm(false);
      if (opponent) {
        // Phase 1: "Joining..." text (0.5s)
        setVsFlash({ you: address, them: opponent, amount: betAmount, phase: "joining" });
        await new Promise(r => setTimeout(r, 500));

        // Phase 2: "VS" display (1.5s)
        setVsFlash({ you: address, them: opponent, amount: betAmount, phase: "vs" });
        await new Promise(r => setTimeout(r, 1500));

        setVsFlash(null);
      }

      // Start spinning
      startSpinAudio();
      setCoinState("spinning");
      setBorderState("spinning");
      spinStartRef.current = Date.now();
      audio.playFlip();

      const receipt = await tx.wait();
      const parsed = parseFlipResult(receipt);
      const { won, payout, amount, winner, loser } = parsed;

      const elapsed = Date.now() - spinStartRef.current;
      setTimeout(() => {
        stopSpinAudio();
        pendingResultRef.current = { won, payout, amount, winner, loser };
        setCoinState(won ? "win" : "lose");
        setTimeout(() => setBorderState(won ? "win" : "lose"), 500);
      }, Math.max(0, 1500 - elapsed));

      refreshOpenRooms();
      return { won, payout };
    } catch (err) {
      stopSpinAudio();
      setCoinState("idle");
      setBorderState("idle");
      setShowCoinStage(false);
      setWaitingConfirm(false);
      processingFlipRef.current = false;
      addToast("error", decodeError(err));
      return null;
    }
  };

  // ═══ Treasury flip (from tier selector) ═══
  const handleFlip = async () => {
    if (!contract || !connected || coinState !== "idle") return;
    if (parseFloat(walletBalance) <= 0) {
      addToast("error", "You need ETH on Base to play. Bridge at bridge.base.org");
      return;
    }
    audio.playClick();
    const ref = parseInt(localStorage.getItem('flipper_ref')) || referral;
    await executeFlip(
      contract.flipDirect(ref, { value: TIERS[tier].wei, gasLimit: 1000000n }),
      null, TIERS[tier].label, false
    );
  };

  // ═══ Auto-match (timer expired → cancel room + flip treasury) ═══
  const autoMatchRef = useRef(null);
  autoMatchRef.current = async (betAmt) => {
    const roomId = myRoomIdRef.current;
    if (!roomId || !betAmt || !contract) return;

    setMyRoomId(null);
    myRoomIdRef.current = null;
    setRoomCountdown(0);

    addToast("info", "No opponent found. Flipping vs treasury...");
    const ref = parseInt(localStorage.getItem('flipper_ref')) || 0;
    await executeFlip(
      contract.cancelAndFlipTreasury(roomId, ref, { gasLimit: 1000000n }),
      null, betAmt, false
    );
  };

  // ═══ Countdown timer ═══
  const countdownBetRef = useRef(null);
  useEffect(() => {
    if (roomCountdown <= 0 || !myRoomId) return;

    const timer = setTimeout(() => {
      if (roomCountdown <= 1) {
        setRoomCountdown(0);
        // Auto-match vs treasury
        if (autoMatchRef.current) {
          autoMatchRef.current(countdownBetRef.current);
        }
      } else {
        setRoomCountdown(prev => prev - 1);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [roomCountdown, myRoomId]);


  // ═══ Create PvP room ═══
  const handleCreateRoom = async (amount) => {
    if (!contract || !connected) return;
    if (parseFloat(walletBalance) <= 0) {
      addToast("error", "You need ETH on Base to play. Bridge at bridge.base.org");
      return;
    }
    audio.playClick();
    const betAmt = (amount || customBet).replace(",", ".");
    if (isNaN(parseFloat(betAmt)) || parseFloat(betAmt) <= 0) {
      addToast("error", "Invalid bet amount");
      return;
    }
    const ref = parseInt(localStorage.getItem('flipper_ref')) || referral;
    try {
      const tx = await contract.createChallengeDirect(ref, { value: parseEther(betAmt), gasLimit: 1000000n });
      const receipt = await tx.wait();
      let challengeId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed?.name === "ChallengeCreated") { challengeId = Number(parsed.args[0]); break; }
        } catch {}
      }
      addToast("success", "Room #" + (challengeId || "?") + " created!");
      setMyRoomId(challengeId);
      myRoomIdRef.current = challengeId;
      countdownBetRef.current = betAmt;
      setRoomCountdown(60);
      await refreshOpenRooms();
    } catch (err) { addToast("error", decodeError(err)); }
  };

  // ═══ Cancel room ═══
  const handleCancelRoom = async (id) => {
    audio.playClick();
    setMyRoomId(null);
    myRoomIdRef.current = null;
    setRoomCountdown(0);
    try {
      const tx = await contract.cancelChallengeDirect(id);
      await tx.wait();
      addToast("success", "Room cancelled, ETH refunded");
      await refreshOpenRooms();
    } catch (err) { addToast("error", decodeError(err)); }
  };

  // ═══ Join PvP room ═══
  const handleAccept = async (challengeId, creatorAddr) => {
    if (coinState !== "idle" || !connected) return;
    if (parseFloat(walletBalance) <= 0) {
      addToast("error", "You need ETH on Base to play. Bridge at bridge.base.org");
      return;
    }
    audio.playClick();
    const c = (openRooms || []).find(ch => ch.id === challengeId) || flipHook.challenges.find(ch => ch.id === challengeId);
    const amt = c ? c.amount : "?";
    const amtWei = c?.amountWei || 0;
    const ref = parseInt(localStorage.getItem('flipper_ref')) || referral;
    await executeFlip(
      contract.acceptChallengeDirect(challengeId, ref, { value: amtWei, gasLimit: 1000000n }),
      creatorAddr, amt, true
    );
  };

  const stats = protocol.stats;
  const tierEth = TIERS[tier]?.label || "0.005";

  return (
    <>
      <style>{CSS}</style>

      {loadError && !dataLoaded && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 2400,
          padding: "8px 16px",
          background: "linear-gradient(180deg, rgba(239,68,68,0.14), rgba(239,68,68,0.06))",
          borderBottom: "1px solid rgba(239,68,68,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          fontFamily: "'Chakra Petch', sans-serif", flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11, color: "#fca5a5", fontWeight: 600 }}>
            {"\u26A0"} Base Sepolia RPC slow to respond. UI is live, on-chain data may be stale.
          </span>
          <button onClick={() => { setLoadError(false); protocol.refreshStats?.(); }} style={{
            padding: "4px 12px", borderRadius: 6, fontSize: 10, fontWeight: 700,
            background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)",
            color: "#fca5a5", cursor: "pointer", fontFamily: "inherit",
          }}>Retry</button>
        </div>
      )}

      {wrongNetwork && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 2500,
          padding: "12px 20px", background: "#ef4444",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        }}>
          <span style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>
            Wrong network. Please switch to Base.
          </span>
          <button onClick={async () => {
            try {
              await window.ethereum?.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: CHAIN_ID_HEX }],
              });
            } catch {}
          }} style={{
            padding: "6px 16px", borderRadius: 6,
            background: "#fff", color: "#ef4444",
            fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
          }}>Switch Network</button>
        </div>
      )}

      <div className="app-root">

        {/* ═══ LEFT — CHAT ═══ */}
        {showChatDrawer && (
          <div onClick={() => setShowChatDrawer(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            zIndex: 199, display: "none",
          }} className="drawer-backdrop" />
        )}
        <LiveFeedSidebar recentFlips={recentFlips} address={address} drawerOpen={showChatDrawer} />

        {/* ═══ CENTER — GAME ═══ */}
        <div className="game-center">
          {/* V8 F4: persistent flip ticker shown across all tabs */}
          <FlipTicker recentFlips={recentFlips} />
          <div className="game-topbar">
            <div className="logo">
              <span className="logo-text"><span className="logo-gold">FLIPPER</span><span className="logo-dim">ROOMS</span></span>
              <span className="logo-badge">BASE</span>
              <span className="logo-badge" style={{
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "#07090d", marginLeft: 4,
              }}>V8</span>
            </div>
            <div className="nav">
              {["flip", "board", "fair"].map(v => (
                <button key={v} className={`nav-btn ${view === v ? "active" : ""}`} onClick={() => {
                  setView(v); audio.playClick();
                  if (v === "board" && seatHook.seats.length === 0) seatHook.refreshSeats();
                }}>
                  {v === "flip" ? "Coinflip" : v === "board" ? "Board" : "Fair"}
                </button>
              ))}
              {isAdmin && (
                <button className={`nav-btn ${view === "admin" ? "active" : ""}`} onClick={() => { openAdmin(); audio.playClick(); }}
                  style={view === "admin" ? { color: "#ef4444", background: "#ef444410" } : {}}>
                  Admin
                </button>
              )}
            </div>

            {/* Live counters */}
            <div style={{ display: "flex", gap: 14, alignItems: "center" }} className="header-stats">
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f7b32b", fontFamily: "'JetBrains Mono', monospace" }}>
                  {stats?.totalFlips || 0}
                </div>
                <div style={{ fontSize: 7, color: "#475569", letterSpacing: 1, fontWeight: 700 }}>FLIPS</div>
              </div>
              <div style={{ width: 1, height: 18, background: "#1c2430" }}/>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace" }}>
                  {stats ? parseFloat(stats.totalVolume).toFixed(2) : "0.00"}
                </div>
                <div style={{ fontSize: 7, color: "#475569", letterSpacing: 1, fontWeight: 700 }}>VOL</div>
              </div>
              <div style={{ width: 1, height: 18, background: "#1c2430" }}/>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e", fontFamily: "'JetBrains Mono', monospace" }}>
                  {openRooms ? openRooms.length : "..."}
                </div>
                <div style={{ fontSize: 7, color: "#475569", letterSpacing: 1, fontWeight: 700 }}>ROOMS</div>
              </div>
            </div>

            <div className="header-right">
              {/* Network badge — static, no fake user count */}
              <div className="header-stats" style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", background: "rgba(247,179,43,0.08)",
                border: "1px solid rgba(247,179,43,0.25)", borderRadius: 6,
              }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#f7b32b", animation: "liveDot 1.5s ease infinite" }} />
                <span style={{ fontSize: 10, color: "#f7b32b", fontWeight: 700, letterSpacing: 0.5 }}>
                  SEPOLIA TESTNET
                </span>
              </div>
              <button onClick={() => setShowChatDrawer(p => !p)} className="chat-drawer-toggle" title="Live activity"
                style={{
                  display: "none", alignItems: "center", justifyContent: "center",
                  width: 36, height: 36, background: "rgba(255,255,255,0.05)",
                  borderRadius: 6, border: "none", cursor: "pointer",
                }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
              <button onClick={() => setShowStatsDrawer(p => !p)} className="stats-drawer-toggle" style={{
                display: "none", alignItems: "center", justifyContent: "center",
                width: 36, height: 36, background: "rgba(255,255,255,0.05)",
                borderRadius: 6, border: "none", cursor: "pointer",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2">
                  <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
              {connected ? (
                <div style={{ position: "relative" }} className="wallet-dropdown">
                  {isEmbedded && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: "#f7b32b20", color: "var(--gold)", letterSpacing: 0.5, marginRight: 8 }}>{"\u26A1"} INSTANT</span>
                  )}
                  <button onClick={() => setShowWalletMenu(p => !p)} style={{
                    padding: "6px 14px", borderRadius: 8, background: "#131820",
                    border: "1px solid #1c2430", color: "#e2e8f0", fontSize: 11,
                    fontWeight: 600, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", background: addrColor(address),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 6, fontWeight: 800, color: "#fff",
                    }}>{address?.slice(2,4).toUpperCase()}</div>
                    {shortAddr(address)}
                  </button>
                  {showWalletMenu && (
                    <div style={{
                      position: "absolute", top: "100%", right: 0, marginTop: 6,
                      background: "#131820", border: "1px solid #1c2430", borderRadius: 10,
                      padding: 12, minWidth: 220, zIndex: 100,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                    }}>
                      <div onClick={() => { navigator.clipboard.writeText(address); addToast("success", "Address copied"); }}
                        style={{ fontSize: 10, color: "#94a3b8", padding: "6px 0", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-all" }}>
                        {address}
                      </div>
                      <button onClick={() => { setProfileViewAddr(address); setView("profile"); setShowWalletMenu(false); }}
                        style={{ width: "100%", padding: "8px 0", background: "none", border: "none", borderTop: "1px solid #1c2430", color: "#f7b32b", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                        My Profile
                      </button>
                      <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer"
                        style={{ display: "block", fontSize: 10, color: "#f7b32b", padding: "8px 0", borderTop: "1px solid #1c2430", textDecoration: "none" }}>
                        View on BaseScan
                      </a>
                      <button onClick={() => { disconnect(); setShowWalletMenu(false); }}
                        style={{ width: "100%", padding: "8px 0", background: "none", border: "none", borderTop: "1px solid #1c2430", color: "#ef4444", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                        Disconnect
                      </button>
                      <button onClick={() => {
                        const el = document.documentElement;
                        el.dataset.muted = el.dataset.muted === "1" ? "0" : "1";
                        addToast("info", el.dataset.muted === "1" ? "Sound off" : "Sound on");
                      }} style={{ width: "100%", padding: "8px 0", background: "none", border: "none", borderTop: "1px solid #1c2430", color: "var(--text-dim)", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 6 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>
                        Sound toggle
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="connect-btn" onClick={connect}>{"\u26A1"} Instant Play</button>
                  <button onClick={connect} style={{
                    padding: "8px 18px", borderRadius: 8, background: "transparent",
                    border: "1px solid var(--border)", color: "var(--text-dim)",
                    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}>Wallet</button>
                </div>
              )}
            </div>
          </div>

          {/* ═══ V8 GRADUATION PROGRESS BAR ═══ */}
          {seatHook.graduation && (() => {
            const g = seatHook.graduation;
            const minted = g.totalMinted || 0;
            const active = g.activeCount || 0;
            const pct = Math.min(100, (minted / TOTAL_SEATS) * 100);
            const graduated = g.graduated;
            return (
              <div style={{
                padding: "8px 24px", display: "flex", alignItems: "center", gap: 14,
                background: graduated
                  ? "linear-gradient(90deg, rgba(34,197,94,0.04), transparent)"
                  : "linear-gradient(90deg, rgba(247,179,43,0.04), transparent)",
                borderBottom: "1px solid var(--border)", flexShrink: 0,
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
                  color: graduated ? "#22c55e" : "var(--gold)",
                }}>
                  {graduated ? "GRADUATED" : "GRADUATION"}
                </span>
                <div style={{
                  flex: 1, height: 5, background: "rgba(255,255,255,0.04)",
                  borderRadius: 3, overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", width: pct + "%",
                    background: graduated
                      ? "linear-gradient(90deg, #16a34a, #22c55e)"
                      : "linear-gradient(90deg, #b8860b, #f7b32b, #ffd700)",
                    transition: "width 0.5s ease",
                    boxShadow: graduated ? "0 0 8px #22c55e60" : "0 0 8px rgba(247,179,43,0.4)",
                  }} />
                </div>
                <span style={{
                  fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                  color: "var(--text-dim)", fontWeight: 700, minWidth: 80, textAlign: "right",
                }}>
                  {minted}/{TOTAL_SEATS}
                </span>
                <span style={{
                  fontSize: 9, color: "var(--text-muted)", fontWeight: 600,
                  whiteSpace: "nowrap",
                }}>
                  {active} active
                </span>
              </div>
            );
          })()}

          {/* ═══ SCROLLING RESULTS TICKER ═══ */}
          {recentFlips && recentFlips.length > 0 && (
            <div style={{
              height: 40, display: "flex", alignItems: "center",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-main)",
              overflow: "hidden", flexShrink: 0, position: "relative",
            }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 40, background: "linear-gradient(90deg, var(--bg-main), transparent)", zIndex: 2 }} />
              <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 40, background: "linear-gradient(-90deg, var(--bg-main), transparent)", zIndex: 2 }} />
              <div style={{
                display: "flex", gap: 8,
                animation: recentFlips.length > 5 ? "scrollTicker 30s linear infinite" : "none",
                paddingLeft: 50,
              }}>
                {[...recentFlips, ...recentFlips].slice(0, 40).map((h, i) => {
                  const isWin = address && h.winner?.toLowerCase() === address.toLowerCase();
                  const isLoss = address && h.loser?.toLowerCase() === address.toLowerCase();
                  const color = isWin ? "#22c55e" : isLoss ? "#ef4444" : "#888";
                  const label = isWin ? "W" : isLoss ? "L" : "\u2022";
                  const mult = isWin ? "2x" : isLoss ? "0x" : "";
                  return (
                    <div key={i} style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "4px 12px", borderRadius: 6,
                      background: color + "08",
                      border: "1px solid " + color + "25",
                      color,
                      whiteSpace: "nowrap", flexShrink: 0,
                      fontFamily: "'JetBrains Mono', monospace",
                      boxShadow: "0 0 8px " + color + "15",
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>
                        {h.amount} ETH
                      </span>
                      {mult && (
                        <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>
                          {mult}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="game-scroll">
           <div key={view} style={{ animation: "fadeIn 0.2s ease" }}>

            {/* ═══ COINFLIP VIEW ═══ */}
            {view === "flip" && (
              <>
                <div className="hero-section">
                  <div className="hero-inner">
                    {/* Live badge */}
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      padding: "4px 12px", background: "rgba(247,179,43,0.08)",
                      border: "1px solid var(--border-gold)", borderRadius: 20,
                      marginBottom: 12,
                    }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: "var(--gold)", animation: "liveDot 1.5s ease infinite",
                      }}/>
                      <span style={{
                        fontSize: 10, color: "var(--gold)", fontWeight: 700,
                        letterSpacing: 1.5, textTransform: "uppercase",
                      }}>
                        Live {"\u00B7"} {openRooms?.length || 0} room{(openRooms?.length || 0) !== 1 ? "s" : ""} waiting
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                      <div className="hero-title-text">COINFLIP</div>
                      <button onClick={() => setShowHowItWorks(true)} style={{
                        padding: "5px 10px", borderRadius: 6, background: "transparent",
                        border: "1px solid var(--border-light)", color: "var(--text-muted)", fontSize: 11,
                        fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 12,
                      }}>?</button>
                    </div>
                    <div className="hero-sub">Bet against another player. Winner takes <span style={{ color: "var(--green)", fontWeight: 700 }}>96%</span>.</div>

                    {!connected && (
                      <button className="connect-btn" onClick={connect} style={{ padding: "14px 40px", fontSize: 16, borderRadius: 12, margin: "0 auto" }}>
                        Connect Wallet to Play
                      </button>
                    )}

                    {/* ═══ COIN STAGE — only visible during active flip ═══ */}
                    {showCoinStage && (() => {
                      const wrapperClass = borderState === "spinning" ? "spinning" : borderState === "win" ? "result-win" : borderState === "lose" ? "result-lose" : "";
                      const p1Class = showResult ? (result === "win" ? "winner" : "loser") : "";
                      const p2Class = showResult ? (result === "win" ? "loser" : "winner") : "";
                      const a1Class = coinState === "spinning" ? "avatar-bounce" : showResult ? (result === "win" ? "avatar-win" : "avatar-lose") : "";
                      const a2Class = coinState === "spinning" ? "avatar-bounce" : showResult ? (result === "win" ? "avatar-lose" : "avatar-win") : "";
                      const n1Class = showResult ? (result === "win" ? "name-win" : "name-lose") : "";
                      const n2Class = showResult ? (result === "win" ? "name-lose" : "name-win") : "";
                      const b1Class = showResult ? (result === "win" ? "bet-win" : "bet-lose") : "";
                      const b2Class = showResult ? (result === "win" ? "bet-lose" : "bet-win") : "";
                      const prizeClass = showResult ? (result === "win" ? "prize-win" : "prize-lose") : "";
                      const displayBet = currentBet || tierEth;
                      const prizeText = showResult
                        ? (result === "win" ? `+${lastPayout} ETH` : `-${displayBet} ETH`)
                        : `${(parseFloat(displayBet) * 2).toFixed(4)} ETH`;
                      const jackpotAmount = stats ? Number(stats.jackpotPool).toFixed(4) : "0.0000";
                      const jackpotTarget = 0.05;
                      const jackpotPercent = Math.min(100, (parseFloat(jackpotAmount) / jackpotTarget) * 100);

                      return (
                        <div className={`coin-wrapper ${wrapperClass}`} style={{ animation: "scaleIn 0.3s ease" }}>
                          <div className="border-spin" />
                          <div className="border-flash" />
                          <div className="coin-stage-inner">
                            <div className="grid-overlay" />
                            <div className="glow-bg" />
                            <div className="connector-line" />

                            <div className="arena">
                              {/* Player You */}
                              <div className={`arena-player ${p1Class}`}>
                                <div className={`arena-avatar avatar-you ${a1Class}`}>
                                  {address?.slice(2,4).toUpperCase() || "??"}
                                </div>
                                <div className={`arena-name ${n1Class}`}>You</div>
                                <div className={`arena-bet ${b1Class}`}>{displayBet} ETH</div>
                              </div>

                              {/* VS + Coin */}
                              <div className="vs-area">
                                <div className="vs-text">VS</div>
                                <div className="coin-3d-container">
                                  <Suspense fallback={<div style={{ width: "100%", height: "100%" }} />}>
                                    <Coin3D state={coinState} onComplete={onFlipDone} />
                                  </Suspense>
                                </div>
                                <div className="prize-pool">
                                  <div className="prize-label">PRIZE POOL</div>
                                  <div className={`prize-value ${prizeClass}`}>{prizeText}</div>
                                </div>
                                {coinState === "spinning" && (
                                  <div style={{
                                    fontSize: 10, color: "#475569", marginTop: 8,
                                    animation: "pulse 1.5s ease infinite",
                                  }}>
                                    Processing on Base chain...
                                  </div>
                                )}
                              </div>

                              {/* Opponent — dynamic */}
                              <div className={`arena-player ${p2Class}`}>
                                <div className={`arena-avatar ${a2Class}`} style={{
                                  background: currentOpponent
                                    ? `linear-gradient(135deg, ${addrColor(currentOpponent)}, ${addrColor(currentOpponent)}88)`
                                    : "linear-gradient(135deg, #b8860b, #f7b32b)",
                                  borderColor: currentOpponent ? addrColor(currentOpponent) + "40" : "#f7b32b40",
                                }}>
                                  {currentOpponent ? currentOpponent.slice(2,4).toUpperCase() : "TR"}
                                </div>
                                <div className={`arena-name ${n2Class}`}>
                                  {currentOpponent ? shortAddr(currentOpponent) : "Treasury"}
                                </div>
                                <div className={`arena-bet ${b2Class}`}>{displayBet} ETH</div>
                              </div>
                            </div>

                            {/* Result zone */}
                            <div className="result-zone">
                              {waitingConfirm && (
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ width: 20, height: 20, border: "2px solid #f7b32b30", borderTopColor: "#f7b32b", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gold)" }}>Confirm in wallet...</span>
                                </div>
                              )}
                              {showResult && (
                                <div style={{
                                  display: "flex", flexDirection: "column", alignItems: "center",
                                  gap: 10, animation: "scaleIn 0.3s ease",
                                }}>
                                  <div style={{
                                    fontSize: 28, fontWeight: 900, letterSpacing: 4,
                                    fontFamily: "'Orbitron', sans-serif",
                                    color: result === "win" ? "#22c55e" : "#ef4444",
                                    textShadow: result === "win" ? "0 0 20px #22c55e40" : "0 0 20px #ef444440",
                                  }}>
                                    {result === "win" ? "YOU WIN" : "YOU LOSE"}
                                  </div>
                                  <div style={{
                                    fontSize: 18, fontWeight: 700,
                                    fontFamily: "'JetBrains Mono', monospace",
                                    color: result === "win" ? "#22c55e" : "#ef4444",
                                  }}>
                                    {result === "win" ? "+" : "-"}{displayBet} ETH
                                  </div>
                                  <button onClick={() => {
                                    setShowCoinStage(false);
                                    setCoinState("idle");
                                    setBorderState("idle");
                                    setShowResult(false);
                                    setResult(null);
                                    setCurrentOpponent(null);
                                    setCurrentBet("");
                                    setMatchFoundAnim(false);
                                    setVsFlash(null);
                                  }} style={{
                                    padding: "12px 40px", borderRadius: 10, marginTop: 8,
                                    background: "linear-gradient(135deg, #b8860b, #f7b32b)",
                                    color: "#0b0e11", fontSize: 14, fontWeight: 800,
                                    border: "none", cursor: "pointer",
                                    fontFamily: "'Chakra Petch', sans-serif",
                                  }}>
                                    Play Again
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Streak bar */}
                            {flipHistory.length > 0 && (
                              <div className="streak-bar">
                                {flipHistory.slice(0, 12).map((h, i) => (
                                  <div key={i} className={`streak-dot ${h.won ? "streak-win" : "streak-lose"} ${i === 0 ? "streak-new" : ""}`}>
                                    {h.won ? "W" : "L"}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Jackpot bar */}
                            <div className="jackpot-bar">
                              <div className="jackpot-header">
                                <span className="jackpot-label">JACKPOT PROGRESS</span>
                                <span className="jackpot-value">{jackpotAmount} / 0.05 ETH</span>
                              </div>
                              <div className="jackpot-track">
                                <div className="jackpot-fill" style={{ width: `${jackpotPercent}%` }} />
                              </div>
                              <div className={`jackpot-note ${jackpotPercent > 70 ? "jackpot-hot" : ""}`}>
                                {jackpotPercent > 70 ? "Almost there... one lucky flip away!" : "Every flip adds to the jackpot pool"}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ═══ SEARCHING STATE — waiting for opponent ═══ */}
                    {myRoomId && !showCoinStage && !matchFoundAnim && (
                      <div style={{
                        textAlign: "center", padding: "40px 20px",
                        animation: "fadeIn 0.3s ease",
                      }}>
                        <div style={{
                          width: 80, height: 80, borderRadius: "50%",
                          border: "3px solid #1c2430", borderTopColor: "#f7b32b",
                          animation: "spin 1s linear infinite",
                          margin: "0 auto 20px",
                        }}/>
                        <div style={{
                          fontSize: 18, fontWeight: 700, color: "#f7b32b",
                          fontFamily: "'Orbitron', sans-serif",
                          letterSpacing: 3,
                        }}>
                          SEARCHING
                        </div>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                          Waiting for opponent &middot; {roomCountdown}s
                        </div>
                        <div style={{
                          fontSize: 22, fontWeight: 700, color: "#f7b32b",
                          fontFamily: "'JetBrains Mono', monospace",
                          marginTop: 12,
                        }}>
                          {countdownBetRef.current} ETH
                        </div>
                        <div style={{
                          width: 200, height: 4, background: "#1c2430",
                          borderRadius: 2, margin: "16px auto 0", overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%", background: "#f7b32b",
                            borderRadius: 2, transition: "width 1s linear",
                            width: ((60 - roomCountdown) / 60 * 100) + "%",
                          }}/>
                        </div>
                        <div style={{ fontSize: 9, color: "#475569", marginTop: 8 }}>
                          Auto-flip vs treasury when timer ends
                        </div>
                        <button onClick={() => handleCancelRoom(myRoomId)} style={{
                          marginTop: 16, padding: "8px 20px", borderRadius: 6,
                          background: "transparent", border: "1px solid #ef444430",
                          color: "#ef444480", fontSize: 10, fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit",
                        }}>Cancel Room</button>
                      </div>
                    )}

                  </div>
                </div>

                {!showCoinStage && !myRoomId && (<>
                <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #f7b32b25, transparent)", margin: "0 24px" }} />

                {/* ═══ CREATE ROOM ═══ */}
                <div className="games-section" style={{ paddingTop: 20, animation: "slideUp 0.3s ease" }}>
                  <div style={{
                    padding: "24px",
                    background: "linear-gradient(135deg, rgba(247,179,43,0.04), rgba(247,179,43,0.01))",
                    borderRadius: 16, border: "1px solid var(--border-gold)", marginBottom: 16,
                    position: "relative", overflow: "hidden",
                    animation: "cardTopGlow 3s ease infinite",
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(247,179,43,0.6), transparent)" }} />
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", letterSpacing: 1.5, marginBottom: 14 }}>
                      CREATE PVP ROOM
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 14 }}>
                      {[0.001, 0.005, 0.01, 0.05, 0.1].map(amt => (
                        <button key={amt} onClick={() => setCustomBet(amt.toString())}
                          style={{
                            padding: "12px 4px", borderRadius: 8, cursor: "pointer", textAlign: "center",
                            background: customBet === amt.toString() ? "linear-gradient(135deg, rgba(247,179,43,0.15), rgba(247,179,43,0.05))" : "rgba(255,255,255,0.02)",
                            border: "1px solid " + (customBet === amt.toString() ? "var(--gold)" : "var(--border-light)"),
                            color: customBet === amt.toString() ? "var(--gold)" : "var(--text-dim)",
                            fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                            boxShadow: customBet === amt.toString() ? "0 0 12px rgba(247,179,43,0.2)" : "none",
                            transition: "all 0.2s",
                          }}
                        >
                          <div>{amt}</div>
                          <div style={{ fontSize: 9, color: customBet === amt.toString() ? "var(--gold-dark)" : "var(--text-faint)", marginTop: 2, fontWeight: 600 }}>ETH</div>
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{
                        flex: 1, padding: "12px 16px", borderRadius: 10,
                        background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-light)",
                        display: "flex", alignItems: "center", gap: 8,
                        transition: "border-color 0.2s",
                      }}>
                        <input
                          type="number" step="0.001" min="0.0005" max="1"
                          value={customBet} onChange={e => setCustomBet(e.target.value)}
                          placeholder="Amount"
                          style={{
                            flex: 1, background: "transparent", border: "none",
                            color: "var(--gold)", fontSize: 18, fontWeight: 700,
                            fontFamily: "'JetBrains Mono', monospace", outline: "none",
                          }}
                        />
                        <span style={{ fontSize: 11, color: "var(--text-faint)", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {"\u2248"} ${(parseFloat(customBet || "0") * 2500).toFixed(0)}
                        </span>
                      </div>
                      <button onClick={() => connected ? handleCreateRoom() : connect()} style={{
                        padding: "12px 32px", borderRadius: 10,
                        background: "linear-gradient(135deg, var(--gold), var(--gold-dark))",
                        color: "#07090d", fontSize: 13, fontWeight: 800,
                        border: "none", cursor: "pointer", letterSpacing: 1,
                        fontFamily: "'Chakra Petch', sans-serif", whiteSpace: "nowrap",
                        boxShadow: "0 4px 16px rgba(247,179,43,0.3)",
                        transition: "all 0.2s",
                      }}>
                        {connected ? "Create Room" : "Connect to Create"}
                      </button>
                    </div>
                  </div>

                  {/* ═══ OPEN ROOMS ═══ */}
                  <div style={{ marginBottom: 16, animation: "slideUp 0.3s ease 0.1s both" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 1.5 }}>
                          OPEN ROOMS
                        </div>
                        {openRooms && openRooms.length > 0 && (
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e", animation: "blink 1.5s ease infinite" }} />
                        )}
                      </div>
                      <span style={{ fontSize: 10, color: "#475569" }}>{openRooms ? openRooms.length : "..."} active</span>
                    </div>
                    {openRooms === null && (
                      <div style={{ padding: 20, textAlign: "center" }}>
                        <div style={{
                          width: 24, height: 24, border: "2px solid #1c2430",
                          borderTopColor: "#f7b32b", borderRadius: "50%",
                          animation: "spin 0.8s linear infinite",
                          margin: "0 auto 8px",
                        }}/>
                        <div style={{ fontSize: 10, color: "#475569" }}>Loading rooms...</div>
                      </div>
                    )}
                    {openRooms && openRooms.length === 0 && (
                      <div style={{
                        padding: 32, textAlign: "center",
                        background: "#131820", borderRadius: 12,
                        border: "1px dashed #1c2430",
                      }}>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>🪙</div>
                        <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>
                          No rooms yet
                        </div>
                        <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
                          Create a room and be the first to flip!
                        </div>
                      </div>
                    )}
                    {openRooms && openRooms.map(room => {
                      const isMine = room.creator?.toLowerCase() === address?.toLowerCase();
                      const timeAgo = Math.floor((Date.now()/1000 - room.createdAt) / 60);
                      return (
                        <div key={room.id} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "12px 14px", marginBottom: 4, borderRadius: 10,
                          background: "#131820",
                          border: "1px solid " + (isMine ? "#f7b32b20" : "#22c55e20"),
                          animation: isMine ? "none" : "roomPulse 2s ease infinite",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: "50%",
                              background: `linear-gradient(135deg, ${addrColor(room.creator)}, ${addrColor(room.creator)}88)`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 9, fontWeight: 800, color: "#fff",
                            }}>{room.creator.slice(2,4).toUpperCase()}</div>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>
                                {isMine ? "You" : shortAddr(room.creator)}
                              </div>
                              <div style={{ fontSize: 9, color: "#475569" }}>{timeAgo}m ago</div>
                            </div>
                          </div>
                          <div style={{
                            fontSize: 14, fontWeight: 700, color: "#f7b32b",
                            fontFamily: "'JetBrains Mono', monospace",
                          }}>{parseFloat(room.amount).toFixed(4)} ETH</div>
                          {isMine ? (
                            <button onClick={() => handleCancelRoom(room.id)} className="cancel-btn">Cancel</button>
                          ) : (
                            <button onClick={() => connected ? handleAccept(room.id, room.creator) : connect()} className="join-btn">{connected ? "Join" : "Connect"}</button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Global Recent Flips */}
                  <div className="section-label" style={{ marginTop: 24 }}>RECENT FLIPS</div>
                  {recentFlips.length === 0 && <div className="empty-state">No flips yet — be the first!</div>}
                  {recentFlips.slice(0, 10).map((flip, i) => {
                    const isMyWin = flip.winner?.toLowerCase() === address?.toLowerCase();
                    const isMyLoss = flip.loser?.toLowerCase() === address?.toLowerCase();
                    const isTrW = flip.winner?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase();
                    const isTrL = flip.loser?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase();
                    return (
                      <div key={flip.id + "-" + i} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "12px 16px", marginBottom: 4,
                        background: isMyWin ? "linear-gradient(90deg, rgba(34,197,94,0.05), transparent)" :
                          isMyLoss ? "linear-gradient(90deg, rgba(239,68,68,0.05), transparent)" :
                          "rgba(255,255,255,0.015)",
                        borderLeft: "3px solid " + (isMyWin ? "#22c55e" : isMyLoss ? "#ef4444" : "transparent"),
                        borderRadius: "0 8px 8px 0",
                        animation: flip.isNew ? "tickerChipEnter 0.4s ease" : "none",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: isTrW ? "linear-gradient(135deg, #b8860b, #f7b32b)" : addrColor(flip.winner),
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 9, fontWeight: 800, color: "#fff",
                          }}>{isTrW ? "T" : flip.winner?.slice(2,4).toUpperCase()}</div>
                          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                            {isMyWin ? "You" : isTrW ? "Treasury" : shortAddr(flip.winner)}
                            <span style={{ color: "var(--text-faint)", margin: "0 6px" }}>vs</span>
                            {isMyLoss ? "You" : isTrL ? "Treasury" : shortAddr(flip.loser)}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 13, color: "var(--text)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                            {parseFloat(flip.amount).toFixed(4)} ETH
                          </span>
                          <span style={{
                            padding: "4px 12px", borderRadius: 4, fontSize: 10, fontWeight: 800,
                            letterSpacing: 0.5,
                            background: isMyWin ? "#22c55e" : isMyLoss ? "#ef4444" : "rgba(255,255,255,0.04)",
                            color: isMyWin || isMyLoss ? "#fff" : "var(--text-muted)",
                            boxShadow: isMyWin ? "0 0 12px rgba(34,197,94,0.3)" : isMyLoss ? "0 0 12px rgba(239,68,68,0.3)" : "none",
                          }}>
                            {isMyWin ? "WON" : isMyLoss ? "LOST" : "FLIP"}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* ═══ FLIP VS TREASURY — secondary ═══ */}
                  <div style={{
                    padding: "12px 16px", background: "#0d1118", borderRadius: 10,
                    border: "1px solid #151b25", marginTop: 16,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>No opponents online?</div>
                        <div style={{ fontSize: 10, color: "#475569" }}>Flip against the house treasury</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <select value={tier} onChange={e => setTier(Number(e.target.value))} style={{
                          padding: "6px 10px", borderRadius: 6, background: "#131820",
                          border: "1px solid #1c2430", color: "#f7b32b", fontSize: 11,
                          fontFamily: "'JetBrains Mono', monospace", outline: "none",
                        }}>
                          {TIERS.map((t, i) => {
                            const tooHigh = treasuryMax && parseFloat(t.label) > parseFloat(treasuryMax);
                            return (
                              <option key={i} value={i} disabled={tooHigh}>
                                {t.label} ETH{tooHigh ? " (low treasury)" : ""}
                              </option>
                            );
                          })}
                        </select>
                        <button onClick={() => connected ? handleFlip() : connect()}
                          disabled={connected && coinState !== "idle"}
                          style={{
                            padding: "8px 18px", borderRadius: 8,
                            background: "#f7b32b15", border: "1px solid #f7b32b30",
                            color: "#f7b32b", fontSize: 11, fontWeight: 700,
                            cursor: connected && coinState !== "idle" ? "not-allowed" : "pointer",
                            fontFamily: "inherit", opacity: connected && coinState !== "idle" ? 0.4 : 1,
                          }}>{connected ? "Flip" : "Connect"}</button>
                      </div>
                    </div>
                    {treasuryMax && (
                      <div style={{ fontSize: 9, color: "#475569", marginTop: 6 }}>
                        Treasury: {stats ? parseFloat(stats.treasuryBalance).toFixed(4) : "0"} ETH | Max bet: {parseFloat(treasuryMax).toFixed(4)} ETH
                      </div>
                    )}
                  </div>
                </div>
                </>)}
              </>
            )}

            {/* ═══ BOARD VIEW ═══ */}
            {view === "board" && (
              <BoardView
                seatHook={seatHook}
                address={address}
                connected={connected}
                seatsContract={seatsContract}
                tokenContract={tokenContract}
                readSeats={readSeats}
                tokenBalance={tokenHook.balance}
                refreshBalance={refreshBalance}
                refreshTokenBalance={tokenHook.refreshBalance}
                protocolStats={stats}
              />
            )}

            {/* ═══ FAIR VIEW ═══ */}
            {view === "fair" && (
              <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 20px" }}>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 28, fontWeight: 900, color: "#f7b32b", marginBottom: 8, textAlign: "center" }}>
                  Provably Fair
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", marginBottom: 32 }}>
                  Every flip is on-chain and verifiable
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>How we pick the winner</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                    Every flip uses randomness from the Ethereum network itself (<code style={{ background: "#131820", padding: "2px 6px", borderRadius: 4 }}>block.prevrandao</code>) mixed with player addresses and timestamps. The result is decided on-chain instantly. No server. No oracle. No delay.
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Check any flip yourself</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                    Every flip creates a public record on Base. Copy any transaction hash into BaseScan and see exactly what happened. Nothing is hidden.
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>The contract is public</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                    Read the contract yourself. Every line of code is public and verified on BaseScan. What you see is what runs.
                  </div>
                  <a href={`${EXPLORER}/address/${CONTRACT_ADDRESS}#code`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: "#f7b32b", marginTop: 8, display: "inline-block" }}>
                    View contract on BaseScan {"\u2192"}
                  </a>
                </div>

                <div style={{ padding: 16, background: "#131820", borderRadius: 12, border: "1px solid #1c2430", marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 1.5, marginBottom: 8 }}>FLIP FORMULA</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#94a3b8", lineHeight: 1.8 }}>
                    result = keccak256(<br/>
                    {"  "}prevrandao, timestamp,<br/>
                    {"  "}player1, player2,<br/>
                    {"  "}challengeId, totalFlips<br/>
                    )<br/>
                    winner = (result % 2 == 0) ? player1 : player2
                  </div>
                </div>

                <div style={{ padding: 14, background: "#131820", borderRadius: 10, border: "1px solid #1c2430" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 1.5, marginBottom: 8 }}>FEE BREAKDOWN (4% of pot)</div>
                  {[
                    { label: "Seat holders",    pct: "1.25%", note: "distributed to 256 seat owners", color: "#f7b32b" },
                    { label: "Protocol",        pct: "1.00%", note: "creator wallet (ETH)",          color: "#94a3b8" },
                    { label: "Treasury growth", pct: "1.00%", note: "grows the house pool",          color: "#a78bfa" },
                    { label: "Referral",        pct: "0.50%", note: "to the referring seat",         color: "#3b82f6" },
                    { label: "Jackpot pool",    pct: "0.25%", note: "1% chance per flip",            color: "#ef4444" },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", fontSize: 11 }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ color: "#94a3b8" }}>{item.label}</span>
                        <span style={{ color: "#475569", fontSize: 9 }}>{item.note}</span>
                      </div>
                      <span style={{ color: item.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{item.pct}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", borderTop: "1px solid #1c2430", marginTop: 4, fontSize: 11 }}>
                    <span style={{ color: "#e2e8f0", fontWeight: 700 }}>Winner receives</span>
                    <span style={{ color: "#22c55e", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>96%</span>
                  </div>
                </div>

                <div style={{
                  marginTop: 32, padding: 20,
                  background: "linear-gradient(135deg, rgba(247,179,43,0.08), rgba(247,179,43,0.02))",
                  border: "1px solid rgba(247,179,43,0.2)", borderRadius: 12, textAlign: "center",
                }}>
                  <div style={{ fontSize: 14, color: "#f7b32b", fontWeight: 700, marginBottom: 8 }}>Ready to flip?</div>
                  <div style={{ fontSize: 12, color: "#8b94a3", marginBottom: 16 }}>No tricks. Just ETH, coinflip, and Base.</div>
                  <button onClick={() => { setView("flip"); audio.playClick(); }} style={{
                    padding: "12px 32px", background: "linear-gradient(135deg, #f7b32b, #d4a020)",
                    border: "none", borderRadius: 8, color: "#07090d", fontSize: 13,
                    fontWeight: 800, cursor: "pointer", letterSpacing: 1,
                    fontFamily: "'Chakra Petch', sans-serif",
                  }}>START PLAYING {"\u2192"}</button>
                </div>
              </div>
            )}

            {/* ═══ ADMIN VIEW ═══ */}
            {view === "admin" && isAdmin && adminUnlocked && (
              <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 20px" }}>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 22, fontWeight: 900, color: "#ef4444", marginBottom: 4 }}>Admin Panel</div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 24 }}>Password-gated · contract owner only</div>

                <AdminPanel
                  contract={contract}
                  seatsContract={seatsContract}
                  protocolStats={stats}
                  graduation={seatHook.graduation}
                  yieldPoolWei={seatHook.yieldPool}
                />
              </div>
            )}

            {/* ═══ PROFILE VIEW ═══ */}
            {view === "profile" && (
              <ProfileView
                address={profileViewAddr || address}
                isOwnProfile={(profileViewAddr || address)?.toLowerCase() === (address || "").toLowerCase()}
                seats={seatHook.seats}
                seatsContract={seatsContract}
                tokenBalance={tokenHook.balance}
                playerStats={playerStats}
                userProfile={userProfile.profile}
                linkTwitter={wallet.linkTwitter}
                twitterUser={wallet.user?.twitter}
                onBack={() => { setView("flip"); setProfileViewAddr(null); }}
              />
            )}
           </div>
          </div>
        </div>

        {/* ═══ RIGHT — STATS ═══ */}
        {showStatsDrawer && (
          <div onClick={() => setShowStatsDrawer(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            zIndex: 199, display: "none",
          }} className="drawer-backdrop" />
        )}
        <StatsSidebar
          sessionBalance={sessionBalance}
          walletBalance={walletBalance}
          connected={connected}
          playerStats={playerStats}
          protocolStats={stats}
          treasuryMax={treasuryMax}
          contract={contract}
          address={address}
          isAdmin={isAdmin}
          drawerOpen={showStatsDrawer}
          onCloseDrawer={() => setShowStatsDrawer(false)}
          tokenBalance={tokenHook.balance}
          mySeats={seatHook.mySeats}
          seats={seatHook.seats}
          graduation={seatHook.graduation}
          userProfile={userProfile.profile}
          seatsContract={seatsContract}
          refreshSeats={seatHook.refreshSeats}
        />
      </div>

      {/* V8 F7: footer links — Flaunch, How it Works, X, Website */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 18,
        padding: "12px 16px", borderTop: "1px solid #1c2430",
        background: "#07090d",
        fontSize: 10, color: "#475569", fontFamily: "inherit",
        flexWrap: "wrap",
      }}>
        <a href={FLAUNCH_URL} target="_blank" rel="noreferrer"
          style={{ color: "#f7b32b", textDecoration: "none", fontWeight: 700 }}>
          Buy $FLIPPER →
        </a>
        <button onClick={() => setShowHowItWorks(true)}
          style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 10, fontWeight: 600, padding: 0 }}>
          How it Works
        </button>
        <a href={TWITTER_URL} target="_blank" rel="noreferrer"
          style={{ color: "#94a3b8", textDecoration: "none" }}>
          X @BasedJaider
        </a>
        <a href={WEBSITE_URL} target="_blank" rel="noreferrer"
          style={{ color: "#94a3b8", textDecoration: "none" }}>
          Website
        </a>
      </div>

      {/* LIVE FLIP NOTIFICATION — skip our own flips and treasury wins
          (those are just the house, not interesting news). */}
      {liveFlip
        && liveFlip.winner?.toLowerCase() !== address?.toLowerCase()
        && liveFlip.winner?.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()
        && (
        <div style={{
          position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
          zIndex: 999, padding: "10px 20px", borderRadius: 10,
          background: "#131820", border: "1px solid #1c2430",
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          animation: "fadeIn 0.3s ease",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
          <div>
            <div style={{ fontSize: 11, color: "#e2e8f0" }}>
              <span style={{ fontWeight: 700 }}>{shortAddr(liveFlip.winner)}</span>
              <span style={{ color: "#475569" }}> won </span>
              <span style={{ color: "#22c55e", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{liveFlip.payout} ETH</span>
            </div>
            <div style={{ fontSize: 9, color: "#475569" }}>Just now</div>
          </div>
        </div>
      )}

      {/* HOW IT WORKS MODAL */}
      {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} />}

      {/* MATCH FOUND OVERLAY */}
      {vsFlash && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 2000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.92)",
          animation: "fadeIn 0.15s ease",
        }}>
          {vsFlash.phase === "joining" ? (
            <div style={{
              fontSize: 24, fontWeight: 700, color: "#f7b32b",
              fontFamily: "'Orbitron', sans-serif",
              letterSpacing: 4,
              animation: "pulse 1s ease infinite",
            }}>JOINING ROOM...</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 32, animation: "scaleIn 0.2s ease" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "#f7b32b", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 800, color: "#0b0e11",
                  boxShadow: "0 0 20px #f7b32b40",
                }}>{vsFlash.you?.slice(2,4).toUpperCase()}</div>
                <div style={{ fontSize: 11, color: "#f7b32b", marginTop: 6, fontWeight: 700 }}>YOU</div>
              </div>
              <div style={{
                fontSize: 28, fontWeight: 900, color: "#ef4444",
                fontFamily: "'Orbitron', sans-serif",
                textShadow: "0 0 20px #ef444440",
                animation: "pulse 0.5s ease infinite",
              }}>VS</div>
              <div style={{ textAlign: "center" }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 800, color: "#0b0e11",
                  boxShadow: "0 0 20px #94a3b840",
                }}>{vsFlash.them?.slice(2,4).toUpperCase()}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, fontWeight: 700 }}>
                  {vsFlash.them ? (vsFlash.them.slice(0,6) + "..." + vsFlash.them.slice(-4)) : ""}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {jackpotWin && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 3000,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.95)",
          animation: "scaleIn 0.3s ease",
        }}>
          <div style={{ fontSize: 64, marginBottom: 16, animation: "pulse 0.5s ease infinite" }}>
            {"\uD83D\uDCB0"}
          </div>
          <div style={{
            fontSize: 36, fontWeight: 900, color: "#f7b32b",
            fontFamily: "'Orbitron', sans-serif",
            letterSpacing: 6, textShadow: "0 0 40px #f7b32b60",
            marginBottom: 8,
          }}>JACKPOT!</div>
          <div style={{
            fontSize: 28, fontWeight: 700, color: "#22c55e",
            fontFamily: "'JetBrains Mono', monospace",
            marginBottom: 24,
          }}>+{jackpotWin.amount} ETH</div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 24 }}>
            You hit the jackpot! ETH sent to your wallet.
          </div>
          <button onClick={() => setJackpotWin(null)} style={{
            padding: "12px 40px", borderRadius: 10,
            background: "linear-gradient(135deg, #b8860b, #f7b32b)",
            color: "#0b0e11", fontSize: 14, fontWeight: 800,
            border: "none", cursor: "pointer",
          }}>Collect</button>
        </div>
      )}

      {matchFoundAnim && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 2000,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.9)",
          animation: "fadeIn 0.2s ease",
        }}>
          <div style={{ textAlign: "center", animation: "scaleIn 0.3s ease" }}>
            <div style={{
              fontSize: 36, fontWeight: 900, color: "#f7b32b",
              fontFamily: "'Orbitron', sans-serif",
              letterSpacing: 6,
              textShadow: "0 0 40px #f7b32b40",
            }}>
              MATCH FOUND
            </div>
            <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 12 }}>
              Flipping coin...
            </div>
          </div>
        </div>
      )}

      {/* WALLET CONFIRM BAR */}
      {waitingConfirm && (
        <div style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          zIndex: 100, padding: "10px 24px", borderRadius: 10,
          background: "#131820", border: "1px solid #f7b32b30",
          display: "flex", alignItems: "center", gap: 10,
          animation: "fadeIn 0.2s ease",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: "50%",
            border: "2px solid #1c2430", borderTopColor: "#f7b32b",
            animation: "spin 0.8s linear infinite",
          }}/>
          <span style={{ fontSize: 12, color: "#f7b32b", fontWeight: 600 }}>
            Confirm in wallet...
          </span>
        </div>
      )}

      {/* FAUCET — floating pill (Sepolia-only) */}
      {connected && chainId === CHAIN_ID && tokenContract && (
        <button
          onClick={async () => {
            const pid = addToast("pending", "Claiming test FLIPPER…");
            try {
              await claimMockFlipperFn(tokenContract);
              dismissToast(pid);
              addToast("success", "Received test FLIPPER");
              tokenHook.refreshBalance?.();
            } catch (err) {
              dismissToast(pid);
              addToast("error", decodeError(err));
            }
          }}
          title="Claim 100,000 test FLIPPER (Sepolia faucet)"
          style={{
            position: "fixed", right: 20, bottom: 20, zIndex: 90,
            padding: "10px 18px", borderRadius: 999,
            background: "linear-gradient(135deg, rgba(247,179,43,0.14), rgba(247,179,43,0.06))",
            border: "1px solid rgba(247,179,43,0.35)",
            backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
            color: "#f7b32b", fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
            fontFamily: "'Chakra Petch', sans-serif", cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 8,
            boxShadow: "0 6px 20px rgba(0,0,0,0.35), 0 0 14px rgba(247,179,43,0.18)",
          }}>
          <span style={{ fontSize: 14 }}>{"\uD83C\uDFB0"}</span>
          Claim FLIPPER
        </button>
      )}

      {/* TOASTS */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => removeToastFn(t.id)}>
            {t.message}
            {t.txHash && <a href={`${EXPLORER}/tx/${t.txHash}`} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>View tx</a>}
          </div>
        ))}
      </div>
    </>
  );
}
