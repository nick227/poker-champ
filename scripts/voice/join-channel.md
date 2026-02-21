# join -> channel (script)

- validate voice feature enabled in client config
- request mic permission
- create local track
- set muted = false (or persisted user pref)
- set peers from table snapshot (humans only)
- for each peer:
  - if initiator (selfId < peerId)
    - create offer -> send signal
  - else
    - wait for offer
- handle incoming signals:
  - offer -> setRemote -> createAnswer -> send
  - answer -> setRemote
  - ice -> addIceCandidate
