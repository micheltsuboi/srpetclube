import sys

with open('src/app/(dashboard)/owner/financeiro/page.tsx', 'r') as f:
    lines = f.readlines()

with open('/Users/micheltsuboi/.gemini/antigravity/brain/ae9f7857-743a-4de5-b23a-fb66482b80ac/scratch/financeiro_replace.tsx', 'r') as f:
    replacement = f.read()

# Lines 730 to 864 correspond to index 729 to 863.
new_lines = lines[:729] + [replacement + '\n'] + lines[864:]

with open('src/app/(dashboard)/owner/financeiro/page.tsx', 'w') as f:
    f.writelines(new_lines)
