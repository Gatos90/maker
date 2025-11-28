/**
 * Mock LLM Provider for Testing
 *
 * Provides a configurable mock that simulates LLM responses
 * without making actual API calls.
 */

import type {
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  Classification,
  SubQuestion,
} from '../../src/types';

/**
 * Response configuration for the mock provider
 */
export interface MockResponse {
  content: unknown;
  raw?: string;
}

/**
 * Mock LLM Provider
 *
 * Allows setting up responses for different prompt patterns.
 */
export class MockProvider implements LLMProvider {
  private responses: Map<string | RegExp, MockResponse> = new Map();
  private defaultResponse: MockResponse = {
    content: { answer: 'Default mock answer.', confidence: 'medium' },
    raw: '{"answer": "Default mock answer.", "confidence": "medium"}',
  };
  private sequentialResponses: MockResponse[] = [];
  private sequentialIndex = 0;
  private callCount = 0;
  private lastRequest: CompletionRequest | null = null;

  /**
   * Set a response for a specific pattern
   *
   * @param pattern - String or RegExp to match against prompt content
   * @param response - The response to return
   */
  setResponse(pattern: string | RegExp, response: MockResponse): this {
    this.responses.set(pattern, response);
    return this;
  }

  /**
   * Set the default response when no pattern matches
   */
  setDefaultResponse(response: MockResponse): this {
    this.defaultResponse = response;
    return this;
  }

  /**
   * Set a classification response
   */
  setClassificationResponse(classification: Classification): this {
    // Use specific pattern that matches classification prompt but not decomposition
    this.setResponse(/question classifier|needsDecomposition/i, {
      content: classification,
      raw: JSON.stringify(classification),
    });
    return this;
  }

  /**
   * Set a decomposition response
   */
  setDecompositionResponse(
    subQuestions: SubQuestion[],
    synthesisStrategy: string = 'sequential'
  ): this {
    // Use specific pattern that matches decomposition prompt
    this.setResponse(/question decomposer|MAD.*Decomposition|atomic sub-questions/i, {
      content: { subQuestions, synthesisStrategy },
      raw: JSON.stringify({ subQuestions, synthesisStrategy }),
    });
    return this;
  }

  /**
   * Set an answer response (for voting)
   */
  setAnswerResponse(answer: string, confidence: 'high' | 'medium' | 'low' = 'high'): this {
    this.setResponse(/answer|respond|question/i, {
      content: { answer, confidence },
      raw: JSON.stringify({ answer, confidence }),
    });
    return this;
  }

  /**
   * Set a synthesis response
   */
  setSynthesisResponse(answer: string, confidence: 'high' | 'medium' | 'low' = 'high'): this {
    this.setResponse(/synthesize|combine|final.*answer/i, {
      content: { answer, confidence },
      raw: JSON.stringify({ answer, confidence }),
    });
    return this;
  }

  /**
   * Set sequential responses for continuous voting tests
   *
   * Responses are returned in order. After all sequential responses are used,
   * falls back to pattern matching or default response.
   */
  setSequentialResponses(responses: MockResponse[]): this {
    this.sequentialResponses = responses;
    this.sequentialIndex = 0;
    return this;
  }

  /**
   * Set sequential answer responses for voting tests
   *
   * @param answers - Array of {answer, confidence} pairs
   */
  setSequentialAnswerResponses(
    answers: Array<{ answer: string; confidence: 'high' | 'medium' | 'low' }>
  ): this {
    this.sequentialResponses = answers.map((a) => ({
      content: { answer: a.answer, confidence: a.confidence },
      raw: JSON.stringify({ answer: a.answer, confidence: a.confidence }),
    }));
    this.sequentialIndex = 0;
    return this;
  }

  /**
   * Complete a chat request
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.callCount++;
    this.lastRequest = request;

    // Check for sequential responses first
    if (this.sequentialIndex < this.sequentialResponses.length) {
      const response = this.sequentialResponses[this.sequentialIndex];
      this.sequentialIndex++;
      return {
        content: response.content,
        raw: response.raw ?? JSON.stringify(response.content),
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      };
    }

    // Get prompt content from messages
    const promptContent = request.messages.map((m) => m.content).join(' ');

    // Check each pattern for a match
    for (const [pattern, response] of this.responses) {
      const matches =
        typeof pattern === 'string'
          ? promptContent.includes(pattern)
          : pattern.test(promptContent);

      if (matches) {
        return {
          content: response.content,
          raw: response.raw ?? JSON.stringify(response.content),
          usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        };
      }
    }

    // Return default response
    return {
      content: this.defaultResponse.content,
      raw: this.defaultResponse.raw ?? JSON.stringify(this.defaultResponse.content),
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    };
  }

  /**
   * Get the number of times complete() was called
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Get the last request made
   */
  getLastRequest(): CompletionRequest | null {
    return this.lastRequest;
  }

  /**
   * Reset the mock state
   */
  reset(): void {
    this.responses.clear();
    this.sequentialResponses = [];
    this.sequentialIndex = 0;
    this.callCount = 0;
    this.lastRequest = null;
  }
}

/**
 * Create a mock provider with common defaults set up
 */
export function createMockProvider(): MockProvider {
  return new MockProvider()
    .setClassificationResponse({
      needsDecomposition: false,
      complexity: 1,
      questionType: 'factual',
    })
    .setAnswerResponse('Paris.', 'high');
}
