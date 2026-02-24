/**
 * Tests for the Canvas A11y Remediator – Remediator
 * Uses Jest + jsdom
 */

// Stub window.getComputedStyle (used by panel CSS calls but not in remediator)
// Provide a minimal CSS.escape stub for jsdom
if (!global.CSS) {
  global.CSS = { escape: s => s.replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`) };
}

const {
  applyFix,
  highlightElement,
  findElementById,
  fixHeadingLevel,
  fixTabindex,
} = require('../content/remediator');

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

afterEach(() => {
  document.body.innerHTML = '';
  // Remove any overlay dialogs
  const overlay = document.getElementById('a11y-prompt-overlay');
  if (overlay) overlay.remove();
});

/**
 * Assign a data-a11y-id to an element and return the element.
 */
function tag(el, id) {
  el.dataset.a11yId = id;
  return el;
}

/* -------------------------------------------------------------------------
 * findElementById
 * ---------------------------------------------------------------------- */
describe('findElementById', () => {
  test('finds element with matching data-a11y-id', () => {
    const el = document.createElement('img');
    el.dataset.a11yId = 'test-1';
    document.body.appendChild(el);
    expect(findElementById('test-1')).toBe(el);
  });

  test('returns null when element not found', () => {
    expect(findElementById('does-not-exist')).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * highlightElement
 * ---------------------------------------------------------------------- */
describe('highlightElement', () => {
  test('sets outline style on element', () => {
    const el = document.createElement('div');
    el.textContent = 'Hello';
    document.body.appendChild(el);

    // scrollIntoView is not implemented in jsdom – stub it
    el.scrollIntoView = jest.fn();

    highlightElement(el);
    expect(el.style.outline).toMatch(/3px solid/);
  });

  test('does not throw for null element', () => {
    expect(() => highlightElement(null)).not.toThrow();
  });

  test('does not throw for element without style property', () => {
    // document.head has no style property in all environments
    expect(() => highlightElement(document.head)).not.toThrow();
  });
});

/* -------------------------------------------------------------------------
 * fixHeadingLevel
 * ---------------------------------------------------------------------- */
describe('fixHeadingLevel', () => {
  test('replaces h3 with h2 when meta.suggestedLevel is 2', () => {
    const h3 = document.createElement('h3');
    h3.textContent = 'Section heading';
    h3.dataset.a11yId = 'heading-1';
    document.body.appendChild(h3);

    const issue = {
      id:      'heading-1',
      element: h3,
      ruleId:  'heading-skipped',
      canAutoFix:  true,
      autoFixType: 'fix-heading-level',
      meta: { currentLevel: 3, suggestedLevel: 2 },
    };

    const result = fixHeadingLevel(issue);
    expect(result.success).toBe(true);

    // Original h3 should be replaced by h2
    expect(document.querySelector('h3')).toBeNull();
    const h2 = document.querySelector('h2');
    expect(h2).not.toBeNull();
    expect(h2.textContent).toBe('Section heading');
  });

  test('returns error when element not found', () => {
    const issue = {
      id:      'nonexistent-999',
      element: null,
      meta:    { currentLevel: 3, suggestedLevel: 2 },
    };
    const result = fixHeadingLevel(issue);
    expect(result.success).toBe(false);
  });

  test('returns error when no meta is provided', () => {
    const el = document.createElement('h3');
    el.dataset.a11yId = 'h-no-meta';
    document.body.appendChild(el);

    const result = fixHeadingLevel({ id: 'h-no-meta', element: el, meta: null });
    expect(result.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * fixTabindex
 * ---------------------------------------------------------------------- */
describe('fixTabindex', () => {
  test('sets tabindex to 0', () => {
    const btn = document.createElement('button');
    btn.setAttribute('tabindex', '3');
    btn.dataset.a11yId = 'tab-1';
    document.body.appendChild(btn);

    const issue = { id: 'tab-1', element: btn };
    const result = fixTabindex(issue);

    expect(result.success).toBe(true);
    expect(btn.getAttribute('tabindex')).toBe('0');
  });

  test('returns error when element not found', () => {
    const result = fixTabindex({ id: 'nope', element: null });
    expect(result.success).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * applyFix dispatch
 * ---------------------------------------------------------------------- */
describe('applyFix', () => {
  test('returns error message for non-fixable issues', async () => {
    const issue = {
      canAutoFix:  false,
      autoFixType: null,
      ruleId:      'video-captions',
      title:       'Video missing captions',
    };
    const result = await applyFix(issue);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/manual/i);
  });

  test('dispatches fix-tabindex to fixTabindex', async () => {
    const el = document.createElement('a');
    el.setAttribute('tabindex', '5');
    el.dataset.a11yId = 'tab-dispatch-1';
    document.body.appendChild(el);

    const issue = {
      canAutoFix:  true,
      autoFixType: 'fix-tabindex',
      id:          'tab-dispatch-1',
      element:     el,
    };
    const result = await applyFix(issue);
    expect(result.success).toBe(true);
    expect(el.getAttribute('tabindex')).toBe('0');
  });

  test('dispatches fix-heading-level', async () => {
    const h4 = document.createElement('h4');
    h4.textContent = 'Sub-section';
    h4.dataset.a11yId = 'heading-dispatch-1';
    document.body.appendChild(h4);

    const issue = {
      canAutoFix:  true,
      autoFixType: 'fix-heading-level',
      id:          'heading-dispatch-1',
      element:     h4,
      meta:        { currentLevel: 4, suggestedLevel: 2 },
    };
    const result = await applyFix(issue);
    expect(result.success).toBe(true);
    expect(document.querySelector('h2')).not.toBeNull();
  });

  test('returns error for unknown autoFixType', async () => {
    const issue = {
      canAutoFix:  true,
      autoFixType: 'some-unknown-type',
      id:          'x',
      element:     document.createElement('div'),
    };
    const result = await applyFix(issue);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/No fix handler/);
  });
});
