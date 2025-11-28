/**
 * VotingEngine Unit Tests
 *
 * Tests the First-to-ahead-by-K voting logic.
 * Per MAKER paper Algorithm 2 (do_voting).
 */

import { describe, it, expect } from 'vitest';
import { VotingEngine } from '../src/core/voting';
import { RedFlagFilter } from '../src/core/red-flag-filter';
import type { Vote } from '../src/types';
import { MockProvider } from './mocks/mock-provider';

describe('VotingEngine', () => {
  describe('determineWinner - First-to-ahead-by-K logic', () => {
    it('should reach consensus when winner is K votes ahead', () => {
      const engine = new VotingEngine({ k: 2 });

      // Answer A: 3 votes, Answer B: 1 vote
      // Margin = 3 - 1 = 2, which equals K = 2, so consensus is reached
      const votes: Vote[] = [
        { voteIndex: 0, answer: 'Paris', confidence: 'high', temperature: 0 },
        { voteIndex: 1, answer: 'Paris', confidence: 'high', temperature: 0.1 },
        { voteIndex: 2, answer: 'Paris', confidence: 'high', temperature: 0.1 },
        { voteIndex: 3, answer: 'London', confidence: 'medium', temperature: 0.1 },
      ];

      const result = engine.determineWinner(votes);

      expect(result.consensusReached).toBe(true);
      expect(result.winner).toBe('Paris');
      expect(result.confidence).toBe('high');
      expect(result.stats.winningVoteCount).toBe(3);
      expect(result.stats.margin).toBe(2);
    });

    it('should NOT reach consensus when margin < K', () => {
      const engine = new VotingEngine({ k: 2 });

      // Answer A: 3 votes, Answer B: 2 votes
      // Margin = 3 - 2 = 1, which is less than K = 2
      const votes: Vote[] = [
        { voteIndex: 0, answer: 'Paris', confidence: 'high', temperature: 0 },
        { voteIndex: 1, answer: 'Paris', confidence: 'high', temperature: 0.1 },
        { voteIndex: 2, answer: 'Paris', confidence: 'high', temperature: 0.1 },
        { voteIndex: 3, answer: 'London', confidence: 'high', temperature: 0.1 },
        { voteIndex: 4, answer: 'London', confidence: 'high', temperature: 0.1 },
      ];

      const result = engine.determineWinner(votes);

      expect(result.consensusReached).toBe(false);
      expect(result.winner).toBe('Paris'); // Still returns the winner, just no consensus
      expect(result.stats.margin).toBe(1);
    });

    it('should reach consensus when margin > K', () => {
      const engine = new VotingEngine({ k: 2 });

      // Answer A: 4 votes, Answer B: 1 vote
      // Margin = 4 - 1 = 3, which is greater than K = 2
      const votes: Vote[] = [
        { voteIndex: 0, answer: 'Paris', confidence: 'high', temperature: 0 },
        { voteIndex: 1, answer: 'Paris', confidence: 'high', temperature: 0.1 },
        { voteIndex: 2, answer: 'Paris', confidence: 'high', temperature: 0.1 },
        { voteIndex: 3, answer: 'Paris', confidence: 'high', temperature: 0.1 },
        { voteIndex: 4, answer: 'London', confidence: 'high', temperature: 0.1 },
      ];

      const result = engine.determineWinner(votes);

      expect(result.consensusReached).toBe(true);
      expect(result.stats.margin).toBe(3);
    });
  });

  describe('single unique answer handling', () => {
    it('should reach consensus with single unique answer >= K votes', () => {
      const engine = new VotingEngine({ k: 2 });

      const votes: Vote[] = [
        { voteIndex: 0, answer: 'Paris', confidence: 'high', temperature: 0 },
        { voteIndex: 1, answer: 'Paris', confidence: 'high', temperature: 0.1 },
        { voteIndex: 2, answer: 'Paris', confidence: 'high', temperature: 0.1 },
      ];

      const result = engine.determineWinner(votes);

      expect(result.consensusReached).toBe(true);
      expect(result.winner).toBe('Paris');
      expect(result.stats.winningVoteCount).toBe(3);
    });

    it('should NOT reach consensus with single unique answer < K votes', () => {
      const engine = new VotingEngine({ k: 3 });

      const votes: Vote[] = [
        { voteIndex: 0, answer: 'Paris', confidence: 'high', temperature: 0 },
        { voteIndex: 1, answer: 'Paris', confidence: 'high', temperature: 0.1 },
      ];

      const result = engine.determineWinner(votes);

      expect(result.consensusReached).toBe(false);
      expect(result.winner).toBe('Paris');
      expect(result.stats.winningVoteCount).toBe(2);
    });
  });

  describe('red-flagged votes handling', () => {
    it('should ignore red-flagged votes in counting', () => {
      const engine = new VotingEngine({ k: 2 });

      const votes: Vote[] = [
        { voteIndex: 0, answer: 'Paris', confidence: 'high', temperature: 0 },
        { voteIndex: 1, answer: 'Paris', confidence: 'high', temperature: 0.1 },
        { voteIndex: 2, answer: 'Paris', confidence: 'high', temperature: 0.1, redFlagged: true },
        { voteIndex: 3, answer: 'London', confidence: 'high', temperature: 0.1 },
        { voteIndex: 4, answer: 'London', confidence: 'high', temperature: 0.1, redFlagged: true },
      ];

      const result = engine.determineWinner(votes);

      // Only counting: Paris: 2, London: 1 (red-flagged ones excluded)
      expect(result.stats.totalVotes).toBe(5);
      expect(result.stats.validVotes).toBe(3);
      expect(result.stats.redFlaggedVotes).toBe(2);
      expect(result.stats.winningVoteCount).toBe(2);
      expect(result.consensusReached).toBe(false); // Margin is 2-1=1, not >= k=2
    });

    it('should return no consensus when all votes are red-flagged', () => {
      const engine = new VotingEngine({ k: 2 });

      const votes: Vote[] = [
        { voteIndex: 0, answer: 'Paris', confidence: 'high', temperature: 0, redFlagged: true },
        { voteIndex: 1, answer: 'Paris', confidence: 'high', temperature: 0.1, redFlagged: true },
        { voteIndex: 2, answer: 'London', confidence: 'high', temperature: 0.1, redFlagged: true },
      ];

      const result = engine.determineWinner(votes);

      expect(result.consensusReached).toBe(false);
      expect(result.winner).toBeNull();
      expect(result.stats.validVotes).toBe(0);
      expect(result.stats.redFlaggedVotes).toBe(3);
    });
  });

  describe('answer normalization', () => {
    it('should normalize answers case-insensitively', () => {
      const engine = new VotingEngine({ k: 2 });

      const votes: Vote[] = [
        { voteIndex: 0, answer: 'Paris', confidence: 'high', temperature: 0 },
        { voteIndex: 1, answer: 'PARIS', confidence: 'high', temperature: 0.1 },
        { voteIndex: 2, answer: 'paris', confidence: 'high', temperature: 0.1 },
      ];

      const result = engine.determineWinner(votes);

      expect(result.consensusReached).toBe(true);
      expect(result.stats.winningVoteCount).toBe(3);
    });

    it('should trim whitespace for normalization', () => {
      const engine = new VotingEngine({ k: 2 });

      const votes: Vote[] = [
        { voteIndex: 0, answer: 'Paris', confidence: 'high', temperature: 0 },
        { voteIndex: 1, answer: '  Paris  ', confidence: 'high', temperature: 0.1 },
        { voteIndex: 2, answer: 'Paris ', confidence: 'high', temperature: 0.1 },
      ];

      const result = engine.determineWinner(votes);

      expect(result.consensusReached).toBe(true);
      expect(result.stats.winningVoteCount).toBe(3);
    });

    it('should remove trailing punctuation for normalization', () => {
      const engine = new VotingEngine({ k: 2 });

      const votes: Vote[] = [
        { voteIndex: 0, answer: 'Paris', confidence: 'high', temperature: 0 },
        { voteIndex: 1, answer: 'Paris.', confidence: 'high', temperature: 0.1 },
        { voteIndex: 2, answer: 'Paris!', confidence: 'high', temperature: 0.1 },
      ];

      const result = engine.determineWinner(votes);

      expect(result.consensusReached).toBe(true);
      expect(result.stats.winningVoteCount).toBe(3);
    });

    it('should normalize multiple spaces to single space', () => {
      const engine = new VotingEngine({ k: 2 });

      const votes: Vote[] = [
        { voteIndex: 0, answer: 'New York', confidence: 'high', temperature: 0 },
        { voteIndex: 1, answer: 'New  York', confidence: 'high', temperature: 0.1 },
        { voteIndex: 2, answer: 'New   York', confidence: 'high', temperature: 0.1 },
      ];

      const result = engine.determineWinner(votes);

      expect(result.consensusReached).toBe(true);
      expect(result.stats.winningVoteCount).toBe(3);
    });
  });

  describe('voting statistics', () => {
    it('should return correct voting statistics', () => {
      const engine = new VotingEngine({ k: 2 });

      const votes: Vote[] = [
        { voteIndex: 0, answer: 'Paris', confidence: 'high', temperature: 0 },
        { voteIndex: 1, answer: 'Paris', confidence: 'high', temperature: 0.1 },
        { voteIndex: 2, answer: 'Paris', confidence: 'medium', temperature: 0.1 },
        { voteIndex: 3, answer: 'London', confidence: 'high', temperature: 0.1 },
        { voteIndex: 4, answer: 'Berlin', confidence: 'high', temperature: 0.1, redFlagged: true },
      ];

      const result = engine.determineWinner(votes);

      expect(result.stats.totalVotes).toBe(5);
      expect(result.stats.validVotes).toBe(4);
      expect(result.stats.redFlaggedVotes).toBe(1);
      expect(result.stats.winningVoteCount).toBe(3);
      expect(result.stats.margin).toBe(2); // 3 - 1 = 2
      expect(result.stats.k).toBe(2);
    });
  });

  describe('empty votes handling', () => {
    it('should handle empty votes array', () => {
      const engine = new VotingEngine({ k: 2 });

      const result = engine.determineWinner([]);

      expect(result.consensusReached).toBe(false);
      expect(result.winner).toBeNull();
      expect(result.stats.totalVotes).toBe(0);
      expect(result.stats.validVotes).toBe(0);
    });
  });

  describe('confidence inheritance', () => {
    it('should keep the higher confidence for the winner', () => {
      const engine = new VotingEngine({ k: 1 });

      const votes: Vote[] = [
        { voteIndex: 0, answer: 'Paris', confidence: 'medium', temperature: 0 },
        { voteIndex: 1, answer: 'Paris', confidence: 'high', temperature: 0.1 },
        { voteIndex: 2, answer: 'Paris', confidence: 'low', temperature: 0.1 },
      ];

      const result = engine.determineWinner(votes);

      expect(result.confidence).toBe('high');
    });
  });

  describe('configuration', () => {
    it('should use default k=3', () => {
      const engine = new VotingEngine();
      expect(engine.getK()).toBe(3);
    });

    it('should use custom k value', () => {
      const engine = new VotingEngine({ k: 3 });
      expect(engine.getK()).toBe(3);
    });

    it('should use default samples=5', () => {
      const engine = new VotingEngine();
      expect(engine.getSamples()).toBe(5);
    });

    it('should use custom samples value', () => {
      const engine = new VotingEngine({ samples: 10 });
      expect(engine.getSamples()).toBe(10);
    });
  });

  describe('collectVotes', () => {
    it('should collect votes from provider', async () => {
      const engine = new VotingEngine({ samples: 3 });
      const mockProvider = new MockProvider();
      mockProvider.setDefaultResponse({
        content: { answer: 'Test answer.', confidence: 'high' },
        raw: '{"answer": "Test answer.", "confidence": "high"}',
      });

      const votes = await engine.collectVotes(
        mockProvider,
        'What is the capital of France?',
        'Context here'
      );

      expect(votes.length).toBe(3);
      expect(mockProvider.getCallCount()).toBe(3);
      votes.forEach((vote, i) => {
        expect(vote.voteIndex).toBe(i);
        expect(vote.answer).toBe('Test answer.');
        expect(vote.confidence).toBe('high');
      });
    });

    it('should handle provider errors gracefully', async () => {
      const engine = new VotingEngine({ samples: 2 });
      const failingProvider = {
        complete: async () => {
          throw new Error('API Error');
        },
      };

      const votes = await engine.collectVotes(
        failingProvider,
        'Test question',
        'Test context'
      );

      expect(votes.length).toBe(2);
      votes.forEach((vote) => {
        expect(vote.redFlagged).toBe(true);
        expect(vote.confidence).toBe('low');
      });
    });
  });

  describe('normalizeAnswer', () => {
    it('should handle empty strings', () => {
      const engine = new VotingEngine();
      expect(engine.normalizeAnswer('')).toBe('');
    });

    it('should handle null/undefined', () => {
      const engine = new VotingEngine();
      expect(engine.normalizeAnswer(null as unknown as string)).toBe('');
    });
  });

  describe('voteUntilConsensus (Algorithm 2 from MAKER paper)', () => {
    it('should reach consensus when k=2 and first vote wins 2 ahead', async () => {
      const engine = new VotingEngine({ k: 2, maxVotes: 10 });
      const redFlagFilter = new RedFlagFilter();
      const mockProvider = new MockProvider();

      // Provide sequential answers: Paris, Paris (k=2 ahead of 0)
      mockProvider.setSequentialAnswerResponses([
        { answer: 'Paris', confidence: 'high' },
        { answer: 'Paris', confidence: 'high' },
      ]);

      const result = await engine.voteUntilConsensus(
        mockProvider,
        'What is the capital of France?',
        '',
        redFlagFilter
      );

      expect(result.consensusReached).toBe(true);
      expect(result.winner).toBe('Paris');
      expect(result.stats.winningVoteCount).toBe(2);
      expect(result.stats.margin).toBe(2); // 2 - 0 = 2
      expect(mockProvider.getCallCount()).toBe(2);
    });

    it('should continue voting until consensus is reached', async () => {
      const engine = new VotingEngine({ k: 2, maxVotes: 20 });
      const redFlagFilter = new RedFlagFilter();
      const mockProvider = new MockProvider();

      // Paris: 3, London: 1 (margin = 2, should reach consensus at vote 4)
      mockProvider.setSequentialAnswerResponses([
        { answer: 'Paris', confidence: 'high' },
        { answer: 'London', confidence: 'high' },
        { answer: 'Paris', confidence: 'high' },
        { answer: 'Paris', confidence: 'high' },
      ]);

      const result = await engine.voteUntilConsensus(
        mockProvider,
        'What is the capital of France?',
        '',
        redFlagFilter
      );

      expect(result.consensusReached).toBe(true);
      expect(result.winner).toBe('Paris');
      expect(result.stats.winningVoteCount).toBe(3);
      expect(result.stats.margin).toBe(2); // 3 - 1 = 2
      expect(mockProvider.getCallCount()).toBe(4);
    });

    it('should skip red-flagged votes', async () => {
      const engine = new VotingEngine({ k: 2, maxVotes: 20 });
      const redFlagFilter = new RedFlagFilter({ maxTokens: 10 }); // Very low limit
      const mockProvider = new MockProvider();

      // First response is too long (flagged), next 2 are valid
      mockProvider.setSequentialAnswerResponses([
        { answer: 'A'.repeat(100), confidence: 'high' }, // Will be flagged as too long
        { answer: 'Paris', confidence: 'high' },
        { answer: 'Paris', confidence: 'high' },
      ]);

      const result = await engine.voteUntilConsensus(
        mockProvider,
        'What is the capital of France?',
        '',
        redFlagFilter
      );

      expect(result.consensusReached).toBe(true);
      expect(result.winner).toBe('Paris');
      expect(result.stats.totalVotes).toBe(3);
      expect(result.stats.validVotes).toBe(2);
      expect(result.stats.redFlaggedVotes).toBe(1);
    });

    it('should stop at maxVotes safety limit', async () => {
      const engine = new VotingEngine({ k: 5, maxVotes: 4 });
      const redFlagFilter = new RedFlagFilter();
      const mockProvider = new MockProvider();

      // Alternating answers, never reaching k=5 consensus
      mockProvider.setSequentialAnswerResponses([
        { answer: 'Paris', confidence: 'high' },
        { answer: 'London', confidence: 'high' },
        { answer: 'Paris', confidence: 'high' },
        { answer: 'London', confidence: 'high' },
      ]);

      const result = await engine.voteUntilConsensus(
        mockProvider,
        'What is the capital of France?',
        '',
        redFlagFilter
      );

      expect(result.consensusReached).toBe(false);
      expect(result.winner).toBe('Paris'); // Tied, returns first found with max
      expect(result.stats.totalVotes).toBe(4);
    });

    it('should call onVote callback for each vote', async () => {
      const engine = new VotingEngine({ k: 2, maxVotes: 10 });
      const redFlagFilter = new RedFlagFilter();
      const mockProvider = new MockProvider();

      mockProvider.setSequentialAnswerResponses([
        { answer: 'Paris', confidence: 'high' },
        { answer: 'Paris', confidence: 'high' },
      ]);

      const voteCallbacks: number[] = [];
      await engine.voteUntilConsensus(
        mockProvider,
        'Test question',
        '',
        redFlagFilter,
        (vote) => {
          voteCallbacks.push(vote.voteIndex);
        }
      );

      expect(voteCallbacks).toEqual([0, 1]);
    });

    it('should use temperature 0 for first vote, 0.1 for rest', async () => {
      const engine = new VotingEngine({ k: 2, maxVotes: 10 });
      const redFlagFilter = new RedFlagFilter();
      const mockProvider = new MockProvider();

      mockProvider.setSequentialAnswerResponses([
        { answer: 'Paris', confidence: 'high' },
        { answer: 'Paris', confidence: 'high' },
      ]);

      const temperatures: number[] = [];
      await engine.voteUntilConsensus(
        mockProvider,
        'Test question',
        '',
        redFlagFilter,
        (vote) => {
          temperatures.push(vote.temperature);
        }
      );

      expect(temperatures[0]).toBe(0); // First vote at temp 0
      expect(temperatures[1]).toBe(0.1); // Second vote at temp 0.1
    });

    it('should flag votes with parse failures', async () => {
      const engine = new VotingEngine({ k: 2, maxVotes: 10 });
      const redFlagFilter = new RedFlagFilter();
      const mockProvider = new MockProvider();

      // First response has no answer field (parse failure), next 2 are valid
      mockProvider.setSequentialResponses([
        { content: { invalid: 'structure' }, raw: '{"invalid": "structure"}' },
        { content: { answer: 'Paris', confidence: 'high' }, raw: '{"answer":"Paris"}' },
        { content: { answer: 'Paris', confidence: 'high' }, raw: '{"answer":"Paris"}' },
      ]);

      const result = await engine.voteUntilConsensus(
        mockProvider,
        'Test question',
        '',
        redFlagFilter
      );

      expect(result.consensusReached).toBe(true);
      expect(result.winner).toBe('Paris');
      expect(result.stats.redFlaggedVotes).toBe(1); // Parse failure flagged
    });
  });

  describe('configuration - maxVotes', () => {
    it('should use default maxVotes=100', () => {
      const engine = new VotingEngine();
      expect(engine.getMaxVotes()).toBe(100);
    });

    it('should use custom maxVotes value', () => {
      const engine = new VotingEngine({ maxVotes: 50 });
      expect(engine.getMaxVotes()).toBe(50);
    });
  });
});
