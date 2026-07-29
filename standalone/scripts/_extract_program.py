#!/usr/bin/env python3
"""
Extract the festival program page into structured JSON.
Handles WordPress accordion blocks with day/stage/type filters.
Usage: python3 _extract_program.py [url] [output.json]
"""

import re
import json
import sys
import urllib.request


def fetch_html(url):
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0 (compatible; FestivalPWA/1.0)'}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8', errors='replace')


def decode_entities(text):
    text = text.replace('\u0026#038;', '\u0026').replace('\u0026#8211;', '–').replace('\u0026#8212;', '—')
    text = text.replace('\u0026#8220;', '"').replace('\u0026#8221;', '"').replace('\u0026#8216;', "'").replace('\u0026#8217;', "'")
    text = text.replace('\u0026#8230;', '…').replace('\u0026amp;', '\u0026').replace('\u0026nbsp;', ' ')
    text = text.replace('\u0026ndash;', '–')
    return text


def clean_html(text):
    text = re.sub(r'\u003c[^\u003e]+\u003e', '', text)
    text = re.sub(r'\s+', ' ', text)
    return decode_entities(text).strip()


def extract_events(html, lang='de'):
    """Extract all festival events from the accordion HTML."""
    events = []
    
    # Day containers are \u003csection data-day="..."> with nested event items
    day_sections = re.findall(
        r'\u003csection[^\u003e]*data-day="([^"]+)"[^\u003e]*\u003e(.*?)\u003c/section\u003e',
        html, re.S | re.I
    )
    
    day_map = {
        'de': {
            '2026-08-13': 'Donnerstag', '2026-08-14': 'Freitag', '2026-08-15': 'Samstag',
            '2026-08-16': 'Sonntag', '2026-06-15': 'Montag', 'no-day': 'Ohne Tag'
        },
        'en': {
            '2026-08-13': 'Thursday', '2026-08-14': 'Friday', '2026-08-15': 'Saturday',
            '2026-08-16': 'Sunday', '2026-06-15': 'Monday', 'no-day': 'No day'
        }
    }[lang]
    day_short = {
        'de': {'2026-08-13': 'DO', '2026-08-14': 'FR', '2026-08-15': 'SA', '2026-08-16': 'SO', '2026-06-15': 'MO', 'no-day': ''},
        'en': {'2026-08-13': 'THU', '2026-08-14': 'FRI', '2026-08-15': 'SAT', '2026-08-16': 'SUN', '2026-06-15': 'MON', 'no-day': ''}
    }[lang]
    
    for day_value, day_content in day_sections:
        day_label = day_map.get(day_value, day_value)
        
        # Find all event items — each starts with a div containing festival-accordion-item
        # Use split approach: split by festival-accordion-item opening tags
        item_splits = re.split(
            r'(\u003cdiv[^\u003e]*class="[^"]*festival-accordion-item[^"]*"[^\u003e]*\u003e)',
            day_content, flags=re.S | re.I
        )
        
        # item_splits[0] = before first item, [1] = opening tag 1, [2] = content 1, [3] = opening tag 2, [4] = content 2, ...
        for i in range(1, len(item_splits), 2):
            if i >= len(item_splits):
                break
            opening_tag = item_splits[i]
            raw_content = item_splits[i + 1] if (i + 1) < len(item_splits) else ''
            
            # Extract data attributes from opening tag
            data_types = re.search(r'data-types="([^"]*)"', opening_tag)
            data_stages = re.search(r'data-stages="([^"]*)"', opening_tag)
            data_start = re.search(r'data-start="([^"]*)"', opening_tag)
            data_langs = re.search(r'data-langs="([^"]*)"', opening_tag)
            
            # Extract title from h3 in content
            title_match = re.search(
                r'\u003ch3[^\u003e]*class="[^"]*eb-accordion-title[^"]*"[^\u003e]*\u003e([^\u003c]+)',
                raw_content, re.I
            )
            title = clean_html(title_match.group(1)) if title_match else ''
            
            # Extract excerpt
            excerpt_match = re.search(
                r'\u003cp[^\u003e]*class="[^"]*festival-accordion-excerpt[^"]*"[^\u003e]*\u003e(.*?)\u003c/p\u003e',
                raw_content, re.S | re.I
            )
            excerpt = clean_html(excerpt_match.group(1)) if excerpt_match else ''
            
            # Extract host/artist names (skip "Mitwirkende")
            hosts = []
            host_matches = re.findall(
                r'\u003cspan[^\u003e]*class="[^"]*festival-accordion-host__name[^"]*"[^\u003e]*\u003e([^\u003c]+)',
                raw_content, re.I
            )
            for host in host_matches:
                host = clean_html(host)
                if host and host not in hosts and host.lower() != 'mitwirkende':
                    hosts.append(host)
            
            # Extract description from accordion content (paragraphs inside eb-accordion-content)
            content_match = re.search(
                r'\u003cdiv[^\u003e]*class="[^"]*eb-accordion-content[^"]*"[^\u003e]*\u003e(.*?)\u003c/div\u003e',
                raw_content, re.S | re.I
            )
            description = ''
            if content_match:
                content_html = content_match.group(1)
                # Extract paragraphs
                paras = re.findall(r'\u003cp[^\u003e]*\u003e(.*?)\u003c/p\u003e', content_html, re.S | re.I)
                desc_parts = []
                for p in paras:
                    p_text = clean_html(p)
                    if p_text and len(p_text) > 10 and p_text != excerpt:
                        desc_parts.append(p_text)
                description = '\n\n'.join(desc_parts)
            
            # Build time display
            start_time = data_start.group(1) if data_start else ''
            time_display = ''
            if start_time:
                time_display = f"{day_short.get(day_value, '')} {start_time}".strip()

            # End time — the accordion header renders a "festival-accordion-badge--time"
            # badge (e.g. "DO 13:00 – 14:00") that data-start/data-* attributes don't carry.
            end_time = ''
            badge_match = re.search(
                r'<span[^>]*class="[^"]*festival-accordion-badge--time[^"]*"[^>]*>([^<]*)</span>',
                raw_content, re.I
            )
            if badge_match:
                badge_times = re.findall(r'(\d{1,2}:\d{2})', decode_entities(badge_match.group(1)))
                if len(badge_times) >= 2:
                    end_time = badge_times[1]
            
            # Determine event type label
            type_label = ''
            if data_types:
                t = data_types.group(1)
                type_map = {
                    'space': 'Space',
                    'performance': 'Performance',
                    'talk': 'Talk',
                    'interaktiver-workshop': 'Workshop'
                }
                type_label = type_map.get(t, t)
            
            # Determine stage label
            stage_label = ''
            if data_stages:
                s = data_stages.group(1)
                stage_map = {
                    'schweissperle': 'Schweissperle',
                    'dezentral': 'dezentral',
                    'cuddle-poodle': 'Cuddle Poodle',
                    'mirage': 'Mirage',
                    'neuro-divers': 'Neuro Divers',
                    'skalahara': 'Skalahara',
                    'strandflitzer': 'Strandflitzer',
                    'walking-act': 'Walking Act',
                    'community-corner': 'Community Corner',
                    'zirkus-mond': 'Zirkus Mond'
                }
                stage_label = stage_map.get(s, s)
            
            if title:
                events.append({
                    'title': title,
                    'day': day_value,
                    'day_label': day_label,
                    'time': time_display,
                    'start_time': start_time,
                    'end_time': end_time,
                    'stage': data_stages.group(1) if data_stages else '',
                    'stage_label': stage_label,
                    'type': data_types.group(1) if data_types else '',
                    'type_label': type_label,
                    'langs': data_langs.group(1).split() if data_langs and data_langs.group(1) else [],
                    'excerpt': excerpt,
                    'description': description,
                    'hosts': hosts
                })
    
    return events


