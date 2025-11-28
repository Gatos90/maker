/**
 * Decomposer (MAD - Maximal Agentic Decomposition)
 *
 * Implements question decomposition from the MAKER framework (Section 3.1).
 * Breaks complex questions into atomic sub-questions that can be answered independently.
 */

import type {
  DecompositionConfig,
  LLMProvider,
  SubQuestion,
  Classification,
  ClassifierFunction,
} from '../types';
import { PROMPTS, parseClassification, parseDecomposition } from '../prompts';

/**
 * Default decomposition configuration
 */
const DEFAULT_CONFIG: Required<Omit<DecompositionConfig, 'classifier' | 'prompt'>> = {
  enabled: true,
  maxSubQuestions: 8,
};

/**
 * Decomposer class
 *
 * Classifies questions and decomposes complex ones into atomic sub-questions.
 */
export class Decomposer {
  private readonly enabled: boolean;
  private readonly maxSubQuestions: number;
  private readonly classifier: 'auto' | ClassifierFunction;
  private readonly customPrompt?: string;

  constructor(
    private readonly provider: LLMProvider,
    config: DecompositionConfig = {}
  ) {
    this.enabled = config.enabled ?? DEFAULT_CONFIG.enabled;
    this.maxSubQuestions = config.maxSubQuestions ?? DEFAULT_CONFIG.maxSubQuestions;
    this.classifier = config.classifier ?? 'auto';
    this.customPrompt = config.prompt;
  }

  /**
   * Classify a question to determine if it needs decomposition
   *
   * @param question - The question to classify
   * @param context - Optional context
   * @returns Classification result
   */
  async classify(question: string, context?: string): Promise<Classification> {
    // Use custom classifier if provided
    if (typeof this.classifier === 'function') {
      return this.classifier(question, context);
    }

    // Use LLM for classification
    const prompt = PROMPTS.classify(question, context);

    const response = await this.provider.complete({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      responseFormat: { type: 'json_object' },
    });

    return parseClassification(response.content);
  }

  /**
   * Decompose a question into sub-questions
   *
   * @param question - The question to decompose
   * @param context - Optional context
   * @returns Array of sub-questions
   */
  async decompose(question: string, context?: string): Promise<{
    subQuestions: SubQuestion[];
    synthesisStrategy: string;
    classification: Classification;
  }> {
    // If decomposition is disabled, return original question as single sub-question
    if (!this.enabled) {
      return {
        subQuestions: [this.createSingleSubQuestion(question)],
        synthesisStrategy: 'none',
        classification: {
          needsDecomposition: false,
          complexity: 1,
          questionType: 'factual',
        },
      };
    }

    // Classify the question
    const classification = await this.classify(question, context);

    // If doesn't need decomposition, return as single sub-question
    if (!classification.needsDecomposition) {
      return {
        subQuestions: [this.createSingleSubQuestion(question, classification.questionType)],
        synthesisStrategy: 'none',
        classification,
      };
    }

    // Decompose the question
    const prompt = this.customPrompt
      ? this.customPrompt.replace('{{question}}', question).replace('{{context}}', context || '')
      : PROMPTS.decompose(question, context, this.maxSubQuestions);

    const response = await this.provider.complete({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      responseFormat: { type: 'json_object' },
    });

    const parsed = parseDecomposition(response.content);

    // Validate and limit sub-questions
    let subQuestions = parsed.subQuestions;
    if (subQuestions.length > this.maxSubQuestions) {
      subQuestions = subQuestions.slice(0, this.maxSubQuestions);
    }

    // If decomposition failed, return original question
    if (subQuestions.length === 0) {
      return {
        subQuestions: [this.createSingleSubQuestion(question, classification.questionType)],
        synthesisStrategy: 'none',
        classification,
      };
    }

    return {
      subQuestions,
      synthesisStrategy: parsed.synthesisStrategy,
      classification,
    };
  }

  /**
   * Create a single sub-question from the original question
   */
  private createSingleSubQuestion(
    question: string,
    type: SubQuestion['type'] = 'factual'
  ): SubQuestion {
    return {
      id: 'sq1',
      question,
      dependencies: [],
      type,
      index: 0,
    };
  }

  /**
   * Check if decomposition is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get the maximum number of sub-questions
   */
  getMaxSubQuestions(): number {
    return this.maxSubQuestions;
  }
}
