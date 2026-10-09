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
    The LLM returns 'english_translation', 'test_sentence', and 'distractors'.
    Python then splits test_sentence into words, merges with distractors, and shuffles.
    Returns JSON containing 'english_translation', 'test_sentence', and 'words'.
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
        '  "distractors": ["falsa1", "falsa2", "falsa3", "falsa4"]\n'
        "}\n"
        "CRITICAL INSTRUCTIONS:\n"
        "1. The 'test_sentence' must be a complete, grammatically correct Spanish sentence.\n"
        "2. Provide 4 to 8 distractor words in the 'distractors' array. These must be real Spanish words relevant to the topic but must NOT appear in the test_sentence.\n"
        "3. Distractors should be plausible but must not allow a second valid sentence to be formed.\n"
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
        try:
            exercise = json.loads(content)

            # Build the word list deterministically from the test_sentence
            test_sentence = exercise.get("test_sentence", "")
            sentence_words = test_sentence.split()
            distractors = exercise.get("distractors", [])

            # Combine sentence words + distractors and shuffle
            all_words = sentence_words + distractors
            random.shuffle(all_words)

            # Return a clean response with the python-built words list
            result = {
                "english_translation": exercise.get("english_translation", ""),
                "test_sentence": test_sentence,
                "words": all_words,
            }
            print(result)
            return result
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


CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]


def get_next_cefr_level(current_level, accuracy):
    """
    Determine next CEFR level based on section accuracy:
    >= 75%: step up one level (capped at C2)
    < 50%: step down one level (floored at A1)
    otherwise: stay at current level
    """
    if current_level not in CEFR_LEVELS:
        current_level = "B1"
    idx = CEFR_LEVELS.index(current_level)
    if accuracy >= 75:
        next_idx = min(idx + 1, len(CEFR_LEVELS) - 1)
        action = "increase" if next_idx > idx else "maintain"
    elif accuracy < 50:
        next_idx = max(idx - 1, 0)
        action = "decrease" if next_idx < idx else "maintain"
    else:
        next_idx = idx
        action = "maintain"
    return CEFR_LEVELS[next_idx], action


