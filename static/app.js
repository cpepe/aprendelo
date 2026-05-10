/* ═══════════════════════════════════════════════════════════════════
   Aprendelo — Client-Side Application Logic
   Handles: Tab navigation, Flashcards, Conjugation, Chat (SSE),
            Booklet Builder (file upload + PDF download)
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {
    initSettings();
    initTabs();
    initFlashcards();
    initConjugation();
    initChat();
    initBooklet();
    initTranslate();
    initSentenceBuilder();
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

/* ── Booklet Builder ──────────────────────────────────────────── */

function initBooklet() {
    const form = document.getElementById("booklet-form");
    const statusDiv = document.getElementById("booklet-status");
    const errorDiv = document.getElementById("booklet-error");
    const btnSubmit = document.getElementById("btn-build-booklet");
    const spinner = document.getElementById("booklet-spinner");
    const btnText = btnSubmit.querySelector(".btn-text");

    // File display
    setupFileDrop("booklet-english-file", "drop-english", "english-file-name");
    setupFileDrop("booklet-target-file", "drop-target", "target-file-name");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        statusDiv.classList.add("hidden");
        errorDiv.classList.add("hidden");
        const { model, proficiency } = getGlobalSettings();
        const targetLang = document.getElementById("booklet-lang").value;
        const bindingType = document.getElementById("booklet-binding").value;
        const englishFile = document.getElementById("booklet-english-file").files[0];
        const targetFile = document.getElementById("booklet-target-file").files[0];
        const skipRestructure = document.getElementById("booklet-skip-restructure").checked;

        if (!englishFile) {
            showError(errorDiv, "Please upload an English text file.");
            return;
        }

        if (!targetFile && !model) {
            alert("Please select an Ollama Model in the Settings tab, or upload a target language file.");
            return;
        }

        // Build FormData
        const formData = new FormData();
        formData.append("proficiency", proficiency);
        formData.append("target_lang", targetLang);
        formData.append("binding_type", bindingType);
        formData.append("model", model || "");
        formData.append("skip_restructure", skipRestructure);
        formData.append("english_file", englishFile);
        if (targetFile) {
            formData.append("target_file", targetFile);
        }

        // UI: loading state
        btnSubmit.disabled = true;
        spinner.classList.remove("hidden");
        btnText.textContent = targetFile ? "Building PDF…" : "Translating & Building…";
        showStatus(statusDiv, targetFile
            ? "Generating PDF — this should only take a moment…"
            : "Translating text with Ollama and generating PDF — this may take a few minutes…"
        );

        try {
            const resp = await fetch("/api/booklet/build", {
                method: "POST",
                body: formData,
            });

            if (!resp.ok) {
                let errMsg = "Build failed.";
                try {
                    const errData = await resp.json();
                    errMsg = errData.error || errMsg;
                } catch (_) { }
                showError(errorDiv, errMsg);
                statusDiv.classList.add("hidden");
                return;
            }

            // Download the PDF
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;

            // Extract filename from Content-Disposition or use default
            const disposition = resp.headers.get("Content-Disposition");
            let filename = "bilingual_booklet.pdf";
            if (disposition) {
                const match = disposition.match(/filename="?(.+?)"?$/);
                if (match) filename = match[1];
            }

            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            showStatus(statusDiv, `✅ Booklet generated and downloaded as ${filename}`);
        } catch (err) {
            showError(errorDiv, `Request failed: ${err.message}`);
            statusDiv.classList.add("hidden");
        } finally {
            btnSubmit.disabled = false;
            spinner.classList.add("hidden");
            btnText.textContent = "Build Booklet";
        }
    });
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

function setupFileDrop(inputId, dropId, nameId) {
    const input = document.getElementById(inputId);
    const drop = document.getElementById(dropId);
    const nameSpan = document.getElementById(nameId);

    input.addEventListener("change", () => {
        if (input.files.length > 0) {
            nameSpan.textContent = input.files[0].name;
            drop.classList.add("has-file");
        } else {
            nameSpan.textContent = "";
            drop.classList.remove("has-file");
        }
    });

    drop.addEventListener("dragover", (e) => {
        e.preventDefault();
        drop.classList.add("dragover");
    });

    drop.addEventListener("dragleave", () => {
        drop.classList.remove("dragover");
    });

    drop.addEventListener("drop", (e) => {
        e.preventDefault();
        drop.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            input.files = e.dataTransfer.files;
            nameSpan.textContent = e.dataTransfer.files[0].name;
            drop.classList.add("has-file");
        }
    });
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
        
        // Hide toggle mode if in static mode (Advanced mode is disabled)
        if (isStaticMode) {
            btnToggleMode.classList.add("hidden");
        } else {
            btnToggleMode.classList.remove("hidden");
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
