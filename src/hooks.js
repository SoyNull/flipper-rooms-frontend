import { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  getContract,
  getProtocolStats as getProtocolStatsFn,
  getAllSeats as getAllSeatsFn,
  getAllOpenChallenges,
  getChallengeInfo,
  createChallenge as createChallengeFn,
  acceptChallenge as acceptChallengeFn,
  cancelChallenge as cancelChallengeFn,
  flipVsTreasury as flipVsTreasuryFn,
  buySeat as buySeatFn,
  updateSeatPrice as updateSeatPriceFn,
  addSeatDeposit as addSeatDepositFn,
  abandonSeat as abandonSeatFn,
  claimSeatRewards as claimSeatRewardsFn,
  parseFlipResolved,
  decodeError,
  EXPLORER,
} from "./contract.js";
import { TIERS } from "./config.js";
import { parseEther, formatEther, BrowserProvider } from "ethers";

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

function addToast(type, message, txHash) {
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
//              useWallet (Privy)
// ═══════════════════════════════════════

export function useWallet() {
  const { login, logout, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [address, setAddress] = useState(null);
  const [sessionBalance, setSessionBalance] = useState("0");
  const [isEmbedded, setIsEmbedded] = useState(false);
  const setupRef = useRef(null); // track which wallet address we've set up

  // Auto-connect when Privy session exists (page load or login)
  useEffect(() => {
    if (!authenticated || !ready) return;
    if (wallets.length === 0) return;

    const wallet = wallets[0];
    // Skip if we already set up this exact wallet
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
          console.warn("Provider setup failed, trying fallback:", providerErr.message);
          if (window.ethereum) {
            ethProvider = new BrowserProvider(window.ethereum);
            sgnr = await ethProvider.getSigner();
          } else {
            throw providerErr;
          }
        }

        if (cancelled) return;
        const addr = await sgnr.getAddress();
        const ctr = getContract(sgnr);

        setupRef.current = wallet.address;
        setProvider(ethProvider);
        setSigner(sgnr);
        setContract(ctr);
        setAddress(addr);

        try {
          const rawBal = await ctr.sessionBalance(addr);
          setSessionBalance(formatEther(rawBal));
        } catch (e) {
          console.warn("getSessionBalance failed:", e.message);
        }
      } catch (err) {
        console.error("Wallet setup failed:", err.message);
      }
    }
    setup();
    return () => { cancelled = true; };
  }, [ready, authenticated, wallets]);

  // Reset on logout
  useEffect(() => {
    if (!authenticated) {
      setupRef.current = null;
      setContract(null);
      setAddress(null);
      setSigner(null);
      setProvider(null);
      setSessionBalance("0");
      setIsEmbedded(false);
    }
  }, [authenticated]);

  const refreshBalance = useCallback(async () => {
    if (!contract || !address) return;
    try {
      const rawBal = await contract.sessionBalance(address);
      setSessionBalance(formatEther(rawBal));
    } catch (e) { /* silent */ }
  }, [contract, address]);

  return {
    connected: authenticated && !!contract,
    authenticated,
    isEmbedded,
    address,
    provider,
    signer,
    contract,
    sessionBalance,
    refreshBalance,
    connect: login,
    disconnect: logout,
    ready,
  };
}

// ═══════════════════════════════════════
//              useFlip
// ═══════════════════════════════════════

