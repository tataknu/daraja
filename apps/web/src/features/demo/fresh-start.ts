// The demo's data is shared and outlives a visit, so a new browser tab starts from a clean demo;
// reloads and switching tabs keep the conversation going. Without session storage, never reset:
// a reload must not wipe a conversation.
const KEY = "daraja:demo-started";

export function needsFreshStart(storage: () => Storage = () => sessionStorage): boolean {
  try {
    return storage().getItem(KEY) !== "1";
  } catch {
    return false;
  }
}

export function markStarted(storage: () => Storage = () => sessionStorage): void {
  try {
    storage().setItem(KEY, "1");
  } catch {
    // Storage blocked: needsFreshStart already says no.
  }
}
