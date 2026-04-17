"""
Aprendelo — Spanish Learning Web Application
=============================================
Flask backend serving the SPA and all API endpoints:
  - Flashcards
  - Verb Conjugation
  - AI Chat (Ollama)
  - Bilingual Booklet Builder (PDF)
"""

import json
import os
import random
import tempfile

from flask import (
    Flask, Response, jsonify, render_template, request, send_file, stream_with_context,
)

from conjugator import conjugate, get_supported_tenses
from ollama_client import list_models, chat_stream, translate_text, restructure_for_translation
from booklet_builder import build_bilingual_pdf

# ── App setup ────────────────────────────────────────────────────────

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB upload limit

FLASHCARD_DATA_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "flashcards.json"
)


def load_flashcards():
    """Load vocabulary from the flat key-value JSON file."""
    try:
        with open(FLASHCARD_DATA_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Warning: Could not load flashcards: {e}")
        return {}


FLASHCARDS = load_flashcards()

# ── Page routes ──────────────────────────────────────────────────────


@app.route("/")
def index():
    """Serve the single-page application."""
    return render_template("index.html")


# ── Flashcard API ────────────────────────────────────────────────────


@app.route("/api/flashcard/get_card")
def get_flashcard():
    """Return a random flashcard word pair."""
    if not FLASHCARDS:
        return jsonify({"error": "No flashcard data available."}), 500

    spanish = random.choice(list(FLASHCARDS.keys()))
    english = FLASHCARDS[spanish]
    return jsonify({"spanish": spanish, "english": english})


# ── Conjugation API ──────────────────────────────────────────────────


@app.route("/api/conjugation/tenses")
def get_tenses():
    """Return the list of supported tenses."""
    return jsonify({"tenses": get_supported_tenses()})


@app.route("/api/conjugation/conjugate", methods=["POST"])
def conjugate_verb():
    """Conjugate a verb in the specified tense."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    verb = data.get("verb", "").strip()
    tense = data.get("tense", "").strip()

    if not verb:
        return jsonify({"error": "Please provide a verb."}), 400
    if not tense:
        return jsonify({"error": "Please provide a tense."}), 400

    try:
        result = conjugate(verb, tense)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


# ── Ollama model listing ────────────────────────────────────────────


@app.route("/api/models")
def get_models():
    """Return list of installed Ollama models."""
    models = list_models()
    return jsonify({"models": models})


# ── Chat API (SSE streaming) ────────────────────────────────────────




@app.route("/api/chat/send", methods=["POST"])
def chat_send():
    """
    Stream a chat response from Ollama via Server-Sent Events.
    Expects JSON: { "message": "...", "history": [...], "model": "...", "proficiency": "..." }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    user_message = data.get("message", "").strip()
    history = data.get("history", [])
    model = data.get("model", "")
    proficiency = data.get("proficiency", "B1")

    if not user_message:
        return jsonify({"error": "Message cannot be empty."}), 400
    if not model:
        return jsonify({"error": "Please select a model."}), 400

    dynamic_system_prompt = (
        "You are a friendly, patient native Spanish speaker helping an English speaker "
        "learn Spanish through conversation. "
        f"Your student's current proficiency level is {proficiency} "
        "(A1=Beginner, A2=Elementary, B1=Intermediate, B2=Upper Intermediate, C1=Advanced, C2=Mastery). "
        "Respond ONLY in Spanish, and STRICTLY limit your vocabulary, grammar, and sentence complexity "
        f"to match the {proficiency} level. Do not use English translations. "
        "If the user makes a noticeable grammar or vocabulary error, gently correct "
        "them by showing the correct Spanish form in parentheses or with a brief explanation in Spanish. "
        "Suggest new vocabulary when natural. Keep replies conversational and encouraging. "
        "Even if the user writes in English, you must respond entirely in Spanish."
    )

    # Build message list with system prompt + history + new message
    messages = [{"role": "system", "content": dynamic_system_prompt}]
    for msg in history:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    messages.append({"role": "user", "content": user_message})

    def generate():
        for chunk in chat_stream(model, messages):
            # SSE format: data: <text>\n\n
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Translator API (SSE streaming) ──────────────────────────────────


@app.route("/api/translate/stream", methods=["POST"])
def translate_stream():
    """
    Stream a translation response from Ollama via Server-Sent Events.
    Expects JSON: { "text": "...", "source_lang": "...", "target_lang": "...", "model": "...", "proficiency": "..." }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    text = data.get("text", "").strip()
    source_lang = data.get("source_lang", "Auto-detect")
    target_lang = data.get("target_lang", "Spanish")
    model = data.get("model", "")
    proficiency = data.get("proficiency", "B1")

    if not text:
        return jsonify({"error": "Text cannot be empty."}), 400
    if not model:
        return jsonify({"error": "Please select a model."}), 400

    if source_lang.lower() == "auto-detect" or not source_lang:
        source_instruction = f"detect the language of the following text and translate it to {target_lang}"
    else:
        source_instruction = f"translate the following text from {source_lang} to {target_lang}"

    system_prompt = (
        f"You are a professional translator. {source_instruction.capitalize()}. "
        f"Target the translation at a {proficiency} CEFR proficiency level — "
        f"use vocabulary and grammar structures appropriate for that level. "
        f"Preserve paragraph structure exactly. Do not add any commentary, notes, or explanations. "
        f"Output ONLY the translated text."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": text}
    ]

    def generate():
        for chunk in chat_stream(model, messages):
            # SSE format: data: <text>\n\n
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Booklet Builder API ─────────────────────────────────────────────


@app.route("/api/booklet/build", methods=["POST"])
def build_booklet():
    """
    Build a bilingual PDF booklet.
    Expects multipart form data:
      - proficiency: A1, A2, B1, B2, C1
      - target_lang: Spanish, German, French
      - english_file: .txt file upload
      - target_file: (optional) .txt file upload
      - binding_type: saddle | side_by_side
      - model: Ollama model name (required if no target_file)
    """
    proficiency = request.form.get("proficiency", "B1")
    target_lang = request.form.get("target_lang", "Spanish")
    binding_type = request.form.get("binding_type", "side_by_side")
    model = request.form.get("model", "")
    skip_restructure = request.form.get("skip_restructure", "false") == "true"

    # Read English text file
    english_file = request.files.get("english_file")
    if not english_file:
        return jsonify({"error": "Please upload an English text file."}), 400

    try:
        en_text = english_file.read().decode("utf-8").strip()
    except Exception:
        return jsonify({"error": "Could not read the English file. Ensure it is a UTF-8 text file."}), 400

    if not en_text:
        return jsonify({"error": "The English text file is empty."}), 400

    # Read optional target language file
    target_file = request.files.get("target_file")
    target_text = None
    if target_file and target_file.filename:
        try:
            target_text = target_file.read().decode("utf-8").strip()
        except Exception:
            return jsonify({"error": "Could not read the target language file."}), 400

    # If no target text provided, restructure English then translate via Ollama
    if not target_text:
        if not model:
            return jsonify({
                "error": "Please select a model for translation, or upload a target language file."
            }), 400
        try:
            # Step 1: Restructure English into simple, single-idea paragraphs
            # for better translation alignment (unless skipped by user)
            if not skip_restructure:
                en_text = restructure_for_translation(model, en_text)
        except RuntimeError as e:
            return jsonify({"error": f"Text restructuring failed: {str(e)}"}), 500
        try:
            # Step 2: Translate the restructured text
            target_text = translate_text(
                model=model,
                text=en_text,
                source_lang="English",
                target_lang=target_lang,
                proficiency=proficiency,
            )
        except RuntimeError as e:
            return jsonify({"error": str(e)}), 500

    if not target_text:
        return jsonify({"error": "Translation produced empty output."}), 500

    # Build PDF
    try:
        pdf_bytes = build_bilingual_pdf(
            en_text=en_text,
            target_text=target_text,
            binding_type=binding_type,
            target_lang=target_lang,
        )
    except Exception as e:
        return jsonify({"error": f"PDF generation failed: {str(e)}"}), 500

    # Write to temp file and send
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp.write(pdf_bytes)
    tmp.close()

    lang_code = target_lang[:2].upper()
    filename = f"bilingual_{lang_code}_EN_{binding_type}.pdf"

    return send_file(
        tmp.name,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


# ── Main ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("── Aprendelo ──")
    print(f"   Loaded {len(FLASHCARDS)} flashcard words")
    print(f"   Checking Ollama... ", end="")
    models = list_models()
    if models:
        print(f"found {len(models)} model(s): {', '.join(models)}")
    else:
        print("not available (chat/translation will not work)")
    print("   Starting on http://localhost:5000")
    app.run(debug=True, port=5000)
