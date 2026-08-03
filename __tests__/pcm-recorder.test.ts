import { Buffer } from 'buffer';

import { pcmToWav } from '../src/features/coach/pcmRecorder';

describe('pcmToWav', () => {
  const pcm = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]); // 8 bytes of fake PCM
  const wav = pcmToWav(pcm);

  it('prepends a 44-byte header and keeps the PCM payload intact', () => {
    expect(wav.length).toBe(44 + pcm.length);
    expect(Buffer.from(wav.subarray(44)).equals(pcm)).toBe(true);
  });

  it('writes the RIFF/WAVE/fmt/data chunk markers', () => {
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ');
    expect(wav.toString('ascii', 36, 40)).toBe('data');
  });

  it('encodes 16 kHz mono 16-bit PCM format fields and correct sizes', () => {
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.length); // RIFF chunk size
    expect(wav.readUInt16LE(20)).toBe(1); // PCM format
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(16000); // sample rate
    expect(wav.readUInt32LE(28)).toBe(16000 * 2); // byte rate (mono, 16-bit)
    expect(wav.readUInt16LE(32)).toBe(2); // block align
    expect(wav.readUInt16LE(34)).toBe(16); // bits per sample
    expect(wav.readUInt32LE(40)).toBe(pcm.length); // data chunk size
  });
});
