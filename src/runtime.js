/**
 * runtime.js — DEPRECATED
 *
 * This entry point was a separate Runtime API for Discord bot operations.
 * It has been superseded by the main index.js (bot + panel) and panel-only.js.
 *
 * DO NOT USE. Running this alongside index.js causes:
 * - Duplicate Discord gateway connections (session exhaustion)
 * - Competing message counters (callback-style vs robust)
 * - Port conflicts
 *
 * If you need the Runtime API, integrate its routes into panel-app.js instead.
 */

console.error('[DEPRECATED] src/runtime.js is no longer a valid entry point.');
console.error('Use src/index.js (bot + panel) or src/panel-only.js (panel only).');
process.exit(1);
