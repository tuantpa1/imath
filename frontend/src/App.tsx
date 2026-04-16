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
import ParentHome from './components/home/ParentHome';
import TeacherHome from './components/home/TeacherHome';

type AppTab = 'home' | 'imath' | 'iread' | 'points';

function App() {
  const [user, setUser] = useState<AuthUser | null>(() => authService.getCurrentUser());
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [taskCount, setTaskCount] = useState(0);

  useEffect(() => {
    return onUnauthorized(() => {
      setUser(null);
    });
  }, []);

  const handleLogin = (loggedInUser: AuthUser) => {
    setUser(loggedInUser);
    setActiveTab('home');
    setTaskCount(0);
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setActiveTab('home');
    setTaskCount(0);
  };

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // ── Admin — full dashboard, no bottom nav ────────────────────────────────
  if (user.role === 'admin') {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  // ── Teacher ──────────────────────────────────────────────────────────────
  if (user.role === 'teacher') {
    return (
      <div style={{ minHeight: '100vh', background: '#eff6ff' }}>
        {activeTab === 'home'   && <TeacherHome onNavigate={setActiveTab} />}
        {activeTab === 'imath'  && <TeacherView initialTab="generate" />}
        {activeTab === 'iread'  && <TeacherView initialTab="iread" />}
        {activeTab === 'points' && <TeacherView initialTab="students" />}
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} role="teacher" />
      </div>
    );
  }

  // ── Parent ───────────────────────────────────────────────────────────────
  if (user.role === 'parent') {
    return (
      <div style={{ minHeight: '100vh', background: '#f0fdfa' }}>
        {activeTab === 'home'   && <ParentHome onNavigate={setActiveTab} />}
        {activeTab === 'imath'  && <ParentMode initialSection="upload"  onExitToStudent={handleLogout} />}
        {activeTab === 'iread'  && <ParentMode initialSection="iread"   onExitToStudent={handleLogout} />}
        {activeTab === 'points' && <ParentMode initialSection="scores"  onExitToStudent={handleLogout} />}
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} role="parent" />
      </div>
    );
  }

  // ── Student ──────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f3f0ff' }}>
      {activeTab === 'home'   && <StudentHome onNavigate={setActiveTab} onTaskCount={setTaskCount} />}
      {activeTab === 'imath'  && <StudentMode onSwitchToParent={handleLogout} />}
      {activeTab === 'iread'  && <StudentIRead />}
      {activeTab === 'points' && <PointsScreen />}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        role="student"
        taskCount={taskCount}
      />
    </div>
  );
}

export default App;
