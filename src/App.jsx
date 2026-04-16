import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useWallet, useFlip, useSeats, useProtocol, useToasts, addToast, EXPLORER, useGlobalFeed } from "./hooks.js";

const Coin3D = lazy(() => import("./Coin3D.jsx"));
import { getPlayerInfo, getTreasuryMaxBet, getSeatInfo, decodeError } from "./contract.js";
import { CONTRACT_ADDRESS, TIERS, CHAIN_ID, CHAIN_ID_HEX } from "./config.js";
import { parseEther, formatEther } from "ethers";
import { audio, vibrate } from "./audio.js";
import confetti from "canvas-confetti";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function getReferralFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    return ref ? parseInt(ref, 10) || 0 : 0;
  } catch { return 0; }
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

/* ═══ RESPONSIVE: TABLET ═══ */
@media (max-width: 1100px) {
  .stats-drawer-toggle { display: flex !important; }
  .drawer-backdrop { display: block !important; }
  .app-root { grid-template-columns: 1fr; }
  .chat-sidebar { display: none; }
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
function LiveFeedSidebar({ recentFlips, address }) {
  return (
    <div className="chat-sidebar sidebar-texture">
      <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(247,179,43,0.15), transparent)" }} />
      <div style={{
        padding: "14px 16px", borderBottom: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e", animation: "liveDot 1.5s ease infinite" }} />
          <span style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>Live activity</span>
        </div>
        <span style={{ fontSize: 9, color: "var(--text-faint)" }}>{recentFlips.length} recent</span>
      </div>
      <div className="chat-messages" style={{ padding: "8px 10px" }}>
        {recentFlips.map((flip, i) => {
          const isMyWin = flip.winner?.toLowerCase() === address?.toLowerCase();
          const isMyLoss = flip.loser?.toLowerCase() === address?.toLowerCase();
          const isTrW = flip.winner?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase();
          const isTrL = flip.loser?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase();
          return (
            <div key={flip.id + "-" + i} style={{
              background: isMyWin ? "linear-gradient(90deg, rgba(247,179,43,0.08), transparent)"
                : isMyLoss ? "linear-gradient(90deg, rgba(239,68,68,0.06), transparent)"
                : "linear-gradient(90deg, rgba(34,197,94,0.04), transparent)",
              borderLeft: isMyWin ? "2px solid #f7b32b"
                : isMyLoss ? "2px solid #ef4444"
                : "2px solid rgba(34,197,94,0.3)",
              padding: "8px 10px 8px 12px", borderRadius: "0 8px 8px 0",
              marginBottom: 4, animation: flip.isNew ? "tickerChipEnter 0.4s ease" : "none",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                <span style={{ fontSize: 11, color: isMyWin ? "#f7b32b" : isMyLoss ? "#ef4444" : "var(--text)", fontWeight: isMyWin || isMyLoss ? 700 : 600 }}>
                  {isMyWin ? "You won" : isMyLoss ? "You lost" : (isTrW ? "Treasury" : shortAddr(flip.winner)) + " won"}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                  color: isMyLoss ? "#ef4444" : "#22c55e",
                }}>
                  {isMyLoss ? "-" : "+"}{parseFloat(isMyLoss ? flip.amount : flip.payout).toFixed(4)}
                </span>
              </div>
              <div style={{ fontSize: 9, color: "var(--text-faint)" }}>
                {isMyWin ? "vs " + (isTrL ? "Treasury" : shortAddr(flip.loser))
                  : isMyLoss ? "vs " + (isTrW ? "Treasury" : shortAddr(flip.winner))
                  : shortAddr(flip.winner) + " vs " + (isTrL ? "Treasury" : shortAddr(flip.loser))}
                {" \u00B7 "}{parseFloat(flip.amount).toFixed(4)} ETH
              </div>
            </div>
          );
        })}
        {recentFlips.length === 0 && (
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
function StatsSidebar({ sessionBalance, walletBalance, connected, playerStats, protocolStats, treasuryMax, contract, address, isAdmin, drawerOpen, onCloseDrawer }) {
  const jackpotPercent = protocolStats ? Math.min(100, (parseFloat(protocolStats.jackpot || 0) / 0.05) * 100) : 0;

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
                { l: "Treasury", v: `${Number(protocolStats.treasury).toFixed(4)}` },
                { l: "Max bet", v: treasuryMax ? `${parseFloat(treasuryMax).toFixed(4)}` : "0.0000" },
                { l: "Total bets", v: protocolStats.totalFlips.toLocaleString() },
                { l: "Volume", v: `${Number(protocolStats.totalVolume).toFixed(3)}` },
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
                  <span style={{ fontSize: 14, color: "#f7b32b", fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{Number(protocolStats.jackpot).toFixed(4)}</span>
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

        {/* $FLIPPER TOKEN */}
        <div style={{ padding: 12, background: "linear-gradient(135deg, rgba(34,197,94,0.04), rgba(34,197,94,0.01))", border: "1px solid rgba(34,197,94,0.12)", borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="#22c55e"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>
            <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700, letterSpacing: 1 }}>$FLIPPER</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontSize: 14, color: "var(--text)", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>$0.00042</span>
            <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>+18.4%</span>
          </div>
          <div style={{ fontSize: 9, color: "var(--text-faint)", marginBottom: 8 }}>Buy on Flaunch · Trading fees fund treasury</div>
          <button onClick={() => window.open("https://flaunch.gg/base/coin/0xb28CdC10232e0E3bE033Fd2C01e01b4E514e06bB", "_blank")} style={{
            width: "100%", padding: "8px 12px", background: "transparent", border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: 6, color: "#22c55e", fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5, fontFamily: "inherit",
          }}>{"BUY $FLIPPER \u2192"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  BOARD TAB — TAKEOVER.FUN STYLE
// ═══════════════════════════════════════
function BoardView({ seatHook, address, connected, contract, refreshBalance, protocolStats }) {
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [seatDetail, setSeatDetail] = useState(null);
  const [seatBuyName, setSeatBuyName] = useState("");
  const [seatBuyDeposit, setSeatBuyDeposit] = useState("0.002");
  const [seatBuyPrice, setSeatBuyPrice] = useState("0.001");
  const [recentActivity, setRecentActivity] = useState([]);
  const [selectedDuration, setSelectedDuration] = useState(168);
  const [selectedMult, setSelectedMult] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [boardFilter, setBoardFilter] = useState("all");
  const [newPriceInput, setNewPriceInput] = useState("");
  const [showBulkBuy, setShowBulkBuy] = useState(false);
  const [bulkCount, setBulkCount] = useState(3);
  const [bulkBuying, setBulkBuying] = useState(false);

  // Fetch detailed seat info when modal opens
  useEffect(() => {
    if (!selectedSeat || !contract) { setSeatDetail(null); return; }
    getSeatInfo(contract, selectedSeat.id).then(setSeatDetail).catch(() => setSeatDetail(null));
  }, [selectedSeat, contract]);

  // Cooldown countdown timer (1h = 3600s after lastPriceChangeTime)
  useEffect(() => {
    if (!seatDetail?.lastPriceChangeTime) { setCooldownRemaining(0); return; }
    const calc = () => {
      const end = seatDetail.lastPriceChangeTime + 3600;
      const left = end - Math.floor(Date.now() / 1000);
      setCooldownRemaining(left > 0 ? left : 0);
    };
    calc();
    const iv = setInterval(calc, 1000);
    return () => clearInterval(iv);
  }, [seatDetail?.lastPriceChangeTime]);

  // Fetch recent seat activity (SeatBought events)
  useEffect(() => {
    if (!contract || !contract.runner?.provider) return;
    (async () => {
      try {
        const block = await contract.runner.provider.getBlockNumber();
        const from = Math.max(0, block - 2000);
        const events = await contract.queryFilter("SeatBought", from, block);
        const items = events.slice(-15).reverse().map(e => ({
          seatId: Number(e.args.seatId),
          newOwner: e.args.newOwner,
          prevOwner: e.args.prevOwner,
          price: formatEther(e.args.price),
          block: e.blockNumber,
        }));
        setRecentActivity(items);
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

  const ownedCount = useMemo(() => {
    return seatHook.seats?.filter(s => s.active).length || 0;
  }, [seatHook.seats]);

  const floorPrice = useMemo(() => {
    const active = seatHook.seats?.filter(s => s.active);
    if (!active || active.length === 0) return "0.001";
    const prices = active.map(s => parseFloat(s.price)).filter(p => p > 0);
    return prices.length > 0 ? Math.min(...prices).toFixed(4) : "0.001";
  }, [seatHook.seats]);

  const totalValue = useMemo(() => {
    const active = seatHook.seats?.filter(s => s.active);
    if (!active || active.length === 0) return "0.0000";
    return active.reduce((sum, s) => sum + parseFloat(s.price), 0).toFixed(4);
  }, [seatHook.seats]);

  const estYieldPerSeat = useMemo(() => {
    const activeSeatCount = seatHook.seats?.filter(s => s.active).length || 1;
    const seatPoolEth = protocolStats ? parseFloat(protocolStats.seatPool || "0") : 0;
    return (seatPoolEth / activeSeatCount).toFixed(6);
  }, [seatHook.seats, protocolStats]);

  const filteredSeats = useMemo(() => {
    const s = seatHook.seats;
    if (!s || s.length === 0) return [];
    if (boardFilter === "all") return s;
    return s.map(seat => {
      if (boardFilter === "owned" && !seat.active) return { ...seat, hidden: true };
      if (boardFilter === "mine" && !seat.mine) return { ...seat, hidden: true };
      if (boardFilter === "empty" && seat.active) return { ...seat, hidden: true };
      return seat;
    });
  }, [seatHook.seats, boardFilter]);

  // Calculate buyout cost breakdown
  const buyoutCalc = useMemo(() => {
    if (!selectedSeat || !selectedSeat.active || !selectedSeat.priceWei) return null;
    try {
      const price = selectedSeat.priceWei;
      const mults = [10n, 12n, 20n, 50n]; // /10 to get 1x, 1.2x, 2x, 5x
      const newPrice = price * mults[selectedMult] / 10n;
      const weeklyTax = newPrice * 500n / 10000n;
      const deposit = weeklyTax * BigInt(selectedDuration) / 168n;
      const totalVal = price + deposit;
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
          { l: "Cheapest seat", v: `${floorPrice} \u039E`, c: "#f7b32b" },
          { l: "Total locked", v: `${totalValue} \u039E`, c: "#e2e8f0" },
          { l: "Rent per week", v: "5%", c: "#e2e8f0" },
          { l: "You own", v: `${seatHook.mySeats.length}`, c: "#f7b32b" },
          { l: "Ready to claim", v: `${protocolStats ? Number(protocolStats.seatPool).toFixed(4) : "0"} \u039E`, c: "#22c55e" },
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
            if (firstEmpty) { setSelectedSeat(firstEmpty); setSelectedMult(0); setSelectedDuration(168); }
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
          {seatHook.mySeats.length > 0 && (
            <button onClick={async () => {
              try {
                const tx = await contract.claimMultipleSeats(seatHook.mySeats);
                const receipt = await tx.wait();
                let totalClaimed = "0";
                for (const log of receipt.logs) {
                  try {
                    const parsed = contract.interface.parseLog(log);
                    if (parsed.name === "BatchRewardsClaimed") {
                      totalClaimed = formatEther(parsed.args[1] || 0n);
                      break;
                    }
                  } catch {}
                }
                if (parseFloat(totalClaimed) > 0) {
                  addToast("success", "Claimed " + totalClaimed + " ETH from " + seatHook.mySeats.length + " seats!");
                } else {
                  addToast("info", "No rewards to claim yet");
                }
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

        {/* 8x8 Scrollable Grid */}
        {seatHook.loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}>
            {Array(64).fill(0).map((_, i) => (
              <div key={i} style={{
                aspectRatio: "1", borderRadius: 6,
                background: "#0d1118", border: "1px solid #151b25",
                animation: "blink 1.5s ease infinite",
                animationDelay: (i % 8) * 0.03 + "s",
              }} />
            ))}
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4, maxHeight: "calc(100vh - 200px)", overflowY: "auto", padding: "0 2px 2px" }}>
              {filteredSeats.map(seat => {
                const isMine = seat.mine;
                const isExpiring = seat.active && seat.daysLeft < 3 && !isMine;
                return (
                  <div key={seat.id}
                    onClick={() => { setSelectedSeat(seat); setSelectedMult(0); setSelectedDuration(168); audio.playClick(); }}
                    style={{
                      aspectRatio: "1", borderRadius: 6, cursor: "pointer", position: "relative",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      padding: 4, transition: "all 0.15s",
                      opacity: seat.hidden ? 0.1 : 1,
                      border: isMine ? "2px solid #f7b32b"
                        : isExpiring ? "2px solid #ef4444"
                        : seat.active ? "1px solid " + addrColor(seat.owner) + "50"
                        : "1px dashed rgba(255,255,255,0.08)",
                      animation: isExpiring ? "roomPulse 1s ease infinite" : "none",
                      boxShadow: isMine ? "0 0 16px rgba(247,179,43,0.3)" : "none",
                      background: isMine
                        ? "linear-gradient(135deg, rgba(247,179,43,0.15), rgba(247,179,43,0.05))"
                        : seat.active
                        ? "linear-gradient(135deg, " + addrColor(seat.owner) + "18, " + addrColor(seat.owner) + "08)"
                        : "rgba(255,255,255,0.02)",
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
                        <div style={{ fontSize: 8, color: "#475569", position: "absolute", top: 3, left: 4 }}>#{seat.id}</div>
                        {isMine && <div style={{ position: "absolute", top: 2, right: 3, fontSize: 7, fontWeight: 800, color: "#f7b32b", letterSpacing: 0.5 }}>YOURS</div>}
                        {isExpiring && <div style={{ position: "absolute", top: 2, right: 3, fontSize: 7, fontWeight: 800, color: "#ef4444", letterSpacing: 0.5 }}>{"\u26A0"} LOW</div>}
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: addrColor(seat.owner),
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 800, color: "#fff", marginBottom: 3,
                        }}>{seat.owner?.slice(2, 4).toUpperCase()}</div>
                        <div style={{
                          fontSize: 8, color: "#94a3b8", fontWeight: 600,
                          overflow: "hidden", textOverflow: "ellipsis",
                          whiteSpace: "nowrap", maxWidth: "90%", textAlign: "center",
                        }}>{seat.name || shortAddr(seat.owner)}</div>
                        <div style={{
                          fontSize: 9, fontWeight: 700, color: "#f7b32b",
                          fontFamily: "'JetBrains Mono', monospace", marginTop: 2,
                        }}>{parseFloat(seat.price).toFixed(3)} {"\u039E"}</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 12, color: "#2a3040", fontWeight: 800 }}>#{seat.id}</div>
                        <div style={{ fontSize: 8, color: "#2a3040", marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>0.001 {"\u039E"}</div>
                        <div style={{ fontSize: 7, color: "#1c2430", marginTop: 3, letterSpacing: 0.5, fontWeight: 600 }}>EMPTY</div>
                      </>
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
              if (firstEmpty) { setSelectedSeat(firstEmpty); setSelectedMult(0); setSelectedDuration(168); }
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
                  <span style={{ fontSize: 9, color: "#f7b32b", fontFamily: "'JetBrains Mono', monospace" }}>{parseFloat(seat.price).toFixed(3)}</span>
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
                <div className="mtc-label">BUYOUT COST</div>
                <div className="mtc-value" style={{ color: "#f7b32b" }}>{selectedSeat.active ? parseFloat(selectedSeat.price).toFixed(4) : "0.001"}</div>
                <div className="mtc-note">ETH from wallet</div>
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
                    { l: "Price", v: `${parseFloat(seatDetail.price).toFixed(4)} ETH`, c: "#f7b32b" },
                    { l: "Deposit", v: `${effectiveDeposit.toFixed(4)} ETH`, c: "#e2e8f0" },
                    { l: "Pending Tax", v: `${tax.toFixed(4)} ETH`, c: "#ef4444" },
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
              /* CLAIM empty seat */
              <div>
                <input className="seat-modal-input" placeholder="Seat name (optional)" maxLength={32}
                  value={seatBuyName} onChange={e => setSeatBuyName(e.target.value)} />
                <div className="modal-section-label">DEPOSIT DURATION</div>
                <div className="duration-options">
                  {[{l:"1h",h:1},{l:"1d",h:24},{l:"7d",h:168},{l:"30d",h:720}].map(d => (
                    <button key={d.h} className={`duration-btn ${selectedDuration === d.h ? "active" : ""}`}
                      onClick={() => setSelectedDuration(d.h)}>{d.l}</button>
                  ))}
                </div>
                <div style={{ padding: 10, background: "#0b0e11", borderRadius: 8, marginBottom: 12 }}>
                  {[
                    { l: "Seat price", v: "0.0010 ETH" },
                    { l: "Weekly tax", v: (0.001 * 0.05).toFixed(4) + " ETH/wk" },
                    { l: "Deposit (" + (selectedDuration < 24 ? selectedDuration + "h" : Math.round(selectedDuration / 24) + "d") + ")", v: (0.001 * 0.05 * selectedDuration / 168).toFixed(4) + " ETH" },
                    { l: "Total", v: (0.001 + 0.001 * 0.05 * selectedDuration / 168).toFixed(4) + " ETH", color: "#f7b32b", bold: true },
                  ].map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 10 }}>
                      <span style={{ color: "#475569" }}>{r.l}</span>
                      <span style={{ color: r.color || "#e2e8f0", fontWeight: r.bold ? 700 : 400, fontFamily: "'JetBrains Mono', monospace" }}>{r.v}</span>
                    </div>
                  ))}
                </div>
                <button className="modal-buy-btn" onClick={async () => {
                  try {
                    const depositWei = parseEther((0.001 * 0.05 * selectedDuration / 168).toFixed(6));
                    const basePrice = parseEther("0.001");
                    const totalVal = basePrice + depositWei;
                    const tx = await contract.buySeat(selectedSeat.id, basePrice, seatBuyName, 0, { value: totalVal });
                    await tx.wait();
                    addToast("success", `Claimed Seat #${selectedSeat.id}!`);
                    setSelectedSeat(null); setSeatBuyName(""); seatHook.refreshSeats();
                  } catch (err) { addToast("error", decodeError(err)); }
                }}>Claim Seat</button>
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
                    try {
                      const tx = await contract.claimSeatRewards(selectedSeat.id);
                      await tx.wait();
                      addToast("success", "Rewards claimed!");
                      refreshBalance(); seatHook.refreshSeats();
                    } catch (err) { addToast("error", decodeError(err)); }
                  }}>
                  Claim Rewards {seatDetail?.rewards && parseFloat(seatDetail.rewards) > 0 ? `(${parseFloat(seatDetail.rewards).toFixed(4)} ETH)` : ""}
                </button>
                <div style={{ fontSize: 9, color: "#475569", marginTop: -2, marginBottom: 4, textAlign: "center" }}>Rewards sent directly to your wallet</div>

                {/* Top Up Deposit */}
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4 }}>Add deposit to extend seat life</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[
                      { label: "+1d", hours: 24 },
                      { label: "+7d", hours: 168 },
                      { label: "+30d", hours: 720 },
                    ].map(d => {
                      const seatPrice = parseFloat(selectedSeat?.price || "0.001");
                      const weeklyTax = seatPrice * 0.05;
                      const depositAmt = (weeklyTax * d.hours / 168).toFixed(6);
                      return (
                        <button key={d.hours} onClick={async () => {
                          try {
                            const tx = await contract.addSeatDeposit(selectedSeat.id, { value: parseEther(depositAmt) });
                            await tx.wait();
                            addToast("success", "Deposit added! " + d.label);
                            seatHook.refreshSeats();
                            getSeatInfo(contract, selectedSeat.id).then(setSeatDetail).catch(() => {});
                          } catch (err) { addToast("error", decodeError(err)); }
                        }} className="modal-action-btn" style={{
                          flex: 1, padding: "8px 4px",
                          background: "#22c55e08", border: "1px solid #22c55e20",
                          color: "#22c55e", fontSize: 10, textAlign: "center",
                        }}>
                          <div>{d.label}</div>
                          <div style={{ fontSize: 8, color: "#475569", marginTop: 2 }}>{depositAmt} ETH</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Withdraw Excess Deposit */}
                {seatDetail && parseFloat(seatDetail.deposit) > 0 && (
                  <button className="modal-action-btn" style={{
                    background: "#f7b32b08", border: "1px solid #f7b32b20", color: "#f7b32b", fontSize: 10, marginTop: 4,
                  }} onClick={async () => {
                    try {
                      const currentDeposit = parseFloat(seatDetail.deposit);
                      const seatPrice = parseFloat(selectedSeat?.price || "0.001");
                      const minDeposit = seatPrice * 0.05 / 7;
                      const withdrawable = currentDeposit - minDeposit;
                      if (withdrawable <= 0.000001) {
                        addToast("error", "No excess deposit to withdraw");
                        return;
                      }
                      const tx = await contract.withdrawSeatDeposit(selectedSeat.id, parseEther(withdrawable.toFixed(6)));
                      await tx.wait();
                      addToast("success", "Withdrew " + withdrawable.toFixed(4) + " ETH");
                      seatHook.refreshSeats(); refreshBalance();
                      getSeatInfo(contract, selectedSeat.id).then(setSeatDetail).catch(() => {});
                    } catch (err) { addToast("error", decodeError(err)); }
                  }}>
                    Withdraw Excess Deposit
                    <span style={{ fontSize: 8, color: "#475569", marginLeft: 4 }}>
                      ({parseFloat(seatDetail.deposit).toFixed(4)} ETH)
                    </span>
                  </button>
                )}

                {/* Update Price */}
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input type="number" step="0.001" min="0.001" placeholder="New price ETH"
                    value={newPriceInput} onChange={e => setNewPriceInput(e.target.value)}
                    className="seat-modal-input" style={{ marginBottom: 0, flex: 1, fontSize: 10 }} />
                  <button className="modal-action-btn" disabled={cooldownRemaining > 0}
                    style={{
                      background: "#3b82f608", border: "1px solid #3b82f620", color: "#3b82f6",
                      fontSize: 10, padding: "8px 14px", width: "auto", marginTop: 0,
                      opacity: cooldownRemaining > 0 ? 0.4 : 1, cursor: cooldownRemaining > 0 ? "not-allowed" : "pointer",
                    }}
                    onClick={async () => {
                      const price = parseFloat(newPriceInput);
                      if (!price || price < 0.001) { addToast("error", "Price must be at least 0.001 ETH"); return; }
                      try {
                        const tx = await contract.updateSeatPrice(selectedSeat.id, parseEther(newPriceInput));
                        await tx.wait();
                        addToast("success", "Price updated to " + newPriceInput + " ETH");
                        setNewPriceInput(""); seatHook.refreshSeats();
                        getSeatInfo(contract, selectedSeat.id).then(setSeatDetail).catch(() => {});
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
                    if (!confirm("Are you sure? You will lose your seat position. Pending rewards will be auto-claimed.")) return;
                    try {
                      const tx = await contract.abandonSeat(selectedSeat.id);
                      await tx.wait();
                      addToast("success", "Seat #" + selectedSeat.id + " abandoned");
                      setSelectedSeat(null); seatHook.refreshSeats(); refreshBalance();
                    } catch (err) { addToast("error", decodeError(err)); }
                  }}>Abandon Seat</button>
              </div>
            ) : (
              /* BUYOUT another's seat */
              <div>
                <div className="modal-section-label">NEW PRICE</div>
                <div className="price-options">
                  {[{l:"Current",m:0},{l:"1.2x",m:1},{l:"2x",m:2},{l:"5x",m:3}].map(opt => (
                    <div key={opt.m} className={`price-option ${selectedMult === opt.m ? "active" : ""}`}
                      onClick={() => setSelectedMult(opt.m)}>
                      <div className="price-option-value">
                        {buyoutCalc ? parseFloat(formatEther(buyoutCalc.newPrice * (opt.m === selectedMult ? 1n : [10n,12n,20n,50n][opt.m]) / (opt.m === selectedMult ? 1n : [10n,12n,20n,50n][selectedMult]))).toFixed(4) : "..."}
                      </div>
                      <div className="price-option-mult">{opt.l}</div>
                    </div>
                  ))}
                </div>

                <div className="modal-section-label">DEPOSIT DURATION</div>
                <div className="duration-options">
                  {[{l:"1h",h:1},{l:"1d",h:24},{l:"7d",h:168},{l:"30d",h:720}].map(d => (
                    <button key={d.h} className={`duration-btn ${selectedDuration === d.h ? "active" : ""}`}
                      onClick={() => setSelectedDuration(d.h)}>{d.l}</button>
                  ))}
                </div>

                {buyoutCalc && (
                  <>
                    <div className="cost-row">
                      <span className="cost-label">Buyout price</span>
                      <span className="cost-value">{parseFloat(formatEther(buyoutCalc.buyoutPrice)).toFixed(4)} ETH</span>
                    </div>
                    <div className="cost-row">
                      <span className="cost-label">Your new price</span>
                      <span className="cost-value">{parseFloat(formatEther(buyoutCalc.newPrice)).toFixed(4)} ETH</span>
                    </div>
                    <div className="cost-row">
                      <span className="cost-label">Tax deposit ({selectedDuration}h)</span>
                      <span className="cost-value">{parseFloat(formatEther(buyoutCalc.deposit)).toFixed(4)} ETH</span>
                    </div>
                    <div className="total-row">
                      <span className="total-label">Total</span>
                      <span className="total-value">{parseFloat(formatEther(buyoutCalc.totalVal)).toFixed(4)} ETH</span>
                    </div>
                  </>
                )}

                <button className="modal-buy-btn" onClick={async () => {
                  if (!buyoutCalc) return;
                  try {
                    const maxPrice = buyoutCalc.buyoutPrice + buyoutCalc.buyoutPrice / 10n;
                    const tx = await contract.buySeat(selectedSeat.id, buyoutCalc.newPrice, "", maxPrice, { value: buyoutCalc.totalVal });
                    await tx.wait();
                    addToast("success", `Bought Seat #${selectedSeat.id}!`);
                    setSelectedSeat(null); seatHook.refreshSeats(); refreshBalance();
                  } catch (err) { addToast("error", decodeError(err)); }
                }}>Buy Seat</button>
                <button className="modal-cancel-btn" onClick={() => setSelectedSeat(null)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BULK BUY MODAL */}
      {showBulkBuy && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowBulkBuy(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#131820", border: "1px solid #1c2430", borderRadius: 14, padding: 24, width: 380 }}>
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 16, fontWeight: 800, color: "#f7b32b", marginBottom: 16 }}>Buy Several at Once</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
              Buy {bulkCount} empty seats at base price (0.001 ETH + 0.002 deposit each)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 11, color: "#475569" }}>Qty:</span>
              {[1, 3, 5, 10].map(n => (
                <button key={n} onClick={() => setBulkCount(n)} style={{
                  padding: "6px 14px", borderRadius: 6,
                  border: "1px solid " + (bulkCount === n ? "#f7b32b" : "#1c2430"),
                  background: bulkCount === n ? "#f7b32b10" : "#0b0e11",
                  color: bulkCount === n ? "#f7b32b" : "#475569",
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>{n}</button>
              ))}
            </div>
            <div style={{ padding: 12, background: "#0b0e11", borderRadius: 8, marginBottom: 16 }}>
              {[
                { l: "Seats", v: bulkCount },
                { l: "Cost each", v: "0.003 ETH" },
                { l: "Total", v: (bulkCount * 0.003).toFixed(3) + " ETH", c: "#f7b32b" },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11 }}>
                  <span style={{ color: "#475569" }}>{r.l}</span>
                  <span style={{ color: r.c || "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{r.v}</span>
                </div>
              ))}
            </div>
            <button disabled={bulkBuying} onClick={async () => {
              setBulkBuying(true);
              const empty = seatHook.seats.filter(s => !s.active);
              const toBuy = empty.slice(0, bulkCount);
              let bought = 0;
              for (const seat of toBuy) {
                try {
                  const tx = await contract.buySeat(seat.id, parseEther("0.001"), "", 0n, { value: parseEther("0.003") });
                  await tx.wait();
                  bought++;
                  addToast("success", "Seat #" + seat.id + " bought! (" + bought + "/" + bulkCount + ")");
                  if (bought < toBuy.length) await new Promise(r => setTimeout(r, 1000));
                } catch (err) {
                  addToast("error", "Seat #" + seat.id + ": " + decodeError(err));
                  break;
                }
              }
              setBulkBuying(false);
              setShowBulkBuy(false);
              seatHook.refreshSeats();
            }} style={{
              width: "100%", padding: 14, borderRadius: 10,
              background: bulkBuying ? "#475569" : "linear-gradient(135deg, #b8860b, #f7b32b)",
              color: "#0b0e11", fontSize: 14, fontWeight: 800, border: "none",
              cursor: bulkBuying ? "wait" : "pointer", fontFamily: "'Chakra Petch', sans-serif",
            }}>{bulkBuying ? "Buying..." : "Buy " + bulkCount + " Seats (" + (bulkCount * 0.003).toFixed(3) + " ETH)"}</button>
            <div style={{ fontSize: 9, color: "#475569", marginTop: 8, textAlign: "center" }}>Each seat = separate transaction</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════
function AdminPanel({ contract, address }) {
  const [loading, setLoading] = useState("");
  const exec = async (label, fn) => {
    setLoading(label);
    try { const tx = await fn(); await tx.wait(); addToast("success", label + " done"); }
    catch (e) { addToast("error", decodeError(e)); }
    setLoading("");
  };
  const btnStyle = (color) => ({
    padding: "12px", borderRadius: 8, cursor: "pointer", width: "100%",
    background: color + "10", border: "1px solid " + color + "30",
    color, fontSize: 11, fontWeight: 700, fontFamily: "inherit",
    opacity: loading ? 0.5 : 1, marginBottom: 6,
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button disabled={loading !== ""} onClick={() => exec("Withdraw Protocol", () => contract.withdrawProtocol())} style={btnStyle("#22c55e")}>
        Withdraw Protocol
      </button>
      <button disabled={loading !== ""} onClick={() => exec("Withdraw Buyback", () => contract.withdrawBuyback(address))} style={btnStyle("#3b82f6")}>
        Withdraw Buyback
      </button>
      <button disabled={loading !== ""} onClick={() => exec("Distribute Rewards", () => contract.distributeRewards())} style={btnStyle("#f7b32b")}>
        Distribute Rewards
      </button>
      <button disabled={loading !== ""} onClick={() => exec("Fund Treasury +0.01", () => contract.fundTreasury({ value: parseEther("0.01") }))} style={btnStyle("#94a3b8")}>
        Fund Treasury +0.01 ETH
      </button>
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
  const { connected, address, contract, readContract, chainId, connect, disconnect, sessionBalance, refreshBalance, ready, isEmbedded } = wallet;
  const wrongNetwork = connected && chainId && chainId !== CHAIN_ID;
  const flipHook = useFlip(contract, address, refreshBalance, readContract);
  const seatHook = useSeats(contract, address, refreshBalance, readContract);
  const protocol = useProtocol(contract, readContract);
  const { toasts, remove: removeToastFn } = useToasts();

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
  const { recentFlips, liveFlip } = useGlobalFeed(contract, readContract);

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

  // Called by Coin3D when landing animation completes
  const onFlipDone = useCallback(() => {
    const pending = pendingResultRef.current;
    if (!pending) return;
    pendingResultRef.current = null;
    processingFlipRef.current = false;

    setShowResult(true);
    setResult(pending.won ? "win" : "lose");
    setLastPayout(pending.payout);
    setFlipHistory(prev => [{ won: pending.won }, ...prev].slice(0, 12));

    if (pending.won) {
      audio.playWin(); triggerWinConfetti();
      vibrate([30, 50, 30, 50, 30]);
      addToast("success", "Won " + pending.payout + " ETH!");
    } else {
      audio.playLoss();
      vibrate(20);
      addToast("error", "Lost " + pending.amount + " ETH");
    }
    refreshBalance();
    flipHook.refreshHistory();
    getPlayerInfo(contract, address).then(setPlayerStats).catch(() => {});
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
    flipHook.refreshHistory();
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
      flipHook.refreshHistory();
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

  // V7: Wallet native balance
  useEffect(() => {
    if (!contract?.runner?.provider || !address) return;
    const fetch = async () => {
      try {
        const bal = await contract.runner.provider.getBalance(address);
        setWalletBalance(parseFloat(formatEther(bal)).toFixed(4));
      } catch {}
    };
    fetch();
    const iv = setInterval(fetch, 10000);
    return () => clearInterval(iv);
  }, [contract, address]);

  const isAdmin = address?.toLowerCase() === OWNER.toLowerCase();

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

        const won = winner.toLowerCase() === myAddr;
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
            pendingResultRef.current = { won, payout: formatEther(payout), amount: formatEther(betAmount) };
            setCoinState(won ? "win" : "lose");
            setTimeout(() => setBorderState(won ? "win" : "lose"), 500);
          }, 2500);
        }, 2000);

      } catch {}
    };

    contract.on("FlipResolved", onFlipResolved);
    return () => { contract.off("FlipResolved", onFlipResolved); };
  }, [contract, address]);

  // Simple room status check — fast detection for creator
  // Does NOT clear myRoomIdRef — leaves it for FlipResolved listener to handle
  useEffect(() => {
    if (!myRoomId || !contract) return;
    roomGoneDetectedRef.current = false;

    const check = async () => {
      try {
        if (roomGoneDetectedRef.current) return; // Already detected, waiting for listener
        const data = await contract.getAllOpenChallenges();
        const stillOpen = data.ids.some(id => Number(id) === myRoomIdRef.current);

        if (!stillOpen && myRoomIdRef.current) {
          // Room disappeared — someone accepted it
          roomGoneDetectedRef.current = true;

          // Show MATCH FOUND overlay immediately
          // The FlipResolved listener will handle the actual flip result
          setMatchFoundAnim(true);
          audio.playMatchFound();
          vibrate([50, 100, 50]);

          // Fallback: if listener doesn't act in 8s, clean up everything
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
          }, 8000);
        }
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
  }, [myRoomId, contract]);


  // ═══════════════════════════════════════
  //  UNIFIED FLIP EXECUTION
  // ═══════════════════════════════════════

  // Parse FlipResolved + JackpotWon from a receipt
  const parseFlipResult = (receipt) => {
    let result = null;
    let jackpot = null;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === "FlipResolved") {
          const challengeId = Number(parsed.args[0]);
          processedFlipsRef.current.add(challengeId);
          if (processedFlipsRef.current.size > 50) {
            processedFlipsRef.current = new Set([...processedFlipsRef.current].slice(-20));
          }
          result = {
            won: parsed.args.winner?.toLowerCase() === address?.toLowerCase(),
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
    if (jackpot && jackpot.winner?.toLowerCase() === address?.toLowerCase()) {
      setJackpotWin(jackpot);
      audio.playJackpot(); triggerJackpotConfetti();
      vibrate([100, 50, 100, 50, 100, 50, 200]);
    }
    return result || { won: false, payout: "0", amount: "0" };
  };

  // Core: send a flip TX, show coin animation, display result
  const executeFlip = async (txPromise, opponent, betAmount, isPvP) => {
    processingFlipRef.current = true;
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
      const { won, payout, amount } = parseFlipResult(receipt);

      const elapsed = Date.now() - spinStartRef.current;
      setTimeout(() => {
        stopSpinAudio();
        pendingResultRef.current = { won, payout, amount };
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
          position: "fixed", inset: 0, zIndex: 3000,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#0b0e11", gap: 16,
        }}>
          <div style={{
            fontSize: 20, fontWeight: 700, color: "#f7b32b",
            fontFamily: "'Orbitron', sans-serif",
          }}>FLIPPERROOMS</div>
          <div style={{ fontSize: 13, color: "#ef4444", marginTop: 8 }}>
            Having trouble connecting to Base network
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", maxWidth: 300, lineHeight: 1.6 }}>
            This could be a temporary network issue.
            Make sure you're connected to the internet and try again.
          </div>
          <button onClick={() => window.location.reload()} style={{
            padding: "10px 32px", borderRadius: 8, marginTop: 8,
            background: "linear-gradient(135deg, #b8860b, #f7b32b)",
            color: "#0b0e11", fontSize: 13, fontWeight: 700,
            border: "none", cursor: "pointer",
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
        <LiveFeedSidebar recentFlips={recentFlips} address={address} />

        {/* ═══ CENTER — GAME ═══ */}
        <div className="game-center">
          <div className="game-topbar">
            <div className="logo">
              <span className="logo-text"><span className="logo-gold">FLIPPER</span><span className="logo-dim">ROOMS</span></span>
              <span className="logo-badge">BASE</span>
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
                <button className={`nav-btn ${view === "admin" ? "active" : ""}`} onClick={() => { setView("admin"); audio.playClick(); }}
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
              {/* Online users badge */}
              <div className="header-stats" style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.2)", borderRadius: 6,
              }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", animation: "liveDot 1.5s ease infinite" }} />
                <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700, letterSpacing: 0.5 }}>
                  {(() => { const h = new Date().getHours(); return (h >= 18 && h <= 23 ? 2400 : h >= 9 && h <= 17 ? 1500 : 600) + Math.floor(Math.random() * 200); })().toLocaleString()} ONLINE
                </span>
              </div>
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
                      const jackpotAmount = stats ? Number(stats.jackpot).toFixed(4) : "0.0000";
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
                        Treasury: {stats ? parseFloat(stats.treasury).toFixed(4) : "0"} ETH | Max bet: {parseFloat(treasuryMax).toFixed(4)} ETH
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
                contract={contract}
                refreshBalance={refreshBalance}
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

                <div style={{
                  marginTop: 32, padding: 20,
                  background: "linear-gradient(135deg, rgba(247,179,43,0.08), rgba(247,179,43,0.02))",
                  border: "1px solid rgba(247,179,43,0.2)", borderRadius: 12, textAlign: "center",
                }}>
                  <div style={{ fontSize: 14, color: "#f7b32b", fontWeight: 700, marginBottom: 8 }}>Ready to flip?</div>
                  <div style={{ fontSize: 12, color: "#8b94a3", marginBottom: 16 }}>No tricks. Just ETH, coinflip, and Base.</div>
                  <button onClick={() => setView("coinflip")} style={{
                    padding: "12px 32px", background: "linear-gradient(135deg, #f7b32b, #d4a020)",
                    border: "none", borderRadius: 8, color: "#07090d", fontSize: 13,
                    fontWeight: 800, cursor: "pointer", letterSpacing: 1,
                    fontFamily: "'Chakra Petch', sans-serif",
                  }}>START PLAYING {"\u2192"}</button>
                </div>
              </div>
            )}

            {/* ═══ ADMIN VIEW ═══ */}
            {view === "admin" && isAdmin && (
              <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 20px" }}>
                <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 22, fontWeight: 900, color: "#ef4444", marginBottom: 4 }}>Admin Panel</div>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 24 }}>Only visible to contract owner</div>

                <AdminPanel contract={contract} address={address} />
              </div>
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
        />
      </div>

      {/* LIVE FLIP NOTIFICATION */}
      {liveFlip && liveFlip.winner?.toLowerCase() !== address?.toLowerCase() && (
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
