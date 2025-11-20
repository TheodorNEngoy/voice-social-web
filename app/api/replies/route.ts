import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(req: NextRequest) {
  try {
    const postId = req.nextUrl.searchParams.get("postId");

    if (!postId) {
      return NextResponse.json(
        { error: "Missing postId" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("voice_replies")
      .select("id, created_at, transcript, audio_path")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Supabase replies error", error);
      return NextResponse.json(
        { error: "Failed to load replies" },
        { status: 500 }
      );
    }

    const replies =
      data?.map((row) => {
        const { data: urlData } = supabase
          .storage
          .from("voice-audio")
          .getPublicUrl(row.audio_path);

        return {
          id: row.id,
          created_at: row.created_at,
          transcript: row.transcript,
          audio_url: urlData?.publicUrl ?? null,
        };
      }) ?? [];

    return NextResponse.json({ replies }, { status: 200 });
  } catch (err) {
    console.error("Replies route error", err);
    return NextResponse.json(
      { error: "Failed to load replies" },
      { status: 500 }
    );
  }
}
