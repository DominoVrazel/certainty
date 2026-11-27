import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./FirebaseService";
import { cutoffsFrom, type ResortCutoffs } from "./policy";
import { assertWritable } from "./maintenance";

/**
 * Settings the resort administrator controls, stored on the resort document.
 */

/** Field name, so the reader and the writer cannot drift apart. */
export const AUTO_CONFIRM_FIELD = "autoConfirmReservations";

/**
 * Whether this resort accepts bookings without anyone confirming them.
 *
 * A missing field counts as on. Every resort that already exists predates the
 * setting, and confirming each booking by hand is exactly the chore it removes
 * — so the default has to be the quiet one.
 */
export function autoConfirmFrom(resortData: unknown): boolean {
  const value = (resortData as Record<string, unknown> | null | undefined)?.[
    AUTO_CONFIRM_FIELD
  ];
  return value !== false;
}

export async function getAutoConfirm(resortId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "resorts", resortId));
  return autoConfirmFrom(snap.exists() ? snap.data() : null);
}

/** Only an admin may call this; `firestore.rules` enforces it. */
export async function setAutoConfirm(
  resortId: string,
  enabled: boolean
): Promise<void> {
  assertWritable();
  await updateDoc(doc(db, "resorts", resortId), {
    [AUTO_CONFIRM_FIELD]: enabled,
  });
}

/**
 * The two deadlines the resort controls: how late a club may book a slot, and
 * how late it may change one it is already on.
 *
 * Read through `cutoffsFrom`, which fills in what a resort document does not
 * have — every resort predates these fields, and the defaults are what the
 * app did before they existed.
 */
export async function getCutoffs(resortId: string): Promise<ResortCutoffs> {
  const snap = await getDoc(doc(db, "resorts", resortId));
  return cutoffsFrom(snap.exists() ? snap.data() : null);
}

/** Only an admin may call this; `firestore.rules` enforces it. */
export async function setCutoffs(
  resortId: string,
  cutoffs: ResortCutoffs
): Promise<void> {
  await updateDoc(doc(db, "resorts", resortId), { ...cutoffs });
}
