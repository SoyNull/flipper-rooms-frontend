const { ethers } = require("ethers");

const CONTRACT = "0x94499d67809Ff838211e01C1D9420bDE6389D97e";
const RPC = "https://sepolia.base.org";
const USER = "0xE5678F8659d229a303ABecdD0D0113Cf1F4F83aE";

const ABI = [
  "function getSeatInfo(uint256) view returns (address owner, uint128 price, uint128 deposit, uint128 pendingRewards, uint128 totalEarned, string name, uint64 lastTaxCollected, uint64 lastPriceUpdate)",
  "function activeSeatCount() view returns (uint256)",
  "function getOwnerSeats(address) view returns (uint256[])",
  "function seatRewardPool() view returns (uint256)",
  "function protocolBalance() view returns (uint256)",
  "function buybackTreasury() view returns (uint256)",
  "function jackpotPool() view returns (uint256)",
  "function treasuryBalance() view returns (uint256)",
  "function totalFlips() view returns (uint256)",
  "function totalVolume() view returns (uint256)"
];

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const c = new ethers.Contract(CONTRACT, ABI, provider);
  
  console.log("\n=== CONTRACT STATE ===");
  console.log("Total flips:", (await c.totalFlips()).toString());
  console.log("Total volume:", ethers.formatEther(await c.totalVolume()), "ETH");
  console.log("Active seats:", (await c.activeSeatCount()).toString());
  console.log("\n=== POOLS ===");
  console.log("Seat reward pool:", ethers.formatEther(await c.seatRewardPool()), "ETH");
  console.log("Protocol balance:", ethers.formatEther(await c.protocolBalance()), "ETH");
  console.log("Buyback treasury:", ethers.formatEther(await c.buybackTreasury()), "ETH");
  console.log("Jackpot pool:", ethers.formatEther(await c.jackpotPool()), "ETH");
  console.log("Treasury balance:", ethers.formatEther(await c.treasuryBalance()), "ETH");
  
  console.log("\n=== YOUR SEATS ===");
  const seats = await c.getOwnerSeats(USER);
  console.log("Total owned:", seats.length);
  
  for (const seatId of seats) {
    const info = await c.getSeatInfo(seatId);
    const price = parseFloat(ethers.formatEther(info.price));
    const deposit = parseFloat(ethers.formatEther(info.deposit));
    const dailyTax = (price * 0.05) / 7;
    const daysLeft = dailyTax > 0 ? Math.floor(deposit / dailyTax) : 999;
    
    console.log(`\nSeat #${seatId}:`);
    console.log(`  Name: ${info.name || "(unnamed)"}`);
    console.log(`  Price: ${price.toFixed(4)} ETH`);
    console.log(`  Deposit: ${deposit.toFixed(6)} ETH`);
    console.log(`  Pending rewards: ${ethers.formatEther(info.pendingRewards)} ETH`);
    console.log(`  Total earned: ${ethers.formatEther(info.totalEarned)} ETH`);
    console.log(`  Days until forfeit: ${daysLeft}`);
    console.log(`  Last tax: ${new Date(Number(info.lastTaxCollected) * 1000).toISOString()}`);
  }
})();
