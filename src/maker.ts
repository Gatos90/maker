/**
 * Maker Class
 *
 * Main entry point for the MAKER framework.
 * Orchestrates decomposition, voting, red-flagging, and synthesis.
 */

import { EventEmitter } from 'events';
import type {
  MakerConfig,
  MakerResult,
  AskOptions,
  LLMProvider,
  SubQuestionResult,
  VotingStats,
  ConfidenceLevel,
  MakerEvents,
} from './types';
import { Decomposer } from './core/decomposer';
import { VotingEngine } from './core/voting';
import { RedFlagFilter } from './core/red-flag-filter';
import { Synthesizer } from './core/synthesizer';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { AzureOpenAIProvider } from './providers/azure-openai';

/**
 * Type-safe event emitter for Maker
 */
export interface Maker {
  on<K extends keyof MakerEvents>(event: K, listener: (payload: MakerEvents[K]) => void): this;
  emit<K extends keyof MakerEvents>(event: K, payload: MakerEvents[K]): boolean;
}

/**
 * Maker class
 *
 * Main entry point for the MAKER framework. Provides a simple API
 * for reliable multi-step LLM reasoning with voting and red-flagging.
 *
 * @example
 * ```typescript
 * const maker = new Maker({
 *   provider: 'openai',
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4.1-mini',
 * });
 *
 * const result = await maker.ask('What is the capital of France?');
 * console.log(result.answer);
 * ```
 */
export class Maker extends EventEmitter {
  private readonly provider: LLMProvider;
  private readonly decomposer: Decomposer;
  private readonly votingEngine: VotingEngine;
  private readonly redFlagFilter: RedFlagFilter;
  private readonly synthesizer: Synthesizer;
  private readonly config: MakerConfig;

  constructor(config: MakerConfig) {
    super();
    this.config = config;
    this.provider = this.createProvider(config);
    this.decomposer = new Decomposer(this.provider, config.decomposition ?? {});
    this.votingEngine = new VotingEngine(config.voting ?? {});
    this.redFlagFilter = new RedFlagFilter(config.redFlags ?? {});
    this.synthesizer = new Synthesizer(this.provider, config.synthesis ?? {});
  }

