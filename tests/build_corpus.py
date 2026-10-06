#!/usr/bin/env python3
"""SubShift oracle: hand-written subtitle corpus + a completely independent
python SRT/VTT parser. Computes every expectation the JS engine must match."""
import json, os, base64

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'corpus')
os.makedirs(OUT, exist_ok=True)

FILES = {}

# 1. plain.srt - CRLF line endings, 3 cues
FILES['plain.srt'] = (
    "1\r\n00:00:01,000 --> 00:00:03,500\r\nHello there.\r\n\r\n"
    "2\r\n00:00:04,000 --> 00:00:06,250\r\nSecond line\r\nwith two rows.\r\n\r\n"
    "3\r\n00:01:00,000 --> 01:02:03,999\r\nOne hour in.\r\n"
)

# 2. movie.vtt - header, NOTE block, identifier lines, cue settings
FILES['movie.vtt'] = (
    "WEBVTT - a film\n\n"
    "NOTE this is a comment\nspanning two lines\n\n"
    "cue-1\n00:00:10.000 --> 00:00:12.000 align:start position:10%\nFirst.\n\n"
    "00:00:13.500 --> 00:00:15.000\nNo identifier.\n\n"
    "STYLE\n::cue { color: #fff }\n\n"
    "cue-4\n01:00:00.250 --> 01:00:02.750 line:0\nLast one.\n"
)

# 3. messy.srt - LF endings, 2-digit ms fraction, zero-duration cue, bad block
FILES['messy.srt'] = (
    "1\n00:00:01,00 --> 00:00:01,00\nZero duration.\n\n"
    "this block has no timecode\nand should be skipped\n\n"
    "2\n00:00:05,5 --> 00:00:07,250\nHalf-second fraction.\n"
)

# 4. short.vtt - minimal, for vtt->srt conversion
FILES['short.vtt'] = (
    "WEBVTT\n\n"
    "00:00:02.000 --> 00:00:04.000\nConvert me.\n"
)

for name, content in FILES.items():
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(content.encode('utf-8'))
    with open(os.path.join(OUT, name + '.b64'), 'w') as f:
        f.write(base64.b64encode(content.encode('utf-8')).decode() + '\n')

# ---- independent oracle parser ----
def parse_time(s):
    s = s.strip()
    import re
    m = re.match(r'(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})', s)
    if not m: return None
    h, mi, sec, frac = int(m[1]), int(m[2]), int(m[3]), m[4]
    frac = frac + '0' * (3 - len(frac))
    return ((h * 60 + mi) * 60 + sec) * 1000 + int(frac)

def oracle_parse(text):
    text = text.lstrip('﻿').replace('\r\n', '\n').replace('\r', '\n')
    lines = text.split('\n')
    is_vtt = lines[0].startswith('WEBVTT')
    i = 0
    if is_vtt:
        i = 1
        while i < len(lines) and lines[i].strip() != '':
            i += 1
    cues, warnings, skipped = [], [], 0
    while i < len(lines):
        while i < len(lines) and lines[i].strip() == '':
            i += 1
        if i >= len(lines): break
        first = lines[i]
        if is_vtt and first.split(' ')[0].split('\t')[0] in ('NOTE', 'STYLE', 'REGION'):
            skipped += 1
            while i < len(lines) and lines[i].strip() != '':
                i += 1
            continue
        ident, tline = None, first
        if '-->' not in first:
            if i + 1 < len(lines) and '-->' in lines[i + 1]:
                ident, tline = first.strip(), lines[i + 1]
                i += 1
        if '-->' not in tline:
            warnings.append('skipped')
            while i < len(lines) and lines[i].strip() != '':
                i += 1
            continue
        a = tline.index('-->')
        start = parse_time(tline[:a])
        rest = tline[a + 3:].strip()
        end = parse_time(rest.split()[0] if rest.split() else '')
        if start is None or end is None:
            warnings.append('badtime')
            i += 1
            while i < len(lines) and lines[i].strip() != '':
                i += 1
            continue
        settings = rest[len(rest.split()[0]):].strip() if is_vtt else ''
        i += 1
        payload = []
        while i < len(lines) and lines[i].strip() != '':
            payload.append(lines[i])
            i += 1
        cues.append({'id': ident, 'start': start, 'end': end,
                     'settings': settings, 'text': '\n'.join(payload)})
    for k, c in enumerate(cues):
        if c['end'] <= c['start']:
            warnings.append('nonpos')
        if k > 0 and c['start'] < cues[k - 1]['start']:
            warnings.append('order')
    return {'format': 'vtt' if is_vtt else 'srt', 'cues': cues,
            'warnings': warnings, 'skipped_blocks': skipped}

def from_ms(t, dot):
    t = max(0, round(t))
    h, r = divmod(t, 3600000)
    m, r = divmod(r, 60000)
    s, ms = divmod(r, 1000)
    return '%02d:%02d:%02d%s%03d' % (h, m, s, '.' if dot else ',', ms)

def ser_srt(cues):
    return '\n\n'.join('%d\n%s --> %s\n%s' % (i + 1, from_ms(c['start'], False),
                       from_ms(c['end'], False), c['text'])
                       for i, c in enumerate(cues)) + '\n'

def ser_vtt(cues):
    parts = []
    for c in cues:
        head = (c['id'] + '\n') if c['id'] else ''
        st = (' ' + c['settings']) if c['settings'] else ''
        parts.append('%s%s --> %s%s\n%s' % (head, from_ms(c['start'], True),
                     from_ms(c['end'], True), st, c['text']))
    return 'WEBVTT\n\n' + '\n\n'.join(parts) + '\n'

expect = {'items': []}
for name in FILES:
    content = FILES[name]
    p = oracle_parse(content)
    cues = p['cues']
    # ops the JS engine must reproduce
    shifted = [(max(0, c['start'] + 2500), max(0, c['end'] + 2500)) for c in cues]
    stretched = [(round(c['start'] * 1.042709), round(c['end'] * 1.042709)) for c in cues]  # 25->23.976
    target = 'vtt' if p['format'] == 'srt' else 'srt'
    conv_cues = [dict(c) for c in cues]
    conv = ser_vtt(conv_cues) if target == 'vtt' else ser_srt(conv_cues)
    overlaps = sum(1 for k in range(1, len(cues)) if cues[k]['start'] < cues[k-1]['end'])
    expect['items'].append({
        'file': name,
        'format': p['format'],
        'cue_count': len(cues),
        'ids': [c['id'] for c in cues],
        'starts': [c['start'] for c in cues],
        'ends': [c['end'] for c in cues],
        'settings': [c['settings'] for c in cues],
        'texts': [c['text'] for c in cues],
        'warning_count': len(p['warnings']),
        'skipped_blocks': p['skipped_blocks'],
        'shift_2500_starts': [s for s, e in shifted],
        'stretch_starts': [s for s, e in stretched],
        'stretch_ends': [e for s, e in stretched],
        'overlap_count': overlaps,
        'convert_target': target,
        'convert_output': conv,
    })

with open(os.path.join(os.path.dirname(OUT), 'expected.json'), 'w') as f:
    json.dump(expect, f)
print('corpus:', ', '.join(sorted(FILES)), '| expectations:', len(expect['items']))
