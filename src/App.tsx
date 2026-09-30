import { Navigate, Route, Routes } from 'react-router-dom';
import { OfflineBanner } from './components/common/OfflineBanner';
import { AuthProvider } from './context/AuthContext';
import { isFirebaseConfigured, missingFirebaseEnv } from './firebase';
import { Home } from './pages/Home/Home';

function MissingConfig() {
  return (
    <main className="page page--narrow">
      <div className="banner banner--error" role="alert">
        <span>
          إعدادات Firebase غير مكتملة. انسخ <code>.env.example</code> إلى <code>.env</code> واملأ:{' '}
          <bdi dir="ltr">{missingFirebaseEnv.join(', ')}</bdi> ثم أعد تشغيل الخادم.
        </span>
      </div>
    </main>
  );
}

export default function App() {
  if (!isFirebaseConfigured) return <MissingConfig />;
  return (
    <AuthProvider>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
