/* ═══════════════════════════════════════════════════════════════════
   Aprendelo — Client-Side Application Logic
   Handles: Tab navigation, Flashcards, Conjugation, Chat (SSE),
            Translator, Sentence Builder
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {
    initSettings();
    initTabs();
    initFlashcards();
    initConjugation();
    initChat();
    initQuiz();
    initTranslate();
    initSentenceBuilder();
    checkIOSEnvironment();
});

/* ── Tab Navigation ───────────────────────────────────────────── */

function initTabs() {
    const tabs = document.querySelectorAll(".nav-tab");
    const sections = document.querySelectorAll(".tab-section");

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.tab;

            tabs.forEach((t) => t.classList.remove("active"));
            sections.forEach((s) => s.classList.remove("active"));

            tab.classList.add("active");
            document.getElementById(`section-${target}`).classList.add("active");
        });
    });
}

function initFlashcards() {
    const card = document.getElementById("flashcard");
    const frontWord = document.getElementById("card-front-word");
    const backWord = document.getElementById("card-back-word");
    const frontLabel = document.getElementById("card-front-label");
    const backLabel = document.getElementById("card-back-label");
    const btnNext = document.getElementById("btn-next-card");
    const subtabContainer = document.getElementById("flashcard-subtabs");

    // Game configurations — the single engine renders all three
    const GAMES = [
        { id: "flashcards", file: "./static/flashcards.json", frontLabel: "Español", backLabel: "English", mode: "text" },
        { id: "flash-phrases", file: "./static/flash-phrases.json", frontLabel: "English", backLabel: "Español", mode: "text" },
        { id: "flash-images", file: "./static/flash-images.json", frontLabel: "Image", backLabel: "Español", mode: "image" },
    ];

    let currentGameIndex = 0;
    const dataCache = {}; // keyed by game id

    function flipCard() {
        card.classList.toggle("flipped");
    }

    async function ensureData() {
        const game = GAMES[currentGameIndex];
        if (dataCache[game.id]) return dataCache[game.id];
        try {
            const resp = await fetch(game.file);
            dataCache[game.id] = await resp.json();
            return dataCache[game.id];
        } catch (err) {
            return null;
        }
    }

    async function loadCard() {
        card.classList.remove("flipped");
        const game = GAMES[currentGameIndex];

        // Update labels
        frontLabel.textContent = game.frontLabel;
        backLabel.textContent = game.backLabel;

        const data = await ensureData();
        if (!data) {
            frontWord.textContent = "Error";
            backWord.textContent = "Could not load cards";
            return;
        }

        const keys = Object.keys(data);
        if (keys.length === 0) {
            frontWord.textContent = "Error";
            backWord.textContent = "No cards found";
            return;
        }

        const randomKey = keys[Math.floor(Math.random() * keys.length)];

        // Small delay so the un-flip animation finishes
        setTimeout(() => {
            if (game.mode === "image") {
                // Image mode: front = emoji/image, back = Spanish word
                frontWord.textContent = randomKey;
                frontWord.style.fontSize = "4rem";
                backWord.textContent = data[randomKey];
            } else {
                // Text mode: front = Spanish, back = English
                frontWord.textContent = randomKey;
                frontWord.style.fontSize = "";
                backWord.textContent = data[randomKey];
            }
        }, 150);
    }

    // Sub-tab switching
    subtabContainer.addEventListener("click", (e) => {
        const btn = e.target.closest(".subtab");
        if (!btn) return;
        const gameIndex = parseInt(btn.dataset.game, 10);
        if (gameIndex === currentGameIndex) return;

        currentGameIndex = gameIndex;
        subtabContainer.querySelectorAll(".subtab").forEach(s => s.classList.remove("active"));
        btn.classList.add("active");

        // Clear stale content immediately before loading new card
        frontWord.textContent = "";
        backWord.textContent = "";
        frontWord.style.fontSize = "";
        loadCard();
    });

    card.addEventListener("click", flipCard);
    btnNext.addEventListener("click", loadCard);

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        // Only act if the flashcard tab is active
        if (!document.getElementById("section-flashcards").classList.contains("active")) return;
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

        if (e.code === "Space") {
            e.preventDefault();
            flipCard();
        } else if (e.code === "ArrowRight") {
            e.preventDefault();
            loadCard();
        }
    });

    // Load the first card
    loadCard();
}

/* ── Conjugation ──────────────────────────────────────────────── */

