export interface MapEditMessage {
  readonly type: 'open' | 'dirty' | 'saved';
  readonly senderId: string;
  readonly revision: number;
}

export class MapEditChannel {
  private readonly senderId = crypto.randomUUID();
  private readonly channel: BroadcastChannel | null;

  constructor(
    ownerId: string,
    mapId: string,
    private readonly onOtherTab: (message: MapEditMessage) => void,
  ) {
    this.channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(`atlas-map-edit:${ownerId}:${mapId}`);
    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<unknown>) => {
        const message = event.data as Partial<MapEditMessage> | null;
        if (
          message &&
          message.senderId !== this.senderId &&
          ['open', 'dirty', 'saved'].includes(message.type ?? '') &&
          typeof message.revision === 'number'
        ) {
          this.onOtherTab(message as MapEditMessage);
        }
      };
    }
  }

  post(type: MapEditMessage['type'], revision: number): void {
    this.channel?.postMessage({ type, senderId: this.senderId, revision } satisfies MapEditMessage);
  }

  close(): void {
    this.channel?.close();
  }
}
