import { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { BrowserProvider, JsonRpcProvider, Contract, formatEther, formatUnits, parseEther, parseUnits } from "ethers";
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
  parseFlipResolved, decodeError, EXPLORER,
} from "./contract.js";
import { RPC_URL, HISTORY_RPC_URL, SEATS_ADDRESS, CHAIN_ID } from "./config.js";

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

// Dedicated provider/contract used ONLY for historical event scans.
// Points at the public Base RPC which accepts wide block ranges, so the
// global feed can populate on first paint instead of hammering Alchemy
// in 10-block windows.
const _historyProvider = new JsonRpcProvider(HISTORY_RPC_URL);
const _historyCoinflip = getCoinflipContract(_historyProvider);

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
        try { await wallet.switchChain(CHAIN_ID); } catch {}

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
    // Public-RPC-backed coinflip contract; accepts wide-range log queries
    // so host-side scans don't need 12 sequential 10-block windows.
    historyCoinflip: _historyCoinflip,
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
//           useEthUsdPrice
// ═══════════════════════════════════════
// Live ETH/USD price from the Chainlink aggregator on Base mainnet.
// Refreshes every 60s; falls back to the last known value on transient
// RPC errors so the UI never shows a stale-then-zero flicker. Consumers
// should handle `null` on first paint by displaying a "—" or skipping
// the USD line rather than rendering $0.
const ETH_USD_FEED = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70";
const FEED_ABI = [
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  "function decimals() view returns (uint8)",
];
const _feedContract = new Contract(ETH_USD_FEED, FEED_ABI, _readProvider);

export function useEthUsdPrice() {
  const [price, setPrice] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [, answer] = await _feedContract.latestRoundData();
      // Chainlink ETH/USD feeds on Base return 8 decimals.
      const usd = Number(answer) / 1e8;
      if (Number.isFinite(usd) && usd > 0) setPrice(usd);
    } catch {
      // Keep last known value; retry on next interval.
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const iv = setInterval(refresh, 60000);
    return () => clearInterval(iv);
  }, [refresh]);

  return price;
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

  // IDs that were just optimistically mutated and must NOT be clobbered
  // by a refresh that still sees them as empty (Alchemy lag). Each entry
  // is { id -> { expectedOwner, until } }; refresh merges on-chain data
  // for an optimistic id only if the chain agrees (or until expires).
  const optimisticRef = useRef(new Map());

  const mergeWithOptimistic = useCallback((fresh) => {
    const now = Date.now();
    const pending = optimisticRef.current;
    if (pending.size === 0) return fresh;
    // Drop expired entries first.
    for (const [id, meta] of pending) {
      if (meta.until < now) pending.delete(id);
    }
    if (pending.size === 0) return fresh;
    return fresh.map(s => {
      const meta = pending.get(s.id);
      if (!meta) return s;
      // If chain now reports the expected owner, the optimistic guess
      // has landed and we can drop the override.
      if ((s.owner || "").toLowerCase() === (meta.expectedOwner || "").toLowerCase()) {
        pending.delete(s.id);
        return s;
      }
      // Chain still stale → keep the optimistic seat (override the wipe).
      return meta.seat;
    });
  }, []);

  const refreshSeats = useCallback(async () => {
    const c = seatsContract || readSeats;
    if (!c) return;
    const [seatsRes, gradRes, poolRes] = await Promise.allSettled([
      getAllSeatsBasic(c),
      getGraduationInfo(c),
      c.yieldPoolETH(),
    ]);
    if (seatsRes.status === "fulfilled") {
      const merged = mergeWithOptimistic(seatsRes.value);
      setSeats(merged);
      if (address) {
        const mine = merged.filter(
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
  }, [seatsContract, readSeats, address, mergeWithOptimistic]);

  useEffect(() => { refreshSeats(); }, [refreshSeats]);
  useEffect(() => {
    const iv = setInterval(refreshSeats, 30000);
    return () => clearInterval(iv);
  }, [refreshSeats]);

  // Optimistic mutation. After a tx.wait() Alchemy often still serves
  // a stale block, so the immediate refresh wipes our paint. We keep
  // the optimistic entry alive for up to 60s, and any refresh in that
  // window merges it on top of whatever the chain returns — unless the
  // chain already agrees, in which case we drop the override.
  const applyLocalSeats = useCallback((updates) => {
    if (!Array.isArray(updates) || updates.length === 0) return;
    const expiry = Date.now() + 60_000;
    setSeats(prev => {
      const byId = new Map(prev.map(s => [s.id, s]));
      for (const u of updates) {
        const existing = byId.get(u.id) || { id: u.id };
        const merged = { ...existing, ...u };
        if (merged.owner && merged.owner !== "0x0000000000000000000000000000000000000000") {
          merged.active = true;
        }
        byId.set(u.id, merged);
        optimisticRef.current.set(u.id, {
          seat: merged,
          expectedOwner: u.owner || "",
          until: expiry,
        });
      }
      return [...byId.values()].sort((a, b) => a.id - b.id);
    });
    if (address) {
      setMySeats(prev => {
        const set = new Set(prev);
        for (const u of updates) {
          if ((u.owner || "").toLowerCase() === address.toLowerCase()) {
            set.add(u.id);
          }
        }
        return [...set];
      });
    }
  }, [address]);

  return { seats, mySeats, loading, graduation, yieldPool, refreshSeats, applyLocalSeats };
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

  // History ALWAYS uses the PUBLIC Base RPC (wide block ranges).
  // Alchemy's free tier caps eth_getLogs at 10 blocks per call, which
  // made a cold-start scan impossible in reasonable time.
  const historyContract = _historyCoinflip;
  // Live listening prefers the signer's contract (tight latency) but
  // falls back to read-only so pageloads without a wallet still tick.
  const liveContract = coinflipContract || readCoinflip || _readCoinflip;
  useEffect(() => {
    if (!historyContract || !historyContract.runner?.provider) return;
    if (!liveContract || !liveContract.runner?.provider) return;

    let cancelled = false;
    // mainnet.base.org accepts thousands of blocks per call, so we walk
    // in 10k-block chunks. First-paint is O(seconds), not O(minutes).
    const loadHistory = async () => {
      if (historyLoadedRef.current) return;
      const provider = historyContract.runner.provider;
      let head;
      try { head = await provider.getBlockNumber(); }
      catch (e) { console.warn("[feed] head fetch failed:", e.message); return; }

      const WANT = 30;
      // ~2s block time on Base → 500k blocks ≈ 11 days.
      const MAX_LOOKBACK = 500000;
      const CHUNK = 9500; // slightly under 10k to stay clear of any node caps
      const collected = new Map();
      let gotAny = false;

      for (let end = head; !cancelled && end > 0 && collected.size < WANT && (head - end) < MAX_LOOKBACK; ) {
        const from = Math.max(0, end - (CHUNK - 1));
        let events = [];
        try {
          events = await historyContract.queryFilter("FlipResolved", from, end);
        } catch (err) {
          console.warn(`[feed] range ${from}-${end} failed:`, err?.message);
          // Halve the window on failure and retry the same `end`.
          end -= Math.max(500, Math.floor(CHUNK / 4));
          continue;
        }
        if (cancelled) return;
        for (const ev of events) {
          const id = Number(ev.args[0]);
          if (!collected.has(id)) collected.set(id, ev);
        }
        if (collected.size > 0) {
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
        end = from - 1;
      }
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
