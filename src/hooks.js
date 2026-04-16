import { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { BrowserProvider, JsonRpcProvider, formatEther, formatUnits, parseEther, parseUnits } from "ethers";
import {
  getSeatsContract, getCoinflipContract, getTokenContract,
  getAllSeatsBasic, getUserProfile as getUserProfileFn, getGraduationInfo,
  getProtocolStats as getProtocolStatsFn, getPlayerInfo as getPlayerInfoFn,
  getAllOpenChallenges, getTreasuryMaxBet as getTreasuryMaxBetFn,
  flipDirect as flipDirectFn, createChallenge as createChallengeFn,
  acceptChallenge as acceptChallengeFn, cancelChallenge as cancelChallengeFn,
  mintSeat as mintSeatFn, buyOutSeat as buyOutSeatFn, addDeposit as addDepositFn,
  updateSeatPrice as updateSeatPriceFn, abandonSeat as abandonSeatFn,
  claimRewards as claimRewardsFn, claimMultipleRewards as claimMultipleRewardsFn,
  withdrawDeposit as withdrawDepositFn, distributeYield as distributeFn,
  claimMockFlipper as claimMockFlipperFn,
  parseFlipResolved, decodeError, EXPLORER,
} from "./contract.js";
import { RPC_URL, SEATS_ADDRESS } from "./config.js";

// ═══════════════════════════════════════
//             TOAST SYSTEM
// ═══════════════════════════════════════

let toastId = 0;
let toastSetState = null;

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  toastSetState = setToasts;
  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);
  return { toasts, remove };
}

export function addToast(type, message, txHash) {
  if (!toastSetState) return;
  const id = ++toastId;
  toastSetState(prev => [...prev, { id, type, message, txHash }]);
  // Success / error / info fade after 6s.
  // Pending toasts ALSO fade after 30s as a fail-safe — callers should
  // explicitly dismissToast(id) as soon as they know the tx resolved,
  // but this guarantees we never leave a spinner stuck on-screen.
  const ttl = type === "pending" ? 30000 : 6000;
  setTimeout(() => {
    toastSetState(prev => prev.filter(t => t.id !== id));
  }, ttl);
  return id;
}

export function dismissToast(id) {
  if (!toastSetState || id == null) return;
  toastSetState(prev => prev.filter(t => t.id !== id));
}

function removeToast(id) { dismissToast(id); }

// ═══════════════════════════════════════
//          READ-ONLY PROVIDERS
// ═══════════════════════════════════════

const _readProvider = new JsonRpcProvider(RPC_URL);
const _readSeats = getSeatsContract(_readProvider);
const _readCoinflip = getCoinflipContract(_readProvider);
const _readToken = getTokenContract(_readProvider);

// ═══════════════════════════════════════
//              useWallet (Privy)
// ═══════════════════════════════════════

export function useWallet() {
  const { login, logout, authenticated, ready, user, linkTwitter } = usePrivy();
  const { wallets } = useWallets();
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [seatsContract, setSeatsContract] = useState(null);
  const [coinflipContract, setCoinflipContract] = useState(null);
  const [tokenContract, setTokenContract] = useState(null);
  const [address, setAddress] = useState(null);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [chainId, setChainId] = useState(null);
  const setupRef = useRef(null);

  useEffect(() => {
    if (!authenticated || !ready) return;
    if (wallets.length === 0) return;
    const wallet = wallets[0];
    if (setupRef.current === wallet.address) return;

    let cancelled = false;
    async function setup() {
      try {
        setIsEmbedded(wallet.walletClientType === "privy");
        try { await wallet.switchChain(84532); } catch {}

        let ethProvider, sgnr;
        try {
          const rawProvider = await wallet.getEthereumProvider();
          ethProvider = new BrowserProvider(rawProvider);
          sgnr = await ethProvider.getSigner();
        } catch (providerErr) {
          if (window.ethereum) {
            ethProvider = new BrowserProvider(window.ethereum);
            sgnr = await ethProvider.getSigner();
          } else {
            throw providerErr;
          }
        }

        if (cancelled) return;
        const addr = await sgnr.getAddress();
        setupRef.current = wallet.address;
        setProvider(ethProvider);
        setSigner(sgnr);
        setAddress(addr);
        setSeatsContract(getSeatsContract(sgnr));
        setCoinflipContract(getCoinflipContract(sgnr));
        setTokenContract(getTokenContract(sgnr));

        try {
          const net = await ethProvider.getNetwork();
          setChainId(Number(net.chainId));
        } catch { setChainId(null); }
      } catch (err) {
        console.error("Wallet setup failed:", err.message);
      }
    }
    setup();
    return () => { cancelled = true; };
  }, [ready, authenticated, wallets]);

  useEffect(() => {
    if (!authenticated) {
      setupRef.current = null;
      setSeatsContract(null);
      setCoinflipContract(null);
      setTokenContract(null);
      setAddress(null);
      setSigner(null);
      setProvider(null);
      setIsEmbedded(false);
      setChainId(null);
    }
  }, [authenticated]);

  return {
    connected: authenticated && !!seatsContract,
    authenticated,
    isEmbedded,
    address,
    provider,
    signer,
    seatsContract,
    coinflipContract,
    tokenContract,
    readSeats: _readSeats,
    readCoinflip: _readCoinflip,
    readToken: _readToken,
    chainId,
    connect: login,
    disconnect: logout,
    ready,
    user,         // F2: Privy user object (has .twitter, .linkedAccounts)
    linkTwitter,  // F2: trigger Privy X/Twitter linking
  };
}

