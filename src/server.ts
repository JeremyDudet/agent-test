import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { Server } from "socket.io";
import { createServer } from "http";
import { expenseApp } from "./core/ExpenseWorkflow";
import { HumanMessage } from "@langchain/core/messages";
import { OpenAI } from "openai";
import type { Request, Response, RequestHandler } from 'express';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(bodyParser.json());

// Handle WebSocket connections
io.on('connection', (socket) => {
  console.log('Client connected');
  let audioChunks: Buffer[] = [];
   // Called with batched chunks
   socket.on('audioDataPartial', async (data) => {
    console.log('[SERVER] Received partial chunk');
    try {
      // Validate incoming data
      if (!data || !data.byteLength) {
        throw new Error('Invalid audio data received');
      }

      const buffer = Buffer.from(data);
      console.log('[SERVER] Processing chunk, size:', buffer.byteLength);
      
      // Create a File object with proper error handling
      let file;
      try {
        file = new File([buffer], 'audio-chunk.wav', { type: 'audio/wav' });
      } catch (err) {
        throw new Error(`Failed to create File object: ${err instanceof Error ? err.message : String(err)}`);
      }
      
      console.log('[SERVER] Created File object, sending to Whisper...');
      
      // Process through Whisper
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        language: 'en'
      });
      
      console.log('[SERVER] Transcription received:', transcription.text);
      
      // Only process non-empty transcriptions
      if (transcription.text.trim()) {
        const finalState = await expenseApp.invoke({
          messages: [new HumanMessage(transcription.text)],
        }, {
          configurable: {
            thread_id: socket.id,
            checkpoint_ns: 'expense-tracker',
          },
        });
  
        const { messages } = finalState;
        const lastMessage = messages[messages.length - 1];
        
        if (lastMessage?.content) {
          console.log('[SERVER] Content type:', typeof lastMessage.content);
          console.log('[SERVER] Raw content:', lastMessage.content);
          let parsed;
          try {
            // First check if content is already an object
            if (typeof lastMessage.content === 'object') {
              parsed = lastMessage.content;
            } else {
              // Only try to parse if it's a string
              const contentStr = lastMessage.content.toString().trim();
              try {
                parsed = JSON.parse(contentStr);
              } catch {
                // If JSON parsing fails, use the string content directly
                parsed = contentStr;
              }
            }
            
            // Emit proposals immediately if they exist
            if (parsed.expense_proposals || parsed.proposals || parsed.action === "add_expense") {
              const proposals = parsed.expense_proposals || parsed.proposals || [parsed];
              console.log('[SERVER] Emitting proposals:', proposals);
              socket.emit('proposals', { proposals });
            } else {
              console.log('[SERVER] Parsed content but no proposals found:', parsed);
            }
          } catch (err) {
            console.warn('[SERVER] Failed to parse message content:', err);
            // Try to extract expense information using regex as fallback
            const contentStr = lastMessage.content.toString();
            const amountRegex = /\$(\d+)/g;
            const amounts = [...contentStr.matchAll(amountRegex)];
            
            if (amounts.length > 0) {
              const proposals = amounts.map(match => ({
                action: 'add_expense',
                parameters: {
                  amount: parseInt(match[1]),
                  description: lastMessage.content
                }
              }));
              console.log('[SERVER] Generated fallback proposals:', proposals);
              socket.emit('proposals', { proposals });
            }
          }
        }
      }
    } catch (error: unknown) {
      console.error('[SERVER] Error processing chunk:', error);
      socket.emit('error', { 
        message: `Error processing chunk: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  });

  // Called when user is fully done, or to finalize the entire chunk
  socket.on('audioData', (data) => {
  console.log('Received final chunk. Byte length:', data.byteLength);
  audioChunks.push(Buffer.from(data));
  });
  socket.on('audioComplete', async () => {
  console.log('audioComplete event triggered. Combining chunks...');
  try {
  const audioBuffer = Buffer.concat(audioChunks);
  console.log('Combined audioBuffer size:', audioBuffer.byteLength);
  // Create a File object to send to Whisper
  const file = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });
  console.log('Sending file to Whisper...');
  const transcription = await openai.audio.transcriptions.create({
  file,
  model: 'whisper-1',
  language: 'en'
  });
  console.log('Final transcription:', transcription.text);
  // Process logic in your expense workflow:
  const finalState = await expenseApp.invoke(
  {
  messages: [new HumanMessage(transcription.text)],
  },
  {
  configurable: {
  thread_id: socket.id,
  checkpoint_ns: 'expense-tracker',
  },
  }
  );
  const { messages } = finalState;
  const lastMessage = messages[messages.length - 1];
  let parsed;
  if (lastMessage?.content) {
  try {
  parsed = JSON.parse(
  typeof lastMessage.content === 'string'
  ? lastMessage.content
  : JSON.stringify(lastMessage.content)
  );
  } catch (err) {
  parsed = lastMessage.content;
  }
  }
  socket.emit('proposals', { proposals: parsed || null });
  audioChunks = [];
  console.log('audioChunks reset, ready for next recording.');
  } catch (err) {
  console.error('Error processing audio:', err);
  socket.emit('error', { message: 'Error processing audio' });
  }
  });
  socket.on('disconnect', () => {
  console.log('Client disconnected, clearing audioChunks');
  audioChunks = [];
  });
  });

const handleMessages: RequestHandler = async (req: Request, res: Response) => {
  const { text, threadId } = req.body;
  console.log("handleMessages called with text:", text, "and threadId:", threadId);

  if (typeof text !== "string") {
    res.status(400).json({ error: "Text must be a string" });
    return;
  }

  try {
    const finalState = await expenseApp.invoke(
      {
        messages: [new HumanMessage(text)],
      },
      {
        configurable: {
          thread_id: threadId || "demo-thread",
          checkpoint_ns: "expense-tracker",
        },
      }
    );
    console.log("Expense workflow finalState (text endpoint):", finalState);

    const { messages } = finalState;
    const lastMessage = messages[messages.length - 1];

    let parsed;
    if (lastMessage?.content) {
      try {
        parsed = JSON.parse(
          typeof lastMessage.content === 'string'
            ? lastMessage.content
            : JSON.stringify(lastMessage.content)
        );
      } catch (err) {
        parsed = lastMessage.content;
      }
    }

    console.log("Parsed proposals (text endpoint):", parsed);
    res.json({ proposals: parsed || null });
  } catch (err) {
    console.error("Error handling request:", err);
    res.status(500).json({ error: "Server error" });
  }
};

app.post("/api/messages", handleMessages);

const router = express.Router();

router.post("/api/messages", handleMessages);

app.use(router);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
