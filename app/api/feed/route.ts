import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("voice_posts")
      .select("id, created_at, audio_path, transcript, like_count")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Supabase feed error", error);
      return NextResponse.json(
        { error: "Failed to load feed" },
        { status: 500 }
      );
    }

    const posts = (data ?? []).map((post) => {
      const { data: urlData } = supabase
        .storage
        .from("voice-audio")
        .getPublicUrl(post.audio_path);

      return {
        id: post.id,
        created_at: post.created_at,
        transcript: post.transcript,
        like_count: post.like_count ?? 0,
        audio_url: urlData?.publicUrl ?? null,
      };
    });

    return NextResponse.json({ posts }, { status: 200 });
  } catch (err) {
    console.error("Feed route error", err);
    return NextResponse.json(
      { error: "Failed to load feed" },
      { status: 500 }
    );
  }
}
