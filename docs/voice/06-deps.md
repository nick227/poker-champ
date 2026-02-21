# Dependencies

v0.1 uses Web APIs:
- RTCPeerConnection
- navigator.mediaDevices.getUserMedia

If your client is React Native:
- swap `LocalAudioTrack` implementation to use `react-native-webrtc`
- keep class name + methods the same

Server deps:
- zod (already common in your repo; used in contract validation)

No additional server infrastructure required.
