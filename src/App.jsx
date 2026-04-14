import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { useWallet, useFlip, useSeats, useProtocol, useToasts, addToast, EXPLORER } from "./hooks.js";
import { getOpenChallenges, getChallengeInfo, decodeError } from "./contract.js";
import { CONTRACT_ADDRESS, TIERS } from "./config.js";
import { parseEther, formatEther } from "ethers";
import { playClickSound, playFlipSound, playWinSound, playLoseSound, playDepositSound, playStreakSound } from "./sounds.js";

const shortAddr = (a) => a ? `${a.slice(0,6)}...${a.slice(-4)}` : "???";
const addrColor = (a) => {
  if (!a) return "#444";
  const h = parseInt(a.slice(2,8), 16);
  const hue = h % 360;
  return `hsl(${hue}, 60%, 55%)`;
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

:root {
  --bg-deep: #080b12;
  --bg-main: #0c1019;
  --bg-card: #111722;
  --bg-card-hover: #161d2b;
  --bg-elevated: #1a2233;
  --border: #1e2a3a;
  --border-light: #253347;
  --text: #e2e8f0;
  --text-dim: #8892a4;
  --text-muted: #4a5568;
  --green: #10b981;
  --green-glow: #10b98140;
  --green-dark: #065f46;
  --red: #ef4444;
  --red-glow: #ef444440;
  --gold: #f59e0b;
  --gold-glow: #f59e0b30;
  --blue: #3b82f6;
  --teal: #14b8a6;
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

.app { display: flex; height: 100vh; overflow: hidden; }

/* SIDEBAR */
.sidebar {
  width: 260px; min-width: 260px; background: var(--bg-main);
  border-right: 1px solid var(--border); display: flex; flex-direction: column;
}
.sidebar-header {
  padding: 16px 18px; border-bottom: 1px solid var(--border);
  display: flex; justify-content: space-between; align-items: center;
  background: linear-gradient(180deg, var(--bg-main), transparent);
}
.sidebar-header h3 { font-size: 13px; font-weight: 600; color: var(--text-dim); letter-spacing: 0.5px; }
.online-badge { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--teal); }
.online-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--teal); animation: blink 2s infinite; }

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
.chat-input-wrap input:focus { border-color: var(--green); box-shadow: 0 0 12px #10b98118; }

/* MAIN COLUMN */
.main-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

/* TOPBAR */
.topbar {
  height: 56px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; border-bottom: 1px solid var(--border); background: var(--bg-main);
  flex-shrink: 0;
}
.logo { display: flex; align-items: center; gap: 8px; }
.logo-text { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; }
.logo-green { color: var(--green); text-shadow: 0 0 20px #10b98130; }
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
.nav-btn.active { color: var(--green); background: #10b98110; }
.nav-btn.active::after {
  content: ''; position: absolute; bottom: 2px; left: 20%; right: 20%;
  height: 2px; background: var(--green); border-radius: 2px;
}

.header-right { display: flex; align-items: center; gap: 12px; }
.balance-pill {
  display: flex; align-items: center; gap: 8px; padding: 6px 14px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
  font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600;
  transition: box-shadow 0.3s;
}
.balance-pill.has-bal { box-shadow: 0 0 15px #10b98120; }
.connect-btn {
  padding: 8px 20px; border: none; border-radius: 8px; font-size: 13px;
  font-weight: 700; font-family: 'Outfit', sans-serif; cursor: pointer;
  background: var(--green); color: #000; transition: all 0.2s;
  box-shadow: 0 2px 12px #10b98130;
}
.connect-btn:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 4px 20px #10b98140; }
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
  width: 220px; min-width: 220px; background: var(--bg-main);
  border-left: 1px solid var(--border); overflow-y: auto; padding: 20px 16px;
}

.section-label {
  font-size: 11px; font-weight: 700; color: var(--text-muted);
  letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px;
}

/* HERO */
.hero-title { font-size: 11px; color: var(--text-muted); letter-spacing: 2px; font-weight: 600; margin-bottom: 4px; animation: fadeInUp 0.5s ease 0.1s both; }
.hero-big {
  font-size: 42px; font-weight: 900; letter-spacing: -2px;
  background: linear-gradient(135deg, #e2e8f0 0%, #94a3b8 50%, #e2e8f0 100%);
  background-size: 200% 200%;
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  animation: shimmer 4s ease infinite, fadeInUp 0.5s ease 0.2s both;
  margin-bottom: 20px;
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
  flex: 1; padding: 12px 0; border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg-card); color: var(--text-dim); font-size: 13px; font-weight: 600;
  font-family: 'JetBrains Mono', monospace; cursor: pointer; transition: all 0.25s;
  position: relative;
}
.tier-btn:hover { border-color: var(--border-light); background: var(--bg-card-hover); color: var(--text); }
.tier-btn.active {
  border-color: var(--green); color: var(--green);
  background: linear-gradient(135deg, #10b98110, #10b98108);
  box-shadow: 0 0 25px #10b98130, 0 0 60px #10b98110;
  transform: scale(1.02);
}
.tier-btn.active::after {
  content: ''; position: absolute; top: -1px; left: 20%; right: 20%;
  height: 2px; background: var(--green); border-radius: 2px;
}

/* COIN STAGE */
.coin-stage {
  background: radial-gradient(ellipse at 50% 30%, #111d2e 0%, var(--bg-deep) 70%);
  border: 1px solid var(--border); border-radius: 16px;
  height: 300px; margin-bottom: 24px; position: relative; overflow: hidden;
  animation: fadeInUp 0.5s ease 0.5s both;
  transition: border-color 0.3s;
}
.coin-stage.lose-flash { border-color: var(--red); }
.coin-stage::before {
  content: ''; position: absolute; inset: -20px;
  background: radial-gradient(circle at 50% 50%, #10b98125 0%, transparent 50%);
  animation: coinGlow 3s ease infinite; pointer-events: none; z-index: 0;
}
.coin-stage::after {
  content: ''; position: absolute; inset: 0;
  background-image: linear-gradient(#ffffff04 1px, transparent 1px), linear-gradient(90deg, #ffffff04 1px, transparent 1px);
  background-size: 30px 30px; pointer-events: none; border-radius: 16px;
}
.coin-particle {
  position: absolute; width: 3px; height: 3px; border-radius: 50%;
  background: #10b98150; pointer-events: none; z-index: 0;
  animation: float var(--dur) ease-in-out var(--delay) infinite;
}

/* FLIP BUTTONS */
.flip-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 32px; animation: fadeInUp 0.5s ease 0.6s both; }
.flip-btn {
  padding: 22px 0; border-radius: 12px; border: none; cursor: pointer;
  font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 700;
  letter-spacing: 0.5px; transition: all 0.25s; position: relative; overflow: hidden;
}
.flip-btn::before {
  content: ''; position: absolute; top: -50%; left: -50%;
  width: 200%; height: 200%;
  background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%);
  transform: translateX(-100%); transition: transform 0.6s;
}
.flip-btn:hover::before { transform: translateX(100%); }
.flip-btn::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 50%);
  pointer-events: none;
}
.flip-btn:hover { transform: translateY(-3px); }
.flip-btn:active { transform: translateY(-1px); }
.flip-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.flip-btn:disabled::before { display: none; }
.flip-btn-pvp {
  background: linear-gradient(135deg, #0d7a56, #10b981);
  color: #fff; box-shadow: 0 4px 24px var(--green-glow);
}
.flip-btn-pvp:hover { box-shadow: 0 8px 32px #10b98150; }
.flip-btn-treasury {
  background: linear-gradient(135deg, #92680a, #f59e0b);
  color: #000; box-shadow: 0 4px 24px var(--gold-glow);
}
.flip-btn-treasury:hover { box-shadow: 0 8px 32px #f59e0b40; }
.flip-sub { font-size: 11px; font-weight: 500; opacity: 0.7; margin-top: 4px; }

/* GAME ROWS */
.games-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.games-count { font-size: 13px; font-weight: 700; color: var(--green); font-family: 'JetBrains Mono', monospace; }
.game-row {
  display: flex; align-items: center; padding: 14px 18px;
  background: linear-gradient(135deg, #111722 0%, #0f1520 100%);
  border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px;
  transition: all 0.25s; gap: 16px;
}
.game-row:hover {
  border-color: #2a3a50;
  background: linear-gradient(135deg, #151e2c 0%, #121925 100%);
  transform: translateX(3px); box-shadow: -3px 0 15px #10b98110;
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
  font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700;
  color: var(--text); min-width: 120px; text-align: center;
}
.game-amount-eth { font-size: 11px; color: var(--text-muted); margin-left: 4px; }
.game-status {
  font-size: 10px; font-weight: 700; letter-spacing: 1px; padding: 4px 10px;
  border-radius: 6px; text-transform: uppercase; min-width: 80px; text-align: center;
}
.status-open { background: #10b98118; color: var(--green); border: 1px solid #10b98130; }
.status-done { background: var(--bg-elevated); color: var(--text-muted); }

.join-btn {
  padding: 8px 22px; border: none; border-radius: 8px; background: var(--green);
  color: #000; font-size: 12px; font-weight: 700; cursor: pointer;
  font-family: 'Outfit', sans-serif; transition: all 0.2s;
}
.join-btn:hover { box-shadow: 0 0 15px #10b98140; transform: scale(1.05); }
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
.info-balance.has-bal { color: var(--green); text-shadow: 0 0 20px #10b98130; }
.quick-btns { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
.quick-btn {
  padding: 5px 10px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-card); color: var(--text-dim); font-size: 10px;
  font-family: 'JetBrains Mono', monospace; font-weight: 600; cursor: pointer;
  transition: all 0.2s;
}
.quick-btn:hover { border-color: var(--green); color: var(--green); background: #10b98108; }
.info-input {
  width: 100%; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 6px; padding: 8px 10px; color: var(--text); font-size: 12px;
  font-family: 'JetBrains Mono', monospace; outline: none; margin-bottom: 8px;
  transition: all 0.2s;
}
.info-input:focus { border-color: var(--green); box-shadow: 0 0 10px #10b98115; }
.info-actions { display: flex; gap: 6px; }
.btn-deposit {
  flex: 1; padding: 8px; border: none; border-radius: 6px; font-size: 11px;
  font-weight: 700; font-family: 'Outfit', sans-serif; cursor: pointer;
  background: var(--green); color: #000; transition: all 0.2s;
  box-shadow: 0 2px 10px #10b98130;
}
.btn-deposit:hover { box-shadow: 0 4px 16px #10b98140; }
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
  font-size: 12px; border-bottom: 1px solid #1e2a3a20;
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
.result-win { color: var(--green); text-shadow: 0 0 40px var(--green-glow), 0 0 80px #10b98120; }
.result-lose { color: var(--red); text-shadow: 0 0 40px var(--red-glow), 0 0 80px #ef444420; }

.shaking { animation: shake 0.5s ease; }

/* TOASTS */
.toast-container { position: fixed; top: 70px; right: 20px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; }
.toast {
  padding: 12px 18px; border-radius: 10px; font-size: 12px; font-weight: 500;
  animation: slideIn 0.3s ease; min-width: 250px; border: 1px solid; cursor: pointer;
  backdrop-filter: blur(8px);
}
.toast-success { background: #10b98118; border-color: #10b98130; color: var(--green); }
.toast-error { background: #ef444418; border-color: #ef444430; color: var(--red); }
.toast-pending { background: #f59e0b18; border-color: #f59e0b30; color: var(--gold); }

.empty-state { text-align: center; padding: 40px; color: var(--text-muted); font-size: 13px; }
.flip-hint { text-align: center; font-size: 11px; color: var(--text-muted); margin-top: 10px; }

@media (max-width: 1024px) {
  .sidebar { display: none; }
  .info-panel { display: none; }
  .game-area { padding: 16px; }
  .hero-big { font-size: 28px; }
  .coin-stage { height: 220px; }
}
`;

const MOCK_CHAT = [
  { name: "BasedDegen", level: 12, msg: "LFG", color: "#10b981" },
  { name: "FlipperKing", level: 34, msg: "just hit 5x streak", color: "#f59e0b" },
  { name: "0xWhale", level: 8, msg: "bought seat #42", color: "#3b82f6" },
  { name: "CryptoNova", level: 21, msg: "treasury needs funding", color: "#ec4899" },
  { name: "SigmaGrind", level: 15, msg: "0.05 tier is the sweet spot", color: "#8b5cf6" },
  { name: "MoonBoi", level: 5, msg: "wen jackpot", color: "#14b8a6" },
  { name: "AlphaSeeker", level: 29, msg: "seat yield looking good today", color: "#f97316" },
  { name: "DegenApe", level: 7, msg: "lost 3 in a row lol", color: "#ef4444" },
  { name: "BaseMaxi", level: 18, msg: "this is the best coinflip on base", color: "#06b6d4" },
  { name: "FlipMaster", level: 44, msg: "GG everyone", color: "#a855f7" },
];

// ═══════════════════════════════════════
//  3D COIN
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0); dir.position.set(3, 5, 4); scene.add(dir);
    const rim = new THREE.DirectionalLight(0x10b981, 0.6); rim.position.set(-3, -2, 3); scene.add(rim);
    const accent = new THREE.PointLight(0x10b981, 0.8, 10); accent.position.set(0, 0, 3); scene.add(accent);

    const coinGroup = new THREE.Group(); scene.add(coinGroup);
    const r = 1.1, th = 0.1, seg = 64;
    const mat = new THREE.MeshStandardMaterial({ color: 0x10b981, metalness: 0.85, roughness: 0.2, emissive: 0x042f22, emissiveIntensity: 0.15 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, th, seg), mat);
    body.rotation.x = Math.PI / 2; coinGroup.add(body);
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x059669, metalness: 0.9, roughness: 0.15 });
    coinGroup.add(new THREE.Mesh(new THREE.TorusGeometry(r, th / 2, 16, seg), edgeMat));

    const makeLabel = (text, z, flip) => {
      const c = document.createElement("canvas"); c.width = 256; c.height = 256;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#04201580"; ctx.fillRect(0,0,256,256);
      ctx.fillStyle = "#ffffff"; ctx.font = "bold 120px 'Arial'";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(text, 128, 128);
      const fMat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), transparent: true, metalness: 0.5, roughness: 0.4 });
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
    return () => { cancelAnimationFrame(raf); renderer.dispose(); if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement); };
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
  const [coinState, setCoinState] = useState("idle");
  const [flipResult, setFlipResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [depositAmt, setDepositAmt] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [confetti, setConfetti] = useState([]);
  const [playerStats, setPlayerStats] = useState(null);

  // Load data
  useEffect(() => {
    if (!contract) return;
    flipHook.refreshChallenges();
    flipHook.refreshHistory();
    protocol.refreshStats();
  }, [contract]);

  // Polling
  useEffect(() => {
    if (!contract) return;
    const iv = setInterval(() => {
      refreshBalance();
      protocol.refreshStats();
      flipHook.refreshChallenges();
      flipHook.refreshHistory();
    }, 15000);
    return () => clearInterval(iv);
  }, [contract, refreshBalance]);

  // Player stats
  useEffect(() => {
    if (!contract || !address) return;
    import("./contract.js").then(({ getPlayerInfo }) => {
      getPlayerInfo(contract, address).then(setPlayerStats).catch(() => {});
    });
  }, [contract, address, sessionBalance]);

  const onFlipDone = useCallback(() => {
    setShowResult(true);
    if (flipResult === "win") {
      playWinSound();
      setConfetti(Array.from({ length: 30 }, (_, i) => ({
        id: i, left: Math.random() * 100, delay: Math.random() * 0.6,
        color: ["var(--green)", "var(--gold)", "var(--blue)", "#fff"][i % 4],
        size: 4 + Math.random() * 5,
      })));
    } else {
      playLoseSound();
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    }
    setTimeout(() => { setCoinState("idle"); setShowResult(false); setFlipResult(null); setConfetti([]); refreshBalance(); }, 3500);
  }, [flipResult, refreshBalance]);

  const handleFlipTreasury = async () => {
    if (coinState !== "idle" || !connected) return;
    playClickSound();
    if (isEmbedded) { setCoinState("spinning"); playFlipSound(); }
    const result = await flipHook.flipTreasury(TIERS[tier].wei, 0);
    if (!result) { setCoinState("idle"); return; }
    if (!isEmbedded) { setCoinState("spinning"); playFlipSound(); }
    const won = result.winner.toLowerCase() === address?.toLowerCase();
    setFlipResult(won ? "win" : "lose");
    setCoinState(won ? "win" : "lose");
    if (won && result.winnerStreak >= 3) playStreakSound(result.winnerStreak);
  };

  const handleFlipPvp = async () => {
    if (coinState !== "idle" || !connected) return;
    playClickSound();
    if (isEmbedded) { setCoinState("spinning"); playFlipSound(); }
    await flipHook.flipPvp(TIERS[tier].wei, 0);
    setCoinState("idle");
  };

  const handleAccept = async (challengeId) => {
    if (coinState !== "idle" || !connected) return;
    playClickSound();
    if (isEmbedded) { setCoinState("spinning"); playFlipSound(); }
    const result = await flipHook.acceptCh(challengeId, 0);
    if (!result) { setCoinState("idle"); return; }
    if (!isEmbedded) { setCoinState("spinning"); playFlipSound(); }
    const won = result.winner.toLowerCase() === address?.toLowerCase();
    setFlipResult(won ? "win" : "lose");
    setCoinState(won ? "win" : "lose");
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
      <div className="app">

        {/* LEFT SIDEBAR */}
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
              <span className="logo-text"><span className="logo-green">FLIPPER</span><span className="logo-dim">ROOMS</span></span>
              <span className="logo-badge">BASE</span>
            </div>
            <div className="nav">
              {["flip", "board", "fair"].map(v => (
                <button key={v} className={`nav-btn ${view === v ? "active" : ""}`} onClick={() => { setView(v); playClickSound(); }}>
                  {v === "flip" ? "Coinflip" : v === "board" ? "Board" : "Fair"}
                </button>
              ))}
            </div>
            <div className="header-right">
              {connected ? (
                <>
                  <div className={`balance-pill ${parseFloat(bal) > 0 ? "has-bal" : ""}`}>
                    <span style={{ color: "var(--green)" }}>{parseFloat(bal).toFixed(4)}</span>
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
                <div className={shaking ? "shaking" : ""}>
                  <div className="hero-title">PLAY COINFLIP ON BASE</div>
                  <div className="hero-big">COINFLIP</div>

                  {connected && playerStats && (
                    <div className="stats-row">
                      <div className="stat-item"><span className="stat-label">W/L</span><span className="stat-val stat-green">{playerStats.wins}</span><span style={{ color: "var(--text-muted)" }}>/</span><span className="stat-val" style={{ color: "var(--red)" }}>{playerStats.losses}</span></div>
                      <div className="stat-item"><span className="stat-label">Streak</span><span className="stat-val stat-gold">{playerStats.streak > 0 ? `${playerStats.streak}x` : "—"}</span></div>
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

                  <div className={`coin-stage ${flipResult === "lose" && showResult ? "lose-flash" : ""}`} style={{ position: "relative" }}>
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="coin-particle" style={{
                        left: `${15 + Math.random() * 70}%`, top: `${10 + Math.random() * 80}%`,
                        "--dur": `${3 + Math.random() * 3}s`, "--delay": `${i * 0.4}s`,
                      }} />
                    ))}
                    <Coin3D state={coinState} onComplete={onFlipDone} />
                    {showResult && flipResult && (
                      <div className="result-overlay" style={{ background: flipResult === "win" ? "radial-gradient(circle, #10b98120, transparent 70%)" : "radial-gradient(circle, #ef444420, transparent 70%)" }}>
                        <div className={`result-text ${flipResult === "win" ? "result-win" : "result-lose"}`}>
                          {flipResult === "win" ? "YOU WIN" : "YOU LOSE"}
                        </div>
                      </div>
                    )}
                    {confetti.map(c => (
                      <div key={c.id} style={{
                        position: "absolute", top: 0, left: `${c.left}%`,
                        width: c.size || 6, height: c.size || 6,
                        background: c.color, borderRadius: Math.random() > 0.5 ? "50%" : "1px",
                        animation: `confetti ${1.2 + Math.random() * 1.2}s ${c.delay}s ease forwards`, zIndex: 20
                      }} />
                    ))}
                  </div>

                  <div className="flip-buttons">
                    <button className="flip-btn flip-btn-pvp" disabled={coinState !== "idle" || !connected || flipHook.isFlipping}
                      onClick={handleFlipPvp}>PVP FLIP<div className="flip-sub">{tierEth} ETH · Create Challenge</div></button>
                    <button className="flip-btn flip-btn-treasury" disabled={coinState !== "idle" || !connected || flipHook.isFlipping}
                      onClick={handleFlipTreasury}>VS TREASURY<div className="flip-sub">{tierEth} ETH · Instant Flip</div></button>
                  </div>

                  {isEmbedded && connected && <div className="flip-hint">Auto-flip mode — no wallet popups</div>}
                  {!isEmbedded && connected && <div className="flip-hint">Login with email for instant flips</div>}

                  {/* CHALLENGES */}
                  <div className="games-header">
                    <div className="section-label" style={{ marginBottom: 0 }}>ALL GAMES</div>
                    <div className="games-count">{flipHook.challenges.length} OPEN</div>
                  </div>
                  {flipHook.challenges.length === 0 && <div className="empty-state">No open challenges</div>}
                  {flipHook.challenges.map(c => (
                    <div className="game-row" key={c.id}>
                      <div className="game-players">
                        <GameAvatar address={c.creator} />
                        <span className="game-vs">VS</span>
                        <div className="game-avatar-empty">?</div>
                      </div>
                      <div className="game-amount">{c.amount}<span className="game-amount-eth">ETH</span></div>
                      <div className="game-status status-open">JOINABLE</div>
                      {c.creator?.toLowerCase() === address?.toLowerCase()
                        ? <button className="cancel-btn" onClick={() => { playClickSound(); flipHook.cancelCh(c.id); }}>CANCEL</button>
                        : <button className="join-btn" onClick={() => handleAccept(c.id)}>Join</button>
                      }
                    </div>
                  ))}

                  {/* HISTORY */}
                  <div className="section-label" style={{ marginTop: 28 }}>RECENT FLIPS</div>
                  {flipHook.history.length === 0 && <div className="empty-state">No recent flips</div>}
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
                  <div className="empty-state">Board tab — 256 seats with Harberger tax yield<br/>Coming in next update</div>
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
              <div className="info-section">
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
                  { l: "Treasury", v: stats ? `${Number(stats.treasury).toFixed(4)} Ξ` : "..." },
                  { l: "Jackpot", v: stats ? `${Number(stats.jackpot).toFixed(4)} Ξ` : "..." },
                  { l: "Volume", v: stats ? `${Number(stats.totalVolume).toFixed(3)} Ξ` : "..." },
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
                    { l: "Wins", v: playerStats.wins },
                    { l: "Losses", v: playerStats.losses },
                    { l: "Streak", v: playerStats.streak },
                    { l: "Best", v: playerStats.bestStreak },
                    { l: "Wagered", v: `${Number(playerStats.wagered).toFixed(3)} Ξ` },
                  ].map((r, i) => (
                    <div className="info-row" key={i}>
                      <span className="info-row-label">{r.l}</span>
                      <span className="info-row-val">{r.v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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
