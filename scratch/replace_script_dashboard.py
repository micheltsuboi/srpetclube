import sys

with open('src/app/(dashboard)/owner/page.tsx', 'r') as f:
    lines = f.readlines()

with open('/Users/micheltsuboi/.gemini/antigravity/brain/ae9f7857-743a-4de5-b23a-fb66482b80ac/scratch/dashboard_replace.tsx', 'r') as f:
    replacement = f.read()

# Replace indexes 762 through 858
new_lines = lines[:762] + [replacement + '\n'] + lines[859:]

with open('src/app/(dashboard)/owner/page.tsx', 'w') as f:
    f.writelines(new_lines)
