import Anthropic from '@anthropic-ai/sdk';

// Lazy client — instantiated on first call so .env is always loaded first
let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export type ValidMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface GeneratedQuestion {
  question: string;
  answer: number;
  type: string;
  difficulty: 'easy' | 'medium' | 'hard';
  unit?: string;
}

export async function generateExercises(
  images: Array<{ base64: string; mimeType: ValidMime }>,
  count: number = 10,
  previousQuestions: string[] = []
): Promise<GeneratedQuestion[]> {
  const prevNote =
    previousQuestions.length > 0
      ? `\nGenerate NEW questions, different from these already seen: ${previousQuestions.slice(0, 20).join('; ')}`
      : '';

  const userPrompt = `Look at this textbook page and generate exactly ${count} math exercises based on the content.${prevNote}
Return ONLY this JSON format, nothing else:
[
  {
    "question": "5 + 3 = ?",
    "answer": 8,
    "type": "addition",
    "difficulty": "easy",
    "unit": ""
  }
]
For word problems, set "unit" to the appropriate unit (e.g. "kg", "km", "cai", "m"). For numeric problems, set "unit" to "".`;

  const content: Anthropic.MessageParam['content'] = [
    ...images.map(
      (img): Anthropic.ImageBlockParam => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType,
          data: img.base64,
        },
      })
    ),
    { type: 'text', text: userPrompt },
  ];

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system:
      'You are a math teacher for Vietnamese primary school students (ages 6-11). Analyze the uploaded textbook image and generate math exercises. Always respond in Vietnamese. Return ONLY a valid JSON array, no explanation, no markdown.',
    messages: [{ role: 'user', content }],
  });

  const raw = response.content[0];
  if (raw.type !== 'text') throw new Error('Unexpected response type from Claude');

  const cleaned = raw.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned) as GeneratedQuestion[];
}

export async function generateSkip(
  originalQuestion: string,
  type: string,
  difficulty: string
): Promise<GeneratedQuestion> {
  const prompt = `Generate 1 similar math question to: "${originalQuestion}". Same type (${type}), same difficulty (${difficulty}). Vietnamese. Return ONLY JSON:
{ "question": "...", "answer": 0, "type": "${type}", "difficulty": "${difficulty}", "unit": "" }`;

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0];
  if (raw.type !== 'text') throw new Error('Unexpected response type from Claude');

  const cleaned = raw.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned) as GeneratedQuestion;
}
