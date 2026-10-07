import type { Training } from "../services/trainings";

/**
 * Shapes the calendar renders.
 *
 * Lifted out of ResortPage so the extracted calendar components can share them
 * without importing from the page they are rendered by.
 */

export interface TimeSession {
  startTime: string;
  endTime: string;
}

export interface Day {
  dayOfWeek: Record<string, string>;
  date: string;
  training?: string;
  timeSessions?: TimeSession[];
}

export interface Week {
  startDate: string;
  endDate: string;
  days: Day[];
  season: string;
}

export interface Season {
  id: string;
  season: string;
  weeks: Week[];
}

export interface User {
  email: string;
  firstName: string;
  secondName: string;
  sportClub?: string;
  ownRacers: number;
  tel_number: string;
}

export interface ReservationDetails {
  createdAt: string;
  date: string;
  discipline: string;
  category: string;
  tickets: number;
  lineNumber: number;
  availableRacers: number;
  status: string;
  user: User;
  id: string;
  session: TimeSession;
  addedUsers?: User[];
}

export interface ClosedTrack {
  reason: string;
}

/** Everything a session cell needs to act, passed down as one object. */
export interface CalendarActions {
  onReserve: (date: string, session: TimeSession, lineNumber: number) => void;
  onEdit: (training: Training) => void;
  /**
   * One control for both outcomes: a joined club leaves, the organising club
   * (or an admin) cancels. The service decides which, because only it knows
   * whether anybody else is still on the training.
   */
  onLeaveOrCancel: (training: Training) => void;
  onShowDetails: (training: Training) => void;
  onJoinTraining: (
    date: string,
    session: TimeSession,
    lineNumber: number,
    sportClub: string
  ) => void;
  onConfirm: (trainingId: string) => void;
  /** Admin only: move a booking to another slot. */
  onMove: (training: Training) => void;
  onCheckIn: (trainingId: string, attended: boolean) => void;
  onCloseTrack: (lineNumber: number, date: string) => void;
  onOpenTrack: (lineNumber: number, date: string) => void;
  /** Reopens a single blocked time block. */
  onOpenBlock: (lineNumber: number, date: string, startTime: string) => void;
}

/** Who is looking at the calendar — constant for a whole render. */
export interface Viewer {
  isLoggedIn: boolean;
  isAdmin: boolean;
  email: string | null;
  /** Auth uid: participants are keyed by it in the new model. */
  uid: string | null;
}
