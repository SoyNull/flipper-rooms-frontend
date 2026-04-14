import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as THREE from "three";
import { useWallet, useFlip, useSeats, useProtocol, useToasts, addToast, EXPLORER } from "./hooks.js";
import { getPlayerInfo, getTreasuryMaxBet, getSeatInfo, decodeError } from "./contract.js";
import { CONTRACT_ADDRESS, TIERS } from "./config.js";
import { parseEther, formatEther } from "ethers";
import { playClickSound, playFlipSound, playWinSound, playLoseSound, playDepositSound, playStreakSound } from "./sounds.js";

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

/* ═══ CHAT SIDEBAR (LEFT) ═══ */
.chat-sidebar {
  display: flex; flex-direction: column; height: 100%;
  background: linear-gradient(180deg, #0d1118 0%, #0a0d13 50%, #0d1118 100%);
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
  background: linear-gradient(180deg, #0d1118 0%, #0a0d13 50%, #0d1118 100%);
  border-left: 1px solid #151b25;
  overflow-y: auto; position: relative; z-index: 1;
}
.stats-section { padding: 16px; border-bottom: 1px solid var(--border); }
.stats-label {
  font-size: 10px; font-weight: 700; color: var(--text-muted);
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
  font-size: 11px; font-weight: 700; color: var(--text-muted);
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

/* Seat detail overlay */
.seat-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.8); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  animation: fadeIn 0.3s ease;
}
.seat-modal {
  width: 400px; max-width: 95vw; background: var(--bg-card);
  border: 1px solid var(--border); border-radius: 16px; padding: 24px;
  animation: fadeInUp 0.3s ease;
}
.seat-modal-input {
  width: 100%; padding: 10px 14px; background: var(--bg-deep);
  border: 1px solid var(--border); border-radius: 8px; color: var(--text);
  font-size: 12px; font-family: 'Chakra Petch', sans-serif; outline: none;
  margin-bottom: 8px; transition: border-color 0.2s;
}
.seat-modal-input:focus { border-color: var(--gold); }
.seat-modal-btn {
  width: 100%; padding: 12px 0; border-radius: 10px; border: none;
  background: linear-gradient(135deg, #b8860b, #f7b32b);
  color: #0b0e11; font-size: 14px; font-weight: 700;
  cursor: pointer; font-family: 'Chakra Petch', sans-serif; transition: all 0.2s;
}
.seat-modal-btn:hover { filter: brightness(1.1); }
.seat-action-btn {
  width: 100%; padding: 10px 0; border-radius: 8px; font-size: 12px;
  font-weight: 700; cursor: pointer; font-family: 'Chakra Petch', sans-serif;
  transition: all 0.2s;
}

/* ═══ RESPONSIVE ═══ */
@media (max-width: 1100px) {
  .app-root { grid-template-columns: 1fr; }
  .chat-sidebar { display: none; }
  .stats-sidebar { display: none; }
}
`;

// ═══════════════════════════════════════
//  MOCK CHAT
// ═══════════════════════════════════════
const MOCK_CHAT = [
  { name: "BasedDegen", level: 12, msg: "LFG", color: "#f7b32b" },
  { name: "FlipperKing", level: 34, msg: "just hit 5x streak \u{1f525}", color: "#ffd700" },
  { name: "0xWhale", level: 8, msg: "bought seat #42", color: "#3b82f6" },
  { name: "CryptoNova", level: 21, msg: "treasury needs funding", color: "#ec4899" },
  { name: "SigmaGrind", level: 15, msg: "0.05 tier is the sweet spot", color: "#22c55e" },
  { name: "MoonBoi", level: 5, msg: "wen jackpot", color: "#14b8a6" },
  { name: "AlphaSeeker", level: 29, msg: "seat yield looking good today", color: "#f97316" },
  { name: "DegenApe", level: 7, msg: "lost 3 in a row lol", color: "#ef4444" },
  { name: "BaseMaxi", level: 18, msg: "this is the best coinflip on base", color: "#06b6d4" },
  { name: "FlipMaster", level: 44, msg: "GG everyone", color: "#b8860b" },
];

// ═══════════════════════════════════════
//  3D COIN — GOLD CASINO
// ═══════════════════════════════════════
function Coin3D({ state, onComplete }) {
  const mountRef = useRef(null);
  const sceneRef = useRef({});
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 4);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2); dir.position.set(3, 5, 4); scene.add(dir);
    const rim = new THREE.DirectionalLight(0xf7b32b, 0.5); rim.position.set(-3, -2, 3); scene.add(rim);
    const accent = new THREE.PointLight(0xffd700, 0.6, 8); accent.position.set(0, 0, 3); scene.add(accent);

    const coinGroup = new THREE.Group(); scene.add(coinGroup);
    const r = 1.1, th = 0.1, seg = 64;
    const mat = new THREE.MeshStandardMaterial({ color: 0xf7b32b, metalness: 0.92, roughness: 0.1, emissive: 0x8b6914, emissiveIntensity: 0.2 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, th, seg), mat);
    body.rotation.x = Math.PI / 2; coinGroup.add(body);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xdaa520, metalness: 0.95, roughness: 0.08 });
    coinGroup.add(new THREE.Mesh(new THREE.TorusGeometry(r, th / 2, 16, seg), edgeMat));

    const makeLabel = (text, z, flip) => {
      const c = document.createElement("canvas"); c.width = 256; c.height = 256;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#daa52050"; ctx.fillRect(0,0,256,256);
      ctx.fillStyle = "#8b6914"; ctx.font = "bold 120px 'Arial'";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, 128, 128);
      const fMat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), transparent: true, metalness: 0.6, roughness: 0.3, color: 0xdaa520 });
      const face = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, seg), fMat);
      face.position.z = z; if (flip) face.rotation.y = Math.PI; coinGroup.add(face);
    };
    makeLabel("W", th / 2 + 0.001, false);
    makeLabel("L", -(th / 2 + 0.001), true);
    coinGroup.rotation.x = 0.25;
    sceneRef.current = { scene, camera, renderer, coinGroup, phase: "idle" };

    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const s = sceneRef.current, t = performance.now() / 1000;
      if (s.phase === "idle") { s.coinGroup.rotation.y = Math.sin(t * 0.6) * 0.12; s.coinGroup.position.y = Math.sin(t * 1.0) * 0.04; }
      else if (s.phase === "spinning") {
        const el2 = t - s.startTime, spd = Math.max(0, 28 - el2 * 5);
        s.coinGroup.rotation.x += spd * 0.016;
        s.coinGroup.position.y = Math.sin(el2 * 3) * 0.12 * Math.max(0, 1 - el2 / 4);
        if (spd <= 0.3) { s.phase = "landing"; s.startTime = t; const tx = stateRef.current === "win" ? 0 : Math.PI; s.targetRotation = tx + Math.round(s.coinGroup.rotation.x / (Math.PI * 2)) * Math.PI * 2; }
      } else if (s.phase === "landing") {
        s.coinGroup.rotation.x += (s.targetRotation - s.coinGroup.rotation.x) * 0.1;
        if ((t - s.startTime) >= 0.5 && s.phase !== "done") { s.phase = "done"; onComplete?.(); }
      } else if (s.phase === "done") { s.coinGroup.position.y = Math.sin(t * 2) * 0.015; }
      renderer.render(scene, camera);
    };
    animate();
    const resizeObs = new ResizeObserver(() => {
      const nw = el.clientWidth, nh = el.clientHeight;
      if (nw && nh) { camera.aspect = nw / nh; camera.updateProjectionMatrix(); renderer.setSize(nw, nh); }
    });
    resizeObs.observe(el);
    return () => { resizeObs.disconnect(); cancelAnimationFrame(raf); renderer.dispose(); if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement); };
  }, []);

  useEffect(() => {
    if (state === "spinning") { sceneRef.current.phase = "spinning"; sceneRef.current.startTime = performance.now() / 1000; }
    else if (state === "idle") sceneRef.current.phase = "idle";
  }, [state]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%", position: "relative", zIndex: 1 }} />;
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
function ChatSidebar() {
  const [message, setMessage] = useState("");
  const timestamps = ["2m", "5m", "8m", "12m", "15m", "20m", "25m", "30m", "32m", "35m"];
  return (
    <div className="chat-sidebar">
      <div style={{ height: 2, background: "linear-gradient(90deg, transparent, #f7b32b30, transparent)" }} />
      <div style={{
        padding: "16px 18px", borderBottom: "1px solid #151b25",
        background: "#0c1019",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", letterSpacing: 0.5 }}>General Chat</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e60" }} />
            <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>24</span>
          </div>
        </div>
      </div>
      <div className="chat-messages">
        {MOCK_CHAT.map((m, i) => (
          <div className="chat-msg" key={i}>
            <div className="chat-avatar" style={{ background: `${m.color}30`, color: m.color }}>{m.name.charAt(0)}</div>
            <div className="chat-msg-content">
              <div style={{ display: "flex", alignItems: "center" }}>
                <span className="chat-name" style={{ color: m.color }}>{m.name}</span>
                <span className="chat-level">LVL {m.level}</span>
                <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: "auto", whiteSpace: "nowrap" }}>{timestamps[i] || "30m+"}</span>
              </div>
              <div className="chat-text">{m.msg}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{
        padding: "12px 16px", borderTop: "1px solid #151b25",
        background: "#0c1019",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--bg-card)", borderRadius: 10,
          border: "1px solid var(--border)", padding: "8px 12px",
        }}>
          <input type="text" value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text)", fontSize: 12, fontFamily: "inherit" }} />
          <button style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #b8860b, #f7b32b)",
            border: "none", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: 14, color: "#0b0e11",
          }}>{"\u25B6"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  STATS SIDEBAR
// ═══════════════════════════════════════
function StatsSidebar({ sessionBalance, connected, playerStats, protocolStats, treasuryMax, depositAmt, setDepositAmt, handleDeposit, handleWithdraw, isDepositing }) {
  const [activeQuick, setActiveQuick] = useState(null);
  const bal = sessionBalance || "0";
  const quickDeposits = ["0.005", "0.01", "0.05", "0.1", "MAX"];

  return (
    <div className="stats-sidebar">
      <div style={{
        padding: "20px 16px", borderBottom: "1px solid #151b25",
        borderLeft: "3px solid #f7b32b30",
        background: "linear-gradient(135deg, #f7b32b04, transparent)",
      }}>
        <div className="stats-label">Session Balance</div>
        <div style={{
          fontSize: 32, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
          color: parseFloat(bal) > 0 ? "#f7b32b" : "var(--text-muted)",
          textShadow: parseFloat(bal) > 0 ? "0 0 20px #f7b32b30" : "none",
          letterSpacing: -1, transition: "all 0.3s",
        }}>{parseFloat(bal).toFixed(4)}</div>
        <div className="balance-unit">ETH</div>
      </div>

      <div className="stats-section">
        <div className="stats-label">Quick Deposit</div>
        <div className="quick-btns" style={{ marginBottom: 12 }}>
          {quickDeposits.map((amount) => (
            <button key={amount} className={`quick-btn ${activeQuick === amount ? "active" : ""}`}
              onClick={() => { setActiveQuick(amount); setDepositAmt(amount === "MAX" ? bal : amount); }}>
              {amount}
            </button>
          ))}
        </div>
      </div>

      <div className="stats-section">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <input className="stats-input" type="number" step="0.001" value={depositAmt}
            onChange={(e) => setDepositAmt(e.target.value)} placeholder="0.00" style={{ marginBottom: 0 }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>ETH</span>
        </div>
        <div className="action-btns">
          <button className="btn-deposit" onClick={handleDeposit} disabled={isDepositing}>{isDepositing ? "..." : "\u2193 Deposit"}</button>
          <button className="btn-withdraw" onClick={handleWithdraw} disabled={isDepositing}>{isDepositing ? "..." : "\u2191 Withdraw"}</button>
        </div>
      </div>

      <div className="stats-section">
        <div className="stats-label">Protocol Stats</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { l: "Total Bets", v: protocolStats ? protocolStats.totalFlips.toLocaleString() : "0" },
            { l: "Treasury", v: protocolStats ? `${Number(protocolStats.treasury).toFixed(4)} \u039E` : "0.0000 \u039E" },
            { l: "Max Bet", v: treasuryMax ? `${parseFloat(treasuryMax).toFixed(4)} \u039E` : "0.0000 \u039E" },
            { l: "Jackpot", v: protocolStats ? `${Number(protocolStats.jackpot).toFixed(4)} \u039E` : "0.0000 \u039E" },
            { l: "Volume", v: protocolStats ? `${Number(protocolStats.totalVolume).toFixed(3)} \u039E` : "0.000 \u039E" },
          ].map((r, i) => (
            <div className="protocol-row" key={i}>
              <span className="protocol-row-label">{r.l}</span>
              <span className="protocol-row-val">{r.v}</span>
            </div>
          ))}
        </div>
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
            <div style={{
              marginTop: 12, padding: "12px 14px", borderRadius: 10,
              background: "linear-gradient(135deg, #f7b32b08, transparent)",
              borderLeft: "3px solid #f7b32b",
            }}>
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
  const [selectedDuration, setSelectedDuration] = useState(168); // hours: 7d default
  const [selectedMult, setSelectedMult] = useState(0); // 0=current, 1=1.2x, 2=2x, 3=5x

  // Fetch detailed seat info when modal opens
  useEffect(() => {
    if (!selectedSeat || !contract) { setSeatDetail(null); return; }
    getSeatInfo(contract, selectedSeat.id).then(setSeatDetail).catch(() => setSeatDetail(null));
  }, [selectedSeat, contract]);

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
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* LEFT INFO PANEL */}
      <div style={{ width: 220, minWidth: 220, padding: 16, overflowY: "auto", borderRight: "1px solid var(--border)" }}>
        <div style={{ marginBottom: 20 }}>
          <div className="stats-label">BOARD STATS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--gold)", fontFamily: "'JetBrains Mono', monospace" }}>{ownedCount}</div>
              <div style={{ fontSize: 9, color: "var(--text-muted)" }}>OWNED</div>
            </div>
            <div style={{ background: "var(--bg-card)", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", fontFamily: "'JetBrains Mono', monospace" }}>{256 - ownedCount}</div>
              <div style={{ fontSize: 9, color: "var(--text-muted)" }}>AVAILABLE</div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Floor Price</span>
            <span style={{ color: "var(--gold)", fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{floorPrice} {"\u039E"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Total Value</span>
            <span style={{ color: "var(--text)", fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{totalValue} {"\u039E"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Weekly Tax</span>
            <span style={{ color: "var(--text)", fontSize: 12, fontWeight: 600 }}>5%</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Your Seats</span>
            <span style={{ color: "var(--gold)", fontSize: 12, fontWeight: 600 }}>{seatHook.mySeats.length}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Yield Pool</span>
            <span style={{ color: "var(--green)", fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{protocolStats ? Number(protocolStats.seatPool).toFixed(4) : "0"} {"\u039E"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Est. Yield/Seat</span>
            <span style={{ color: "var(--text-dim)", fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{estYieldPerSeat} {"\u039E"}/wk</span>
          </div>
        </div>

        <div>
          <div className="stats-label">TOP TILE HOLDERS</div>
          {topHolders.length === 0 && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No seats owned yet</div>}
          {topHolders.map((h, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", width: 18 }}>{i + 1}</span>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: addrColor(h.address),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, fontWeight: 700, color: "#fff",
              }}>{h.address.slice(2, 4).toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{shortAddr(h.address)}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)", fontFamily: "'JetBrains Mono', monospace" }}>{h.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CENTER GRID 16x16 */}
      <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
        {seatHook.seats.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>256 Revenue Seats</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 20 }}>Harberger-taxed seats. Earn from every flip.</div>
            <button className="seat-modal-btn" style={{ width: "auto", padding: "10px 24px" }}
              onClick={() => seatHook.refreshSeats()}>
              {seatHook.loading ? "Loading..." : "Load Board"}
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(16, 1fr)", gap: 3 }}>
            {seatHook.seats.map(seat => {
              const isOwned = seat.active && seat.owner !== ZERO_ADDRESS;
              const isMine = isOwned && address && seat.owner.toLowerCase() === address.toLowerCase();
              return (
                <div key={seat.id}
                  onClick={() => { setSelectedSeat(seat); playClickSound(); }}
                  style={{
                    aspectRatio: "1", borderRadius: 6, cursor: "pointer", position: "relative",
                    overflow: "hidden", transition: "all 0.2s",
                    border: `2px solid ${isMine ? "var(--gold)" : isOwned ? "#22c55e30" : "var(--border)"}`,
                    background: isOwned ? `linear-gradient(135deg, ${addrColor(seat.owner)}15, var(--bg-card))` : "var(--bg-main)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.boxShadow = "0 0 10px #f7b32b20"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = isMine ? "var(--gold)" : isOwned ? "#22c55e30" : "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  {isOwned && (
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%", marginBottom: 2,
                      background: `linear-gradient(135deg, ${addrColor(seat.owner)}, ${addrColor(seat.owner)}88)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 8, fontWeight: 700, color: "#fff",
                    }}>{seat.owner.slice(2, 4).toUpperCase()}</div>
                  )}
                  <div style={{ fontSize: 8, color: "var(--text-muted)", fontWeight: 600 }}>#{seat.id}</div>
                  {isOwned && (
                    <div style={{
                      position: "absolute", bottom: 2, left: 0, right: 0,
                      textAlign: "center", fontSize: 8, fontWeight: 700,
                      color: "var(--gold)", fontFamily: "'JetBrains Mono', monospace",
                      background: "#0b0e11cc", padding: "1px 0",
                    }}>{parseFloat(seat.price).toFixed(4)}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RIGHT PANEL — ACTIVITY FEED */}
      <div style={{ width: 220, minWidth: 220, padding: 16, overflowY: "auto", borderLeft: "1px solid var(--border)" }}>
        <div className="stats-label">RECENT ACTIVITY</div>
        {recentActivity.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>No recent activity</div>
        )}
        {recentActivity.map((a, i) => (
          <div key={i} style={{
            padding: "10px 0", borderBottom: "1px solid var(--border)",
            animation: i < 3 ? "fadeInUp 0.3s ease" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%",
                background: addrColor(a.newOwner),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 7, fontWeight: 700, color: "#fff",
              }}>{a.newOwner.slice(2, 4).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{shortAddr(a.newOwner)}</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {a.prevOwner === ZERO_ADDRESS ? "Claimed" : "Bought"} #{a.seatId}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--gold)", fontFamily: "'JetBrains Mono', monospace" }}>
                {parseFloat(a.price).toFixed(4)} {"\u039E"}
              </span>
            </div>
          </div>
        ))}

        {/* My Seats section */}
        {connected && seatHook.mySeats.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="stats-label">YOUR SEATS</div>
            {seatHook.mySeats.map(seatId => {
              const seat = seatHook.seats.find(s => s.id === seatId);
              if (!seat) return null;
              return (
                <div key={seatId}
                  onClick={() => { setSelectedSeat(seat); playClickSound(); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 10px", marginBottom: 4, borderRadius: 8, cursor: "pointer",
                    background: "var(--bg-card)", border: "1px solid #f7b32b20",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: `linear-gradient(135deg, var(--gold), var(--gold-dark))`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 8, fontWeight: 700, color: "#0b0e11",
                    }}>#{seatId}</div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{seat.name || `Seat #${seatId}`}</span>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--gold)", fontFamily: "'JetBrains Mono', monospace" }}>
                    {parseFloat(seat.price).toFixed(3)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SEAT DETAIL MODAL */}
      {selectedSeat && (
        <div className="seat-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedSeat(null); }}>
          <div className="seat-modal">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <span style={{ fontSize: 20, fontWeight: 800 }}>Seat #{selectedSeat.id}</span>
              <button onClick={() => setSelectedSeat(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
            </div>

            {/* Avatar */}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%", margin: "0 auto 8px",
                background: selectedSeat.active ? addrColor(selectedSeat.owner) : "var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 700, color: "#fff",
              }}>{selectedSeat.active ? selectedSeat.owner.slice(2, 4).toUpperCase() : "?"}</div>
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
                {selectedSeat.active ? shortAddr(selectedSeat.owner) : "Available"}
              </div>
              {selectedSeat.name && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{selectedSeat.name}</div>}
            </div>

            {/* Info rows — enriched with getSeatInfo data */}
            <div style={{ marginBottom: 20 }}>
              {[
                { l: "Price", v: `${parseFloat(seatDetail?.price || selectedSeat.price).toFixed(4)} ETH`, c: "var(--gold)" },
                { l: "Deposit", v: `${parseFloat(seatDetail?.deposit || selectedSeat.deposit).toFixed(4)} ETH`, c: "var(--text-dim)" },
                ...(seatDetail ? [
                  { l: "Rewards", v: `${parseFloat(seatDetail.rewards).toFixed(4)} ETH`, c: "var(--green)" },
                  { l: "Total Earned", v: `${parseFloat(seatDetail.earned).toFixed(4)} ETH`, c: "var(--gold)" },
                  { l: "Pending Tax", v: `${parseFloat(seatDetail.pendingTax).toFixed(4)} ETH`, c: "var(--red)" },
                  { l: "Runway", v: seatDetail.runway > 0 ? `${Math.floor(seatDetail.runway / 86400)}d ${Math.floor((seatDetail.runway % 86400) / 3600)}h` : "\u2014", c: "var(--text-dim)" },
                ] : []),
                { l: "Name", v: (seatDetail?.name || selectedSeat.name) || "\u2014", c: "var(--text-dim)" },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1f293740" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{r.l}</span>
                  <span style={{ color: r.c, fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{r.v}</span>
                </div>
              ))}
            </div>

            {/* Yield estimate */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: "#22c55e08", border: "1px solid #22c55e15", marginBottom: 16 }}>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Est. Yield</span>
              <span style={{ color: "var(--green)", fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>+{estYieldPerSeat} ETH/wk</span>
            </div>

            {/* Actions based on ownership */}
            {!connected ? (
              <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-dim)" }}>Connect wallet to interact</div>
            ) : !selectedSeat.active ? (
              /* CLAIM empty seat */
              <div>
                <input className="seat-modal-input" placeholder="Seat name (optional)" maxLength={32}
                  value={seatBuyName} onChange={e => setSeatBuyName(e.target.value)} />
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>Deposit duration</div>
                <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                  {[{l:"1d",h:24},{l:"7d",h:168},{l:"30d",h:720}].map(d => (
                    <button key={d.h} onClick={() => setSelectedDuration(d.h)} style={{
                      flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      background: selectedDuration === d.h ? "#f7b32b20" : "var(--bg-deep)",
                      border: `1px solid ${selectedDuration === d.h ? "#f7b32b40" : "var(--border)"}`,
                      color: selectedDuration === d.h ? "#f7b32b" : "var(--text-muted)",
                      fontFamily: "inherit",
                    }}>{d.l}</button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>
                  Cost: 0.001 ETH (base) + {(0.001 * 0.05 * selectedDuration / 168).toFixed(4)} ETH (deposit)
                </div>
                <button className="seat-modal-btn" onClick={async () => {
                  try {
                    const depositWei = parseEther((0.001 * 0.05 * selectedDuration / 168).toFixed(6));
                    const basePrice = parseEther("0.001");
                    const totalVal = basePrice + depositWei;
                    const tx = await contract.buySeat(selectedSeat.id, basePrice, seatBuyName, 0, { value: totalVal });
                    await tx.wait();
                    addToast("success", `Claimed Seat #${selectedSeat.id}!`);
                    setSelectedSeat(null); setSeatBuyName(""); seatHook.refreshSeats();
                  } catch (err) { addToast("error", decodeError(err)); }
                }}>CLAIM SEAT</button>
              </div>
            ) : selectedSeat.owner?.toLowerCase() === address?.toLowerCase() ? (
              /* YOUR seat — manage */
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="seat-action-btn" style={{ background: "#22c55e20", border: "1px solid #22c55e40", color: "var(--green)" }}
                  onClick={async () => {
                    try {
                      const tx = await contract.claimSeatRewards(selectedSeat.id);
                      await tx.wait();
                      addToast("success", "Rewards claimed!");
                      refreshBalance(); seatHook.refreshSeats();
                    } catch (err) { addToast("error", decodeError(err)); }
                  }}>
                  CLAIM REWARDS {seatDetail?.rewards && parseFloat(seatDetail.rewards) > 0 ? `(${parseFloat(seatDetail.rewards).toFixed(4)} ETH)` : ""}
                </button>
                <button className="seat-action-btn" style={{ background: "transparent", border: "1px solid var(--red)", color: "var(--red)" }}
                  onClick={async () => {
                    try {
                      const tx = await contract.abandonSeat(selectedSeat.id);
                      await tx.wait();
                      addToast("success", "Seat abandoned");
                      setSelectedSeat(null); seatHook.refreshSeats(); refreshBalance();
                    } catch (err) { addToast("error", decodeError(err)); }
                  }}>
                  ABANDON SEAT
                </button>
                <button className="seat-action-btn" style={{ background: "#f7b32b20", border: "1px solid #f7b32b40", color: "var(--gold)" }}
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}?ref=${selectedSeat.id}`);
                    addToast("success", "Referral link copied!");
                  }}>
                  COPY REF LINK
                </button>
              </div>
            ) : (
              /* Someone else's seat — BUYOUT */
              <div>
                {/* Price multiplier selector */}
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>New price</div>
                <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                  {[{l:"Current",i:0},{l:"1.2x",i:1},{l:"2x",i:2},{l:"5x",i:3}].map(m => (
                    <button key={m.i} onClick={() => setSelectedMult(m.i)} style={{
                      flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      background: selectedMult === m.i ? "#f7b32b20" : "var(--bg-deep)",
                      border: `1px solid ${selectedMult === m.i ? "#f7b32b40" : "var(--border)"}`,
                      color: selectedMult === m.i ? "#f7b32b" : "var(--text-muted)",
                      fontFamily: "inherit",
                    }}>{m.l}</button>
                  ))}
                </div>

                {/* Duration selector */}
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>Deposit duration</div>
                <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                  {[{l:"1d",h:24},{l:"7d",h:168},{l:"30d",h:720}].map(d => (
                    <button key={d.h} onClick={() => setSelectedDuration(d.h)} style={{
                      flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      background: selectedDuration === d.h ? "#f7b32b20" : "var(--bg-deep)",
                      border: `1px solid ${selectedDuration === d.h ? "#f7b32b40" : "var(--border)"}`,
                      color: selectedDuration === d.h ? "#f7b32b" : "var(--text-muted)",
                      fontFamily: "inherit",
                    }}>{d.l}</button>
                  ))}
                </div>

                {/* Cost breakdown */}
                {buyoutCalc && (
                  <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: "var(--bg-deep)", border: "1px solid var(--border)" }}>
                    {[
                      { l: "Buyout price", v: formatEther(buyoutCalc.buyoutPrice) },
                      { l: "New price", v: formatEther(buyoutCalc.newPrice) },
                      { l: "Tax deposit", v: formatEther(buyoutCalc.deposit) },
                    ].map((r, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 10 }}>
                        <span style={{ color: "var(--text-muted)" }}>{r.l}</span>
                        <span style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>{parseFloat(r.v).toFixed(4)} ETH</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0 0", borderTop: "1px solid var(--border)", marginTop: 4, fontSize: 11 }}>
                      <span style={{ color: "var(--text)", fontWeight: 700 }}>Total from wallet</span>
                      <span style={{ color: "var(--gold)", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{formatEther(buyoutCalc.totalVal)} ETH</span>
                    </div>
                  </div>
                )}

                <button className="seat-modal-btn" onClick={async () => {
                  if (!buyoutCalc) return;
                  try {
                    const maxPrice = buyoutCalc.buyoutPrice + buyoutCalc.buyoutPrice / 10n;
                    const tx = await contract.buySeat(selectedSeat.id, buyoutCalc.newPrice, "", maxPrice, { value: buyoutCalc.totalVal });
                    await tx.wait();
                    addToast("success", `Bought Seat #${selectedSeat.id}!`);
                    setSelectedSeat(null); seatHook.refreshSeats(); refreshBalance();
                  } catch (err) { addToast("error", decodeError(err)); }
                }}>BUY SEAT {"\u00B7"} {buyoutCalc ? formatEther(buyoutCalc.totalVal) : "..."} ETH</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════
export default function FlipperRooms() {
  const wallet = useWallet();
  const { connected, address, contract, connect, disconnect, sessionBalance, refreshBalance, ready, isEmbedded } = wallet;
  const flipHook = useFlip(contract, address, refreshBalance);
  const seatHook = useSeats(contract, address, refreshBalance);
  const protocol = useProtocol(contract);
  const { toasts, remove: removeToastFn } = useToasts();

  const [view, setView] = useState("flip");
  const [tier, setTier] = useState(1);
  const [depositAmt, setDepositAmt] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [playerStats, setPlayerStats] = useState(null);
  const [flipModal, setFlipModal] = useState(null);
  const [treasuryMax, setTreasuryMax] = useState(null);
  const referral = useRef(getReferralFromUrl()).current;

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
  const forceFlipRef = useRef(false);

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

  // Auto-trigger flip after reset from Rematch/Double
  useEffect(() => {
    if (forceFlipRef.current && coinState === "idle" && !showResult) {
      forceFlipRef.current = false;
      handleFlip();
    }
  }, [coinState, showResult]);

  // ═══ FLIP VS TREASURY — SINGLE TX ═══
  const handleFlip = async () => {
    if (!contract || !connected || coinState !== "idle") return;
    playClickSound();

    const tierWei = TIERS[tier].wei;
    const tierEthVal = TIERS[tier].label;
    const ref = parseInt(localStorage.getItem('flipper_ref')) || referral;

    if (parseFloat(sessionBalance) < parseFloat(tierEthVal)) {
      addToast("error", "Insufficient balance. Deposit more ETH.");
      return;
    }

    if (isEmbedded) {
      setCoinState("spinning");
      setBorderState("spinning");
      spinStartRef.current = Date.now();
      playFlipSound();
    } else {
      setWaitingConfirm(true);
    }

    try {
      const tx = await contract.flipVsTreasury(tierWei, ref);

      if (!isEmbedded) {
        setWaitingConfirm(false);
        setCoinState("spinning");
        setBorderState("spinning");
        spinStartRef.current = Date.now();
        playFlipSound();
      }

      const receipt = await tx.wait();

      let won = false;
      let payoutStr = "0";
      let amountStr = tierEthVal;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
          if (parsed?.name === "FlipResolved") {
            won = parsed.args.winner?.toLowerCase() === address?.toLowerCase();
            payoutStr = formatEther(parsed.args.payout);
            amountStr = formatEther(parsed.args.amount);
            break;
          }
        } catch {}
      }

      // Ensure border spins for at least 3 seconds
      const elapsed = Date.now() - spinStartRef.current;
      const extraWait = Math.max(0, 3000 - elapsed);

      setTimeout(() => {
        pendingResultRef.current = { won, payout: payoutStr, amount: amountStr };
        setCoinState(won ? "win" : "lose");
        // Border crossfade slightly after coin starts landing
        setTimeout(() => setBorderState(won ? "win" : "lose"), 500);
      }, extraWait);

    } catch (err) {
      setCoinState("idle");
      setBorderState("idle");
      setWaitingConfirm(false);
      const msg = decodeError(err);
      if (msg.includes("TreasuryBetTooHigh") || msg.includes("treasury") || msg.includes("Treasury")) {
        addToast("error", "Treasury can't cover this bet. Try a smaller tier.");
      } else {
        addToast("error", msg);
      }
    }
  };

  // ═══ CREATE PVP CHALLENGE — SINGLE TX ═══
  const handleCreatePvp = async () => {
    if (!contract || !connected || coinState !== "idle") return;
    playClickSound();

    const tierWei = TIERS[tier].wei;
    const tierEthVal = TIERS[tier].label;
    const ref = parseInt(localStorage.getItem('flipper_ref')) || referral;

    if (parseFloat(sessionBalance) < parseFloat(tierEthVal)) {
      addToast("error", "Insufficient balance. Deposit more ETH.");
      return;
    }

    try {
      const tx = await contract.createChallenge(tierWei, ref);
      await tx.wait();
      addToast("success", "PVP challenge created! Waiting for opponent...");
      flipHook.refreshChallenges();
      refreshBalance();
    } catch (err) {
      addToast("error", decodeError(err));
    }
  };

  // ═══ ACCEPT CHALLENGE — SINGLE TX ═══
  const handleAccept = async (challengeId, creatorAddr) => {
    if (coinState !== "idle" || !connected) return;
    playClickSound();

    const c = flipHook.challenges.find(ch => ch.id === challengeId);
    const amt = c ? c.amount : "?";

    try {
      const ref = parseInt(localStorage.getItem('flipper_ref')) || referral;

      if (isEmbedded) {
        setCoinState("spinning");
        setBorderState("spinning");
        spinStartRef.current = Date.now();
        playFlipSound();
        setFlipModal({ playerA: address, playerB: creatorAddr || "Opponent", amount: amt, state: "spinning", winner: null, txHash: null });
      } else {
        setWaitingConfirm(true);
      }

      const tx = await contract.acceptChallenge(challengeId, ref);

      if (!isEmbedded) {
        setWaitingConfirm(false);
        setCoinState("spinning");
        setBorderState("spinning");
        spinStartRef.current = Date.now();
        playFlipSound();
        setFlipModal({ playerA: address, playerB: creatorAddr || "Opponent", amount: amt, state: "spinning", winner: null, txHash: null });
      }

      const receipt = await tx.wait();

      let won = false;
      let payoutStr = "0";
      let txHash = receipt.hash;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
          if (parsed?.name === "FlipResolved") {
            won = parsed.args.winner?.toLowerCase() === address?.toLowerCase();
            payoutStr = formatEther(parsed.args.payout);
            break;
          }
        } catch {}
      }

      const elapsed = Date.now() - spinStartRef.current;
      const extraWait = Math.max(0, 3000 - elapsed);

      setTimeout(() => {
        pendingResultRef.current = {
          won, payout: payoutStr, amount: amt,
          flipModalUpdate: { state: won ? "win" : "lose", winner: won ? address : creatorAddr, txHash },
        };
        flipHook.refreshChallenges();
        setCoinState(won ? "win" : "lose");
        setTimeout(() => setBorderState(won ? "win" : "lose"), 500);
      }, extraWait);

    } catch (err) {
      setCoinState("idle");
      setBorderState("idle");
      setFlipModal(null);
      addToast("error", decodeError(err));
    }
  };

  const handleDeposit = async () => {
    if (!depositAmt || !contract || isDepositing) return;
    setIsDepositing(true); playClickSound();
    try {
      const tx = await contract.deposit({ value: parseEther(depositAmt) });
      await tx.wait(); playDepositSound();
      addToast("success", `Deposited ${depositAmt} ETH`);
      setDepositAmt(""); refreshBalance();
    } catch (err) { addToast("error", decodeError(err)); }
    setIsDepositing(false);
  };

  const handleWithdraw = async () => {
    if (!depositAmt || !contract || isDepositing) return;
    setIsDepositing(true);
    try {
      const tx = await contract.withdraw(parseEther(depositAmt));
      await tx.wait();
      addToast("success", `Withdrew ${depositAmt} ETH`);
      setDepositAmt(""); refreshBalance();
    } catch (err) { addToast("error", decodeError(err)); }
    setIsDepositing(false);
  };

  const stats = protocol.stats;
  const tierEth = TIERS[tier]?.label || "0.005";

  return (
    <>
      <style>{CSS}</style>
      <div className="app-root">

        {/* ═══ LEFT — CHAT ═══ */}
        <ChatSidebar />

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
            </div>
            <div className="header-right">
              {connected ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {isEmbedded && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: "#f7b32b20", color: "var(--gold)", letterSpacing: 0.5 }}>{"\u26A1"} INSTANT</span>
                  )}
                  <div className="addr-pill" onClick={disconnect}>{shortAddr(address)}</div>
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
          {flipHook.history && flipHook.history.length > 0 && (
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
                animation: flipHook.history.length > 5 ? "scrollTicker 30s linear infinite" : "none",
                paddingLeft: 50,
              }}>
                {[...(flipHook.history || []), ...(flipHook.history || [])].slice(0, 40).map((h, i) => {
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
                    <div className="hero-title-text">COINFLIP</div>
                    <div className="hero-sub">50/50 chance {"\u2022"} Instant results {"\u2022"} Provably fair</div>

                    <div className="tier-bar" ref={tierBarRef}>
                      {TIERS.map((t, i) => (
                        <button key={i} className={`tier-btn ${tier === i ? "active" : ""}`}
                          onClick={() => { setTier(i); playClickSound(); }}>
                          {t.label} ETH
                        </button>
                      ))}
                    </div>

                    {/* ═══ DUEL COIN STAGE ═══ */}
                    {(() => {
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
                      const prizeText = showResult
                        ? (result === "win" ? `+${lastPayout} ETH` : `-${tierEth} ETH`)
                        : `${(parseFloat(tierEth) * 2).toFixed(4)} ETH`;
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
                                <div className={`arena-bet ${b1Class}`}>{tierEth} ETH</div>
                              </div>

                              {/* VS + Coin */}
                              <div className="vs-area">
                                <div className="vs-text">VS</div>
                                <div className="coin-3d-container">
                                  <Coin3D state={coinState} onComplete={onFlipDone} />
                                </div>
                                <div className="prize-pool">
                                  <div className="prize-label">PRIZE POOL</div>
                                  <div className={`prize-value ${prizeClass}`}>{prizeText}</div>
                                </div>
                              </div>

                              {/* Opponent */}
                              <div className={`arena-player ${p2Class}`}>
                                <div className={`arena-avatar avatar-opp ${a2Class}`}>TR</div>
                                <div className={`arena-name ${n2Class}`}>Treasury</div>
                                <div className={`arena-bet ${b2Class}`}>{tierEth} ETH</div>
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
                                <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center", animation: "fadeIn 0.4s ease 0.5s both" }}>
                                  <button className="action-btn btn-rematch" onClick={() => {
                                    if (!isEmbedded) addToast("info", "Use email login for instant flips");
                                    resetFlip();
                                    forceFlipRef.current = true;
                                  }}>Rematch</button>
                                  {result === "win" && (
                                    <button className="action-btn btn-double" onClick={() => {
                                      setTier(prev => Math.min(TIERS.length - 1, prev + 1));
                                      resetFlip();
                                      forceFlipRef.current = true;
                                    }}>Double or nothing</button>
                                  )}
                                  <button className="action-btn btn-change" onClick={resetFlip}>New bet</button>
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

                    {/* FLIP BUTTON / CONNECT */}
                    {!connected ? (
                      <button className="connect-btn" onClick={connect} style={{ padding: "18px 48px", fontSize: 18, borderRadius: 14 }}>
                        Connect Wallet
                      </button>
                    ) : !showResult && (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%", maxWidth: 500, margin: "0 auto" }}>
                        <button className="flip-btn-main"
                          disabled={coinState !== "idle"}
                          onClick={handleFlip}
                          style={{ maxWidth: 500 }}>
                          <div style={{ position: "relative", zIndex: 1 }}>
                            FLIP NOW
                            <div className="flip-sub">{tierEth} ETH {"\u00B7"} 2x Payout</div>
                          </div>
                        </button>
                        <button
                          disabled={coinState !== "idle"}
                          onClick={handleCreatePvp}
                          style={{
                            width: "100%", padding: "12px 0", borderRadius: 10,
                            background: "transparent", border: "1px solid var(--border)",
                            color: "var(--text-dim)", fontSize: 13, fontWeight: 600,
                            cursor: coinState !== "idle" ? "not-allowed" : "pointer",
                            fontFamily: "inherit", transition: "all 0.2s",
                            opacity: coinState !== "idle" ? 0.4 : 1,
                          }}
                        >
                          Create PVP Challenge
                        </button>
                        {!isEmbedded && (
                          <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginTop: 2 }}>
                            Using external wallet {"\u2014"} each flip requires approval.
                            <span onClick={() => { disconnect(); setTimeout(connect, 500); }}
                              style={{ color: "var(--gold)", cursor: "pointer", marginLeft: 4 }}>
                              Switch to Instant Play {"\u2192"}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {connected && parseFloat(sessionBalance || "0") === 0 && !showResult && (
                      <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-dim)" }}>
                        Deposit ETH using the panel on the right to start flipping
                      </div>
                    )}

                    {treasuryMax && parseFloat(tierEth) > parseFloat(treasuryMax) && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "var(--gold)" }}>
                        Treasury max bet is {parseFloat(treasuryMax).toFixed(4)} ETH
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #f7b32b25, transparent)", margin: "0 24px" }} />

                {/* All Games */}
                <div className="games-section" style={{ paddingTop: 20 }}>
                  <div className="games-header">
                    <h2>ALL GAMES</h2>
                    <span className="games-count">{flipHook.challenges.length} active</span>
                  </div>

                  {flipHook.challenges.length === 0 && (
                    <div className="empty-state">
                      <div style={{ fontSize: 32, marginBottom: 8 }}>{"\u26A1"}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>No open games</div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Be the first {"\u2014"} hit FLIP NOW to start</div>
                    </div>
                  )}

                  {flipHook.challenges.map(c => {
                    const isMine = c.creator?.toLowerCase() === address?.toLowerCase();
                    return (
                      <div className="game-row" key={c.id}>
                        <div className="game-players">
                          <GameAvatar address={c.creator} />
                          <span className="game-vs">VS</span>
                          <div className="game-avatar-empty">?</div>
                        </div>
                        <div className="game-amount">
                          <div className="game-amount-val">{c.amount} ETH</div>
                          <div className="game-amount-prize">Prize: {(parseFloat(c.amount) * 2).toFixed(3)} ETH</div>
                        </div>
                        <div className="game-actions">
                          {isMine ? (
                            <span className="game-status status-searching">WAITING</span>
                          ) : (
                            <span className="game-status status-open">JOINABLE</span>
                          )}
                          {isMine
                            ? <button className="cancel-btn" onClick={() => { playClickSound(); flipHook.cancelCh(c.id); }}>Cancel</button>
                            : <button className="join-btn" onClick={() => handleAccept(c.id, c.creator)}>Join</button>
                          }
                        </div>
                      </div>
                    );
                  })}

                  {/* Recent Flips */}
                  <div className="section-label" style={{ marginTop: 24 }}>RECENT FLIPS</div>
                  {flipHook.history.length === 0 && <div className="empty-state">No recent flips yet</div>}
                  {flipHook.history.slice(0, 8).map((h, i) => {
                    const won = address ? h.winner.toLowerCase() === address.toLowerCase() : null;
                    const isTreasuryW = h.winner?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase();
                    const isTreasuryL = h.loser?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase();
                    return (
                      <div className="game-row" key={i}>
                        <div className="game-players">
                          {isTreasuryW ? (
                            <div className="game-avatar" style={{ width: 32, height: 32, background: "linear-gradient(135deg, var(--gold), var(--gold-dark))", fontSize: 14 }}>TR</div>
                          ) : (
                            <GameAvatar address={h.winner} size={32} />
                          )}
                          <span className="game-vs">VS</span>
                          {isTreasuryL ? (
                            <div className="game-avatar" style={{ width: 32, height: 32, background: "linear-gradient(135deg, var(--gold), var(--gold-dark))", fontSize: 14 }}>TR</div>
                          ) : (
                            <GameAvatar address={h.loser} size={32} />
                          )}
                        </div>
                        <div className="game-amount">
                          <div className="game-amount-val" style={{ fontSize: 14 }}>{h.amount} ETH</div>
                          {h.winnerStreak > 1 && <div style={{ fontSize: 10, color: "var(--gold)", fontFamily: "'JetBrains Mono', monospace" }}>{h.winnerStreak}x streak</div>}
                        </div>
                        <div className="game-actions">
                          {won === null ? (
                            <span className="game-status" style={{ background: "#f7b32b18", color: "var(--gold)", border: "1px solid #f7b32b30" }}>FLIP</span>
                          ) : won ? (
                            <span className="game-status" style={{ background: "#22c55e18", color: "var(--green)", border: "1px solid #22c55e30" }}>WON</span>
                          ) : (
                            <span className="game-status" style={{ background: "#ef444418", color: "var(--red)", border: "1px solid #ef444430" }}>LOST</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
              <div className="fair-section">
                <div className="section-label" style={{ color: "var(--gold)", fontSize: 12, letterSpacing: 4 }}>PROVABLY FAIR</div>
                <div className="hero-title-text" style={{ fontSize: 36, marginBottom: 16 }}>FAIRNESS</div>
                <p>
                  Every flip uses on-chain randomness via <code style={{ background: "var(--bg-card)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>block.prevrandao</code> combined with player addresses, timestamps, and counters.
                </p>
                <div className="fair-code">
                  <span style={{ color: "var(--green)" }}>// on-chain resolution</span><br />
                  rand = keccak256(abi.encodePacked(<br />
                  &nbsp;&nbsp;block.prevrandao, playerA, playerB,<br />
                  &nbsp;&nbsp;block.timestamp, challengeId, totalFlips<br />
                  ));<br />
                  winner = (rand % 2 == 0) ? playerA : playerB;
                </div>
                <div className="section-label" style={{ marginTop: 24 }}>Fee Breakdown (5% total)</div>
                <div className="fee-grid">
                  {[
                    { l: "Seat Pool", v: "2.5%", c: "var(--green)" },
                    { l: "Referral", v: "1.0%", c: "var(--gold)" },
                    { l: "Protocol", v: "0.75%", c: "var(--gold)" },
                    { l: "Buyback", v: "0.5%", c: "#f97316" },
                    { l: "Jackpot", v: "0.25%", c: "var(--red)" },
                  ].map((f, i) => (
                    <div className="fee-item" key={i}>
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{f.l}</span>
                      <span style={{ color: f.c, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{f.v}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16 }}>
                  Verify on <a href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer" style={{ color: "var(--gold)" }}>BaseScan</a>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT — STATS ═══ */}
        <StatsSidebar
          sessionBalance={sessionBalance}
          connected={connected}
          playerStats={playerStats}
          protocolStats={stats}
          treasuryMax={treasuryMax}
          depositAmt={depositAmt}
          setDepositAmt={setDepositAmt}
          handleDeposit={handleDeposit}
          handleWithdraw={handleWithdraw}
          isDepositing={isDepositing}
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
                <Coin3D state={flipModal.state === "spinning" ? "spinning" : flipModal.state} onComplete={() => { setTimeout(() => setFlipModal(null), 3000); }} />
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
