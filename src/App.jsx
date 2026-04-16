import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useWallet, useFlip, useSeats, useProtocol, useToasts, addToast, EXPLORER, useGlobalFeed, useUserProfile, useTokenBalance } from "./hooks.js";

const Coin3D = lazy(() => import("./Coin3D.jsx"));
import { getPlayerInfo, getTreasuryMaxBet, getSeatInfo, decodeError, fmtTokens, mintSeat, buyOutSeat, addDeposit, updateSeatPrice, abandonSeat, claimRewards, claimMultipleRewards, withdrawDeposit, distributeYield, claimMockFlipper } from "./contract.js";
import { SEATS_ADDRESS, COINFLIP_ADDRESS, MOCK_FLIPPER_ADDRESS, TIERS, CHAIN_ID, CHAIN_ID_HEX, TOTAL_SEATS, LEVEL_NAMES, LEVEL_COLORS, EXPLORER as EXPLORER_URL } from "./config.js";
import { parseEther, parseUnits, formatEther, formatUnits } from "ethers";
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
  return `hsl(${h % 360}, 60%, 55%)`;
};

// ═══════════════════════════════════════
//  CASINO CSS — V8
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

@keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 20px var(--gold-glow), 0 0 40px #f7b32b20; }
  50% { box-shadow: 0 0 35px var(--gold-glow), 0 0 70px #f7b32b30; }
}
@keyframes shimmer { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes feedSlide { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes streakPop { 0% { transform: scale(0); } 50% { transform: scale(1.3); } 100% { transform: scale(1); } }
@keyframes spinBorderReal { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
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
@keyframes connPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
@keyframes avatarBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes dramaPulse {
  0%, 100% { box-shadow: 0 0 20px rgba(247,179,43,0.1); }
  50% { box-shadow: 0 0 40px rgba(247,179,43,0.4), 0 0 80px rgba(247,179,43,0.15); }
}
@keyframes dramaFlash { 0% { opacity: 0; } 50% { opacity: 0.3; } 100% { opacity: 0; } }

/* ═══ LAYOUT ═══ */
.app-root {
  height: 100vh; width: 100vw; overflow: hidden;
  display: grid; grid-template-columns: 280px 1fr 300px;
  background: linear-gradient(180deg, #07090d 0%, #0a0d13 100%);
  position: relative;
}
.app-root::before {
  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: 0.015;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
}

/* ═══ LEFT SIDEBAR — FEED ═══ */
.chat-sidebar {
  display: flex; flex-direction: column; height: 100%;
  background: linear-gradient(180deg, #0a0d14 0%, #07090d 100%);
  border-right: 1px solid var(--border); position: relative; z-index: 1;
}
.chat-header { padding: 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
.chat-header h2 { font-size: 14px; font-weight: 700; color: var(--text); }
.online-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 8px #22c55e60; animation: blink 2s infinite; }
.chat-messages { flex: 1; overflow-y: auto; padding: 0; display: flex; flex-direction: column; gap: 0; }
.chat-msg { display: flex; align-items: flex-start; gap: 8px; padding: 10px 18px; border-bottom: 1px solid #0e1219; }
.chat-avatar { width: 32px; height: 32px; min-width: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace; }
.chat-msg-content { flex: 1; min-width: 0; }
.chat-name { font-size: 12px; font-weight: 600; }
.chat-text { font-size: 12px; color: var(--text-dim); word-break: break-word; margin-top: 2px; }

/* ═══ CENTER ═══ */
.game-center {
  border-left: 1px solid var(--border); border-right: 1px solid var(--border);
  overflow: hidden; display: flex; flex-direction: column;
  position: relative; z-index: 1;
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
.logo-badge { font-size: 9px; font-weight: 800; letter-spacing: 1px; padding: 3px 8px; border-radius: 4px; background: linear-gradient(135deg, var(--gold), var(--gold-dark)); color: #07090d; }
.nav { display: flex; gap: 4px; padding: 3px; background: rgba(255,255,255,0.03); border-radius: 8px; }
.nav-btn { padding: 8px 18px; border: none; background: transparent; color: var(--text-muted); font-size: 12px; font-weight: 600; font-family: 'Chakra Petch', sans-serif; cursor: pointer; border-radius: 6px; transition: all 0.2s; }
.nav-btn:hover { color: var(--text-dim); }
.nav-btn.active { background: linear-gradient(135deg, var(--gold), #c98c1d); color: #07090d; font-weight: 700; }
.header-right { display: flex; align-items: center; gap: 10px; }
.connect-btn { padding: 8px 20px; border: none; border-radius: 10px; font-size: 13px; font-weight: 800; font-family: 'Chakra Petch', sans-serif; cursor: pointer; background: linear-gradient(135deg, var(--gold), var(--gold-dark)); color: #07090d; box-shadow: 0 4px 16px rgba(247,179,43,0.3); transition: all 0.2s; }
.connect-btn:hover { box-shadow: 0 6px 24px rgba(247,179,43,0.45); transform: translateY(-1px); }
.addr-pill { padding: 6px 14px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; font-size: 12px; color: var(--text-dim); cursor: pointer; font-family: 'JetBrains Mono', monospace; transition: all 0.2s; }
.addr-pill:hover { border-color: var(--border-light); }
.game-scroll { flex: 1; overflow-y: auto; }

/* Hero */
.hero-section { position: relative; padding: 28px 24px 20px; text-align: center; }
.hero-section::before { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(247,179,43,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(247,179,43,0.03) 1px, transparent 1px); background-size: 40px 40px; opacity: 0.5; pointer-events: none; }
.hero-section::after { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(247,179,43,0.06) 0%, transparent 60%); pointer-events: none; }
.hero-inner { position: relative; z-index: 1; }
.hero-title-text { font-family: 'Orbitron', sans-serif; font-size: 48px; font-weight: 900; letter-spacing: 6px; margin-bottom: 4px; background: linear-gradient(180deg, #ffc94a 0%, #f7b32b 50%, #a87a18 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; line-height: 1; }
.hero-sub { color: var(--text-muted); font-size: 13px; margin-bottom: 8px; }

/* Graduation progress */
.grad-bar-wrap { max-width: 400px; margin: 0 auto 20px; }
.grad-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.grad-label { font-size: 10px; color: var(--text-muted); letter-spacing: 1.5px; font-weight: 700; }
.grad-count { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--gold); font-weight: 700; }
.grad-track { height: 6px; background: #151a22; border-radius: 3px; overflow: hidden; }
.grad-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #b8860b, #f7b32b, #ffd700); transition: width 1s ease; }

/* Coin stage */
.coin-wrapper { position: relative; border-radius: 16px; padding: 3px; margin: 0 auto 20px; max-width: 620px; }
.coin-wrapper .border-spin { position: absolute; inset: -2px; border-radius: 18px; opacity: 0; overflow: hidden; transition: opacity 0.3s; }
.coin-wrapper.spinning .border-spin { opacity: 1; }
.coin-wrapper .border-spin::before { content: ''; position: absolute; inset: -50%; background: conic-gradient(transparent 0deg, transparent 60deg, #b8860b 120deg, #f7b32b 160deg, #ffd700 200deg, #f7b32b 240deg, #b8860b 280deg, transparent 300deg, transparent 360deg); animation: spinBorderReal 0.8s linear infinite; }
.coin-wrapper .border-flash { position: absolute; inset: 0; border-radius: 16px; opacity: 0; }
.coin-wrapper.result-win .border-flash { animation: flashToGreen 1.8s ease forwards; }
.coin-wrapper.result-lose .border-flash { animation: flashToRed 1.8s ease forwards; }
.coin-stage-inner { position: relative; z-index: 1; border-radius: 13px; overflow: hidden; background: #0b0e11; padding: 20px 16px 16px; }
.coin-stage-inner .grid-overlay { position: absolute; inset: 0; opacity: 0.03; pointer-events: none; background-image: linear-gradient(#f7b32b 1px, transparent 1px), linear-gradient(90deg, #f7b32b 1px, transparent 1px); background-size: 28px 28px; }
.coin-stage-inner .glow-bg { position: absolute; inset: 0; pointer-events: none; transition: all 0.8s ease; background: radial-gradient(ellipse at 50% 45%, #f7b32b08 0%, transparent 50%); }
.coin-wrapper.spinning .glow-bg { background: radial-gradient(ellipse at 50% 45%, #f7b32b1a 0%, transparent 55%); }
.coin-wrapper.result-win .glow-bg { background: radial-gradient(ellipse at 50% 45%, #22c55e15 0%, transparent 55%); }
.coin-wrapper.result-lose .glow-bg { background: radial-gradient(ellipse at 50% 45%, #ef444412 0%, transparent 55%); }
.coin-wrapper.spinning .coin-stage-inner { animation: dramaPulse 1.2s ease infinite; }
.connector-line { position: absolute; top: 50%; left: 0; right: 0; height: 1px; z-index: 1; background: linear-gradient(90deg, transparent 5%, #f7b32b10 25%, #f7b32b10 75%, transparent 95%); transition: all 0.5s; }
.coin-wrapper.spinning .connector-line { background: linear-gradient(90deg, transparent 5%, #f7b32b25 25%, #f7b32b25 75%, transparent 95%); animation: connPulse 0.8s ease infinite; }
.arena { display: flex; align-items: center; justify-content: space-between; padding: 20px 10px; position: relative; z-index: 2; min-height: 200px; }
.arena-player { display: flex; flex-direction: column; align-items: center; width: 120px; flex-shrink: 0; transition: all 0.6s; }
.arena-player.winner { transform: scale(1.06); }
.arena-player.loser { transform: scale(0.9); opacity: 0.45; }
.arena-avatar { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: 'Orbitron', sans-serif; font-size: 15px; font-weight: 800; color: #fff; border: 3px solid #1c2430; transition: all 0.6s; }
.arena-avatar.avatar-you { background: linear-gradient(135deg, #2563eb, #3b82f6); border-color: #3b82f640; }
.arena-avatar.avatar-opp { background: linear-gradient(135deg, #b8860b, #f7b32b); border-color: #f7b32b40; }
.arena-avatar.avatar-win { border-color: #22c55e; box-shadow: 0 0 18px #22c55e30; }
.arena-avatar.avatar-lose { border-color: #ef4444; box-shadow: 0 0 12px #ef444420; opacity: 0.6; }
.arena-avatar.avatar-bounce { animation: avatarBounce 1s ease infinite; }
.arena-name { font-size: 12px; font-weight: 700; color: #c8d0da; margin-top: 8px; transition: color 0.5s; }
.arena-name.name-win { color: #22c55e; }
.arena-name.name-lose { color: #94a3b8; opacity: 0.5; }
.arena-bet { margin-top: 4px; padding: 3px 10px; border-radius: 6px; background: #131820; border: 1px solid #1c2430; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: #f7b32b; transition: all 0.5s; }
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
.action-btn.btn-change { background: transparent; border: 1px solid #1c2430; color: #94a3b8; }
.streak-bar { display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 10px; min-height: 20px; position: relative; z-index: 2; }
.streak-dot { width: 18px; height: 18px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 800; font-family: 'JetBrains Mono', monospace; transition: all 0.3s; }
.streak-dot.streak-win { background: #22c55e18; border: 1px solid #22c55e40; color: #22c55e; }
.streak-dot.streak-lose { background: #ef444418; border: 1px solid #ef444440; color: #ef4444; }

/* Tier bar */
.tier-bar { display: flex; gap: 6px; justify-content: center; margin-bottom: 24px; }
.tier-btn { padding: 10px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card); color: var(--text-muted); font-size: 13px; font-weight: 600; font-family: 'JetBrains Mono', monospace; cursor: pointer; transition: all 0.25s; }
.tier-btn:hover { border-color: var(--border-light); color: var(--text-dim); }
.tier-btn.active { border-color: var(--gold); color: var(--gold); background: #f7b32b12; box-shadow: 0 0 20px #f7b32b30; }

/* Flip button */
.flip-btn-main { width: 100%; max-width: 400px; padding: 20px 0; border-radius: 14px; border: none; background: linear-gradient(135deg, #b8860b, #f7b32b, #ffd700); color: #0b0e11; font-size: 20px; font-weight: 800; cursor: pointer; font-family: 'Chakra Petch', sans-serif; letter-spacing: 1px; box-shadow: 0 0 30px #f7b32b40, 0 0 60px #f7b32b15; transition: all 0.2s; position: relative; overflow: hidden; }
.flip-btn-main:not(:disabled) { animation: pulse-glow 2.5s ease infinite; }
.flip-btn-main::before { content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%); transform: translateX(-100%); transition: transform 0.6s; }
.flip-btn-main:hover::before { transform: translateX(100%); }
.flip-btn-main:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 0 40px #f7b32b60; }
.flip-btn-main:disabled { opacity: 0.4; cursor: not-allowed; animation: none; }
.flip-sub { font-size: 12px; font-weight: 500; opacity: 0.7; margin-top: 4px; }

/* Game lobby */
.games-section { padding: 0 24px 24px; }
.games-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.games-header h2 { font-size: 15px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 8px; }
.game-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; margin-bottom: 8px; background: linear-gradient(135deg, var(--bg-card), #121720); border: 1px solid var(--border); border-radius: 12px; transition: all 0.25s; gap: 12px; }
.game-row:hover { border-color: #f7b32b40; box-shadow: 0 0 15px #f7b32b10; }
.game-avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace; }
.game-amount-val { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 700; color: var(--gold); }
.join-btn { padding: 8px 20px; border: none; border-radius: 8px; background: linear-gradient(135deg, #16a34a, #22c55e); color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; font-family: 'Chakra Petch', sans-serif; transition: all 0.2s; box-shadow: 0 0 12px #22c55e25; }
.join-btn:hover { box-shadow: 0 0 20px #22c55e50; transform: scale(1.05); }
.cancel-btn { padding: 8px 16px; border: 1px solid var(--red); border-radius: 8px; background: transparent; color: var(--red); font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; }

/* ═══ RIGHT SIDEBAR ═══ */
.stats-sidebar { display: flex; flex-direction: column; height: 100%; background: linear-gradient(180deg, #0a0d14 0%, #07090d 100%); border-left: 1px solid var(--border); overflow-y: auto; position: relative; z-index: 1; }
.stats-section { padding: 16px; border-bottom: 1px solid var(--border); }
.stats-label { font-size: 11px; font-weight: 700; color: var(--text-muted); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; }
.protocol-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
.protocol-row-label { display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 13px; }
.protocol-row-label::before { content: ''; width: 4px; height: 4px; border-radius: 50%; background: #f7b32b40; flex-shrink: 0; }
.protocol-row-val { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; color: var(--text); }
.player-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.player-stat-card { background: var(--bg-elevated); border-radius: 8px; padding: 12px; text-align: center; }
.player-stat-val { font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 700; }
.player-stat-label { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

/* Toasts */
.toast-container { position: fixed; top: 16px; right: 16px; z-index: 1000; display: flex; flex-direction: column; gap: 8px; }
.toast { padding: 12px 18px; border-radius: 10px; font-size: 12px; font-weight: 500; animation: slideIn 0.3s ease; min-width: 250px; border: 1px solid; cursor: pointer; backdrop-filter: blur(8px); }
.toast-success { background: #22c55e18; border-color: #22c55e30; color: var(--green); }
.toast-error { background: #ef444418; border-color: #ef444430; color: var(--red); }
.toast-pending { background: #f7b32b18; border-color: #f7b32b30; color: var(--gold); }

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
.my-seat-card { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; margin-bottom: 3px; border-radius: 6px; background: #131820; border: 1px solid #f7b32b15; cursor: pointer; transition: all 0.2s; }
.my-seat-card:hover { border-color: #f7b32b40; background: #151e2a; }

/* Modal */
.seat-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 1000; animation: fadeIn 0.2s ease; }
.seat-modal { background: #131820; border: 1px solid #1c2430; border-radius: 16px; width: 440px; max-width: 95vw; max-height: 90vh; overflow-y: auto; padding: 24px; animation: fadeInUp 0.3s ease; }
.modal-top-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
.modal-top-card { background: #0d1118; border: 1px solid #1c2430; border-radius: 10px; padding: 12px; }
.mtc-label { font-size: 9px; color: #475569; letter-spacing: 1px; font-weight: 700; margin-bottom: 4px; }
.mtc-value { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; }
.mtc-note { font-size: 9px; color: #475569; margin-top: 2px; }
.modal-holder { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; padding: 10px 12px; background: #0d1118; border-radius: 8px; border: 1px solid #1c2430; }
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

/* Faucet button */
.faucet-btn { position: fixed; bottom: 20px; left: 20px; z-index: 900; padding: 10px 20px; border-radius: 10px; border: 1px solid #a855f740; background: linear-gradient(135deg, #7c3aed, #a855f7); color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; font-family: 'Chakra Petch', sans-serif; box-shadow: 0 0 20px #a855f730; transition: all 0.2s; }
.faucet-btn:hover { box-shadow: 0 0 30px #a855f750; transform: translateY(-2px); }
.faucet-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* Fair page */
.fair-section { padding: 24px; max-width: 600px; }
.fair-section p { font-size: 13px; color: var(--text-dim); line-height: 1.8; margin-bottom: 20px; }
.fair-code { padding: 18px; background: var(--bg-card); border-radius: 10px; border: 1px solid var(--border); font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 2; color: var(--text-dim); }
.fee-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.fee-item { display: flex; justify-content: space-between; padding: 10px 14px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; }

/* XP bar */
.xp-section { padding: 16px; border-bottom: 1px solid var(--border); }
.xp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.xp-level { font-family: 'Orbitron', sans-serif; font-size: 14px; font-weight: 800; }
.xp-label { font-size: 10px; color: var(--text-muted); }
.xp-bar { height: 4px; background: #151a22; border-radius: 2px; overflow: hidden; margin-bottom: 8px; }
.xp-fill { height: 100%; border-radius: 2px; transition: width 0.5s ease; }
.xp-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.xp-stat { background: #0d1118; border-radius: 6px; padding: 8px; text-align: center; }
.xp-stat-val { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 700; }
.xp-stat-label { font-size: 9px; color: #475569; margin-top: 2px; }

/* Stats drawer toggle */
.stats-drawer-toggle { display: none !important; }

/* ═══ RESPONSIVE: TABLET ═══ */
@media (max-width: 1100px) {
  .stats-drawer-toggle { display: flex !important; }
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
  .game-topbar { height: 48px; padding: 0 12px; }
  .logo-text { font-size: 14px !important; letter-spacing: 2px !important; }
  .logo-badge { font-size: 7px; padding: 2px 5px; }
  .nav { padding: 2px; gap: 2px; overflow-x: auto; flex-wrap: nowrap; }
  .nav-btn { padding: 6px 12px; font-size: 11px; white-space: nowrap; flex-shrink: 0; }
  .hero-section { padding: 20px 14px 16px; }
  .hero-title-text { font-size: 32px !important; letter-spacing: 4px !important; }
  .coin-3d-container { width: 120px !important; height: 120px !important; }
  .arena { padding: 12px 4px; min-height: 160px; }
  .arena-player { width: 80px; }
  .arena-avatar { width: 40px !important; height: 40px !important; font-size: 12px !important; }
  .board-container { flex-direction: column !important; }
  .board-left { width: 100% !important; min-width: 0 !important; max-height: 200px; border-right: none !important; border-bottom: 1px solid var(--border); }
  .board-grid-area { padding: 8px !important; }
  .board-right { display: none !important; }
  .seat-modal { width: calc(100vw - 24px) !important; max-height: 85vh; border-radius: 16px 16px 0 0 !important; }
  .seat-modal-overlay { align-items: flex-end !important; padding: 0 !important; }
}
`;

// ═══════════════════════════════════════
//        UTILITY COMPONENTS
// ═══════════════════════════════════════

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
      setDisplayValue(startValue + (targetValue - startValue) * eased);
      if (progress < 1) requestAnimationFrame(animate);
      else previousValue.current = targetValue;
    };
    requestAnimationFrame(animate);
  }, [value, duration]);
  return <>{displayValue.toFixed(decimals)}</>;
}

function triggerWinConfetti() {
  confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 }, colors: ['#f7b32b', '#ffc94a', '#d4a020'], zIndex: 9999 });
}

function GameAvatar({ address, size = 40 }) {
  if (!address || address === ZERO_ADDRESS) return <div style={{ width: size, height: size, borderRadius: '50%', background: '#1c2430', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45, color: '#374151' }}>?</div>;
  return <div style={{ width: size, height: size, borderRadius: '50%', background: addrColor(address), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.28, fontWeight: 800, color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>{address.slice(2,4).toUpperCase()}</div>;
}

// ═══════════════════════════════════════
//         GRADUATION PROGRESS
// ═══════════════════════════════════════

function GraduationProgress({ graduation }) {
  if (!graduation) return null;
  const { totalMinted, graduated, activeCount } = graduation;
  const pct = Math.min(100, (totalMinted / 256) * 100);
  return (
    <div className="grad-bar-wrap">
      <div className="grad-header">
        <span className="grad-label">{graduated ? "GRADUATED" : "GRADUATION PROGRESS"}</span>
        <span className="grad-count">{totalMinted} / 256 MINTED</span>
      </div>
      <div className="grad-track">
        <div className="grad-fill" style={{ width: `${pct}%` }} />
      </div>
      {!graduated && <div style={{ fontSize: 10, color: '#475569', marginTop: 4, textAlign: 'center' }}>{activeCount} active seats</div>}
    </div>
  );
}

// ═══════════════════════════════════════
//         BOARD (16x16 GRID)
// ═══════════════════════════════════════

function Board({ seats, mySeats, address, graduation, yieldPool, onSelectSeat, profile }) {
  const occupied = seats.filter(s => s.active).length;
  const empty = 256 - occupied;

  const holders = useMemo(() => {
    const map = {};
    seats.forEach(s => {
      if (s.active) {
        const o = s.owner.toLowerCase();
        map[o] = (map[o] || 0) + 1;
      }
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [seats]);

  return (
    <div className="board-container">
      <div className="board-left">
        <div className="board-label">BOARD STATS</div>
        <div className="board-stats-grid">
          <div className="board-stat-card">
            <div className="board-stat-value" style={{ color: '#22c55e' }}>{occupied}</div>
            <div className="board-stat-label">Occupied</div>
          </div>
          <div className="board-stat-card">
            <div className="board-stat-value" style={{ color: '#475569' }}>{empty}</div>
            <div className="board-stat-label">Empty</div>
          </div>
        </div>

        <div className="board-info-row">
          <span className="board-info-label">Yield Pool</span>
          <span className="board-info-value">{parseFloat(formatEther(yieldPool)).toFixed(6)} ETH</span>
        </div>
        <div className="board-info-row">
          <span className="board-info-label">Total Minted</span>
          <span className="board-info-value">{graduation?.totalMinted || 0}</span>
        </div>
        <div className="board-info-row">
          <span className="board-info-label">Graduated</span>
          <span className="board-info-value" style={{ color: graduation?.graduated ? '#22c55e' : '#ef4444' }}>{graduation?.graduated ? "Yes" : "No"}</span>
        </div>

        {mySeats.length > 0 && (
          <>
            <div className="board-label" style={{ marginTop: 16 }}>YOUR SEATS ({mySeats.length})</div>
            {mySeats.map(id => {
              const s = seats[id - 1];
              return (
                <div key={id} className="my-seat-card" onClick={() => onSelectSeat(s)}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#f7b32b' }}>#{id}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{s?.name || 'Unnamed'}</span>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="board-grid-area">
        <div className="seat-grid">
          {seats.map(seat => {
            const isMine = address && seat.active && seat.owner.toLowerCase() === address.toLowerCase();
            const levelColor = seat.active ? (LEVEL_COLORS[0] || '#6b7280') : null;
            return (
              <div
                key={seat.id}
                className={`seat-tile ${seat.active ? (isMine ? 'tile-mine' : 'tile-owned') : 'tile-empty'}`}
                onClick={() => onSelectSeat(seat)}
                title={seat.active ? `#${seat.id} - ${seat.name || shortAddr(seat.owner)} - ${fmtTokens(seat.price)} FLIP` : `#${seat.id} - Empty`}
                style={seat.active ? { background: `${addrColor(seat.owner)}15` } : {}}
              >
                {seat.active ? (
                  <>
                    <div className="tile-avatar" style={{ background: addrColor(seat.owner) }}>{seat.owner.slice(2,4).toUpperCase()}</div>
                    <div className="tile-price">{fmtTokens(seat.price)}</div>
                  </>
                ) : (
                  <div className="tile-id">#{seat.id}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="board-right">
        <div className="board-label">TOP HOLDERS</div>
        {holders.map(([addr, count], i) => (
          <div key={addr} className="holder-row">
            <span className="holder-rank">{i + 1}</span>
            <div className="holder-avatar" style={{ background: addrColor(addr) }}>{addr.slice(2,4).toUpperCase()}</div>
            <span className="holder-name">{shortAddr(addr)}</span>
            <span className="holder-count">{count}</span>
          </div>
        ))}
        {holders.length === 0 && <div style={{ color: '#475569', fontSize: 11 }}>No holders yet</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//         SEAT MODAL (V8)
// ═══════════════════════════════════════

function SeatModal({ seat, address, onClose, seatsContract, tokenContract, tokenBalance, refreshSeats, refreshBalance }) {
  const [loading, setLoading] = useState(false);
  const [seatDetail, setSeatDetail] = useState(null);
  const [name, setName] = useState("");
  const [priceInput, setPriceInput] = useState("100000000");
  const [newPriceInput, setNewPriceInput] = useState("");
  const [depositInput, setDepositInput] = useState("");

  const isOwned = seat.active;
  const isMine = isOwned && address && seat.owner.toLowerCase() === address.toLowerCase();

  useEffect(() => {
    if (!seatsContract && !tokenContract) return;
    const c = seatsContract;
    if (!c) return;
    getSeatInfo(c, seat.id).then(d => {
      setSeatDetail(d);
      if (d.price) setNewPriceInput(formatUnits(d.price, 18));
    }).catch(() => {});
  }, [seat.id, seatsContract]);

  const doMint = async () => {
    if (!seatsContract || !tokenContract) return;
    setLoading(true);
    const pendingId = addToast("pending", `Minting seat #${seat.id}...`);
    try {
      const mintPrice = await seatsContract.calculateMintPrice();
      const initialPrice = parseUnits(priceInput, 18);
      const deposit = (initialPrice * 500n * 4n) / 10000n;
      await mintSeat(seatsContract, tokenContract, seat.id, initialPrice, name || `Seat #${seat.id}`, mintPrice, deposit);
      addToast("success", `Seat #${seat.id} minted!`);
      refreshSeats?.(); refreshBalance?.();
      onClose();
    } catch (err) {
      addToast("error", decodeError(err));
    } finally {
      removeToast(pendingId);
      setLoading(false);
    }
  };

  const doBuyOut = async () => {
    if (!seatsContract || !tokenContract || !seatDetail) return;
    setLoading(true);
    const pendingId = addToast("pending", `Buying out seat #${seat.id}...`);
    try {
      const newPrice = parseUnits(priceInput, 18);
      const deposit = (newPrice * 500n * 4n) / 10000n;
      await buyOutSeat(seatsContract, tokenContract, seat.id, newPrice, deposit);
      addToast("success", `Seat #${seat.id} bought out!`);
      refreshSeats?.(); refreshBalance?.();
      onClose();
    } catch (err) {
      addToast("error", decodeError(err));
    } finally {
      removeToast(pendingId);
      setLoading(false);
    }
  };

  const doUpdatePrice = async () => {
    if (!seatsContract || !newPriceInput) return;
    setLoading(true);
    const pendingId = addToast("pending", "Updating price...");
    try {
      await updateSeatPrice(seatsContract, seat.id, parseUnits(newPriceInput, 18));
      addToast("success", "Price updated!");
      refreshSeats?.();
      onClose();
    } catch (err) {
      addToast("error", decodeError(err));
    } finally {
      removeToast(pendingId);
      setLoading(false);
    }
  };

  const doAddDeposit = async () => {
    if (!seatsContract || !tokenContract || !depositInput) return;
    setLoading(true);
    const pendingId = addToast("pending", "Adding deposit...");
    try {
      await addDeposit(seatsContract, tokenContract, seat.id, parseUnits(depositInput, 18));
      addToast("success", "Deposit added!");
      refreshSeats?.(); refreshBalance?.();
      onClose();
    } catch (err) {
      addToast("error", decodeError(err));
    } finally {
      removeToast(pendingId);
      setLoading(false);
    }
  };

  const doClaim = async () => {
    if (!seatsContract) return;
    setLoading(true);
    const pendingId = addToast("pending", "Claiming rewards...");
    try {
      await claimRewards(seatsContract, seat.id);
      addToast("success", "Rewards claimed!");
      refreshSeats?.();
      onClose();
    } catch (err) {
      addToast("error", decodeError(err));
    } finally {
      removeToast(pendingId);
      setLoading(false);
    }
  };

  const doAbandon = async () => {
    if (!seatsContract) return;
    setLoading(true);
    const pendingId = addToast("pending", `Abandoning seat #${seat.id}...`);
    try {
      await abandonSeat(seatsContract, seat.id);
      addToast("success", `Seat #${seat.id} abandoned`);
      refreshSeats?.(); refreshBalance?.();
      onClose();
    } catch (err) {
      addToast("error", decodeError(err));
    } finally {
      removeToast(pendingId);
      setLoading(false);
    }
  };

  const mintPriceTokens = 50_000_000;
  const listedPriceNum = parseFloat(priceInput) || 0;
  const depositNeeded = listedPriceNum * 0.2;
  const totalNeeded = mintPriceTokens + depositNeeded;

  return (
    <div className="seat-modal-overlay" onClick={onClose}>
      <div className="seat-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 20, fontWeight: 900, color: '#f7b32b' }}>
            SEAT #{seat.id}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', fontSize: 20, cursor: 'pointer' }}>x</button>
        </div>

        {isOwned && (
          <div className="modal-holder">
            <GameAvatar address={seat.owner} size={36} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: addrColor(seat.owner) }}>{seat.name || shortAddr(seat.owner)}</div>
              <div style={{ fontSize: 10, color: '#475569' }}>{shortAddr(seat.owner)}</div>
            </div>
          </div>
        )}

        <div className="modal-top-cards">
          <div className="modal-top-card">
            <div className="mtc-label">LISTED PRICE</div>
            <div className="mtc-value" style={{ color: '#f7b32b' }}>{isOwned ? fmtTokens(seat.price) : '---'}</div>
            <div className="mtc-note">FLIPPER tokens</div>
          </div>
          <div className="modal-top-card">
            <div className="mtc-label">DEPOSIT RUNWAY</div>
            <div className="mtc-value" style={{ color: seat.daysLeft <= 7 ? '#ef4444' : '#22c55e' }}>{isOwned ? `${seat.daysLeft}d` : '---'}</div>
            <div className="mtc-note">{isOwned ? `${fmtTokens(seat.deposit)} FLIP deposited` : 'Empty seat'}</div>
          </div>
        </div>

        {seatDetail && isOwned && (
          <div style={{ marginBottom: 16 }}>
            <div className="cost-row">
              <span className="cost-label">Pending Tax</span>
              <span className="cost-value">{fmtTokens(seatDetail.pendingTax)} FLIP</span>
            </div>
            <div className="cost-row">
              <span className="cost-label">Pending Rewards</span>
              <span className="cost-value" style={{ color: '#22c55e' }}>{parseFloat(formatEther(seatDetail.pendingRewards)).toFixed(6)} ETH</span>
            </div>
            <div className="cost-row">
              <span className="cost-label">Total Earned</span>
              <span className="cost-value">{parseFloat(formatEther(seatDetail.totalEarned)).toFixed(6)} ETH</span>
            </div>
          </div>
        )}

        {/* EMPTY SEAT — MINT */}
        {!isOwned && (
          <>
            <div className="modal-section-label">MINT THIS SEAT</div>
            <input className="seat-modal-input" placeholder="Seat name (max 32 chars)" value={name} onChange={e => setName(e.target.value.slice(0, 32))} />
            <input className="seat-modal-input" placeholder="Listed price (tokens, e.g. 100000000)" value={priceInput} onChange={e => setPriceInput(e.target.value)} type="number" />
            <div style={{ marginTop: 8 }}>
              <div className="cost-row"><span className="cost-label">Mint Cost</span><span className="cost-value">50M FLIP</span></div>
              <div className="cost-row"><span className="cost-label">Deposit (20%)</span><span className="cost-value">{depositNeeded.toLocaleString()} FLIP</span></div>
              <div className="total-row"><span className="total-label">Total</span><span className="total-value">{totalNeeded.toLocaleString()} FLIP</span></div>
            </div>
            <div style={{ fontSize: 10, color: '#475569', marginBottom: 12 }}>Your balance: {fmtTokens(tokenBalance)} FLIP</div>
            <button className="modal-buy-btn" disabled={loading || !address} onClick={doMint}>{loading ? "Processing..." : "MINT SEAT"}</button>
          </>
        )}

        {/* OWNED BY SOMEONE ELSE — BUYOUT */}
        {isOwned && !isMine && (
          <>
            <div className="modal-section-label">BUY OUT THIS SEAT</div>
            <input className="seat-modal-input" placeholder="Your new listed price (tokens)" value={priceInput} onChange={e => setPriceInput(e.target.value)} type="number" />
            <div style={{ marginTop: 8 }}>
              <div className="cost-row"><span className="cost-label">Buy price</span><span className="cost-value">{fmtTokens(seat.price)} FLIP</span></div>
              <div className="cost-row"><span className="cost-label">New deposit (20%)</span><span className="cost-value">{depositNeeded.toLocaleString()} FLIP</span></div>
            </div>
            <div style={{ fontSize: 10, color: '#475569', marginBottom: 12 }}>Your balance: {fmtTokens(tokenBalance)} FLIP</div>
            <button className="modal-buy-btn" disabled={loading || !address} onClick={doBuyOut}>{loading ? "Processing..." : "BUY OUT"}</button>
          </>
        )}

        {/* MY SEAT — MANAGE */}
        {isMine && (
          <>
            <div className="modal-section-label" style={{ marginTop: 8 }}>MANAGE YOUR SEAT</div>

            <button className="modal-action-btn" style={{ background: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e30' }} disabled={loading} onClick={doClaim}>
              Claim Rewards
            </button>

            <div style={{ marginTop: 12 }}>
              <div className="modal-section-label">UPDATE PRICE</div>
              <input className="seat-modal-input" placeholder="New price (tokens)" value={newPriceInput} onChange={e => setNewPriceInput(e.target.value)} type="number" />
              <button className="modal-action-btn" style={{ background: '#f7b32b15', color: '#f7b32b', border: '1px solid #f7b32b30' }} disabled={loading} onClick={doUpdatePrice}>
                Update Price
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="modal-section-label">ADD DEPOSIT</div>
              <input className="seat-modal-input" placeholder="Amount (tokens)" value={depositInput} onChange={e => setDepositInput(e.target.value)} type="number" />
              <button className="modal-action-btn" style={{ background: '#3b82f615', color: '#3b82f6', border: '1px solid #3b82f630' }} disabled={loading} onClick={doAddDeposit}>
                Add Deposit
              </button>
            </div>

            <button className="modal-action-btn" style={{ background: '#ef444415', color: '#ef4444', border: '1px solid #ef444430', marginTop: 16 }} disabled={loading} onClick={doAbandon}>
              Abandon Seat
            </button>
          </>
        )}

        <button className="modal-cancel-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//         FAIR PAGE
// ═══════════════════════════════════════

function FairPage() {
  return (
    <div className="fair-section">
      <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 20, fontWeight: 900, color: '#f7b32b', marginBottom: 16 }}>PROVABLY FAIR</h2>
      <p>FlipperRooms V8 uses on-chain randomness from block data. Each flip result is determined by the block hash at the time of transaction execution, making outcomes verifiable and tamper-resistant.</p>

      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>Fee Structure</h3>
      <div className="fee-grid">
        <div className="fee-item"><span style={{ color: '#94a3b8', fontSize: 12 }}>Protocol Fee</span><span style={{ color: '#f7b32b', fontSize: 12 }}>3%</span></div>
        <div className="fee-item"><span style={{ color: '#94a3b8', fontSize: 12 }}>Treasury Fee</span><span style={{ color: '#f7b32b', fontSize: 12 }}>2.5%</span></div>
        <div className="fee-item"><span style={{ color: '#94a3b8', fontSize: 12 }}>Seat Yield</span><span style={{ color: '#f7b32b', fontSize: 12 }}>1%</span></div>
        <div className="fee-item"><span style={{ color: '#94a3b8', fontSize: 12 }}>Jackpot</span><span style={{ color: '#f7b32b', fontSize: 12 }}>0.5%</span></div>
        <div className="fee-item"><span style={{ color: '#94a3b8', fontSize: 12 }}>Referral</span><span style={{ color: '#f7b32b', fontSize: 12 }}>0.5%</span></div>
        <div className="fee-item"><span style={{ color: '#94a3b8', fontSize: 12 }}>Player Payout</span><span style={{ color: '#22c55e', fontSize: 12 }}>92%</span></div>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', margin: '20px 0 12px' }}>V8 Contracts</h3>
      <div className="fair-code">
        <div>FlipperSeats: {SEATS_ADDRESS}</div>
        <div>FlipperCoinflip: {COINFLIP_ADDRESS}</div>
        <div>MockFlipper: {MOCK_FLIPPER_ADDRESS}</div>
        <div>Chain: Base Sepolia (84532)</div>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', margin: '20px 0 12px' }}>Seat Economics</h3>
      <p>Seats are minted with FLIPPER tokens. Each seat has a listed price and a deposit. Weekly tax of 5% of listed price is collected from the deposit. If deposit runs out, the seat can be forfeited. Seat owners earn ETH yield from coinflip fees.</p>
    </div>
  );
}

// ═══════════════════════════════════════
//           MAIN APP
// ═══════════════════════════════════════

export default function App() {
  const wallet = useWallet();
  const { connected, address, seatsContract, coinflipContract, tokenContract, readSeats, readCoinflip, readToken, connect, disconnect } = wallet;

  const { toasts, remove: removeToastUI } = useToasts();
  const [tab, setTab] = useState("play");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState(TIERS[0].wei);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [faucetLoading, setFaucetLoading] = useState(false);

  const { profile, refreshProfile } = useUserProfile(seatsContract, readSeats, address);
  const { balance: tokenBalance, refreshBalance: refreshTokenBalance } = useTokenBalance(tokenContract, readToken, address);
  const { seats, mySeats, loading: seatsLoading, graduation, yieldPool, refreshSeats } = useSeats(seatsContract, readSeats, address);
  const { isFlipping, lastResult, setLastResult, lastFlipDetails, setLastFlipDetails, challenges, refreshChallenges, flipDirect, createChallenge, acceptChallenge, cancelChallenge } = useFlip(coinflipContract, readCoinflip, address);
  const { stats, refreshStats } = useProtocol(coinflipContract, readCoinflip);
  const { recentFlips, liveFlip } = useGlobalFeed(coinflipContract, readCoinflip);

  const [playerInfo, setPlayerInfo] = useState(null);
  const referral = getReferralFromUrl();
  const coinPhase = useRef("idle");
  const streakRef = useRef([]);

  // Load stats on mount and periodically
  useEffect(() => { refreshStats(); refreshChallenges(); }, [refreshStats, refreshChallenges]);
  useEffect(() => {
    const iv = setInterval(() => { refreshStats(); refreshChallenges(); }, 30000);
    return () => clearInterval(iv);
  }, [refreshStats, refreshChallenges]);

  // Load player info
  useEffect(() => {
    if (!coinflipContract || !address) return;
    getPlayerInfo(coinflipContract, address).then(setPlayerInfo).catch(() => {});
  }, [coinflipContract, address]);

  // Handle flip result effects
  useEffect(() => {
    if (!lastResult) return;
    if (lastResult === "win") {
      triggerWinConfetti();
      try { audio.playWin?.(); vibrate([50, 100, 50]); } catch {}
    } else {
      try { audio.playLoss?.(); vibrate([200]); } catch {}
    }
    streakRef.current = [...streakRef.current, lastResult].slice(-12);
  }, [lastResult]);

  const handleFlipDirect = async () => {
    if (!connected) return connect();
    coinPhase.current = "spinning";
    try { audio.playFlip?.(); } catch {}
    const result = await flipDirect(BigInt(selectedTier), referral);
    if (result) {
      refreshProfile?.();
      refreshSeats?.();
      // Reload player info
      if (coinflipContract && address) {
        getPlayerInfo(coinflipContract, address).then(setPlayerInfo).catch(() => {});
      }
    }
    coinPhase.current = "idle";
  };

  const handleCreateChallenge = async () => {
    if (!connected) return connect();
    await createChallenge(BigInt(selectedTier), referral);
  };

  const handleAccept = async (ch) => {
    if (!connected) return connect();
    coinPhase.current = "spinning";
    try { audio.playFlip?.(); } catch {}
    const result = await acceptChallenge(ch.id, ch.amountWei, referral);
    if (result) {
      refreshProfile?.();
      if (coinflipContract && address) {
        getPlayerInfo(coinflipContract, address).then(setPlayerInfo).catch(() => {});
      }
    }
    coinPhase.current = "idle";
  };

  const handleFaucet = async () => {
    if (!tokenContract) return;
    setFaucetLoading(true);
    const pid = addToast("pending", "Claiming 1M FLIPPER...");
    try {
      await claimMockFlipper(tokenContract);
      addToast("success", "Claimed 1M FLIPPER tokens!");
      refreshTokenBalance?.();
    } catch (err) {
      addToast("error", decodeError(err));
    } finally {
      removeToast(pid);
      setFaucetLoading(false);
    }
  };

  const handleClaimAll = async () => {
    if (!seatsContract || mySeats.length === 0) return;
    const pid = addToast("pending", "Claiming all rewards...");
    try {
      await claimMultipleRewards(seatsContract, mySeats);
      addToast("success", "All rewards claimed!");
      refreshSeats?.();
    } catch (err) {
      addToast("error", decodeError(err));
    } finally {
      removeToast(pid);
    }
  };

  const levelName = profile ? (LEVEL_NAMES[Math.min(profile.level, 5)] || "Whale") : "---";
  const levelColor = profile ? (LEVEL_COLORS[Math.min(profile.level, 5)] || '#f97316') : '#6b7280';
  const xpForNextLevel = profile ? (profile.level + 1) * 500 : 500;
  const xpProgress = profile ? Math.min(100, (profile.xp / xpForNextLevel) * 100) : 0;
  const yieldMult = profile ? `${profile.yieldMultiplier}%` : "100%";

  return (
    <>
      <style>{CSS}</style>
      <div className="app-root">
        {/* ═══ LEFT SIDEBAR — LIVE FEED ═══ */}
        <div className="chat-sidebar">
          <div className="chat-header">
            <div className="online-dot" />
            <h2>Live Feed</h2>
          </div>
          <div className="chat-messages">
            {recentFlips.length === 0 && <div style={{ padding: 20, color: '#475569', fontSize: 12, textAlign: 'center' }}>No flips yet</div>}
            {recentFlips.map(flip => (
              <div key={flip.id} className="chat-msg" style={flip.isNew ? { animation: 'feedSlide 0.3s ease' } : {}}>
                <div className="chat-avatar" style={{ background: addrColor(flip.winner) }}>{flip.winner.slice(2,4).toUpperCase()}</div>
                <div className="chat-msg-content">
                  <div className="chat-name" style={{ color: addrColor(flip.winner) }}>{shortAddr(flip.winner)}</div>
                  <div className="chat-text">Won {parseFloat(flip.payout).toFixed(4)} ETH (bet {parseFloat(flip.amount).toFixed(4)})</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ CENTER ═══ */}
        <div className="game-center">
          <div className="game-topbar">
            <div className="logo">
              <span className="logo-text"><span className="logo-gold">FLIPPER</span><span className="logo-dim">ROOMS</span></span>
              <span className="logo-badge">V8</span>
            </div>
            <div className="nav">
              {["play", "board", "fair"].map(t => (
                <button key={t} className={`nav-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
              ))}
            </div>
            <div className="header-right">
              <button
                className="stats-drawer-toggle"
                onClick={() => setDrawerOpen(!drawerOpen)}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
              >
                {drawerOpen ? 'x' : '='}
              </button>
              {connected ? (
                <button className="addr-pill" onClick={disconnect}>{shortAddr(address)}</button>
              ) : (
                <button className="connect-btn" onClick={connect}>Connect</button>
              )}
            </div>
          </div>

          <div className="game-scroll">
            {/* ═══ PLAY TAB ═══ */}
            {tab === "play" && (
              <>
                <div className="hero-section">
                  <div className="hero-inner">
                    <div className="hero-title-text">FLIPPER</div>
                    <div className="hero-sub">Coinflip + Revenue Seats on Base</div>
                    <GraduationProgress graduation={graduation} />

                    {/* Coin stage */}
                    <div className={`coin-wrapper ${isFlipping ? 'spinning' : ''} ${lastResult ? `result-${lastResult}` : ''}`}>
                      <div className="border-spin"><div /></div>
                      <div className="border-flash" />
                      <div className="coin-stage-inner">
                        <div className="grid-overlay" />
                        <div className="glow-bg" />
                        <div className="connector-line" />
                        <div className="arena">
                          <div className={`arena-player ${lastFlipDetails?.won === true ? 'winner' : lastFlipDetails?.won === false ? 'loser' : ''}`}>
                            <div className={`arena-avatar avatar-you ${isFlipping ? 'avatar-bounce' : ''} ${lastFlipDetails?.won === true ? 'avatar-win' : lastFlipDetails?.won === false ? 'avatar-lose' : ''}`}>
                              {address ? address.slice(2,4).toUpperCase() : "??"}
                            </div>
                            <div className={`arena-name ${lastFlipDetails?.won === true ? 'name-win' : lastFlipDetails?.won === false ? 'name-lose' : ''}`}>YOU</div>
                            <div className={`arena-bet ${lastFlipDetails?.won === true ? 'bet-win' : lastFlipDetails?.won === false ? 'bet-lose' : ''}`}>{formatEther(BigInt(selectedTier))} ETH</div>
                          </div>

                          <div className="vs-area">
                            <div className="vs-text">{isFlipping ? '' : 'VS'}</div>
                            <div className="coin-3d-container">
                              <Suspense fallback={<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>...</div>}>
                                <Coin3D result={lastResult} spinning={isFlipping} />
                              </Suspense>
                            </div>
                            <div className="prize-pool">
                              <div className="prize-label">PRIZE POOL</div>
                              <div className={`prize-value ${lastResult === 'win' ? 'prize-win' : lastResult === 'lose' ? 'prize-lose' : ''}`}>
                                {lastFlipDetails ? (lastFlipDetails.won ? `+${lastFlipDetails.payout}` : `-${lastFlipDetails.amount}`) : `${formatEther(BigInt(selectedTier) * 2n)}`} ETH
                              </div>
                            </div>
                          </div>

                          <div className={`arena-player ${lastFlipDetails?.won === false ? 'winner' : lastFlipDetails?.won === true ? 'loser' : ''}`}>
                            <div className={`arena-avatar avatar-opp ${isFlipping ? 'avatar-bounce' : ''} ${lastFlipDetails?.won === false ? 'avatar-win' : lastFlipDetails?.won === true ? 'avatar-lose' : ''}`}>
                              TR
                            </div>
                            <div className={`arena-name ${lastFlipDetails?.won === false ? 'name-win' : lastFlipDetails?.won === true ? 'name-lose' : ''}`}>TREASURY</div>
                            <div className={`arena-bet ${lastFlipDetails?.won === false ? 'bet-win' : lastFlipDetails?.won === true ? 'bet-lose' : ''}`}>{formatEther(BigInt(selectedTier))} ETH</div>
                          </div>
                        </div>

                        {/* Result zone */}
                        <div className="result-zone">
                          {lastResult && (
                            <>
                              <div className={`result-text-new visible ${lastResult === 'win' ? 'win-text' : 'lose-text'}`}>
                                {lastResult === 'win' ? 'YOU WIN' : 'YOU LOSE'}
                              </div>
                              <div className={`result-amount visible ${lastResult === 'win' ? 'win-amount' : 'lose-amount'}`}>
                                {lastFlipDetails?.won ? `+${lastFlipDetails.payout} ETH` : `-${lastFlipDetails?.amount || '?'} ETH`}
                              </div>
                              <div className="result-actions visible">
                                <button className="action-btn btn-rematch" onClick={() => { setLastResult(null); setLastFlipDetails(null); handleFlipDirect(); }}>REMATCH</button>
                                <button className="action-btn btn-change" onClick={() => { setLastResult(null); setLastFlipDetails(null); }}>RESET</button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Streak bar */}
                        {streakRef.current.length > 0 && (
                          <div className="streak-bar">
                            {streakRef.current.map((r, i) => (
                              <div key={i} className={`streak-dot ${r === 'win' ? 'streak-win' : 'streak-lose'}`}>{r === 'win' ? 'W' : 'L'}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Tier selection */}
                    <div className="tier-bar">
                      {TIERS.map(t => (
                        <button key={t.wei} className={`tier-btn ${selectedTier === t.wei ? 'active' : ''}`} onClick={() => setSelectedTier(t.wei)}>
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Flip buttons */}
                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
                      <button className="flip-btn-main" style={{ maxWidth: 280 }} disabled={isFlipping || !connected} onClick={handleFlipDirect}>
                        {isFlipping ? "FLIPPING..." : "FLIP vs TREASURY"}
                        <div className="flip-sub">Instant result</div>
                      </button>
                      <button className="flip-btn-main" style={{ maxWidth: 280, background: 'linear-gradient(135deg, #1e40af, #3b82f6)', boxShadow: '0 0 30px #3b82f640' }} disabled={isFlipping || !connected} onClick={handleCreateChallenge}>
                        CREATE PvP
                        <div className="flip-sub">Challenge a player</div>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Open challenges */}
                <div className="games-section">
                  <div className="games-header">
                    <h2>Open Challenges <span style={{ color: '#475569', fontSize: 12 }}>({challenges.length})</span></h2>
                  </div>
                  {challenges.length === 0 && <div style={{ color: '#475569', fontSize: 12, padding: '16px 0' }}>No open challenges</div>}
                  {challenges.map(ch => {
                    const isCreator = address && ch.creator.toLowerCase() === address.toLowerCase();
                    return (
                      <div key={ch.id} className="game-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="game-avatar" style={{ background: addrColor(ch.creator) }}>{ch.creator.slice(2,4).toUpperCase()}</div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: addrColor(ch.creator) }}>{shortAddr(ch.creator)}</div>
                            <div style={{ fontSize: 10, color: '#475569' }}>Challenge #{ch.id}</div>
                          </div>
                        </div>
                        <div className="game-amount-val">{ch.amount} ETH</div>
                        {isCreator ? (
                          <button className="cancel-btn" onClick={() => cancelChallenge(ch.id)}>Cancel</button>
                        ) : (
                          <button className="join-btn" onClick={() => handleAccept(ch)}>Accept</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ═══ BOARD TAB ═══ */}
            {tab === "board" && (
              <Board seats={seats} mySeats={mySeats} address={address} graduation={graduation} yieldPool={yieldPool} onSelectSeat={setSelectedSeat} profile={profile} />
            )}

            {/* ═══ FAIR TAB ═══ */}
            {tab === "fair" && <FairPage />}
          </div>
        </div>

        {/* ═══ RIGHT SIDEBAR ═══ */}
        <div className={`stats-sidebar ${drawerOpen ? 'drawer-open' : ''}`}>
          {/* XP / Profile */}
          <div className="xp-section">
            <div className="xp-header">
              <div className="xp-level" style={{ color: levelColor }}>Lv.{profile?.level || 0} {levelName}</div>
              <div className="xp-label">{profile?.xp || 0} / {xpForNextLevel} XP</div>
            </div>
            <div className="xp-bar">
              <div className="xp-fill" style={{ width: `${xpProgress}%`, background: levelColor }} />
            </div>
            <div className="xp-stats">
              <div className="xp-stat">
                <div className="xp-stat-val" style={{ color: '#f7b32b' }}>{profile?.seatsOwned || 0}</div>
                <div className="xp-stat-label">Seats</div>
              </div>
              <div className="xp-stat">
                <div className="xp-stat-val" style={{ color: '#22c55e' }}>{yieldMult}</div>
                <div className="xp-stat-label">Yield Mult</div>
              </div>
            </div>
          </div>

          {/* Token Balance */}
          <div className="stats-section">
            <div className="stats-label">$FLIPPER Balance</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, fontWeight: 700, color: '#a855f7' }}>
              {fmtTokens(tokenBalance)}
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>FLIPPER-TEST tokens</div>
            {mySeats.length > 0 && (
              <button
                onClick={handleClaimAll}
                style={{ marginTop: 10, width: '100%', padding: 8, borderRadius: 8, border: '1px solid #22c55e30', background: '#22c55e15', color: '#22c55e', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Claim All Rewards ({mySeats.length} seats)
              </button>
            )}
          </div>

          {/* Player Stats */}
          {playerInfo && (
            <div className="stats-section">
              <div className="stats-label">Your Stats</div>
              <div className="player-stats-grid">
                <div className="player-stat-card">
                  <div className="player-stat-val" style={{ color: '#22c55e' }}>{playerInfo.wins}</div>
                  <div className="player-stat-label">Wins</div>
                </div>
                <div className="player-stat-card">
                  <div className="player-stat-val" style={{ color: '#ef4444' }}>{playerInfo.losses}</div>
                  <div className="player-stat-label">Losses</div>
                </div>
                <div className="player-stat-card">
                  <div className="player-stat-val" style={{ color: '#f7b32b' }}>{playerInfo.streak}</div>
                  <div className="player-stat-label">Streak</div>
                </div>
                <div className="player-stat-card">
                  <div className="player-stat-val" style={{ color: '#a855f7' }}>{playerInfo.bestStreak}</div>
                  <div className="player-stat-label">Best</div>
                </div>
              </div>
            </div>
          )}

          {/* Protocol Stats */}
          <div className="stats-section">
            <div className="stats-label">Protocol</div>
            {stats ? (
              <>
                <div className="protocol-row"><span className="protocol-row-label">Total Flips</span><span className="protocol-row-val">{stats.totalFlips}</span></div>
                <div className="protocol-row"><span className="protocol-row-label">Volume</span><span className="protocol-row-val">{parseFloat(stats.totalVolume).toFixed(3)} ETH</span></div>
                <div className="protocol-row"><span className="protocol-row-label">Treasury</span><span className="protocol-row-val">{parseFloat(stats.treasuryBalance).toFixed(4)} ETH</span></div>
                <div className="protocol-row"><span className="protocol-row-label">Jackpot</span><span className="protocol-row-val">{parseFloat(stats.jackpotPool).toFixed(4)} ETH</span></div>
                <div className="protocol-row"><span className="protocol-row-label">Yield Pool</span><span className="protocol-row-val">{parseFloat(formatEther(yieldPool)).toFixed(6)} ETH</span></div>
              </>
            ) : (
              <div style={{ color: '#475569', fontSize: 12 }}>Loading...</div>
            )}
          </div>

          {/* Graduation */}
          <div className="stats-section">
            <div className="stats-label">Graduation</div>
            <div className="protocol-row"><span className="protocol-row-label">Minted</span><span className="protocol-row-val">{graduation?.totalMinted || 0} / 256</span></div>
            <div className="protocol-row"><span className="protocol-row-label">Active</span><span className="protocol-row-val">{graduation?.activeCount || 0}</span></div>
            <div className="protocol-row"><span className="protocol-row-label">Status</span><span className="protocol-row-val" style={{ color: graduation?.graduated ? '#22c55e' : '#f7b32b' }}>{graduation?.graduated ? "Graduated" : "Pre-graduation"}</span></div>
          </div>
        </div>

        {/* ═══ TOASTS ═══ */}
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.type}`} onClick={() => removeToastUI(t.id)}>
              {t.message}
              {t.txHash && <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6 }}><a href={`${EXPLORER_URL}/tx/${t.txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>View tx</a></div>}
            </div>
          ))}
        </div>

        {/* ═══ SEAT MODAL ═══ */}
        {selectedSeat && (
          <SeatModal
            seat={selectedSeat}
            address={address}
            onClose={() => setSelectedSeat(null)}
            seatsContract={seatsContract || readSeats}
            tokenContract={tokenContract}
            tokenBalance={tokenBalance}
            refreshSeats={() => { refreshSeats(); refreshProfile(); }}
            refreshBalance={refreshTokenBalance}
          />
        )}

        {/* ═══ FAUCET BUTTON (SEPOLIA) ═══ */}
        {connected && (
          <button className="faucet-btn" disabled={faucetLoading} onClick={handleFaucet}>
            {faucetLoading ? "Claiming..." : "Claim 1M FLIPPER"}
          </button>
        )}
      </div>
    </>
  );
}
