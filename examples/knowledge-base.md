# MAKER Framework Knowledge Base

## Overview

MAKER is a TypeScript framework for reliable LLM reasoning, implementing techniques from the research paper "Solving a Million-Step LLM Task with Zero Errors" (arXiv:2511.09030). The framework enables developers to build AI agents that can solve complex multi-step tasks with near-zero error rates.

## What MAKER Stands For

The name MAKER is an acronym derived from the three core techniques:

- **M**aximal **A**gentic decomposition (MAD)
- first-to-ahead-by-**K** **E**rror correction (voting)
- **R**ed-flagging (filtering unreliable responses)

## Core Components

### 1. MAD (Maximal Agentic Decomposition)

MAD is the process of breaking complex questions or tasks into minimal atomic sub-questions. The key principles are:

- Each sub-question should be as simple as possible (m=1, meaning one atomic step)
- Sub-questions are answered independently by separate LLM calls
- Dependencies between sub-questions are tracked
- Results are synthesized into a final coherent answer

**Example:** The question "What is the population of the capital of France?" might be decomposed into:
1. "What is the capital of France?"
2. "What is the population of Paris?"

### 2. First-to-ahead-by-K Voting

The voting mechanism provides error correction through consensus. Here's how it works:

- Multiple LLM responses (votes) are sampled for each question
- Voting continues until one answer is K votes ahead of all other answers
- The default value for K is 3
- Temperature schedule: 0 for the first vote, 0.1 for subsequent votes
- Answers are normalized (case-insensitive, trimmed, punctuation removed) before comparison

**Algorithm (from paper):**
```
while True:
    y = get_vote(x, M)
    V[y] = V[y] + 1
    if V[y] >= k + max(V[v] for v != y):
        return y
```

This means if K=3 and answer "Paris" has 4 votes while "London" has 1 vote, consensus is reached because 4 >= 3 + 1.

### 3. Red-Flagging

Red-flagging identifies and discards unreliable LLM responses before they can affect the voting process. Per the MAKER paper (Section 3.3), only TWO red flags are used:

1. **Response too long**: Exceeds 750 tokens (default). The paper found that longer responses correlate with confusion and errors.

2. **Invalid format**: The response cannot be parsed into the expected structure (e.g., JSON parsing failure). Format errors correlate with reasoning errors.

Red-flagged responses are discarded and the system re-samples to get a valid vote.

## Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `k` | 3 | Voting margin - winner must be K votes ahead |
| `maxTokens` | 750 | Maximum response tokens before flagging |
| `maxVotes` | 100 | Safety limit to prevent infinite voting loops |
| `minChars` | 5 | Minimum response length |

## Temperature Schedule

The framework uses a specific temperature schedule for optimal results:
- **First vote**: Temperature = 0 (deterministic, best possible baseline)
- **Subsequent votes**: Temperature = 0.1 (slight randomness for diversity)

## Success Probability

Using the gambler's ruin formula from the paper:

```
P(success per step) = 1 / (1 + ((1-p)/p)^k)
```

Where `p` is the per-step accuracy and `k` is the voting margin.

For a model with 99.8% accuracy (p=0.998) and k=3:
- Per-step success rate: >99.9999%
- Can scale to millions of steps with near-zero errors

## Benefits

1. **Near-zero error rates**: Achieves extremely low error rates on multi-step tasks through voting consensus

2. **Scalable costs**: Cost scales as O(s log s) where s is the number of steps, making it practical for large tasks

3. **Works with standard LLMs**: No special reasoning models required - works with GPT-4, Claude, etc.

4. **Observable execution**: Full event system for monitoring progress and debugging

5. **Extensible**: Custom validators, providers, and decomposition strategies supported

## Usage Example

```typescript
import { Maker } from '@sittingduck/maker-core';

const maker = new Maker({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',
});

const result = await maker.ask(
  'What is the population of the capital of France?',
  { context: knowledgeBase }
);

console.log(result.answer);      // The answer
console.log(result.confidence);  // 'high', 'medium', or 'low'
console.log(result.votingStats); // Voting statistics
```

## Events

The Maker class emits events for observability:

- `classificationComplete` - Question classification done
- `decomposed` - Question decomposed into sub-questions
- `votingStart` - Voting begins for a sub-question
- `voteProgress` - Each vote cast
- `votingComplete` - Consensus reached
- `redFlagged` - A response was filtered out
- `synthesisComplete` - Final answer synthesized
- `complete` - Full process complete

## Reference

Based on: "Solving a Million-Step LLM Task with Zero Errors" (arXiv:2511.09030)
