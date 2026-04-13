import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

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

    // "F" on front (heads)
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
      map: tex1, transparent: true, metalness: 0.7, roughness: 0.3,
      color: 0xb8941f
    });
    const face1 = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.85, segments), face1Mat);
    face1.position.z = thickness / 2 + 0.001;
    coinGroup.add(face1);

    // "R" on back (tails)
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
      map: tex2, transparent: true, metalness: 0.7, roughness: 0.3,
      color: 0xb8941f
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
        const ease = 1 - Math.pow(1 - progress, 3);
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
   MAIN APP
   ═══════════════════════════════════════ */
export default function FlipperRooms() {
  const [view, setView] = useState("flip");
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState(0);
  const [tier, setTier] = useState(1);
  const [coinState, setCoinState] = useState("idle");
  const [result, setResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [seatView, setSeatView] = useState("grid");
  const tiers = [0.001, 0.005, 0.01, 0.05, 0.1];

  const [seats] = useState(() => Array.from({ length: 256 }, (_, i) => {
    const owned = Math.random() > 0.55;
    return {
      id: i + 1,
      owner: owned ? `0x${Math.random().toString(16).slice(2,6)}...${Math.random().toString(16).slice(2,6)}` : null,
      price: owned ? +(Math.random() * 0.06 + 0.001).toFixed(4) : 0.001,
      yield: owned ? +(Math.random() * 0.004).toFixed(5) : 0,
      name: owned ? ["Alpha","Whale","Degen","Sigma","Chad","Moon","Boss","Turbo"][Math.floor(Math.random()*8)] : "",
      deposit: owned ? +(Math.random()*0.04).toFixed(4) : 0,
    };
  }));

  const history = [
    { win: true, vs: "0xd3c3...cab3", amount: 0.005, payout: 0.0095, streak: 3, time: "2m" },
    { win: false, vs: "0x9a1f...2b4c", amount: 0.01, payout: 0, streak: 0, time: "8m" },
    { win: true, vs: "0x4b2e...7f1a", amount: 0.001, payout: 0.0019, streak: 2, time: "15m" },
    { win: true, vs: "Treasury", amount: 0.005, payout: 0.0095, streak: 1, time: "22m" },
    { win: false, vs: "0xe567...83aE", amount: 0.001, payout: 0, streak: 0, time: "31m" },
  ];

  const challenges = [
    { id: 7, from: "0xe567...83aE", amount: 0.005 },
    { id: 8, from: "0xd3c3...cab3", amount: 0.001 },
    { id: 9, from: "0x9a1f...2b4c", amount: 0.01 },
  ];

  const flip = () => {
    if (coinState !== "idle") return;
    setCoinState("spinning");
    setResult(null);
    setShowResult(false);
    setTimeout(() => {
      const won = Math.random() > 0.45;
      setResult(won ? "win" : "lose");
      setCoinState(won ? "win" : "lose");
    }, 300);
  };

  const onFlipDone = useCallback(() => {
    setShowResult(true);
    setTimeout(() => { setCoinState("idle"); setShowResult(false); }, 3000);
  }, []);

  const ownedCount = seats.filter(s => s.owner).length;

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

      {/* ═══ HEADER ═══ */}
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
            <div style={{ fontSize: 13, color: "#f0c040", fontWeight: 700 }}>0.089 ETH</div>
          </div>
          <div style={{ width: 1, height: 28, background: "#1a1a28" }}/>
          {connected ? (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 8, color: "#444", letterSpacing: 1.5, fontWeight: 600 }}>SESSION</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{session.toFixed(4)} ETH</div>
              </div>
              <div style={{ padding: "7px 14px", borderRadius: 6, background: "#12121e", border: "1px solid #1a1a28", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>
                0xe567...83aE
              </div>
            </div>
          ) : (
            <button onClick={() => { setConnected(true); setSession(0.025); }} style={{
              padding: "9px 20px", borderRadius: 6, background: "#00e87b", color: "#000", border: "none",
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1
            }}>CONNECT</button>
          )}
        </div>
      </header>

      {/* ═══ NAV ═══ */}
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

            {/* Deposit */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, padding: "12px 14px", background: "#0c0c18", borderRadius: 8, border: "1px solid #15152a" }}>
              <input placeholder="Amount in ETH" type="number" step="0.001" style={{
                flex: 1, background: "#07070f", border: "1px solid #1a1a28", borderRadius: 6,
                padding: "9px 14px", color: "#c8c8d0", fontSize: 12, fontFamily: "inherit"
              }}/>
              <button style={{ padding: "9px 18px", borderRadius: 6, background: "#00e87b15", border: "1px solid #00e87b40", color: "#00e87b", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1 }}>DEPOSIT</button>
              <button style={{ padding: "9px 18px", borderRadius: 6, background: "#ff444415", border: "1px solid #ff444440", color: "#ff4444", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1 }}>WITHDRAW</button>
            </div>

            {/* 3D Coin + Flip Area */}
            <div style={{
              background: "radial-gradient(ellipse at 50% 40%, #0f0f20, #07070f)", borderRadius: 12,
              border: "1px solid #15152a", marginBottom: 20, position: "relative", overflow: "hidden"
            }}>
              {/* Background grid */}
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
                    {tiers.map((t, i) => (
                      <button key={t} className={`tier-btn ${tier === i ? "active" : ""}`} onClick={() => setTier(i)}>
                        {t} Ξ
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3D Coin */}
                <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <Coin3D state={coinState} onComplete={onFlipDone} />
                  {/* Result overlay */}
                  {showResult && (
                    <div style={{
                      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      background: result === "win" ? "radial-gradient(circle, #00e87b15, transparent 70%)" : "radial-gradient(circle, #ff444415, transparent 70%)",
                      animation: "resultGlow .4s ease"
                    }}>
                      <div style={{
                        fontSize: 28, fontWeight: 800, fontFamily: "'Sora', sans-serif",
                        color: result === "win" ? "#00e87b" : "#ff4444",
                        textShadow: `0 0 40px ${result === "win" ? "#00e87b" : "#ff4444"}60`,
                        letterSpacing: 4
                      }}>
                        {result === "win" ? "YOU WIN" : "YOU LOSE"}
                      </div>
                    </div>
                  )}
                </div>

                {/* Flip buttons */}
                <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
                  <button className="flip-btn" disabled={coinState !== "idle" || !connected} onClick={flip} style={{
                    background: "linear-gradient(135deg, #00e87b20, #00e87b08)",
                    border: "1px solid #00e87b50", color: "#00e87b"
                  }}>
                    ⚡ PVP FLIP
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, opacity: 0.6 }}>{tiers[tier]} ETH · Match opponent</div>
                  </button>
                  <button className="flip-btn" disabled={coinState !== "idle" || !connected} onClick={flip} style={{
                    background: "linear-gradient(135deg, #f0c04020, #f0c04008)",
                    border: "1px solid #f0c04050", color: "#f0c040"
                  }}>
                    🏦 VS TREASURY
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, opacity: 0.6 }}>{tiers[tier]} ETH · Instant flip</div>
                  </button>
                </div>
              </div>
            </div>

            {/* Open Challenges */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 10, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
                <span>OPEN CHALLENGES</span>
                <span style={{ color: "#00e87b" }}>{challenges.length} live</span>
              </div>
              {challenges.map(c => (
                <div key={c.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "11px 16px", background: "#0c0c18", borderRadius: 6, marginBottom: 4,
                  border: "1px solid #12121e"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ color: "#333", fontSize: 10, fontWeight: 600 }}>#{c.id}</span>
                    <span style={{ fontSize: 11, color: "#666" }}>{c.from}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontWeight: 700, color: "#f0c040", fontSize: 13 }}>{c.amount} Ξ</span>
                    <button style={{
                      padding: "5px 14px", borderRadius: 5, background: "#00e87b12", border: "1px solid #00e87b40",
                      color: "#00e87b", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5
                    }}>ACCEPT</button>
                  </div>
                </div>
              ))}
            </div>

            {/* History */}
            <div>
              <div style={{ fontSize: 9, color: "#444", letterSpacing: 2, marginBottom: 10, fontWeight: 600 }}>RECENT FLIPS</div>
              {history.map((h, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "9px 16px", borderBottom: "1px solid #0e0e1a", fontSize: 11
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: h.win ? "#00e87b" : "#ff4444" }}/>
                    <span style={{ color: h.win ? "#00e87b" : "#ff4444", fontWeight: 700, fontSize: 10, letterSpacing: 1 }}>{h.win ? "WON" : "LOST"}</span>
                    <span style={{ color: "#444" }}>vs {h.vs}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontWeight: 600 }}>{h.amount} Ξ</span>
                    {h.streak > 0 && <span style={{ color: "#f0c040", fontSize: 10, fontWeight: 600 }}>🔥{h.streak}</span>}
                    <span style={{ color: "#333", fontSize: 10 }}>{h.time}</span>
                  </div>
                </div>
              ))}
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
                { l: "FLOOR", v: "0.0012 Ξ", c: "#f0c040" },
                { l: "YIELD 7D", v: "0.42 Ξ", c: "#3b7dff" },
                { l: "TAX POOL", v: "0.18 Ξ", c: "#ff8844" },
              ].map((s, i) => (
                <div key={i} style={{ padding: "14px 12px", background: "#0c0c18", borderRadius: 8, border: "1px solid #12121e", textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: "#444", letterSpacing: 1.5, fontWeight: 600 }}>{s.l}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: s.c, marginTop: 4, fontFamily: "'Sora', sans-serif" }}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* View toggle */}
            <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
              {["grid", "list"].map(v => (
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
                  {seats.map(s => {
                    const active = !!s.owner;
                    const sel = selectedSeat?.id === s.id;
                    const yc = s.yield > 0.003 ? "#00e87b" : s.yield > 0.001 ? "#f0c040" : "#2a2a3a";
                    return (
                      <div key={s.id} className="seat-cell" onClick={() => setSelectedSeat(s)} style={{
                        aspectRatio: "1",
                        background: sel ? "#00e87b18" : active ? `linear-gradient(135deg, #0e0e1e, ${yc}08)` : "#0a0a14",
                        border: `1px solid ${sel ? "#00e87b" : active ? "#1a1a2e" : "#0e0e1a"}`,
                        fontSize: 7, color: active ? "#444" : "#1a1a28", fontWeight: 600
                      }}>
                        {s.id}
                      </div>
                    );
                  })}
                </div>

                {/* Seat detail */}
                {selectedSeat && (
                  <div style={{
                    background: "#0c0c18", borderRadius: 10, border: "1px solid #15152a",
                    padding: 18, fontSize: 11, alignSelf: "start", position: "sticky", top: 16
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ fontFamily: "'Sora', sans-serif", fontSize: 18, fontWeight: 700 }}>#{selectedSeat.id}</div>
                      <div style={{ color: "#555", fontSize: 12 }}>{selectedSeat.name || "Empty"}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {[
                        { l: "Owner", v: selectedSeat.owner || "Available", c: selectedSeat.owner ? "#888" : "#00e87b" },
                        { l: "Price", v: `${selectedSeat.price} Ξ`, c: "#f0c040" },
                        { l: "Yield 7d", v: `${selectedSeat.yield} Ξ`, c: "#00e87b" },
                        { l: "Deposit", v: `${selectedSeat.deposit} Ξ`, c: "#3b7dff" },
                        { l: "Tax/wk", v: `${(selectedSeat.price * 0.05).toFixed(5)} Ξ`, c: "#ff8844" },
                        { l: "Runway", v: selectedSeat.deposit > 0 ? `${Math.floor(selectedSeat.deposit / (selectedSeat.price * 0.05) * 7)}d` : "—", c: "#888" },
                      ].map((r, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "#444" }}>{r.l}</span>
                          <span style={{ color: r.c, fontWeight: 600 }}>{r.v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 18 }}>
                      {selectedSeat.owner ? (
                        <button style={{
                          width: "100%", padding: "12px 0", borderRadius: 6,
                          background: "linear-gradient(135deg, #00e87b18, #00e87b08)", border: "1px solid #00e87b50",
                          color: "#00e87b", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1
                        }}>BUYOUT · {selectedSeat.price} Ξ</button>
                      ) : (
                        <button style={{
                          width: "100%", padding: "12px 0", borderRadius: 6,
                          background: "#00e87b", border: "none",
                          color: "#000", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1
                        }}>CLAIM · 0.001 Ξ + deposit</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {seatView === "list" && (
              <div style={{ background: "#0c0c18", borderRadius: 8, border: "1px solid #12121e", overflow: "hidden" }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "50px 1fr 90px 90px 90px 70px",
                  padding: "10px 14px", fontSize: 9, color: "#444", letterSpacing: 1, fontWeight: 600,
                  borderBottom: "1px solid #12121e"
                }}>
                  <span>#</span><span>OWNER</span><span style={{textAlign:"right"}}>PRICE</span>
                  <span style={{textAlign:"right"}}>YIELD</span><span style={{textAlign:"right"}}>DEPOSIT</span>
                  <span style={{textAlign:"right"}}>RUNWAY</span>
                </div>
                <div style={{ maxHeight: 460, overflowY: "auto" }}>
                  {seats.filter(s => s.owner).sort((a, b) => b.price - a.price).slice(0, 30).map(s => (
                    <div key={s.id} onClick={() => { setSelectedSeat(s); setSeatView("grid"); }} style={{
                      display: "grid", gridTemplateColumns: "50px 1fr 90px 90px 90px 70px",
                      padding: "9px 14px", fontSize: 11, borderBottom: "1px solid #0e0e1a", cursor: "pointer",
                      transition: "background .15s"
                    }}>
                      <span style={{ fontWeight: 700, color: "#555" }}>{s.id}</span>
                      <span style={{ color: "#777" }}><span style={{ color: "#999", fontWeight: 600 }}>{s.name}</span> {s.owner}</span>
                      <span style={{ textAlign: "right", color: "#f0c040", fontWeight: 600 }}>{s.price.toFixed(4)}</span>
                      <span style={{ textAlign: "right", color: "#00e87b" }}>{s.yield.toFixed(5)}</span>
                      <span style={{ textAlign: "right", color: "#3b7dff" }}>{s.deposit.toFixed(4)}</span>
                      <span style={{ textAlign: "right", color: "#666" }}>{Math.floor(s.deposit / (s.price * 0.05) * 7)}d</span>
                    </div>
                  ))}
                </div>
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
                  { l: "WIN RATE", v: "60.3%", sub: "47W / 31L", c: "#00e87b" },
                  { l: "STREAK", v: "🔥 3", sub: "Best: 8", c: "#f0c040" },
                  { l: "NET P&L", v: "+0.062 Ξ", sub: "Vol: 1.24 Ξ", c: "#3b7dff" },
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
                  { l: "Total Flips", v: "14,892" },
                  { l: "Volume", v: "38.4 Ξ" },
                  { l: "Treasury", v: "2.15 Ξ" },
                  { l: "Active Seats", v: `${ownedCount}/256` },
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
              {[
                { r: 1, name: "CryptoWhale", addr: "0xc895...EAcb", seats: 15, yield: 0.082 },
                { r: 2, name: "BasedDegen", addr: "0xbB0c...2d12", seats: 8, yield: 0.044 },
                { r: 3, name: "FlipperKing", addr: "0x813B...B174", seats: 5, yield: 0.028 },
                { r: 4, name: "SigmaGrind", addr: "0x3986...04ED", seats: 4, yield: 0.021 },
                { r: 5, name: "MoonBoi", addr: "0xbeF0...6AC0", seats: 3, yield: 0.016 },
              ].map(h => (
                <div key={h.r} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", borderBottom: "1px solid #0e0e1a"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 800, fontFamily: "'Sora', sans-serif",
                      background: h.r <= 3 ? [`#f0c04018`, `#c0c0c018`, `#cd7f3218`][h.r - 1] : "#12121e",
                      color: h.r <= 3 ? [`#f0c040`, `#c0c0c0`, `#cd7f32`][h.r - 1] : "#444"
                    }}>{h.r}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{h.name}</div>
                      <div style={{ fontSize: 10, color: "#444" }}>{h.addr}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{h.seats} seats</div>
                    <div style={{ fontSize: 10, color: "#00e87b" }}>+{h.yield} Ξ/wk</div>
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
        <span>FlipperRooms V6 · Base Chain · 256 Seats</span>
        <span style={{ animation: "pulse 2s infinite", color: "#00e87b" }}>● LIVE</span>
      </footer>
    </div>
  );
}
