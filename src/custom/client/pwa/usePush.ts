import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPushConfig,
  savePushSubscription,
} from "@/custom/serverFunctions/push";
import { urlBase64ToUint8Array } from "./cache-policy";

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
    (window.navigator as { standalone?: boolean }).standalone === true
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
      const existing = await registration.pushManager.getSubscription();
      setSubscribed(Boolean(existing));
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
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).slice()
          .buffer as ArrayBuffer,
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth)
        return false;

      await savePushSubscription({
        data: {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
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
