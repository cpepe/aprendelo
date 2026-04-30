const REGULAR_ENDINGS = {
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
    "future": {
        "ar": ["é", "ás", "á", "emos", "éis", "án"],
        "er": ["é", "ás", "á", "emos", "éis", "án"],
        "ir": ["é", "ás", "á", "emos", "éis", "án"],
    }
};

const PRONOUNS = ["yo", "tú", "él/ella/usted", "nosotros", "vosotros", "ellos/ellas/ustedes"];

const IRREGULARS = {
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
        "future":    ["tendré", "tendrás", "tendrá", "tendremos", "tendréis", "tendrán"],
    },
    "hacer": {
        "present":   ["hago", "haces", "hace", "hacemos", "hacéis", "hacen"],
        "preterite": ["hice", "hiciste", "hizo", "hicimos", "hicisteis", "hicieron"],
        "future":    ["haré", "harás", "hará", "haremos", "haréis", "harán"],
    },
    "poder": {
        "present":   ["puedo", "puedes", "puede", "podemos", "podéis", "pueden"],
        "preterite": ["pude", "pudiste", "pudo", "pudimos", "pudisteis", "pudieron"],
        "future":    ["podré", "podrás", "podrá", "podremos", "podréis", "podrán"],
    },
    "decir": {
        "present":   ["digo", "dices", "dice", "decimos", "decís", "dicen"],
        "preterite": ["dije", "dijiste", "dijo", "dijimos", "dijisteis", "dijeron"],
        "future":    ["diré", "dirás", "dirá", "diremos", "diréis", "dirán"],
    },
    "saber": {
        "present":   ["sé", "sabes", "sabe", "sabemos", "sabéis", "saben"],
        "preterite": ["supe", "supiste", "supo", "supimos", "supisteis", "supieron"],
        "future":    ["sabré", "sabrás", "sabrá", "sabremos", "sabréis", "sabrán"],
    },
    "querer": {
        "present":   ["quiero", "quieres", "quiere", "queremos", "queréis", "quieren"],
        "preterite": ["quise", "quisiste", "quiso", "quisimos", "quisisteis", "quisieron"],
        "future":    ["querré", "querrás", "querrá", "querremos", "querréis", "querrán"],
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
        "future":    ["pondré", "pondrás", "pondrá", "pondremos", "pondréis", "pondrán"],
    },
    "venir": {
        "present":   ["vengo", "vienes", "viene", "venimos", "venís", "vienen"],
        "preterite": ["vine", "viniste", "vino", "vinimos", "vinisteis", "vinieron"],
        "future":    ["vendré", "vendrás", "vendrá", "vendremos", "vendréis", "vendrán"],
    },
    "salir": {
        "present":   ["salgo", "sales", "sale", "salimos", "salís", "salen"],
        "future":    ["saldré", "saldrás", "saldrá", "saldremos", "saldréis", "saldrán"],
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
        "future":    ["habré", "habrás", "habrá", "habremos", "habréis", "habrán"],
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
};

const VERB_DICT = {
    "hablar": { base: "speak", past: "spoke" },
    "comer": { base: "eat", past: "ate" },
    "vivir": { base: "live", past: "lived" },
    "ser": { base: "be", past: "was/were" },
    "estar": { base: "be", past: "was/were" },
    "ir": { base: "go", past: "went" },
    "tener": { base: "have", past: "had" },
    "hacer": { base: "do/make", past: "did/made" },
    "poder": { base: "be able to", past: "could" },
    "decir": { base: "say", past: "said" },
    "saber": { base: "know", past: "knew" },
    "querer": { base: "want", past: "wanted" },
    "dar": { base: "give", past: "gave" },
    "ver": { base: "see", past: "saw" },
    "poner": { base: "put", past: "put" },
    "venir": { base: "come", past: "came" },
    "salir": { base: "leave", past: "left" },
    "conocer": { base: "know (be familiar)", past: "knew (was familiar)" },
    "traer": { base: "bring", past: "brought" },
    "caer": { base: "fall", past: "fell" },
    "oír": { base: "hear", past: "heard" },
    "dormir": { base: "sleep", past: "slept" },
    "jugar": { base: "play", past: "played" },
    "haber": { base: "have (auxiliary)", past: "had (auxiliary)" },
    "pensar": { base: "think", past: "thought" },
    "volver": { base: "return", past: "returned" },
    "sentir": { base: "feel", past: "felt" },
    "pedir": { base: "ask for", past: "asked for" },
    "nacer": { base: "be born", past: "was/were born" }
};