// ═══════════════════════════════════════
//             useTokenBalance
// ═══════════════════════════════════════

export function useTokenBalance(tokenContract, readToken, address) {
  const [balance, setBalance] = useState(0n);

  const refresh = useCallback(async () => {
    const c = tokenContract || readToken;
    if (!c || !address) return;
    try {
      const bal = await c.balanceOf(address);
      setBalance(bal);
    } catch {}
  }, [tokenContract, readToken, address]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
  }, [refresh]);

  return { balance, refreshBalance: refresh };
}

// ═══════════════════════════════════════
//             useSeats
// ═══════════════════════════════════════

export function useSeats(seatsContract, readSeats, address) {
  const [seats, setSeats] = useState([]);
  const [mySeats, setMySeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [graduation, setGraduation] = useState(null);
  const [yieldPool, setYieldPool] = useState(0n);

  const refreshSeats = useCallback(async () => {
    const c = seatsContract || readSeats;
    if (!c) return;
    // Fetch each piece independently — if one errors (e.g. graduationStart
    // reverts on some providers), it must not wipe out the others.
    const [seatsRes, gradRes, poolRes] = await Promise.allSettled([
      getAllSeatsBasic(c),
      getGraduationInfo(c),
      c.yieldPoolETH(),
    ]);
    if (seatsRes.status === "fulfilled") {
      setSeats(seatsRes.value);
      if (address) {
        const mine = seatsRes.value.filter(
          s => s.active && s.owner.toLowerCase() === address.toLowerCase()
        ).map(s => s.id);
        setMySeats(mine);
      } else {
        setMySeats([]);
      }
    } else {
      console.warn("getAllSeatsBasic failed:", seatsRes.reason?.message);
    }
    if (gradRes.status === "fulfilled") setGraduation(gradRes.value);
    if (poolRes.status === "fulfilled") setYieldPool(poolRes.value);
    setLoading(false);
  }, [seatsContract, readSeats, address]);

  useEffect(() => { refreshSeats(); }, [refreshSeats]);
  useEffect(() => {
    const iv = setInterval(refreshSeats, 30000);
    return () => clearInterval(iv);
  }, [refreshSeats]);

  return { seats, mySeats, loading, graduation, yieldPool, refreshSeats };
}

// ═══════════════════════════════════════
//          useUserProfile
// ═══════════════════════════════════════

export function useUserProfile(seatsContract, readSeats, address) {
  const [profile, setProfile] = useState(null);

  const refresh = useCallback(async () => {
    const c = seatsContract || readSeats;
    if (!c || !address) return;
    try {
      const p = await getUserProfileFn(c, address);
      setProfile(p);
    } catch {}
  }, [seatsContract, readSeats, address]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const iv = setInterval(refresh, 30000);
    return () => clearInterval(iv);
  }, [refresh]);

  return { profile, refreshProfile: refresh };
}

// ═══════════════════════════════════════
//              useFlip (V8)
// ═══════════════════════════════════════

