/**
 * Voting Engine
 *
 * Implements First-to-ahead-by-K voting from the MAKER framework.
 * The winner must be K votes AHEAD of the runner-up (not just K total votes).
 */

import type {
  VotingConfig,
  VotingResult,
  VotingStats,
  Vote,
  ConfidenceLevel,
  LLMProvider,
} from '../types';
import { PROMPTS } from '../prompts';
import { RedFlagFilter } from './red-flag-filter';

/**
 * Default voting configuration
 *
 * Per MAKER paper:
 * - k=3 (first-to-ahead-by-K, increased for higher reliability)
 * - maxVotes=100 (safety limit, paper has no explicit limit)
 */
const DEFAULT_CONFIG = {
  k: 3,
  maxVotes: 100,
  /** @deprecated Fixed samples not in paper. Kept for backward compatibility. */
  samples: 5,
  /** @deprecated Temperature array not in paper. Kept for backward compatibility. */
  temperatures: [0, 0.1, 0.1, 0.1, 0.1],
};

/**
 * Vote data stored during continuous voting
 */
export interface VoteData {
  count: number;
  originalAnswer: string;
  confidence: ConfidenceLevel;
}

/**
 * Voting Engine class
 *
 * Implements Algorithm 2 (do_voting) from the MAKER paper:
 * Continuously samples until one answer is K votes ahead of all others.
 */
export class VotingEngine {
  private readonly k: number;
  private readonly maxVotes: number;

  /** @deprecated Fixed samples not in paper. Used by deprecated collectVotes(). */
  private readonly samples: number;
  /** @deprecated Temperature array not in paper. Used by deprecated collectVotes(). */
  private readonly temperatures: number[];

  constructor(config: VotingConfig = {}) {
    this.k = config.k ?? DEFAULT_CONFIG.k;
    this.maxVotes = config.maxVotes ?? DEFAULT_CONFIG.maxVotes;

    // Deprecated fields for backward compatibility with collectVotes()
    this.samples = config.samples ?? DEFAULT_CONFIG.samples;
    this.temperatures = config.temperatures ??
      this.generateDefaultTemperatures(this.samples);
  }

  /**
   * Generate default temperatures for voting samples
   * First sample at 0, rest at 0.1
   */
  private generateDefaultTemperatures(samples: number): number[] {
    if (samples <= 0) return [];
    if (samples === 1) return [0];
    return [0, ...Array(samples - 1).fill(0.1)];
  }

  /**
   * Collect votes by generating multiple LLM responses in parallel
   *
   * @deprecated Use voteUntilConsensus() instead for paper-compliant continuous voting.
   * This method uses fixed sample counts which is not in the MAKER paper.
   *
   * @param provider - LLM provider to use
   * @param question - Question to answer
   * @param context - Context/knowledge base
   * @returns Array of votes
   */
  async collectVotes(
    provider: LLMProvider,
    question: string,
    context: string
  ): Promise<Vote[]> {
    const votePromises = Array.from({ length: this.samples }, (_, i) =>
      this.generateVote(provider, question, context, this.temperatures[i] ?? 0.1, i)
    );

    const votes = await Promise.all(votePromises);
    return votes;
  }