function initConjugation() {
    const form = document.getElementById("conjugation-form");
    const verbInput = document.getElementById("conj-verb");
    const resultCard = document.getElementById("conjugation-result");
    const resultVerb = document.getElementById("conj-result-verb");
    const tensesGrid = document.getElementById("conj-tenses-grid");
    const errorDiv = document.getElementById("conjugation-error");

    const EXAMPLES = {
        present: { es: "Yo hablo español.", en: "I speak Spanish. (Habitual or current action)" },
        preterite: { es: "Ayer hablé español.", en: "Yesterday I spoke Spanish. (Completed action)" },
        imperfect: { es: "Yo hablaba español de niño.", en: "I used to speak Spanish as a child. (Ongoing past action)" }
    };

    const TENSE_LABELS = {
        present: "Presente (Present)",
        preterite: "Pretérito (Preterite)",
        imperfect: "Imperfecto (Imperfect)"
    };

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        resultCard.classList.add("hidden");
        errorDiv.classList.add("hidden");

        const verb = verbInput.value.trim();

        if (!verb) {
            showError(errorDiv, "Please enter a verb.");
            return;
        }

        try {
            const data = window.conjugateVerb(verb);

            // Render results
            resultVerb.textContent = data.verb.charAt(0).toUpperCase() + data.verb.slice(1);
            tensesGrid.innerHTML = "";

            const tensesOrder = ["present", "preterite", "imperfect", "future"];

            tensesOrder.forEach(tenseKey => {
                const tenseData = data.tenses[tenseKey];

                const section = document.createElement("div");
                section.className = "tense-section";

                const header = document.createElement("div");
                header.className = "tense-header";

                const title = document.createElement("span");
                title.className = "tense-title";
                title.textContent = tenseData.tenseLabel;

                const badge = document.createElement("span");
                badge.className = "badge";
                badge.textContent = tenseData.irregular ? "Irregular" : "Regular";
                badge.style.background = tenseData.irregular ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)";
                badge.style.color = tenseData.irregular ? "#fca5a5" : "#86efac";
                badge.style.borderColor = tenseData.irregular ? "rgba(239, 68, 68, 0.25)" : "rgba(34, 197, 94, 0.25)";

                header.appendChild(title);
                header.appendChild(badge);

                const table = document.createElement("table");
                table.className = "conj-table";

                let tbodyHTML = "";
                tenseData.conjugations.forEach(c => {
                    const transStr = c.translation ? `<span style="display:block; font-size:0.8em; color:var(--text-muted); font-weight:normal;">${c.translation}</span>` : "";
                    tbodyHTML += `<tr><td>${c.pronoun}</td><td>${c.form}${transStr}</td></tr>`;
                });

                table.innerHTML = `<tbody>${tbodyHTML}</tbody>`;

                section.appendChild(header);
                section.appendChild(table);
                tensesGrid.appendChild(section);
            });

            resultCard.classList.remove("hidden");
        } catch (err) {
            showError(errorDiv, err.message || "Failed to conjugate verb");
        }
    });
}

/* ── Chat ─────────────────────────────────────────────────────── */

function initChat() {
    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");
    const messagesDiv = document.getElementById("chat-messages");
    const btnClear = document.getElementById("btn-clear-chat");

    let conversationHistory = [];
    let isStreaming = false;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (isStreaming) return;

        const message = input.value.trim();
        if (!message) return;

        const { model, proficiency } = getGlobalSettings();
        if (!model) {
            alert("Please select an Ollama Model in the Settings tab.");
            return;
        }

        // Clear welcome message
        const welcome = messagesDiv.querySelector(".chat-welcome");
        if (welcome) welcome.remove();

        // Add user bubble
        appendBubble("user", message);
        conversationHistory.push({ role: "user", content: message });
        input.value = "";

        // Create assistant bubble with typing indicator
        const assistantBubble = appendBubble("assistant", "");
        assistantBubble.innerHTML = `<span class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>`;

        isStreaming = true;
        let fullResponse = "";

        try {
            const resp = await fetch("/api/chat/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message,
                    history: conversationHistory.slice(-20), // Keep last 20 turns
                    model,
                    proficiency,
                }),
            });

            if (!resp.ok) {
                const errData = await resp.json();
                assistantBubble.textContent = `Error: ${errData.error || "Unknown error"}`;
                isStreaming = false;
                return;
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            assistantBubble.textContent = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const payload = JSON.parse(line.slice(6));
                            if (payload.content) {
                                fullResponse += payload.content;
                                assistantBubble.textContent = fullResponse;
                                scrollToBottom(messagesDiv);
                            }
                            if (payload.done) break;
                        } catch (_) {
                            // skip malformed lines
                        }
                    }
                }
            }

            if (fullResponse) {
                conversationHistory.push({ role: "assistant", content: fullResponse });
            }
        } catch (err) {
            assistantBubble.textContent = `Error: Could not connect to the server.`;
        }

        isStreaming = false;
        scrollToBottom(messagesDiv);
    });

    btnClear.addEventListener("click", () => {
        conversationHistory = [];
        messagesDiv.innerHTML = `
            <div class="chat-welcome">
                <p>¡Hola! 👋 I'm your Spanish conversation partner.</p>
                <p>Write something in Spanish (or English) and I'll help you practice!</p>
            </div>
        `;
    });

    function appendBubble(role, text) {
        const div = document.createElement("div");
        div.className = `chat-bubble ${role}`;
        div.textContent = text;
        messagesDiv.appendChild(div);
        scrollToBottom(messagesDiv);
        return div;
    }
}

/* ── Translator ───────────────────────────────────────────────── */

