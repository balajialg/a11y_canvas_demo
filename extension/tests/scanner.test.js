/**
 * Tests for the Canvas A11y Remediator – Scanner
 * Uses Jest + jsdom
 */

const {
  scanPage,
  checkImages,
  checkVideos,
  checkHeadings,
  checkLinks,
  checkForms,
  checkTables,
  checkColorContrast,
  checkLanguage,
  checkPageTitle,
  checkTabindex,
  checkAria,
  relativeLuminance,
  contrastRatio,
  parseColor,
  isAmbiguousLinkText,
  getEvidenceSnippet,
  SEVERITY,
  WCAG,
} = require('../content/scanner');

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

/** Create a detached DOM container with the given HTML. */
function makeRoot(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

afterEach(() => {
  // Clean up any DOM nodes added during tests
  document.body.innerHTML = '';
  // Reset document lang
  document.documentElement.removeAttribute('lang');
  // Reset title
  document.title = '';
});

/* -------------------------------------------------------------------------
 * Color math helpers
 * ---------------------------------------------------------------------- */
describe('relativeLuminance', () => {
  test('pure black has luminance 0', () => {
    expect(relativeLuminance(0, 0, 0)).toBeCloseTo(0);
  });

  test('pure white has luminance ~1', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 2);
  });

  test('mid-grey is between 0 and 1', () => {
    const l = relativeLuminance(128, 128, 128);
    expect(l).toBeGreaterThan(0);
    expect(l).toBeLessThan(1);
  });
});

describe('contrastRatio', () => {
  test('black on white is 21:1', () => {
    const ratio = contrastRatio(
      relativeLuminance(0, 0, 0),
      relativeLuminance(255, 255, 255),
    );
    expect(ratio).toBeCloseTo(21, 0);
  });

  test('same color has ratio 1:1', () => {
    const l = relativeLuminance(100, 100, 100);
    expect(contrastRatio(l, l)).toBeCloseTo(1, 2);
  });
});

