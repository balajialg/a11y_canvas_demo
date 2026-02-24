/**
 * Tests for the Canvas A11y Remediator – Content Script
 * Uses Jest + jsdom
 */

// Stub CSS.escape for jsdom (simplified – the real browser API handles all edge cases)
if (!global.CSS) {
  global.CSS = { escape: s => s.replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`) };
}

// Provide stubs for Chrome extension globals used by content.js
// (scanPage from scanner.js, highlightElement / applyFix from remediator.js,
//  cssEscape from scanner.js)
global.scanPage = jest.fn();
global.highlightElement = jest.fn();
global.applyFix = jest.fn();
global.cssEscape = s => s.replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`);

const {
  buildIssueCard,
  escapeHtml,
  handleLocateClick,
  severityLabel,
} = require('../content/content');

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

/* -------------------------------------------------------------------------
 * escapeHtml
 * ---------------------------------------------------------------------- */
describe('escapeHtml', () => {
  test('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  test('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  test('escapes quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });
});

/* -------------------------------------------------------------------------
 * severityLabel
 * ---------------------------------------------------------------------- */
describe('severityLabel', () => {
  test('capitalizes first letter', () => {
    expect(severityLabel('critical')).toBe('Critical');
    expect(severityLabel('serious')).toBe('Serious');
    expect(severityLabel('moderate')).toBe('Moderate');
    expect(severityLabel('minor')).toBe('Minor');
  });
});

/* -------------------------------------------------------------------------
 * buildIssueCard
 * ---------------------------------------------------------------------- */
describe('buildIssueCard', () => {
  const baseIssue = {
    severity: 'critical',
    title: 'Image missing alt attribute',
    description: 'This image has no alt attribute.',
    remediation: 'Add a descriptive alt attribute.',
    wcag: { id: '1.1.1', title: 'Non-text Content', url: 'https://example.com' },
    canAutoFix: true,
    autoFixType: 'add-alt-text',
    evidence: '<img src="photo.jpg">',
  };

  test('renders issue card with evidence section', () => {
    const html = buildIssueCard(baseIssue, 0);
    expect(html).toContain('Evidence:');
    expect(html).toContain('&lt;img src=&quot;photo.jpg&quot;&gt;');
  });

  test('includes data-issue-index on locate button', () => {
    const html = buildIssueCard(baseIssue, 5);
    expect(html).toContain('data-issue-index="5"');
  });

  test('includes Fix It button when canAutoFix is true', () => {
    const html = buildIssueCard(baseIssue, 0);
    expect(html).toContain('Fix It');
  });

  test('omits Fix It button when canAutoFix is false', () => {
    const issue = { ...baseIssue, canAutoFix: false };
    const html = buildIssueCard(issue, 0);
    expect(html).not.toContain('a11y-fix-btn');
  });

  test('omits evidence section when evidence is empty', () => {
    const issue = { ...baseIssue, evidence: '' };
    const html = buildIssueCard(issue, 0);
    expect(html).not.toContain('a11y-issue-evidence');
  });

  test('includes WCAG reference link', () => {
    const html = buildIssueCard(baseIssue, 0);
    expect(html).toContain('1.1.1');
    expect(html).toContain('Non-text Content');
  });
});

/* -------------------------------------------------------------------------
 * handleLocateClick
 * ---------------------------------------------------------------------- */
describe('handleLocateClick', () => {
  /**
   * Simulate a locate click by creating a fake event and setting up
   * the global _lastScanResult via the module's closure.
   */
  function simulateLocateClick(issueIndex, scanResult) {
    // The handleLocateClick reads from the module-scoped _lastScanResult.
    // We need to set it up through the module. Since _lastScanResult is
    // internal, we'll test via the exported function's behavior directly.
    // We create a mock event.
    const btn = document.createElement('button');
    btn.dataset.issueIndex = String(issueIndex);
    const event = { currentTarget: btn };
    return event;
  }

  test('does not throw when _lastScanResult is null', () => {
    const btn = document.createElement('button');
    btn.dataset.issueIndex = '0';
    expect(() => handleLocateClick({ currentTarget: btn })).not.toThrow();
  });

  test('does not throw when issue index is out of range', () => {
    const btn = document.createElement('button');
    btn.dataset.issueIndex = '999';
    expect(() => handleLocateClick({ currentTarget: btn })).not.toThrow();
  });
});
