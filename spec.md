## Spanish Learning Web Application Specification (v2.0 - Tech Stack Refinement)

This document outlines the requirements for a web application designed to help English speakers learn Spanish through interactive mini-games. The architecture must support both simple, data-driven games and complex, LLM-powered interactions.

### 1. Core Goals

*   **Target Audience**: English speakers learning Spanish.
*   **Learning Aids**: Flashcards, Verb Conjugation Tool, Conversational Practice.
*   **Technology Stack Hint**: Web frontend using plain javascript, Backend API to manage state and interact with LLM services (Flask/Python).

### 2. Feature Specifications

#### 2.1. Flashcard Mini-Game
*   **Functionality**: Display a word (Spanish or English) and quiz the user on the corresponding translation. Must support basic vocabulary recall.
*   **Data Structure**: Data must be loaded from a structured data file (e.g., JSON or a Python dictionary file).
*   **Data Example**: `flashcard_words = {'ir':'to go', 'perro':'dog', 'hablar':'to speak', ...}`
*   **UI/UX**: Simple, clean interface with 'Show Answer' or card-flipping interaction. Score keeping or answer verification is not necessary.

#### 2.2. Verb Conjugation Tool
*   **Functionality**: The user must be able to input a Spanish verb (e.g., *hablar*) and select a tense and mood (e.g., Present Indicative, Preterite, Imperfect Subjunctive). The tool must accurately return the conjugated form.
*   **Scope**: Must cover at least the present, preterite, and imperfect indicative tenses for regular and common irregular verbs.
*   **Data Requirement**: Requires a comprehensive lookup table or dedicated conjugation logic within the backend.

#### 2.3. Conversational Practice (AI Chat)
*   **Functionality**: The user engages in free-form text conversation with an AI counterpart.
*   **LLM Integration**: This component *must* integrate with an **Ollama LLM**. Avoid litellm and use a simple api. The LLM should assume the persona of a native Spanish speaker and guide the conversation to facilitate learning.
*   **Context Management**: The system must maintain conversation history and incorporate subtle, helpful corrections or vocabulary suggestions from the LLM when appropriate.
*   **Prompting Note**: The system prompt for the LLM must instruct it to respond primarily in Spanish but to guide the user gently toward correct grammar or vocabulary if the user makes a noticeable error.

#### 2.4. Bilingual Booklet Builder
*   **Functionality**: The user must be able to provide several inputs for this feature to build a booklet with a target language on the left side and english on the right. This provides the reader instant help with unknown words or grammer. 
*   **Inputs**: 
        1. Proficiency Level (e.g. A1, A2, B1, B2, C1) 
        2. Target language: Spanish, German, French
        3. English text: uploading a text file of the story in English
        4. (Optional) Target language text: uploading a text file of the story in the target language
        5. Binding type: Saddle stapled, or side-by-side (PDF)
*   **Logic**: If the user provides a target language text then those are use to build the PDF and no translation nor LLM interaction is needed. Otherwise, the English text is translated by the tool's LLM into the target language and the input and translation are used to build the PDF. There is always a footer with page number on each page.
*   **Output**: A PDF in the selected binding type
*   **Considerations**: It is critical that the translation allows the english and target texts physically align sentence by sentence so that the english and target language are physically horizontally aligned. Restructure the english text so that it is easier to translate and align with the target language. 