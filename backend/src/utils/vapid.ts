import webpush from 'web-push';

let publicKey = process.env.VAPID_PUBLIC_KEY;
let privateKey = process.env.VAPID_PRIVATE_KEY;

if (!publicKey || !privateKey) {
  // Throwaway keys — push delivery will silently fail until real keys are set.
  // The private key is intentionally NOT logged to avoid leaking it into log aggregators.
  const keys = webpush.generateVAPIDKeys();
  publicKey = keys.publicKey;
  privateKey = keys.privateKey;
  console.warn(
    '[VAPID] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set. ' +
    'A temporary pair has been generated for this boot — push notifications will NOT work across restarts. ' +
    'Generate persistent keys with: npx web-push generate-vapid-keys'
  );
}

webpush.setVapidDetails(
  'mailto:admin@juet-sync.local',
  publicKey,
  privateKey
);

export { publicKey, privateKey, webpush };
