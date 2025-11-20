import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  try {
    // 1) Load recent posts, including user_id
    const { data, error } = await supabase
      .from("voice_posts")
      .select("id, created_at, audio_path, transcript, like_count, user_id")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Supabase feed error", error);
      return NextResponse.json(
        { error: "Failed to load feed" },
        { status: 500 }
      );
    }

    const postsRaw = data ?? [];

    // 2) Collect all user_ids so we can fetch profiles in one query
    const userIds = Array.from(
      new Set(
        postsRaw
          .map((p) => p.user_id)
          .filter((id: string | null) => !!id)
      )
    ) as string[];

    const profilesMap = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);

      if (profilesError) {
        console.error("Supabase profiles error", profilesError);
      } else {
        for (const p of profilesData ?? []) {
          profilesMap.set(p.id, p.display_name || "Someone");
        }
      }
    }

    // 3) Build final posts with audio_url + author_name
    const posts = postsRaw.map((post) => {
      const { data: urlData } = supabase.storage
        .from("voice-audio")
        .getPublicUrl(post.audio_path);

      const authorName =
        (post.user_id && profilesMap.get(post.user_id)) || "Someone";

      return {
        id: post.id,
        created_at: post.created_at,
        transcript: post.transcript,
        like_count: post.like_count ?? 0,
        audio_url: urlData?.publicUrl ?? null,
        user_id: post.user_id,
        author_name: authorName,
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
