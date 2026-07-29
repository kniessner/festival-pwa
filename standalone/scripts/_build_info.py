#!/usr/bin/env python3
"""
Merge cashless.json + faqs.json + news.json into a single info.json —
the shape js/views/info.js actually reads (info.cashless/.faqs/.news, each
the same {type,slug,title,intro,items} shape the individual extractors
already produce). Mirrors _build_timetable.py's role of assembling the
final per-page file from the individually-scraped sources.

Usage: python3 _build_info.py <data_dir>

Missing source files are skipped with a warning rather than failing —
useful for the English pass, where cashless/faqs/news may not have been
scraped yet.
"""

import json
import sys
import os

SECTIONS = ['news', 'cashless', 'faqs']


def build_info(data_dir):
    info = {'type': 'info', 'slug': 'info', 'title': 'Info'}
    found = []

    for section in SECTIONS:
        path = os.path.join(data_dir, f'{section}.json')
        if not os.path.exists(path):
            print(f"   ⚠️  {section}.json not found in {data_dir} — skipping")
            continue
        with open(path, encoding='utf-8') as f:
            info[section] = json.load(f)
        found.append(section)

    if not found:
        print(f"   ❌ No source files found in {data_dir} — not writing info.json")
        return False

    out_path = os.path.join(data_dir, 'info.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(info, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print(f"   ✅ info.json built from: {', '.join(found)}")
    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 _build_info.py <data_dir>", file=sys.stderr)
        sys.exit(1)

    ok = build_info(sys.argv[1])
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