function initTranslate() {
    const form = document.getElementById("translate-form");
    const inputArea = document.getElementById("translate-input");
    const outputDiv = document.getElementById("translate-output");
    const btnClear = document.getElementById("btn-translate-clear");
    const btnTranslate = document.getElementById("btn-translate");
    const spinner = document.getElementById("translate-spinner");
    const btnText = btnTranslate.querySelector(".btn-text");
    const errorDiv = document.getElementById("translate-error");

    let isStreaming = false;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (isStreaming) return;

        const text = inputArea.value.trim();
        if (!text) return;

        const { model, proficiency } = getGlobalSettings();
        const sourceLang = document.getElementById("translate-source-lang").value;
        const targetLang = document.getElementById("translate-target-lang").value;

        if (!model) {
            alert("Please select an Ollama Model in the Settings tab.");
            return;
        }

        errorDiv.classList.add("hidden");
        outputDiv.innerHTML = `<span class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></span>`;
        isStreaming = true;
        btnTranslate.disabled = true;
        spinner.classList.remove("hidden");
        btnText.textContent = "Translating…";
        let fullResponse = "";

        try {
            const resp = await fetch("/api/translate/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text,
                    source_lang: sourceLang,
                    target_lang: targetLang,
                    model,
                    proficiency,
                }),
            });

            if (!resp.ok) {
                const errData = await resp.json();
                outputDiv.textContent = `Error: ${errData.error || "Unknown error"}`;
                isStreaming = false;
                throw new Error("Translation failed.");
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            outputDiv.textContent = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const payload = JSON.parse(line.slice(6));
                            if (payload.content) {
                                fullResponse += payload.content;
                                outputDiv.textContent = fullResponse;
                                scrollToBottom(outputDiv);
                            }
                            if (payload.done) break;
                        } catch (_) {
                            // skip malformed lines
                        }
                    }
                }
            }
        } catch (err) {
            if (!fullResponse) {
                outputDiv.textContent = `Error: Could not connect to the server or translation failed.`;
            }
        } finally {
            isStreaming = false;
            btnTranslate.disabled = false;
            spinner.classList.add("hidden");
            btnText.textContent = "Translate";
            scrollToBottom(outputDiv);
        }
    });

    btnClear.addEventListener("click", () => {
        if (isStreaming) return;
        inputArea.value = "";
        outputDiv.textContent = "";
        errorDiv.classList.add("hidden");
    });
}

/* ── Shared helpers ───────────────────────────────────────────── */

async function loadModels(selectElement) {
    try {
        const resp = await fetch("/api/models");
        const data = await resp.json();
        selectElement.innerHTML = "";

        if (!data.models || data.models.length === 0) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "No models found (is Ollama running?)";
            selectElement.appendChild(opt);
            return;
        }

        data.models.forEach((model, i) => {
            const opt = document.createElement("option");
            opt.value = model;
            opt.textContent = model;
            if (i === 0) opt.selected = true;
            selectElement.appendChild(opt);
        });
    } catch (err) {
        selectElement.innerHTML = `<option value="">Cannot reach server</option>`;
    }
}


function showError(el, message) {
    el.textContent = message;
    el.classList.remove("hidden");
}

function showStatus(el, message) {
    el.textContent = message;
    el.classList.remove("hidden");
}

function scrollToBottom(el) {
    el.scrollTop = el.scrollHeight;
}

/* ── Sentence Builder Static Fallback ─────────────────────────── */

let cachedFlashPhrases = null;

async function loadFlashPhrases() {
    if (cachedFlashPhrases) return cachedFlashPhrases;
    try {
        const resp = await fetch("./static/flash-phrases.json");
        cachedFlashPhrases = await resp.json();
        return cachedFlashPhrases;
    } catch (err) {
        console.error("Failed to load flash-phrases.json", err);
        return null;
    }
}

async function generateStaticExercise() {
    const phrases = await loadFlashPhrases();
    if (!phrases || Object.keys(phrases).length === 0) {
        throw new Error("No phrases available for static fallback.");
    }
    
    const entries = Object.entries(phrases);
    const [english, spanish] = entries[Math.floor(Math.random() * entries.length)];
    
    // Clean and split words
    const normalizeWords = s => s.replace(/[.,!?¿¡]/g, '').trim().split(/\s+/).filter(w => w.length > 0);
    const sentenceWords = normalizeWords(spanish);
    const allSpanishWords = entries.flatMap(([_, s]) => normalizeWords(s));
    
    // Pick 4 to 8 random distractors that are not in the current sentence
    const distractors = [];
    const numDistractors = Math.floor(Math.random() * 5) + 4;
    let attempts = 0;
    while (distractors.length < numDistractors && attempts < 100) {
        const candidate = allSpanishWords[Math.floor(Math.random() * allSpanishWords.length)];
        if (!sentenceWords.includes(candidate) && !distractors.includes(candidate)) {
            distractors.push(candidate);
        }
        attempts++;
    }

    const allWords = [...sentenceWords, ...distractors];
    
    // Shuffle allWords
    for (let i = allWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allWords[i], allWords[j]] = [allWords[j], allWords[i]];
    }

    return {
        english_translation: english,
        test_sentence: spanish,
        words: allWords
    };
}

