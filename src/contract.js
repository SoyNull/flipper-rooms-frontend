import { Contract, formatEther, formatUnits } from "ethers";
import { flipperSeatsAbi } from "./abis/flipperSeatsAbi.js";
import { flipperCoinflipAbi } from "./abis/flipperCoinflipAbi.js";
import { mockFlipperAbi } from "./abis/mockFlipperAbi.js";
import { SEATS_ADDRESS, COINFLIP_ADDRESS, MOCK_FLIPPER_ADDRESS, EXPLORER } from "./config.js";

// ═══════════════════════════════════════
//          CONTRACT FACTORIES
// ═══════════════════════════════════════

export function getSeatsContract(signerOrProvider) {
  return new Contract(SEATS_ADDRESS, flipperSeatsAbi, signerOrProvider);
}

export function getCoinflipContract(signerOrProvider) {
  return new Contract(COINFLIP_ADDRESS, flipperCoinflipAbi, signerOrProvider);
}

export function getTokenContract(signerOrProvider) {
  return new Contract(MOCK_FLIPPER_ADDRESS, mockFlipperAbi, signerOrProvider);
}

// ═══════════════════════════════════════
//          HELPER
// ═══════════════════════════════════════

async function sendTx(txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  return receipt;
}

export function fmtTokens(wei) {
  const n = parseFloat(formatUnits(wei, 18));
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

// ═══════════════════════════════════════
//        SEATS — READ
// ═══════════════════════════════════════

export async function getAllSeatsBasic(seatsContract) {
  const data = await seatsContract.getAllSeatsBasic();
  // ABI field name is `_deposits` (with underscore) — positional access is
  // safest across ABI regenerations: [owners, prices, _deposits, names].
  const ownersArr   = data[0] || data.owners   || [];
  const pricesArr   = data[1] || data.prices   || [];
  const depositsArr = data[2] || data._deposits || data.deposits || [];
  const namesArr    = data[3] || data.names    || [];
  const ZERO = "0x0000000000000000000000000000000000000000";
  const seats = [];
  for (let i = 0; i < 256; i++) {
    const owner = ownersArr[i] || ZERO;
    const isOwned = owner !== ZERO;
    const priceRaw = pricesArr[i] ?? 0n;
    const depositRaw = depositsArr[i] ?? 0n;
    const priceNum = parseFloat(formatUnits(priceRaw, 18));
    const depositNum = parseFloat(formatUnits(depositRaw, 18));
    const weeklyTax = priceNum * 0.05;
    const dailyTax = weeklyTax / 7;
    const daysLeft = isOwned && dailyTax > 0 ? Math.floor(depositNum / dailyTax) : 999;
    seats.push({
      id: i + 1,
      owner: isOwned ? owner : ZERO,
      price: priceRaw,
      priceNum,
      deposit: depositRaw,
      depositNum,
      name: namesArr[i] || "",
      active: isOwned,
      daysLeft,
    });
  }
  return seats;
}

export async function getSeatInfo(seatsContract, seatId) {
  const r = await seatsContract.getSeatInfo(seatId);
  return {
    owner: r[0],
    price: r[1],
    deposit: r[2],
    pendingTax: r[3],
    pendingRewards: r[4],
    totalEarned: r[5],
    depositRunway: Number(r[6]),
    forfeitable: r[7],
    name: r[8],
  };
}

export async function getUserProfile(seatsContract, address) {
  const [r, cdRes] = await Promise.all([
    seatsContract.getUserProfile(address),
    seatsContract.getCooldownForUser(address).catch(() => null),
  ]);
  return {
    xp: Number(r[0]),
    level: Number(r[1]),
    totalFlips: Number(r[2]),
    wins: Number(r[3]),
    seatsOwned: Number(r[4]),
    totalEarned: r[5],
    yieldMultiplier: Number(r[6]),
    priceCooldownSec: cdRes != null ? Number(cdRes) : null,
  };
}

export async function getGraduationInfo(seatsContract) {
  const [graduated, totalMinted, graduationStart, activeCount] = await Promise.all([
    seatsContract.graduated(),
    seatsContract.totalMinted(),
    seatsContract.graduationStart(),
    seatsContract.activeSeatsCount(),
  ]);
  return {
    graduated,
    totalMinted: Number(totalMinted),
    graduationStart: Number(graduationStart),
    activeCount: Number(activeCount),
  };
}

// ═══════════════════════════════════════
//        COINFLIP — READ
// ═══════════════════════════════════════

export async function getProtocolStats(coinflipContract) {
  const r = await coinflipContract.getProtocolStats();
  return {
    totalFlips: Number(r[0]),
    totalVolume: formatEther(r[1]),
    jackpotPool: formatEther(r[2]),
    treasuryBalance: formatEther(r[3]),
    protocolBalance: formatEther(r[4]),
    lastJackpotWinner: r[5],
    lastJackpotAmount: formatEther(r[6]),
  };
}

export async function getPlayerInfo(coinflipContract, address) {
  const r = await coinflipContract.getPlayerInfo(address);
  return {
    balance: formatEther(r[0]),
    wins: Number(r[1]),
    losses: Number(r[2]),
    streak: Number(r[3]),
    bestStreak: Number(r[4]),
    wagered: formatEther(r[5]),
    won: formatEther(r[6]),
    referralSeat: Number(r[7]),
  };
}

export async function getAllOpenChallenges(coinflipContract) {
  const r = await coinflipContract.getAllOpenChallenges();
  const results = [];
  for (let i = 0; i < r.ids.length; i++) {
    results.push({
      id: Number(r.ids[i]),
      creator: r.creators[i],
      amount: formatEther(r.amounts[i]),
      amountWei: r.amounts[i],
      createdAt: Number(r.createdAts[i]),
    });
  }
  return results;
}

export async function getTreasuryMaxBet(coinflipContract) {
  const r = await coinflipContract.getTreasuryMaxBet();
  return formatEther(r);
}

// ═══════════════════════════════════════
//        SEATS — WRITE
// ═══════════════════════════════════════

// Approve FLIPPER for the Seats contract as a stand-alone step.
// Returns the receipt so callers can await before queueing mints.
export async function approveFlipperForSeats(tokenContract, amount) {
  return sendTx(tokenContract.approve(SEATS_ADDRESS, amount));
}

// Single mint: read the real mint price from-chain, approve
// (mintPrice + deposit + safety buffer), then mint. Sequential awaits.
export async function mintSeat(seatsContract, tokenContract, seatId, initialPrice, name, _ignoredMintPrice, deposit) {
  const onChainMintPrice = await seatsContract.calculateMintPrice();
  const needed = onChainMintPrice + deposit;
  await sendTx(tokenContract.approve(SEATS_ADDRESS, needed));
  return sendTx(seatsContract.mintSeat(seatId, initialPrice, name));
}

// Mint without approving (caller is responsible for a prior blanket approve).
// Used by the bulk flow: one approve for the grand total, then N mints.
export async function mintSeatNoApprove(seatsContract, seatId, initialPrice, name) {
  return sendTx(seatsContract.mintSeat(seatId, initialPrice, name));
}

// ABI: buyOutSeat(seatId, newPrice, additionalDeposit) — 3 args.
// Approve = newPrice (paid to previous owner) + additionalDeposit.
export async function buyOutSeat(seatsContract, tokenContract, seatId, newPrice, additionalDeposit) {
  const totalApproval = newPrice + additionalDeposit;
  await sendTx(tokenContract.approve(SEATS_ADDRESS, totalApproval));
  return sendTx(seatsContract.buyOutSeat(seatId, newPrice, additionalDeposit));
}

// Batch buyout (max 64 per TX). Caller pre-computes total FLIPPER approval.
export async function takeOverMultiple(seatsContract, tokenContract, seatIds, newPrices, additionalDeposits, totalApproval) {
  await sendTx(tokenContract.approve(SEATS_ADDRESS, totalApproval));
  return sendTx(seatsContract.takeOverMultiple(seatIds, newPrices, additionalDeposits));
}

export async function addDeposit(seatsContract, tokenContract, seatId, amount) {
  await sendTx(tokenContract.approve(SEATS_ADDRESS, amount));
  return sendTx(seatsContract.addDeposit(seatId, amount));
}

export async function updateSeatPrice(seatsContract, seatId, newPrice) {
  return sendTx(seatsContract.updateSeatPrice(seatId, newPrice));
}

export async function abandonSeat(seatsContract, seatId) {
  return sendTx(seatsContract.abandonSeat(seatId));
}

export async function claimRewards(seatsContract, seatId) {
  return sendTx(seatsContract.claimRewards(seatId));
}

export async function claimMultipleRewards(seatsContract, seatIds) {
  return sendTx(seatsContract.claimMultipleRewards(seatIds));
}

export async function withdrawDeposit(seatsContract, seatId, amount) {
  return sendTx(seatsContract.withdrawDeposit(seatId, amount));
}

export async function distributeYield(seatsContract) {
  return sendTx(seatsContract.distributeYield());
}

// ═══════════════════════════════════════
//        COINFLIP — WRITE
// ═══════════════════════════════════════

export async function flipDirect(coinflipContract, referralSeat, value) {
  return sendTx(coinflipContract.flipDirect(referralSeat, { value }));
}

export async function createChallenge(coinflipContract, referralSeat, value) {
  return sendTx(coinflipContract.createChallengeDirect(referralSeat, { value }));
}

export async function acceptChallenge(coinflipContract, challengeId, referralSeat, value) {
  return sendTx(coinflipContract.acceptChallengeDirect(challengeId, referralSeat, { value }));
}

export async function cancelChallenge(coinflipContract, challengeId) {
  return sendTx(coinflipContract.cancelChallengeDirect(challengeId));
}

export async function deposit(coinflipContract, value) {
  return sendTx(coinflipContract.deposit({ value }));
}

export async function withdraw(coinflipContract, amount) {
  return sendTx(coinflipContract.withdraw(amount));
}

// Token
export async function claimMockFlipper(tokenContract) {
  return sendTx(tokenContract.claim());
}

// ═══════════════════════════════════════
//           EVENT PARSING
// ═══════════════════════════════════════

export function parseFlipResolved(receipt, coinflipContract) {
  const iface = coinflipContract.interface;
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
          payout: formatEther(parsed.args.payout),
          amount: formatEther(parsed.args.betAmount),
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

export function decodeError(err) {
  // Detect wallet-level rejections FIRST — these have a stable ethers
  // code/shortMessage that beats any text matching.
  if (err?.code === "ACTION_REJECTED"
    || err?.code === 4001
    || err?.info?.error?.code === 4001) return "Wallet rejected the transaction";

  const msg = err?.reason || err?.shortMessage || err?.message || "Transaction failed";
  const lc = msg.toLowerCase();
  if (lc.includes("user rejected")
    || lc.includes("user denied")
    || lc.includes("action_rejected")
    || lc.includes("rejected by user")) return "Wallet rejected the transaction";

  const errorMap = {
    InsufficientBalance: "Not enough balance. Deposit more ETH first.",
    InvalidTier: "This bet amount is not available.",
    ChallengeNotOpen: "This challenge is no longer available.",
    CannotPlaySelf: "You can't play against yourself.",
    SeatNotActive: "This seat is not active.",
    NotSeatOwner: "You don't own this seat.",
    PriceBelowMinimum: "Price is below minimum.",
    InvalidSeatId: "Invalid seat ID.",
    NothingToClaim: "No rewards to claim yet.",
    TreasuryBetTooHigh: "Treasury can't cover this bet.",
    NoTreasuryAvailable: "Treasury is empty. Try PvP instead.",
    CooldownActive: "Wait for cooldown to expire.",
    NotChallengeCreator: "Not your challenge to cancel.",
    NameTooLong: "Seat name must be 32 characters or less.",
    "Token not set": "Token not configured yet.",
    "Already graduated": "Minting phase is over.",
    "Not graduated yet": "Buyouts unlock after all 256 seats are minted.",
    "Seat taken": "This seat is already taken.",
    "ERC20: insufficient allowance": "Token approval failed. Try again.",
  };
  for (const [key, val] of Object.entries(errorMap)) {
    if (msg.includes(key)) return val;
  }
  if (lc.includes("insufficient funds")) return "Not enough ETH in wallet for gas.";
  return msg.length > 120 ? msg.slice(0, 120) + "..." : msg;
}

export { EXPLORER };
