"""
Ollama REST API Client
=======================
Thin wrapper around the Ollama local API at http://localhost:11434.
No litellm — direct HTTP calls via requests.
"""

import json
import re
import requests
import random

OLLAMA_BASE = "http://localhost:11434"


def _chunk_text(text, max_paras=5):
    """Split text into chunks of paragraphs."""
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    paras = re.split(r'(?:\n[ \t]*){2,}', text)
    paras = [p.strip() for p in paras if p.strip()]
    
    chunks = []
    for i in range(0, len(paras), max_paras):
        chunks.append("\n\n".join(paras[i:i + max_paras]))
    return chunks


def list_models():
    """
    Query Ollama for installed models.
    Returns a list of model name strings.
    """
    try:
        resp = requests.get(f"{OLLAMA_BASE}/api/tags", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        return [m["name"] for m in data.get("models", [])]
    except requests.ConnectionError:
        return []
    except Exception:
        return []


def chat_stream(model, messages):
    """
    Send a chat request to Ollama and yield response chunks as they arrive.

    Args:
        model: model name string (e.g. 'llama3')
        messages: list of {role, content} dicts

    Yields:
        str chunks of the assistant's response text.
    """
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
    }
    try:
        resp = requests.post(
            f"{OLLAMA_BASE}/api/chat",
            json=payload,
            stream=True,
            timeout=120,
        )
        resp.raise_for_status()
        for line in resp.iter_lines(decode_unicode=True):
            if line:
                try:
                    chunk = json.loads(line)
                    content = chunk.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if chunk.get("done", False):
                        return
                except json.JSONDecodeError:
                    continue
    except requests.ConnectionError:
        yield "[Error: Cannot connect to Ollama. Is it running on localhost:11434?]"
    except Exception as e:
        yield f"[Error: {str(e)}]"


def restructure_for_translation(model, text):
    """
    Restructure English text into simple, short paragraphs optimized for
    1:1 bilingual alignment. Each paragraph should contain a single idea
    or sentence, making it easy to translate and align side-by-side.

    Args:
        model: Ollama model name
        text: raw English text

    Returns:
        Restructured English text with one idea per paragraph, separated
        by blank lines.
    """
    system_prompt = (
        "You rewrite text. You do not summarize. You do not answer questions. "
        "You always output the full rewritten text and nothing else."
    )

    chunks = _chunk_text(text, max_paras=5)
    restructured_chunks = []

    for chunk in chunks:
        user_message = (
            "Rewrite the following text in simple, modern English. "
            "Put each sentence on its own line with a blank line between sentences. "
            "Keep every detail and the full story. Do not shorten or summarize.\n\n"
            f"{chunk}"
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
        }

        try:
            resp = requests.post(
                f"{OLLAMA_BASE}/api/chat",
                json=payload,
                timeout=300,
            )
            resp.raise_for_status()
            data = resp.json()
            rewritten_chunk = data.get("message", {}).get("content", "").strip()
            if rewritten_chunk:
                restructured_chunks.append(rewritten_chunk)
        except requests.ConnectionError:
            raise RuntimeError("Cannot connect to Ollama. Is it running on localhost:11434?")
        except Exception as e:
            raise RuntimeError(f"Text restructuring failed: {str(e)}")

    return "\n\n".join(restructured_chunks)


def translate_text(model, text, source_lang, target_lang, proficiency="B1"):
    """
    Translate text using Ollama. Returns the full translated string.

    Args:
        model: model name
        text: source text to translate
        source_lang: e.g. 'English'
        target_lang: e.g. 'Spanish'
        proficiency: CEFR level (A1-C1) to calibrate vocabulary complexity

    Returns:
        Translated text as a string.
    """
    chunks = _chunk_text(text, max_paras=5)
    translated_chunks = []

    for chunk in chunks:
        system_prompt = (
            f"You are a professional translator. Translate the following text from "
            f"{source_lang} to {target_lang}. "
            f"Target the translation at a {proficiency} CEFR proficiency level — "
            f"use vocabulary and grammar structures appropriate for that level. "
            f"Preserve paragraph structure exactly: each paragraph in the source "
            f"must correspond to exactly one paragraph in the translation, separated "
            f"by blank lines. Do not add any commentary, notes, or explanations. "
            f"Output ONLY the translated text."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": chunk},
        ]

        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
        }

        try:
            resp = requests.post(
                f"{OLLAMA_BASE}/api/chat",
                json=payload,
                timeout=300,  # translation can be slow for long texts
            )
            resp.raise_for_status()
            data = resp.json()
            translated_chunk = data.get("message", {}).get("content", "").strip()
            if translated_chunk:
                translated_chunks.append(translated_chunk)
        except requests.ConnectionError:
            raise RuntimeError("Cannot connect to Ollama. Is it running on localhost:11434?")
        except Exception as e:
            raise RuntimeError(f"Translation failed: {str(e)}")

    return "\n\n".join(translated_chunks)


