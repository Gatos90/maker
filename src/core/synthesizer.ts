/**
 * Synthesizer
 *
 * Implements answer synthesis from the MAKER framework.
 * Combines multiple sub-answers into a coherent final answer.
 */

import type {
  SynthesisConfig,
  LLMProvider,
  SubQuestionResult,
  ConfidenceLevel,
} from '../types';
import { PROMPTS, parseSynthesis } from '../prompts';

/**
 * Default synthesis configuration
 */
const DEFAULT_CONFIG: Required<Omit<SynthesisConfig, 'prompt'>> = {
  enabled: true,
  language: 'English',
};

/**
 * Synthesizer class
 *
 * Combines answers from multiple sub-questions into a final coherent answer.
 */
export class Synthesizer {
  private readonly enabled: boolean;
  private readonly language: string;
  private readonly customPrompt?: string;

  constructor(
    private readonly provider: LLMProvider,
    config: SynthesisConfig = {}
  ) {
    this.enabled = config.enabled ?? DEFAULT_CONFIG.enabled;
    this.language = config.language ?? DEFAULT_CONFIG.language;
    this.customPrompt = config.prompt;
  }

  /**
   * Synthesize a final answer from sub-question results
   *
   * @param originalQuestion - The original question
   * @param subAnswers - Results from each sub-question
   * @returns Synthesized answer and confidence
   */
  async synthesize(
    originalQuestion: string,
    subAnswers: SubQuestionResult[]
  ): Promise<{ answer: string; confidence: ConfidenceLevel }> {
    // If synthesis is disabled or only one sub-answer, return it directly
    if (!this.enabled || subAnswers.length === 0) {
      return {
        answer: subAnswers[0]?.answer ?? 'Unable to determine answer.',
        confidence: subAnswers[0]?.confidence ?? 'low',
      };
    }

    // If only one sub-answer, return it directly
    if (subAnswers.length === 1) {
      return {
        answer: subAnswers[0].answer,
        confidence: subAnswers[0].confidence,
      };
    }

    // Build the synthesis prompt
    const prompt = this.customPrompt
      ? this.buildCustomPrompt(originalQuestion, subAnswers)
      : this.language.toLowerCase().startsWith('de')
        ? PROMPTS.synthesizeDE(originalQuestion, subAnswers)
        : PROMPTS.synthesize(originalQuestion, subAnswers, this.language);

    // Call the LLM
    const response = await this.provider.complete({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      responseFormat: { type: 'json_object' },
    });

    // Parse the response
    const parsed = parseSynthesis(response.content);

    // Calculate final confidence
    const finalConfidence = this.calculateConfidence(
      parsed.confidence as ConfidenceLevel,
      subAnswers
    );

    return {
      answer: parsed.answer || this.fallbackSynthesis(subAnswers),
      confidence: finalConfidence,
    };
  }

  /**
   * Build a custom prompt with placeholders replaced
   */
  private buildCustomPrompt(
    originalQuestion: string,
    subAnswers: SubQuestionResult[]
  ): string {
    if (!this.customPrompt) return '';

    const answersText = subAnswers
      .map((sa, i) => `Question ${i + 1}: ${sa.question}\nAnswer ${i + 1}: ${sa.answer}`)
      .join('\n\n');

    return this.customPrompt
      .replace('{{question}}', originalQuestion)
      .replace('{{originalQuestion}}', originalQuestion)
      .replace('{{answers}}', answersText)
      .replace('{{language}}', this.language);
  }

  /**
   * Calculate final confidence based on synthesis result and sub-answers
   */
  private calculateConfidence(
    synthesisConfidence: ConfidenceLevel,
    subAnswers: SubQuestionResult[]
  ): ConfidenceLevel {
    // Count confidence levels from sub-answers
    const counts = { high: 0, medium: 0, low: 0 };
    for (const sa of subAnswers) {
      counts[sa.confidence]++;
    }

    // If synthesis returned low or any sub-answer is low, overall is low
    if (synthesisConfidence === 'low' || counts.low > 0) {
      return 'low';
    }

    // If synthesis is medium or majority of sub-answers are medium
    if (synthesisConfidence === 'medium' || counts.medium > counts.high) {
      return 'medium';
    }

    // All high
    return 'high';
  }

  /**
   * Fallback synthesis when LLM fails
   * Simply concatenates answers
   */
  private fallbackSynthesis(subAnswers: SubQuestionResult[]): string {
    if (subAnswers.length === 0) {
      return 'Unable to determine answer.';
    }

    if (subAnswers.length === 1) {
      return subAnswers[0].answer;
    }

    return subAnswers
      .filter((sa) => sa.answer && sa.answer.trim())
      .map((sa) => sa.answer)
      .join(' ');
  }

  /**
   * Check if synthesis is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get the configured language
   */
  getLanguage(): string {
    return this.language;
  }
}
