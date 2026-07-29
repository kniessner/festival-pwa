#!/usr/bin/env python3
"""
Extract News content from bucht-der-traeumer.de/news/ HTML.
Reads WordPress post-template entries (title/date/excerpt) — a different
shape than the FAQ accordion pages, so this doesn't reuse _extract_faq.py.
Output matches the schema info.js already expects for a news item
(question/answer/date/highlight), so it slots into info.json unchanged.
Usage: python3 _extract_news.py [url] [output.json]
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
    text = text.replace('&#038;', '&').replace('&#8211;', '–').replace('&#8212;', '—')
    text = text.replace('&#8220;', '"').replace('&#8221;', '"').replace('&#8216;', "'").replace('&#8217;', "'")
    text = text.replace('&#8230;', '…').replace('&amp;', '&').replace('&nbsp;', ' ')
    return text


def clean_html_tags(text):
    text = re.sub(r'<\/p>', '\n\n', text, flags=re.I)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.I)
    text = re.sub(r'<\/li>', '\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return decode_entities(text).strip()


def extract_intro(html):
    html_clean = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.S | re.I)
    html_clean = re.sub(r'<style[^>]*>.*?</style>', '', html_clean, flags=re.S | re.I)

    content_match = re.search(r'<main[^>]*>(.*?)</main>', html_clean, re.S | re.I)
    if not content_match:
        return ''

    main = content_match.group(1)
    before_posts = re.split(r'<ul[^>]*wp-block-post-template', main, flags=re.S | re.I)[0]
    paras = re.findall(r'<p[^>]*>(.*?)</p>', before_posts, re.S | re.I)

    intro_parts = []
    for p in paras:
        text = clean_html_tags(p)
        if text and len(text) > 20:
            intro_parts.append(text)

    return '\n\n'.join(intro_parts[:2]) if intro_parts else ''


def extract_news_items(html):
    items = []
    post_pattern = r'<li[^>]*wp-block-post[^>]*>(.*?)</li>'
    posts = re.findall(post_pattern, html, re.S | re.I)

    for post_html in posts:
        title_match = re.search(
            r'wp-block-post-title[^>]*>\s*<a[^>]*>([^<]+)</a>', post_html, re.S | re.I
        )
        if not title_match:
            continue
        title = decode_entities(title_match.group(1).strip())

        date_match = re.search(r'<time[^>]*datetime="([^"]+)"', post_html, re.I)
        date = date_match.group(1)[:10] if date_match else ''

        excerpt_match = re.search(
            r'wp-block-post-excerpt__excerpt[^>]*>(.*?)</p>', post_html, re.S | re.I
        )
        excerpt = ''
        if excerpt_match:
            # The "read more" link lives inside the same <p> as the excerpt
            # text — drop it before stripping tags so its label doesn't leak
            # into the excerpt.
            excerpt_html = re.sub(
                r'<a[^>]*wp-block-post-excerpt__more-link[^>]*>.*?</a>',
                '', excerpt_match.group(1), flags=re.S | re.I
            )
            excerpt = clean_html_tags(excerpt_html)

        items.append({'question': title, 'answer': excerpt, 'date': date})

    # Newest first (WordPress already orders posts this way) — flag the
    # latest one so the UI can call it out, matching the previous
    # hand-authored news.json's use of "highlight".
    if items:
        items[0]['highlight'] = True

    return items


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else 'https://bucht-der-traeumer.de/news/'
    output = sys.argv[2] if len(sys.argv) > 2 else 'news.json'

    print(f"Fetching {url}...")
    html = fetch_html(url)

    items = extract_news_items(html)
    intro = extract_intro(html)

    title_match = re.search(r'<title[^>]*>([^<]+)', html, re.I)
    title = title_match.group(1).strip() if title_match else 'News'
    # Decode entities first — the raw <title> text still has "&#8211;" etc.
    # at this point, which the suffix-stripping regex below can't match.
    title = decode_entities(title).strip()
    title = re.sub(r'\s*[\|\-–]\s*Bucht der Träumer.*$', '', title, flags=re.I).strip()

    data = {
        'type': 'news',
        'slug': 'news',
        'title': title,
        'intro': intro,
        'items': items
    }

    with open(output, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print(f"✅ Extracted {len(items)} news items")
    print(f"   Saved to: {output}")

    if items:
        print(f"\n   Sample:")
        print(f"   {items[0]['date']} — {items[0]['question'][:60]}")


if __name__ == '__main__':
    main()