  /**
   * Vote until consensus is reached (Algorithm 2 from MAKER paper)
   *
   * Implements do_voting from the paper:
   * ```
   * while True:
   *     y = get_vote(x, M)
   *     V[y] = V[y] + 1
   *     if V[y] >= k + max(V[v] for v != y):
   *         return y
   * ```
   *
   * Continuously samples until one answer is K votes ahead of all others.
   * Red-flagged votes are discarded and not counted.
   *
   * @param provider - LLM provider to use
   * @param question - Question to answer
   * @param context - Context/knowledge base
   * @param redFlagFilter - Filter for detecting unreliable responses
   * @param onVote - Optional callback for each vote (for progress tracking)
   * @returns Voting result with winner and statistics
   */
  async voteUntilConsensus(
    provider: LLMProvider,
    question: string,
    context: string,
    redFlagFilter: RedFlagFilter,
    onVote?: (vote: Vote, voteCounts: Map<string, VoteData>) => void
  ): Promise<VotingResult> {
    const voteCounts = new Map<string, VoteData>();
    const allVotes: Vote[] = [];
    let validVoteCount = 0;
    let voteIndex = 0;

    while (true) {
      // Get temperature: first vote at 0, rest at 0.1 (per paper)
      const temperature = voteIndex === 0 ? 0 : 0.1;

      // Generate single vote
      const vote = await this.generateVote(provider, question, context, temperature, voteIndex);
      allVotes.push(vote);
      voteIndex++;

      // Apply red-flag filter (Algorithm 3: get_vote)
      const flagResult = redFlagFilter.check(vote.answer, vote.parseSucceeded ?? true);
      if (flagResult.redFlagged) {
        vote.redFlagged = true;
        vote.redFlagReason = flagResult.reason;
        onVote?.(vote, voteCounts);
        continue; // Discard and resample
      }

      // Count valid vote
      validVoteCount++;
      const normalized = this.normalizeAnswer(vote.answer);

      if (!normalized) {
        // Empty answer after normalization - skip
        onVote?.(vote, voteCounts);
        continue;
      }

      const existing = voteCounts.get(normalized);
      if (existing) {
        existing.count++;
        if (this.compareConfidence(vote.confidence, existing.confidence) > 0) {
          existing.confidence = vote.confidence;
        }
      } else {
        voteCounts.set(normalized, {
          count: 1,
          originalAnswer: vote.answer,
          confidence: vote.confidence,
        });
      }

      // Emit progress event
      onVote?.(vote, voteCounts);

      // Check first-to-ahead-by-K condition
      const counts = Array.from(voteCounts.values()).map((v) => v.count);
      if (counts.length === 0) continue;

      const maxCount = Math.max(...counts);
      const sortedCounts = [...counts].sort((a, b) => b - a);
      const runnerUpCount = sortedCounts.length > 1 ? sortedCounts[1] : 0;

      // Winner must be K ahead of runner-up
      if (maxCount >= this.k + runnerUpCount) {
        // Find winner
        for (const [, data] of voteCounts) {
          if (data.count === maxCount) {
            return {
              consensusReached: true,
              winner: data.originalAnswer,
              confidence: data.confidence,
              stats: {
                totalVotes: allVotes.length,
                validVotes: validVoteCount,
                redFlaggedVotes: allVotes.length - validVoteCount,
                winningVoteCount: maxCount,
                margin: maxCount - runnerUpCount,
                k: this.k,
              },
            };
          }
        }
      }

      // Safety limit to prevent infinite loops
      if (allVotes.length >= this.maxVotes) {
        // Return best guess even without consensus
        const sorted = Array.from(voteCounts.entries()).sort((a, b) => b[1].count - a[1].count);
        const [, winnerData] = sorted[0] ?? [null, null];
        const runnerUpData = sorted[1]?.[1];

        return {
          consensusReached: false,
          winner: winnerData?.originalAnswer ?? null,
          confidence: winnerData?.confidence,
          stats: {
            totalVotes: allVotes.length,
            validVotes: validVoteCount,
            redFlaggedVotes: allVotes.length - validVoteCount,
            winningVoteCount: winnerData?.count ?? 0,
            margin: (winnerData?.count ?? 0) - (runnerUpData?.count ?? 0),
            k: this.k,
          },
        };
      }
    }
  }

  /**
   * Generate a single vote
   *
   * Returns a Vote with parseSucceeded indicating whether
   * the response was successfully parsed into expected format.
   */
  private async generateVote(
    provider: LLMProvider,
    question: string,
    context: string,
    temperature: number,
    voteIndex: number
  ): Promise<Vote> {
    try {
      const prompt = PROMPTS.answer(question, context);

      const response = await provider.complete({
        messages: [{ role: 'user', content: prompt }],
        temperature,
        responseFormat: { type: 'json_object' },
      });

      // Parse the response
      let answer = '';
      let confidence: ConfidenceLevel = 'medium';
      let reasoning: string | undefined;
      let parseSucceeded = false;

      if (typeof response.content === 'object' && response.content !== null) {
        const content = response.content as Record<string, unknown>;
        if (content.answer !== undefined) {
          answer = String(content.answer);
          confidence = (content.confidence as ConfidenceLevel) ?? 'medium';
          reasoning = content.reasoning as string | undefined;
          parseSucceeded = true; // Successfully parsed expected format
        }
      }

      // If not parsed as object with answer field, treat as parse failure
      if (!parseSucceeded && typeof response.content === 'string') {
        answer = response.content;
      }

      return {
        voteIndex,
        answer,
        confidence,
        reasoning,
        temperature,
        parseSucceeded,
      };
    } catch (error) {
      // Return a flaggable vote on error
      return {
        voteIndex,
        answer: '',
        confidence: 'low',
        temperature,
        parseSucceeded: false,
        redFlagged: true,
        redFlagReason: 'invalid_format',
      };
    }
  }

