/**
 * Raw-PCM microphone recorder for Android voice input.
 *
 * expo-audio can't emit uncompressed PCM/WAV on Android (its output-format enum
 * has no PCM), and whisper.cpp wants 16 kHz mono 16-bit audio — so on Android we
 * capture raw PCM straight off the mic with `@fugood/react-native-audio-pcm-stream`,
 * accumulate the base64 chunks, and wrap them in a WAV container ourselves. The
 * result is handed to the same {@link ./ondevice/whisperEngine} `transcribe` as a
 * `data:audio/wav;base64,…` URI (which whisper.rn accepts directly).
 *
 * iOS uses expo-audio's LINEARPCM recorder instead (see {@link ./useVoiceInput});
 * this module is only required on Android.
 */

import { Buffer } from 'buffer';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
/** Android AudioSource.VOICE_RECOGNITION — tuned for speech, less processing. */
const AUDIO_SOURCE_VOICE_RECOGNITION = 6;

/** The slice of `@fugood/react-native-audio-pcm-stream` we use. Its shipped
 * types declare a different module name, so we model it locally. */
interface LiveAudioStream {
  init(opts: {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    wavFile: string;
    bufferSize?: number;
  }): void;
  start(): void;
  stop(): Promise<string>;
  on(event: 'data', cb: (base64Chunk: string) => void): void;
}

/** Prepend a 44-byte canonical PCM WAV header to raw little-endian PCM samples.
 * Exported for unit testing the header layout. */
export function pcmToWav(pcm: Buffer): Buffer {
  const dataLen = pcm.length;
  const byteRate = (SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8;
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLen, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLen, 40);
  return Buffer.concat([header, pcm]);
}

export interface PcmRecorder {
  /** Begin capturing from the mic. Discards any prior buffered audio. */
  start(): void;
  /** Stop capturing and return the recording as a `data:audio/wav;base64,…` URI. */
  stop(): Promise<string>;
}

/**
 * Create the (singleton-friendly) Android PCM recorder. The native stream is
 * initialised and its data listener attached exactly once; `start` just clears
 * the buffer and resumes, so listeners never stack across recordings.
 */
export function createPcmRecorder(): PcmRecorder {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native load (Android only)
  const stream = require('@fugood/react-native-audio-pcm-stream')
    .default as LiveAudioStream;

  let chunks: Buffer[] = [];
  let inited = false;

  const ensureInit = () => {
    if (inited) return;
    stream.init({
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      bitsPerSample: BITS_PER_SAMPLE,
      audioSource: AUDIO_SOURCE_VOICE_RECOGNITION,
      wavFile: '', // we assemble the WAV ourselves from the data stream
      bufferSize: 16 * 1024,
    });
    // Reads the current `chunks` binding, so start()'s reassignment is picked up.
    stream.on('data', base64Chunk => {
      chunks.push(Buffer.from(base64Chunk, 'base64'));
    });
    inited = true;
  };

  return {
    start() {
      ensureInit();
      chunks = [];
      stream.start();
    },
    async stop() {
      await stream.stop();
      const wav = pcmToWav(Buffer.concat(chunks));
      chunks = [];
      return `data:audio/wav;base64,${wav.toString('base64')}`;
    },
  };
}
