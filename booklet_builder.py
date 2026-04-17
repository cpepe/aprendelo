"""
Bilingual Booklet Builder
==========================
Generates a parallel bilingual PDF with the target language on the left
and English on the right. Supports two binding types:
  - saddle: print-ready saddle-staple imposed booklet
  - side_by_side: reading-order PDF with both languages on each page

Inspired by the reference script's approach to paragraph alignment and
layout, but written as an importable module for the web app.
"""

import io
import re
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
from reportlab.lib import colors

# ── Layout constants ─────────────────────────────────────────────────

PAGE_W, PAGE_H = landscape(letter)      # 11 × 8.5 in landscape
HALF_W = PAGE_W / 2.0
LMARGIN = RMARGIN = 0.5 * inch
TMARGIN = 0.6 * inch
BMARGIN = 0.6 * inch
CONTENT_W = HALF_W - LMARGIN - RMARGIN
CONTENT_H = PAGE_H - TMARGIN - BMARGIN

FONT_BODY = "Times-Roman"
FONT_BOLD = "Times-Bold"
FONT_ITAL = "Times-Italic"
FONT_SIZE = 11
LEADING = 14
PAIR_SPACING = 12


# ── Styles ───────────────────────────────────────────────────────────

def _body_style():
    return ParagraphStyle(
        "body", fontName=FONT_BODY, fontSize=FONT_SIZE,
        leading=LEADING, alignment=TA_JUSTIFY,
    )

def _title_style():
    return ParagraphStyle(
        "title", fontName=FONT_BOLD, fontSize=20,
        leading=24, alignment=TA_CENTER, spaceAfter=10,
    )


# ── Text processing ─────────────────────────────────────────────────

