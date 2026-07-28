#!/usr/bin/env python3
"""
Build unified timetable JSON from programm-2026 + performances + workshops descriptions.
Enriches program events with descriptions from detail pages.
Usage: python3 _build_timetable.py <data_dir>
"""

import json
import sys
import os


def normalize(s):
    """Lowercase, strip punctuation, collapse whitespace."""
    if not s:
        return ''
    import re
    s = s.lower().strip()
    s = re.sub(r'[^\w\säöüß]', ' ', s)
    s = re.sub(r'\s+', ' ', s)
    return s


def build_timetable(data_dir, lang='de'):
    # Load source data
    with open(os.path.join(data_dir, 'programm-2026.json')) as f:
        program = json.load(f)
    with open(os.path.join(data_dir, 'performances.json')) as f:
        perf = json.load(f)
    with open(os.path.join(data_dir, 'workshops.json')) as f:
        ws = json.load(f)

    # Build lookup from perf/ws items by normalized title
    desc_lookup = {}
    for item in perf.get('items', []):
        key = normalize(item['title'])
        desc_lookup[key] = item.get('desc', '')
        for pt in item.get('points', []):
            desc_lookup[normalize(pt)] = item.get('desc', '')
    for item in ws.get('items', []):
        key = normalize(item['title'])
        desc_lookup[key] = item.get('desc', '')
        for pt in item.get('points', []):
            desc_lookup[normalize(pt)] = item.get('desc', '')

    # Build events with descriptions
    events = []
    for i, ev in enumerate(program.get('events', [])):
        # Try to find a description match
        desc = ev.get('description', '') or ev.get('excerpt', '')

        # Try matching by hosts first
        for host in ev.get('hosts', []):
            match = desc_lookup.get(normalize(host))
            if match and len(match) > len(desc):
                desc = match

        # Try matching by title
        match = desc_lookup.get(normalize(ev.get('title', '')))
        if match and len(match) > len(desc):
            desc = match

        # Build start/end times. The program extractor now reads end_time directly
        # from the site's "festival-accordion-badge--time" badge; fall back to
        # guessing from the description text only for older programm-2026.json
        # dumps that predate that badge extraction.
        start_time = ev.get('start_time', '')
        end_time = ev.get('end_time', '')
        if not end_time and desc:
            import re
            # Look for time patterns like "13:00 – 19:00" or "13:00 - 19:00"
            m = re.search(r'(\d{1,2}:\d{2})\s*[–\-]\s*(\d{1,2}:\d{2})', desc)
            if m and start_time and m.group(1).replace(':', '') == start_time.replace(':', ''):
                end_time = m.group(2)

        # Determine category
        type_val = ev.get('type', '')
        type_label = ev.get('type_label', '')

        # Map to category labels
        cat_map = {
            'performance': 'Performance',
            'interaktiver-workshop': 'Workshop',
            'talk': 'Talk',
            'space': 'Space'
        }
        category = cat_map.get(type_val, type_label or type_val)

        # Genre — for now same as category, but can be enriched later
        genre = category

        # Source page tracking
        source = 'program'
        if type_val == 'performance':
            source = 'performances'
        elif type_val == 'interaktiver-workshop':
            source = 'workshops'

        events.append({
            'id': i,
            'title': ev.get('title', ''),
            'day': ev.get('day', ''),
            'day_label': ev.get('day_label', ''),
            'time': ev.get('time', ''),
            'start_time': start_time,
            'end_time': end_time,
            'stage': ev.get('stage', ''),
            'stage_label': ev.get('stage_label', ''),
            'type': type_val,
            'type_label': type_label,
            'category': category,
            'genre': genre,
            'langs': ev.get('langs', []),
            'excerpt': ev.get('excerpt', ''),
            'description': desc,
            'hosts': ev.get('hosts', []),
            'source': source
        })

    # Build unique filter values from events
    stages_set = set()
    categories_set = set()
    genres_set = set()
    days_set = set()

    for ev in events:
        if ev['stage'] and ev['stage'] != 'all':
            stages_set.add((ev['stage'], ev['stage_label']))
        if ev['type'] and ev['type'] != 'all':
            categories_set.add((ev['type'], ev['category']))
        if ev['genre']:
            genres_set.add((ev['type'], ev['genre']))
        if ev['day'] and ev['day'] != 'no-day':
            days_set.add((ev['day'], ev['day_label']))

    # Sort days chronologically
    day_order = ['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16', '2026-06-15']
    sorted_days = sorted(days_set, key=lambda x: day_order.index(x[0]) if x[0] in day_order else 999)

    # Sort stages alphabetically by label
    sorted_stages = sorted(stages_set, key=lambda x: x[1].lower())

    # Sort categories in logical order
    cat_order = ['performance', 'interaktiver-workshop', 'talk', 'space']
    sorted_categories = sorted(categories_set, key=lambda x: cat_order.index(x[0]) if x[0] in cat_order else 999)

    sorted_genres = sorted(genres_set, key=lambda x: x[1].lower())

    # Default day: festival runs Aug 13-16, 2026. Today is July 10, so default to first day (Aug 13)
    default_day = '2026-08-13'

    title = {'de': 'Kulturprogramm', 'en': 'Culture Program'}[lang]
    timetable = {
        'type': 'timetable',
        'slug': 'timetable',
        'title': title,
        'intro': program.get('intro', ''),
        'default_day': default_day,
        'filters': {
            'days': [{'value': d[0], 'label': d[1]} for d in sorted_days],
            'stages': [{'value': s[0], 'label': s[1]} for s in sorted_stages],
            'categories': [{'value': c[0], 'label': c[1]} for c in sorted_categories],
            'genres': [{'value': g[0], 'label': g[1]} for g in sorted_genres]
        },
        'events': events
    }

    output = os.path.join(data_dir, 'timetable.json')
    with open(output, 'w', encoding='utf-8') as f:
        json.dump(timetable, f, indent=2, ensure_ascii=False)
        f.write('\n')

    with_desc = sum(1 for e in events if e['description'])
    print(f"✅ Built timetable: {len(events)} events")
    print(f"   Days: {len(sorted_days)}, Stages: {len(sorted_stages)}, Categories: {len(sorted_categories)}, Genres: {len(sorted_genres)}")
    print(f"   Events with descriptions: {with_desc}")
    print(f"   Saved to: {output}")

    return timetable


if __name__ == '__main__':
    data_dir = sys.argv[1] if len(sys.argv) > 1 else 'data'
    lang = sys.argv[2] if len(sys.argv) > 2 else 'de'
    build_timetable(data_dir, lang)
