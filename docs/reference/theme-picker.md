# Proposal: Persistent Theme Picker for Poker Table Components

## 1. Objective
Enable users to customize the poker table's visual experience by changing the **felt color** and **card colors**. These choices must persist across sessions.

## 2. Technical Decisions

### Persistence Layer: MMKV
We are currently using `expo-secure-store` for auth tokens. For UI preferences like themes, **MMKV** is highly recommended due to its synchronous nature and superior performance. I propose adding `react-native-mmkv` for this purpose.

### State Management
We will extend `usePreferencesStore` in `src/stores/preferences.store.ts` using Zustand's `persist` middleware.

### Theme Injection
Since we use **NativeWind 4**, we leverage CSS variables defined in `tailwind.config.cjs`. We will inject these variables dynamically at the component root using the `style` prop with the `vars()` utility from NativeWind.

---

## 3. Implementation Plan

### Phase 1: Storage & Store Update
1. **Install MMKV**: `npx expo install react-native-mmkv`.
2. **Update `PreferencesStore`**:
   - Add `feltColor` (default: `hsl(158 30% 14%)`)
   - Add `cardColor` (default: `hsl(0 50% 98%)`)
   - Implement Zustand persistence using a wrapper for MMKV.

### Phase 2: Theme Injection in `TableLayout`
Update `TableLayout.tsx` to read from `usePreferencesStore` and apply the colors:

```tsx
import { vars } from "nativewind";
// ...
const { feltColor, cardColor } = usePreferencesStore();

return (
  <View 
    style={vars({ 
      "--c-felt": feltColor,
      "--c-card-face": cardColor 
    })}
    className="flex-1 ui-surface-card ..."
  >
    {/* ... */}
  </View>
);
```

### Phase 3: UI Components
1. **`ThemePickerSheet.tsx`**:
   - Use `ModalSheet` base component.
   - Provide a grid of presets for both Felt and Cards.
   - Live-preview changes as the user selects (Zustand makes this easy).
2. **`TableTopBar` Integration**:
   - Add a "Palette" icon (e.g., `🎨`) to the top bar.
   - Trigger the `ThemePickerSheet`.

---

## 4. Proposed Color Presets

### Felt Presets
- **Classic Green**: `hsl(158 30% 14%)`
- **Midnight Blue**: `hsl(217 30% 14%)`
- **Royal Burgundy**: `hsl(0 30% 14%)`
- **Charcoal**: `hsl(0 0% 10%)`

### Card Presets
- **Clean White**: `hsl(0 0% 98%)`
- **Vintage Cream**: `hsl(42 20% 90%)`
- **Four-Color Deck**: (Logic for this can be handled by a separate preference)

## 5. Next Steps
1. Confirm if you'd like to proceed with **MMKV** or stick to `AsyncStorage/SecureStore`.
2. Review the color preset list.
3. I will then provide the code changes for the store and the new components.
