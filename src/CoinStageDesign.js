/*
  COIN STAGE DESIGN REFERENCE
  ============================
  This file contains the EXACT CSS and layout for the coin stage component.
  Claude Code should integrate this into App.jsx, replacing the current coin stage.
  
  The CSS coin placeholder should be replaced with the existing Coin3D Three.js component.
  All contract interactions (handleFlip, handleAccept, etc.) remain the same.
  
  COLOR PALETTE (use these ONLY):
    Gold primary:  #f7b32b
    Gold bright:   #ffd700  
    Gold dark:     #b8860b
    Gold border:   #8b6914
    Win green:     #22c55e
    Lose red:      #ef4444
    Background:    #0b0e11
    Card:          #151a22
    Border:        #1c2430
    Text:          #e2e8f0
    Text dim:      #94a3b8
    Text muted:    #475569
    Player blue:   #2563eb / #3b82f6
*/

/* ═══════════════════════════════════════
   CSS FOR COIN STAGE
   ═══════════════════════════════════════ */

export const COIN_STAGE_CSS = `
@property --border-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

/* Wrapper with animated border */
.coin-wrapper {
  position: relative;
  border-radius: 16px;
  padding: 3px;
  margin: 0 auto 20px;
  max-width: 620px;
}

.coin-wrapper .border-trace {
  position: absolute;
  inset: 0;
  border-radius: 16px;
  opacity: 0;
  background: conic-gradient(
    from var(--border-angle, 0deg),
    transparent 0deg,
    #b8860b 15deg,
    #f7b32b 40deg,
    #ffd700 70deg,
    #f7b32b 100deg,
    #b8860b 130deg,
    transparent 150deg,
    transparent 360deg
  );
  transition: opacity 0.4s;
}

.coin-wrapper.spinning .border-trace {
  opacity: 1;
  animation: spinBorder 0.6s linear infinite;
}

@keyframes spinBorder {
  to { --border-angle: 360deg; }
}

.coin-wrapper .border-flash {
  position: absolute;
  inset: 0;
  border-radius: 16px;
  opacity: 0;
}

.coin-wrapper.result-win .border-flash {
  animation: flashToGreen 1.8s ease forwards;
}

.coin-wrapper.result-lose .border-flash {
  animation: flashToRed 1.8s ease forwards;
}

/* Crossfade: gold fades out, then green/red fades in */
@keyframes flashToGreen {
  0%   { background: #f7b32b; opacity: 0.5; }
  30%  { background: #f7b32b; opacity: 0.03; }
  50%  { background: #22c55e; opacity: 0; }
  70%  { background: #22c55e; opacity: 0.45; }
  100% { background: #22c55e; opacity: 0.12; }
}

@keyframes flashToRed {
  0%   { background: #f7b32b; opacity: 0.5; }
  30%  { background: #f7b32b; opacity: 0.03; }
  50%  { background: #ef4444; opacity: 0; }
  70%  { background: #ef4444; opacity: 0.45; }
  100% { background: #ef4444; opacity: 0.12; }
}

/* Inner stage */
.coin-stage-inner {
  position: relative;
  z-index: 1;
  border-radius: 13px;
  overflow: hidden;
  background: #0b0e11;
  padding: 20px 16px 16px;
}

.coin-stage-inner .grid-overlay {
  position: absolute;
  inset: 0;
  opacity: 0.03;
  pointer-events: none;
  background-image: 
    linear-gradient(#f7b32b 1px, transparent 1px),
    linear-gradient(90deg, #f7b32b 1px, transparent 1px);
  background-size: 28px 28px;
}

.coin-stage-inner .glow-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition: all 0.8s ease;
  background: radial-gradient(ellipse at 50% 45%, #f7b32b08 0%, transparent 50%);
}

.coin-wrapper.spinning .glow-bg {
  background: radial-gradient(ellipse at 50% 45%, #f7b32b1a 0%, transparent 55%);
}

.coin-wrapper.result-win .glow-bg {
  background: radial-gradient(ellipse at 50% 45%, #22c55e15 0%, transparent 55%);
}

.coin-wrapper.result-lose .glow-bg {
  background: radial-gradient(ellipse at 50% 45%, #ef444412 0%, transparent 55%);
}

/* Connector line between players */
.connector-line {
  position: absolute;
  top: 30px;
  left: 0;
  right: 0;
  height: 1px;
  z-index: 1;
  background: linear-gradient(90deg, transparent 5%, #f7b32b10 25%, #f7b32b10 75%, transparent 95%);
  transition: all 0.5s;
}

.coin-wrapper.spinning .connector-line {
  background: linear-gradient(90deg, transparent 5%, #f7b32b25 25%, #f7b32b25 75%, transparent 95%);
  animation: connPulse 0.8s ease infinite;
}

@keyframes connPulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.coin-wrapper.result-win .connector-line {
  background: linear-gradient(90deg, transparent 5%, #22c55e18 25%, #22c55e18 75%, transparent 95%);
}

.coin-wrapper.result-lose .connector-line {
  background: linear-gradient(90deg, transparent 5%, #ef444415 25%, #ef444415 75%, transparent 95%);
}

/* Arena layout */
.arena {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  position: relative;
  z-index: 2;
  padding-top: 4px;
}

/* Player cards */
.arena-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 120px;
  flex-shrink: 0;
  transition: all 0.6s ease;
}

.arena-player.winner { transform: scale(1.06); }
.arena-player.loser { transform: scale(0.9); opacity: 0.45; }

.arena-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Orbitron', sans-serif;
  font-size: 15px;
  font-weight: 800;
  color: #fff;
  border: 3px solid #1c2430;
  transition: all 0.6s;
}

.arena-avatar.avatar-you {
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  border-color: #3b82f640;
}

.arena-avatar.avatar-opp {
  background: linear-gradient(135deg, #b8860b, #f7b32b);
  border-color: #f7b32b40;
}

.arena-avatar.avatar-win {
  border-color: #22c55e;
  box-shadow: 0 0 18px #22c55e30;
}

.arena-avatar.avatar-lose {
  border-color: #ef4444;
  box-shadow: 0 0 12px #ef444420;
  opacity: 0.6;
}

.arena-avatar.avatar-bounce {
  animation: avatarBounce 1s ease infinite;
}

@keyframes avatarBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

.arena-name {
  font-size: 12px;
  font-weight: 700;
  color: #c8d0da;
  margin-top: 8px;
  transition: color 0.5s;
}

.arena-name.name-win { color: #22c55e; }
.arena-name.name-lose { color: #94a3b8; opacity: 0.5; }

.arena-bet {
  margin-top: 4px;
  padding: 3px 10px;
  border-radius: 6px;
  background: #131820;
  border: 1px solid #1c2430;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  color: #f7b32b;
  transition: all 0.5s;
}

.arena-bet.bet-win {
  border-color: #22c55e30;
  color: #22c55e;
  background: #22c55e08;
}

.arena-bet.bet-lose {
  border-color: #ef444425;
  color: #ef4444;
  background: #ef444408;
}

/* VS area (center with coin) */
.vs-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 120px;
  max-width: 200px;
  padding: 0 8px;
}

.vs-text {
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
  font-weight: 700;
  color: #374151;
  letter-spacing: 4px;
  margin-bottom: 8px;
  height: 14px;
  transition: opacity 0.3s;
}

.coin-wrapper.spinning .vs-text { opacity: 0; }

/* 3D coin container - this wraps the Coin3D Three.js component */
.coin-3d-container {
  width: 120px;
  height: 120px;
  position: relative;
}

.prize-pool {
  margin-top: 10px;
  text-align: center;
}

.prize-label {
  font-size: 8px;
  color: #374151;
  letter-spacing: 2px;
  font-weight: 700;
}

.prize-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 700;
  color: #f7b32b;
  margin-top: 1px;
  transition: color 0.5s;
}

.prize-value.prize-win { color: #22c55e; }
.prize-value.prize-lose { color: #ef4444; }

/* Result zone */
.result-zone {
  min-height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 10;
  margin-top: 8px;
}

.result-text {
  font-family: 'Orbitron', sans-serif;
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 5px;
  opacity: 0;
  transition: opacity 0.4s ease 0.5s;
}

.result-text.visible { opacity: 1; }
.result-text.win-text { color: #22c55e; }
.result-text.lose-text { color: #ef4444; }

.result-amount {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.4s ease 0.8s;
  margin-top: 3px;
}

.result-amount.visible { opacity: 1; }
.result-amount.win-amount { color: #22c55e90; }
.result-amount.lose-amount { color: #ef444490; }

/* Post-result action buttons */
.result-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  opacity: 0;
  transition: opacity 0.4s ease 1.2s;
}

.result-actions.visible { opacity: 1; }

.action-btn {
  padding: 8px 20px;
  border-radius: 8px;
  font-family: 'Chakra Petch', sans-serif;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.action-btn:hover { transform: translateY(-1px); }

.action-btn.btn-rematch {
  background: linear-gradient(135deg, #b8860b, #f7b32b);
  color: #0b0e11;
  box-shadow: 0 0 15px #f7b32b25;
}

.action-btn.btn-rematch:hover {
  box-shadow: 0 0 25px #f7b32b40;
}

.action-btn.btn-double {
  background: transparent;
  border: 1px solid #22c55e50;
  color: #22c55e;
}

.action-btn.btn-double:hover {
  background: #22c55e10;
  box-shadow: 0 0 15px #22c55e20;
}

.action-btn.btn-change {
  background: transparent;
  border: 1px solid #1c2430;
  color: #94a3b8;
}

.action-btn.btn-change:hover {
  background: #151a22;
}

/* Streak bar */
.streak-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 10px;
  min-height: 20px;
  position: relative;
  z-index: 2;
}

.streak-dot {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 800;
  font-family: 'JetBrains Mono', monospace;
  transition: all 0.3s;
}

.streak-dot.streak-win {
  background: #22c55e18;
  border: 1px solid #22c55e40;
  color: #22c55e;
}

.streak-dot.streak-lose {
  background: #ef444418;
  border: 1px solid #ef444440;
  color: #ef4444;
}

.streak-dot.streak-new {
  animation: streakPop 0.3s ease;
}

@keyframes streakPop {
  0% { transform: scale(0); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); }
}

/* Jackpot progress bar */
.jackpot-bar {
  margin-top: 14px;
  padding: 0 4px;
  position: relative;
  z-index: 2;
}

.jackpot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.jackpot-label {
  font-size: 9px;
  color: #475569;
  letter-spacing: 1.5px;
  font-weight: 700;
}

.jackpot-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #f7b32b;
  font-weight: 600;
}

.jackpot-track {
  height: 4px;
  background: #151a22;
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.jackpot-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #b8860b, #f7b32b, #ffd700);
  transition: width 1s ease;
}

.jackpot-note {
  font-size: 9px;
  color: #374151;
  text-align: center;
  margin-top: 4px;
  transition: color 0.3s;
}

.jackpot-note.jackpot-hot {
  color: #f7b32b80;
  animation: jackpotPulse 1.5s ease infinite;
}

@keyframes jackpotPulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
`;

