// Telegram bot is started by the backend when BOT_TOKEN is configured.
// Keep all secrets in environment variables. Account linking is intentionally not
// enabled until an administrator adds a verified Telegram-to-user mapping.
module.exports = { enabled: () => Boolean(process.env.BOT_TOKEN) };
