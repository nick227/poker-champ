# Odds Calculations Process Analysis

This document traces the flow of poker odds calculations from the server-side engine to the client-side UI and provides suggestions for architectural and mathematical improvements.

## 1. Trace of Values

The odds calculation process is an "on-demand" system triggered whenever the game state changes and a snapshot is prepared for the players.

### A. Data Source & Trigger
- **Source**: `SnapshotService.ts` in the server engine initiates the process.
- **Trigger**: Every time `emitToAll` or `emitToUser` is called (after any player action or state transition).
- **Orchestrator**: `HandCalculationsCoordinator.ts` manages the calculation lifecycle.

### B. Input Data (Server Side)
The service collects the following for the `HandCalculationsCoordinator`:
- **Board**: Current community cards.
- **Hole Cards**: The server provides **all** players' cards (from its internal `holeCardsByPlayerId` map).
- **Pot Information**: Total pot and the specific "amount to call" for each player (derived from `actionOptions`).

### C. Calculation Logic
1.  **State Hashing**: Before calculating, `HandCalculationsCoordinator` generates a SHA1 hash of the input. If the state hasn't meaningfully changed, it returns cached results to save CPU.
2.  **Equity (Winning Probability)**:
    - Uses `poker-odds-calculator` library via `OddsService.ts`.
    - It performs a **True Equity** calculation: Hero's actual cards vs. Villains' actual cards.
    - If only the Hero is in the hand, equity is 100%.
3.  **Outs (Improvement Cards)**:
    - Uses `pokersolver` library via `OutsService.ts`.
    - **Restriction**: Currently only calculates for **Heads-Up** (2 players) on the **Flop** or **Turn**.
    - **Logic**: Counts cards in the deck that result in the Hero winning or tying at showdown.
4.  **Pot Odds**:
    - Formula: `(Call Amount) / (Total Pot + Call Amount)`.
    - Expressed as a percentage (e.g., calling $10 into a $40 pot is $10/$50 = 20%).

### D. Transmission & Display
- **Payload**: The results are injected into the standard `TableSnapshotPayload` under `hero.calculations`.
- **UI Mapping**: `TableLayout.tsx` (Client) -> `HeroZone.tsx` -> `CalculationsStrip.tsx`.
- **Visual Feedback**:
    - **Equity**: Green if > 50%, Red if < 30%.
    - **Pot Odds**: Green if Pot Odds < Equity (statistically profitable call), Red if Pot Odds > Equity + 20% (highly unprofitable).

---

## 2. Discussion of Current Process

### Strengths
- **Efficiency**: Use of SHA1 hashing and LRU caching (in `OddsCoordinator`) prevents redundant expensive calculations.
- **Accuracy**: Calculating against actual opponent cards provides "perfect" equity data for testing.
- **Architectural Isolation**: The odds system is strictly read-only. It is attached to snapshots as metadata and does not influence the `Gameplay Core`.

### The "God Mode" Distortion
The current system calculates **True Equity** (Hero vs. specific Opponent cards). 
- **The Risk**: In live play, this acts as a "Solver Oracle." It turns a game of incomplete information into one of perfect information.
- **The Solution**: Transition to the "Split Equity" model outlined below.

---

## 3. System Design Philosophy

### The Three-Layer Rule
1. **Gameplay Core** (Authoritative): Rules, betting, pots, winners. Must never import the odds system.
2. **Advisory Layer** (Metadata): A read-only lens. Computes approximations. Returns optional annotations.
3. **UI Visualization** (Presentation): Renders metadata with visual cues for "Estimate" vs "Truth."

### The "Only One That Matters" Test
**"If the odds system were deleted tomorrow, would the game still run correctly?"**
- **Answer**: **Yes.** The engine generates snapshots regardless of whether the advisory services return data.

---

## 4. Strategic Roadmap

### A. The Equity Mode Split
To prevent gameplay distortion, the system should distinguish between two modes:
1. **LIVE_ADVISORY**: Hero equity vs. **Unknown Ranges** (or Random).
   - Use: Live hands while action is pending.
   - Logic: "How does my hand stack up against a typical opponent?"
2. **SHOWDOWN_ANALYSIS**: True Equity (Hero vs. Actual Cards).
   - Use: All players are all-in (cards revealed) or post-hand review.
   - Logic: "What was my actual math in that specific spot?"

### B. Logical Outs vs. Reality Outs
- **Live Play**: Count "Hand Improvement" outs (e.g., 9 outs for a flush draw). This mirrors human poker strategy.
- **Analysis**: Count "Showdown Winning" outs (cards that actually win against the specific villain).

### C. UI Semantics 
- Numbers should be labeled or prefixed with `≈` (e.g., `Equity: ≈42%`) to signal to the user that they are receiving an advisory estimate, not a hardware-locked truth.

### D. Computational Offloading
- While currently synchronous for simplicity, long-term stability requires moving math to a background task (Worker Thread) to ensure the `Gameplay Core` never waits for a complex pre-flop multi-way calculation.
