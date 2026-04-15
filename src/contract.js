import { BrowserProvider, Contract, parseEther, formatEther, parseUnits } from "ethers";
import ABI from "./abi.json";
import { CONTRACT_ADDRESS, CHAIN_ID, CHAIN_ID_HEX, RPC_URL, CHAIN_NAME, EXPLORER } from "./config.js";

// ═══════════════════════════════════════
//          WALLET CONNECTION
// ═══════════════════════════════════════

export async function connectWallet() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN_ID) {
    await switchToBaseSepolia();
  }
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
}

export async function switchToBaseSepolia() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CHAIN_ID_HEX,
          chainName: CHAIN_NAME,
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: [EXPLORER],
        }],
      });
    } else {
      throw e;
    }
  }
}

export function getContract(signer) {
  return new Contract(CONTRACT_ADDRESS, ABI, signer);
}

// ═══════════════════════════════════════
//          READ FUNCTIONS
// ═══════════════════════════════════════

export async function getSessionBalance(contract, address) {
  const bal = await contract.sessionBalance(address);
  return formatEther(bal);
}

export async function getPlayerInfo(contract, address) {
  const r = await contract.getPlayerInfo(address);
  return {
    balance: formatEther(r.balance_),
    wins: Number(r.wins_),
    losses: Number(r.losses_),
    streak: Number(r.currentStreak_),
    bestStreak: Number(r.bestStreak_),
    wagered: formatEther(r.totalWagered_),
    won: formatEther(r.totalWon_),
    referralSeat: Number(r.referredBySeat_),
  };
}

export async function getProtocolStats(contract) {
  const r = await contract.getProtocolStats();
  return {
    totalFlips: Number(r.totalFlips_),
    totalVolume: formatEther(r.totalVolume_),
    jackpot: formatEther(r.jackpotPool_),
    treasury: formatEther(r.treasuryBalance_),
    seatPool: formatEther(r.seatRewardPool_),
    protocol: formatEther(r.protocolBalance_),
    buyback: formatEther(r.buybackTreasury_),
    lastJackpotWinner: r.lastJackpotWinner_,
    lastJackpotAmount: formatEther(r.lastJackpotAmount_),
  };
}

export async function getSeatInfo(contract, seatId) {
  const [r, raw] = await Promise.all([
    contract.getSeatInfo(seatId),
    contract.seats(seatId),
  ]);
  return {
    owner: r.owner_,
    price: formatEther(r.listedPrice_),
    priceWei: r.listedPrice_,
    deposit: formatEther(r.deposit_),
    depositWei: r.deposit_,
    pendingTax: formatEther(r.pendingTax_),
    rewards: formatEther(r.pendingRewards_),
    earned: formatEther(r.totalEarned_),
    runway: Number(r.depositRunway_),
    forfeitable: r.isForfeitable_,
    name: r.name_,
    lastPriceChangeTime: Number(raw.lastPriceChangeTime),
  };
}

export async function getAllSeats(contract) {
  const ZERO = "0x0000000000000000000000000000000000000000";
  const results = [];
  // Batch in groups of 16 to avoid rate limits on public RPC
  for (let batch = 0; batch < 16; batch++) {
    const promises = [];
    for (let j = 0; j < 16; j++) {
      const i = batch * 16 + j + 1;
      promises.push(
        contract.seats(i).then(s => ({
          id: i,
          owner: s.owner,
          price: formatEther(s.listedPrice),
          priceWei: s.listedPrice,
          deposit: formatEther(s.deposit),
          name: s.name,
          active: s.owner !== ZERO,
        })).catch(() => ({
          id: i, owner: ZERO, price: "0.001", priceWei: 0n,
          deposit: "0", name: "", active: false,
        }))
      );
    }
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }
  return results;
}

export async function getOpenChallenges(contract, tierAmountWei) {
  return contract.getOpenChallenges(tierAmountWei);
}

export async function getChallengeInfo(contract, id) {
  const r = await contract.getChallengeInfo(id);
  return {
    creator: r.creator_,
    amount: formatEther(r.amount_),
    amountWei: r.amount_,
    tier: Number(r.tier_),
    status: Number(r.status_),
  };
}

export async function getOwnerSeats(contract, address) {
  return contract.getOwnerSeats(address);
}

export async function getTreasuryMaxBet(contract) {
  const r = await contract.getTreasuryMaxBet();
  return formatEther(r);
}

export async function getBetTiers(contract) {
  return contract.getBetTiers();
}

// ═══════════════════════════════════════
//         WRITE FUNCTIONS
// ═══════════════════════════════════════

async function sendTx(txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  return receipt;
}

export async function deposit(contract, amountEth) {
  return sendTx(contract.deposit({ value: parseEther(amountEth) }));
}

