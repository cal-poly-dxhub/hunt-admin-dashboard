import { useState, useRef, useEffect } from "react";

export function RecordButton() {
  const [recording, setRecording] = useState(false);
  const [bytes, setBytes] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const writerRef = useRef<FileSystemWritableFileStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("");
  const extRef = useRef("");

  useEffect(() => {
    if (!recording) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [recording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        } as any,
        audio: false,
      });

      const mimeType = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")
        ? "video/mp4;codecs=avc1"
        : "video/webm;codecs=vp9";
      const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
      mimeRef.current = mimeType;
      extRef.current = ext;

      // Try streaming to disk, fall back to in-memory
      let useFileSystem = false;
      if ("showSaveFilePicker" in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: `hunt-recording-${new Date().toISOString().slice(0, 19)}.${ext}`,
            types: [
              {
                description: "Video",
                accept: { [mimeType.split(";")[0]]: [`.${ext}`] },
              },
            ],
          });
          const writer = await fileHandle.createWritable();
          writerRef.current = writer;
          useFileSystem = true;
        } catch {
          // User cancelled file picker — fall back to in-memory
        }
      }

      if (!useFileSystem) {
        chunksRef.current = [];
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8_000_000,
      });

      mediaRecorder.ondataavailable = async (e: BlobEvent) => {
        if (e.data.size > 0) {
          setBytes((prev) => prev + e.data.size);
          if (writerRef.current) {
            await writerRef.current.write(e.data);
          } else {
            chunksRef.current.push(e.data);
          }
        }
      };

      mediaRecorder.onstop = async () => {
        if (writerRef.current) {
          await writerRef.current.close();
          writerRef.current = null;
        } else {
          const blob = new Blob(chunksRef.current, { type: mimeRef.current });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `hunt-recording-${new Date().toISOString().slice(0, 19)}.${extRef.current}`;
          a.click();
          URL.revokeObjectURL(url);
          chunksRef.current = [];
        }
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };

      stream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      };

      setBytes(0);
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
    } catch {
      // User cancelled permission dialog
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const formatSize = (b: number) => {
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <button
      onClick={recording ? stopRecording : startRecording}
      className="flex items-center gap-1.5 h-9 px-2 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
      title={recording ? "Stop recording" : "Record screen"}
    >
      {recording ? (
        <>
          <span className="w-3 h-3 rounded-sm bg-red-500 animate-pulse" />
          <span className="text-[10px] font-mono text-red-500">{formatSize(bytes)}</span>
        </>
      ) : (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-500" />
      )}
    </button>
  );
}
