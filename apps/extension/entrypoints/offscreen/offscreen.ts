/**
 * Offscreen document — user-initiated tabCapture → PCM ring → companion.
 * Audio is not written to disk unless the user opts into temporary buffering.
 */

let audioCtx: AudioContext | null = null;
let processor: ScriptProcessorNode | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let stream: MediaStream | null = null;
let jobId: string | null = null;
let seq = 0;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "offscreen.capture") {
    void startCapture(message);
  }
  if (message?.type === "offscreen.stop") {
    stopCapture();
  }
  if (message?.type === "offscreen.pause") {
    if (audioCtx?.state === "running") void audioCtx.suspend();
  }
  if (message?.type === "offscreen.resume") {
    if (audioCtx?.state === "suspended") void audioCtx.resume();
  }
});

async function startCapture(message: {
  jobId?: string;
  tabId?: number;
  videoId?: string;
}): Promise<void> {
  stopCapture();
  jobId = message.jobId ?? crypto.randomUUID();
  seq = 0;
  const indicator = document.getElementById("capture-indicator");
  if (indicator) indicator.textContent = "Capture active (local ring buffer)";

  try {
    // Prefer getMediaStreamId when tabId is known (Chrome tabCapture path).
    let mediaStream: MediaStream | null = null;
    if (
      typeof chrome.tabCapture?.getMediaStreamId === "function" &&
      message.tabId != null
    ) {
      const streamId = await new Promise<string>((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId(
          { targetTabId: message.tabId },
          (id) => {
            if (chrome.runtime.lastError || !id) {
              reject(
                new Error(
                  chrome.runtime.lastError?.message ?? "no stream id",
                ),
              );
              return;
            }
            resolve(id);
          },
        );
      });
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: streamId,
          },
        } as unknown as MediaTrackConstraints,
        video: false,
      });
    }

    if (!mediaStream) {
      if (indicator) {
        indicator.textContent =
          "Capture ready (awaiting MediaStream — gesture path wired)";
      }
      return;
    }

    stream = mediaStream;
    audioCtx = new AudioContext({ sampleRate: 48000 });
    source = audioCtx.createMediaStreamSource(mediaStream);
    // ScriptProcessor is deprecated but widely available in extension offscreen docs.
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      const pcm = floatTo16Le(input);
      const b64 = bytesToBase64(pcm);
      void chrome.runtime.sendMessage({
        type: "capture.chunk",
        jobId,
        sampleRateHz: audioCtx?.sampleRate ?? 48000,
        seq: seq++,
        pcmI16LeBase64: b64,
      });
    };
    source.connect(processor);
    processor.connect(audioCtx.destination);
  } catch (e) {
    if (indicator) {
      indicator.textContent = `Capture error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}

function stopCapture(): void {
  processor?.disconnect();
  source?.disconnect();
  processor = null;
  source = null;
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
  if (audioCtx) {
    void audioCtx.close().catch(() => undefined);
    audioCtx = null;
  }
  jobId = null;
  seq = 0;
  const indicator = document.getElementById("capture-indicator");
  if (indicator) indicator.textContent = "Capture idle";
}

function floatTo16Le(input: Float32Array): Uint8Array {
  const out = new Uint8Array(input.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    view.setInt16(i * 2, (s * 32767) | 0, true);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export {};
