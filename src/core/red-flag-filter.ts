/**
 * Red Flag Filter
 *
 * Implements red-flagging from the MAKER framework (Section 3.3).
 *
 * Per the paper, only TWO red flags are used:
 * 1. Response too long (>750 tokens) - indicates confusion/rambling
 * 2. Response format invalid (can't parse expected structure) - indicates confusion
 *
 * The paper states: "when an agent makes an error in the output format, this error
 * may indicate that its other reasoning is wrong as well"
 */

import type { RedFlagConfig, RedFlagResult, RedFlagReason } from '../types';

/**
 * @deprecated Not in MAKER paper. Kept for backward compatibility only.
 */
export const DEFAULT_CONFUSION_PATTERNS: RegExp[] = [];

/**
 * @deprecated Not in MAKER paper. Kept for backward compatibility only.
 */
export const DEFAULT_ERROR_INDICATORS: string[] = [];

/**
 * Red Flag Filter class
 *
 * Filters out unreliable LLM responses based on MAKER paper Section 3.3:
 * 1. Response too long (>750 tokens)
 * 2. Response format invalid (parse failure)
 */
export class RedFlagFilter {
  private readonly maxTokens: number;
  private readonly minChars: number;
  private readonly customValidator?: (answer: string) => RedFlagResult;

  constructor(config: RedFlagConfig = {}) {
    // Paper Section 4.4: "max token threshold was set to 750"
    this.maxTokens = config.maxTokens ?? 750;
    this.minChars = config.minChars ?? 5;
    this.customValidator = config.customValidator;
  }

  /**
   * Check if a response should be red-flagged
   *
   * Per MAKER paper Section 3.3, only two flags:
   * 1. Response too long (exceeds maxTokens)
   * 2. Response format invalid (parseSucceeded = false)
   *
   * @param answer - The answer text to check
   * @param parseSucceeded - Whether the response was successfully parsed into expected format
   * @returns RedFlagResult indicating if the response was flagged and why
   */
  check(answer: string, parseSucceeded: boolean = true): RedFlagResult {
    // Handle null/undefined
    if (!answer) {
      return { redFlagged: true, reason: 'response_too_short' };
    }

    const trimmedAnswer = answer.trim();

    // Flag 1: Response too long (Section 3.3)
    // Paper: "Consistent with observations in prior work that longer answers tend to have
    // more errors, preliminary experiments for this paper showed that once an LLM gets
    // initially confused, it can go off the rails and over-analyze a situation"
    const estimatedTokens = Math.ceil(trimmedAnswer.length / 4);
    if (estimatedTokens > this.maxTokens) {
      return { redFlagged: true, reason: 'response_too_long' };
    }

    // Flag 2: Response too short (implied minimum)
    if (trimmedAnswer.length < this.minChars) {
      return { redFlagged: true, reason: 'response_too_short' };
    }

    // Flag 3: Failed to parse expected format (Section 3.3)
    // Paper: "when an agent produces an answer in an incorrect format, it is more
    // likely to have become confused at some point on the way to that answer"
    if (!parseSucceeded) {
      return { redFlagged: true, reason: 'invalid_format' };
    }

    // Custom validator (for extensibility)
    if (this.customValidator) {
      const customResult = this.customValidator(trimmedAnswer);
      if (customResult.redFlagged) {
        return customResult;
      }
    }

    // All checks passed
    return { redFlagged: false };
  }

  /**
   * Get the maximum tokens threshold
   */
  getMaxTokens(): number {
    return this.maxTokens;
  }

  /**
   * Check multiple answers and return filtered results
   *
   * @param answers - Array of answers to check
   * @param parseSucceeded - Whether the responses were successfully parsed (default: true)
   * @returns Array of results with red-flag status
   */
  checkMany(
    answers: Array<{ answer: string; parseSucceeded?: boolean }>,
    parseSucceeded: boolean = true
  ): Array<{ answer: string; parseSucceeded?: boolean } & RedFlagResult> {
    return answers.map((item) => ({
      ...item,
      ...this.check(item.answer, item.parseSucceeded ?? parseSucceeded),
    }));
  }

  /**
   * Get statistics about red-flagging
   *
   * @param results - Array of red-flag check results
   * @returns Statistics object
   */
  static getStats(results: RedFlagResult[]): {
    total: number;
    flagged: number;
    valid: number;
    byReason: Record<RedFlagReason, number>;
  } {
    const stats = {
      total: results.length,
      flagged: 0,
      valid: 0,
      byReason: {} as Record<RedFlagReason, number>,
    };

    for (const result of results) {
      if (result.redFlagged) {
        stats.flagged++;
        if (result.reason) {
          stats.byReason[result.reason] = (stats.byReason[result.reason] || 0) + 1;
        }
      } else {
        stats.valid++;
      }
    }

    return stats;
  }
}
