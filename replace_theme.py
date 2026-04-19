import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

replacements = {
    r'bg-\[\#111827\]': 'bg-[var(--bg-card)]',
    r'border-slate-800': 'border-[var(--border)]',
    r'text-slate-500': 'text-[var(--text-secondary)]',
    r'text-slate-600': 'text-[var(--text-muted)]',
    r'text-slate-400': 'text-[var(--text-secondary)]',
    r'text-slate-300': 'text-[var(--text-primary)]',
    r'text-white': 'text-[var(--text-primary)]',
    r'bg-slate-800': 'bg-[var(--border)]',
    r'text-slate-700': 'text-[var(--text-secondary)]',
    r'bg-slate-700': 'bg-[var(--bg-card-hover)]',
}

for old, new in replacements.items():
    content = re.sub(old, new, content)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated index.html replacements")