describe('parseColor', () => {
  test('parses rgb()', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  test('parses rgba() with alpha', () => {
    expect(parseColor('rgba(0, 128, 0, 0.5)')).toEqual({ r: 0, g: 128, b: 0, a: 0.5 });
  });

  test('returns null for unknown format', () => {
    expect(parseColor('#fff')).toBeNull();
    expect(parseColor('')).toBeNull();
    expect(parseColor(null)).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * isAmbiguousLinkText
 * ---------------------------------------------------------------------- */
describe('isAmbiguousLinkText', () => {
  test.each([
    ['click here', true],
    ['here',       true],
    ['read more',  true],
    ['more',       true],
    ['learn more', true],
    ['link',       true],
    ['details',    true],
    ['info.',      true],
  ])('"%s" → %s', (text, expected) => {
    expect(isAmbiguousLinkText(text)).toBe(expected);
  });

  test.each([
    ['WCAG 2.1 AA guidelines',     false],
    ['Canvas accessibility course', false],
    ['Download syllabus PDF',       false],
  ])('"%s" → %s', (text, expected) => {
    expect(isAmbiguousLinkText(text)).toBe(expected);
  });
});

/* -------------------------------------------------------------------------
 * checkImages
 * ---------------------------------------------------------------------- */
describe('checkImages', () => {
  test('flags an image with no alt attribute', () => {
    const root = makeRoot('<img src="photo.jpg">');
    const issues = checkImages(root);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('img-alt');
    expect(issues[0].severity).toBe(SEVERITY.CRITICAL);
    expect(issues[0].wcag.id).toBe('1.1.1');
  });

  test('does NOT flag image with empty alt (decorative)', () => {
    const root = makeRoot('<img src="divider.png" alt="">');
    expect(checkImages(root)).toHaveLength(0);
  });

  test('does NOT flag image with descriptive alt', () => {
    const root = makeRoot('<img src="chart.png" alt="Bar chart showing enrolment by year">');
    expect(checkImages(root)).toHaveLength(0);
  });

  test('flags image whose alt text is a file name', () => {
    const root = makeRoot('<img src="chart.png" alt="chart.png">');
    const issues = checkImages(root);
    expect(issues[0].ruleId).toBe('img-alt-filename');
    expect(issues[0].severity).toBe(SEVERITY.SERIOUS);
  });

  test('skips images with role="presentation"', () => {
    const root = makeRoot('<img src="x.png" role="presentation">');
    expect(checkImages(root)).toHaveLength(0);
  });

  test('skips images with role="none"', () => {
    const root = makeRoot('<img src="x.png" role="none">');
    expect(checkImages(root)).toHaveLength(0);
  });

  test('marks issue as auto-fixable', () => {
    const root = makeRoot('<img src="a.png">');
    const issue = checkImages(root)[0];
    expect(issue.canAutoFix).toBe(true);
    expect(issue.autoFixType).toBe('add-alt-text');
  });
});

/* -------------------------------------------------------------------------
 * checkVideos
 * ---------------------------------------------------------------------- */
describe('checkVideos', () => {
  test('flags <video> with no caption track', () => {
    const root = makeRoot('<video src="lecture.mp4"></video>');
    const issues = checkVideos(root);
    const videoIssue = issues.find(i => i.ruleId === 'video-captions');
    expect(videoIssue).toBeDefined();
    expect(videoIssue.severity).toBe(SEVERITY.CRITICAL);
    expect(videoIssue.wcag.id).toBe('1.2.2');
  });

  test('does NOT flag <video> with captions track', () => {
    const root = makeRoot(`
      <video src="lecture.mp4">
        <track kind="captions" src="captions.vtt" srclang="en" label="English">
      </video>`);
    const issues = checkVideos(root);
    expect(issues.filter(i => i.ruleId === 'video-captions')).toHaveLength(0);
  });

  test('flags YouTube iframe as needing caption verification', () => {
    const root = makeRoot('<iframe src="https://www.youtube.com/embed/abc123" title="Lecture video"></iframe>');
    const issues = checkVideos(root);
    expect(issues.find(i => i.ruleId === 'iframe-video-captions')).toBeDefined();
  });

  test('flags iframe missing title', () => {
    const root = makeRoot('<iframe src="https://example.com/embed/1"></iframe>');
    const issues = checkVideos(root);
    expect(issues.find(i => i.ruleId === 'iframe-title')).toBeDefined();
  });

  test('does NOT flag iframe that has a title', () => {
    const root = makeRoot('<iframe src="https://example.com/embed/1" title="Content frame"></iframe>');
    const issues = checkVideos(root);
    expect(issues.filter(i => i.ruleId === 'iframe-title')).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------
 * checkHeadings
 * ---------------------------------------------------------------------- */
describe('checkHeadings', () => {
  test('flags empty heading', () => {
    const root = makeRoot('<h2></h2>');
    const issues = checkHeadings(root);
    expect(issues.find(i => i.ruleId === 'heading-empty')).toBeDefined();
  });

  test('flags skipped heading level h1→h3', () => {
    const root = makeRoot('<h1>Title</h1><h3>Section</h3>');
    const issues = checkHeadings(root);
    const skip = issues.find(i => i.ruleId === 'heading-skipped');
    expect(skip).toBeDefined();
    expect(skip.meta.suggestedLevel).toBe(2);
  });

  test('does NOT flag sequential headings h1→h2→h3', () => {
    const root = makeRoot('<h1>A</h1><h2>B</h2><h3>C</h3>');
    expect(checkHeadings(root).filter(i => i.ruleId === 'heading-skipped')).toHaveLength(0);
  });

  test('skipped-heading issue is auto-fixable', () => {
    const root = makeRoot('<h1>Title</h1><h3>Sub</h3>');
    const issue = checkHeadings(root).find(i => i.ruleId === 'heading-skipped');
    expect(issue.canAutoFix).toBe(true);
    expect(issue.autoFixType).toBe('fix-heading-level');
  });
});

/* -------------------------------------------------------------------------
 * checkLinks
 * ---------------------------------------------------------------------- */
describe('checkLinks', () => {
  test('flags empty link', () => {
    const root = makeRoot('<a href="/page"></a>');
    const issues = checkLinks(root);
    expect(issues.find(i => i.ruleId === 'link-empty')).toBeDefined();
  });

  test('flags link with ambiguous text "click here"', () => {
    const root = makeRoot('<a href="/page">Click here</a>');
    const issues = checkLinks(root);
    expect(issues.find(i => i.ruleId === 'link-ambiguous')).toBeDefined();
  });

  test('does NOT flag link with descriptive text', () => {
    const root = makeRoot('<a href="/syllabus">Download the syllabus PDF</a>');
    expect(checkLinks(root)).toHaveLength(0);
  });

  test('does NOT flag empty-text link that has aria-label', () => {
    const root = makeRoot('<a href="/x" aria-label="Open assignment 3"></a>');
    expect(checkLinks(root)).toHaveLength(0);
  });

  test('ambiguous link with aria-label is NOT flagged', () => {
    const root = makeRoot('<a href="/x" aria-label="View all course modules">Read more</a>');
    expect(checkLinks(root)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------
 * checkForms
 * ---------------------------------------------------------------------- */
describe('checkForms', () => {
  test('flags input without label', () => {
    const root = makeRoot('<input type="text" id="name">');
    const issues = checkForms(root);
    expect(issues.find(i => i.ruleId === 'input-label')).toBeDefined();
  });

  test('does NOT flag input with associated label', () => {
    const root = makeRoot('<label for="name">Your name</label><input type="text" id="name">');
    expect(checkForms(root).filter(i => i.ruleId === 'input-label')).toHaveLength(0);
  });

  test('does NOT flag input wrapped in label', () => {
    const root = makeRoot('<label>Search <input type="search"></label>');
    expect(checkForms(root).filter(i => i.ruleId === 'input-label')).toHaveLength(0);
  });

  test('does NOT flag input with aria-label', () => {
    const root = makeRoot('<input type="text" aria-label="Search courses">');
    expect(checkForms(root).filter(i => i.ruleId === 'input-label')).toHaveLength(0);
  });

  test('flags button with no accessible name', () => {
    const root = makeRoot('<button></button>');
    const issues = checkForms(root);
    expect(issues.find(i => i.ruleId === 'button-name')).toBeDefined();
  });

  test('does NOT flag button with text', () => {
    const root = makeRoot('<button>Submit</button>');
    expect(checkForms(root).filter(i => i.ruleId === 'button-name')).toHaveLength(0);
  });

  test('does NOT flag button with aria-label', () => {
    const root = makeRoot('<button aria-label="Close dialog">✕</button>');
    expect(checkForms(root).filter(i => i.ruleId === 'button-name')).toHaveLength(0);
  });

  test('skips hidden inputs', () => {
    const root = makeRoot('<input type="hidden" name="csrf_token">');
    expect(checkForms(root).filter(i => i.ruleId === 'input-label')).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------
 * checkTables
 * ---------------------------------------------------------------------- */
describe('checkTables', () => {
  test('flags data table without headers', () => {
    const root = makeRoot(`
      <table>
        <tr><td>Name</td><td>Grade</td></tr>
        <tr><td>Alice</td><td>A</td></tr>
      </table>`);
    const issues = checkTables(root);
    expect(issues.find(i => i.ruleId === 'table-headers')).toBeDefined();
  });

  test('does NOT flag table with <th> headers', () => {
    const root = makeRoot(`
      <table>
        <tr><th scope="col">Name</th><th scope="col">Grade</th></tr>
        <tr><td>Alice</td><td>A</td></tr>
      </table>`);
    expect(checkTables(root).filter(i => i.ruleId === 'table-headers')).toHaveLength(0);
  });

  test('skips tables with role="presentation"', () => {
    const root = makeRoot(`
      <table role="presentation">
        <tr><td>Layout cell</td></tr>
      </table>`);
    expect(checkTables(root).filter(i => i.ruleId === 'table-headers')).toHaveLength(0);
  });

  test('flags table without caption', () => {
    const root = makeRoot(`
      <table>
        <tr><th>Name</th></tr>
        <tr><td>Alice</td></tr>
      </table>`);
    const issues = checkTables(root);
    expect(issues.find(i => i.ruleId === 'table-caption')).toBeDefined();
    expect(issues.find(i => i.ruleId === 'table-caption').severity).toBe(SEVERITY.MINOR);
  });

  test('does NOT flag table with caption', () => {
    const root = makeRoot(`
      <table>
        <caption>Grade book</caption>
        <tr><th scope="col">Name</th><th scope="col">Grade</th></tr>
        <tr><td>Alice</td><td>A</td></tr>
      </table>`);
    expect(checkTables(root).filter(i => i.ruleId === 'table-caption')).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------
 * checkLanguage
 * ---------------------------------------------------------------------- */
describe('checkLanguage', () => {
  test('flags missing lang attribute', () => {
    // Ensure no lang on <html>
    document.documentElement.removeAttribute('lang');
    const issues = checkLanguage(document.body);
    expect(issues.find(i => i.ruleId === 'html-lang')).toBeDefined();
  });

  test('does NOT flag when lang is valid', () => {
    document.documentElement.setAttribute('lang', 'en');
    expect(checkLanguage(document.body).filter(i => i.ruleId === 'html-lang')).toHaveLength(0);
  });

  test('flags invalid lang attribute', () => {
    document.documentElement.setAttribute('lang', '123invalid');
    const issues = checkLanguage(document.body);
    expect(issues.find(i => i.ruleId === 'html-lang-invalid')).toBeDefined();
  });

  test('accepts lang="en-US" as valid', () => {
    document.documentElement.setAttribute('lang', 'en-US');
    expect(checkLanguage(document.body).filter(i => i.ruleId === 'html-lang-invalid')).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------
 * checkPageTitle
 * ---------------------------------------------------------------------- */
describe('checkPageTitle', () => {
  test('flags empty page title', () => {
    document.title = '';
    expect(checkPageTitle().find(i => i.ruleId === 'page-title')).toBeDefined();
  });

  test('does NOT flag a page with a title', () => {
    document.title = 'Introduction to Web Design – Canvas';
    expect(checkPageTitle().filter(i => i.ruleId === 'page-title')).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------
 * checkTabindex
 * ---------------------------------------------------------------------- */
describe('checkTabindex', () => {
  test('flags positive tabindex', () => {
    const root = makeRoot('<button tabindex="3">Click me</button>');
    const issues = checkTabindex(root);
    expect(issues.find(i => i.ruleId === 'tabindex-positive')).toBeDefined();
  });

  test('does NOT flag tabindex="0"', () => {
    const root = makeRoot('<div tabindex="0" role="button">OK</div>');
    expect(checkTabindex(root)).toHaveLength(0);
  });

  test('does NOT flag tabindex="-1"', () => {
    const root = makeRoot('<div tabindex="-1">Hidden focus</div>');
    expect(checkTabindex(root)).toHaveLength(0);
  });

  test('auto-fix type is fix-tabindex', () => {
    const root = makeRoot('<a href="#" tabindex="5">Link</a>');
    const issue = checkTabindex(root)[0];
    expect(issue.autoFixType).toBe('fix-tabindex');
  });
});

/* -------------------------------------------------------------------------
 * checkAria
 * ---------------------------------------------------------------------- */
describe('checkAria', () => {
  test('flags aria-hidden containing focusable elements', () => {
    const root = makeRoot('<div aria-hidden="true"><a href="/x">Link</a></div>');
    const issues = checkAria(root);
    expect(issues.find(i => i.ruleId === 'aria-hidden-focusable')).toBeDefined();
  });

  test('does NOT flag aria-hidden on element with no focusable children', () => {
    const root = makeRoot('<div aria-hidden="true"><span>Text</span></div>');
    expect(checkAria(root).filter(i => i.ruleId === 'aria-hidden-focusable')).toHaveLength(0);
  });

  test('flags invalid ARIA role', () => {
    const root = makeRoot('<div role="banana">content</div>');
    const issues = checkAria(root);
    expect(issues.find(i => i.ruleId === 'aria-role-invalid')).toBeDefined();
  });

  test('does NOT flag valid ARIA role', () => {
    const root = makeRoot('<div role="navigation">content</div>');
    expect(checkAria(root).filter(i => i.ruleId === 'aria-role-invalid')).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------
 * scanPage integration
 * ---------------------------------------------------------------------- */
describe('scanPage', () => {
  test('returns issues and summary object', () => {
    const root = makeRoot(`
      <img src="photo.png">
      <a href="/x">click here</a>
      <button></button>
    `);
    const { issues, summary } = scanPage(root);
    expect(Array.isArray(issues)).toBe(true);
    expect(summary).toHaveProperty('total');
    expect(summary).toHaveProperty('critical');
    expect(summary.total).toBe(issues.length);
  });

  test('finds no false positives on a clean fragment', () => {
    document.documentElement.setAttribute('lang', 'en');
    document.title = 'My Course – Canvas';
    const root = makeRoot(`
      <h1>Course Overview</h1>
      <h2>Module 1</h2>
      <p>Welcome to the course.</p>
      <img src="banner.png" alt="Colorful course banner">
      <a href="/syllabus">Download the course syllabus</a>
      <label for="name">Your name</label>
      <input type="text" id="name">
      <table>
        <caption>Grade distribution</caption>
        <tr><th scope="col">Grade</th><th scope="col">Count</th></tr>
        <tr><td>A</td><td>10</td></tr>
      </table>
    `);
    const { issues } = scanPage(root);
    // Should have 0 or very few issues (none for these specific constructs)
    const structuralIssues = issues.filter(i =>
      ['img-alt','link-empty','link-ambiguous','input-label','button-name',
       'table-headers','heading-empty','heading-skipped','tabindex-positive',
       'aria-hidden-focusable','aria-role-invalid'].includes(i.ruleId)
    );
    expect(structuralIssues).toHaveLength(0);
  });

  test('summary counts match issue array', () => {
    const root = makeRoot(`
      <img src="a.png">
      <img src="b.png">
      <button></button>
    `);
    const { issues, summary } = scanPage(root);
    expect(summary.total).toBe(issues.length);
    expect(summary.critical + summary.serious + summary.moderate + summary.minor)
      .toBe(summary.total);
  });

  test('falls back to document.body when no root provided', () => {
    document.documentElement.setAttribute('lang', 'en');
    document.title = 'Test';
    document.body.innerHTML = '<h1>Hello</h1>';
    const { issues, summary } = scanPage();
    expect(summary).toBeDefined();
    expect(summary.total).toBe(issues.length);
  });
});

/* -------------------------------------------------------------------------
 * SEVERITY and WCAG constants are exported
 * ---------------------------------------------------------------------- */
describe('exports', () => {
  test('SEVERITY has expected keys', () => {
    expect(SEVERITY.CRITICAL).toBe('critical');
    expect(SEVERITY.SERIOUS).toBe('serious');
    expect(SEVERITY.MODERATE).toBe('moderate');
    expect(SEVERITY.MINOR).toBe('minor');
  });

  test('WCAG has NON_TEXT_CONTENT entry with correct id', () => {
    expect(WCAG.NON_TEXT_CONTENT.id).toBe('1.1.1');
  });

  test('WCAG has CAPTIONS_PRERECORDED entry', () => {
    expect(WCAG.CAPTIONS_PRERECORDED.id).toBe('1.2.2');
  });
});

/* -------------------------------------------------------------------------
 * getEvidenceSnippet
 * ---------------------------------------------------------------------- */
describe('getEvidenceSnippet', () => {
  test('returns outerHTML for a simple element', () => {
    const el = document.createElement('img');
    el.setAttribute('src', 'photo.jpg');
    const snippet = getEvidenceSnippet(el);
    expect(snippet).toContain('<img');
    expect(snippet).toContain('src="photo.jpg"');
  });

  test('truncates long HTML to maxLen', () => {
    const el = document.createElement('div');
    el.setAttribute('data-long', 'x'.repeat(200));
    const snippet = getEvidenceSnippet(el, 50);
    expect(snippet.length).toBeLessThanOrEqual(51); // 50 + '…'
    expect(snippet).toMatch(/…$/);
  });

  test('returns empty string for null element', () => {
    expect(getEvidenceSnippet(null)).toBe('');
  });
});

/* -------------------------------------------------------------------------
 * Evidence field on issues
 * ---------------------------------------------------------------------- */
describe('evidence field', () => {
  test('checkImages issues include evidence', () => {
    const root = makeRoot('<img src="photo.jpg">');
    const issues = checkImages(root);
    expect(issues[0].evidence).toBeDefined();
    expect(issues[0].evidence).toContain('<img');
  });

  test('checkHeadings issues include evidence', () => {
    const root = makeRoot('<h2></h2>');
    const issues = checkHeadings(root);
    const empty = issues.find(i => i.ruleId === 'heading-empty');
    expect(empty.evidence).toBeDefined();
    expect(empty.evidence).toContain('<h2');
  });

  test('checkLinks issues include evidence', () => {
    const root = makeRoot('<a href="/page"></a>');
    const issues = checkLinks(root);
    expect(issues[0].evidence).toBeDefined();
    expect(issues[0].evidence).toContain('<a');
  });

  test('checkForms issues include evidence', () => {
    const root = makeRoot('<input type="text" id="name">');
    const issues = checkForms(root);
    const labelIssue = issues.find(i => i.ruleId === 'input-label');
    expect(labelIssue.evidence).toBeDefined();
    expect(labelIssue.evidence).toContain('<input');
  });

  test('checkLanguage issues include evidence', () => {
    document.documentElement.removeAttribute('lang');
    const issues = checkLanguage(document.body);
    const langIssue = issues.find(i => i.ruleId === 'html-lang');
    expect(langIssue.evidence).toBeDefined();
    expect(langIssue.evidence).toContain('lang');
  });

  test('checkPageTitle issues include evidence', () => {
    document.title = '';
    const issues = checkPageTitle();
    const titleIssue = issues.find(i => i.ruleId === 'page-title');
    expect(titleIssue.evidence).toBeDefined();
    expect(titleIssue.evidence).toContain('title');
  });

  test('checkTabindex issues include evidence', () => {
    const root = makeRoot('<button tabindex="3">Click me</button>');
    const issues = checkTabindex(root);
    expect(issues[0].evidence).toBeDefined();
    expect(issues[0].evidence).toContain('tabindex');
  });

  test('checkAria issues include evidence for invalid role', () => {
    const root = makeRoot('<div role="banana">content</div>');
    const issues = checkAria(root);
    const roleIssue = issues.find(i => i.ruleId === 'aria-role-invalid');
    expect(roleIssue.evidence).toBeDefined();
    expect(roleIssue.evidence).toContain('banana');
  });

  test('scanPage issues all have evidence field', () => {
    const root = makeRoot(`
      <img src="photo.png">
      <a href="/x">click here</a>
      <button></button>
    `);
    const { issues } = scanPage(root);
    issues.forEach(issue => {
      expect(issue).toHaveProperty('evidence');
    });
  });
});
