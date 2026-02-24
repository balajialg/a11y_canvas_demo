/**
 * Canvas A11y Remediator – Extension Popup Script
 */

/* Supported Canvas domains */
const CANVAS_DOMAINS = ['instructure.com', 'canvas.net', 'canvaslms.com'];

function isCanvasPage(url) {
  try {
    const hostname = new URL(url).hostname;
    return CANVAS_DOMAINS.some(domain => hostname.endsWith(domain));
  } catch {
    return false;
  }
}

function renderSummary(summary) {
  const area = document.getElementById('summary-area');
  if (!area) return;

  if (!summary) {
    area.innerHTML = '<span class="badge badge--total" id="no-scan-yet">No scan yet</span>';
    return;
  }

  const parts = [`<span class="badge badge--total">${summary.total} Issue${summary.total !== 1 ? 's' : ''}</span>`];
  if (summary.critical) parts.push(`<span class="badge badge--critical">${summary.critical} Critical</span>`);
  if (summary.serious)  parts.push(`<span class="badge badge--serious">${summary.serious} Serious</span>`);
  if (summary.moderate) parts.push(`<span class="badge badge--moderate">${summary.moderate} Moderate</span>`);
  if (summary.minor)    parts.push(`<span class="badge badge--minor">${summary.minor} Minor</span>`);
  if (summary.total === 0) parts.push('<span class="badge badge--ok">✓ All clear!</span>');

  area.innerHTML = parts.join('');
}

async function init() {
  const statusEl = document.getElementById('status-text');
  const warning  = document.getElementById('not-canvas-warning');
  const btnScan  = document.getElementById('btn-scan');
  const btnToggle= document.getElementById('btn-toggle');

  // Get active tab
  let tab;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = activeTab;
  } catch (err) {
    statusEl.textContent = 'Unable to access active tab.';
    statusEl.className = 'error';
    return;
  }

  if (!tab || !tab.url) {
    statusEl.textContent = 'No active tab found.';
    return;
  }

  // Check if we're on a Canvas page
  if (!isCanvasPage(tab.url)) {
    statusEl.textContent = 'Not a Canvas page.';
    warning.style.display = 'block';
    btnScan.disabled  = true;
    btnToggle.disabled = true;
    return;
  }

  statusEl.textContent = '✓ Canvas page detected';
  statusEl.className = 'active';

  // Retrieve last scan summary from content script
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_SUMMARY' });
    if (response && response.summary) {
      renderSummary(response.summary);
    }
  } catch {
    // Content script may not be injected yet (e.g., fresh page load)
  }

  // Scan now button
  btnScan.addEventListener('click', async () => {
    btnScan.disabled  = true;
    btnScan.textContent = 'Scanning…';
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'RUN_SCAN' });
      // Close popup so user can see the panel
      window.close();
    } catch (err) {
      statusEl.textContent = 'Error: could not reach content script.';
      statusEl.className = 'error';
    } finally {
      btnScan.disabled  = false;
      btnScan.textContent = '🔍 Scan Page Now';
    }
  });

  // Toggle panel button
  btnToggle.addEventListener('click', async () => {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_PANEL' });
      window.close();
    } catch (err) {
      statusEl.textContent = 'Error: could not reach content script.';
      statusEl.className = 'error';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
