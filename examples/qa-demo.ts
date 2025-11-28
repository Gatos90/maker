/**
 * MAKER Framework Interactive Q&A Chatbot
 *
 * An interactive CLI chatbot that answers questions about the MAKER framework
 * using a knowledge base.
 *
 * Usage:
 *   OPENAI_API_KEY=your-key npm run demo
 *
 * Or with Anthropic:
 *   ANTHROPIC_API_KEY=your-key npm run demo:anthropic
 */

import { Maker } from "../src";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// Load the knowledge base
const knowledgeBase = fs.readFileSync(
  path.join(__dirname, "knowledge-base.md"),
  "utf-8"
);

// Determine provider from environment
const useAnthropic =
  process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY;

const config = useAnthropic
  ? {
      provider: "anthropic" as const,
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: "claude-sonnet-4-20250514",
    }
  : {
      provider: "openai" as const,
      apiKey: process.env.OPENAI_API_KEY!,
      model: "gpt-4o-mini",
    };

if (!config.apiKey) {
  console.error(
    "Error: Please set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable"
  );
  process.exit(1);
}

// Initialize Maker
const maker = new Maker(config);

// Add event listeners for progress
maker.on("classificationComplete", (classification) => {
  console.log(
    `   Classification: ${classification.questionType}, complexity: ${classification.complexity}`
  );
});

maker.on("decomposed", (subQuestions) => {
  console.log(`   Decomposed into ${subQuestions.length} sub-questions:`);
  subQuestions.forEach((sq, i) => {
    console.log(`      ${i + 1}. ${sq.question}`);
  });
  console.log();
});

maker.on("votingStart", ({ question }) => {
  console.log(`   Voting on: "${question.substring(0, 50)}..."`);
});

maker.on("voteProgress", ({ voteIndex, voteCounts, redFlagged }) => {
  if (redFlagged) {
    console.log(`   Vote ${voteIndex + 1}: [RED-FLAGGED - discarded]`);
  } else {
    const counts = Object.entries(voteCounts)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .map(([answer, count]) => {
        const short =
          answer.length > 40 ? answer.substring(0, 40) + "..." : answer;
        return `"${short}"(${count})`;
      })
      .join(", ");
    console.log(`   Vote ${voteIndex + 1}: ${counts}`);
  }
});

maker.on("votingComplete", ({ consensusReached }) => {
  console.log(
    `   Consensus: ${consensusReached ? "Yes" : "No"}                    `
  );
});

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Process a question
async function processQuestion(question: string): Promise<void> {
  console.log("-".repeat(60));

  try {
    const startTime = Date.now();
    const result = await maker.ask(question, { context: knowledgeBase });
    const elapsed = Date.now() - startTime;

    console.log();
    console.log(`Answer: ${result.answer}`);
    console.log();
    console.log(`   Confidence: ${result.confidence}`);
    console.log(`   Total votes: ${result.votingStats.totalVotes}`);
    console.log(`   Valid votes: ${result.votingStats.validVotes}`);
    console.log(`   Winning votes: ${result.votingStats.winningVoteCount}`);
    console.log(`   Time: ${elapsed}ms`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
  }

  console.log();
}

// Prompt for next question
function prompt(): void {
  rl.question("You: ", async (input) => {
    const question = input.trim();

    if (!question) {
      prompt();
      return;
    }

    if (question.toLowerCase() === "exit" || question.toLowerCase() === "quit") {
      console.log("Goodbye!");
      rl.close();
      process.exit(0);
    }

    await processQuestion(question);
    prompt();
  });
}

// Main
function main(): void {
  console.log("=".repeat(60));
  console.log("MAKER Framework Q&A Chatbot");
  console.log(`Provider: ${config.provider} (${config.model})`);
  console.log("=".repeat(60));
  console.log();
  console.log("Ask me anything about the MAKER framework!");
  console.log("Type 'exit' or 'quit' to end the session.");
  console.log();

  prompt();
}

main();
