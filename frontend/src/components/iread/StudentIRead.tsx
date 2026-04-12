import { useState, useEffect, useRef } from 'react';
import { ireadService } from '../../services/ireadService';
import type { BookshelfEntry, StoryPage, ReadingQuestion, ReadingSession } from '../../services/ireadService';

type Screen = 'bookshelf' | 'detail' | 'reader' | 'quiz';
type LangFilter = 'all' | 'vi' | 'en';
type StatusFilter = 'all' | 'not_started' | 'reading' | 'completed';
type Opt = 'a' | 'b' | 'c' | 'd';

const OPTS: Opt[] = ['a', 'b', 'c', 'd'];

function getBackendUrl(path: string): string {
  const { protocol, hostname, port } = window.location;
  if (!port || port === '443' || port === '80') return `${protocol}//${hostname}${path}`;
  return `${protocol}//${hostname}:3001${path}`;
}

// ── Book card ─────────────────────────────────────────────────────────────────

function BookCard({ book, onOpen }: { book: BookshelfEntry; onOpen: (b: BookshelfEntry) => void }) {
  const progressPct = book.total_pages > 0
    ? Math.round((book.current_page / book.total_pages) * 100)
    : 0;

  const btnLabel = book.status === 'completed' ? 'Đọc lại'
    : book.status === 'reading' ? 'Tiếp tục'
    : 'Đọc ngay';

  return (
    <div
      className="bg-white rounded-3xl shadow-lg overflow-hidden border border-emerald-50 cursor-pointer active:scale-95 transition-transform"
      onClick={() => onOpen(book)}
    >
      {/* Cover */}
      <div className="relative bg-gradient-to-b from-emerald-100 to-teal-100 h-28 flex items-center justify-center">
        {book.cover_image_url ? (
          <img src={getBackendUrl(book.cover_image_url)} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-5xl">📖</span>
        )}
        {book.status === 'completed' && (
          <span className="absolute top-2 right-2 bg-emerald-500 text-white text-xs font-extrabold px-2 py-0.5 rounded-full">✓</span>
        )}
        {book.status === 'reading' && (
          <span className="absolute top-2 right-2 bg-amber-400 text-white text-xs font-extrabold px-2 py-0.5 rounded-full">🔖</span>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="font-extrabold text-gray-800 text-xs leading-tight mb-1 line-clamp-2">{book.title}</p>
        <p className={`text-xs font-bold mb-2 ${book.language === 'vi' ? 'text-red-500' : 'text-blue-500'}`}>
          {book.language === 'vi' ? '🇻🇳' : '🇬🇧'} {book.level === 'elementary' ? 'Tiểu học' : 'Cấp 2'}
        </p>

        {book.status === 'reading' && book.total_pages > 0 && (
          <div className="mb-2">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-gray-400 text-xs mt-0.5">{progressPct}%</p>
          </div>
        )}

        {book.status === 'completed' && book.correct_answers !== null && (
          <p className="text-emerald-600 text-xs font-bold mb-2">⭐ +{(book.correct_answers ?? 0) * 10} điểm</p>
        )}

        <div className={`w-full py-1.5 rounded-2xl font-extrabold text-xs text-center ${
          book.status === 'reading' ? 'bg-amber-400 text-white' : 'bg-emerald-500 text-white'
        }`}>
          {btnLabel}
        </div>
      </div>
    </div>
  );
}

// ── Main StudentIRead ─────────────────────────────────────────────────────────

export default function StudentIRead() {
  const [screen, setScreen] = useState<Screen>('bookshelf');

  // Bookshelf
  const [books, setBooks] = useState<BookshelfEntry[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [langFilter, setLangFilter] = useState<LangFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Selected book & session
  const [selectedBook, setSelectedBook] = useState<BookshelfEntry | null>(null);
  const [session, setSession] = useState<ReadingSession | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  // Reader
  const [pages, setPages] = useState<StoryPage[]>([]);
  const [readerPage, setReaderPage] = useState(1);
  const touchStartX = useRef<number | null>(null);

  // Quiz
  const [questions, setQuestions] = useState<ReadingQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<Opt | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [userAnswers, setUserAnswers] = useState<(Opt | null)[]>([]);
  const [quizDone, setQuizDone] = useState(false);
  const [finalCorrect, setFinalCorrect] = useState(0);

  useEffect(() => { void loadBookshelf(); }, []);

  async function loadBookshelf() {
    setLoadingBooks(true);
    try {
      const data = await ireadService.getBookshelf();
      setBooks(data);
    } catch { /* ignore */ }
    setLoadingBooks(false);
  }

  const filteredBooks = books.filter((b) => {
    if (langFilter !== 'all' && b.language !== langFilter) return false;
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    return true;
  });

  // ── Navigation ──

  function handleOpenBook(book: BookshelfEntry) {
    setSelectedBook(book);
    setScreen('detail');
  }

  async function handleStartReading(book: BookshelfEntry, fromPage: number) {
    setLoadingContent(true);
    try {
      const [sess, pgs] = await Promise.all([
        ireadService.startSession(book.id),
        ireadService.getStoryPages(book.id),
      ]);
      setSession(sess);
      setPages(pgs);
      setReaderPage(Math.max(1, Math.min(fromPage, pgs.length)));
      setScreen('reader');
    } catch {
      alert('Không thể tải trang sách. Vui lòng thử lại.');
    }
    setLoadingContent(false);
  }

  async function handleStartQuiz(book: BookshelfEntry) {
    setLoadingContent(true);
    try {
      const [sess, qs] = await Promise.all([
        ireadService.startSession(book.id),
        ireadService.getQuestions(book.id),
      ]);
      if (qs.length === 0) {
        alert('Truyện này chưa có câu hỏi. Vui lòng liên hệ thầy/cô hoặc ba/mẹ.');
        setLoadingContent(false);
        return;
      }
      setSession(sess);
      setQuestions(qs);
      setQuizIndex(0);
      setSelectedOpt(null);
      setConfirmed(false);
      setUserAnswers(new Array<Opt | null>(qs.length).fill(null));
      setQuizDone(false);
      setFinalCorrect(0);
      setScreen('quiz');
    } catch {
      alert('Không thể tải câu hỏi. Vui lòng thử lại.');
    }
    setLoadingContent(false);
  }

  function backToBookshelf() {
    setScreen('bookshelf');
    setSelectedBook(null);
    setSession(null);
    setPages([]);
    setQuestions([]);
    setQuizDone(false);
  }

  // ── Reader ──

  async function handlePageChange(newPage: number) {
    if (newPage < 1 || newPage > pages.length) return;
    setReaderPage(newPage);
    if (session) {
      ireadService.updateSession(session.id, { current_page: newPage }).catch(() => {});
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 60) return;
    if (delta < 0) void handlePageChange(readerPage + 1);
    else void handlePageChange(readerPage - 1);
  }

  // ── Quiz ──

  function handleQuizConfirm() {
    if (!selectedOpt) return;
    setUserAnswers((prev) => {
      const next = [...prev];
      next[quizIndex] = selectedOpt;
      return next;
    });
    setConfirmed(true);
  }

  async function handleQuizNext() {
    const isLast = quizIndex + 1 >= questions.length;

    if (isLast) {
      // Compute final score synchronously from local vars
      const allAnswers = userAnswers.map((a, i) => (i === quizIndex ? selectedOpt : a));
      const correct = allAnswers.filter((a, i) => a !== null && a === questions[i].correct_option).length;
      setFinalCorrect(correct);
      setQuizDone(true);

      if (session) {
        await ireadService.updateSession(session.id, {
          status: 'completed',
          correct_answers: correct,
          total_questions: questions.length,
          score: correct * 10,
        }).catch(() => {});
      }
      void loadBookshelf();
    } else {
      setQuizIndex((i) => i + 1);
      setSelectedOpt(null);
      setConfirmed(false);
    }
  }

  // ── READER SCREEN (fixed full-screen overlay) ────────────────────────────────

  if (screen === 'reader') {
    const page = pages[readerPage - 1];
    const isLastPage = readerPage >= pages.length;

    return (
      <div
        className="fixed inset-0 z-[200] flex flex-col"
        style={{ backgroundColor: '#FDF6E3' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Top bar */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 bg-amber-100 border-b border-amber-200">
          <button
            onClick={() => setScreen('detail')}
            className="btn-scale text-amber-700 font-bold text-sm flex items-center gap-1"
          >
            ← Quay lại
          </button>
          <div className="text-center flex-1 px-3">
            <p className="font-extrabold text-amber-800 text-sm truncate">{selectedBook?.title}</p>
            <p className="text-amber-600 text-xs">Trang {readerPage} / {pages.length}</p>
          </div>
          <button
            onClick={() => { void handleStartQuiz(selectedBook!); }}
            className="btn-scale text-amber-700 font-bold text-xs bg-amber-200 hover:bg-amber-300 px-3 py-1.5 rounded-xl flex items-center gap-1"
          >
            ✏️ Bài
          </button>
        </div>

        {/* Progress bar */}
        <div className="shrink-0 h-1.5 bg-amber-100">
          <div
            className="h-full bg-amber-400 transition-all"
            style={{ width: `${(readerPage / pages.length) * 100}%` }}
          />
        </div>

        {/* Text content */}
        <div className="flex-1 overflow-y-auto px-6 py-8 max-w-2xl mx-auto w-full">
          {page?.extracted_text ? (
            <p
              className="whitespace-pre-wrap"
              style={{
                fontFamily: "'Lora', Georgia, serif",
                fontSize: '17px',
                lineHeight: '1.9',
                letterSpacing: '0.01em',
                color: '#2C1810',
              }}
            >
              {page.extracted_text}
            </p>
          ) : (
            <div className="text-center py-16">
              <p className="text-amber-600 font-bold">📄 Trang này chưa có nội dung text</p>
              {page?.image_url && (
                <img
                  src={getBackendUrl(page.image_url)}
                  alt={`Trang ${readerPage}`}
                  className="mx-auto mt-6 max-h-[70vh] object-contain rounded-xl shadow"
                />
              )}
            </div>
          )}

          {/* Last page CTA */}
          {isLastPage && (
            <div className="mt-12 text-center bg-emerald-50 border-2 border-emerald-200 rounded-3xl p-6">
              <p className="text-3xl mb-2">🎉</p>
              <p className="font-extrabold text-emerald-700 text-lg mb-1">Bạn đã đọc xong!</p>
              <p className="text-emerald-600 text-sm mb-5">Hãy làm bài kiểm tra nhé!</p>
              <button
                onClick={() => { void handleStartQuiz(selectedBook!); }}
                className="btn-scale bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold py-3.5 px-10 rounded-3xl shadow-lg text-base"
              >
                ✏️ Làm bài ngay
              </button>
            </div>
          )}
        </div>

        {/* Bottom navigation */}
        <div className="shrink-0 px-4 py-3 bg-amber-50 border-t border-amber-200 flex items-center gap-3">
          <button
            onClick={() => void handlePageChange(readerPage - 1)}
            disabled={readerPage <= 1}
            className="btn-scale flex-1 py-3 rounded-2xl bg-amber-200 hover:bg-amber-300 disabled:opacity-30 font-extrabold text-amber-800 text-sm"
          >
            ← Trước
          </button>
          <span className="text-amber-600 font-bold text-sm shrink-0 w-16 text-center">
            {readerPage} / {pages.length}
          </span>
          <button
            onClick={() => void handlePageChange(readerPage + 1)}
            disabled={readerPage >= pages.length}
            className="btn-scale flex-1 py-3 rounded-2xl bg-amber-200 hover:bg-amber-300 disabled:opacity-30 font-extrabold text-amber-800 text-sm"
          >
            Sau →
          </button>
        </div>
      </div>
    );
  }

  // ── QUIZ SCREEN (fixed full-screen overlay) ───────────────────────────────────

  if (screen === 'quiz') {
    const q = questions[quizIndex];

    // Results screen
    if (quizDone) {
      const pts = finalCorrect * 10;
      return (
        <div className="fixed inset-0 z-[200] bg-gradient-to-b from-emerald-600 to-teal-700 flex flex-col items-center justify-center px-5">
          <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm text-center animate-bounce-in">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="font-extrabold text-gray-800 text-2xl mb-1">Hoàn thành!</h2>
            <p className="text-gray-400 font-semibold text-sm mb-5 truncate">{selectedBook?.title}</p>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-3">
              <p className="text-gray-500 font-bold text-sm">Điểm số</p>
              <p className="font-extrabold text-emerald-700 text-4xl mt-1">{finalCorrect}<span className="text-xl text-gray-400"> / {questions.length}</span></p>
              <p className="text-gray-400 text-xs mt-0.5">câu trả lời đúng</p>
            </div>

            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-3 mb-6 flex items-center justify-center gap-2">
              <span className="text-2xl">⭐</span>
              <span className="font-extrabold text-amber-600 text-xl">+{pts} điểm thưởng</span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={backToBookshelf}
                className="btn-scale flex-1 py-3 rounded-2xl bg-gray-100 hover:bg-gray-200 font-extrabold text-gray-700 text-sm"
              >
                📚 Ngăn sách
              </button>
              <button
                onClick={() => { void handleStartReading(selectedBook!, 1); }}
                className="btn-scale flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 font-extrabold text-white text-sm"
              >
                📖 Đọc lại
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Question screen
    return (
      <div className="fixed inset-0 z-[200] bg-gradient-to-b from-emerald-600 to-teal-700 flex flex-col">
        {/* Header */}
        <div className="shrink-0 px-4 pt-5 pb-3">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setScreen('detail')}
              className="btn-scale text-white/60 hover:text-white font-bold text-sm"
            >
              ✕
            </button>
            <p className="font-extrabold text-white text-sm">
              Câu {quizIndex + 1} / {questions.length}
            </p>
            <div className="w-8" />
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all"
              style={{ width: `${((quizIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question + options (scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {/* Question card */}
          <div className="bg-white rounded-3xl p-5 mb-4 shadow-xl">
            <p className="font-extrabold text-gray-800 text-base leading-relaxed">{q.question_text}</p>
          </div>

          {/* Options */}
          <div className="flex flex-col gap-3">
            {OPTS.map((opt) => {
              const optText = q[`option_${opt}` as keyof ReadingQuestion] as string;
              const isCorrect = q.correct_option === opt;
              const isSelected = selectedOpt === opt;

              let cls = 'w-full p-4 rounded-2xl border-2 text-left transition-all flex items-start gap-3 font-bold text-sm ';
              if (!confirmed) {
                cls += isSelected
                  ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg scale-[1.02]'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-emerald-300 active:scale-95';
              } else {
                if (isCorrect) cls += 'bg-green-100 border-green-500 text-green-800';
                else if (isSelected) cls += 'bg-red-100 border-red-400 text-red-700';
                else cls += 'bg-gray-50 border-gray-100 text-gray-400';
              }

              return (
                <button
                  key={opt}
                  onClick={() => { if (!confirmed) setSelectedOpt(opt); }}
                  className={cls}
                  disabled={confirmed}
                >
                  <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold border-2 border-current">
                    {opt.toUpperCase()}
                  </span>
                  <span className="flex-1">{optText}</span>
                  {confirmed && isCorrect && <span className="shrink-0">✅</span>}
                  {confirmed && isSelected && !isCorrect && <span className="shrink-0">❌</span>}
                </button>
              );
            })}
          </div>

          {/* Explanation */}
          {confirmed && q.explanation && (
            <div className="mt-4 bg-white/15 backdrop-blur-sm rounded-2xl p-4 animate-fade-in">
              <p className="text-white font-bold text-sm">💡 {q.explanation}</p>
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="shrink-0 px-4 pb-8 pt-3">
          {!confirmed ? (
            <button
              onClick={handleQuizConfirm}
              disabled={!selectedOpt}
              className="btn-scale w-full py-4 rounded-3xl bg-white disabled:opacity-40 font-extrabold text-emerald-700 text-base shadow-xl transition-all"
            >
              Xác nhận
            </button>
          ) : (
            <button
              onClick={() => { void handleQuizNext(); }}
              className="btn-scale w-full py-4 rounded-3xl bg-white font-extrabold text-emerald-700 text-base shadow-xl"
            >
              {quizIndex + 1 >= questions.length ? '🎉 Xem kết quả' : 'Câu tiếp theo →'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── DETAIL SCREEN ─────────────────────────────────────────────────────────────

  if (screen === 'detail' && selectedBook) {
    const book = selectedBook;

    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-teal-100 px-4 py-5">
        <button
          onClick={backToBookshelf}
          className="btn-scale mb-4 flex items-center gap-1.5 text-emerald-700 font-bold text-sm hover:text-emerald-900"
        >
          ← Ngăn sách
        </button>

        <div className="max-w-md mx-auto flex flex-col gap-4">
          {/* Book info card */}
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-emerald-100">
            <div className="bg-gradient-to-b from-emerald-100 to-teal-100 p-8 text-center">
              <div className="text-7xl mb-3">📖</div>
              <h1 className="font-extrabold text-gray-800 text-xl leading-tight">{book.title}</h1>
              <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${book.language === 'vi' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                  {book.language === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 English'}
                </span>
                <span className="text-xs text-gray-400">📄 {book.total_pages} trang</span>
              </div>
            </div>

            <div className="px-5 py-4">
              {book.status === 'completed' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
                  <p className="font-bold text-emerald-700 text-sm">✅ Đã hoàn thành</p>
                  {book.correct_answers !== null && book.total_questions !== null && (
                    <p className="text-emerald-600 text-xs mt-0.5">
                      {book.correct_answers}/{book.total_questions} câu đúng · +{(book.correct_answers ?? 0) * 10} ⭐
                    </p>
                  )}
                </div>
              )}
              {book.status === 'reading' && book.total_pages > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
                  <p className="font-bold text-amber-700 text-sm mb-1.5">🔖 Đang đọc dở</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-amber-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full"
                        style={{ width: `${(book.current_page / book.total_pages) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-amber-600 font-bold shrink-0">
                      {book.current_page}/{book.total_pages}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Buttons */}
          {book.total_pages === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
              <p className="text-amber-600 font-bold text-sm">⚠️ Truyện này chưa có trang sách nào</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {book.status === 'reading' ? (
                <>
                  <button
                    onClick={() => void handleStartReading(book, book.current_page)}
                    disabled={loadingContent}
                    className="btn-scale w-full py-4 rounded-3xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-extrabold text-base shadow-lg flex items-center justify-center gap-2"
                  >
                    {loadingContent ? '⏳ Đang tải...' : `🔖 Tiếp tục từ trang ${book.current_page}`}
                  </button>
                  <button
                    onClick={() => void handleStartReading(book, 1)}
                    disabled={loadingContent}
                    className="btn-scale w-full py-3 rounded-3xl bg-white border-2 border-emerald-300 text-emerald-700 font-bold text-sm flex items-center justify-center gap-2"
                  >
                    📖 Đọc lại từ đầu
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void handleStartReading(book, 1)}
                  disabled={loadingContent}
                  className="btn-scale w-full py-4 rounded-3xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-extrabold text-base shadow-lg flex items-center justify-center gap-2"
                >
                  {loadingContent ? '⏳ Đang tải...' : `📖 ${book.status === 'completed' ? 'Đọc lại từ đầu' : 'Đọc sách'}`}
                </button>
              )}

              <button
                onClick={() => void handleStartQuiz(book)}
                disabled={loadingContent}
                className="btn-scale w-full py-4 rounded-3xl bg-white border-2 border-emerald-400 text-emerald-700 font-extrabold text-base shadow flex items-center justify-center gap-2"
              >
                {loadingContent ? '⏳ Đang tải...' : `✏️ ${book.status === 'completed' ? 'Làm bài lại' : 'Làm bài ngay'}`}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── BOOKSHELF SCREEN ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-teal-50 pb-8">
      {/* Header with filters */}
      <div className="bg-emerald-600 px-4 pt-5 pb-4">
        <h1 className="font-extrabold text-white text-xl mb-4">📚 Ngăn Sách Của Con</h1>

        {/* Language filter */}
        <div className="flex gap-2 mb-2">
          {(['all', 'vi', 'en'] as LangFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setLangFilter(f)}
              className={`btn-scale px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                langFilter === f ? 'bg-white text-emerald-700 shadow' : 'bg-white/20 text-white/80'
              }`}
            >
              {f === 'all' ? 'Tất cả' : f === 'vi' ? '🇻🇳 Tiếng Việt' : '🇬🇧 English'}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-2 flex-wrap">
          {([
            ['all', 'Tất cả'],
            ['not_started', '📖 Chưa đọc'],
            ['reading', '🔖 Đang đọc'],
            ['completed', '✅ Xong'],
          ] as [StatusFilter, string][]).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`btn-scale px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                statusFilter === f ? 'bg-white text-emerald-700 shadow' : 'bg-white/20 text-white/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Book grid */}
      <div className="px-4 pt-4">
        {loadingBooks ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-3xl shadow overflow-hidden animate-pulse">
                <div className="bg-gray-200 h-28" />
                <div className="p-3">
                  <div className="bg-gray-200 h-4 rounded mb-2" />
                  <div className="bg-gray-200 h-3 rounded w-2/3 mb-3" />
                  <div className="bg-gray-200 h-7 rounded-2xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📚</div>
            <p className="font-bold text-gray-600 text-base">
              {books.length === 0 ? 'Chưa có sách nào được giao' : 'Không có sách nào phù hợp'}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {books.length === 0
                ? 'Nhờ thầy/cô hoặc ba/mẹ giao sách cho con nhé!'
                : 'Thử bỏ bộ lọc đi'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {filteredBooks.map((book) => (
              <BookCard key={book.id} book={book} onOpen={handleOpenBook} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
