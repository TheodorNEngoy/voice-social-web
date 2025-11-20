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

    const file = await toFile(buffer, "audio.webm", {
      type: "audio/webm",
    });

    const transcription = await client.audio.transcriptions.create({
      model: "gpt-4o-transcribe",
      file,
    });

    const text =
      (transcription as any).text ??
      (transcription as any).output_text ??
      "";

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

    const { data, error: insertError } = await supabase
      .from("voice_posts")
      .insert({
        audio_path: audioPath,
        transcript: text,
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
