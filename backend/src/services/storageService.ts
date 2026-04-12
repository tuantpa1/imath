import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(__dirname, '../../../data');

const PATHS = {
  scores: path.join(DATA_DIR, 'scores.json'),
  exercises: path.join(DATA_DIR, 'exercises.json'),
  rewards: path.join(DATA_DIR, 'rewards.json'),
};

// --- Types ---

export interface ScoreHistory {
  date: string;
  earned: number;
  activity: string;
}

export interface ScoreRedeemed {
  date: string;
  points: number;
  amount: number;
}

export interface WrongQuestion {
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  date: string;
}

export interface Scores {
  totalPoints: number;
  history: ScoreHistory[];
  redeemed: ScoreRedeemed[];
  wrongQuestions: WrongQuestion[];
  moduleBreakdown?: { imath: number; iread: number };
}

export interface AnswerPart {
  label: string;
  answer: number;
  unit: string;
}

export interface SingleAnswerQuestion {
  id: string;
  question: string;
  type: string;
  difficulty: 'easy' | 'medium' | 'hard';
  answer: number;
  answer_text?: string;  // comparison questions: "<", ">", "="
  unit: string;
}

export interface FractionQuestion {
  id: string;
  question: string;
  type: 'fraction';
  difficulty: 'easy' | 'medium' | 'hard';
  answer_text: string;   // e.g. "3/5"
  unit: string;
}

export interface MultiAnswerQuestion {
  id: string;
  question: string;
  type: 'multi_answer';
  difficulty: 'easy' | 'medium' | 'hard';
  order_matters: boolean;
  answers: AnswerPart[];
  unit?: string;
}

export interface MultipleChoiceQuestion {
  id: string;
  question: string;
  type: 'multiple_choice';
  difficulty: 'easy' | 'medium' | 'hard';
  choices: { options: string[]; correct_index: number };
  unit?: string;
}

export type Question = SingleAnswerQuestion | FractionQuestion | MultiAnswerQuestion | MultipleChoiceQuestion;

export interface Session {
  id: string;
  createdAt: string;
  imagePaths?: string[];
  completed?: boolean;
  isExtra?: boolean;
  questions: Question[];
}

export interface Exercises {
  sessions: Session[];
}

export interface Rewards {
  rate: number;
  currency: string;
  rewardPerPoint: number;
}

// --- Helpers ---

function readJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

function writeJson<T>(filePath: string, data: T): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// --- Public API ---

export function readScores(): Scores {
  return readJson<Scores>(PATHS.scores);
}

export function writeScores(data: Scores): void {
  writeJson(PATHS.scores, data);
}

export function readExercises(): Exercises {
  return readJson<Exercises>(PATHS.exercises);
}

export function writeExercises(data: Exercises): void {
  writeJson(PATHS.exercises, data);
}

export function readRewards(): Rewards {
  return readJson<Rewards>(PATHS.rewards);
}

export function writeRewards(data: Rewards): void {
  writeJson(PATHS.rewards, data);
}
