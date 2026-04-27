## Aprendelo — Web Application Specification (v3.0 - Hybrid Static/Local Architecture)

This document outlines the design and architectural goals for a comprehensive language learning sandbox designed to help English speakers learn Spanish and other target languages.

### 1. Architectural Philosophy

The application utilizes a **Hybrid Static/Local Architecture**, bypassing the need for remote REST APIs, split stacks, or complex CORS environments. 
*   **Static Layer**: Features that rely purely on deterministic logic or local data (Flashcards and Conjugation) are hosted entirely statically. The UI and these tools operate smoothly on simple web hosts (like GitHub pages).
*   **Local Layer (Advanced LLM)**: Deep, generative tools (Chat, Translation, Booklet Builder) require the local Python/Flask server processing requests to `localhost:11434` (Ollama). 
*   **Zero-Config Enforcement**: Instead of the frontend querying for existence of the backend, the initial `index.html` document contains explicit static warnings masking the advanced LLM HTML. When the Python Flask app is run locally, it processes the `index.html` file on server startup, unmasks the advanced features, and securely serves the unified codebase.

### 2. Feature Specifications

#### 2.1. Flashcard Mini-Game (Static JavaScript)
*   **Functionality**: Presents interactive flashcards for vocabulary recall testing. The user can flip the card and proceed to the next random vocabulary word.
*   **Implementation**: Completely stateless. The JavaScript fetches a single static `flashcards.json` payload mapped to `{spanish: english}` logic from the exact same domain, randomizing and displaying the sets exclusively on the client side natively.

#### 2.2. Verb Conjugation Tool (Static JavaScript)
*   **Functionality**: Allows for rapid reference of conjugated Spanish verbs given an infinitive.
*   **Implementation**: The Python mappings covering regular patterns, pronoun arrays, tense dictionaries, and major irregular verbs have been natively transposed to a `conjugator.js` file. The frontend can perform immediate tense lookups across indicative, preterite, and imperfect scopes natively without routing calls.

#### 2.3. Conversational AI Chat (Local Backend)
*   **Functionality**: Open-ended conversational interface using a native Spanish tutor persona calibrated to a selected CEFR proficiency (A1-C2).
*   **Implementation**: Utilizes Server-Sent Events (SSE) from the Flask backend querying Ollama stream endpoints. Must gently enforce correct grammar or vocabulary inside Spanish context without relying heavily on English.

#### 2.4. Language Translator (Local Backend)
*   **Functionality**: Instant side-by-side string translation with stateless design logic.
*   **Features Inputs**: Source language (Auto-detect + 5 explicit targets), Target language (Spanish, English, French, Italian, German), Proficiency Targeting (A1-C2), and dynamic model selection. 
*   **Implementation**: Strictly separated from 'chat' dependencies. Inputs and outputs stream dynamically, but clearing the prompt inherently clears the session, avoiding context-window drag across rapid discrete translation tasks.

#### 2.5. Bilingual Booklet Builder (Local Backend)
*   **Functionality**: Powerful workflow combining unstructured text restructuring, target-language LLM translation generation, and local PDF formatting.
*   **Input Scope**: Analyzes an English `.txt` upload, processes line breaks and formatting, executes translations scoped to a proficiency, and exports either as a side-by-side or saddle-stitch comparative reading tool.
*   **Implementation Considerations**: Demands extensive context allocations locally for translation logic. Incorporates an optional toggle to bypass structural rewriting if text fits required paragraph layouts natively. Outputs generated dynamically via python binaries sent locally down the pipe mapping to a downloaded file descriptor.