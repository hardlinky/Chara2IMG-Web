import { ReconciliationPanel } from "./ReconciliationPanel";

type AdminTabProps = {
  enabled: boolean;
};

export function AdminTab({ enabled }: AdminTabProps) {
  if (!enabled) {
    return (
      <section className="setup-card">
        <p>Unlock Admin to view the reconciliation panel.</p>
      </section>
    );
  }

  return <ReconciliationPanel />;
}
