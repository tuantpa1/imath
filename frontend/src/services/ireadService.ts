import { api } from './apiService';

export interface Story {
  id: number;
  title: string;
  language: 'vi' | 'en';
  level: string;
  cover_image_url: string | null;
  created_by: number;
  created_at: string;
  is_active: number;
  total_pages: number;
  question_count?: number;
  assigned_count?: number;
  assignedStudentIds?: number[];
  pages?: StoryPage[];
}

export interface StoryPage {
  id: number;
  story_id: number;
  page_number: number;
  image_url: string;
  extracted_text: string | null;
  ocr_status: 'pending' | 'processing' | 'done' | 'failed';
  created_at: string;
}

export interface ReadingQuestion {
  id: number;
  story_id: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'a' | 'b' | 'c' | 'd';
  explanation: string;
  created_at: string;
}

export interface BookshelfEntry extends Story {
  status: 'not_started' | 'reading' | 'completed';
  current_page: number;
  score: number | null;
  correct_answers: number | null;
  total_questions: number | null;
  completed_at: string | null;
}

export interface ReadingSession {
  id: number;
  story_id: number;
  student_id: number;
  status: 'not_started' | 'reading' | 'quiz' | 'completed';
  current_page: number;
  score: number;
  total_questions: number;
  correct_answers: number;
  started_at: string | null;
  completed_at: string | null;
}

export const ireadService = {
  createStory: (data: { title: string; language: string; level: string; cover_image_url?: string }) =>
    api.post<Story>('/api/iread/stories', data),

  createStoryWithPages: (
    data: { title: string; language: string; level: string },
    images: Array<{ file: File; isDoublePage: boolean }>
  ) => {
    const form = new FormData();
    form.append('title', data.title);
    form.append('language', data.language);
    form.append('level', data.level);
    for (const img of images) {
      form.append('images', img.file);
      form.append('doublePageFlag', img.isDoublePage ? 'true' : 'false');
    }
    return api.post<{ story: Story; pages: StoryPage[]; questions: ReadingQuestion[] }>(
      '/api/iread/stories/create-with-pages',
      form
    );
  },

  deleteStory: (storyId: number) =>
    api.delete(`/api/iread/stories/${storyId}`),

  uploadPage: (storyId: number, imageFile: File, pageNumber: number) => {
    const form = new FormData();
    form.append('image', imageFile);
    form.append('page_number', pageNumber.toString());
    return api.post<StoryPage>(`/api/iread/stories/${storyId}/pages`, form);
  },

  generateQuestions: (storyId: number) =>
    api.post<ReadingQuestion[]>(`/api/iread/stories/${storyId}/generate-questions`),

  getQuestions: (storyId: number) =>
    api.get<ReadingQuestion[]>(`/api/iread/stories/${storyId}/questions`),

  deleteQuestion: (questionId: number) =>
    api.delete(`/api/iread/questions/${questionId}`),

  assignStory: (storyId: number, studentIds: number[]) =>
    api.post<{ ok: boolean; assigned: number }>(`/api/iread/stories/${storyId}/assign`, { studentIds }),

  getMyStories: () =>
    api.get<Story[]>('/api/iread/stories'),

  getBookshelf: () =>
    api.get<BookshelfEntry[]>('/api/iread/bookshelf'),

  getStoryPages: (storyId: number) =>
    api.get<StoryPage[]>(`/api/iread/stories/${storyId}/pages`),

  startSession: (storyId: number) =>
    api.post<ReadingSession>('/api/iread/sessions', { story_id: storyId }),

  updateSession: (sessionId: number, data: Partial<Pick<ReadingSession, 'current_page' | 'status' | 'score' | 'correct_answers' | 'total_questions'>>) =>
    api.patch<ReadingSession>(`/api/iread/sessions/${sessionId}`, data),
};
