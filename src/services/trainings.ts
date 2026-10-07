import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  serverTimestamp,
  Timestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./FirebaseService";

/**
 * Every write to a training goes through here.
 *
 * The old code carried the same logic in five places — create, delete, confirm,
 * join and edit — none of them transactional, each computing remaining capacity
 * from a value the component had captured earlier. That is how three slots ended
 * up double-booked and a counter drifted.
 *
 * Here each mutation is a transaction over exactly one document, and totals are
 * recomputed from the state read inside that transaction, never from a delta the
 * caller supplied.
 */

export type ParticipantRole = "owner" | "joined";

export interface Participant {
  sportClub: string | null;
  firstName: string | null;
  secondName: string | null;
  email: string | null;
  tel_number: string | null;
  racers: number;
  coaches: number;
  tickets: number;
  role: ParticipantRole;
  joinedAt: Timestamp | null;
  confirmedAt: Timestamp | null;
  checkedInAt: Timestamp | null;
  attended: boolean | null;
}

export interface Training {
  id: string;
  resortId: string;
  courseId: string;
  courseName: string | null;
  date: string;
  session: { startTime: string; endTime: string };
  lineNumber: number;
  startAt: Timestamp | null;
  endAt: Timestamp | null;
  discipline: string | null;
  category: string | null;
  status: "created" | "confirmed";
  note: string;
  participants: Record<string, Participant>;
  participantUids: string[];
  clubs: string[];
  racersTotal: number;
  coachesTotal: number;
  participantCount: number;
  confirmedCount: number;
  createdBy: string | null;
  createdAt: Timestamp | null;
  legacyId?: string | null;
}

export interface SlotRef {
  resortId: string;
  courseId: string;
  date: string;
  session: { startTime: string; endTime: string };
  lineNumber: number;
}

export class TrainingError extends Error {
  constructor(public code: TrainingErrorCode, message: string) {
    super(message);
    this.name = "TrainingError";
  }
}

export type TrainingErrorCode =
  | "slot-taken"
  | "gone"
  | "already-joined"
  | "not-a-participant"
  | "full"
  | "past";

const TIME_ZONE = "Europe/Bratislava";

const idPart = (s: string) => String(s ?? "").replace(/[/\s]+/g, "_").replace(/__+/g, "_");

/**
 * Deterministic document id, derived from the slot itself.
 *
 * This is what makes double booking impossible rather than merely unlikely: the
 * Web SDK's transactions can only read a DocumentReference, never a query, so a
 * transaction cannot ask "is this slot free?". With the slot encoded in the id,
 * that question is a single-document read and uniqueness is enforced by
 * Firestore.
 */
export function slotId(slot: SlotRef): string {
  return [
    idPart(slot.resortId),
    idPart(slot.courseId),
    slot.date,
    String(slot.session.startTime ?? "").replace(":", ""),
    `L${slot.lineNumber}`,
  ].join("__");
}

function zoneOffset(utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asIfUtc - utcMs;
}

/** Local wall-clock time in the resort's zone → the matching instant. */
export function localInstant(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  let instant = naive - zoneOffset(naive);
  instant = naive - zoneOffset(instant);
  return new Date(instant);
}

/** Coerces to a number, because `0 + "3"` is `"03"` and the totals are stored. */
const count = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function totals(participants: Record<string, Participant>) {
  const list = Object.values(participants);
  return {
    participantUids: Object.keys(participants),
    clubs: [...new Set(list.map((p) => p.sportClub).filter(Boolean))],
    racersTotal: list.reduce((s, p) => s + count(p.racers), 0),
    coachesTotal: list.reduce((s, p) => s + count(p.coaches), 0),
    participantCount: list.length,
    confirmedCount: list.filter((p) => p.confirmedAt).length,
  };
}

export interface ParticipantInput {
  uid: string;
  sportClub: string | null;
  firstName: string | null;
  secondName: string | null;
  email: string | null;
  tel_number: string | null;
  racers: number;
  coaches?: number;
  tickets?: number;
}

function newParticipant(
  input: ParticipantInput,
  role: ParticipantRole
): Participant {
  return {
    sportClub: input.sportClub,
    firstName: input.firstName,
    secondName: input.secondName,
    email: input.email,
    tel_number: input.tel_number,
    racers: count(input.racers),
    coaches: count(input.coaches),
    tickets: input.tickets ?? 0,
    role,
    joinedAt: Timestamp.now(),
    confirmedAt: null,
    checkedInAt: null,
    attended: null,
  };
}

