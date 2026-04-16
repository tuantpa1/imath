import { useState, useEffect } from 'react';
import './App.css';
import { authService, onUnauthorized } from './services/authService';
import type { AuthUser } from './services/authService';
import LoginPage from './pages/LoginPage';
import StudentMode from './pages/StudentMode';
import ParentMode from './pages/ParentMode';
import AdminDashboard from './pages/AdminDashboard';
import TeacherView from './pages/TeacherView';
import StudentIRead from './components/iread/StudentIRead';
import BottomNav from './components/layout/BottomNav';
import StudentHome from './components/home/StudentHome';
import PointsScreen from './components/home/PointsScreen';

type StudentTab = 'home' | 'imath' | 'iread' | 'points';

function App() {
  const [user, setUser] = useState<AuthUser | null>(() => authService.getCurrentUser());
  const [studentTab, setStudentTab] = useState<StudentTab>('home');
  const [taskCount, setTaskCount] = useState(0);

  // Auto-logout when any API call returns 401 (expired/invalid token)
  useEffect(() => {
    return onUnauthorized(() => {
      setUser(null);
    });
  }, []);

  const handleLogin = (loggedInUser: AuthUser) => {
    setUser(loggedInUser);
    setStudentTab('home');
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setStudentTab('home');
  };

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (user.role === 'admin') {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  if (user.role === 'teacher') {
    return <TeacherView onLogout={handleLogout} />;
  }

  if (user.role === 'parent') {
    return <ParentMode onExitToStudent={handleLogout} />;
  }

  // ── Student ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f3f0ff' }}>
      {studentTab === 'home' && (
        <StudentHome
          onNavigate={(tab) => setStudentTab(tab)}
          onTaskCount={setTaskCount}
        />
      )}
      {studentTab === 'imath' && <StudentMode onSwitchToParent={handleLogout} />}
      {studentTab === 'iread' && <StudentIRead />}
      {studentTab === 'points' && <PointsScreen />}
      <BottomNav
        activeTab={studentTab}
        onTabChange={setStudentTab}
        role="student"
        taskCount={taskCount}
      />
    </div>
  );
}

export default App;