def generate_sentence_exercise(model, topic, proficiency="B1"):
    """
    Generates a sentence translation exercise based on a topic/verb and CEFR level.
    Returns JSON containing 'english_translation', 'test_sentence', and 'words' (jumbled with distractors).
    """
    if not topic:
        random_seeds = ["hablar", "comer", "vivir", "ser", "estar", "ir", "tener", "hacer", "viajar", "familia", "comida", "trabajo", "escuela", "tiempo", "ciudad", "amigo", "poder", "decir", "ver", "dar"]
        topic = random.choice(random_seeds)

    system_prompt = (
        "You are a Spanish tutor generating a sentence construction exercise. "
        f"Generate a single natural, idiomatic Spanish sentence related to the topic/verb provided by the user. "
        f"Then, provide a prompt in English to help the user understand the context. Target a {proficiency} CEFR proficiency level for vocabulary and grammar. "
        "Output ONLY valid JSON with the following structure:\n"
        "{\n"   
        '  "english_translation": "The english sentence",\n'
        '  "test_sentence": "La oración en español",\n'
        '  "words": ["la", "oración", "en", "español", "distractor1", "distractor2"]\n'
        "}\n"
        "CRITICAL INSTRUCTIONS:\n"
        "1. Ensure ALL words from the 'test_sentence' are exactly included in the 'words' array.\n"
        "2. Add 2 to 4 additional words as distractors. These must be relevant to the topic but cannot be used to form a correct, cohesive sentence.\n"
        "3. Ensure the 'words' array is randomly jumbled.\n"
        "Output nothing but the JSON object."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Topic/Verb: {topic}"},
    ]

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "format": "json"
    }

    try:
        resp = requests.post(
            f"{OLLAMA_BASE}/api/chat",
            json=payload,
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data.get("message", {}).get("content", "").strip()
        # Parse and return JSON
        try:
            exercise = json.loads(content)
            # Ensure the words array is actually shuffled by python just in case
            if "words" in exercise and isinstance(exercise["words"], list):
                random.shuffle(exercise["words"])
            print(exercise)
            return exercise
        except json.JSONDecodeError:
            raise RuntimeError("LLM did not return valid JSON.")
    except requests.ConnectionError:
        raise RuntimeError("Cannot connect to Ollama. Is it running on localhost:11434?")
    except Exception as e:
        raise RuntimeError(f"Failed to generate exercise: {str(e)}")


def evaluate_sentence(model, english_translation, user_sentence, proficiency="B1", words_provided=None):
    """
    Evaluates the user's Spanish sentence against the English prompt.
    Returns JSON containing 'correct' (bool), 'feedback' (str), and 'correction' (str).
    """
    if words_provided is None:
        words_provided = []
        
    system_prompt = (
        "You are a Spanish tutor evaluating a student's translation. "
        "The student was given an English prompt to translate into Spanish. "
        f"Their CEFR level is {proficiency}. "
        f"IMPORTANT CONTEXT: The student was ONLY given the following jumbled words to build their sentence: {words_provided}. "
        "You are grading BOTH the student's attempt AND the sentence generator. "
        "If the student built the best possible sentence using the provided words, even if it is slightly incorrect or missing words (like 'que', 'de', etc.) because the generator forgot to provide them, do NOT penalize the student. Set 'correct' to true and acknowledge the missing words in the feedback. "
        "If the student made a genuine mistake using the provided words, set 'correct' to false, explain the error gently in English, and provide the ideal correction. "
        "Allow for natural Spanish flexibility (e.g., dropped pronouns, flexible word order, valid synonyms). "
        "Output ONLY valid JSON with the following structure:\n"
        "{\n"
        '  "correct": true|false,\n'
        '  "feedback": "Explanation of what was good or what went wrong.",\n'
        '  "correction": "The ideal Spanish sentence."\n'
        "}\n"
        "Output nothing but the JSON object."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"English Prompt: {english_translation}\nUser Translation: {user_sentence}"},
    ]

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "format": "json"
    }

    try:
        resp = requests.post(
            f"{OLLAMA_BASE}/api/chat",
            json=payload,
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data.get("message", {}).get("content", "").strip()
        # Parse and return JSON
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            raise RuntimeError("LLM did not return valid JSON.")
    except requests.ConnectionError:
        raise RuntimeError("Cannot connect to Ollama. Is it running on localhost:11434?")
    except Exception as e:
        raise RuntimeError(f"Failed to evaluate sentence: {str(e)}")