export function useFlip(coinflipContract, readCoinflip, address) {
  const [isFlipping, setIsFlipping] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastFlipDetails, setLastFlipDetails] = useState(null);
  const [challenges, setChallenges] = useState([]);

  const refreshChallenges = useCallback(async () => {
    const c = coinflipContract || readCoinflip;
    if (!c) return;
    try {
      const open = await getAllOpenChallenges(c);
      setChallenges(open);
    } catch {}
  }, [coinflipContract, readCoinflip]);

  const doFlipDirect = useCallback(async (tierWei, referral = 0) => {
    if (!coinflipContract) return null;
    setIsFlipping(true);
    setLastResult(null);
    setLastFlipDetails(null);
    const pendingId = addToast("pending", "Flipping coin...");
    try {
      const receipt = await flipDirectFn(coinflipContract, referral, tierWei);
      removeToast(pendingId);
      const result = parseFlipResolved(receipt, coinflipContract);
      if (result) {
        const won = result.winner.toLowerCase() === address?.toLowerCase();
        setLastResult(won ? "win" : "lose");
        setLastFlipDetails({ ...result, txHash: receipt.hash, won });
        // V8 BF3: win/loss toast is emitted by `onFlipDone` after the coin
        // animation settles. We only parse the result here and hand it back.
      }
      return result;
    } catch (err) {
      removeToast(pendingId);
      addToast("error", decodeError(err));
      return null;
    } finally {
      setIsFlipping(false);
    }
  }, [coinflipContract, address]);

  const doCreateChallenge = useCallback(async (tierWei, referral = 0) => {
    if (!coinflipContract) return null;
    setIsFlipping(true);
    const pendingId = addToast("pending", "Creating challenge...");
    try {
      const receipt = await createChallengeFn(coinflipContract, referral, tierWei);
      removeToast(pendingId);
      addToast("success", "Challenge created!", receipt.hash);
      refreshChallenges();
      return { type: "created", receipt };
    } catch (err) {
      removeToast(pendingId);
      addToast("error", decodeError(err));
      return null;
    } finally {
      setIsFlipping(false);
    }
  }, [coinflipContract, refreshChallenges]);

  const doAcceptChallenge = useCallback(async (challengeId, betAmountWei, referral = 0) => {
    if (!coinflipContract) return null;
    setIsFlipping(true);
    setLastResult(null);
    setLastFlipDetails(null);
    const pendingId = addToast("pending", "Accepting challenge...");
    try {
      const receipt = await acceptChallengeFn(coinflipContract, challengeId, referral, betAmountWei);
      removeToast(pendingId);
      const result = parseFlipResolved(receipt, coinflipContract);
      if (result) {
        const won = result.winner.toLowerCase() === address?.toLowerCase();
        setLastResult(won ? "win" : "lose");
        setLastFlipDetails({ ...result, txHash: receipt.hash, won });
        // V8 BF3: single-source win/loss toast in `onFlipDone` (App.jsx).
      }
      refreshChallenges();
      return result;
    } catch (err) {
      removeToast(pendingId);
      addToast("error", decodeError(err));
      return null;
    } finally {
      setIsFlipping(false);
    }
  }, [coinflipContract, address, refreshChallenges]);

  const doCancelChallenge = useCallback(async (challengeId) => {
    if (!coinflipContract) return;
    const pendingId = addToast("pending", "Cancelling...");
    try {
      const receipt = await cancelChallengeFn(coinflipContract, challengeId);
      removeToast(pendingId);
      addToast("success", "Challenge cancelled", receipt.hash);
      refreshChallenges();
    } catch (err) {
      removeToast(pendingId);
      addToast("error", decodeError(err));
    }
  }, [coinflipContract, refreshChallenges]);

  return {
    isFlipping, lastResult, setLastResult, lastFlipDetails, setLastFlipDetails,
    challenges, refreshChallenges,
    flipDirect: doFlipDirect, createChallenge: doCreateChallenge,
    acceptChallenge: doAcceptChallenge, cancelChallenge: doCancelChallenge,
  };
}

// ═══════════════════════════════════════
//            useProtocol
// ═══════════════════════════════════════

export function useProtocol(coinflipContract, readCoinflip) {
  const [stats, setStats] = useState(null);
  const [playerInfo, setPlayerInfo] = useState(null);

  const refreshStats = useCallback(async () => {
    const c = coinflipContract || readCoinflip;
    if (!c) return;
    try {
      const s = await getProtocolStatsFn(c);
      setStats(s);
    } catch {}
  }, [coinflipContract, readCoinflip]);

  return { stats, refreshStats, playerInfo, setPlayerInfo };
}

// ═══════════════════════════════════════
//       GLOBAL FLIP FEED (on-chain)
// ═══════════════════════════════════════

