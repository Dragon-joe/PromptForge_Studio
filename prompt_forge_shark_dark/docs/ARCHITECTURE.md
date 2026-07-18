# PromptForge Studio 2.4 Architecture

## Runtime

PromptForge is a static local-first web application:

- `index.html`: application structure and views.
- `assets/styles.css`: responsive theme and print styles.
- `assets/data.js`: templates, feature definitions, snippets, and guide navigation.
- `assets/i18n.js`: Arabic and English interface strings.
- `assets/app.js`: prompt compiler, conflict engine, quality scoring, storage, versions, backups, settings, and maintenance.
- `sw.js`: same-origin network-first cache with offline fallback.
- `manifest.webmanifest`: installable web-app metadata.

## Storage

All user data uses namespaced browser LocalStorage keys beginning with `pfs2_`.

The application validates and normalizes:

- settings
- projects
- version snapshots
- smart blocks
- favorites
- current draft

Corrupt or incompatible collections are replaced with safe empty collections rather than crashing the interface.

## Security and privacy

- No backend.
- No API calls.
- No remote database.
- No analytics.
- No external JavaScript libraries.
- Imported backup files are size-limited and sanitized before storage.
- Dynamic text inserted into HTML is escaped.

## Limits

- 100 projects.
- 30 versions per project.
- 200 custom smart blocks.
- 8 MB maximum imported backup file.
- Imported prompt text and rules are length-limited.

## Validation

`npm run check` verifies JavaScript syntax, required assets, unique ids, translation coverage, template ids, version consistency, manifest icons, Service Worker files, and absence of backend components.
