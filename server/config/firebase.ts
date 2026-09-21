import { initializeApp, getApps, getApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');

let firebaseConfig: any = {};
if (existsSync(configPath)) {
  try {
    firebaseConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.warn('Could not parse firebase-applet-config.json, using environment variables:', err);
  }
}

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig.projectId;
const databaseId = process.env.FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)';

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: projectId
  });
}

const app = getApp();

export const db = getFirestore(app, databaseId);
export const auth = getAuth(app);

