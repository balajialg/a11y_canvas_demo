/**
 * Canvas A11y Remediator – WCAG 2.1 AA Scanner
 *
 * Checks Canvas course pages for common WCAG 2.1 AA violations across
 * eleven rule categories and returns structured issue objects that the
 * remediator and panel UI can consume.
 */

/* -------------------------------------------------------------------------
 * Severity constants (mirrors axe-core convention)
 * ---------------------------------------------------------------------- */
const SEVERITY = {
  CRITICAL: 'critical',   // Completely blocks access for users with disabilities
  SERIOUS: 'serious',     // Significant barriers – fix as soon as possible
  MODERATE: 'moderate',   // Causes confusion / extra effort
  MINOR: 'minor',         // Best-practice issues with low impact
};

/* -------------------------------------------------------------------------
 * WCAG 2.1 AA success-criterion references
 * ---------------------------------------------------------------------- */
const WCAG = {
  NON_TEXT_CONTENT:       { id: '1.1.1', title: 'Non-text Content',       url: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content' },
  CAPTIONS_PRERECORDED:   { id: '1.2.2', title: 'Captions (Prerecorded)', url: 'https://www.w3.org/WAI/WCAG21/Understanding/captions-prerecorded' },
  AUDIO_DESCRIPTION:      { id: '1.2.5', title: 'Audio Description',      url: 'https://www.w3.org/WAI/WCAG21/Understanding/audio-description-prerecorded' },
  INFO_AND_RELATIONSHIPS: { id: '1.3.1', title: 'Info and Relationships',  url: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships' },
  SENSORY_CHARACTERISTICS:{ id: '1.3.3', title: 'Sensory Characteristics', url: 'https://www.w3.org/WAI/WCAG21/Understanding/sensory-characteristics' },
  CONTRAST_MINIMUM:       { id: '1.4.3', title: 'Contrast (Minimum)',      url: 'https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum' },
  RESIZE_TEXT:            { id: '1.4.4', title: 'Resize Text',             url: 'https://www.w3.org/WAI/WCAG21/Understanding/resize-text' },
  IMAGES_OF_TEXT:         { id: '1.4.5', title: 'Images of Text',          url: 'https://www.w3.org/WAI/WCAG21/Understanding/images-of-text' },
  KEYBOARD:               { id: '2.1.1', title: 'Keyboard',                url: 'https://www.w3.org/WAI/WCAG21/Understanding/keyboard' },
  NO_KEYBOARD_TRAP:       { id: '2.1.2', title: 'No Keyboard Trap',        url: 'https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap' },
  PAGE_TITLED:            { id: '2.4.2', title: 'Page Titled',             url: 'https://www.w3.org/WAI/WCAG21/Understanding/page-titled' },
  HEADINGS_AND_LABELS:    { id: '2.4.6', title: 'Headings and Labels',     url: 'https://www.w3.org/WAI/WCAG21/Understanding/headings-and-labels' },
  LINK_PURPOSE:           { id: '2.4.4', title: 'Link Purpose (In Context)',url: 'https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context' },
  LANGUAGE_OF_PAGE:       { id: '3.1.1', title: 'Language of Page',        url: 'https://www.w3.org/WAI/WCAG21/Understanding/language-of-page' },
  LABELS_OR_INSTRUCTIONS: { id: '3.3.2', title: 'Labels or Instructions',  url: 'https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions' },
  ERROR_IDENTIFICATION:   { id: '3.3.1', title: 'Error Identification',     url: 'https://www.w3.org/WAI/WCAG21/Understanding/error-identification' },
  NAME_ROLE_VALUE:        { id: '4.1.2', title: 'Name, Role, Value',        url: 'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value' },
};

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

/**
 * Generate a short, stable ID for an element so the UI and remediator can
 * reference the same node across messages.
 */
let _idCounter = 0;
function getOrAssignId(el) {
  if (!el.dataset.a11yId) {
    el.dataset.a11yId = `a11y-${++_idCounter}`;
  }
  return el.dataset.a11yId;
}

/**
 * Compute relative luminance of an RGB color per WCAG 2.x formula.
 * @param {number} r  0-255
 * @param {number} g  0-255
 * @param {number} b  0-255
 */
function relativeLuminance(r, g, b) {
  const chan = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

/**
 * Compute contrast ratio between two luminance values.
 */
function contrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse an rgb/rgba CSS color string into { r, g, b, a }.
 * Returns null if the string cannot be parsed.
 */
function parseColor(colorStr) {
  if (!colorStr) return null;
  const m = colorStr.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  return {
    r: parseFloat(m[1]),
    g: parseFloat(m[2]),
    b: parseFloat(m[3]),
    a: m[4] !== undefined ? parseFloat(m[4]) : 1,
  };
}

/**
 * Blend a foreground color (with alpha) over a background color.
 */
function blendAlpha(fg, bg) {
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

/**
 * Collect computed foreground and background colors for an element,
 * walking up the DOM tree to resolve transparent backgrounds.
 */
function getEffectiveColors(el) {
  const style = window.getComputedStyle(el);
  const fg = parseColor(style.color);
  if (!fg) return null;

  // Walk up to find first opaque background
  let bgColor = null;
  let node = el;
  while (node && node !== document.documentElement) {
    const bg = parseColor(window.getComputedStyle(node).backgroundColor);
    if (bg && bg.a > 0) {
      bgColor = bg;
      break;
    }
    node = node.parentElement;
  }
  if (!bgColor) bgColor = { r: 255, g: 255, b: 255, a: 1 }; // default white

  const effectiveFg = fg.a < 1 ? blendAlpha(fg, bgColor) : fg;
  return { fg: effectiveFg, bg: bgColor };
}

/**
 * Return true when an element is visually hidden via CSS but still in DOM
 * (i.e., used as an accessible name carrier that should not be color-checked).
 */
function isVisuallyHidden(el) {
  const s = window.getComputedStyle(el);
  return (
    s.display === 'none' ||
    s.visibility === 'hidden' ||
    s.opacity === '0' ||
    (s.position === 'absolute' && (parseInt(s.width) <= 1 || parseInt(s.height) <= 1))
  );
}

/**
 * Derive an accessible name for an element (simplified, covers common cases).
 */
function getAccessibleName(el) {
  // aria-labelledby takes highest priority
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map(id => {
      const ref = document.getElementById(id);
      return ref ? ref.textContent.trim() : '';
    }).join(' ').trim();
    if (text) return text;
  }
  // aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
  // title
  const title = el.getAttribute('title');
  if (title && title.trim()) return title.trim();
  return '';
}

/**
 * CSS.escape polyfill for environments that don't support it (e.g. Jest/jsdom).
 */
function cssEscape(str) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(str);
  return str.replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`);
}

/**
 * True when the text is a known non-descriptive (ambiguous) link phrase.
 */
const AMBIGUOUS_LINK_PATTERNS = /^(click here|here|read more|more|learn more|link|this link|details|info|information|download|view|see more|go|continue)\.?$/i;

function isAmbiguousLinkText(text) {
  return AMBIGUOUS_LINK_PATTERNS.test(text.trim());
}

/* -------------------------------------------------------------------------
 * Individual rule checkers
 * Each returns an array of issue objects.
 * ---------------------------------------------------------------------- */

/**
 * Rule 1 – Images missing alt text (WCAG 1.1.1)
 */
function checkImages(root) {
  const issues = [];
  root.querySelectorAll('img').forEach(img => {
    // Decorative images should have alt="" (empty), not be missing entirely
    const hasAlt = img.hasAttribute('alt');
    const altText = img.getAttribute('alt') || '';
    const role    = img.getAttribute('role');

    if (role === 'presentation' || role === 'none') return; // explicitly decorative

    if (!hasAlt) {
      issues.push({
        id:          getOrAssignId(img),
        element:     img,
        ruleId:      'img-alt',
        wcag:        WCAG.NON_TEXT_CONTENT,
        severity:    SEVERITY.CRITICAL,
        title:       'Image missing alt attribute',
        description: 'This image has no alt attribute. Screen readers will announce the file name or nothing.',
        remediation: 'Add a descriptive alt attribute. If the image is decorative, use alt="".',
        canAutoFix:  true,
        autoFixType: 'add-alt-text',
      });
    } else if (altText.trim() === '' && !img.closest('[aria-hidden="true"]')) {
      // alt="" is valid for decorative images – skip
    } else if (/\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(altText)) {
      issues.push({
        id:          getOrAssignId(img),
        element:     img,
        ruleId:      'img-alt-filename',
        wcag:        WCAG.NON_TEXT_CONTENT,
        severity:    SEVERITY.SERIOUS,
        title:       'Image alt text is a file name',
        description: `Alt text "${altText}" appears to be a file name, not a description.`,
        remediation: 'Replace the file name with a meaningful description of the image content.',
        canAutoFix:  true,
        autoFixType: 'add-alt-text',
      });
    }
  });
  return issues;
}

/**
 * Rule 2 – Videos without captions (WCAG 1.2.2)
 */
function checkVideos(root) {
  const issues = [];

  // Native <video> elements
  root.querySelectorAll('video').forEach(video => {
    const hasCaptionTrack = Array.from(video.querySelectorAll('track')).some(
      t => t.kind === 'captions' || t.kind === 'subtitles'
    );
    if (!hasCaptionTrack) {
      issues.push({
        id:          getOrAssignId(video),
        element:     video,
        ruleId:      'video-captions',
        wcag:        WCAG.CAPTIONS_PRERECORDED,
        severity:    SEVERITY.CRITICAL,
        title:       'Video missing captions',
        description: 'This video element has no caption or subtitle track.',
        remediation: 'Add a <track kind="captions"> element pointing to a VTT file, or use a captioned video host (YouTube auto-captions reviewed for accuracy).',
        canAutoFix:  false,
      });
    }
  });

  // Embedded iframes (YouTube, Vimeo, Kaltura, etc.)
  root.querySelectorAll('iframe').forEach(iframe => {
    const src = (iframe.src || '').toLowerCase();
    const isVideo = /youtube\.com|youtu\.be|vimeo\.com|kaltura\.com|mediaspace|brightcove/.test(src);
    if (isVideo) {
      issues.push({
        id:          getOrAssignId(iframe),
        element:     iframe,
        ruleId:      'iframe-video-captions',
        wcag:        WCAG.CAPTIONS_PRERECORDED,
        severity:    SEVERITY.SERIOUS,
        title:       'Embedded video – verify captions',
        description: `An embedded video from ${new URL(iframe.src || 'https://unknown').hostname} cannot be automatically verified for captions.`,
        remediation: 'Ensure the video has accurate closed captions enabled. For YouTube, confirm captions are turned on. For Kaltura, attach a caption file.',
        canAutoFix:  false,
      });
    }

    // Iframes without accessible names
    const name = getAccessibleName(iframe) || iframe.getAttribute('title') || '';
    if (!name.trim()) {
      issues.push({
        id:          getOrAssignId(iframe),
        element:     iframe,
        ruleId:      'iframe-title',
        wcag:        WCAG.NAME_ROLE_VALUE,
        severity:    SEVERITY.SERIOUS,
        title:       'Iframe missing title',
        description: 'This iframe has no title attribute. Screen readers cannot describe its purpose.',
        remediation: 'Add a descriptive title attribute to the iframe.',
        canAutoFix:  true,
        autoFixType: 'add-iframe-title',
      });
    }
  });

  return issues;
}

/**
 * Rule 3 – Heading structure (WCAG 1.3.1, 2.4.6)
 */
function checkHeadings(root) {
  const issues = [];
  const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'));

  // Empty headings
  headings.forEach(h => {
    const text = h.textContent.trim();
    if (!text && !getAccessibleName(h)) {
      issues.push({
        id:          getOrAssignId(h),
        element:     h,
        ruleId:      'heading-empty',
        wcag:        WCAG.INFO_AND_RELATIONSHIPS,
        severity:    SEVERITY.SERIOUS,
        title:       `Empty ${h.tagName.toLowerCase()} element`,
        description: 'This heading element is empty. Screen readers may announce it confusingly.',
        remediation: 'Either add meaningful text or remove the heading element.',
        canAutoFix:  false,
      });
    }
  });

  // Skipped heading levels (e.g., h1 → h3 skips h2)
  let prevLevel = 0;
  headings.forEach(h => {
    const level = parseInt(h.tagName[1], 10);
    if (prevLevel > 0 && level > prevLevel + 1) {
      issues.push({
        id:          getOrAssignId(h),
        element:     h,
        ruleId:      'heading-skipped',
        wcag:        WCAG.INFO_AND_RELATIONSHIPS,
        severity:    SEVERITY.MODERATE,
        title:       `Heading level skipped (h${prevLevel} → h${level})`,
        description: `Heading levels should not be skipped. Going from h${prevLevel} to h${level} breaks the document outline.`,
        remediation: `Change this heading to h${prevLevel + 1} or restructure the heading hierarchy.`,
        canAutoFix:  true,
        autoFixType: 'fix-heading-level',
        meta:        { currentLevel: level, suggestedLevel: prevLevel + 1 },
      });
    }
    prevLevel = level;
  });

  return issues;
}

/**
 * Rule 4 – Links with ambiguous or empty text (WCAG 2.4.4)
 */
function checkLinks(root) {
  const issues = [];
  root.querySelectorAll('a[href]').forEach(a => {
    const text     = a.textContent.trim();
    const ariaName = getAccessibleName(a);
    const imgAlt   = a.querySelector('img') ? (a.querySelector('img').getAttribute('alt') || '').trim() : '';
    const effectiveName = ariaName || text || imgAlt;

    if (!effectiveName) {
      issues.push({
        id:          getOrAssignId(a),
        element:     a,
        ruleId:      'link-empty',
        wcag:        WCAG.LINK_PURPOSE,
        severity:    SEVERITY.CRITICAL,
        title:       'Link has no accessible name',
        description: 'This link has no text, aria-label, or image alt text. Screen reader users cannot determine its purpose.',
        remediation: 'Add descriptive text content or an aria-label that describes the link destination.',
        canAutoFix:  true,
        autoFixType: 'add-aria-label',
      });
    } else if (isAmbiguousLinkText(effectiveName) && !ariaName) {
      issues.push({
        id:          getOrAssignId(a),
        element:     a,
        ruleId:      'link-ambiguous',
        wcag:        WCAG.LINK_PURPOSE,
        severity:    SEVERITY.SERIOUS,
        title:       `Ambiguous link text: "${effectiveName}"`,
        description: 'This link text does not describe the destination or purpose when read out of context.',
        remediation: 'Use descriptive link text or add an aria-label that includes the destination name.',
        canAutoFix:  true,
        autoFixType: 'add-aria-label',
      });
    }
  });
  return issues;
}

/**
 * Rule 5 – Form inputs missing labels (WCAG 1.3.1, 3.3.2)
 */
function checkForms(root) {
  const issues = [];
  const inputSelectors = 'input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"]), select, textarea';

  root.querySelectorAll(inputSelectors).forEach(input => {
    const id          = input.id;
    const hasLabel    = id && root.querySelector(`label[for="${cssEscape(id)}"]`);
    const ariaName    = getAccessibleName(input);
    const wrappedLabel= input.closest('label');

    if (!hasLabel && !ariaName && !wrappedLabel) {
      issues.push({
        id:          getOrAssignId(input),
        element:     input,
        ruleId:      'input-label',
        wcag:        WCAG.LABELS_OR_INSTRUCTIONS,
        severity:    SEVERITY.CRITICAL,
        title:       'Form input missing label',
        description: `This ${input.tagName.toLowerCase()} has no associated label, aria-label, or aria-labelledby.`,
        remediation: 'Add a <label for="..."> element, an aria-label, or an aria-labelledby referencing a visible label.',
        canAutoFix:  true,
        autoFixType: 'add-aria-label',
      });
    }
  });

  // Buttons without accessible names
  root.querySelectorAll('button').forEach(btn => {
    const text     = btn.textContent.trim();
    const ariaName = getAccessibleName(btn);
    const imgAlt   = btn.querySelector('img') ? (btn.querySelector('img').getAttribute('alt') || '').trim() : '';

    if (!text && !ariaName && !imgAlt) {
      issues.push({
        id:          getOrAssignId(btn),
        element:     btn,
        ruleId:      'button-name',
        wcag:        WCAG.NAME_ROLE_VALUE,
        severity:    SEVERITY.CRITICAL,
        title:       'Button has no accessible name',
        description: 'This button has no text content or aria-label. Screen reader users cannot determine its function.',
        remediation: 'Add visible text or an aria-label that describes the button\'s action.',
        canAutoFix:  true,
        autoFixType: 'add-aria-label',
      });
    }
  });

  return issues;
}

/**
 * Rule 6 – Tables missing headers (WCAG 1.3.1)
 */
function checkTables(root) {
  const issues = [];
  root.querySelectorAll('table').forEach(table => {
    const hasHeaders = table.querySelector('th') !== null;
    const hasScope   = table.querySelector('[scope]') !== null;
    const hasCaption = table.querySelector('caption') !== null;
    const isLayout   = table.getAttribute('role') === 'presentation' || table.getAttribute('role') === 'none';

    if (isLayout) return;

    if (!hasHeaders && !hasScope) {
      // Ignore single-cell or single-row tables (likely layout misuse)
      const rows = table.querySelectorAll('tr');
      if (rows.length <= 1) return;

      issues.push({
        id:          getOrAssignId(table),
        element:     table,
        ruleId:      'table-headers',
        wcag:        WCAG.INFO_AND_RELATIONSHIPS,
        severity:    SEVERITY.SERIOUS,
        title:       'Data table missing header cells',
        description: 'This table has no <th> elements or scope attributes. Screen reader users cannot relate data cells to their headers.',
        remediation: 'Add <th> elements to header rows/columns and use scope="col" or scope="row" attributes.',
        canAutoFix:  false,
      });
    }

    if (!hasCaption) {
      const rows = table.querySelectorAll('tr');
      if (rows.length > 1) {
        issues.push({
          id:          getOrAssignId(table),
          element:     table,
          ruleId:      'table-caption',
          wcag:        WCAG.INFO_AND_RELATIONSHIPS,
          severity:    SEVERITY.MINOR,
          title:       'Table missing caption',
          description: 'This table has no <caption> element describing its purpose.',
          remediation: 'Add a <caption> element as the first child of the table.',
          canAutoFix:  false,
        });
      }
    }
  });
  return issues;
}

/**
 * Rule 7 – Color contrast (WCAG 1.4.3)
 * Checks a representative sample of text nodes in the content area.
 * Full pixel-level checking is out of scope for a DOM-based tool.
 */
function checkColorContrast(root) {
  const issues = [];
  const NORMAL_TEXT_RATIO = 4.5;
  const LARGE_TEXT_RATIO  = 3.0;   // 18pt or 14pt bold
  const checked = new Set();

  // Focus on text-bearing elements that commonly carry inline color styles
  const selector = 'p, li, td, th, span, div, h1, h2, h3, h4, h5, h6, label, caption, figcaption, a';
  root.querySelectorAll(selector).forEach(el => {
    if (isVisuallyHidden(el)) return;
    if (checked.has(el)) return;

    // Only check elements with explicit color styling to avoid false positives
    const style = window.getComputedStyle(el);
    const inlineColor = el.style.color || el.style.backgroundColor;
    const hasExplicitColor = inlineColor ||
      el.getAttribute('style') ||
      el.closest('[style*="color"]');

    if (!hasExplicitColor) return;
    if (!el.textContent.trim()) return;

    const colors = getEffectiveColors(el);
    if (!colors) return;

    const { fg, bg } = colors;
    const fgLum = relativeLuminance(fg.r, fg.g, fg.b);
    const bgLum = relativeLuminance(bg.r, bg.g, bg.b);
    const ratio = contrastRatio(fgLum, bgLum);

    const fontSize = parseFloat(style.fontSize);
    const isBold   = parseInt(style.fontWeight, 10) >= 700 || style.fontWeight === 'bold';
    const isLarge  = fontSize >= 24 || (fontSize >= 18.67 && isBold);
    const required = isLarge ? LARGE_TEXT_RATIO : NORMAL_TEXT_RATIO;

    if (ratio < required) {
      checked.add(el);
      issues.push({
        id:          getOrAssignId(el),
        element:     el,
        ruleId:      'color-contrast',
        wcag:        WCAG.CONTRAST_MINIMUM,
        severity:    ratio < 2 ? SEVERITY.CRITICAL : SEVERITY.SERIOUS,
        title:       `Insufficient color contrast (${ratio.toFixed(2)}:1)`,
        description: `The contrast ratio of ${ratio.toFixed(2)}:1 is below the required ${required}:1 for ${isLarge ? 'large' : 'normal'} text.`,
        remediation: `Increase the contrast between the foreground color rgb(${fg.r},${fg.g},${fg.b}) and background rgb(${bg.r},${bg.g},${bg.b}) to at least ${required}:1.`,
        canAutoFix:  false,
        meta:        { ratio: ratio.toFixed(2), required, fg, bg },
      });
    }
  });
  return issues;
}

/**
 * Rule 8 – Language of page (WCAG 3.1.1)
 */
function checkLanguage(root) {
  const issues = [];
  const html  = document.documentElement;
  const lang  = html.getAttribute('lang') || '';
  const xmlLang = html.getAttribute('xml:lang') || '';

  if (!lang.trim() && !xmlLang.trim()) {
    issues.push({
      id:          'html-lang',
      element:     html,
      ruleId:      'html-lang',
      wcag:        WCAG.LANGUAGE_OF_PAGE,
      severity:    SEVERITY.SERIOUS,
      title:       'Page missing lang attribute',
      description: 'The <html> element has no lang attribute. Screen readers use this to select the correct language engine.',
      remediation: 'Add a lang attribute to the <html> element, e.g., <html lang="en">.',
      canAutoFix:  true,
      autoFixType: 'add-lang',
    });
  } else if (lang && !/^[a-z]{2,3}(-[A-Z]{2,3})?$/i.test(lang)) {
    issues.push({
      id:          'html-lang-invalid',
      element:     html,
      ruleId:      'html-lang-invalid',
      wcag:        WCAG.LANGUAGE_OF_PAGE,
      severity:    SEVERITY.MODERATE,
      title:       `Invalid lang attribute value: "${lang}"`,
      description: 'The lang attribute value does not appear to be a valid BCP 47 language tag.',
      remediation: 'Use a valid BCP 47 language tag such as "en", "en-US", "fr", "es".',
      canAutoFix:  true,
      autoFixType: 'fix-lang',
    });
  }
  return issues;
}

/**
 * Rule 9 – Page title (WCAG 2.4.2)
 */
function checkPageTitle() {
  const issues = [];
  const title = document.title;
  if (!title || !title.trim()) {
    issues.push({
      id:          'page-title',
      element:     document.head,
      ruleId:      'page-title',
      wcag:        WCAG.PAGE_TITLED,
      severity:    SEVERITY.SERIOUS,
      title:       'Page missing title',
      description: 'The page has no <title> element. Screen reader users rely on the page title to identify the page.',
      remediation: 'Add a descriptive <title> element inside <head>.',
      canAutoFix:  false,
    });
  }
  return issues;
}

/**
 * Rule 10 – Elements with positive tabindex (WCAG 2.4.3)
 */
function checkTabindex(root) {
  const issues = [];
  root.querySelectorAll('[tabindex]').forEach(el => {
    const val = parseInt(el.getAttribute('tabindex'), 10);
    if (val > 0) {
      issues.push({
        id:          getOrAssignId(el),
        element:     el,
        ruleId:      'tabindex-positive',
        wcag:        WCAG.KEYBOARD,
        severity:    SEVERITY.MODERATE,
        title:       `Positive tabindex (tabindex="${val}")`,
        description: 'A positive tabindex value creates a custom tab order that often confuses keyboard users.',
        remediation: 'Use tabindex="0" to include the element in the natural tab order or tabindex="-1" to allow programmatic focus only.',
        canAutoFix:  true,
        autoFixType: 'fix-tabindex',
      });
    }
  });
  return issues;
}

/**
 * Rule 11 – ARIA roles / attributes
 */
function checkAria(root) {
  const issues = [];

  // aria-hidden on focusable elements
  root.querySelectorAll('[aria-hidden="true"]').forEach(el => {
    const focusable = el.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) {
      issues.push({
        id:          getOrAssignId(el),
        element:     el,
        ruleId:      'aria-hidden-focusable',
        wcag:        WCAG.NAME_ROLE_VALUE,
        severity:    SEVERITY.SERIOUS,
        title:       'aria-hidden element contains focusable children',
        description: 'An element with aria-hidden="true" contains focusable elements. Keyboard users can reach these elements, but screen readers will not announce them.',
        remediation: 'Remove aria-hidden="true" from this container or remove the focusable elements from inside it.',
        canAutoFix:  false,
      });
    }
  });

  // Invalid ARIA roles
  const VALID_ROLES = new Set([
    'alert','alertdialog','application','article','banner','button','cell','checkbox',
    'columnheader','combobox','complementary','contentinfo','definition','dialog',
    'directory','document','feed','figure','form','grid','gridcell','group',
    'heading','img','link','list','listbox','listitem','log','main','marquee',
    'math','menu','menubar','menuitem','menuitemcheckbox','menuitemradio','navigation',
    'none','note','option','presentation','progressbar','radio','radiogroup','region',
    'row','rowgroup','rowheader','scrollbar','search','searchbox','separator',
    'slider','spinbutton','status','switch','tab','table','tablist','tabpanel',
    'term','textbox','timer','toolbar','tooltip','tree','treegrid','treeitem',
  ]);
  root.querySelectorAll('[role]').forEach(el => {
    const roles = (el.getAttribute('role') || '').split(/\s+/);
    roles.forEach(role => {
      if (role && !VALID_ROLES.has(role)) {
        issues.push({
          id:          getOrAssignId(el),
          element:     el,
          ruleId:      'aria-role-invalid',
          wcag:        WCAG.NAME_ROLE_VALUE,
          severity:    SEVERITY.SERIOUS,
          title:       `Invalid ARIA role: "${role}"`,
          description: `The role "${role}" is not a valid WAI-ARIA role.`,
          remediation: 'Use a valid WAI-ARIA role or remove the role attribute.',
          canAutoFix:  false,
        });
      }
    });
  });

  return issues;
}

/* -------------------------------------------------------------------------
 * Main scan entry point
 * ---------------------------------------------------------------------- */

/**
 * Run all accessibility rules against the given root element (or document.body).
 * @param {Element} [root=document.body]
 * @returns {{ issues: Array, summary: Object }}
 */
function scanPage(root) {
  root = root || document.body;

  const allIssues = [
    ...checkImages(root),
    ...checkVideos(root),
    ...checkHeadings(root),
    ...checkLinks(root),
    ...checkForms(root),
    ...checkTables(root),
    ...checkColorContrast(root),
    ...checkLanguage(root),
    ...checkPageTitle(),
    ...checkTabindex(root),
    ...checkAria(root),
  ];

  const summary = {
    total:    allIssues.length,
    critical: allIssues.filter(i => i.severity === SEVERITY.CRITICAL).length,
    serious:  allIssues.filter(i => i.severity === SEVERITY.SERIOUS).length,
    moderate: allIssues.filter(i => i.severity === SEVERITY.MODERATE).length,
    minor:    allIssues.filter(i => i.severity === SEVERITY.MINOR).length,
  };

  return { issues: allIssues, summary };
}

/* -------------------------------------------------------------------------
 * Export for use in content.js and tests
 * ---------------------------------------------------------------------- */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
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
    SEVERITY,
    WCAG,
  };
}
