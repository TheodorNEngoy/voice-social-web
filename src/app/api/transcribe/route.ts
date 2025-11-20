import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    // Read raw audio bytes from the request
    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Wrap the buffer as a File for the OpenAI SDK
    const file = await toFile(buffer, "audio.webm", {
      type: "audio/webm",
    });

    // Call OpenAI's transcription API with the best STT model
    const transcription = await client.audio.transcriptions.create({
      model: "gpt-4o-transcribe",
      file,
    });

    return NextResponse.json(
      { text: (transcription as any).text ?? (transcription as any).output_text ?? "" },
      { status: 200 }
    );
  } catch (err) {
    console.error("Transcription error", err);
    return NextResponse.json(
      { error: "Failed to transcribe audio" },
      { status: 500 }
    );
  }
}
