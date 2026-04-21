# TrenchScope 🔭

**Solana trader intelligence powered by [Birdeye](https://birdeye.so) Data.**

![TrenchScope Dashboard — Trend Radar with token sorting and Token Scope detail panel](docs/screenshots/trenchscope-hero.png)

## Why TrenchScope Exists

Solana traders lose time switching between trend feeds, token pages, and wallet tools just to answer basic questions: what is moving, who is involved, and whether the setup is worth deeper attention.

TrenchScope brings **token discovery**, **token context**, **wallet inspection**, and **usage transparency** into one Birdeye-powered surface so triage happens faster with less tab-hopping.

## What TrenchScope Does

### Token Radar+

Surfaces trending Birdeye meme tokens with client-side search, sort by Change % / Volume / Market Cap, and quick one-click selection into Token Scope.

### Token Scope

Shows price context, liquidity, market cap, holder distribution, best-effort security status, and an embedded Birdeye chart for any token.

![Token Scope — overview, security, holders, and live Birdeye chart](docs/screenshots/trenchscope-token-scope.png)

### Wallet Scope

Shows Birdeye PnL summary (when available), total portfolio value, win rate, and sorted holdings for any Solana wallet.

![Wallet Scope — portfolio value, PnL cards, and sorted holdings with expand/collapse](docs/screenshots/trenchscope-wallet-scope.png)

### Watchlist

Keeps tracked tokens and wallets visible across sessions using localStorage. Supports per-item and batch refresh with sequential API pacing to respect rate limits.

![Watchlist — tracked tokens and wallets with refresh controls](docs/screenshots/trenchscope-watchlist.png)

### Usage Dashboard

Exposes Birdeye-backed request telemetry so usage progress toward the competition's 50+ API-call qualification floor is always visible.

## Birdeye Endpoints Used

| Endpoint | Purpose |
| --- | --- |
| `/defi/v3/token/meme/list` | Token Radar+ feed for trending token discovery |
| `/defi/token_overview` | Token overview: price, liquidity, market cap, volume, holders |
| `/defi/v3/token/holder` | Holder distribution and top-holder context |
| `/defi/token_security` | Best-effort token security context (graceful fallback when unavailable) |
| `/wallet/v2/pnl/summary` | Wallet PnL summary for trader performance inspection |
| `/wallet/v2/current-net-worth` | Wallet holdings and current net-worth context |

## Architecture

TrenchScope uses a **React frontend** and an **Express proxy** so Birdeye requests stay server-side. The frontend talks to local `/api/trenchscope/*` routes, the proxy handles retry/backoff and usage tracking, and the upstream data source is the Birdeye API.

```
Browser  →  React (Vite)  →  Express Proxy  →  Birdeye API
                                  ↓
                          Usage Tracking (file-based)
```

## Tech Stack

React · Vite · Express · Tailwind CSS · Birdeye API · localStorage

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set your Birdeye API key
#    Create a .env file in the project root:
echo "BIRDEYE_API_KEY=your_key_here" > .env

# 3. Start the full app
npm run dev
```

TrenchScope uses server-side Birdeye access only. No Birdeye secret is exposed to the browser.

## Build in Public

TrenchScope is being built for the **Birdeye Data Build in Public** competition and published in public as the product sharpens.

- Follow the build journey: [@advisor_aii](https://x.com/advisor_aii/)
- Competition context: [@birdeye_data](https://x.com/birdeye_data) · #BirdeyeAPI
- Sprint 1 listing: [Birdeye Data BIP Competition Sprint 1](https://superteam.fun/earn/listing/birdeye-data-4-week-bip-competition-sprint-1)

## License

MIT © driftmind-ai
