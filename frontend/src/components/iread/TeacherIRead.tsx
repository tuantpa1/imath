import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/apiService';
import { ireadService } from '../../services/ireadService';
import type { Story, ReadingQuestion } from '../../services/ireadService';

interface Student {
  id: number;
  display_name: string;
  username: string;
}

type SubTab = 'library' | 'add';
type AddStep = 1 | 2 | 3 | 4;

const OPTS = ['a', 'b', 'c', 'd'] as const;

function optionKey(opt: typeof OPTS[number]): keyof ReadingQuestion {
  return `option_${opt}` as keyof ReadingQuestion;
}

// ── Library tab ───────────────────────────────────────────────────────────────

function LibraryTab() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [questionsMap, setQuestionsMap] = useState<Record<number, ReadingQuestion[]>>({});

  useEffect(() => {
    ireadService.getMyStories()
      .then(setStories)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggleExpand(storyId: number) {
    if (expandedId === storyId) { setExpandedId(null); return; }
    setExpandedId(storyId);
    if (!questionsMap[storyId]) {
      const qs = await ireadService.getQuestions(storyId).catch(() => []);
      setQuestionsMap((prev) => ({ ...prev, [storyId]: qs }));
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><span className="text-4xl animate-spin">⭐</span></div>;
  }

  if (stories.length === 0) {
    return (
      <div className="bg-white/10 rounded-3xl p-8 text-center">
        <div className="text-4xl mb-2">📚</div>
        <p className="text-white font-bold">Chưa có truyện nào</p>
        <p className="text-white/50 text-sm mt-1">Nhấn "Thêm sách" để bắt đầu</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {stories.map((s) => (
        <div key={s.id} className="bg-white rounded-3xl shadow-xl overflow-hidden border border-emerald-100">
          <div className="p-4 flex items-start gap-3">
            <div className="text-4xl shrink-0">📖</div>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-gray-800 text-sm leading-tight">{s.title}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.language === 'vi' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                  {s.language === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 English'}
                </span>
                <span className="text-xs text-gray-400">📄 {s.total_pages} trang</span>
                <span className="text-xs text-gray-400">❓ {s.question_count ?? 0} câu</span>
                <span className="text-xs text-gray-400">👦 {s.assigned_count ?? 0} HS</span>
              </div>
            </div>
            <button
              onClick={() => { void toggleExpand(s.id); }}
              className="btn-scale shrink-0 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs px-3 py-1.5 rounded-xl"
            >
              {expandedId === s.id ? '▲ Đóng' : '👁️ Xem'}
            </button>
          </div>

          {expandedId === s.id && (
            <div className="border-t border-emerald-100 px-4 pb-4 pt-3">
              {!questionsMap[s.id] ? (
                <div className="text-center py-4"><span className="animate-spin text-2xl inline-block">⭐</span></div>
              ) : questionsMap[s.id].length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-3">Chưa có câu hỏi nào</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {questionsMap[s.id].map((q, qi) => (
                    <div key={q.id} className="bg-emerald-50 rounded-2xl p-3 border border-emerald-100">
                      <p className="font-bold text-gray-800 text-sm mb-2">{qi + 1}. {q.question_text}</p>
                      {OPTS.map((opt) => (
                        <div
                          key={opt}
                          className={`flex items-start gap-2 text-xs py-1.5 px-2.5 rounded-xl mb-1 border ${
                            q.correct_option === opt
                              ? 'bg-emerald-100 border-emerald-400 font-extrabold text-emerald-700'
                              : 'bg-white border-gray-100 text-gray-600'
                          }`}
                        >
                          <span className="font-extrabold shrink-0">{opt.toUpperCase()}.</span>
                          <span className="flex-1">{q[optionKey(opt)] as string}</span>
                          {q.correct_option === opt && <span className="shrink-0">✅</span>}
                        </div>
                      ))}
                      {q.explanation && (
                        <p className="text-xs text-emerald-600 italic mt-1.5 pl-1">💡 {q.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Add book wizard ───────────────────────────────────────────────────────────

function AddBookWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<AddStep>(1);

  // Step 1
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');
  const [level, setLevel] = useState('elementary');

  // Step 2
  const [createdStoryId, setCreatedStoryId] = useState<number | null>(null);
  const [pages, setPages] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processMsg, setProcessMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Step 3
  const [questions, setQuestions] = useState<ReadingQuestion[]>([]);

  // Step 4
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (step === 4 && students.length === 0) {
      api.get<{ students: Student[] }>('/api/teacher/students')
        .then((d) => setStudents(d.students))
        .catch(() => {});
    }
  }, [step, students.length]);

  // ── Step 1 ──

  async function handleStep1() {
    if (!title.trim()) return;
    try {
      const story = await ireadService.createStory({ title: title.trim(), language, level });
      setCreatedStoryId(story.id);
      setStep(2);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi tạo truyện');
    }
  }

  // ── Step 2 ──

  function addFiles(files: FileList | null) {
    if (!files) return;
    setPages((prev) => [...prev, ...Array.from(files)]);
  }

  function removePage(idx: number) {
    setPages((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleDragStart(idx: number) { dragItem.current = idx; }
  function handleDragEnter(idx: number) { dragOverItem.current = idx; }
  function handleDragEnd() {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) return;
    setPages((prev) => {
      const copy = [...prev];
      const [dragged] = copy.splice(dragItem.current!, 1);
      copy.splice(dragOverItem.current!, 0, dragged);
      return copy;
    });
    dragItem.current = null;
    dragOverItem.current = null;
  }

  async function handleProcessPages() {
    if (!createdStoryId || pages.length === 0) return;
    setProcessing(true);
    try {
      for (let i = 0; i < pages.length; i++) {
        setProcessMsg(`Đang đọc trang ${i + 1}/${pages.length}...`);
        await ireadService.uploadPage(createdStoryId, pages[i], i + 1);
      }
      setProcessMsg('Đang tạo câu hỏi...');
      const qs = await ireadService.generateQuestions(createdStoryId);
      setQuestions(qs);
      setStep(3);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi xử lý trang sách');
    }
    setProcessing(false);
  }

  // ── Step 3 ──

  async function handleDeleteQuestion(id: number) {
    await ireadService.deleteQuestion(id).catch(() => {});
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  // ── Step 4 ──

  function toggleStudent(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleAssign() {
    if (!createdStoryId || selectedIds.size === 0) return;
    setAssigning(true);
    try {
      await ireadService.assignStory(createdStoryId, Array.from(selectedIds));
      setDone(true);
      setTimeout(onDone, 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi giao bài');
    }
    setAssigning(false);
  }

  // ── Progress bar ──

  const stepLabels = ['Thông tin', 'Upload', 'Câu hỏi', 'Giao bài'];

  return (
    <div className="flex flex-col gap-4">
      {/* Step indicator */}
      <div className="bg-white/10 rounded-2xl p-3 flex items-center gap-1">
        {stepLabels.map((label, i) => {
          const s = i + 1;
          const active = s === step;
          const done_ = s < step;
          return (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold border-2 transition-all ${
                done_ ? 'bg-emerald-400 border-emerald-400 text-white'
                : active ? 'bg-white border-white text-emerald-700'
                : 'bg-transparent border-white/30 text-white/40'
              }`}>
                {done_ ? '✓' : s}
              </div>
              <span className={`text-xs font-bold ${active ? 'text-white' : 'text-white/40'}`}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Book info ── */}
      {step === 1 && (
        <div className="bg-white rounded-3xl shadow-xl p-5 border border-emerald-100">
          <h3 className="font-extrabold text-emerald-700 text-base mb-4">📋 Thông tin sách</h3>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-bold text-gray-600 mb-1.5 block">Tên sách *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Dế Mèn Phiêu Lưu Ký..."
                className="input-glow w-full text-base font-bold border-2 border-emerald-200 rounded-2xl py-3 px-4 focus:border-emerald-500 transition-all"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-gray-600 mb-2 block">Ngôn ngữ</label>
              <div className="flex gap-3">
                {(['vi', 'en'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={`btn-scale flex-1 py-3 rounded-2xl font-bold text-sm border-2 transition-all ${
                      language === lang
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'
                    }`}
                  >
                    {lang === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 Tiếng Anh'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-bold text-gray-600 mb-1.5 block">Cấp độ</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="input-glow w-full text-base font-bold border-2 border-emerald-200 rounded-2xl py-3 px-4 focus:border-emerald-500 bg-white transition-all"
              >
                <option value="elementary">Tiểu học (lớp 1–5)</option>
                <option value="middle">Cấp 2 (lớp 6–9)</option>
              </select>
            </div>

            <button
              onClick={() => { void handleStep1(); }}
              disabled={!title.trim()}
              className="btn-scale w-full py-3.5 rounded-3xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-extrabold text-base shadow-lg transition-all"
            >
              Tiếp theo →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Upload pages ── */}
      {step === 2 && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-3xl shadow-xl p-5 border border-emerald-100">
            <h3 className="font-extrabold text-emerald-700 text-base mb-1">📷 Upload trang sách</h3>
            <p className="text-xs text-gray-400 mb-4">Kéo thả để sắp xếp lại thứ tự trang</p>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-emerald-300 rounded-2xl p-6 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50 transition-all"
            >
              <span className="text-3xl block mb-2">📸</span>
              <p className="font-bold text-gray-600 text-sm">Click hoặc kéo ảnh vào đây</p>
              <p className="text-xs text-gray-400 mt-1">Chọn nhiều ảnh cùng lúc (JPG, PNG, WebP)</p>
            </div>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              💡 <span className="font-semibold">Mẹo:</span> Nên chụp từng trang riêng lẻ để OCR chính xác hơn. Nếu chụp 2 trang (sách mở), chỉ trang bên <span className="font-semibold">TRÁI</span> sẽ được nhận.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {pages.length > 0 && (
            <div className="flex flex-col gap-2">
              {pages.map((file, idx) => (
                <div
                  key={idx}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragEnter={() => handleDragEnter(idx)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className="bg-white rounded-2xl shadow border border-emerald-100 p-3 flex items-center gap-3 cursor-grab active:cursor-grabbing select-none"
                >
                  <span className="text-gray-300 text-lg shrink-0">⠿</span>
                  <img
                    src={URL.createObjectURL(file)}
                    alt={`Trang ${idx + 1}`}
                    className="w-12 h-14 object-cover rounded-xl border border-gray-100 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-800 text-sm">Trang {idx + 1}</p>
                    <p className="text-xs text-gray-400 truncate">{file.name}</p>
                  </div>
                  <button
                    onClick={() => removePage(idx)}
                    className="btn-scale text-rose-400 hover:text-rose-600 shrink-0 text-lg leading-none"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {processing && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
              <span className="text-2xl animate-spin inline-block mb-2">⭐</span>
              <p className="font-bold text-emerald-700 text-sm">{processMsg}</p>
            </div>
          )}

          <button
            onClick={() => { void handleProcessPages(); }}
            disabled={pages.length === 0 || processing}
            className="btn-scale w-full py-3.5 rounded-3xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-extrabold text-base shadow-lg transition-all"
          >
            {processing ? '⏳ Đang xử lý...' : '🤖 Xử lý OCR & Tạo câu hỏi'}
          </button>
        </div>
      )}

      {/* ── Step 3: Preview questions ── */}
      {step === 3 && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-3xl shadow-xl p-5 border border-emerald-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-emerald-700 text-base">✅ Câu hỏi được tạo</h3>
              <span className="text-sm font-bold text-gray-400">{questions.length} câu</span>
            </div>

            {questions.length === 0 ? (
              <p className="text-gray-400 text-center py-6">Không có câu hỏi nào được tạo</p>
            ) : (
              <div className="flex flex-col gap-4">
                {questions.map((q, qi) => (
                  <div key={q.id} className="border border-emerald-100 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <p className="font-bold text-gray-800 text-sm flex-1">{qi + 1}. {q.question_text}</p>
                      <button
                        onClick={() => { void handleDeleteQuestion(q.id); }}
                        className="btn-scale text-rose-400 hover:text-rose-600 text-lg shrink-0 leading-none"
                        title="Xóa câu hỏi"
                      >
                        🗑️
                      </button>
                    </div>
                    {OPTS.map((opt) => (
                      <div
                        key={opt}
                        className={`flex items-start gap-2 text-xs py-2 px-3 rounded-xl mb-1.5 border ${
                          q.correct_option === opt
                            ? 'bg-emerald-100 border-emerald-400 font-extrabold text-emerald-700'
                            : 'bg-gray-50 border-gray-100 text-gray-600'
                        }`}
                      >
                        <span className="font-extrabold shrink-0 w-4">{opt.toUpperCase()}.</span>
                        <span className="flex-1">{q[optionKey(opt)] as string}</span>
                        {q.correct_option === opt && <span className="shrink-0">✅</span>}
                      </div>
                    ))}
                    {q.explanation && (
                      <p className="text-xs text-emerald-600 italic mt-2 pl-1">💡 {q.explanation}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setStep(4)}
            className="btn-scale w-full py-3.5 rounded-3xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-base shadow-lg transition-all"
          >
            Giao cho học sinh →
          </button>
        </div>
      )}

      {/* ── Step 4: Assign ── */}
      {step === 4 && (
        <div className="flex flex-col gap-3">
          {done ? (
            <div className="bg-white rounded-3xl shadow-xl p-8 text-center border border-emerald-100">
              <div className="text-5xl mb-3 animate-bounce-in">🎉</div>
              <p className="font-extrabold text-emerald-600 text-lg">Giao sách thành công!</p>
              <p className="text-sm text-gray-500 mt-1">Đang chuyển về thư viện...</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl shadow-xl p-5 border border-emerald-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-extrabold text-emerald-700 text-base">👦 Chọn học sinh</h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedIds(new Set(students.map((s) => s.id)))}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-800"
                  >
                    Tất cả
                  </button>
                  <span className="text-gray-200">|</span>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-xs font-bold text-gray-400 hover:text-gray-600"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              {students.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Lớp chưa có học sinh nào</p>
              ) : (
                <div className="flex flex-col gap-1 mb-5">
                  {students.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 cursor-pointer p-3 rounded-2xl hover:bg-emerald-50 transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleStudent(s.id)}
                        className="w-5 h-5 accent-emerald-500 shrink-0"
                      />
                      <span className="font-bold text-gray-800 text-sm">{s.display_name}</span>
                      <span className="text-xs text-gray-400 ml-auto">@{s.username}</span>
                    </label>
                  ))}
                </div>
              )}

              <button
                onClick={() => { void handleAssign(); }}
                disabled={selectedIds.size === 0 || assigning}
                className="btn-scale w-full py-3.5 rounded-3xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-extrabold text-base shadow-lg transition-all"
              >
                {assigning
                  ? '⏳ Đang giao...'
                  : `✅ Giao sách cho ${selectedIds.size} học sinh`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main TeacherIRead ─────────────────────────────────────────────────────────

export default function TeacherIRead() {
  const [subTab, setSubTab] = useState<SubTab>('library');
  const [libKey, setLibKey] = useState(0); // force LibraryTab remount on return from wizard

  function handleWizardDone() {
    setLibKey((k) => k + 1);
    setSubTab('library');
  }

  return (
    <div>
      {/* Sub-tab bar */}
      <div className="flex gap-2 mb-5">
        {(['library', 'add'] as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`btn-scale flex-1 py-2.5 rounded-2xl font-extrabold text-sm transition-all ${
              subTab === t
                ? 'bg-emerald-500 text-white shadow-lg'
                : 'bg-white/15 text-white/80 hover:bg-white/25'
            }`}
          >
            {t === 'library' ? '📖 Thư viện' : '➕ Thêm sách'}
          </button>
        ))}
      </div>

      {subTab === 'library' && <LibraryTab key={libKey} />}
      {subTab === 'add' && <AddBookWizard onDone={handleWizardDone} />}
    </div>
  );
}
