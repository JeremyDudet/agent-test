import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListeningStatus } from '../ListeningStatus';

describe('ListeningStatus', () => {
  it('shows "Not Listening" when isListening is false', () => {
    render(<ListeningStatus isListening={false} isRecording={false} />);
    expect(screen.getByText('Not Listening')).toBeInTheDocument();
  });

  it('shows "Listening" when isListening is true', () => {
    render(<ListeningStatus isListening={true} isRecording={false} />);
    expect(screen.getByText('Listening')).toBeInTheDocument();
    expect(screen.getByText('Ready for voice')).toBeInTheDocument();
  });

  it('shows "Recording" badge when isListening and isRecording are true', () => {
    render(<ListeningStatus isListening={true} isRecording={true} />);
    expect(screen.getByText('Recording')).toBeInTheDocument();
  });

  it('shows "Initializing" badge when isInitializing is true', () => {
    render(<ListeningStatus isListening={true} isRecording={false} isInitializing={true} />);
    expect(screen.getByText('Initializing...')).toBeInTheDocument();
    // Should not show the Recording/Ready status when initializing
    expect(screen.queryByText('Ready for voice')).not.toBeInTheDocument();
    expect(screen.queryByText('Recording')).not.toBeInTheDocument();
  });
}); 