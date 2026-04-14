"""
Spanish Verb Conjugation Data
==============================
Lookup tables for regular patterns and common irregular verbs.
Tenses covered: Present Indicative, Preterite Indicative, Imperfect Indicative.
Pronouns order: yo, tú, él/ella/usted, nosotros, vosotros, ellos/ellas/ustedes
"""

# ── Regular endings by infinitive class ──────────────────────────────

REGULAR_ENDINGS = {
    "present": {
        "ar": ["o", "as", "a", "amos", "áis", "an"],
        "er": ["o", "es", "e", "emos", "éis", "en"],
        "ir": ["o", "es", "e", "imos", "ís", "en"],
    },
    "preterite": {
        "ar": ["é", "aste", "ó", "amos", "asteis", "aron"],
        "er": ["í", "iste", "ió", "imos", "isteis", "ieron"],
        "ir": ["í", "iste", "ió", "imos", "isteis", "ieron"],
    },
    "imperfect": {
        "ar": ["aba", "abas", "aba", "ábamos", "abais", "aban"],
        "er": ["ía", "ías", "ía", "íamos", "íais", "ían"],
        "ir": ["ía", "ías", "ía", "íamos", "íais", "ían"],
    },
}

PRONOUNS = ["yo", "tú", "él/ella/usted", "nosotros", "vosotros", "ellos/ellas/ustedes"]

# ── Irregular verb conjugations ──────────────────────────────────────
# Each entry: { tense: [6 forms] }
# Only tenses that differ from regular pattern are listed.

IRREGULARS = {
    "ser": {
        "present":   ["soy", "eres", "es", "somos", "sois", "son"],
        "preterite": ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"],
        "imperfect": ["era", "eras", "era", "éramos", "erais", "eran"],
    },
    "estar": {
        "present":   ["estoy", "estás", "está", "estamos", "estáis", "están"],
        "preterite": ["estuve", "estuviste", "estuvo", "estuvimos", "estuvisteis", "estuvieron"],
    },
    "ir": {
        "present":   ["voy", "vas", "va", "vamos", "vais", "van"],
        "preterite": ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"],
        "imperfect": ["iba", "ibas", "iba", "íbamos", "ibais", "iban"],
    },
    "tener": {
        "present":   ["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"],
        "preterite": ["tuve", "tuviste", "tuvo", "tuvimos", "tuvisteis", "tuvieron"],
    },
    "hacer": {
        "present":   ["hago", "haces", "hace", "hacemos", "hacéis", "hacen"],
        "preterite": ["hice", "hiciste", "hizo", "hicimos", "hicisteis", "hicieron"],
    },
    "poder": {
        "present":   ["puedo", "puedes", "puede", "podemos", "podéis", "pueden"],
        "preterite": ["pude", "pudiste", "pudo", "pudimos", "pudisteis", "pudieron"],
    },
    "decir": {
        "present":   ["digo", "dices", "dice", "decimos", "decís", "dicen"],
        "preterite": ["dije", "dijiste", "dijo", "dijimos", "dijisteis", "dijeron"],
    },
    "saber": {
        "present":   ["sé", "sabes", "sabe", "sabemos", "sabéis", "saben"],
        "preterite": ["supe", "supiste", "supo", "supimos", "supisteis", "supieron"],
    },
    "querer": {
        "present":   ["quiero", "quieres", "quiere", "queremos", "queréis", "quieren"],
        "preterite": ["quise", "quisiste", "quiso", "quisimos", "quisisteis", "quisieron"],
    },
    "dar": {
        "present":   ["doy", "das", "da", "damos", "dais", "dan"],
        "preterite": ["di", "diste", "dio", "dimos", "disteis", "dieron"],
    },
    "ver": {
        "present":   ["veo", "ves", "ve", "vemos", "veis", "ven"],
        "preterite": ["vi", "viste", "vio", "vimos", "visteis", "vieron"],
        "imperfect": ["veía", "veías", "veía", "veíamos", "veíais", "veían"],
    },
    "poner": {
        "present":   ["pongo", "pones", "pone", "ponemos", "ponéis", "ponen"],
        "preterite": ["puse", "pusiste", "puso", "pusimos", "pusisteis", "pusieron"],
    },
    "venir": {
        "present":   ["vengo", "vienes", "viene", "venimos", "venís", "vienen"],
        "preterite": ["vine", "viniste", "vino", "vinimos", "vinisteis", "vinieron"],
    },
    "salir": {
        "present":   ["salgo", "sales", "sale", "salimos", "salís", "salen"],
    },
    "conocer": {
        "present":   ["conozco", "conoces", "conoce", "conocemos", "conocéis", "conocen"],
    },
    "traer": {
        "present":   ["traigo", "traes", "trae", "traemos", "traéis", "traen"],
        "preterite": ["traje", "trajiste", "trajo", "trajimos", "trajisteis", "trajeron"],
    },
    "caer": {
        "present":   ["caigo", "caes", "cae", "caemos", "caéis", "caen"],
        "preterite": ["caí", "caíste", "cayó", "caímos", "caísteis", "cayeron"],
    },
    "oír": {
        "present":   ["oigo", "oyes", "oye", "oímos", "oís", "oyen"],
        "preterite": ["oí", "oíste", "oyó", "oímos", "oísteis", "oyeron"],
    },
    "dormir": {
        "present":   ["duermo", "duermes", "duerme", "dormimos", "dormís", "duermen"],
        "preterite": ["dormí", "dormiste", "durmió", "dormimos", "dormisteis", "durmieron"],
    },
    "jugar": {
        "present":   ["juego", "juegas", "juega", "jugamos", "jugáis", "juegan"],
    },
    "haber": {
        "present":   ["he", "has", "ha", "hemos", "habéis", "han"],
        "preterite": ["hube", "hubiste", "hubo", "hubimos", "hubisteis", "hubieron"],
        "imperfect": ["había", "habías", "había", "habíamos", "habíais", "habían"],
    },
    "pensar": {
        "present":   ["pienso", "piensas", "piensa", "pensamos", "pensáis", "piensan"],
    },
    "volver": {
        "present":   ["vuelvo", "vuelves", "vuelve", "volvemos", "volvéis", "vuelven"],
    },
    "sentir": {
        "present":   ["siento", "sientes", "siente", "sentimos", "sentís", "sienten"],
        "preterite": ["sentí", "sentiste", "sintió", "sentimos", "sentisteis", "sintieron"],
    },
    "pedir": {
        "present":   ["pido", "pides", "pide", "pedimos", "pedís", "piden"],
        "preterite": ["pedí", "pediste", "pidió", "pedimos", "pedisteis", "pidieron"],
    },
}

SUPPORTED_TENSES = ["present", "preterite", "imperfect"]
TENSE_LABELS = {
    "present": "Presente (Present Indicative)",
    "preterite": "Pretérito (Preterite)",
    "imperfect": "Imperfecto (Imperfect Indicative)",
}
