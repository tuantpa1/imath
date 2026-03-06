import { useState, useEffect } from 'react';

const CORRECT_PIN = '1234';

interface PinModalProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function PinModal({ onSuccess, onCancel }: PinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (pin.length === 4) {
      if (pin === CORRECT_PIN) {
        onSuccess();
      } else {
        setShake(true);
        setError('Mã PIN không đúng! Thử lại nhé 😅');
        setTimeout(() => {
          setPin('');
          setShake(false);
        }, 600);
      }
    }
  }, [pin, onSuccess]);

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      setPin((p) => p + digit);
      setError('');
    }
  };

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1));
    setError('');
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={`bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm text-center ${shake ? 'animate-shake' : ''}`}
        style={{ animation: shake ? 'shake 0.5s ease-in-out' : undefined }}
      >
        <div className="text-5xl mb-2">🔐</div>
        <h2 className="text-2xl font-black text-purple-700 mb-1">Chế Độ Ba/Mẹ</h2>
        <p className="text-gray-500 mb-6 text-sm">Nhập mã PIN 4 chữ số</p>

        {/* PIN dots */}
        <div className="flex justify-center gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-5 h-5 rounded-full border-4 transition-all duration-200 ${
                i < pin.length
                  ? 'bg-purple-500 border-purple-500 scale-110'
                  : 'bg-white border-gray-300'
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        <div className={`text-red-500 text-sm font-bold mb-4 h-5 transition-opacity ${error ? 'opacity-100' : 'opacity-0'}`}>
          {error || ' '}
        </div>

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {digits.map((d, i) => {
            if (d === '') return <div key={i} />;
            return (
              <button
                key={i}
                onClick={() => d === '⌫' ? handleDelete() : handleDigit(d)}
                className={`
                  h-14 rounded-2xl text-xl font-black transition-all duration-100 active:scale-95
                  ${d === '⌫'
                    ? 'bg-red-100 text-red-500 hover:bg-red-200'
                    : 'bg-purple-100 text-purple-700 hover:bg-purple-200'}
                `}
              >
                {d}
              </button>
            );
          })}
        </div>

        <button
          onClick={onCancel}
          className="w-full py-3 rounded-2xl bg-gray-100 text-gray-500 font-bold hover:bg-gray-200 transition-colors"
        >
          Hủy bỏ
        </button>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