export function useFlip(contract, address, refreshBalance) {
  const [isFlipping, setIsFlipping] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [lastFlipDetails, setLastFlipDetails] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [history, setHistory] = useState([]);

  const refreshChallenges = useCallback(async () => {
    if (!contract) return;
    try {
      const openChallenges = await getAllOpenChallenges(contract);
      setChallenges(openChallenges);
    } catch (err) {
      console.warn("Challenges fetch failed:", err.message);
    }
  }, [contract]);

  const refreshHistory = useCallback(async () => {
    if (!contract || !contract.runner?.provider) return;
    try {
      const provider = contract.runner.provider;
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 1000);
      const events = await contract.queryFilter("FlipResolved", fromBlock, currentBlock);
      const items = events.slice(-20).reverse().map(e => ({
        challengeId: Number(e.args.challengeId),
        winner: e.args.winner,
        loser: e.args.loser,
        amount: formatEther(e.args.betAmount),
        payout: formatEther(e.args.payout),
        block: e.blockNumber,
      }));
      setHistory(items);
    } catch (err) {
      console.warn("History fetch failed:", err.message);
    }
  }, [contract]);

  const flipPvp = useCallback(async (tierWei, referral = 0) => {
    if (!contract) return null;
    setIsFlipping(true);
    const pendingId = addToast("pending", "Creating challenge...");
    try {
      const receipt = await createChallengeFn(contract, tierWei, referral);
      removeToast(pendingId);
      addToast("success", "Challenge created!", receipt.hash);
      refreshBalance?.();
      refreshChallenges();
      return { type: "created", receipt };
    } catch (err) {
      removeToast(pendingId);
      addToast("error", decodeError(err));
      return null;
    } finally {
      setIsFlipping(false);
    }
  }, [contract, refreshBalance, refreshChallenges]);

  const flipTreasury = useCallback(async (tierWei, referral = 0) => {
    if (!contract) return null;
    setIsFlipping(true);
    setLastResult(null);
    setLastFlipDetails(null);
    const pendingId = addToast("pending", "Flipping vs Treasury...");
    try {
      const receipt = await flipVsTreasuryFn(contract, tierWei, referral);
      removeToast(pendingId);
      const result = parseFlipResolved(receipt, contract);
      if (result) {
        const won = result.winner.toLowerCase() === address?.toLowerCase();
        setLastResult(won ? "win" : "lose");
        setLastFlipDetails({ ...result, txHash: receipt.hash, won });
        addToast(won ? "success" : "error",
          won ? `Won ${result.payout} ETH!` : `Lost ${result.amount} ETH`,
          receipt.hash
        );
      }
      refreshBalance?.();
      refreshHistory();
      return result;
    } catch (err) {
      removeToast(pendingId);
      addToast("error", decodeError(err));
      return null;
    } finally {
      setIsFlipping(false);
    }
  }, [contract, address, refreshBalance, refreshHistory]);

  const acceptCh = useCallback(async (challengeId, betAmountWei, referral = 0) => {
    if (!contract) return null;
    setIsFlipping(true);
    setLastResult(null);
    setLastFlipDetails(null);
    const pendingId = addToast("pending", "Accepting challenge...");
    try {
      const receipt = await acceptChallengeFn(contract, challengeId, betAmountWei, referral);
      removeToast(pendingId);
      const result = parseFlipResolved(receipt, contract);
      if (result) {
        const won = result.winner.toLowerCase() === address?.toLowerCase();
        setLastResult(won ? "win" : "lose");
        setLastFlipDetails({ ...result, txHash: receipt.hash, won });
        addToast(won ? "success" : "error",
          won ? `Won ${result.payout} ETH!` : `Lost ${result.amount} ETH`,
          receipt.hash
        );
      }
      refreshBalance?.();
      refreshChallenges();
      refreshHistory();
      return result;
    } catch (err) {
      removeToast(pendingId);
      addToast("error", decodeError(err));
      return null;
    } finally {
      setIsFlipping(false);
    }
  }, [contract, address, refreshBalance, refreshChallenges, refreshHistory]);

  const cancelCh = useCallback(async (challengeId) => {
    if (!contract) return;
    const pendingId = addToast("pending", "Cancelling challenge...");
    try {
      const receipt = await cancelChallengeFn(contract, challengeId);
      removeToast(pendingId);
      addToast("success", "Challenge cancelled", receipt.hash);
      refreshBalance?.();
      refreshChallenges();
    } catch (err) {
      removeToast(pendingId);
      addToast("error", decodeError(err));
    }
  }, [contract, refreshBalance, refreshChallenges]);

  return {
    isFlipping, lastResult, setLastResult, lastFlipDetails, setLastFlipDetails,
    challenges, history,
    refreshChallenges, refreshHistory,
    flipPvp, flipTreasury, acceptCh, cancelCh,
  };
}

