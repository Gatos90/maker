/**
 * Synthesizer Unit Tests
 *
 * Tests the answer synthesis logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Synthesizer } from '../src/core/synthesizer';
import { MockProvider } from './mocks/mock-provider';
import type { SubQuestionResult } from '../src/types';

describe('Synthesizer', () => {
  let mockProvider: MockProvider;

  beforeEach(() => {
    mockProvider = new MockProvider();
  });

  describe('single sub-answer', () => {
    it('should return single answer directly when only one sub-answer', async () => {
      const synthesizer = new Synthesizer(mockProvider);

      const subAnswers: SubQuestionResult[] = [
        {
          question: 'What is the capital of France?',
          answer: 'Paris is the capital of France.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 4, margin: 3, k: 2 },
        },
      ];

      const result = await synthesizer.synthesize('What is the capital of France?', subAnswers);

      expect(result.answer).toBe('Paris is the capital of France.');
      expect(result.confidence).toBe('high');
      expect(mockProvider.getCallCount()).toBe(0); // No LLM call needed
    });

    it('should preserve confidence from single sub-answer', async () => {
      const synthesizer = new Synthesizer(mockProvider);

      const subAnswers: SubQuestionResult[] = [
        {
          question: 'Test?',
          answer: 'Test answer.',
          confidence: 'medium',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 4, redFlaggedVotes: 1, winningVoteCount: 3, margin: 2, k: 2 },
        },
      ];

      const result = await synthesizer.synthesize('Test?', subAnswers);

      expect(result.confidence).toBe('medium');
    });
  });

  describe('multiple sub-answers synthesis', () => {
    it('should synthesize multiple sub-answers into coherent response', async () => {
      mockProvider.setSynthesisResponse(
        'Paris is the capital of France with a population of 2.2 million.',
        'high'
      );

      const synthesizer = new Synthesizer(mockProvider);

      const subAnswers: SubQuestionResult[] = [
        {
          question: 'What is the capital of France?',
          answer: 'Paris.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
        {
          question: 'What is the population of Paris?',
          answer: 'Approximately 2.2 million.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 4, margin: 3, k: 2 },
        },
      ];

      const result = await synthesizer.synthesize(
        'Tell me about Paris, the capital of France.',
        subAnswers
      );

      expect(result.answer).toBe('Paris is the capital of France with a population of 2.2 million.');
      expect(result.confidence).toBe('high');
      expect(mockProvider.getCallCount()).toBe(1);
    });

    it('should downgrade confidence when synthesis returns low', async () => {
      mockProvider.setSynthesisResponse('Combined answer.', 'low');

      const synthesizer = new Synthesizer(mockProvider);

      const subAnswers: SubQuestionResult[] = [
        {
          question: 'Q1?',
          answer: 'A1.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
        {
          question: 'Q2?',
          answer: 'A2.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
      ];

      const result = await synthesizer.synthesize('Original?', subAnswers);

      expect(result.confidence).toBe('low');
    });

    it('should downgrade confidence when any sub-answer is low', async () => {
      mockProvider.setSynthesisResponse('Combined answer.', 'high');

      const synthesizer = new Synthesizer(mockProvider);

      const subAnswers: SubQuestionResult[] = [
        {
          question: 'Q1?',
          answer: 'A1.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
        {
          question: 'Q2?',
          answer: 'A2.',
          confidence: 'low', // Low confidence in sub-answer
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 3, redFlaggedVotes: 2, winningVoteCount: 2, margin: 1, k: 2 },
        },
      ];

      const result = await synthesizer.synthesize('Original?', subAnswers);

      expect(result.confidence).toBe('low');
    });

    it('should return medium confidence when majority of sub-answers are medium', async () => {
      mockProvider.setSynthesisResponse('Combined answer.', 'high');

      const synthesizer = new Synthesizer(mockProvider);

      const subAnswers: SubQuestionResult[] = [
        {
          question: 'Q1?',
          answer: 'A1.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
        {
          question: 'Q2?',
          answer: 'A2.',
          confidence: 'medium',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 4, margin: 3, k: 2 },
        },
        {
          question: 'Q3?',
          answer: 'A3.',
          confidence: 'medium',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 3, margin: 2, k: 2 },
        },
      ];

      const result = await synthesizer.synthesize('Original?', subAnswers);

      expect(result.confidence).toBe('medium');
    });
  });

  describe('synthesis disabled', () => {
    it('should return first answer when synthesis is disabled', async () => {
      const synthesizer = new Synthesizer(mockProvider, { enabled: false });

      const subAnswers: SubQuestionResult[] = [
        {
          question: 'Q1?',
          answer: 'First answer.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
        {
          question: 'Q2?',
          answer: 'Second answer.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
      ];

      const result = await synthesizer.synthesize('Original?', subAnswers);

      expect(result.answer).toBe('First answer.');
      expect(mockProvider.getCallCount()).toBe(0);
    });

    it('should handle empty sub-answers when disabled', async () => {
      const synthesizer = new Synthesizer(mockProvider, { enabled: false });

      const result = await synthesizer.synthesize('Original?', []);

      expect(result.answer).toBe('Unable to determine answer.');
      expect(result.confidence).toBe('low');
    });
  });

  describe('language settings', () => {
    it('should use English by default', async () => {
      mockProvider.setSynthesisResponse('English answer.', 'high');

      const synthesizer = new Synthesizer(mockProvider);

      const subAnswers: SubQuestionResult[] = [
        {
          question: 'Q1?',
          answer: 'A1.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
        {
          question: 'Q2?',
          answer: 'A2.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
      ];

      await synthesizer.synthesize('Original?', subAnswers);

      const request = mockProvider.getLastRequest();
      expect(request?.messages[0].content).toContain('English');
    });

    it('should use German prompt for German language', async () => {
      mockProvider.setSynthesisResponse('Deutsche Antwort.', 'high');

      const synthesizer = new Synthesizer(mockProvider, { language: 'Deutsch' });

      const subAnswers: SubQuestionResult[] = [
        {
          question: 'Frage 1?',
          answer: 'Antwort 1.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
        {
          question: 'Frage 2?',
          answer: 'Antwort 2.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
      ];

      await synthesizer.synthesize('Original?', subAnswers);

      const request = mockProvider.getLastRequest();
      expect(request?.messages[0].content).toContain('Synthetisiere');
      expect(request?.messages[0].content).toContain('Deutsch');
    });

    it('should use specified language for non-German languages', async () => {
      mockProvider.setSynthesisResponse('Respuesta en espanol.', 'high');

      const synthesizer = new Synthesizer(mockProvider, { language: 'Spanish' });

      const subAnswers: SubQuestionResult[] = [
        {
          question: 'Q1?',
          answer: 'A1.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
        {
          question: 'Q2?',
          answer: 'A2.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
      ];

      await synthesizer.synthesize('Original?', subAnswers);

      const request = mockProvider.getLastRequest();
      expect(request?.messages[0].content).toContain('Spanish');
    });
  });

  describe('fallback synthesis', () => {
    it('should concatenate answers when LLM returns empty response', async () => {
      mockProvider.setSynthesisResponse('', 'low');

      const synthesizer = new Synthesizer(mockProvider);

      const subAnswers: SubQuestionResult[] = [
        {
          question: 'Q1?',
          answer: 'First part.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
        {
          question: 'Q2?',
          answer: 'Second part.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
      ];

      const result = await synthesizer.synthesize('Original?', subAnswers);

      expect(result.answer).toBe('First part. Second part.');
    });

    it('should filter empty answers in fallback', async () => {
      mockProvider.setSynthesisResponse('', 'low');

      const synthesizer = new Synthesizer(mockProvider);

      const subAnswers: SubQuestionResult[] = [
        {
          question: 'Q1?',
          answer: 'Valid answer.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
        {
          question: 'Q2?',
          answer: '',
          confidence: 'low',
          consensusReached: false,
          votingStats: { totalVotes: 5, validVotes: 2, redFlaggedVotes: 3, winningVoteCount: 1, margin: 0, k: 2 },
        },
        {
          question: 'Q3?',
          answer: '   ',
          confidence: 'low',
          consensusReached: false,
          votingStats: { totalVotes: 5, validVotes: 2, redFlaggedVotes: 3, winningVoteCount: 1, margin: 0, k: 2 },
        },
      ];

      const result = await synthesizer.synthesize('Original?', subAnswers);

      expect(result.answer).toBe('Valid answer.');
    });
  });

  describe('empty sub-answers', () => {
    it('should handle empty sub-answers array', async () => {
      const synthesizer = new Synthesizer(mockProvider);

      const result = await synthesizer.synthesize('Original?', []);

      expect(result.answer).toBe('Unable to determine answer.');
      expect(result.confidence).toBe('low');
      expect(mockProvider.getCallCount()).toBe(0);
    });
  });

  describe('configuration', () => {
    it('should report enabled status correctly', () => {
      const enabled = new Synthesizer(mockProvider, { enabled: true });
      const disabled = new Synthesizer(mockProvider, { enabled: false });

      expect(enabled.isEnabled()).toBe(true);
      expect(disabled.isEnabled()).toBe(false);
    });

    it('should report language correctly', () => {
      const defaultSynth = new Synthesizer(mockProvider);
      const germanSynth = new Synthesizer(mockProvider, { language: 'German' });

      expect(defaultSynth.getLanguage()).toBe('English');
      expect(germanSynth.getLanguage()).toBe('German');
    });
  });

  describe('custom prompt', () => {
    it('should use custom synthesis prompt when provided', async () => {
      const customPrompt =
        'Custom synthesis: {{question}} with answers: {{answers}} in {{language}}';

      mockProvider.setSynthesisResponse('Custom synthesized answer.', 'high');

      const synthesizer = new Synthesizer(mockProvider, { prompt: customPrompt });

      const subAnswers: SubQuestionResult[] = [
        {
          question: 'Q1?',
          answer: 'A1.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
        {
          question: 'Q2?',
          answer: 'A2.',
          confidence: 'high',
          consensusReached: true,
          votingStats: { totalVotes: 5, validVotes: 5, redFlaggedVotes: 0, winningVoteCount: 5, margin: 5, k: 2 },
        },
      ];

      await synthesizer.synthesize('Original question?', subAnswers);

      const request = mockProvider.getLastRequest();
      expect(request?.messages[0].content).toContain('Custom synthesis');
      expect(request?.messages[0].content).toContain('Original question?');
    });
  });
});
