# mute -> self (script)

- setMuted(true)
- disable local track(s) (track.enabled=false)
- broadcast optional presence event in future (not in v0.1)

Branch notes:
- Muted does not disconnect WebRTC
- Muted should persist across reconnects (future)
