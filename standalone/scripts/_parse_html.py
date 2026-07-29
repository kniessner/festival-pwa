#!/usr/bin/env python3
"""
Parse HTML from a WordPress page into Festival PWA JSON format.
Extracts h3 headings as grid items, or h2/h3 + paragraphs as FAQ.
Usage: python3 _parse_html.py <input.html> <output.json> <slug>
"""

import re
import json
import sys
import urllib.request


def decode_entities(text):
    text = text.replace('\u0026#038;', '\u0026').replace('\u0026#8211;', '–').replace('\u0026#8212;', '—')
    text = text.replace('\u0026#8220;', '"').replace('\u0026#8221;', '"').replace('\u0026#8216;', "'").replace('\u0026#8217;', "'")
    text = text.replace('\u0026#8230;', '…').replace('\u0026amp;', '\u0026').replace('\u0026nbsp;', ' ')
    return text


def clean_html_tags(text):
    text = re.sub(r'\u003c\/p\u003e', '\n\n', text, flags=re.I)
    text = re.sub(r'\u003cbr\s*/?\u003e', '\n', text, flags=re.I)
    text = re.sub(r'\u003c\/li\u003e', '\n', text, flags=re.I)
    text = re.sub(r'\u003c[^\u003e]+\u003e', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return decode_entities(text).strip()


def extract_faq_items(html):
    items = []
    # WordPress accordion blocks: li.wp-block-post with h2.wp-block-post-title + eb-accordion-content
    post_pattern = r'\u003cli[^\u003e]*wp-block-post[^\u003e]*\u003e(.*?</li\u003e)'
    posts = re.findall(post_pattern, html, re.S | re.I)
    for post_html in posts:
        q_match = re.search(r'\u003ch2[^\u003e]*wp-block-post-title[^\u003e]*\u003e([^\u003c]+)', post_html, re.I)
        if not q_match:
            continue
        question = q_match.group(1).strip()
        if len(question) < 10 or question.lower() in ('what destinations do you offer?',):
            continue
        a_match = re.search(r'\u003cdiv[^\u003e]*eb-accordion-content[^\u003e]*\u003e(.*?</div\u003e)', post_html, re.S | re.I)
        if a_match:
            answer = clean_html_tags(a_match.group(1))
        else:
            answer = ''
        items.append({'question': question, 'answer': answer})
    return items


def extract_intro(html):
    html_clean = re.sub(r'\u003cscript[^\u003e]*\u003e.*?</script\u003e', '', html, flags=re.S | re.I)
    html_clean = re.sub(r'\u003cstyle[^\u003e]*\u003e.*?</style\u003e', '', html_clean, flags=re.S | re.I)
    content_match = re.search(r'\u003cmain[^\u003e]*\u003e(.*?</main\u003e)', html_clean, re.S | re.I)
    if not content_match:
        return ''
    main = content_match.group(1)
    before_accordion = re.split(r'\u003cul[^\u003e]*wp-block-post-template|\u003cdiv[^\u003e]*eb-accordion', main, flags=re.S | re.I)[0]
    paras = re.findall(r'\u003cp[^\u003e]*\u003e(.*?</p\u003e)', before_accordion, re.S | re.I)
    intro_parts = []
    for p in paras:
        text = clean_html_tags(p)
        if text and len(text) > 20:
            intro_parts.append(text)
    return '\n\n'.join(intro_parts[:2]) if intro_parts else ''


def parse_html(html_path, slug):
    html_raw = open(html_path, 'r', errors='replace').read()

    # Strip script/style for safety
    html_clean = re.sub(r'\u003cscript[^\u003e]*\u003e.*?</script\u003e', '', html_raw, flags=re.S | re.I)
    html_clean = re.sub(r'\u003cstyle[^\u003e]*\u003e.*?</style\u003e', '', html_clean, flags=re.S | re.I)

    # Extract title
    title_match = re.search(r'\u003ctitle[^\u003e]*\u003e([^\u003c]+)', html_raw, re.I)
    title = title_match.group(1).strip() if title_match else slug
    title = re.sub(r'\s*[\|\-–]\s*Bucht der Träumer.*$', '', title, flags=re.I)
    title = decode_entities(title)

    # Try FAQ extraction first (WordPress accordion blocks)
    faq_items = extract_faq_items(html_clean)
    if len(faq_items) >= 3:
        intro = extract_intro(html_clean)
        return {
            'type': 'faq',
            'slug': slug,
            'title': title,
            'intro': intro,
            'items': faq_items
        }

    # Try grid extraction (h3 headings as items)
    h3s = extract_headings(html_clean, 'h3')
    if len(h3s) >= 3:
        items = []
        for h3 in h3s:
            if h3.upper() in ('KULTURPROGRAMM', 'PERFORMANCES', 'WORKSHOPS', ''):
                continue
            items.append({'title': h3, 'desc': ''})
        if items:
            return {
                'type': 'grid',
                'slug': slug,
                'title': title,
                'intro': '',
                'items': items
            }

    # Fallback: generic
    body = re.sub(r'\u003c[^\u003e]+\u003e', ' ', html_clean)
    body = ' '.join(body.split())
    return {
        'type': 'generic',
        'slug': slug,
        'title': title,
        'content': body[:3000]
    }


def extract_headings(html_str, tag):
    pattern = rf'\u003c{tag}[^\u003e]*\u003e([^\u003c]+)'
    matches = re.findall(pattern, html_str, re.IGNORECASE)
    return [m.strip() for m in matches if len(m.strip()) > 2]


def main():
    if len(sys.argv) < 4:
        print("Usage: python3 _parse_html.py \u003cinput.html\u003e \u003coutput.json\u003e \u003cslug\u003e", file=sys.stderr)
        sys.exit(1)

    html_path = sys.argv[1]
    output_path = sys.argv[2]
    slug = sys.argv[3]

    data = parse_html(html_path, slug)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')


if __name__ == '__main__':
    main()
