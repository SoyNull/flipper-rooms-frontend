import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { useWallet, useFlip, useSeats, useProtocol, useToasts, EXPLORER } from "./hooks.js";
import { TIERS, CONTRACT_ADDRESS } from "./config.js";
import {
  deposit as depositFn,
  withdraw as withdrawFn,
  getPlayerInfo,
  getSeatInfo as getSeatInfoFn,
  switchToBaseSepolia,
  decodeError,
} from "./contract.js";
import { parseEther, formatEther } from "ethers";

/* ═══════════════════════════════════════
   3D COIN COMPONENT (Three.js)
   ═══════════════════════════════════════ */
const Coin3D = ({ state, onComplete }) => {
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

    const ambLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(3, 5, 4);
    scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0x00ff88, 0.4);
    rimLight.position.set(-3, -2, 2);
    scene.add(rimLight);

    const coinGroup = new THREE.Group();
    scene.add(coinGroup);

    const radius = 1.2, thickness = 0.12, segments = 64;
    const bodyGeo = new THREE.CylinderGeometry(radius, radius, thickness, segments);
    const edgeGeo = new THREE.TorusGeometry(radius, thickness / 2, 16, segments);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4a843, metalness: 0.95, roughness: 0.15,
      emissive: 0x1a0f00, emissiveIntensity: 0.1
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xc49a3c, metalness: 0.98, roughness: 0.1
    });

    const body = new THREE.Mesh(bodyGeo, goldMat);
    body.rotation.x = Math.PI / 2;
    coinGroup.add(body);

    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    coinGroup.add(edge);

    const canvas1 = document.createElement("canvas");
    canvas1.width = 256; canvas1.height = 256;
    const ctx1 = canvas1.getContext("2d");
    ctx1.fillStyle = "#00000000"; ctx1.fillRect(0, 0, 256, 256);
    ctx1.fillStyle = "#1a0f00";
    ctx1.font = "bold 140px monospace";
    ctx1.textAlign = "center"; ctx1.textBaseline = "middle";
    ctx1.fillText("F", 128, 128);
    const tex1 = new THREE.CanvasTexture(canvas1);
    const face1Mat = new THREE.MeshStandardMaterial({
      map: tex1, transparent: true, metalness: 0.7, roughness: 0.3, color: 0xb8941f
    });
    const face1 = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.85, segments), face1Mat);
    face1.position.z = thickness / 2 + 0.001;
    coinGroup.add(face1);

    const canvas2 = document.createElement("canvas");
    canvas2.width = 256; canvas2.height = 256;
    const ctx2 = canvas2.getContext("2d");
    ctx2.fillStyle = "#00000000"; ctx2.fillRect(0, 0, 256, 256);
    ctx2.fillStyle = "#1a0f00";
    ctx2.font = "bold 140px monospace";
    ctx2.textAlign = "center"; ctx2.textBaseline = "middle";
    ctx2.fillText("R", 128, 128);
    const tex2 = new THREE.CanvasTexture(canvas2);
    const face2Mat = new THREE.MeshStandardMaterial({
      map: tex2, transparent: true, metalness: 0.7, roughness: 0.3, color: 0xb8941f
    });
    const face2 = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.85, segments), face2Mat);
    face2.position.z = -(thickness / 2 + 0.001);
    face2.rotation.y = Math.PI;
    coinGroup.add(face2);

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
          s.phase = "landing";
          s.startTime = t;
          const targetX = stateRef.current === "win" ? 0 : Math.PI;
          s.targetRotation = targetX + Math.round(s.coinGroup.rotation.x / (Math.PI * 2)) * Math.PI * 2;
        }
      } else if (s.phase === "landing") {
        const elapsed = t - s.startTime;
        const progress = Math.min(1, elapsed / 0.6);
        s.coinGroup.rotation.x += (s.targetRotation - s.coinGroup.rotation.x) * 0.08;
        s.coinGroup.position.y = Math.sin(progress * Math.PI) * -0.1;
        if (progress >= 1 && s.phase !== "done") {
          s.phase = "done";
          onComplete?.();
        }
      } else if (s.phase === "done") {
        s.coinGroup.position.y = Math.sin(t * 2) * 0.02;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (state === "spinning") {
      sceneRef.current.phase = "spinning";
      sceneRef.current.startTime = performance.now() / 1000;
    } else if (state === "idle") {
      sceneRef.current.phase = "idle";
    }
  }, [state]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%", minHeight: 260 }} />;
};

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
            style={{ fontSize: 10, color: "#555", marginTop: 4, display: "block" }}>
            View on explorer
          </a>
        )}
      </div>
    ))}
  </div>
);

