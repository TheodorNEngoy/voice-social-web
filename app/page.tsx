"use client";

import { useEffect, useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabaseBrowserClient";

type VoicePost = {
  id: string;
  created_at: string;
  transcript: string;
  audio_url: string | null;
  like_count: number;
  user_id: string | null;
  author_name: string | null;
};

type VoiceReply = {
  id: string;
  created_at: string;
  transcript: string;
  audio_url: string | null;
};

type FeedMode = "global" | "following";

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const [feed, setFeed] = useState<VoicePost[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [feedMode, setFeedMode] = useState<FeedMode>("global");

  const [openRepliesFor, setOpenRepliesFor] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, VoiceReply[]>>({});
  const [isLoadingRepliesFor, setIsLoadingRepliesFor] = useState<string | null>(
    null
  );
  const [isReplyRecording, setIsReplyRecording] = useState(false);
  const [replyRecordingFor, setReplyRecordingFor] = useState<string | null>(
    null
  );

  const [digest, setDigest] = useState<string | null>(null);
  const [isLoadingDigest, setIsLoadingDigest] = useState(false);

  const [digestAudioUrl, setDigestAudioUrl] = useState<string | null>(null);
  const [isLoadingDigestAudio, setIsLoadingDigestAudio] = useState(false);

  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [filterUserName, setFilterUserName] = useState<string | null>(null);

  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const replyMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const replyChunksRef = useRef<BlobPart[]>([]);

  // ---------- Init ----------

  useEffect(() => {
    const init = async () => {
      try {
        const {
          data: { session },
        } = await browserSupabase.auth.getSession();

        let currentUserId: string | null = null;
        let currentEmail: string | null = null;

        if (session?.user) {
          currentUserId = session.user.id;
          currentEmail = session.user.email ?? null;
          setUserId(currentUserId);
          setUserEmail(currentEmail);

          // ensure profile exists
          await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: currentUserId, email: currentEmail }),
          }).catch(() => {});

          await loadFollowingIds(currentUserId);
        }

        await loadFeed("global");
        await loadDigest(currentUserId);
      } catch (err) {
        console.error(err);
        setError("Failed to initialize app.");
      }
    };
    void init();
  }, []);

  // ---------- Helpers: follow graph & feed & digest ----------

  const loadFollowingIds = async (viewerId: string) => {
    try {
      const res = await fetch(
        `/api/follow?viewerId=${encodeURIComponent(viewerId)}`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load follows");
      }
      const ids = new Set<string>((data.followingIds || []) as string[]);
      setFollowingIds(ids);
    } catch (err) {
      console.error(err);
      // ignore in UI; we can retry later
    }
  };

  const loadFeed = async (mode: FeedMode) => {
    try {
      setIsLoadingFeed(true);
      setError(null);

      let url = "/api/feed";
      if (mode === "following") {
        if (!userId) {
          setFeed([]);
          setFeedMode(mode);
          setIsLoadingFeed(false);
          return;
        }
        url = `/api/feed/following?viewerId=${encodeURIComponent(userId)}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load feed");
      }
      setFeed(data.posts || []);
      setFeedMode(mode);
    } catch (err) {
      console.error(err);
      setError("Failed to load feed.");
    } finally {
      setIsLoadingFeed(false);
    }
  };

  const loadDigest = async (viewerId?: string | null) => {
    try {
      setIsLoadingDigest(true);
      const v = viewerId ?? userId;
      const url = v
        ? `/api/digest?viewerId=${encodeURIComponent(v)}`
        : "/api/digest";

      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate digest");
      }
      setDigest(data.digest || null);
    } catch (err) {
      console.error(err);
      setDigest(null);
      setError("Failed to load digest.");
    } finally {
      setIsLoadingDigest(false);
    }
  };

  const playDigestAudio = async () => {
    try {
      setIsLoadingDigestAudio(true);
      setError(null);
      const v = userId;
      const url = v
        ? `/api/digest-audio?viewerId=${encodeURIComponent(v)}`
        : "/api/digest-audio";

      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate audio digest");
      }
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      setDigestAudioUrl(audioUrl);
    } catch (err) {
      console.error(err);
      setError("Failed to play AI digest.");
    } finally {
      setIsLoadingDigestAudio(false);
    }
  };

  const refreshEverything = async () => {
    await loadFeed(feedMode);
    await loadDigest();
    if (userId) {
      await loadFollowingIds(userId);
    }
  };

  // ---------- Auth ----------

  const handleSignUp = async () => {
    try {
      setAuthLoading(true);
      setError(null);
      const { data, error } = await browserSupabase.auth.signUp({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
      if (data.user) {
        const id = data.user.id;
        const email = data.user.email ?? null;
        setUserId(id);
        setUserEmail(email);

        await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: id, email }),
        }).catch(() => {});

        await loadFollowingIds(id);
        await loadFeed(feedMode);
        await loadDigest(id);
      }
      setAuthPassword("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Sign up failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignIn = async () => {
    try {
      setAuthLoading(true);
      setError(null);
      const { data, error } = await browserSupabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
      if (data.user) {
        const id = data.user.id;
        const email = data.user.email ?? null;
        setUserId(id);
        setUserEmail(email);

        await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: id, email }),
        }).catch(() => {});

        await loadFollowingIds(id);
        await loadFeed(feedMode);
        await loadDigest(id);
      }
      setAuthPassword("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Sign in failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setAuthLoading(true);
      setError(null);
      await browserSupabase.auth.signOut();
      setUserId(null);
      setUserEmail(null);
      setFollowingIds(new Set());
      await loadFeed("global");
      await loadDigest(null);
    } catch (err) {
      console.error(err);
      setError("Sign out failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  // ---------- Posting ----------

  const startRecording = async () => {
    setError(null);
    setTranscript(null);

    if (!userId) {
      setError("You must be signed in to post.");
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("This browser does not support audio recording.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        await sendPostToServer(blob);
        await refreshEverything();
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error(err);
      setError("Could not start recording. Check microphone permissions.");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.stop();
      recorder.stream.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
  };

  const sendPostToServer = async (blob: Blob) => {
    try {
      setIsTranscribing(true);
      setError(null);

      const url = userId
        ? `/api/post-voice?userId=${encodeURIComponent(userId)}`
        : "/api/post-voice";

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "audio/webm",
        },
        body: blob,
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.error) {
          setError(data.error);
          return;
        }
        throw new Error("Failed to save voice post");
      }

      setTranscript(data.post?.transcript || "(no transcript returned)");
    } catch (err) {
      console.error(err);
      setError("Saving/transcribing failed. Try again.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleLike = async (postId: string) => {
    try {
      setError(null);
      const res = await fetch("/api/like", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ postId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to like post");
      }

      await loadFeed(feedMode);
    } catch (err) {
      console.error(err);
      setError("Failed to like post.");
    }
  };

  // ---------- Replies ----------

  const fetchReplies = async (postId: string) => {
    try {
      setIsLoadingRepliesFor(postId);
      const res = await fetch(
        `/api/replies?postId=${encodeURIComponent(postId)}`
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load replies");
      }

      setReplies((prev) => ({
        ...prev,
        [postId]: data.replies || [],
      }));
    } catch (err) {
      console.error(err);
      setError("Failed to load replies.");
    } finally {
      setIsLoadingRepliesFor(null);
    }
  };

  const toggleReplies = async (postId: string) => {
    if (openRepliesFor === postId) {
      setOpenRepliesFor(null);
      return;
    }

    setOpenRepliesFor(postId);
    await fetchReplies(postId);
  };

  const startReplyRecording = async (postId: string) => {
    setError(null);

    if (!userId) {
      setError("You must be signed in to reply.");
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("This browser does not support audio recording.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      replyMediaRecorderRef.current = mediaRecorder;
      replyChunksRef.current = [];
      setReplyRecordingFor(postId);

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          replyChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(replyChunksRef.current, { type: "audio/webm" });
        await sendReplyToServer(postId, blob);
        await fetchReplies(postId);
      };

      mediaRecorder.start();
      setIsReplyRecording(true);
    } catch (err) {
      console.error(err);
      setError(
        "Could not start reply recording. Check microphone permissions."
      );
    }
  };

  const stopReplyRecording = () => {
    const recorder = replyMediaRecorderRef.current;
    if (recorder) {
      recorder.stop();
      recorder.stream.getTracks().forEach((track) => track.stop());
    }
    setIsReplyRecording(false);
    setReplyRecordingFor(null);
  };

  const sendReplyToServer = async (postId: string, blob: Blob) => {
    try {
      setError(null);

      const url = userId
        ? `/api/reply?postId=${encodeURIComponent(
            postId
          )}&userId=${encodeURIComponent(userId)}`
        : `/api/reply?postId=${encodeURIComponent(postId)}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "audio/webm",
        },
        body: blob,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save reply");
        return;
      }
    } catch (err) {
      console.error(err);
      setError("Failed to save reply.");
    }
  };

  // ---------- Follow / unfollow ----------

  const toggleFollow = async (targetUserId: string | null) => {
    if (!userId || !targetUserId || userId === targetUserId) return;

    try {
      setError(null);
      const isFollowing = followingIds.has(targetUserId);

      if (isFollowing) {
        const res = await fetch("/api/follow", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            followerId: userId,
            followedId: targetUserId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to unfollow");

        const copy = new Set(followingIds);
        copy.delete(targetUserId);
        setFollowingIds(copy);
      } else {
        const res = await fetch("/api/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            followerId: userId,
            followedId: targetUserId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to follow");

        const copy = new Set(followingIds);
        copy.add(targetUserId);
        setFollowingIds(copy);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to update follow state.");
    }
  };

  // ---------- Derived feed ----------

  const visibleFeed = filterUserId
    ? feed.filter((p) => p.user_id === filterUserId)
    : feed;

  // ---------- UI ----------

  return (
    <main className="min-h-screen flex flex-col items-center bg-slate-950 text-slate-50 p-4">
      <h1 className="text-3xl font-bold my-6">Voice Social – Prototype</h1>

      {/* Auth box */}
      <div className="border border-slate-700 rounded-xl p-4 w-full max-w-md bg-slate-900/80 mb-4 space-y-3">
        {userEmail ? (
          <>
            <p className="text-sm text-slate-200">
              Signed in as <span className="font-semibold">{userEmail}</span>
            </p>
            <button
              onClick={handleSignOut}
              disabled={authLoading}
              className="text-sm border border-slate-500 px-3 py-1 rounded-lg hover:bg-slate-800 disabled:opacity-60"
            >
              {authLoading ? "Signing out..." : "Sign out"}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-200">
              Sign up or sign in to post & reply.
            </p>
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Email"
              className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-sm mb-1"
            />
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-sm mb-2"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSignUp}
                disabled={authLoading}
                className="flex-1 text-sm border border-slate-500 px-3 py-1 rounded-lg hover:bg-slate-800 disabled:opacity-60"
              >
                {authLoading ? "Working..." : "Sign up"}
              </button>
              <button
                onClick={handleSignIn}
                disabled={authLoading}
                className="flex-1 text-sm border border-slate-500 px-3 py-1 rounded-lg hover:bg-slate-800 disabled:opacity-60"
              >
                {authLoading ? "Working..." : "Sign in"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* AI Digest */}
      <div className="border border-slate-700 rounded-xl p-4 w-full max-w-2xl bg-slate-900/80 mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">
            AI digest of recent posts
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => loadDigest()}
              className="text-xs border border-slate-500 px-2 py-1 rounded-lg hover:bg-slate-800"
            >
              {isLoadingDigest ? "Refreshing…" : "Refresh digest"}
            </button>
            <button
              onClick={playDigestAudio}
              className="text-xs border border-slate-500 px-2 py-1 rounded-lg hover:bg-slate-800"
            >
              {isLoadingDigestAudio ? "Generating audio…" : "Play digest"}
            </button>
          </div>
        </div>
        {digest ? (
          <p className="text-sm text-slate-200 whitespace-pre-wrap">{digest}</p>
        ) : (
          <p className="text-xs text-slate-400">
            {isLoadingDigest ? "Generating digest…" : "No digest yet."}
          </p>
        )}
        {digestAudioUrl && (
          <div className="mt-2">
            <audio controls src={digestAudioUrl} className="w-full" />
          </div>
        )}
      </div>

      {/* Recorder card */}
      <div className="border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4 bg-slate-900/60 mb-8">
        <p className="text-sm text-slate-300">
          Tap record, say something, stop, and we&apos;ll store + transcribe it
          with Supabase + OpenAI.
        </p>

        <div className="flex gap-4">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className="flex-1 py-2 rounded-lg font-semibold border border-slate-500 hover:bg-slate-800 transition"
          >
            {isRecording ? "■ Stop" : "● Record"}
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {audioUrl && (
          <div className="space-y-2">
            <p className="text-sm text-slate-300">
              Last recording (local preview):
            </p>
            <audio controls src={audioUrl} className="w-full" />
          </div>
        )}

        {isTranscribing && (
          <p className="text-sm text-slate-300">Uploading + transcribing…</p>
        )}

        {transcript && !isTranscribing && (
          <div className="mt-2 space-y-1">
            <p className="text-sm text-slate-300">
              Transcript (saved in DB):
            </p>
            <p className="text-sm text-slate-100 whitespace-pre-wrap">
              {transcript}
            </p>
          </div>
        )}
      </div>

      {/* Feed + replies */}
      <section className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setFilterUserId(null);
                setFilterUserName(null);
                void loadFeed("global");
              }}
              className={`text-xs px-3 py-1 rounded-full border ${
                feedMode === "global"
                  ? "border-slate-200 bg-slate-100 text-slate-900"
                  : "border-slate-500 hover:bg-slate-800"
              }`}
            >
              Global
            </button>
            <button
              onClick={() => {
                setFilterUserId(null);
                setFilterUserName(null);
                void loadFeed("following");
              }}
              className={`text-xs px-3 py-1 rounded-full border ${
                feedMode === "following"
                  ? "border-slate-200 bg-slate-100 text-slate-900"
                  : "border-slate-500 hover:bg-slate-800"
              }`}
              disabled={!userId}
            >
              Following
            </button>
          </div>
          <button
            onClick={() => void refreshEverything()}
            className="text-sm border border-slate-500 px-3 py-1 rounded-lg hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">
              {filterUserName
                ? `Posts by ${filterUserName}`
                : feedMode === "following"
                ? "Following feed"
                : "Recent voice posts"}
            </h2>
            {filterUserId && (
              <button
                onClick={() => {
                  setFilterUserId(null);
                  setFilterUserName(null);
                }}
                className="text-xs border border-slate-500 px-2 py-1 rounded-lg hover:bg-slate-800"
              >
                Clear user filter
              </button>
            )}
          </div>
        </div>

        {isLoadingFeed && (
          <p className="text-sm text-slate-300">Loading feed…</p>
        )}

        {!isLoadingFeed && visibleFeed.length === 0 && (
          <p className="text-sm text-slate-400">
            {feedMode === "following"
              ? "No posts from people you follow yet."
              : "No posts yet. Record something!"}
          </p>
        )}

        <div className="space-y-4 mt-3">
          {visibleFeed.map((post) => {
            const isMe = userId && post.user_id === userId;
            const canFollow = userId && post.user_id && !isMe;
            const isFollowing =
              !!post.user_id && followingIds.has(post.user_id);

            return (
              <article
                key={post.id}
                className="border border-slate-800 rounded-lg p-4 bg-slate-900/70 space-y-2"
              >
                <p className="text-xs text-slate-400">
                  {new Date(post.created_at).toLocaleString()}
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-300">
                    by{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setFilterUserId(post.user_id || null);
                        setFilterUserName(post.author_name || "Someone");
                      }}
                      className="underline underline-offset-2 hover:text-slate-100"
                    >
                      {post.author_name || "Someone"}
                    </button>
                  </p>
                  {canFollow && (
                    <button
                      onClick={() => toggleFollow(post.user_id!)}
                      className={`text-[10px] px-2 py-1 rounded-full border ${
                        isFollowing
                          ? "border-slate-400 bg-slate-800 text-slate-100"
                          : "border-slate-500 hover:bg-slate-800"
                      }`}
                    >
                      {isFollowing ? "Following" : "Follow"}
                    </button>
                  )}
                </div>

                {post.audio_url && (
                  <audio controls src={post.audio_url} className="w-full" />
                )}

                <p className="text-sm text-slate-100 whitespace-pre-wrap">
                  {post.transcript}
                </p>

                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => handleLike(post.id)}
                    className="text-xs border border-slate-600 rounded-full px-3 py-1 hover:bg-slate-800"
                  >
                    ♥ Like
                  </button>
                  <span className="text-xs text-slate-300">
                    {post.like_count}{" "}
                    {post.like_count === 1 ? "like" : "likes"}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() =>
                      isReplyRecording && replyRecordingFor === post.id
                        ? stopReplyRecording()
                        : startReplyRecording(post.id)
                    }
                    className="text-xs border border-slate-600 rounded-full px-3 py-1 hover:bg-slate-800"
                  >
                    {isReplyRecording && replyRecordingFor === post.id
                      ? "■ Stop reply"
                      : "🎤 Reply"}
                  </button>
                  <button
                    onClick={() => toggleReplies(post.id)}
                    className="text-xs border border-slate-600 rounded-full px-3 py-1 hover:bg-slate-800"
                  >
                    {openRepliesFor === post.id
                      ? "Hide replies"
                      : "Show replies"}
                  </button>
                </div>

                {openRepliesFor === post.id && (
                  <div className="mt-2 pl-3 border-l border-slate-700 space-y-2">
                    {isLoadingRepliesFor === post.id && (
                      <p className="text-xs text-slate-400">
                        Loading replies…
                      </p>
                    )}

                    {(replies[post.id] ?? []).length === 0 &&
                      isLoadingRepliesFor !== post.id && (
                        <p className="text-xs text-slate-500">
                          No replies yet.
                        </p>
                      )}

                    {(replies[post.id] ?? []).map((reply) => (
                      <div key={reply.id} className="space-y-1">
                        <p className="text-[11px] text-slate-500">
                          {new Date(reply.created_at).toLocaleString()}
                        </p>
                        {reply.audio_url && (
                          <audio
                            controls
                            src={reply.audio_url}
                            className="w-full"
                          />
                        )}
                        <p className="text-xs text-slate-100 whitespace-pre-wrap">
                          {reply.transcript}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
