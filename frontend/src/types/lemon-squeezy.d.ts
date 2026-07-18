interface LemonSqueezyEvent {
  event: string;
  data?: unknown;
}

interface Window {
  createLemonSqueezy?: () => void;
  LemonSqueezy?: {
    Setup: (options: { eventHandler: (event: LemonSqueezyEvent) => void }) => void;
    Url: { Open: (url: string) => void; Close: () => void };
  };
}
