import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPushConfig,
  savePushSubscription,
} from "@/custom/serverFunctions/push";
import { urlBase64ToUint8Array } from "./cache-policy";

// The app's types include Cloudflare's worker globals, which shadow the DOM's
// ServiceWorkerRegistration and leave `pushManager` untyped. Declare the slice
// of the Push API this hook actually uses.
type PushKeyName = "p256dh" | "auth";

interface BrowserPushSubscription {
  endpoint: string;
  getKey(name: PushKeyName): ArrayBuffer | null;
}

interface BrowserPushManager {
  getSubscription(): Promise<BrowserPushSubscription | null>;
  subscribe(options: {
    userVisibleOnly: boolean;
    applicationServerKey: ArrayBuffer;
  }): Promise<BrowserPushSubscription>;
}

function pushManagerOf(registration: object): BrowserPushManager | null {
  if (!("pushManager" in registration)) return null;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the browser's real PushManager; the DOM type is shadowed by the worker globals
  return registration.pushManager as BrowserPushManager;
}

/** The subscription's raw keys, base64url. `getKey` returns an ArrayBuffer;
 *  the server wants the encoded form the Push API's JSON uses. */
function readKey(
  subscription: BrowserPushSubscription,
  name: PushKeyName,
): string | null {
  const buffer = subscription.getKey(name);
  if (!buffer) return null;
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports as a Mac with touch.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own flag, still the only reliable one on iOS.
    Reflect.get(window.navigator, "standalone") === true
  );
}

export function usePush() {
  const [permission, setPermission] = React.useState<NotificationPermission>(
    typeof Notification === "undefined" ? "default" : Notification.permission,
  );
  const [subscribed, setSubscribed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  // On iOS, push only exists once the app is installed to the home screen.
  const needsInstall = isIos() && !isStandalone();

  const configQuery = useQuery({
    queryKey: ["custom", "pushConfig"],
    queryFn: () => getPushConfig(),
    enabled: supported && !needsInstall,
    staleTime: 5 * 60_000,
  });

  React.useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker.ready.then(async (registration) => {
      const manager = pushManagerOf(registration);
      if (!manager) return;
      setSubscribed(Boolean(await manager.getSubscription()));
    });
  }, [supported]);

  const subscribe = React.useCallback(async () => {
    const publicKey = configQuery.data?.publicKey;
    if (!supported || !publicKey) return false;
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return false;

      const registration = await navigator.serviceWorker.ready;
      const manager = pushManagerOf(registration);
      if (!manager) return false;
      const subscription = await manager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).slice().buffer,
      });
      const endpoint = subscription.endpoint;
      const p256dh = readKey(subscription, "p256dh");
      const auth = readKey(subscription, "auth");
      if (!endpoint || !p256dh || !auth) return false;

      await savePushSubscription({
        data: {
          endpoint,
          keys: { p256dh, auth },
          userAgent: navigator.userAgent.slice(0, 500),
        },
      });
      setSubscribed(true);
      return true;
    } finally {
      setBusy(false);
    }
  }, [configQuery.data?.publicKey, supported]);

  return {
    supported,
    needsInstall,
    permission,
    subscribed,
    busy,
    // Nothing to offer until the Worker has published a key.
    available: Boolean(configQuery.data?.publicKey),
    subscribe,
  };
}