def _split_paragraphs(text):
    """Split text into paragraphs on blank lines, normalizing newlines."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\u2028", "\n").replace("\u00A0", " ")
    paras = re.split(r'(?:\n[ \t]*){2,}', text)
    return [p.strip() for p in paras if p.strip()]


def _measure(text, width, style):
    """Measure the height a paragraph would occupy."""
    if not text:
        return 0
    p = Paragraph(text, style)
    _, h = p.wrap(width, 99999)
    return h


def _draw(text, canv, x, y, width, style):
    """Draw a paragraph and return its height."""
    if not text:
        return 0
    p = Paragraph(text, style)
    _, h = p.wrap(width, 99999)
    p.drawOn(canv, x, y - h)
    return h


# ── Pagination ───────────────────────────────────────────────────────

def _paginate(pairs, content_w, content_h, style):
    """Group bilingual paragraph pairs into pages that fit content_h."""
    pages = []
    i = 0
    while i < len(pairs):
        used = 0
        start = i
        while i < len(pairs):
            target, english = pairs[i]
            need = max(
                _measure(target, content_w, style),
                _measure(english, content_w, style),
            ) + PAIR_SPACING
            if used + need > content_h and i > start:
                break
            used += need
            i += 1
        if i == start:
            i += 1  # force progress on oversized paragraphs
        pages.append(pairs[start:i])
    return pages


def _compute_layout(page_pairs, content_w, style, top_y):
    """Compute y-positions for each pair on a page, aligning both columns."""
    layout = []
    cursor = top_y
    for target, english in page_pairs:
        h_t = _measure(target, content_w, style)
        h_e = _measure(english, content_w, style)
        max_h = max(h_t, h_e)
        layout.append({"y": cursor, "max_h": max_h})
        cursor -= (max_h + PAIR_SPACING)
    return layout


# ── Footer ───────────────────────────────────────────────────────────

def _draw_footer(canv, page_num, x_center, lang_label="ES/EN"):
    canv.setFont(FONT_ITAL, 9)
    canv.drawCentredString(x_center, 0.35 * inch, f"{lang_label} · p.{page_num}")


# ── Language labels ──────────────────────────────────────────────────

LANG_CODES = {
    "Spanish": "ES",
    "Italian": "IT",
    "German": "DE",
    "French": "FR",
    "English": "EN"
}


# ── Side-by-side (proof) builder ─────────────────────────────────────

def _build_side_by_side(en_text, target_text, target_lang):
    """Build a reading-layout PDF: target language left, English right."""
    style = _body_style()
    title_style = _title_style()

    en_paras = _split_paragraphs(en_text)
    tgt_paras = _split_paragraphs(target_text)

    # Pad to equal length
    maxlen = max(len(en_paras), len(tgt_paras))
    en_paras += [""] * (maxlen - len(en_paras))
    tgt_paras += [""] * (maxlen - len(tgt_paras))

    pairs = list(zip(tgt_paras, en_paras))
    pages = _paginate(pairs, CONTENT_W, CONTENT_H - 40, style)

    lang_code = LANG_CODES.get(target_lang, "TL")
    lang_label = f"{lang_code}/EN"

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(letter))

    # ── Cover page ──
    title = f"Bilingual Reader — {target_lang} / English"
    p = Paragraph(title, title_style)
    w, h = p.wrap(PAGE_W - 2 * LMARGIN, 99999)
    p.drawOn(c, (PAGE_W - w) / 2.0, PAGE_H / 2.0)
    _draw_footer(c, 1, PAGE_W / 2.0, lang_label)
    c.showPage()

    # ── Content pages ──
    page_num = 2
    for page_pairs in pages:
        layout = _compute_layout(page_pairs, CONTENT_W, style, PAGE_H - TMARGIN)
        x_left = LMARGIN
        x_right = HALF_W + LMARGIN

        # Column headers
        c.setFont(FONT_BOLD, 9)
        c.setFillColor(colors.Color(0.4, 0.4, 0.4))
        c.drawString(x_left, PAGE_H - TMARGIN + 8, target_lang)
        c.drawString(x_right, PAGE_H - TMARGIN + 8, "English")
        c.setFillColor(colors.black)

        # Center divider line
        c.setStrokeColor(colors.Color(0.85, 0.85, 0.85))
        c.setLineWidth(0.5)
        c.line(HALF_W, TMARGIN, HALF_W, PAGE_H - TMARGIN + 4)

        for j, (target, english) in enumerate(page_pairs):
            y = layout[j]["y"]
            _draw(target, c, x_left, y, CONTENT_W, style)
            _draw(english, c, x_right, y, CONTENT_W, style)

        _draw_footer(c, page_num, PAGE_W / 2.0, lang_label)
        c.showPage()
        page_num += 1

    c.save()
    buf.seek(0)
    return buf.read()


# ── Saddle-staple booklet builder ────────────────────────────────────

def _build_saddle(en_text, target_text, target_lang):
    """Build a print-imposed saddle-staple booklet PDF."""
    style = _body_style()
    title_style = _title_style()

    en_paras = _split_paragraphs(en_text)
    tgt_paras = _split_paragraphs(target_text)

    maxlen = max(len(en_paras), len(tgt_paras))
    en_paras += [""] * (maxlen - len(en_paras))
    tgt_paras += [""] * (maxlen - len(tgt_paras))

    pairs = list(zip(tgt_paras, en_paras))
    spreads = _paginate(pairs, CONTENT_W, CONTENT_H - 40, style)
    spread_layouts = [
        _compute_layout(sp, CONTENT_W, style, PAGE_H - TMARGIN)
        for sp in spreads
    ]

    lang_code = LANG_CODES.get(target_lang, "TL")
    lang_label = f"{lang_code}/EN"

    # Build page sequence: cover, then alternating target/english pages
    page_sequence = []
    page_sequence.append(("cover",))

    # Ensure first target-language story page lands on an even slot
    if len(page_sequence) % 2 == 0:
        page_sequence.append(("blank",))

    for s_idx in range(len(spreads)):
        page_sequence.append(("story", s_idx, "TL"))
        page_sequence.append(("story", s_idx, "EN"))

    # Pad to multiple of 4
    while len(page_sequence) % 4 != 0:
        page_sequence.append(("blank",))

    P = len(page_sequence)

    def render_page(canv, p_num):
        token = page_sequence[p_num - 1]
        ox = HALF_W if (p_num % 2 == 1) else 0
        x0 = ox + LMARGIN
        y0 = PAGE_H - TMARGIN

        kind = token[0]
        if kind == "blank":
            return
        if kind == "cover":
            title = f"Bilingual Reader"
            sub = f"{target_lang} / English"
            p1 = Paragraph(title, title_style)
            w1, h1 = p1.wrap(CONTENT_W, 99999)
            p1.drawOn(canv, x0 + (CONTENT_W - w1) / 2.0, y0 - h1 - 40)
            p2 = Paragraph(sub, title_style)
            w2, h2 = p2.wrap(CONTENT_W, 99999)
            p2.drawOn(canv, x0 + (CONTENT_W - w2) / 2.0, y0 - h1 - h2 - 70)
            return
        if kind == "story":
            _, spread_idx, lang = token
            pairs_here = spreads[spread_idx]
            layout = spread_layouts[spread_idx]
            for j, (target, english) in enumerate(pairs_here):
                y = layout[j]["y"]
                text = target if lang == "TL" else english
                _draw(text, canv, x0, y, CONTENT_W, style)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=landscape(letter))
    num_sheets = P // 4

    for i in range(num_sheets):
        # Front side
        L, R = P - 2 * i, 1 + 2 * i
        render_page(c, L)
        render_page(c, R)
        c.setFont(FONT_ITAL, 9)
        c.drawCentredString(HALF_W / 2.0, 0.35 * inch, f"{lang_label} · p.{L}")
        c.drawCentredString(HALF_W + HALF_W / 2.0, 0.35 * inch, f"{lang_label} · p.{R}")
        c.showPage()

        # Back side
        Lb, Rb = 2 + 2 * i, P - 1 - 2 * i
        render_page(c, Lb)
        render_page(c, Rb)
        c.setFont(FONT_ITAL, 9)
        c.drawCentredString(HALF_W / 2.0, 0.35 * inch, f"{lang_label} · p.{Lb}")
        c.drawCentredString(HALF_W + HALF_W / 2.0, 0.35 * inch, f"{lang_label} · p.{Rb}")
        c.showPage()

    c.save()
    buf.seek(0)
    return buf.read()


# ── Public API ───────────────────────────────────────────────────────

def build_bilingual_pdf(en_text, target_text, binding_type="side_by_side", target_lang="Spanish"):
    """
    Build a bilingual PDF.

    Args:
        en_text: English text (paragraphs separated by blank lines)
        target_text: Target language text (same paragraph structure)
        binding_type: 'saddle' or 'side_by_side'
        target_lang: 'Spanish', 'German', or 'French'

    Returns:
        PDF file contents as bytes.
    """
    if binding_type == "saddle":
        return _build_saddle(en_text, target_text, target_lang)
    else:
        return _build_side_by_side(en_text, target_text, target_lang)
