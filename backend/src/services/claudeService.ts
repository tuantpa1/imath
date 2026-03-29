import Anthropic from '@anthropic-ai/sdk';

// Lazy client — instantiated on first call so .env is always loaded first
let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export type ValidMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface AnswerPart {
  label: string;
  answer: number;
  unit: string;
}

export interface GeneratedQuestion {
  question: string;
  answer?: number;
  answer_text?: string;      // fraction questions: "3/5" stored as string
  answers?: AnswerPart[];
  order_matters?: boolean;
  type: string;
  difficulty: 'easy' | 'medium' | 'hard';
  unit?: string;
}

export interface GenerateResult {
  questions: GeneratedQuestion[];
  usage: { input_tokens: number; output_tokens: number };
}

// ── Post-processing: merge split "find two numbers" pairs ─────────────────────

// Labels that indicate a single-answer question is really one part of a pair
const SPLIT_LABEL_MAP: Array<{ keywords: string[]; label: string }> = [
  { keywords: ['số lớn'], label: 'Số lớn' },
  { keywords: ['số bé'],  label: 'Số bé'  },
  { keywords: ['số thứ nhất', 'số hạng thứ nhất'], label: 'Số thứ nhất' },
  { keywords: ['số thứ hai',  'số hạng thứ hai'],  label: 'Số thứ hai'  },
];

function getSplitLabel(text: string): string | null {
  const lower = text.toLowerCase();
  for (const { keywords, label } of SPLIT_LABEL_MAP) {
    if (keywords.some((kw) => lower.includes(kw))) return label;
  }
  return null;
}

function extractNumbers(text: string): Set<number> {
  const matches = text.match(/\d+/g);
  return new Set(matches ? matches.map(Number) : []);
}

function shareSignificantNumbers(a: string, b: string): boolean {
  const numsA = extractNumbers(a);
  const numsB = extractNumbers(b);
  let shared = 0;
  for (const n of numsA) {
    if (numsB.has(n)) shared++;
  }
  return shared >= 2;
}

function cleanQuestionText(text: string): string {
  return text
    .replace(/[.,]?\s*(tìm\s+)?(số lớn|số bé|số thứ nhất|số thứ hai|số hạng thứ nhất|số hạng thứ hai)[^.?!]*[.?!]?\s*$/i, '')
    .trim()
    .replace(/[,.]$/, '')
    .trim();
}

function mergeRelatedQuestions(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  const result: GeneratedQuestion[] = [];
  let i = 0;

  while (i < questions.length) {
    const q = questions[i];

    // Only attempt merge on consecutive single-answer questions
    if (q.type === 'multi_answer' || q.answer === undefined || i + 1 >= questions.length) {
      result.push(q);
      i++;
      continue;
    }

    const label1 = getSplitLabel(q.question);
    const next = questions[i + 1];

    if (
      label1 !== null &&
      next.type !== 'multi_answer' &&
      next.answer !== undefined &&
      shareSignificantNumbers(q.question, next.question)
    ) {
      const label2 = getSplitLabel(next.question);
      if (label2 !== null && label2 !== label1) {
        const cleaned = cleanQuestionText(q.question);
        const mergedQuestion = cleaned
          ? cleaned + '. Tìm hai số đó.'
          : q.question;

        const merged: GeneratedQuestion = {
          question: mergedQuestion,
          type: 'multi_answer',
          order_matters: true,
          difficulty: q.difficulty,
          answers: [
            { label: label1, answer: q.answer,        unit: q.unit    ?? '' },
            { label: label2, answer: next.answer ?? 0, unit: next.unit ?? '' },
          ],
        };

        result.push(merged);
        i += 2;
        continue;
      }
    }

    result.push(q);
    i++;
  }

  return result;
}

// ── Exercise generation ───────────────────────────────────────────────────────

