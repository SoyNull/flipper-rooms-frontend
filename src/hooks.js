import { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  getContract,
  getProtocolStats as getProtocolStatsFn,
  getAllSeats as getAllSeatsFn,
  getOpenChallenges,
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

    async function setup() {
      try {
        setIsEmbedded(wallet.walletClientType === "privy");

        try { await wallet.switchChain(84532); }
        catch (e) { /* may already be on correct chain */ }

        const rawProvider = await wallet.getEthereumProvider();
        const ethProvider = new BrowserProvider(rawProvider);
        const sgnr = await ethProvider.getSigner();
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
        console.error("Wallet setup failed:", err);
        addToast("error", decodeError(err));
      }
    }
    setup();
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
      const allChallenges = [];
      for (const t of TIERS) {
        const ids = await getOpenChallenges(contract, t.wei);
        for (const id of ids) {
          const info = await getChallengeInfo(contract, id);
          if (info.status === 0) {
            allChallenges.push({ id: Number(id), ...info, tierLabel: t.label });
          }
        }
      }
      setChallenges(allChallenges);
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
        amount: formatEther(e.args.amount),
        payout: formatEther(e.args.payout),
        vsTreasury: e.args.vsTreasury,
        winnerStreak: Number(e.args.winnerStreak),
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

  const acceptCh = useCallback(async (challengeId, referral = 0) => {
    if (!contract) return null;
    setIsFlipping(true);
    setLastResult(null);
    setLastFlipDetails(null);
    const pendingId = addToast("pending", "Accepting challenge...");
    try {
      const receipt = await acceptChallengeFn(contract, challengeId, referral);
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
  const [loading, setLoading] = useState(false);

  const refreshSeats = useCallback(async () => {
    if (!contract) return;
    setLoading(true);
    try {
      const all = await getAllSeatsFn(contract);
      setSeats(all);
      if (address) {
        const mine = all.filter(s => s.owner.toLowerCase() === address.toLowerCase() && s.active);
        setMySeats(mine.map(s => s.id));
      }
    } catch (err) {
      console.warn("Seats fetch failed:", err.message);
    }
    setLoading(false);
  }, [contract, address]);

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

export { addToast, EXPLORER };
