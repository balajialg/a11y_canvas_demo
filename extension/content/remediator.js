/**
 * Canvas A11y Remediator – Remediation Engine
 *
 * Provides automated and guided fixes for accessibility issues discovered by
 * scanner.js.  Each fix function receives an issue object (from the scanner)
 * and applies the appropriate DOM mutation.
 */

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

/**
 * Look up a previously tagged element by its a11y-id data attribute.
 * @param {string} a11yId
 * @returns {Element|null}
 */
function findElementById(a11yId) {
  return document.querySelector(`[data-a11y-id="${a11yId}"]`) || null;
}

/**
 * Show a small, accessible prompt dialog to collect user input.
 * Returns a Promise that resolves to the entered string or null if cancelled.
 *
 * @param {string} label   - Visible question text
 * @param {string} [value] - Pre-populated value
 * @returns {Promise<string|null>}
 */
function promptUser(label, value = '') {
  return new Promise(resolve => {
    // Create a modal overlay
    const overlay = document.createElement('div');
    overlay.id    = 'a11y-prompt-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'a11y-prompt-title');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.55)',
    ].join(';');

    const dialog = document.createElement('div');
    dialog.style.cssText = [
      'background:#fff', 'border-radius:8px', 'padding:24px',
      'max-width:480px', 'width:90%', 'box-shadow:0 8px 32px rgba(0,0,0,0.3)',
      'font-family:system-ui,sans-serif',
    ].join(';');

    const titleEl = document.createElement('h2');
    titleEl.id = 'a11y-prompt-title';
    titleEl.textContent = 'Accessibility Remediation';
    titleEl.style.cssText = 'margin:0 0 12px;font-size:18px;color:#1a1a1a;';

    const labelEl = document.createElement('label');
    labelEl.setAttribute('for', 'a11y-prompt-input');
    labelEl.textContent = label;
    labelEl.style.cssText = 'display:block;margin-bottom:8px;font-size:14px;color:#333;';

    const input = document.createElement('input');
    input.type  = 'text';
    input.id    = 'a11y-prompt-input';
    input.value = value;
    input.style.cssText = [
      'width:100%', 'padding:8px', 'border:2px solid #1a73e8',
      'border-radius:4px', 'font-size:14px', 'box-sizing:border-box',
      'margin-bottom:16px',
    ].join(';');

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:8px 16px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;cursor:pointer;font-size:14px;';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Apply Fix';
    saveBtn.style.cssText = 'padding:8px 16px;border:none;border-radius:4px;background:#1a73e8;color:#fff;cursor:pointer;font-size:14px;font-weight:600;';

    btnRow.append(cancelBtn, saveBtn);
    dialog.append(titleEl, labelEl, input, btnRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Focus the input on open
    requestAnimationFrame(() => input.focus());

    function close(result) {
      overlay.remove();
      resolve(result);
    }

    cancelBtn.addEventListener('click', () => close(null));
    saveBtn.addEventListener('click',   () => close(input.value.trim() || null));
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && document.activeElement !== cancelBtn) close(input.value.trim() || null);
    });
    // Trap focus inside dialog
    dialog.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        const focusable = Array.from(dialog.querySelectorAll('input, button'));
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  });
}

/* -------------------------------------------------------------------------
 * Individual fix functions
 * ---------------------------------------------------------------------- */

/**
 * Add or update alt text on an image.
 */
async function fixAltText(issue) {
  const el = findElementById(issue.id) || issue.element;
  if (!el) return { success: false, message: 'Element not found.' };

  const currentAlt = el.getAttribute('alt') || '';
  const prompt     = currentAlt
    ? `Update the alt text for this image (current: "${currentAlt}"):`
    : 'Enter a brief description of this image (or leave blank for decorative):';

  const value = await promptUser(prompt, currentAlt);
  if (value === null) return { success: false, message: 'Cancelled.' };

  el.setAttribute('alt', value);
  return {
    success: true,
    message: value === ''
      ? 'Image marked as decorative (alt="").'
      : `Alt text set to: "${value}"`,
  };
}

/**
 * Add a title attribute to an iframe.
 */
async function fixIframeTitle(issue) {
  const el = findElementById(issue.id) || issue.element;
  if (!el) return { success: false, message: 'Element not found.' };

  const current = el.getAttribute('title') || '';
  const value   = await promptUser('Enter a descriptive title for this embedded content:', current);
  if (value === null) return { success: false, message: 'Cancelled.' };

  el.setAttribute('title', value);
  return { success: true, message: `iframe title set to: "${value}"` };
}

