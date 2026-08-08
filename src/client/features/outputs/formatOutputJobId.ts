export { formatJobDisplayName as formatOutputJobId } from "../../../shared/jobDisplay";

export function formatOutputOwner(createdBy: string | null | undefined, currentUser: string | null): string {
	if (!createdBy) return "Anon";
	return createdBy === currentUser ? "You" : createdBy;
}