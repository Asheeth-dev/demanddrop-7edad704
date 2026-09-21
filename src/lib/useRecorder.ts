import { useCallback, useRef, useState } from "react";

/**
 * Records microphone audio as raw PCM via the Web Audio API and encodes a
 * complete 16 kHz mono WAV file. WAV is used (instead of MediaRecorder output)
 * because every browser, including iOS Safari, produces a decodable file.
 */
function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  // Downsample to 16 kHz to keep the upload small.
  const target = 16000;
  const ratio = sampleRate / target;
  const outLength = Math.floor(merged.length / ratio);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const s = Math.max(-1, Math.min(1, merged[Math.floor(i * ratio)] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const buffer = new ArrayBuffer(44 + out.length * 2);
  const view = new DataView(buffer);
  const writeStr = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(pos + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + out.length * 2, true);
  writeStr(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, target, true);
  view.setUint32(28, target * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, out.length * 2, true);
  new Int16Array(buffer, 44).set(out);

  return new Blob([buffer], { type: "audio/wav" });
}

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const ref = useRef<{
    stream: MediaStream;
    ctx: AudioContext;
    node: ScriptProcessorNode;
    source: MediaStreamAudioSourceNode;
    chunks: Float32Array[];
  } | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
      let peak = 0;
      for (let i = 0; i < input.length; i += 64) peak = Math.max(peak, Math.abs(input[i] ?? 0));
      setLevel(peak);
    };
    source.connect(node);
    node.connect(ctx.destination);
    ref.current = { stream, ctx, node, source, chunks };
    setRecording(true);
  }, []);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const r = ref.current;
    ref.current = null;
    setRecording(false);
    setLevel(0);
    if (!r) return null;
    r.stream.getTracks().forEach((t) => t.stop());
    r.node.disconnect();
    r.source.disconnect();
    const blob = encodeWav(r.chunks, r.ctx.sampleRate);
    await r.ctx.close().catch(() => {});
    if (blob.size < 4000) return null; // header-only / silent clip
    return blob;
  }, []);

  return { recording, level, start, stop };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}
