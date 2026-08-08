import { randomUUID } from "node:crypto";

type CapacityReservation = {
  username: string;
  walletGroupId: string | null;
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

export function reserveSubmissionCapacity(request: CapacityRequest): CapacityResult {
  if (reservations.size >= getGlobalCapacity()) {
    return { ok: false, reason: "global-capacity" };
  }

  if (request.walletGroupId && request.maxWalletActiveJobs !== null) {
    const activeForWallet = [...reservations.values()].filter(
      (reservation) => reservation.username === request.username
        && reservation.walletGroupId === request.walletGroupId
    ).length;
    if (activeForWallet >= Math.max(1, Math.floor(request.maxWalletActiveJobs))) {
      return { ok: false, reason: "wallet-capacity" };
    }
  }

  const reservationId = randomUUID();
  reservations.set(reservationId, {
    username: request.username,
    walletGroupId: request.walletGroupId
  });
  return { ok: true, reservationId };
}

export function releaseSubmissionCapacity(reservationId: string): void {
  reservations.delete(reservationId);
}