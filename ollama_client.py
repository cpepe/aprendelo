"""
Ollama REST API Client
=======================
Thin wrapper around the Ollama local API at http://localhost:11434.
No litellm — direct HTTP calls via requests.
"""

import json
import re
import requests

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