/* ═══════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════ */
export default function FlipperRooms() {
  const [view, setView] = useState("flip");
  const [tier, setTier] = useState(1);
  const [coinState, setCoinState] = useState("idle");
  const [showResult, setShowResult] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [seatDetail, setSeatDetail] = useState(null);
  const [seatView, setSeatView] = useState("grid");
  const [depositAmt, setDepositAmt] = useState("");
  const [playerStats, setPlayerStats] = useState(null);

  const { toasts, remove: removeToast } = useToasts();
  const wallet = useWallet();
  const { connected, address, contract, sessionBalance, refreshBalance, connect, disconnect, wrongNetwork } = wallet;
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

  // Auto-refresh every 10s
  useEffect(() => {
    if (!contract) return;
    const iv = setInterval(() => {
      refreshBalance();
      protocolHook.refreshStats();
      flipHook.refreshChallenges();
    }, 10000);
    return () => clearInterval(iv);
  }, [contract, refreshBalance]);

  // Load player stats
  useEffect(() => {
    if (!contract || !address) return;
    getPlayerInfo(contract, address).then(setPlayerStats).catch(() => {});
  }, [contract, address, sessionBalance]);

  // Load seat detail
  useEffect(() => {
    if (!contract || !selectedSeat) { setSeatDetail(null); return; }
    getSeatInfoFn(contract, selectedSeat.id).then(setSeatDetail).catch(() => {});
  }, [contract, selectedSeat]);

  // Event listeners
  useEffect(() => {
    if (!contract) return;
    const onFlip = (...args) => {
      flipHook.refreshHistory();
      protocolHook.refreshStats();
      refreshBalance();
    };
    const onSeatBought = () => seatHook.refreshSeats();
    const onChallenge = () => flipHook.refreshChallenges();

    contract.on("FlipResolved", onFlip);
    contract.on("SeatBought", onSeatBought);
    contract.on("ChallengeCreated", onChallenge);
    return () => {
      contract.off("FlipResolved", onFlip);
      contract.off("SeatBought", onSeatBought);
      contract.off("ChallengeCreated", onChallenge);
    };
  }, [contract]);

  // Flip handlers
  const handleFlipPvp = async () => {
    if (coinState !== "idle" || !connected) return;
    setCoinState("spinning");
    const result = await flipHook.flipPvp(TIERS[tier].wei);
    if (!result) {
      setCoinState("idle");
    } else {
      // PvP creates a challenge, no immediate result
      setCoinState("idle");
    }
  };

  const handleFlipTreasury = async () => {
    if (coinState !== "idle" || !connected) return;
    setCoinState("spinning");
    const result = await flipHook.flipTreasury(TIERS[tier].wei);
    if (!result) {
      setCoinState("idle");
      return;
    }
    const won = result.winner.toLowerCase() === address?.toLowerCase();
    setCoinState(won ? "win" : "lose");
  };

  const handleAccept = async (challengeId) => {
    if (coinState !== "idle" || !connected) return;
    setCoinState("spinning");
    const result = await flipHook.acceptCh(challengeId);
    if (!result) {
      setCoinState("idle");
      return;
    }
    const won = result.winner.toLowerCase() === address?.toLowerCase();
    setCoinState(won ? "win" : "lose");
  };

  const onFlipDone = useCallback(() => {
    setShowResult(true);
    setTimeout(() => { setCoinState("idle"); setShowResult(false); }, 3000);
  }, []);

  const handleDeposit = async () => {
    if (!contract || !depositAmt) return;
    try {
      await depositFn(contract, depositAmt);
      setDepositAmt("");
      refreshBalance();
    } catch (err) {
      // toast handled in hooks
    }
  };

  const handleWithdraw = async () => {
    if (!contract || !depositAmt) return;
    try {
      await withdrawFn(contract, depositAmt);
      setDepositAmt("");
      refreshBalance();
    } catch (err) {}
  };

  const shortAddr = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
  const isZeroAddr = (addr) => !addr || addr === "0x0000000000000000000000000000000000000000";
  const ownedCount = seatHook.seats.filter(s => s.active).length;

  // Leaderboard from seats
  const leaderboard = (() => {
    const map = {};
    seatHook.seats.forEach(s => {
      if (!s.active) return;
      const key = s.owner.toLowerCase();
      if (!map[key]) map[key] = { addr: s.owner, count: 0, names: [] };
      map[key].count++;
      if (s.name) map[key].names.push(s.name);
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10);
  })();

  return (
    <div style={{ minHeight: "100vh", background: "#07070f", color: "#c8c8d0", fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Sora:wght@300;400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse { 0%,100% { opacity:.6 } 50% { opacity:1 } }
        @keyframes resultGlow { 0% { transform:scale(0.8); opacity:0 } 50% { transform:scale(1.05) } 100% { transform:scale(1); opacity:1 } }
        @keyframes shimmer { 0% { background-position:-200% 0 } 100% { background-position:200% 0 } }
        .nav-btn { background:none; border:none; padding:10px 20px; cursor:pointer; font-family:inherit; font-size:11px; font-weight:600; letter-spacing:2px; color:#555; transition:all .2s; position:relative }
        .nav-btn.active { color:#00e87b }
        .nav-btn.active::after { content:''; position:absolute; bottom:0; left:20%; right:20%; height:2px; background:#00e87b; border-radius:1px }
        .nav-btn:hover { color:#aaa }
        .tier-btn { border:1px solid #1a1a28; background:#0c0c18; color:#666; padding:10px 0; border-radius:6px; cursor:pointer; font-family:inherit; font-size:12px; font-weight:600; transition:all .2s; flex:1 }
        .tier-btn.active { border-color:#00e87b; color:#00e87b; background:#00e87b08; box-shadow:0 0 20px #00e87b10 }
        .flip-btn { border:none; padding:20px; border-radius:10px; cursor:pointer; font-family:inherit; font-size:13px; font-weight:700; letter-spacing:2px; transition:all .2s; flex:1; position:relative; overflow:hidden }
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
        padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center",
        borderBottom: "1px solid #12121e", background: "linear-gradient(180deg, #0b0b16, #07070f)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>
            <span style={{ color: "#00e87b" }}>FLIPPER</span><span style={{ color: "#3a3a4a" }}>ROOMS</span>
          </div>
          <div style={{ fontSize: 8, padding: "3px 8px", borderRadius: 4, background: "#0052ff18", color: "#3b7dff", border: "1px solid #0052ff30", fontWeight: 700, letterSpacing: 1.5 }}>BASE</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 8, color: "#444", letterSpacing: 1.5, fontWeight: 600 }}>JACKPOT</div>
            <div style={{ fontSize: 13, color: "#f0c040", fontWeight: 700 }}>
              {protocolHook.stats ? `${Number(protocolHook.stats.jackpot).toFixed(4)} ETH` : "—"}
            </div>
          </div>
          <div style={{ width: 1, height: 28, background: "#1a1a28" }}/>
          {wrongNetwork ? (
            <button onClick={() => switchToBaseSepolia().then(connect)} style={{
              padding: "9px 20px", borderRadius: 6, background: "#ff4444", color: "#fff", border: "none",
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1
            }}>SWITCH NETWORK</button>
          ) : connected ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 8, color: "#444", letterSpacing: 1.5, fontWeight: 600 }}>SESSION</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{Number(sessionBalance).toFixed(4)} ETH</div>
              </div>
              <div onClick={disconnect} style={{ padding: "7px 14px", borderRadius: 6, background: "#12121e", border: "1px solid #1a1a28", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
                {shortAddr(address)}
              </div>
            </div>
          ) : (
            <button onClick={connect} style={{
              padding: "9px 20px", borderRadius: 6, background: "#00e87b", color: "#000", border: "none",
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1
            }}>CONNECT</button>
          )}
        </div>
      </header>

      {/* NAV */}
      <nav style={{ display: "flex", justifyContent: "center", borderBottom: "1px solid #12121e", background: "#0a0a14" }}>
        {[
          { id: "flip", label: "FLIP" },
          { id: "board", label: "BOARD" },
          { id: "stats", label: "STATS" },
        ].map(t => (
          <button key={t.id} className={`nav-btn ${view === t.id ? "active" : ""}`} onClick={() => setView(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "20px 16px" }}>

        {/* ════════════════ FLIP VIEW ════════════════ */}
        {view === "flip" && (
          <div style={{ animation: "fadeIn .4s ease" }}>

            {/* Deposit/Withdraw */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, padding: "12px 14px", background: "#0c0c18", borderRadius: 8, border: "1px solid #15152a" }}>
              <input placeholder="Amount in ETH" type="number" step="0.001" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} style={{
                flex: 1, background: "#07070f", border: "1px solid #1a1a28", borderRadius: 6,
                padding: "9px 14px", color: "#c8c8d0", fontSize: 12, fontFamily: "inherit"
              }}/>
              <button onClick={handleDeposit} disabled={!connected} style={{ padding: "9px 18px", borderRadius: 6, background: "#00e87b15", border: "1px solid #00e87b40", color: "#00e87b", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1, opacity: connected ? 1 : 0.4 }}>DEPOSIT</button>
              <button onClick={handleWithdraw} disabled={!connected} style={{ padding: "9px 18px", borderRadius: 6, background: "#ff444415", border: "1px solid #ff444440", color: "#ff4444", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1, opacity: connected ? 1 : 0.4 }}>WITHDRAW</button>
            </div>

            {/* 3D Coin + Flip Area */}
            <div style={{
              background: "radial-gradient(ellipse at 50% 40%, #0f0f20, #07070f)", borderRadius: 12,
              border: "1px solid #15152a", marginBottom: 20, position: "relative", overflow: "hidden"
            }}>
              <div style={{
                position: "absolute", inset: 0, opacity: 0.03,
                backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
                backgroundSize: "40px 40px"
              }}/>

              <div style={{ position: "relative", zIndex: 1 }}>
                {/* Tier selector */}
                <div style={{ padding: "16px 20px 0" }}>
                  <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 8, fontWeight: 600 }}>BET TIER</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {TIERS.map((t, i) => (
                      <button key={t.wei} className={`tier-btn ${tier === i ? "active" : ""}`} onClick={() => setTier(i)}>
                        {t.label} Ξ
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3D Coin */}
                <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <Coin3D state={coinState} onComplete={onFlipDone} />
                  {showResult && flipHook.lastResult && (
                    <div style={{
                      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      background: flipHook.lastResult === "win" ? "radial-gradient(circle, #00e87b15, transparent 70%)" : "radial-gradient(circle, #ff444415, transparent 70%)",
                      animation: "resultGlow .4s ease"
                    }}>
                      <div style={{
                        fontSize: 28, fontWeight: 800, fontFamily: "'Sora', sans-serif",
                        color: flipHook.lastResult === "win" ? "#00e87b" : "#ff4444",
                        textShadow: `0 0 40px ${flipHook.lastResult === "win" ? "#00e87b" : "#ff4444"}60`,
                        letterSpacing: 4
                      }}>
                        {flipHook.lastResult === "win" ? "YOU WIN" : "YOU LOSE"}
                      </div>
                    </div>
                  )}
                </div>

                {/* Flip buttons */}
                <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
                  <button className="flip-btn" disabled={coinState !== "idle" || !connected || flipHook.isFlipping} onClick={handleFlipPvp} style={{
                    background: "linear-gradient(135deg, #00e87b20, #00e87b08)",
                    border: "1px solid #00e87b50", color: "#00e87b"
                  }}>
                    PVP FLIP
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, opacity: 0.6 }}>{TIERS[tier].label} ETH · Create challenge</div>
                  </button>
                  <button className="flip-btn" disabled={coinState !== "idle" || !connected || flipHook.isFlipping} onClick={handleFlipTreasury} style={{
                    background: "linear-gradient(135deg, #f0c04020, #f0c04008)",
                    border: "1px solid #f0c04050", color: "#f0c040"
                  }}>
                    VS TREASURY
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, opacity: 0.6 }}>{TIERS[tier].label} ETH · Instant flip</div>
                  </button>
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
                <div style={{ padding: "16px", textAlign: "center", color: "#333", fontSize: 11 }}>No open challenges</div>
              )}
              {flipHook.challenges.map(c => (
                <div key={c.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "11px 16px", background: "#0c0c18", borderRadius: 6, marginBottom: 4,
                  border: "1px solid #12121e"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ color: "#333", fontSize: 10, fontWeight: 600 }}>#{c.id}</span>
                    <span style={{ fontSize: 11, color: "#666" }}>{shortAddr(c.creator)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontWeight: 700, color: "#f0c040", fontSize: 13 }}>{c.amount} Ξ</span>
                    {c.creator.toLowerCase() === address?.toLowerCase() ? (
                      <button onClick={() => flipHook.cancelCh(c.id)} style={{
                        padding: "5px 14px", borderRadius: 5, background: "#ff444412", border: "1px solid #ff444440",
                        color: "#ff4444", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
                      }}>CANCEL</button>
                    ) : (
                      <button onClick={() => handleAccept(c.id)} disabled={flipHook.isFlipping} style={{
                        padding: "5px 14px", borderRadius: 5, background: "#00e87b12", border: "1px solid #00e87b40",
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
                <div style={{ padding: "16px", textAlign: "center", color: "#333", fontSize: 11 }}>No recent flips</div>
              )}
              {flipHook.history.map((h, i) => {
                const isWinner = h.winner.toLowerCase() === address?.toLowerCase();
                return (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "9px 16px", borderBottom: "1px solid #0e0e1a", fontSize: 11
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: isWinner ? "#00e87b" : "#ff4444" }}/>
                      <span style={{ color: isWinner ? "#00e87b" : "#ff4444", fontWeight: 700, fontSize: 10, letterSpacing: 1 }}>
                        {isWinner ? "WON" : "LOST"}
                      </span>
                      <span style={{ color: "#444" }}>
                        vs {h.vsTreasury ? "Treasury" : shortAddr(isWinner ? h.loser : h.winner)}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span style={{ fontWeight: 600 }}>{h.amount} Ξ</span>
                      {h.winnerStreak >= 3 && <span style={{ color: "#f0c040", fontSize: 10, fontWeight: 600 }}>{h.winnerStreak}x</span>}
                      <span style={{ color: "#333", fontSize: 10 }}>#{h.block}</span>
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
            {/* Stats bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
              {[
                { l: "OWNED", v: `${ownedCount}/256`, c: "#00e87b" },
                { l: "FLOOR", v: "0.001 Ξ", c: "#f0c040" },
                { l: "SEAT POOL", v: protocolHook.stats ? `${Number(protocolHook.stats.seatPool).toFixed(4)} Ξ` : "—", c: "#3b7dff" },
                { l: "MY SEATS", v: `${seatHook.mySeats.length}`, c: "#ff8844" },
              ].map((s, i) => (
                <div key={i} style={{ padding: "14px 12px", background: "#0c0c18", borderRadius: 8, border: "1px solid #12121e", textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: "#444", letterSpacing: 1.5, fontWeight: 600 }}>{s.l}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: s.c, marginTop: 4, fontFamily: "'Sora', sans-serif" }}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* View toggle */}
            <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
              {["grid", "list", "my seats"].map(v => (
                <button key={v} onClick={() => setSeatView(v)} style={{
                  padding: "6px 16px", borderRadius: 4, border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 10, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase",
                  background: seatView === v ? "#1a1a28" : "transparent", color: seatView === v ? "#c8c8d0" : "#444"
                }}>{v}</button>
              ))}
            </div>

            {seatView === "grid" && (
              <div style={{ display: "grid", gridTemplateColumns: selectedSeat ? "1fr 260px" : "1fr", gap: 14 }}>
                {/* Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(16, 1fr)", gap: 2 }}>
                  {seatHook.seats.map(s => {
                    const sel = selectedSeat?.id === s.id;
                    const isMine = s.active && address && s.owner.toLowerCase() === address.toLowerCase();
                    return (
                      <div key={s.id} className="seat-cell" onClick={() => setSelectedSeat(s)} style={{
                        aspectRatio: "1",
                        background: sel ? "#00e87b18" : isMine ? "#3b7dff18" : s.active ? "#1a1a2808" : "#0a0a14",
                        border: `1px solid ${sel ? "#00e87b" : isMine ? "#3b7dff" : s.active ? "#1a1a2e" : "#0e0e1a"}`,
                        fontSize: 7, color: s.active ? "#444" : "#1a1a28", fontWeight: 600
                      }}>
                        {s.id}
                      </div>
                    );
                  })}
                </div>

                {/* Seat detail */}
                {selectedSeat && (
                  <SeatDetailPanel
                    seat={selectedSeat}
                    detail={seatDetail}
                    address={address}
                    connected={connected}
                    seatHook={seatHook}
                    onClose={() => { setSelectedSeat(null); setSeatDetail(null); }}
                  />
                )}
              </div>
            )}

            {seatView === "list" && (
              <div style={{ background: "#0c0c18", borderRadius: 8, border: "1px solid #12121e", overflow: "hidden" }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "50px 1fr 90px 90px 70px",
                  padding: "10px 14px", fontSize: 9, color: "#444", letterSpacing: 1, fontWeight: 600,
                  borderBottom: "1px solid #12121e"
                }}>
                  <span>#</span><span>OWNER</span><span style={{textAlign:"right"}}>PRICE</span>
                  <span style={{textAlign:"right"}}>DEPOSIT</span>
                  <span style={{textAlign:"right"}}>NAME</span>
                </div>
                <div style={{ maxHeight: 460, overflowY: "auto" }}>
                  {seatHook.seats.filter(s => s.active).sort((a, b) => Number(b.priceWei - a.priceWei)).slice(0, 50).map(s => (
                    <div key={s.id} onClick={() => { setSelectedSeat(s); setSeatView("grid"); }} style={{
                      display: "grid", gridTemplateColumns: "50px 1fr 90px 90px 70px",
                      padding: "9px 14px", fontSize: 11, borderBottom: "1px solid #0e0e1a", cursor: "pointer",
                    }}>
                      <span style={{ fontWeight: 700, color: "#555" }}>{s.id}</span>
                      <span style={{ color: "#777" }}>{shortAddr(s.owner)}</span>
                      <span style={{ textAlign: "right", color: "#f0c040", fontWeight: 600 }}>{Number(s.price).toFixed(4)}</span>
                      <span style={{ textAlign: "right", color: "#3b7dff" }}>{Number(s.deposit).toFixed(4)}</span>
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
                        padding: "14px 16px", background: "#0c0c18", borderRadius: 8, border: "1px solid #12121e",
                        marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center"
                      }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: 14, color: "#3b7dff" }}>#{seatId}</span>
                          <span style={{ marginLeft: 12, color: "#666" }}>{s.name}</span>
                          <span style={{ marginLeft: 12, color: "#f0c040", fontWeight: 600 }}>{Number(s.price).toFixed(4)} Ξ</span>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => seatHook.claim(seatId)} style={{
                            padding: "5px 12px", borderRadius: 5, background: "#00e87b12", border: "1px solid #00e87b40",
                            color: "#00e87b", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
                          }}>CLAIM</button>
                          <button onClick={() => seatHook.abandon(seatId)} style={{
                            padding: "5px 12px", borderRadius: 5, background: "#ff444412", border: "1px solid #ff444440",
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[
                  {
                    l: "WIN RATE",
                    v: playerStats ? (playerStats.wins + playerStats.losses > 0 ? `${((playerStats.wins / (playerStats.wins + playerStats.losses)) * 100).toFixed(1)}%` : "—") : "—",
                    sub: playerStats ? `${playerStats.wins}W / ${playerStats.losses}L` : "Connect wallet",
                    c: "#00e87b"
                  },
                  {
                    l: "STREAK",
                    v: playerStats ? `${playerStats.streak}` : "—",
                    sub: playerStats ? `Best: ${playerStats.bestStreak}` : "",
                    c: "#f0c040"
                  },
                  {
                    l: "NET P&L",
                    v: playerStats ? `${(Number(playerStats.won) - Number(playerStats.wagered)).toFixed(4)} Ξ` : "—",
                    sub: playerStats ? `Vol: ${Number(playerStats.wagered).toFixed(3)} Ξ` : "",
                    c: "#3b7dff"
                  },
                ].map((s, i) => (
                  <div key={i} style={{
                    padding: 20, background: "#0c0c18", borderRadius: 10, border: "1px solid #12121e", textAlign: "center"
                  }}>
                    <div style={{ fontSize: 8, color: "#444", letterSpacing: 2, fontWeight: 600 }}>{s.l}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: s.c, marginTop: 8, fontFamily: "'Sora', sans-serif" }}>{s.v}</div>
                    <div style={{ fontSize: 10, color: "#444", marginTop: 6 }}>{s.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, fontWeight: 600, marginBottom: 12 }}>PROTOCOL</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                {[
                  { l: "Total Flips", v: protocolHook.stats ? protocolHook.stats.totalFlips.toLocaleString() : "—" },
                  { l: "Volume", v: protocolHook.stats ? `${Number(protocolHook.stats.totalVolume).toFixed(3)} Ξ` : "—" },
                  { l: "Treasury", v: protocolHook.stats ? `${Number(protocolHook.stats.treasury).toFixed(4)} Ξ` : "—" },
                  { l: "Active Seats", v: `${ownedCount}/256` },
                  { l: "Jackpot", v: protocolHook.stats ? `${Number(protocolHook.stats.jackpot).toFixed(4)} Ξ` : "—" },
                  { l: "Seat Pool", v: protocolHook.stats ? `${Number(protocolHook.stats.seatPool).toFixed(4)} Ξ` : "—" },
                ].map((s, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", padding: "12px 16px",
                    background: "#0c0c18", borderRadius: 6, border: "1px solid #12121e", fontSize: 12
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
                  padding: "12px 16px", borderBottom: "1px solid #0e0e1a"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 800, fontFamily: "'Sora', sans-serif",
                      background: idx < 3 ? [`#f0c04018`, `#c0c0c018`, `#cd7f3218`][idx] : "#12121e",
                      color: idx < 3 ? [`#f0c040`, `#c0c0c0`, `#cd7f32`][idx] : "#444"
                    }}>{idx + 1}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{h.names[0] || shortAddr(h.addr)}</div>
                      <div style={{ fontSize: 10, color: "#444" }}>{shortAddr(h.addr)}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{h.count} seats</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid #12121e", padding: "14px 24px", marginTop: 40,
        display: "flex", justifyContent: "space-between", fontSize: 9, color: "#2a2a3a"
      }}>
        <span>FlipperRooms V6 · Base Sepolia · 256 Seats</span>
        <span style={{ animation: "pulse 2s infinite", color: connected ? "#00e87b" : "#ff4444" }}>
          {connected ? "LIVE" : "DISCONNECTED"}
        </span>
      </footer>
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

  const isOwner = address && seat.active && seat.owner.toLowerCase() === address.toLowerCase();
  const isZero = !seat.active;
  const basePrice = "0.001";

  const handleBuy = () => {
    const price = isZero ? parseEther(basePrice) : seat.priceWei;
    const listPrice = newPrice || (isZero ? basePrice : seat.price);
    seatHook.buySeat(seat.id, listPrice, buyName, price, buyDeposit);
  };

  return (
    <div style={{
      background: "#0c0c18", borderRadius: 10, border: "1px solid #15152a",
      padding: 18, fontSize: 11, alignSelf: "start", position: "sticky", top: 16
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 18, fontWeight: 700 }}>#{seat.id}</div>
        <div style={{ color: "#555", fontSize: 12, cursor: "pointer" }} onClick={onClose}>{seat.name || "Empty"} x</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          { l: "Owner", v: isZero ? "Available" : (detail ? `${detail.owner.slice(0,6)}...${detail.owner.slice(-4)}` : "..."), c: isZero ? "#00e87b" : "#888" },
          { l: "Price", v: detail ? `${Number(detail.price).toFixed(4)} Ξ` : `${seat.price} Ξ`, c: "#f0c040" },
          { l: "Deposit", v: detail ? `${Number(detail.deposit).toFixed(4)} Ξ` : "...", c: "#3b7dff" },
          { l: "Rewards", v: detail ? `${Number(detail.rewards).toFixed(5)} Ξ` : "...", c: "#00e87b" },
          { l: "Tax Owed", v: detail ? `${Number(detail.pendingTax).toFixed(5)} Ξ` : "...", c: "#ff8844" },
          { l: "Runway", v: detail ? (detail.runway > 0 ? `${Math.floor(detail.runway / 86400)}d` : "—") : "...", c: "#888" },
          { l: "Earned", v: detail ? `${Number(detail.earned).toFixed(5)} Ξ` : "...", c: "#888" },
        ].map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#444" }}>{r.l}</span>
            <span style={{ color: r.c, fontWeight: 600 }}>{r.v}</span>
          </div>
        ))}
      </div>

      {connected && !isOwner && (
        <div style={{ marginTop: 18 }}>
          <input placeholder="Name (optional)" value={buyName} onChange={e => setBuyName(e.target.value)} style={{
            width: "100%", marginBottom: 6, padding: "8px 10px", background: "#07070f", border: "1px solid #1a1a28",
            borderRadius: 5, color: "#c8c8d0", fontSize: 11, fontFamily: "inherit", boxSizing: "border-box"
          }}/>
          <input placeholder="Your list price" value={newPrice} onChange={e => setNewPrice(e.target.value)} style={{
            width: "100%", marginBottom: 6, padding: "8px 10px", background: "#07070f", border: "1px solid #1a1a28",
            borderRadius: 5, color: "#c8c8d0", fontSize: 11, fontFamily: "inherit", boxSizing: "border-box"
          }}/>
          <input placeholder="Deposit (ETH)" value={buyDeposit} onChange={e => setBuyDeposit(e.target.value)} style={{
            width: "100%", marginBottom: 8, padding: "8px 10px", background: "#07070f", border: "1px solid #1a1a28",
            borderRadius: 5, color: "#c8c8d0", fontSize: 11, fontFamily: "inherit", boxSizing: "border-box"
          }}/>
          <button onClick={handleBuy} style={{
            width: "100%", padding: "12px 0", borderRadius: 6,
            background: isZero ? "#00e87b" : "linear-gradient(135deg, #00e87b18, #00e87b08)",
            border: isZero ? "none" : "1px solid #00e87b50",
            color: isZero ? "#000" : "#00e87b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1
          }}>
            {isZero ? `CLAIM · ${basePrice} Ξ + deposit` : `BUYOUT · ${seat.price} Ξ + deposit`}
          </button>
        </div>
      )}

      {connected && isOwner && (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={() => seatHook.claim(seat.id)} style={{
            width: "100%", padding: "10px 0", borderRadius: 6, background: "#00e87b12", border: "1px solid #00e87b40",
            color: "#00e87b", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
          }}>CLAIM REWARDS</button>
          <button onClick={() => seatHook.abandon(seat.id)} style={{
            width: "100%", padding: "10px 0", borderRadius: 6, background: "#ff444412", border: "1px solid #ff444440",
            color: "#ff4444", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit"
          }}>ABANDON SEAT</button>
        </div>
      )}
    </div>
  );
}
