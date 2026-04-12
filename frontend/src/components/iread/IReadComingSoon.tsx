export default function IReadComingSoon() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-teal-100 flex flex-col items-center justify-center px-5 py-10">
      <div className="animate-fade-in w-full max-w-md flex flex-col items-center gap-6 text-center">

        <div className="text-8xl animate-bounce-in">📚</div>

        <div>
          <h1 className="text-3xl font-extrabold text-emerald-700">iRead</h1>
          <p className="text-emerald-600 font-bold text-lg mt-1">Đọc sách thông minh</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl p-8 w-full border border-emerald-100">
          <div className="text-4xl mb-3">🚧</div>
          <h2 className="text-xl font-extrabold text-gray-700 mb-2">Sắp ra mắt!</h2>
          <p className="text-gray-500 font-semibold text-sm mb-6">
            Tính năng đọc sách đang được phát triển. Sẽ sớm có mặt!
          </p>

          <div className="flex flex-col gap-3 text-left">
            <div className="flex items-center gap-3 bg-emerald-50 rounded-2xl p-3">
              <span className="text-2xl">📖</span>
              <div>
                <p className="font-extrabold text-emerald-700 text-sm">Thư viện truyện</p>
                <p className="text-emerald-600 text-xs">Kho truyện phong phú bằng tiếng Việt & tiếng Anh</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-teal-50 rounded-2xl p-3">
              <span className="text-2xl">🤖</span>
              <div>
                <p className="font-extrabold text-teal-700 text-sm">AI ra câu hỏi</p>
                <p className="text-teal-600 text-xs">Tự động tạo câu hỏi hiểu văn bản từ nội dung truyện</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-cyan-50 rounded-2xl p-3">
              <span className="text-2xl">⭐</span>
              <div>
                <p className="font-extrabold text-cyan-700 text-sm">Tích điểm thưởng</p>
                <p className="text-cyan-600 text-xs">Đọc & trả lời đúng để nhận điểm thưởng</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-emerald-500 font-bold text-sm">Tiếp tục luyện toán với iMath nhé! 📐</p>
      </div>
    </div>
  );
}
