export type CreditBalanceView =
  | {
      managed: true;
      unlimited: false;
      refreshingCredits: number;
      staticCredits: number;
    }
  | {
      managed: false;
      unlimited: true;
    };

export function CreditBalanceDisplay({ balance }: { balance: CreditBalanceView | null }) {
  if (!balance) {
    return <span>Credits: --</span>;
  }
  if (!balance.managed) {
    return <span>Credits: Free</span>;
  }
  return (
    <>
      <span className="credit-balance credit-balance-refreshing">Green: {balance.refreshingCredits}</span>
      <span className="credit-balance credit-balance-static">Gold: {balance.staticCredits}</span>
    </>
  );
}