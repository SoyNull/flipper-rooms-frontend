import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { useWallet, useFlip, useSeats, useProtocol, useToasts, addToast, EXPLORER } from "./hooks.js";
import { getOpenChallenges, getChallengeInfo, getPlayerInfo, getTreasuryMaxBet, decodeError } from "./contract.js";
import { CONTRACT_ADDRESS, TIERS } from "./config.js";
import { parseEther, formatEther } from "ethers";
import { playClickSound, playFlipSound, playWinSound, playLoseSound, playDepositSound, playStreakSound } from "./sounds.js";

function getReferralFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    return ref ? parseInt(ref, 10) || 0 : 0;
  } catch { return 0; }
}

const shortAddr = (a) => a ? `${a.slice(0,6)}...${a.slice(-4)}` : "???";
const addrColor = (a) => {
  if (!a) return "#444";
  const h = parseInt(a.slice(2,8), 16);
  const hue = h % 360;
  return `hsl(${hue}, 60%, 55%)`;
};

// ═══════════════════════════════════════
//  CASINO CSS — No Tailwind
// ═══════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

:root {
  --bg-deep: #0b0e11;
  --bg-main: #0f1318;
  --bg-card: #151a22;
  --bg-card-hover: #1c232e;
  --bg-elevated: #1f2937;
  --border: #1f2937;
  --border-light: #2d3748;

  --gold: #f7b32b;
  --gold-bright: #ffd700;
  --gold-glow: #f7b32b50;
  --gold-dark: #b8860b;

  --green: #22c55e;
  --green-glow: #22c55e40;
  --red: #ef4444;
  --red-glow: #ef444440;

  --blue: #3b82f6;
  --teal: #14b8a6;

  --text: #f1f5f9;
  --text-dim: #94a3b8;
  --text-muted: #475569;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg-deep); color: var(--text); font-family: 'Outfit', sans-serif; }
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
@keyframes confetti { 0% { transform: translateY(0) rotate(0); opacity: 1; } 100% { transform: translateY(300px) rotate(720deg); opacity: 0; } }
@keyframes shimmer-btn {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ═══ 3-COLUMN LAYOUT ═══ */
.app-root {
  height: 100vh; width: 100vw; overflow: hidden;
  display: grid;
  grid-template-columns: 280px 1fr 300px;
  background:
    radial-gradient(ellipse at 15% 50%, #f7b32b08 0%, transparent 40%),
    radial-gradient(ellipse at 85% 20%, #22c55e06 0%, transparent 35%),
    radial-gradient(ellipse at 50% 90%, #ef444406 0%, transparent 30%),
    var(--bg-deep);
}

/* ═══ CHAT SIDEBAR (LEFT) ═══ */
.chat-sidebar {
  display: flex; flex-direction: column; height: 100%;
  background: var(--bg-card); border-right: 1px solid var(--border);
}
.chat-header {
  padding: 16px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 8px;
}
.chat-header h2 { font-size: 14px; font-weight: 700; color: var(--text); }
.online-badge { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-dim); }
.online-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px #22c55e60; animation: blink 2s infinite; }

.chat-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.chat-msg { display: flex; align-items: flex-start; gap: 8px; }
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
  font-size: 12px; color: var(--text); font-family: 'Outfit', sans-serif;
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
.logo-text { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; }
.logo-gold { color: var(--gold); text-shadow: 0 0 30px #f7b32b40; }
.logo-dim { color: var(--text-muted); }
.logo-badge {
  font-size: 8px; font-weight: 800; letter-spacing: 1.5px; padding: 3px 8px;
  border-radius: 4px; background: #3b82f615; color: var(--blue); border: 1px solid #3b82f630;
}
.nav { display: flex; gap: 4px; }
.nav-btn {
  padding: 8px 18px; border: none; background: none; color: var(--text-dim);
  font-size: 13px; font-weight: 600; font-family: 'Outfit', sans-serif;
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
  font-weight: 700; font-family: 'Outfit', sans-serif; cursor: pointer;
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
.hero-title {
  font-size: 48px; font-weight: 900; letter-spacing: -2px; margin-bottom: 4px;
  background: linear-gradient(90deg, #f1f5f9, #f7b32b, #ffd700, #f1f5f9);
  background-size: 400% 100%;
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  animation: shimmer 6s linear infinite;
}
.hero-sub { color: var(--text-dim); font-size: 13px; margin-bottom: 24px; }

/* Coin stage */
.coin-stage {
  position: relative; width: 200px; height: 200px; margin: 0 auto 24px;
}
.coin-stage-glow {
  position: absolute; inset: 0; border-radius: 50%;
  background: radial-gradient(circle, #f7b32b30 0%, transparent 70%);
  animation: coinGlow 2.5s ease infinite; pointer-events: none;
}
.coin-orbiter {
  position: absolute; inset: 0;
}
.coin-orbiter-1 { animation: spin-slow 10s linear infinite; }
.coin-orbiter-2 { animation: spin-slow 15s linear infinite reverse; }
.orbit-dot {
  position: absolute; border-radius: 50%;
}

/* Flip button */
.flip-btn-main {
  display: inline-block; padding: 18px 48px; border-radius: 14px; border: none;
  background: linear-gradient(135deg, #b8860b, #f7b32b, #ffd700);
  color: #0b0e11; font-size: 18px; font-weight: 800; cursor: pointer;
  font-family: 'Outfit', sans-serif; letter-spacing: 1px;
  box-shadow: 0 0 30px #f7b32b40, 0 0 60px #f7b32b20;
  transition: all 0.2s; position: relative; overflow: hidden;
}
.flip-btn-main.pulse { animation: pulse-glow 2.5s ease infinite; }
.flip-btn-main::before {
  content: ''; position: absolute; top: -50%; left: -50%;
  width: 200%; height: 200%;
  background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%);
  transform: translateX(-100%); transition: transform 0.6s;
}
.flip-btn-main:hover::before { transform: translateX(100%); }
.flip-btn-main:hover:not(:disabled) { transform: translateY(-3px); filter: brightness(1.08); }
.flip-btn-main:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
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
.game-amount {
  text-align: center;
}
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
.status-inplay { background: #f7b32b20; color: var(--gold); border: 1px solid #f7b32b40; }
.status-done { background: var(--bg-elevated); color: var(--text-muted); }

.join-btn {
  padding: 8px 20px; border: none; border-radius: 8px;
  background: linear-gradient(135deg, #b8860b, #f7b32b);
  color: #0b0e11; font-size: 12px; font-weight: 700; cursor: pointer;
  font-family: 'Outfit', sans-serif; transition: all 0.2s;
  box-shadow: 0 0 12px #f7b32b30;
}
.join-btn:hover { box-shadow: 0 0 20px #f7b32b50; transform: scale(1.05); }
.cancel-btn {
  padding: 8px 16px; border: 1px solid var(--red); border-radius: 8px;
  background: transparent; color: var(--red); font-size: 11px; font-weight: 600;
  cursor: pointer; font-family: 'Outfit', sans-serif; transition: all 0.2s;
}
.cancel-btn:hover { background: #ef444410; }
.watch-btn {
  padding: 8px 16px; border-radius: 8px; border: none;
  background: var(--bg-elevated); color: var(--text-muted); font-size: 12px;
  font-weight: 600; cursor: default;
}

/* ═══ STATS SIDEBAR (RIGHT) ═══ */
.stats-sidebar {
  display: flex; flex-direction: column; height: 100%;
  background: var(--bg-card); border-left: 1px solid var(--border);
  overflow-y: auto;
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
  padding: 10px; border: none; border-radius: 8px; font-size: 12px;
  font-weight: 700; font-family: 'Outfit', sans-serif; cursor: pointer;
  background: #f7b32b20; color: var(--gold); border: 1px solid #f7b32b30;
  transition: all 0.2s;
}
.btn-deposit:hover { background: #f7b32b30; }
.btn-deposit:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-withdraw {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px; border: 1px solid #ef444430; border-radius: 8px; font-size: 12px;
  font-weight: 700; font-family: 'Outfit', sans-serif; cursor: pointer;
  background: #ef444420; color: var(--red); transition: all 0.2s;
}
.btn-withdraw:hover { background: #ef444430; }
.btn-withdraw:disabled { opacity: 0.4; cursor: not-allowed; }

.protocol-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 0;
}
.protocol-row-label { display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 13px; }
.protocol-row-val { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; color: var(--text); }

.player-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.player-stat-card {
  background: var(--bg-elevated); border-radius: 8px; padding: 12px; text-align: center;
}
.player-stat-val {
  font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 700;
}
.player-stat-label { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

.streak-banner {
  padding: 12px; border-radius: 8px; margin-top: 12px;
  background: linear-gradient(135deg, #f7b32b15, #ef444415);
  border: 1px solid #f7b32b30;
}
.streak-banner-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text); }
.streak-banner-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

/* Result overlay */
.result-overlay {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; z-index: 10;
  animation: fadeIn 0.3s ease; border-radius: 50%;
}
.result-text { font-size: 28px; font-weight: 900; letter-spacing: 3px; }
.result-win { color: var(--green); text-shadow: 0 0 40px #22c55e60; }
.result-lose { color: var(--red); text-shadow: 0 0 40px #ef444460; }

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
.toast-info { background: #3b82f618; border-color: #3b82f630; color: var(--blue); }

.empty-state { text-align: center; padding: 30px 20px; color: var(--text-muted); font-size: 13px; }

/* BOARD */
.board-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px; margin-bottom: 24px;
}
.seat-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
  padding: 12px; cursor: pointer; transition: all 0.2s;
}
.seat-card:hover { border-color: var(--gold); background: var(--bg-card-hover); box-shadow: 0 0 15px #f7b32b15; }
.seat-card.owned { border-color: var(--green); background: #22c55e08; }
.seat-card.mine { border-color: var(--gold); background: #f7b32b08; }
.seat-id { font-size: 10px; color: var(--text-muted); font-weight: 700; margin-bottom: 4px; }
.seat-name { font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.seat-price { font-size: 11px; font-family: 'JetBrains Mono', monospace; color: var(--green); font-weight: 600; }
.seat-empty { font-size: 11px; color: var(--text-muted); font-style: italic; }

.seat-detail-overlay {
  position: fixed; inset: 0; z-index: 900; background: rgba(0,0,0,0.8);
  display: flex; align-items: center; justify-content: center; animation: fadeIn 0.3s ease;
}
.seat-detail {
  width: 380px; max-width: 92vw; background: var(--bg-main); border: 1px solid var(--border);
  border-radius: 14px; padding: 24px; animation: fadeInUp 0.3s ease;
}
.seat-detail h3 { font-size: 18px; font-weight: 800; margin-bottom: 16px; }
.seat-detail-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12px; border-bottom: 1px solid var(--border); }
.seat-detail-label { color: var(--text-muted); }
.seat-detail-val { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
.seat-buy-btn {
  flex: 1; padding: 10px; border: none; border-radius: 8px; font-size: 12px;
  font-weight: 700; font-family: 'Outfit', sans-serif; cursor: pointer;
  background: linear-gradient(135deg, #b8860b, #f7b32b); color: #0b0e11;
  box-shadow: 0 0 12px #f7b32b30; transition: all 0.2s;
}
.seat-buy-btn:hover { box-shadow: 0 0 20px #f7b32b50; }

.info-input {
  width: 100%; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 6px; padding: 8px 10px; color: var(--text); font-size: 12px;
  font-family: 'JetBrains Mono', monospace; outline: none; margin-bottom: 8px;
  transition: all 0.2s;
}
.info-input:focus { border-color: var(--gold); box-shadow: 0 0 10px #f7b32b15; }

/* FAIR page */
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
.flip-modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 18px 24px; border-bottom: 1px solid var(--border);
}
.flip-modal-body {
  display: flex; align-items: center; justify-content: space-between;
  padding: 32px 28px; position: relative;
  background: radial-gradient(ellipse at 50% 50%, #1a1510, var(--bg-deep));
}
.flip-modal-player {
  text-align: center; width: 140px;
}
.flip-modal-avatar {
  width: 72px; height: 72px; border-radius: 50%; margin: 0 auto 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; font-weight: 700; color: #fff;
  font-family: 'JetBrains Mono', monospace;
}
.flip-modal-name { font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.flip-modal-bet {
  display: inline-block; padding: 4px 12px; border-radius: 8px;
  background: var(--bg-card); border: 1px solid var(--border);
  font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700;
}

/* Section label */
.section-label {
  font-size: 11px; font-weight: 700; color: var(--text-muted);
  letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px;
}

/* Admin panel */
.admin-panel {
  padding: 16px; background: var(--bg-card); border: 1px solid var(--red);
  border-radius: 10px; margin-bottom: 24px;
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
      {address ? address.slice(2, 4).toUpperCase() : "??"}
    </div>
  );
}

// ═══════════════════════════════════════
//  CHAT SIDEBAR COMPONENT
// ═══════════════════════════════════════
function ChatSidebar() {
  const [message, setMessage] = useState("");
  return (
    <div className="chat-sidebar">
      <div className="chat-header">
        <h2>General Chat</h2>
        <div className="online-badge">
          <div className="online-dot" />
          <span>{Math.floor(Math.random() * 20) + 15} online</span>
        </div>
      </div>
      <div className="chat-messages">
        {MOCK_CHAT.map((m, i) => (
          <div className="chat-msg" key={i}>
            <div className="chat-avatar" style={{ background: `${m.color}30`, color: m.color }}>
              {m.name.charAt(0)}
            </div>
            <div className="chat-msg-content">
              <div>
                <span className="chat-name" style={{ color: m.color }}>{m.name}</span>
                <span className="chat-level">LVL {m.level}</span>
              </div>
              <div className="chat-text">{m.msg}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="chat-input-area">
        <div className="chat-input-wrap">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
          />
          <button className="chat-send-btn">{"\u27A4"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  STATS SIDEBAR COMPONENT
// ═══════════════════════════════════════
function StatsSidebar({ sessionBalance, connected, playerStats, protocolStats, treasuryMax, depositAmt, setDepositAmt, handleDeposit, handleWithdraw, isDepositing }) {
  const [activeQuick, setActiveQuick] = useState(null);
  const bal = sessionBalance || "0";
  const quickDeposits = ["0.005", "0.01", "0.05", "0.1", "MAX"];

  return (
    <div className="stats-sidebar">
      {/* Session Balance */}
      <div className="stats-section">
        <div className="stats-label">Session Balance</div>
        <div className={`balance-display ${parseFloat(bal) > 0 ? "has-bal" : ""}`}>
          {parseFloat(bal).toFixed(4)}
        </div>
        <div className="balance-unit">ETH</div>
      </div>

      {/* Quick Deposit */}
      <div className="stats-section">
        <div className="stats-label">Quick Deposit</div>
        <div className="quick-btns" style={{ marginBottom: 12 }}>
          {quickDeposits.map((amount) => (
            <button
              key={amount}
              className={`quick-btn ${activeQuick === amount ? "active" : ""}`}
              onClick={() => {
                setActiveQuick(amount);
                setDepositAmt(amount === "MAX" ? bal : amount);
              }}
            >
              {amount}
            </button>
          ))}
        </div>
      </div>

      {/* Deposit/Withdraw */}
      <div className="stats-section">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <input
            className="stats-input"
            type="number"
            step="0.001"
            value={depositAmt}
            onChange={(e) => setDepositAmt(e.target.value)}
            placeholder="0.00"
            style={{ marginBottom: 0 }}
          />
          <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>ETH</span>
        </div>
        <div className="action-btns">
          <button className="btn-deposit" onClick={handleDeposit} disabled={isDepositing}>
            {isDepositing ? "..." : "\u2193 Deposit"}
          </button>
          <button className="btn-withdraw" onClick={handleWithdraw} disabled={isDepositing}>
            {isDepositing ? "..." : "\u2191 Withdraw"}
          </button>
        </div>
      </div>

      {/* Protocol Stats */}
      <div className="stats-section">
        <div className="stats-label">Protocol Stats</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { l: "Total Bets", v: protocolStats ? protocolStats.totalFlips.toLocaleString() : "...", icon: "\u{1F4C8}" },
            { l: "Treasury", v: protocolStats ? `${Number(protocolStats.treasury).toFixed(4)} \u039E` : "...", icon: "\u{1F4B0}" },
            { l: "Max Bet", v: treasuryMax ? `${parseFloat(treasuryMax).toFixed(4)} \u039E` : "...", icon: "\u{1F3AF}" },
            { l: "Jackpot", v: protocolStats ? `${Number(protocolStats.jackpot).toFixed(4)} \u039E` : "...", icon: "\u{1F3C6}" },
            { l: "Volume", v: protocolStats ? `${Number(protocolStats.totalVolume).toFixed(3)} \u039E` : "...", icon: "\u{1F4CA}" },
          ].map((r, i) => (
            <div className="protocol-row" key={i}>
              <span className="protocol-row-label">{r.icon} {r.l}</span>
              <span className="protocol-row-val">{r.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Player Stats */}
      {connected && playerStats && (
        <div className="stats-section">
          <div className="stats-label">Your Stats</div>
          <div className="player-stats-grid">
            <div className="player-stat-card">
              <div className="player-stat-val" style={{ color: "var(--green)" }}>{playerStats.wins}</div>
              <div className="player-stat-label">Wins</div>
            </div>
            <div className="player-stat-card">
              <div className="player-stat-val" style={{ color: "var(--red)" }}>{playerStats.losses}</div>
              <div className="player-stat-label">Losses</div>
            </div>
            <div className="player-stat-card">
              <div className="player-stat-val" style={{ color: "var(--gold)" }}>{playerStats.streak > 0 ? `${playerStats.streak}W` : "\u2014"}</div>
              <div className="player-stat-label">Streak</div>
            </div>
            <div className="player-stat-card">
              <div className="player-stat-val" style={{ color: "#a855f7" }}>{playerStats.bestStreak}W</div>
              <div className="player-stat-label">Best</div>
            </div>
          </div>

          {/* Streak banner */}
          {playerStats.streak >= 3 && (
            <div className="streak-banner">
              <div className="streak-banner-title">
                {"\u{1F525}"} Hot Streak!
              </div>
              <div className="streak-banner-sub">
                {playerStats.streak} wins in a row - keep it going!
              </div>
            </div>
          )}
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
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [seatBuyPrice, setSeatBuyPrice] = useState("0.001");
  const [seatBuyName, setSeatBuyName] = useState("");
  const [seatBuyDeposit, setSeatBuyDeposit] = useState("0.001");
  const referral = useRef(getReferralFromUrl()).current;

  // Search state (single-button flow)
  const [searchState, setSearchState] = useState(null);

  // Coin state for inline coin animation
  const [coinState, setCoinState] = useState("idle");
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);

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

  // ═══ SINGLE FLIP BUTTON HANDLER ═══
  const handleFlip = async () => {
    if (!contract || !connected || coinState !== "idle" || searchState) return;
    playClickSound();

    try {
      const tierWei = TIERS[tier].wei;
      const ref = parseInt(localStorage.getItem('flipper_ref')) || referral;

      addToast("pending", "Creating challenge...");
      const tx = await contract.createChallenge(tierWei, ref, { value: 0 });
      const receipt = await tx.wait();

      const event = receipt.logs?.find(l => {
        try { return contract.interface.parseLog(l)?.name === "ChallengeCreated"; } catch { return false; }
      });
      const challengeId = event ? contract.interface.parseLog(event).args.challengeId : null;

      if (!challengeId) {
        addToast("error", "Failed to create challenge");
        return;
      }

      setSearchState({ challengeId, startTime: Date.now(), countdown: 60 });
      addToast("success", "Challenge created! Searching for opponent...");

    } catch (err) {
      addToast("error", decodeError(err));
    }
  };

  // ═══ SEARCH POLLING EFFECT ═══
  useEffect(() => {
    if (!searchState || !contract) return;

    const interval = setInterval(async () => {
      const elapsed = (Date.now() - searchState.startTime) / 1000;
      setSearchState(prev => prev ? {...prev, countdown: Math.max(0, 60 - Math.floor(elapsed))} : null);

      try {
        const info = await getChallengeInfo(contract, searchState.challengeId);
        if (info.status !== 0) {
          clearInterval(interval);
          setCoinState("spinning");
          playFlipSound();

          const block = await contract.runner.provider.getBlockNumber();
          const events = await contract.queryFilter("FlipResolved", block - 10, block);
          const myEvent = events.find(e => e.args?.challengeId?.toString() === searchState.challengeId.toString());

          setSearchState(null);

          if (myEvent) {
            const won = myEvent.args.winner?.toLowerCase() === address?.toLowerCase();
            setTimeout(() => {
              setCoinState(won ? "win" : "lose");
              setResult(won ? "win" : "lose");
              setShowResult(true);
              if (won) { playWinSound(); if (playerStats?.streak >= 2) playStreakSound(playerStats.streak + 1); }
              else playLoseSound();
              addToast(won ? "success" : "error", won ? `Won ${formatEther(myEvent.args.winnerPayout)} ETH!` : `Lost ${formatEther(myEvent.args.amount)} ETH`);
              refreshBalance();
              setTimeout(() => { setCoinState("idle"); setResult(null); setShowResult(false); }, 4000);
            }, 3000);
          } else {
            setTimeout(() => { setCoinState("idle"); }, 5000);
          }
          return;
        }
      } catch {}

      if (elapsed >= 60) {
        clearInterval(interval);
        addToast("info", "No opponent found. Flipping vs Treasury...");
        try {
          await contract.cancelChallenge(searchState.challengeId);
          const tierWei = TIERS[tier].wei;
          const ref = parseInt(localStorage.getItem('flipper_ref')) || referral;
          setCoinState("spinning");
          playFlipSound();
          setSearchState(null);

          const tx2 = await contract.flipVsTreasury(tierWei, ref, { value: 0 });
          const r2 = await tx2.wait();
          const ev = r2.logs?.find(l => { try { return contract.interface.parseLog(l)?.name === "FlipResolved"; } catch { return false; } });
          if (ev) {
            const p = contract.interface.parseLog(ev);
            const won = p.args.winner?.toLowerCase() === address?.toLowerCase();
            setTimeout(() => {
              setCoinState(won ? "win" : "lose");
              setResult(won ? "win" : "lose");
              setShowResult(true);
              if (won) playWinSound(); else playLoseSound();
              refreshBalance();
              setTimeout(() => { setCoinState("idle"); setResult(null); setShowResult(false); }, 4000);
            }, 2000);
          }
        } catch (err) {
          setCoinState("idle");
          setSearchState(null);
          addToast("error", decodeError(err));
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [searchState, contract]);

  // ═══ CANCEL SEARCH ═══
  const cancelSearch = async () => {
    if (!searchState || !contract) return;
    try {
      addToast("pending", "Cancelling challenge...");
      await contract.cancelChallenge(searchState.challengeId);
      setSearchState(null);
      addToast("success", "Search cancelled");
    } catch (err) {
      addToast("error", decodeError(err));
    }
  };

  // ═══ ACCEPT CHALLENGE ═══
  const handleAccept = async (challengeId, creatorAddr) => {
    if (flipModal || !connected) return;
    playClickSound(); playFlipSound();
    const c = flipHook.challenges.find(ch => ch.id === challengeId);
    const amt = c ? c.amount : "?";
    setFlipModal({ playerA: address, playerB: creatorAddr || "Opponent", amount: amt, state: "spinning", winner: null, txHash: null });
    const resultData = await flipHook.acceptCh(challengeId, referral);
    if (!resultData) { setFlipModal(null); return; }
    const won = resultData.winner.toLowerCase() === address?.toLowerCase();
    if (won) playWinSound(); else playLoseSound();
    setFlipModal(prev => prev ? { ...prev, state: won ? "win" : "lose", winner: won ? prev.playerA : prev.playerB, txHash: resultData.txHash || null } : null);
    refreshBalance();
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
  const bal = sessionBalance || "0";

  return (
    <>
      <style>{CSS}</style>
      <div className="app-root">

        {/* ═══ LEFT — CHAT SIDEBAR ═══ */}
        <ChatSidebar />

        {/* ═══ CENTER — GAME AREA ═══ */}
        <div className="game-center">
          {/* Top Bar */}
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
                <div className="addr-pill" onClick={disconnect}>{shortAddr(address)}</div>
              ) : (
                <button className="connect-btn" onClick={connect}>Connect</button>
              )}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="game-scroll">

            {/* ═══ COINFLIP VIEW ═══ */}
            {view === "flip" && (
              <>
                {/* Hero Section */}
                <div className="hero-section">
                  <div className="hero-inner">
                    <div className="hero-title">COINFLIP</div>
                    <div className="hero-sub">50/50 chance {"\u2022"} Instant results {"\u2022"} Provably fair</div>

                    {/* Tier selector */}
                    <div className="tier-bar">
                      {TIERS.map((t, i) => (
                        <button key={i} className={`tier-btn ${tier === i ? "active" : ""}`}
                          onClick={() => { setTier(i); playClickSound(); }}>
                          {t.label} ETH
                        </button>
                      ))}
                    </div>

                    {/* Coin Area */}
                    <div className="coin-stage">
                      <div className="coin-stage-glow" />
                      {/* Orbiting particles */}
                      <div className="coin-orbiter coin-orbiter-1">
                        <div className="orbit-dot" style={{ position: "absolute", top: 0, left: "50%", width: 8, height: 8, marginLeft: -4, borderRadius: "50%", background: "var(--gold)", boxShadow: "0 0 10px #f7b32b80" }} />
                      </div>
                      <div className="coin-orbiter coin-orbiter-2">
                        <div className="orbit-dot" style={{ position: "absolute", bottom: 0, left: "50%", width: 6, height: 6, marginLeft: -3, borderRadius: "50%", background: "var(--gold-bright)", boxShadow: "0 0 10px #ffd70080" }} />
                      </div>
                      <div style={{ width: "100%", height: "100%" }}>
                        <Coin3D state={coinState} onComplete={() => {}} />
                      </div>
                      {showResult && (
                        <div className="result-overlay" style={{
                          background: result === "win"
                            ? "radial-gradient(ellipse, #22c55e20, transparent 70%)"
                            : "radial-gradient(ellipse, #ef444420, transparent 70%)",
                        }}>
                          <div className={`result-text ${result === "win" ? "result-win" : "result-lose"}`}>
                            {result === "win" ? "YOU WON!" : "YOU LOST"}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Streak counter */}
                    {connected && playerStats && playerStats.streak > 0 && (
                      <div style={{ marginBottom: 16, fontSize: 14, fontWeight: 700, color: "var(--gold)" }}>
                        {"\u{1F525}"} {playerStats.streak}x Streak
                      </div>
                    )}

                    {/* FLIP BUTTON */}
                    {!connected ? (
                      <button className="connect-btn" onClick={connect} style={{ padding: "18px 48px", fontSize: 18, borderRadius: 14 }}>
                        Connect Wallet
                      </button>
                    ) : searchState ? (
                      /* Search overlay inline */
                      <div style={{ padding: 24, background: "var(--bg-card)", borderRadius: 14, border: "1px solid var(--border)", display: "inline-block" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gold)", letterSpacing: 2, marginBottom: 16, animation: "searchPulse 1.5s ease infinite" }}>
                          SEARCHING FOR OPPONENT...
                        </div>
                        <div style={{ width: 200, height: 4, background: "var(--border)", borderRadius: 2, marginBottom: 12, overflow: "hidden", margin: "0 auto 12px" }}>
                          <div style={{
                            height: "100%", background: "linear-gradient(90deg, var(--gold), var(--gold-bright))",
                            borderRadius: 2, width: `${((60 - searchState.countdown) / 60) * 100}%`,
                            transition: "width 1s linear",
                          }} />
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
                          0:{searchState.countdown.toString().padStart(2, '0')}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>
                          Auto-flip vs treasury when timer ends
                        </div>
                        <button className="cancel-btn" onClick={cancelSearch}>Cancel</button>
                      </div>
                    ) : (
                      <button
                        className={`flip-btn-main ${coinState === "idle" && !searchState ? "pulse" : ""}`}
                        disabled={coinState !== "idle" || !!searchState}
                        onClick={handleFlip}
                      >
                        <div style={{ position: "relative", zIndex: 1 }}>
                          FLIP NOW
                          <div className="flip-sub">
                            {tierEth} ETH {"\u00B7"} 2x Payout
                          </div>
                        </div>
                      </button>
                    )}

                    {connected && parseFloat(bal) === 0 && (
                      <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-dim)" }}>
                        Deposit ETH using the panel on the right to start flipping
                      </div>
                    )}

                    {treasuryMax && parseFloat(tierEth) > parseFloat(treasuryMax) && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "var(--gold)" }}>
                        {"\u26A0"} Treasury max bet is {parseFloat(treasuryMax).toFixed(4)} ETH
                      </div>
                    )}
                  </div>
                </div>

                {/* Separator */}
                <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #f7b32b25, transparent)", margin: "0 24px" }} />

                {/* All Games Section */}
                <div className="games-section" style={{ paddingTop: 20 }}>
                  <div className="games-header">
                    <h2>{"\u26A1"} ALL GAMES</h2>
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
                    const isMySearch = isMine && searchState && searchState.challengeId?.toString() === c.id?.toString();
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
                          {isMySearch ? (
                            <span className="game-status status-searching">SEARCHING</span>
                          ) : isMine ? (
                            <span className="game-status status-searching">WAITING</span>
                          ) : (
                            <span className="game-status status-open">JOINABLE</span>
                          )}
                          {isMine
                            ? <button className="cancel-btn" onClick={() => { playClickSound(); flipHook.cancelCh(c.id); setSearchState(null); }}>Cancel</button>
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
                    return (
                      <div className="game-row" key={i}>
                        <div className="game-players">
                          <GameAvatar address={h.winner} size={32} />
                          <span className="game-vs">VS</span>
                          <GameAvatar address={h.loser} size={32} />
                        </div>
                        <div className="game-amount">
                          <div className="game-amount-val" style={{ fontSize: 14 }}>{h.amount} ETH</div>
                          {h.winnerStreak > 1 && (
                            <div style={{ fontSize: 10, color: "var(--gold)" }}>{"\u{1F525}"} {h.winnerStreak}x</div>
                          )}
                        </div>
                        <div className="game-actions">
                          <span className={`game-status ${won ? "status-open" : won === false ? "status-done" : "status-inplay"}`}>
                            {won === null ? "FLIP" : won ? "WON" : "LOST"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ═══ BOARD VIEW ═══ */}
            {view === "board" && (
              <div style={{ padding: 24 }}>
                <div className="section-label" style={{ color: "var(--gold)", fontSize: 12, letterSpacing: 4 }}>REVENUE SEATS</div>
                <div className="hero-title" style={{ fontSize: 36, marginBottom: 8 }}>THE BOARD</div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 20, lineHeight: 1.6 }}>
                  256 Harberger-taxed seats. Owners earn a share of every flip's fees. Buy a seat, set a price, keep it funded.
                </div>

                {connected && address && (
                  <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 16 }}>
                    Your referral link: <span style={{ color: "var(--gold)", fontFamily: "'JetBrains Mono', monospace" }}>
                      {window.location.origin}?ref={seatHook.mySeats[0] || "SEATID"}
                    </span>
                  </div>
                )}

                {!seatHook.loading && seatHook.seats.length === 0 && (
                  <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <button className="seat-buy-btn" style={{ width: "auto", padding: "10px 24px" }} onClick={() => seatHook.refreshSeats()}>Load Seats</button>
                  </div>
                )}
                {seatHook.loading && <div className="empty-state">Loading 256 seats...</div>}
                <div className="board-grid">
                  {seatHook.seats.map(s => {
                    const isMine = s.active && address && s.owner.toLowerCase() === address.toLowerCase();
                    return (
                      <div key={s.id}
                        className={`seat-card ${s.active ? (isMine ? "mine" : "owned") : ""}`}
                        onClick={() => { setSelectedSeat(s); playClickSound(); }}>
                        <div className="seat-id">#{s.id}</div>
                        {s.active ? (
                          <>
                            <div className="seat-name">{s.name || shortAddr(s.owner)}</div>
                            <div className="seat-price">{parseFloat(s.price).toFixed(4)} ETH</div>
                          </>
                        ) : (
                          <div className="seat-empty">Available</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Seat detail overlay */}
                {selectedSeat && (
                  <div className="seat-detail-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSelectedSeat(null); }}>
                    <div className="seat-detail">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <h3 style={{ margin: 0 }}>Seat #{selectedSeat.id}</h3>
                        <button onClick={() => setSelectedSeat(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
                      </div>
                      <div className="seat-detail-row"><span className="seat-detail-label">Owner</span><span className="seat-detail-val">{selectedSeat.active ? shortAddr(selectedSeat.owner) : "None"}</span></div>
                      <div className="seat-detail-row"><span className="seat-detail-label">Price</span><span className="seat-detail-val" style={{ color: "var(--green)" }}>{parseFloat(selectedSeat.price).toFixed(4)} ETH</span></div>
                      <div className="seat-detail-row"><span className="seat-detail-label">Deposit</span><span className="seat-detail-val">{parseFloat(selectedSeat.deposit).toFixed(4)} ETH</span></div>
                      {selectedSeat.name && <div className="seat-detail-row"><span className="seat-detail-label">Name</span><span className="seat-detail-val">{selectedSeat.name}</span></div>}

                      {connected && !(selectedSeat.active && address && selectedSeat.owner.toLowerCase() === address.toLowerCase()) && (
                        <div style={{ marginTop: 16 }}>
                          <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>Buy this seat (pay current price + deposit)</div>
                          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                            <input className="info-input" style={{ marginBottom: 0 }} placeholder="New price" type="number" step="0.001" value={seatBuyPrice} onChange={e => setSeatBuyPrice(e.target.value)} />
                            <input className="info-input" style={{ marginBottom: 0 }} placeholder="Name" maxLength={32} value={seatBuyName} onChange={e => setSeatBuyName(e.target.value)} />
                          </div>
                          <input className="info-input" placeholder="Deposit amount" type="number" step="0.001" value={seatBuyDeposit} onChange={e => setSeatBuyDeposit(e.target.value)} />
                          <button className="seat-buy-btn" style={{ width: "100%" }} onClick={async () => {
                            await seatHook.buySeat(selectedSeat.id, seatBuyPrice, seatBuyName, selectedSeat.priceWei, seatBuyDeposit);
                            setSelectedSeat(null);
                          }}>
                            Buy Seat #{selectedSeat.id}
                          </button>
                        </div>
                      )}

                      {connected && selectedSeat.active && address && selectedSeat.owner.toLowerCase() === address.toLowerCase() && (
                        <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                          <button className="seat-buy-btn" onClick={async () => { await seatHook.claim(selectedSeat.id); setSelectedSeat(null); }}>Claim</button>
                          <button className="cancel-btn" onClick={async () => { await seatHook.abandon(selectedSeat.id); setSelectedSeat(null); }}>Abandon</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ FAIR VIEW ═══ */}
            {view === "fair" && (
              <div className="fair-section">
                <div className="section-label" style={{ color: "var(--gold)", fontSize: 12, letterSpacing: 4 }}>PROVABLY FAIR</div>
                <div className="hero-title" style={{ fontSize: 36, marginBottom: 16 }}>FAIRNESS</div>
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
                    { l: "Referral", v: "1.0%", c: "var(--blue)" },
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
                  Verify on <a href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>BaseScan</a>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT — STATS SIDEBAR ═══ */}
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
            <div className="flip-modal-header">
              <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>COINFLIP</span>
              <button onClick={() => setFlipModal(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>{"\u2715"}</button>
            </div>
            <div className="flip-modal-body">
              {/* Player A */}
              <div className="flip-modal-player">
                <div className="flip-modal-avatar" style={{
                  background: `linear-gradient(135deg, ${addrColor(flipModal.playerA)}, ${addrColor(flipModal.playerA)}88)`,
                  border: flipModal.state !== "spinning" && flipModal.winner === flipModal.playerA ? "3px solid var(--green)" : "3px solid var(--border)",
                  boxShadow: flipModal.state !== "spinning" && flipModal.winner === flipModal.playerA ? "0 0 20px #22c55e40" : "none",
                }}>
                  {flipModal.playerA?.slice(2, 4).toUpperCase()}
                </div>
                <div className="flip-modal-name">{flipModal.playerA === address ? "You" : shortAddr(flipModal.playerA)}</div>
                <div className="flip-modal-bet" style={{ color: "var(--gold)" }}>{flipModal.amount} ETH</div>
              </div>

              {/* Center Coin */}
              <div style={{ width: 180, height: 180, position: "relative" }}>
                <Coin3D state={flipModal.state === "spinning" ? "spinning" : flipModal.state} onComplete={() => {
                  setTimeout(() => setFlipModal(null), 3000);
                }} />
                <div style={{
                  position: "absolute", inset: -15, border: "2px solid #f7b32b30", borderRadius: "50%",
                  animation: flipModal.state === "spinning" ? "coinGlow 1s ease infinite" : "none",
                  opacity: flipModal.state === "spinning" ? 1 : 0, transition: "opacity 0.3s",
                }} />
              </div>

              {/* Player B */}
              <div className="flip-modal-player">
                <div className="flip-modal-avatar" style={{
                  background: flipModal.playerB === "Treasury"
                    ? "linear-gradient(135deg, var(--gold), var(--gold-dark))"
                    : `linear-gradient(135deg, ${addrColor(flipModal.playerB)}, ${addrColor(flipModal.playerB)}88)`,
                  border: flipModal.state !== "spinning" && flipModal.winner !== flipModal.playerA ? "3px solid var(--green)" : "3px solid var(--border)",
                  boxShadow: flipModal.state !== "spinning" && flipModal.winner !== flipModal.playerA ? "0 0 20px #22c55e40" : "none",
                  fontSize: flipModal.playerB === "Treasury" ? 28 : 20,
                }}>
                  {flipModal.playerB === "Treasury" ? "T" : flipModal.playerB?.slice(2, 4).toUpperCase() || "??"}
                </div>
                <div className="flip-modal-name">
                  {flipModal.playerB === "Treasury" ? "Treasury" : shortAddr(flipModal.playerB)}
                </div>
                <div className="flip-modal-bet" style={{ color: flipModal.playerB === "Treasury" ? "var(--gold)" : "var(--green)" }}>
                  {flipModal.amount} ETH
                </div>
              </div>
            </div>

            {/* Result */}
            {flipModal.state !== "spinning" && (
              <div style={{
                textAlign: "center", padding: "20px 24px",
                background: flipModal.winner === flipModal.playerA
                  ? "linear-gradient(180deg, #22c55e10, transparent)"
                  : "linear-gradient(180deg, #ef444410, transparent)",
              }}>
                <div style={{
                  fontSize: 14, fontWeight: 800, letterSpacing: 2,
                  color: flipModal.winner === flipModal.playerA ? "var(--green)" : "var(--red)",
                  textShadow: flipModal.winner === flipModal.playerA ? "0 0 30px #22c55e50" : "0 0 30px #ef444450",
                }}>
                  {flipModal.winner === flipModal.playerA
                    ? (flipModal.playerA === address ? "YOU WON!" : shortAddr(flipModal.playerA) + " WON")
                    : (flipModal.playerB === "Treasury" ? "TREASURY WON" : shortAddr(flipModal.playerB) + " WON")}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{
              padding: "14px 24px", borderTop: "1px solid var(--border)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Provably Fair</div>
              {flipModal.txHash && (
                <a href={`${EXPLORER}/tx/${flipModal.txHash}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 10, color: "var(--blue)", fontFamily: "'JetBrains Mono', monospace" }}>
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
