import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useWallet, useFlip, useSeats, useProtocol, useToasts, addToast, EXPLORER, useGlobalFeed } from "./hooks.js";

const Coin3D = lazy(() => import("./Coin3D.jsx"));
import { getPlayerInfo, getTreasuryMaxBet, getSeatInfo, decodeError } from "./contract.js";
import { CONTRACT_ADDRESS, TIERS } from "./config.js";
import { parseEther, formatEther } from "ethers";
import { playClickSound, playFlipSound, playWinSound, playLoseSound, playStreakSound } from "./sounds.js";

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
  --bg-deep: #0b0e11;
  --bg-main: #0f1318;
  --bg-card: #151a22;
  --bg-card-hover: #1c232e;
  --bg-elevated: #1f2937;
  --border: #151b25;
  --border-light: #1c2430;

  --gold: #f7b32b;
  --gold-bright: #ffd700;
  --gold-glow: #f7b32b50;
  --gold-dark: #b8860b;

  --green: #22c55e;
  --green-glow: #22c55e40;
  --red: #ef4444;
  --red-glow: #ef444440;

  --text: #f1f5f9;
  --text-dim: #94a3b8;
  --text-muted: #475569;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg-deep); color: var(--text); font-family: 'Chakra Petch', sans-serif; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg-card); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--border-light); }

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
  background:
    radial-gradient(ellipse at 20% 80%, #f7b32b04 0%, transparent 40%),
    radial-gradient(ellipse at 80% 20%, #f7b32b03 0%, transparent 35%),
    var(--bg-deep);
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
  background: linear-gradient(180deg, #0c1019 0%, #080b10 50%, #0c1019 100%);
  border-right: 1px solid #151b25;
  position: relative; z-index: 1;
}
.chat-header {
  padding: 16px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 8px;
}
.chat-header h2 { font-size: 14px; font-weight: 700; color: var(--text); }
.online-badge { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim); }
.online-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px #22c55e60; animation: blink 2s infinite; }

.chat-messages { flex: 1; overflow-y: auto; padding: 0; display: flex; flex-direction: column; gap: 0; background: linear-gradient(180deg, #090c12, #0b0e14, #090c12); }
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
  background: radial-gradient(ellipse at 50% 0%, #f7b32b04 0%, transparent 50%), #0b0e11;
}
.game-topbar {
  height: 52px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, var(--bg-main), var(--bg-deep)); flex-shrink: 0;
  position: relative;
}
.game-topbar::after {
  content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent 5%, #f7b32b30 30%, #b8860b30 50%, #f7b32b30 70%, transparent 95%);
}
.logo { display: flex; align-items: center; gap: 8px; }
.logo-text { font-family: 'Orbitron', sans-serif; font-size: 16px; font-weight: 700; letter-spacing: 3px; }
.logo-gold { color: var(--gold); text-shadow: 0 0 30px #f7b32b40; }
.logo-dim { color: var(--text-muted); }
.logo-badge {
  font-size: 8px; font-weight: 800; letter-spacing: 1.5px; padding: 3px 8px;
  border-radius: 4px; background: #f7b32b15; color: var(--gold); border: 1px solid #f7b32b30;
}
.nav { display: flex; gap: 4px; }
.nav-btn {
  padding: 8px 18px; border: none; background: none; color: var(--text-dim);
  font-size: 13px; font-weight: 600; font-family: 'Chakra Petch', sans-serif;
  cursor: pointer; border-radius: 6px; transition: all 0.2s; position: relative;
}
.nav-btn:hover { color: var(--text); background: var(--bg-card); }
.nav-btn.active { color: var(--gold); background: #f7b32b10; text-shadow: 0 0 10px #f7b32b30; }
.nav-btn.active::after {
  content: ''; position: absolute; bottom: 2px; left: 20%; right: 20%;
  height: 2px; background: var(--gold); border-radius: 2px;
}
.header-right { display: flex; align-items: center; gap: 10px; }
.connect-btn {
  padding: 8px 20px; border: none; border-radius: 8px; font-size: 13px;
  font-weight: 700; font-family: 'Chakra Petch', sans-serif; cursor: pointer;
  background: linear-gradient(135deg, #b8860b, #f7b32b); color: #0b0e11;
  box-shadow: 0 0 25px #f7b32b40; transition: all 0.2s;
}
.connect-btn:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 0 35px #f7b32b60; }
.addr-pill {
  padding: 6px 14px; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; font-size: 12px; color: var(--text-dim); cursor: pointer;
  font-family: 'JetBrains Mono', monospace; transition: all 0.2s;
}
.addr-pill:hover { border-color: var(--border-light); }

.game-scroll { flex: 1; overflow-y: auto; }

/* Hero section */
.hero-section {
  position: relative; padding: 32px 24px; text-align: center;
}
.hero-section::before {
  content: ''; position: absolute; inset: 0;
  background-image: linear-gradient(#f7b32b06 1px, transparent 1px), linear-gradient(90deg, #f7b32b06 1px, transparent 1px);
  background-size: 40px 40px; opacity: 0.5; pointer-events: none;
}
.hero-section::after {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, #f7b32b15 0%, transparent 70%);
  pointer-events: none;
}
.hero-inner { position: relative; z-index: 1; }
.hero-title-text {
  font-family: 'Orbitron', sans-serif;
  font-size: 48px; font-weight: 900; letter-spacing: 8px; margin-bottom: 4px;
  color: #f7b32b; text-shadow: 0 0 30px #f7b32b20;
}
.hero-sub { color: var(--text-muted); font-size: 13px; margin-bottom: 24px; letter-spacing: 1px; }

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
  background: linear-gradient(135deg, #b8860b, #f7b32b);
  color: #0b0e11; font-size: 12px; font-weight: 700; cursor: pointer;
  font-family: 'Chakra Petch', sans-serif; transition: all 0.2s;
  box-shadow: 0 0 12px #f7b32b30;
}
.join-btn:hover { box-shadow: 0 0 20px #f7b32b50; transform: scale(1.05); }
.cancel-btn {
  padding: 8px 16px; border: 1px solid var(--red); border-radius: 8px;
  background: transparent; color: var(--red); font-size: 11px; font-weight: 600;
  cursor: pointer; font-family: 'Chakra Petch', sans-serif; transition: all 0.2s;
}
.cancel-btn:hover { background: #ef444410; }

/* ═══ STATS SIDEBAR (RIGHT) ═══ */
.stats-sidebar {
  display: flex; flex-direction: column; height: 100%;
  background: linear-gradient(180deg, #0c1019 0%, #080b10 50%, #0c1019 100%);
  border-left: 1px solid #151b25;
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

/* Flip modal */
.flip-modal-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  animation: fadeIn 0.3s ease;
}
.flip-modal {
  width: 600px; max-width: 95vw; background: var(--bg-deep);
  border: 1px solid var(--border); border-radius: 20px; overflow: hidden;
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
@media (max-width: 1100px) {
  .app-root { grid-template-columns: 1fr; }
  .chat-sidebar { display: none; }
  .stats-sidebar { display: none; }
}
`;


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
      <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #f7b32b15, transparent)" }} />
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid #151b25", background: "#0c1019",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>Live Feed</span>
        {recentFlips.length > 0 && (
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e60", animation: "blink 2s infinite" }} />
        )}
      </div>
      <div className="chat-messages">
        {recentFlips.map((flip, i) => {
          const isMyWin = flip.winner?.toLowerCase() === address?.toLowerCase();
          const isMyLoss = flip.loser?.toLowerCase() === address?.toLowerCase();
          return (
            <div key={flip.id + "-" + i} style={{
              padding: "10px 18px", borderBottom: "1px solid #0e1219",
              animation: flip.isNew ? "fadeIn 0.3s ease" : "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%", background: addrColor(flip.winner),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 7, fontWeight: 800, color: "#fff",
                }}>{flip.winner?.slice(2,4).toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#e2e8f0" }}>
                    <span style={{ fontWeight: 700, color: isMyWin ? "#f7b32b" : "#e2e8f0" }}>
                      {isMyWin ? "You" : shortAddr(flip.winner)}
                    </span>
                    <span style={{ color: "#475569" }}> won </span>
                    <span style={{ color: "#22c55e", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                      {parseFloat(flip.payout).toFixed(4)}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: "#374151" }}>
                    vs {isMyLoss ? "You" : shortAddr(flip.loser)} {"\u00B7"} {parseFloat(flip.amount).toFixed(4)} ETH
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {recentFlips.length === 0 && (
          <div style={{ padding: 30, textAlign: "center", fontSize: 11, color: "#475569" }}>
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
function StatsSidebar({ sessionBalance, walletBalance, connected, playerStats, protocolStats, treasuryMax, contract, address, isAdmin }) {
  const bal = sessionBalance || "0";

  return (
    <div className="stats-sidebar sidebar-texture">
      <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #f7b32b15, transparent)" }} />
      {/* PROFILE CARD */}
      {connected && (
        <div style={{ padding: "16px", borderBottom: "1px solid #151b25", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%", background: addrColor(address),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800, color: "#fff", border: "2px solid #1c2430",
          }}>{address?.slice(2,4).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis" }}>
              {shortAddr(address)}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 9, color: "#22c55e" }}>{playerStats?.wins || 0}W</span>
              <span style={{ fontSize: 9, color: "#ef4444" }}>{playerStats?.losses || 0}L</span>
              <span style={{ fontSize: 9, color: "#f7b32b" }}>
                {playerStats?.wins && (playerStats.wins + playerStats.losses) > 0
                  ? ((playerStats.wins / (playerStats.wins + playerStats.losses)) * 100).toFixed(0) + "%"
                  : "0%"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* BALANCE */}
      <div style={{ padding: "16px", borderBottom: "1px solid #151b25" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 1.5, marginBottom: 6 }}>BALANCE</div>
        <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "#f7b32b", letterSpacing: -1 }}>
          {walletBalance || "0.00"}
        </div>
        <div style={{ fontSize: 11, color: "#475569" }}>ETH</div>
      </div>

      <div className="stats-section">
        <div className="stats-label">Protocol Stats</div>
        {!protocolStats ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{
                height: 16, borderRadius: 4,
                background: "#151a22",
                animation: "pulse 1.5s ease infinite",
                animationDelay: i * 0.1 + "s",
              }}/>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { l: "Total Bets", v: protocolStats.totalFlips.toLocaleString() },
              { l: "Treasury", v: `${Number(protocolStats.treasury).toFixed(4)} \u039E` },
              { l: "Max Bet", v: treasuryMax ? `${parseFloat(treasuryMax).toFixed(4)} \u039E` : "0.0000 \u039E" },
              { l: "Jackpot", v: `${Number(protocolStats.jackpot).toFixed(4)} \u039E` },
              { l: "Volume", v: `${Number(protocolStats.totalVolume).toFixed(3)} \u039E` },
            ].map((r, i) => (
              <div className="protocol-row" key={i}>
                <span className="protocol-row-label">{r.l}</span>
                <span className="protocol-row-val">{r.v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {connected && playerStats && (
        <div className="stats-section">
          <div className="stats-label">Your Stats</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "linear-gradient(135deg, #22c55e08, #0a0d13)", borderRadius: 10, padding: "14px 8px", textAlign: "center", border: "1px solid #22c55e15" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#22c55e", fontFamily: "'JetBrains Mono', monospace" }}>{playerStats.wins}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Wins</div>
            </div>
            <div style={{ background: "linear-gradient(135deg, #ef444408, #0a0d13)", borderRadius: 10, padding: "14px 8px", textAlign: "center", border: "1px solid #ef444415" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#ef4444", fontFamily: "'JetBrains Mono', monospace" }}>{playerStats.losses}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Losses</div>
            </div>
          </div>
          {playerStats.streak > 0 && (
            <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "linear-gradient(135deg, #f7b32b08, transparent)", borderLeft: "3px solid #f7b32b" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f7b32b" }}>{playerStats.streak} Win Streak</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>Best: {playerStats.bestStreak}</div>
            </div>
          )}
        </div>
      )}
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
          <div style={{ fontSize: 9, color: "#22c55e80", fontWeight: 700, letterSpacing: 1 }}>EST. YIELD PER SEAT</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#22c55e", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>{estYieldPerSeat} ETH</div>
          <div style={{ fontSize: 9, color: "#475569" }}>per week based on current volume</div>
        </div>

        <div className="board-label">BOARD STATS</div>
        <div className="board-stats-grid">
          <div className="board-stat-card">
            <div className="board-stat-value" style={{ color: "#f7b32b" }}>{ownedCount}</div>
            <div className="board-stat-label">OWNED</div>
          </div>
          <div className="board-stat-card">
            <div className="board-stat-value" style={{ color: "#e2e8f0" }}>{256 - ownedCount}</div>
            <div className="board-stat-label">AVAILABLE</div>
          </div>
        </div>

        {[
          { l: "Floor Price", v: `${floorPrice} \u039E`, c: "#f7b32b" },
          { l: "Total Value", v: `${totalValue} \u039E`, c: "#e2e8f0" },
          { l: "Weekly Tax", v: "5%", c: "#e2e8f0" },
          { l: "Your Seats", v: `${seatHook.mySeats.length}`, c: "#f7b32b" },
          { l: "Yield Pool", v: `${protocolStats ? Number(protocolStats.seatPool).toFixed(4) : "0"} \u039E`, c: "#22c55e" },
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
          }}>Buy Multiple Seats</button>
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
              256 REVENUE SEATS
            </div>
            <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.5, maxWidth: 400 }}>
              Buy a seat to earn ETH from every coinflip. Harberger tax keeps prices fair.
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["All", "Owned", "Mine", "Empty"].map(f => (
              <button key={f} onClick={() => setBoardFilter(f.toLowerCase())} style={{
                padding: "4px 10px", borderRadius: 5, fontSize: 9, fontWeight: 600,
                border: "1px solid " + (boardFilter === f.toLowerCase() ? "#f7b32b" : "#1c2430"),
                background: boardFilter === f.toLowerCase() ? "#f7b32b08" : "#131820",
                color: boardFilter === f.toLowerCase() ? "#f7b32b" : "#475569",
                cursor: "pointer", fontFamily: "inherit",
              }}>{f}</button>
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
                return (
                  <div key={seat.id}
                    onClick={() => { setSelectedSeat(seat); setSelectedMult(0); setSelectedDuration(168); playClickSound(); }}
                    style={{
                      aspectRatio: "1", borderRadius: 6, cursor: "pointer", position: "relative",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      padding: 4, transition: "all 0.15s",
                      opacity: seat.hidden ? 0.1 : 1,
                      border: isMine ? "2px solid #f7b32b"
                        : seat.active ? "1px solid " + addrColor(seat.owner) + "50"
                        : "1px solid #1a1f2e",
                      background: seat.active
                        ? "linear-gradient(135deg, " + addrColor(seat.owner) + "12, #0d1118)"
                        : "#0c0f14",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.zIndex = "5"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.4)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.zIndex = "1"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    {seat.active ? (
                      <>
                        <div style={{ fontSize: 8, color: "#475569", position: "absolute", top: 3, left: 4 }}>#{seat.id}</div>
                        {isMine && <div style={{ position: "absolute", top: 3, right: 4, width: 6, height: 6, borderRadius: "50%", background: "#f7b32b", boxShadow: "0 0 4px #f7b32b" }} />}
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
                        <div style={{ fontSize: 10, color: "#1c2430", fontWeight: 700 }}>#{seat.id}</div>
                        <div style={{ fontSize: 8, color: "#1c2430", marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>0.001 {"\u039E"}</div>
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
            <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>No seat activity yet</div>
            <div style={{ fontSize: 9, color: "#374151", lineHeight: 1.5 }}>
              Activity appears here when seats are bought, sold, or taken over.
            </div>
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
                <div key={seatId} className="my-seat-card" onClick={() => { setSelectedSeat(seat); playClickSound(); }}>
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
                <div className="mtc-label">EST. YIELD</div>
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
                {[
                  { l: "Price", v: `${parseFloat(seatDetail.price).toFixed(4)} ETH`, c: "#f7b32b" },
                  { l: "Deposit", v: `${parseFloat(seatDetail.deposit).toFixed(4)} ETH`, c: "#e2e8f0" },
                  { l: "Rewards", v: `${parseFloat(seatDetail.rewards).toFixed(4)} ETH`, c: "#22c55e" },
                  { l: "Earned", v: `${parseFloat(seatDetail.earned).toFixed(4)} ETH`, c: "#f7b32b" },
                  { l: "Tax", v: `${parseFloat(seatDetail.pendingTax).toFixed(4)} ETH`, c: "#ef4444" },
                  { l: "Runway", v: seatDetail.runway > 0 ? `${Math.floor(seatDetail.runway / 86400)}d ${Math.floor((seatDetail.runway % 86400) / 3600)}h` : "\u2014", c: "#94a3b8" },
                ].map((r, i) => (
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
                    try {
                      const tx = await contract.abandonSeat(selectedSeat.id);
                      await tx.wait();
                      addToast("success", "Seat abandoned");
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
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 16, fontWeight: 800, color: "#f7b32b", marginBottom: 16 }}>Buy Multiple Seats</div>
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
            text: "Create a room with any amount (0.0005 - 1 ETH) or join an existing one. 50/50 coinflip \u2014 winner takes 95% of the pot. No deposit needed, play directly from your wallet." },
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
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 1.5, marginBottom: 8 }}>FEE BREAKDOWN (5% of pot)</div>
          {[
            { label: "Seat holders", pct: "2.5%", color: "#f7b32b" },
            { label: "Protocol", pct: "0.75%", color: "#94a3b8" },
            { label: "Referral", pct: "1.0%", color: "#3b82f6" },
            { label: "Token buyback", pct: "0.5%", color: "#22c55e" },
            { label: "Jackpot pool", pct: "0.25%", color: "#ef4444" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11 }}>
              <span style={{ color: "#94a3b8" }}>{item.label}</span>
              <span style={{ color: item.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{item.pct}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", borderTop: "1px solid #1c2430", marginTop: 4, fontSize: 11 }}>
            <span style={{ color: "#e2e8f0", fontWeight: 700 }}>Winner receives</span>
            <span style={{ color: "#22c55e", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>95%</span>
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
  const { connected, address, contract, connect, disconnect, sessionBalance, refreshBalance, ready, isEmbedded } = wallet;
  const flipHook = useFlip(contract, address, refreshBalance);
  const seatHook = useSeats(contract, address, refreshBalance);
  const protocol = useProtocol(contract);
  const { toasts, remove: removeToastFn } = useToasts();

  const [view, setView] = useState("flip");
  const [tier, setTier] = useState(1);
  const [playerStats, setPlayerStats] = useState(null);
  const [flipModal, setFlipModal] = useState(null);
  const [treasuryMax, setTreasuryMax] = useState(null);
  const referral = useRef(getReferralFromUrl()).current;

  // V7 state
  const [customBet, setCustomBet] = useState("0.01");
  const [openRooms, setOpenRooms] = useState(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [walletBalance, setWalletBalance] = useState("0.0000");
  const [showCoinStage, setShowCoinStage] = useState(false);
  const OWNER = "0xE5678F8659d229a303ABecdD0D0113Cf1F4F83aE";

  // Global feeds
  const { recentFlips, liveFlip } = useGlobalFeed(contract);
  const playerCache = useRef({});

  // Coin state
  const [coinState, setCoinState] = useState("idle");
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const pendingResultRef = useRef(null);
  const [waitingConfirm, setWaitingConfirm] = useState(false);
  const [flipHistory, setFlipHistory] = useState([]);
  const [lastPayout, setLastPayout] = useState("0");
  const tierBarRef = useRef(null);
  const [borderState, setBorderState] = useState("idle");
  const spinStartRef = useRef(0);
  const [currentOpponent, setCurrentOpponent] = useState(null);
  const [currentBet, setCurrentBet] = useState("0");
  const [lastFlipData, setLastFlipData] = useState(null);
  const [myRoomId, setMyRoomId] = useState(null);
  const myRoomIdRef = useRef(null);
  const [roomCountdown, setRoomCountdown] = useState(0);
  const [showWalletMenu, setShowWalletMenu] = useState(false);

  // Keep ref in sync so timers/closures always see current roomId
  useEffect(() => { myRoomIdRef.current = myRoomId; }, [myRoomId]);

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

    setShowResult(true);
    setResult(pending.won ? "win" : "lose");
    setLastPayout(pending.payout);
    setFlipHistory(prev => [{ won: pending.won }, ...prev].slice(0, 12));

    if (pending.won) {
      playWinSound();
      addToast("success", "Won " + pending.payout + " ETH!");
    } else {
      playLoseSound();
      addToast("error", "Lost " + pending.amount + " ETH");
    }
    refreshBalance();
    flipHook.refreshHistory();
    getPlayerInfo(contract, address).then(setPlayerStats).catch(() => {});

    if (pending.flipModalUpdate) {
      setFlipModal(prev => prev ? { ...prev, ...pending.flipModalUpdate } : null);
    }
    // Result stays visible until user clicks Rematch/Double/Change
  }, [address, refreshBalance, contract]);

  // Load data
  useEffect(() => {
    if (!contract) return;
    flipHook.refreshChallenges();
    flipHook.refreshHistory();
    protocol.refreshStats();
    getTreasuryMaxBet(contract).then(v => setTreasuryMax(v)).catch(() => {});
  }, [contract]);

  // Polling
  useEffect(() => {
    if (!contract) return;
    const iv = setInterval(() => {
      refreshBalance();
      protocol.refreshStats();
      flipHook.refreshChallenges();
      flipHook.refreshHistory();
      getTreasuryMaxBet(contract).then(v => setTreasuryMax(v)).catch(() => {});
    }, 15000);
    return () => clearInterval(iv);
  }, [contract, refreshBalance]);

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

  // V7: Stable refresh function for open rooms
  const refreshOpenRooms = useCallback(async () => {
    if (!contract) return;
    try {
      const data = await contract.getAllOpenChallenges();
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
  }, [contract]);

  // V7: Poll open rooms every 3s + event-driven updates
  useEffect(() => {
    if (!contract) return;
    refreshOpenRooms();
    const iv = setInterval(refreshOpenRooms, 3000);
    const onRoomChange = () => refreshOpenRooms();
    contract.on("ChallengeCreated", onRoomChange);
    contract.on("ChallengeCancelled", onRoomChange);
    return () => {
      clearInterval(iv);
      contract.off("ChallengeCreated", onRoomChange);
      contract.off("ChallengeCancelled", onRoomChange);
    };
  }, [refreshOpenRooms, contract]);

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
  const coinStateRef = useRef(coinState);
  const showCoinStageRef = useRef(showCoinStage);
  useEffect(() => { coinStateRef.current = coinState; }, [coinState]);
  useEffect(() => { showCoinStageRef.current = showCoinStage; }, [showCoinStage]);

  useEffect(() => {
    if (!contract || !address) return;
    const myAddr = address.toLowerCase();

    const onFlipResolved = (...args) => {
      try {
        const winner = args[1];
        const loser = args[2];
        const payout = args[3];
        const betAmount = args[4];
        const isMyFlip = winner.toLowerCase() === myAddr || loser.toLowerCase() === myAddr;

        // Always refresh rooms when ANY flip resolves
        refreshOpenRooms();

        if (!isMyFlip) return;

        // Clear auto-match timer if our room was accepted by someone
        if (myRoomIdRef.current) {
          setMyRoomId(null);
          myRoomIdRef.current = null;
          setRoomCountdown(0);
        }

        // Only show animation if we're not already flipping (avoid double animation)
        if (showCoinStageRef.current || coinStateRef.current !== "idle") return;

        const won = winner.toLowerCase() === myAddr;
        const opponent = won ? loser : winner;

        setCurrentOpponent(opponent);
        setCurrentBet(formatEther(betAmount));
        setShowCoinStage(true);
        setCoinState("spinning");
        setBorderState("spinning");
        spinStartRef.current = Date.now();
        playFlipSound();

        setLastFlipData({ amount: formatEther(betAmount), opponent, isPvP: true });

        setTimeout(() => {
          pendingResultRef.current = { won, payout: formatEther(payout), amount: formatEther(betAmount) };
          setCoinState(won ? "win" : "lose");
          setTimeout(() => setBorderState(won ? "win" : "lose"), 500);
        }, 2500);
      } catch {}
    };

    contract.on("FlipResolved", onFlipResolved);
    return () => { contract.off("FlipResolved", onFlipResolved); };
  }, [contract, address]);


  // ═══════════════════════════════════════
  //  UNIFIED FLIP EXECUTION
  // ═══════════════════════════════════════

  // Parse FlipResolved from a receipt
  const parseFlipResult = (receipt) => {
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === "FlipResolved") {
          return {
            won: parsed.args.winner?.toLowerCase() === address?.toLowerCase(),
            payout: formatEther(parsed.args.payout),
            amount: formatEther(parsed.args.betAmount),
          };
        }
      } catch {}
    }
    return { won: false, payout: "0", amount: "0" };
  };

  // Core: send a flip TX, show coin animation, display result
  const executeFlip = async (txPromise, opponent, betAmount, isPvP) => {
    setCurrentOpponent(opponent);
    setCurrentBet(betAmount);
    setShowCoinStage(true);

    if (!isEmbedded) setWaitingConfirm(true);
    try {
      const tx = await txPromise;

      // Wallet confirmed — start spinning
      setWaitingConfirm(false);
      setCoinState("spinning");
      setBorderState("spinning");
      spinStartRef.current = Date.now();
      playFlipSound();

      const receipt = await tx.wait();
      const { won, payout, amount } = parseFlipResult(receipt);

      setLastFlipData({ amount: betAmount, opponent, isPvP });

      const elapsed = Date.now() - spinStartRef.current;
      setTimeout(() => {
        pendingResultRef.current = { won, payout, amount };
        setCoinState(won ? "win" : "lose");
        setTimeout(() => setBorderState(won ? "win" : "lose"), 500);
      }, Math.max(0, 2500 - elapsed));

      refreshOpenRooms();
      return { won, payout };
    } catch (err) {
      setCoinState("idle");
      setBorderState("idle");
      setShowCoinStage(false);
      setWaitingConfirm(false);
      addToast("error", decodeError(err));
      return null;
    }
  };

  // ═══ Treasury flip (from tier selector) ═══
  const handleFlip = async () => {
    if (!contract || !connected || coinState !== "idle") return;
    playClickSound();
    const ref = parseInt(localStorage.getItem('flipper_ref')) || referral;
    await executeFlip(
      contract.flipDirect(ref, { value: TIERS[tier].wei, gasLimit: 1000000n }),
      null, TIERS[tier].label, false
    );
  };

  // ═══ Treasury flip by amount (for Flip Again / Double) ═══
  const handleFlipTreasury = async (amount) => {
    if (!contract || !connected) return;
    const amt = amount.replace(",", ".");
    const ref = parseInt(localStorage.getItem('flipper_ref')) || 0;
    resetFlip();
    await executeFlip(
      contract.flipDirect(ref, { value: parseEther(amt), gasLimit: 1000000n }),
      null, amt, false
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
        // Check if room is still open before auto-matching
        const roomId = myRoomIdRef.current;
        if (!roomId || !contract) return;
        contract.getChallengeInfo(roomId).then(info => {
          const status = Number(info.status_ ?? info[4] ?? 0);
          if (status !== 0) {
            // Room already accepted/cancelled — wait for FlipResolved event
            setMyRoomId(null);
            myRoomIdRef.current = null;
            addToast("info", "Opponent found! Loading result...");
          } else {
            autoMatchRef.current(countdownBetRef.current);
          }
        }).catch(() => {
          // If check fails, try auto-match anyway
          autoMatchRef.current(countdownBetRef.current);
        });
      } else {
        setRoomCountdown(prev => prev - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [roomCountdown, myRoomId, contract]);

  // ═══ Poll room status while waiting for opponent ═══
  useEffect(() => {
    if (!myRoomId || !contract || !address) return;
    const checkRoom = async () => {
      try {
        const info = await contract.getChallengeInfo(myRoomId);
        const status = Number(info.status_ ?? info[4] ?? 0);
        if (status === 0) return; // still open

        // Room was accepted — clear state, find result
        const roomId = myRoomId;
        setMyRoomId(null);
        myRoomIdRef.current = null;
        setRoomCountdown(0);

        // Search recent blocks for the FlipResolved event
        const block = await contract.runner.provider.getBlockNumber();
        const events = await contract.queryFilter("FlipResolved", Math.max(0, block - 100), block);
        for (const ev of events) {
          if (Number(ev.args[0]) !== roomId) continue;
          const winner = ev.args[1];
          const loser = ev.args[2];
          const payout = ev.args[3];
          const betAmount = ev.args[4];
          const won = winner.toLowerCase() === address.toLowerCase();
          const opponent = won ? loser : winner;

          setCurrentOpponent(opponent);
          setCurrentBet(formatEther(betAmount));
          setShowCoinStage(true);
          setCoinState("spinning");
          setBorderState("spinning");
          playFlipSound();
          setLastFlipData({ amount: formatEther(betAmount), opponent, isPvP: true });

          setTimeout(() => {
            pendingResultRef.current = { won, payout: formatEther(payout), amount: formatEther(betAmount) };
            setCoinState(won ? "win" : "lose");
            setTimeout(() => setBorderState(won ? "win" : "lose"), 500);
          }, 2000);
          return;
        }
        addToast("info", "Opponent found! Waiting for result...");
      } catch {}
    };
    const iv = setInterval(checkRoom, 3000);
    return () => clearInterval(iv);
  }, [myRoomId, contract, address]);

  // ═══ Create PvP room ═══
  const handleCreateRoom = async (amount) => {
    if (!contract || !connected) return;
    playClickSound();
    const betAmt = (amount || customBet).replace(",", ".");
    if (isNaN(parseFloat(betAmt)) || parseFloat(betAmt) <= 0) {
      addToast("error", "Invalid bet amount");
      return;
    }
    const ref = parseInt(localStorage.getItem('flipper_ref')) || referral;
    try {
      const tx = await contract.createChallengeDirect(ref, { value: parseEther(betAmt) });
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
    playClickSound();
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
    playClickSound();
    const c = (openRooms || []).find(ch => ch.id === challengeId) || flipHook.challenges.find(ch => ch.id === challengeId);
    const amt = c ? c.amount : "?";
    const amtWei = c?.amountWei || 0;
    const ref = parseInt(localStorage.getItem('flipper_ref')) || referral;
    await executeFlip(
      contract.acceptChallengeDirect(challengeId, ref, { value: amtWei, gasLimit: 1000000n }),
      creatorAddr, amt, true
    );
  };

  // ═══ Rematch (PvP: new room, Treasury: flip again) ═══
  const handleRematch = async () => {
    if (!lastFlipData) return;
    resetFlip();
    if (lastFlipData.isPvP) {
      setShowCoinStage(false);
      await handleCreateRoom(lastFlipData.amount);
    } else {
      await handleFlipTreasury(lastFlipData.amount);
    }
  };

  // ═══ Double or nothing ═══
  const handleDouble = async () => {
    if (!lastFlipData) return;
    const doubleAmt = (parseFloat(lastFlipData.amount) * 2).toFixed(4);
    resetFlip();
    if (lastFlipData.isPvP) {
      setShowCoinStage(false);
      await handleCreateRoom(doubleAmt);
    } else {
      await handleFlipTreasury(doubleAmt);
    }
  };

  const stats = protocol.stats;
  const tierEth = TIERS[tier]?.label || "0.005";

  return (
    <>
      <style>{CSS}</style>
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
                  setView(v); playClickSound();
                  if (v === "board" && seatHook.seats.length === 0) seatHook.refreshSeats();
                }}>
                  {v === "flip" ? "Coinflip" : v === "board" ? "Board" : "Fair"}
                </button>
              ))}
              {isAdmin && (
                <button className={`nav-btn ${view === "admin" ? "active" : ""}`} onClick={() => { setView("admin"); playClickSound(); }}
                  style={view === "admin" ? { color: "#ef4444", background: "#ef444410" } : {}}>
                  Admin
                </button>
              )}
            </div>

            {/* Live counters */}
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
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
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "4px 10px", borderRadius: 6,
                      background: isWin ? "#22c55e10" : "#ef444410",
                      border: "1px solid " + (isWin ? "#22c55e25" : "#ef444425"),
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: isWin ? "#22c55e" : "#ef4444", fontFamily: "'JetBrains Mono', monospace" }}>
                        {isWin ? "W" : "L"}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>
                        {h.amount} ETH
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: isWin ? "#22c55e" : "#ef4444", fontFamily: "'JetBrains Mono', monospace" }}>
                        {isWin ? "2x" : "0x"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="game-scroll">

            {/* ═══ COINFLIP VIEW ═══ */}
            {view === "flip" && (
              <>
                <div className="hero-section">
                  <div className="hero-inner">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                      <div style={{
                        fontFamily: "'Orbitron', sans-serif", fontSize: 44, fontWeight: 900,
                        color: "#f7b32b", letterSpacing: 6, textShadow: "0 0 40px #f7b32b15",
                      }}>COINFLIP</div>
                      <button onClick={() => setShowHowItWorks(true)} style={{
                        padding: "5px 10px", borderRadius: 6, background: "transparent",
                        border: "1px solid #1c2430", color: "#475569", fontSize: 11,
                        fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 12,
                      }}>?</button>
                    </div>
                    <div className="hero-sub">PvP rooms {"\u2022"} Custom amounts {"\u2022"} Direct payout</div>

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
                        <div className={`coin-wrapper ${wrapperClass}`}>
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
                              <div className={`result-text-new ${showResult ? "visible" : ""} ${result === "win" ? "win-text" : result === "lose" ? "lose-text" : ""}`}>
                                {result === "win" ? "YOU WON" : result === "lose" ? "YOU LOST" : ""}
                              </div>
                              <div className={`result-amount ${showResult ? "visible" : ""} ${result === "win" ? "win-amount" : result === "lose" ? "lose-amount" : ""}`}>
                                {result === "win" ? `+${lastPayout} ETH` : result === "lose" ? `-${tierEth} ETH` : ""}
                              </div>
                              {showResult && (
                                <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center", flexWrap: "wrap", animation: "fadeIn 0.4s ease 0.5s both" }}>
                                  <button className="action-btn btn-rematch" onClick={handleRematch}>
                                    {lastFlipData?.isPvP ? "Rematch" : "Flip Again"} {lastFlipData?.amount || tierEth} ETH
                                  </button>
                                  {result === "win" && (
                                    <button className="action-btn btn-double" onClick={handleDouble}>
                                      Double ({(parseFloat(lastFlipData?.amount || tierEth) * 2).toFixed(4)})
                                    </button>
                                  )}
                                  <button className="action-btn btn-change" onClick={() => {
                                    resetFlip();
                                    setShowCoinStage(false);
                                  }}>Back to lobby</button>
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

                  </div>
                </div>

                <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #f7b32b25, transparent)", margin: "0 24px" }} />

                {/* ═══ CREATE ROOM ═══ */}
                <div className="games-section" style={{ paddingTop: 20 }}>
                  <div style={{
                    padding: "16px 20px", background: "linear-gradient(135deg, #f7b32b06, #131820)",
                    borderRadius: 12, border: "1px solid #f7b32b20", marginBottom: 16,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 1.5, marginBottom: 12 }}>
                      CREATE PVP ROOM
                    </div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                      {[0.001, 0.005, 0.01, 0.05, 0.1].map(amt => (
                        <button key={amt} onClick={() => setCustomBet(amt.toString())}
                          style={{
                            padding: "7px 14px", borderRadius: 8, cursor: "pointer",
                            background: customBet === amt.toString() ? "#f7b32b15" : "#0b0e11",
                            border: "1px solid " + (customBet === amt.toString() ? "#f7b32b" : "#1c2430"),
                            color: customBet === amt.toString() ? "#f7b32b" : "#94a3b8",
                            fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                          }}
                        >{amt} ETH</button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="number" step="0.001" min="0.0005" max="1"
                        value={customBet} onChange={e => setCustomBet(e.target.value)}
                        placeholder="Custom amount"
                        style={{
                          flex: 1, padding: "10px 12px", borderRadius: 8,
                          background: "#0b0e11", border: "1px solid #1c2430",
                          color: "#e2e8f0", fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                          outline: "none",
                        }}
                      />
                      <button onClick={() => handleCreateRoom()} disabled={!connected} style={{
                        padding: "10px 24px", borderRadius: 8,
                        background: connected ? "linear-gradient(135deg, #b8860b, #f7b32b)" : "#1c2430",
                        color: "#0b0e11", fontSize: 13, fontWeight: 800,
                        border: "none", cursor: connected ? "pointer" : "not-allowed",
                        fontFamily: "'Chakra Petch', sans-serif", whiteSpace: "nowrap",
                      }}>
                        Create Room
                      </button>
                    </div>
                  </div>

                  {/* ═══ OPEN ROOMS ═══ */}
                  <div style={{ marginBottom: 16 }}>
                    {/* Your room is open banner with countdown */}
                    {myRoomId && (
                      <div style={{
                        padding: "12px 14px", marginBottom: 10, borderRadius: 8,
                        background: "#f7b32b08", border: "1px solid #f7b32b20",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#f7b32b" }}>
                            Your room is open — {customBet} ETH
                          </div>
                          <div style={{ fontSize: 9, color: "#475569" }}>
                            {roomCountdown > 0
                              ? "Auto-flip vs treasury in " + roomCountdown + "s"
                              : "Matching vs treasury..."}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#f7b32b", fontFamily: "'JetBrains Mono', monospace" }}>
                            0:{roomCountdown.toString().padStart(2, '0')}
                          </div>
                          <button onClick={() => handleCancelRoom(myRoomId)} style={{
                            padding: "6px 14px", borderRadius: 6,
                            background: "transparent", border: "1px solid #ef444450",
                            color: "#ef4444", fontSize: 10, fontWeight: 700,
                            cursor: "pointer", fontFamily: "inherit",
                          }}>Cancel</button>
                        </div>
                      </div>
                    )}
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
                        padding: 24, textAlign: "center", color: "#475569", fontSize: 12,
                        background: "#131820", borderRadius: 10, border: "1px solid #1c2430",
                      }}>
                        No open rooms — create one!
                      </div>
                    )}
                    {openRooms && openRooms.map(room => {
                      const isMine = room.creator?.toLowerCase() === address?.toLowerCase();
                      const timeAgo = Math.floor((Date.now()/1000 - room.createdAt) / 60);
                      return (
                        <div key={room.id} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "12px 14px", marginBottom: 4, borderRadius: 10,
                          background: "#131820", border: "1px solid " + (isMine ? "#f7b32b20" : "#1c2430"),
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
                            <button onClick={() => handleAccept(room.id, room.creator)} className="join-btn">Join</button>
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
                        padding: "10px 14px", marginBottom: 2, borderRadius: 8,
                        background: flip.isNew ? "#f7b32b08" : "#131820",
                        border: "1px solid " + (flip.isNew ? "#f7b32b15" : "#0e1219"),
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%",
                            background: isTrW ? "linear-gradient(135deg, #b8860b, #f7b32b)" : addrColor(flip.winner),
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 7, fontWeight: 800, color: "#fff",
                          }}>{isTrW ? "T" : flip.winner?.slice(2,4).toUpperCase()}</div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#e2e8f0" }}>
                              {isMyWin ? "You" : isTrW ? "Treasury" : shortAddr(flip.winner)}
                              <span style={{ color: "#475569", fontWeight: 400 }}> vs </span>
                              {isMyLoss ? "You" : isTrL ? "Treasury" : shortAddr(flip.loser)}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "#f7b32b" }}>
                          {parseFloat(flip.amount).toFixed(4)} ETH
                        </div>
                        <div style={{
                          padding: "3px 10px", borderRadius: 4, fontSize: 9, fontWeight: 800,
                          background: isMyWin ? "#22c55e15" : isMyLoss ? "#ef444415" : "#1c243040",
                          color: isMyWin ? "#22c55e" : isMyLoss ? "#ef4444" : "#94a3b8",
                          border: "1px solid " + (isMyWin ? "#22c55e30" : isMyLoss ? "#ef444430" : "#1c2430"),
                        }}>
                          {isMyWin ? "WON" : isMyLoss ? "LOST" : "FLIP"}
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
                        <button onClick={handleFlip} disabled={coinState !== "idle" || !connected}
                          style={{
                            padding: "8px 18px", borderRadius: 8,
                            background: "#f7b32b15", border: "1px solid #f7b32b30",
                            color: "#f7b32b", fontSize: 11, fontWeight: 700,
                            cursor: connected && coinState === "idle" ? "pointer" : "not-allowed",
                            fontFamily: "inherit", opacity: !connected || coinState !== "idle" ? 0.4 : 1,
                          }}>Flip</button>
                      </div>
                    </div>
                    {treasuryMax && (
                      <div style={{ fontSize: 9, color: "#475569", marginTop: 6 }}>
                        Treasury: {stats ? parseFloat(stats.treasury).toFixed(4) : "0"} ETH | Max bet: {parseFloat(treasuryMax).toFixed(4)} ETH
                      </div>
                    )}
                  </div>
                </div>
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
                  How we ensure every flip is fair
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Randomness source</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                    Each flip uses <code style={{ background: "#131820", padding: "2px 6px", borderRadius: 4 }}>block.prevrandao</code> combined with player addresses, timestamps,
                    and challenge IDs. The outcome is determined on-chain in the same transaction — no server, no oracle, no delay.
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Verify any flip</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                    Every flip emits a FlipResolved event on Base. You can verify any result by checking the transaction hash on BaseScan.
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Open source</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>
                    The smart contract is verified and open source.
                  </div>
                  <a href={`${EXPLORER}/address/${CONTRACT_ADDRESS}#code`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: "#f7b32b", marginTop: 8, display: "inline-block" }}>
                    View contract on BaseScan {"->"}
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: 1.5, marginBottom: 8 }}>FEE BREAKDOWN (5% of pot)</div>
                  {[
                    { label: "Seat holders", pct: "2.5%", color: "#f7b32b" },
                    { label: "Referral", pct: "1.0%", color: "#3b82f6" },
                    { label: "Protocol", pct: "0.75%", color: "#94a3b8" },
                    { label: "Token buyback", pct: "0.5%", color: "#22c55e" },
                    { label: "Jackpot pool", pct: "0.25%", color: "#ef4444" },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11 }}>
                      <span style={{ color: "#94a3b8" }}>{item.label}</span>
                      <span style={{ color: item.color, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{item.pct}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", borderTop: "1px solid #1c2430", marginTop: 4, fontSize: 11 }}>
                    <span style={{ color: "#e2e8f0", fontWeight: 700 }}>Winner receives</span>
                    <span style={{ color: "#22c55e", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>95%</span>
                  </div>
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

        {/* ═══ RIGHT — STATS ═══ */}
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
        />
      </div>

      {/* FLIP MODAL (for joining others' challenges) */}
      {flipModal && (
        <div className="flip-modal-overlay">
          <div className="flip-modal">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>COINFLIP</span>
              <button onClick={() => setFlipModal(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
            </div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "32px 28px", background: "radial-gradient(ellipse at 50% 50%, #1a1510, var(--bg-deep))",
            }}>
              {/* Player A */}
              <div style={{ textAlign: "center", width: 140 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%", margin: "0 auto 10px",
                  background: `linear-gradient(135deg, ${addrColor(flipModal.playerA)}, ${addrColor(flipModal.playerA)}88)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 700, color: "#fff",
                  border: flipModal.state !== "spinning" && flipModal.winner === flipModal.playerA ? "3px solid var(--green)" : "3px solid var(--border)",
                  boxShadow: flipModal.state !== "spinning" && flipModal.winner === flipModal.playerA ? "0 0 20px #22c55e40" : "none",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{flipModal.playerA?.slice(2, 4).toUpperCase()}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{flipModal.playerA === address ? "You" : shortAddr(flipModal.playerA)}</div>
                <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: 8, background: "var(--bg-card)", border: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: "var(--gold)" }}>{flipModal.amount} ETH</div>
              </div>

              {/* Center Coin */}
              <div style={{ width: 180, height: 180, position: "relative" }}>
                <Suspense fallback={<div style={{ width: "100%", height: "100%" }} />}>
                  <Coin3D state={flipModal.state === "spinning" ? "spinning" : flipModal.state} onComplete={() => { setTimeout(() => setFlipModal(null), 3000); }} />
                </Suspense>
              </div>

              {/* Player B */}
              <div style={{ textAlign: "center", width: 140 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%", margin: "0 auto 10px",
                  background: flipModal.playerB === "Treasury" ? "linear-gradient(135deg, var(--gold), var(--gold-dark))" : `linear-gradient(135deg, ${addrColor(flipModal.playerB)}, ${addrColor(flipModal.playerB)}88)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: flipModal.playerB === "Treasury" ? 28 : 20, fontWeight: 700, color: "#fff",
                  border: flipModal.state !== "spinning" && flipModal.winner !== flipModal.playerA ? "3px solid var(--green)" : "3px solid var(--border)",
                  boxShadow: flipModal.state !== "spinning" && flipModal.winner !== flipModal.playerA ? "0 0 20px #22c55e40" : "none",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{flipModal.playerB === "Treasury" ? "T" : flipModal.playerB?.slice(2, 4).toUpperCase() || "??"}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{flipModal.playerB === "Treasury" ? "Treasury" : shortAddr(flipModal.playerB)}</div>
                <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: 8, background: "var(--bg-card)", border: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: flipModal.playerB === "Treasury" ? "var(--gold)" : "var(--green)" }}>{flipModal.amount} ETH</div>
              </div>
            </div>

            {flipModal.state !== "spinning" && (
              <div style={{
                textAlign: "center", padding: "20px 24px",
                background: flipModal.winner === flipModal.playerA ? "linear-gradient(180deg, #22c55e10, transparent)" : "linear-gradient(180deg, #ef444410, transparent)",
              }}>
                <div style={{
                  fontSize: 14, fontWeight: 800, letterSpacing: 2,
                  color: flipModal.winner === flipModal.playerA ? "var(--green)" : "var(--red)",
                }}>
                  {flipModal.winner === flipModal.playerA
                    ? (flipModal.playerA === address ? "YOU WON!" : shortAddr(flipModal.playerA) + " WON")
                    : (flipModal.playerB === "Treasury" ? "TREASURY WON" : shortAddr(flipModal.playerB) + " WON")}
                </div>
              </div>
            )}

            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Provably Fair</div>
              {flipModal.txHash && (
                <a href={`${EXPLORER}/tx/${flipModal.txHash}`} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "var(--blue)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {flipModal.txHash.slice(0, 20)}...
                </a>
              )}
            </div>
          </div>
        </div>
      )}

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
