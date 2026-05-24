module.exports = {
  apps: [
    {
      name: "jepsencloud-panel",
      script: "src/panel-only.js",
      instances: 1,
      exec_mode: "fork",
      
      // Load .env file
      env_file: ".env",
      
      // Environment
      env: {
        NODE_ENV: "production",
        PORT: 5012,
        PANEL_PORT: 5013,
        PANEL_DISABLE_DISCORD: "1",
        // Level-up announcements in a designated channel
        LEVELS_ANNOUNCE: "1",
        // Set these channel/role IDs after running the setup script:
        // LEVELS_ANNOUNCE_CHANNEL_ID: "",
        // WEEKLY_AWARDS_CHANNEL_ID: "",
        // WEEKLY_TOP_CHATTER_ROLE_ID: "",
        // WEEKLY_NIGHT_OWL_ROLE_ID: "",
      },
      
      // Auto-restart settings
      watch: false,
      ignore_watch: ["node_modules", "data", ".git", ".env"],
      // ML models can push steady-state usage well above 512M.
      // Keep a safety restart threshold that still avoids restart loops.
      max_memory_restart: "2G",
      
      // Logging
      error_file: "logs/err.log",
      out_file: "logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      
      // Graceful shutdown
      kill_timeout: 5000,
      
      // Crash recovery
      max_restarts: 10,
      min_uptime: 10000,
      
      // Process behavior
      listen_timeout: 3000,
    }
  ],
  
  deploy: {
    production: {
      user: "root",
      host: "localhost",
      ref: "origin/main",
      repo: "git@github.com:jepsencloud/bot.git",
      path: "/opt/jepsencloud-bot",
      "post-deploy": "npm install && npm run build"
    }
  }
};
