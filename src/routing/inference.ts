/**
 * Task Type Inference
 *
 * Infers the task type from a prompt using pattern matching.
 * Designed for <5ms execution with no network calls.
 *
 * @packageDocumentation
 */

import type { TaskType } from '../types.js';

/**
 * Pattern definition for task inference.
 */
interface InferencePattern {
  /**
   * Regular expression to match against the prompt.
   */
  pattern: RegExp;

  /**
   * Weight for this pattern (higher = more confident).
   */
  weight: number;
}

/**
 * Patterns for each task type.
 * Order matters - earlier patterns in the array have higher priority when weights are equal.
 */
const TASK_PATTERNS: Record<TaskType, InferencePattern[]> = {
  code_generation: [
    { pattern: /\b(write|create|generate|implement|build|code|develop|make)\b.{0,50}\b(function|class|code|script|program|method|module|api|endpoint|component)\b/i, weight: 10 },
    { pattern: /\b(write|create|generate)\b.{0,30}\b(python|javascript|typescript|java|go|rust|c\+\+|ruby|php|swift)\b/i, weight: 10 },
    { pattern: /\bcreate a.{0,30}(that|which|to)\b/i, weight: 5 },
    { pattern: /\bimplement\b.{0,50}\b(algorithm|logic|feature)\b/i, weight: 8 },
    { pattern: /\bcode\s+for\b/i, weight: 7 },
    { pattern: /\bwrite me\b.{0,30}\b(code|script|function)\b/i, weight: 9 },
    { pattern: /```[\w]*\n/i, weight: 3 }, // Code blocks suggest code context
  ],

  code_review: [
    { pattern: /\b(review|analyze|check|audit|inspect|evaluate|assess|critique)\b.{0,30}\b(code|function|class|script|implementation|pull request|pr|diff)\b/i, weight: 10 },
    { pattern: /\b(what'?s? wrong|find\s+(bugs?|issues?|problems?|errors?))\b.{0,30}\b(code|function|this)\b/i, weight: 9 },
    { pattern: /\b(improve|optimize|refactor)\b.{0,30}\b(code|function|this)\b/i, weight: 7 },
    { pattern: /\blook\s+(at|over)\s+(this|my)\s+code\b/i, weight: 8 },
    { pattern: /\bcode\s+review\b/i, weight: 10 },
    { pattern: /\bcan you (check|review)\b/i, weight: 5 },
  ],

  summarization: [
    { pattern: /\b(summarize|summarise|summary|tldr|tl;dr|recap|condense|brief|overview)\b/i, weight: 10 },
    { pattern: /\b(give|provide|write)\s+(me\s+)?(a\s+)?(brief|short|quick|concise)\s+(summary|overview)\b/i, weight: 9 },
    { pattern: /\bshorten\s+(this|the)\b/i, weight: 6 },
    { pattern: /\bin\s+(brief|short|a nutshell)\b/i, weight: 7 },
    { pattern: /\bkey\s+(points?|takeaways?)\b/i, weight: 8 },
    { pattern: /\bmain\s+(ideas?|points?)\b/i, weight: 7 },
  ],

  analysis: [
    { pattern: /\b(analyze|analyse|analysis|examine|investigate|assess|evaluate|study)\b/i, weight: 8 },
    { pattern: /\b(compare|contrast|differentiate|distinguish)\b.{0,30}\b(between|and)\b/i, weight: 9 },
    { pattern: /\b(pros?\s+and\s+cons?|advantages?\s+and\s+disadvantages?|strengths?\s+and\s+weaknesses?)\b/i, weight: 9 },
    { pattern: /\b(what\s+are|explain)\s+(the\s+)?(implications?|consequences?|effects?|impacts?)\b/i, weight: 8 },
    { pattern: /\bbreak\s*down\b/i, weight: 6 },
    { pattern: /\bdeep\s*dive\b/i, weight: 7 },
    { pattern: /\bcritical(ly)?\s+(analysis|evaluation|assessment)\b/i, weight: 9 },
  ],

  creative_writing: [
    { pattern: /\b(write|create|compose|craft|author)\b.{0,30}\b(story|poem|essay|article|blog|post|narrative|fiction|novel|song|lyrics)\b/i, weight: 10 },
    { pattern: /\b(creative|imaginative|fictional)\s+(writing|story|piece)\b/i, weight: 10 },
    { pattern: /\bonce upon a time\b/i, weight: 8 },
    { pattern: /\b(write|tell)\s+(me\s+)?(a\s+)?(short\s+)?story\b/i, weight: 9 },
    { pattern: /\b(brainstorm|ideate)\b.{0,30}\b(ideas?|concepts?|themes?)\b/i, weight: 7 },
    { pattern: /\bwrite\s+(in|like)\s+(the\s+)?style\s+of\b/i, weight: 8 },
    { pattern: /\b(catchy|creative|engaging)\s+(title|headline|tagline|slogan)\b/i, weight: 7 },
  ],

  data_extraction: [
    { pattern: /\b(extract|parse|pull|get|retrieve|find|identify)\b.{0,30}\b(data|information|details?|values?|fields?|entities?|names?|numbers?|dates?|emails?|phones?|addresses?)\b/i, weight: 10 },
    { pattern: /\b(convert|transform)\b.{0,30}\b(to|into)\s+(json|csv|xml|yaml|table|structured)\b/i, weight: 9 },
    { pattern: /\bstructured\s+(data|output|format)\b/i, weight: 8 },
    { pattern: /\bnamed\s+entity\s+(recognition|extraction)\b/i, weight: 10 },
    { pattern: /\b(scrape|crawl)\b/i, weight: 6 },
    { pattern: /\bjson\s+(output|format|schema)\b/i, weight: 7 },
  ],

  translation: [
    { pattern: /\b(translate|translation|translator)\b/i, weight: 10 },
    { pattern: /\b(convert|change)\b.{0,20}\b(to|into)\s+(english|spanish|french|german|chinese|japanese|korean|portuguese|italian|russian|arabic|hindi|dutch)\b/i, weight: 9 },
    { pattern: /\b(in|to)\s+(english|spanish|french|german|chinese|japanese|korean|portuguese|italian|russian|arabic|hindi|dutch)\b/i, weight: 6 },
    { pattern: /\bfrom\s+(english|spanish|french|german|chinese|japanese|korean|portuguese|italian|russian|arabic|hindi|dutch)\s+to\b/i, weight: 10 },
    { pattern: /\blocalize|localization\b/i, weight: 7 },
  ],

  question_answering: [
    { pattern: /^(what|who|where|when|why|how|which|is|are|does|do|can|could|would|should|will|did)\s/i, weight: 7 },
    { pattern: /\?$/i, weight: 5 },
    { pattern: /\b(explain|describe|define|what\s+is|what\s+are|tell\s+me\s+about)\b/i, weight: 8 },
    { pattern: /\b(answer|respond|reply)\b.{0,20}\b(question|query)\b/i, weight: 9 },
    { pattern: /\bfaq\b/i, weight: 8 },
    { pattern: /\bi\s+(want|need)\s+to\s+know\b/i, weight: 6 },
    { pattern: /\bcan\s+you\s+(tell|explain|help)\b/i, weight: 5 },
  ],

  general: [
    // Catch-all patterns with low weights
    { pattern: /./i, weight: 1 },
  ],
};

/**
 * Infers the task type from a prompt.
 *
 * @param prompt - The user's prompt
 * @returns The inferred task type
 */
export function inferTaskType(prompt: string): TaskType {
  // Normalize the prompt
  const normalizedPrompt = prompt.trim().toLowerCase();

  // Score each task type
  const scores: Record<TaskType, number> = {
    code_generation: 0,
    code_review: 0,
    summarization: 0,
    analysis: 0,
    creative_writing: 0,
    data_extraction: 0,
    translation: 0,
    question_answering: 0,
    general: 0,
  };

  // Calculate scores
  for (const [taskType, patterns] of Object.entries(TASK_PATTERNS)) {
    for (const { pattern, weight } of patterns) {
      if (pattern.test(prompt)) {
        scores[taskType as TaskType] += weight;
      }
    }
  }

  // Find the highest scoring task type
  let maxScore = 0;
  let inferredType: TaskType = 'general';

  for (const [taskType, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      inferredType = taskType as TaskType;
    }
  }

  // If the max score is very low, default to general
  if (maxScore <= 1) {
    return 'general';
  }

  return inferredType;
}

/**
 * Gets the confidence score for an inferred task type.
 *
 * @param prompt - The user's prompt
 * @param taskType - The task type to check confidence for
 * @returns Confidence score between 0 and 1
 */
export function getInferenceConfidence(prompt: string, taskType: TaskType): number {
  const patterns = TASK_PATTERNS[taskType];
  if (!patterns) return 0;

  let totalWeight = 0;
  let maxPossibleWeight = 0;

  for (const { pattern, weight } of patterns) {
    maxPossibleWeight += weight;
    if (pattern.test(prompt)) {
      totalWeight += weight;
    }
  }

  if (maxPossibleWeight === 0) return 0;

  // Normalize to 0-1 range, cap at 0.95 to show uncertainty
  return Math.min(totalWeight / maxPossibleWeight, 0.95);
}

/**
 * Gets all matching task types with their scores.
 *
 * @param prompt - The user's prompt
 * @returns Array of task types with scores, sorted by score descending
 */
export function getAllMatches(prompt: string): Array<{ taskType: TaskType; score: number; confidence: number }> {
  const scores: Record<TaskType, number> = {
    code_generation: 0,
    code_review: 0,
    summarization: 0,
    analysis: 0,
    creative_writing: 0,
    data_extraction: 0,
    translation: 0,
    question_answering: 0,
    general: 0,
  };

  // Calculate scores
  for (const [taskType, patterns] of Object.entries(TASK_PATTERNS)) {
    for (const { pattern, weight } of patterns) {
      if (pattern.test(prompt)) {
        scores[taskType as TaskType] += weight;
      }
    }
  }

  // Convert to array and sort
  const results = Object.entries(scores)
    .map(([taskType, score]) => ({
      taskType: taskType as TaskType,
      score,
      confidence: getInferenceConfidence(prompt, taskType as TaskType),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return results;
}
