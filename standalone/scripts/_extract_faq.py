#!/usr/bin/env python3
"""
Extract FAQ content from bucht-der-traeumer.de/cashless/ HTML.
Pairs h2.wp-block-post-title questions with eb-accordion-content answers.
Usage: python3 _extract_faq.py [url] [output.json]
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
    text = text.replace('&#8217;', "'")
    return text


def clean_html_tags(text):
    text = re.sub(r'<\/p>', '\n\n', text, flags=re.I)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.I)
    text = re.sub(r'<\/li>', '\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return decode_entities(text).strip()


def extract_intro(html):
    # Strip scripts/styles first
    html_clean = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.S | re.I)
    html_clean = re.sub(r'<style[^>]*>.*?</style>', '', html_clean, flags=re.S | re.I)
    
    # Find the main content area
    content_match = re.search(
        r'<main[^>]*>(.*?)</main>',
        html_clean, re.S | re.I
    )
    if not content_match:
        return ''
    
    main = content_match.group(1)
    # Find all p tags before the first accordion or post-template
    before_accordion = re.split(r'<ul[^>]*wp-block-post-template|<div[^>]*eb-accordion', main, flags=re.S | re.I)[0]
    paras = re.findall(r'<p[^>]*>(.*?)</p>', before_accordion, re.S | re.I)
    
    intro_parts = []
    for p in paras:
        text = clean_html_tags(p)
        if text and len(text) > 20:
            intro_parts.append(text)
    
    return '\n\n'.join(intro_parts[:2]) if intro_parts else ''


def extract_faq_items(html):
    items = []
    post_pattern = r'<li[^\u003e]*wp-block-post[^\u003e]*>(.*?</li>)'
    posts = re.findall(post_pattern, html, re.S | re.I)
    
    for post_html in posts:
        q_match = re.search(r'<h2[^\u003e]*wp-block-post-title[^\u003e]*>([^<]+)', post_html, re.I)
        if not q_match:
            continue
        question = q_match.group(1).strip()
        if len(question) < 10 or question.lower() in ('what destinations do you offer?',):
            continue
        
        a_match = re.search(r'<div[^\u003e]*eb-accordion-content[^\u003e]*>(.*?)</div>', post_html, re.S | re.I)
        if a_match:
            answer_html = a_match.group(1)
            answer = clean_html_tags(answer_html)
        else:
            answer = ''
        
        items.append({'question': question, 'answer': answer})
    
    return items


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else 'https://bucht-der-traeumer.de/cashless/'
    output = sys.argv[2] if len(sys.argv) > 2 else 'cashless.json'
    
    print(f"Fetching {url}...")
    html = fetch_html(url)
    
    items = extract_faq_items(html)
    intro = extract_intro(html)
    
    title_match = re.search(r'<title[^>]*>([^<]+)', html, re.I)
    title = title_match.group(1).strip() if title_match else 'Cashless'
    # Decode entities first — the raw <title> text still has "&#8211;" etc.
    # at this point, which the suffix-stripping regex below can't match.
    title = decode_entities(title).strip()
    title = re.sub(r'\s*[\|\-–]\s*Bucht der Träumer.*$', '', title, flags=re.I).strip()
    
    data = {
        'type': 'faq',
        'slug': 'cashless',
        'title': title,
        'intro': intro,
        'items': items
    }
    
    with open(output, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    
    print(f"✅ Extracted {len(items)} FAQ items")
    print(f"   Saved to: {output}")
    
    if items:
        print(f"\n   Sample:")
        print(f"   Q: {items[0]['question'][:60]}...")
        print(f"   A: {items[0]['answer'][:100]}...")


if __name__ == '__main__':
    main()
