# @sittingduck/maker-core

**MAKER Framework** for reliable multi-step LLM reasoning with voting and red-flagging.

Based on the paper: ["Solving a Million-Step LLM Task with Zero Errors"](https://arxiv.org/abs/2511.09030)

## Features

- **Maximal Agentic Decomposition (MAD)** - Breaks complex questions into atomic sub-questions
- **First-to-ahead-by-K Voting** - Consensus-based answer selection with reliability guarantees
- **Red-flagging** - Automatic detection and filtering of unreliable responses
- **Multiple Providers** - Support for OpenAI and Anthropic (Claude)
- **Event-based Progress** - Real-time progress tracking with event emitters
- **TypeScript First** - Full type safety and IntelliSense support

## Installation

```bash
npm install @sittingduck/maker-core

# Install your preferred LLM provider (at least one required)
npm install openai           # For OpenAI
npm install @anthropic-ai/sdk # For Anthropic/Claude
```

## Quick Start

```typescript
import { Maker } from '@sittingduck/maker-core';

const maker = new Maker({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',
});

const result = await maker.ask('What factors led to the fall of the Roman Empire?', {
  context: 'Your knowledge base or context here...',
});

console.log(result.answer);       // The synthesized answer
console.log(result.confidence);   // 'high' | 'medium' | 'low'
console.log(result.subQuestions); // Decomposed sub-questions and answers
console.log(result.votingStats);  // Voting statistics
```

## Using Anthropic (Claude)

```typescript
import { Maker } from '@sittingduck/maker-core';

const maker = new Maker({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-sonnet-4-20250514',
});

const result = await maker.ask('Complex question here');
```

## Using Azure OpenAI

```typescript
import { Maker } from '@sittingduck/maker-core';

const maker = new Maker({
  provider: 'azure',
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  model: 'gpt-4',
  azure: {
    endpoint: 'https://your-resource.openai.azure.com/',
    apiVersion: '2024-02-15-preview',
    deployment: 'gpt-4-deployment', // optional
  },
});

const result = await maker.ask('Complex question here');
```

## Examples

### Run the Q&A Demo (requires API key)

```bash
OPENAI_API_KEY=your-key npm run demo
```

Or with Anthropic:

```bash
ANTHROPIC_API_KEY=your-key npm run demo:anthropic
```

### Knowledge Base

See `examples/knowledge-base.md` for a sample knowledge base about the MAKER framework itself.

### Test Example (no API key needed)

```bash
npm test -- tests/qa-example.test.ts --run
```

## Advanced Configuration

```typescript
import { Maker } from '@sittingduck/maker-core';

const maker = new Maker({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',

  // Voting settings (per MAKER paper Algorithm 2)
  voting: {
    k: 3,              // Winner must be K votes ahead (default: 3)
    maxVotes: 100,     // Safety limit for continuous voting
  },

  // Red-flag settings (per MAKER paper Section 3.3)
  redFlags: {
    maxTokens: 750,    // Flag responses > 750 tokens
    minChars: 5,       // Flag responses < 5 chars
  },
});
```

## Event Listeners

Track progress in real-time with event listeners:

```typescript
const maker = new Maker({ /* config */ });

// After classification
maker.on('classificationComplete', (classification) => {
  console.log('Needs decomposition:', classification.needsDecomposition);
});

// After decomposition
maker.on('decomposed', (subQuestions) => {
  console.log(`Decomposed into ${subQuestions.length} sub-questions`);
});

// Voting progress
maker.on('votingStart', ({ subQuestionIndex, question }) => {
  console.log(`Starting votes for Q${subQuestionIndex}: ${question}`);
});

maker.on('voteProgress', ({ subQuestionIndex, voteIndex, voteCounts, redFlagged }) => {
  console.log(`Vote ${voteIndex} for Q${subQuestionIndex}: ${redFlagged ? 'RED-FLAGGED' : 'valid'}`);
});

maker.on('votingComplete', ({ subQuestionIndex, consensusReached, answer }) => {
  console.log(`Q${subQuestionIndex}: consensus=${consensusReached}, answer="${answer}"`);
});

// Red-flagging
maker.on('redFlagged', ({ answer, reason }) => {
  console.log(`Red-flagged (${reason}): "${answer.substring(0, 50)}..."`);
});

// Synthesis
maker.on('synthesisComplete', ({ answer }) => {
  console.log('Final answer:', answer);
});

// Complete
maker.on('complete', (result) => {
  console.log('Done!', result);
});
```

## Using Individual Components

You can use the framework components independently:

```typescript
import {
  Decomposer,
  VotingEngine,
  RedFlagFilter,
  Synthesizer,
  OpenAIProvider,
} from '@maker-framework/core';

// Create provider
const provider = new OpenAIProvider(apiKey, 'gpt-4o-mini');

// Use decomposer
const decomposer = new Decomposer(provider, { maxSubQuestions: 5 });
const { subQuestions, classification } = await decomposer.decompose('Your question');

// Use voting engine (continuous voting per paper Algorithm 2)
const votingEngine = new VotingEngine({ k: 3, maxVotes: 100 });
const redFlagFilter = new RedFlagFilter({ maxTokens: 750 });
const result = await votingEngine.voteUntilConsensus(
  provider,
  'Sub-question',
  'Context',
  redFlagFilter
);

// Use red-flag filter (paper-aligned)
const filter = new RedFlagFilter({ maxTokens: 750 });
const flagResult = filter.check('Answer text', parseSucceeded);

// Use synthesizer
const synthesizer = new Synthesizer(provider);
const { answer } = await synthesizer.synthesize('Original question', subResults);
```

## Custom Provider

Implement your own LLM provider:

```typescript
import { LLMProvider, CompletionRequest, CompletionResponse, Maker } from '@maker-framework/core';

class MyCustomProvider implements LLMProvider {
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    // Your implementation
    const response = await myLLMCall(request.messages, request.temperature);

    return {
      content: response.parsed,
      raw: response.text,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}

const maker = new Maker({
  provider: new MyCustomProvider(),
  apiKey: '', // Not needed for custom provider
  model: 'my-model',
});
```

## API Reference

### Maker

Main class for the MAKER framework.

```typescript
class Maker extends EventEmitter {
  constructor(config: MakerConfig);
  ask(question: string, options?: AskOptions): Promise<MakerResult>;
  getConfig(): MakerConfig;
  getProvider(): LLMProvider;
}
```

### MakerResult

```typescript
interface MakerResult {
  answer: string;                    // Final synthesized answer
  confidence: 'high' | 'medium' | 'low';
  consensusReached: boolean;         // All sub-questions reached consensus
  isDecomposed: boolean;             // Question was decomposed
  subQuestions?: SubQuestionResult[]; // Results per sub-question
  votingStats: VotingStats;          // Aggregated voting stats
  executionTimeMs: number;           // Total execution time
}
```

### Events

| Event | Payload | Description |
|-------|---------|-------------|
| `classificationComplete` | `Classification` | After question classification |
| `decomposed` | `SubQuestion[]` | After decomposition |
| `votingStart` | `{ subQuestionIndex, question }` | Before voting starts |
| `voteProgress` | `{ subQuestionIndex, voteIndex, voteCounts, redFlagged }` | Each vote during continuous voting |
| `votingComplete` | `{ subQuestionIndex, consensusReached, answer }` | After voting ends |
| `redFlagged` | `{ answer, reason }` | When a vote is red-flagged |
| `synthesisStart` | `{ subAnswers }` | Before synthesis |
| `synthesisComplete` | `{ answer }` | After synthesis |
| `complete` | `MakerResult` | Processing complete |

## How It Works

1. **Classification**: Determines if the question needs decomposition
2. **Decomposition (MAD)**: Breaks complex questions into atomic sub-questions
3. **Voting (Algorithm 2)**: For each sub-question:
   - Sample LLM responses one at a time (continuous voting)
   - Apply red-flag filter (too long or parse failure)
   - Continue until one answer is K votes ahead of all others
   - Temperature: 0 for first vote, 0.1 for subsequent
4. **Synthesis**: Combine sub-answers into a coherent final answer

### First-to-ahead-by-K Voting

The winner must be **K votes ahead** of the runner-up (not just K total votes):

```
If votes are: Answer A: 3, Answer B: 1, Answer C: 1
With K=2: A wins because 3-1 = 2 >= K ✓

If votes are: Answer A: 3, Answer B: 2
With K=2: No consensus because 3-2 = 1 < K ✗
```

### Red-flagging (Paper Section 3.3)

Per the MAKER paper, only **TWO** red flags are used:

1. **Response too long** - Exceeds 750 tokens (default). Long responses correlate with confusion/errors.
2. **Invalid format** - Response cannot be parsed into the expected structure (JSON parse failure).

Red-flagged responses are discarded and the system re-samples.

## License

MIT
