/**
 * Decomposer Unit Tests
 *
 * Tests the MAD (Maximal Agentic Decomposition) logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Decomposer } from '../src/core/decomposer';
import { MockProvider } from './mocks/mock-provider';
import type { Classification, SubQuestion } from '../src/types';

describe('Decomposer', () => {
  let mockProvider: MockProvider;

  beforeEach(() => {
    mockProvider = new MockProvider();
  });

  describe('decomposition disabled', () => {
    it('should return single sub-question when decomposition is disabled', async () => {
      const decomposer = new Decomposer(mockProvider, { enabled: false });

      const result = await decomposer.decompose('What is the capital of France?');

      expect(result.subQuestions.length).toBe(1);
      expect(result.subQuestions[0].question).toBe('What is the capital of France?');
      expect(result.synthesisStrategy).toBe('none');
      expect(result.classification.needsDecomposition).toBe(false);
      expect(mockProvider.getCallCount()).toBe(0); // No LLM calls
    });

    it('should set correct properties on single sub-question', async () => {
      const decomposer = new Decomposer(mockProvider, { enabled: false });

      const result = await decomposer.decompose('Any question?');

      const sq = result.subQuestions[0];
      expect(sq.id).toBe('sq1');
      expect(sq.dependencies).toEqual([]);
      expect(sq.type).toBe('factual');
      expect(sq.index).toBe(0);
    });
  });

  describe('classification', () => {
    it('should classify simple questions as not needing decomposition', async () => {
      mockProvider.setClassificationResponse({
        needsDecomposition: false,
        complexity: 2,
        questionType: 'factual',
        reasoning: 'Simple fact lookup',
      });

      const decomposer = new Decomposer(mockProvider);
      const result = await decomposer.decompose('What is 2+2?');

      expect(result.classification.needsDecomposition).toBe(false);
      expect(result.classification.complexity).toBe(2);
      expect(result.classification.questionType).toBe('factual');
      expect(result.subQuestions.length).toBe(1);
    });

    it('should classify complex questions as needing decomposition', async () => {
      mockProvider.setClassificationResponse({
        needsDecomposition: true,
        complexity: 7,
        questionType: 'multi-hop',
        reasoning: 'Requires multiple reasoning steps',
      });

      // Set up decomposition response
      const subQuestions: SubQuestion[] = [
        { id: 'sq1', question: 'What is X?', dependencies: [], type: 'factual', index: 0 },
        { id: 'sq2', question: 'How does X relate to Y?', dependencies: ['sq1'], type: 'analytical', index: 1 },
      ];
      mockProvider.setDecompositionResponse(subQuestions, 'sequence');

      const decomposer = new Decomposer(mockProvider);
      const result = await decomposer.decompose(
        'What factors led to the fall of the Roman Empire and how do they compare to modern challenges?'
      );

      expect(result.classification.needsDecomposition).toBe(true);
      expect(result.classification.complexity).toBe(7);
      expect(result.subQuestions.length).toBe(2);
      expect(result.synthesisStrategy).toBe('sequence');
    });
  });

  describe('decomposition', () => {
    it('should decompose complex questions into sub-questions', async () => {
      mockProvider.setClassificationResponse({
        needsDecomposition: true,
        complexity: 6,
        questionType: 'comparative',
      });

      const subQuestions: SubQuestion[] = [
        { id: 'sq1', question: 'What is the population of Paris?', dependencies: [], type: 'factual', index: 0 },
        { id: 'sq2', question: 'What is the population of London?', dependencies: [], type: 'factual', index: 1 },
        { id: 'sq3', question: 'Which city has more population?', dependencies: ['sq1', 'sq2'], type: 'comparative', index: 2 },
      ];
      mockProvider.setDecompositionResponse(subQuestions, 'compare');

      const decomposer = new Decomposer(mockProvider);
      const result = await decomposer.decompose('Compare the populations of Paris and London');

      expect(result.subQuestions.length).toBe(3);
      expect(result.subQuestions[0].question).toBe('What is the population of Paris?');
      expect(result.subQuestions[2].dependencies).toEqual(['sq1', 'sq2']);
      expect(result.synthesisStrategy).toBe('compare');
    });

    it('should limit sub-questions to maxSubQuestions', async () => {
      mockProvider.setClassificationResponse({
        needsDecomposition: true,
        complexity: 8,
        questionType: 'aggregative',
      });

      // Return more sub-questions than the limit
      const manySubQuestions: SubQuestion[] = Array.from({ length: 10 }, (_, i) => ({
        id: `sq${i + 1}`,
        question: `Sub-question ${i + 1}?`,
        dependencies: [],
        type: 'factual' as const,
        index: i,
      }));
      mockProvider.setDecompositionResponse(manySubQuestions, 'aggregate');

      const decomposer = new Decomposer(mockProvider, { maxSubQuestions: 5 });
      const result = await decomposer.decompose('Complex question requiring many parts');

      expect(result.subQuestions.length).toBe(5);
      expect(result.subQuestions[4].id).toBe('sq5');
    });

    it('should return original question if decomposition fails', async () => {
      mockProvider.setClassificationResponse({
        needsDecomposition: true,
        complexity: 5,
        questionType: 'multi-hop',
      });

      // Return empty sub-questions (decomposition failure)
      mockProvider.setDecompositionResponse([], 'combine');

      const decomposer = new Decomposer(mockProvider);
      const result = await decomposer.decompose('Failed question?');

      expect(result.subQuestions.length).toBe(1);
      expect(result.subQuestions[0].question).toBe('Failed question?');
      expect(result.synthesisStrategy).toBe('none');
    });
  });

  describe('custom classifier', () => {
    it('should support custom classifier function', async () => {
      const customClassifier = async (question: string): Promise<Classification> => {
        // Simple rule: questions with "compare" need decomposition
        const needsDecomposition = question.toLowerCase().includes('compare');
        return {
          needsDecomposition,
          complexity: needsDecomposition ? 6 : 2,
          questionType: needsDecomposition ? 'comparative' : 'factual',
        };
      };

      const decomposer = new Decomposer(mockProvider, { classifier: customClassifier });

      // Simple question
      const result1 = await decomposer.decompose('What is the capital of France?');
      expect(result1.classification.needsDecomposition).toBe(false);
      expect(result1.classification.questionType).toBe('factual');

      // Comparative question
      mockProvider.setDecompositionResponse([
        { id: 'sq1', question: 'What is A?', dependencies: [], type: 'factual', index: 0 },
        { id: 'sq2', question: 'What is B?', dependencies: [], type: 'factual', index: 1 },
      ], 'compare');

      const result2 = await decomposer.decompose('Compare A and B');
      expect(result2.classification.needsDecomposition).toBe(true);
      expect(result2.classification.questionType).toBe('comparative');
    });

    it('should pass context to custom classifier', async () => {
      let receivedContext: string | undefined;

      const customClassifier = async (
        question: string,
        context?: string
      ): Promise<Classification> => {
        receivedContext = context;
        return {
          needsDecomposition: false,
          complexity: 1,
          questionType: 'factual',
        };
      };

      const decomposer = new Decomposer(mockProvider, { classifier: customClassifier });
      await decomposer.decompose('Test question', 'Test context');

      expect(receivedContext).toBe('Test context');
    });
  });

  describe('configuration', () => {
    it('should report enabled status correctly', () => {
      const enabled = new Decomposer(mockProvider, { enabled: true });
      const disabled = new Decomposer(mockProvider, { enabled: false });

      expect(enabled.isEnabled()).toBe(true);
      expect(disabled.isEnabled()).toBe(false);
    });

    it('should report maxSubQuestions correctly', () => {
      const defaultDecomposer = new Decomposer(mockProvider);
      const customDecomposer = new Decomposer(mockProvider, { maxSubQuestions: 5 });

      expect(defaultDecomposer.getMaxSubQuestions()).toBe(8);
      expect(customDecomposer.getMaxSubQuestions()).toBe(5);
    });

    it('should use default enabled=true', () => {
      const decomposer = new Decomposer(mockProvider);
      expect(decomposer.isEnabled()).toBe(true);
    });
  });

  describe('classify method', () => {
    it('should call LLM for auto classification', async () => {
      mockProvider.setClassificationResponse({
        needsDecomposition: true,
        complexity: 5,
        questionType: 'analytical',
      });

      const decomposer = new Decomposer(mockProvider);
      const result = await decomposer.classify('What are the implications of X?');

      expect(result.needsDecomposition).toBe(true);
      expect(result.complexity).toBe(5);
      expect(result.questionType).toBe('analytical');
      expect(mockProvider.getCallCount()).toBe(1);
    });

    it('should pass context to classification', async () => {
      mockProvider.setClassificationResponse({
        needsDecomposition: false,
        complexity: 2,
        questionType: 'factual',
      });

      const decomposer = new Decomposer(mockProvider);
      await decomposer.classify('What is X?', 'X is defined as...');

      const request = mockProvider.getLastRequest();
      expect(request).not.toBeNull();
      expect(request?.messages[0].content).toContain('Context available');
    });
  });

  describe('custom prompt', () => {
    it('should use custom decomposition prompt when provided', async () => {
      mockProvider.setClassificationResponse({
        needsDecomposition: true,
        complexity: 5,
        questionType: 'multi-hop',
      });

      const customPrompt = 'Custom prompt: {{question}} with context: {{context}}';

      const decomposer = new Decomposer(mockProvider, { prompt: customPrompt });

      mockProvider.setDecompositionResponse([
        { id: 'sq1', question: 'Custom sub-question', dependencies: [], type: 'factual', index: 0 },
      ], 'combine');

      await decomposer.decompose('Test question', 'Test context');

      const request = mockProvider.getLastRequest();
      expect(request).not.toBeNull();
      // The custom prompt should be used for decomposition, not the default
      expect(request?.messages[0].content).toContain('Custom prompt');
      expect(request?.messages[0].content).toContain('Test question');
      expect(request?.messages[0].content).toContain('Test context');
    });
  });
});
