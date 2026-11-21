# Pairing protocol
1. Owner signs in to dashboard and opens Device Manager.
2. Owner creates a pairing code; code is single-use.
3. On Android, user enters backend URL and pairing code.
4. Android sends device metadata to authenticated pairing endpoint.
5. Backend returns a random long device credential exactly once; app stores it in private preferences.
6. Backend stores only a bcrypt hash of that credential.
7. If app data is lost, revoke old device from dashboard and create a new pairing code. Do not recover or reuse old credentials.
