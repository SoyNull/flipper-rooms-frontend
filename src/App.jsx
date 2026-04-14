import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as THREE from "three";
import { useWallet, useFlip, useSeats, useProtocol, useToasts, addToast, EXPLORER } from "./hooks.js";
import { TIERS, CONTRACT_ADDRESS } from "./config.js";
import {
  deposit as depositFn,
  withdraw as withdrawFn,
  getPlayerInfo,
  getSeatInfo as getSeatInfoFn,
  decodeError,
} from "./contract.js";
import { parseEther } from "ethers";
import { playClickSound, playFlipSound, playWinSound, playLoseSound, playDepositSound, playStreakSound } from "./sounds.js";

/* ═══════════════════════════════════════
   3D COIN COMPONENT (Three.js)
   ═══════════════════════════════════════ */
const Coin3D = ({ state, onComplete, isMobile }) => {
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
    renderer.toneMappingExposure = 1.2;
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(3, 5, 4);
    scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0x00ff88, 0.4);
    rimLight.position.set(-3, -2, 2);
    scene.add(rimLight);

    const coinGroup = new THREE.Group();
    scene.add(coinGroup);

    const radius = 1.2, thickness = 0.12, segments = 64;
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4a843, metalness: 0.95, roughness: 0.15, emissive: 0x1a0f00, emissiveIntensity: 0.1 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xc49a3c, metalness: 0.98, roughness: 0.1 });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thickness, segments), goldMat);
    body.rotation.x = Math.PI / 2;
    coinGroup.add(body);
    coinGroup.add(new THREE.Mesh(new THREE.TorusGeometry(radius, thickness / 2, 16, segments), edgeMat));

    const makeFace = (letter, zPos, rotY) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256; canvas.height = 256;
      const cx = canvas.getContext("2d");
      cx.fillStyle = "#00000000"; cx.fillRect(0, 0, 256, 256);
      cx.fillStyle = "#1a0f00"; cx.font = "bold 140px monospace";
      cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText(letter, 128, 128);
      const mat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, metalness: 0.7, roughness: 0.3, color: 0xb8941f });
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.85, segments), mat);
      mesh.position.z = zPos;
      if (rotY) mesh.rotation.y = Math.PI;
      coinGroup.add(mesh);
    };
    makeFace("F", thickness / 2 + 0.001, false);
    makeFace("R", -(thickness / 2 + 0.001), true);

    coinGroup.rotation.x = 0.3;
    sceneRef.current = { scene, camera, renderer, coinGroup, startTime: null, phase: "idle" };

    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const s = sceneRef.current;
      const t = performance.now() / 1000;
      if (s.phase === "idle") {
        s.coinGroup.rotation.y = Math.sin(t * 0.8) * 0.15;
        s.coinGroup.rotation.z = Math.cos(t * 0.6) * 0.05;
        s.coinGroup.position.y = Math.sin(t * 1.2) * 0.05;
      } else if (s.phase === "spinning") {
        const elapsed = t - s.startTime;
        const speed = Math.max(0, 25 - elapsed * 4);
        s.coinGroup.rotation.x += speed * 0.016;
        s.coinGroup.position.y = Math.sin(elapsed * 3) * 0.15 * Math.max(0, 1 - elapsed / 4);
        if (speed <= 0.5) {
          s.phase = "landing"; s.startTime = t;
          const targetX = stateRef.current === "win" ? 0 : Math.PI;
          s.targetRotation = targetX + Math.round(s.coinGroup.rotation.x / (Math.PI * 2)) * Math.PI * 2;
        }
      } else if (s.phase === "landing") {
        const progress = Math.min(1, (t - s.startTime) / 0.6);
        s.coinGroup.rotation.x += (s.targetRotation - s.coinGroup.rotation.x) * 0.08;
        s.coinGroup.position.y = Math.sin(progress * Math.PI) * -0.1;
        if (progress >= 1 && s.phase !== "done") { s.phase = "done"; onComplete?.(); }
      } else if (s.phase === "done") {
        s.coinGroup.position.y = Math.sin(t * 2) * 0.02;
      }
      renderer.render(scene, camera);
    };
    animate();
    return () => { cancelAnimationFrame(raf); renderer.dispose(); if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement); };
  }, []);

  useEffect(() => {
    if (state === "spinning") { sceneRef.current.phase = "spinning"; sceneRef.current.startTime = performance.now() / 1000; }
    else if (state === "idle") { sceneRef.current.phase = "idle"; }
  }, [state]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%", minHeight: isMobile ? 200 : 260 }} />;
};

/* ═══════════════════════════════════════
   CONFETTI
   ═══════════════════════════════════════ */
const Confetti = () => (
  <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 20 }}>
    {Array.from({ length: 24 }, (_, i) => (
      <div key={i} style={{
        position: "absolute",
        left: `${Math.random() * 100}%`,
        top: -10,
        width: 6 + Math.random() * 6,
        height: 6 + Math.random() * 6,
        background: ["#00e87b", "#f0c040", "#3b7dff", "#00e87b", "#f0c040"][i % 5],
        borderRadius: Math.random() > 0.5 ? "50%" : "2px",
        animation: `confetti ${1.5 + Math.random() * 1.5}s ease-out ${i * 0.05}s forwards`,
        opacity: 0.9,
      }} />
    ))}
  </div>
);

/* ═══════════════════════════════════════
   TOAST COMPONENT
   ═══════════════════════════════════════ */
