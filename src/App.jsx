import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as THREE from "three";
import { useWallet, useFlip, useSeats, useProtocol, useToasts, addToast, EXPLORER } from "./hooks.js";
import { TIERS, CONTRACT_ADDRESS } from "./config.js";
import { deposit as depositFn, withdraw as withdrawFn, getPlayerInfo, getSeatInfo as getSeatInfoFn, decodeError } from "./contract.js";
import { parseEther } from "ethers";
import { playClickSound, playFlipSound, playWinSound, playLoseSound, playDepositSound, playStreakSound, playJackpotSound } from "./sounds.js";

const OWNER = "0xe5678f8659d229a303abecdd0d0113cf1f4f83ae";
const ZERO = "0x0000000000000000000000000000000000000000";
const short = (a) => a ? `${a.slice(0,6)}...${a.slice(-4)}` : "";
const addrColor = (a) => a ? `#${a.slice(2,8)}` : "#333";

// ═══════════════════════════════════════
//  AVATAR
// ═══════════════════════════════════════
function Avatar({ address, size = 36 }) {
  const c = addrColor(address);
  return <div style={{
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    background: `linear-gradient(135deg, ${c}, ${c}88)`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: size * 0.32, fontWeight: 700, color: "#fff", border: "2px solid #1b2838"
  }}>{address ? address.slice(2,4).toUpperCase() : "?"}</div>;
}

// ═══════════════════════════════════════
//  3D COIN
// ═══════════════════════════════════════
function Coin3D({ state, onComplete, size = 240 }) {
  const mountRef = useRef(null);
  const sceneRef = useRef({});
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const w = size, h = size;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 4);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2); dir.position.set(3,5,4); scene.add(dir);
    const rim = new THREE.DirectionalLight(0x00e87b, 0.5); rim.position.set(-3,-2,2); scene.add(rim);

    const g = new THREE.Group(); scene.add(g);
    const r = 1.1, th = 0.12, seg = 64;
    const mat = new THREE.MeshStandardMaterial({ color: 0x00c868, metalness: 0.9, roughness: 0.15, emissive: 0x003318, emissiveIntensity: 0.15 });
    const edge = new THREE.MeshStandardMaterial({ color: 0x009950, metalness: 0.95, roughness: 0.1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r,r,th,seg), mat);
    body.rotation.x = Math.PI/2; g.add(body);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(r, th/2, 16, seg), edge));

    const mkFace = (letter, z, rot) => {
      const cv = document.createElement("canvas"); cv.width=256; cv.height=256;
      const cx = cv.getContext("2d"); cx.fillStyle="#00000000"; cx.fillRect(0,0,256,256);
      cx.fillStyle="#003318"; cx.font="bold 130px monospace"; cx.textAlign="center"; cx.textBaseline="middle";
      cx.fillText(letter,128,128);
      const m = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, metalness: 0.6, roughness: 0.3, color: 0x00b05a });
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(r*0.82, seg), m);
      mesh.position.z = z; if (rot) mesh.rotation.y = Math.PI; g.add(mesh);
    };
    mkFace("F", th/2+0.001, false); mkFace("R", -(th/2+0.001), true);
    g.rotation.x = 0.3;
    sceneRef.current = { scene, camera, renderer, g, startTime: null, phase: "idle" };

    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const s = sceneRef.current, t = performance.now()/1000;
      if (s.phase==="idle") { s.g.rotation.y=Math.sin(t*0.8)*0.15; s.g.position.y=Math.sin(t*1.2)*0.04; }
      else if (s.phase==="spinning") {
        const el2=t-s.startTime, sp=Math.max(0,25-el2*4);
        s.g.rotation.x+=sp*0.016; s.g.position.y=Math.sin(el2*3)*0.12*Math.max(0,1-el2/4);
        if (sp<=0.5) { s.phase="landing"; s.startTime=t; const tx=stateRef.current==="win"?0:Math.PI; s.targetR=tx+Math.round(s.g.rotation.x/(Math.PI*2))*Math.PI*2; }
      } else if (s.phase==="landing") {
        const p=Math.min(1,(t-s.startTime)/0.6);
        s.g.rotation.x+=(s.targetR-s.g.rotation.x)*0.08; s.g.position.y=Math.sin(p*Math.PI)*-0.08;
        if (p>=1&&s.phase!=="done") { s.phase="done"; onComplete?.(); }
      } else if (s.phase==="done") { s.g.position.y=Math.sin(t*2)*0.02; }
      renderer.render(scene,camera);
    };
    animate();
    return () => { cancelAnimationFrame(raf); renderer.dispose(); if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement); };
  }, [size]);

  useEffect(() => {
    if (state==="spinning") { sceneRef.current.phase="spinning"; sceneRef.current.startTime=performance.now()/1000; }
    else if (state==="idle") sceneRef.current.phase="idle";
  }, [state]);

  return <div ref={mountRef} style={{ width: size, height: size }} />;
}

// ═══════════════════════════════════════
//  CONFETTI
// ═══════════════════════════════════════
function Confetti() {
  return <div style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"hidden", zIndex:20 }}>
    {Array.from({length:20},(_,i) => <div key={i} style={{
      position:"absolute", left:`${Math.random()*100}%`, top:-10,
      width:5+Math.random()*5, height:5+Math.random()*5,
      background:["#00e87b","#f0c040","#3b7dff","#1abc9c"][i%4],
      borderRadius: Math.random()>0.5?"50%":"2px",
      animation:`confetti ${1.5+Math.random()*1.5}s ease-out ${i*0.04}s forwards`
    }} />)}
  </div>;
}

// ═══════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════
function Toasts({ toasts, remove }) {
  return <div style={{ position:"fixed", top:12, right:12, zIndex:9999, display:"flex", flexDirection:"column", gap:6, maxWidth:340 }}>
    {toasts.map(t => <div key={t.id} onClick={() => remove(t.id)} style={{
      padding:"10px 14px", borderRadius:8, cursor:"pointer", animation:"fadeIn .3s", fontSize:12,
      background: t.type==="success"?"#00e87b12":t.type==="error"?"#ff444412":"#f0c04012",
      border:`1px solid ${t.type==="success"?"#00e87b30":t.type==="error"?"#ff444430":"#f0c04030"}`,
      color: t.type==="success"?"#00e87b":t.type==="error"?"#ff4444":"#f0c040",
    }}>
      {t.type==="pending" && <span style={{animation:"pulse 1s infinite"}}>... </span>}{t.message}
      {t.txHash && <a href={`${EXPLORER}/tx/${t.txHash}`} target="_blank" rel="noreferrer" style={{display:"block",fontSize:9,color:"#484f58",marginTop:3}}>View tx</a>}
    </div>)}
  </div>;
}

