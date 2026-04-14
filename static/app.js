/* ═══════════════════════════════════════════════════════════════════
   Aprendelo — Client-Side Application Logic
   Handles: Tab navigation, Flashcards, Conjugation, Chat (SSE),
            Booklet Builder (file upload + PDF download)
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initFlashcards();
    initConjugation();
    initChat();
    initBooklet();
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

/* ── Flashcards ───────────────────────────────────────────────── */

function initFlashcards() {
    const card = document.getElementById("flashcard");
    const frontWord = document.getElementById("card-front-word");
    const backWord = document.getElementById("card-back-word");
    const btnNext = document.getElementById("btn-next-card");

    function flipCard() {
        card.classList.toggle("flipped");
    }

    async function loadCard() {
        card.classList.remove("flipped");

        try {
            const resp = await fetch("/api/flashcard/get_card");
            const data = await resp.json();
            if (data.error) {
                frontWord.textContent = "Error";
                backWord.textContent = data.error;
                return;
            }
            // Small delay so the un-flip animation finishes
            setTimeout(() => {
                frontWord.textContent = data.spanish;
                backWord.textContent = data.english;
            }, 150);
        } catch (err) {
            frontWord.textContent = "Error";
            backWord.textContent = "Could not load card";
        }
    }

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
    const tenseSelect = document.getElementById("conj-tense");
    const resultCard = document.getElementById("conjugation-result");
    const resultVerb = document.getElementById("conj-result-verb");
    const resultBadge = document.getElementById("conj-result-badge");
    const tableBody = document.getElementById("conj-table-body");
    const errorDiv = document.getElementById("conjugation-error");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        resultCard.classList.add("hidden");
        errorDiv.classList.add("hidden");

        const verb = verbInput.value.trim();
        const tense = tenseSelect.value;

        if (!verb) {
            showError(errorDiv, "Please enter a verb.");
            return;
        }

        try {
            const resp = await fetch("/api/conjugation/conjugate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ verb, tense }),
            });

            const data = await resp.json();

            if (data.error) {
                showError(errorDiv, data.error);
                return;
            }

            // Render results
            resultVerb.textContent = data.verb;
            resultBadge.textContent = data.irregular ? "Irregular" : "Regular";
            resultBadge.style.background = data.irregular
                ? "rgba(239, 68, 68, 0.15)"
                : "rgba(34, 197, 94, 0.15)";
            resultBadge.style.color = data.irregular ? "#fca5a5" : "#86efac";
            resultBadge.style.borderColor = data.irregular
                ? "rgba(239, 68, 68, 0.25)"
                : "rgba(34, 197, 94, 0.25)";

            tableBody.innerHTML = "";
            data.conjugations.forEach((c) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td>${c.pronoun}</td><td>${c.form}</td>`;
                tableBody.appendChild(tr);
            });

            resultCard.classList.remove("hidden");
        } catch (err) {
            showError(errorDiv, "Request failed. Is the server running?");
        }
    });
}

/* ── Chat ─────────────────────────────────────────────────────── */

function initChat() {
    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");
    const messagesDiv = document.getElementById("chat-messages");
    const modelSelect = document.getElementById("chat-model-select");
    const btnClear = document.getElementById("btn-clear-chat");

    let conversationHistory = [];
    let isStreaming = false;

    // Load models
    loadModels(modelSelect);

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (isStreaming) return;

        const message = input.value.trim();
        if (!message) return;

        const model = modelSelect.value;
        if (!model) {
            alert("Please select a model first.");
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
    const modelSelect = document.getElementById("booklet-model");
    const statusDiv = document.getElementById("booklet-status");
    const errorDiv = document.getElementById("booklet-error");
    const btnSubmit = document.getElementById("btn-build-booklet");
    const spinner = document.getElementById("booklet-spinner");
    const btnText = btnSubmit.querySelector(".btn-text");

    // File display
    setupFileDrop("booklet-english-file", "drop-english", "english-file-name");
    setupFileDrop("booklet-target-file", "drop-target", "target-file-name");

    // Load models
    loadModels(modelSelect);

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        statusDiv.classList.add("hidden");
        errorDiv.classList.add("hidden");

        const proficiency = document.getElementById("booklet-proficiency").value;
        const targetLang = document.getElementById("booklet-lang").value;
        const model = modelSelect.value;
        const bindingType = document.getElementById("booklet-binding").value;
        const englishFile = document.getElementById("booklet-english-file").files[0];
        const targetFile = document.getElementById("booklet-target-file").files[0];
        const skipRestructure = document.getElementById("booklet-skip-restructure").checked;

        if (!englishFile) {
            showError(errorDiv, "Please upload an English text file.");
            return;
        }

        if (!targetFile && !model) {
            showError(errorDiv, "Please select a model for translation, or upload a target language file.");
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
                } catch (_) {}
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
