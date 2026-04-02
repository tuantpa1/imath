import { useState, useEffect } from 'react';
import './App.css';
import { authService, onUnauthorized } from './services/authService';
import type { AuthUser } from './services/authService';
import LoginPage from './pages/LoginPage';
import StudentMode from './pages/StudentMode';
import ParentMode from './pages/ParentMode';
import AdminDashboard from './pages/AdminDashboard';
import TeacherView from './pages/TeacherView';

function App() {
  const [user, setUser] = useState<AuthUser | null>(() => authService.getCurrentUser());

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
  };

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (user.role === 'student') {
    return <StudentMode onSwitchToParent={handleLogout} />;
  }

  if (user.role === 'parent') {
    return <ParentMode onExitToStudent={handleLogout} />;
  }

  if (user.role === 'admin') {
    return <AdminDashboard onLogout={handleLogout} />;
  }

  if (user.role === 'teacher') {
    return <TeacherView onLogout={handleLogout} />;
  }

  return null;
}

export default App;