  /**
   * Create the LLM provider based on configuration
   */
  private createProvider(config: MakerConfig): LLMProvider {
    // If provider is already an LLMProvider instance, use it directly
    if (typeof config.provider === 'object' && 'complete' in config.provider) {
      return config.provider;
    }

    // Create provider based on string identifier
    switch (config.provider) {
      case 'openai':
        return new OpenAIProvider(config.apiKey, config.model, config.baseUrl);
      case 'anthropic':
        return new AnthropicProvider(config.apiKey, config.model, config.baseUrl);
      case 'azure':
        if (!config.azure?.endpoint || !config.azure?.apiVersion) {
          throw new Error(
            'Azure provider requires azure.endpoint and azure.apiVersion configuration'
          );
        }
        return new AzureOpenAIProvider(
          {
            apiKey: config.apiKey,
            endpoint: config.azure.endpoint,
            apiVersion: config.azure.apiVersion,
            deployment: config.azure.deployment,
          },
          config.model
        );
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  /**
   * Ask a question and get a reliable answer using the MAKER framework
   *
   * @param question - The question to answer
   * @param options - Optional configuration for this question
   * @returns The result including answer, confidence, and statistics
   */
  async ask(question: string, options?: AskOptions): Promise<MakerResult> {
    const startTime = Date.now();
    let totalTokens = 0;

    // Step 1: Decompose the question
    const { subQuestions, synthesisStrategy, classification } = await this.decomposer.decompose(
      question,
      options?.context
    );

    this.emit('classificationComplete', classification);
    this.emit('decomposed', subQuestions);

    // Step 2: Process each sub-question with voting (Algorithm 2: do_voting)
    const subResults: SubQuestionResult[] = [];

    for (const [index, sq] of subQuestions.entries()) {
      this.emit('votingStart', { subQuestionIndex: index, question: sq.question });

      // Create voting engine with potential overrides
      const votingEngine = new VotingEngine({
        ...this.config.voting,
        k: options?.k ?? this.config.voting?.k,
      });

      // Vote until consensus using continuous voting (Algorithm 2)
      const result = await votingEngine.voteUntilConsensus(
        this.provider,
        sq.question,
        options?.context ?? '',
        this.redFlagFilter,
        (vote, voteCounts) => {
          // Emit progress event for each vote
          this.emit('voteProgress', {
            subQuestionIndex: index,
            voteIndex: vote.voteIndex,
            voteCounts: Object.fromEntries(
              Array.from(voteCounts.entries()).map(([k, v]) => [k, v.count])
            ),
            redFlagged: vote.redFlagged ?? false,
          });

          // Emit legacy voteCollected event for backward compatibility
          this.emit('voteCollected', {
            subQuestionIndex: index,
            voteIndex: vote.voteIndex,
            redFlagged: vote.redFlagged ?? false,
          });

          if (vote.redFlagged && vote.redFlagReason) {
            this.emit('redFlagged', {
              answer: vote.answer,
              reason: vote.redFlagReason,
            });
          }
        }
      );

      const subResult: SubQuestionResult = {
        question: sq.question,
        answer: result.winner ?? 'Unable to determine answer.',
        confidence: result.confidence ?? 'low',
        consensusReached: result.consensusReached,
        votingStats: result.stats,
      };

      subResults.push(subResult);

      this.emit('votingComplete', {
        subQuestionIndex: index,
        consensusReached: result.consensusReached,
        answer: subResult.answer,
      });

      this.emit('subQuestionResolved', { index, result: subResult });
    }

    // Step 3: Synthesize final answer
    this.emit('synthesisStart', { subAnswers: subResults });

    const { answer: finalAnswer, confidence: synthesisConfidence } =
      await this.synthesizer.synthesize(question, subResults);

    this.emit('synthesisComplete', { answer: finalAnswer });

    // Calculate overall statistics
    const votingStats = this.aggregateVotingStats(subResults);
    const overallConfidence = this.calculateOverallConfidence(subResults, synthesisConfidence);

    const result: MakerResult = {
      answer: finalAnswer,
      confidence: overallConfidence,
      consensusReached: subResults.every((r) => r.consensusReached),
      isDecomposed: subQuestions.length > 1,
      subQuestions: subResults,
      synthesisStrategy,
      votingStats,
      totalTokens,
      executionTimeMs: Date.now() - startTime,
    };

    this.emit('complete', result);

    return result;
  }

  /**
   * Aggregate voting statistics from all sub-questions
   */
  private aggregateVotingStats(subResults: SubQuestionResult[]): VotingStats {
    if (subResults.length === 0) {
      return {
        totalVotes: 0,
        validVotes: 0,
        redFlaggedVotes: 0,
        winningVoteCount: 0,
        margin: 0,
        k: this.votingEngine.getK(),
      };
    }

    if (subResults.length === 1) {
      return subResults[0].votingStats;
    }

    // Aggregate stats from all sub-questions
    return {
      totalVotes: subResults.reduce((sum, r) => sum + r.votingStats.totalVotes, 0),
      validVotes: subResults.reduce((sum, r) => sum + r.votingStats.validVotes, 0),
      redFlaggedVotes: subResults.reduce((sum, r) => sum + r.votingStats.redFlaggedVotes, 0),
      winningVoteCount: Math.min(...subResults.map((r) => r.votingStats.winningVoteCount)),
      margin: Math.min(...subResults.map((r) => r.votingStats.margin)),
      k: this.votingEngine.getK(),
    };
  }

  /**
   * Calculate overall confidence from sub-results
   */
  private calculateOverallConfidence(
    subResults: SubQuestionResult[],
    synthesisConfidence: ConfidenceLevel
  ): ConfidenceLevel {
    if (subResults.length === 0) {
      return 'low';
    }

    // Check if any sub-result has low confidence or didn't reach consensus
    const hasLowConfidence = subResults.some(
      (r) => r.confidence === 'low' || !r.consensusReached
    );
    if (hasLowConfidence || synthesisConfidence === 'low') {
      return 'low';
    }

    // Check if majority is medium
    const mediumCount = subResults.filter((r) => r.confidence === 'medium').length;
    if (mediumCount > subResults.length / 2 || synthesisConfidence === 'medium') {
      return 'medium';
    }

    return 'high';
  }

  /**
   * Get the current configuration
   */
  getConfig(): MakerConfig {
    return { ...this.config };
  }

  /**
   * Get the underlying provider
   */
  getProvider(): LLMProvider {
    return this.provider;
  }
}
