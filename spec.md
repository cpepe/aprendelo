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
*   **Implementation**: Completely stateless. The JavaScript fetches a single static `flash-phrases.json` payload mapped to `{spanish: english}` logic from the exact same domain, randomizing and displaying the sets exclusively on the client side natively.
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

#### 2.6. Sentence Builder (Local Backend)
*   **Functionality**: Generates dynamic sentence construction exercises. The user inputs a target verb, topic, or grammar rule along with their CEFR level (A1-C2). If no word is input use a random word to seed the LLM. The local LLM generates spanish sentence and corresponding English translation. The spanish sentence is provided as jumbled, interactive tiles (including additional words as distractors). Ensure all from the spanish sentence are included in the tiles. (additional tiles should be relevant but not form a cohesive sentence). Advanced mode hides the tiles, and let's the user enter their response into a text field.
*   **User Experience**: Features a drag-and-drop workspace (or staging area) where users can assemble and reorder the tiles to form the complete sentence. Instead of restrictive, frustrating word-by-word error checking, users submit their completed sentence for evaluation. If the user clicks the "Advanced" button the tiles are hidden and a text field is displayed. In advanced mode a "Tiles" button is displayed. If the Tiles button is clicked the text field is hidden and the tiles are displayed. Whether advanced or tile mode the result submitted for grading.

When clicked, the "Reset Words" button scrambles the tiles.
There is an "Answer" button. When clicked the generated "test_sentence" is revealed to the user.

*   **Evaluation Model**: Leverages the local LLM to grade the final submitted sentence. This critically accommodates the natural flexibility of Spanish syntax (e.g., dropped pronouns, variable subject-verb order) rather than forcing a single hardcoded solution. Upon submission, the LLM provides constructive feedback, explains any errors, and offers the ideal correction.