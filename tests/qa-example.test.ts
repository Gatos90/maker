/**
 * MAKER Q&A Example Tests
 *
 * Demonstrates using the MAKER framework to answer questions
 * about itself using a knowledge base, with MockProvider.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Maker } from '../src';
import { MockProvider } from './mocks/mock-provider';
import * as fs from 'fs';
import * as path from 'path';

describe('MAKER Q&A Example', () => {
  let mockProvider: MockProvider;
  let knowledgeBase: string;

  beforeEach(() => {
    mockProvider = new MockProvider();

    // Load the knowledge base
    knowledgeBase = fs.readFileSync(
      path.join(__dirname, '../examples/knowledge-base.md'),
      'utf-8'
    );

    // Setup default classification response (simple factual question)
    mockProvider.setClassificationResponse({
      needsDecomposition: false,
      complexity: 2,
      questionType: 'factual',
    });
  });

  describe('Basic Q&A functionality', () => {
    it('should answer what MAKER stands for', async () => {
      mockProvider.setAnswerResponse(
        'MAKER stands for Maximal Agentic decomposition, first-to-ahead-by-K Error correction, and Red-flagging.',
        'high'
      );

      const maker = new Maker({
        provider: mockProvider,
        apiKey: 'test',
        model: 'test',
      });

      const result = await maker.ask('What does MAKER stand for?', {
        context: knowledgeBase,
      });

      expect(result.answer).toContain('MAKER');
      expect(result.answer).toContain('Maximal');
      expect(result.confidence).toBe('high');
      expect(result.consensusReached).toBe(true);
    });

    it('should answer about the voting mechanism', async () => {
      mockProvider.setAnswerResponse(
        'The voting mechanism uses first-to-ahead-by-K consensus, where sampling continues until one answer is K votes ahead of all others. The default K value is 2.',
        'high'
      );

      const maker = new Maker({
        provider: mockProvider,
        apiKey: 'test',
        model: 'test',
      });

      const result = await maker.ask('How does the voting mechanism work in MAKER?', {
        context: knowledgeBase,
      });

      expect(result.answer).toContain('first-to-ahead-by-K');
      expect(result.answer).toContain('consensus');
      expect(result.confidence).toBe('high');
    });

    it('should answer about red flags', async () => {
      mockProvider.setAnswerResponse(
        'The MAKER framework uses two red flags: (1) response too long - exceeding 750 tokens, and (2) invalid format - when the response cannot be parsed into the expected structure.',
        'high'
      );

      const maker = new Maker({
        provider: mockProvider,
        apiKey: 'test',
        model: 'test',
      });

      const result = await maker.ask('What are the two red flags used in the MAKER framework?', {
        context: knowledgeBase,
      });

      expect(result.answer).toContain('750');
      expect(result.answer).toContain('format');
    });

    it('should answer about default K value', async () => {
      mockProvider.setAnswerResponse(
        'The default value for K in the MAKER voting algorithm is 2. This means an answer must be 2 votes ahead of all other answers to reach consensus.',
        'high'
      );

      const maker = new Maker({
        provider: mockProvider,
        apiKey: 'test',
        model: 'test',
      });

      const result = await maker.ask('What is the default value for K in the voting algorithm?', {
        context: knowledgeBase,
      });

      expect(result.answer).toContain('2');
    });

    it('should answer about temperature schedule', async () => {
      mockProvider.setAnswerResponse(
        'The MAKER framework uses temperature 0 for the first vote (deterministic baseline) and temperature 0.1 for all subsequent votes (slight randomness for diversity).',
        'high'
      );

      const maker = new Maker({
        provider: mockProvider,
        apiKey: 'test',
        model: 'test',
      });

      const result = await maker.ask('What temperature is used for the first vote?', {
        context: knowledgeBase,
      });

      expect(result.answer).toContain('0');
      expect(result.answer).toContain('first');
    });
  });

  describe('Event emission', () => {
    it('should emit events during Q&A process', async () => {
      mockProvider.setAnswerResponse('Test answer.', 'high');

      const maker = new Maker({
        provider: mockProvider,
        apiKey: 'test',
        model: 'test',
      });

      const events: string[] = [];

      maker.on('classificationComplete', () => events.push('classificationComplete'));
      maker.on('decomposed', () => events.push('decomposed'));
      maker.on('votingStart', () => events.push('votingStart'));
      maker.on('votingComplete', () => events.push('votingComplete'));
      maker.on('synthesisStart', () => events.push('synthesisStart'));
      maker.on('synthesisComplete', () => events.push('synthesisComplete'));
      maker.on('complete', () => events.push('complete'));

      await maker.ask('Test question?', { context: knowledgeBase });

      expect(events).toContain('classificationComplete');
      expect(events).toContain('decomposed');
      expect(events).toContain('votingStart');
      expect(events).toContain('votingComplete');
      expect(events).toContain('complete');
    });
  });

  describe('Context handling', () => {
    it('should pass context to the LLM provider', async () => {
      mockProvider.setAnswerResponse('Answer using context.', 'high');

      const maker = new Maker({
        provider: mockProvider,
        apiKey: 'test',
        model: 'test',
      });

      await maker.ask('What is MAKER?', { context: knowledgeBase });

      // Verify the provider received the request with context
      const lastRequest = mockProvider.getLastRequest();
      expect(lastRequest).not.toBeNull();
      expect(lastRequest!.messages[0].content).toContain('MAKER');
    });
  });

  describe('Voting statistics', () => {
    it('should return voting statistics', async () => {
      mockProvider.setAnswerResponse('Paris', 'high');

      const maker = new Maker({
        provider: mockProvider,
        apiKey: 'test',
        model: 'test',
      });

      const result = await maker.ask('What is the capital of France?', {
        context: knowledgeBase,
      });

      expect(result.votingStats).toBeDefined();
      expect(result.votingStats.totalVotes).toBeGreaterThan(0);
      expect(result.votingStats.validVotes).toBeGreaterThan(0);
      expect(result.votingStats.k).toBe(3); // Default K value
    });
  });
});
