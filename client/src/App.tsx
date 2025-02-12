import React from 'react';
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { AudioRecorder } from './components/AudioRecorder';
import { Auth } from './components/Auth';
import { AuthProvider, useAuth } from './components/AuthProvider';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <h1>Expense Tracker</h1>
      <AudioRecorder />
    </div>
  );
}

function App() {
  return (
    <MantineProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </MantineProvider>
  );
}

export default App;
