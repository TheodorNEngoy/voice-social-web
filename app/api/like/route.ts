import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  try {
    const { postId } = await req.json();

    if (!postId || typeof postId !== "string") {
      return NextResponse.json(
        { error: "Missing postId" },
        { status: 400 }
      );
    }

    const { data: row, error } = await supabase
      .from("voice_posts")
      .select("like_count")
      .eq("id", postId)
      .single();

    if (error || !row) {
      console.error("Supabase select for like failed", error);
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404 }
      );
    }

    const currentLikes = row.like_count ?? 0;

    const { data: updated, error: updateError } = await supabase
      .from("voice_posts")
      .update({ like_count: currentLikes + 1 })
      .eq("id", postId)
      .select()
      .single();

    if (updateError || !updated) {
      console.error("Supabase update like failed", updateError);
      return NextResponse.json(
        { error: "Failed to update like" },
        { status: 500 }
      );
    }

    return NextResponse.json({ post: updated }, { status: 200 });
  } catch (err) {
    console.error("Like route error", err);
    return NextResponse.json(
      { error: "Failed to like post" },
      { status: 500 }
    );
  }
}
