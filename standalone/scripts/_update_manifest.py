#!/usr/bin/env python3
"""
Update the standalone _manifest.json from scraped page data.
Usage: python3 _update_manifest.py <data_dir> <app_name>
"""

import json
import sys
import time
import os
import glob

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 _update_manifest.py <data_dir> <app_name>", file=sys.stderr)
        sys.exit(1)

    data_dir = sys.argv[1]
    app_name = sys.argv[2]

    pages = []
    # Find all JSON files except internal ones
    for path in sorted(glob.glob(os.path.join(data_dir, '*.json'))):
        name = os.path.basename(path)
        if name.startswith('_') or name in ('timetable.json', '.json'):
            continue
        slug = name.replace('.json', '')
        if slug in ('home', 'favorites', 'programm-2026', 'programm', 'performances', 'workshops'):
            continue
        label = slug.title()
        try:
            with open(path) as f:
                d = json.load(f)
                label = d.get('title', label)
        except:
            pass
        pages.append({'slug': slug, 'label': label, 'icon': '📄'})

    # Build ordered pages
    all_pages = [
        {'slug': 'home', 'label': 'Home', 'icon': '🏠'},
        {'slug': 'favorites', 'label': 'Mein Plan', 'icon': '⭐'},
        {'slug': 'timetable', 'label': 'Kulturprogramm', 'icon': '📅'},
    ]

    # Add remaining pages sorted alphabetically
    seen = {'home', 'favorites', 'timetable'}
    remaining = sorted([p for p in pages if p['slug'] not in seen], key=lambda x: x['label'].lower())
    all_pages.extend(remaining)

    manifest = {
        'pages': all_pages,
        'app_name': app_name,
        'synced_at': int(time.time())
    }

    manifest_path = os.path.join(data_dir, '_manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print(f"   ✅ Manifest updated: {len(all_pages) - 3} content pages")

if __name__ == '__main__':
    main()
