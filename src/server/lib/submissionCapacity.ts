import { randomUUID } from "node:crypto";
import { listJobs } from "./jobStore";
import { isActiveRunpodStatus } from "../../shared/contracts/jobs";

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

function getGlobalCapacity(): number {
  const configured = Number(process.env.RUNPOD_GLOBAL_CONCURRENCY ?? 20);
  return Number.isFinite(configured) ? Math.max(1, Math.floor(configured)) : 20;
}

async function getActiveWalletJobIds(username: string, walletGroupId: string): Promise<Set<string>> {
  const jobs = await listJobs();
  return new Set(
    jobs
      .filter((job) => !job.isTerminal
        && job.walletGroupId === walletGroupId
        && (job.billingUsername ?? job.createdBy) === username
        && isActiveRunpodStatus(job.status))
      .map((job) => job.jobId),
  );
}

export function attachReservationJobId(reservationId: string, jobId: string): void {
  const reservation = reservations.get(reservationId);
  if (reservation) {
    reservation.jobId = jobId;
  }
}

export async function reserveSubmissionCapacity(request: CapacityRequest): Promise<CapacityResult> {
  if (reservations.size >= getGlobalCapacity()) {
    return { ok: false, reason: "global-capacity" };
  }

  if (request.walletGroupId && request.maxWalletActiveJobs !== null) {
    const activeWalletJobIds = await getActiveWalletJobIds(request.username, request.walletGroupId);
    const maxActiveJobs = Math.max(1, Math.floor(request.maxWalletActiveJobs));
    const activeReservationCount = [...reservations.values()].filter((reservation) => {
      if (reservation.username !== request.username || reservation.walletGroupId !== request.walletGroupId) {
        return false;
      }
      return Boolean(reservation.jobId) && activeWalletJobIds.has(reservation.jobId as string);
    }).length;

    if (activeWalletJobIds.size + activeReservationCount >= maxActiveJobs) {
      return { ok: false, reason: "wallet-capacity" };
    }
  }

  const reservationId = randomUUID();
  reservations.set(reservationId, {
    username: request.username,
    walletGroupId: request.walletGroupId,
    createdAt: Date.now(),
  });
  return { ok: true, reservationId };
}

export function releaseSubmissionCapacity(reservationId: string): void {
  reservations.delete(reservationId);
}