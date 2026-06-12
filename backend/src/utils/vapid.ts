import webpush from 'web-push';

let publicKey = process.env.VAPID_PUBLIC_KEY;
let privateKey = process.env.VAPID_PRIVATE_KEY;

if (!publicKey || !privateKey) {
  console.warn('[VAPID] Keys not found in environment. Generating a temporary pair...');
  const keys = webpush.generateVAPIDKeys();
  publicKey = keys.publicKey;
  privateKey = keys.privateKey;
  console.log(`\n=========================================\n[VAPID] Add these to your backend .env:\nVAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n=========================================\n`);
}

webpush.setVapidDetails(
  'mailto:admin@juet-sync.local',
  publicKey,
  privateKey
);

export { publicKey, privateKey, webpush };
