"""
Spanish Verb Conjugation Engine
================================
Looks up irregular forms first, then falls back to regular pattern rules.
"""

from conjugation_data import REGULAR_ENDINGS, IRREGULARS, PRONOUNS, SUPPORTED_TENSES


def _get_verb_class(infinitive):
    """Return the verb class ('ar', 'er', 'ir') from the infinitive ending."""
    inf = infinitive.lower().strip()
    if inf.endswith("ar"):
        return "ar"
    elif inf.endswith("er"):
        return "er"
    elif inf.endswith("ír") or inf.endswith("ir"):
        return "ir"
    return None


def _get_stem(infinitive):
    """Strip the last two characters to get the stem."""
    return infinitive.lower().strip()[:-2]


def conjugate(verb, tense):
    """
    Conjugate a Spanish verb in the given tense.

    Args:
        verb: Spanish infinitive (e.g. 'hablar', 'ser')
        tense: One of 'present', 'preterite', 'imperfect'

    Returns:
        dict with keys:
            - verb: the infinitive
            - tense: the tense used
            - conjugations: list of {pronoun, form} dicts
            - irregular: bool indicating if irregular forms were used
        OR raises ValueError for unknown verbs/tenses.
    """
    verb = verb.lower().strip()
    tense = tense.lower().strip()

    if tense not in SUPPORTED_TENSES:
        raise ValueError(
            f"Unsupported tense '{tense}'. Choose from: {', '.join(SUPPORTED_TENSES)}"
        )

    verb_class = _get_verb_class(verb)
    if verb_class is None:
        raise ValueError(
            f"'{verb}' does not appear to be a valid Spanish infinitive "
            f"(must end in -ar, -er, or -ir)."
        )

    # Check irregular table first
    is_irregular = False
    if verb in IRREGULARS and tense in IRREGULARS[verb]:
        forms = IRREGULARS[verb][tense]
        is_irregular = True
    else:
        # Regular conjugation: stem + endings
        stem = _get_stem(verb)
        endings = REGULAR_ENDINGS[tense][verb_class]
        forms = [stem + ending for ending in endings]

    conjugations = [
        {"pronoun": pronoun, "form": form}
        for pronoun, form in zip(PRONOUNS, forms)
    ]

    return {
        "verb": verb,
        "tense": tense,
        "conjugations": conjugations,
        "irregular": is_irregular,
    }


def get_supported_tenses():
    """Return list of supported tenses with labels."""
    from conjugation_data import TENSE_LABELS
    return [{"value": t, "label": TENSE_LABELS[t]} for t in SUPPORTED_TENSES]
