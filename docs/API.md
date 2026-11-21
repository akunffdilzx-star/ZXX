# API reference
All routes under `/api`. Except registration/login, endpoints require `Authorization: Bearer <JWT>`.

- `POST /auth/register` `{username,password}` (password >=10)
- `POST /auth/login` `{username,password}`
- `GET /auth/me`
- `POST /auth/logout`
- `GET /overview`
- `GET /devices`
- `POST /devices/pair-code` `{device_name}` — creates one-time 4-digit code
- `POST /devices/pair` `{pairingCode,deviceName,deviceModel,androidVersion}` — returns device credential once
- `DELETE /devices/:id` — revoke device
- `GET /gallery`
- `POST /gallery/upload` multipart: `deviceId`, `deviceCredential`, `media`
- `GET /gallery/:id/download`
- `DELETE /gallery/:id`
- `GET /permissions/:id`
- `POST /permissions/:id/revoke`
- `POST /camera/start`
- `POST /camera/stop`
- `GET /camera/sessions`
- `GET /camera/status`
- `GET /activity`
- `GET /activity/:deviceId`
- `GET /settings`
- `GET /webrtc/config`

Socket.IO requires JWT in `auth.token`. Device client joins `device:<id>` only with valid device credential. Events: `camera:start-request`, `camera:stop`, `device:revoked`, `webrtc:signal`.
