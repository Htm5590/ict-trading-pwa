# ICT Trading Signals PWA

A Progressive Web App that provides real-time trading signals using the **ICT (Inner Circle Trader) methodology**.

## Features

- **Real-Time Prices**: Fetches live forex rates for 11 currency pairs including XAU/USD (Gold)
- **TradingView Charts**: Embedded interactive charts with multiple timeframes
- **ICT Analysis Engine**: Full implementation of ICT concepts:
  - Market Structure (HH, HL, LH, LL, BOS, ChoCH)
  - Order Blocks (Bullish/Bearish, with mitigation tracking)
  - Fair Value Gaps (FVG / Imbalance zones)
  - Liquidity Sweeps (Buy-side & Sell-side raids)
  - Optimal Trade Entry (OTE - Fibonacci 0.62-0.79 zone)
  - Displacement detection
  - Killzone / Session timing
- **Signal Generation**: Produces signals with:
  - Signal Name
  - Entry Point (exact price)
  - Take Profit (TP)
  - Stop Loss (SL)
  - Risk:Reward Ratio
  - Confluence Score (0-100)
- **PWA**: Installable on mobile, works offline, push notifications

## Supported Pairs

| Pair | Type |
|------|------|
| EUR/USD | Major |
| GBP/USD | Major |
| USD/JPY | Major |
| USD/CHF | Major |
| AUD/USD | Major |
| USD/CAD | Major |
| NZD/USD | Major |
| EUR/GBP | Cross |
| EUR/JPY | Cross |
| GBP/JPY | Cross |
| XAU/USD | Commodity |

## ICT Methodology

This app strictly follows the ICT trading concepts:

1. **Market Structure**: Identifies Higher Highs/Lows (bullish) or Lower Highs/Lows (bearish), Break of Structure (BOS), and Change of Character (ChoCH)
2. **Order Blocks**: Detects the last opposing candle before a displacement move
3. **Fair Value Gaps**: Identifies imbalance zones (3-candle pattern) that price tends to revisit
4. **Liquidity Sweeps**: Detects stop hunts above/below swing points
5. **OTE**: Uses Fibonacci retracement (0.62-0.79) for optimal entries
6. **Confluence**: Scores signals based on multiple aligning ICT factors

## Setup

1. Clone this repo
2. Serve with any static server or open `index.html`
3. For PWA features, deploy to GitHub Pages:
   - Go to Settings → Pages → Source: main branch
   - Your app will be at `https://yourusername.github.io/ict-trading-pwa/`

## Deploy to GitHub Pages

```bash
# The app is ready to deploy as-is
# Just enable GitHub Pages in your repo settings
```

## Disclaimer

⚠️ This app is for **educational purposes only**. Trading forex involves significant risk of loss. Always do your own analysis and never risk more than you can afford to lose. Past performance does not guarantee future results.
