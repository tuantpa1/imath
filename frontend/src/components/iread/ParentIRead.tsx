import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/apiService';
import { ireadService } from '../../services/ireadService';
import type { Story, StoryPage, ReadingQuestion } from '../../services/ireadService';

interface Child {
  id: number;
  username: string;
  display_name: string;
}

interface UploadedImage {
  file: File;
  preview: string;
  isDoublePage: boolean;
}

type SubTab = 'library' | 'add';
type AddStep = 1 | 2 | 3;
type LibTab = 'content' | 'questions' | 'assign';

const OPTS = ['a', 'b', 'c', 'd'] as const;

function optionKey(opt: typeof OPTS[number]): keyof ReadingQuestion {
  return `option_${opt}` as keyof ReadingQuestion;
}

function getBackendUrl(urlPath: string): string {
  const { protocol, hostname, port } = window.location;
  if (!port || port === '443' || port === '80') return `${protocol}//${hostname}${urlPath}`;
  return `${protocol}//${hostname}:3001${urlPath}`;
}

// ── EbookPreview ──────────────────────────────────────────────────────────────

function EbookPreview({ pages }: { pages: StoryPage[] }) {
  const [cur, setCur] = useState(0);
  const page = pages[cur];
  if (!page) return <p className="text-gray-400 text-sm text-center py-4">Không có trang nào</p>;

  return (
    <div style={{ backgroundColor: '#FDF6E3', borderRadius: '16px', padding: '16px', border: '1px solid #d97706' }}>
      <div className="flex items-center justify-between mb-3">
        <button
          disabled={cur === 0}
          onClick={() => setCur((p) => p - 1)}
          className="btn-scale px-3 py-1.5 bg-amber-100 hover:bg-amber-200 disabled:opacity-30 rounded-xl text-xs font-bold text-amber-800"
        >
          ← Trước
        </button>
        <span className="text-xs font-bold text-amber-700">Trang {cur + 1} / {pages.length}</span>
        <button
          disabled={cur === pages.length - 1}
          onClick={() => setCur((p) => p + 1)}
          className="btn-scale px-3 py-1.5 bg-amber-100 hover:bg-amber-200 disabled:opacity-30 rounded-xl text-xs font-bold text-amber-800"
        >
          Sau →
        </button>
      </div>
      {page.extracted_text ? (
        <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '15px', lineHeight: '1.85', color: '#2C1810' }}>
          {page.extracted_text.split('\n').map((para, idx) =>
            para.trim() ? (
              <p key={idx} style={{
                marginBottom: '1em',
                textIndent: (!para.startsWith('\u201c') && !para.startsWith('"') && !para.startsWith('–') && !para.startsWith('-')) ? '1.5em' : '0',
              }}>{para}</p>
            ) : (
              <div key={idx} style={{ height: '0.5em' }} />
            )
          )}
        </div>
      ) : page.image_url ? (
        <img
          src={getBackendUrl(page.image_url)}
          alt={`Trang ${cur + 1}`}
          style={{ width: '100%', borderRadius: '8px' }}
        />
      ) : (
        <p className="text-gray-400 text-sm text-center py-4">Không có nội dung</p>
      )}
    </div>
  );
}

// ── LibraryTab ────────────────────────────────────────────────────────────────

