import re, sys

path = "/opt/jepsencloud-bot/src/web/panel-app.js"
with open(path, "r") as f:
    src = f.read()

# 1) Add require near other route requires
if 'createNexusRouter' not in src:
    src = src.replace(
        'const { createGameplayRouter } = require("./routes/gameplay");',
        'const { createGameplayRouter } = require("./routes/gameplay");\nconst { createNexusRouter } = require("./routes/nexus-api");'
    )

# 2) Add router mount near other app.use(...) routers
if 'createNexusRouter' not in src or 'nexusRouter' not in src:
    # Find a good anchor: after gameplay router mount
    anchor = 'app.use(createGameplayRouter(ctx));'
    if anchor in src:
        src = src.replace(
            anchor,
            anchor + '\n  app.use(createNexusRouter(ctx));'
        )
    else:
        # fallback: after createSampServersRouter
        anchor2 = 'app.use(createSampServersRouter(ctx));'
        src = src.replace(anchor2, anchor2 + '\n  app.use(createNexusRouter(ctx));')

# 3) Add static serve for /nexus and fallback (before the existing SPA fallback block)
static_block = '''
  // Nexus SPA static serve
  const nexusDir = path.join(__dirname, "..", "..", "public", "panel");
  app.use("/nexus", express.static(nexusDir, { index: false }));
  app.get("/nexus/*", (_req, res) => {
    res.sendFile(path.join(nexusDir, "index.html"));
  });
'''

if 'Nexus SPA static serve' not in src:
    # Insert after the existing SPA static block and before the PANEL_BASE catch-all
    marker = '  // Legacy page fallbacks'
    if marker in src:
        src = src.replace(marker, static_block + '\n' + marker)
    else:
        # fallback: before the app.get PANEL_BASE fallback
        marker2 = '  app.get(`${PANEL_BASE}/*`'
        if marker2 in src:
            src = src.replace(marker2, static_block + '  ' + marker2)

with open(path, "w") as f:
    f.write(src)

print("patched panel-app.js")