// ═══════════════════════════════════════
//  MOCK CHAT
// ═══════════════════════════════════════
const MOCK_CHAT = [
  { user: "BasedDegen", msg: "LFG", lvl: 12 },
  { user: "FlipperKing", msg: "just hit 5x streak", lvl: 34 },
  { user: "0xWhale", msg: "bought seat #42", lvl: 8 },
  { user: "CryptoNova", msg: "treasury needs funding", lvl: 21 },
  { user: "SigmaGrind", msg: "0.05 tier is the sweet spot", lvl: 15 },
  { user: "MoonBoi", msg: "wen jackpot", lvl: 5 },
  { user: "AlphaSeeker", msg: "seat yield looking good today", lvl: 29 },
  { user: "DegenApe", msg: "lost 3 in a row lol", lvl: 7 },
  { user: "BaseMaxi", msg: "this is the best coinflip on base", lvl: 18 },
  { user: "FlipMaster", msg: "GG everyone", lvl: 44 },
];

function ChatSidebar() {
  return <aside className="sidebar-left">
    <div className="sidebar-header">
      <span>General Chat</span>
      <span className="online-badge">
        <span className="online-dot" /> {Math.floor(Math.random()*30)+12}
      </span>
    </div>
    <div className="chat-messages">
      {MOCK_CHAT.map((m,i) => <div key={i} className="chat-msg">
        <Avatar address={`0x${m.user.slice(0,6).padEnd(40,'0')}`} size={24} />
        <div>
          <span className="chat-user">{m.user}</span>
          <span className="chat-lvl">{m.lvl}</span>
          <div className="chat-text">{m.msg}</div>
        </div>
      </div>)}
    </div>
    <div className="chat-input-row">
      <input className="chat-input" placeholder="Type message..." disabled />
    </div>
  </aside>;
}

