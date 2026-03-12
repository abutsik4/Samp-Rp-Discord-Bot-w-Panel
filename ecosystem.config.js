module.exports = {
  apps: [
    {
      name: "jepsencloud-panel",
      script: "src/index.js",
      instances: 1,
      exec_mode: "fork",
      
      // Load .env file
      env_file: ".env",
      
      // Environment
      env: {
        NODE_ENV: "production",
        PORT: 5012,
        // Prevent accidental spam from public level-up announcements.
        LEVELS_ANNOUNCE: "0"
      },
      
      // Auto-restart settings
      watch: false,
      ignore_watch: ["node_modules", "data", ".git", ".env"],
      max_memory_restart: "512M",
      
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
