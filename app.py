"""
Aprendelo — Spanish Learning Web Application
=============================================
Flask backend serving the SPA and all API endpoints:
  - Flashcards
  - Verb Conjugation
  - AI Chat (Ollama)
  - Translation (Ollama)
  - Sentence Builder (Ollama)
  - Adaptive Quiz (Ollama)
"""

import json
import os
import random

from flask import (
    Flask, Response, jsonify, render_template, request, stream_with_context,
)
import re
from ollama_client import (
    list_models, chat_stream, translate_text, generate_sentence_exercise,
    evaluate_sentence, generate_quiz_section, evaluate_quiz_section,
)

# ── App setup ────────────────────────────────────────────────────────

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB upload limit

# ── Page routes ──────────────────────────────────────────────────────

@app.route("/")
def index():
    """Serve the application with local features enabled."""
    index_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")
    try:
        with open(index_path, "r", encoding="utf-8") as f:
            html = f.read()
            
        # Strip disabled placeholders
        html = re.sub(r'<div class="local-disabled-message.*?</div>', '', html, flags=re.DOTALL)
        
        # Strip the local-only boundary markers
        html = html.replace('<!-- %LOCAL_ONLY_START% -->\n', '')
        html = html.replace('<!-- %LOCAL_ONLY_END% -->\n', '')
        html = html.replace('<!-- %LOCAL_ONLY_START% -->', '')
        html = html.replace('<!-- %LOCAL_ONLY_END% -->', '')
        
        return html
    except Exception as e:
        return f"Error loading index.html: {str(e)}", 500


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



# ── Sentence Builder API ───────────────────────────────────────────


@app.route("/api/sentence-builder/generate", methods=["POST"])
def sentence_builder_generate():
    """
    Generate a new sentence construction exercise.
    Expects JSON: { "topic": "...", "proficiency": "...", "model": "..." }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    topic = data.get("topic", "").strip()
    proficiency = data.get("proficiency", "B1")
    model = data.get("model", "")

    if not model:
        return jsonify({"error": "Please select a model."}), 400

    try:
        exercise = generate_sentence_exercise(model, topic, proficiency)

        # Persist the generated sentence pair to flash-phrases-{proficiency}.json
        phrases_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", f"flash-phrases-{proficiency}.json")
        try:
            phrases = {}
            if os.path.exists(phrases_path):
                with open(phrases_path, "r", encoding="utf-8") as f:
                    phrases = json.load(f)
            english = exercise.get("english_translation", "")
            spanish = exercise.get("test_sentence", "")
            if english and spanish and english not in phrases:
                phrases[english] = spanish
                with open(phrases_path, "w", encoding="utf-8") as f:
                    json.dump(phrases, f, indent=2, ensure_ascii=False)
        except Exception:
            pass  # Non-fatal — don't break the exercise if persistence fails

        return jsonify(exercise)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sentence-builder/evaluate", methods=["POST"])
def sentence_builder_evaluate():
    """
    Evaluate the user's sentence.
    Expects JSON: { "english_translation": "...", "user_sentence": "...", "proficiency": "...", "model": "...", "words_provided": [...] }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    english_translation = data.get("english_translation", "").strip()
    user_sentence = data.get("user_sentence", "").strip()
    proficiency = data.get("proficiency", "B1")
    model = data.get("model", "")
    words_provided = data.get("words_provided", [])

    if not english_translation or not user_sentence:
        return jsonify({"error": "Missing prompt or user sentence."}), 400
    if not model:
        return jsonify({"error": "Please select a model."}), 400

    try:
        evaluation = evaluate_sentence(model, english_translation, user_sentence, proficiency, words_provided)
        return jsonify(evaluation)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Adaptive Quiz API ───────────────────────────────────────────────


@app.route("/api/quiz/generate", methods=["POST"])
def quiz_generate():
    """
    Generate a 10-question adaptive quiz section.
    Expects JSON: { "topic": "...", "proficiency": "...", "model": "..." }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    topic = data.get("topic", "").strip()
    proficiency = data.get("proficiency", "B1")
    model = data.get("model", "")

    if not model:
        return jsonify({"error": "Please select a model in Settings."}), 400

    try:
        quiz = generate_quiz_section(model=model, topic=topic, proficiency=proficiency)
        return jsonify(quiz)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/quiz/evaluate", methods=["POST"])
def quiz_evaluate():
    """
    Evaluate student answers for a 10-question section.
    Expects JSON: {
      "model": "...",
      "topic": "...",
      "proficiency": "...",
      "questions": [...],
      "answers": { "1": "...", ... }
    }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    topic = data.get("topic", "").strip()
    proficiency = data.get("proficiency", "B1")
    model = data.get("model", "")
    questions = data.get("questions", [])
    answers = data.get("answers", {})

    if not model:
        return jsonify({"error": "Please select a model in Settings."}), 400
    if not questions:
        return jsonify({"error": "No questions provided to evaluate."}), 400

    try:
        result = evaluate_quiz_section(
            model=model,
            topic=topic,
            target_level=proficiency,
            questions=questions,
            user_answers=answers,
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Main ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("── Aprendelo ──")
    print("   Operating in Hybrid Static/Local mode")
    print(f"   Checking Ollama... ", end="")
    models = list_models()
    if models:
        print(f"found {len(models)} model(s): {', '.join(models)}")
    else:
        print("not available (chat/translation will not work)")
    print("   Starting on http://localhost:5000")
    app.run(debug=True, port=5000)