function evaluateStaticSentence(exercise, userSentence) {
    const normalize = s => s.toLowerCase().replace(/[.,¡!¿?]/g, '').trim();
    const normUser = normalize(userSentence);
    const normTarget = normalize(exercise.test_sentence);

    if (normUser === normTarget) {
        return {
            correct: true,
            feedback: "¡Excelente! (Static Evaluation)",
            correction: ""
        };
    } else {
        return {
            correct: false,
            feedback: "Not quite right. Make sure you use all the required words in the correct order. (Static Evaluation)",
            correction: exercise.test_sentence
        };
    }
}

/* ── Sentence Builder ─────────────────────────────────────────── */

function initSentenceBuilder() {
    const form = document.getElementById("sentence-form");

    const btnGenerate = document.getElementById("btn-generate-sentence");
    const spinnerGenerate = document.getElementById("sentence-generate-spinner");
    const errorDiv = document.getElementById("sentence-error");
    const workspace = document.getElementById("sentence-workspace");
    const englishPrompt = document.getElementById("sentence-english-prompt");
    const wordBank = document.getElementById("sentence-word-bank");
    const constructionZone = document.getElementById("sentence-construction-zone");
    const btnCheck = document.getElementById("btn-check-sentence");
    const spinnerCheck = document.getElementById("sentence-check-spinner");
    const btnReset = document.getElementById("btn-reset-sentence");
    const btnToggleMode = document.getElementById("btn-toggle-mode");
    const btnShowAnswer = document.getElementById("btn-show-answer");
    const feedbackCard = document.getElementById("sentence-feedback");
    const feedbackIcon = document.getElementById("sentence-feedback-icon");
    const feedbackText = document.getElementById("sentence-feedback-text");
    const correctionArea = document.getElementById("sentence-correction-area");
    const correctionText = document.getElementById("sentence-correction-text");

    // Mode elements
    const tileMode = document.getElementById("sentence-tile-mode");
    const advancedMode = document.getElementById("sentence-advanced-mode");
    const advancedInput = document.getElementById("sentence-advanced-input");
    const answerReveal = document.getElementById("sentence-answer-reveal");
    const answerText = document.getElementById("sentence-answer-text");

    let currentExercise = null;
    let isAdvancedMode = false;
    let isStaticMode = false;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const topic = document.getElementById("sentence-topic").value.trim();
        const { model, proficiency } = getGlobalSettings();

        errorDiv.classList.add("hidden");
        workspace.classList.add("hidden");
        feedbackCard.classList.add("hidden");
        answerReveal.classList.add("hidden");

        // Reset to tile mode on new exercise
        isAdvancedMode = false;
        tileMode.classList.remove("hidden");
        advancedMode.classList.add("hidden");
        advancedInput.value = "";
        btnToggleMode.textContent = "Advanced";

        btnGenerate.disabled = true;
        spinnerGenerate.classList.remove("hidden");

        try {
            if (!model) throw new Error("No model selected. Falling back to static mode.");
            const resp = await fetch("/api/sentence-builder/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic, proficiency, model })
            });

            if (!resp.ok) {
                const errData = await resp.json().catch(()=>({}));
                throw new Error(errData.error || "Generation failed");
            }

            currentExercise = await resp.json();
            isStaticMode = false;
        } catch (err) {
            console.warn(err.message, "Using static fallback.");
            try {
                currentExercise = await generateStaticExercise();
                isStaticMode = true;
            } catch (staticErr) {
                showError(errorDiv, "Failed to generate exercise in static mode. " + staticErr.message);
                btnGenerate.disabled = false;
                spinnerGenerate.classList.add("hidden");
                return;
            }
        }
        
        // Hide toggle mode and topic input if in static mode
        const topicInput = document.getElementById("sentence-topic");
        if (isStaticMode) {
            btnToggleMode.classList.add("hidden");
            topicInput.disabled = true;
            topicInput.value = "";
            topicInput.parentElement.classList.add("hidden");
        } else {
            btnToggleMode.classList.remove("hidden");
            topicInput.disabled = false;
            topicInput.parentElement.classList.remove("hidden");
            topicInput.placeholder = "e.g. Ordering food, viajar, ser vs estar";
        }

        try {
            // Set up workspace
            englishPrompt.textContent = currentExercise.english_translation;
            wordBank.innerHTML = "";
            constructionZone.innerHTML = "";
            
            currentExercise.words.forEach(word => {
                const tile = document.createElement("div");
                tile.className = "word-tile";
                tile.textContent = word;
                tile.addEventListener("click", () => moveTile(tile));
                wordBank.appendChild(tile);
            });

            workspace.classList.remove("hidden");
        } finally {
            btnGenerate.disabled = false;
            spinnerGenerate.classList.add("hidden");
        }
    });

    function moveTile(tile) {
        if (tile.parentElement === wordBank) {
            constructionZone.appendChild(tile);
            tile.classList.add("in-construction");
        } else {
            wordBank.appendChild(tile);
            tile.classList.remove("in-construction");
        }
    }

    // Reset Words — moves all tiles back to the bank and scrambles their order
    btnReset.addEventListener("click", () => {
        const tiles = Array.from(constructionZone.children);
        tiles.forEach(tile => {
            wordBank.appendChild(tile);
            tile.classList.remove("in-construction");
        });
        // Scramble tiles in the word bank
        const allTiles = Array.from(wordBank.children);
        for (let i = allTiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            wordBank.appendChild(allTiles[j]);
            allTiles[j] = allTiles[i];
        }
        feedbackCard.classList.add("hidden");
    });

    // Advanced / Tiles toggle
    btnToggleMode.addEventListener("click", () => {
        isAdvancedMode = !isAdvancedMode;
        if (isAdvancedMode) {
            tileMode.classList.add("hidden");
            advancedMode.classList.remove("hidden");
            btnToggleMode.textContent = "Tiles";
        } else {
            advancedMode.classList.add("hidden");
            tileMode.classList.remove("hidden");
            btnToggleMode.textContent = "Advanced";
        }
    });

    // Answer reveal
    btnShowAnswer.addEventListener("click", () => {
        if (!currentExercise) return;
        answerText.textContent = currentExercise.test_sentence;
        answerReveal.classList.remove("hidden");
    });

    // Check Answer — works in both tile and advanced mode
    btnCheck.addEventListener("click", async () => {
        let userSentence = "";

        if (isAdvancedMode) {
            userSentence = advancedInput.value.trim();
            if (!userSentence) {
                alert("Please type a sentence first.");
                return;
            }
        } else {
            const selectedTiles = Array.from(constructionZone.children);
            if (selectedTiles.length === 0) {
                alert("Please build a sentence first.");
                return;
            }
            userSentence = selectedTiles.map(t => t.textContent).join(" ");
        }

        const { model, proficiency } = getGlobalSettings();

        btnCheck.disabled = true;
        spinnerCheck.classList.remove("hidden");
        feedbackCard.classList.add("hidden");
        errorDiv.classList.add("hidden");

        try {
            if (isStaticMode) {
                throw new Error("Static mode evaluation");
            }

            const resp = await fetch("/api/sentence-builder/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    english_translation: currentExercise.english_translation,
                    user_sentence: userSentence,
                    proficiency,
                    model,
                    words_provided: currentExercise.words
                })
            });

            if (!resp.ok) {
                const errData = await resp.json().catch(()=>({}));
                throw new Error(errData.error || "Evaluation fetch failed");
            }

            const evaluation = await resp.json();
            handleEvaluationResult(evaluation);

        } catch (err) {
            if (isStaticMode || err.message.includes("fetch failed")) {
                console.warn("Using static evaluation fallback.");
                const evaluation = evaluateStaticSentence(currentExercise, userSentence);
                handleEvaluationResult(evaluation);
            } else {
                showError(errorDiv, err.message);
            }
        } finally {
            btnCheck.disabled = false;
            spinnerCheck.classList.add("hidden");
        }

        function handleEvaluationResult(evaluation) {
            feedbackCard.classList.remove("hidden");
            if (evaluation.correct) {
                feedbackCard.style.borderColor = "var(--success)";
                feedbackIcon.textContent = "✅";
                correctionArea.classList.add("hidden");
            } else {
                feedbackCard.style.borderColor = "var(--error)";
                feedbackIcon.textContent = "❌";
                correctionArea.classList.remove("hidden");
                correctionText.textContent = evaluation.correction;
            }
            feedbackText.textContent = evaluation.feedback;
        }
    });
}

