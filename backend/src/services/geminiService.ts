import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeneratedQuestion, GenerateResult, SkipResult, ValidMime } from './claudeService';
import { mergeRelatedQuestionsExport } from './claudeService';

// Re-created on every call so PM2 env vars are always read fresh
function getModel() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
}

function cleanJson(text: string): string {
  return text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
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

  const systemPrompt = `You are a math teacher for Vietnamese primary school students (ages 6-11). Analyze the uploaded textbook image and generate math exercises. Always respond in Vietnamese. Return ONLY a valid JSON array, no explanation, no markdown.

CRITICAL — SELF-CONTAINED QUESTIONS ONLY: Students cannot see the textbook image. Every question MUST contain all necessary information inline. NEVER reference figures, images, tables, or diagrams (e.g. "Hình 1", "Hình 2", "bảng sau", "hình vẽ", "hình bên"). Instead, extract the relevant numbers/data FROM the image and embed them directly in the question text.
WRONG: "Dựa vào Hình 1 (có 3/4 phần tô màu) và Hình 2..." → this references a figure the student cannot see
CORRECT: "So sánh 3/4 và 7/12. Điền dấu thích hợp (<, >, =)." → all info is in the question text

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
- answer_text MUST be in the format "numerator/denominator" (e.g. "3/5", "7/8", "1/2")

MULTIPLE CHOICE RULE — Use type "multiple_choice" for ANY question that CANNOT be answered with a number, fraction, or comparison symbol (<, >, =):
- Sorting/ordering: "Sắp xếp các phân số từ bé đến lớn: 1/2, 3/4, 5/8" → multiple_choice with all permutations as options
- True/False: "3/4 > 1/2. Đúng hay sai?" → multiple_choice with ["Đúng", "Sai"]
- Name-based answers: "Ai đọc sách ít thời gian nhất?" → multiple_choice with name options
- Select the right item: "Phân số nào lớn hơn 1?" → multiple_choice
- Any question where the answer is not a pure number, fraction a/b, or symbol
Format: { "question": "...", "type": "multiple_choice", "difficulty": "...", "choices": { "options": ["opt1", "opt2", "opt3", "opt4"], "correct_index": N } }
Rules: Always 3–4 options. correct_index is 0-based. Wrong options must be plausible. Randomize the correct option's position — do NOT always put it at index 0.

TYPE SELECTION PRIORITY (in order):
1. Answer is a single number → single_answer (with "answer" field)
2. Answer is a fraction a/b → fraction (with "answer_text" field)
3. Answer requires multiple numbers/fractions → multi_answer
4. Answer is a comparison symbol (<, >, =) → type: "comparison", answer: null, answer_text: "<" or ">" or "=" (NEVER answer: 0)
5. EVERYTHING ELSE → multiple_choice`;

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
For word problems with a unit, set "unit" to the appropriate unit (e.g. "kg", "km", "cai", "m").

Comparison symbol (điền dấu <, >, =): QUAN TRỌNG — answer phải là null, answer_text phải là "<" hoặc ">" hoặc "=":
{ "question": "So sánh hai phân số: 2/5 và 3/5. Điền dấu thích hợp (<, >, =).", "type": "comparison", "difficulty": "easy", "answer": null, "answer_text": "<" }
{ "question": "3/4 ... 1/2 (điền dấu)", "type": "comparison", "difficulty": "easy", "answer": null, "answer_text": ">" }
KHÔNG được đặt answer: 0 cho câu so sánh. answer_text BẮT BUỘC là "<", ">", hoặc "=".

Multiple choice (for sorting/ordering, true/false, name answers, or any question that CANNOT be answered with a number, fraction, or symbol):
{ "question": "Sắp xếp các phân số sau từ bé đến lớn: 1/2, 3/4, 5/8", "type": "multiple_choice", "difficulty": "medium", "choices": { "options": ["1/2, 5/8, 3/4", "3/4, 5/8, 1/2", "5/8, 1/2, 3/4", "1/2, 3/4, 5/8"], "correct_index": 0 } }
{ "question": "3/4 > 1/2. Đúng hay sai?", "type": "multiple_choice", "difficulty": "easy", "choices": { "options": ["Đúng", "Sai"], "correct_index": 0 } }`;

  const imageParts = images.map((img) => ({
    inlineData: { data: img.base64, mimeType: img.mimeType },
  }));

  const result = await getModel().generateContent([
    systemPrompt + '\n\n' + userPrompt,
    ...imageParts,
  ]);

  const text = cleanJson(result.response.text());
  const questions = JSON.parse(text) as GeneratedQuestion[];
  const meta = result.response.usageMetadata;

  return {
    questions: mergeRelatedQuestionsExport(questions),
    usage: {
      input_tokens: meta?.promptTokenCount ?? 0,
      output_tokens: meta?.candidatesTokenCount ?? 0,
    },
  };
}

// ── Skip question generation ──────────────────────────────────────────────────

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
  } else if (type === 'multiple_choice') {
    prompt = `Generate 1 similar multiple-choice math question to: "${originalQuestion}". Same difficulty (${difficulty}). Vietnamese.
Provide 3–4 plausible options. Return ONLY JSON:
{ "question": "...", "type": "multiple_choice", "difficulty": "${difficulty}", "choices": { "options": ["opt1", "opt2", "opt3"], "correct_index": 0 } }`;
  } else {
    prompt = `Generate 1 similar math question to: "${originalQuestion}". Same type (${type}), same difficulty (${difficulty}). Vietnamese. Return ONLY JSON:
{ "question": "...", "answer": 0, "type": "${type}", "difficulty": "${difficulty}", "unit": "" }`;
  }

  const result = await getModel().generateContent(prompt);
  const text = cleanJson(result.response.text());
  const meta = result.response.usageMetadata;

  return {
    question: JSON.parse(text) as GeneratedQuestion,
    usage: {
      input_tokens: meta?.promptTokenCount ?? 0,
      output_tokens: meta?.candidatesTokenCount ?? 0,
    },
  };
}
