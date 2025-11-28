/**
 * Prompt Templates
 *
 * All prompts used in the MAKER framework for:
 * - Question classification
 * - Question decomposition (MAD)
 * - Answer generation
 * - Answer synthesis
 */

import type { SubQuestionResult, Classification, SubQuestion } from '../types';

/**
 * Prompt template functions
 */
export const PROMPTS = {
  /**
   * Classification prompt - determines if a question needs decomposition
   */
  classify: (question: string, context?: string): string => `
You are a question classifier. Analyze the following question and determine:
1. Whether it needs to be decomposed into sub-questions
2. Its complexity level (1-10)
3. The type of question

Question: ${question}
${context ? `\nContext available: ${context.substring(0, 500)}...` : ''}

A question needs decomposition if it:
- Requires multiple facts to answer
- Involves comparisons
- Needs multi-step reasoning
- Asks about multiple aspects

Question types:
- factual: Simple fact lookup
- comparative: Comparing multiple items
- multi-hop: Requires multiple reasoning steps
- aggregative: Requires aggregating multiple facts
- procedural: Step-by-step procedure
- analytical: Analysis/reasoning

Respond ONLY with JSON:
{
  "needsDecomposition": boolean,
  "complexity": number (1-10),
  "questionType": "factual" | "comparative" | "multi-hop" | "aggregative" | "procedural" | "analytical",
  "reasoning": "Brief explanation of your classification"
}
`.trim(),

  /**
   * Decomposition prompt - breaks a question into atomic sub-questions
   */
  decompose: (question: string, context?: string, maxSubQuestions = 8): string => `
You are a question decomposer following the MAD (Maximal Agentic Decomposition) principle.

Break down the following question into atomic sub-questions. Each sub-question should:
- Be answerable with a single fact or simple reasoning
- Be independent or clearly depend on previous sub-questions
- Together, fully cover what's needed to answer the original question

Original Question: ${question}
${context ? `\nContext available: Yes (${context.length} characters)` : '\nContext available: No'}

Rules:
1. Create at most ${maxSubQuestions} sub-questions
2. Each sub-question should require ONE decision/lookup
3. Mark dependencies between sub-questions
4. Order sub-questions logically (dependencies come first)

Respond ONLY with JSON:
{
  "subQuestions": [
    {
      "id": "sq1",
      "question": "The sub-question text",
      "dependencies": [],
      "type": "factual" | "comparative" | "multi-hop" | "aggregative" | "procedural" | "analytical"
    }
  ],
  "synthesisStrategy": "combine" | "compare" | "aggregate" | "sequence"
}
`.trim(),

  /**
   * Answer generation prompt - generates an answer to a question
   */
  answer: (question: string, context?: string): string => `
Answer the following question based on the provided context.

${context ? `=== CONTEXT ===
${context}
=== END CONTEXT ===

` : ''}Question: ${question}

Rules:
1. Answer based ONLY on the provided context (if available)
2. Be concise - aim for 1-3 sentences
3. If the answer is not in the context, indicate low confidence
4. Do not make up information

Respond ONLY with JSON:
{
  "answer": "Your answer here",
  "confidence": "high" | "medium" | "low",
  "found": boolean (whether the answer was found in the context)
}
`.trim(),

  /**
   * Synthesis prompt - combines sub-answers into a final answer
   */
  synthesize: (
    originalQuestion: string,
    subAnswers: SubQuestionResult[],
    language = 'English'
  ): string => {
    const answersText = subAnswers
      .map((sa, i) => `Question ${i + 1}: ${sa.question}\nAnswer ${i + 1}: ${sa.answer}`)
      .join('\n\n');

    return `
Synthesize a coherent final answer from the following sub-questions and answers.

Original Question: ${originalQuestion}

Sub-Questions and Answers:
${answersText}

IMPORTANT:
1. Combine ALL answers into a complete, coherent response
2. Use the concrete information provided - NO placeholders
3. Respond in ${language}
4. The final answer should directly address the original question

Respond ONLY with JSON:
{
  "finalAnswer": "Your synthesized answer here",
  "confidence": "high" | "medium" | "low"
}
`.trim();
  },

  /**
   * German synthesis prompt (for backwards compatibility with n8n workflow)
   */
  synthesizeDE: (
    originalQuestion: string,
    subAnswers: SubQuestionResult[]
  ): string => {
    const answersText = subAnswers
      .map((sa, i) => `Frage ${i + 1}: ${sa.question}\nAntwort ${i + 1}: ${sa.answer}`)
      .join('\n\n');

    return `
Synthetisiere eine zusammenhängende finale Antwort.

Originalfrage: ${originalQuestion}

Teilfragen und Antworten:
${answersText}

WICHTIG:
1. Kombiniere ALLE Antworten zu einer vollständigen, kohärenten Antwort
2. Verwende die konkreten Informationen - KEINE Platzhalter
3. Antworte auf Deutsch

Antworte NUR mit JSON:
{
  "finalAnswer": "Deine synthetisierte Antwort hier",
  "confidence": "high" | "medium" | "low"
}
`.trim();
  },
};

/**
 * Parse classification response
 */
export function parseClassification(response: unknown): Classification {
  if (typeof response === 'object' && response !== null) {
    const r = response as Record<string, unknown>;
    return {
      needsDecomposition: Boolean(r.needsDecomposition),
      complexity: Number(r.complexity) || 5,
      questionType: (r.questionType as Classification['questionType']) || 'factual',
      reasoning: String(r.reasoning || ''),
    };
  }

  // Default classification
  return {
    needsDecomposition: false,
    complexity: 5,
    questionType: 'factual',
  };
}

/**
 * Parse decomposition response
 */
export function parseDecomposition(
  response: unknown
): { subQuestions: SubQuestion[]; synthesisStrategy: string } {
  if (typeof response === 'object' && response !== null) {
    const r = response as Record<string, unknown>;
    const subQuestions = Array.isArray(r.subQuestions)
      ? r.subQuestions.map((sq, index) => {
          const sqObj = sq as Record<string, unknown>;
          return {
            id: String(sqObj.id || `sq${index + 1}`),
            question: String(sqObj.question || ''),
            dependencies: Array.isArray(sqObj.dependencies)
              ? sqObj.dependencies.map(String)
              : [],
            type: (sqObj.type as SubQuestion['type']) || 'factual',
            index,
          };
        })
      : [];

    return {
      subQuestions,
      synthesisStrategy: String(r.synthesisStrategy || 'combine'),
    };
  }

  return {
    subQuestions: [],
    synthesisStrategy: 'combine',
  };
}

/**
 * Parse synthesis response
 */
export function parseSynthesis(response: unknown): { answer: string; confidence: string } {
  if (typeof response === 'object' && response !== null) {
    const r = response as Record<string, unknown>;
    return {
      answer: String(r.finalAnswer || r.answer || ''),
      confidence: String(r.confidence || 'medium'),
    };
  }

  if (typeof response === 'string') {
    return {
      answer: response,
      confidence: 'medium',
    };
  }

  return {
    answer: '',
    confidence: 'low',
  };
}