function LibraryTab() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [libTab, setLibTab] = useState<LibTab>('content');
  const [questionsMap, setQuestionsMap] = useState<Record<number, ReadingQuestion[]>>({});
  const [children, setChildren] = useState<Child[]>([]);
  const [childrenLoaded, setChildrenLoaded] = useState(false);
  const [assignSelectedIds, setAssignSelectedIds] = useState<Set<number>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    ireadService.getMyStories()
      .then(setStories)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggleExpand(storyId: number) {
    if (expandedId === storyId) { setExpandedId(null); return; }
    setExpandedId(storyId);
    setLibTab('content');
    setAssignSelectedIds(new Set());
    if (!questionsMap[storyId]) {
      const qs = await ireadService.getQuestions(storyId).catch(() => []);
      setQuestionsMap((prev) => ({ ...prev, [storyId]: qs }));
    }
    if (!childrenLoaded) {
      api.get<Child[]>('/api/parent/children')
        .then((data) => { setChildren(data); setChildrenLoaded(true); })
        .catch(() => {});
    }
  }

  async function handleDeleteQuestion(storyId: number, questionId: number) {
    await ireadService.deleteQuestion(questionId).catch(() => {});
    setQuestionsMap((prev) => ({
      ...prev,
      [storyId]: (prev[storyId] ?? []).filter((q) => q.id !== questionId),
    }));
  }

  function toggleAssignChild(id: number) {
    setAssignSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleAssign(storyId: number) {
    if (assignSelectedIds.size === 0 || assigning) return;
    setAssigning(true);
    try {
      await ireadService.assignStory(storyId, Array.from(assignSelectedIds));
      setStories((prev) => prev.map((s) => {
        if (s.id !== storyId) return s;
        const merged = new Set([...(s.assignedStudentIds ?? []), ...assignSelectedIds]);
        return { ...s, assignedStudentIds: Array.from(merged), assigned_count: merged.size };
      }));
      setAssignSelectedIds(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi giao sách');
    }
    setAssigning(false);
  }

  async function handleDeleteStory(storyId: number) {
    setDeletingId(storyId);
    try {
      await ireadService.deleteStory(storyId);
      setStories((prev) => prev.filter((s) => s.id !== storyId));
      if (expandedId === storyId) setExpandedId(null);
      setConfirmDeleteId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi xóa sách');
    }
    setDeletingId(null);
  }

  if (loading) {
    return <div className="flex justify-center py-12"><span className="text-4xl animate-spin">⭐</span></div>;
  }

  if (stories.length === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-xl p-8 text-center border border-emerald-100">
        <div className="text-4xl mb-2">📚</div>
        <p className="text-gray-700 font-bold">Chưa có truyện nào</p>
        <p className="text-gray-400 text-sm mt-1">Nhấn "Thêm sách" để bắt đầu</p>
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
                <span className="text-xs text-gray-400">👦 {s.assigned_count ?? 0} bé</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setConfirmDeleteId(confirmDeleteId === s.id ? null : s.id)}
                className="btn-scale bg-rose-50 border border-rose-100 text-rose-400 hover:text-rose-600 font-bold text-xs px-2 py-1.5 rounded-xl"
                title="Xóa sách"
              >
                🗑️
              </button>
              <button
                onClick={() => { void toggleExpand(s.id); }}
                className="btn-scale bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs px-3 py-1.5 rounded-xl"
              >
                {expandedId === s.id ? '▲ Đóng' : '👁️ Xem'}
              </button>
            </div>
          </div>

          {/* Delete confirmation */}
          {confirmDeleteId === s.id && (
            <div className="mx-4 mb-3 bg-rose-50 border border-rose-200 rounded-2xl p-3 flex items-center gap-3">
              <p className="text-rose-700 font-bold text-xs flex-1">Xóa sách "{s.title}"? Không thể hoàn tác.</p>
              <button
                onClick={() => { void handleDeleteStory(s.id); }}
                disabled={deletingId === s.id}
                className="btn-scale bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-bold text-xs px-3 py-1.5 rounded-xl shrink-0"
              >
                {deletingId === s.id ? '⏳' : '✓ Xóa'}
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="btn-scale bg-white border border-gray-200 text-gray-500 font-bold text-xs px-3 py-1.5 rounded-xl shrink-0"
              >
                ✕ Hủy
              </button>
            </div>
          )}

          {expandedId === s.id && (
            <div className="border-t border-emerald-100">
              {/* Tab bar */}
              <div className="flex border-b border-emerald-100">
                {(['content', 'questions', 'assign'] as LibTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setLibTab(t)}
                    className={`flex-1 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px ${
                      libTab === t
                        ? 'text-emerald-700 border-emerald-500 bg-emerald-50'
                        : 'text-gray-400 border-transparent hover:text-gray-600'
                    }`}
                  >
                    {t === 'content' ? '📖 Nội dung' : t === 'questions' ? '❓ Câu hỏi' : '📤 Giao'}
                  </button>
                ))}
              </div>

              <div className="px-4 pb-4 pt-3">
                {/* Content tab */}
                {libTab === 'content' && (
                  s.pages && s.pages.length > 0
                    ? <EbookPreview pages={s.pages} />
                    : <p className="text-gray-400 text-sm text-center py-4">Chưa có trang sách nào</p>
                )}

                {/* Questions tab */}
                {libTab === 'questions' && (
                  !questionsMap[s.id] ? (
                    <div className="text-center py-4"><span className="animate-spin text-2xl inline-block">⭐</span></div>
                  ) : questionsMap[s.id].length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-3">Chưa có câu hỏi nào</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {questionsMap[s.id].map((q, qi) => (
                        <div key={q.id} className="bg-emerald-50 rounded-2xl p-3 border border-emerald-100">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="font-bold text-gray-800 text-sm flex-1">{qi + 1}. {q.question_text}</p>
                            <button
                              onClick={() => { void handleDeleteQuestion(s.id, q.id); }}
                              className="btn-scale text-rose-400 hover:text-rose-600 text-base shrink-0 leading-none"
                              title="Xóa câu hỏi"
                            >
                              🗑️
                            </button>
                          </div>
                          {OPTS.map((opt) => (
                            <div key={opt} className={`flex items-start gap-2 text-xs py-1.5 px-2.5 rounded-xl mb-1 border ${
                              q.correct_option === opt
                                ? 'bg-emerald-100 border-emerald-400 font-extrabold text-emerald-700'
                                : 'bg-white border-gray-100 text-gray-600'
                            }`}>
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
                  )
                )}

                {/* Assign tab */}
                {libTab === 'assign' && (
                  !childrenLoaded ? (
                    <div className="text-center py-3"><span className="animate-spin text-xl inline-block">⭐</span></div>
                  ) : children.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-2">Chưa có con nào được liên kết</p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-0.5 mb-3">
                        {children.map((c) => {
                          const alreadyAssigned = (s.assignedStudentIds ?? []).includes(c.id);
                          return (
                            <label key={c.id} className="flex items-center gap-3 cursor-pointer p-2.5 rounded-2xl hover:bg-emerald-50 transition-all">
                              <input
                                type="checkbox"
                                checked={assignSelectedIds.has(c.id)}
                                onChange={() => toggleAssignChild(c.id)}
                                className="w-5 h-5 accent-emerald-500 shrink-0"
                              />
                              <span className="font-bold text-gray-800 text-sm flex-1">{c.display_name}</span>
                              {alreadyAssigned && (
                                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">✓ Đã giao</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => { void handleAssign(s.id); }}
                        disabled={assignSelectedIds.size === 0 || assigning}
                        className="btn-scale w-full py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold text-sm transition-all"
                      >
                        {assigning
                          ? '⏳ Đang giao...'
                          : assignSelectedIds.size === 0
                          ? '📤 Chọn con để giao sách'
                          : assignSelectedIds.size === 1
                          ? '📤 Giao sách cho con'
                          : `📤 Giao sách cho ${assignSelectedIds.size} con`}
                      </button>
                    </>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── AddBookWizard ─────────────────────────────────────────────────────────────

function AddBookWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<AddStep>(1);

  // Step 1 — local state only
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');
  const [level, setLevel] = useState('elementary');

  // Step 2 — local state only
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [processing, setProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Step 3 — preview after atomic API call
  const [createdStory, setCreatedStory] = useState<Story | null>(null);
  const [createdPages, setCreatedPages] = useState<StoryPage[]>([]);
  const [questions, setQuestions] = useState<ReadingQuestion[]>([]);
  const [showEbook, setShowEbook] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Assign sub-state
  const [children, setChildren] = useState<Child[]>([]);
  const [childrenLoaded, setChildrenLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (showAssign && !childrenLoaded) {
      api.get<Child[]>('/api/parent/children')
        .then((data) => {
          setChildren(data);
          setChildrenLoaded(true);
          if (data.length === 1) setSelectedIds(new Set([data[0].id]));
        })
        .catch(() => {});
    }
  }, [showAssign, childrenLoaded]);

  // ── File handling ──

  function addFiles(files: FileList | null) {
    if (!files) return;
    const newImages: UploadedImage[] = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      isDoublePage: false,
    }));
    setUploadedImages((prev) => [...prev, ...newImages]);
  }

  function removePage(idx: number) {
    setUploadedImages((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function toggleDoublePage(idx: number) {
    setUploadedImages((prev) =>
      prev.map((img, i) => i === idx ? { ...img, isDoublePage: !img.isDoublePage } : img)
    );
  }

  function handleDragStart(idx: number) { dragItem.current = idx; }
  function handleDragEnter(idx: number) { dragOverItem.current = idx; }
  function handleDragEnd() {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) return;
    setUploadedImages((prev) => {
      const copy = [...prev];
      const [dragged] = copy.splice(dragItem.current!, 1);
      copy.splice(dragOverItem.current!, 0, dragged);
      return copy;
    });
    dragItem.current = null;
    dragOverItem.current = null;
  }

  // ── Process (single atomic API call) ──

  async function handleProcess() {
    if (uploadedImages.length === 0 || processing) return;
    setProcessing(true);
    try {
      const result = await ireadService.createStoryWithPages(
        { title: title.trim(), language, level },
        uploadedImages
      );
      setCreatedStory(result.story);
      setCreatedPages(result.pages);
      setQuestions(result.questions);
      setStep(3);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi tạo sách. Vui lòng thử lại.');
    }
    setProcessing(false);
  }

  // ── Delete story ──

  async function handleDeleteStory() {
    if (!createdStory) return;
    if (!window.confirm(`Xóa sách "${createdStory.title}"? Hành động này không thể hoàn tác.`)) return;
    setDeleting(true);
    try {
      await ireadService.deleteStory(createdStory.id);
      setStep(1);
      setTitle('');
      setLanguage('vi');
      setLevel('elementary');
      uploadedImages.forEach((img) => URL.revokeObjectURL(img.preview));
      setUploadedImages([]);
      setCreatedStory(null);
      setCreatedPages([]);
      setQuestions([]);
      setShowEbook(false);
      setShowAssign(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi xóa sách');
    }
    setDeleting(false);
  }

  // ── Delete question ──

  function handleDeleteQuestion(id: number) {
    void ireadService.deleteQuestion(id).catch(() => {});
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  // ── Assign ──

  function toggleChild(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleAssign() {
    if (!createdStory || selectedIds.size === 0) return;
    setAssigning(true);
    try {
      await ireadService.assignStory(createdStory.id, Array.from(selectedIds));
      setDone(true);
      setTimeout(onDone, 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi giao bài');
    }
    setAssigning(false);
  }

  const stepLabels = ['Thông tin', 'Upload', 'Xem & Giao'];

  return (
    <div className="flex flex-col gap-4">
      {/* Step indicator */}
      <div className="bg-emerald-100 rounded-2xl p-3 flex items-center gap-1">
        {stepLabels.map((label, i) => {
          const s = i + 1;
          const active = s === step;
          const past = s < step;
          return (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold border-2 transition-all ${
                past ? 'bg-emerald-500 border-emerald-500 text-white'
                : active ? 'bg-white border-emerald-500 text-emerald-700 shadow'
                : 'bg-transparent border-emerald-200 text-emerald-300'
              }`}>
                {past ? '✓' : s}
              </div>
              <span className={`text-xs font-bold ${active ? 'text-emerald-700' : past ? 'text-emerald-500' : 'text-emerald-300'}`}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Book info (no API call) ── */}
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
              onClick={() => { if (title.trim()) setStep(2); }}
              disabled={!title.trim()}
              className="btn-scale w-full py-3.5 rounded-3xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-extrabold text-base shadow-lg transition-all"
            >
              Tiếp theo →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Upload images, then process ── */}
      {step === 2 && uploadedImages.length > 0 && (
        <div style={{
          position: 'fixed', bottom: '70px', left: 0, right: 0,
          padding: '12px 16px', background: 'white', zIndex: 90,
          boxShadow: '0 -2px 12px rgba(0,0,0,0.08)',
        }}>
          {processing && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center mb-2">
              <p className="font-bold text-emerald-700 text-sm">
                ⏳ Đang OCR {uploadedImages.reduce((s, img) => s + (img.isDoublePage ? 2 : 1), 0)} trang và tạo câu hỏi...
              </p>
              <p className="text-xs text-emerald-500 mt-0.5">Có thể mất 30–60 giây, vui lòng đợi</p>
            </div>
          )}
          <button
            onClick={() => { void handleProcess(); }}
            disabled={processing}
            className="btn-scale w-full py-3.5 rounded-3xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white font-extrabold text-base shadow-lg transition-all"
          >
            {processing ? '⏳ Đang xử lý...' : '🤖 Xử lý OCR & Tạo câu hỏi'}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3 pb-40">
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
              💡 <span className="font-semibold">Mẹo chụp ảnh để OCR chính xác nhất:</span><br/>
              • Tốt nhất: chụp từng trang riêng lẻ<br/>
              • Nếu chụp sách mở: đảm bảo trang cần lấy nằm ở bên <span className="font-semibold">TRÁI</span><br/>
              • Giữ máy thẳng, đủ sáng, tránh bóng tay che text
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

          {uploadedImages.length > 0 && (
            <div className="flex flex-col gap-2">
              {uploadedImages.map((img, idx) => (
                <div
                  key={idx}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragEnter={() => handleDragEnter(idx)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className={`bg-white rounded-2xl shadow border p-3 cursor-grab active:cursor-grabbing select-none ${
                    img.isDoublePage ? 'border-violet-200 bg-violet-50/30' : 'border-emerald-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-300 text-lg shrink-0">⠿</span>
                    <img
                      src={img.preview}
                      alt={`Ảnh ${idx + 1}`}
                      className="w-12 h-14 object-cover rounded-xl border border-gray-100 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm">Ảnh {idx + 1}</p>
                      <p className="text-xs text-gray-400 truncate">{img.file.name}</p>
                      {img.isDoublePage && (
                        <p className="text-xs text-violet-500 font-semibold mt-0.5">→ Tách thành trang trái + phải</p>
                      )}
                    </div>
                    <button
                      onClick={() => removePage(idx)}
                      className="btn-scale text-rose-400 hover:text-rose-600 shrink-0 text-lg leading-none"
                    >
                      ✕
                    </button>
                  </div>
                  <label className="flex items-center gap-2 mt-2.5 cursor-pointer select-none pl-8">
                    <input
                      type="checkbox"
                      checked={img.isDoublePage}
                      onChange={() => toggleDoublePage(idx)}
                      className="w-4 h-4 accent-violet-500 shrink-0"
                    />
                    <span className="text-xs font-bold text-violet-600">📖 Ảnh 2 trang (sách mở)</span>
                  </label>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* ── Step 3: Preview + Assign ── */}
      {step === 3 && createdStory && (
        <div className="flex flex-col gap-3">
          {done ? (
            <div className="bg-white rounded-3xl shadow-xl p-8 text-center border border-emerald-100">
              <div className="text-5xl mb-3 animate-bounce-in">🎉</div>
              <p className="font-extrabold text-emerald-600 text-lg">Giao sách thành công!</p>
              <p className="text-sm text-gray-500 mt-1">Đang quay về thư viện...</p>
            </div>
          ) : showAssign ? (
            /* Assign panel */
            <div className="bg-white rounded-3xl shadow-xl p-5 border border-emerald-100">
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setShowAssign(false)}
                  className="btn-scale text-gray-400 hover:text-gray-600 font-bold text-sm"
                >
                  ←
                </button>
                <h3 className="font-extrabold text-emerald-700 text-base flex-1">
                  {children.length === 1 ? '👧 Giao cho con:' : '👦 Chọn con:'}
                </h3>
                {children.length > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedIds(new Set(children.map((c) => c.id)))}
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
                )}
              </div>

              {!childrenLoaded ? (
                <div className="text-center py-6"><span className="animate-spin text-2xl inline-block">⭐</span></div>
              ) : children.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Chưa có con nào được liên kết</p>
              ) : children.length === 1 ? (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-2xl border border-emerald-200 mb-5">
                  <span className="text-2xl">👧</span>
                  <div>
                    <p className="font-extrabold text-gray-800 text-sm">{children[0].display_name}</p>
                    <p className="text-xs text-gray-400">@{children[0].username}</p>
                  </div>
                  <span className="ml-auto text-emerald-500 font-bold text-sm">✓ Đã chọn</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1 mb-5">
                  {children.map((c) => (
                    <label key={c.id} className="flex items-center gap-3 cursor-pointer p-3 rounded-2xl hover:bg-emerald-50 transition-all">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleChild(c.id)}
                        className="w-5 h-5 accent-emerald-500 shrink-0"
                      />
                      <span className="font-bold text-gray-800 text-sm">{c.display_name}</span>
                      <span className="text-xs text-gray-400 ml-auto">@{c.username}</span>
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
                  : children.length === 1
                  ? '✅ Giao sách cho con'
                  : `✅ Giao sách cho ${selectedIds.size} con`}
              </button>
            </div>
          ) : (
            /* Preview panel */
            <>
              <div className="bg-white rounded-3xl shadow-xl p-5 border border-emerald-100">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-emerald-500 text-xl">✅</span>
                  <h3 className="font-extrabold text-gray-800 text-base">Tạo sách thành công!</h3>
                </div>
                <p className="text-emerald-700 font-bold text-sm mb-4">"{createdStory.title}"</p>

                {/* Ebook preview toggle */}
                <button
                  onClick={() => setShowEbook((v) => !v)}
                  className="btn-scale w-full py-2.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-700 font-bold text-sm mb-4 transition-all"
                >
                  {showEbook ? '▲ Ẩn nội dung sách' : '📖 Xem nội dung sách'}
                </button>
                {showEbook && createdPages.length > 0 && (
                  <div className="mb-4">
                    <EbookPreview pages={createdPages} />
                  </div>
                )}

                {/* Questions */}
                <div className="flex items-center justify-between mb-3">
                  <p className="font-bold text-gray-700 text-sm">❓ Câu hỏi đọc hiểu</p>
                  <span className="text-xs text-gray-400">{questions.length} câu</span>
                </div>
                {questions.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-3">Không tạo được câu hỏi nào</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {questions.map((q, qi) => (
                      <div key={q.id} className="border border-emerald-100 rounded-2xl p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="font-bold text-gray-800 text-sm flex-1">{qi + 1}. {q.question_text}</p>
                          <button
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="btn-scale text-rose-400 hover:text-rose-600 text-base shrink-0 leading-none"
                            title="Xóa câu hỏi"
                          >
                            🗑️
                          </button>
                        </div>
                        {OPTS.map((opt) => (
                          <div key={opt} className={`flex items-start gap-2 text-xs py-1.5 px-2.5 rounded-xl mb-1 border ${
                            q.correct_option === opt
                              ? 'bg-emerald-100 border-emerald-400 font-extrabold text-emerald-700'
                              : 'bg-gray-50 border-gray-100 text-gray-600'
                          }`}>
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

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => { void handleDeleteStory(); }}
                  disabled={deleting}
                  className="btn-scale flex-1 py-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 font-bold text-sm disabled:opacity-50 transition-all"
                >
                  {deleting ? '⏳ Đang xóa...' : '🗑️ Xóa sách này'}
                </button>
                <button
                  onClick={() => setShowAssign(true)}
                  className="btn-scale flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-sm shadow-lg transition-all"
                >
                  📤 Giao →
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ParentIRead ──────────────────────────────────────────────────────────

export default function ParentIRead({ onBack }: { onBack: () => void }) {
  const [subTab, setSubTab] = useState<SubTab>('library');
  const [libKey, setLibKey] = useState(0);

  function handleWizardDone() {
    setLibKey((k) => k + 1);
    setSubTab('library');
  }

  return (
    <div className="w-full max-w-md mx-auto animate-fade-in">
      <button
        onClick={onBack}
        className="btn-scale mb-4 flex items-center gap-1.5 text-white/80 hover:text-white font-bold text-sm transition-colors"
      >
        ← Quay lại
      </button>

      <div className="flex gap-2 mb-5">
        {(['library', 'add'] as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`btn-scale flex-1 py-2.5 rounded-2xl font-extrabold text-sm transition-all ${
              subTab === t
                ? 'bg-emerald-500 text-white shadow-lg'
                : 'bg-white/20 text-white/80 hover:bg-white/30'
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
