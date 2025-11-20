import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(req: NextRequest) {
  try {
    const viewerId = req.nextUrl.searchParams.get("viewerId");
    if (!viewerId) {
      return NextResponse.json(
        { error: "Missing viewerId" },
        { status: 400 }
      );
    }

    // 1) Get list of followed user ids
    const { data: follows, error: followsError } = await supabase
      .from("follows")
      .select("followed_id")
      .eq("follower_id", viewerId);

    if (followsError) {
      console.error("Following feed follows error", followsError);
      return NextResponse.json(
        { error: "Failed to load following" },
        { status: 500 }
      );
    }

    const followedIds = (follows ?? []).map((f) => f.followed_id);

    if (!followedIds.length) {
      return NextResponse.json({ posts: [] }, { status: 200 });
    }

    // 2) Get posts from those users
    const { data: postsData, error: postsError } = await supabase
      .from("voice_posts")
      .select("id, created_at, audio_path, transcript, like_count, user_id")
      .in("user_id", followedIds)
      .order("created_at", { ascending: false })
      .limit(20);

    if (postsError) {
      console.error("Following feed posts error", postsError);
      return NextResponse.json(
        { error: "Failed to load posts" },
        { status: 500 }
      );
    }

    const postsRaw = postsData ?? [];

    // 3) Load profiles for display names
    const uniqueUserIds = Array.from(
      new Set(
        postsRaw
          .map((p) => p.user_id)
          .filter((id: string | null) => !!id)
      )
    ) as string[];

    const profilesMap = new Map<string, string>();

    if (uniqueUserIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", uniqueUserIds);

      if (profilesError) {
        console.error("Following feed profiles error", profilesError);
      } else {
        for (const p of profilesData ?? []) {
          profilesMap.set(p.id, p.display_name || "Someone");
        }
      }
    }

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
    console.error("Following feed route error", err);
    return NextResponse.json(
      { error: "Failed to load following feed" },
      { status: 500 }
    );
  }
}
