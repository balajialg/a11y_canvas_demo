/**
 * Canvas A11y Remediator – Background Service Worker
 *
 * Handles extension lifecycle events and relays messages between the popup
 * and content scripts.
 */

/* -------------------------------------------------------------------------
 * Install / update lifecycle
 * ---------------------------------------------------------------------- */
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    console.log('[A11y Remediator] Extension installed.');
    // Open a welcome / help page on first install
    chrome.tabs.create({
      url: 'https://www.w3.org/WAI/WCAG21/quickref/',
    });
  }
});

/* -------------------------------------------------------------------------
 * Action button (toolbar icon) click – toggles the panel
 * ---------------------------------------------------------------------- */
chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_PANEL' });
  } catch (err) {
    // Content script not yet ready – inject it
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [
        'content/scanner.js',
        'content/remediator.js',
        'content/content.js',
      ],
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content/panel.css'],
    });
    // Try again after injection
    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_PANEL' });
      } catch (_) { /* ignore */ }
    }, 300);
  }
});

/* -------------------------------------------------------------------------
 * Keyboard shortcut support
 * ---------------------------------------------------------------------- */
chrome.commands.onCommand.addListener(async command => {
  if (command !== 'toggle-panel') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_PANEL' });
  } catch (_) { /* ignore */ }
});