/* ── Settings ─────────────────────────────────────────────────── */

function getGlobalSettings() {
    return {
        model: localStorage.getItem("aprendelo_model") || "",
        proficiency: localStorage.getItem("aprendelo_proficiency") || "B1"
    };
}

function initSettings() {
    const modelSelect = document.getElementById("global-model-select");
    const profSelect = document.getElementById("global-proficiency-select");

    if (!modelSelect || !profSelect) return;

    // Load available models from server
    loadModels(modelSelect).then(() => {
        // Apply saved settings
        const savedModel = localStorage.getItem("aprendelo_model");
        if (savedModel) {
            modelSelect.value = savedModel;
        } else if (modelSelect.options.length > 0 && modelSelect.options[0].value) {
            // default to first option if none saved
            localStorage.setItem("aprendelo_model", modelSelect.options[0].value);
            modelSelect.value = modelSelect.options[0].value;
        }
    });

    const savedProf = localStorage.getItem("aprendelo_proficiency");
    if (savedProf) {
        profSelect.value = savedProf;
    }

    // Event listeners to save on change
    modelSelect.addEventListener("change", () => {
        localStorage.setItem("aprendelo_model", modelSelect.value);
    });

    profSelect.addEventListener("change", () => {
        localStorage.setItem("aprendelo_proficiency", profSelect.value);
    });
}

