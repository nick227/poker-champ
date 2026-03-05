# Jackpot Sound Effects Requirements

## Overview
Extended jackpot celebration for slot machine wins (3 of any kind) with studio-quality audio feedback.

## Sound Events Added

### 1. `slot.jackpot`
- **Trigger**: Immediate jackpot detection
- **Timing**: 100ms delay after visual start
- **Duration**: ~500ms impact sound
- **Asset**: `mixkit-slot-machine-win-alert-1931.wav`
- **Purpose**: Initial dramatic impact

### 2. `slot.jackpotFanfare`
- **Trigger**: During celebration sequence
- **Timing**: 600ms after jackpot start
- **Duration**: ~3000ms fanfare
- **Asset**: `mixkit-casino-win-notification-1986.wav`
- **Purpose**: Extended celebration music

## Visual-Audio Sync Timeline

```
0ms    - Visual celebration starts (overlay, flashing)
100ms   - slot.jackpot impact sound
300ms   - Peak visual intensity
600ms   - slot.jackpotFanfare begins
900ms   - Secondary visual pulse
1500ms  - Tertiary visual pulse
2400ms  - Celebration ends
```

## Audio Asset Specifications

### Impact Sound (`slot.jackpot`)
- **Type**: Orchestral hit/impact
- **Frequency**: Low-mid range emphasis
- **Duration**: 400-600ms
- **Volume**: High (0.9-1.0)
- **Cooldown**: 500ms

### Fanfare Sound (`slot.jackpotFanfare`)
- **Type**: Celebratory chimes/music
- **Frequency**: Bright, high-range
- **Duration**: 2500-3500ms
- **Volume**: Medium-high (0.7-0.8)
- **Cooldown**: 3000ms

## Implementation Notes

- Sounds use existing `emitSoundEvent()` system
- Cooldowns prevent audio overlap
- Max instances limited to 1 each
- Fallback to placeholder if assets missing
- Integrated with haptic feedback system

## Asset Locations
```
assets/sounds/mixkit-slot-machine-win-alert-1931.wav
assets/sounds/mixkit-casino-win-notification-1986.wav
```

## Future Enhancements
- Consider additional sound variations for different jackpot tiers
- Potential for ambient background music during celebration
- Volume scaling based on win amount
