import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

/** Clicking Luci's icon puts the toolbar on the current tab (or takes it off again). */
export default defineBackground(() => {
  browser.action.onClicked.addListener(async (tab) => {
    if (tab.id === undefined) return;
    try {
      await browser.scripting.executeScript({ target: { tabId: tab.id }, files: ['/toolbar.js'] });
    } catch (err) {
      // Browser pages (chrome://, the Web Store) can't be scripted by any extension
      console.warn(`Luci can't run on this page: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
});