export async function generateExercises(
  images: Array<{ base64: string; mimeType: ValidMime }>,
  count: number = 10,
  previousQuestions: string[] = []
): Promise<GenerateResult> {
  const prevNote =
    previousQuestions.length > 0
      ? `\nGenerate NEW questions, different from these already seen: ${previousQuestions.slice(0, 20).join('; ')}`
      : '';

  const userPrompt = `Look at this textbook page and generate exactly ${count} math exercises based on the content.${prevNote}
Return ONLY a valid JSON array, nothing else. Each item uses ONE of these formats:

Single answer (numeric):
{ "question": "5 + 3 = ?", "answer": 8, "type": "addition", "difficulty": "easy", "unit": "" }

Fraction answer (answer is a fraction string, NOT a decimal):
{ "question": "Rút gọn phân số 15/25", "answer_text": "3/5", "type": "fraction", "difficulty": "medium", "unit": "" }
{ "question": "Tính 1/2 + 1/4 = ?", "answer_text": "3/4", "type": "fraction", "difficulty": "medium", "unit": "" }

Multi-answer ordered (e.g. perimeter AND area):
{ "question": "Tinh chu vi va dien tich hinh chu nhat...", "type": "multi_answer", "order_matters": true, "difficulty": "medium", "answers": [{ "label": "Chu vi", "answer": 26, "unit": "cm" }, { "label": "Dien tich", "answer": 40, "unit": "cm2" }] }

Multi-answer with specific labels (e.g. find bigger/smaller number):
{ "question": "Tong 2 so la 15, hieu la 3. Tim 2 so do.", "type": "multi_answer", "order_matters": true, "difficulty": "medium", "answers": [{ "label": "So lon", "answer": 9, "unit": "" }, { "label": "So be", "answer": 6, "unit": "" }] }

Multi-answer with generic labels (e.g. 2 interchangeable numbers, no bigger/smaller constraint):
{ "question": "Tim 2 so co tong bang 10.", "type": "multi_answer", "order_matters": false, "difficulty": "medium", "answers": [{ "label": "So thu nhat", "answer": 5, "unit": "" }, { "label": "So thu hai", "answer": 5, "unit": "" }] }

For word problems requiring multiple distinct calculations, use multi_answer. For single calculations, use single answer format.
For fraction questions (rút gọn, tính phân số, so sánh phân số, điền phân số), use type "fraction" with "answer_text" as a string like "3/5".
For word problems with a unit, set "unit" to the appropriate unit (e.g. "kg", "km", "cai", "m").`;

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

  const systemPrompt = `You are a math teacher for Vietnamese primary school students (ages 6-11). Analyze the uploaded textbook image and generate math exercises. Always respond in Vietnamese. Return ONLY a valid JSON array, no explanation, no markdown.

RULE — Use multi_answer for any question requiring more than one number:
- "Tìm hai số..." / "Tìm các số..." / "...là những số nào?" / "Tìm số..."
- "Tính ... và ..." (e.g. tính chu vi VÀ diện tích)

CRITICAL RULE — Combining "find two numbers" problems:
When a math problem asks to find TWO numbers (tìm hai số, tìm số lớn và số bé, etc.), ALWAYS combine into ONE multi_answer question. NEVER split into 2 separate questions.

WRONG — never do this:
{ "question": "Tổng 16, hiệu 2. Số lớn là bao nhiêu?", "answer": 9, "type": "addition" }
{ "question": "Tổng 16, hiệu 2. Số bé là bao nhiêu?", "answer": 7, "type": "addition" }

CORRECT — always combine (Số lớn / Số bé → order_matters: true):
{ "question": "Tổng của hai số là 16, hiệu của hai số đó là 2. Tìm hai số đó.", "type": "multi_answer", "order_matters": true, "difficulty": "medium", "answers": [{ "label": "Số lớn", "answer": 9, "unit": "" }, { "label": "Số bé", "answer": 7, "unit": "" }] }

CORRECT (find two numbers with sum+difference — order_matters: true because labels are specific):
{ "question": "Có hai số, tổng là 22 và hiệu là 10. Hai số đó là những số nào?", "type": "multi_answer", "order_matters": true, "difficulty": "medium", "answers": [{ "label": "Số lớn", "answer": 16, "unit": "" }, { "label": "Số bé", "answer": 6, "unit": "" }] }

CORRECT (perimeter AND area — order_matters: true):
{ "question": "Tính chu vi và diện tích hình chữ nhật dài 8cm, rộng 5cm", "type": "multi_answer", "order_matters": true, "difficulty": "medium", "answers": [{ "label": "Chu vi", "answer": 26, "unit": "cm" }, { "label": "Diện tích", "answer": 40, "unit": "cm²" }] }

Patterns that MUST become multi_answer (never split):
- "Tìm hai số..."
- "Tổng của hai số là X, hiệu là Y..."
- "Hai số có tổng... và hiệu..."
- "Số lớn và số bé..."
- Any problem where finding one number requires knowing the other

order_matters: TRUE when answers have specific labels (student must fill correct value in correct box):
- "Số lớn" / "Số bé" → larger number must go in "Số lớn", smaller in "Số bé"
- "Chu vi" / "Diện tích" → each has a specific formula result
- "Chiều dài" / "Chiều rộng"
- Any labeled answers where the label implies a specific value

order_matters: FALSE only when labels are generic AND problem has no bigger/smaller constraint:
- Labels like "Số thứ nhất" / "Số thứ hai" with fully interchangeable values

For "Tổng X, hiệu Y, tìm hai số" problems: ALWAYS order_matters: true with labels "Số lớn" and "Số bé".
For single-answer questions, keep the existing format with the "answer" field.

FRACTION RULE — Use type "fraction" when the answer is a fraction:
- "Rút gọn phân số X/Y" → type: "fraction", answer_text: "a/b" (reduced form)
- "Tính X/Y + A/B" → type: "fraction", answer_text: "result as fraction"
- "Điền phân số thích hợp" → type: "fraction", answer_text: "a/b"
- "Viết phân số..." → type: "fraction", answer_text: "a/b"
- NEVER store a fraction answer as a decimal in the "answer" field
- answer_text MUST be in the format "numerator/denominator" (e.g. "3/5", "7/8", "1/2")`;

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
  });

  const raw = response.content[0];
  if (raw.type !== 'text') throw new Error('Unexpected response type from Claude');

  const cleaned = raw.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const questions = JSON.parse(cleaned) as GeneratedQuestion[];

  return {
    questions: mergeRelatedQuestions(questions),
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}

