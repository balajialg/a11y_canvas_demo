/**
 * Canvas A11y Remediator – Content Script
 *
 * Injects the accessibility panel into Canvas LMS pages and wires up the
 * scanner, remediator, and UI interactions.
 */

/* -------------------------------------------------------------------------
 * State
 * ---------------------------------------------------------------------- */
let _panelVisible  = false;
let _lastScanResult = null;  // { issues, summary }
let _activeFilter   = 'all'; // 'all' | 'critical' | 'serious' | 'moderate' | 'minor'

/* -------------------------------------------------------------------------
 * Panel HTML template
 * ---------------------------------------------------------------------- */
function buildPanelHTML() {
  return `
<div id="a11y-panel" role="complementary" aria-label="Canvas Accessibility Panel" class="a11y-panel--hidden">

  <div id="a11y-panel-header">
    <h1 id="a11y-panel-title">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="#fff" stroke-width="2"/>
        <text x="12" y="17" font-size="13" font-family="Arial,sans-serif" font-weight="bold"
              fill="#fff" text-anchor="middle">A</text>
      </svg>
      Canvas A11y
    </h1>
    <button id="a11y-panel-close" aria-label="Close accessibility panel" title="Close panel">✕</button>
  </div>

  <div id="a11y-panel-toolbar" role="toolbar" aria-label="Accessibility tools">
    <button id="a11y-scan-btn"   class="a11y-btn a11y-btn--primary"   aria-label="Scan page for accessibility issues">Scan Page</button>
    <button id="a11y-export-btn" class="a11y-btn a11y-btn--secondary"  aria-label="Export issues as JSON report"      disabled>Export Report</button>
  </div>

  <div id="a11y-panel-summary" role="status" aria-live="polite" aria-atomic="true">
    <span class="a11y-badge--total a11y-badge" id="a11y-badge-total"    aria-label="Total issues">No scan yet</span>
  </div>

  <div id="a11y-panel-filters" role="tablist" aria-label="Filter by severity">
    <button class="a11y-filter-tab active" data-filter="all"      role="tab" aria-selected="true"  aria-controls="a11y-panel-list">All</button>
    <button class="a11y-filter-tab"        data-filter="critical" role="tab" aria-selected="false" aria-controls="a11y-panel-list">Critical</button>
    <button class="a11y-filter-tab"        data-filter="serious"  role="tab" aria-selected="false" aria-controls="a11y-panel-list">Serious</button>
    <button class="a11y-filter-tab"        data-filter="moderate" role="tab" aria-selected="false" aria-controls="a11y-panel-list">Moderate</button>
    <button class="a11y-filter-tab"        data-filter="minor"    role="tab" aria-selected="false" aria-controls="a11y-panel-list">Minor</button>
  </div>

  <div id="a11y-panel-loading" aria-live="polite" aria-label="Scanning in progress">
    <div class="a11y-spinner" aria-hidden="true"></div>
    <span>Scanning…</span>
  </div>

  <div id="a11y-panel-list" role="tabpanel" aria-label="Accessibility issues" tabindex="0">
    <div id="a11y-panel-empty" aria-live="polite">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="#888" stroke-width="1.5"/>
        <path d="M12 8v4M12 16h.01" stroke="#888" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <p>Click <strong>Scan Page</strong> to check this Canvas page for WCAG 2.1 AA accessibility issues.</p>
    </div>
  </div>

  <div id="a11y-panel-footer">
    Canvas A11y Remediator &bull; WCAG 2.1 AA &bull; <a href="https://www.w3.org/WAI/standards-guidelines/wcag/" target="_blank" rel="noopener noreferrer" style="color:#1a73e8">WCAG Guide</a>
  </div>
</div>
`;
}

/* -------------------------------------------------------------------------
 * Render helpers
 * ---------------------------------------------------------------------- */

function severityLabel(sev) {
  return sev.charAt(0).toUpperCase() + sev.slice(1);
}

/**
 * Escape HTML to prevent XSS when inserting text content into innerHTML.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the HTML for a single issue card.
 */
