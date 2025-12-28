"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * Analytics & Stats Module
 * Provides detailed statistics, percentile rankings, hourly activity analysis
 */

/**
 * Get detailed user analytics
 */
async function getUserAnalytics(db, guildId, userId) {
  const userCount = await dbGet(
    db,
    `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
    [guildId, userId]
  );

  const count = userCount ? userCount.message_count : 0;

  // Get total users and user's rank
  const rankData = await dbGet(
    db,
    `
    SELECT 
      COUNT(*) as total_users,
      (SELECT COUNT(*) FROM user_stats WHERE guild_id = ? AND message_count > ?) as users_above
    FROM user_stats 
    WHERE guild_id = ?
  `,
    [guildId, count, guildId]
  );

  const totalUsers = rankData?.total_users || 0;
  const usersAbove = rankData?.users_above || 0;
  const rank = usersAbove + 1;
  const percentile = totalUsers > 0 ? Math.round(((totalUsers - usersAbove) / totalUsers) * 100) : 0;

  return {
    count,
    rank,
    totalUsers,
    percentile,
  };
}

/**
 * Get server-wide analytics
 */
async function getServerAnalytics(db, guildId) {
  const stats = await dbGet(
    db,
    `
    SELECT 
      COUNT(*) as total_users,
      SUM(message_count) as total_messages,
      AVG(message_count) as avg_messages,
      MAX(message_count) as max_messages
    FROM user_stats 
    WHERE guild_id = ?
  `,
    [guildId]
  );

  return {
    totalUsers: stats?.total_users || 0,
    totalMessages: stats?.total_messages || 0,
    avgMessages: Math.round(stats?.avg_messages || 0),
    maxMessages: stats?.max_messages || 0,
  };
}

/**
 * Get fun fact for user based on message count
 */
function getFunFact(messageCount) {
  const facts = [
    { threshold: 10000, fact: "написать 5 романов" },
    { threshold: 5000, fact: "написать целую книгу" },
    { threshold: 1000, fact: "написать короткую повесть" },
    { threshold: 500, fact: "написать хороший рассказ" },
    { threshold: 100, fact: "написать небольшое эссе" },
    { threshold: 10, fact: "поздороваться со всеми" },
  ];

  const match = facts.find((f) => messageCount >= f.threshold);
  return match ? `Вы отправили достаточно сообщений, чтобы ${match.fact}!` : "Продолжайте общаться!";
}

/**
 * Export user stats to CSV format
 */
async function exportStatsToCSV(db, guildId) {
  const rows = await dbAll(
    db,
    `
    SELECT user_id, message_count 
    FROM user_stats 
    WHERE guild_id = ? 
    ORDER BY message_count DESC
  `,
    [guildId]
  );

  const csv = ["user_id,message_count", ...rows.map((r) => `${r.user_id},${r.message_count}`)].join("\n");

  return csv;
}

module.exports = {
  getUserAnalytics,
  getServerAnalytics,
  getFunFact,
  exportStatsToCSV,
};
