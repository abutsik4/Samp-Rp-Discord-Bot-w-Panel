#!/usr/bin/env node
/**
 * Initialize Panel Users
 * Creates default admin and test users for the panel
 * Run this script once to set up initial users
 */

const bcrypt = require("bcryptjs");
const { initStatsDb } = require("../src/bot/statsDb");

async function initializeUsers() {
  console.log("🔧 Initializing panel users...\n");

  const statsDb = initStatsDb();

  // Wait for database to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // Check if admin user already exists
    const existingAdmin = await statsDb.getPanelUser("admin");
    
    if (existingAdmin) {
      console.log("⚠️  Admin user already exists. Skipping creation.");
    } else {
      // Create admin user
      // Default password: "admin123" - CHANGE THIS IMMEDIATELY AFTER FIRST LOGIN
      const adminPassword = "admin123";
      const adminHash = await bcrypt.hash(adminPassword, 10);
      await statsDb.createPanelUser("admin", adminHash, "admin");
      
      console.log("✅ Admin user created successfully");
      console.log("   Username: admin");
      console.log("   Password: admin123");
      console.log("   ⚠️  IMPORTANT: Change this password immediately after first login!\n");
    }

    // Check if test user already exists
    const existingTest = await statsDb.getPanelUser("test");
    
    if (existingTest) {
      console.log("⚠️  Test user already exists. Skipping creation.");
    } else {
      // Create test user
      const testPassword = "test1234";
      const testHash = await bcrypt.hash(testPassword, 10);
      await statsDb.createPanelUser("test", testHash, "user");
      
      console.log("✅ Test user created successfully");
      console.log("   Username: test");
      console.log("   Password: test1234");
      console.log("   Role: user (standard access)\n");
    }

    // Display all users
    const allUsers = await statsDb.getAllPanelUsers();
    console.log("\n📋 Current panel users:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    allUsers.forEach(user => {
      console.log(`   • ${user.username.padEnd(15)} [${user.role.toUpperCase()}]`);
    });
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log("✨ Initialization complete!");
    console.log("🔐 You can now log in at http://localhost:3000/login\n");

  } catch (error) {
    console.error("❌ Error initializing users:", error);
    process.exit(1);
  }

  process.exit(0);
}

initializeUsers();
