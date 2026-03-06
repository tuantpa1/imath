import { useState } from 'react';
import './App.css';
import StudentMode from './pages/StudentMode';
import ParentMode from './pages/ParentMode';
import PinModal from './components/PinModal';

type Mode = 'student' | 'parent';

function App() {
  const [mode, setMode] = useState<Mode>('student');
  const [showPinModal, setShowPinModal] = useState(false);

  const handleSwitchToParent = () => setShowPinModal(true);

  const handlePinSuccess = () => {
    setShowPinModal(false);
    setMode('parent');
  };

  const handlePinCancel = () => setShowPinModal(false);

  const handleExitToStudent = () => setMode('student');

  return (
    <>
      {mode === 'student' && (
        <StudentMode onSwitchToParent={handleSwitchToParent} />
      )}
      {mode === 'parent' && (
        <ParentMode onExitToStudent={handleExitToStudent} />
      )}
      {showPinModal && (
        <PinModal onSuccess={handlePinSuccess} onCancel={handlePinCancel} />
      )}
    </>
  );
}

export default App;