const SUPPORTED_TENSES = ["present", "preterite", "imperfect", "future"];
const TENSE_LABELS = {
    "present": "Presente (Present Indicative)",
    "preterite": "Pretérito (Preterite)",
    "imperfect": "Imperfecto (Imperfect Indicative)",
    "future": "Futuro (Future Indicative)",
};

function getVerbClass(infinitive) {
    const inf = infinitive.toLowerCase().trim();
    if (inf.endsWith("ar")) return "ar";
    if (inf.endsWith("er")) return "er";
    if (inf.endsWith("ír") || inf.endsWith("ir")) return "ir";
    return null;
}

function getStem(infinitive) {
    return infinitive.toLowerCase().trim().slice(0, -2);
}

function getEnglishTranslation(pronounIdx, tense, engBase, engPast) {
    if (!engBase) return "";
    
    const pronounMap = ["I", "you", "he/she/it", "we", "you all", "they"];
    const subject = pronounMap[pronounIdx];

    if (tense === "present") {
        if (engBase === "be") {
            const forms = ["am", "are", "is", "are", "are", "are"];
            return subject + " " + forms[pronounIdx];
        }
        if (engBase === "have") {
            return pronounIdx === 2 ? subject + " has" : subject + " have";
        }
        if (engBase === "be born") {
            const forms = ["am born", "are born", "is born", "are born", "are born", "are born"];
            return subject + " " + forms[pronounIdx];
        }
        if (pronounIdx === 2) {
            if (engBase.endsWith("o") || engBase.endsWith("s") || engBase.endsWith("ch") || engBase.endsWith("sh")) {
                return subject + " " + engBase + "es";
            } else if (engBase.endsWith("y") && !["ay","ey","iy","oy","uy"].some(end => engBase.endsWith(end))) {
                return subject + " " + engBase.slice(0,-1) + "ies";
            }
            return subject + " " + engBase + "s";
        }
        return subject + " " + engBase;
    } 
    else if (tense === "preterite") {
        if (engPast === "was/were" || engPast === "was/were born") {
            const isWas = (pronounIdx === 0 || pronounIdx === 2);
            if (engPast.includes("born")) {
                return subject + (isWas ? " was born" : " were born");
            }
            return subject + (isWas ? " was" : " were");
        }
        return subject + " " + engPast;
    }
    else if (tense === "imperfect") {
        if (engBase === "be born") {
            return subject + " used to be born"; // a bit nonsensical in english but grammatically consistent
        }
        return subject + " used to " + engBase;
    }
    else if (tense === "future") {
        return subject + " will " + engBase;
    }
    return "";
}

window.conjugateVerb = function(verbRaw) {
    const verb = verbRaw.toLowerCase().trim();
    
    const verbClass = getVerbClass(verb);
    if (!verbClass) {
        throw new Error(`'${verb}' does not appear to be a valid Spanish infinitive (must end in -ar, -er, or -ir).`);
    }

    const dictEntry = VERB_DICT[verb] || null;
    let results = {};

    SUPPORTED_TENSES.forEach(tense => {
        let isIrregular = false;
        let forms = [];

        if (IRREGULARS[verb] && IRREGULARS[verb][tense]) {
            forms = IRREGULARS[verb][tense];
            isIrregular = true;
        } else {
            if (tense === "future") {
                const stem = verb; 
                const endings = REGULAR_ENDINGS[tense][verbClass];
                forms = endings.map(end => stem + end);
            } else {
                const stem = getStem(verb);
                const endings = REGULAR_ENDINGS[tense][verbClass];
                forms = endings.map(end => stem + end);
            }
        }

        const conjugations = PRONOUNS.map((pronoun, index) => {
            const engTranslation = dictEntry 
                ? getEnglishTranslation(index, tense, dictEntry.base, dictEntry.past)
                : "";
            return {
                pronoun: pronoun,
                form: forms[index],
                translation: engTranslation
            };
        });

        results[tense] = {
            tenseLabel: TENSE_LABELS[tense],
            irregular: isIrregular,
            conjugations: conjugations
        };
    });

    return {
        verb: verb,
        tenses: results
    };
}
