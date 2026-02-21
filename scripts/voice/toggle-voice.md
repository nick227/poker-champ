# toggle -> voice (script)

- if currently OFF:
  - join -> channel
- if currently ON:
  - leave -> channel

Branch notes:
- OFF -> ON requires mic permission; if denied, remain OFF and show UI error
- ON -> OFF always succeeds (cleanup is local)
