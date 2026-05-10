## Aprendelo — Web Application Specification (v3.0 - Hybrid Static/Local Architecture)

This document outlines the design and architectural goals for a comprehensive language learning sandbox designed to help English speakers learn Spanish and other target languages.

### 1. Architectural Philosophy

The application utilizes a **Hybrid Static/Local Architecture**, bypassing the need for remote REST APIs, split stacks, or complex CORS environments. 
*   **Static Layer**: Features that rely purely on deterministic logic or local data (Flashcards and Conjugation) are hosted entirely statically. The UI and these tools operate smoothly on simple web hosts (like GitHub pages).
*   **Local Layer (Advanced LLM)**: Deep, generative tools (Chat, Translation, Booklet Builder) require the local Python/Flask server processing requests to `localhost:11434` (Ollama). 
*   **Zero-Config Enforcement**: Instead of the frontend querying for existence of the backend, the initial `index.html` document contains explicit static warnings masking the advanced LLM HTML. When the Python Flask app is run locally, it processes the `index.html` file on server startup, unmasks the advanced features, and securely serves the unified codebase.

### 2. Feature Specifications

#### 2.1. Flashcard Mini-Games (Static JavaScript)
*   **Functionality**: All of the mini-games use the same UI engine. Each mini-game loads a different dataset of spanish:english pairs.
##### 2.1.1 Flashcard Mini-Game (Static JavaScript)
*   **Functionality**: Presents interactive flashcards for vocabulary recall testing. The user can flip the card and proceed to the next random vocabulary word.
*   **Implementation**: Completely stateless. The JavaScript fetches a single static `flashcards.json` payload mapped to `{spanish: english}` logic from the exact same domain, randomizing and displaying the sets exclusively on the client side natively.
*   **Data**: All pairs are stored in flashcards.json. The data set contains both individual words and phrases at the B2 level.
##### 2.1.2 Flash-phrases Mini-Game (Static JavaScript)
*   **Functionality**: Presents interactive flashcards for vocabulary recall testing. The user can flip the card and proceed to the next random vocabulary word.
*   **Implementation**: Completely stateless. The JavaScript fetches a single static `flash-phrases.json` payload mapped to `{english: spanish}` logic from the exact same domain, randomizing and displaying the sets exclusively on the client side natively.
*   **Data**: All pairs are stored in flash-phrases.json. The data set contains sentences and phrases at the B2 level. It contains examples of all tenses.
##### 2.1.3 Flash-images Mini-Game (Static JavaScript)
*   **Functionality**: Presents interactive flashcards for vocabulary recall testing. The user can flip the card and proceed to the next random vocabulary word.
*   **Implementation**: Completely stateless. The JavaScript fetches a single static `flash-images.json` payload mapped to `{image: spanish}` logic from the exact same domain, randomizing and displaying the sets exclusively on the client side natively.
*   **Data**: All pairs are stored in flash-images.json. The data set contains images of common body parts, animals, plants, and the cooresponding spanish word at the B2 level. Example is a cartoon image of a foot paired with the word 'pie'

#### 2.2. Verb Conjugation Tool
*   **Functionality**: The user must be able to input a Spanish verb (e.g., *hablar*). The tool must accurately return the conjugated forms for all pronouns in the most important tenses (Presente, Pretérito, Imperfecto, Future) and indicate if the verb is irregular in that tense. Include the English translation for each conjugation (e.g. nacío - was born).
*   **Data Requirement**: Implemented entirely on the frontend using JavaScript, combining dedicated conjugation logic for regular verbs with a lookup table for common irregular verbs.

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

#### 2.6. Sentence Builder (Hybrid — Static Fallback + Local Backend)
*   **Functionality**: Generates dynamic sentence construction exercises. The user inputs a target verb, topic, or grammar rule. If no word is input, a random seed word is used. The LLM (when available) generates a Spanish sentence and corresponding English translation. The Spanish sentence is provided as jumbled, interactive tiles (including distractor words). All words from the Spanish sentence must be included in the tiles; additional distractor tiles should be relevant but must not form a cohesive alternative sentence. Advanced mode hides the tiles and lets the user type their response into a free-form text field.
*   **Data Persistence**: Each LLM-generated sentence pair (english → spanish) is appended to `flash-phrases.json`, enriching the flash-phrases flashcard deck on the fly.
*   **Static Fallback**: When the backend is not available, the Sentence Builder pulls a random entry from `flash-phrases.json` to create the exercise client-side. Tiles are built by splitting the Spanish sentence and adding distractor words sampled from other entries. Evaluation in static mode uses simple normalized string comparison instead of LLM grading.
*   **User Experience**: Features a workspace where users assemble tiles to form the complete sentence. Users submit their completed sentence for evaluation rather than restrictive word-by-word checking. Clicking "Advanced" hides tiles and shows a text field; clicking "Tiles" reverses this. Both modes submit for grading. "Reset Words" scrambles the tiles. "Answer" reveals the correct `test_sentence`. In the static implementation Advanced mode and "Topic of Verb" are disabled
*   **Evaluation Model**: When available it leverages the local LLM to grade the final submitted sentence. This accommodates the natural flexibility of Spanish syntax (e.g., dropped pronouns, variable word order) rather than forcing a single hardcoded solution. Upon submission, the LLM provides constructive feedback, explains any errors, and offers the ideal correction. In the static implementation the evaluation compares the submitted answer to the `test_sentence`.