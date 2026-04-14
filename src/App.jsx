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

const CSS = `
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
  --red-bright: #dc2626;

  --blue: #3b82f6;
  --teal: #14b8a6;

  --text: #f1f5f9;
  --text-dim: #94a3b8;
  --text-muted: #475569;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg-deep); color: var(--text); font-family: 'Outfit', sans-serif; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

@keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
@keyframes coinGlow { 0%,100% { opacity: 0.2; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.05); } }
@keyframes float { 0% { transform: translateY(0) translateX(0); opacity: 0.3; } 50% { transform: translateY(-20px) translateX(10px); opacity: 0.7; } 100% { transform: translateY(0) translateX(0); opacity: 0.3; } }
@keyframes shimmer { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes confetti { 0% { transform: translateY(0) rotate(0); opacity: 1; } 100% { transform: translateY(300px) rotate(720deg); opacity: 0; } }
@keyframes shake { 0%,100% { transform: translateX(0); } 15% { transform: translateX(-8px); } 30% { transform: translateX(8px); } 45% { transform: translateX(-6px); } 60% { transform: translateX(6px); } 75% { transform: translateX(-3px); } 90% { transform: translateX(3px); } }
@keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
@keyframes btnPulseGold {
  0%, 100% { box-shadow: 0 0 20px var(--gold-glow), 0 0 40px #f7b32b20; }
  50% { box-shadow: 0 0 35px var(--gold-glow), 0 0 70px #f7b32b30; }
}
@keyframes borderGlow {
  0% { box-shadow: 0 0 15px #f7b32b30, 0 0 30px #f7b32b15, inset 0 0 30px #f7b32b08; }
  33% { box-shadow: 0 0 15px #ffd70030, 0 0 30px #ffd70015, inset 0 0 30px #ffd70008; }
  66% { box-shadow: 0 0 15px #b8860b30, 0 0 30px #b8860b15, inset 0 0 30px #b8860b08; }
  100% { box-shadow: 0 0 15px #f7b32b30, 0 0 30px #f7b32b15, inset 0 0 30px #f7b32b08; }
}
@keyframes spin { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }
@keyframes searchPulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.app {
  display: flex; height: 100vh; overflow: hidden;
  background:
    radial-gradient(ellipse at 15% 50%, #f7b32b08 0%, transparent 40%),
    radial-gradient(ellipse at 85% 20%, #22c55e06 0%, transparent 35%),
    radial-gradient(ellipse at 50% 90%, #ef444406 0%, transparent 30%),
    radial-gradient(ellipse at 50% 50%, #0b0e11 0%, #080a0d 100%);
}

/* SIDEBAR */
.sidebar {
  width: 260px; min-width: 260px;
  background: linear-gradient(180deg, #0f1318, #0b0e11);
  border-right: 1px solid var(--border); display: flex; flex-direction: column;
}
.sidebar::before {
  content: ''; display: block; height: 2px; flex-shrink: 0;
  background: linear-gradient(90deg, transparent, #f7b32b, #b8860b, transparent);
}
.sidebar-header {
  padding: 16px 18px; border-bottom: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center;
  background: linear-gradient(180deg, var(--bg-main), transparent);
}
.sidebar-header h3 { font-size: 13px; font-weight: 600; color: var(--text-dim); letter-spacing: 0.5px; }
.online-badge { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--teal); }
.online-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px #22c55e60; animation: blink 2s infinite; }

.chat-messages { flex: 1; overflow-y: auto; padding: 8px 0; }
.chat-msg {
  display: flex; gap: 10px; padding: 8px 18px; transition: all 0.2s; cursor: default;
}
.chat-msg:hover { background: var(--bg-card); transform: translateX(3px); }
.chat-avatar {
  width: 28px; height: 28px; min-width: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace;
}
.chat-name { font-size: 12px; font-weight: 600; }
.chat-level {
  display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 5px;
  border-radius: 4px; background: var(--bg-elevated); color: var(--text-dim);
  margin-left: 4px; vertical-align: middle;
}
.chat-text { font-size: 12px; color: var(--text-dim); margin-top: 2px; line-height: 1.4; }
.chat-input-wrap { padding: 12px 18px; border-top: 1px solid var(--border); }
.chat-input-wrap input {
  width: 100%; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; padding: 10px 14px; color: var(--text); font-size: 12px;
  font-family: 'Outfit', sans-serif; outline: none; transition: all 0.2s;
}
.chat-input-wrap input:focus { border-color: var(--gold); box-shadow: 0 0 15px #f7b32b20; }

/* MAIN COLUMN */
.main-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

/* TOPBAR */
.topbar {
  height: 56px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, #0f1318, #0b0e11); flex-shrink: 0;
  position: relative;
}
.topbar::after {
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

.header-right { display: flex; align-items: center; gap: 12px; }
.balance-pill {
  display: flex; align-items: center; gap: 8px; padding: 6px 14px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
  font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600;
  transition: box-shadow 0.3s;
}
.balance-pill.has-bal { background: #f7b32b10; border-color: #f7b32b40; box-shadow: 0 0 20px #f7b32b25; }
.connect-btn {
  padding: 8px 20px; border: none; border-radius: 8px; font-size: 13px;
  font-weight: 700; font-family: 'Outfit', sans-serif; cursor: pointer;
  background: linear-gradient(135deg, #b8860b, #f7b32b); color: #0b0e11; transition: all 0.2s;
  box-shadow: 0 0 25px #f7b32b40; text-shadow: 0 0 5px #00000030;
}
.connect-btn:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 0 35px #f7b32b60, 0 0 60px #f7b32b30; }
.addr-pill {
  padding: 6px 14px; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; font-size: 12px; color: var(--text-dim); cursor: pointer;
  font-family: 'JetBrains Mono', monospace; transition: all 0.2s;
}
.addr-pill:hover { border-color: var(--border-light); }

/* CONTENT */
.content { flex: 1; overflow-y: auto; padding: 0; display: flex; }
.game-area { flex: 1; overflow-y: auto; padding: 32px 36px; }
.info-panel {
  width: 220px; min-width: 220px;
  background: linear-gradient(180deg, #0f1318, #0b0e11);
  border-left: 1px solid var(--border); overflow-y: auto; padding: 20px 16px;
}
.info-card {
  background: linear-gradient(135deg, #151a22, #121720);
  border: 1px solid var(--border); border-radius: 10px;
  padding: 14px; margin-bottom: 16px;
}

.section-label {
  font-size: 11px; font-weight: 700; color: var(--text-muted);
  letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px;
}

/* HERO */
.hero-title { font-size: 12px; color: var(--gold); letter-spacing: 4px; font-weight: 700; margin-bottom: 4px; animation: fadeInUp 0.5s ease 0.1s both; text-shadow: 0 0 15px #f7b32b40; }
.hero-big {
  font-size: 48px; font-weight: 900; letter-spacing: -2px;
  background: linear-gradient(90deg, #f1f5f9, #f7b32b, #ffd700, #f1f5f9);
  background-size: 400% 100%;
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  animation: shimmer 6s linear infinite, fadeInUp 0.5s ease 0.2s both;
  margin-bottom: 24px;
}

/* STATS */
.stats-row { display: flex; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; animation: fadeInUp 0.5s ease 0.3s both; }
.stat-item { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.stat-label { color: var(--text-muted); }
.stat-val { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
.stat-green { color: var(--green); }
.stat-gold { color: var(--gold); }

/* TIERS */
.tier-bar { display: flex; gap: 6px; margin-bottom: 32px; animation: fadeInUp 0.5s ease 0.4s both; }
.tier-btn {
  flex: 1; padding: 12px 0; border: 1px solid #1f2937; border-radius: 8px;
  background: #0f1318; color: #475569; font-size: 13px; font-weight: 600;
  font-family: 'JetBrains Mono', monospace; cursor: pointer; transition: all 0.25s;
  position: relative;
}
.tier-btn:hover { border-color: #2d3748; background: #1c232e; color: #ccc; }
.tier-btn.active {
  border-color: var(--gold); color: var(--gold);
  background: #f7b32b12;
  box-shadow: 0 0 20px #f7b32b30, 0 0 50px #f7b32b15;
  text-shadow: 0 0 8px #f7b32b60;
  transform: scale(1.02);
}
.tier-btn.active::after {
  content: ''; position: absolute; top: -1px; left: 20%; right: 20%;
  height: 2px; background: var(--gold); border-radius: 2px;
}

/* COIN STAGE */
.coin-stage {
  background:
    radial-gradient(ellipse at 50% 40%, #1a1510 0%, #0b0e11 70%);
  border: 1px solid var(--border); border-radius: 16px;
  height: 320px; margin-bottom: 24px; position: relative; overflow: hidden;
  animation: fadeInUp 0.5s ease 0.5s both, borderGlow 6s ease infinite;
  display: flex; align-items: center; justify-content: center;
}
.coin-stage::before {
  content: ''; position: absolute; inset: -20px;
  background: radial-gradient(circle, #f7b32b15 0%, transparent 50%);
  animation: coinGlow 2.5s ease infinite; pointer-events: none; z-index: 0;
}
.coin-stage::after {
  content: ''; position: absolute; inset: 0;
  background-image: linear-gradient(#f7b32b06 1px, transparent 1px), linear-gradient(90deg, #f7b32b06 1px, transparent 1px);
  background-size: 25px 25px; pointer-events: none; border-radius: 16px;
}
.coin-particle {
  position: absolute; width: 3px; height: 3px; border-radius: 50%;
  pointer-events: none; z-index: 0;
  animation: float var(--dur) ease-in-out var(--delay) infinite;
}

/* FLIP BUTTON */
.flip-btn-main {
  width: 100%; padding: 22px 0; border-radius: 14px; border: none;
  background: linear-gradient(135deg, #b8860b, #f7b32b, #ffd700);
  color: #0b0e11; font-size: 18px; font-weight: 800; cursor: pointer;
  font-family: 'Outfit', sans-serif; letter-spacing: 1px;
  box-shadow: 0 0 30px #f7b32b40, 0 0 60px #f7b32b20;
  transition: all 0.2s; position: relative; overflow: hidden;
  margin-bottom: 32px;
}
.flip-btn-main:not(:disabled).pulse { animation: btnPulseGold 2.5s ease infinite; }
.flip-btn-main::before {
  content: ''; position: absolute; top: -50%; left: -50%;
  width: 200%; height: 200%;
  background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%);
  transform: translateX(-100%); transition: transform 0.6s;
}
.flip-btn-main:hover::before { transform: translateX(100%); }
.flip-btn-main:hover:not(:disabled) { transform: translateY(-3px); filter: brightness(1.08); }
.flip-btn-main:active:not(:disabled) { transform: translateY(-1px); }
.flip-btn-main:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.flip-btn-main:disabled::before { display: none; }
.flip-sub { font-size: 12px; font-weight: 500; opacity: 0.7; margin-top: 4px; }

/* GAME ROWS */
.games-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.games-count { font-size: 13px; font-weight: 700; color: var(--gold); font-family: 'JetBrains Mono', monospace; }
.game-row {
  display: flex; align-items: center; padding: 16px 20px;
  background: linear-gradient(135deg, #151a22, #121720);
  border: 1px solid #1f2937; border-radius: 10px; margin-bottom: 8px;
  transition: all 0.25s; gap: 16px;
}
.game-row:hover {
  border-color: #f7b32b40;
  background: linear-gradient(135deg, #1c232e, #1a2028);
  box-shadow: 0 0 15px #f7b32b10;
}
.game-players { display: flex; align-items: center; gap: 10px; flex: 1; }
.game-vs { font-size: 11px; color: var(--text-muted); font-weight: 700; }
.game-avatar {
  width: 38px; height: 38px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; font-size: 12px;
  font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace;
  border: 2px solid var(--border);
}
.game-avatar-empty {
  width: 38px; height: 38px; border-radius: 50%; border: 2px dashed var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; color: var(--text-muted);
}
.game-amount {
  font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 800;
  color: #fff; min-width: 120px; text-align: center;
}
.game-amount-eth { font-size: 11px; color: var(--text-muted); margin-left: 4px; }
.game-status {
  font-size: 10px; font-weight: 700; letter-spacing: 1px; padding: 4px 10px;
  border-radius: 6px; text-transform: uppercase; min-width: 80px; text-align: center;
}
.status-open { background: #22c55e20; color: var(--green); border: 1px solid #22c55e40; border-radius: 20px; padding: 5px 14px; }
.status-searching { background: #f7b32b20; color: var(--gold); border: 1px solid #f7b32b40; border-radius: 20px; padding: 5px 14px; animation: searchPulse 1.5s ease infinite; }
.status-done { background: var(--bg-elevated); color: var(--text-muted); }

.join-btn {
  padding: 8px 22px; border: none; border-radius: 8px;
  background: linear-gradient(135deg, #b8860b, #f7b32b);
  color: #0b0e11; font-size: 12px; font-weight: 700; cursor: pointer;
  font-family: 'Outfit', sans-serif; transition: all 0.2s;
  box-shadow: 0 0 12px #f7b32b30; text-shadow: 0 0 3px #00000020;
}
.join-btn:hover { box-shadow: 0 0 20px #f7b32b50; transform: scale(1.08); }
.cancel-btn {
  padding: 8px 16px; border: 1px solid var(--red); border-radius: 8px;
  background: transparent; color: var(--red); font-size: 11px; font-weight: 600;
  cursor: pointer; font-family: 'Outfit', sans-serif; transition: all 0.2s;
}
.cancel-btn:hover { background: #ef444410; }

/* INFO PANEL */
.info-section { margin-bottom: 24px; }
.info-label { font-size: 10px; color: var(--text-muted); letter-spacing: 1.2px; font-weight: 700; margin-bottom: 8px; }
.info-balance {
  font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 700;
  margin-bottom: 12px; transition: all 0.3s;
}
.info-balance.has-bal { color: var(--gold); text-shadow: 0 0 20px #f7b32b50, 0 0 40px #f7b32b30; }
.quick-btns { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
.quick-btn {
  padding: 5px 10px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-card); color: var(--text-dim); font-size: 10px;
  font-family: 'JetBrains Mono', monospace; font-weight: 600; cursor: pointer;
  transition: all 0.2s;
}
.quick-btn:hover { border-color: var(--gold); color: var(--gold); background: #f7b32b10; }
.info-input {
  width: 100%; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 6px; padding: 8px 10px; color: var(--text); font-size: 12px;
  font-family: 'JetBrains Mono', monospace; outline: none; margin-bottom: 8px;
  transition: all 0.2s;
}
.info-input:focus { border-color: var(--gold); box-shadow: 0 0 10px #f7b32b15; }
.info-actions { display: flex; gap: 6px; }
.btn-deposit {
  flex: 1; padding: 8px; border: none; border-radius: 6px; font-size: 11px;
  font-weight: 700; font-family: 'Outfit', sans-serif; cursor: pointer;
  background: linear-gradient(135deg, #b8860b, #f7b32b); color: #0b0e11; transition: all 0.2s;
  box-shadow: 0 0 10px #f7b32b25;
}
.btn-deposit:hover { box-shadow: 0 0 18px #f7b32b40; }
.btn-deposit:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
.btn-withdraw {
  flex: 1; padding: 8px; border: 1px solid var(--red); border-radius: 6px;
  font-size: 11px; font-weight: 700; font-family: 'Outfit', sans-serif;
  cursor: pointer; background: transparent; color: var(--red); transition: all 0.2s;
}
.btn-withdraw:hover { box-shadow: 0 2px 10px #ef444425; }
.btn-withdraw:disabled { opacity: 0.4; cursor: not-allowed; }
.info-row {
  display: flex; justify-content: space-between; padding: 5px 0;
  font-size: 12px; border-bottom: 1px solid #1f293720;
}
.info-row-label { color: var(--text-muted); }
.info-row-val { font-family: 'JetBrains Mono', monospace; font-weight: 600; }

/* RESULT */
.result-overlay {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; z-index: 10;
  animation: fadeIn 0.3s ease;
}
.result-text { font-size: 32px; font-weight: 900; letter-spacing: 4px; font-family: 'Outfit', sans-serif; }
.result-win { color: var(--green); text-shadow: 0 0 40px #22c55e60, 0 0 80px #22c55e30; }
.result-lose { color: var(--red); text-shadow: 0 0 40px #ef444460, 0 0 80px #ef444430; }

.shaking { animation: shake 0.5s ease; }

/* TOASTS */
.toast-container { position: fixed; top: 70px; right: 20px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; }
.toast {
  padding: 12px 18px; border-radius: 10px; font-size: 12px; font-weight: 500;
  animation: slideIn 0.3s ease; min-width: 250px; border: 1px solid; cursor: pointer;
  backdrop-filter: blur(8px);
}
.toast-success { background: #22c55e18; border-color: #22c55e30; color: var(--green); }
.toast-error { background: #ef444418; border-color: #ef444430; color: var(--red); }
.toast-pending { background: #f7b32b18; border-color: #f7b32b30; color: var(--gold); }
.toast-info { background: #3b82f618; border-color: #3b82f630; color: var(--blue); }

.empty-state { text-align: center; padding: 40px; color: var(--text-muted); font-size: 13px; }
.empty-state-rich { text-align: center; padding: 30px 20px; }
.flip-hint { text-align: center; font-size: 11px; color: var(--text-muted); margin-top: -20px; margin-bottom: 24px; }
.onboarding { text-align: center; font-size: 13px; color: var(--text-dim); margin-bottom: 24px; line-height: 1.6; }
.deposit-nudge {
  text-align: center; padding: 16px 20px; margin-bottom: 20px;
  background: var(--bg-card); border: 1px dashed var(--border-light); border-radius: 10px;
}
.tier-warning { color: var(--gold); font-size: 11px; text-align: center; margin-bottom: 8px; }

/* BOARD */
.board-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px; margin-bottom: 24px;
}
.seat-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
  padding: 12px; cursor: pointer; transition: all 0.2s; position: relative;
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
.seat-actions { display: flex; gap: 6px; margin-top: 14px; }
.seat-buy-btn {
  flex: 1; padding: 10px; border: none; border-radius: 8px; font-size: 12px;
  font-weight: 700; font-family: 'Outfit', sans-serif; cursor: pointer;
  background: linear-gradient(135deg, #b8860b, #f7b32b); color: #0b0e11; transition: all 0.2s;
  box-shadow: 0 0 12px #f7b32b30;
}
.seat-buy-btn:hover { box-shadow: 0 0 20px #f7b32b50; }

/* MOBILE DEPOSIT */
.mobile-deposit { display: none; }
@media (max-width: 1024px) {
  .mobile-deposit {
    display: block; padding: 12px 16px; margin-bottom: 16px;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
  }
  .mobile-deposit-row { display: flex; gap: 6px; align-items: center; }
  .mobile-deposit-row input {
    flex: 1; background: var(--bg-elevated); border: 1px solid var(--border);
    border-radius: 6px; padding: 8px 10px; color: var(--text); font-size: 12px;
    font-family: 'JetBrains Mono', monospace; outline: none;
  }
  .mobile-deposit-row input:focus { border-color: var(--gold); }
  .mobile-deposit-row button {
    padding: 8px 12px; border: none; border-radius: 6px; font-size: 11px;
    font-weight: 700; font-family: 'Outfit', sans-serif; cursor: pointer;
    transition: all 0.2s;
  }
  .mobile-bal { font-size: 14px; font-weight: 700; font-family: 'JetBrains Mono', monospace; color: var(--gold); margin-bottom: 8px; }
}

@media (max-width: 1024px) {
  .sidebar { display: none; }
  .info-panel { display: none; }
  .game-area { padding: 16px; }
  .hero-big { font-size: 28px; }
  .coin-stage { height: 220px; }
}
`;

