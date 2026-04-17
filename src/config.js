// Flip N Flop — on-chain config. Base mainnet.

export const SEATS_ADDRESS = "0x975d9CA950515e441B111ED1CE4c339736a8F1d3";
export const COINFLIP_ADDRESS = "0xC8f1ddb8EEe9B24E9dAF9ee07B16fd691AB1e6Ca";
// $FNF token — populate this with the real address once the token is
// launched on Flaunch and `setFlipperToken` has been called on Seats.
// Until then leave as "" so the UI gracefully gates:
//   - token-dependent buttons (approve / mint with FNF) disable
//   - Dexscreener price feed returns null → USD conversions show "—"
//   - balance card shows "—" instead of a stale $0
export const FNF_TOKEN_ADDRESS = "";

export const CHAIN_ID = 8453;
export const CHAIN_ID_HEX = "0x2105";
export const RPC_URL = "https://base-mainnet.g.alchemy.com/v2/alcht_fDA5dcNFaa5XDrG6gMz32UMHzIQPum";
// Public RPC used ONLY for `eth_getLogs` history scans. Alchemy's free
// tier caps log queries at 10 blocks per call, so a 100k-block lookback
// would need 10k requests and time out. mainnet.base.org accepts much
// wider ranges and is fine for read-only event scans.
export const HISTORY_RPC_URL = "https://mainnet.base.org";
export const CHAIN_NAME = "Base";
export const EXPLORER = "https://basescan.org";

// Off-chain profiles API (name/avatar/twitter per wallet).
// HTTPS via nginx on api.aitrencher.xyz → localhost:3010 so the Vercel
// (HTTPS) build isn't blocked by mixed-content when POSTing saves.
export const PROFILES_API = "https://api.aitrencher.xyz/flipper-profiles";

// External links
export const FLAUNCH_URL = "https://flaunch.gg"; // placeholder for $FNF token page
export const TWITTER_URL = "https://x.com/BasedJaider";
export const WEBSITE_URL = "https://www.flipnflop.fun";

export const TIERS = [
  { label: "0.001", wei: "1000000000000000" },
  { label: "0.005", wei: "5000000000000000" },
  { label: "0.01",  wei: "10000000000000000" },
  { label: "0.05",  wei: "50000000000000000" },
  { label: "0.1",   wei: "100000000000000000" },
];

export const TOTAL_SEATS = 256;
export const TAX_RATE_BPS = 500;
export const BPS_DENOMINATOR = 10000;
export const HOURS_PER_WEEK = 168;
// V8: minimum deposit expressed in hours of tax runway.
export const MIN_DEPOSIT_HOURS = 1;

// Deposit duration options (label → hours)
export const DEPOSIT_DURATIONS = [
  { label: "1h",  hours: 1 },
  { label: "1d",  hours: 24 },
  { label: "7d",  hours: 168 },
  { label: "1m",  hours: 720 },
];

// Level thresholds
export const LEVEL_NAMES = [
  "Rookie",   // 0
  "Player",   // 1
  "Pro",      // 2
  "Elite",    // 3
  "Legend",   // 4
  "Whale",    // 5+
];

export const LEVEL_COLORS = {
  0: "#6b7280",
  1: "#3b82f6",
  2: "#14b8a6",
  3: "#a855f7",
  4: "#f59e0b",
  5: "#f97316",
};

// Admin gate
export const ADMIN_PASSWORD = "flipper_admin_2026";
