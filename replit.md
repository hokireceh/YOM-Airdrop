# YOM Airdrop Telegram Bot

## Overview
A Telegram bot for automating YOM airdrop tasks including daily check-ins, task completion, and points tracking.

## Project Structure
- `bot.js` - Main Telegram bot with menu system and command handlers
- `yom-api.js` - YOM API integration with support for cookie and private key auth
- `index.js` - Simple web server to display README (info page)

## Features
- Daily check-in automation
- Auto complete tasks
- Points/XP tracking
- Two authentication methods:
  - Private Key (wallet signature) - recommended for home servers
  - Session Cookie - manual from browser

## Workflows
1. **Telegram Bot** - Main bot process (`node bot.js`)
2. **Web Server** - Info page on port 5000 (`node index.js`)

## Environment Variables / Secrets
- `TELEGRAM_BOT_TOKEN` - Required. Get from @BotFather on Telegram
- `WALLET_PRIVATE_KEY` - Optional. Wallet private key for auto-login (0x...)
- `YOM_SESSION_COOKIE` - Optional. Session cookie from browser

## API Endpoints Used
- `/api/auth/session` - Session info
- `/api/users` - User profile
- `/api/loyalty/rules` - Available tasks/quests
- `/api/loyalty/rules/status` - Task completion status
- `/api/loyalty/accounts` - Points balance

## Key IDs (YOM)
- websiteId: `9c659eaa-a6ec-427e-a3a8-ed2cd222c8d8`
- organizationId: `9cbc4bcb-081d-4499-8b5f-77261171a383`
- loyaltyCurrencyId: `ea516475-1719-401a-80a7-8fa397960271`

## Dependencies
- node-telegram-bot-api
- axios
- cloudscraper (Cloudflare bypass)
- ethers (wallet signing)
- node-cron (scheduled tasks)
- dotenv

## Auto Mode Schedule
- Daily check-in: 00:05 UTC
- Task completion: Every 6 hours
