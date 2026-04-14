#!/usr/bin/env python3
"""
Parallel Bilingual Booklet Builder (Spanish left / English right)
=================================================================

Two output formats:

1) booklet  (default)
   - Print-ready, saddle-staple imposed PDF
   - Half-page booklet pages: even = Spanish (left), odd = English (right)
   - Non-story pages (cover, TOC, study, notes) are rendered ONCE
   - Ensures the first Spanish *story* page is an EVEN booklet page

2) proof
   - Reading-order PDF with Spanish (left) + English (right) on the SAME page
   - No imposition; great for on-screen review
   - Non-story pages are rendered ONCE full-width

Common features:
- 11×8.5 in landscape; print double-sided (short-edge flip) for booklet
- Times-Roman 11 pt, leading 13 pt by default (tweakable)
- Strict 1:1 paragraph alignment (split on blank lines; robust splitter)
- Shared y-grid per bilingual pair for perfect horizontal alignment
- Pair spacing adjustable; optional faint separators under each pair
- Footer: centered italic “ES/EN · p.#” (per booklet page for booklet; per page for proof)

CLI (examples)
--------------
pip install reportlab

# Print-ready booklet (default)
python build_parallel_bilingual_booklet.py \
  --en alice-en.txt --es alice-es.txt --aids alice-aids.md \
  --out Alice_Booklet.pdf --pair-spacing 14 --pad

# Proof (reading) layout
python build_parallel_bilingual_booklet.py \
  --en alice-en.txt --es alice-es.txt --aids alice-aids.md \
  --out Alice_Proof.pdf --format proof --pair-spacing 14 --pad
"""

import argparse, sys, re
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
from reportlab.lib import colors

# ------------------------ Layout & Styles ------------------------
PAGE_W, PAGE_H = landscape(letter)   # 11x8.5 in landscape
HALF_W, HALF_H = PAGE_W/2.0, PAGE_H  # each half-page portrait 5.5x8.5
LMARGIN = RMARGIN = 0.4 * inch
TMARGIN = BMARGIN = 0.5 * inch
CONTENT_W = HALF_W - LMARGIN - RMARGIN
CONTENT_H = HALF_H - TMARGIN - BMARGIN

FONT_BODY = "Times-Roman"
FONT_ITAL = "Times-Italic"

def make_styles(font_size=11, leading=13):
    style_body = ParagraphStyle(
        "body", fontName=FONT_BODY, fontSize=font_size, leading=leading, alignment=TA_JUSTIFY
    )
    style_title = ParagraphStyle(
        "title", fontName=FONT_BODY, fontSize=18, leading=22, alignment=TA_CENTER, spaceAfter=10
    )
    style_h2 = ParagraphStyle(
        "h2", fontName=FONT_BODY, fontSize=13, leading=16, alignment=TA_LEFT, spaceAfter=6
    )
    return style_body, style_title, style_h2

# ------------------------ Helpers ------------------------
def measure_paragraph_height(text, width, style):
    if not text: return 0
    p = Paragraph(text, style)
    _, h = p.wrap(width, 10000)
    return h

def draw_paragraph(text, canv, x, y, width, style):
    if not text: return 0
    p = Paragraph(text, style)
    _, h = p.wrap(width, 10000)
    p.drawOn(canv, x, y - h)
    return h

