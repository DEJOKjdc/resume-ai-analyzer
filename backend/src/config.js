/**
 * config.js
 * Configuration for ResuAI Pro backend.
 * Mirrors the frontend config.js pattern you already use.
 *
 * ⚠️  Never commit your real API key to source control.
 *     Use GEMINI_API_KEY environment variable in production.
 *     The key below is only used as a fallback in development.
 */
const config = {
  // Google Gemini API Key — paste yours here for local dev
  // Production: set GEMINI_API_KEY environment variable instead
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',

  // Gemini model — flash is fast & free-tier friendly
  // Swap to 'gemini-1.5-pro' for higher reasoning quality
GEMINI_MODEL: 'gemini-2.5-flash',
GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',

  // Server
  PORT: process.env.PORT || 3001,
};

export default config;
