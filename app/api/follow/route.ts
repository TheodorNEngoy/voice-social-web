import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

// GET /api/follow?viewerId=...
// Returns { followingIds: string[] }
export async function GET(req: NextRequest) {
  try {
    const viewerId = req.nextUrl.searchParams.get("viewerId");
    if (!viewerId) {
      return NextResponse.json(
        { error: "Missing viewerId" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("follows")
      .select("followed_id")
      .eq("follower_id", viewerId);

    if (error) {
      console.error("GET /follow error", error);
      return NextResponse.json(
        { error: "Failed to load follows" },
        { status: 500 }
      );
    }

    const followingIds = (data ?? []).map((row) => row.followed_id);
    return NextResponse.json({ followingIds }, { status: 200 });
  } catch (err) {
    console.error("GET /follow route error", err);
    return NextResponse.json(
      { error: "Failed to load follows" },
      { status: 500 }
    );
  }
}

// POST /api/follow  { followerId, followedId }
export async function POST(req: NextRequest) {
  try {
    const { followerId, followedId } = await req.json();

    if (!followerId || !followedId || followerId === followedId) {
      return NextResponse.json(
        { error: "Invalid followerId or followedId" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("follows")
      .insert({ follower_id: followerId, followed_id: followedId });

    if (error && error.code !== "23505") {
      // 23505 = unique violation -> already following; that's fine
      console.error("POST /follow insert error", error);
      return NextResponse.json(
        { error: "Failed to follow user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("POST /follow route error", err);
    return NextResponse.json(
      { error: "Failed to follow user" },
      { status: 500 }
    );
  }
}

// DELETE /api/follow  { followerId, followedId }
export async function DELETE(req: NextRequest) {
  try {
    const { followerId, followedId } = await req.json();

    if (!followerId || !followedId) {
      return NextResponse.json(
        { error: "Invalid followerId or followedId" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("followed_id", followedId);

    if (error) {
      console.error("DELETE /follow error", error);
      return NextResponse.json(
        { error: "Failed to unfollow user" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("DELETE /follow route error", err);
    return NextResponse.json(
      { error: "Failed to unfollow user" },
      { status: 500 }
    );
  }
}
