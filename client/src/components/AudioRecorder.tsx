// AudioRecorder.tsx
import React, { useState, useRef, useEffect } from 'react';
import RecordRTC from 'recordrtc';
import VAD from 'voice-activity-detection';
import { initSocket, getSocket, closeSocket, isSocketReady } from '../services/socket';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X, Edit, Mic, ChevronDown, ChevronRight, Brain, MessageSquare } from 'lucide-react';
import type {
  Proposal,
  SemanticContext,
  QueuedAudioChunk,
  TranscriptionResponse,
  AudioChunkMetadata,
  ExtendedVADOptions,
  AgentState,
} from '../types';
import { useAuth } from './AuthProvider';
import { useAppState } from '../hooks/useAppState';
import { DialogTrigger } from "@/components/ui/dialog";
import { mergePreRecordingBufferWithRecordedAudio } from '../services/audioMerging';
import { cn } from "@/lib/utils";
import { EditExpenseDialog } from './EditExpenseDialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";

interface VADInstance {
  destroy: () => void;
}

interface AudioRecorderProps {
  isRecording?: boolean;
  onConversationEntriesChange?: (entries: TranscriptionEntry[]) => void;
}

interface ListeningStatusProps {
  isListening: boolean;
  isProcessing: boolean;
  isInitializing: boolean;
  isVadInitializing: boolean;
  isNoiseAnalyzing: boolean;
  isRecording: boolean;
}

interface ThinkingIndicatorProps {
  isProcessing: boolean;
}

function ThinkingIndicator({ isProcessing }: ThinkingIndicatorProps) {
  if (!isProcessing) return null;
  
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
      <div className="flex items-center gap-1">
        <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse delay-150" />
        <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse delay-300" />
      </div>
      <span className="text-sm font-medium text-muted-foreground">
        Processing your expense...
      </span>
    </div>
  );
}

interface RecordButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  isInitializing: boolean;
  onClick: () => void;
}

function RecordButton({ isRecording, isProcessing, isInitializing, onClick }: RecordButtonProps) {
  return (
    <Button
      size="lg"
      variant="outline"
      className={cn(
        "relative h-24 w-24 rounded-full p-0 transition-all duration-300 ease-in-out",
        "hover:scale-105 active:scale-95",
        isRecording && "border-red-500 bg-red-50 text-red-500 hover:border-red-600 hover:bg-red-100 hover:text-red-600",
        isProcessing && "border-yellow-500 bg-yellow-50 text-yellow-500 hover:border-yellow-600 hover:bg-yellow-100 hover:text-yellow-600",
        isInitializing && "animate-pulse"
      )}
      disabled={isInitializing}
      onClick={onClick}
    >
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        {isRecording && (
          <>
            <div className="absolute inset-0">
              <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-20" />
              <div className="absolute inline-flex rounded-full h-full w-full bg-red-500 opacity-10" />
            </div>
            <div className="absolute inset-0">
              <div className="animate-ripple absolute inline-flex h-full w-full rounded-full border-4 border-red-500/30" />
            </div>
          </>
        )}
        <Mic className={cn(
          "h-10 w-10 transition-all duration-300 ease-in-out",
          isRecording && "text-red-500 animate-bounce scale-110",
          isProcessing && "text-yellow-500 animate-pulse scale-105",
          isInitializing && "text-muted-foreground"
        )} />
      </div>
    </Button>
  );
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString();
};

function ListeningStatus({ 
  isListening,
  isProcessing,
  isInitializing,
  isVadInitializing,
  isNoiseAnalyzing,
  isRecording 
}: ListeningStatusProps) {
  let status = "Ready";
  if (isInitializing) status = "Initializing...";
  if (isVadInitializing) status = "Calibrating microphone...";
  if (isNoiseAnalyzing) status = "Analyzing background noise...";
  if (isListening) status = "Listening...";
  if (isRecording) status = "Recording...";
  if (isProcessing) status = "Processing...";

  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "h-2.5 w-2.5 rounded-full transition-colors duration-200",
        isListening ? "bg-green-500 animate-pulse" : "bg-muted",
        isRecording && "bg-red-500 animate-pulse",
        isProcessing && "bg-yellow-500 animate-pulse"
      )} />
      <span className="text-sm font-medium">{status}</span>
    </div>
  );
}

export interface TranscriptionEntry {
  type: 'transcription' | 'ai_thought';
  content: string;
  timestamp: string;
}

