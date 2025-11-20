import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabaseClient";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(req: NextRequest) {
  try {
    const viewerId = req.nextUrl.searchParams.get("viewerId");

    let postsQuery = supabase
      .from("voice_posts")
      .select("id, created_at, summary, transcript, user_id")
      .order("created_at", { ascending: false })
      .limit(20);

    // If we know who the viewer is, try to restrict to "following"
    let usingFollowing = false;

    if (viewerId) {
      const { data: follows, error: followsError } = await supabase
        .from("follows")
        .select("followed_id")
        .eq("follower_id", viewerId);

      if (followsError) {
        console.error("digest: follows query error", followsError);
      } else {
        const followedIds = (follows ?? []).map((f) => f.followed_id);
        if (followedIds.length > 0) {
          postsQuery = postsQuery.in("user_id", followedIds);
          usingFollowing = true;
        }
      }
    }

    const { data, error } = await postsQuery;

    if (error) {
      console.error("Supabase digest query error", error);
      return NextResponse.json(
        { error: "Failed to load posts for digest" },
        { status: 500 }
      );
    }

    const posts = data ?? [];

    let prompt: string;

    if (!posts.length) {
      if (usingFollowing) {
        prompt = `
The user asked for a digest from people they follow, but there are no recent posts.
Write one short, friendly sentence explaining that nobody they follow has posted anything new yet.
Tone: calm, neutral, kind.
`;
      } else {
        prompt = `
There are currently no recent posts at all.
Write one short, friendly sentence saying there is nothing new yet.
Tone: calm, neutral, kind.
`;
      }
    } else {
      const lines = posts
        .map((post, index) => {
          const created = post.created_at;
          const text = post.summary || post.transcript?.slice(0, 160) || "";
          return `Post ${index + 1} [${created}] (user ${post.user_id}): ${text}`;
        })
        .join("\n");

      prompt = `
You summarize recent posts from a voice-only social network.

These posts are ${
        usingFollowing
          ? "mostly from people the user follows"
          : "from the global feed"
      }.

Recent posts (newest first):
${lines}

Write a short spoken-style digest of what people have been talking about.
Tone: calm, neutral, friendly. No drama, no urgency, no anger, no stress.
Length: about 3–6 sentences.
Group related things together rather than listing every post.
If these are from followed users, lean into "your friends/people you follow".
`;
    }

    const resp = await client.responses.create({
      model: "gpt-5.1",
      instructions:
        "You write short, calm, friendly spoken-style digests for a social audio feed.",
      input: prompt,
      max_output_tokens: 320,
    });

    const digestText = (resp as any).output_text?.trim() ?? "";

    const digest =
      digestText ||
      (usingFollowing
        ? "The people you follow have not posted much recently, so there is not much to summarize yet."
        : "There is not much new activity yet. Once more people post, I will have more to summarize for you.");

    return NextResponse.json({ digest }, { status: 200 });
  } catch (err) {
    console.error("digest route error", err);
    return NextResponse.json(
      { error: "Failed to generate digest" },
      { status: 500 }
    );
  }
}
