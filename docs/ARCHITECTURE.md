# PromptForge Nexus Studio 5.0 Architecture

## Runtime

PromptForge is a static local-first web application:

- `index.html`: application structure and views.
- `assets/styles.css`: responsive theme and print styles.
- `assets/data.js`: model profiles, reasoning options, execution modes, templates, feature definitions, snippets, and guide navigation.
- `assets/i18n.js`: Arabic and English interface strings.
- `assets/app.js`: model-aware prompt compiler, model profile renderer, conflict engine, quality scoring, storage, versions, backups, settings, and maintenance.
- `sw.js`: same-origin network-first cache with offline fallback.
- `manifest.webmanifest`: installable web-app metadata.

## Storage

All user data uses namespaced browser LocalStorage keys beginning with `pfs3_`.

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

## Guided workflow and accessibility

- Five-step completion scoring is calculated locally from the current form.
- Prompt word, character, and approximate token counts update with compilation.
- Builder tabs implement tab roles, selected state, roving focus, and arrow-key navigation.
- Command palette and modal dialogs trap focus and restore it on close.
- Each main view has an addressable hash route without introducing a router dependency.
- Reduced-motion, forced-color, visible-focus, and skip-link behavior are handled in CSS.

## Validation

`npm run check` verifies JavaScript syntax, required assets, unique ids, translation coverage, template ids, version consistency, manifest icons, Service Worker files, and absence of backend components.

## Model targeting

The application does not call external model APIs. It stores a selected model profile and compiles provider-aware prompt instructions locally. GPT-5.6 Sol is the default profile. Each project stores the target model, reasoning level, execution mode, and optional custom deployment name.


## Theme system

The UI uses a validated `uiTheme` setting, a body `data-theme-skin` attribute, theme-specific CSS variables, and independent system/light/dark display modes. Theme state is persisted in the existing local settings object.