/* ═══════════════════════════════════════
   JSX STRUCTURE REFERENCE
   ═══════════════════════════════════════
   
   <div className={`coin-wrapper ${wrapperClass}`}>
     <div className="border-trace" />
     <div className="border-flash" />
     <div className="coin-stage-inner">
       <div className="grid-overlay" />
       <div className="glow-bg" />
       <div className="connector-line" />
       
       <div className="arena">
         <!-- Player You (left) -->
         <div className={`arena-player ${p1Class}`}>
           <div className={`arena-avatar avatar-you ${a1Class}`}>
             {address?.slice(2,4).toUpperCase()}
           </div>
           <div className={`arena-name ${n1Class}`}>You</div>
           <div className={`arena-bet ${b1Class}`}>{tierEth} ETH</div>
         </div>
         
         <!-- VS + Coin (center) -->
         <div className="vs-area">
           <div className="vs-text">VS</div>
           <div className="coin-3d-container">
             <Coin3D state={coinState} onComplete={onFlipDone} />
           </div>
           <div className="prize-pool">
             <div className="prize-label">PRIZE POOL</div>
             <div className={`prize-value ${prizeClass}`}>
               {prizeText}
             </div>
           </div>
         </div>
         
         <!-- Opponent (right) -->
         <div className={`arena-player ${p2Class}`}>
           <div className={`arena-avatar avatar-opp ${a2Class}`}>TR</div>
           <div className={`arena-name ${n2Class}`}>Treasury</div>
           <div className={`arena-bet ${b2Class}`}>{tierEth} ETH</div>
         </div>
       </div>
       
       <!-- Result zone -->
       <div className="result-zone">
         <div className={`result-text ${rtClass}`}>{resultText}</div>
         <div className={`result-amount ${raClass}`}>{resultAmount}</div>
         <div className={`result-actions ${showResult ? 'visible' : ''}`}>
           <button className="action-btn btn-rematch" onClick={handleFlip}>
             Rematch
           </button>
           {result === 'win' && (
             <button className="action-btn btn-double" onClick={handleDouble}>
               Double or nothing
             </button>
           )}
           <button className="action-btn btn-change" onClick={() => scrollToTiers()}>
             Change tier
           </button>
         </div>
       </div>
       
       <!-- Streak bar -->
       <div className="streak-bar">
         {flipHistory.slice(0, 12).map((h, i) => (
           <div className={`streak-dot ${h.won ? 'streak-win' : 'streak-lose'} ${i === 0 ? 'streak-new' : ''}`}>
             {h.won ? 'W' : 'L'}
           </div>
         ))}
       </div>
       
       <!-- Jackpot bar -->
       <div className="jackpot-bar">
         <div className="jackpot-header">
           <span className="jackpot-label">JACKPOT PROGRESS</span>
           <span className="jackpot-value">{jackpotAmount} / 0.05 ETH</span>
         </div>
         <div className="jackpot-track">
           <div className="jackpot-fill" style={{ width: `${jackpotPercent}%` }} />
         </div>
         <div className={`jackpot-note ${jackpotPercent > 70 ? 'jackpot-hot' : ''}`}>
           {jackpotPercent > 70 ? 'Almost there... one lucky flip away!' : 'Every flip adds to the jackpot pool'}
         </div>
       </div>
     </div>
   </div>
   
   ═══════════════════════════════════════ */
