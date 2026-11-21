# ZXZ PARENT MONITOR — Full Stack V1

A consent-based family device management starter containing a Node.js web dashboard/backend, SQLite schema, Telegram bot starter, and Android Studio Kotlin project.

## Included
- Responsive dark/electric-blue web dashboard.
- Express API, JWT authentication, password hashing, rate limiting, Helmet, Socket.IO signaling channel.
- SQLite schema and automatic initialization.
- One-time 4-digit pairing code plus device credential.
- Explicitly selected Android photo/video upload and server-side media management.
- Camera consent state, revoke endpoint, visible-session request flow.
- Telegram bot starter (read-only commands; secure account linking must be configured before account-specific access).
- Android Kotlin project: pairing, Android document picker media upload, explicit camera consent explanation, visible notification service primitive.

## Requirements
- Node.js 20+
- Android Studio (JDK 17; Android SDK 35) to build the Android app.
- HTTPS domain for production. Camera/WebRTC requires secure origin and TURN for many networks.

## Run backend/web
1. Copy `.env.example` to `.env`.
2. Set a long random `JWT_SECRET`, `PUBLIC_URL`, and optional bot/ICE settings.
3. `npm install`
4. `npm start`
5. Open `https://your-domain/`. The first user can register from the Register tab.

SQLite file and uploads are created automatically. Back up `database/` and `storage/uploads/`.

## Deploy on Node.js hosting panel
- Upload project contents (excluding node_modules).
- Set startup command `npm start`.
- Set Node version 20 or newer.
- Add environment variables from `.env.example` in panel settings.
- Ensure persistent writable storage for `database/` and `storage/uploads/`.
- Configure reverse proxy HTTPS and WebSocket upgrade support for Socket.IO.
- Run `npm install` then restart the application.

## Android project
Open `android-app/` in Android Studio, allow Gradle sync, then Build > Build Bundle(s) / APK(s) > Build APK(s).
In the app, enter backend URL, create a pairing code in Web Dashboard > Device Manager, then enter the code in the app. Select photos/videos with the Android system picker to share them.

## Important implementation boundary
This V1 does NOT include a working WebRTC camera capture/encoder implementation or a compiled APK binary. The web camera page/API provide authenticated consent checks and session signaling hooks only. The Android app records a local consent choice and includes a visible foreground-notification primitive, but does not open/capture the camera or transmit live video. Do not represent camera streaming as operational until a reviewed WebRTC Android implementation, device-side consent synchronization, stop/revoke handling, and end-to-end tests are completed.

Telegram bot currently has basic commands only. Do not expose private per-user data until verified Telegram account linking is implemented.

## Security checklist before public launch
- Use HTTPS only; set `PUBLIC_URL` to exact origin.
- Generate a unique JWT secret and keep `.env` private.
- Restrict upload sizes and configure backups/quota.
- Add verified Telegram account linking.
- Add device heartbeat and expiration/cleanup jobs.
- Implement device-side consent sync and WebRTC transport with TURN.
- Review authorization, CSRF/origin policy, file scanning, retention, and audit logging.