/**
 * Add an aria-label to any element.
 */
async function fixAriaLabel(issue) {
  const el = findElementById(issue.id) || issue.element;
  if (!el) return { success: false, message: 'Element not found.' };

  const current = el.getAttribute('aria-label') || el.textContent.trim() || '';
  const label   = issue.title || 'this element';
  const value   = await promptUser(`Enter an accessible name (aria-label) for: ${label}`, current);
  if (value === null) return { success: false, message: 'Cancelled.' };

  el.setAttribute('aria-label', value);
  return { success: true, message: `aria-label set to: "${value}"` };
}

/**
 * Fix a skipped heading level.
 */
function fixHeadingLevel(issue) {
  const el = findElementById(issue.id) || issue.element;
  if (!el) return { success: false, message: 'Element not found.' };
  if (!issue.meta || !issue.meta.suggestedLevel) return { success: false, message: 'No suggested level available.' };

  const newTag   = `h${issue.meta.suggestedLevel}`;
  const newEl    = document.createElement(newTag);

  // Copy attributes
  Array.from(el.attributes).forEach(attr => newEl.setAttribute(attr.name, attr.value));
  newEl.innerHTML = el.innerHTML;
  el.replaceWith(newEl);

  return {
    success: true,
    message: `Heading changed from h${issue.meta.currentLevel} to h${issue.meta.suggestedLevel}.`,
  };
}

/**
 * Add lang="en" (or a user-specified value) to the <html> element.
 */
async function fixLang(issue) {
  const html = document.documentElement;
  const current = html.getAttribute('lang') || '';
  const value   = await promptUser('Enter the language code for this page (e.g. "en", "en-US", "fr"):', current || 'en');
  if (value === null) return { success: false, message: 'Cancelled.' };

  html.setAttribute('lang', value);
  return { success: true, message: `lang attribute set to: "${value}"` };
}

/**
 * Set positive tabindex elements back to 0.
 */
function fixTabindex(issue) {
  const el = findElementById(issue.id) || issue.element;
  if (!el) return { success: false, message: 'Element not found.' };

  el.setAttribute('tabindex', '0');
  return { success: true, message: 'tabindex set to 0.' };
}

/* -------------------------------------------------------------------------
 * Dispatch – route an issue to the correct fix function
 * ---------------------------------------------------------------------- */

/**
 * Apply the automated or guided fix for a given issue.
 * @param {Object} issue  - Issue object from scanPage()
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function applyFix(issue) {
  if (!issue.canAutoFix) {
    return {
      success: false,
      message: 'This issue requires manual remediation. See the guidance in the panel for details.',
    };
  }

  switch (issue.autoFixType) {
    case 'add-alt-text':
      return fixAltText(issue);
    case 'add-iframe-title':
      return fixIframeTitle(issue);
    case 'add-aria-label':
      return fixAriaLabel(issue);
    case 'fix-heading-level':
      return fixHeadingLevel(issue);
    case 'add-lang':
    case 'fix-lang':
      return fixLang(issue);
    case 'fix-tabindex':
      return fixTabindex(issue);
    default:
      return { success: false, message: `No fix handler for type: ${issue.autoFixType}` };
  }
}

/**
 * Highlight an element in the page to draw attention to it.
 * Adds a temporary outline and scrolls it into view.
 * @param {Element} el
 */
function highlightElement(el) {
  if (!el || !el.style) return;
  const prev = el.getAttribute('data-a11y-prev-outline') || '';
  el.setAttribute('data-a11y-prev-outline', el.style.outline);
  el.style.outline    = '3px solid #e8000d';
  el.style.outlineOffset = '2px';
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Remove after 3 s
  setTimeout(() => {
    el.style.outline      = prev;
    el.style.outlineOffset = '';
    el.removeAttribute('data-a11y-prev-outline');
  }, 3000);
}

/* -------------------------------------------------------------------------
 * Export
 * ---------------------------------------------------------------------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    applyFix,
    highlightElement,
    findElementById,
    fixAltText,
    fixIframeTitle,
    fixAriaLabel,
    fixHeadingLevel,
    fixLang,
    fixTabindex,
    promptUser,
  };
}
