# Slot Machine POC – Commercial Visual Upgrade + Theme Engine Demo

Drop-in React Native / Expo slot POC with:
- modern “commercial” layout + high-DPI symbol sprites (256px)
- marquee lights, glass, glow, win cues (small + jackpot)
- bet selector (1/2, 1x, 2x)
- controlled bankroll in cents
- jackpot banner (777)
- theme picker (reskin demo)
- thin theme abstraction layer to evolve into a style engine

## Dependencies
- react-native-reanimated
- expo-linear-gradient
- expo-haptics (optional)

## Quick use
```tsx
import React from "react";
import { SlotDemoScreen } from "./src/app/SlotDemoScreen";

export default function App() {
  return <SlotDemoScreen />;
}
```

## Drop-in component
`src/ui/slots/SlotMachine.tsx`
