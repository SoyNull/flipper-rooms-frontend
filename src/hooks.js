import { useState, useEffect, useCallback, useRef } from "react";
import {
  connectWallet as connectWalletFn,
  getContract,
  getSessionBalance,
  getPlayerInfo,
  getProtocolStats as getProtocolStatsFn,
  getAllSeats as getAllSeatsFn,
  getSeatInfo as getSeatInfoFn,
  getOpenChallenges,
  getChallengeInfo,
  getOwnerSeats as getOwnerSeatsFn,
  getTreasuryMaxBet as getTreasuryMaxBetFn,
  deposit as depositFn,
  withdraw as withdrawFn,
  createChallenge as createChallengeFn,
  acceptChallenge as acceptChallengeFn,
  cancelChallenge as cancelChallengeFn,
  flipVsTreasury as flipVsTreasuryFn,
  buySeat as buySeatFn,
  updateSeatPrice as updateSeatPriceFn,
  addSeatDeposit as addSeatDepositFn,
  abandonSeat as abandonSeatFn,
  claimSeatRewards as claimSeatRewardsFn,
  distributeRewards as distributeRewardsFn,
  parseFlipResolved,
  decodeError,
  EXPLORER,
} from "./contract.js";
import { TIERS, CONTRACT_ADDRESS } from "./config.js";
import { parseEther, formatEther } from "ethers";

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
//              useWallet
// ═══════════════════════════════════════

export function useWallet() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [sessionBalance, setSessionBalance] = useState("0");
  const [wrongNetwork, setWrongNetwork] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!contract || !address) return;
    try {
      const bal = await getSessionBalance(contract, address);
      setSessionBalance(bal);
    } catch {}
  }, [contract, address]);

  const connect = useCallback(async () => {
    try {
      const w = await connectWalletFn();
      setProvider(w.provider);
      setSigner(w.signer);
      setAddress(w.address);
      const c = getContract(w.signer);
      setContract(c);
      setConnected(true);
      setWrongNetwork(false);
      const bal = await getSessionBalance(c, w.address);
      setSessionBalance(bal);
    } catch (err) {
      if (err.message?.includes("chain")) {
        setWrongNetwork(true);
      }
      addToast("error", decodeError(err));
    }
  }, []);

  const disconnect = useCallback(() => {
    setConnected(false);
    setAddress(null);
    setProvider(null);
    setSigner(null);
    setContract(null);
    setSessionBalance("0");
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccounts = (accounts) => {
      if (accounts.length === 0) disconnect();
      else connect();
    };
    const handleChain = () => connect();
    window.ethereum.on("accountsChanged", handleAccounts);
    window.ethereum.on("chainChanged", handleChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccounts);
      window.ethereum.removeListener("chainChanged", handleChain);
    };
  }, [connect, disconnect]);

  return { connected, address, provider, signer, contract, sessionBalance, refreshBalance, connect, disconnect, wrongNetwork };
}

// ═══════════════════════════════════════
//              useFlip
// ═══════════════════════════════════════

export function useFlip(contract, address, refreshBalance) {
  const [isFlipping, setIsFlipping] = useState(false);
  const [lastResult, setLastResult] = useState(null);
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
    } catch {}
  }, [contract]);

  const refreshHistory = useCallback(async () => {
    if (!contract || !contract.runner?.provider) return;
    try {
      const provider = contract.runner.provider;
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 500);
      const filter = contract.filters.FlipResolved();
      const events = await contract.queryFilter(filter, fromBlock, currentBlock);
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
    } catch {}
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
    const pendingId = addToast("pending", "Flipping vs Treasury...");
    try {
      const receipt = await flipVsTreasuryFn(contract, tierWei, referral);
      removeToast(pendingId);
      const result = parseFlipResolved(receipt, contract);
      if (result) {
        const won = result.winner.toLowerCase() === address?.toLowerCase();
        setLastResult(won ? "win" : "lose");
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
    const pendingId = addToast("pending", "Accepting challenge...");
    try {
      const receipt = await acceptChallengeFn(contract, challengeId, referral);
      removeToast(pendingId);
      const result = parseFlipResolved(receipt, contract);
      if (result) {
        const won = result.winner.toLowerCase() === address?.toLowerCase();
        setLastResult(won ? "win" : "lose");
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
    isFlipping, lastResult, setLastResult, challenges, history,
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
    } catch {}
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
    } catch {}
  }, [contract]);

  return { stats, refreshStats };
}

export { addToast, EXPLORER };