const MOCK_CHAT = [
  { name: "BasedDegen", level: 12, msg: "LFG", color: "#f7b32b" },
  { name: "FlipperKing", level: 34, msg: "just hit 5x streak", color: "#ffd700" },
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

function GameAvatar({ address, size = 38 }) {
  const color = addrColor(address);
  return (
    <div className="game-avatar" style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}, ${color}99)` }}>
      {address ? address.slice(2, 4).toUpperCase() : "??"}
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
  const { toasts, remove: removeToast } = useToasts();

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

  // ═══ SEARCH STATE (single-button flow) ═══
  const [searchState, setSearchState] = useState(null);
  // null | { challengeId, startTime, countdown }

  // Coin state for inline coin animation
  const [coinState, setCoinState] = useState("idle");
  const [result, setResult] = useState(null); // "win" | "lose" | null
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

  // ═══ SINGLE FLIP BUTTON HANDLER ═══
  const handleFlip = async () => {
    if (!contract || !connected || coinState !== "idle" || searchState) return;
    playClickSound();

    try {
      const tierWei = TIERS[tier].wei;
      const ref = parseInt(localStorage.getItem('flipper_ref')) || referral;

      // Step 1: Create PVP challenge
      addToast("pending", "Creating challenge...");
      const tx = await contract.createChallenge(tierWei, ref, { value: 0 });
      const receipt = await tx.wait();

      // Get challenge ID from event
      const event = receipt.logs?.find(l => {
        try { return contract.interface.parseLog(l)?.name === "ChallengeCreated"; } catch { return false; }
      });
      const challengeId = event ? contract.interface.parseLog(event).args.challengeId : null;

      if (!challengeId) {
        addToast("error", "Failed to create challenge");
        return;
      }

      // Step 2: Start searching
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

      // Check if challenge was accepted
      try {
        const info = await getChallengeInfo(contract, searchState.challengeId);
        if (info.status !== 0) {
          // Challenge was accepted! Look for result
          clearInterval(interval);
          setCoinState("spinning");
          playFlipSound();

          // Query recent FlipResolved events
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
              if (won) playWinSound(); else playLoseSound();
              addToast(won ? "success" : "error", won ? `Won ${formatEther(myEvent.args.winnerPayout)} ETH!` : `Lost ${formatEther(myEvent.args.amount)} ETH`);
              refreshBalance();
              // Auto-reset after 4s
              setTimeout(() => { setCoinState("idle"); setResult(null); setShowResult(false); }, 4000);
            }, 3000);
          } else {
            // Event not found yet — still show as win/lose will come from polling
            setTimeout(() => { setCoinState("idle"); }, 5000);
          }
          return;
        }
      } catch {}

      // Timeout: switch to treasury
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

  // ═══ ACCEPT CHALLENGE (from game rows) ═══
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
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap" />
      <style>{CSS}</style>
      <div className="app">

        {/* LEFT SIDEBAR — CHAT */}
        <div className="sidebar">
          <div className="sidebar-header">
            <h3>General Chat</h3>
            <div className="online-badge"><div className="online-dot" />{Math.floor(Math.random() * 20) + 15}</div>
          </div>
          <div className="chat-messages">
            {MOCK_CHAT.map((m, i) => (
              <div className="chat-msg" key={i}>
                <div className="chat-avatar" style={{ background: m.color }}>{m.name.slice(0, 2).toUpperCase()}</div>
                <div>
                  <div><span className="chat-name" style={{ color: m.color }}>{m.name}</span><span className="chat-level">{m.level}</span></div>
                  <div className="chat-text">{m.msg}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="chat-input-wrap"><input placeholder="Type message..." /></div>
        </div>

        {/* MAIN COLUMN */}
        <div className="main-col">
          <div className="topbar">
            <div className="logo">
              <span className="logo-text"><span className="logo-gold">FLIPPER</span><span className="logo-dim">ROOMS</span></span>
              <span className="logo-badge">BASE</span>
            </div>
            <div className="nav">
              {["flip", "board", "fair"].map(v => (
                <button key={v} className={`nav-btn ${view === v ? "active" : ""}`} onClick={() => { setView(v); playClickSound(); if (v === "board" && seatHook.seats.length === 0) seatHook.refreshSeats(); }}>
                  {v === "flip" ? "Coinflip" : v === "board" ? "Board" : "Fair"}
                </button>
              ))}
            </div>
            <div className="header-right">
              {connected ? (
                <>
                  <div className={`balance-pill ${parseFloat(bal) > 0 ? "has-bal" : ""}`}>
                    <span style={{ color: "var(--gold)" }}>{parseFloat(bal).toFixed(4)}</span>
                    <span style={{ color: "var(--text-muted)" }}>ETH</span>
                  </div>
                  <div className="addr-pill" onClick={disconnect}>{shortAddr(address)}</div>
                </>
              ) : (
                <button className="connect-btn" onClick={connect}>Connect</button>
              )}
            </div>
          </div>

          <div className="content">
            <div className="game-area">

              {/* ═══ COINFLIP ═══ */}
              {view === "flip" && (
                <div>
                  <div className="hero-title">PLAY COINFLIP ON BASE</div>
                  <div className="hero-big">COINFLIP</div>

                  {!connected && (
                    <div className="onboarding">
                      Deposit ETH &rarr; Pick your bet &rarr; Flip &amp; win 2x.<br/>
                      50/50 odds. Winner takes 95%.
                    </div>
                  )}

                  {connected && parseFloat(bal) === 0 && (
                    <div className="deposit-nudge">
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                        Deposit ETH to start flipping
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                        Use the panel on the right (or below on mobile) to deposit funds
                      </div>
                    </div>
                  )}

                  {/* Mobile deposit bar */}
                  <div className="mobile-deposit">
                    <div className="mobile-bal">{parseFloat(bal).toFixed(4)} ETH</div>
                    <div className="mobile-deposit-row">
                      {["0.005", "0.01", "0.05"].map(v => (
                        <button key={v} onClick={() => setDepositAmt(v)} style={{ background: "var(--bg-elevated)", color: "var(--text-dim)", border: "1px solid var(--border)" }}>{v}</button>
                      ))}
                      <input placeholder="ETH" type="number" step="0.001" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} />
                      <button onClick={handleDeposit} disabled={isDepositing} style={{ background: "linear-gradient(135deg, #b8860b, #f7b32b)", color: "#0b0e11" }}>{isDepositing ? "..." : "Dep"}</button>
                      <button onClick={handleWithdraw} disabled={isDepositing} style={{ background: "transparent", color: "var(--red)", border: "1px solid var(--red)" }}>{isDepositing ? "..." : "W"}</button>
                    </div>
                  </div>

                  {connected && playerStats && (
                    <div className="stats-row">
                      <div className="stat-item"><span className="stat-label">W/L</span><span className="stat-val stat-green">{playerStats.wins}</span><span style={{ color: "var(--text-muted)" }}>/</span><span className="stat-val" style={{ color: "var(--red)" }}>{playerStats.losses}</span></div>
                      <div className="stat-item"><span className="stat-label">Streak</span><span className="stat-val stat-gold">{playerStats.streak > 0 ? `${playerStats.streak}x` : "\u2014"}</span></div>
                      <div className="stat-item"><span className="stat-label">Best</span><span className="stat-val">{playerStats.bestStreak}</span></div>
                    </div>
                  )}

                  <div className="section-label">Bet Amount (ETH)</div>
                  <div className="tier-bar">
                    {TIERS.map((t, i) => (
                      <button key={i} className={`tier-btn ${tier === i ? "active" : ""}`}
                        onClick={() => { setTier(i); playClickSound(); }}>{t.label}</button>
                    ))}
                  </div>

                  {treasuryMax && parseFloat(tierEth) > parseFloat(treasuryMax) && (
                    <div className="tier-warning">
                      &#9888; Treasury max bet is {parseFloat(treasuryMax).toFixed(4)} ETH. This tier may fail vs treasury.
                    </div>
                  )}

                  {/* COIN STAGE */}
                  <div className="coin-stage" style={{ position: "relative" }}>
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="coin-particle" style={{
                        left: `${15 + Math.random() * 70}%`, top: `${10 + Math.random() * 80}%`,
                        "--dur": `${3 + Math.random() * 3}s`, "--delay": `${i * 0.4}s`,
                        background: i % 2 === 0 ? "#f7b32b30" : "#ffd70020",
                      }} />
                    ))}
                    {/* Gold underglow */}
                    <div style={{ position: "absolute", bottom: "10%", left: "20%", width: "60%", height: "40%", background: "radial-gradient(ellipse at 50% 50%, #f7b32b10 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
                      <Coin3D state={coinState} onComplete={() => {}} />
                    </div>

                    {/* Result overlay on coin stage */}
                    {showResult && (
                      <div className="result-overlay" style={{
                        background: result === "win"
                          ? "radial-gradient(ellipse, #22c55e15, transparent 70%)"
                          : "radial-gradient(ellipse, #ef444415, transparent 70%)",
                      }}>
                        <div className={`result-text ${result === "win" ? "result-win" : "result-lose"}`}>
                          {result === "win" ? "YOU WON!" : "YOU LOST"}
                        </div>
                      </div>
                    )}

                    {/* SEARCH OVERLAY */}
                    {searchState && (
                      <div style={{
                        position:"absolute", inset:0, zIndex:20,
                        background:"rgba(11,14,17,0.92)", backdropFilter:"blur(4px)",
                        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                        borderRadius:16,
                      }}>
                        <div style={{fontSize:14, fontWeight:700, color:"#f7b32b", letterSpacing:2, marginBottom:20, animation:"searchPulse 1.5s ease infinite"}}>
                          SEARCHING FOR OPPONENT...
                        </div>
                        {/* Progress bar */}
                        <div style={{width:200, height:4, background:"#1f2937", borderRadius:2, marginBottom:16, overflow:"hidden"}}>
                          <div style={{
                            height:"100%", background:"linear-gradient(90deg, #f7b32b, #ffd700)",
                            borderRadius:2, width:`${((60-searchState.countdown)/60)*100}%`,
                            transition:"width 1s linear",
                          }}/>
                        </div>
                        <div style={{fontFamily:"'JetBrains Mono',monospace", fontSize:20, fontWeight:700, color:"#f1f5f9", marginBottom:4}}>
                          0:{searchState.countdown.toString().padStart(2,'0')}
                        </div>
                        <div style={{fontSize:11, color:"#475569", marginBottom:20}}>
                          Auto-flip vs treasury when timer ends
                        </div>
                        <button onClick={cancelSearch} style={{
                          padding:"8px 24px", borderRadius:8, background:"transparent",
                          border:"1px solid #ef4444", color:"#ef4444", fontSize:12,
                          fontWeight:600, cursor:"pointer", fontFamily:"'Outfit',sans-serif",
                          transition:"all 0.2s",
                        }}
                        onMouseEnter={e => e.target.style.background = "#ef444415"}
                        onMouseLeave={e => e.target.style.background = "transparent"}
                        >Cancel</button>
                      </div>
                    )}
                  </div>

                  {/* Separator */}
                  <div style={{ height: 1, background: "linear-gradient(90deg, transparent, #f7b32b25, transparent)", margin: "0 0 20px" }} />

                  {/* ═══ SINGLE FLIP BUTTON ═══ */}
                  <button
                    className={`flip-btn-main ${coinState === "idle" && connected && !searchState ? "pulse" : ""}`}
                    disabled={coinState !== "idle" || !connected || !!searchState}
                    onClick={handleFlip}
                  >
                    <div style={{ position: "relative", zIndex: 1 }}>
                      FLIP NOW
                      <div className="flip-sub">
                        {tierEth} ETH &middot; 2x Payout
                      </div>
                    </div>
                  </button>

                  {isEmbedded && connected && <div className="flip-hint">Auto-flip mode — no wallet popups</div>}
                  {!isEmbedded && connected && <div className="flip-hint">Login with email for instant flips</div>}

                  {/* CHALLENGES — ALL GAMES */}
                  <div className="games-header">
                    <div className="section-label" style={{ marginBottom: 0 }}>ALL GAMES</div>
                    <div className="games-count">{flipHook.challenges.length} OPEN</div>
                  </div>
                  {flipHook.challenges.length === 0 && (
                    <div className="empty-state-rich">
                      <div style={{ fontSize: 32, marginBottom: 8 }}>&#9889;</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>No games yet</div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Be the first — hit FLIP NOW to start</div>
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
                        <div className="game-amount">{c.amount}<span className="game-amount-eth">ETH</span></div>
                        {isMySearch ? (
                          <div className="game-status status-searching">SEARCHING</div>
                        ) : isMine ? (
                          <div className="game-status status-searching">WAITING</div>
                        ) : (
                          <div className="game-status status-open">JOINABLE</div>
                        )}
                        {isMine
                          ? <button className="cancel-btn" onClick={() => { playClickSound(); flipHook.cancelCh(c.id); setSearchState(null); }}>CANCEL</button>
                          : <button className="join-btn" onClick={() => handleAccept(c.id, c.creator)}>Join</button>
                        }
                      </div>
                    );
                  })}

                  {/* HISTORY */}
                  <div className="section-label" style={{ marginTop: 28 }}>RECENT FLIPS</div>
                  {flipHook.history.length === 0 && <div className="empty-state">No recent flips yet</div>}
                  {flipHook.history.slice(0, 8).map((h, i) => {
                    const won = address ? h.winner.toLowerCase() === address.toLowerCase() : null;
                    return (
                      <div className="game-row" key={i}>
                        <div className="game-players">
                          <GameAvatar address={h.winner} size={30} />
                          <span className="game-vs">VS</span>
                          <GameAvatar address={h.loser} size={30} />
                        </div>
                        <div className="game-amount" style={{ fontSize: 14 }}>{h.amount}<span className="game-amount-eth">ETH</span></div>
                        <div className={`game-status ${won ? "status-open" : "status-done"}`}>{won === null ? "FLIP" : won ? "WON" : "LOST"}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ═══ BOARD ═══ */}
              {view === "board" && (
                <div>
                  <div className="hero-title">REVENUE SEATS</div>
                  <div className="hero-big">THE BOARD</div>
                  <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 20, lineHeight: 1.6 }}>
                    256 Harberger-taxed seats. Owners earn a share of every flip's fees. Buy a seat, set a price, keep it funded.
                  </div>
                  {!seatHook.loading && seatHook.seats.length === 0 && (
                    <div style={{ textAlign: "center", marginBottom: 16 }}>
                      <button className="seat-buy-btn" style={{ width: "auto", padding: "10px 24px" }} onClick={() => { seatHook.refreshSeats(); }}>Load Seats</button>
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
                          <button onClick={() => setSelectedSeat(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>&#x2715;</button>
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
                          <div className="seat-actions" style={{ marginTop: 14 }}>
                            <button className="seat-buy-btn" onClick={async () => { await seatHook.claim(selectedSeat.id); setSelectedSeat(null); }}>Claim</button>
                            <button className="cancel-btn" onClick={async () => { await seatHook.abandon(selectedSeat.id); setSelectedSeat(null); }}>Abandon</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ FAIR ═══ */}
              {view === "fair" && (
                <div>
                  <div className="hero-title">PROVABLY FAIR</div>
                  <div className="hero-big">FAIRNESS</div>
                  <div style={{ maxWidth: 560 }}>
                    <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.8, marginBottom: 20 }}>
                      Every flip uses on-chain randomness via <code style={{ background: "var(--bg-card)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>block.prevrandao</code> combined with player addresses, timestamps, and counters.
                    </p>
                    <div style={{ padding: 18, background: "var(--bg-card)", borderRadius: 10, border: "1px solid var(--border)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, lineHeight: 2, color: "var(--text-dim)" }}>
                      <span style={{ color: "var(--green)" }}>// on-chain resolution</span><br />
                      rand = keccak256(abi.encodePacked(<br />
                      &nbsp;&nbsp;block.prevrandao, playerA, playerB,<br />
                      &nbsp;&nbsp;block.timestamp, challengeId, totalFlips<br />
                      ));<br />
                      winner = (rand % 2 == 0) ? playerA : playerB;
                    </div>
                    <div className="section-label" style={{ marginTop: 24 }}>Fee Breakdown (5% total)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {[{ l: "Seat Pool", v: "2.5%", c: "var(--green)" }, { l: "Referral", v: "1.0%", c: "var(--blue)" }, { l: "Protocol", v: "0.75%", c: "var(--gold)" }, { l: "Buyback", v: "0.5%", c: "#f97316" }, { l: "Jackpot", v: "0.25%", c: "var(--red)" }].map((f, i) => (
                        <div key={i} className="game-row" style={{ padding: "10px 14px", marginBottom: 0 }}>
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{f.l}</span>
                          <span style={{ color: f.c, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{f.v}</span>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16 }}>
                      Verify on <a href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>BaseScan</a>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT INFO PANEL */}
            <div className="info-panel">
              <div className="info-card">
                <div className="info-label">SESSION BALANCE</div>
                <div className={`info-balance ${parseFloat(bal) > 0 ? "has-bal" : ""}`}>
                  {parseFloat(bal).toFixed(4)} <span style={{ fontSize: 12, color: "var(--text-muted)" }}>ETH</span>
                </div>
                <div className="quick-btns">
                  {["0.005", "0.01", "0.05", "0.1"].map(v => (
                    <button key={v} className="quick-btn" onClick={() => setDepositAmt(v)}>{v}</button>
                  ))}
                  <button className="quick-btn" onClick={() => setDepositAmt(bal)} style={{ color: "var(--gold)" }}>MAX</button>
                </div>
                <input className="info-input" placeholder="Amount ETH" type="number" step="0.001" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} />
                <div className="info-actions">
                  <button className="btn-deposit" onClick={handleDeposit} disabled={isDepositing}>{isDepositing ? "..." : "Deposit"}</button>
                  <button className="btn-withdraw" onClick={handleWithdraw} disabled={isDepositing}>{isDepositing ? "..." : "Withdraw"}</button>
                </div>
              </div>

              <div className="info-section">
                <div className="info-label">PROTOCOL</div>
                {[
                  { l: "Total Bets", v: stats ? stats.totalFlips.toLocaleString() : "..." },
                  { l: "Treasury", v: stats ? `${Number(stats.treasury).toFixed(4)} \u039E` : "..." },
                  { l: "Max Bet", v: treasuryMax ? `${parseFloat(treasuryMax).toFixed(4)} \u039E` : "..." },
                  { l: "Jackpot", v: stats ? `${Number(stats.jackpot).toFixed(4)} \u039E` : "..." },
                  { l: "Volume", v: stats ? `${Number(stats.totalVolume).toFixed(3)} \u039E` : "..." },
                ].map((r, i) => (
                  <div className="info-row" key={i}>
                    <span className="info-row-label">{r.l}</span>
                    <span className="info-row-val">{r.v}</span>
                  </div>
                ))}
              </div>

              {connected && playerStats && (
                <div className="info-section">
                  <div className="info-label">YOUR STATS</div>
                  {[
                    { l: "Wins", v: playerStats.wins, c: "var(--green)" },
                    { l: "Losses", v: playerStats.losses, c: "var(--red)" },
                    { l: "Streak", v: playerStats.streak, c: "var(--gold)" },
                    { l: "Best", v: playerStats.bestStreak, c: "var(--gold)" },
                    { l: "Wagered", v: `${Number(playerStats.wagered).toFixed(3)} \u039E` },
                  ].map((r, i) => (
                    <div className="info-row" key={i}>
                      <span className="info-row-label">{r.l}</span>
                      <span className="info-row-val" style={r.c ? { color: r.c } : {}}>{r.v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FLIP MODAL (for joining others' challenges) */}
      {flipModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.3s ease",
        }}>
          <div style={{
            width: 600, maxWidth: "95vw", background: "#0b0e11",
            border: "1px solid #1f2937", borderRadius: 20, overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "18px 24px", borderBottom: "1px solid #1f2937",
            }}>
              <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Outfit',sans-serif", color: "#f1f5f9" }}>COINFLIP</span>
              <button onClick={() => setFlipModal(null)} style={{
                background: "none", border: "none", color: "#475569", fontSize: 20, cursor: "pointer"
              }}>&#x2715;</button>
            </div>

            {/* Players + Coin */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "32px 28px", position: "relative",
              background: "radial-gradient(ellipse at 50% 50%, #1a1510, #0b0e11)",
            }}>
              {/* Player A */}
              <div style={{ textAlign: "center", width: 140 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%", margin: "0 auto 10px",
                  background: `linear-gradient(135deg, ${addrColor(flipModal.playerA)}, ${addrColor(flipModal.playerA)}88)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 700, color: "#fff",
                  border: flipModal.state !== "spinning" && flipModal.winner === flipModal.playerA
                    ? "3px solid #22c55e" : "3px solid #1f2937",
                  boxShadow: flipModal.state !== "spinning" && flipModal.winner === flipModal.playerA
                    ? "0 0 20px #22c55e40" : "none",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {flipModal.playerA?.slice(2,4).toUpperCase()}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>
                  {flipModal.playerA === address ? "You" : shortAddr(flipModal.playerA)}
                </div>
                <div style={{
                  display: "inline-block", padding: "4px 12px", borderRadius: 8,
                  background: "#151a22", border: "1px solid #1f2937",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: "#f7b32b",
                }}>{flipModal.amount} ETH</div>
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
              <div style={{ textAlign: "center", width: 140 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%", margin: "0 auto 10px",
                  background: flipModal.playerB === "Treasury"
                    ? "linear-gradient(135deg, #f7b32b, #f7b32b88)"
                    : `linear-gradient(135deg, ${addrColor(flipModal.playerB)}, ${addrColor(flipModal.playerB)}88)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: flipModal.playerB === "Treasury" ? 28 : 20,
                  fontWeight: 700, color: "#fff",
                  border: flipModal.state !== "spinning" && flipModal.winner !== flipModal.playerA
                    ? "3px solid #22c55e" : "3px solid #1f2937",
                  boxShadow: flipModal.state !== "spinning" && flipModal.winner !== flipModal.playerA
                    ? "0 0 20px #22c55e40" : "none",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {flipModal.playerB === "Treasury" ? "T" : flipModal.playerB?.slice(2,4).toUpperCase() || "??"}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>
                  {flipModal.playerB === "Treasury" ? "Treasury" : shortAddr(flipModal.playerB)}
                </div>
                <div style={{
                  display: "inline-block", padding: "4px 12px", borderRadius: 8,
                  background: "#151a22", border: "1px solid #1f2937",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700,
                  color: flipModal.playerB === "Treasury" ? "#f7b32b" : "#22c55e",
                }}>{flipModal.amount} ETH</div>
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
                  color: flipModal.winner === flipModal.playerA ? "#22c55e" : "#ef4444",
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
              padding: "14px 24px", borderTop: "1px solid #1f2937",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#475569" }}>Fairness</div>
              {flipModal.txHash && (
                <a href={`${EXPLORER}/tx/${flipModal.txHash}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 10, color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>
                  {flipModal.txHash.slice(0,20)}...
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOASTS */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => removeToast(t.id)}>
            {t.message}
            {t.txHash && <a href={`${EXPLORER}/tx/${t.txHash}`} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>View tx</a>}
          </div>
        ))}
      </div>
    </>
  );
}
