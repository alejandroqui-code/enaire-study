// ═══════════════════════════════════════════════════════════
//  FIREBASE.JS — Auth + Firestore
// ═══════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── CONFIG — replace with your Firebase credentials ────────
const firebaseConfig = {
  apiKey:            "AIzaSyDVcCB1yQrRLCqqzlXC-hGzwvNQ5X0p_-o",
  authDomain:        "enaire-study-2.firebaseapp.com",
  projectId:            "enaire-study-2",
  storageBucket:     "enaire-study-2.firebasestorage.app",
  messagingSenderId: "465485291220",
  appId:             "1:465485291220:web:c14bb21a2bb9e9df7e2541"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── AUTH ────────────────────────────────────────────────────
const provider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  return await signInWithPopup(auth, provider);
}

export async function signOut() {
  return await fbSignOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ── CARDS ────────────────────────────────────────────────────
function cardsRef(uid) {
  return collection(db, "users", uid, "cards");
}

export async function loadCards(uid) {
  const snap = await getDocs(cardsRef(uid));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveCard(uid, card) {
  const ref = doc(cardsRef(uid), card.id);
  await setDoc(ref, card, { merge: true });
}

export async function saveCards(uid, cards) {
  const batch = writeBatch(db);
  cards.forEach(card => {
    const ref = doc(cardsRef(uid), card.id);
    batch.set(ref, card, { merge: true });
  });
  await batch.commit();
}

export async function updateCard(uid, cardId, data) {
  const ref = doc(cardsRef(uid), cardId);
  await updateDoc(ref, data);
}

export async function deleteCard(uid, cardId) {
  const ref = doc(cardsRef(uid), cardId);
  await deleteDoc(ref);
}

// ── BLOCK STATUS (dashboard data) ────────────────────────────
function blockStatusRef(uid) {
  return collection(db, "users", uid, "blockStatus");
}

export async function loadBlockStatus(uid) {
  const snap = await getDocs(blockStatusRef(uid));
  const result = {};
  snap.docs.forEach(d => { result[d.id] = d.data(); });
  return result;
}

export async function saveBlockStatus(uid, blockName, data) {
  const ref = doc(blockStatusRef(uid), blockName);
  await setDoc(ref, data, { merge: true });
}

// ── META (streak, today count) ────────────────────────────────
function metaRef(uid) {
  return doc(db, "users", uid, "meta", "stats");
}

export async function loadMeta(uid) {
  const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const snap = await getDoc(metaRef(uid));
  return snap.exists() ? snap.data() : {};
}

export async function saveMeta(uid, data) {
  await setDoc(metaRef(uid), data, { merge: true });
}

// Export db and auth for direct use if needed
export { auth, db };