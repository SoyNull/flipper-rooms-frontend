import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function Coin3D({ state, onComplete }) {
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
