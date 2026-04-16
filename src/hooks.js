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
  if (type !== "pending") {
    setTimeout(() => {
      toastSetState(prev => prev.filter(t => t.id !== id));
    }, 6000);
  }
  return id;
}

function removeToast(id) {
  if (!toastSetState) return;
  toastSetState(prev => prev.filter(t => t.id !== id));
}

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
  const { login, logout, authenticated, ready } = usePrivy();
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
        addToast(won ? "success" : "error",
          won ? `Won ${result.payout} ETH!` : `Lost ${result.amount} ETH`,
          receipt.hash
        );
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
        addToast(won ? "success" : "error",
          won ? `Won ${result.payout} ETH!` : `Lost ${result.amount} ETH`,
          receipt.hash
        );
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

  const feedContract = coinflipContract || readCoinflip;
  useEffect(() => {
    if (!feedContract || !feedContract.runner?.provider) return;

    // Load recent flip history in 10-block windows (Alchemy free-tier
    // eth_getLogs cap). Walk backwards from head until we've collected
    // ~30 events or scanned far enough.
    const loadHistory = async () => {
      if (historyLoadedRef.current) return;
      historyLoadedRef.current = true;
      const events = [];
      try {
        const head = await feedContract.runner.provider.getBlockNumber();
        const WANT = 30;
        const MAX_LOOKBACK = 10000; // ~5h on Base Sepolia 2s/block
        for (let end = head; end > 0 && events.length < WANT && (head - end) < MAX_LOOKBACK; end -= 10) {
          const from = Math.max(0, end - 9);
          try {
            const chunk = await feedContract.queryFilter("FlipResolved", from, end);
            for (const ev of chunk) events.push(ev);
          } catch { /* skip windows that 429 or revert */ }
          if (from === 0) break;
        }
      } catch (e) { console.warn("Global feed load failed:", e); }
      const sorted = events
        .sort((a, b) => (b.blockNumber - a.blockNumber) || (b.transactionIndex - a.transactionIndex))
        .slice(0, 30);
      const flips = sorted.map(e => {
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
      if (flips.length > 0) setRecentFlips(flips);
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

    feedContract.on("FlipResolved", onFlip);
    return () => { feedContract.off("FlipResolved", onFlip); };
  }, [feedContract]);

  return { recentFlips, liveFlip };
}

export { EXPLORER };
