import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { supabase } from "@/lib/supabaseClient";
import { randomUUID } from "crypto";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId") || null;

    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Prepare file for OpenAI transcription
    const file = await toFile(buffer, "audio.webm", {
      type: "audio/webm",
    });

    // 1) Transcribe audio -> text
    const transcription = await client.audio.transcriptions.create({
      model: "gpt-4o-transcribe",
      file,
    });

    const text =
      (transcription as any).text ??
      (transcription as any).output_text ??
      "";

    // 2) Moderate the transcript before saving
    const moderation = await client.moderations.create({
      model: "omni-moderation-latest",
      input: text,
    });

    const result = (moderation as any).results?.[0];
    const flagged = result?.flagged;

    if (flagged) {
      console.warn("Post blocked by moderation:", result);
      return NextResponse.json(
        {
          error:
            "Your voice post violates our content guidelines and was not saved.",
        },
        { status: 400 }
      );
    }

    // 3) Summarize the post with GPT-5.1
    let summary = "";
    try {
      const summaryRes = await client.responses.create({
        model: "gpt-5.1",
        instructions:
          "You summarize short social media voice posts in one concise sentence (max ~30 words), neutral and readable.",
        input: `Transcript of a user's voice post:\n\n${text}\n\nSummarize this as one short sentence suitable as a feed preview.`,
        max_output_tokens: 80,
        reasoning: {
          effort: "low",
        },
      } as any);

      summary = (summaryRes as any).output_text ?? "";
    } catch (summaryErr) {
      console.error("Summary generation failed", summaryErr);
      // Fallback: just truncate the transcript
      summary = text.slice(0, 140);
    }

    // 4) Upload audio to Supabase Storage
    const id = randomUUID();
    const audioPath = `posts/${id}.webm`;

    const { error: uploadError } = await supabase.storage
      .from("voice-audio")
      .upload(audioPath, buffer, {
        contentType: "audio/webm",
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase upload error", uploadError);
      return NextResponse.json(
        { error: "Failed to upload audio" },
        { status: 500 }
      );
    }

    // 5) Insert row into voice_posts table (including summary + user_id)
    const { data, error: insertError } = await supabase
      .from("voice_posts")
      .insert({
        audio_path: audioPath,
        transcript: text,
        summary,
        user_id: userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Supabase insert error", insertError);
      return NextResponse.json(
        { error: "Failed to save post" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        post: data,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("post-voice route error", err);
    return NextResponse.json(
      { error: "Failed to process voice post" },
      { status: 500 }
    );
  }
}
