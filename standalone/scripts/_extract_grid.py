#!/usr/bin/env python3
"""
Extract festival grid pages (performances, workshops) into structured JSON.
Follows detail page links to get descriptions.
Usage: python3 _extract_grid.py <url> <output.json> [slug]
"""

import re
import json
import sys
import urllib.request
import urllib.parse


def fetch_html(url):
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0 (compatible; FestivalPWA/1.0)'}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8', errors='replace')


def decode_entities(text):
    text = text.replace('&#038;', '&').replace('&#8211;', '–').replace('&#8212;', '—')
    text = text.replace('&#8220;', '"').replace('&#8221;', '"').replace('&#8216;', "'").replace('&#8217;', "'")
    text = text.replace('&#8230;', '…').replace('&amp;', '&').replace('&nbsp;', ' ')
    text = text.replace('&#8217;', "'")
    return text


def clean_html(text):
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text)
    return decode_entities(text).strip()


def extract_detail_desc(url, timeout=5):
    """Fetch a detail page and extract the first meaningful paragraph."""
    try:
        html = fetch_html(url, timeout)
        # Strip scripts/styles
        html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.S | re.I)
        html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.S | re.I)
        # Find main content
        main = re.search(r'<main[^>]*>(.*)</main>', html, re.S | re.I)
        if not main:
            return ''
        paras = re.findall(r'<p[^>]*>(.*?)</p>', main.group(1), re.S | re.I)
        for p in paras:
            text = clean_html(p)
            # Skip very short or generic text
            if len(text) > 40 and not text.lower().startswith('willkommen') and 'cookie' not in text.lower():
                return text
        return ''
    except Exception as e:
        return ''


def fetch_html(url, timeout=30):
    req = urllib.request.Request(
        url,
        headers={'User-Agent': 'Mozilla/5.0 (compatible; FestivalPWA/1.0)'}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode('utf-8', errors='replace')


def extract_grid_items(html, base_url):
    """Extract items from the grid overview page."""
    items = []
    # Find all <a> tags and filter for festival-mgrid__card
    all_anchors = re.findall(r'<a([^>]*?)>(.*?)</a>', html, re.S | re.I)

    for attrs, inner in all_anchors:
        if 'festival-mgrid__card' not in attrs:
            continue
        href_match = re.search(r'href="([^"]+)"', attrs)
        if not href_match:
            continue
        url = urllib.parse.urljoin(base_url, href_match.group(1))

        # Title from h3
        title_match = re.search(r'<h3[^>]*class="[^"]*festival-mgrid__name[^"]*"[^>]*>([^<]+)', inner, re.I)
        title = clean_html(title_match.group(1)) if title_match else ''

        # Program points (sub-titles)
        points = re.findall(
            r'<span[^>]*class="[^"]*festival-mgrid__programmpunkt-title[^"]*"[^>]*>([^<]+)',
            inner, re.I
        )
        points = [clean_html(p) for p in points if clean_html(p)]

        # Image
        img_match = re.search(r'<img[^>]*src="([^"]+)"', inner, re.I)
        image = img_match.group(1) if img_match else ''

        if title:
            items.append({
                'title': title,
                'points': points,
                'image': image,
                'url': url,
                'desc': ''  # filled later
            })

    return items


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else 'https://bucht-der-traeumer.de/performances/'
    output = sys.argv[2] if len(sys.argv) > 2 else 'performances.json'
    slug = sys.argv[3] if len(sys.argv) > 3 else 'performances'

    print(f"Fetching overview: {url}...")
    html = fetch_html(url)

    items = extract_grid_items(html, url)
    print(f"Found {len(items)} items")

    # Fetch detail pages for descriptions with thread pool
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def fetch_one(i_item):
        i, item = i_item
        desc = extract_detail_desc(item['url'], timeout=8)
        return i, desc

    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(fetch_one, (i, item)): i for i, item in enumerate(items)}
        for future in as_completed(futures):
            i, desc = future.result()
            items[i]['desc'] = desc
            if desc:
                # Truncate very long
                if len(desc) > 800:
                    items[i]['desc'] = desc[:797] + '...'
            print(f"  [{i+1}/{len(items)}] {items[i]['title']} {'✅' if desc else '⚠️'}")

    # Extract title from HTML <title>
    title_match = re.search(r'<title[^>]*>([^<]+)', html, re.I)
    title = title_match.group(1).strip() if title_match else slug.title()
    # Decode entities first — the raw <title> text still has "&#8211;" etc.
    # at this point, which the suffix-stripping regex below can't match.
    title = decode_entities(title).strip()
    title = re.sub(r'\s*[\|\-–]\s*Bucht der Träumer.*$', '', title, flags=re.I).strip()

    data = {
        'type': 'grid',
        'slug': slug,
        'title': title,
        'intro': '',
        'items': [{k: v for k, v in item.items() if k != 'url'} for item in items]
    }

    with open(output, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

    # Count how many have descriptions
    with_desc = sum(1 for it in items if it['desc'])
    print(f"\n✅ Extracted {len(items)} items ({with_desc} with descriptions)")
    print(f"   Saved to: {output}")

    if items:
        print(f"\n   Sample:")
        it = items[0]
        print(f"   {it['title']}")
        if it['desc']:
            print(f"   {it['desc'][:100]}...")
        if it['points']:
            print(f"   Points: {', '.join(it['points'])}")


if __name__ == '__main__':
    main()

