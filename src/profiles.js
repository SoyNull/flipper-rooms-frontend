// Shared cache of off-chain profile names so every address in the UI
// (feed, ticker, board, live notifications, top holders, etc.) renders
// the user's chosen display name instead of a raw shortened address.
//
// One module-level Map is the source of truth; `useProfilesCache` is a
// React hook that bumps a version counter whenever the cache refreshes
// so consumers re-render.

import { useEffect, useState } from "react";
import { PROFILES_API, COINFLIP_ADDRESS } from "./config.js";

// Addresses that should ALWAYS resolve to a fixed label, no matter what
// the off-chain profile server returns. Protects against Treasury
// flipping to someone's nickname because a row used the contract
// address directly.
const KNOWN = new Map([
  [COINFLIP_ADDRESS.toLowerCase(), { name: "Treasury", reserved: true }],
]);

export function isTreasuryAddr(addr) {
  return !!addr && addr.toLowerCase() === COINFLIP_ADDRESS.toLowerCase();
}

const cache = new Map(); // lowercased addr -> { name, twitter, avatar }
let version = 0;
const listeners = new Set();
let inFlight = null;
let lastFetchAt = 0;

function notify() {
  version += 1;
  for (const fn of listeners) fn(version);
}

export async function fetchAllProfiles(force = false) {
  const now = Date.now();
  if (!force && now - lastFetchAt < 15_000) return; // throttle
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await fetch(`${PROFILES_API}/api/profiles`);
      if (!res.ok) return;
      const data = await res.json();
      cache.clear();
      for (const [k, v] of Object.entries(data || {})) {
        if (!v) continue;
        cache.set(k.toLowerCase(), {
          name: v.name || "",
          twitter: v.twitter || "",
          avatar: v.avatar || "",
        });
      }
      lastFetchAt = Date.now();
      notify();
    } catch {
      // silent — next cycle retries
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// Merge a single profile into the cache after a POST /api/profiles so
// the caller's name flips everywhere without waiting for the next poll.
// Reserved addresses (Treasury, etc.) cannot be renamed from the UI.
export function primeProfile(addr, profile) {
  if (!addr || !profile) return;
  const key = addr.toLowerCase();
  if (KNOWN.get(key)?.reserved) return;
  cache.set(key, {
    name: profile.name || "",
    twitter: profile.twitter || "",
    avatar: profile.avatar || "",
  });
  notify();
}

const shortAddr = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "???");

// Returns the profile name if set, otherwise the shortened address.
// Reserved addresses (Treasury, etc.) always win over user-saved names.
export function displayName(addr) {
  if (!addr) return "???";
  const key = addr.toLowerCase();
  const known = KNOWN.get(key);
  if (known?.reserved) return known.name;
  const p = cache.get(key);
  if (p?.name) return p.name;
  return shortAddr(addr);
}

export function useProfilesCache() {
  const [, setV] = useState(version);
  useEffect(() => {
    listeners.add(setV);
    fetchAllProfiles();
    // Refresh every 30s so names saved by other users propagate.
    const iv = setInterval(() => fetchAllProfiles(), 30_000);
    return () => {
      listeners.delete(setV);
      clearInterval(iv);
    };
  }, []);
  return { displayName, refresh: () => fetchAllProfiles(true) };
}