def generate_quiz_section(model, topic="", proficiency="B1"):
    """
    Generate a 10-question adaptive quiz section with mixed question formats
    (multiple choice, fill-in-the-blank, short answer) tailored to CEFR level.
    """
    if not topic:
        topic = f"General Spanish language skills, grammar, and vocabulary for CEFR {proficiency}"

    system_prompt = (
        "You are an expert Spanish language educator. Create a comprehensive, engaging 10-question quiz section "
        f"for an English speaker learning Spanish at the CEFR {proficiency} level. "
        f"The quiz topic is: '{topic}'. "
        "Questions must span grammar, vocabulary, reading comprehension, and syntax. "
        "Each section must contain a balanced mixture of question types:\n"
        "- 4 Multiple Choice ('multiple_choice'): Provide a question prompt, exactly 4 distinct plausible options, the correct answer, and an instructional explanation.\n"
        "- 3 Fill-in-the-Blank ('fill_in_blank'): Provide a context sentence with '___', an optional clue/hint (e.g., verb infinitive to conjugate), the exact correct answer, and an explanation.\n"
        "- 3 Short Answer / Translation ('short_answer'): Provide an English phrase to translate to Spanish or a direct question in Spanish requiring a short sentence/phrase response, the correct answer, and an explanation.\n\n"
        "Output ONLY valid JSON formatted as follows:\n"
        "{\n"
        f'  "topic": "{topic}",\n'
        f'  "target_level": "{proficiency}",\n'
        '  "questions": [\n'
        '    {\n'
        '      "id": 1,\n'
        '      "type": "multiple_choice",\n'
        '      "question": "¿Cuál es la forma correcta de...?",\n'
        '      "options": ["opción A", "opción B", "opción C", "opción D"],\n'
        '      "correct_answer": "opción A",\n'
        '      "explanation": "Explanation in English reinforcing why this is correct."\n'
        '    },\n'
        '    {\n'
        '      "id": 2,\n'
        '      "type": "fill_in_blank",\n'
        '      "question": "Ayer nosotros ___ (ir) al cine.",\n'
        '      "hint": "ir (pretérito)",\n'
        '      "correct_answer": "fuimos",\n'
        '      "explanation": "Explanation in English."\n'
        '    },\n'
        '    {\n'
        '      "id": 3,\n'
        '      "type": "short_answer",\n'
        '      "question": "Translate to Spanish: I would like a coffee, please.",\n'
        '      "correct_answer": "Me gustaría un café, por favor.",\n'
        '      "explanation": "Explanation in English."\n'
        '    }\n'
        '  ]\n'
        "}\n"
        "Generate exactly 10 questions numbered id 1 through 10. Output nothing else."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Generate 10 questions for topic: {topic} at level {proficiency}"},
    ]

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "format": "json",
    }

    try:
        resp = requests.post(
            f"{OLLAMA_BASE}/api/chat",
            json=payload,
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data.get("message", {}).get("content", "").strip()
        parsed = json.loads(content)
        questions = parsed.get("questions", [])
        if not questions:
            raise RuntimeError("LLM returned empty questions list.")
        # Ensure sequential ids and valid fields
        for idx, q in enumerate(questions):
            q["id"] = idx + 1
            if "type" not in q:
                q["type"] = "multiple_choice"
            if q["type"] == "multiple_choice" and "options" not in q:
                q["options"] = [q.get("correct_answer", "Correct"), "Distractor 1", "Distractor 2", "Distractor 3"]
        parsed["questions"] = questions
        parsed["target_level"] = proficiency
        parsed["topic"] = topic
        return parsed
    except requests.ConnectionError:
        raise RuntimeError("Cannot connect to Ollama. Is it running on localhost:11434?")
    except json.JSONDecodeError:
        raise RuntimeError("LLM did not return valid JSON for quiz questions.")
    except Exception as e:
        raise RuntimeError(f"Failed to generate quiz: {str(e)}")


def evaluate_quiz_section(model, topic, target_level, questions, user_answers):
    """
    Evaluate all 10 answers in a quiz section, generate instructional feedback,
    calculate section accuracy, and determine the next target CEFR level.
    """
    items_to_grade = []
    for q in questions:
        qid = str(q.get("id"))
        user_ans = str(user_answers.get(qid, "")).strip()
        items_to_grade.append({
            "id": q.get("id"),
            "type": q.get("type", "multiple_choice"),
            "question": q.get("question", ""),
            "correct_answer": q.get("correct_answer", ""),
            "user_answer": user_ans,
            "explanation": q.get("explanation", ""),
        })

    system_prompt = (
        "You are an encouraging Spanish language teacher grading a 10-question quiz section. "
        f"The student's target proficiency level was {target_level}. "
        "Review each question and the student's answer. "
        "For multiple choice, match precisely against the correct choice. "
        "For fill-in-the-blank and short answer, be supportive: accept minor accent discrepancies or valid Spanish synonyms / dropped pronouns if meaning and grammar are sound. "
        "Provide a gentle, constructive 1-sentence feedback explanation for each question in English reinforcing the concept. "
        "Also provide a 1-2 sentence overall summary of the student's performance.\n\n"
        "Output ONLY valid JSON formatted as:\n"
        "{\n"
        '  "summary": "Overall summary of performance...",\n'
        '  "evaluations": [\n'
        '    {\n'
        '      "id": 1,\n'
        '      "is_correct": true,\n'
        '      "feedback": "Correct! The word was conjugated properly."\n'
        '    }\n'
        '  ]\n'
        "}\n"
        "Ensure evaluations contains an entry for every question id 1 through 10. Output nothing else."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Student submission to grade:\n{json.dumps(items_to_grade, ensure_ascii=False)}"},
    ]

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "format": "json",
    }

    eval_map = {}
    summary = "Section completed."

    try:
        resp = requests.post(
            f"{OLLAMA_BASE}/api/chat",
            json=payload,
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data.get("message", {}).get("content", "").strip()
        parsed = json.loads(content)
        summary = parsed.get("summary", summary)
        for ev in parsed.get("evaluations", []):
            eval_map[str(ev.get("id"))] = ev
    except Exception:
        # Fallback deterministic check if LLM evaluation call has issue
        pass

    results = []
    correct_count = 0

    for item in items_to_grade:
        qid = str(item["id"])
        user_ans = item["user_answer"]
        corr_ans = item["correct_answer"]
        llm_eval = eval_map.get(qid)

        if llm_eval and "is_correct" in llm_eval:
            is_correct = bool(llm_eval["is_correct"])
            feedback = llm_eval.get("feedback") or item["explanation"]
        else:
            # Deterministic fallback
            is_correct = user_ans.strip().lower() == corr_ans.strip().lower()
            feedback = item["explanation"]

        if is_correct:
            correct_count += 1

        results.append({
            "id": item["id"],
            "type": item["type"],
            "question": item["question"],
            "user_answer": user_ans or "(No answer)",
            "correct_answer": corr_ans,
            "is_correct": is_correct,
            "feedback": feedback,
        })

    total = len(questions) if questions else 10
    accuracy = round((correct_count / total) * 100)
    next_level, action = get_next_cefr_level(target_level, accuracy)

    if action == "increase":
        alert_message = f"🎯 Targeting Level {next_level} — Questions stepped up based on your outstanding performance ({accuracy}%)!"
    elif action == "decrease":
        alert_message = f"🎯 Targeting Level {next_level} — Difficulty adjusted to reinforce foundational concepts ({accuracy}%)."
    else:
        alert_message = f"🎯 Targeting Level {next_level} — Solid work ({accuracy}%), continuing at current target level."

    return {
        "score": correct_count,
        "total": total,
        "accuracy": accuracy,
        "current_level": target_level,
        "next_level": next_level,
        "level_action": action,
        "level_alert_message": alert_message,
        "summary": summary,
        "results": results,
    }