def read_text(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()

def split_paragraphs(text):
    """
    Robust paragraph splitter:
    - Normalizes newlines across platforms (\r\n, \r -> \n)
    - Normalizes rare line separators and NBSPs
    - Splits on *blank* lines (handles lines with spaces/tabs)
    """
    # Normalize newlines
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Normalize Unicode LS and NBSP
    text = text.replace("\u2028", "\n").replace("\u00A0", " ")
    # Split on blank lines (2+ newlines with optional whitespace)
    paras = re.split(r'(?:\n[ \t]*){2,}', text)
    return [p.strip() for p in paras if p.strip()]

# ------------------------ Study Guide ------------------------
def parse_markdown_table(md_text):
    """Parse the first Markdown table encountered into rows (list of lists)."""
    rows, in_table = [], False
    for line in md_text.splitlines():
        if line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            # skip header underline like --- or :---
            if cells and set(cells[0]) == set("-"):
                continue
            rows.append(cells); in_table = True
        elif in_table:
            break
    return rows

def parse_md_questions(md_text):
    """Collect lines after a heading that starts with '### 2' (questions)."""
    qs, capture = [], False
    for line in md_text.splitlines():
        if line.strip().lower().startswith("### 2"):
            capture = True
            continue
        if capture and line.strip():
            qs.append(line.strip())
    return qs

# ------------------------ Pagination ------------------------
def paginate_pairs(pairs, content_w, content_h, style_body, pair_spacing):
    """Pack (es,en) pairs into *reading spreads* limited by CONTENT_H, using strict vertical alignment."""
    spreads, i = [], 0
    while i < len(pairs):
        used, start = 0, i
        while i < len(pairs):
            es, en = pairs[i]
            need = max(measure_paragraph_height(es, content_w, style_body),
                       measure_paragraph_height(en, content_w, style_body)) + pair_spacing
            if used + need > content_h:
                break
            used += need; i += 1
        if i == start:
            i += 1  # ensure progress even with very tall paragraphs
        spreads.append(pairs[start:i])
    return spreads

def layout_spread(spread_pairs, content_w, style_body, top_y, pair_spacing, bottom_limit):
    """Compute shared y-positions per bilingual pair for a single spread."""
    layout = []
    cursor = top_y
    for es, en in spread_pairs:
        h_es = measure_paragraph_height(es, content_w, style_body)
        h_en = measure_paragraph_height(en, content_w, style_body)
        max_h = max(h_es, h_en)
        layout.append({"y": cursor, "max_h": max_h, "h_es": h_es, "h_en": h_en})
        cursor -= (max_h + pair_spacing)
        if cursor < bottom_limit:
            break
    return layout

# ------------------------ BOOKLET builder (print/imposed) ------------------------
def build_booklet_pdf(en_path, es_path, aids_path, out_path, title, subtitle,
                      pair_spacing, draw_guides, font_size, leading, pad, toc_position):
    style_body, style_title, style_h2 = make_styles(font_size, leading)

    en_text = read_text(en_path); es_text = read_text(es_path); aids_md = read_text(aids_path)
    en_paras = split_paragraphs(en_text); es_paras = split_paragraphs(es_text)

    if len(en_paras) != len(es_paras):
        if pad:
            m = max(len(en_paras), len(es_paras))
            en_paras += [""] * (m - len(en_paras))
            es_paras += [""] * (m - len(es_paras))
        else:
            raise SystemExit(f"[ERROR] Paragraph counts differ (EN={len(en_paras)} vs ES={len(es_paras)}). Use --pad to allow padding.")

    pairs = list(zip(es_paras, en_paras))

    # Story spreads and shared layouts
    spreads = paginate_pairs(pairs, CONTENT_W, CONTENT_H, style_body, pair_spacing)
    spread_layouts = [layout_spread(sp, CONTENT_W, style_body, HALF_H - TMARGIN, pair_spacing, BMARGIN + 24)
                      for sp in spreads]

    # Study guide content
    vocab_rows = parse_markdown_table(aids_md)
    questions_lines = parse_md_questions(aids_md)

    # Page sequence (booklet half-pages)
    page_sequence = []

    # Pre-story singles
    pre_singles = [('single', 'cover')]
    if toc_position == "before":
        pre_singles.append(('single', 'toc'))

    # Ensure first story ES page is EVEN (next page after pre_singles should be even => len(pre_singles) must be odd)
    if len(pre_singles) % 2 == 0:
        pre_singles.append(('blank',))
    page_sequence.extend(pre_singles)

    # Story spreads: ES (even), EN (odd)
    for s_idx in range(len(spreads)):
        page_sequence.append(('story', s_idx, 'ES'))
        page_sequence.append(('story', s_idx, 'EN'))

    # Post-story singles (once)
    if vocab_rows:
        page_sequence.append(('single', 'study_vocab'))
    if questions_lines:
        page_sequence.append(('single', 'study_qs'))
    page_sequence.append(('single', 'back'))
    if toc_position == "after":
        page_sequence.append(('single', 'toc'))

    # Pad to multiple of 4 booklet pages
    P = len(page_sequence)
    while P % 4 != 0:
        page_sequence.append(('blank',))
        P += 1

    # Rendering helpers
    def center_title(canv, x0, y0, text):
        Pp = Paragraph(text, style_title); w, h = Pp.wrap(CONTENT_W, 10000)
        Pp.drawOn(canv, x0 + (CONTENT_W - w)/2.0, y0 - h - 24)

    def render_page(canv, p_num):
        token = page_sequence[p_num - 1]
        ox = HALF_W if (p_num % 2 == 1) else 0  # odd -> right, even -> left
        x0, y0 = ox + LMARGIN, HALF_H - TMARGIN

        kind = token[0]
        if kind == 'blank':
            return

        if kind == 'single':
            which = token[1]
            if which == 'cover':
                center_title(canv, x0, y0, title or "Bilingüe / Bilingual")
                sub = subtitle or "Lector paralelo / Parallel reader"
                P2 = Paragraph(sub, style_title); w2, h2 = P2.wrap(CONTENT_W, 10000)
                P2.drawOn(canv, x0 + (CONTENT_W - w2)/2.0, y0 - h2 - 60)
                return
            if which == 'toc':
                center_title(canv, x0, y0, "Contenido / Contents")
                cursor = y0 - 120
                for ln in ("Historia / Story", "Guía de estudio / Study Guide", "Notas / Notes"):
                    cursor -= draw_paragraph(ln, canv, x0, cursor, CONTENT_W, style_body) + 6
                return
            if which == 'study_vocab':
                center_title(canv, x0, y0, "Guía de estudio / Study Guide")
                cursor = y0 - 90
                if vocab_rows:
                    rows = [[r[0], r[1] if len(r) > 1 else ""] for r in vocab_rows]
                    table = Table(rows, colWidths=[CONTENT_W*0.5, CONTENT_W*0.5], repeatRows=1)
                    table.setStyle(TableStyle([
                        ("GRID",(0,0),(-1,-1),0.5, colors.black),
                        ("FONT",(0,0),(-1,-1), FONT_BODY, 11),
                        ("BACKGROUND",(0,0),(-1,0), colors.whitesmoke),
                        ("VALIGN",(0,0),(-1,-1),"TOP"),
                        ("ALIGN",(0,0),(-1,0),"CENTER"),
                    ]))
                    tw, th = table.wrap(CONTENT_W, 10000)
                    table.drawOn(canv, x0, cursor - th)
                return
            if which == 'study_qs':
                cursor = y0
                cursor -= draw_paragraph("<b>Preguntas / Questions</b>", canv, x0, cursor, CONTENT_W, style_h2) + 6
                for ln in questions_lines or []:
                    ph = draw_paragraph(ln, canv, x0, cursor, CONTENT_W, style_body)
                    cursor -= ph + 6
                    if cursor < (BMARGIN + 30): break
                return
            if which == 'back':
                center_title(canv, x0, y0, "Notas / Notes")
                return

        if kind == 'story':
            _, spread_idx, lang = token
            pairs_here = spreads[spread_idx]
            layout = spread_layouts[spread_idx]
            for j, (es, en) in enumerate(pairs_here):
                y_top = layout[j]["y"]; max_h = layout[j]["max_h"]
                text = es if lang == "ES" else en
                draw_paragraph(text, canv, x0, y_top, CONTENT_W, style_body)
                if draw_guides:
                    canv.setStrokeColor(colors.lightgrey); canv.setLineWidth(0.4)
                    canv.line(x0, y_top - max_h - 2, x0 + CONTENT_W, y_top - max_h - 2)

    # Build imposed PDF
    c = canvas.Canvas(out_path, pagesize=landscape(letter))
    num_sheets = P // 4
    for i in range(num_sheets):
        # Front
        L, R = P - 2*i, 1 + 2*i
        render_page(c, L); render_page(c, R)
        c.setFont(FONT_ITAL, 9)
        c.drawCentredString(HALF_W/2.0, 0.35*inch, f"ES/EN · p.{L}")
        c.drawCentredString(HALF_W + HALF_W/2.0, 0.35*inch, f"ES/EN · p.{R}")
        c.showPage()
        # Back
        Lb, Rb = 2 + 2*i, P - 1 - 2*i
        render_page(c, Lb); render_page(c, Rb)
        c.setFont(FONT_ITAL, 9)
        c.drawCentredString(HALF_W/2.0, 0.35*inch, f"ES/EN · p.{Lb}")
        c.drawCentredString(HALF_W + HALF_W/2.0, 0.35*inch, f"ES/EN · p.{Rb}")
        c.showPage()
    c.save()

# ------------------------ PROOF builder (reading layout) ------------------------
def build_proof_pdf(en_path, es_path, aids_path, out_path, title, subtitle,
                    pair_spacing, draw_guides, font_size, leading, pad, toc_position):
    style_body, style_title, style_h2 = make_styles(font_size, leading)

    en_text = read_text(en_path); es_text = read_text(es_path); aids_md = read_text(aids_path)
    en_paras = split_paragraphs(en_text); es_paras = split_paragraphs(es_text)

    if len(en_paras) != len(es_paras):
        if pad:
            m = max(len(en_paras), len(es_paras))
            en_paras += [""] * (m - len(en_paras))
            es_paras += [""] * (m - len(es_paras))
        else:
            raise SystemExit(f"[ERROR] Paragraph counts differ (EN={len(en_paras)} vs ES={len(es_paras)}). Use --pad to allow padding.")

    pairs = list(zip(es_paras, en_paras))

    # Story spreads and shared layouts
    spreads = paginate_pairs(pairs, CONTENT_W, CONTENT_H, style_body, pair_spacing)
    spread_layouts = [layout_spread(sp, CONTENT_W, style_body, HALF_H - TMARGIN, pair_spacing, BMARGIN + 24)
                      for sp in spreads]

    # Study guide content
    vocab_rows = parse_markdown_table(aids_md)
    questions_lines = parse_md_questions(aids_md)

    # Proof page list (reading order)
    pages = []
    # Pre-story single pages
    pages.append(('single', 'cover'))
    if toc_position == "before":
        pages.append(('single', 'toc'))
    # Story pages: each spread -> one page with ES left + EN right
    for s_idx in range(len(spreads)):
        pages.append(('spread', s_idx))
    # Post-story singles
    if vocab_rows:
        pages.append(('single', 'study_vocab'))
    if questions_lines:
        pages.append(('single', 'study_qs'))
    pages.append(('single', 'back'))
    if toc_position == "after":
        pages.append(('single', 'toc'))

    # Rendering helpers
    def center_title_full(canv, text):
        Pp = Paragraph(text, style_title); w, h = Pp.wrap(PAGE_W - (LMARGIN + RMARGIN), 10000)
        Pp.drawOn(canv, (PAGE_W - w)/2.0, PAGE_H - TMARGIN - h - 24)

    def render_proof_page(canv, token):
        kind = token[0]
        if kind == 'single':
            which = token[1]
            if which == 'cover':
                center_title_full(canv, title or "Bilingüe / Bilingual")
                sub = subtitle or "Lector paralelo / Parallel reader"
                P2 = Paragraph(sub, style_title); w2, h2 = P2.wrap(PAGE_W - (LMARGIN + RMARGIN), 10000)
                P2.drawOn(canv, (PAGE_W - w2)/2.0, PAGE_H - TMARGIN - h2 - 60)
                return
            if which == 'toc':
                center_title_full(canv, "Contenido / Contents")
                x0 = LMARGIN; y0 = PAGE_H - TMARGIN - 120
                cursor = y0
                for ln in ("Historia / Story", "Guía de estudio / Study Guide", "Notas / Notes"):
                    cursor -= draw_paragraph(ln, canv, x0, cursor, PAGE_W - (LMARGIN + RMARGIN), style_body) + 6
                return
            if which == 'study_vocab':
                center_title_full(canv, "Guía de estudio / Study Guide")
                x0 = LMARGIN; y0 = PAGE_H - TMARGIN - 90
                if vocab_rows:
                    rows = [[r[0], r[1] if len(r) > 1 else ""] for r in vocab_rows]
                    table = Table(rows, colWidths=[(PAGE_W - (LMARGIN + RMARGIN))*0.5]*2, repeatRows=1)
                    table.setStyle(TableStyle([
                        ("GRID",(0,0),(-1,-1),0.5, colors.black),
                        ("FONT",(0,0),(-1,-1), FONT_BODY, 11),
                        ("BACKGROUND",(0,0),(-1,0), colors.whitesmoke),
                        ("VALIGN",(0,0),(-1,-1),"TOP"),
                        ("ALIGN",(0,0),(-1,0),"CENTER"),
                    ]))
                    tw, th = table.wrap(PAGE_W - (LMARGIN + RMARGIN), 10000)
                    table.drawOn(canv, x0, y0 - th)
                return
            if which == 'study_qs':
                center_title_full(canv, "Preguntas / Questions")
                x0 = LMARGIN; cursor = PAGE_H - TMARGIN - 60
                for ln in questions_lines or []:
                    ph = draw_paragraph(ln, canv, x0, cursor, PAGE_W - (LMARGIN + RMARGIN), style_body)
                    cursor -= ph + 6
                    if cursor < (BMARGIN + 30): break
                return
            if which == 'back':
                center_title_full(canv, "Notas / Notes")
                return

        if kind == 'spread':
            _, s_idx = token
            pairs_here = spreads[s_idx]
            layout = spread_layouts[s_idx]
            # Left = ES column; Right = EN column
            x_es = LMARGIN
            x_en = HALF_W + LMARGIN
            for j, (es, en) in enumerate(pairs_here):
                y_top = layout[j]["y"]; max_h = layout[j]["max_h"]
                draw_paragraph(es, canv, x_es, y_top, CONTENT_W, style_body)
                draw_paragraph(en, canv, x_en, y_top, CONTENT_W, style_body)
                if draw_guides:
                    canv.setStrokeColor(colors.lightgrey); canv.setLineWidth(0.4)
                    canv.line(x_es, y_top - max_h - 2, x_es + CONTENT_W, y_top - max_h - 2)
                    canv.line(x_en, y_top - max_h - 2, x_en + CONTENT_W, y_top - max_h - 2)

    # Build proof PDF
    c = canvas.Canvas(out_path, pagesize=landscape(letter))
    page_num = 1
    for token in pages:
        render_proof_page(c, token)
        c.setFont(FONT_ITAL, 9)
        c.drawCentredString(PAGE_W/2.0, 0.35*inch, f"ES/EN · p.{page_num}")
        c.showPage()
        page_num += 1
    c.save()

# ------------------------ CLI ------------------------
def parse_args():
    ap = argparse.ArgumentParser(description="Build a parallel bilingual booklet (Spanish left / English right).")
    ap.add_argument("--en", required=True, help="English text file (.txt, paragraphs separated by blank lines)")
    ap.add_argument("--es", required=True, help="Spanish text file (.txt, paragraphs separated by blank lines)")
    ap.add_argument("--aids", required=True, help="Study guide Markdown (.md): first table=vocab; '### 2...' = questions")
    ap.add_argument("--out", default="Title_Flip_Bilingual_Booklet.pdf", help="Output PDF path")
    ap.add_argument("--title", default=None, help="Bilingual title for cover")
    ap.add_argument("--subtitle", default=None, help="Bilingual subtitle for cover")
    ap.add_argument("--pair-spacing", type=int, default=14, help="Spacing between bilingual pairs (pt)")
    ap.add_argument("--no-guides", action="store_true", help="Disable faint separators under each pair")
    ap.add_argument("--font-size", type=int, default=11, help="Body font size (pt)")
    ap.add_argument("--leading", type=int, default=13, help="Body leading (pt)")
    ap.add_argument("--pad", action="store_true", help="Pad shorter language if paragraph counts differ")
    ap.add_argument("--toc-position", choices=["before","after"], default="before",
                    help="Place TOC before or after story (booklet auto-pads to keep first story ES page even)")
    ap.add_argument("--format", choices=["booklet","proof"], default="booklet",
                    help="Output format: 'booklet' for print-imposed saddle-stitch; 'proof' for ES+EN on the same page")
    return ap.parse_args()

if __name__ == "__main__":
    args = parse_args()
    if args.format == "proof":
        build_proof_pdf(
            en_path=args.en, es_path=args.es, aids_path=args.aids, out_path=args.out,
            title=args.title, subtitle=args.subtitle,
            pair_spacing=args.pair_spacing, draw_guides=not args.no_guides,
            font_size=args.font_size, leading=args.leading, pad=args.pad, toc_position=args.toc_position
        )
    else:
        build_booklet_pdf(
            en_path=args.en, es_path=args.es, aids_path=args.aids, out_path=args.out,
            title=args.title, subtitle=args.subtitle,
            pair_spacing=args.pair_spacing, draw_guides=not args.no_guides,
            font_size=args.font_size, leading=args.leading, pad=args.pad, toc_position=args.toc_position
        )


