"use client";

import { useRef, useState } from "react";

export default function HomePage() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    setError(null);
    setTranscript(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("This browser does not support audio recording.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event: any) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // Send audio to our API for transcription
        await sendForTranscription(blob);
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

  const sendForTranscription = async (blob: Blob) => {
    try {
      setIsTranscribing(true);
      setError(null);

      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "audio/webm",
        },
        body: blob,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Transcription failed");
      }

      setTranscript(data.text || "(no text returned)");
    } catch (err) {
      console.error(err);
      setError("Transcription failed. Try again.");
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-50">
      <h1 className="text-3xl font-bold mb-6">Voice Social – Prototype</h1>

      <div className="border border-slate-700 rounded-xl p-6 w-full max-w-md space-y-4 bg-slate-900/60">
        <p className="text-sm text-slate-300">
          Tap record, say something, stop, then we&apos;ll transcribe it with OpenAI.
        </p>

        <div className="flex gap-4">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className="flex-1 py-2 rounded-lg font-semibold border border-slate-500 hover:bg-slate-800 transition"
          >
            {isRecording ? "■ Stop" : "● Record"}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-400">
            {error}
          </p>
        )}

        {audioUrl && (
          <div className="space-y-2">
            <p className="text-sm text-slate-300">Last recording:</p>
            <audio controls src={audioUrl} className="w-full" />
          </div>
        )}

        {isTranscribing && (
          <p className="text-sm text-slate-300">
            Transcribing with OpenAI…
          </p>
        )}

        {transcript && !isTranscribing && (
          <div className="mt-2 space-y-1">
            <p className="text-sm text-slate-300">Transcript:</p>
            <p className="text-sm text-slate-100 whitespace-pre-wrap">
              {transcript}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
