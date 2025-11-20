import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  try {
    const { userId, email } = await req.json();

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400 }
      );
    }

    const baseName =
      typeof email === "string" && email.includes("@")
        ? email.split("@")[0]
        : "Voice user";

    const { data: existing, error: existingError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existingError) {
      console.error("ensure profile: select error", existingError);
    }

    if (!existing) {
      const { error: insertError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          display_name: baseName,
        });

      if (insertError) {
        console.error("ensure profile: insert error", insertError);
        return NextResponse.json(
          { error: "Failed to create profile" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("ensure profile route error", err);
    return NextResponse.json(
      { error: "Failed to ensure profile" },
      { status: 500 }
    );
  }
}