def extract_filters(html):
    """Extract available filter options from the page."""
    filters = {
        'days': [],
        'stages': [],
        'types': []
    }
    
    # Day filters
    day_buttons = re.findall(
        r'\u003cbutton[^\u003e]*data-day-filter="([^"]+)"[^\u003e]*\u003e\s*([^\u003c]+)',
        html, re.I
    )
    for val, label in day_buttons:
        filters['days'].append({'value': val, 'label': clean_html(label)})
    
    # Stage filters
    stage_buttons = re.findall(
        r'\u003cbutton[^\u003e]*data-stage-filter="([^"]+)"[^\u003e]*\u003e\s*([^\u003c]+)',
        html, re.I
    )
    for val, label in stage_buttons:
        filters['stages'].append({'value': val, 'label': clean_html(label)})
    
    # Type filters
    type_buttons = re.findall(
        r'\u003cbutton[^\u003e]*data-filter="([^"]+)"[^\u003e]*\u003e\s*([^\u003c]+)',
        html, re.I
    )
    for val, label in type_buttons:
        if val != 'all':
            filters['types'].append({'value': val, 'label': clean_html(label)})
    
    return filters


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else 'https://bucht-der-traeumer.de/programm-2026/'
    output = sys.argv[2] if len(sys.argv) > 2 else 'programm.json'
    lang = sys.argv[3] if len(sys.argv) > 3 else 'de'

    print(f"Fetching {url}...")
    html = fetch_html(url)

    events = extract_events(html, lang)
    filters = extract_filters(html)
    
    # Extract intro text
    intro_match = re.search(
        r'\u003cp[^\u003e]*class="[^"]*has-text-align-center[^"]*"[^\u003e]*\u003e(.*?)\u003c/p\u003e',
        html, re.S | re.I
    )
    intro = clean_html(intro_match.group(1)) if intro_match else ''
    
    title = {'de': 'Kulturprogramm', 'en': 'Culture Program'}[lang]
    data = {
        'type': 'program',
        'slug': 'programm',
        'title': title,
        'intro': intro,
        'filters': filters,
        'events': events
    }
    
    with open(output, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    
    print(f"✅ Extracted {len(events)} events")
    print(f"   Days: {len(filters['days'])}, Stages: {len(filters['stages'])}, Types: {len(filters['types'])}")
    print(f"   Saved to: {output}")
    
    if events:
        print(f"\n   Sample:")
        ev = events[0]
        print(f"   {ev['time']} | {ev['title']} | {ev['stage_label']} | {ev['type_label']}")
        print(f"   {ev['excerpt'][:80]}...")


if __name__ == '__main__':
    main()
