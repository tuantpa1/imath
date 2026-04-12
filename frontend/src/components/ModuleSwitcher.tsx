interface ModuleSwitcherProps {
  activeModule: 'imath' | 'iread';
  onSwitch: (module: 'imath' | 'iread') => void;
}

export default function ModuleSwitcher({ activeModule, onSwitch }: ModuleSwitcherProps) {
  return (
    <div className="w-full bg-white shadow-md border-b border-gray-100 px-4 py-2 flex gap-2 justify-center sticky top-0 z-50">
      <button
        onClick={() => onSwitch('imath')}
        className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-extrabold text-sm transition-all duration-200 ${
          activeModule === 'imath'
            ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-md scale-105'
            : 'bg-white text-violet-600 border-2 border-violet-200 hover:border-violet-400'
        }`}
      >
        <span className="text-lg">📐</span> iMath
      </button>
      <button
        onClick={() => onSwitch('iread')}
        className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-extrabold text-sm transition-all duration-200 ${
          activeModule === 'iread'
            ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md scale-105'
            : 'bg-white text-emerald-600 border-2 border-emerald-200 hover:border-emerald-400'
        }`}
      >
        <span className="text-lg">📚</span> iRead
      </button>
    </div>
  );
}
