import { describe, expect, it, vi } from 'vitest';

import { CameraController } from './CameraController.js';

function frameHarness() {
  let id = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    request: (callback: FrameRequestCallback) => {
      callbacks.set(++id, callback);
      return id;
    },
    cancel: (handle: number) => callbacks.delete(handle),
    run: (time = 16) => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(time));
    },
    size: () => callbacks.size,
  };
}

describe('CameraController', () => {
  it('coalesces high-frequency pan input into one frame update', () => {
    const frames = frameHarness();
    const onChange = vi.fn();
    const controller = new CameraController({
      initialCamera: { x: 100, y: 50, zoom: 2 },
      initialViewport: { width: 800, height: 600 },
      minZoom: 0.02,
      maxZoom: 16,
      onChange,
      requestFrame: frames.request,
      cancelFrame: frames.cancel,
    });

    controller.panByScreen(20, 10);
    controller.panByScreen(10, -4);
    expect(frames.size()).toBe(1);
    expect(onChange).not.toHaveBeenCalled();

    frames.run();
    expect(controller.getSnapshot().camera).toEqual({ x: 85, y: 47, zoom: 2 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('keeps the world point beneath the pointer fixed while zooming', () => {
    const frames = frameHarness();
    const controller = new CameraController({
      initialCamera: { x: 500, y: 300, zoom: 1 },
      initialViewport: { width: 1000, height: 600 },
      minZoom: 0.02,
      maxZoom: 16,
      requestFrame: frames.request,
      cancelFrame: frames.cancel,
    });
    const pointer = { x: 760, y: 180 };
    const before = controller.screenToWorld(pointer);

    controller.zoomAt(pointer, -240);
    frames.run();

    const after = controller.screenToWorld(pointer);
    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
    expect(controller.getSnapshot().camera.zoom).toBeGreaterThan(1);
  });

  it('cancels queued work and stops emitting after destroy', () => {
    const frames = frameHarness();
    const onChange = vi.fn();
    const controller = new CameraController({
      minZoom: 0.02,
      maxZoom: 16,
      onChange,
      requestFrame: frames.request,
      cancelFrame: frames.cancel,
    });
    controller.panByScreen(10, 10);
    controller.destroy();

    expect(frames.size()).toBe(0);
    frames.run();
    expect(onChange).not.toHaveBeenCalled();
  });
});