interface DrawerTranscriptionProps {
  entries: TranscriptionEntry[];
  isProcessing: boolean;
  drawerTrigger?: React.ReactNode;
}

export function DrawerTranscription({ 
  entries,
  isProcessing,
  drawerTrigger 
}: DrawerTranscriptionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      {drawerTrigger ? (
        <DrawerTrigger asChild>
          {drawerTrigger}
        </DrawerTrigger>
      ) : null}
      <DrawerContent>
        <div className="mx-auto w-full max-w-2xl">
          <DrawerHeader className="border-b border-border">
            <DrawerTitle className="text-foreground">Conversation History</DrawerTitle>
            <DrawerDescription className="text-muted-foreground">Live transcription and AI analysis</DrawerDescription>
          </DrawerHeader>
          <div className="p-4 h-[50vh] overflow-y-auto">
            <div className="space-y-4">
              {entries.map((entry, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    entry.type === 'transcription' ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "flex max-w-[80%] items-start gap-2 rounded-lg px-4 py-2",
                      entry.type === 'transcription' 
                        ? "bg-primary text-primary-foreground dark:text-primary-foreground" 
                        : "bg-muted text-muted-foreground dark:bg-muted"
                    )}
                  >
                    {entry.type === 'transcription' ? (
                      <Mic className="mt-1 h-4 w-4 flex-shrink-0" />
                    ) : (
                      <Brain className="mt-1 h-4 w-4 flex-shrink-0" />
                    )}
                    <div className="flex-1 space-y-1">
                      <p className={cn(
                        "text-sm",
                        entry.type === 'transcription' 
                          ? "text-primary-foreground dark:text-primary-foreground"
                          : "text-foreground dark:text-foreground"
                      )}>
                        {entry.content}
                      </p>
                      <p className={cn(
                        "text-xs",
                        entry.type === 'transcription' 
                          ? "text-primary-foreground/70 dark:text-primary-foreground/70"
                          : "text-muted-foreground dark:text-muted-foreground"
                      )}>
                        {entry.timestamp}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DrawerFooter className="border-t border-border">
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function AudioRecorder({ isRecording: externalIsRecording, onConversationEntriesChange }: AudioRecorderProps) {
  const { session } = useAuth();
  console.log('[DEBUG] AudioRecorder mounted, session:', session ? 'present' : 'missing', 'token:', session?.access_token ? 'present' : 'missing');
  
  const { 
    state: {
      isProcessing,
      isListening,
      isInitializing,
      isVadInitializing,
      isNoiseAnalyzing,
      isRecording: isVoiceActive,
      error,
      transcriptions,
      proposals,
      userExpenseCategories
    },
    updateState,
    handleServerState,
    addTranscription,
    updateProposals,
    removeProposal,
    setError,
    reset
  } = useAppState();

  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);
  const [editProposalData, setEditProposalData] = useState<{ amount: number; date: string; category: string } | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [conversationEntries, setConversationEntries] = useState<TranscriptionEntry[]>([]);

  const semanticContextRef = useRef<SemanticContext>({
    timestamp: 0,
    isComplete: false,
    confidence: 0,
  });
  const recorderRef = useRef<RecordRTC | null>(null);
  const vadRef = useRef<VADInstance | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<QueuedAudioChunk[]>([]);
  const sequenceCounterRef = useRef<number>(0);
  const pendingTranscriptionsRef = useRef<Map<number, AudioChunkMetadata>>(new Map());
  const nextExpectedSequenceRef = useRef<number>(0);
  const voiceStartTimeRef = useRef<number | null>(null);
  const isVoiceActiveRef = useRef<boolean>(false);

  const BUFFER_DURATION = 200; // 100 millisecond buffer
  const PRE_RECORDING_BUFFER: Float32Array[] = [];

  // Initialize Voice Activity Detection (VAD) with the given audio stream
  const initializeVAD = async (stream: MediaStream) => {
    updateState({ isVadInitializing: true });
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    try {
      // Add error handling for AudioContext state
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Set up audio processing pipeline
      // Create audio source from input stream
      const source = audioContext.createMediaStreamSource(stream);

      // Load custom audio processor worklet for handling raw audio data
      await audioContext.audioWorklet.addModule('/audio-processor.js');

      // Create processor node instance
      const processor = new AudioWorkletNode(audioContext, 'audio-processor');

      // Handle processed audio data from worklet
      // Maintains a circular buffer of recent audio data
      processor.port.onmessage = (e) => {
        if (!isVoiceActiveRef.current) {
          PRE_RECORDING_BUFFER.push(new Float32Array(e.data));
          // Remove oldest data if buffer exceeds size limit
          if (PRE_RECORDING_BUFFER.length > BUFFER_DURATION / (4096 / audioContext.sampleRate)) {
            PRE_RECORDING_BUFFER.shift();
          }
        }
      };

      // Connect audio source to processor
      source.connect(processor);

      const vadOptions: ExtendedVADOptions = {
        onVoiceStart: () => {
          if (!recorderRef.current) {
            console.error('[VAD] Recorder not initialized');
            return;
          }

          isVoiceActiveRef.current = true;
          console.log('[VAD] Voice started');
          voiceStartTimeRef.current = Date.now();

          try {
            // Ensure recorder is in ready state before starting
            if (recorderRef.current.state === 'inactive' || recorderRef.current.state === 'stopped') {
              recorderRef.current?.startRecording();
              console.log('[VAD] Recording started');
            } else {
              console.warn('[VAD] Recorder already active, state:', recorderRef.current.state);
            }
          } catch (err) {
            console.error('[VAD] Error starting recording:', err);
            setError(err instanceof Error ? err.message : String(err));
          }
        },

        onVoiceStop: async () => {
          isVoiceActiveRef.current = false;
          console.log('[VAD] Voice stopped');

          if (!recorderRef.current) {
            console.warn('[VAD] No recorder instance available');
            return;
          }

          // Add a small delay to capture trailing audio
          await new Promise((resolve) => setTimeout(resolve, 300));

          try {
            const voiceEndTime = Date.now();
            const duration = voiceStartTimeRef.current ? voiceEndTime - voiceStartTimeRef.current : 0;

            if (duration < 150) {
              console.log('[VAD] Chunk < 1/3 second. Discarding...');
              await new Promise<void>((resolve) => {
                recorderRef.current?.stopRecording(() => {
                  recorderRef.current?.reset();
                  resolve();
                });
              });
              return;
            }

            // Stop and get final blob
            const blob = await new Promise<Blob>((resolve, reject) => {
              if (!recorderRef.current) {
                reject(new Error('Recorder not initialized'));
                return;
              }
              recorderRef.current.stopRecording(() => {
                const b = recorderRef.current?.getBlob();
                if (b) {
                  resolve(b);
                } else {
                  reject(new Error('Failed to get recording blob'));
                }
              });
            });

            // Merge the 1-second pre-recording buffer with RecordRTC's blob
            const mergedBlob = await mergePreRecordingBufferWithRecordedAudio(
              PRE_RECORDING_BUFFER, // your ring buffer array
              blob,
              audioContextRef.current || null // your AudioContext
            );

            // Clear the buffer once merged
            PRE_RECORDING_BUFFER.length = 0;

            // Convert mergedBlob to ArrayBuffer and push to queue
            const audioBuffer = await mergedBlob.arrayBuffer();
            const currentSequence = sequenceCounterRef.current++;

            audioQueueRef.current.push({
              audio: audioBuffer,
              context: semanticContextRef.current,
              timestamp: Date.now(),
              sequenceId: currentSequence,
            });

            processQueue();
            recorderRef.current?.reset();
          } catch (err) {
            console.error('[VAD] Error processing voice segment:', err);
            setError(err instanceof Error ? err.message : String(err));
          }
        },

        onUpdate: (amplitude: number) => {
          // if recording is active, log amplitude
          if (isVoiceActive) {
            console.log('[VAD] Amplitude:', amplitude);
          }
        },

        // VAD configuration parameters
        bufferLen: 1024,
        avgNoiseMultiplier: 1.5,
        minNoiseLevel: 0.3, // Reduced sensitivity
        maxNoiseLevel: 0.7, // Increased range
        minCaptureFreq: 85, // Voice frequency range
        maxCaptureFreq: 255,
        noiseCaptureDuration: 2000, // Longer noise analysis
        minSpeechDuration: 250, // Minimum 250ms of speech
        maxSpeechDuration: 60000, // Maximum 60s per segment (1 minute)
        silenceDuration: 1500, // Shorter silence detection
        smoothingTimeConstant: 0.2, // More smoothing
        audioBuffering: {
          enabled: true,
          duration: 500,
        },
      };

      // Initialize Voice Activity Detection with configuration
      console.log('[VAD] Starting noise analysis...');
      updateState({ isNoiseAnalyzing: true });
      vadRef.current = await VAD(audioContext, stream, vadOptions);
      console.log('[VAD] Voice Activity Detection initialized with options:', vadOptions);
      
      // Wait for noise analysis to complete (2000ms as per noiseCaptureDuration)
      await new Promise(resolve => setTimeout(resolve, 2000));
      updateState({ isNoiseAnalyzing: false });
      
    } catch (err) {
      console.error('[VAD] Error initializing:', err);
      throw err;
    } finally {
      updateState({ isVadInitializing: false });
    }
  };

  // Process audio chunks from the queue and send them to the server for transcription
  const processQueue = async () => {
    console.log('[DEBUG] ProcessQueue called:', {
      isProcessing,
      queueLength: audioQueueRef.current.length,
    });

    // Skip if already processing or queue is empty
    if (isProcessing || audioQueueRef.current.length === 0) {
      console.log(
        '[QUEUE] Skipping - isProcessing:',
        isProcessing,
        'queueLength:',
        audioQueueRef.current.length
      );
      return;
    }

    // Set processing flag to prevent concurrent processing
    updateState({ isProcessing: true });
    console.log('[QUEUE] Starting queue processing');

    // Process chunks while there are items in the queue
    while (audioQueueRef.current.length > 0) {
      // Get the next chunk from the front of the queue
      const chunk = audioQueueRef.current[0];
      console.log('[QUEUE] Processing chunk with sequenceId:', chunk.sequenceId);

      try {
        // Create a promise to handle the server communication
        await new Promise<void>((resolve, reject) => {
          console.log('[QUEUE] Setting up server communication for chunk:', chunk.sequenceId);

          // Set timeout of 5 seconds for server response
          const timeout = setTimeout(() => reject(new Error('Server timeout')), 5000);

          // Send audio chunk to server via socket
          getSocket().emit(
            'audioData',
            {
              audio: chunk.audio,
              context: chunk.context,
              sequenceId: chunk.sequenceId,
              timestamp: chunk.timestamp,
            },
            (response: TranscriptionResponse) => {
              // Clear timeout since we got a response
              clearTimeout(timeout);

              if (response.success) {
                console.log('[QUEUE] Successfully processed chunk:', chunk.sequenceId);
                // Store the transcription with metadata in pending transcriptions map
                pendingTranscriptionsRef.current.set(chunk.sequenceId, {
                  sequenceId: chunk.sequenceId,
                  timestamp: chunk.timestamp,
                  isProcessed: true,
                  transcription: response.transcription,
                });

                console.log(
                  '[QUEUE] Added to pending transcriptions, current size:',
                  pendingTranscriptionsRef.current.size
                );

                // Process any transcriptions that are ready to be ordered
                processOrderedTranscriptions();
                resolve();
              } else {
                // Reject if server returned an error
                console.error(
                  '[QUEUE] Server returned error for chunk:',
                  chunk.sequenceId,
                  response.error
                );
                reject(new Error(response.error || 'Unknown error occurred'));
              }
            }
          );
        });

        // Remove processed chunk from queue after successful processing
        audioQueueRef.current.shift();
        console.log(
          '[QUEUE] Removed processed chunk, remaining queue size:',
          audioQueueRef.current.length
        );
      } catch (err) {
        // Log error and update error state
        console.error('[QUEUE] Error processing chunk:', err);

        // Handle timeout errors specifically
        if (err instanceof Error && err.message === 'Server timeout') {
          console.warn('[QUEUE] Server timeout occurred for chunk:', chunk.sequenceId);
          // Optional: Implement retry logic here
          // Example: if (retryCount < maxRetries) { ... }
        }

        // Set error state and break processing loop
        setError(err instanceof Error ? err.message : String(err));
        break;
      }
    }

    // Reset processing flag when done
    updateState({ isProcessing: false });
    console.log('[QUEUE] Queue processing complete, processing flag reset');
  };

  // Helper function to process transcriptions in order
  const processOrderedTranscriptions = () => {
    const pending = pendingTranscriptionsRef.current;
    while (pending.has(nextExpectedSequenceRef.current)) {
      const nextChunk = pending.get(nextExpectedSequenceRef.current)!;

      if (nextChunk.transcription) {
        addTranscription(nextChunk.transcription);
        const newEntries = [...conversationEntries, {
          type: 'transcription' as const,
          content: nextChunk.transcription,
          timestamp: new Date().toLocaleTimeString()
        }];
        setConversationEntries(newEntries);
        onConversationEntriesChange?.(newEntries);
      }

      pending.delete(nextExpectedSequenceRef.current);
      nextExpectedSequenceRef.current++;
    }
  };

  // Function to start audio recording with voice activity detection
  const startListening = async () => {
    if (!socketConnected) {
      setError('Socket not connected. Please try again.');
      return;
    }
    sequenceCounterRef.current = 0;
    console.log('[CLIENT] Start Listening... invoked');
    updateState({ isInitializing: true });

    try {
      // Clean up any existing resources first
      await cleanupAudioResources();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Initialize recorder before VAD to ensure it's ready
      recorderRef.current = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/wav',
        recorderType: RecordRTC.StereoAudioRecorder,
        numberOfAudioChannels: 1,
        desiredSampRate: 48000,
        disableLogs: false,
      });

      // Verify recorder initialization
      if (!recorderRef.current) {
        throw new Error('Failed to initialize recorder');
      }

      // Initialize VAD after recorder is ready
      await initializeVAD(stream);

      // Add a small delay after VAD initialization
      await new Promise((resolve) => setTimeout(resolve, 2100));

      if (!getSocket().connected) {
        throw new Error('Socket not connected');
      }

      reset();
      updateState({ isListening: true });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await cleanupAudioResources();
    } finally {
      updateState({ isInitializing: false });
    }
  };

  const stopListening = () => {
    console.log('[CLIENT] STOP Listening invoked');

    // Immediately update UI state
    updateState({ isListening: false });
    updateState({ isRecording: false });

    // First, destroy VAD instance to stop amplitude logging
    if (vadRef.current) {
      console.log('[CLEANUP] Destroying VAD instance');
      vadRef.current.destroy();
      vadRef.current = null;
    }

    // Then stop the recorder if it exists
    if (recorderRef.current) {
      recorderRef.current.stopRecording(() => {
        getSocket().emit('audioComplete');
        cleanupAudioResources();
        console.log('[CLEANUP] Audio resources cleaned up');
      });
    } else {
      // If no recorder exists, still cleanup
      cleanupAudioResources();
      console.log('[CLEANUP] Audio resources cleaned up');
    }
  };

  const cleanupAudioResources = () => {
    console.log('[CLEANUP] Starting cleanup of audio resources');
    try {
      console.log('[CLEANUP] Setting voice active state to false');
      updateState({ 
        isRecording: false, 
        isVadInitializing: false,
        isNoiseAnalyzing: false 
      });

      if (vadRef.current) {
        console.log('[CLEANUP] Destroying VAD instance');
        vadRef.current.destroy();
        vadRef.current = null;
      }

      if (audioContextRef.current) {
        console.log('[CLEANUP] Closing audio context');
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      console.log('[CLEANUP] Clearing audio queue');
      audioQueueRef.current = [];

      if (recorderRef.current) {
        console.log('[CLEANUP] Cleaning up recorder and media stream');
        const recorder = recorderRef.current.getInternalRecorder();
        if (recorder && 'stream' in recorder) {
          const mediaRecorder = recorder as { stream: MediaStream };
          mediaRecorder.stream.getTracks().forEach((track) => {
            console.log('[CLEANUP] Stopping media track:', track.kind);
            track.stop();
          });
        }
        recorderRef.current = null;
      }

      console.log('[CLEANUP] Resetting transcription state');
      pendingTranscriptionsRef.current.clear();
      nextExpectedSequenceRef.current = 0;
      reset();

      console.log('[CLEANUP] Audio resource cleanup completed successfully');
    } catch (err) {
      console.error('[CLEANUP] Error cleaning up audio resources:', err);
    }
  };

  useEffect(() => {
    // Socket event handlers
    const handleConnect = () => {
      console.log('[SOCKET] Connected');
      setSocketConnected(true);
    };

    const handleDisconnect = () => {
      console.log('[SOCKET] Disconnected');
      setSocketConnected(false);
    };

    const handleTranscription = (response: TranscriptionResponse) => {
      console.log('[SOCKET] Transcription received:', response);
      if (response.transcription) {
        addTranscription(response.transcription);
        const newEntries = [...conversationEntries, {
          type: 'transcription' as const,
          content: response.transcription,
          timestamp: new Date().toLocaleTimeString()
        }];
        setConversationEntries(newEntries);
        onConversationEntriesChange?.(newEntries);
      }
    };

    const handleProposals = (data: { proposals: Proposal[] }) => {
      console.log('[SOCKET] Proposals update received:', data);
      updateProposals(data.proposals);
      // Add AI thought entry when proposals are received
      const newEntries = [...conversationEntries, {
        type: 'ai_thought' as const,
        content: `Analyzed expense patterns and generated ${data.proposals.length} proposal${data.proposals.length === 1 ? '' : 's'}.`,
        timestamp: new Date().toLocaleTimeString()
      }];
      setConversationEntries(newEntries);
      onConversationEntriesChange?.(newEntries);
    };

    const handleStateChanged = (serverState: AgentState) => {
      console.log('[SOCKET] State update received:', serverState);
      handleServerState(serverState);
    };

    const handleError = (error: { message: string }) => {
      console.error('[SOCKET] Error:', error);
      setError(error.message);
    };

    // Initialize socket and set up socket event listeners
    if (session?.access_token) {
      const socket = initSocket(session.access_token);
      
      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('transcription', handleTranscription);
      socket.on('proposals', handleProposals);
      socket.on('stateChanged', handleStateChanged);
      socket.on('error', handleError);
    }

    // Cleanup function
    return () => {
      if (isSocketReady()) {
        const socket = getSocket();
        socket.off('connect', handleConnect);
        socket.off('disconnect', handleDisconnect);
        socket.off('transcription', handleTranscription);
        socket.off('proposals', handleProposals);
        socket.off('stateChanged', handleStateChanged);
        socket.off('error', handleError);
      }
      closeSocket();
    };
  }, [session, onConversationEntriesChange]);

  const handleApprove = (proposal: Proposal) => {
    if (!isSocketReady()) {
      setError('Socket not connected');
      return;
    }
    getSocket().emit('proposalApproved', proposal);
    removeProposal(proposal.id!);
  };

  const handleReject = (proposal: Proposal) => {
    if (!isSocketReady()) {
      setError('Socket not connected');
      return;
    }
    getSocket().emit('proposalRejected', proposal);
    removeProposal(proposal.id!);
  };
  
  const handleEdit = (proposal: Proposal) => {
    setEditingProposal(proposal);
    setEditProposalData({
      amount: Number(proposal.amount) || 0,
      date: proposal.date || new Date().toISOString().slice(0, 10),
      category: proposal.suggestedCategory || ''
    });
  };
  
  const handleSaveEdit = () => {
    if (editingProposal && editProposalData) {
      const updatedProposal = {
        ...editingProposal,
        amount: editProposalData.amount,
        date: editProposalData.date,
        category: editProposalData.category,
        suggestedCategory: editProposalData.category
      };
      getSocket().emit('proposalEdited', updatedProposal);
      setEditingProposal(null);
      setEditProposalData(null);
    }
  };
  
  const handleCancelEdit = () => {
    setEditingProposal(null);
    setEditProposalData(null);
  };

  // Watch for external recording state changes
  useEffect(() => {
    if (externalIsRecording && !isListening) {
      startListening();
    } else if (!externalIsRecording && isListening) {
      stopListening();
    }
  }, [externalIsRecording]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border-l-4 border-red-500 bg-red-100 p-4 text-red-700">
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle>Record Expense</CardTitle>
              <CardDescription>
                Record your expenses by speaking naturally. For example: "I spent $42 on lunch at Subway today"
              </CardDescription>
            </div>
            <ListeningStatus
              isListening={isListening}
              isProcessing={isProcessing}
              isInitializing={isInitializing}
              isVadInitializing={isVadInitializing}
              isNoiseAnalyzing={isNoiseAnalyzing}
              isRecording={isVoiceActive}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-4 py-6">
            <RecordButton
              isRecording={isVoiceActive}
              isProcessing={isProcessing}
              isInitializing={isInitializing || isVadInitializing || isNoiseAnalyzing}
              onClick={() => {
                if (isListening) {
                  stopListening();
                } else {
                  startListening();
                }
              }}
            />
            <div className="text-center text-sm text-muted-foreground">
              {isListening ? "Click to stop recording" : "Click to start recording"}
            </div>
          </div>
        </CardContent>
      </Card>

      {conversationEntries.length > 0 && (
        <DrawerTranscription
          entries={conversationEntries}
          isProcessing={isProcessing}
        />
      )}

      <EditExpenseDialog
        proposal={editingProposal}
        onClose={handleCancelEdit}
        onSave={handleSaveEdit}
        categories={userExpenseCategories}
      />
    </div>
  );
}