/** Books a slot. Fails if somebody got there first. */
export async function createTraining(
  slot: SlotRef,
  owner: ParticipantInput,
  details: {
    discipline: string;
    category: string;
    courseName?: string | null;
    capacity: number;
  }
): Promise<string> {
  const id = slotId(slot);
  const ref = doc(db, "trainings", id);
  const startAt = localInstant(slot.date, slot.session.startTime);

  if (startAt.getTime() <= Date.now()) {
    throw new TrainingError("past", "Tento termín už prebehol.");
  }
  if (owner.racers > details.capacity) {
    throw new TrainingError("full", "Počet pretekárov presahuje kapacitu trate.");
  }

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists()) {
      throw new TrainingError(
        "slot-taken",
        "Tento termín si medzitým zarezervoval iný klub."
      );
    }

    const participants = { [owner.uid]: newParticipant(owner, "owner") };

    tx.set(ref, {
      resortId: slot.resortId,
      courseId: slot.courseId,
      courseName: details.courseName ?? null,
      date: slot.date,
      session: slot.session,
      lineNumber: slot.lineNumber,
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(localInstant(slot.date, slot.session.endTime)),
      discipline: details.discipline,
      category: details.category,
      status: "created",
      note: "",
      noteUpdatedBy: null,
      noteUpdatedAt: null,
      participants,
      ...totals(participants),
      createdBy: owner.uid,
      createdOnBehalfOf: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return id;
}

/** Adds a club to an existing training. */
export async function joinTraining(
  trainingId: string,
  joiner: ParticipantInput,
  capacity: number
): Promise<void> {
  const ref = doc(db, "trainings", trainingId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new TrainingError("gone", "Tento tréning už neexistuje.");
    }

    const data = snap.data() as Training;
    if (data.participants?.[joiner.uid]) {
      throw new TrainingError("already-joined", "Už ste pridaní na tento tréning.");
    }

    // Recomputed from the value read inside the transaction. The old code
    // subtracted from a number the modal had captured when it opened, which
    // could be arbitrarily stale.
    const participants = {
      ...data.participants,
      [joiner.uid]: newParticipant(joiner, "joined"),
    };
    const next = totals(participants);

    if (next.racersTotal > capacity) {
      throw new TrainingError(
        "full",
        "Na tomto tréningu už nie je dosť voľných miest."
      );
    }

    tx.update(ref, {
      [`participants.${joiner.uid}`]: participants[joiner.uid],
      ...next,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Removes one club from a training.
 *
 * This is the defect the rework exists to fix. Previously the joined clubs
 * lived in a subcollection of the booking, so cancelling the booking left them
 * stranded — 101 such records in production. Here leaving is a field delete on
 * the shared document, and the training survives for everyone else. The last
 * participant leaving removes it; if the owner leaves while others remain, the
 * earliest joiner takes ownership.
 */
export async function leaveTraining(
  trainingId: string,
  uid: string
): Promise<"left" | "deleted"> {
  const ref = doc(db, "trainings", trainingId);
  let outcome: "left" | "deleted" = "left";

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new TrainingError("gone", "Tento tréning už neexistuje.");
    }

    const data = snap.data() as Training;
    if (!data.participants?.[uid]) {
      throw new TrainingError(
        "not-a-participant",
        "Na tomto tréningu nie ste prihlásení."
      );
    }

    const remaining = { ...data.participants };
    delete remaining[uid];

    if (Object.keys(remaining).length === 0) {
      tx.delete(ref);
      outcome = "deleted";
      return;
    }

    const wasOwner = data.participants[uid].role === "owner";
    const update: Record<string, any> = {
      [`participants.${uid}`]: deleteField(),
      ...totals(remaining),
      updatedAt: serverTimestamp(),
    };

    if (wasOwner) {
      const [nextOwnerUid] = Object.entries(remaining).sort(
        (a, b) =>
          (a[1].joinedAt?.toMillis() ?? 0) - (b[1].joinedAt?.toMillis() ?? 0)
      )[0];
      update[`participants.${nextOwnerUid}.role`] = "owner";
      update.createdBy = nextOwnerUid;
    }

    tx.update(ref, update);
  });

  return outcome;
}

/** Cancels the whole training, for every club on it. */
export async function cancelTraining(trainingId: string): Promise<void> {
  await deleteDoc(doc(db, "trainings", trainingId));
}

/** Changes one club's own numbers. */
export async function updateParticipant(
  trainingId: string,
  uid: string,
  changes: { racers?: number; coaches?: number },
  capacity: number
): Promise<void> {
  const ref = doc(db, "trainings", trainingId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new TrainingError("gone", "Tento tréning už neexistuje.");
    }

    const data = snap.data() as Training;
    const current = data.participants?.[uid];
    if (!current) {
      throw new TrainingError(
        "not-a-participant",
        "Na tomto tréningu nie ste prihlásení."
      );
    }

    const participants = {
      ...data.participants,
      [uid]: { ...current, ...changes },
    };
    const next = totals(participants);

    if (next.racersTotal > capacity) {
      throw new TrainingError("full", "Prekročili by ste kapacitu trate.");
    }

    tx.update(ref, {
      [`participants.${uid}`]: participants[uid],
      ...next,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Changes the training-level details only the organising club may set. */
export async function updateTrainingDetails(
  trainingId: string,
  changes: { discipline?: string; category?: string; note?: string }
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "trainings", trainingId);
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new TrainingError("gone", "Tento tréning už neexistuje.");
    }
    tx.update(ref, { ...changes, updatedAt: serverTimestamp() });
  });
}

