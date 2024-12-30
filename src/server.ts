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
io.on("connection", (socket) => {
  console.log("Client connected");
  
  let audioChunks: Buffer[] = [];
  
  socket.on("audioData", (data) => {
    console.log("Received audioData. Byte length:", data.byteLength);
    audioChunks = [Buffer.from(data)]; // Reset and store single chunk
    console.log("audioChunks size:", audioChunks.length);
  });
  
  socket.on("audioComplete", async () => {
    console.log("audioComplete event triggered. Combining chunks...");
    try {
      const audioBuffer = Buffer.concat(audioChunks);
      console.log("Combined audioBuffer size:", audioBuffer.byteLength);
      
      // Log the first 32 bytes of the audio buffer to check format
      console.log("First 32 bytes:", Buffer.from(audioBuffer).slice(0, 32));
      
      const tempFilePath = `/tmp/audio-${Date.now()}.wav`;
      await Bun.write(tempFilePath, audioBuffer);
      
      // Create a BunFile instance
      const bunFile = Bun.file(tempFilePath, { type: "audio/wav" });
      const fileBuffer = await bunFile.arrayBuffer();
      
      // Log the first 32 bytes of the file to verify it matches
      console.log("First 32 bytes of file:", Buffer.from(fileBuffer).slice(0, 32));
      
      const file = new File([fileBuffer], "audio.wav", {
        type: "audio/wav",
        lastModified: Date.now(),
      });

      console.log("File details:", {
        size: file.size,
        type: file.type,
        name: file.name
      });

      console.log("Sending file to OpenAI Whisper...");
      try {
        const transcription = await openai.audio.transcriptions.create({
          file,
          model: "whisper-1",
          language: "en",
          response_format: "verbose_json",
          temperature: 0.2,
          prompt: "This is an expense-related voice message in English."
        });
        
        console.log("Full Whisper response:", JSON.stringify(transcription, null, 2));
        
        if (!transcription.text || transcription.text.trim().length === 0) {
          throw new Error("Empty transcription received");
        }
        
        console.log("Raw transcription:", transcription);
        console.log("Transcription text:", transcription.text);

        const finalState = await expenseApp.invoke(
          {
            messages: [new HumanMessage(transcription.text)],
          },
          {
            configurable: {
              thread_id: socket.id,
              checkpoint_ns: "expense-tracker",
            },
          }
        );
        console.log("Expense workflow finalState:", finalState);

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

        console.log("Parsed proposals:", parsed);
        socket.emit("proposals", { proposals: parsed || null });
        
        audioChunks = [];
        console.log("audioChunks reset, ready for next recording.");
        
      } catch (whisperError) {
        console.error("Error processing audio:", whisperError);
        socket.emit("error", { message: "Error processing audio" });
      }
    } catch (err) {
      console.error("Error processing audio:", err);
      socket.emit("error", { message: "Error processing audio" });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected, clearing audioChunks");
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
