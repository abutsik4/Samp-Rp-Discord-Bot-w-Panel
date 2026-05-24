#!/usr/bin/env python3
import pathlib
p = pathlib.Path('/opt/jepsencloud-bot/src/features/samp-extended.js')
t = p.read_text()
# The broken pattern: lines.join("
# 
# "))  -- real newlines inside string
# We replace the line break with escaped newlines.
old = 'lines.join("\n\n")).setColor(0xe74c3c).setTimestamp();'
new = 'lines.join("\\n\\n")).setColor(0xe74c3c).setTimestamp();'
t = t.replace(old, new)
p.write_text(t)
print('fixed')
