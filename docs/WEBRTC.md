# WebRTC status
The backend exposes authenticated Socket.IO signaling rooms and ICE configuration endpoint. The Android project in this release does not yet implement PeerConnection/media capture, and the browser player is intentionally a placeholder. Therefore no live video is transmitted in this release.

Production sequence required:
1. Device verifies active consent state from backend and Android CAMERA permission.
2. User explicitly starts an on-device visible camera foreground session.
3. Device creates WebRTC offer and sends offer/ICE through authenticated signaling.
4. Dashboard answers and exchanges ICE; configure TURN for NAT traversal.
5. STOP, device revoke, consent revoke, app background restrictions, or timeout must close tracks, PeerConnection, and foreground service.
6. Record audit events and enforce one authorized viewer/session per policy.
