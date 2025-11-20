import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { supabase } from "@/lib/supabaseClient";
import { randomUUID } from "crypto";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const postId = req.nextUrl.searchParams.get("postId");
    const userId = req.nextUrl.searchParams.get("userId") || null;

    if (!postId) {
      return NextResponse.json(
        { error: "Missing postId" },
        { status: 400 }
      );
    }

    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const file = await toFile(buffer, "reply.webm", {
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
      console.warn("Reply blocked by moderation:", result);
      return NextResponse.json(
        {
          error:
            "Your reply violates our content guidelines and was not saved.",
        },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const audioPath = `replies/${postId}/${id}.webm`;

    const { error: uploadError } = await supabase.storage
      .from("voice-audio")
      .upload(audioPath, buffer, {
        contentType: "audio/webm",
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase reply upload error", uploadError);
      return NextResponse.json(
        { error: "Failed to upload reply audio" },
        { status: 500 }
      );
    }

    const { data, error: insertError } = await supabase
      .from("voice_replies")
      .insert({
        post_id: postId,
        audio_path: audioPath,
        transcript: text,
        user_id: userId,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Supabase reply insert error", insertError);
      return NextResponse.json(
        { error: "Failed to save reply" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { reply: data },
      { status: 200 }
    );
  } catch (err) {
    console.error("reply route error", err);
    return NextResponse.json(
      { error: "Failed to process reply" },
      { status: 500 }
    );
  }
}