export function useGlobalFeed(coinflipContract, readCoinflip) {
  const [recentFlips, setRecentFlips] = useState([]);
  const [liveFlip, setLiveFlip] = useState(null);
  const seenIdsRef = useRef(new Set());
  const historyLoadedRef = useRef(false);

  // History ALWAYS uses the read-only contract so it doesn't wait for
  // Privy/sign-in, and failures on the signer-backed contract can't
  // block the initial fetch.
  const historyContract = readCoinflip || _readCoinflip;
  // Live listening prefers the signer's contract (tight latency) but
  // falls back to read-only so pageloads without a wallet still tick.
  const liveContract = coinflipContract || readCoinflip || _readCoinflip;
  useEffect(() => {
    if (!historyContract || !historyContract.runner?.provider) return;
    if (!liveContract || !liveContract.runner?.provider) return;

    let cancelled = false;
    // Walk backwards in 10-block windows (Alchemy free-tier cap) but
    // STREAM events into the UI as soon as each pass returns anything.
    // Retries on failure — any pass that fully errors doesn't mark the
    // history as loaded, and the next render (or a fresh tick) will
    // try again.
    const loadHistory = async () => {
      if (historyLoadedRef.current) return;
      const provider = historyContract.runner.provider;
      let head;
      try { head = await provider.getBlockNumber(); }
      catch (e) { console.warn("[feed] head fetch failed:", e.message); return; }

      const WANT = 30;
      // ~2s block time on Base Sepolia: 100k blocks ≈ 55h of history.
      // Needed so flips from yesterday's testing still populate the feed.
      const MAX_LOOKBACK = 100000;
      const PARALLEL = 3; // gentler on the free-tier CU budget
      const CHUNK = 10;
      const collected = new Map(); // id -> event
      let gotAny = false;
      let consecFail = 0;

      for (let end = head; !cancelled && end > 0 && collected.size < WANT && (head - end) < MAX_LOOKBACK; ) {
        const batch = [];
        for (let i = 0; i < PARALLEL && end > 0; i++) {
          const from = Math.max(0, end - (CHUNK - 1));
          batch.push(
            historyContract.queryFilter("FlipResolved", from, end)
              .then(r => ({ ok: true, r }))
              .catch(err => ({ ok: false, err }))
          );
          end -= CHUNK;
        }
        const results = await Promise.all(batch);
        if (cancelled) return;
        const passOk = results.some(r => r.ok);
        consecFail = passOk ? 0 : (consecFail + 1);
        for (const { r } of results) {
          if (!r) continue;
          for (const ev of r) {
            const id = Number(ev.args[0]);
            if (!collected.has(id)) collected.set(id, ev);
          }
        }
        // Stream partial results so the UI lights up during the scan
        // rather than only at the end.
        if (collected.size > 0 && passOk) {
          gotAny = true;
          const partial = [...collected.values()]
            .sort((a, b) => (b.blockNumber - a.blockNumber) || (b.transactionIndex - a.transactionIndex))
            .slice(0, 30)
            .map(e => {
              const id = Number(e.args[0]);
              seenIdsRef.current.add(id);
              return {
                id,
                winner: e.args[1],
                loser: e.args[2],
                payout: formatEther(e.args[3]),
                amount: formatEther(e.args[4]),
                txHash: e.transactionHash,
                block: e.blockNumber,
              };
            });
          setRecentFlips(partial);
        }
        if (consecFail >= 10) break;
        if (collected.size < WANT) await new Promise(r => setTimeout(r, 200));
      }
      // Only mark history loaded if we actually got something. If every
      // pass failed, a subsequent render can retry.
      if (gotAny) historyLoadedRef.current = true;
    };

    loadHistory();

    const onFlip = (...args) => {
      try {
        const id = Number(args[0]);
        if (seenIdsRef.current.has(id)) return;
        seenIdsRef.current.add(id);
        if (seenIdsRef.current.size > 100) {
          seenIdsRef.current = new Set([...seenIdsRef.current].slice(-50));
        }
        const event = args[args.length - 1];
        const flip = {
          id,
          winner: args[1],
          loser: args[2],
          payout: formatEther(args[3]),
          amount: formatEther(args[4]),
          txHash: event?.log?.transactionHash || "",
          block: event?.log?.blockNumber || 0,
          isNew: true,
        };
        setLiveFlip(flip);
        setRecentFlips(prev => [flip, ...prev.filter(f => f.id !== id)].slice(0, 30));
        setTimeout(() => setLiveFlip(null), 4000);
      } catch {}
    };

    liveContract.on("FlipResolved", onFlip);
    return () => {
      cancelled = true;
      liveContract.off("FlipResolved", onFlip);
    };
  }, [historyContract, liveContract]);

  return { recentFlips, liveFlip };
}

export { EXPLORER };
