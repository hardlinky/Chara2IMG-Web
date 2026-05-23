import { useState } from "react";
import { InviteGate } from "./features/access/InviteGate";
import { RunpodKeySettings } from "./features/access/RunpodKeySettings";
import { getRunpodKey } from "./lib/runpodKeyStorage";

export function App() {
  const [invited, setInvited] = useState(false);
  const [runpodKey, setRunpodKey] = useState(getRunpodKey());

  if (!invited) {
    return <InviteGate onInvited={() => setInvited(true)} />;
  }

  return (
    <main>
      <h1>Chara2Img Web</h1>
      <p>Invited session active.</p>
      <RunpodKeySettings onKeyChanged={setRunpodKey} />
      <p>Runpod key configured: {runpodKey ? "Yes" : "No"}</p>
    </main>
  );
}
