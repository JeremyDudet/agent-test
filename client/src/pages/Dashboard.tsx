import React from 'react';
import { AudioRecorder } from '../components/AudioRecorder';
import useStore from '../store/useStore';

export function Dashboard() {
  const { user } = useStore();

  return (
    <div className="flex-1 space-y-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Voice Expense Recorder</h2>
      </div>

      <div className="grid gap-6">
        <div className="col-span-full">
          <AudioRecorder />
        </div>
      </div>
    </div>
  );
} 