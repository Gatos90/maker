/**
 * RedFlagFilter Unit Tests
 *
 * Tests the red-flagging logic based on MAKER paper Section 3.3.
 * Per the paper, only TWO red flags are used:
 * 1. Response too long (>750 tokens)
 * 2. Response format invalid (parse failure)
 */

import { describe, it, expect } from 'vitest';
import { RedFlagFilter, DEFAULT_CONFUSION_PATTERNS, DEFAULT_ERROR_INDICATORS } from '../src/core/red-flag-filter';

describe('RedFlagFilter', () => {
  describe('valid answers', () => {
    it('should not flag a valid answer', () => {
      const filter = new RedFlagFilter();
      const result = filter.check('Paris is the capital of France.');

      expect(result.redFlagged).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it('should not flag a valid answer with parseSucceeded=true', () => {
      const filter = new RedFlagFilter();
      const result = filter.check('The answer is approximately 42.', true);

      expect(result.redFlagged).toBe(false);
    });

    it('should not flag short valid answers (>= 5 chars)', () => {
      const filter = new RedFlagFilter();
      const result = filter.check('Yes!!', true);

      expect(result.redFlagged).toBe(false);
    });
  });

  describe('response length checks (MAKER paper Section 3.3)', () => {
    it('should flag responses that are too long (>750 tokens)', () => {
      const filter = new RedFlagFilter({ maxTokens: 750 });
      // 750 tokens * 4 chars/token = 3000 chars
      const longAnswer = 'A'.repeat(3001);
      const result = filter.check(longAnswer, true);

      expect(result.redFlagged).toBe(true);
      expect(result.reason).toBe('response_too_long');
    });

    it('should not flag responses at exactly max tokens', () => {
      const filter = new RedFlagFilter({ maxTokens: 750 });
      // 750 tokens * 4 = 3000 chars
      const answer = 'A'.repeat(3000);
      const result = filter.check(answer, true);

      expect(result.redFlagged).toBe(false);
    });

    it('should flag responses that are too short (<5 chars)', () => {
      const filter = new RedFlagFilter();
      const result = filter.check('Hi', true);

      expect(result.redFlagged).toBe(true);
      expect(result.reason).toBe('response_too_short');
    });

    it('should respect custom maxTokens configuration', () => {
      const filter = new RedFlagFilter({ maxTokens: 25 }); // 25 * 4 = 100 chars
      const longAnswer = 'B'.repeat(101);
      const result = filter.check(longAnswer, true);

      expect(result.redFlagged).toBe(true);
      expect(result.reason).toBe('response_too_long');
    });

    it('should use default maxTokens of 750 (per paper Section 4.4)', () => {
      const filter = new RedFlagFilter();
      expect(filter.getMaxTokens()).toBe(750);
    });
  });

  describe('format validation (MAKER paper Section 3.3)', () => {
    it('should flag when parseSucceeded is false', () => {
      const filter = new RedFlagFilter();
      const result = filter.check('Some answer that failed to parse.', false);

      expect(result.redFlagged).toBe(true);
      expect(result.reason).toBe('invalid_format');
    });

    it('should not flag when parseSucceeded is true', () => {
      const filter = new RedFlagFilter();
      const result = filter.check('Valid parsed answer.', true);

      expect(result.redFlagged).toBe(false);
    });

    it('should default parseSucceeded to true if not provided', () => {
      const filter = new RedFlagFilter();
      const result = filter.check('Answer without explicit parse flag.');

      expect(result.redFlagged).toBe(false);
    });
  });

  describe('null and undefined handling', () => {
    it('should flag null answers', () => {
      const filter = new RedFlagFilter();
      const result = filter.check(null as unknown as string, true);

      expect(result.redFlagged).toBe(true);
      expect(result.reason).toBe('response_too_short');
    });

    it('should flag undefined answers', () => {
      const filter = new RedFlagFilter();
      const result = filter.check(undefined as unknown as string, true);

      expect(result.redFlagged).toBe(true);
      expect(result.reason).toBe('response_too_short');
    });

    it('should flag empty string answers', () => {
      const filter = new RedFlagFilter();
      const result = filter.check('', true);

      expect(result.redFlagged).toBe(true);
      expect(result.reason).toBe('response_too_short');
    });

    it('should flag whitespace-only answers', () => {
      const filter = new RedFlagFilter();
      const result = filter.check('   ', true);

      expect(result.redFlagged).toBe(true);
      expect(result.reason).toBe('response_too_short');
    });
  });

  describe('custom validator', () => {
    it('should support custom validator function', () => {
      const filter = new RedFlagFilter({
        customValidator: (answer) => {
          if (answer.includes('forbidden')) {
            return { redFlagged: true, reason: 'custom' };
          }
          return { redFlagged: false };
        },
      });

      const result = filter.check('This contains forbidden content.', true);

      expect(result.redFlagged).toBe(true);
      expect(result.reason).toBe('custom');
    });

    it('should run custom validator after built-in checks', () => {
      let customValidatorCalled = false;

      const filter = new RedFlagFilter({
        customValidator: () => {
          customValidatorCalled = true;
          return { redFlagged: false };
        },
      });

      // This will fail on length check before custom validator
      filter.check('Hi', true);

      expect(customValidatorCalled).toBe(false);
    });
  });

  describe('checkMany', () => {
    it('should check multiple answers at once', () => {
      const filter = new RedFlagFilter();
      const answers = [
        { answer: 'Valid answer here.', parseSucceeded: true },
        { answer: 'Hi', parseSucceeded: true }, // too short
        { answer: 'Valid but failed parse.', parseSucceeded: false },
      ];

      const results = filter.checkMany(answers);

      expect(results.length).toBe(3);
      expect(results[0].redFlagged).toBe(false);
      expect(results[1].redFlagged).toBe(true);
      expect(results[1].reason).toBe('response_too_short');
      expect(results[2].redFlagged).toBe(true);
      expect(results[2].reason).toBe('invalid_format');
    });

    it('should use default parseSucceeded from second parameter', () => {
      const filter = new RedFlagFilter();
      const answers = [
        { answer: 'Valid answer.' },
        { answer: 'Another valid.' },
      ];

      const results = filter.checkMany(answers, true);

      expect(results.every((r) => !r.redFlagged)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should calculate correct statistics', () => {
      const results = [
        { redFlagged: false },
        { redFlagged: true, reason: 'response_too_long' as const },
        { redFlagged: true, reason: 'invalid_format' as const },
        { redFlagged: false },
        { redFlagged: true, reason: 'response_too_long' as const },
      ];

      const stats = RedFlagFilter.getStats(results);

      expect(stats.total).toBe(5);
      expect(stats.flagged).toBe(3);
      expect(stats.valid).toBe(2);
      expect(stats.byReason.response_too_long).toBe(2);
      expect(stats.byReason.invalid_format).toBe(1);
    });

    it('should handle empty results array', () => {
      const stats = RedFlagFilter.getStats([]);

      expect(stats.total).toBe(0);
      expect(stats.flagged).toBe(0);
      expect(stats.valid).toBe(0);
    });
  });

  describe('deprecated exports (backward compatibility)', () => {
    it('should export DEFAULT_CONFUSION_PATTERNS as empty array', () => {
      expect(DEFAULT_CONFUSION_PATTERNS).toBeDefined();
      expect(Array.isArray(DEFAULT_CONFUSION_PATTERNS)).toBe(true);
      // Per paper alignment, patterns are deprecated and empty
      expect(DEFAULT_CONFUSION_PATTERNS.length).toBe(0);
    });

    it('should export DEFAULT_ERROR_INDICATORS as empty array', () => {
      expect(DEFAULT_ERROR_INDICATORS).toBeDefined();
      expect(Array.isArray(DEFAULT_ERROR_INDICATORS)).toBe(true);
      // Per paper alignment, error indicators are deprecated and empty
      expect(DEFAULT_ERROR_INDICATORS.length).toBe(0);
    });
  });
});
