import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_IDS } from '@fantasy-map/map-model/fixtures';

import { MapEditChannel, type MapEditMessage } from './map-edit-channel.js';

class FakeBroadcastChannel {
  static readonly channels: FakeBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  constructor(readonly name: string) {
    FakeBroadcastChannel.channels.push(this);
  }

  postMessage(message: unknown): void {
    for (const channel of FakeBroadcastChannel.channels) {
      if (channel !== this && channel.name === this.name) {
        channel.onmessage?.({ data: message } as MessageEvent<unknown>);
      }
    }
  }

  close(): void {
    const index = FakeBroadcastChannel.channels.indexOf(this);
    if (index >= 0) FakeBroadcastChannel.channels.splice(index, 1);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeBroadcastChannel.channels.length = 0;
});

describe('MapEditChannel', () => {
  it('notifies another tab editing the same owner and map', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    const received: MapEditMessage[] = [];
    const first = new MapEditChannel(FIXTURE_IDS.project, FIXTURE_IDS.map, () => undefined);
    const second = new MapEditChannel(FIXTURE_IDS.project, FIXTURE_IDS.map, (message) =>
      received.push(message),
    );

    first.post('dirty', 3);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: 'dirty', revision: 3 });
    first.close();
    second.close();
  });
});
