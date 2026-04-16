interface BottomNavProps {
  activeTab: 'home' | 'imath' | 'iread' | 'points';
  onTabChange: (tab: 'home' | 'imath' | 'iread' | 'points') => void;
  role: 'student' | 'parent' | 'teacher';
  taskCount?: number;
}

const ACTIVE_COLOR: Record<BottomNavProps['role'], string> = {
  student: '#7C3AED',
  parent: '#0F766E',
  teacher: '#1D4ED8',
};

function tabConfig(role: BottomNavProps['role']) {
  const fourth =
    role === 'student'
      ? { key: 'points' as const, icon: '🏆', label: 'Điểm' }
      : role === 'parent'
      ? { key: 'points' as const, icon: '👦', label: 'Con tôi' }
      : { key: 'points' as const, icon: '👥', label: 'Lớp học' };

  return [
    { key: 'home' as const, icon: '🏠', label: 'Home' },
    { key: 'imath' as const, icon: '📐', label: 'iMath' },
    { key: 'iread' as const, icon: '📚', label: 'iRead' },
    fourth,
  ];
}

export default function BottomNav({ activeTab, onTabChange, role, taskCount }: BottomNavProps) {
  const color = ACTIVE_COLOR[role];
  const tabs = tabConfig(role);

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#fff',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        padding: '8px 0 16px',
        zIndex: 100,
        boxShadow: '0 -2px 12px rgba(0,0,0,0.07)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const showBadge = tab.key === 'home' && (taskCount ?? 0) > 0;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 0',
              position: 'relative',
              transition: 'opacity 0.15s',
            }}
          >
            {/* Badge */}
            {showBadge && (
              <span
                style={{
                  position: 'absolute',
                  top: '0px',
                  right: 'calc(50% - 18px)',
                  background: '#EF4444',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 800,
                  lineHeight: 1,
                  padding: '2px 5px',
                  borderRadius: '9999px',
                  minWidth: '16px',
                  textAlign: 'center',
                }}
              >
                {taskCount}
              </span>
            )}
            <span style={{ fontSize: '22px', lineHeight: 1 }}>{tab.icon}</span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: isActive ? 800 : 500,
                color: isActive ? color : '#9ca3af',
                fontFamily: "'Baloo 2', sans-serif",
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </span>
            {/* Active indicator dot */}
            {isActive && (
              <span
                style={{
                  display: 'block',
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: color,
                  marginTop: '-1px',
                }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
