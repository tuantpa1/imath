import { useState, useEffect } from 'react';
import './App.css';
import { authService, onUnauthorized } from './services/authService';
import type { AuthUser } from './services/authService';
import LoginPage from './pages/LoginPage';
import StudentMode from './pages/StudentMode';
import ParentMode from './pages/ParentMode';
import AdminDashboard from './pages/AdminDashboard';
import TeacherView from './pages/TeacherView';
import ModuleSwitcher from './components/ModuleSwitcher';
import IReadComingSoon from './components/iread/IReadComingSoon';

function App() {
  const [user, setUser] = useState<AuthUser | null>(() => authService.getCurrentUser());
  const [activeModule, setActiveModule] = useState<'imath' | 'iread'>('imath');

  // Auto-logout when any API call returns 401 (expired/invalid token)
  useEffect(() => {
    return onUnauthorized(() => {
      setUser(null);
    });
  }, []);

  const handleLogin = (loggedInUser: AuthUser) => setUser(loggedInUser);

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setActiveModule('imath');
  };

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Admin and teacher roles: no module switcher, direct to their dashboards
  if (user.role === 'admin') {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  if (user.role === 'teacher') {
    return <TeacherView onLogout={handleLogout} />;
  }

  // Student and parent roles: show module switcher
  return (
    <div className="min-h-screen bg-gray-50">
      <ModuleSwitcher activeModule={activeModule} onSwitch={setActiveModule} />
      {activeModule === 'iread' ? (
        <IReadComingSoon />
      ) : user.role === 'student' ? (
        <StudentMode onSwitchToParent={handleLogout} />
      ) : (
        <ParentMode onExitToStudent={handleLogout} />
      )}
    </div>
  );
}

export default App;
