// FlipperRooms V8 — Base Sepolia Config

export const SEATS_ADDRESS = "0xB0E088Db2101Ae4C881eE7FA9cF6987CcEee7207";
export const COINFLIP_ADDRESS = "0xe28364A32A1fBFA34DfdE892FE274f32b4b07faF";
export const MOCK_FLIPPER_ADDRESS = "0x8545780d8a64bCB640E51ad2AD7A43B1901bC533";

export const CHAIN_ID = 84532;
export const CHAIN_ID_HEX = "0x14a34";
export const RPC_URL = "https://base-sepolia.g.alchemy.com/v2/alcht_fDA5dcNFaa5XDrG6gMz32UMHzIQPum";
export const CHAIN_NAME = "Base Sepolia";
export const EXPLORER = "https://sepolia.basescan.org";

export const TIERS = [
  { label: "0.001", wei: "1000000000000000" },
  { label: "0.005", wei: "5000000000000000" },
  { label: "0.01",  wei: "10000000000000000" },
  { label: "0.05",  wei: "50000000000000000" },
  { label: "0.1",   wei: "100000000000000000" },
];

export const TOTAL_SEATS = 256;
export const TAX_RATE_BPS = 500;
export const MIN_DEPOSIT_WEEKS = 4;
export const BPS_DENOMINATOR = 10000;

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
  0: "#6b7280", // gray
  1: "#3b82f6", // blue
  2: "#14b8a6", // teal
  3: "#a855f7", // purple
  4: "#f59e0b", // amber
  5: "#f97316", // coral/orange
};
