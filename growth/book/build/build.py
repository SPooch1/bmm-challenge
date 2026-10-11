#!/usr/bin/env python3
"""Rebuild every Bend Your Baseline book file from the source parts.

Run from anywhere:  python3 build.py
Outputs (in this folder): EPUB + DOCX (Kindle), 6x9 paperback interior PDF with
page-numbered contents, Kindle cover JPG, paperback wrap cover PDF sized to the
page count. Edit the text in ../0*.md, then rerun. Title/subtitle live below.
"""
import os, re, subprocess, html

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
TITLE = 'Bend Your Baseline'
SUBTITLE = "Why Good Habits Don't Stick, and 21 Days to Raise Your Floor"
PARTS = ['01_front_and_part1.md', '02_part2_week1.md', '03_part2_week2.md',
         '04_part2_week3.md', '05_part3_and_back.md']

def run(*a):
    subprocess.run(a, check=True, capture_output=True)

def chrome_pdf(src_html, out_pdf):
    run(CHROME, '--headless=new', '--disable-gpu', '--user-data-dir=/tmp/byb-book-chrome', '--no-first-run', '--no-pdf-header-footer',
        '--print-to-pdf=' + out_pdf, 'file://' + src_html)

import shutil
def pages(pdf):
    if shutil.which('pdfinfo'):
        out = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
        return int(re.search(r'Pages:\s+(\d+)', out).group(1))
    from pypdf import PdfReader  # fallback when poppler is not installed (the Air, 10/05)
    return len(PdfReader(pdf).pages)

def page_text(pdf, p):
    if shutil.which('pdftotext'):
        return subprocess.run(['pdftotext', '-f', str(p), '-l', str(p), pdf, '-'], capture_output=True, text=True).stdout
    from pypdf import PdfReader
    return PdfReader(pdf).pages[p - 1].extract_text() or ''

# 1. manuscript
md = '\n\n'.join(open(os.path.join(SRC, p)).read().strip() for p in PARTS) + '\n'
md = re.sub(r'^subtitle: ".*"$', 'subtitle: "%s"' % SUBTITLE.replace('"', '\\"'), md, count=1, flags=re.M)
# Part / Week headings become a label on the same page as the next chapter
def part_label(m):
    kind, rest = m.group(1), m.group(2)
    return '::: part\n%s\n:::\n' % (kind + ': ' + rest)
open(os.path.join(HERE, 'manuscript.md'), 'w').write(md)
pmd = re.sub(r'^# ((?:Part [A-Za-z]+)|(?:Week \d+)): (.+)$', part_label, md, flags=re.M)  # paperback only

# 2. Kindle files
# EPUB only: list-form title so the package carries a title-type="subtitle" refinement
# (e-reader library views then show the subtitle; DOCX and print keep the simple form).
emd = re.sub(r'^title: ".*"\nsubtitle: "(.*)"$',
             lambda m: 'title:\n- type: main\n  text: "%s"\n- type: subtitle\n  text: "%s"' % (TITLE, m.group(1)),
             md, count=1, flags=re.M)
assert emd != md, 'epub title block not rewritten'
open(os.path.join(HERE, 'manuscript_epub.md'), 'w').write(emd)
run('pandoc', os.path.join(HERE, 'manuscript_epub.md'), '-o', os.path.join(HERE, 'Bend_Your_Baseline_21_Day.epub'),
    '--toc', '--toc-depth=1', '--css=' + os.path.join(HERE, 'epub.css'), '--split-level=1', '--resource-path=' + SRC)
run('pandoc', os.path.join(HERE, 'manuscript.md'), '-o', os.path.join(HERE, 'Bend_Your_Baseline_21_Day.docx'),
    '--toc', '--toc-depth=1', '--resource-path=' + SRC)

# 3. Paperback interior
copyright_block = '''::: copyright
%s: %s

Copyright © 2026 Scott Pooch. All rights reserved. No part of this book may be reproduced in any form without written permission from the author, except for brief quotations in reviews.

This book is for general education. It is not personalized financial, medical, or mental health advice. Check with a qualified professional before making changes that affect your health or finances.

bendyourbaseline.com
:::

''' % (TITLE, SUBTITLE)
i = pmd.index('# Before You Start')
open(os.path.join(HERE, 'print_manuscript.md'), 'w').write(pmd[:i] + copyright_block + pmd[i:])
run('pandoc', os.path.join(HERE, 'print_manuscript.md'), '-s', '-o', os.path.join(HERE, 'print.html'),
    '--toc', '--toc-depth=1', '--css=' + os.path.join(HERE, 'print.css'), '--resource-path=' + SRC, '--embed-resources')