export async function withdraw(contract, amountEth) {
  return sendTx(contract.withdraw(parseEther(amountEth)));
}

export async function createChallenge(contract, tierAmountWei, referralSeatId = 0) {
  return sendTx(contract.createChallenge(tierAmountWei, referralSeatId));
}

export async function acceptChallenge(contract, challengeId, referralSeatId = 0) {
  return sendTx(contract.acceptChallenge(challengeId, referralSeatId));
}

export async function cancelChallenge(contract, challengeId) {
  return sendTx(contract.cancelChallenge(challengeId));
}

export async function flipVsTreasury(contract, tierAmountWei, referralSeatId = 0) {
  return sendTx(contract.flipVsTreasury(tierAmountWei, referralSeatId));
}

export async function buySeat(contract, seatId, newPriceWei, name, maxPriceWei, totalValue) {
  return sendTx(contract.buySeat(seatId, newPriceWei, name, maxPriceWei, { value: totalValue }));
}

export async function updateSeatPrice(contract, seatId, newPriceWei) {
  return sendTx(contract.updateSeatPrice(seatId, newPriceWei));
}

export async function addSeatDeposit(contract, seatId, amountWei) {
  return sendTx(contract.addSeatDeposit(seatId, { value: amountWei }));
}

export async function withdrawSeatDeposit(contract, seatId, amountWei) {
  return sendTx(contract.withdrawSeatDeposit(seatId, amountWei));
}

export async function abandonSeat(contract, seatId) {
  return sendTx(contract.abandonSeat(seatId));
}

export async function claimSeatRewards(contract, seatId) {
  return sendTx(contract.claimSeatRewards(seatId));
}

export async function distributeRewards(contract) {
  return sendTx(contract.distributeRewards());
}

// ═══════════════════════════════════════
//           EVENT PARSING
// ═══════════════════════════════════════

export function parseFlipResolved(receipt, contract) {
  const iface = contract.interface;
  let flip = null;
  let jackpotAmount = null;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "FlipResolved") {
        flip = {
          challengeId: Number(parsed.args.challengeId),
          winner: parsed.args.winner,
          loser: parsed.args.loser,
          amount: formatEther(parsed.args.amount),
          payout: formatEther(parsed.args.payout),
          vsTreasury: parsed.args.vsTreasury,
          winnerStreak: Number(parsed.args.winnerStreak),
        };
      }
      if (parsed?.name === "JackpotWon") {
        jackpotAmount = formatEther(parsed.args.amount);
      }
    } catch {}
  }
  if (flip) flip.jackpotAmount = jackpotAmount;
  return flip;
}

export function parseSeatBought(receipt, contract) {
  const iface = contract.interface;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "SeatBought") {
        return {
          seatId: Number(parsed.args.seatId),
          newOwner: parsed.args.newOwner,
          prevOwner: parsed.args.prevOwner,
          price: formatEther(parsed.args.price),
          deposit: formatEther(parsed.args.deposit),
        };
      }
    } catch {}
  }
  return null;
}

export function decodeError(err) {
  const msg = err?.reason || err?.message || "Transaction failed";
  const errorMap = {
    InsufficientBalance: "Not enough balance. Deposit more ETH first.",
    InvalidTier: "This bet amount is not available.",
    ChallengeNotOpen: "This challenge is no longer available.",
    CannotPlaySelf: "You can't play against yourself.",
    SeatNotActive: "This seat is not active.",
    NotSeatOwner: "You don't own this seat.",
    PriceBelowMinimum: "Price must be at least 0.001 ETH.",
    InvalidSeatId: "Invalid seat ID.",
    NothingToClaim: "No rewards to claim yet.",
    TreasuryBetTooHigh: "Treasury can't cover this bet. Try a smaller tier.",
    NoTreasuryAvailable: "Treasury is empty. Try PvP instead.",
    DepositRequired: "Send more ETH than the seat price (excess = deposit).",
    PriceExceedsMax: "Price changed since you loaded. Refresh and retry.",
    CooldownActive: "Wait 1 hour after buying/repricing.",
    NotChallengeCreator: "Not your challenge to cancel.",
    NameTooLong: "Seat name must be 32 characters or less.",
    ReferralSeatInactive: "Referral seat has no owner.",
    AlreadyInitialized: "Seats already initialized.",
  };
  for (const [key, val] of Object.entries(errorMap)) {
    if (msg.includes(key)) return val;
  }
  if (msg.includes("user rejected") || msg.includes("User denied")) return "Transaction cancelled.";
  if (msg.includes("insufficient funds")) return "Not enough ETH in wallet for gas.";
  return msg.length > 100 ? msg.slice(0, 100) + "..." : msg;
}

export { EXPLORER };