function buildIssueCard(issue, index) {
  const sev       = issue.severity || 'minor';
  const wcagCrit  = issue.wcag || {};
  const wcagId    = wcagCrit.id    || '';
  const wcagTitle = wcagCrit.title || '';
  const wcagUrl   = wcagCrit.url   || '#';

  const fixBtnHtml = issue.canAutoFix
    ? `<button class="a11y-fix-btn"    data-issue-index="${index}" aria-label="Apply fix for: ${escapeHtml(issue.title)}">Fix It</button>`
    : '';

  const evidenceHtml = issue.evidence
    ? `<div class="a11y-issue-evidence"><strong>Evidence:</strong> <code>${escapeHtml(issue.evidence)}</code></div>`
    : '';

  return `
<div class="a11y-issue-card" data-severity="${sev}" data-issue-index="${index}" role="article">
  <div class="a11y-issue-header" role="button" tabindex="0"
       aria-expanded="false" aria-controls="a11y-body-${index}"
       data-issue-index="${index}">
    <span class="a11y-severity-dot a11y-severity-dot--${sev}" title="${severityLabel(sev)}" aria-label="${severityLabel(sev)} severity"></span>
    <span class="a11y-issue-title">${escapeHtml(issue.title)}</span>
    <span class="a11y-issue-arrow" aria-hidden="true">▼</span>
  </div>
  <div class="a11y-issue-body" id="a11y-body-${index}">
    <p class="a11y-issue-wcag">
      WCAG 2.1 <a href="${escapeHtml(wcagUrl)}" target="_blank" rel="noopener noreferrer"
                  aria-label="WCAG ${escapeHtml(wcagId)} ${escapeHtml(wcagTitle)} (opens new tab)">
        ${escapeHtml(wcagId)} – ${escapeHtml(wcagTitle)}
      </a>
    </p>
    <p class="a11y-issue-description">${escapeHtml(issue.description)}</p>
    ${evidenceHtml}
    <div class="a11y-issue-remediation">
      <strong>How to fix:</strong> ${escapeHtml(issue.remediation)}
    </div>
    <div class="a11y-issue-actions">
      <button class="a11y-locate-btn" data-issue-index="${index}" aria-label="Locate element for: ${escapeHtml(issue.title)}">Locate</button>
      ${fixBtnHtml}
    </div>
    <div class="a11y-fix-result" id="a11y-result-${index}" role="status" aria-live="polite" style="display:none;"></div>
  </div>
</div>`;
}

/**
 * Render the full issues list into the panel.
 */
function renderIssues(issues) {
  const listEl   = document.getElementById('a11y-panel-list');
  const emptyEl  = document.getElementById('a11y-panel-empty');
  const loadEl   = document.getElementById('a11y-panel-loading');

  if (loadEl) loadEl.classList.remove('visible');

  const filtered = _activeFilter === 'all'
    ? issues
    : issues.filter(i => i.severity === _activeFilter);

  if (!listEl) return;

  if (filtered.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) {
      emptyEl.style.display = 'flex';
      emptyEl.querySelector('p').innerHTML = issues.length === 0
        ? 'Click <strong>Scan Page</strong> to check this Canvas page for WCAG 2.1 AA accessibility issues.'
        : `No <strong>${_activeFilter}</strong> issues found. 🎉`;
      listEl.appendChild(emptyEl);
    }
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  listEl.innerHTML = filtered.map((issue, i) => {
    // Use original index so fix actions can find the issue
    const originalIndex = issues.indexOf(issue);
    return buildIssueCard(issue, originalIndex);
  }).join('');

  // Attach expand/collapse handlers
  listEl.querySelectorAll('.a11y-issue-header').forEach(header => {
    header.addEventListener('click', toggleIssueCard);
    header.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleIssueCard(e);
      }
    });
  });

  // Fix buttons
  listEl.querySelectorAll('.a11y-fix-btn').forEach(btn => {
    btn.addEventListener('click', handleFixClick);
  });

  // Locate buttons
  listEl.querySelectorAll('.a11y-locate-btn').forEach(btn => {
    btn.addEventListener('click', handleLocateClick);
  });
}

function toggleIssueCard(e) {
  const header = e.currentTarget;
  const card   = header.closest('.a11y-issue-card');
  if (!card) return;
  const expanded = card.classList.toggle('expanded');
  header.setAttribute('aria-expanded', String(expanded));
}

