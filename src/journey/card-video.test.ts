// The 9:16 clip's pure surface: format constants, codec selection, and — most
// importantly — that capability detection is honest.
//
// The encode itself is a browser concern and is covered in
// tests/test-journey.mjs against the built bundle. What is testable here is the
// thing most likely to ship broken: `canRecordVideo` returning true on a
// browser that cannot actually record, which would put a dead button in the
// share row. Each piece of the pipeline fails independently — the MediaRecorder
// constructor can exist without `captureStream`, and a codec can be reported
// supported and still refuse to start — so detection has to probe all of them.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VIDEO_FPS, VIDEO_FRAMES, VIDEO_H, VIDEO_SECONDS, VIDEO_W,
  canRecordVideo, pickCodec,
} from './card-video';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('clip format', () => {
  it('is vertical 9:16, which is what every short-video surface wants', () => {
    expect(VIDEO_W).toBe(1080);
    expect(VIDEO_H).toBe(1920);
    expect(VIDEO_H / VIDEO_W).toBeCloseTo(16 / 9, 5);
  });

  it('is short enough to loop and long enough to read', () => {
    // The reference virality case was a ~2s shot; 6-9s is the band where a
    // build reads as a clip rather than a slideshow.
    expect(VIDEO_SECONDS).toBeGreaterThanOrEqual(6);
    expect(VIDEO_SECONDS).toBeLessThanOrEqual(9);
    expect(VIDEO_FRAMES).toBe(VIDEO_FPS * VIDEO_SECONDS);
  });
});

describe('codec selection', () => {
  it('returns null when MediaRecorder is absent entirely', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    expect(pickCodec()).toBeNull();
  });

  it('prefers VP9, the widest-support high-quality option', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
    expect(pickCodec()).toBe('video/webm;codecs=vp9');
  });

  it('falls through to whatever the browser will take', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (t: string) => t === 'video/mp4',
    });
    expect(pickCodec()).toBe('video/mp4');
  });

  it('treats a throwing isTypeSupported as unsupported rather than crashing', () => {
    // Some builds throw instead of returning false.
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: () => { throw new Error('nope'); },
    });
    expect(pickCodec()).toBeNull();
  });
});

describe('capability detection is honest', () => {
  /** Minimal document stub whose canvas may or may not expose captureStream. */
  function stubDocument(withCapture: boolean) {
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        ...(withCapture ? { captureStream: () => ({}) } : {}),
      }),
    });
  }

  it('is false with no codec, even when captureStream exists', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => false });
    stubDocument(true);
    expect(canRecordVideo()).toBe(false);
  });

  it('is false with a codec but no captureStream', () => {
    // The failure mode that would otherwise ship a dead button: MediaRecorder
    // present and happy, canvas unable to produce a stream to feed it.
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
    stubDocument(false);
    expect(canRecordVideo()).toBe(false);
  });

  it('is true only when the whole pipeline is present', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
    stubDocument(true);
    expect(canRecordVideo()).toBe(true);
  });

  it('is false outside a browser rather than throwing', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
    vi.stubGlobal('document', undefined);
    expect(canRecordVideo()).toBe(false);
  });

  it('survives a document whose createElement throws', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
    vi.stubGlobal('document', { createElement: () => { throw new Error('blocked'); } });
    expect(canRecordVideo()).toBe(false);
  });
});
