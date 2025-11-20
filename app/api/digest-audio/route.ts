import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET(req: NextRequest) {
  try {
    const viewerId = req.nextUrl.searchParams.get("viewerId") || null;

    const baseUrl = req.nextUrl.origin;
    const digestUrl = viewerId
      ? `${baseUrl}/api/digest?viewerId=${encodeURIComponent(viewerId)}`
      : `${baseUrl}/api/digest`;

    const digestRes = await fetch(digestUrl, {
      cache: "no-store",
    });

    if (!digestRes.ok) {
      console.error("digest-audio: /api/digest failed", digestRes.status);
      return NextResponse.json(
        { error: "Failed to generate text digest" },
        { status: 500 }
      );
    }

    const digestJson = await digestRes.json();
    let digestText: string =
      digestJson.digest ||
      "There is not much new activity yet. Once more people post, I will have more to summarize for you.";

    const speech = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: digestText,
      response_format: "mp3",
    });

    const audioBuffer = Buffer.from(await (speech as any).arrayBuffer());

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("digest-audio route error", err);
    return NextResponse.json(
      { error: "Failed to generate voice digest" },
      { status: 500 }
    );
  }
}