/**
 * Handle "Locate" button – highlight the element in the page.
 */
function handleLocateClick(e) {
  const idx   = parseInt(e.currentTarget.dataset.issueIndex, 10);
  const issue = _lastScanResult && _lastScanResult.issues[idx];
  if (!issue) return;

  // Try to find the live element using CSS-escaped ID selector
  const escapedId = issue.id && (typeof cssEscape === 'function'
    ? cssEscape(issue.id)
    : issue.id);
  let el = escapedId
    ? document.querySelector(`[data-a11y-id="${escapedId}"]`)
    : null;

  // Fall back to stored element reference if still in the DOM
  if (!el && issue.element && document.body.contains(issue.element)) {
    el = issue.element;
  }

  if (!el) return;

  if (typeof highlightElement === 'function') {
    highlightElement(el);
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Set focus on the element for keyboard accessibility
  if (!el.getAttribute('tabindex') && !el.matches('a, button, input, select, textarea, [tabindex]')) {
    el.setAttribute('tabindex', '-1');
    el.setAttribute('data-a11y-temp-tabindex', 'true');
  }
  el.focus({ preventScroll: true });
}

/**
 * Handle "Fix It" button – dispatch to remediator.
 */
async function handleFixClick(e) {
  const btn   = e.currentTarget;
  const idx   = parseInt(btn.dataset.issueIndex, 10);
  const issue = _lastScanResult && _lastScanResult.issues[idx];
  if (!issue) return;

  btn.disabled    = true;
  btn.textContent = 'Fixing…';

  let result;
  try {
    result = await applyFix(issue);
  } catch (err) {
    result = { success: false, message: err.message };
  }

  const resultEl = document.getElementById(`a11y-result-${idx}`);
  if (resultEl) {
    resultEl.style.display  = '';
    resultEl.className      = `a11y-fix-result a11y-fix-result--${result.success ? 'success' : 'error'}`;
    resultEl.textContent    = result.message;
  }

  btn.disabled    = false;
  btn.textContent = result.success ? 'Fixed ✓' : 'Fix It';
}

/**
 * Update the summary badges.
 */
function updateSummary(summary) {
  const summaryEl = document.getElementById('a11y-panel-summary');
  if (!summaryEl) return;

  summaryEl.innerHTML = `
    <span class="a11y-badge a11y-badge--total"    id="a11y-badge-total"    aria-label="${summary.total} total issues">${summary.total} Issues</span>
    ${summary.critical ? `<span class="a11y-badge a11y-badge--critical" aria-label="${summary.critical} critical">${summary.critical} Critical</span>` : ''}
    ${summary.serious  ? `<span class="a11y-badge a11y-badge--serious"  aria-label="${summary.serious} serious">${summary.serious} Serious</span>` : ''}
    ${summary.moderate ? `<span class="a11y-badge a11y-badge--moderate" aria-label="${summary.moderate} moderate">${summary.moderate} Moderate</span>` : ''}
    ${summary.minor    ? `<span class="a11y-badge a11y-badge--minor"    aria-label="${summary.minor} minor">${summary.minor} Minor</span>` : ''}
    ${summary.total === 0 ? '<span style="color:#388e3c;font-weight:700;">✓ No issues found!</span>' : ''}
  `;
}

/* -------------------------------------------------------------------------
 * Panel lifecycle
 * ---------------------------------------------------------------------- */

function initPanel() {
  if (document.getElementById('a11y-panel')) return; // Already injected

  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildPanelHTML();
  document.body.appendChild(wrapper.firstElementChild);

  // Close button
  document.getElementById('a11y-panel-close').addEventListener('click', hidePanel);

  // Scan button
  document.getElementById('a11y-scan-btn').addEventListener('click', runScan);

  // Export button
  document.getElementById('a11y-export-btn').addEventListener('click', exportReport);

  // Filter tabs
  document.querySelectorAll('.a11y-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.a11y-filter-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      _activeFilter = tab.dataset.filter;
      if (_lastScanResult) renderIssues(_lastScanResult.issues);
    });
  });

  // Keyboard: close with Escape
  document.getElementById('a11y-panel').addEventListener('keydown', e => {
    if (e.key === 'Escape') hidePanel();
  });
}