h = open(os.path.join(HERE, 'print.html')).read()
h = h.replace('</head>', '<style>nav#TOC li{display:flex;justify-content:space-between;border-bottom:1px dotted #ccc;padding:1px 0} nav#TOC .pg{padding-left:8px}</style></head>', 1)
toc = re.search(r'<nav id="TOC".*?</nav>', h, re.S).group(0)
lis = re.findall(r'<li>(<a href="#[^"]+".*?</a>)</li>', toc, re.S)
def norm(s): return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', '', s))).strip()
def with_nums(nums):
    t = toc
    for a, n in zip(lis, nums):
        t = t.replace('<li>' + a + '</li>', '<li>' + a + '<span class="pg">' + n + '</span></li>', 1)
    return h.replace(toc, t)
interior = os.path.join(HERE, 'Bend_Your_Baseline_Paperback_Interior_6x9.pdf')
toc_html = os.path.join(HERE, 'print_toc.html')
nums = ['00'] * len(lis)
for _ in range(3):
    open(toc_html, 'w').write(with_nums(nums))
    chrome_pdf(toc_html, interior)
    n = pages(interior)
    txt = [page_text(interior, p) for p in range(1, n + 1)]
    new = []
    for a in lis:
        L = norm(a); pg = '?'
        for p in range(3, n):
            top = [x.strip() for x in txt[p].splitlines() if x.strip()][:4]
            if any(norm(x) == L for x in top) or L in norm(' '.join(top)):
                pg = str(p + 1); break
        new.append(pg)
    if new == nums: break
    nums = new
open(toc_html, 'w').write(with_nums(nums)); chrome_pdf(toc_html, interior)
n = pages(interior)
assert '?' not in nums, ('contents entries not found', [norm(a) for a, x in zip(lis, nums) if x == '?'])

# 4. Covers
sub_html = SUBTITLE[0] + SUBTITLE[1:].lower().replace("don't", "don&rsquo;t")
kc = open(os.path.join(HERE, 'cover.html')).read()
kc = re.sub(r'<div class="sub">.*?</div>', '<div class="sub">%s</div>' % sub_html, kc, count=1, flags=re.S)
open(os.path.join(HERE, 'cover.html'), 'w').write(kc)
png = os.path.join(HERE, 'cover.png')
run(CHROME, '--headless=new', '--disable-gpu', '--user-data-dir=/tmp/byb-book-chrome', '--no-first-run', '--hide-scrollbars', '--window-size=1600,2560',
    '--screenshot=' + png, 'file://' + os.path.join(HERE, 'cover.html'))
from PIL import Image
Image.open(png).convert('RGB').save(os.path.join(HERE, 'Bend_Your_Baseline_Kindle_Cover_1600x2560.jpg'), quality=92, dpi=(300, 300))

sp = round(n * 0.002252, 4)  # KDP white paper spine width per page
W = 0.125 + 6 + sp + 6 + 0.125
wc = open(os.path.join(HERE, 'cover_wrap.html')).read()
wc = re.sub(r'@page\{size:[\d.]+in [\d.]+in', '@page{size:%sin 9.25in' % W, wc)
wc = re.sub(r'html,body\{width:[\d.]+in', 'html,body{width:%sin' % W, wc)
wc = re.sub(r'\.spine\{position:absolute;left:[\d.]+in;top:0;width:[\d.]+in', '.spine{position:absolute;left:6.125in;top:0;width:%sin' % sp, wc)
wc = re.sub(r'\.front\{position:absolute;left:[\d.]+in', '.front{position:absolute;left:%sin' % (6.125 + sp), wc)
wc = re.sub(r'<div class="sub">.*?</div>', '<div class="sub">%s</div>' % sub_html, wc, count=1, flags=re.S)
open(os.path.join(HERE, 'cover_wrap.html'), 'w').write(wc)
chrome_pdf(os.path.join(HERE, 'cover_wrap.html'), os.path.join(HERE, 'Bend_Your_Baseline_Paperback_Cover_Wrap.pdf'))
print('pages', n, 'spine', sp, 'wrap width', round(W, 4))