/* ── Adaptive Quiz ────────────────────────────────────────────── */

function initQuiz() {
    const setupForm = document.getElementById("quiz-setup-form");
    const setupView = document.getElementById("quiz-setup-view");
    const activeView = document.getElementById("quiz-active-view");
    const resultsView = document.getElementById("quiz-results-view");
    const setupError = document.getElementById("quiz-setup-error");
    const activeError = document.getElementById("quiz-active-error");
    const startSpinner = document.getElementById("quiz-start-spinner");
    const submitSpinner = document.getElementById("quiz-submit-spinner");
    const nextSpinner = document.getElementById("quiz-next-spinner");

    const bannerLevel = document.getElementById("quiz-banner-level");
    const bannerSub = document.getElementById("quiz-banner-sub");

    const sectionCounter = document.getElementById("quiz-section-counter");
    const questionCounter = document.getElementById("quiz-question-counter");
    const progressFill = document.getElementById("quiz-progress-fill");
    const navDots = document.getElementById("quiz-nav-dots");

    const qBadge = document.getElementById("quiz-question-type-badge");
    const qPrompt = document.getElementById("quiz-question-prompt");
    const qHint = document.getElementById("quiz-question-hint");
    const answerArea = document.getElementById("quiz-answer-area");

    const btnPrev = document.getElementById("btn-quiz-prev");
    const btnNext = document.getElementById("btn-quiz-next");
    const btnSubmit = document.getElementById("btn-quiz-submit");
    const btnNextSection = document.getElementById("btn-quiz-next-section");
    const btnNewTopic = document.getElementById("btn-quiz-new-topic");

    if (!setupForm) return;

    let currentSection = 1;
    let currentTopic = "";
    let currentLevel = "B1";
    let questions = [];
    let userAnswers = {}; // { [id]: string }
    let currentIndex = 0;

    // Sync initial level select with global setting
    const { proficiency: defaultProf } = getGlobalSettings();
    const levelSelect = document.getElementById("quiz-level-select");
    if (levelSelect && defaultProf) {
        levelSelect.value = defaultProf;
    }

    function updateLevelBanner(level, message) {
        if (bannerLevel) bannerLevel.textContent = `Targeting Level ${level}`;
        if (bannerSub) bannerSub.textContent = message || "Questions calibrated to keep you in your growth zone.";
    }

    async function loadSection(topic, level, isNext = false) {
        const { model } = getGlobalSettings();
        if (!model) {
            alert("Please select an Ollama Model in the Settings tab first.");
            return;
        }

        const spinner = isNext ? nextSpinner : startSpinner;
        if (spinner) spinner.classList.remove("hidden");
        if (setupError) setupError.classList.add("hidden");
        if (activeError) activeError.classList.add("hidden");

        try {
            const resp = await fetch("/api/quiz/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: model,
                    topic: topic,
                    proficiency: level,
                }),
            });

            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                throw new Error(errData.error || "Failed to generate quiz.");
            }

            const data = await resp.json();
            questions = data.questions || [];
            if (!questions.length) {
                throw new Error("No questions returned from quiz generator.");
            }

            currentTopic = topic;
            currentLevel = level;
            userAnswers = {};
            currentIndex = 0;

            updateLevelBanner(currentLevel, `Section ${currentSection} active. Answer all 10 questions to calibrate your next level.`);

            setupView.classList.add("hidden");
            resultsView.classList.add("hidden");
            activeView.classList.remove("hidden");

            renderNavDots();
            renderQuestion(currentIndex);
        } catch (err) {
            const errBox = isNext ? activeError : setupError;
            if (errBox) {
                showError(errBox, err.message);
            }
        } finally {
            if (spinner) spinner.classList.add("hidden");
        }
    }

    setupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const topic = document.getElementById("quiz-topic").value.trim();
        const level = document.getElementById("quiz-level-select").value;
        currentSection = 1;
        await loadSection(topic, level, false);
    });

    function renderNavDots() {
        navDots.innerHTML = "";
        questions.forEach((q, idx) => {
            const dot = document.createElement("button");
            dot.type = "button";
            dot.className = "quiz-dot";
            dot.textContent = idx + 1;
            dot.title = `Question ${idx + 1}`;
            if (idx === currentIndex) dot.classList.add("active");
            if (userAnswers[q.id]) dot.classList.add("answered");

            dot.addEventListener("click", () => {
                saveCurrentAnswer();
                currentIndex = idx;
                renderQuestion(currentIndex);
            });
            navDots.appendChild(dot);
        });
    }

    function saveCurrentAnswer() {
        const q = questions[currentIndex];
        if (!q) return;

        if (q.type === "fill_in_blank" || q.type === "short_answer") {
            const input = document.getElementById(`quiz-input-${q.id}`);
            if (input) {
                userAnswers[q.id] = input.value.trim();
            }
        }
        updateDotStatus(currentIndex);
    }

    function updateDotStatus(idx) {
        const dots = navDots.querySelectorAll(".quiz-dot");
        if (dots[idx]) {
            const q = questions[idx];
            if (userAnswers[q.id] && userAnswers[q.id].length > 0) {
                dots[idx].classList.add("answered");
            } else {
                dots[idx].classList.remove("answered");
            }
        }
    }

    function renderQuestion(idx) {
        const q = questions[idx];
        if (!q) return;

        // Counters & progress
        sectionCounter.textContent = `Section ${currentSection}`;
        questionCounter.textContent = `Question ${idx + 1} of ${questions.length}`;
        const pct = Math.round(((idx + 1) / questions.length) * 100);
        progressFill.style.width = `${pct}%`;

        // Update active dot
        const dots = navDots.querySelectorAll(".quiz-dot");
        dots.forEach((d, i) => {
            d.classList.toggle("active", i === idx);
        });

        // Type badge
        if (q.type === "multiple_choice") {
            qBadge.textContent = "Multiple Choice";
        } else if (q.type === "fill_in_blank") {
            qBadge.textContent = "Fill in the Blank";
        } else {
            qBadge.textContent = "Short Answer / Translation";
        }

        // Prompt & hint
        qPrompt.textContent = q.question;
        if (q.hint) {
            qHint.textContent = `Hint: ${q.hint}`;
            qHint.classList.remove("hidden");
        } else {
            qHint.classList.add("hidden");
        }

        // Render answer area
        answerArea.innerHTML = "";
        const savedAnswer = userAnswers[q.id] || "";

        if (q.type === "multiple_choice") {
            const grid = document.createElement("div");
            grid.className = "quiz-options-grid";
            const letters = ["A", "B", "C", "D"];

            (q.options || []).forEach((opt, optIdx) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "quiz-option-btn";
                if (savedAnswer === opt) btn.classList.add("selected");

                const letter = document.createElement("span");
                letter.className = "quiz-option-letter";
                letter.textContent = letters[optIdx] || String(optIdx + 1);

                const label = document.createElement("span");
                label.textContent = opt;

                btn.appendChild(letter);
                btn.appendChild(label);

                btn.addEventListener("click", () => {
                    grid.querySelectorAll(".quiz-option-btn").forEach(b => b.classList.remove("selected"));
                    btn.classList.add("selected");
                    userAnswers[q.id] = opt;
                    updateDotStatus(idx);
                });
                grid.appendChild(btn);
            });
            answerArea.appendChild(grid);
        } else {
            // Fill in the blank or short answer
            const input = document.createElement("input");
            input.type = "text";
            input.className = "quiz-text-input";
            input.id = `quiz-input-${q.id}`;
            input.placeholder = q.type === "fill_in_blank" ? "Type missing word in Spanish..." : "Type your Spanish answer...";
            input.value = savedAnswer;
            input.autocomplete = "off";

            input.addEventListener("input", () => {
                userAnswers[q.id] = input.value.trim();
                updateDotStatus(idx);
            });
            answerArea.appendChild(input);
            // Auto focus text input for quick typing
            setTimeout(() => input.focus(), 50);
        }

        // Prev / Next buttons state
        btnPrev.disabled = idx === 0;
        btnNext.disabled = idx === questions.length - 1;
    }

    btnPrev.addEventListener("click", () => {
        saveCurrentAnswer();
        if (currentIndex > 0) {
            currentIndex--;
            renderQuestion(currentIndex);
        }
    });

    btnNext.addEventListener("click", () => {
        saveCurrentAnswer();
        if (currentIndex < questions.length - 1) {
            currentIndex++;
            renderQuestion(currentIndex);
        }
    });

    btnSubmit.addEventListener("click", async () => {
        saveCurrentAnswer();

        // Check for unanswered questions
        const answeredCount = Object.values(userAnswers).filter(a => a && a.length > 0).length;
        if (answeredCount < questions.length) {
            const unanswered = questions.length - answeredCount;
            const confirmSubmit = confirm(`You have ${unanswered} unanswered question(s). Submit section anyway?`);
            if (!confirmSubmit) return;
        }

        const { model } = getGlobalSettings();
        if (!model) {
            alert("Please select a model in Settings.");
            return;
        }

        btnSubmit.disabled = true;
        submitSpinner.classList.remove("hidden");
        activeError.classList.add("hidden");

        try {
            const resp = await fetch("/api/quiz/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: model,
                    topic: currentTopic,
                    proficiency: currentLevel,
                    questions: questions,
                    answers: userAnswers,
                }),
            });

            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                throw new Error(errData.error || "Evaluation failed.");
            }

            const evalResult = await resp.json();
            displayResults(evalResult);
        } catch (err) {
            showError(activeError, `Evaluation error: ${err.message}`);
        } finally {
            btnSubmit.disabled = false;
            submitSpinner.classList.add("hidden");
        }
    });

    function displayResults(data) {
        activeView.classList.add("hidden");
        resultsView.classList.remove("hidden");

        const scoreNum = document.getElementById("quiz-score-num");
        const scorePct = document.getElementById("quiz-score-pct");
        const titleEl = document.getElementById("quiz-results-title");
        const summaryEl = document.getElementById("quiz-results-summary");

        const transIcon = document.getElementById("quiz-transition-icon");
        const transLevel = document.getElementById("quiz-transition-level");
        const transSub = document.getElementById("quiz-transition-sub");
        const breakdownList = document.getElementById("quiz-breakdown-list");
        const nextBtnText = document.getElementById("btn-quiz-next-text");

        scoreNum.textContent = `${data.score}/${data.total}`;
        scorePct.textContent = `${data.accuracy}%`;

        if (data.accuracy >= 75) {
            titleEl.textContent = "Outstanding Performance! 🎉";
        } else if (data.accuracy >= 50) {
            titleEl.textContent = "Solid Progress! 👏";
        } else {
            titleEl.textContent = "Good Effort — Foundations Reinforced! 💪";
        }

        summaryEl.textContent = data.summary || "Section complete.";

        // Update next level info
        if (data.level_action === "increase") {
            transIcon.textContent = "🚀";
        } else if (data.level_action === "decrease") {
            transIcon.textContent = "💡";
        } else {
            transIcon.textContent = "🎯";
        }

        transLevel.textContent = `Next Section Target: Level ${data.next_level}`;
        transSub.textContent = data.level_alert_message;
        updateLevelBanner(data.next_level, data.level_alert_message);

        // Update currentLevel for the upcoming section
        currentLevel = data.next_level;
        nextBtnText.textContent = `Start Section ${currentSection + 1} (Level ${currentLevel}) →`;

        // Render question breakdown list
        breakdownList.innerHTML = "";
        (data.results || []).forEach((item, i) => {
            const card = document.createElement("div");
            card.className = `quiz-breakdown-item ${item.is_correct ? "correct" : "incorrect"}`;

            const top = document.createElement("div");
            top.className = "quiz-breakdown-top";

            const qTitle = document.createElement("span");
            qTitle.className = "quiz-breakdown-q";
            qTitle.textContent = `${i + 1}. ${item.question}`;

            const status = document.createElement("span");
            status.className = "quiz-breakdown-status";
            status.textContent = item.is_correct ? "✓ Correct" : "✗ Incorrect";

            top.appendChild(qTitle);
            top.appendChild(status);

            const answers = document.createElement("div");
            answers.className = "quiz-breakdown-answers";

            const userA = document.createElement("div");
            userA.className = "quiz-user-answer";
            const userStrong = document.createElement("strong");
            userStrong.textContent = "Your Answer: ";
            userA.appendChild(userStrong);
            userA.appendChild(document.createTextNode(item.user_answer || "(No answer)"));

            const corrA = document.createElement("div");
            corrA.className = "quiz-correct-answer";
            const corrStrong = document.createElement("strong");
            corrStrong.textContent = "Correct Answer: ";
            corrA.appendChild(corrStrong);
            corrA.appendChild(document.createTextNode(item.correct_answer));

            answers.appendChild(userA);
            if (!item.is_correct) {
                answers.appendChild(corrA);
            }

            const feedback = document.createElement("div");
            feedback.className = "quiz-breakdown-feedback";
            feedback.textContent = `💡 ${item.feedback}`;

            card.appendChild(top);
            card.appendChild(answers);
            card.appendChild(feedback);
            breakdownList.appendChild(card);
        });

        resultsView.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    btnNextSection.addEventListener("click", async () => {
        currentSection++;
        await loadSection(currentTopic, currentLevel, true);
    });

    btnNewTopic.addEventListener("click", () => {
        resultsView.classList.add("hidden");
        activeView.classList.add("hidden");
        setupView.classList.remove("hidden");
        updateLevelBanner(currentLevel, "Configure your topic and level to start a new quiz.");
        setupView.scrollIntoView({ behavior: "smooth", block: "start" });
    });
}

/* ── Environment Checks ───────────────────────────────────────── */

function checkIOSEnvironment() {
    // Determine if we are running inside the iOS WKWebView wrapper
    const isIOSNative = window.webkit && window.webkit.messageHandlers;
    
    if (isIOSNative) {
        console.log("iOS Native Environment detected. Hiding incompatible features.");
        
        // Hide Translate tab and section
        const translateTab = document.getElementById("nav-translate");
        const translateSection = document.getElementById("section-translate");
        if (translateTab) translateTab.style.display = "none";
        if (translateSection) translateSection.style.display = "none";

        // Hide Quiz tab and section
        const quizTab = document.getElementById("nav-quiz");
        const quizSection = document.getElementById("section-quiz");
        if (quizTab) quizTab.style.display = "none";
        if (quizSection) quizSection.style.display = "none";

        // Optional: Remove local disabled warnings since iOS handles this natively
        const localWarnings = document.querySelectorAll('.local-disabled-message');
        localWarnings.forEach(w => w.style.display = 'none');
    }
}