// ═══════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════
export default function FlipperRooms() {
  const [tab, setTab] = useState("flip");
  const [tier, setTier] = useState(1);
  const [coinState, setCoinState] = useState("idle");
  const [showResult, setShowResult] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [flipModal, setFlipModal] = useState(null); // {type, challengeId?}
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [seatDetail, setSeatDetail] = useState(null);
  const [seatView, setSeatView] = useState("grid");
  const [seatSort, setSeatSort] = useState("price");
  const [depositAmt, setDepositAmt] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [playerStats, setPlayerStats] = useState(null);
  const [jackpotWin, setJackpotWin] = useState(null);
  const [showExplainer, setShowExplainer] = useState(true);
  const [sessionFlips, setSessionFlips] = useState(0);
  const [sessionPnl, setSessionPnl] = useState(0);
  const [adminAmt, setAdminAmt] = useState("");
  const [showChat, setShowChat] = useState(false);

  const isMobile = useIsMobile();
  const { toasts, remove: removeToast } = useToasts();
  const wallet = useWallet();
  const { connected, address, contract, sessionBalance, refreshBalance, connect, disconnect, ready, authenticated, isEmbedded } = wallet;
  const flip = useFlip(contract, address, refreshBalance);
  const seats = useSeats(contract, address, refreshBalance);
  const proto = useProtocol(contract);

  const [referralSeat] = useState(() => {
    const u = parseInt(new URLSearchParams(window.location.search).get("ref")) || 0;
    if (u > 0) { localStorage.setItem("flipper_ref", String(u)); return u; }
    return parseInt(localStorage.getItem("flipper_ref")) || 0;
  });

  // Data loading
  useEffect(() => { if (!contract) return; flip.refreshChallenges(); flip.refreshHistory(); seats.refreshSeats(); proto.refreshStats(); }, [contract]);
  useEffect(() => { if (!contract) return; const iv = setInterval(() => { refreshBalance(); proto.refreshStats(); flip.refreshChallenges(); flip.refreshHistory(); }, 15000); return () => clearInterval(iv); }, [contract, refreshBalance]);
  useEffect(() => { if (!contract || !address) return; getPlayerInfo(contract, address).then(setPlayerStats).catch(()=>{}); }, [contract, address, sessionBalance]);
  useEffect(() => { if (!contract || !selectedSeat) { setSeatDetail(null); return; } getSeatInfoFn(contract, selectedSeat.id).then(setSeatDetail).catch(()=>{}); }, [contract, selectedSeat]);

  const balNum = parseFloat(sessionBalance || "0");
  const treasuryMax = proto.stats ? Number(proto.stats.treasury) * 0.05 : 0;
  const isAdmin = address?.toLowerCase() === OWNER;
  const ownedCount = seats.seats.filter(s => s.active).length;
  const seatPoolEth = proto.stats ? proto.stats.seatPool : "0";
  const estYield = ownedCount > 0 && proto.stats ? (Number(proto.stats.totalVolume) * 0.025) / ownedCount : 0;

  // ─── Flip Logic ───
  const processResult = (result) => {
    if (!result) { setCoinState("idle"); return; }
    const won = result.winner.toLowerCase() === address?.toLowerCase();
    if (won) { playWinSound(); if (result.winnerStreak >= 3) playStreakSound(result.winnerStreak); }
    else playLoseSound();
    setCoinState(won ? "win" : "lose");
    setSessionFlips(p => p + 1);
    setSessionPnl(p => p + (won ? parseFloat(result.payout) - parseFloat(result.amount) : -parseFloat(result.amount)));
    if (result.jackpotAmount) { setJackpotWin(result.jackpotAmount); playJackpotSound(); }
    refreshBalance();
  };

  const doFlipTreasury = async () => {
    if (coinState !== "idle" || !connected) return;
    playClickSound();
    if (isEmbedded) { setCoinState("spinning"); playFlipSound(); }
    const result = await flip.flipTreasury(TIERS[tier].wei, referralSeat);
    if (!result) { setCoinState("idle"); return; }
    if (!isEmbedded) { setCoinState("spinning"); playFlipSound(); await new Promise(r => setTimeout(r, 1500)); }
    processResult(result);
  };

  const doFlipPvp = async () => {
    if (coinState !== "idle" || !connected) return;
    playClickSound();
    if (isEmbedded) { setCoinState("spinning"); playFlipSound(); }
    const result = await flip.flipPvp(TIERS[tier].wei, referralSeat);
    setCoinState("idle");
    if (result) refreshBalance();
  };

  const doAccept = async (id) => {
    if (coinState !== "idle" || !connected) return;
    playClickSound();
    if (isEmbedded) { setCoinState("spinning"); playFlipSound(); }
    const result = await flip.acceptCh(id, referralSeat);
    if (!result) { setCoinState("idle"); return; }
    if (!isEmbedded) { setCoinState("spinning"); playFlipSound(); await new Promise(r => setTimeout(r, 1500)); }
    processResult(result);
  };

  const onCoinDone = useCallback(() => {
    setShowResult(true);
    if (flip.lastResult === "win") { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 2500); }
    setTimeout(() => { setCoinState("idle"); setShowResult(false); flip.setLastFlipDetails(null); }, 4000);
  }, [flip.lastResult]);

  const doDeposit = async () => {
    if (!contract || !depositAmt || isDepositing) return;
    playClickSound(); setIsDepositing(true);
    try { await depositFn(contract, depositAmt); playDepositSound(); setDepositAmt(""); refreshBalance(); }
    catch (err) { addToast("error", decodeError(err)); }
    finally { setIsDepositing(false); }
  };

  const doWithdraw = async () => {
    if (!contract || !depositAmt || isDepositing) return;
    playClickSound(); setIsDepositing(true);
    try { await withdrawFn(contract, depositAmt); setDepositAmt(""); refreshBalance(); }
    catch (err) { addToast("error", decodeError(err)); }
    finally { setIsDepositing(false); }
  };

  // ─── RENDER ───
  return (
    <div className="app">
      <style>{CSS}</style>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <Toasts toasts={toasts} remove={removeToast} />

      {/* Jackpot overlay */}
      {jackpotWin && <div className="jackpot-overlay" onClick={() => setJackpotWin(null)}>
        <div className="jackpot-title">JACKPOT</div>
        <div className="jackpot-amount">+{jackpotWin} ETH</div>
        <div style={{fontSize:12,color:"#484f58",marginTop:20}}>Click to close</div>
      </div>}

      {/* HEADER */}
      <header className="header">
        <div className="header-left">
          {isMobile && <button className="btn-icon" onClick={() => setShowChat(p=>!p)}>&#9776;</button>}
          <div className="logo"><span className="logo-f">FLIPPER</span><span className="logo-r">ROOMS</span></div>
          <span className="chain-badge">BASE</span>
        </div>
        <nav className="header-nav">
          {["flip","board","fair"].map(t => (
            <button key={t} className={`nav-tab ${tab===t?"active":""}`} onClick={() => { playClickSound(); setTab(t); }}>
              {t==="flip"?"Coinflip":t==="board"?"Board":"Fair"}
            </button>
          ))}
        </nav>
        <div className="header-right">
          {connected && <div className="bal-pill mono">{balNum > 0 ? `${balNum.toFixed(4)} ETH` : "0 ETH"}</div>}
          {!ready ? <span className="text-muted">...</span>
           : connected ? <button className="btn-addr" onClick={disconnect}>{isEmbedded && <span className="auto-badge">AUTO</span>}{short(address)}</button>
           : authenticated ? <span className="text-gold pulse">Connecting...</span>
           : <button className="btn-connect" onClick={() => { playClickSound(); connect(); }}>Connect</button>
          }
        </div>
      </header>

      <div className="layout">
        {/* LEFT SIDEBAR */}
        {(!isMobile || showChat) && <ChatSidebar />}

        {/* MAIN */}
        <main className="main">

          {/* ════ COINFLIP TAB ════ */}
          {tab === "flip" && <div className="fade-in">

            {/* Referral */}
            {referralSeat > 0 && <div className="referral-bar">Referred by Seat #{referralSeat}</div>}

            {/* Create Flip Section */}
            <div className="card create-flip-card">
              <div className="text-muted" style={{fontSize:11,letterSpacing:1,marginBottom:4}}>PLAY COINFLIP ON BASE</div>
              <h2 className="section-title" style={{fontSize:22,marginBottom:16}}>COINFLIP</h2>

              {/* Streak bar */}
              {connected && playerStats && (
                <div className="streak-bar">
                  <span className="text-muted">W/L</span>
                  <span><span className="text-green">{playerStats.wins}</span>/<span className="text-red">{playerStats.losses}</span></span>
                  <span className="divider-v" />
                  <span className="text-muted">Streak</span>
                  <span className={`streak-num ${playerStats.streak>=5?"fire-hot":playerStats.streak>=3?"fire":""}`}>
                    {playerStats.streak > 0 ? `${playerStats.streak}x` : "—"}
                  </span>
                  <span className="divider-v" />
                  <span className="text-muted">Best</span>
                  <span>{playerStats.bestStreak}</span>
                </div>
              )}

              {/* Bet amount */}
              <div style={{fontSize:11,color:"#8b949e",marginBottom:6}}>Bet Amount (ETH)</div>
              <div className="tier-row">
                {TIERS.map((t,i) => {
                  const tooHigh = treasuryMax > 0 && Number(t.label) > treasuryMax;
                  return <button key={t.wei} className={`tier-btn ${tier===i?"active":""}`}
                    onClick={() => { playClickSound(); setTier(i); }}
                    title={tooHigh?"Treasury too low":""}
                    style={tooHigh?{opacity:0.3}:{}}>{t.label}</button>;
                })}
              </div>

              {/* 3D Coin */}
              <div className="coin-area" style={{ position: "relative" }}>
                {showConfetti && <Confetti />}
                <Coin3D state={coinState} onComplete={onCoinDone} size={isMobile ? 180 : 220} />

                {coinState === "spinning" && !showResult && (
                  <div className="coin-overlay"><span className="text-gold pulse" style={{fontSize:13,letterSpacing:3,fontWeight:700}}>FLIPPING...</span></div>
                )}
                {showResult && flip.lastResult && (
                  <div className={`coin-overlay result-overlay ${flip.lastResult}`}>
                    <div className="result-text">{flip.lastResult === "win" ? "YOU WIN" : "YOU LOSE"}</div>
                    {flip.lastFlipDetails && <div className="result-details">
                      <span className={flip.lastFlipDetails.won?"text-green":"text-red"}>
                        {flip.lastFlipDetails.won?"+":"-"}{flip.lastFlipDetails.won?flip.lastFlipDetails.payout:flip.lastFlipDetails.amount} ETH
                      </span>
                      {flip.lastFlipDetails.winnerStreak >= 3 && <span className="text-gold"> {flip.lastFlipDetails.winnerStreak}x streak</span>}
                      {flip.lastFlipDetails.txHash && <a href={`${EXPLORER}/tx/${flip.lastFlipDetails.txHash}`} target="_blank" rel="noreferrer" className="tx-link">View TX</a>}
                    </div>}
                  </div>
                )}
              </div>

              {/* Flip buttons */}
              <div className="flip-btns">
                <button className="btn-flip green" disabled={coinState!=="idle"||!connected||flip.isFlipping} onClick={doFlipPvp}>
                  PVP FLIP<span className="btn-sub">{TIERS[tier].label} ETH · Create</span>
                </button>
                <button className="btn-flip gold" disabled={coinState!=="idle"||!connected||flip.isFlipping} onClick={doFlipTreasury}>
                  VS TREASURY<span className="btn-sub">{TIERS[tier].label} ETH · Instant</span>
                </button>
              </div>
              {connected && !isEmbedded && <div className="text-muted" style={{textAlign:"center",fontSize:10,marginTop:6}}>Login with email for instant flips</div>}
              {sessionFlips > 0 && <div className="session-stats">Session: {sessionFlips} flips <span className={sessionPnl>=0?"text-green":"text-red"}>{sessionPnl>=0?"+":""}{sessionPnl.toFixed(4)} ETH</span></div>}
            </div>

            {/* All Games */}
            <div className="section-label">ALL GAMES <span className="text-green">{flip.challenges.length} open</span></div>
            {flip.challenges.length === 0 && <div className="empty">No open challenges</div>}
            {flip.challenges.map(c => (
              <div key={c.id} className="game-row">
                <div className="game-left">
                  <Avatar address={c.creator} size={32} />
                  <div>
                    <div className="mono" style={{fontSize:12}}>{short(c.creator)}</div>
                    <div className="text-muted" style={{fontSize:10}}>#{c.id}</div>
                  </div>
                </div>
                <div className="game-center mono">{c.amount} ETH</div>
                <div className="game-right">
                  <span className="status-badge joinable">JOINABLE</span>
                  {c.creator.toLowerCase() === address?.toLowerCase()
                    ? <button className="btn-sm red" disabled={flip.isFlipping} onClick={() => { playClickSound(); flip.cancelCh(c.id); }}>Cancel</button>
                    : <button className="btn-sm green" disabled={flip.isFlipping} onClick={() => doAccept(c.id)}>Join</button>
                  }
                </div>
              </div>
            ))}

            {/* Recent flips */}
            <div className="section-label" style={{marginTop:16}}>RECENT FLIPS</div>
            {flip.history.length === 0 && <div className="empty">No recent flips</div>}
            {flip.history.slice(0,10).map((h,i) => {
              const won = address ? h.winner.toLowerCase() === address.toLowerCase() : null;
              return <div key={i} className="game-row compact">
                <div className="game-left">
                  <div className={`dot ${won===null?"gray":won?"green":"red"}`} />
                  <span className={`mono ${won===null?"":"text-"+(won?"green":"red")}`} style={{fontSize:11,fontWeight:600}}>
                    {won===null?"FLIP":won?"WON":"LOST"}
                  </span>
                  <span className="text-muted" style={{fontSize:10}}>
                    {h.vsTreasury?"vs Treasury":`${short(h.winner)} vs ${short(h.loser)}`}
                  </span>
                </div>
                <div className="mono" style={{fontSize:11}}>{h.amount} ETH {h.winnerStreak>=3 && <span className="text-gold">{h.winnerStreak}x</span>}</div>
              </div>;
            })}
          </div>}

          {/* ════ BOARD TAB ════ */}
          {tab === "board" && <div className="fade-in">
            {showExplainer && <div className="explainer-card">
              <button className="btn-close" onClick={() => setShowExplainer(false)}>x</button>
              <div style={{fontWeight:700,fontSize:13,marginBottom:6}}>How Seats Work</div>
              <div className="text-secondary" style={{fontSize:10,lineHeight:1.7}}>
                <b className="text-green">Own a seat</b> — earn from every flip (2.5% fee pool).
                <b className="text-gold"> Harberger Tax:</b> set your price, pay 5%/week.
                <b className="text-blue"> Referrals:</b> share your link for bonus yield.
              </div>
            </div>}

            {/* Reward pool + distribute */}
            <div className="reward-pool-row">
              <div><div className="text-muted" style={{fontSize:9,letterSpacing:1.5}}>REWARD POOL</div><div className="mono text-green" style={{fontSize:14,fontWeight:700}}>{Number(seatPoolEth).toFixed(4)} ETH</div></div>
              <button className="btn-sm green" disabled={!connected||parseFloat(seatPoolEth)<0.0001} onClick={async () => {
                playClickSound();
                try { const tx = await contract.distributeRewards(); await tx.wait(); addToast("success","Rewards distributed!"); seats.refreshSeats(); proto.refreshStats(); }
                catch(e) { addToast("error",decodeError(e)); }
              }}>Distribute</button>
            </div>

            {/* Admin */}
            {isAdmin && <div className="admin-card">
              <div className="text-muted" style={{fontSize:9,letterSpacing:1.5,marginBottom:4}}>ADMIN</div>
              <div style={{display:"flex",gap:6}}>
                <input className="input-sm" placeholder="ETH" type="number" step="0.01" value={adminAmt} onChange={e=>setAdminAmt(e.target.value)} />
                <button className="btn-sm gold" onClick={async () => {
                  if (!adminAmt) return;
                  try { const tx=await contract.fundTreasury({value:parseEther(adminAmt)}); await tx.wait(); addToast("success",`Funded ${adminAmt} ETH`); setAdminAmt(""); proto.refreshStats(); }
                  catch(e) { addToast("error",decodeError(e)); }
                }}>Fund Treasury</button>
              </div>
            </div>}

            {/* Stats */}
            <div className="board-stats">
              {[
                {l:"OWNED",v:`${ownedCount}/256`,c:"green"},{l:"FLOOR",v:"0.001 Ξ",c:"gold"},
                {l:"SEAT POOL",v:`${Number(seatPoolEth).toFixed(4)} Ξ`,c:"blue"},{l:"MY SEATS",v:`${seats.mySeats.length}`,c:"red"},
              ].map((s,i) => <div key={i} className="stat-card"><div className="text-muted" style={{fontSize:8,letterSpacing:1.5}}>{s.l}</div><div className={`stat-val text-${s.c}`}>{s.v}</div></div>)}
            </div>

            {/* View toggle */}
            <div className="view-tabs">
              {["grid","list","my seats"].map(v => <button key={v} className={`vtab ${seatView===v?"active":""}`} onClick={() => { playClickSound(); setSeatView(v); }}>{v}</button>)}
            </div>

            {seatView === "grid" && <div className={`grid-layout ${selectedSeat && !isMobile ? "with-detail" : ""}`}>
              <div className={`seat-grid ${isMobile?"mobile":""}`}>
                {seats.seats.map(s => {
                  const sel = selectedSeat?.id === s.id;
                  const mine = s.active && address && s.owner.toLowerCase() === address.toLowerCase();
                  const runway = s.active && Number(s.price) > 0 ? (Number(s.deposit) / (Number(s.price) * 0.05)) * 7 : 99;
                  const isLow = s.active && runway < 3;
                  return <div key={s.id} className={`seat-cell ${sel?"selected":""} ${mine?"mine":""} ${s.active?"active":""} ${isLow?"low":""}`}
                    onClick={() => setSelectedSeat(s)}>{s.id}</div>;
                })}
              </div>
              {selectedSeat && <SeatPanel seat={selectedSeat} detail={seatDetail} address={address} connected={connected}
                seats={seats} estYield={estYield} onClose={() => { setSelectedSeat(null); setSeatDetail(null); }} />}
            </div>}

            {seatView === "list" && <div>
              <div className="sort-row">
                <span className="text-muted" style={{fontSize:9}}>SORT:</span>
                {["price","deposit","name"].map(s => <button key={s} className={`vtab sm ${seatSort===s?"active":""}`} onClick={()=>setSeatSort(s)}>{s}</button>)}
              </div>
              <div className="list-table">
                {seats.seats.filter(s=>s.active).sort((a,b) => {
                  if (seatSort==="deposit") return parseFloat(b.deposit)-parseFloat(a.deposit);
                  if (seatSort==="name") return (a.name||"").localeCompare(b.name||"");
                  return b.priceWei>a.priceWei?1:b.priceWei<a.priceWei?-1:0;
                }).slice(0,50).map(s => <div key={s.id} className="list-row" onClick={() => { setSelectedSeat(s); setSeatView("grid"); }}>
                  <span className="mono" style={{width:40,fontWeight:700,color:"#484f58"}}>{s.id}</span>
                  <span className="text-secondary" style={{flex:1}}>{short(s.owner)}</span>
                  <span className="mono text-gold" style={{width:80,textAlign:"right"}}>{Number(s.price).toFixed(4)}</span>
                  {!isMobile && <span className="mono text-blue" style={{width:80,textAlign:"right"}}>{Number(s.deposit).toFixed(4)}</span>}
                  <span className="text-muted" style={{width:60,textAlign:"right"}}>{s.name}</span>
                </div>)}
              </div>
            </div>}

            {seatView === "my seats" && <div>
              {seats.mySeats.length === 0 ? <div className="empty">You don't own any seats</div>
              : seats.mySeats.map(id => {
                const s = seats.seats.find(x => x.id === id);
                if (!s) return null;
                return <div key={id} className="game-row">
                  <div><span className="text-blue" style={{fontWeight:700,fontSize:14}}>#{id}</span> <span className="text-muted">{s.name}</span> <span className="mono text-gold">{Number(s.price).toFixed(4)} Ξ</span></div>
                  <div style={{display:"flex",gap:4}}>
                    <button className="btn-sm green" onClick={() => { playClickSound(); seats.claim(id); }}>Claim</button>
                    <button className="btn-sm red" onClick={() => { playClickSound(); seats.abandon(id); }}>Abandon</button>
                    <button className="btn-sm blue" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}?ref=${id}`); addToast("success",`Ref link copied for #${id}`); }}>Ref Link</button>
                  </div>
                </div>;
              })}
            </div>}
          </div>}

          {/* ════ FAIR TAB ════ */}
          {tab === "fair" && <div className="fade-in" style={{maxWidth:600}}>
            <h2 className="section-title">Provably Fair</h2>
            <p className="text-secondary" style={{lineHeight:1.8,marginBottom:20}}>
              Every flip uses on-chain randomness via <b className="text-primary">block.prevrandao</b> combined with player addresses, timestamps, and counters.
            </p>
            <div className="code-block">
              <div className="text-green">// Flip resolution (on-chain)</div>
              {"rand = keccak256(abi.encodePacked("}<br/>
              {"  block.prevrandao,"}<br/>
              {"  playerA, playerB,"}<br/>
              {"  block.timestamp,"}<br/>
              {"  challengeId, totalFlips"}<br/>
              {"));"}<br/><br/>
              {"winner = (rand % 2 == 0) ? playerA : playerB;"}
            </div>
            <div className="section-label" style={{marginTop:20}}>FEE STRUCTURE (5% total)</div>
            <div className="fee-grid">
              {[{l:"Seat Pool",v:"2.5%",c:"green"},{l:"Referral",v:"1.0%",c:"blue"},{l:"Protocol",v:"0.75%",c:"gold"},{l:"Buyback",v:"0.5%",c:"red"},{l:"Jackpot",v:"0.25%",c:"red"}].map((f,i) =>
                <div key={i} className="fee-item"><span className="text-muted">{f.l}</span><span className={`text-${f.c} mono`} style={{fontWeight:700}}>{f.v}</span></div>
              )}
            </div>
            <p className="text-muted" style={{fontSize:11,marginTop:16}}>
              All TXs verifiable on <a href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer" className="text-blue">BaseScan</a>.
            </p>
          </div>}
        </main>

        {/* RIGHT SIDEBAR */}
        {!isMobile && <aside className="sidebar-right">
          <div className="sidebar-header">Account</div>

          {/* Balance */}
          <div className="info-section">
            <div className="text-muted" style={{fontSize:9,letterSpacing:1.5}}>SESSION BALANCE</div>
            <div className="mono" style={{fontSize:16,fontWeight:700,marginTop:2}}>{balNum > 0 ? `${balNum.toFixed(4)}` : "0"} <span className="text-muted">ETH</span></div>
          </div>

          {/* Quick amounts */}
          <div className="quick-btns">
            {[0.005,0.01,0.05,0.1].map(a => <button key={a} className="btn-quick" onClick={()=>setDepositAmt(String(a))}>{a}</button>)}
            <button className="btn-quick red" onClick={()=>setDepositAmt(sessionBalance)}>MAX</button>
          </div>

          {/* Deposit/Withdraw */}
          <div className="info-section">
            <input className="input-full" placeholder="Amount ETH" type="number" step="0.001" value={depositAmt} onChange={e=>setDepositAmt(e.target.value)} />
            <div style={{display:"flex",gap:4,marginTop:4}}>
              <button className="btn-sm green" style={{flex:1}} disabled={!connected||isDepositing} onClick={doDeposit}>{isDepositing?"...":"Deposit"}</button>
              <button className="btn-sm red" style={{flex:1}} disabled={!connected||isDepositing} onClick={doWithdraw}>{isDepositing?"...":"Withdraw"}</button>
            </div>
          </div>

          {/* Stats */}
          <div className="info-section">
            <div className="text-muted" style={{fontSize:9,letterSpacing:1.5,marginBottom:6}}>PROTOCOL</div>
            {[
              {l:"Total Bets",v:proto.stats?proto.stats.totalFlips.toLocaleString():"..."},
              {l:"Treasury",v:proto.stats?`${Number(proto.stats.treasury).toFixed(4)} Ξ`:"..."},
              {l:"Jackpot",v:proto.stats?`${Number(proto.stats.jackpot).toFixed(4)} Ξ`:"..."},
              {l:"Volume",v:proto.stats?`${Number(proto.stats.totalVolume).toFixed(3)} Ξ`:"..."},
            ].map((s,i) => <div key={i} className="stat-row"><span>{s.l}</span><span className="mono">{s.v}</span></div>)}
          </div>
          {connected && playerStats && <div className="info-section">
            <div className="text-muted" style={{fontSize:9,letterSpacing:1.5,marginBottom:6}}>YOUR STATS</div>
            {[
              {l:"Wins",v:playerStats.wins},{l:"Losses",v:playerStats.losses},
              {l:"Streak",v:playerStats.streak},{l:"Best",v:playerStats.bestStreak},
              {l:"Wagered",v:`${Number(playerStats.wagered).toFixed(3)} Ξ`},
            ].map((s,i) => <div key={i} className="stat-row"><span>{s.l}</span><span className="mono">{s.v}</span></div>)}
          </div>}
        </aside>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
//  SEAT DETAIL PANEL
// ═══════════════════════════════════════
function SeatPanel({ seat, detail, address, connected, seats, estYield, onClose }) {
  const [buyName, setBuyName] = useState("");
  const [buyDeposit, setBuyDeposit] = useState("0.002");
  const [newPrice, setNewPrice] = useState("");
  const [ownerPrice, setOwnerPrice] = useState("");
  const [ownerDep, setOwnerDep] = useState("");

  const isOwner = address && seat.active && seat.owner.toLowerCase() === address.toLowerCase();
  const isEmpty = !seat.active;

  return <div className="seat-panel">
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
      <span className="section-title" style={{fontSize:18}}>#{seat.id}</span>
      <button className="btn-close" onClick={onClose}>x</button>
    </div>
    <div className="seat-info">
      {[
        {l:"Owner",v:isEmpty?"Available":(detail?short(detail.owner):"..."),c:isEmpty?"text-green":""},
        {l:"Price",v:detail?`${Number(detail.price).toFixed(4)} Ξ`:`${seat.price} Ξ`,c:"text-gold"},
        {l:"Deposit",v:detail?`${Number(detail.deposit).toFixed(4)} Ξ`:"...",c:"text-blue"},
        {l:"Rewards",v:detail?`${Number(detail.rewards).toFixed(5)} Ξ`:"...",c:"text-green"},
        {l:"Tax Owed",v:detail?`${Number(detail.pendingTax).toFixed(5)} Ξ`:"...",c:"text-red"},
        {l:"Runway",v:detail?(detail.runway>0?`${Math.floor(detail.runway/86400)}d`:"..."):"..",c:""},
        {l:"Est. yield/wk",v:`~${estYield.toFixed(5)} Ξ`,c:"text-green"},
      ].map((r,i) => <div key={i} className="seat-row"><span className="text-muted">{r.l}</span><span className={`mono ${r.c}`}>{r.v}</span></div>)}
    </div>

    {connected && !isOwner && <div className="seat-actions">
      <input className="input-full" placeholder="Name (max 32)" maxLength={32} value={buyName} onChange={e=>setBuyName(e.target.value)} />
      <input className="input-full" placeholder="List price (ETH)" value={newPrice} onChange={e=>setNewPrice(e.target.value)} />
      <input className="input-full" placeholder="Deposit (ETH)" value={buyDeposit} onChange={e=>setBuyDeposit(e.target.value)} />
      <button className="btn-full green" onClick={() => {
        playClickSound();
        const price = isEmpty ? parseEther("0.001") : seat.priceWei;
        seats.buySeat(seat.id, newPrice || (isEmpty ? "0.001" : seat.price), buyName.slice(0,32), price, buyDeposit);
      }}>{isEmpty ? "Claim · 0.001 Ξ + deposit" : `Buyout · ${seat.price} Ξ + deposit`}</button>
    </div>}

    {connected && isOwner && <div className="seat-actions">
      <button className="btn-full green" onClick={() => { playClickSound(); seats.claim(seat.id); }}>Claim Rewards</button>
      <div style={{display:"flex",gap:4}}>
        <input className="input-sm" placeholder="New price" value={ownerPrice} onChange={e=>setOwnerPrice(e.target.value)} />
        <button className="btn-sm gold" onClick={() => { if(ownerPrice){playClickSound();seats.updatePrice(seat.id,ownerPrice);setOwnerPrice("");} }}>Set</button>
      </div>
      <div style={{display:"flex",gap:4}}>
        <input className="input-sm" placeholder="Add deposit" value={ownerDep} onChange={e=>setOwnerDep(e.target.value)} />
        <button className="btn-sm blue" onClick={() => { if(ownerDep){playClickSound();seats.addDeposit(seat.id,ownerDep);setOwnerDep("");} }}>Add</button>
      </div>
      <button className="btn-full red" onClick={() => { playClickSound(); seats.abandon(seat.id); }}>Abandon</button>
      <button className="btn-full blue" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}?ref=${seat.id}`); addToast("success","Ref link copied"); }}>Copy Ref Link</button>
    </div>}
  </div>;
}

// ═══════════════════════════════════════
//  HOOKS
// ═══════════════════════════════════════
function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" && window.innerWidth < 1024);
  useEffect(() => { const h = () => setM(window.innerWidth < 1024); window.addEventListener("resize",h); return () => window.removeEventListener("resize",h); }, []);
  return m;
}

// ═══════════════════════════════════════
//  CSS
// ═══════════════════════════════════════
const CSS = `
* { box-sizing: border-box; }
@keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
@keyframes pulse { 0%,100% { opacity:.6 } 50% { opacity:1 } }
@keyframes confetti { 0% { transform:translateY(0) rotate(0); opacity:1 } 100% { transform:translateY(350px) rotate(720deg); opacity:0 } }
@keyframes pulseRed { 0%,100% { box-shadow:none } 50% { box-shadow:0 0 6px #ff444440 } }

.app { min-height:100vh; background:#0d1117; color:#e0e0e0; font-family:'Inter',system-ui,sans-serif; font-size:13px; }
.fade-in { animation: fadeIn .35s ease; }
.mono { font-family:'JetBrains Mono',monospace; }
.text-green { color:#00e87b; } .text-red { color:#ff4444; } .text-gold { color:#f0c040; } .text-blue { color:#3b7dff; }
.text-primary { color:#e0e0e0; } .text-secondary { color:#8b949e; } .text-muted { color:#484f58; }
.pulse { animation: pulse 1.5s infinite; }

/* HEADER */
.header { display:flex; align-items:center; justify-content:space-between; height:52px; padding:0 16px; background:#0d1117; border-bottom:1px solid #1b2838; position:sticky; top:0; z-index:50; }
.header-left { display:flex; align-items:center; gap:10px; }
.header-right { display:flex; align-items:center; gap:8px; }
.header-nav { display:flex; gap:2px; }
.logo { font-family:'Sora',sans-serif; font-size:17px; font-weight:800; letter-spacing:-0.5px; }
.logo-f { color:#00e87b; } .logo-r { color:#484f58; }
.chain-badge { font-size:8px; padding:2px 7px; border-radius:4px; background:#0052ff15; color:#3b7dff; border:1px solid #0052ff30; font-weight:700; letter-spacing:1.5px; }
.nav-tab { background:none; border:none; padding:8px 14px; cursor:pointer; font-family:inherit; font-size:12px; font-weight:600; color:#484f58; border-radius:6px; transition:all .15s; }
.nav-tab:hover { color:#8b949e; } .nav-tab.active { color:#00e87b; background:#00e87b0a; }
.bal-pill { font-size:12px; padding:5px 10px; background:#131a24; border:1px solid #1b2838; border-radius:6px; font-weight:600; }
.btn-connect { padding:7px 16px; border-radius:6px; background:#00e87b; color:#0d1117; border:none; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; }
.btn-connect:hover { background:#00d070; }
.btn-addr { padding:6px 10px; border-radius:6px; background:#131a24; border:1px solid #1b2838; color:#8b949e; font-size:11px; cursor:pointer; font-family:inherit; display:flex; align-items:center; gap:5px; }
.auto-badge { font-size:8px; color:#00e87b; font-weight:700; }
.btn-icon { background:none; border:none; color:#8b949e; font-size:18px; cursor:pointer; padding:4px 8px; }

/* LAYOUT */
.layout { display:flex; min-height:calc(100vh - 52px); }
.main { flex:1; padding:20px; max-width:800px; overflow-y:auto; }
@media(max-width:1024px) { .main { max-width:100%; padding:12px; } }

/* SIDEBARS */
.sidebar-left { width:220px; background:#0a0f16; border-right:1px solid #1b2838; display:flex; flex-direction:column; flex-shrink:0; }
.sidebar-right { width:200px; background:#0a0f16; border-left:1px solid #1b2838; padding:12px; display:flex; flex-direction:column; gap:12px; flex-shrink:0; overflow-y:auto; }
.sidebar-header { padding:10px 12px; font-size:12px; font-weight:600; color:#8b949e; border-bottom:1px solid #1b2838; display:flex; justify-content:space-between; align-items:center; }
@media(max-width:1024px) { .sidebar-left { position:fixed; left:0; top:52px; bottom:0; z-index:40; } }

/* CHAT */
.chat-messages { flex:1; overflow-y:auto; padding:8px; }
.chat-msg { display:flex; gap:8px; padding:5px 0; align-items:flex-start; }
.chat-user { font-size:11px; font-weight:600; color:#8b949e; }
.chat-lvl { font-size:9px; color:#484f58; margin-left:4px; background:#131a24; padding:1px 4px; border-radius:3px; }
.chat-text { font-size:11px; color:#e0e0e0; margin-top:1px; }
.chat-input-row { padding:8px; border-top:1px solid #1b2838; }
.chat-input { width:100%; padding:7px 10px; background:#131a24; border:1px solid #1b2838; border-radius:6px; color:#e0e0e0; font-size:11px; font-family:inherit; }
.chat-input:focus { outline:none; border-color:#00e87b40; }
.online-badge { display:flex; align-items:center; gap:5px; font-size:10px; color:#8b949e; }
.online-dot { width:6px; height:6px; border-radius:50%; background:#1abc9c; }

/* CARDS */
.card { background:#131a24; border:1px solid #1b2838; border-radius:12px; padding:20px; margin-bottom:16px; }
.section-title { font-family:'Sora',sans-serif; font-weight:700; color:#e0e0e0; margin:0; }
.section-label { font-size:10px; color:#484f58; letter-spacing:2px; font-weight:600; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; text-transform:uppercase; }

/* STREAK */
.streak-bar { display:flex; align-items:center; gap:10px; justify-content:center; margin-bottom:14px; font-size:12px; }
.streak-num { font-weight:800; font-size:16px; font-family:'Sora',sans-serif; }
.streak-num.fire { color:#f0c040; text-shadow:0 0 8px #f0c04060; }
.streak-num.fire-hot { color:#ff4400; text-shadow:0 0 10px #ff440060; }
.divider-v { width:1px; height:20px; background:#1b2838; }

/* TIERS */
.tier-row { display:flex; gap:5px; margin-bottom:14px; }
.tier-btn { flex:1; padding:8px 0; border:1px solid #1b2838; background:#0d1117; color:#8b949e; border-radius:6px; cursor:pointer; font-family:'JetBrains Mono',monospace; font-size:12px; font-weight:600; transition:all .15s; }
.tier-btn:hover { border-color:#1b2838; color:#e0e0e0; }
.tier-btn.active { border-color:#00e87b; color:#00e87b; background:#00e87b08; }

/* COIN */
.coin-area { display:flex; justify-content:center; align-items:center; min-height:220px; position:relative; }
.coin-overlay { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.result-overlay.win { background:radial-gradient(circle,#00e87b12,transparent 70%); }
.result-overlay.lose { background:radial-gradient(circle,#ff444412,transparent 70%); }
.result-text { font-size:24px; font-weight:800; font-family:'Sora',sans-serif; letter-spacing:4px; animation:fadeIn .4s; }
.result-overlay.win .result-text { color:#00e87b; text-shadow:0 0 30px #00e87b50; }
.result-overlay.lose .result-text { color:#ff4444; text-shadow:0 0 30px #ff444450; }
.result-details { margin-top:6px; font-size:11px; text-align:center; animation:fadeIn .5s; }
.tx-link { color:#484f58; font-size:9px; margin-left:8px; }

/* FLIP BUTTONS */
.flip-btns { display:flex; gap:8px; }
.btn-flip { flex:1; padding:14px; border:none; border-radius:10px; cursor:pointer; font-family:inherit; font-size:13px; font-weight:700; letter-spacing:1.5px; transition:all .15s; }
.btn-flip:hover { transform:translateY(-1px); } .btn-flip:active { transform:translateY(0); }
.btn-flip:disabled { opacity:.35; cursor:not-allowed; transform:none; }
.btn-flip.green { background:linear-gradient(135deg,#00e87b18,#00e87b08); border:1px solid #00e87b40; color:#00e87b; }
.btn-flip.gold { background:linear-gradient(135deg,#f0c04018,#f0c04008); border:1px solid #f0c04040; color:#f0c040; }
.btn-sub { display:block; font-size:10px; font-weight:400; margin-top:3px; opacity:.6; letter-spacing:0; }
.session-stats { text-align:center; font-size:10px; color:#484f58; margin-top:8px; }

/* GAME ROWS */
.game-row { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#131a24; border:1px solid #1b2838; border-radius:8px; margin-bottom:4px; gap:10px; }
.game-row.compact { padding:7px 14px; background:transparent; border:none; border-bottom:1px solid #1b283840; border-radius:0; margin:0; }
.game-left { display:flex; align-items:center; gap:10px; }
.game-center { font-weight:700; }
.game-right { display:flex; align-items:center; gap:8px; }
.status-badge { font-size:9px; font-weight:700; letter-spacing:1px; padding:3px 8px; border-radius:4px; }
.status-badge.joinable { background:#00e87b15; color:#00e87b; }
.dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.dot.green { background:#00e87b; } .dot.red { background:#ff4444; } .dot.gray { background:#484f58; }
.empty { text-align:center; padding:20px; color:#484f58; font-size:12px; }
.referral-bar { text-align:center; font-size:10px; color:#f0c040; margin-bottom:8px; }

/* BUTTONS */
.btn-sm { padding:5px 12px; border-radius:5px; font-size:10px; font-weight:700; cursor:pointer; font-family:inherit; border:1px solid; }
.btn-sm.green { background:#00e87b12; border-color:#00e87b30; color:#00e87b; }
.btn-sm.red { background:#ff444412; border-color:#ff444430; color:#ff4444; }
.btn-sm.gold { background:#f0c04012; border-color:#f0c04030; color:#f0c040; }
.btn-sm.blue { background:#3b7dff12; border-color:#3b7dff30; color:#3b7dff; }
.btn-sm:disabled { opacity:.35; cursor:not-allowed; }
.btn-full { width:100%; padding:9px 0; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; font-family:inherit; border:1px solid; margin-top:4px; }
.btn-full.green { background:#00e87b15; border-color:#00e87b40; color:#00e87b; }
.btn-full.red { background:#ff444415; border-color:#ff444440; color:#ff4444; }
.btn-full.blue { background:#3b7dff15; border-color:#3b7dff40; color:#3b7dff; }
.btn-close { background:none; border:none; color:#484f58; font-size:16px; cursor:pointer; }

/* INPUTS */
.input-full { width:100%; padding:7px 10px; background:#0d1117; border:1px solid #1b2838; border-radius:6px; color:#e0e0e0; font-size:11px; font-family:inherit; margin-bottom:4px; box-sizing:border-box; }
.input-full:focus { outline:none; border-color:#00e87b40; }
.input-sm { flex:1; padding:7px 8px; background:#0d1117; border:1px solid #1b2838; border-radius:5px; color:#e0e0e0; font-size:10px; font-family:inherit; }
.input-sm:focus { outline:none; border-color:#00e87b40; }

/* INFO SIDEBAR */
.info-section { padding-bottom:10px; border-bottom:1px solid #1b283860; }
.quick-btns { display:flex; gap:3px; flex-wrap:wrap; }
.btn-quick { padding:4px 8px; border-radius:4px; background:#131a24; border:1px solid #1b2838; color:#8b949e; font-size:10px; cursor:pointer; font-family:'JetBrains Mono',monospace; }
.btn-quick:hover { border-color:#1b2838; color:#e0e0e0; }
.btn-quick.red { border-color:#ff444430; color:#ff4444; }
.stat-row { display:flex; justify-content:space-between; font-size:11px; padding:3px 0; }
.stat-row span:first-child { color:#8b949e; }

/* BOARD */
.board-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-bottom:12px; }
@media(max-width:1024px) { .board-stats { grid-template-columns:repeat(2,1fr); } }
.stat-card { padding:10px; background:#131a24; border:1px solid #1b2838; border-radius:8px; text-align:center; }
.stat-val { font-size:15px; font-weight:700; margin-top:3px; font-family:'Sora',sans-serif; }
.view-tabs { display:flex; gap:3px; margin-bottom:10px; }
.vtab { padding:5px 12px; border-radius:4px; border:none; cursor:pointer; font-family:inherit; font-size:10px; font-weight:600; letter-spacing:.5px; text-transform:uppercase; background:transparent; color:#484f58; }
.vtab.active { background:#1b2838; color:#e0e0e0; }
.vtab.sm { padding:3px 8px; font-size:9px; }
.sort-row { display:flex; align-items:center; gap:4px; margin-bottom:6px; }

/* SEAT GRID */
.grid-layout { display:grid; grid-template-columns:1fr; gap:12px; }
.grid-layout.with-detail { grid-template-columns:1fr 240px; }
.seat-grid { display:grid; grid-template-columns:repeat(16,1fr); gap:2px; }
.seat-grid.mobile { grid-template-columns:repeat(8,1fr); }
.seat-cell { aspect-ratio:1; border-radius:3px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:7px; font-weight:600; color:#1b2838; background:#0d1117; border:1px solid #1b283840; transition:all .12s; }
.seat-cell:hover { transform:scale(1.25); z-index:10; box-shadow:0 0 8px #00e87b20; }
.seat-cell.active { color:#484f58; background:#131a24; border-color:#1b2838; }
.seat-cell.mine { border-color:#3b7dff; background:#3b7dff10; }
.seat-cell.selected { border-color:#00e87b; background:#00e87b10; }
.seat-cell.low { animation:pulseRed 2s infinite; }

/* SEAT PANEL */
.seat-panel { background:#0a0f16; border:1px solid #1b2838; border-radius:10px; padding:14px; font-size:11px; position:sticky; top:16px; }
.seat-info { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
.seat-row { display:flex; justify-content:space-between; }
.seat-actions { display:flex; flex-direction:column; gap:4px; }

/* LIST TABLE */
.list-table { background:#131a24; border:1px solid #1b2838; border-radius:8px; overflow:hidden; max-height:460px; overflow-y:auto; }
.list-row { display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid #1b283840; cursor:pointer; font-size:11px; gap:8px; }
.list-row:hover { background:#1b283830; }

/* EXPLAINER */
.explainer-card { padding:14px; background:#131a2480; border:1px solid #1b2838; border-radius:10px; margin-bottom:12px; position:relative; }
.reward-pool-row { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#131a24; border:1px solid #1b2838; border-radius:8px; margin-bottom:10px; }
.admin-card { padding:10px; background:#1a0a0a; border:1px solid #ff444420; border-radius:8px; margin-bottom:10px; }

/* FAIR */
.code-block { padding:16px; background:#0a0f16; border:1px solid #1b2838; border-radius:8px; font-family:'JetBrains Mono',monospace; font-size:11px; line-height:1.8; color:#8b949e; }
.fee-grid { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
.fee-item { display:flex; justify-content:space-between; padding:8px 12px; background:#131a24; border:1px solid #1b2838; border-radius:6px; font-size:11px; }

/* JACKPOT */
.jackpot-overlay { position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,.93); display:flex; flex-direction:column; align-items:center; justify-content:center; animation:fadeIn .5s; cursor:pointer; }
.jackpot-title { font-size:48px; font-weight:800; font-family:'Sora',sans-serif; background:linear-gradient(135deg,#f0c040,#ff8844); -webkit-background-clip:text; -webkit-text-fill-color:transparent; margin-bottom:12px; }
.jackpot-amount { font-size:28px; font-weight:700; color:#f0c040; font-family:'JetBrains Mono',monospace; }

::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:#0d1117; } ::-webkit-scrollbar-thumb { background:#1b2838; border-radius:2px; }
`;
