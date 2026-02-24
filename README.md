# Canvas A11y Remediator

> A Chrome browser extension that scans Canvas LMS course pages for **WCAG 2.1 AA** accessibility issues and provides guided, one-click remediation.

---

## Features

| Category | What it checks |
|---|---|
| **Images** | Missing `alt` attribute (WCAG 1.1.1), file-name alt text |
| **Videos** | Native `<video>` captions (WCAG 1.2.2), embedded video caption verification |
| **Headings** | Empty headings, skipped heading levels (WCAG 1.3.1 / 2.4.6) |
| **Links** | Empty links, ambiguous link text ("click here", "read more") (WCAG 2.4.4) |
| **Forms** | Inputs without labels, buttons without accessible names (WCAG 3.3.2 / 4.1.2) |
| **Tables** | Data tables missing `<th>` headers or `<caption>` (WCAG 1.3.1) |
| **Colour contrast** | Insufficient contrast ratio for normal and large text (WCAG 1.4.3) |
| **Language** | Missing or invalid `lang` attribute on `<html>` (WCAG 3.1.1) |
| **Page title** | Missing `<title>` element (WCAG 2.4.2) |
| **Keyboard** | Positive `tabindex` values (WCAG 2.1.1) |
| **ARIA** | `aria-hidden` containing focusable children, invalid ARIA roles (WCAG 4.1.2) |

### Remediation actions

For many issues the extension can apply a fix directly in the page:

- **Locate** – highlights the element and scrolls it into view
- **Fix It** – applies the fix (prompts for user input where needed, e.g. alt text)
- **Export Report** – downloads a JSON report of all issues

### Keyboard shortcut

`Alt + Shift + A` toggles the accessibility panel.

---

## Installation (development)

1. `npm install` – install dev dependencies
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the `extension/` folder
5. Navigate to any Canvas LMS page and click the **A** icon in the toolbar

---

## Running tests

```bash
npm test
```

88 unit tests cover the scanner rules and remediator dispatch logic using **Jest + jsdom**.

---

## Project structure

```
extension/
  manifest.json          Chrome Manifest V3
  background/
    background.js        Service worker – toolbar icon, keyboard shortcut
  content/
    scanner.js           WCAG 2.1 AA rule engine (11 rule categories)
    remediator.js        Fix engine + accessible prompt dialog
    content.js           Panel UI controller + Chrome message listener
    panel.css            Injected side-panel styles
  popup/
    popup.html           Extension popup
    popup.js             Popup logic (domain check, scan/toggle buttons)
  icons/
    icon16.svg
    icon48.svg
    icon128.svg
  tests/
    scanner.test.js      Unit tests for scanner
    remediator.test.js   Unit tests for remediator
```

---

## WCAG 2.1 AA success criteria covered

| SC | Title |
|---|---|
| 1.1.1 | Non-text Content |
| 1.2.2 | Captions (Prerecorded) |
| 1.3.1 | Info and Relationships |
| 1.4.3 | Contrast (Minimum) |
| 2.1.1 | Keyboard |
| 2.4.2 | Page Titled |
| 2.4.4 | Link Purpose (In Context) |
| 2.4.6 | Headings and Labels |
| 3.1.1 | Language of Page |
| 3.3.2 | Labels or Instructions |
| 4.1.2 | Name, Role, Value |
