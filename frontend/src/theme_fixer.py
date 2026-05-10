import os

replacements = {
    'text-slate-100': 'text-[var(--color-text-primary)]',
    'text-slate-200': 'text-[var(--color-text-secondary)]',
    'text-slate-300': 'text-[var(--color-text-tertiary)]',
    'hover:text-slate-100': 'hover:text-[var(--color-text-primary)]',
    'group-hover:text-slate-100': 'group-hover:text-[var(--color-text-primary)]',
    'group-hover:text-[#f5efe2]': 'group-hover:text-[var(--color-text-primary)]',
    'group-hover:text-[#f0d9a8]': 'group-hover:text-[var(--color-text-secondary)]',
    'group-hover:text-[#bf953f]': 'group-hover:text-emerald-600',
    'bg-slate-950/60': 'bg-[var(--color-bg-primary)]',
    'bg-slate-950': 'bg-[var(--color-bg-primary)]',
    'border-slate-800': 'border-[var(--color-border)]',
    'border-slate-700': 'border-[var(--color-border)]',
    'border-slate-600': 'border-[var(--color-border)]',
}

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    for old, new in replacements.items():
        content = content.replace(old, new)
    
    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def walk(root_dir):
    count = 0
    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith(('.tsx', '.ts', '.css')):
                if fix_file(os.path.join(root, file)):
                    count += 1
    print(f"Fixed {count} files.")

if __name__ == "__main__":
    walk(r"e:\CSE\TradexaLK\frontend\src")