  /**
   * Determine the winner using first-to-ahead-by-K voting
   *
   * @param votes - Array of votes to process
   * @returns Voting result with winner and statistics
   */
  determineWinner(votes: Vote[]): VotingResult {
    // Filter out red-flagged votes
    const validVotes = votes.filter((v) => !v.redFlagged);

    if (validVotes.length === 0) {
      return {
        consensusReached: false,
        winner: null,
        stats: this.createStats(votes, validVotes, 0, 0),
      };
    }

    // Normalize and count votes
    const voteCounts = this.countVotes(validVotes);
    const sorted = Array.from(voteCounts.entries()).sort((a, b) => b[1].count - a[1].count);

    if (sorted.length === 0) {
      return {
        consensusReached: false,
        winner: null,
        stats: this.createStats(votes, validVotes, 0, 0),
      };
    }

    const [, winnerData] = sorted[0];
    const runnerUp = sorted[1];

    const winnerVotes = winnerData.count;
    const runnerUpVotes = runnerUp ? runnerUp[1].count : 0;

    // First-to-ahead-by-K: winner must be K votes AHEAD of runner-up
    // Special case: if only one unique answer and it has >= k votes, consensus reached
    let consensusReached: boolean;
    if (sorted.length === 1) {
      consensusReached = winnerVotes >= this.k;
    } else {
      consensusReached = (winnerVotes - runnerUpVotes) >= this.k;
    }

    return {
      consensusReached,
      winner: winnerData.originalAnswer,
      confidence: winnerData.confidence,
      stats: this.createStats(votes, validVotes, winnerVotes, runnerUpVotes),
    };
  }

  /**
   * Normalize an answer for comparison
   * Makes answers case-insensitive and removes trailing punctuation
   */
  normalizeAnswer(answer: string): string {
    if (!answer) return '';
    return answer
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.,!?;:]+$/, '');
  }

  /**
   * Count votes by normalized answer
   */
  private countVotes(votes: Vote[]): Map<
    string,
    { count: number; originalAnswer: string; confidence: ConfidenceLevel }
  > {
    const counts = new Map<
      string,
      { count: number; originalAnswer: string; confidence: ConfidenceLevel }
    >();

    for (const vote of votes) {
      const normalized = this.normalizeAnswer(vote.answer);
      if (!normalized) continue;

      const existing = counts.get(normalized);
      if (existing) {
        existing.count++;
        // Keep the higher confidence
        if (this.compareConfidence(vote.confidence, existing.confidence) > 0) {
          existing.confidence = vote.confidence;
        }
      } else {
        counts.set(normalized, {
          count: 1,
          originalAnswer: vote.answer,
          confidence: vote.confidence,
        });
      }
    }

    return counts;
  }

  /**
   * Compare confidence levels
   * Returns positive if a > b, negative if a < b, 0 if equal
   */
  private compareConfidence(a: ConfidenceLevel, b: ConfidenceLevel): number {
    const order: Record<ConfidenceLevel, number> = {
      high: 3,
      medium: 2,
      low: 1,
    };
    return order[a] - order[b];
  }

  /**
   * Create voting statistics object
   */
  private createStats(
    allVotes: Vote[],
    validVotes: Vote[],
    winningVoteCount: number,
    runnerUpVotes: number
  ): VotingStats {
    return {
      totalVotes: allVotes.length,
      validVotes: validVotes.length,
      redFlaggedVotes: allVotes.length - validVotes.length,
      winningVoteCount,
      margin: winningVoteCount - runnerUpVotes,
      k: this.k,
    };
  }

  /**
   * Get the K value being used
   */
  getK(): number {
    return this.k;
  }

  /**
   * Get the maximum votes safety limit
   */
  getMaxVotes(): number {
    return this.maxVotes;
  }

  /**
   * Get the number of samples being collected
   * @deprecated Fixed samples not in MAKER paper. Use continuous voting instead.
   */
  getSamples(): number {
    return this.samples;
  }
}
