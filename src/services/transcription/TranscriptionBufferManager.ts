import { EventEmitter } from "events";
import { LoggingService, LogLevel } from "../logging/LoggingService";

export class TranscriptionBufferManager extends EventEmitter {
  private buffer: string = "";
  private interimBuffer: string = "";
  private lastProcessedLength: number = 0;
  private logger: LoggingService;
  private readonly PHRASE_DELIMITERS = /[.!?]/;
  private readonly MIN_PHRASE_LENGTH = 5;
  private lastPhrase: string = "";
  private lastPhraseTime: number = 0;
  private readonly MIN_PHRASE_INTERVAL = 500;
  private isProcessingFinal: boolean = false;

  // Refined hallucination patterns
  private readonly HALLUCINATION_PATTERNS = [
    // Common video endings (only when they appear alone)
    /^(thank you|thanks) for watching[.!?]?\s*$/i,
    /^don't forget to subscribe[.!?]?\s*$/i,
    /^see you (in|next)[.!?]?\s*$/i,

    // Empty or purely punctuation phrases
    /^[\s.!?]*$/,

    // Exact duplicates in sequence
    /^(.+)\1+$/i,
  ];

  constructor() {
    super();
    this.logger = LoggingService.getInstance();
  }

  private isHallucination(text: string): boolean {
    const normalizedText = text.toLowerCase().trim();

    // Check against hallucination patterns
    const isKnownHallucination = this.HALLUCINATION_PATTERNS.some((pattern) =>
      pattern.test(normalizedText)
    );

    if (isKnownHallucination) {
      this.logger.log(
        LogLevel.DEBUG,
        "Filtered known hallucination",
        "TranscriptionBufferManager",
        { phrase: text }
      );
      return true;
    }

    return false;
  }

  appendInterimTranscript(text: string): void {
    if (!text.trim()) return;

    // Replace or update overlapping content
    const overlap = this.findOverlap(this.interimBuffer, text);
    if (overlap > 0) {
      this.interimBuffer = this.interimBuffer.slice(0, -overlap) + text;
    } else {
      this.interimBuffer += " " + text;
    }

    this.interimBuffer = this.interimBuffer.trim();
    this.emit("interimTranscript", this.interimBuffer);
  }

  appendFinalTranscript(text: string): void {
    if (!text.trim()) return;

    // Clear interim buffer since we have final text
    this.interimBuffer = "";

    // Append to main buffer and process
    this.buffer += " " + text;
    this.buffer = this.buffer.trim();
    this.processBuffer(true);
  }

  private findOverlap(prev: string, current: string): number {
    let overlap = 0;
    const minLength = Math.min(prev.length, current.length);

    for (let i = 1; i <= minLength; i++) {
      if (prev.endsWith(current.slice(0, i))) {
        overlap = i;
      }
    }
    return overlap;
  }

  private processBuffer(isFinal: boolean): void {
    if (this.isProcessingFinal) return;

    try {
      this.isProcessingFinal = isFinal;
      const phrases = this.buffer
        .slice(this.lastProcessedLength)
        .split(this.PHRASE_DELIMITERS)
        .map((phrase) => phrase.trim())
        .filter((phrase) => phrase.length > 0);

      if (phrases.length > 1 || (isFinal && phrases.length > 0)) {
        // Process all phrases if final, otherwise all except last
        const phrasesToProcess = isFinal ? phrases : phrases.slice(0, -1);
        const completePhrasesText = phrasesToProcess.join(". ").trim();

        if (
          completePhrasesText.length >= this.MIN_PHRASE_LENGTH &&
          !this.isHallucination(completePhrasesText)
        ) {
          const now = Date.now();
          if (now - this.lastPhraseTime >= this.MIN_PHRASE_INTERVAL) {
            this.emit("bufferUpdated", completePhrasesText);
            this.lastPhrase = completePhrasesText;
            this.lastPhraseTime = now;
            this.lastProcessedLength += completePhrasesText.length;
          }
        }
      }
    } finally {
      this.isProcessingFinal = false;
    }
  }

  clear(): void {
    this.buffer = "";
    this.interimBuffer = "";
    this.lastProcessedLength = 0;
    this.lastPhrase = "";
    this.lastPhraseTime = 0;
  }

  getLastPhrase(): string {
    return this.lastPhrase;
  }

  getFullTranscript(): string {
    return this.buffer.trim();
  }
}
