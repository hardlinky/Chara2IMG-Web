import { randomUUID } from "node:crypto";
import { listJobs } from "./jobStore";
import { isActiveRunpodStatus, type JobRecord } from "../../shared/contracts/jobs";

type CapacityReservation = {
  username: string;
  walletGroupId: string | null;
  createdAt: number;
  jobId?: string | null;
};

type CapacityRequest = CapacityReservation & {
  maxWalletActiveJobs: number | null;
};

export type CapacityResult =
  | { ok: true; reservationId: string }
  | { ok: false; reason: "global-capacity" | "wallet-capacity" };

const reservations = new Map<string, CapacityReservation>();

// A reservation that never receives a job id (submission died mid-flight) would
// otherwise hold its slot forever.
const UNCLAIMED_RESERVATION_TTL_MS = 5 * 60_000;

function getGlobalCapacity(): number {
  const configured = Number(process.env.RUNPOD_GLOBAL_CONCURRENCY ?? 20);
  return Number.isFinite(configured) ? Math.max(1, Math.floor(configured)) : 20;
}

function isActiveJob(job: JobRecord): boolean {
  return !job.isTerminal && isActiveRunpodStatus(job.status);
}

function getActiveWalletJobIds(jobs: JobRecord[], username: string, walletGroupId: string): Set<string> {
  return new Set(
    jobs
      .filter((job) => isActiveJob(job)
        && job.walletGroupId === walletGroupId
        && (job.billingUsername ?? job.createdBy) === username)
      .map((job) => job.jobId),
  );
}

/**
 * Drop reservations whose job has finished or vanished. Releases elsewhere are
 * best-effort, so capacity has to be able to recover on its own.
 */
function purgeStaleReservations(jobs: JobRecord[], now: number): void {
  if (reservations.size === 0) {
    return;
  }

  const activeJobIds = new Set(jobs.filter(isActiveJob).map((job) => job.jobId));
  for (const [reservationId, reservation] of reservations) {
    const stale = reservation.jobId
      ? !activeJobIds.has(reservation.jobId)
      : now - reservation.createdAt > UNCLAIMED_RESERVATION_TTL_MS;
    if (stale) {
      reservations.delete(reservationId);
    }
  }
}

export function attachReservationJobId(reservationId: string, jobId: string): void {
  const reservation = reservations.get(reservationId);
  if (reservation) {
    reservation.jobId = jobId;
  }
}

export async function reserveSubmissionCapacity(request: CapacityRequest): Promise<CapacityResult> {
  const jobs = await listJobs();
  purgeStaleReservations(jobs, request.createdAt);

  if (reservations.size >= getGlobalCapacity()) {
    return { ok: false, reason: "global-capacity" };
  }

  if (request.walletGroupId && request.maxWalletActiveJobs !== null) {
    const activeWalletJobIds = getActiveWalletJobIds(jobs, request.username, request.walletGroupId);
    const maxActiveJobs = Math.max(1, Math.floor(request.maxWalletActiveJobs));
    // Only reservations still waiting for their job to appear count here; the
    // purge above already removed the ones whose job has finished.
    const pendingReservationCount = [...reservations.values()].filter((reservation) => {
      if (reservation.username !== request.username || reservation.walletGroupId !== request.walletGroupId) {
        return false;
      }
      return !reservation.jobId || !activeWalletJobIds.has(reservation.jobId);
    }).length;

    if (activeWalletJobIds.size + pendingReservationCount >= maxActiveJobs) {
      return { ok: false, reason: "wallet-capacity" };
    }
  }

  const reservationId = randomUUID();
  reservations.set(reservationId, {
    username: request.username,
    walletGroupId: request.walletGroupId,
    createdAt: request.createdAt,
  });
  return { ok: true, reservationId };
}

export function releaseSubmissionCapacity(reservationId: string): void {
  reservations.delete(reservationId);
}