/**
 * A club confirms it is coming.
 *
 * Confirmation used to be the resort admin's job, which meant somebody had to
 * chase every booking. Each club now confirms its own attendance, and the
 * training counts as confirmed once every club on it has.
 */
export async function confirmAttendance(
  trainingId: string,
  uid: string
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "trainings", trainingId);
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new TrainingError("gone", "Tento tréning už neexistuje.");
    }

    const data = snap.data() as Training;
    if (!data.participants?.[uid]) {
      throw new TrainingError(
        "not-a-participant",
        "Na tomto tréningu nie ste prihlásení."
      );
    }

    const participants = {
      ...data.participants,
      [uid]: { ...data.participants[uid], confirmedAt: Timestamp.now() },
    };
    const next = totals(participants);

    tx.update(ref, {
      [`participants.${uid}.confirmedAt`]: Timestamp.now(),
      confirmedCount: next.confirmedCount,
      status:
        next.confirmedCount === next.participantCount ? "confirmed" : "created",
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * A club marks itself present on the day.
 *
 * One field write, no transaction: it touches only this club's own record and
 * no total depends on it.
 */
export async function checkIn(
  trainingId: string,
  uid: string,
  attended: boolean
): Promise<void> {
  await updateDoc(doc(db, "trainings", trainingId), {
    [`participants.${uid}.checkedInAt`]: attended ? Timestamp.now() : null,
    [`participants.${uid}.attended`]: attended,
    updatedAt: serverTimestamp(),
  });
}

/** Marks the booking accepted by the resort. */
export async function confirmTraining(trainingId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "trainings", trainingId);
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new TrainingError("gone", "Tento tréning už neexistuje.");
    }
    tx.update(ref, { status: "confirmed", updatedAt: serverTimestamp() });
  });
}

export async function getTraining(trainingId: string): Promise<Training | null> {
  const snap = await getDoc(doc(db, "trainings", trainingId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Training) : null;
}

export interface Closure {
  id: string;
  resortId: string;
  courseId: string;
  date: string;
  lineNumber: number;
  scope: "day" | "session";
  session: { startTime: string; endTime: string } | null;
  reason: string | null;
}

export function closureId(
  resortId: string,
  courseId: string,
  date: string,
  lineNumber: number,
  startTime?: string
): string {
  return [
    idPart(resortId),
    idPart(courseId),
    date,
    startTime ? startTime.replace(":", "") : "ALL",
    `L${lineNumber}`,
  ].join("__");
}

/**
 * Subscribes to one week of one course.
 *
 * Scoped to the resort, the course and the seven days on screen — the old query
 * read every resort's bookings for 21 days (365 for admins) regardless of what
 * was displayed, then fetched each booking's participants one at a time.
 *
 * A listener rather than a one-off read: this is a contended booking system, so
 * seeing somebody else take a slot without reloading matters, and it removes the
 * full refetch that used to follow every single write.
 */
export function subscribeToWeek(
  resortId: string,
  courseId: string,
  weekDates: string[],
  onChange: (trainings: Training[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (weekDates.length === 0) {
    onChange([]);
    return () => {};
  }

  const q = query(
    collection(db, "trainings"),
    where("resortId", "==", resortId),
    where("courseId", "==", courseId),
    where("date", ">=", weekDates[0]),
    where("date", "<=", weekDates[weekDates.length - 1])
  );

  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as Training))
      );
    },
    (error) => onError?.(error)
  );
}

/** Closures for the same window. They change rarely, so a one-off read is fine. */
export function subscribeToClosures(
  resortId: string,
  courseId: string,
  weekDates: string[],
  onChange: (closures: Closure[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (weekDates.length === 0) {
    onChange([]);
    return () => {};
  }

  const q = query(
    collection(db, "closures"),
    where("resortId", "==", resortId),
    where("courseId", "==", courseId),
    where("date", ">=", weekDates[0]),
    where("date", "<=", weekDates[weekDates.length - 1])
  );

  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Closure)));
    },
    (error) => onError?.(error)
  );
}
