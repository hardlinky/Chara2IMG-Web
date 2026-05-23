import { useState } from "react";
import { InviteGate } from "./features/access/InviteGate";

export function App() {
  const [invited, setInvited] = useState(false);

  if (!invited) {
    return <InviteGate onInvited={() => setInvited(true)} />;
  }

  return (
    <main>
      <h1>Chara2Img Web</h1>
      <p>Invited session active.</p>
      <p>Invite-gated access is unlocked.</p>
    </main>
  );
}