const ToastContainer = ({ toasts, remove }) => (
  <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
    {toasts.map(t => (
      <div key={t.id} onClick={() => remove(t.id)} style={{
        padding: "12px 16px", borderRadius: 8, cursor: "pointer", animation: "fadeIn .3s ease",
        fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500,
        background: t.type === "success" ? "#00e87b15" : t.type === "error" ? "#ff444415" : "#f0c04015",
        border: `1px solid ${t.type === "success" ? "#00e87b40" : t.type === "error" ? "#ff444440" : "#f0c04040"}`,
        color: t.type === "success" ? "#00e87b" : t.type === "error" ? "#ff4444" : "#f0c040",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {t.type === "pending" && <span style={{ animation: "pulse 1s infinite" }}>...</span>}
          <span>{t.message}</span>
        </div>
        {t.txHash && (
          <a href={`${EXPLORER}/tx/${t.txHash}`} target="_blank" rel="noreferrer"
            style={{ fontSize: 10, color: "#555", marginTop: 4, display: "block" }}>View on explorer</a>
        )}
      </div>
    ))}
  </div>
);

/* ═══════════════════════════════════════
   LIVE FEED BAR
   ═══════════════════════════════════════ */
const LiveFeed = ({ history, address }) => {
  const items = useMemo(() => {
    const feed = [];
    history.forEach(h => {
      const short = (a) => a ? `${a.slice(0, 6)}..${a.slice(-3)}` : "?";
      if (h.vsTreasury) {
        feed.push(`${short(h.winner)} won ${h.amount} ETH vs Treasury`);
      } else {
        feed.push(`${short(h.winner)} won ${h.payout} ETH vs ${short(h.loser)}`);
      }
      if (h.winnerStreak >= 3) feed[feed.length - 1] += ` ${h.winnerStreak}x streak`;
    });
    if (feed.length === 0) {
      feed.push("FlipperRooms V6 LIVE on Base Sepolia", "256 Revenue Seats", "PvP + Treasury Flips", "Harberger Tax Seats with Yield");
    }
    return feed;
  }, [history]);

  const doubled = [...items, ...items];
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, height: 32,
      background: "#08081299", backdropFilter: "blur(8px)", borderTop: "1px solid #15152a",
      display: "flex", alignItems: "center", overflow: "hidden",
      fontSize: 10, fontFamily: "inherit", zIndex: 100, color: "#444"
    }}>
      <div style={{ display: "flex", gap: 40, animation: `scroll ${items.length * 4}s linear infinite`, whiteSpace: "nowrap", paddingLeft: 20 }}>
        {doubled.map((item, i) => <span key={i}>{item}</span>)}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════ */
export default function FlipperRooms() {
  const [view, setView] = useState("flip");
  const [tier, setTier] = useState(1);
  const [coinState, setCoinState] = useState("idle");
  const [showResult, setShowResult] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [shakeEffect, setShakeEffect] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [seatDetail, setSeatDetail] = useState(null);
  const [seatView, setSeatView] = useState("grid");
  const [depositAmt, setDepositAmt] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [playerStats, setPlayerStats] = useState(null);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const { toasts, remove: removeToast } = useToasts();
  const wallet = useWallet();
  const { connected, address, contract, sessionBalance, refreshBalance, connect, disconnect, ready, authenticated, isEmbedded } = wallet;
  const flipHook = useFlip(contract, address, refreshBalance);
  const seatHook = useSeats(contract, address, refreshBalance);
  const protocolHook = useProtocol(contract);

  // Initial data load
  useEffect(() => {
    if (!contract) return;
    flipHook.refreshChallenges();
    flipHook.refreshHistory();
    seatHook.refreshSeats();
    protocolHook.refreshStats();
  }, [contract]);

  // Polling
  useEffect(() => {
    if (!contract) return;
    const poll = () => { refreshBalance(); protocolHook.refreshStats(); flipHook.refreshChallenges(); flipHook.refreshHistory(); };
    const iv = setInterval(poll, 15000);
    return () => clearInterval(iv);
  }, [contract, refreshBalance]);

  // Player stats
  useEffect(() => {
    if (!contract || !address) return;
    getPlayerInfo(contract, address).then(setPlayerStats).catch(() => {});
  }, [contract, address, sessionBalance]);

  // Seat detail
  useEffect(() => {
    if (!contract || !selectedSeat) { setSeatDetail(null); return; }
    getSeatInfoFn(contract, selectedSeat.id).then(setSeatDetail).catch(() => {});
  }, [contract, selectedSeat]);

  // Flip handlers — embedded wallet spins immediately, external shows "confirm" first
  const handleFlipPvp = async () => {
    if (coinState !== "idle" || !connected) return;
    playClickSound();
    if (isEmbedded) { setCoinState("spinning"); playFlipSound(); }
    const result = await flipHook.flipPvp(TIERS[tier].wei);
    setCoinState("idle");
    if (result) refreshBalance();
  };

  const handleFlipTreasury = async () => {
    if (coinState !== "idle" || !connected) return;
    playClickSound();
    if (isEmbedded) { setCoinState("spinning"); playFlipSound(); }
    const result = await flipHook.flipTreasury(TIERS[tier].wei);
    if (!result) { setCoinState("idle"); return; }
    if (!isEmbedded) { setCoinState("spinning"); playFlipSound(); await new Promise(r => setTimeout(r, 2000)); }
    const won = result.winner.toLowerCase() === address?.toLowerCase();
    if (won) { playWinSound(); if (result.winnerStreak >= 3) playStreakSound(result.winnerStreak); }
    else playLoseSound();
    setCoinState(won ? "win" : "lose");
    refreshBalance();
  };

  const handleAccept = async (challengeId) => {
    if (coinState !== "idle" || !connected) return;
    playClickSound();
    if (isEmbedded) { setCoinState("spinning"); playFlipSound(); }
    const result = await flipHook.acceptCh(challengeId);
    if (!result) { setCoinState("idle"); return; }
    if (!isEmbedded) { setCoinState("spinning"); playFlipSound(); await new Promise(r => setTimeout(r, 2000)); }
    const won = result.winner.toLowerCase() === address?.toLowerCase();
    if (won) { playWinSound(); if (result.winnerStreak >= 3) playStreakSound(result.winnerStreak); }
    else playLoseSound();
    setCoinState(won ? "win" : "lose");
    refreshBalance();
  };

  const onFlipDone = useCallback(() => {
    setShowResult(true);
    if (flipHook.lastResult === "win") { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 2500); }
    else if (flipHook.lastResult === "lose") { setShakeEffect(true); setTimeout(() => setShakeEffect(false), 600); }
    setTimeout(() => { setCoinState("idle"); setShowResult(false); flipHook.setLastFlipDetails(null); }, 4000);
  }, [flipHook.lastResult]);

  const handleDeposit = async () => {
    if (!contract || !depositAmt || isDepositing) return;
    playClickSound();
    setIsDepositing(true);
    try {
      await depositFn(contract, depositAmt);
      playDepositSound();
      setDepositAmt("");
      refreshBalance();
    } catch (err) { addToast("error", decodeError(err)); }
    finally { setIsDepositing(false); }
  };

  const handleWithdraw = async () => {
    if (!contract || !depositAmt || isDepositing) return;
    playClickSound();
    setIsDepositing(true);
    try {
      await withdrawFn(contract, depositAmt);
      setDepositAmt("");
      refreshBalance();
    } catch (err) { addToast("error", decodeError(err)); }
    finally { setIsDepositing(false); }
  };

  const ownedCount = seatHook.seats.filter(s => s.active).length;
  const balNum = parseFloat(sessionBalance || "0");
  const balDisplay = balNum > 0 ? `${balNum.toFixed(4)} ETH` : "0 ETH";
  const treasuryMax = protocolHook.stats ? Number(protocolHook.stats.treasury) * 0.05 : 0;

  const leaderboard = useMemo(() => {
    const map = {};
    seatHook.seats.forEach(s => {
      if (!s.active) return;
      const key = s.owner.toLowerCase();
      if (!map[key]) map[key] = { addr: s.owner, count: 0, names: [] };
      map[key].count++;
      if (s.name) map[key].names.push(s.name);
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [seatHook.seats]);

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 40, background: "#07070f", color: "#c8c8d0", fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Sora:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse { 0%,100% { opacity:.6 } 50% { opacity:1 } }
        @keyframes resultGlow { 0% { transform:scale(0.8); opacity:0 } 50% { transform:scale(1.05) } 100% { transform:scale(1); opacity:1 } }
        @keyframes confetti { 0% { transform:translateY(0) rotate(0); opacity:1 } 100% { transform:translateY(400px) rotate(720deg); opacity:0 } }
        @keyframes shake { 0%,100% { transform:translateX(0) } 25% { transform:translateX(-8px) } 75% { transform:translateX(8px) } }
        @keyframes scroll { from { transform:translateX(0) } to { transform:translateX(-50%) } }
        @keyframes pulseSeat { 0%,100% { opacity:.7 } 50% { opacity:1 } }
        @keyframes pulseRed { 0%,100% { box-shadow:none } 50% { box-shadow:0 0 6px #ff444440 } }
        .nav-btn { background:none; border:none; padding:10px 20px; cursor:pointer; font-family:inherit; font-size:11px; font-weight:600; letter-spacing:2px; color:#555; transition:all .2s; position:relative }
        .nav-btn.active { color:#00e87b }
        .nav-btn.active::after { content:''; position:absolute; bottom:0; left:20%; right:20%; height:2px; background:#00e87b; border-radius:1px }
        .nav-btn:hover { color:#aaa }
        .tier-btn { border:1px solid #1a1a28; background:#0c0c18; color:#666; padding:10px 0; border-radius:6px; cursor:pointer; font-family:inherit; font-size:12px; font-weight:600; transition:all .2s; flex:1 }
        .tier-btn.active { border-color:#00e87b; color:#00e87b; background:#00e87b08; box-shadow:0 0 20px #00e87b10 }
        .flip-btn { border:none; padding:16px 20px; border-radius:10px; cursor:pointer; font-family:inherit; font-size:13px; font-weight:700; letter-spacing:2px; transition:all .2s; flex:1; position:relative; overflow:hidden }
        .flip-btn:hover { transform:translateY(-1px) }
        .flip-btn:active { transform:translateY(0) }
        .flip-btn:disabled { opacity:.4; cursor:not-allowed; transform:none }
        .seat-cell { border-radius:3px; cursor:pointer; transition:all .15s; position:relative; display:flex; align-items:center; justify-content:center }
        .seat-cell:hover { transform:scale(1.3); z-index:10; box-shadow:0 0 12px #00e87b30 }
        input:focus { outline:none; border-color:#00e87b40 }
        ::-webkit-scrollbar { width:3px } ::-webkit-scrollbar-track { background:#07070f } ::-webkit-scrollbar-thumb { background:#1a1a28; border-radius:2px }
      `}</style>

      <ToastContainer toasts={toasts} remove={removeToast} />

      {/* HEADER */}
      <header style={{
        padding: isMobile ? "10px 12px" : "14px 24px",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
        borderBottom: "1px solid #12121e", background: "linear-gradient(180deg, #0b0b16, #07070f)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: isMobile ? 16 : 20, fontWeight: 800, letterSpacing: -0.5 }}>
            <span style={{ color: "#00e87b" }}>FLIPPER</span><span style={{ color: "#3a3a4a" }}>ROOMS</span>
          </div>
          <div style={{ fontSize: 8, padding: "3px 8px", borderRadius: 4, background: "#0052ff18", color: "#3b7dff", border: "1px solid #0052ff30", fontWeight: 700, letterSpacing: 1.5 }}>BASE</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 20 }}>
          {!isMobile && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 8, color: "#444", letterSpacing: 1.5, fontWeight: 600 }}>JACKPOT</div>
              <div style={{ fontSize: 13, color: "#f0c040", fontWeight: 700 }}>
                {protocolHook.stats ? `${Number(protocolHook.stats.jackpot).toFixed(4)} ETH` : "..."}
              </div>
            </div>
          )}
          {!isMobile && <div style={{ width: 1, height: 28, background: "#1a1a28" }}/>}
          {!ready ? (
            <span style={{ color: "#555", fontSize: 11 }}>Loading...</span>
          ) : connected ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isEmbedded && <div style={{ fontSize: 8, color: "#00e87b", fontWeight: 600, letterSpacing: 0.5 }}>AUTO</div>}
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 8, color: "#444", letterSpacing: 1.5, fontWeight: 600 }}>SESSION</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{balDisplay}</div>
              </div>
              <div onClick={disconnect} style={{ padding: "7px 12px", borderRadius: 6, background: "#12121e", border: "1px solid #1a1a28", fontSize: 10, cursor: "pointer" }}>
                {shortAddr(address)}
              </div>
            </div>
          ) : authenticated ? (
            <span style={{ color: "#f0c040", fontSize: 11, animation: "pulse 1.5s infinite" }}>Connecting...</span>
          ) : (
            <button onClick={() => { playClickSound(); connect(); }} style={{
              padding: "9px 20px", borderRadius: 6, background: "#00e87b", color: "#000", border: "none",
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1
            }}>CONNECT</button>
          )}
        </div>
      </header>

      {/* NAV */}
      <nav style={{ display: "flex", justifyContent: "center", borderBottom: "1px solid #12121e", background: "#0a0a14" }}>
        {["flip", "board", "stats"].map(id => (
          <button key={id} className={`nav-btn ${view === id ? "active" : ""}`}
            onClick={() => { playClickSound(); setView(id); }}>
            {id.toUpperCase()}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: isMobile ? "12px 10px" : "20px 16px" }}>

        {/* ════════════════ FLIP VIEW ════════════════ */}
        {view === "flip" && (
          <div style={{ animation: "fadeIn .4s ease" }}>

            {/* Quick deposit amounts */}
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              {[0.005, 0.01, 0.05, 0.1].map(a => (
                <button key={a} onClick={() => setDepositAmt(String(a))} style={{
                  padding: "4px 10px", borderRadius: 4, background: "#12121e",
                  border: "1px solid #1a1a28", color: "#555", fontSize: 10,
                  cursor: "pointer", fontFamily: "inherit"
                }}>{a} Ξ</button>
              ))}
              <button onClick={() => setDepositAmt(sessionBalance)} style={{
                padding: "4px 10px", borderRadius: 4, background: "#ff444410",
                border: "1px solid #ff444430", color: "#ff4444", fontSize: 10,
                cursor: "pointer", fontFamily: "inherit"
              }}>MAX</button>
            </div>

            {/* Deposit/Withdraw */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, padding: "10px 12px", background: "#0c0c18", borderRadius: 8, border: "1px solid #15152a" }}>
              <input placeholder="Amount in ETH" type="number" step="0.001" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} style={{
                flex: 1, background: "#07070f", border: "1px solid #1a1a28", borderRadius: 6,
                padding: "9px 12px", color: "#c8c8d0", fontSize: 12, fontFamily: "inherit", minWidth: 0
              }}/>
              <button onClick={handleDeposit} disabled={!connected || isDepositing} style={{ padding: "9px 14px", borderRadius: 6, background: "#00e87b15", border: "1px solid #00e87b40", color: "#00e87b", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1, opacity: connected && !isDepositing ? 1 : 0.4 }}>{isDepositing ? "..." : "DEPOSIT"}</button>
              <button onClick={handleWithdraw} disabled={!connected || isDepositing} style={{ padding: "9px 14px", borderRadius: 6, background: "#ff444415", border: "1px solid #ff444440", color: "#ff4444", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1, opacity: connected && !isDepositing ? 1 : 0.4 }}>{isDepositing ? "..." : "WITHDRAW"}</button>
            </div>

            {/* Treasury info */}
            {protocolHook.stats && (
              <div style={{ display: "flex", gap: 10, marginBottom: 16, fontSize: 10, color: "#444" }}>
                <span>Treasury: <strong style={{ color: "#f0c040" }}>{Number(protocolHook.stats.treasury).toFixed(4)} Ξ</strong></span>
                <span>Max bet: <strong style={{ color: "#f0c040" }}>{(Number(protocolHook.stats.treasury) * 0.05).toFixed(4)} Ξ</strong></span>
                <span>Jackpot: <strong style={{ color: "#f0c040" }}>{Number(protocolHook.stats.jackpot).toFixed(4)} Ξ</strong></span>
              </div>
            )}

            {/* 3D Coin + Flip Area */}
            <div style={{
              background: "radial-gradient(ellipse at 50% 40%, #0f0f20, #07070f)", borderRadius: 12,
              border: "1px solid #15152a", marginBottom: 20, position: "relative", overflow: "hidden",
              animation: shakeEffect ? "shake .4s ease" : undefined,
            }}>
              <div style={{
                position: "absolute", inset: 0, opacity: 0.03,
                backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
                backgroundSize: "40px 40px"
              }}/>

              {showConfetti && <Confetti />}

              <div style={{ position: "relative", zIndex: 1 }}>
                {/* Tier selector */}
                <div style={{ padding: "14px 16px 0" }}>
                  <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 8, fontWeight: 600 }}>BET TIER</div>
                  <div style={{ display: "flex", gap: isMobile ? 4 : 6 }}>
                    {TIERS.map((t, i) => {
                      const tooHigh = treasuryMax > 0 && Number(t.label) > treasuryMax;
                      return (
                        <button key={t.wei} className={`tier-btn ${tier === i ? "active" : ""}`}
                          onClick={() => { playClickSound(); setTier(i); }}
                          title={tooHigh ? "Treasury too low for this tier" : ""}
                          style={{ ...(isMobile ? { fontSize: 10, padding: "8px 0" } : {}), ...(tooHigh ? { opacity: 0.3 } : {}) }}>
                          {t.label} Ξ
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3D Coin */}
                <div style={{ height: isMobile ? 200 : 280, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <Coin3D state={coinState} onComplete={onFlipDone} isMobile={isMobile} />

                  {/* Spinning overlay */}
                  {coinState === "spinning" && !showResult && (
                    <div style={{ position: "absolute", bottom: 20, left: 0, right: 0, textAlign: "center" }}>
                      <span style={{ color: "#f0c040", fontSize: 12, fontWeight: 700, letterSpacing: 3, animation: "pulse 0.8s infinite" }}>
                        FLIPPING...
                      </span>
                    </div>
                  )}

                  {/* Result overlay */}
                  {showResult && flipHook.lastResult && (
                    <div style={{
                      position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                      background: flipHook.lastResult === "win" ? "radial-gradient(circle, #00e87b18, transparent 70%)" : "radial-gradient(circle, #ff444418, transparent 70%)",
                      animation: "resultGlow .4s ease"
                    }}>
                      <div style={{
                        fontSize: isMobile ? 22 : 28, fontWeight: 800, fontFamily: "'Sora', sans-serif",
                        color: flipHook.lastResult === "win" ? "#00e87b" : "#ff4444",
                        textShadow: `0 0 40px ${flipHook.lastResult === "win" ? "#00e87b" : "#ff4444"}60`,
                        letterSpacing: 4
                      }}>
                        {flipHook.lastResult === "win" ? "YOU WIN" : "YOU LOSE"}
                      </div>
                      {flipHook.lastFlipDetails && (
                        <div style={{ marginTop: 8, textAlign: "center", fontSize: 11 }}>
                          <div style={{ color: flipHook.lastFlipDetails.won ? "#00e87b" : "#ff4444", fontWeight: 700 }}>
                            {flipHook.lastFlipDetails.won ? "+" : "-"}{flipHook.lastFlipDetails.won ? flipHook.lastFlipDetails.payout : flipHook.lastFlipDetails.amount} ETH
                          </div>
                          {flipHook.lastFlipDetails.winnerStreak >= 3 && (
                            <div style={{ color: "#f0c040", fontSize: 10, marginTop: 2 }}>
                              {flipHook.lastFlipDetails.winnerStreak}x streak bonus
                            </div>
                          )}
                          {flipHook.lastFlipDetails.txHash && (
                            <a href={`${EXPLORER}/tx/${flipHook.lastFlipDetails.txHash}`} target="_blank" rel="noreferrer"
                              style={{ color: "#444", fontSize: 9, marginTop: 4, display: "inline-block" }}>View TX</a>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Flip buttons */}
                <div style={{ padding: "0 16px 16px", display: "flex", gap: 8 }}>
                  <button className="flip-btn" disabled={coinState !== "idle" || !connected || flipHook.isFlipping} onClick={handleFlipPvp} style={{
                    background: "linear-gradient(135deg, #00e87b20, #00e87b08)",
                    border: "1px solid #00e87b50", color: "#00e87b"
                  }}>
                    PVP FLIP
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, opacity: 0.6 }}>{TIERS[tier].label} ETH</div>
                  </button>
                  <button className="flip-btn" disabled={coinState !== "idle" || !connected || flipHook.isFlipping} onClick={handleFlipTreasury} style={{
                    background: "linear-gradient(135deg, #f0c04020, #f0c04008)",
                    border: "1px solid #f0c04050", color: "#f0c040"
                  }}>
                    VS TREASURY
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, opacity: 0.6 }}>{TIERS[tier].label} ETH</div>
                  </button>
                {connected && !isEmbedded && (
                  <div style={{ padding: "0 16px 12px", fontSize: 9, color: "#444", textAlign: "center" }}>
                    Login with email for instant flips without wallet popups
                  </div>
                )}
                </div>
              </div>
            </div>

            {/* Open Challenges */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 10, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                <span>OPEN CHALLENGES</span>
                <span style={{ color: "#00e87b" }}>{flipHook.challenges.length} live</span>
              </div>
              {flipHook.challenges.length === 0 && (
                <div style={{ padding: "14px", textAlign: "center", color: "#333", fontSize: 11 }}>No open challenges</div>
              )}
              {flipHook.challenges.map(c => (
                <div key={c.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 14px", background: "#0c0c18", borderRadius: 6, marginBottom: 4,
                  border: "1px solid #12121e"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: "#333", fontSize: 10, fontWeight: 600 }}>#{c.id}</span>
                    <span style={{ fontSize: 11, color: "#666" }}>{shortAddr(c.creator)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontWeight: 700, color: "#f0c040", fontSize: 13 }}>{c.amount} Ξ</span>
                    {c.creator.toLowerCase() === address?.toLowerCase() ? (
                      <button onClick={() => { playClickSound(); flipHook.cancelCh(c.id); }} disabled={flipHook.isFlipping} style={{
                        padding: "5px 12px", borderRadius: 5, background: "#ff444412", border: "1px solid #ff444440",
                        color: "#ff4444", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                        opacity: flipHook.isFlipping ? 0.4 : 1
                      }}>CANCEL</button>
                    ) : (
                      <button onClick={() => handleAccept(c.id)} disabled={flipHook.isFlipping} style={{
                        padding: "5px 12px", borderRadius: 5, background: "#00e87b12", border: "1px solid #00e87b40",
                        color: "#00e87b", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5
                      }}>ACCEPT</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* History */}
            <div>
              <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 10, fontWeight: 600 }}>RECENT FLIPS</div>
              {flipHook.history.length === 0 && (
                <div style={{ padding: "14px", textAlign: "center", color: "#333", fontSize: 11 }}>No recent flips</div>
              )}
              {flipHook.history.map((h, i) => {
                const isWinner = address ? h.winner.toLowerCase() === address.toLowerCase() : null;
                return (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 14px", borderBottom: "1px solid #0e0e1a", fontSize: 11
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: isWinner === null ? "#666" : isWinner ? "#00e87b" : "#ff4444" }}/>
                      <span style={{ color: isWinner === null ? "#666" : isWinner ? "#00e87b" : "#ff4444", fontWeight: 700, fontSize: 10, letterSpacing: 1 }}>
                        {isWinner === null ? "FLIP" : isWinner ? "WON" : "LOST"}
                      </span>
                      <span style={{ color: "#444", fontSize: 10 }}>
                        {h.vsTreasury ? "vs Treasury" : `${shortAddr(h.winner)} vs ${shortAddr(h.loser)}`}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontWeight: 600, fontSize: 11 }}>{h.amount} Ξ</span>
                      {h.winnerStreak >= 3 && <span style={{ color: "#f0c040", fontSize: 10, fontWeight: 600 }}>{h.winnerStreak}x</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ════════════════ BOARD VIEW ════════════════ */}
        {view === "board" && (
          <div style={{ animation: "fadeIn .4s ease" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
              {[
                { l: "OWNED", v: `${ownedCount}/256`, c: "#00e87b" },
                { l: "FLOOR", v: "0.001 Ξ", c: "#f0c040" },
                { l: "SEAT POOL", v: protocolHook.stats ? `${Number(protocolHook.stats.seatPool).toFixed(4)} Ξ` : "...", c: "#3b7dff" },
                { l: "MY SEATS", v: `${seatHook.mySeats.length}`, c: "#ff8844" },
              ].map((s, i) => (
                <div key={i} style={{ padding: "12px 10px", background: "#0c0c18", borderRadius: 8, border: "1px solid #12121e", textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: "#444", letterSpacing: 1.5, fontWeight: 600 }}>{s.l}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: s.c, marginTop: 4, fontFamily: "'Sora', sans-serif" }}>{s.v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {["grid", "list", "my seats"].map(v => (
                <button key={v} onClick={() => { playClickSound(); setSeatView(v); }} style={{
                  padding: "6px 14px", borderRadius: 4, border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase",
                  background: seatView === v ? "#1a1a28" : "transparent", color: seatView === v ? "#c8c8d0" : "#444"
                }}>{v}</button>
              ))}
            </div>

            {seatView === "grid" && (
              <div style={{ display: "grid", gridTemplateColumns: selectedSeat && !isMobile ? "1fr 260px" : "1fr", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 8 : 16}, 1fr)`, gap: 2 }}>
                  {seatHook.seats.map(s => {
                    const sel = selectedSeat?.id === s.id;
                    const isMine = s.active && address && s.owner.toLowerCase() === address.toLowerCase();
                    const runway = s.active && Number(s.price) > 0 ? (Number(s.deposit) / (Number(s.price) * 0.05)) * 7 : 99;
                    const isLow = s.active && runway < 3;
                    return (
                      <div key={s.id} className="seat-cell" onClick={() => setSelectedSeat(s)} style={{
                        aspectRatio: "1",
                        background: sel ? "#00e87b18" : isMine ? "#3b7dff18" : s.active ? "#1a1a2808" : "#0a0a14",
                        border: `1px solid ${sel ? "#00e87b" : isMine ? "#3b7dff" : s.active ? "#1a1a2e" : "#0e0e1a"}`,
                        fontSize: 7, color: s.active ? "#444" : "#1a1a28", fontWeight: 600,
                        animation: isLow ? "pulseRed 2s infinite" : s.active ? "pulseSeat 4s infinite" : undefined,
                      }}>
                        {s.id}
                      </div>
                    );
                  })}
                </div>

                {selectedSeat && (
                  <div style={isMobile ? { marginTop: 10 } : {}}>
                    <SeatDetailPanel seat={selectedSeat} detail={seatDetail} address={address}
                      connected={connected} seatHook={seatHook}
                      onClose={() => { setSelectedSeat(null); setSeatDetail(null); }} />
                  </div>
                )}
              </div>
            )}

            {seatView === "list" && (
              <div style={{ background: "#0c0c18", borderRadius: 8, border: "1px solid #12121e", overflow: "hidden" }}>
                <div style={{
                  display: "grid", gridTemplateColumns: isMobile ? "40px 1fr 70px 60px" : "50px 1fr 90px 90px 70px",
                  padding: "10px 14px", fontSize: 9, color: "#444", letterSpacing: 1, fontWeight: 600,
                  borderBottom: "1px solid #12121e"
                }}>
                  <span>#</span><span>OWNER</span><span style={{textAlign:"right"}}>PRICE</span>
                  {!isMobile && <span style={{textAlign:"right"}}>DEPOSIT</span>}
                  <span style={{textAlign:"right"}}>NAME</span>
                </div>
                <div style={{ maxHeight: 460, overflowY: "auto" }}>
                  {seatHook.seats.filter(s => s.active).sort((a, b) => (b.priceWei > a.priceWei ? 1 : b.priceWei < a.priceWei ? -1 : 0)).slice(0, 50).map(s => (
                    <div key={s.id} onClick={() => { setSelectedSeat(s); setSeatView("grid"); }} style={{
                      display: "grid", gridTemplateColumns: isMobile ? "40px 1fr 70px 60px" : "50px 1fr 90px 90px 70px",
                      padding: "9px 14px", fontSize: 11, borderBottom: "1px solid #0e0e1a", cursor: "pointer",
                    }}>
                      <span style={{ fontWeight: 700, color: "#555" }}>{s.id}</span>
                      <span style={{ color: "#777" }}>{shortAddr(s.owner)}</span>
                      <span style={{ textAlign: "right", color: "#f0c040", fontWeight: 600 }}>{Number(s.price).toFixed(4)}</span>
                      {!isMobile && <span style={{ textAlign: "right", color: "#3b7dff" }}>{Number(s.deposit).toFixed(4)}</span>}
                      <span style={{ textAlign: "right", color: "#666" }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {seatView === "my seats" && (
              <div>
                {seatHook.mySeats.length === 0 ? (
                  <div style={{ padding: 30, textAlign: "center", color: "#444", fontSize: 12 }}>You don't own any seats yet</div>
                ) : (
                  seatHook.mySeats.map(seatId => {
                    const s = seatHook.seats.find(x => x.id === seatId);
                    if (!s) return null;
                    return (
                      <div key={seatId} style={{
                        padding: "12px 14px", background: "#0c0c18", borderRadius: 8, border: "1px solid #12121e",
                        marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center",
                        flexWrap: "wrap", gap: 8
                      }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 14, color: "#3b7dff" }}>#{seatId}</span>
                          <span style={{ marginLeft: 10, color: "#666" }}>{s.name}</span>
                          <span style={{ marginLeft: 10, color: "#f0c040", fontWeight: 600 }}>{Number(s.price).toFixed(4)} Ξ</span>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => { playClickSound(); seatHook.claim(seatId); }} style={{
                            padding: "5px 10px", borderRadius: 5, background: "#00e87b12", border: "1px solid #00e87b40",
                            color: "#00e87b", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
                          }}>CLAIM</button>
                          <button onClick={() => { playClickSound(); seatHook.abandon(seatId); }} style={{
                            padding: "5px 10px", borderRadius: 5, background: "#ff444412", border: "1px solid #ff444440",
                            color: "#ff4444", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
                          }}>ABANDON</button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════════ STATS VIEW ════════════════ */}
        {view === "stats" && (
          <div style={{ animation: "fadeIn .4s ease" }}>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, fontWeight: 600, marginBottom: 12 }}>YOUR PERFORMANCE</div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 8 }}>
                {[
                  {
                    l: "WIN RATE",
                    v: playerStats ? (playerStats.wins + playerStats.losses > 0 ? `${((playerStats.wins / (playerStats.wins + playerStats.losses)) * 100).toFixed(1)}%` : "...") : "...",
                    sub: playerStats ? `${playerStats.wins}W / ${playerStats.losses}L` : "Connect wallet",
                    c: "#00e87b"
                  },
                  {
                    l: "STREAK",
                    v: playerStats ? `${playerStats.streak}` : "...",
                    sub: playerStats ? `Best: ${playerStats.bestStreak}` : "",
                    c: "#f0c040"
                  },
                  {
                    l: "NET P&L",
                    v: playerStats ? `${(Number(playerStats.won) - Number(playerStats.wagered)).toFixed(4)} Ξ` : "...",
                    sub: playerStats ? `Vol: ${Number(playerStats.wagered).toFixed(3)} Ξ` : "",
                    c: "#3b7dff"
                  },
                ].map((s, i) => (
                  <div key={i} style={{
                    padding: 16, background: "#0c0c18", borderRadius: 10, border: "1px solid #12121e", textAlign: "center"
                  }}>
                    <div style={{ fontSize: 8, color: "#444", letterSpacing: 2, fontWeight: 600 }}>{s.l}</div>
                    <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, color: s.c, marginTop: 6, fontFamily: "'Sora', sans-serif" }}>{s.v}</div>
                    <div style={{ fontSize: 10, color: "#444", marginTop: 4 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* P&L mini chart */}
            {flipHook.history.length > 0 && address && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, fontWeight: 600, marginBottom: 10 }}>RECENT P&L</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 60, padding: "0 4px" }}>
                  {flipHook.history.slice(0, 20).map((h, i) => {
                    const won = h.winner.toLowerCase() === address.toLowerCase();
                    const amt = Number(h.amount);
                    return (
                      <div key={i} style={{
                        flex: 1, minWidth: 8, maxWidth: 20,
                        height: Math.max(4, amt * 600),
                        background: won ? "#00e87b" : "#ff4444",
                        borderRadius: 2, opacity: 0.7
                      }} title={`${won ? "+" : "-"}${h.amount} ETH`} />
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, fontWeight: 600, marginBottom: 12 }}>PROTOCOL</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                {[
                  { l: "Total Flips", v: protocolHook.stats ? protocolHook.stats.totalFlips.toLocaleString() : "..." },
                  { l: "Volume", v: protocolHook.stats ? `${Number(protocolHook.stats.totalVolume).toFixed(3)} Ξ` : "..." },
                  { l: "Treasury", v: protocolHook.stats ? `${Number(protocolHook.stats.treasury).toFixed(4)} Ξ` : "..." },
                  { l: "Active Seats", v: `${ownedCount}/256` },
                  { l: "Jackpot", v: protocolHook.stats ? `${Number(protocolHook.stats.jackpot).toFixed(4)} Ξ` : "..." },
                  { l: "Seat Pool", v: protocolHook.stats ? `${Number(protocolHook.stats.seatPool).toFixed(4)} Ξ` : "..." },
                ].map((s, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", padding: "10px 14px",
                    background: "#0c0c18", borderRadius: 6, border: "1px solid #12121e", fontSize: 11
                  }}>
                    <span style={{ color: "#555" }}>{s.l}</span>
                    <span style={{ fontWeight: 700 }}>{s.v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, fontWeight: 600, marginBottom: 12 }}>SEAT LEADERBOARD</div>
              {leaderboard.length === 0 && (
                <div style={{ padding: 20, textAlign: "center", color: "#333", fontSize: 11 }}>No seats owned yet</div>
              )}
              {leaderboard.map((h, idx) => (
                <div key={idx} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", borderBottom: "1px solid #0e0e1a"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800, fontFamily: "'Sora', sans-serif",
                      background: idx < 3 ? [`#f0c04018`, `#c0c0c018`, `#cd7f3218`][idx] : "#12121e",
                      color: idx < 3 ? [`#f0c040`, `#c0c0c0`, `#cd7f32`][idx] : "#444"
                    }}>{idx + 1}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>{h.names[0] || shortAddr(h.addr)}</div>
                      <div style={{ fontSize: 9, color: "#444" }}>{shortAddr(h.addr)}</div>
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{h.count} seats</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid #12121e", padding: "12px 20px",
        display: "flex", justifyContent: "space-between", fontSize: 9, color: "#2a2a3a"
      }}>
        <span>FlipperRooms V6 · Base Sepolia · 256 Seats</span>
        <span style={{ animation: "pulse 2s infinite", color: connected ? "#00e87b" : "#ff4444" }}>
          {connected ? "LIVE" : "DISCONNECTED"}
        </span>
      </footer>

      {/* Live Feed */}
      <LiveFeed history={flipHook.history} address={address} />
    </div>
  );
}

/* ═══════════════════════════════════════
   SEAT DETAIL PANEL
   ═══════════════════════════════════════ */
function SeatDetailPanel({ seat, detail, address, connected, seatHook, onClose }) {
  const [buyName, setBuyName] = useState("");
  const [buyDeposit, setBuyDeposit] = useState("0.002");
  const [newPrice, setNewPrice] = useState("");
  const [ownerNewPrice, setOwnerNewPrice] = useState("");
  const [ownerAddDeposit, setOwnerAddDeposit] = useState("");

  const isOwner = address && seat.active && seat.owner.toLowerCase() === address.toLowerCase();
  const isZero = !seat.active;
  const basePrice = "0.001";

  const handleBuy = () => {
    playClickSound();
    const price = isZero ? parseEther(basePrice) : seat.priceWei;
    const listPrice = newPrice || (isZero ? basePrice : seat.price);
    seatHook.buySeat(seat.id, listPrice, buyName.slice(0, 32), price, buyDeposit);
  };

  return (
    <div style={{
      background: "#0c0c18", borderRadius: 10, border: "1px solid #15152a",
      padding: 16, fontSize: 11, alignSelf: "start", position: "sticky", top: 16
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 18, fontWeight: 700 }}>#{seat.id}</div>
        <div style={{ color: "#555", fontSize: 12, cursor: "pointer" }} onClick={onClose}>{seat.name || "Empty"} x</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { l: "Owner", v: isZero ? "Available" : (detail ? shortAddr(detail.owner) : "..."), c: isZero ? "#00e87b" : "#888" },
          { l: "Price", v: detail ? `${Number(detail.price).toFixed(4)} Ξ` : `${seat.price} Ξ`, c: "#f0c040" },
          { l: "Deposit", v: detail ? `${Number(detail.deposit).toFixed(4)} Ξ` : "...", c: "#3b7dff" },
          { l: "Rewards", v: detail ? `${Number(detail.rewards).toFixed(5)} Ξ` : "...", c: "#00e87b" },
          { l: "Tax Owed", v: detail ? `${Number(detail.pendingTax).toFixed(5)} Ξ` : "...", c: "#ff8844" },
          { l: "Runway", v: detail ? (detail.runway > 0 ? `${Math.floor(detail.runway / 86400)}d` : "...") : "...", c: "#888" },
          { l: "Earned", v: detail ? `${Number(detail.earned).toFixed(5)} Ξ` : "...", c: "#888" },
        ].map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#444" }}>{r.l}</span>
            <span style={{ color: r.c, fontWeight: 600 }}>{r.v}</span>
          </div>
        ))}
      </div>

      {connected && !isOwner && (
        <div style={{ marginTop: 16 }}>
          <input placeholder="Name (max 32 chars)" maxLength={32} value={buyName} onChange={e => setBuyName(e.target.value)} style={{
            width: "100%", marginBottom: 5, padding: "7px 10px", background: "#07070f", border: "1px solid #1a1a28",
            borderRadius: 5, color: "#c8c8d0", fontSize: 11, fontFamily: "inherit", boxSizing: "border-box"
          }}/>
          <input placeholder="Your list price (ETH)" value={newPrice} onChange={e => setNewPrice(e.target.value)} style={{
            width: "100%", marginBottom: 5, padding: "7px 10px", background: "#07070f", border: "1px solid #1a1a28",
            borderRadius: 5, color: "#c8c8d0", fontSize: 11, fontFamily: "inherit", boxSizing: "border-box"
          }}/>
          <input placeholder="Deposit (ETH)" value={buyDeposit} onChange={e => setBuyDeposit(e.target.value)} style={{
            width: "100%", marginBottom: 8, padding: "7px 10px", background: "#07070f", border: "1px solid #1a1a28",
            borderRadius: 5, color: "#c8c8d0", fontSize: 11, fontFamily: "inherit", boxSizing: "border-box"
          }}/>
          <button onClick={handleBuy} style={{
            width: "100%", padding: "11px 0", borderRadius: 6,
            background: isZero ? "#00e87b" : "linear-gradient(135deg, #00e87b18, #00e87b08)",
            border: isZero ? "none" : "1px solid #00e87b50",
            color: isZero ? "#000" : "#00e87b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1
          }}>
            {isZero ? `CLAIM · ${basePrice} Ξ + deposit` : `BUYOUT · ${seat.price} Ξ + deposit`}
          </button>
        </div>
      )}

      {connected && isOwner && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 5 }}>
          <button onClick={() => { playClickSound(); seatHook.claim(seat.id); }} style={{
            width: "100%", padding: "9px 0", borderRadius: 6, background: "#00e87b12", border: "1px solid #00e87b40",
            color: "#00e87b", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
          }}>CLAIM REWARDS</button>
          <div style={{ display: "flex", gap: 4 }}>
            <input placeholder="New price" value={ownerNewPrice} onChange={e => setOwnerNewPrice(e.target.value)} style={{
              flex: 1, padding: "7px 8px", background: "#07070f", border: "1px solid #1a1a28",
              borderRadius: 5, color: "#c8c8d0", fontSize: 10, fontFamily: "inherit", boxSizing: "border-box"
            }}/>
            <button onClick={() => { if (ownerNewPrice) { playClickSound(); seatHook.updatePrice(seat.id, ownerNewPrice); setOwnerNewPrice(""); } }} style={{
              padding: "7px 10px", borderRadius: 5, background: "#f0c04012", border: "1px solid #f0c04040",
              color: "#f0c040", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap"
            }}>SET</button>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <input placeholder="Add deposit" value={ownerAddDeposit} onChange={e => setOwnerAddDeposit(e.target.value)} style={{
              flex: 1, padding: "7px 8px", background: "#07070f", border: "1px solid #1a1a28",
              borderRadius: 5, color: "#c8c8d0", fontSize: 10, fontFamily: "inherit", boxSizing: "border-box"
            }}/>
            <button onClick={() => { if (ownerAddDeposit) { playClickSound(); seatHook.addDeposit(seat.id, ownerAddDeposit); setOwnerAddDeposit(""); } }} style={{
              padding: "7px 10px", borderRadius: 5, background: "#3b7dff12", border: "1px solid #3b7dff40",
              color: "#3b7dff", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap"
            }}>ADD</button>
          </div>
          <button onClick={() => { playClickSound(); seatHook.abandon(seat.id); }} style={{
            width: "100%", padding: "9px 0", borderRadius: 6, background: "#ff444412", border: "1px solid #ff444440",
            color: "#ff4444", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
          }}>ABANDON SEAT</button>
        </div>
      )}
    </div>
  );
}

function shortAddr(addr) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
}
