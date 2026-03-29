import * as claudeService from './claudeService';
import * as geminiService from './geminiService';
import type { ValidMime, GenerateResult, SkipResult } from './claudeService';

function getActiveModel(): string {
  return process.env.AI_MODEL || 'claude';
}

export async function generateExercises(
  images: Array<{ base64: string; mimeType: ValidMime }>,
  count: number = 10,
  previousQuestions: string[] = []
): Promise<GenerateResult> {
  const model = getActiveModel();
  console.log(`[AI] Using model: ${model}`);
  if (model === 'gemini') {
    return geminiService.generateExercises(images, count, previousQuestions);
  }
  return claudeService.generateExercises(images, count, previousQuestions);
}

export async function generateSkip(
  originalQuestion: string,
  type: string,
  difficulty: string,
  isMultiAnswer: boolean = false,
  orderMatters: boolean = true,
  answersCount: number = 2
): Promise<SkipResult> {
  const model = getActiveModel();
  if (model === 'gemini') {
    return geminiService.generateSkip(originalQuestion, type, difficulty, isMultiAnswer, orderMatters, answersCount);
  }
  return claudeService.generateSkip(originalQuestion, type, difficulty, isMultiAnswer, orderMatters, answersCount);
}
