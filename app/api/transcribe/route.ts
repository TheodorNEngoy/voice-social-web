import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const arrayBuffer = await req.arrayBuffer();

    const file = await toFile(arrayBuffer, "audio.webm", {
      type: "audio/webm",
    });

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
