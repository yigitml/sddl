<div align="center">

# sddl

**A Manifest V3 browser extension for detecting and downloading StudyDrive documents, individually or in controlled batches.**

`JavaScript` &nbsp; `WebExtensions API` &nbsp; `Manifest V3` &nbsp; `Service Worker`

</div>

---

## Overview

`sddl` augments StudyDrive document pages with a direct download workflow. It observes the site’s document viewer, transfers captured PDF data across browser execution contexts, and delegates file creation to the extension background worker.

Course pages also expose a bulk workflow with queue discovery, batched processing, progress reporting, pause/resume controls, retry handling, and cleanup of temporary tabs and object URLs.

Use this project only for documents you are authorized to access and download. Website behavior and terms can change independently of the extension.

## Engineering highlights

- **Manifest V3 architecture** — background work runs in a service worker with narrowly scoped StudyDrive host permissions.
- **Cross-context bridge** — separate MAIN and ISOLATED content scripts safely move viewer data into the extension runtime.
- **Dynamic-page support** — a `MutationObserver` handles controls rendered after the initial document load.
- **Bounded concurrency** — bulk downloads run in configurable batches instead of opening an unbounded number of tabs.
- **Operational controls** — pause, resume, stop, retry, progress updates, and active-tab cleanup are modeled explicitly.
- **Browser portability** — runtime access is abstracted across the `chrome` and `browser` extension APIs.

## Architecture

```text
StudyDrive page
      │
      ├── MAIN-world interceptor ── observes viewer data
      │             │
      │             ▼ custom DOM event
      └── ISOLATED bridge ── runtime message ── service worker
                                                  │
                                       session storage / downloads API
                                                  │
                                                  ▼
                                           extension popup
```

| File | Responsibility |
| --- | --- |
| `manifest.json` | Permissions, execution worlds, lifecycle, and popup registration |
| `main-cs.js` | Main-world integration with the site’s document viewer |
| `isolated-cs.js` | Narrow bridge from page events into extension messaging |
| `content.js` | Replaces the page control with a direct download action |
| `bulk-course.js` | Detects course document links and answers popup queries |
| `background.js` | PDF state, object URLs, downloads, batching, retries, and cleanup |
| `popup.js` | Queue presentation and user controls for bulk operations |
| `popup.html` / `main.css` | Extension interface and light/dark visual states |

## How the context bridge works

Browser extensions isolate content scripts from page JavaScript. `sddl` deliberately uses both worlds:

1. `main-cs.js` runs alongside the site application and observes document bytes.
2. It dispatches a custom event whose name is derived from the extension ID.
3. `isolated-cs.js` listens for that event and forwards only the document name and bytes through the extension runtime.
4. `background.js` creates a temporary object URL, keeps tab-scoped metadata in session storage, and starts the browser download.
5. Object URLs and temporary tabs are revoked or closed during cleanup.

This split isolates privileged extension capabilities from the page context while still integrating with a client-rendered application.

## Installation

No build step is required.

```bash
git clone https://github.com/yigitml/sddl.git
```

### Chromium browsers

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the cloned `sddl` directory.

### Firefox

The code contains a WebExtensions API fallback, but temporary installation and Manifest V3 behavior vary by Firefox version. Use `about:debugging` and validate the service-worker configuration for your target release.

## Usage

### Single document

1. Open a StudyDrive document preview and wait for it to load.
2. Use the injected **Download** control.
3. The extension retrieves the captured PDF from the background worker and starts the browser download.

### Course batch

1. Open the documents section of a StudyDrive course.
2. Open the extension popup.
3. Review the detected queue and start the batch.
4. Pause, resume, or stop from the popup as needed.

Non-PDF package/archive extensions are filtered from the batch. The default batch size is configured in `background.js`.

## Development notes

After changing source files, reload the unpacked extension from the browser’s extension management page. Inspect the page console for content-script logs, the popup inspector for UI state, and the extension service-worker inspector for background lifecycle or download errors.

The repository currently uses plain JavaScript and ships source files directly; there is no transpilation or bundling layer.

## License

Licensed under the [MIT License](LICENSE).
