/**
 * Route module index.
 * Exports all route factory functions for the web panel.
 */

const { createStatsRouter } = require('./stats');
const { createAnalyticsRouter } = require('./analytics');
const { createVerificationRouter } = require('./verification');

module.exports = {
  createStatsRouter,
  createAnalyticsRouter,
  createVerificationRouter,
};