// ═══════════════════════════════════════
//              useSeats
// ═══════════════════════════════════════

export function useSeats(contract, address, refreshBalance) {
  const [seats, setSeats] = useState([]);
  const [mySeats, setMySeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const ZERO = "0x0000000000000000000000000000000000000000";

  const refreshSeats = useCallback(async () => {
    if (!contract) return;
    try {
      // V7: 1 call for all 256 seats instead of 256 individual calls
      const data = await contract.getAllSeatsBasic();
      const parsed = [];
      const mine = [];
      for (let i = 0; i < 256; i++) {
        const owner = data.owners[i];
        const isOwned = owner !== ZERO;
        const isMine = isOwned && address && owner.toLowerCase() === address.toLowerCase();
        const seat = {
          id: i + 1,
          owner: isOwned ? owner : ZERO,
          price: formatEther(data.prices[i]),
          priceWei: data.prices[i],
          deposit: formatEther(data.deposits[i]),
          name: data.names[i] || "",
          active: isOwned,
          mine: isMine,
        };
        parsed.push(seat);
        if (isMine) mine.push(i + 1);
      }
      setSeats(parsed);
      setMySeats(mine);
    } catch (err) {
      console.warn("Seats fetch failed:", err.message);
      // Fallback to individual calls
      try {
        const all = await getAllSeatsFn(contract);
        setSeats(all);
        if (address) {
          setMySeats(all.filter(s => s.owner?.toLowerCase() === address.toLowerCase() && s.active).map(s => s.id));
        }
      } catch {}
    }
    setLoading(false);
  }, [contract, address]);

  // Auto-load on mount
  useEffect(() => { refreshSeats(); }, [refreshSeats]);

  // Refresh every 30s
  useEffect(() => {
    if (!contract) return;
    const iv = setInterval(refreshSeats, 30000);
    return () => clearInterval(iv);
  }, [contract, refreshSeats]);

  const buySeatAction = useCallback(async (seatId, newPriceEth, name, currentPriceWei, depositEth) => {
    if (!contract) return;
    const pendingId = addToast("pending", `Buying seat #${seatId}...`);
    try {
      const newPriceWei = parseEther(newPriceEth);
      const depositWei = parseEther(depositEth);
      const totalValue = currentPriceWei + depositWei;
      const maxPriceWei = currentPriceWei + (currentPriceWei / 10n); // 10% slippage
      const receipt = await buySeatFn(contract, seatId, newPriceWei, name, maxPriceWei, totalValue);
      removeToast(pendingId);
      addToast("success", `Seat #${seatId} bought!`, receipt.hash);
      refreshBalance?.();
      refreshSeats();
    } catch (err) {
      removeToast(pendingId);
      addToast("error", decodeError(err));
    }
  }, [contract, refreshBalance, refreshSeats]);

  const updatePriceAction = useCallback(async (seatId, newPriceEth) => {
    if (!contract) return;
    const pendingId = addToast("pending", "Updating price...");
    try {
      const receipt = await updateSeatPriceFn(contract, seatId, parseEther(newPriceEth));
      removeToast(pendingId);
      addToast("success", "Price updated!", receipt.hash);
      refreshSeats();
    } catch (err) {
      removeToast(pendingId);
      addToast("error", decodeError(err));
    }
  }, [contract, refreshSeats]);

  const addDepositAction = useCallback(async (seatId, amountEth) => {
    if (!contract) return;
    const pendingId = addToast("pending", "Adding deposit...");
    try {
      const receipt = await addSeatDepositFn(contract, seatId, parseEther(amountEth));
      removeToast(pendingId);
      addToast("success", "Deposit added!", receipt.hash);
      refreshSeats();
    } catch (err) {
      removeToast(pendingId);
      addToast("error", decodeError(err));
    }
  }, [contract, refreshSeats]);

  const abandonAction = useCallback(async (seatId) => {
    if (!contract) return;
    const pendingId = addToast("pending", `Abandoning seat #${seatId}...`);
    try {
      const receipt = await abandonSeatFn(contract, seatId);
      removeToast(pendingId);
      addToast("success", `Seat #${seatId} abandoned`, receipt.hash);
      refreshBalance?.();
      refreshSeats();
    } catch (err) {
      removeToast(pendingId);
      addToast("error", decodeError(err));
    }
  }, [contract, refreshBalance, refreshSeats]);

  const claimAction = useCallback(async (seatId) => {
    if (!contract) return;
    const pendingId = addToast("pending", "Claiming rewards...");
    try {
      const receipt = await claimSeatRewardsFn(contract, seatId);
      removeToast(pendingId);
      addToast("success", "Rewards claimed!", receipt.hash);
      refreshBalance?.();
      refreshSeats();
    } catch (err) {
      removeToast(pendingId);
      addToast("error", decodeError(err));
    }
  }, [contract, refreshBalance, refreshSeats]);

  return {
    seats, mySeats, loading, refreshSeats,
    buySeat: buySeatAction, updatePrice: updatePriceAction,
    addDeposit: addDepositAction, abandon: abandonAction, claim: claimAction,
  };
}

// ═══════════════════════════════════════
//            useProtocol
// ═══════════════════════════════════════

export function useProtocol(contract) {
  const [stats, setStats] = useState(null);

  const refreshStats = useCallback(async () => {
    if (!contract) return;
    try {
      const s = await getProtocolStatsFn(contract);
      setStats(s);
    } catch (err) {
      console.warn("Protocol stats fetch failed:", err.message);
    }
  }, [contract]);

  return { stats, refreshStats };
}

// ═══════════════════════════════════════
//       GLOBAL FLIP FEED (on-chain)
// ═══════════════════════════════════════

export function useGlobalFeed(contract) {
  const [recentFlips, setRecentFlips] = useState([]);
  const [liveFlip, setLiveFlip] = useState(null);

  useEffect(() => {
    if (!contract || !contract.runner?.provider) return;

    const loadHistory = async () => {
      try {
        const block = await contract.runner.provider.getBlockNumber();
        const from = Math.max(0, block - 5000);
        const events = await contract.queryFilter("FlipResolved", from, block);
        const flips = events.slice(-30).reverse().map(e => ({
          id: Number(e.args[0]),
          winner: e.args[1],
          loser: e.args[2],
          payout: formatEther(e.args[3]),
          amount: formatEther(e.args[4]),
          txHash: e.transactionHash,
          block: e.blockNumber,
        }));
        setRecentFlips(flips);
      } catch (e) { console.warn("Global feed load failed:", e); }
    };

    loadHistory();

    const onFlip = (...args) => {
      try {
        const event = args[args.length - 1];
        const flip = {
          id: Number(args[0]),
          winner: args[1],
          loser: args[2],
          payout: formatEther(args[3]),
          amount: formatEther(args[4]),
          txHash: event?.log?.transactionHash || "",
          block: event?.log?.blockNumber || 0,
          isNew: true,
        };
        setLiveFlip(flip);
        setRecentFlips(prev => [flip, ...prev].slice(0, 30));
        setTimeout(() => setLiveFlip(null), 4000);
      } catch {}
    };

    contract.on("FlipResolved", onFlip);
    return () => { contract.off("FlipResolved", onFlip); };
  }, [contract]);

  return { recentFlips, liveFlip };
}

export { addToast, EXPLORER };