function showPanel() {
  initPanel();
  const panel = document.getElementById('a11y-panel');
  if (panel) {
    panel.classList.remove('a11y-panel--hidden');
    _panelVisible = true;
    // Move focus to the panel
    document.getElementById('a11y-scan-btn').focus();
  }
}

function hidePanel() {
  const panel = document.getElementById('a11y-panel');
  if (panel) {
    panel.classList.add('a11y-panel--hidden');
    _panelVisible = false;
  }
}

function togglePanel() {
  if (_panelVisible) {
    hidePanel();
  } else {
    showPanel();
  }
}

/* -------------------------------------------------------------------------
 * Scan
 * ---------------------------------------------------------------------- */

function runScan() {
  const scanBtn  = document.getElementById('a11y-scan-btn');
  const loadEl   = document.getElementById('a11y-panel-loading');
  const exportBtn= document.getElementById('a11y-export-btn');

  if (scanBtn)  scanBtn.disabled = true;
  if (loadEl)   loadEl.classList.add('visible');

  const listEl = document.getElementById('a11y-panel-list');
  if (listEl) listEl.innerHTML = '';

  // Defer to allow the spinner to render
  requestAnimationFrame(() => {
    setTimeout(() => {
      try {
        // Determine scan root – prefer Canvas content area for precision
        const canvasContent =
          document.querySelector('#content') ||
          document.querySelector('#main') ||
          document.querySelector('[role="main"]') ||
          document.body;

        _lastScanResult = scanPage(canvasContent);
        updateSummary(_lastScanResult.summary);
        renderIssues(_lastScanResult.issues);

        if (exportBtn) exportBtn.disabled = (_lastScanResult.issues.length === 0);
      } catch (err) {
        console.error('[A11y Remediator] Scan error:', err);
        const listEl = document.getElementById('a11y-panel-list');
        if (listEl) {
          listEl.innerHTML = `<div style="padding:16px;color:#b71c1c;">Scan error: ${escapeHtml(err.message)}</div>`;
        }
      } finally {
        if (scanBtn)  scanBtn.disabled = false;
        if (loadEl)   loadEl.classList.remove('visible');
      }
    }, 50);
  });
}

/* -------------------------------------------------------------------------
 * Export
 * ---------------------------------------------------------------------- */

function exportReport() {
  if (!_lastScanResult) return;

  const report = {
    generatedAt:  new Date().toISOString(),
    pageUrl:      window.location.href,
    pageTitle:    document.title,
    summary:      _lastScanResult.summary,
    issues:       _lastScanResult.issues.map(issue => ({
      ruleId:      issue.ruleId,
      severity:    issue.severity,
      title:       issue.title,
      description: issue.description,
      remediation: issue.remediation,
      wcag:        issue.wcag,
      canAutoFix:  issue.canAutoFix,
      elementId:   issue.id,
      evidence:    issue.evidence || '',
    })),
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `a11y-report-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------------------
 * Listen for messages from the popup / background script
 * ---------------------------------------------------------------------- */

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.action) {
      case 'TOGGLE_PANEL':
        togglePanel();
        sendResponse({ status: 'ok', visible: _panelVisible });
        break;
      case 'SHOW_PANEL':
        showPanel();
        sendResponse({ status: 'ok' });
        break;
      case 'RUN_SCAN':
        showPanel();
        setTimeout(runScan, 100);
        sendResponse({ status: 'ok' });
        break;
      case 'GET_SUMMARY':
        sendResponse({
          status:  'ok',
          summary: _lastScanResult ? _lastScanResult.summary : null,
        });
        break;
      default:
        sendResponse({ status: 'unknown_action' });
    }
    return true; // Keep channel open for async responses
  });
}

/* -------------------------------------------------------------------------
 * Auto-initialise when the page loads
 * ---------------------------------------------------------------------- */

// Restore panel state from storage
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['panelVisible'], result => {
    if (result.panelVisible) showPanel();
  });
}

/* -------------------------------------------------------------------------
 * Export for tests
 * ---------------------------------------------------------------------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildIssueCard,
    escapeHtml,
    handleLocateClick,
    severityLabel,
  };
}
