// FlipperRooms V8 — Base Sepolia Config (redeploy 2026-04-16)

export const SEATS_ADDRESS = "0x1994710f4e46752D78150AEC1583bc189F145d01";
export const COINFLIP_ADDRESS = "0xD98bFbf90fF90B6C265f748AD9B385CA563BdE1d";
export const MOCK_FLIPPER_ADDRESS = "0x755F4DbEB39f1EfaFd1088cF2EB9F8939d8473BA";

export const CHAIN_ID = 84532;
export const CHAIN_ID_HEX = "0x14a34";
export const RPC_URL = "https://base-sepolia.g.alchemy.com/v2/alcht_fDA5dcNFaa5XDrG6gMz32UMHzIQPum";
export const CHAIN_NAME = "Base Sepolia";
export const EXPLORER = "https://sepolia.basescan.org";

// Off-chain profiles API (name/avatar/twitter per wallet).
export const PROFILES_API = "http://89.167.8.19:3010";

// External links
export const FLAUNCH_URL = "https://flaunch.gg"; // placeholder for $FLIPPER token page
export const TWITTER_URL = "https://x.com/BasedJaider";
export const WEBSITE_URL = "https://flipper-rooms-frontend.vercel.app";

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
