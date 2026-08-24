import type {
  ArrivalClassification,
  AttendanceEventType,
  PresenceState,
} from "@/features/attendance/domain/types";
import type { UserRole } from "@/lib/constants/roles";

export type SessionStatus = "SCHEDULED" | "ACTIVE" | "CLOSED";

export interface DemoUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface DemoGroup {
  id: string;
  name: string;
  ageRange: string;
  location: string;
}

export interface DemoChild {
  id: string;
  firstName: string;
  lastName: string;
}

export interface DemoSession {
  id: string;
  groupId: string;
  startsAt: Date;
  endsAt: Date;
  lateAfterMinutes: number;
  status: SessionStatus;
  closedAt: Date | null;
  closedBy: string | null;
  monitorIds: string[];
}

export interface DemoParticipant {
  id: string;
  sessionId: string;
  childId: string;
  presenceState: PresenceState;
  arrivalClassification: ArrivalClassification;
  arrivedAt: Date | null;
  leftAt: Date | null;
  lastEventId: string | null;
}

export interface DemoEvent {
  id: string;
  sessionId: string;
  sessionParticipantId: string;
  sequenceNumber: number;
  eventType: AttendanceEventType;
  presenceStateAfter: PresenceState | null;
  arrivalClassification: ArrivalClassification | null;
  occurredAt: Date;
  recordedAt: Date;
  recordedByName: string;
  correctedEventId: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  correctionReason: string | null;
}

export interface DemoAuditEntry {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  recordedAt: Date;
}

export interface DemoCorrectionAnomaly {
  id: string;
  sessionId: string;
  description: string;
  status: "OPEN" | "RESOLVED";
  detectedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}