// ── Skip question generation ──────────────────────────────────────────────────

export interface SkipResult {
  question: GeneratedQuestion;
  usage: { input_tokens: number; output_tokens: number };
}

export async function generateSkip(
  originalQuestion: string,
  type: string,
  difficulty: string,
  isMultiAnswer: boolean = false,
  orderMatters: boolean = true,
  answersCount: number = 2
): Promise<SkipResult> {
  let prompt: string;

  if (isMultiAnswer) {
    const answersTemplate = Array.from(
      { length: answersCount },
      (_, i) => `{ "label": "Phan ${i + 1}", "answer": 0, "unit": "" }`
    ).join(', ');
    prompt = `Generate 1 similar multi-answer math question to: "${originalQuestion}".
Same difficulty (${difficulty}), same number of answer parts (${answersCount}), order_matters: ${orderMatters}. Vietnamese.
Return ONLY JSON:
{ "question": "...", "type": "multi_answer", "order_matters": ${orderMatters}, "difficulty": "${difficulty}", "answers": [${answersTemplate}] }`;
  } else if (type === 'fraction') {
    prompt = `Generate 1 similar fraction math question to: "${originalQuestion}". Same difficulty (${difficulty}). Vietnamese.
The answer must be a fraction string like "3/5". Return ONLY JSON:
{ "question": "...", "answer_text": "a/b", "type": "fraction", "difficulty": "${difficulty}", "unit": "" }`;
  } else {
    prompt = `Generate 1 similar math question to: "${originalQuestion}". Same type (${type}), same difficulty (${difficulty}). Vietnamese. Return ONLY JSON:
{ "question": "...", "answer": 0, "type": "${type}", "difficulty": "${difficulty}", "unit": "" }`;
  }

  const response = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0];
  if (raw.type !== 'text') throw new Error('Unexpected response type from Claude');

  const cleaned = raw.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  return {
    question: JSON.parse(cleaned) as GeneratedQuestion,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}
