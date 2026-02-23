# v3.2.1 Stabilization Overlay

Addresses the major blockers reported by Codex:

- Build fixes: TypeScript decorator settings for Colyseus schema (TS1240)
- Dependency alignment: @colyseus/schema upgraded to 4.x for Colyseus 0.17
- Seat capacity: seat map initializes from PokerState.maxSeats (2–10)
- Continuous hands: auto-start next hand after HAND_END when 2+ seated players remain
- Tests: Vitest config includes all test files + added lifecycle tests
- Security: private table passwords use bcrypt (bcryptjs)

## After overlay
```bash
npm install
npm run build
npm run test:run
```
