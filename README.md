# Poker Champ 🃏

A real-time multiplayer Texas Hold'em poker platform built with Node.js, Colyseus, and Expo.

## 🏗 Project Structure

This is a monorepo containing the following components:

- **`/` (Root)**: The backend server.
  - **`src/rooms`**: Colyseus room logic (`PokerRoom`) for managing real-time game state and client sessions.
  - **`src/engine`**: The core Poker Engine including the `Dealer`, betting rules, side-pot management, and hand evaluation.
  - **`src/state`**: Colyseus Schema definitions for synchronization between server and client.
  - **`src/http`**: Express-based REST API for lobby management and user authentication.
  - **`src/tests`**: Comprehensive test suites for game rules and network protocols.
- **`apps/client`**: The frontend application built with **Expo** (supporting iOS, Android, and Web).
  - Uses `NativeWind` for styling and `Zustand` for local state management.
- **`packages/realtime-contract`**: Shared Zod schemas and TypeScript types defining the communication protocol between client and server.
- **`packages/sdk`**: Client SDK generated from the server's OpenAPI specifications.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- pnpm (9.x) or npm
- WAMP/Wamp64 (if running locally on Windows)

### Installation

```bash
pnpm install
```

### Running the Project

**1. Start the Server:**
The server handles real-time rooms and the HTTP API.
```bash
npm run dev
```

**2. Start the Web Client:**
```bash
npm run dev:web
```

## 🛠 Tech Stack

- **Backend**: [Colyseus](https://colyseus.io/) (Real-time sockets), Express, [Prisma](https://www.prisma.io/) (ORM), TypeScript.
- **Frontend**: [Expo](https://expo.dev/) / React Native, [NativeWind](https://www.nativewind.dev/), Zustand.
- **Database**: PostgreSQL (via Prisma).
- **Testing**: Vitest.

## 🎰 Key Game Features

- **Persistent Seats**: Players can leave and rejoin a table within a grace period (60s default) without losing their seat or stack.
- **Automated Bots**: Support for adding and removing AI participants that follow advanced game-state rules.
- **Economy & Cashier**: Atomic buy-in and cash-out flows with balance reconciliation.
- **Hand History**: Every action and payout is recorded to a persistent log for later review and auditing.
- **Robust State Machine**: Automatic street transitions (Flop, Turn, River) and automated actions for disconnected players to prevent game stalls.

## Docs

- Card face pack workflow: [Adding Card Face Packs](docs/guides/ADDING_CARD_FACE_PACKS.md)

## Commands

- `npm run dev`: Start server in dev mode.
- `npm run dev:web`: Start the client web application.
- `npm run server:typecheck`: Run TypeScript compiler check on server source.
- `npm run test:server:core`: Run core server integration tests.
- `npm run lint`: Run ESLint across the project.
- `npm run verify`: Run all checks (SDK, Tests, Typecheck, Lint) before pushing.

