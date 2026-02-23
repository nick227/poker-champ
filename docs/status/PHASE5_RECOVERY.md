# Phase 5 Implementation - Recovery & Reconciliation ✅

## Overview
Phase 5 addresses the "Abandoned Balance" problem. In a distributed poker system, players might disconnect, or tables might crash, leaving "Buy-In" funds locked in a `PlayerBalance` record instead of the central `User.bankrollCents`. 

This implementation provides a robust recovery mechanism to automatically reconcile these funds.

## Key Components

### 1. Recovery Service (`src/engine/recovery/RecoveryService.ts`)
- **`reconcileAbandonedBalances(thresholdMs)`**: 
  - Scans for `ACTIVE` balances that haven't been touched (updated) for a specific duration (default 2 hours).
  - Uses `CashierService` to perform a formal `CASHOUT` transaction, moving the table balance back to the user's main wallet.
  - Updates the balance status to `ABANDONED` once recovered.
- **Idempotency**: Leverages the existing `CashierService` idempotency to ensure funds are never credited twice.

### 2. Periodic Task (`src/index.ts`)
- Added a background `setInterval` that runs every 60 minutes.
- Performs a safety sweep of the entire database to catch any edge-case abandoned funds.

### 3. Admin Control (`src/engine/auth/AdminRouter.ts`)
- **`POST /api/admin/economy/recovery`**:
  - Allows admins to manually trigger a reconciliation sweep.
  - Accepts a `thresholdHours` query parameter (e.g., `?thresholdHours=1`).
  - Returns statistics on successful and failed recoveries.

## Status Lifecycle
- **`ACTIVE`**: Player is currently at a table or the table is still "live".
- **`CASHED_OUT`**: Normal exit (player left table).
- **`ABANDONED`**: Player disconnected or table closed without cashing out; funds have been recovered by the system.

## Verification
- [x] Manual trigger endpoint implemented.
- [x] Background job implemented.
- [x] Integration with `CashierService` for atomic transactions.
