import { applyStorage, readStorageSnapshot } from '../lib/dom-storage';
import { CONTENT_SCRIPT_MATCHES } from '../lib/hosts';
import type { StorageApply } from '../lib/planner';
import type { BgResponse, TabRequest } from '../lib/msg';

const PENDING_MARKER = '__lss_pending_done';

export default defineContentScript({
  // Explicit local patterns (not site-wide). Chrome still only injects where
  // host permission is granted — localhost by default, extra *.test/*.local/…
  // after the optional grant.
  matches: [...CONTENT_SCRIPT_MATCHES],
  runAt: 'document_start',
  allFrames: false,
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const request = message as TabRequest;
      if (request?.type === 'readStorage') {
        sendResponse(readStorageSnapshot());
      } else if (request?.type === 'applyStorage') {
        sendResponse(applyStorage(request.apply));
      }
      return false;
    });

    void pullPendingInjection();
  },
});

/** Applies a session queued while no tab was open for this origin. */
async function pullPendingInjection(): Promise<void> {
  try {
    const response = (await browser.runtime.sendMessage({
      type: 'takePendingInjection',
      origin: location.origin,
    })) as BgResponse<{ apply: StorageApply | null }> | undefined;
    const apply = response && response.ok ? response.data.apply : null;
    if (!apply) return;

    const stillBooting = document.readyState === 'loading';
    if (!stillBooting && !sessionStorage.getItem(PENDING_MARKER)) {
      // Page scripts may have already read storage — apply, then reload once for a clean boot.
      sessionStorage.setItem(PENDING_MARKER, '1');
      applyStorage(apply);
      location.reload();
      return;
    }
    applyStorage(apply);
    sessionStorage.removeItem(PENDING_MARKER);
  } catch {
    // background unavailable (e.g. extension reloading) — nothing to do
  }
}
