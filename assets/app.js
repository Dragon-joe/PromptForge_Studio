(() => {
  'use strict';

  const D = window.PFS_DATA;
  const I18N = window.PFS_I18N;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const APP_VERSION = '5.0.0';
  const PREFIX = 'pfs3_';
  const memoryFallback = new Map();
  const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
  const MAX_PROJECTS = 100;
  const MAX_VERSIONS = 30;

  const defaults = {
    language: 'ar',
    theme: 'system',
    uiTheme: 'aurora',
    density: 'comfortable',
    accent: '#6d5dfc',
    fontScale: 100,
    depth: 'professional',
    defaultModel: 'gpt-5.6-sol',
    autosave: true,
    livePreview: true,
    dedupe: true,
    shortcuts: true,
    filename: '{title}_{date}_{version}',
    textFormat: 'txt',
    metadata: true
  };

  function sanitizeSettings(candidate = {}) {
    const value = candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
    return {
      ...defaults,
      language: ['ar','en'].includes(value.language) ? value.language : defaults.language,
      theme: ['system','light','dark'].includes(value.theme) ? value.theme : defaults.theme,
      uiTheme: ['aurora','midnight','ember','forest','royal','graphite'].includes(value.uiTheme) ? value.uiTheme : defaults.uiTheme,
      density: ['comfortable','compact'].includes(value.density) ? value.density : defaults.density,
      accent: normalizeHex(value.accent, defaults.accent),
      fontScale: Math.max(90, Math.min(115, Number(value.fontScale) || defaults.fontScale)),
      depth: ['compact','professional','maximum'].includes(value.depth) ? value.depth : defaults.depth,
      defaultModel: D.modelProfiles.some(model => model.id === value.defaultModel) ? value.defaultModel : defaults.defaultModel,
      autosave: value.autosave !== false,
      livePreview: value.livePreview !== false,
      dedupe: value.dedupe !== false,
      shortcuts: value.shortcuts !== false,
      filename: typeof value.filename === 'string' && value.filename.trim() ? value.filename.trim().slice(0,120) : defaults.filename,
      textFormat: ['txt','md','json'].includes(value.textFormat) ? value.textFormat : defaults.textFormat,
      metadata: value.metadata !== false
    };
  }

  const storage = {
    get(key, fallback) {
      if (memoryFallback.has(key)) return memoryFallback.get(key);
      try {
        const raw = localStorage.getItem(PREFIX + key);
        if (raw !== null) {
          const parsed = JSON.parse(raw);
          memoryFallback.set(key, parsed);
          return parsed;
        }
      } catch {
        try { localStorage.removeItem(PREFIX + key); } catch {}
        memoryFallback.delete(key);
      }
      return fallback;
    },
    set(key, value) {
      let serialized;
      try { serialized = JSON.stringify(value); } catch { return false; }
      try {
        localStorage.setItem(PREFIX + key, serialized);
        memoryFallback.set(key, value);
        return true;
      } catch {
        memoryFallback.set(key, value);
        return false;
      }
    },
    remove(key) {
      memoryFallback.delete(key);
      try { localStorage.removeItem(PREFIX + key); } catch {}
    },
    invalidate(key) { memoryFallback.delete(key); },
    clear() {
      memoryFallback.clear();
      try {
        Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k));
      } catch {}
    }
  };

  function getStoredArray(key) {
    const value = storage.get(key, []);
    return Array.isArray(value) ? value : [];
  }

  let settings = sanitizeSettings(storage.get('settings', {}));
  const state = {
    step: 1,
    fidelity: 'strict',
    outputMode: 'prompt',
    insight: 'prompt',
    currentProjectId: null,
    currentTemplateId: null,
    generated: { prompt: '', markdown: '', json: {} },
    conflicts: [],
    suggestions: [],
    quality: 0,
    diagnosticLog: [],
    compileTimer: null,
    autosaveTimer: null,
    commandIndex: 0,
    dirty: false,
    lastCompiledHash: '',
    previousFocus: null,
    history: [],
    historyIndex: -1,
    historyLock: false,
    historyTimer: null,
    qualityBreakdown: {},
    onboardingStep: 0,
    installPrompt: null,
    updateWorker: null,
    commandPreviousFocus: null
  };

  const roles = {
    'word-template': 'Act as a senior Microsoft Word template designer, educational publishing specialist, and document usability expert.',
    'study-guide': 'Act as a senior academic editor, learning-design specialist, exam-preparation consultant, and Microsoft Word publishing expert.',
    'strict-word': 'Act as a senior academic editor, technical proofreader, OCR verification specialist, and university publishing expert.',
    'question-bank': 'Act as a senior academic assessment designer, subject-matter editor, and exam-quality reviewer.',
    'lecture-questions': 'Act as a senior academic editor, Word publishing specialist, and assessment designer.',
    'presentation': 'Act as a senior academic presentation designer, lecture editor, and PowerPoint publishing expert.',
    'egyptian-translation': 'Act as a professional translator who writes natural Egyptian Arabic while preserving meaning, tone, and technical terminology.',
    'highlight-only': 'Act as a senior academic reviewer and Microsoft Word formatting specialist focused on selective, exam-oriented highlighting.',
    'bilingual': 'Act as a bilingual academic editor specializing in English-to-Egyptian-Arabic learning materials.',
    'educational-visuals': 'Act as an academic visual-learning designer who creates source-based educational diagrams only when they add clear learning value.',
    'social-rewrite': 'Act as an experienced social-media writer who produces natural, original community posts without copying source wording.',
    'custom': 'Act as the most relevant senior expert team required to complete the task accurately and professionally.'
  };

  const taskLabels = Object.fromEntries(D.taskTypes.map(([id, en, ar]) => [id, { en, ar }]));
  const modelLabels = Object.fromEntries(D.modelProfiles.map(model => [model.id, model]));
  const executionLabels = Object.fromEntries(D.executionModes.map(mode => [mode.id, mode]));
  const featureLabels = {};
  [D.contentRules, D.documentFeatures, D.boxFeatures, D.visualFeatures, D.questionFeatures, D.prohibitedRules]
    .forEach(group => group.forEach(([id, en, ar]) => { featureLabels[id] = { en, ar }; }));

  function init() {
    renderAllDynamic();
    normalizeStoredData();
    bindEvents();
    applySettings(false);
    loadDraft();
    setStep(1);
    compilePrompt();
    updateDashboard();
    renderDiagnostics(false);
    setupInstallPrompt();
    registerServiceWorker();
    bindSystemThemeListener();
    updateSaveState(false);
    resetHistory();
    updateHistoryButtons();
    const initialView = location.hash.match(/^#\/(dashboard|builder|templates|snippets|projects|guide|settings|maintenance|about)$/)?.[1];
    if (initialView && initialView !== 'dashboard') showView(initialView, false);
    if (!storage.get('onboardingDone', false)) setTimeout(showOnboarding, 350);
    if (new URLSearchParams(location.search).get('test') === '1' || window.__PFS_TEST__ === true) setTimeout(runSelfTest, 250);
  }

  function renderAllDynamic() {
    renderTaskTypes();
    renderModelProfiles();
    renderFidelity();
    renderFeatureGroup('#contentRules', D.contentRules);
    renderFeatureGroup('#documentFeatures', D.documentFeatures);
    renderFeatureGroup('#boxFeatures', D.boxFeatures);
    renderFeatureGroup('#visualFeatures', D.visualFeatures);
    renderFeatureGroup('#questionFeatures', D.questionFeatures);
    renderFeatureGroup('#prohibitedRules', D.prohibitedRules);
    renderQuickTemplates();
    renderTemplates();
    renderSnippets();
    renderProjects();
    renderGuide();
    renderCommands();
  }

  function langText(en, ar) { return settings.language === 'ar' ? ar : en; }

  function renderTaskTypes() {
    $('#taskType').innerHTML = D.taskTypes.map(([id, en, ar]) => `<option value="${id}">${escapeHtml(langText(en, ar))}</option>`).join('');
  }

  function renderModelProfiles() {
    const target = $('#targetModel');
    const setting = $('#settingDefaultModel');
    const currentTarget = target?.value || settings.defaultModel;
    const currentSetting = setting?.value || settings.defaultModel;
    const options = D.modelProfiles.map(model => `<option value="${model.id}">${escapeHtml(model.provider)} · ${escapeHtml(langText(model.name, model.nameAr))}${model.recommended ? ` — ${escapeHtml(langText('Recommended','مقترح'))}` : ''}</option>`).join('');
    if (target) {
      target.innerHTML = options;
      target.value = modelLabels[currentTarget] ? currentTarget : settings.defaultModel;
    }
    if (setting) {
      setting.innerHTML = options;
      setting.value = modelLabels[currentSetting] ? currentSetting : settings.defaultModel;
    }
    renderExecutionModes();
    renderReasoningOptions(target?.value || settings.defaultModel);
    updateModelProfileCard();
  }

  function renderExecutionModes() {
    const select = $('#executionMode');
    if (!select) return;
    const current = select.value || 'document-production';
    select.innerHTML = D.executionModes.map(mode => `<option value="${mode.id}">${escapeHtml(langText(mode.name, mode.nameAr))}</option>`).join('');
    select.value = executionLabels[current] ? current : 'document-production';
  }

  function renderReasoningOptions(modelId, preferredValue) {
    const select = $('#reasoningEffort');
    const model = modelLabels[modelId] || modelLabels[settings.defaultModel] || D.modelProfiles[0];
    if (!select || !model) return;
    const current = preferredValue || select.value || model.defaultReasoning;
    select.innerHTML = model.reasoning.map(([id, en, ar]) => `<option value="${id}">${escapeHtml(langText(en, ar))}</option>`).join('');
    select.value = model.reasoning.some(([id]) => id === current) ? current : model.defaultReasoning;
  }

  function selectedModelProfile(form) {
    const id = form?.targetModel || $('#targetModel')?.value || settings.defaultModel;
    return modelLabels[id] || modelLabels[settings.defaultModel] || D.modelProfiles[0];
  }

  function updateModelProfileCard() {
    const card = $('#modelProfileCard');
    const customWrap = $('#customModelWrap');
    if (!card) return;
    const model = selectedModelProfile();
    const custom = model.id === 'custom-model';
    if (customWrap) customWrap.hidden = !custom;
    const execution = executionLabels[$('#executionMode')?.value] || executionLabels['document-production'];
    const modelName = custom && $('#customModelName')?.value.trim() ? $('#customModelName').value.trim() : langText(model.name, model.nameAr);
    const modelId = custom ? ($('#customModelName')?.value.trim() || langText('Enter a model name','اكتب اسم الموديل')) : (model.modelId || langText('Provider-neutral','عام بدون معرّف محدد'));
    card.innerHTML = `<div class="model-profile-main"><span class="model-provider">${escapeHtml(model.provider)}</span><div><h4>${escapeHtml(modelName)}</h4><code>${escapeHtml(modelId)}</code></div><span class="model-tier">${escapeHtml(langText(model.badge, model.badgeAr))}</span></div><p>${escapeHtml(langText(model.bestFor, model.bestForAr))}</p><div class="model-profile-foot"><span>${escapeHtml(langText('Reasoning','التفكير'))}: <b>${escapeHtml($('#reasoningEffort')?.selectedOptions?.[0]?.textContent || model.defaultReasoning)}</b></span><span>${escapeHtml(langText('Execution','التنفيذ'))}: <b>${escapeHtml(execution ? langText(execution.name, execution.nameAr) : '')}</b></span></div>`;
  }

  function renderFidelity() {
    $('#fidelityChoices').innerHTML = D.fidelity.map(item => `
      <label class="choice-card ${state.fidelity === item.id ? 'selected' : ''}" data-fidelity="${item.id}">
        <input type="radio" name="fidelity" value="${item.id}" ${state.fidelity === item.id ? 'checked' : ''}>
        <b>${escapeHtml(langText(item.title, item.titleAr))}</b>
        <small>${escapeHtml(langText(item.desc, item.descAr))}</small>
      </label>`).join('');
  }

  function renderFeatureGroup(selector, items) {
    $(selector).innerHTML = items.map(([id, en, ar]) => `
      <label class="check-item">
        <input type="checkbox" value="${id}">
        <span>${escapeHtml(langText(en, ar))}</span>
      </label>`).join('');
  }

  function renderQuickTemplates() {
    $('#quickTemplates').innerHTML = [...D.templates].sort((a,b) => b.popularity - a.popularity).slice(0, 4).map(template => `
      <button class="quick-item" data-template="${template.id}" type="button">
        <span class="q-icon">${template.icon}</span>
        <div><b>${escapeHtml(langText(template.title, template.titleAr))}</b><small>${escapeHtml(langText(template.category, categoryAr(template.category)))}</small></div>
      </button>`).join('');
  }

  function renderTemplates() {
    const categorySelect = $('#templateCategory');
    const categories = [...new Set(D.templates.map(t => t.category))];
    const previous = categorySelect.value || 'all';
    categorySelect.innerHTML = `<option value="all">${settings.language === 'ar' ? 'كل التصنيفات' : 'All categories'}</option>` +
      categories.map(c => `<option value="${c}">${escapeHtml(langText(c, categoryAr(c)))}</option>`).join('');
    categorySelect.value = categories.includes(previous) ? previous : 'all';

    const query = normalizeSemanticText($('#templateSearch').value || '');
    const category = categorySelect.value;
    const favorites = getStoredArray('favorites');
    const favoriteOnly = $('#favoriteOnly').checked;
    const list = D.templates.filter(t => {
      const haystack = normalizeSemanticText(`${t.title} ${t.titleAr} ${t.desc} ${t.descAr} ${t.category}`);
      return (category === 'all' || t.category === category) && (!query || haystack.includes(query)) && (!favoriteOnly || favorites.includes(t.id));
    }).sort((a,b) => b.popularity - a.popularity);

    $('#templateGrid').innerHTML = list.length ? list.map(template => `
      <article class="template-card panel">
        <div class="template-top">
          <span class="template-icon">${template.icon}</span>
          <button aria-label="${favorites.includes(template.id) ? langText('Remove from favorites','إزالة من المفضلة') : langText('Add to favorites','إضافة إلى المفضلة')}" class="favorite-btn ${favorites.includes(template.id) ? 'active' : ''}" data-favorite="${template.id}" type="button">★</button>
        </div>
        <span class="template-category">${escapeHtml(langText(template.category, categoryAr(template.category)))}</span>
        <h3>${escapeHtml(langText(template.title, template.titleAr))}</h3>
        <p>${escapeHtml(langText(template.desc, template.descAr))}</p>
        <footer class="template-footer"><small>${template.popularity}% ${settings.language === 'ar' ? 'تطابق' : 'match'}</small><button class="primary-btn" data-template="${template.id}" type="button">${settings.language === 'ar' ? 'استخدام القالب' : 'Use template'}</button></footer>
      </article>`).join('') : `<div class="empty-state">${settings.language === 'ar' ? 'لا توجد قوالب مطابقة.' : 'No matching templates.'}</div>`;
  }

  function categoryAr(category) {
    return ({ Word:'Word', Study:'مذاكرة', Assessment:'أسئلة', Presentation:'عروض', Language:'لغة', Editing:'تحرير', Visual:'رسومات', Social:'محتوى اجتماعي' })[category] || category;
  }

  function bindEvents() {
    const on = (selector, type, handler, options) => {
      const element = $(selector);
      if (element) element.addEventListener(type, handler, options);
    };
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleShortcuts);
    document.addEventListener('input', handleBuilderChange, true);
    document.addEventListener('change', handleBuilderChange, true);

    on('#menuBtn','click',openSidebar);
    on('#sidebarClose','click',closeSidebar);
    on('#sidebarOverlay','click',closeSidebar);
    on('#languageBtn','click',toggleLanguage);
    on('#themeBtn','click',toggleThemePopover);
    on('#newPromptBtn','click',() => newPrompt(true));
    on('#resetBuilderBtn','click',() => newPrompt(true));
    on('#undoBuilderBtn','click',undoBuilder);
    on('#redoBuilderBtn','click',redoBuilder);
    on('#previousStepBtn','click',() => navigateStep(-1));
    on('#nextStepBtn','click',() => navigateStep(1));
    on('#onboardingBtn','click',() => showOnboarding(true));
    on('#loadExampleBtn','click',() => applyTemplate('fixed-reference-enhanced'));
    on('#saveProjectBtn','click',saveProject);
    on('#saveProjectTopBtn','click',saveProject);
    on('#refreshPromptBtn','click',() => { compilePrompt(); saveDraft(); toast(langText('Prompt refreshed.','تم تحديث الـPrompt.'), 'success'); });
    on('#copyPromptBtn','click',copyPrompt);
    on('#downloadPromptBtn','click',downloadPrompt);
    on('#templateSearch','input',renderTemplates);
    on('#templateCategory','change',renderTemplates);
    on('#favoriteOnly','change',renderTemplates);
    on('#newSnippetBtn','click',resetSnippetEditor);
    on('#saveSnippetBtn','click',saveSnippet);
    on('#cancelSnippetBtn','click',resetSnippetEditor);
    on('#projectSearch','input',renderProjects);
    on('#projectSort','change',renderProjects);
    on('#exportBackupBtn','click',exportBackup);
    on('#importBackupInput','change',importBackup);
    on('#printGuideBtn','click',() => window.print());
    on('#saveSettingsBtn','click',saveSettings);
    on('#settingFontScale','input',() => { const label = $('#fontScaleLabel'); if (label) label.textContent = `${$('#settingFontScale').value}%`; });
    on('#downloadDataBtn','click',exportBackup);
    on('#clearDataBtn','click',clearAllData);
    on('#runDiagnosticsBtn','click',() => renderDiagnostics(true));
    on('#repairStorageBtn','click',repairStorage);
    on('#resetSettingsBtn','click',resetSettings);
    on('#clearCacheBtn','click',clearCache);
    on('#downloadLogBtn','click',downloadDiagnosticLog);
    on('#installAppBtn','click',installApp);
    on('#applyUpdateBtn','click',applyAppUpdate);
    on('#globalSearch','focus',openCommandPalette);
    on('#globalSearch','click',openCommandPalette);
    on('#commandInput','input',() => { state.commandIndex = 0; renderCommands($('#commandInput').value); });
    on('#commandPalette','click',event => { if (event.target.id === 'commandPalette') closeCommandPalette(); });
    on('#modalCloseBtn','click',closeModal);
    on('#modalBackdrop','click',event => { if (event.target.id === 'modalBackdrop') closeModal(); });
    window.addEventListener('beforeunload', () => { if (settings.autosave && state.dirty) saveDraft(); });
    window.addEventListener('storage', event => {
      if (!event.key?.startsWith(PREFIX)) return;
      const key = event.key.slice(PREFIX.length);
      storage.invalidate(key);
      if (key === 'settings') {
        settings = sanitizeSettings(storage.get('settings', {}));
        applySettings(false);
      } else if (!state.dirty || ['projects','snippets','favorites','lastScore'].includes(key)) {
        refreshStoredViews();
      }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && settings.autosave && state.dirty) saveDraft(); });
  }

  function handleDocumentClick(event) {
    const themeChoice = event.target.closest('[data-ui-theme]');
    if (themeChoice) return selectUiTheme(themeChoice.dataset.uiTheme);
    const colorMode = event.target.closest('[data-color-mode]');
    if (colorMode) return selectColorMode(colorMode.dataset.colorMode);
    if (!event.target.closest('#themePopover') && !event.target.closest('#themeBtn')) closeThemePopover();
    const nav = event.target.closest('[data-view]');
    if (nav) return showView(nav.dataset.view);
    const viewLink = event.target.closest('[data-view-link]');
    if (viewLink) return showView(viewLink.dataset.viewLink);
    const template = event.target.closest('[data-template]');
    if (template) return applyTemplate(template.dataset.template);
    const favorite = event.target.closest('[data-favorite]');
    if (favorite) return toggleFavorite(favorite.dataset.favorite);
    const builderTab = event.target.closest('[data-step]');
    if (builderTab) return setStep(Number(builderTab.dataset.step));
    const fidelity = event.target.closest('[data-fidelity]');
    if (fidelity) return selectFidelity(fidelity.dataset.fidelity);
    const insight = event.target.closest('[data-insight]');
    if (insight) return setInsight(insight.dataset.insight);
    const outputMode = event.target.closest('[data-output-mode]');
    if (outputMode) return setOutputMode(outputMode.dataset.outputMode);
    const toggleGroup = event.target.closest('[data-toggle-group]');
    if (toggleGroup) return toggleUsefulGroup(toggleGroup.dataset.toggleGroup);
    const snippetAction = event.target.closest('[data-snippet-action]');
    if (snippetAction) return handleSnippetAction(snippetAction.dataset.snippetAction, snippetAction.dataset.id);
    const projectAction = event.target.closest('[data-project-action]');
    if (projectAction) return handleProjectAction(projectAction.dataset.projectAction, projectAction.dataset.id);
    const versionAction = event.target.closest('[data-version-action]');
    if (versionAction) return handleVersionAction(versionAction.dataset.versionAction, versionAction.dataset.projectId, versionAction.dataset.versionId);
    const guide = event.target.closest('[data-guide]');
    if (guide) return openGuide(guide.dataset.guide);
    const command = event.target.closest('[data-command]');
    if (command) return executeCommand(command.dataset.command, command.dataset.value);
    const onboarding = event.target.closest('[data-onboarding-action]');
    if (onboarding) return handleOnboardingAction(onboarding.dataset.onboardingAction);
  }

  function handleBuilderChange(event) {
    if (!event.target.closest('.builder-form')) return;
    if (event.target.matches('input,select,textarea')) {
      if (event.target.id === 'targetModel') renderReasoningOptions(event.target.value);
      if (['targetModel','reasoningEffort','executionMode','customModelName'].includes(event.target.id)) updateModelProfileCard();
      updateSaveState(true);
      updateBuilderProgress();
      scheduleHistoryCapture();
      scheduleCompile();
    }
  }

  function handleShortcuts(event) {
    const target = event.target;
    const typing = ['INPUT','TEXTAREA','SELECT'].includes(target.tagName);
    const activeDialog = $('#modalBackdrop').classList.contains('open') ? $('.modal', $('#modalBackdrop')) : $('#commandPalette').classList.contains('open') ? $('.palette-dialog', $('#commandPalette')) : null;
    if (event.key === 'Tab' && activeDialog) return trapFocus(activeDialog, event);
    if (event.key === 'Escape') {
      closeCommandPalette();
      closeModal();
      closeSidebar();
      closeThemePopover();
      return;
    }
    if (target.matches('.builder-tab') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      const tabs = $$('.builder-tab');
      const current = tabs.indexOf(target);
      const rtl = document.documentElement.dir === 'rtl';
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? (rtl ? -1 : 1) : (rtl ? 1 : -1)) + tabs.length) % tabs.length;
      setStep(nextIndex + 1);
      tabs[nextIndex]?.focus();
      return;
    }
    if (!settings.shortcuts) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      return openCommandPalette();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      return event.shiftKey ? redoBuilder() : undoBuilder();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      return redoBuilder();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      return saveProject();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      compilePrompt();
      showView('builder');
      return toast(langText('Prompt refreshed.','تم تحديث الـPrompt.'), 'success');
    }
    if (!typing && event.key.toLowerCase() === 'g') showView('builder');
    if ($('#commandPalette').classList.contains('open')) handleCommandKeyboard(event);
  }

  function handleCommandKeyboard(event) {
    const items = $$('.command-item', $('#commandResults'));
    if (!items.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); state.commandIndex = Math.min(items.length - 1, state.commandIndex + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); state.commandIndex = Math.max(0, state.commandIndex - 1); }
    else if (event.key === 'Enter') { event.preventDefault(); items[state.commandIndex]?.click(); return; }
    else return;
    items.forEach((item, i) => {
      const active = i === state.commandIndex;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    $('#commandInput')?.setAttribute('aria-activedescendant', items[state.commandIndex]?.id || '');
    items[state.commandIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function openSidebar() {
    $('#sidebar').classList.add('open');
    $('#sidebarOverlay').classList.add('open');
    document.body.classList.add('menu-open');
  }

  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#sidebarOverlay').classList.remove('open');
    document.body.classList.remove('menu-open');
  }

  function showView(name, updateLocation = true) {
    const target = $(`#view-${name}`);
    if (!target) return;
    $$('.view').forEach(view => view.classList.toggle('active', view === target));
    $$('.nav-item').forEach(item => {
      const active = item.dataset.view === name;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current');
    });
    closeSidebar();
    if (name === 'projects') renderProjects();
    if (name === 'templates') renderTemplates();
    if (name === 'snippets') renderSnippets();
    if (name === 'guide') renderGuide();
    if (updateLocation && location.hash !== `#/${name}`) history.replaceState(null, '', `#/${name}`);
    const currentLabel = $(`.nav-item[data-view="${name}"] span:nth-child(2)`)?.textContent?.trim();
    document.title = currentLabel ? `${currentLabel} · PromptForge Nexus Studio 5` : 'PromptForge Nexus Studio 5';
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function setStep(step) {
    state.step = Math.max(1, Math.min(5, step));
    $$('.builder-tab').forEach(tab => {
      const active = Number(tab.dataset.step) === state.step;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
    $$('.step-panel').forEach(panel => panel.classList.toggle('active', Number(panel.dataset.panel) === state.step));
    const previous = $('#previousStepBtn');
    const next = $('#nextStepBtn');
    if (previous) previous.disabled = state.step === 1;
    if (next) {
      const label = $('[data-i18n]', next);
      if (label) label.textContent = state.step === 5 ? langText('Review output','راجع الناتج') : langText('Next','التالي');
      next.dataset.final = state.step === 5 ? 'true' : 'false';
    }
    const position = $('#stepPosition');
    if (position) position.textContent = langText(`Step ${state.step} of 5`, `الخطوة ${state.step} من 5`);
    updateBuilderProgress();
  }

  function navigateStep(direction) {
    if (direction > 0 && state.step === 5) {
      compilePrompt();
      setInsight(state.conflicts.some(item => item.level === 'danger') ? 'conflicts' : 'prompt');
      $('.live-panel')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    setStep(state.step + direction);
    const heading = $(`.step-panel[data-panel="${state.step}"] .section-title h2`);
    heading?.setAttribute('tabindex','-1');
    heading?.focus({ preventScroll:true });
  }

  function calculateStepCompletion(form) {
    const contentCount = form.features.filter(id => D.contentRules.some(item => item[0] === id)).length;
    const documentCount = form.features.filter(id => D.documentFeatures.some(item => item[0] === id)).length;
    const learningCount = form.features.filter(id => D.boxFeatures.some(item => item[0] === id) || D.visualFeatures.some(item => item[0] === id) || D.questionFeatures.some(item => item[0] === id)).length;
    const prohibitedCount = form.features.filter(id => D.prohibitedRules.some(item => item[0] === id)).length;
    const customModelReady = form.targetModel !== 'custom-model' || Boolean(form.customModelName);
    const educationalTask = ['study-guide','question-bank','lecture-questions','bilingual','educational-visuals'].includes(form.taskType);
    return [
      Math.round((customModelReady ? 15 : 0) + (form.projectTitle ? 20 : 0) + (form.primaryGoal ? 40 : 0) + (form.audience ? 25 : 0)),
      Math.min(100, 35 + Math.min(45, contentCount * 9) + (form.organization ? 10 : 0) + (form.languageMode ? 10 : 0)),
      form.outputFormat === 'PROMPT' ? 100 : Math.min(100, 45 + Math.min(40, documentCount * 10) + (form.fontFamily ? 8 : 0) + (form.margins ? 7 : 0)),
      educationalTask ? Math.min(100, learningCount * 16 + (questionsSelected(form) && form.questionCount > 0 ? 20 : 0)) : 100,
      Math.min(100, Math.min(40, prohibitedCount * 10) + (form.qaChecklist ? 20 : 0) + (form.sourceOnly ? 15 : 0) + (form.documentLog ? 10 : 0) + (form.customRules.length ? 15 : 0))
    ].map(value => Math.max(0, Math.min(100, value)));
  }

  function updateBuilderProgress(form = null) {
    if (!$('#builderProgressBar') || !$('#taskType')) return;
    const current = form || collectForm();
    const completion = calculateStepCompletion(current);
    const overall = Math.round(completion.reduce((sum, value) => sum + value, 0) / completion.length);
    $('#builderProgressBar').style.width = `${overall}%`;
    $('#builderProgressText').textContent = `${overall}%`;
    $('#builderProgressBar').parentElement?.setAttribute('aria-valuenow', String(overall));
    $$('.builder-tab').forEach((tab, index) => {
      const value = completion[index] || 0;
      tab.classList.toggle('complete', value >= 80);
      tab.classList.toggle('needs-attention', value < 50);
      tab.setAttribute('aria-label', `${tab.textContent.trim()} — ${value}%`);
    });
    const hintsAr = ['أكمل عنوان المشروع والهدف والجمهور.','اختر ثلاث قواعد محتوى على الأقل.','حدد خصائص الملف والتصميم المطلوبة.','أضف عناصر التعليم أو المراجعة المناسبة.','راجع الممنوعات وقواعد الجودة النهائية.'];
    const hintsEn = ['Complete the title, goal and audience.','Select at least three content rules.','Define the required document and design features.','Add the relevant learning or revision elements.','Review prohibited actions and final QA rules.'];
    const firstIncomplete = completion.findIndex(value => value < 80);
    const hint = $('#builderProgressHint');
    if (hint) hint.textContent = firstIncomplete === -1 ? langText('Setup is complete. Review the live output.','الإعداد مكتمل. راجع الناتج المباشر.') : (settings.language === 'ar' ? hintsAr[firstIncomplete] : hintsEn[firstIncomplete]);
  }

  function updatePromptStats(prompt = '') {
    const normalized = String(prompt).trim();
    const words = normalized ? normalized.split(/\s+/u).length : 0;
    const characters = normalized.length;
    const arabicCharacters = (normalized.match(/[\u0600-\u06ff]/g) || []).length;
    const estimatedTokens = Math.max(0, Math.round((characters - arabicCharacters) / 4 + arabicCharacters / 2.2));
    const stats = $('#promptStats');
    if (!stats) return;
    stats.textContent = settings.language === 'ar'
      ? `${words.toLocaleString('ar-EG')} كلمة · ≈${estimatedTokens.toLocaleString('ar-EG')} رمز · ${characters.toLocaleString('ar-EG')} حرف`
      : `${words.toLocaleString('en-US')} words · ≈${estimatedTokens.toLocaleString('en-US')} tokens · ${characters.toLocaleString('en-US')} chars`;
  }

  function setInsight(name) {
    state.insight = name;
    $$('.insight-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.insight === name));
    $$('.insight-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.insightPanel === name));
  }

  function setOutputMode(mode) {
    if (stableStringify(collectForm()) !== state.lastCompiledHash) compilePrompt();
    state.outputMode = mode;
    $$('[data-output-mode]').forEach(button => button.classList.toggle('active', button.dataset.outputMode === mode));
    updateOutput();
  }

  function selectFidelity(id) {
    state.fidelity = id;
    $$('.choice-card').forEach(card => {
      const selected = card.dataset.fidelity === id;
      card.classList.toggle('selected', selected);
      const input = $('input', card);
      if (input) input.checked = selected;
    });
    scheduleCompile();
  }

  function scheduleCompile() {
    clearTimeout(state.compileTimer);
    clearTimeout(state.autosaveTimer);
    if (settings.livePreview) {
      state.compileTimer = setTimeout(compilePrompt, 140);
    }
    if (settings.autosave) {
      state.autosaveTimer = setTimeout(saveDraft, 650);
    }
  }

  function featureInputs() {
    return $$('#contentRules input[type="checkbox"], #documentFeatures input[type="checkbox"], #boxFeatures input[type="checkbox"], #visualFeatures input[type="checkbox"], #questionFeatures input[type="checkbox"], #prohibitedRules input[type="checkbox"]');
  }

  function collectForm() {
    const features = featureInputs().filter(input => input.checked).map(input => input.value);
    return {
      targetModel: $('#targetModel').value,
      customModelName: $('#customModelName').value.trim(),
      reasoningEffort: $('#reasoningEffort').value,
      executionMode: $('#executionMode').value,
      taskType: $('#taskType').value,
      outputFormat: $('#outputFormat').value,
      sourceType: $('#sourceType').value,
      promptDepth: $('#promptDepth').value,
      projectTitle: $('#projectTitle').value.trim(),
      primaryGoal: $('#primaryGoal').value.trim(),
      audience: $('#audience').value.trim(),
      fidelity: state.fidelity,
      languageMode: $('#languageMode').value,
      organization: $('#organization').value,
      pageSize: $('#pageSize').value,
      orientation: $('#orientation').value,
      margins: $('#margins').value.trim(),
      designTheme: $('#designTheme').value,
      fontFamily: $('#fontFamily').value.trim(),
      bodySize: $('#bodySize').value.trim(),
      colors: { primary: $('#primaryColor').value, navy: $('#navyColor').value, accent: $('#accentColor').value, light: $('#lightColor').value },
      features,
      questionCount: Math.max(0, Number($('#questionCount').value) || 0),
      difficulty: $('#difficulty').value,
      answerMode: $('#answerMode').value,
      customRules: $('#customRules').value.split(/\n+/).map(line => line.trim()).filter(Boolean),
      qaChecklist: $('#qaChecklist').checked,
      sourceOnly: $('#sourceOnly').checked,
      documentLog: $('#documentLog').checked
    };
  }

  function compilePrompt() {
    const form = collectForm();
    const sections = buildSections(form);
    const filteredSections = Object.entries(sections).filter(([, lines]) => Array.isArray(lines) && lines.length);
    const prompt = filteredSections.map(([title, lines]) => `${title}\n${lines.map(line => `- ${line}`).join('\n')}`).join('\n\n');
    const markdown = filteredSections.map(([title, lines]) => `## ${title}\n${lines.map(line => `- ${line}`).join('\n')}`).join('\n\n');
    const json = { app: 'PromptForge Nexus Studio by Shark', version: APP_VERSION, generatedAt: new Date().toISOString(), project: form, sections };

    state.conflicts = detectConflicts(form);
    state.suggestions = detectSuggestions(form);
    const qualityResult = calculateQuality(form, state.conflicts, state.suggestions);
    state.quality = qualityResult.total;
    state.qualityBreakdown = qualityResult.breakdown;
    state.generated = { prompt, markdown, json };
    state.lastCompiledHash = stableStringify(form);

    $('#qualityScore').textContent = state.quality;
    $('#conflictCount').textContent = state.conflicts.length;
    $('#suggestionCount').textContent = state.suggestions.length;
    renderAnalysisLists();
    renderQualityBreakdown();
    updateOutput();
    updatePromptStats(prompt);
    updateBuilderProgress(form);
    if (storage.get('lastScore', null) !== state.quality) storage.set('lastScore', state.quality);
    return state.generated;
  }

  function buildSections(form) {
    const featureLines = ids => ids.filter(id => form.features.includes(id)).map(id => featureLabels[id]?.en || id);
    const fidelityItem = D.fidelity.find(item => item.id === form.fidelity);
    const taskName = taskLabels[form.taskType]?.en || 'Custom task';
    const model = selectedModelProfile(form);
    const execution = executionLabels[form.executionMode] || executionLabels['document-production'];
    const modelName = model.id === 'custom-model' ? (form.customModelName || 'Custom model') : model.name;
    const modelId = model.id === 'custom-model' ? (form.customModelName || 'user-defined') : (model.modelId || 'provider-neutral');
    const sourceName = ({ lecture:'lecture material or notes', pdf:'PDF file', slides:'presentation slides', scans:'scanned pages', 'word-reference':'source material plus an approved Word reference', discussion:'discussion and comments', none:'the instructions supplied by the user' })[form.sourceType] || form.sourceType;
    const languageLine = ({ preserve:'Preserve the source language.', english:'Write in clear professional English.', arabic:'Write in clear professional Arabic.', egyptian:'Write in natural professional Egyptian Arabic.', bilingual:'Show the original English first, then place an accurate Egyptian Arabic explanation directly underneath.' })[form.languageMode];
    const orgLine = ({ preserve:'Preserve the original order and structure.', chapter:'Organize by chapters, sections, and subsections.', topic:'Organize by topics and subtopics.', lecture:'Organize by lecture number and main topic.', 'line-by-line':'Use a line-by-line bilingual structure.', reference:'Follow the approved Word reference structure and identity.', workbook:'Use a reusable educational workbook structure.', 'section-slides':'Organize into logical presentation sections and balanced slides.', 'social-post':'Use a natural social-post structure without headings or lists.' })[form.organization];

    const content = featureLines(D.contentRules.map(item => item[0]));
    const document = featureLines(D.documentFeatures.map(item => item[0]));
    const boxes = featureLines(D.boxFeatures.map(item => item[0]));
    const visuals = featureLines(D.visualFeatures.map(item => item[0]));
    const questions = featureLines(D.questionFeatures.map(item => item[0]));
    const prohibited = featureLines(D.prohibitedRules.map(item => item[0]));

    const sections = {
      'SYSTEM ROLE': [roles[form.taskType]],
      'TARGET MODEL AND EXECUTION PROFILE': [`Provider: ${model.provider}.`, `Target model: ${modelName}.`, `Model identifier: ${modelId}.`, `Reasoning level: ${form.reasoningEffort}.`, `Execution mode: ${execution.name}.`, execution.desc, ...model.promptRules],
      'INPUTS': [`Primary source: ${sourceName}.`, form.sourceType === 'word-reference' ? 'Treat the approved Word document as the mandatory visual and structural reference.' : form.sourceType === 'none' ? 'Use the supplied instructions as the complete working brief.' : 'Read the complete source before producing the final output.'],
      'PRIMARY OBJECTIVE': [form.primaryGoal || `Complete the ${taskName} task professionally and accurately.`, form.projectTitle ? `Project title: ${form.projectTitle}.` : '', form.audience ? `Target audience or use: ${form.audience}.` : ''].filter(Boolean),
      'FINAL OUTPUT': [`Target deliverable: ${form.outputFormat}.`, form.outputFormat === 'DOCX' ? 'Deliver a fully editable Microsoft Word document compatible with Word 2019, 2021, and Microsoft 365.' : '', form.outputFormat === 'PPTX' ? 'Deliver a fully editable Microsoft PowerPoint presentation with balanced, readable slides.' : '', form.outputFormat === 'PDF' ? 'Deliver a clean, print-ready PDF while preserving selectable text and document quality whenever possible.' : ''].filter(Boolean),
      'CONTENT FIDELITY': [`Mode: ${fidelityItem?.title || form.fidelity}.`, fidelityItem?.desc || '', ...content].filter(Boolean),
      'LANGUAGE AND ORGANIZATION': [languageLine, orgLine].filter(Boolean),
      'DOCUMENT SPECIFICATIONS': form.outputFormat === 'PROMPT' ? [] : [`Page or canvas size: ${form.pageSize}.`, `Orientation: ${form.orientation}.`, `Margins: ${form.margins || 'professional balanced margins'}.`, `Typography: ${form.fontFamily || 'professional compatible fonts'}; body size ${form.bodySize || 'appropriate for the format'}.`, `Visual theme: ${form.designTheme}.`, `Color palette: primary ${form.colors.primary}, navy ${form.colors.navy}, accent ${form.colors.accent}, light background ${form.colors.light}.`, ...document],
      'LEARNING AND VISUAL SYSTEM': [...boxes, ...visuals],
      'QUESTION GENERATION': questions.length ? [...questions, `Create approximately ${Math.max(1, form.questionCount || 5)} questions for each major topic where appropriate.`, `Difficulty: ${form.difficulty}.`, `Answer mode: ${form.answerMode}.`, 'Base every question directly on the supplied source material.'] : [],
      'CUSTOM INSTRUCTIONS': [...form.customRules],
      'PROHIBITED ACTIONS': [...prohibited, form.sourceOnly ? 'Use source-supported factual content only. Do not introduce unsupported external facts.' : '', form.documentLog ? 'If source content is unclear, cropped, unreadable, or ambiguous, log the issue instead of guessing.' : ''].filter(Boolean),
      'EXECUTION WORKFLOW': form.promptDepth === 'maximum' ? ['Analyze the complete input before drafting.', 'Resolve instruction conflicts in favor of content integrity and the requested final deliverable.', 'Build the output in logical stages, then perform a separate verification pass.', 'When a requirement cannot be completed from the supplied source, state the limitation clearly instead of inventing content.'] : [],
      'ACCEPTANCE CRITERIA': form.promptDepth === 'maximum' ? ['Every requested section is present and logically ordered.', 'No source-supported definition, formula, table, example, date, name, or reference is lost.', 'All editable elements remain editable in the requested format.', 'No content is cut off, duplicated accidentally, or visually overcrowded.'] : [],
      'QUALITY ASSURANCE': form.qaChecklist ? ['Before finalizing, verify content completeness, meaning fidelity, formula and table integrity, heading consistency, editability, visual balance, page or slide overflow, print readiness, and compatibility with the requested output format.', 'Deliver the result only after all applicable checks pass.'] : [],
      'FINAL STANDARD': ['The final result must look deliberate, professional, clean, consistent, and ready for real academic or professional use.', 'Avoid generic, cluttered, mechanically repetitive, or obviously AI-generated presentation.']
    };

    if (settings.dedupe) {
      Object.keys(sections).forEach(key => { sections[key] = dedupeLines(sections[key]); });
    }
    if (form.promptDepth === 'compact') {
      return Object.fromEntries(Object.entries(sections).filter(([name]) => ['SYSTEM ROLE','TARGET MODEL AND EXECUTION PROFILE','PRIMARY OBJECTIVE','FINAL OUTPUT','CONTENT FIDELITY','LANGUAGE AND ORGANIZATION','PROHIBITED ACTIONS','QUALITY ASSURANCE'].includes(name)));
    }
    return sections;
  }

  function dedupeLines(lines) {
    const seen = new Set();
    return lines.filter(line => {
      const normalized = String(line).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }

  function detectConflicts(form) {
    const conflicts = [];
    const raw = `${form.primaryGoal} ${form.customRules.join(' ')}`;
    const combined = normalizeSemanticText(raw);
    const has = id => form.features.includes(id);
    const add = (level, title, detail, fields = []) => {
      if (!conflicts.some(item => item.title === title)) conflicts.push({ level, title, detail, fields });
    };
    const includesAny = terms => terms.some(term => combined.includes(normalizeSemanticText(term)));
    const pair = (positive, negative) => includesAny(positive) && includesAny(negative);

    if (form.fidelity === 'strict' && form.taskType === 'egyptian-translation') add('danger', 'Strict preservation vs translation', 'Translation changes wording. Keep the source beside the translation or change fidelity to meaning-preserving rewrite.', ['fidelity','taskType']);
    if (form.fidelity === 'strict' && includesAny(['summarize','summarise','condense','rewrite','paraphrase','simplify','لخص','تلخيص','اختصر','إعادة صياغة','اعد صياغة','بسط'])) add('danger', 'Strict preservation vs rewriting', 'The instructions require exact preservation and rewriting at the same time. Separate the rewritten material from the preserved source.', ['fidelity','primaryGoal','customRules']);
    if (form.fidelity === 'strict' && form.languageMode === 'egyptian') add('danger', 'Strict wording vs Egyptian Arabic', 'Choose source-language preservation or use a translation-compatible fidelity mode.', ['fidelity','languageMode']);
    if (form.outputFormat === 'PPTX' && ['word-template','strict-word'].includes(form.taskType)) add('danger', 'Task and output mismatch', 'A Word-focused task conflicts with PowerPoint output. Change the task or requested deliverable.', ['taskType','outputFormat']);
    if (form.outputFormat === 'DOCX' && form.taskType === 'presentation') add('warning', 'Presentation task with DOCX output', 'Use PPTX unless the intended result is only a slide script or outline.', ['taskType','outputFormat']);
    if (has('no-omission') && includesAny(['summary only','one page only','one-page only','remove details','shorten drastically','ملخص فقط','صفحة واحدة فقط','احذف التفاصيل','اختصر بشدة'])) add('danger', 'No omission vs aggressive shortening', 'Preserving everything cannot coexist with a drastically shorter output. Put the summary in an additional section.', ['features','primaryGoal','customRules']);
    if ((has('no-external-facts') || form.sourceOnly) && includesAny(['own expertise','external research','add facts','from the internet','web research','من خبرتك','بحث خارجي','أضف معلومات','من الإنترنت','من الانترنت'])) add('danger', 'Source-only vs external additions', 'Remove external research or explicitly allow labelled additions outside the source.', ['sourceOnly','features','customRules']);
    if (pair(['do not change','preserve exactly','no rewriting','لا تغير','كما هو'], ['improve weak explanations','correct the explanation','expand explanations','حسن الشرح','وسع الشرح'])) add('danger', 'No changes vs content improvement', 'Improving explanations changes content. Limit changes to labelled additions or permit controlled enhancement.', ['primaryGoal','customRules']);
    if (pair(['source only','use only the source','المصدر فقط'], ['verify online','search the web','external sources','تحقق من الانترنت','ابحث على الانترنت'])) add('danger', 'Source-only vs online verification', 'Choose one evidence policy or clearly separate source content from verified external notes.', ['sourceOnly','customRules']);
    if (pair(['keep all pages','preserve every page','لا تحذف اي صفحة'], ['maximum 10 pages','no more than 10 pages','بحد اقصى 10 صفحات'])) add('danger', 'Full retention vs page limit', 'A strict page cap may force omissions. Remove the cap or allow appendices/condensed layout.', ['customRules']);
    if (pair(['do not summarize','no summarization','بدون تلخيص'], ['concise','brief','summary','مختصر','ملخص'])) add('warning', 'No summarization vs concise output', 'Clarify whether concise formatting is allowed without removing content.', ['primaryGoal','customRules']);
    if (pair(['do not ask questions','ابدأ مباشرة','لا تسأل'], ['ask for missing information','request clarification','اسأل عن المعلومات الناقصة'])) add('danger', 'Execution instruction conflict', 'The model cannot both avoid questions and request missing information. Define a fallback rule for missing data.', ['customRules']);
    if (form.fidelity === 'enhance' && form.sourceOnly && !has('study-aid-box')) add('warning', 'Enhancement without separation', 'Enable a Study Aid box so added clarification is visibly separated from source content.', ['fidelity','sourceOnly','features']);
    if (form.taskType === 'highlight-only' && form.fidelity !== 'strict') add('warning', 'Highlighting should preserve content', 'Highlight-only tasks normally require strict preservation.', ['taskType','fidelity']);
    if (questionsSelected(form) && form.fidelity === 'strict' && !includesAny(['separate','appendix','additional','منفصل','ملحق','إضافي','اضافي'])) add('warning', 'New questions with strict preservation', 'State that generated questions are additional and never replace original content.', ['features','fidelity']);
    if (form.outputFormat === 'PDF' && has('editable-elements')) add('warning', 'PDF editability limitation', 'Use DOCX when full editability is required.', ['outputFormat','features']);
    return conflicts;
  }

  function normalizeSemanticText(value) {
    return String(value || '').normalize('NFKC').toLocaleLowerCase()
      .replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  function detectSuggestions(form) {
    const suggestions = [];
    const has = id => form.features.includes(id);
    const add = (title, detail) => suggestions.push({ level:'neutral', title, detail });
    if (form.targetModel === 'custom-model' && !form.customModelName) add('Name the custom model', 'Enter the exact provider or deployment name so the prompt can identify its target.');
    if (!form.projectTitle) add('Add a project title', 'A specific title improves the generated objective and exported filename.');
    if (!form.primaryGoal) add('Describe the final result', 'State exactly what should be created and what makes it successful.');
    if (!form.audience) add('Define the audience', 'Specify students, teachers, clients, readers, or the intended use.');
    if (form.features.filter(id => D.contentRules.some(item => item[0] === id)).length < 3) add('Strengthen content rules', 'Select the definitions, formulas, tables, examples, or references that must be preserved.');
    if (form.outputFormat !== 'PROMPT' && form.features.filter(id => D.documentFeatures.some(item => item[0] === id)).length < 2) add('Add document features', 'Choose page numbering, header/footer, editability, TOC, or print-ready layout.');
    if (['study-guide','lecture-questions','question-bank'].includes(form.taskType) && !has('takeaways-box') && !questionsSelected(form)) add('Add revision support', 'Key Takeaways or practice questions make the study output more useful.');
    if (['study-guide','question-bank','lecture-questions'].includes(form.taskType) && !form.sourceOnly) add('Restrict facts to the source', 'Source-only mode reduces unsupported academic additions.');
    if (!form.qaChecklist) add('Enable quality assurance', 'A final QA checklist catches omissions, formatting problems, and output errors.');
    if (!form.features.some(id => D.prohibitedRules.some(item => item[0] === id))) add('Define prohibited actions', 'Add at least one clear “do not” rule to prevent unwanted output.');
    if (form.fidelity === 'enhance' && !has('study-aid-box')) add('Label added enhancements', 'Use a Study Aid box to keep original and added content separate.');
    return suggestions;
  }

  function questionsSelected(form) { return form.features.some(id => D.questionFeatures.some(item => item[0] === id)); }

  function calculateQuality(form, conflicts, suggestions) {
    const words = normalizeSemanticText(form.primaryGoal).split(' ').filter(Boolean);
    const uniqueRatio = words.length ? new Set(words).size / words.length : 0;
    const vagueTerms = ['professional','high quality','best','good','perfect','ممتاز','احترافي','جوده عاليه','افضل شكل'];
    const measurableTerms = ['page','pages','section','table','word','slide','questions','a4','docx','pdf','pptx','صفحه','قسم','جدول','كلمه','سلايد','سؤال'];
    const goalText = normalizeSemanticText(form.primaryGoal);
    const specificityHits = measurableTerms.filter(term => goalText.includes(normalizeSemanticText(term))).length;
    const vagueHits = vagueTerms.filter(term => goalText.includes(normalizeSemanticText(term))).length;
    const contentRuleCount = form.features.filter(id => D.contentRules.some(item => item[0] === id)).length;
    const prohibitedCount = form.features.filter(id => D.prohibitedRules.some(item => item[0] === id)).length;

    const completeness = Math.min(100, Math.round(
      (form.projectTitle ? 15 : 0) + (form.primaryGoal ? 35 : 0) + (form.audience ? 15 : 0) +
      Math.min(20, contentRuleCount * 5) + (form.qaChecklist ? 8 : 0) + (prohibitedCount ? 7 : 0)
    ));
    const clarity = Math.max(0, Math.min(100, Math.round(
      (words.length >= 12 ? 45 : words.length * 3) + Math.min(25, specificityHits * 8) +
      (form.customRules.length ? Math.min(20, form.customRules.length * 4) : 0) +
      (uniqueRatio >= .65 ? 10 : 3) - vagueHits * 8
    )));
    const consistency = Math.max(0, Math.min(100, 100 - conflicts.filter(c => c.level === 'danger').length * 28 - conflicts.filter(c => c.level === 'warning').length * 11));
    const specificity = Math.max(0, Math.min(100, Math.round(
      Math.min(40, specificityHits * 12) + (form.outputFormat ? 12 : 0) + (form.sourceType ? 10 : 0) +
      (form.organization ? 10 : 0) + (form.languageMode ? 8 : 0) + (form.features.length >= 5 ? 12 : form.features.length * 2) +
      (form.customRules.length >= 2 ? 8 : form.customRules.length * 4)
    )));
    let total = completeness * .28 + clarity * .27 + consistency * .27 + specificity * .18;
    total -= Math.min(8, suggestions.length * 1.2);
    return { total: Math.max(0, Math.min(100, Math.round(total))), breakdown: { completeness, clarity, consistency, specificity } };
  }

  function renderQualityBreakdown() {
    const target = $('#qualityBreakdown');
    if (!target) return;
    const labels = settings.language === 'ar'
      ? { completeness:'الاكتمال', clarity:'الوضوح', consistency:'الاتساق', specificity:'التحديد' }
      : { completeness:'Completeness', clarity:'Clarity', consistency:'Consistency', specificity:'Specificity' };
    target.innerHTML = Object.entries(state.qualityBreakdown).map(([key,value]) => `<div class="quality-dimension"><span>${labels[key]}</span><div><i style="width:${value}%"></i></div><b>${value}</b></div>`).join('');
  }

  function renderAnalysisLists() {
    $('#conflictList').innerHTML = state.conflicts.length ? state.conflicts.map(item => analysisItem(item)).join('') : analysisItem({ level:'success', title:langText('No conflicts detected','لا توجد تعارضات'), detail:langText('The current choices are logically compatible.','الاختيارات الحالية متوافقة منطقيًا.') });
    $('#suggestionList').innerHTML = state.suggestions.length ? state.suggestions.map(item => analysisItem(item)).join('') : analysisItem({ level:'success', title:langText('Prompt is complete','الـPrompt مكتمل'), detail:langText('No major missing elements were detected.','لم يتم اكتشاف عناصر أساسية ناقصة.') });
  }

  function analysisItem(item) {
    const labels = settings.language === 'ar'
      ? { danger:'حرج', warning:'مراجعة', success:'جاهز', neutral:'اقتراح' }
      : { danger:'CRITICAL', warning:'REVIEW', success:'READY', neutral:'SUGGESTION' };
    const label = labels[item.level] || labels.neutral;
    return `<article class="analysis-item ${item.level}"><header><b>${escapeHtml(item.title)}</b><span class="status-badge ${item.level === 'danger' ? 'danger' : item.level === 'warning' ? 'warning' : item.level === 'success' ? 'success' : 'neutral'}">${label}</span></header><p>${escapeHtml(item.detail)}</p></article>`;
  }

  function updateOutput() {
    const value = state.outputMode === 'json' ? JSON.stringify(state.generated.json, null, 2) : state.outputMode === 'markdown' ? state.generated.markdown : state.generated.prompt;
    $('#promptOutput pre').textContent = value;
  }

  function applyTemplate(id) {
    const template = D.templates.find(item => item.id === id);
    if (!template) return;
    newPrompt(false, false);
    const config = template.config;
    state.currentTemplateId = id;
    state.fidelity = config.fidelity || 'strict';
    const setValue = (selector, value) => { if (value !== undefined && $(selector)) $(selector).value = value; };
    setValue('#targetModel', config.targetModel || settings.defaultModel);
    renderReasoningOptions(config.targetModel || settings.defaultModel, config.reasoningEffort);
    setValue('#executionMode', config.executionMode || 'document-production');
    setValue('#customModelName', config.customModelName || '');
    updateModelProfileCard();
    setValue('#taskType', config.taskType);
    setValue('#outputFormat', config.outputFormat);
    setValue('#sourceType', config.sourceType || 'lecture');
    setValue('#promptDepth', config.promptDepth || settings.depth);
    setValue('#projectTitle', langText(template.title, template.titleAr));
    setValue('#primaryGoal', config.primaryGoal || '');
    setValue('#languageMode', config.languageMode || 'preserve');
    setValue('#organization', config.organization || 'chapter');
    setValue('#designTheme', config.designTheme || 'Premium Academic Blue');
    setValue('#questionCount', config.questionCount ?? 5);
    setValue('#difficulty', config.difficulty || 'mixed');
    setValue('#answerMode', config.answerMode || 'answer-explanation');
    renderFidelity();
    featureInputs().forEach(input => { input.checked = (config.features || []).includes(input.value); });
    $('#qaChecklist').checked = true;
    $('#sourceOnly').checked = ['study-guide','question-bank','lecture-questions','educational-visuals','strict-word'].includes(config.taskType);
    $('#documentLog').checked = ['strict-word','study-guide'].includes(config.taskType);
    compilePrompt();
    if (settings.autosave) saveDraft(); else updateSaveState(true);
    showView('builder');
    setStep(1);
    toast(langText('Template loaded.','تم تحميل القالب.'), 'success');
  }

  function newPrompt(confirmReset, persist = true) {
    if (confirmReset && !confirm(langText('Start a new prompt and clear the current draft?','بدء Prompt جديد ومسح المسودة الحالية؟'))) return;
    state.currentProjectId = null;
    state.currentTemplateId = null;
    state.fidelity = 'strict';
    $('#targetModel').value = settings.defaultModel;
    renderReasoningOptions(settings.defaultModel);
    $('#executionMode').value = 'document-production';
    $('#customModelName').value = '';
    updateModelProfileCard();
    $('#taskType').value = 'study-guide';
    $('#outputFormat').value = 'DOCX';
    $('#sourceType').value = 'lecture';
    $('#promptDepth').value = settings.depth;
    $('#projectTitle').value = '';
    $('#primaryGoal').value = '';
    $('#audience').value = '';
    $('#languageMode').value = 'preserve';
    $('#organization').value = 'chapter';
    $('#pageSize').value = 'A4';
    $('#orientation').value = 'portrait';
    $('#margins').value = '1.5 cm';
    $('#designTheme').value = 'Premium Academic Blue';
    $('#fontFamily').value = 'Aptos, Arial, Cairo';
    $('#bodySize').value = '12–14 pt';
    $('#primaryColor').value = '#0066cc';
    $('#navyColor').value = '#12345b';
    $('#accentColor').value = '#f59e0b';
    $('#lightColor').value = '#eaf4ff';
    $('#questionCount').value = '5';
    $('#difficulty').value = 'mixed';
    $('#answerMode').value = 'answer-explanation';
    $('#customRules').value = '';
    featureInputs().forEach(input => { input.checked = false; });
    $('#qaChecklist').checked = true;
    $('#sourceOnly').checked = true;
    $('#documentLog').checked = true;
    state.outputMode = 'prompt';
    state.insight = 'prompt';
    setOutputMode('prompt');
    setInsight('prompt');
    renderFidelity();
    compilePrompt();
    if (persist && settings.autosave) saveDraft();
    else updateSaveState(false);
    showView('builder');
    setStep(1);
    resetHistory();
  }

  function toggleUsefulGroup(groupName) {
    const selectors = { boxFeatures:'#boxFeatures', visualFeatures:'#visualFeatures', questionFeatures:'#questionFeatures' };
    const useful = {
      boxFeatures:['definition-box','formula-box','exam-box','takeaways-box','self-test-box'],
      visualFeatures:['flowchart','concept-map','comparison-diagram','figure-captions','source-only-visuals'],
      questionFeatures:['mcq','true-false','define','compare','short-answer','mock-exam']
    };
    if (!selectors[groupName] || !useful[groupName]) return;
    $$(selectors[groupName] + ' input').forEach(input => { input.checked = useful[groupName].includes(input.value); });
    updateSaveState(true);
    scheduleCompile();
  }

  function toggleFavorite(id) {
    const favorites = getStoredArray('favorites');
    const next = favorites.includes(id) ? favorites.filter(item => item !== id) : [...favorites, id];
    if (!storage.set('favorites', next)) return toast(langText('Favorite could not be saved.','تعذر حفظ المفضلة.'), 'danger');
    renderTemplates();
  }

  function saveDraft() {
    const payload = { form: collectForm(), currentProjectId: state.currentProjectId, savedAt: new Date().toISOString() };
    const ok = storage.set('draft', payload);
    if (ok) updateSaveState(false);
    else updateSaveState(true, true);
    return ok;
  }

  function loadDraft() {
    const draft = storage.get('draft', null);
    if (!draft?.form || typeof draft.form !== 'object') return;
    applyForm(draft.form);
    state.currentProjectId = typeof draft.currentProjectId === 'string' ? draft.currentProjectId : null;
    updateSaveState(false);
  }

  function applyForm(form) {
    const setValue = (selector, value) => { if ($(selector) && value !== undefined && value !== null) $(selector).value = value; };
    setValue('#targetModel', form.targetModel || settings.defaultModel);
    renderReasoningOptions(form.targetModel || settings.defaultModel, form.reasoningEffort);
    setValue('#executionMode', form.executionMode || 'document-production');
    setValue('#customModelName', form.customModelName || '');
    updateModelProfileCard();
    setValue('#taskType', form.taskType);
    setValue('#outputFormat', form.outputFormat);
    setValue('#sourceType', form.sourceType);
    setValue('#promptDepth', form.promptDepth);
    setValue('#projectTitle', form.projectTitle);
    setValue('#primaryGoal', form.primaryGoal);
    setValue('#audience', form.audience);
    state.fidelity = form.fidelity || 'strict';
    renderFidelity();
    setValue('#languageMode', form.languageMode);
    setValue('#organization', form.organization);
    setValue('#pageSize', form.pageSize);
    setValue('#orientation', form.orientation);
    setValue('#margins', form.margins);
    setValue('#designTheme', form.designTheme);
    setValue('#fontFamily', form.fontFamily);
    setValue('#bodySize', form.bodySize);
    if (form.colors) {
      setValue('#primaryColor', form.colors.primary);
      setValue('#navyColor', form.colors.navy);
      setValue('#accentColor', form.colors.accent);
      setValue('#lightColor', form.colors.light);
    }
    featureInputs().forEach(input => { input.checked = (form.features || []).includes(input.value); });
    setValue('#questionCount', form.questionCount);
    setValue('#difficulty', form.difficulty);
    setValue('#answerMode', form.answerMode);
    $('#customRules').value = (form.customRules || []).join('\n');
    $('#qaChecklist').checked = form.qaChecklist !== false;
    $('#sourceOnly').checked = form.sourceOnly !== false;
    $('#documentLog').checked = form.documentLog !== false;
    compilePrompt();
    updateSaveState(false);
  }

  function getProjects() { return getStoredArray('projects').filter(item => item && typeof item === 'object'); }

  function saveProject() {
    compilePrompt();
    const form = collectForm();
    let projects = getProjects();
    const now = new Date().toISOString();
    let project = projects.find(item => item.id === state.currentProjectId);
    const snapshot = { id: uid(), createdAt: now, score: state.quality, prompt: state.generated.prompt, markdown: state.generated.markdown, form: structuredCloneSafe(form) };

    if (project) {
      const unchanged = project.prompt === state.generated.prompt && stableStringify(project.form) === stableStringify(form);
      project.title = form.projectTitle || taskLabels[form.taskType]?.en || 'Untitled Prompt';
      project.taskType = form.taskType;
      project.updatedAt = now;
      project.score = state.quality;
      project.form = structuredCloneSafe(form);
      project.prompt = state.generated.prompt;
      project.markdown = state.generated.markdown;
      project.versions = Array.isArray(project.versions) ? project.versions : [];
      if (!unchanged) project.versions.unshift(snapshot);
      project.versions = project.versions.slice(0, MAX_VERSIONS);
      if (unchanged) toast(langText('No new changes to version. Project timestamp updated.','لا توجد تغييرات جديدة لإنشاء إصدار. تم تحديث وقت المشروع.'), 'warning');
    } else {
      project = {
        id: uid(),
        title: form.projectTitle || taskLabels[form.taskType]?.en || 'Untitled Prompt',
        taskType: form.taskType,
        createdAt: now,
        updatedAt: now,
        score: state.quality,
        form: structuredCloneSafe(form),
        prompt: state.generated.prompt,
        markdown: state.generated.markdown,
        versions: [snapshot]
      };
      projects.unshift(project);
      projects = projects.slice(0, MAX_PROJECTS);
      state.currentProjectId = project.id;
    }

    if (!storage.set('projects', projects)) {
      updateSaveState(true, true);
      return toast(langText('Storage is full. Export a backup and delete older projects or versions.','مساحة التخزين ممتلئة. صدّر نسخة احتياطية ثم احذف مشاريع أو إصدارات قديمة.'), 'danger');
    }
    saveDraft();
    renderProjects();
    updateDashboard();
    updateSaveState(false);
    if (!project.versions?.length || project.versions[0]?.id === snapshot.id) toast(langText('Project saved locally.','تم حفظ المشروع محليًا.'), 'success');
  }

  function renderProjects() {
    const query = ($('#projectSearch')?.value || '').trim().toLowerCase();
    const sort = $('#projectSort')?.value || 'newest';
    let projects = getProjects().filter(item => {
      const form = item.form || {};
      const haystack = [item.title,item.taskType,item.prompt,form.primaryGoal,form.audience,form.outputFormat,form.sourceType,form.targetModel,(form.customRules || []).join(' '),(form.features || []).join(' ')].join(' ').toLowerCase();
      return !query || haystack.includes(query);
    });
    projects = [...projects].sort((a,b) => sort === 'oldest' ? new Date(a.updatedAt) - new Date(b.updatedAt) : sort === 'score' ? b.score - a.score : sort === 'name' ? a.title.localeCompare(b.title) : new Date(b.updatedAt) - new Date(a.updatedAt));
    if (!$('#projectList')) return;
    $('#projectList').innerHTML = projects.length ? projects.map(project => `
      <article class="project-row">
        <span class="project-icon">${taskIcon(project.taskType)}</span>
        <div class="project-main"><b>${escapeHtml(project.title)}</b><small>${escapeHtml(taskLabels[project.taskType]?.[settings.language] || project.taskType)} · ${formatDate(project.updatedAt)}</small></div>
        <div class="project-meta"><b>v${project.versions?.length || 1}</b><small>${settings.language === 'ar' ? 'إصدارات' : 'versions'}</small></div>
        <span class="project-score">${clampScore(project.score)}/100</span>
        <div class="project-actions">
          <button data-project-action="view" data-id="${project.id}" title="View">◉</button>
          <button data-project-action="open" data-id="${project.id}" title="Open">↗</button>
          <button data-project-action="duplicate" data-id="${project.id}" title="Duplicate">⧉</button>
          <button data-project-action="export" data-id="${project.id}" title="Export">⇩</button>
          <button data-project-action="delete" data-id="${project.id}" title="Delete">×</button>
        </div>
      </article>`).join('') : `<div class="empty-state">${settings.language === 'ar' ? 'لا توجد مشاريع محفوظة.' : 'No saved projects.'}</div>`;
  }

  function handleProjectAction(action, id) {
    const projects = getProjects();
    const project = projects.find(item => item.id === id);
    if (!project) return;
    if (action === 'view') return renderProjectModal(project);
    if (action === 'open') {
      state.currentProjectId = project.id;
      applyForm(project.form);
      showView('builder');
      return toast(langText('Project opened.','تم فتح المشروع.'), 'success');
    }
    if (action === 'duplicate') {
      const copy = structuredCloneSafe(project);
      copy.id = uid();
      copy.title += settings.language === 'ar' ? ' — نسخة' : ' — Copy';
      copy.createdAt = copy.updatedAt = new Date().toISOString();
      copy.versions = (copy.versions || []).map(version => ({ ...version, id: uid() }));
      projects.unshift(copy);
      if (!storage.set('projects', projects.slice(0, MAX_PROJECTS))) return toast(langText('Could not save the duplicate. Storage may be full.','تعذر حفظ النسخة. قد تكون مساحة التخزين ممتلئة.'), 'danger');
      renderProjects();
      updateDashboard();
      return toast(langText('Project duplicated.','تم إنشاء نسخة من المشروع.'), 'success');
    }
    if (action === 'export') return download(`${slug(project.title)}.json`, JSON.stringify({ app:'PromptForge Nexus Studio by Shark', version:APP_VERSION, exportedAt:new Date().toISOString(), project }, null, 2), 'application/json');
    if (action === 'delete' && confirm(langText('Delete this project and all its versions?','حذف المشروع وكل إصداراته؟'))) {
      if (!storage.set('projects', projects.filter(item => item.id !== id))) return toast(langText('Project could not be deleted.','تعذر حذف المشروع.'), 'danger');
      if (state.currentProjectId === id) state.currentProjectId = null;
      renderProjects();
      updateDashboard();
      toast(langText('Project deleted.','تم حذف المشروع.'), 'warning');
    }
  }

  function renderProjectModal(project) {
    const versions = Array.isArray(project.versions) ? project.versions : [];
    const versionRows = versions.map((version, index) => `
      <div class="version-row">
        <div><b>v${versions.length - index}</b><small>${formatDate(version.createdAt)} · ${Number(version.score) || 0}/100</small></div>
        <div class="version-actions">
          <button class="secondary-btn small-btn" data-version-action="preview" data-project-id="${project.id}" data-version-id="${version.id}">${langText('Preview','معاينة')}</button>
          <button class="secondary-btn small-btn" data-version-action="restore" data-project-id="${project.id}" data-version-id="${version.id}">${langText('Restore','استعادة')}</button>
          <button class="secondary-btn small-btn" data-version-action="export" data-project-id="${project.id}" data-version-id="${version.id}">${langText('Export','تصدير')}</button>
          ${versions.length > 1 ? `<button class="danger-btn small-btn" data-version-action="delete" data-project-id="${project.id}" data-version-id="${version.id}">${langText('Delete','حذف')}</button>` : ''}
        </div>
      </div>`).join('');
    openModal(project.title, `
      <div class="project-modal-summary"><span class="status-badge success">${Number(project.score) || 0}/100</span><span class="status-badge neutral">${versions.length} ${langText('versions','إصدارات')}</span><span class="status-badge neutral">${escapeHtml(taskLabels[project.taskType]?.[settings.language] || project.taskType)}</span></div>
      <label class="modal-field"><span>${langText('Current prompt','الـPrompt الحالي')}</span><textarea readonly>${escapeHtml(project.prompt || '')}</textarea></label>
      <h3>${langText('Version history','سجل الإصدارات')}</h3>
      <div class="version-list">${versionRows || `<div class="empty-state">${langText('No versions found.','لا توجد إصدارات.')}</div>`}</div>`);
  }

  function handleVersionAction(action, projectId, versionId) {
    const projects = getProjects();
    const project = projects.find(item => item.id === projectId);
    const version = project?.versions?.find(item => item.id === versionId);
    if (!project || !version) return;
    if (action === 'preview') return openModal(`${project.title} — ${formatDate(version.createdAt)}`, `<textarea readonly>${escapeHtml(version.prompt || '')}</textarea>`);
    if (action === 'restore') {
      state.currentProjectId = project.id;
      applyForm(version.form);
      closeModal();
      showView('builder');
      updateSaveState(true);
      return toast(langText('Version loaded as unsaved changes. Save the project to create a new version.','تم تحميل الإصدار كتغييرات غير محفوظة. احفظ المشروع لإنشاء إصدار جديد.'), 'success');
    }
    if (action === 'export') return download(`${slug(project.title)}_${slug(formatDate(version.createdAt))}.json`, JSON.stringify({ app:'PromptForge Nexus Studio by Shark', version:APP_VERSION, projectId, snapshot:version }, null, 2), 'application/json');
    if (action === 'delete' && project.versions.length > 1 && confirm(langText('Delete this version?','حذف هذا الإصدار؟'))) {
      project.versions = project.versions.filter(item => item.id !== versionId);
      if (!storage.set('projects', projects)) return toast(langText('Version could not be deleted.','تعذر حذف الإصدار.'), 'danger');
      renderProjectModal(project);
      renderProjects();
      updateDashboard();
      toast(langText('Version deleted.','تم حذف الإصدار.'), 'warning');
    }
  }

  function scheduleHistoryCapture() {
    if (state.historyLock) return;
    clearTimeout(state.historyTimer);
    state.historyTimer = setTimeout(captureHistory, 320);
  }

  function captureHistory(force = false) {
    if (state.historyLock) return;
    const snapshot = collectForm();
    const hash = stableStringify(snapshot);
    const current = state.history[state.historyIndex];
    if (!force && current?.hash === hash) return;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push({ hash, form: structuredCloneSafe(snapshot) });
    if (state.history.length > 40) state.history.shift();
    state.historyIndex = state.history.length - 1;
    updateHistoryButtons();
  }

  function resetHistory() {
    state.history = [];
    state.historyIndex = -1;
    captureHistory(true);
  }

  function undoBuilder() {
    if (state.historyIndex <= 0) return;
    state.historyIndex--;
    restoreHistorySnapshot();
  }

  function redoBuilder() {
    if (state.historyIndex >= state.history.length - 1) return;
    state.historyIndex++;
    restoreHistorySnapshot();
  }

  function restoreHistorySnapshot() {
    const snapshot = state.history[state.historyIndex];
    if (!snapshot) return;
    state.historyLock = true;
    applyForm(snapshot.form);
    state.historyLock = false;
    updateSaveState(true);
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    const undo = $('#undoBuilderBtn');
    const redo = $('#redoBuilderBtn');
    if (undo) undo.disabled = state.historyIndex <= 0;
    if (redo) redo.disabled = state.historyIndex >= state.history.length - 1;
  }

  function showOnboarding() {
    state.onboardingStep = 0;
    renderOnboarding();
  }

  function renderOnboarding() {
    const ar = settings.language === 'ar';
    const steps = ar ? [
      ['ابدأ بالنتيجة','اكتب النتيجة النهائية المطلوبة بوضوح، وليس مجرد موضوع عام.'],
      ['حدد حدود التغيير','اختر ما يجب الحفاظ عليه وما يمكن تحسينه أو إعادة كتابته.'],
      ['راجع التقييم','الدرجة مقسمة إلى اكتمال ووضوح واتساق وتحديد، وليست مكافأة على طول الـPrompt.'],
      ['حل التعارضات','كل تعارض يوضح التعليمات المتصادمة وما الذي يجب تغييره.'],
      ['احفظ وارجع','استخدم Ctrl+Z وCtrl+Shift+Z، واحفظ المشروع للاحتفاظ بالإصدارات.']
    ] : [
      ['Start with the outcome','Describe the exact deliverable, not only the broad topic.'],
      ['Set change boundaries','Choose what must be preserved and what may be improved or rewritten.'],
      ['Read the score','The score measures completeness, clarity, consistency and specificity—not prompt length.'],
      ['Resolve conflicts','Each conflict identifies the competing instructions and the required decision.'],
      ['Save and recover','Use Ctrl+Z and Ctrl+Shift+Z, then save projects to retain versions.']
    ];
    const [title,body] = steps[state.onboardingStep];
    const dots = steps.map((_,i)=>`<i class="${i===state.onboardingStep?'active':''}"></i>`).join('');
    openModal(ar ? 'جولة سريعة' : 'Quick start', `<div class="onboarding-card"><span class="onboarding-count">${state.onboardingStep+1}/${steps.length}</span><h2>${title}</h2><p>${body}</p><div class="onboarding-preview"><b>${ar?'المسار الصحيح':'Recommended flow'}</b><span>${ar?'الهدف ← المحتوى ← التصميم ← القواعد ← المراجعة':'Outcome → Content → Design → Rules → Review'}</span></div><div class="onboarding-dots">${dots}</div><div class="onboarding-actions"><button class="secondary-btn" data-onboarding-action="skip">${ar?'تخطي':'Skip'}</button>${state.onboardingStep ? `<button class="secondary-btn" data-onboarding-action="back">${ar?'السابق':'Back'}</button>` : ''}<button class="primary-btn" data-onboarding-action="${state.onboardingStep===steps.length-1?'finish':'next'}">${state.onboardingStep===steps.length-1?(ar?'ابدأ الاستخدام':'Start building'):(ar?'التالي':'Next')}</button></div></div>`);
  }

  function handleOnboardingAction(action) {
    if (action === 'back') { state.onboardingStep = Math.max(0, state.onboardingStep - 1); return renderOnboarding(true); }
    if (action === 'next') { state.onboardingStep = Math.min(4, state.onboardingStep + 1); return renderOnboarding(true); }
    storage.set('onboardingDone', true);
    closeModal();
    if (action === 'finish') { showView('builder'); setStep(1); $('#primaryGoal')?.focus(); }
  }

  function taskIcon(taskType) { return ({'word-template':'▣','study-guide':'◆','strict-word':'▤','question-bank':'?','lecture-questions':'✎','presentation':'▰','egyptian-translation':'ع','highlight-only':'▥','bilingual':'Aع','educational-visuals':'⌁','social-rewrite':'◎','custom':'✦'})[taskType] || '✦'; }

  function renderSnippets() {
    const custom = getStoredArray('snippets');
    const list = [...D.builtInSnippets.map(item => ({ ...item, builtIn:true })), ...custom];
    $('#snippetList').innerHTML = list.map(item => `
      <article class="snippet-card panel">
        <header><div><span class="snippet-tag">${escapeHtml(item.category)}</span><h3>${escapeHtml(langText(item.name, item.nameAr || item.name))}</h3></div>${item.builtIn ? '<span class="status-badge neutral">BUILT-IN</span>' : `<button class="icon-btn" data-snippet-action="delete" data-id="${item.id}">×</button>`}</header>
        <p>${escapeHtml(item.content)}</p>
        <div class="snippet-actions"><button class="secondary-btn" data-snippet-action="copy" data-id="${item.id}">${langText('Copy','نسخ')}</button><button class="primary-btn" data-snippet-action="use" data-id="${item.id}">${langText('Add to prompt','إضافة')}</button>${item.builtIn ? '' : `<button class="secondary-btn" data-snippet-action="edit" data-id="${item.id}">${langText('Edit','تعديل')}</button>`}</div>
      </article>`).join('');
    $('#metricSnippets').textContent = list.length;
  }

  function getSnippet(id) { return [...D.builtInSnippets.map(item => ({...item,builtIn:true})), ...getStoredArray('snippets')].find(item => item.id === id); }

  function handleSnippetAction(action, id) {
    const snippet = getSnippet(id);
    if (!snippet) return;
    if (action === 'copy') return copyText(snippet.content).then(() => toast(langText('Block copied.','تم نسخ المقطع.'), 'success')).catch(() => toast(langText('Copy failed.','تعذر النسخ.'), 'danger'));
    if (action === 'use') {
      $('#customRules').value = [$('#customRules').value.trim(), snippet.content].filter(Boolean).join('\n');
      showView('builder');
      setStep(5);
      compilePrompt();
      saveDraft();
      return toast(langText('Block added to the prompt.','تمت إضافة المقطع للـPrompt.'), 'success');
    }
    if (action === 'edit' && !snippet.builtIn) {
      $('#snippetId').value = snippet.id;
      $('#snippetName').value = snippet.name;
      $('#snippetCategory').value = snippet.category;
      $('#snippetContent').value = snippet.content;
      $('#snippetName').focus();
      return;
    }
    if (action === 'delete' && !snippet.builtIn && confirm(langText('Delete this smart block?','حذف هذا المقطع؟'))) {
      if (!storage.set('snippets', getStoredArray('snippets').filter(item => item.id !== id))) return toast(langText('Block could not be deleted.','تعذر حذف المقطع.'), 'danger');
      renderSnippets();
      updateDashboard();
    }
  }

  function saveSnippet() {
    const id = $('#snippetId').value || uid();
    const name = $('#snippetName').value.trim();
    const category = $('#snippetCategory').value.trim() || 'Custom';
    const content = $('#snippetContent').value.trim();
    if (!name || !content) return toast(langText('Name and content are required.','الاسم والمحتوى مطلوبان.'), 'warning');
    const snippets = getStoredArray('snippets');
    const existing = snippets.find(item => item.id === id);
    const safeName = name.slice(0,100);
    const safeCategory = category.slice(0,60);
    const safeContent = content.slice(0,20000);
    if (existing) Object.assign(existing, { name:safeName, category:safeCategory, content:safeContent, updatedAt:new Date().toISOString() });
    else snippets.unshift({ id, name:safeName, category:safeCategory, content:safeContent, createdAt:new Date().toISOString() });
    if (!storage.set('snippets', snippets.slice(0,200))) return toast(langText('Smart block could not be saved. Storage may be full.','تعذر حفظ المقطع. قد تكون مساحة التخزين ممتلئة.'), 'danger');
    resetSnippetEditor();
    renderSnippets();
    updateDashboard();
    toast(langText('Smart block saved.','تم حفظ المقطع.'), 'success');
  }

  function resetSnippetEditor() { $('#snippetId').value = ''; $('#snippetName').value = ''; $('#snippetCategory').value = ''; $('#snippetContent').value = ''; }

  function copyPrompt() {
    compilePrompt();
    const text = state.outputMode === 'json' ? JSON.stringify(state.generated.json, null, 2) : state.outputMode === 'markdown' ? state.generated.markdown : state.generated.prompt;
    copyText(text).then(() => toast(langText('Prompt copied.','تم نسخ الـPrompt.'), 'success')).catch(() => toast(langText('Copy failed.','تعذر النسخ.'), 'danger'));
  }

  function downloadPrompt() {
    compilePrompt();
    const format = ['txt','md','json'].includes(settings.textFormat) ? settings.textFormat : 'txt';
    const form = collectForm();
    const title = form.projectTitle || 'custom_prompt';
    const filename = buildFilename(title, format);
    const content = buildExportContent(format, form);
    const type = format === 'json' ? 'application/json' : format === 'md' ? 'text/markdown' : 'text/plain';
    download(filename, content, type);
  }

  function buildExportContent(format, form) {
    if (format === 'json') return JSON.stringify(state.generated.json, null, 2);
    const body = format === 'md' ? state.generated.markdown : state.generated.prompt;
    if (!settings.metadata) return body;
    const meta = [
      `Project: ${form.projectTitle || 'Untitled Prompt'}`,
      `Task: ${taskLabels[form.taskType]?.en || form.taskType}`,
      `Quality: ${state.quality}/100`,
      `Generated: ${new Date().toISOString()}`,
      `App: PromptForge Nexus Studio by Shark v${APP_VERSION}`
    ];
    return format === 'md' ? `---\n${meta.map(line => line.replace(': ', ': ')).join('\n')}\n---\n\n${body}` : `${meta.join('\n')}\n${'='.repeat(48)}\n\n${body}`;
  }

  function buildFilename(title, format) {
    const date = new Date().toISOString().slice(0,10);
    const project = getProjects().find(item => item.id === state.currentProjectId);
    const version = project?.versions?.length || 1;
    const pattern = String(settings.filename || defaults.filename);
    const base = pattern.replaceAll('{title}', slug(title)).replaceAll('{date}', date).replaceAll('{version}', String(version));
    return `${slug(base)}.${format}`;
  }

  function renderGuide() {
    $('#guideNav').innerHTML = D.guide.map((item, index) => `<button class="${index === 0 ? 'active' : ''}" data-guide="${item.id}">${escapeHtml(langText(item.title, item.titleAr))}</button>`).join('');
    openGuide(D.guide[0].id, false);
  }

  function openGuide(id, scroll = true) {
    $$('#guideNav button').forEach(button => button.classList.toggle('active', button.dataset.guide === id));
    $('#guideContent').innerHTML = guideHtml(id);
    if (scroll) $('#guideContent').scrollIntoView({ behavior:'smooth', block:'start' });
  }

  function guideHtml(id) {
    const ar = settings.language === 'ar';
    const content = {
      start: ar ? `<h2>البدء السريع</h2><p>PromptForge Studio يعمل بالكامل داخل المتصفح. لا تحتاج حسابًا أو Backend أو API.</p><ol><li>افتح <b>مكتبة القوالب</b> واختر أقرب قالب للمهمة.</li><li>عدّل الهدف والجمهور ونظام الحفاظ على المحتوى.</li><li>راجع درجة الجودة والتعارضات والعناصر الناقصة.</li><li>انسخ الـPrompt أو نزّله أو احفظه كمشروع.</li></ol><div class="guide-callout"><b>أفضل نتيجة:</b> اكتب الهدف النهائي في جملة دقيقة، وحدد ما يجب الحفاظ عليه وما هو ممنوع.</div>` : `<h2>Getting Started</h2><p>PromptForge Studio runs entirely in your browser. No account, backend or API is required.</p><ol><li>Open the <b>Template Library</b> and choose the closest scenario.</li><li>Edit the goal, audience and content-fidelity mode.</li><li>Review quality, conflicts and missing elements.</li><li>Copy, download or save the prompt as a project.</li></ol><div class="guide-callout"><b>Best practice:</b> State the final result precisely and define what must be preserved and prohibited.</div>`,
      builder: ar ? `<h2>استخدام المنشئ</h2><h3>1. الهدف والموديل</h3><p>اختر الموديل المستهدف ومستوى التفكير ونمط التنفيذ، ثم حدد نوع المهمة، الملف المطلوب، نوع المصدر ومستوى التفاصيل. استخدم <b>Maximum Control</b> للمهام الحساسة أو الطويلة.</p><h3>2. المحتوى</h3><p>اختَر وضع الحفاظ المناسب. الحفظ الكامل يعني عدم تغيير الكلمات، بينما التحسين الذكي يسمح بإضافات تعليمية منفصلة.</p><h3>3. التصميم</h3><p>إعدادات المقاس والخط والثيم تتحول إلى تعليمات واضحة داخل الـPrompt.</p><h3>4. التعليم</h3><p>شغّل الصناديق والرسومات والأسئلة التي تضيف قيمة فعلية فقط.</p><h3>5. القواعد</h3><p>كل سطر في التعليمات المخصصة يتحول إلى قاعدة مستقلة.</p>` : `<h2>Using the Builder</h2><h3>1. Brief and Model</h3><p>Choose the target model, reasoning level and execution mode, then select the task, output, source and prompt depth. Use <b>Maximum Control</b> for sensitive or complex work.</p><h3>2. Content</h3><p>Select the correct fidelity mode. Strict preservation prevents wording changes; intelligent enhancement allows clearly separated study aids.</p><h3>3. Design</h3><p>Page, font, theme and palette settings become explicit prompt instructions.</p><h3>4. Learning</h3><p>Enable only boxes, visuals and questions that provide real value.</p><h3>5. Rules</h3><p>Each line in Custom Instructions becomes a separate rule.</p>`,
      models: ar ? `<h2>ملفات الموديلات</h2><p>النسخة مضبوطة افتراضيًا على <b>GPT-5.6 Sol</b> للمهام المعقدة والجودة القصوى.</p><table><tr><th>الملف</th><th>الاستخدام الأفضل</th></tr><tr><td>GPT-5.6 Sol</td><td>العمل المهني المعقد والبرمجة والمستندات الطويلة</td></tr><tr><td>GPT-5.6 Terra</td><td>توازن الجودة والسرعة والتكلفة</td></tr><tr><td>GPT-5.6 Luna</td><td>المهام المحددة والكثيفة والسريعة</td></tr><tr><td>Claude</td><td>التحليل والكتابة والمهام التنفيذية</td></tr><tr><td>Gemini</td><td>السياق الطويل والمدخلات متعددة الوسائط</td></tr><tr><td>Grok</td><td>التحليل والبرمجة والبحث المباشر</td></tr><tr><td>Universal</td><td>Prompt محايد قابل للنقل بين الموديلات</td></tr></table><div class="guide-callout">مستوى التفكير ونمط التنفيذ يتحولان إلى تعليمات واضحة داخل الـPrompt، ولا يتم الاتصال بأي API.</div>` : `<h2>Model Profiles</h2><p>The default profile is <b>GPT-5.6 Sol</b> for complex, quality-first work.</p><table><tr><th>Profile</th><th>Best use</th></tr><tr><td>GPT-5.6 Sol</td><td>Complex professional work, coding and long documents</td></tr><tr><td>GPT-5.6 Terra</td><td>Capability, speed and cost balance</td></tr><tr><td>GPT-5.6 Luna</td><td>Fast, well-defined, high-volume tasks</td></tr><tr><td>Claude</td><td>Analysis, writing and agentic workflows</td></tr><tr><td>Gemini</td><td>Long context and multimodal inputs</td></tr><tr><td>Grok</td><td>Direct analysis, coding and research</td></tr><tr><td>Universal</td><td>Portable provider-neutral prompts</td></tr></table><div class="guide-callout">Reasoning and execution choices are compiled into the prompt locally. No provider API is called.</div>`,
      templates: ar ? `<h2>القوالب</h2><p>القوالب لا تُقفل الإعدادات. هي نقطة بداية فقط ويمكن تغيير كل عنصر بعدها.</p><ul><li>اضغط النجمة لإضافة القالب للمفضلة.</li><li>استخدم البحث والتصنيف للوصول السريع.</li><li>تحميل قالب لا يرسل أو يرفع أي ملف.</li></ul>` : `<h2>Templates</h2><p>Templates do not lock settings. They are starting points and every option remains editable.</p><ul><li>Use the star to add a template to favorites.</li><li>Filter by category or search.</li><li>Loading a template never uploads a file.</li></ul>`,
      conflicts: ar ? `<h2>كشف التعارضات</h2><p>المحرك يراجع الاختيارات والتعليمات المخصصة ويكتشف أوامر متناقضة، مثل:</p><ul><li>الحفاظ على كل كلمة مع طلب التلخيص أو إعادة الكتابة.</li><li>طلب Word مع اختيار PowerPoint كمخرج.</li><li>منع المعلومات الخارجية مع طلب الإضافة من الخبرة.</li></ul><div class="guide-warning">التحذير لا يمنع إنشاء الـPrompt، لكنه يوضح أين يجب تعديل التعليمات.</div>` : `<h2>Conflict Detector</h2><p>The engine checks selections and custom instructions for contradictions, such as:</p><ul><li>Preserving every word while requesting summarization or rewriting.</li><li>A Word task with PowerPoint output.</li><li>Prohibiting external facts while requesting expert additions.</li></ul><div class="guide-warning">Warnings do not block generation; they show where instructions need correction.</div>`,
      projects: ar ? `<h2>المشاريع والإصدارات</h2><p>عند حفظ مشروع موجود، يتم إنشاء إصدار جديد داخله. الحد الحالي 30 إصدارًا لكل مشروع للحفاظ على السرعة.</p><ul><li><b>فتح:</b> تحميل المشروع في المنشئ.</li><li><b>عرض:</b> معاينة الـPrompt المحفوظ.</li><li><b>نسخ:</b> إنشاء مشروع مستقل.</li><li><b>تصدير:</b> تنزيل المشروع بصيغة JSON.</li></ul><div class="guide-callout">صدّر نسخة احتياطية دوريًا لأن مسح بيانات المتصفح يحذف المشاريع المحلية.</div>` : `<h2>Projects & Versions</h2><p>Saving an existing project creates a new version. Up to 30 versions are retained per project for performance.</p><ul><li><b>Open:</b> load the project in the builder.</li><li><b>View:</b> preview the saved prompt.</li><li><b>Duplicate:</b> create an independent copy.</li><li><b>Export:</b> download the project as JSON.</li></ul><div class="guide-callout">Export backups regularly because clearing browser data removes local projects.</div>`,
      settings: ar ? `<h2>الإعدادات</h2><p>يمكن تغيير اللغة والثيم وكثافة الواجهة واللون والحجم والموديل الافتراضي ومستوى الـPrompt الافتراضي.</p><h3>الحفظ التلقائي</h3><p>يحفظ المسودة الحالية بعد التعديلات. لا يتم رفعها لأي مكان.</p><h3>دمج التعليمات</h3><p>يحذف السطور المتكررة حرفيًا من الأقسام الناتجة لتقليل التكرار.</p>` : `<h2>Settings</h2><p>Configure language, theme, density, accent, interface size, default target model and default prompt depth.</p><h3>Autosave</h3><p>Saves the current draft after changes. Nothing is uploaded.</p><h3>Instruction deduplication</h3><p>Removes exact repeated lines from generated sections.</p>`,
      shortcuts: ar ? `<h2>اختصارات لوحة المفاتيح</h2><table><tr><th>الاختصار</th><th>الوظيفة</th></tr><tr><td><kbd>Ctrl</kbd> + <kbd>K</kbd></td><td>فتح البحث السريع</td></tr><tr><td><kbd>Ctrl</kbd> + <kbd>S</kbd></td><td>حفظ المشروع</td></tr><tr><td><kbd>Ctrl</kbd> + <kbd>Enter</kbd></td><td>تحديث الـPrompt</td></tr><tr><td><kbd>G</kbd></td><td>فتح المنشئ</td></tr><tr><td><kbd>Esc</kbd></td><td>إغلاق النوافذ</td></tr></table>` : `<h2>Keyboard Shortcuts</h2><table><tr><th>Shortcut</th><th>Action</th></tr><tr><td><kbd>Ctrl</kbd> + <kbd>K</kbd></td><td>Open command search</td></tr><tr><td><kbd>Ctrl</kbd> + <kbd>S</kbd></td><td>Save project</td></tr><tr><td><kbd>Ctrl</kbd> + <kbd>Enter</kbd></td><td>Refresh prompt</td></tr><tr><td><kbd>G</kbd></td><td>Open builder</td></tr><tr><td><kbd>Esc</kbd></td><td>Close dialogs</td></tr></table>`,
      privacy: ar ? `<h2>الخصوصية</h2><p>الموقع مصمم بنظام <b>Local-first</b>:</p><ul><li>لا يوجد Backend.</li><li>لا يوجد API.</li><li>لا توجد تحليلات خارجية.</li><li>لا يتم إرسال محتوى الـPrompt إلى الإنترنت.</li><li>المشاريع والإعدادات محفوظة داخل LocalStorage.</li></ul><div class="guide-warning">أي شخص يستخدم نفس بروفايل المتصفح على الجهاز قد يصل إلى البيانات المحلية. استخدم نسخة احتياطية واحذف البيانات عند استخدام جهاز مشترك.</div>` : `<h2>Privacy</h2><p>The application is <b>local-first</b>:</p><ul><li>No backend.</li><li>No API.</li><li>No external analytics.</li><li>Prompt content is not sent to the internet.</li><li>Projects and settings are stored in LocalStorage.</li></ul><div class="guide-warning">Anyone using the same browser profile may access local data. Export a backup and clear data on shared devices.</div>`,
      maintenance: ar ? `<h2>الصيانة</h2><p>صفحة الصيانة تفحص LocalStorage والنسخ والحفظ والتحميل وService Worker.</p><h3>إصلاح التخزين</h3><p>يفحص مفاتيح التطبيق ويحذف البيانات التالفة فقط.</p><h3>مسح Cache</h3><p>يحذف ملفات النسخة المخزنة لتحديث الموقع. أعد تحميل الصفحة بعد العملية.</p><h3>تقرير التشخيص</h3><p>ملف JSON محلي يحتوي على نتائج الفحص وإصدار التطبيق ومعلومات المتصفح الأساسية.</p>` : `<h2>Maintenance</h2><p>The maintenance page checks LocalStorage, clipboard, downloads and Service Worker support.</p><h3>Repair Storage</h3><p>Validates application keys and removes corrupted entries only.</p><h3>Clear Cache</h3><p>Deletes cached app files so the latest version can load. Reload afterward.</p><h3>Diagnostic Report</h3><p>A local JSON file containing test results, app version and basic browser information.</p>`
    };
    return content[id] || content.start;
  }

  function saveSettings() {
    saveDraft();
    settings = {
      ...settings,
      language: $('#settingLanguage').value,
      theme: $('#settingTheme').value,
      uiTheme: $('#settingUiTheme')?.value || settings.uiTheme,
      density: $('#settingDensity').value,
      accent: $('#settingAccent').value,
      fontScale: Number($('#settingFontScale').value),
      depth: $('#settingDepth').value,
      defaultModel: $('#settingDefaultModel').value,
      autosave: $('#settingAutosave').checked,
      livePreview: $('#settingLivePreview').checked,
      dedupe: $('#settingDedupe').checked,
      shortcuts: $('#settingShortcuts').checked,
      filename: $('#settingFilename').value.trim() || defaults.filename,
      textFormat: $('#settingTextFormat').value,
      metadata: $('#settingMetadata').checked
    };
    settings = sanitizeSettings(settings);
    if (!storage.set('settings', settings)) updateSaveState(true, true);
    applySettings(true);
  }

  function applySettings(showToast = false) {
    settings = sanitizeSettings(settings);
    const currentForm = $('#taskType') && $('#contentRules')?.children.length ? collectForm() : null;
    const wasDirty = state.dirty;
    document.documentElement.lang = settings.language;
    document.documentElement.dir = settings.language === 'ar' ? 'rtl' : 'ltr';
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme:dark)').matches);
    document.body.classList.toggle('dark', dark);
    document.body.dataset.themeSkin = settings.uiTheme;
    document.body.classList.toggle('compact', settings.density === 'compact');
    const accent = normalizeHex(settings.accent, defaults.accent);
    const rgb = hexToRgb(accent);
    document.documentElement.style.setProperty('--primary', accent);
    document.documentElement.style.setProperty('--primary-rgb', `${rgb.r},${rgb.g},${rgb.b}`);
    document.documentElement.style.setProperty('--primary-2', mixHex(accent, '#ffffff', 0.24));
    document.documentElement.style.setProperty('--font-size', `${settings.fontScale}%`);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#07101c' : accent);
    $('#languageBtn').textContent = settings.language === 'ar' ? 'EN' : 'AR';
    updateThemeControls();

    const dictionary = I18N[settings.language] || I18N.ar;
    $$('[data-i18n]').forEach(element => { if (dictionary[element.dataset.i18n]) element.textContent = dictionary[element.dataset.i18n]; });
    $$('[data-i18n-placeholder]').forEach(element => { if (dictionary[element.dataset.i18nPlaceholder]) element.placeholder = dictionary[element.dataset.i18nPlaceholder]; });

    if ($('#settingLanguage')) {
      $('#settingLanguage').value = settings.language;
      $('#settingTheme').value = settings.theme;
      if ($('#settingUiTheme')) $('#settingUiTheme').value = settings.uiTheme;
      $('#settingDensity').value = settings.density;
      $('#settingAccent').value = settings.accent;
      $('#settingFontScale').value = settings.fontScale;
      $('#fontScaleLabel').textContent = `${settings.fontScale}%`;
      $('#settingDepth').value = settings.depth;
      $('#settingDefaultModel').value = settings.defaultModel;
      $('#settingAutosave').checked = settings.autosave;
      $('#settingLivePreview').checked = settings.livePreview;
      $('#settingDedupe').checked = settings.dedupe;
      $('#settingShortcuts').checked = settings.shortcuts;
      $('#settingFilename').value = settings.filename;
      $('#settingTextFormat').value = settings.textFormat;
      $('#settingMetadata').checked = settings.metadata;
    }

    const currentTask = $('#taskType')?.value;
    const currentModel = $('#targetModel')?.value;
    const currentReasoning = $('#reasoningEffort')?.value;
    const currentExecution = $('#executionMode')?.value;
    renderTaskTypes();
    renderModelProfiles();
    if (currentModel && modelLabels[currentModel]) {
      $('#targetModel').value = currentModel;
      renderReasoningOptions(currentModel, currentReasoning);
    }
    if (currentExecution && executionLabels[currentExecution]) $('#executionMode').value = currentExecution;
    updateModelProfileCard();
    if (currentTask) $('#taskType').value = currentTask;
    renderFidelity();
    renderFeatureGroup('#contentRules', D.contentRules);
    renderFeatureGroup('#documentFeatures', D.documentFeatures);
    renderFeatureGroup('#boxFeatures', D.boxFeatures);
    renderFeatureGroup('#visualFeatures', D.visualFeatures);
    renderFeatureGroup('#questionFeatures', D.questionFeatures);
    renderFeatureGroup('#prohibitedRules', D.prohibitedRules);
    if (currentForm) applyForm(currentForm);
    else {
      const draft = storage.get('draft', null);
      if (draft?.form) applyForm(draft.form);
    }
    if (wasDirty) updateSaveState(true);
    renderQuickTemplates();
    renderTemplates();
    renderSnippets();
    renderProjects();
    renderGuide();
    renderCommands();
    updateDashboard();
    setStep(state.step);
    if (showToast) toast(langText('Settings saved.','تم حفظ الإعدادات.'), 'success');
  }

  function toggleLanguage() {
    saveDraft();
    settings.language = settings.language === 'ar' ? 'en' : 'ar';
    if (!storage.set('settings', settings)) updateSaveState(true, true);
    applySettings(false);
  }

  const UI_THEME_NAMES = {
    aurora: 'Aurora', midnight: 'Midnight', ember: 'Ember',
    forest: 'Forest', royal: 'Royal', graphite: 'Graphite'
  };
  const UI_THEME_ACCENTS = {
    aurora: '#6d5dfc', midnight: '#19b7d8', ember: '#ef6a45',
    forest: '#15966d', royal: '#8a5cf6', graphite: '#4b5563'
  };

  function toggleThemePopover(event) {
    event?.stopPropagation();
    const popover = $('#themePopover');
    if (!popover) return;
    const opening = !popover.classList.contains('open');
    popover.classList.toggle('open', opening);
    popover.setAttribute('aria-hidden', opening ? 'false' : 'true');
    $('#themeBtn')?.setAttribute('aria-expanded', opening ? 'true' : 'false');
  }

  function closeThemePopover() {
    const popover = $('#themePopover');
    if (!popover) return;
    popover.classList.remove('open');
    popover.setAttribute('aria-hidden', 'true');
    $('#themeBtn')?.setAttribute('aria-expanded', 'false');
  }

  function selectUiTheme(theme) {
    if (!UI_THEME_NAMES[theme]) return;
    if (state.dirty && settings.autosave) saveDraft();
    settings.uiTheme = theme;
    settings.accent = UI_THEME_ACCENTS[theme] || settings.accent;
    if ($('#settingUiTheme')) $('#settingUiTheme').value = theme;
    if (!storage.set('settings', settings)) updateSaveState(true, true);
    applySettings(false);
    toast(langText(`${UI_THEME_NAMES[theme]} theme applied.`, `تم تطبيق ثيم ${UI_THEME_NAMES[theme]}.`), 'success');
  }

  function selectColorMode(mode) {
    if (!['system','light','dark'].includes(mode)) return;
    settings.theme = mode;
    if (!storage.set('settings', settings)) updateSaveState(true, true);
    applySettings(false);
  }

  function updateThemeControls() {
    $$('[data-ui-theme]').forEach(button => button.classList.toggle('active', button.dataset.uiTheme === settings.uiTheme));
    $$('[data-color-mode]').forEach(button => button.classList.toggle('active', button.dataset.colorMode === settings.theme));
    const name = $('#activeThemeName');
    if (name) name.textContent = UI_THEME_NAMES[settings.uiTheme] || 'Aurora';
    const hidden = $('#settingUiTheme');
    if (hidden) hidden.value = settings.uiTheme;
  }

  function resetSettings() {
    if (state.dirty && settings.autosave) saveDraft();
    settings = { ...defaults };
    if (!storage.set('settings', settings)) updateSaveState(true, true);
    applySettings(true);
  }

  function clearAllData() {
    if (!confirm(langText('Delete all local projects, versions, snippets, settings and draft?','حذف كل المشاريع والإصدارات والمقاطع والإعدادات والمسودة؟'))) return;
    storage.clear();
    settings = { ...defaults };
    state.currentProjectId = null;
    applySettings(false);
    newPrompt(false, false);
    storage.remove('draft');
    renderProjects();
    renderSnippets();
    updateDashboard();
    toast(langText('All local data was cleared.','تم مسح كل البيانات المحلية.'), 'warning');
  }

  function exportDataObject() {
    const snippets = getStoredArray('snippets');
    const favorites = getStoredArray('favorites');
    return {
      app: 'PromptForge Nexus Studio by Shark',
      version: APP_VERSION,
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      settings: { ...settings },
      projects: structuredCloneSafe(getProjects()),
      snippets: structuredCloneSafe(snippets),
      favorites: [...favorites],
      draft: structuredCloneSafe(storage.get('draft', null))
    };
  }

  function exportBackup() {
    const data = exportDataObject();
    download(`promptforge_shark_backup_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(data, null, 2), 'application/json');
  }

  function restoreDataObject(data) {
    if (!data) return;
    storage.set('settings', data.settings || defaults);
    storage.set('projects', Array.isArray(data.projects) ? data.projects : []);
    storage.set('snippets', Array.isArray(data.snippets) ? data.snippets : []);
    storage.set('favorites', Array.isArray(data.favorites) ? data.favorites : []);
    if (data.draft) storage.set('draft', data.draft); else storage.remove('draft');
  }

  function sanitizeBackup(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.projects)) return null;
    const candidate = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    const safeSettings = sanitizeSettings(candidate);
    const projects = raw.projects.slice(0, MAX_PROJECTS).map(sanitizeProject).filter(Boolean);
    const snippets = (Array.isArray(raw.snippets) ? raw.snippets : []).slice(0,200).map(sanitizeSnippet).filter(Boolean);
    const favorites = (Array.isArray(raw.favorites) ? raw.favorites : []).filter(id => typeof id === 'string' && D.templates.some(t => t.id === id));
    const draft = raw.draft?.form && typeof raw.draft.form === 'object' ? { form:sanitizeForm(raw.draft.form), currentProjectId:typeof raw.draft.currentProjectId === 'string' ? raw.draft.currentProjectId : null, savedAt:typeof raw.draft.savedAt === 'string' ? raw.draft.savedAt : new Date().toISOString() } : null;
    return { settings:safeSettings, projects, snippets, favorites:[...new Set(favorites)], draft };
  }

  function sanitizeProject(project) {
    if (!project || typeof project !== 'object' || typeof project.id !== 'string') return null;
    const form = sanitizeForm(project.form || {});
    const versions = (Array.isArray(project.versions) ? project.versions : []).slice(0, MAX_VERSIONS).map(version => {
      if (!version || typeof version !== 'object') return null;
      return { id:typeof version.id === 'string' ? version.id : uid(), createdAt:safeDate(version.createdAt), score:clampScore(version.score), prompt:String(version.prompt || '').slice(0,500000), markdown:String(version.markdown || '').slice(0,500000), form:sanitizeForm(version.form || form) };
    }).filter(Boolean);
    return { id:project.id, title:String(project.title || 'Untitled Prompt').slice(0,160), taskType:taskLabels[project.taskType] ? project.taskType : form.taskType, createdAt:safeDate(project.createdAt), updatedAt:safeDate(project.updatedAt), score:clampScore(project.score), form, prompt:String(project.prompt || '').slice(0,500000), markdown:String(project.markdown || '').slice(0,500000), versions };
  }

  function sanitizeSnippet(item) {
    if (!item || typeof item !== 'object') return null;
    const name = String(item.name || '').trim().slice(0,100);
    const content = String(item.content || '').trim().slice(0,20000);
    if (!name || !content) return null;
    return { id:typeof item.id === 'string' ? item.id : uid(), name, category:String(item.category || 'Custom').slice(0,60), content, createdAt:safeDate(item.createdAt), updatedAt:item.updatedAt ? safeDate(item.updatedAt) : undefined };
  }

  function sanitizeForm(form) {
    const base = collectForm();
    const raw = form && typeof form === 'object' && !Array.isArray(form) ? form : {};
    const safe = { ...base, ...raw };
    const enumValue = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
    safe.targetModel = modelLabels[safe.targetModel] ? safe.targetModel : settings.defaultModel;
    const targetProfile = modelLabels[safe.targetModel] || modelLabels[settings.defaultModel];
    safe.customModelName = String(safe.customModelName || '').trim().slice(0,160);
    safe.reasoningEffort = targetProfile.reasoning.some(([id]) => id === safe.reasoningEffort) ? safe.reasoningEffort : targetProfile.defaultReasoning;
    safe.executionMode = executionLabels[safe.executionMode] ? safe.executionMode : 'document-production';
    safe.taskType = taskLabels[safe.taskType] ? safe.taskType : 'custom';
    safe.outputFormat = enumValue(safe.outputFormat, ['DOCX','PDF','PPTX','PROMPT'], 'PROMPT');
    safe.sourceType = enumValue(safe.sourceType, ['lecture','pdf','slides','scans','word-reference','discussion','none'], 'lecture');
    safe.promptDepth = enumValue(safe.promptDepth, ['compact','professional','maximum'], settings.depth);
    safe.fidelity = D.fidelity.some(item => item.id === safe.fidelity) ? safe.fidelity : 'strict';
    safe.languageMode = enumValue(safe.languageMode, ['preserve','english','arabic','egyptian','bilingual'], 'preserve');
    safe.organization = enumValue(safe.organization, ['preserve','chapter','topic','lecture','line-by-line','reference','workbook','section-slides','social-post'], 'chapter');
    safe.pageSize = enumValue(safe.pageSize, ['A4','A3','Letter','16:9','16:9 Slides','Custom'], 'A4');
    safe.orientation = enumValue(safe.orientation, ['portrait','landscape'], 'portrait');
    safe.difficulty = enumValue(safe.difficulty, ['easy','medium','difficult','mixed'], 'mixed');
    safe.answerMode = enumValue(safe.answerMode, ['answer-only','answer-explanation','separate-key','none'], 'answer-explanation');
    safe.features = Array.isArray(safe.features) ? [...new Set(safe.features.filter(id => featureLabels[id]))] : [];
    safe.customRules = Array.isArray(safe.customRules) ? safe.customRules.map(x => String(x).trim().slice(0,10000)).filter(Boolean).slice(0,200) : [];
    safe.projectTitle = String(safe.projectTitle || '').trim().slice(0,160);
    safe.primaryGoal = String(safe.primaryGoal || '').trim().slice(0,20000);
    safe.audience = String(safe.audience || '').trim().slice(0,500);
    safe.margins = String(safe.margins || '1.5 cm').trim().slice(0,80);
    safe.designTheme = String(safe.designTheme || 'Premium Academic Blue').trim().slice(0,120);
    safe.fontFamily = String(safe.fontFamily || 'Aptos, Arial, Cairo').trim().slice(0,160);
    safe.bodySize = String(safe.bodySize || '12–14 pt').trim().slice(0,80);
    safe.questionCount = Math.max(0, Math.min(100, Number(safe.questionCount) || 0));
    safe.qaChecklist = safe.qaChecklist !== false;
    safe.sourceOnly = safe.sourceOnly !== false;
    safe.documentLog = safe.documentLog !== false;
    safe.colors = { primary:normalizeHex(safe.colors?.primary, '#0066cc'), navy:normalizeHex(safe.colors?.navy, '#12345b'), accent:normalizeHex(safe.colors?.accent, '#f59e0b'), light:normalizeHex(safe.colors?.light, '#eaf4ff') };
    return safe;
  }

  function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) return toast(langText('Backup is too large. Maximum size is 8 MB.','حجم النسخة الاحتياطية كبير جدًا. الحد الأقصى 8 ميجابايت.'), 'danger');
    if (!confirm(langText('Importing will replace current local projects, blocks, favorites and draft. Continue?','الاستيراد سيستبدل المشاريع والمقاطع والمفضلة والمسودة الحالية. هل تريد المتابعة؟'))) return;
    const reader = new FileReader();
    reader.onerror = () => toast(langText('The backup file could not be read.','تعذر قراءة ملف النسخة الاحتياطية.'), 'danger');
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result || ''));
        const data = sanitizeBackup(raw);
        if (!data) throw new Error('Invalid backup');
        const previous = exportDataObject();
        const writes = [
          storage.set('settings', data.settings),
          storage.set('projects', data.projects),
          storage.set('snippets', data.snippets),
          storage.set('favorites', data.favorites),
          data.draft ? storage.set('draft', data.draft) : (storage.remove('draft'), true)
        ];
        if (writes.some(ok => ok === false)) {
          restoreDataObject(previous);
          throw new Error('Storage write failed');
        }
        settings = { ...defaults, ...data.settings };
        applySettings(false);
        loadDraft();
        refreshStoredViews();
        toast(langText('Backup imported successfully.','تم استيراد النسخة الاحتياطية بنجاح.'), 'success');
      } catch {
        toast(langText('Invalid or incompatible backup file. No data was changed.','ملف النسخة الاحتياطية غير صالح أو غير متوافق. لم يتم تغيير البيانات.'), 'danger');
      }
    };
    reader.readAsText(file);
  }

  function renderDiagnostics(execute) {
    const integrity = validateLocalData();
    const usage = calculateStorageUsage();
    const checks = execute ? [
      ['Local Storage', testStorage(), 'Projects and settings can be stored locally.'],
      ['Data Integrity', integrity.ok, integrity.detail],
      ['Storage Usage', usage < 4.5 * 1024 * 1024, `${(usage / 1024).toFixed(1)} KB used by PromptForge data.`],
      ['Clipboard', Boolean(navigator.clipboard) || Boolean(document.queryCommandSupported?.('copy')), 'Prompt copy support is available.'],
      ['File Download', typeof Blob === 'function' && typeof URL.createObjectURL === 'function', 'Local export is supported.'],
      ['Offline Cache', 'serviceWorker' in navigator && 'caches' in window, 'Offline application caching is supported when served over HTTP.'],
      ['Prompt Engine', Boolean(state.generated.prompt) && Number.isFinite(state.quality), 'Prompt compilation and quality scoring are working.']
    ] : [
      ['Local Storage', null, 'Run diagnostics to test local storage.'],
      ['Data Integrity', null, 'Run diagnostics to validate stored data.'],
      ['Storage Usage', null, 'Run diagnostics to measure local usage.'],
      ['Clipboard', null, 'Run diagnostics to test copy support.'],
      ['File Download', null, 'Run diagnostics to test local export.'],
      ['Offline Cache', null, 'Run diagnostics to test offline support.'],
      ['Prompt Engine', null, 'Run diagnostics to test prompt generation.']
    ];
    state.diagnosticLog = checks.map(([name, ok, detail]) => ({ name, ok, detail, checkedAt:new Date().toISOString() }));
    $('#diagnosticGrid').innerHTML = checks.map(([name, ok, detail]) => `
      <article class="diagnostic-card panel"><header><span class="diag-icon">${ok === null ? '•' : ok ? '✓' : '!'}</span><span class="status-badge ${ok === null ? 'neutral' : ok ? 'success' : 'danger'}">${ok === null ? 'NOT TESTED' : ok ? 'PASS' : 'CHECK'}</span></header><b>${name}</b><small>${detail}</small></article>`).join('');
    if (execute) toast(langText('Diagnostics completed.','اكتمل فحص النظام.'), integrity.ok ? 'success' : 'warning');
  }

  function testStorage() {
    try { localStorage.setItem(PREFIX + '__test', '1'); localStorage.removeItem(PREFIX + '__test'); return true; } catch { return false; }
  }

  function repairStorage() {
    const keys = ['settings','projects','snippets','favorites','draft','lastScore'];
    let repaired = 0;
    keys.forEach(key => {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        if (raw !== null) JSON.parse(raw);
      } catch {
        storage.remove(key);
        repaired++;
      }
    });
    const safe = sanitizeBackup(exportDataObject());
    if (safe) {
      storage.set('settings', safe.settings);
      storage.set('projects', safe.projects);
      storage.set('snippets', safe.snippets);
      storage.set('favorites', safe.favorites);
      if (safe.draft) storage.set('draft', safe.draft); else storage.remove('draft');
    }
    settings = sanitizeSettings(storage.get('settings', {}));
    applySettings(false);
    refreshStoredViews();
    renderDiagnostics(true);
    toast(repaired ? langText(`Repaired ${repaired} corrupted entries.`,`تم إصلاح ${repaired} عنصر تالف.`) : langText('Local storage was validated and normalized.','تم فحص وتنظيم التخزين المحلي.'), 'success');
  }

  async function clearCache() {
    try {
      if (state.dirty && !settings.autosave && !confirm(langText('Reloading may discard unsaved changes. Continue?','إعادة التحميل قد تفقد التغييرات غير المحفوظة. هل تريد المتابعة؟'))) return;
      if (state.dirty) saveDraft();
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith('promptforge-')).map(key => caches.delete(key)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.unregister()));
      }
      toast(langText('Cache cleared. Reloading the latest version…','تم مسح الـCache. يتم تحميل أحدث نسخة…'), 'success');
      setTimeout(() => location.reload(), 700);
    } catch {
      toast(langText('Cache could not be cleared.','تعذر مسح الـCache.'), 'danger');
    }
  }

  function downloadDiagnosticLog() {
    const report = { app:'PromptForge Nexus Studio by Shark', version:APP_VERSION, generatedAt:new Date().toISOString(), userAgent:navigator.userAgent, settings, checks:state.diagnosticLog };
    download(`promptforge_diagnostics_${Date.now()}.json`, JSON.stringify(report, null, 2), 'application/json');
  }

  function updateDashboard() {
    const projects = getProjects();
    const snippets = D.builtInSnippets.length + getStoredArray('snippets').length;
    $('#metricProjects').textContent = projects.length;
    $('#metricTemplates').textContent = D.templates.length;
    $('#metricSnippets').textContent = snippets;
    const scores = projects.map(item => Number(item.score)).filter(Number.isFinite);
    $('#metricScore').textContent = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : storage.get('lastScore', '—');
    $('#recentProjects').innerHTML = projects.length ? [...projects].sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0,5).map(project => `
      <button class="recent-row" data-project-action="open" data-id="${project.id}">
        <span class="recent-icon">${taskIcon(project.taskType)}</span>
        <span><b>${escapeHtml(project.title)}</b><small>${formatDate(project.updatedAt)}</small></span>
        <span class="status-badge ${Number(project.score) >= 80 ? 'success' : Number(project.score) >= 60 ? 'warning' : 'danger'}">${clampScore(project.score)}</span>
      </button>`).join('') : `<div class="empty-state">${langText('Create and save your first prompt.','أنشئ واحفظ أول Prompt.')}</div>`;
  }

  function renderCommands(query = '') {
    const pages = [
      ['dashboard','⌂',langText('Dashboard','الرئيسية')],['builder','✦',langText('Prompt Builder','منشئ Prompt')],['templates','▦',langText('Templates','القوالب')],['snippets','⌘',langText('Smart Blocks','المقاطع الذكية')],['projects','◫',langText('Projects','المشاريع')],['guide','?',langText('User Guide','دليل الاستخدام')],['settings','⚙',langText('Settings','الإعدادات')],['maintenance','◇',langText('Maintenance','الصيانة')],['about','◉',langText('About — Made by Shark','حول الموقع — Made by Shark')]
    ].map(([value,icon,title]) => ({ command:'view', value, icon, title, subtitle:langText('Open page','فتح الصفحة') }));
    const actions = [
      { command:'new', value:'', icon:'＋', title:langText('New Prompt','Prompt جديد'), subtitle:langText('Clear the current draft','مسح المسودة الحالية') },
      { command:'save', value:'', icon:'✓', title:langText('Save Project','حفظ المشروع'), subtitle:'Ctrl + S' },
      { command:'copy', value:'', icon:'⧉', title:langText('Copy Prompt','نسخ Prompt'), subtitle:langText('Copy current output','نسخ المخرج الحالي') },
      { command:'backup', value:'', icon:'⇩', title:langText('Export Backup','تصدير نسخة احتياطية'), subtitle:langText('Download all local data','تنزيل كل البيانات المحلية') }
    ];
    const templates = D.templates.map(template => ({ command:'template', value:template.id, icon:template.icon, title:langText(template.title, template.titleAr), subtitle:langText('Load template','تحميل قالب') }));
    const normalized = normalizeSemanticText(query);
    const terms = normalized.split(' ').filter(Boolean);
    const results = [...pages, ...actions, ...templates]
      .map((item, order) => {
        const haystack = normalizeSemanticText(`${item.title} ${item.subtitle} ${item.value}`);
        const matches = !terms.length || terms.every(term => haystack.includes(term));
        const score = !normalized ? 0 : haystack.startsWith(normalized) ? 30 : haystack.includes(normalized) ? 20 : terms.reduce((sum, term) => sum + (haystack.includes(term) ? 4 : 0), 0);
        return { ...item, order, matches, score };
      })
      .filter(item => item.matches)
      .sort((a,b) => b.score - a.score || a.order - b.order)
      .slice(0,18);
    state.commandIndex = Math.min(state.commandIndex, Math.max(0, results.length - 1));
    $('#commandResults').innerHTML = results.map((item,index) => `<button aria-selected="${index === state.commandIndex}" class="command-item ${index === state.commandIndex ? 'active' : ''}" data-command="${item.command}" data-value="${item.value}" id="command-option-${index}" role="option" type="button"><span>${item.icon}</span><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.subtitle)}</small></div></button>`).join('') || `<div class="empty-state">${langText('No matching command.','لا يوجد أمر مطابق.')}</div>`;
    $('#commandInput')?.setAttribute('aria-activedescendant', results.length ? `command-option-${state.commandIndex}` : '');
  }

  function openCommandPalette() {
    if ($('#commandPalette').classList.contains('open')) return;
    state.commandPreviousFocus = document.activeElement === $('#globalSearch') ? null : document.activeElement;
    $('#commandPalette').classList.add('open');
    $('#commandPalette').setAttribute('aria-hidden','false');
    document.body.classList.add('dialog-open');
    $('#commandInput').value = '';
    state.commandIndex = 0;
    renderCommands();
    setTimeout(() => $('#commandInput').focus(), 20);
    $('#globalSearch').blur();
  }

  function closeCommandPalette() {
    if (!$('#commandPalette').classList.contains('open')) return;
    $('#commandPalette').classList.remove('open');
    $('#commandPalette').setAttribute('aria-hidden','true');
    document.body.classList.toggle('dialog-open', $('#modalBackdrop').classList.contains('open'));
    if (state.commandPreviousFocus?.focus) state.commandPreviousFocus.focus();
    state.commandPreviousFocus = null;
  }

  function executeCommand(command, value) {
    closeCommandPalette();
    if (command === 'view') return showView(value);
    if (command === 'template') return applyTemplate(value);
    if (command === 'new') return newPrompt(true);
    if (command === 'save') return saveProject();
    if (command === 'copy') return copyPrompt();
    if (command === 'backup') return exportBackup();
  }

  function openModal(title, html) {
    state.previousFocus = document.activeElement;
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    $('#modalBackdrop').classList.add('open');
    $('#modalBackdrop').setAttribute('aria-hidden','false');
    document.body.classList.add('dialog-open');
    setTimeout(() => $('#modalCloseBtn').focus(), 20);
  }
  function closeModal() {
    if (!$('#modalBackdrop').classList.contains('open')) return;
    $('#modalBackdrop').classList.remove('open');
    $('#modalBackdrop').setAttribute('aria-hidden','true');
    document.body.classList.toggle('dialog-open', $('#commandPalette').classList.contains('open'));
    if (state.previousFocus?.focus) state.previousFocus.focus();
    state.previousFocus = null;
  }

  function trapFocus(container, event) {
    const focusable = $$('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', container)
      .filter(element => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) return event.preventDefault();
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      state.installPrompt = event;
      if ($('#installAppBtn')) $('#installAppBtn').hidden = false;
    });
    window.addEventListener('appinstalled', () => {
      state.installPrompt = null;
      if ($('#installAppBtn')) $('#installAppBtn').hidden = true;
      toast(langText('PromptForge was installed.','تم تثبيت PromptForge.'), 'success');
    });
  }

  async function installApp() {
    if (!state.installPrompt) return;
    await state.installPrompt.prompt();
    await state.installPrompt.userChoice.catch(() => null);
    state.installPrompt = null;
    if ($('#installAppBtn')) $('#installAppBtn').hidden = true;
  }

  function showUpdateBanner(worker) {
    state.updateWorker = worker;
    if ($('#updateBanner')) $('#updateBanner').hidden = false;
  }

  function applyAppUpdate() {
    if (!state.updateWorker) return;
    let reloading = false;
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
    state.updateWorker.postMessage('SKIP_WAITING');
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
    navigator.serviceWorker.register('./sw.js').then(registration => {
      if (registration.waiting && navigator.serviceWorker.controller) showUpdateBanner(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(worker);
        });
      });
      registration.update().catch(() => {});
    }).catch(() => {});
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('Copy failed');
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type:`${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toast(message, type = '') {
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.setAttribute('role', type === 'danger' ? 'alert' : 'status');
    element.textContent = message;
    $('#toastStack').appendChild(element);
    setTimeout(() => element.remove(), 3200);
  }


  function normalizeStoredData() {
    const currentSettings = sanitizeSettings(storage.get('settings', {}));
    const projects = getStoredArray('projects').slice(0, MAX_PROJECTS).map(sanitizeProject).filter(Boolean);
    const snippets = getStoredArray('snippets').slice(0,200).map(sanitizeSnippet).filter(Boolean);
    const favorites = [...new Set(getStoredArray('favorites').filter(id => typeof id === 'string' && D.templates.some(template => template.id === id)))];
    const draftRaw = storage.get('draft', null);
    const draft = draftRaw?.form && typeof draftRaw.form === 'object' ? { form:sanitizeForm(draftRaw.form), currentProjectId:typeof draftRaw.currentProjectId === 'string' ? draftRaw.currentProjectId : null, savedAt:safeDate(draftRaw.savedAt) } : null;
    settings = currentSettings;
    storage.set('settings', currentSettings);
    storage.set('projects', projects);
    storage.set('snippets', snippets);
    storage.set('favorites', favorites);
    if (draft) storage.set('draft', draft); else storage.remove('draft');
  }

  function validateLocalData() {
    try {
      const projects = getProjects();
      const snippets = getStoredArray('snippets');
      const favorites = getStoredArray('favorites');
      const valid = projects.every(item => item && typeof item.id === 'string' && item.form && typeof item.form === 'object') && snippets.every(item => item && typeof item.id === 'string') && favorites.every(id => typeof id === 'string');
      return { ok:valid, detail:valid ? `${projects.length} projects and ${snippets.length} custom blocks validated.` : 'Stored data has an invalid structure. Use Repair Storage.' };
    } catch {
      return { ok:false, detail:'Stored data could not be validated. Use Repair Storage.' };
    }
  }

  function calculateStorageUsage() {
    try {
      return Object.keys(localStorage).filter(key => key.startsWith(PREFIX)).reduce((sum, key) => sum + key.length + (localStorage.getItem(key)?.length || 0), 0) * 2;
    } catch { return 0; }
  }

  function updateSaveState(dirty, error = false) {
    state.dirty = Boolean(dirty);
    const element = $('#saveState');
    if (!element) return;
    const stateName = error ? 'error' : state.dirty ? 'unsaved' : 'saved';
    element.dataset.state = stateName;
    element.textContent = error ? langText('Storage error','خطأ في الحفظ') : state.dirty ? langText('Unsaved','غير محفوظ') : langText('Saved','محفوظ');
  }

  function refreshStoredViews() {
    renderProjects();
    renderSnippets();
    renderTemplates();
    updateDashboard();
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? langText('Unknown date','تاريخ غير معروف') : date.toLocaleString(settings.language === 'ar' ? 'ar-EG' : 'en-US');
  }

  function safeDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function clampScore(value) { return Math.max(0, Math.min(100, Number(value) || 0)); }

  function normalizeHex(value, fallback = '#0b63ce') {
    const text = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
  }

  function hexToRgb(hex) {
    const value = normalizeHex(hex).slice(1);
    return { r:parseInt(value.slice(0,2),16), g:parseInt(value.slice(2,4),16), b:parseInt(value.slice(4,6),16) };
  }

  function mixHex(first, second, amount) {
    const a = hexToRgb(first), b = hexToRgb(second);
    const mix = key => Math.round(a[key] + (b[key] - a[key]) * amount).toString(16).padStart(2,'0');
    return `#${mix('r')}${mix('g')}${mix('b')}`;
  }

  function bindSystemThemeListener() {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => { if (settings.theme === 'system') applySettings(false); };
    if (typeof media.addEventListener === 'function') media.addEventListener('change', listener);
    else if (typeof media.addListener === 'function') media.addListener(listener);
  }

  function uid() { return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }
  function slug(text) { return String(text || 'prompt').trim().replace(/[^\p{L}\p{N}]+/gu,'_').replace(/^_+|_+$/g,'').slice(0,80) || 'prompt'; }
  function structuredCloneSafe(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
  function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char])); }

  function runSelfTest() {
    try {
      applyTemplate('comprehensive-study-guide');
      $('#projectTitle').value = 'Automated Test Project';
      $('#primaryGoal').value = 'Create a comprehensive, editable and exam-focused study guide from the complete source material.';
      $('#audience').value = 'University students';
      compilePrompt();
      const checks = [
        D.modelProfiles.length >= 8,
        D.templates.length >= 12,
        state.generated.prompt.includes('SYSTEM ROLE'),
        state.generated.prompt.includes('TARGET MODEL AND EXECUTION PROFILE'),
        state.generated.prompt.includes('GPT-5.6 Sol'),
        state.generated.prompt.includes('QUALITY ASSURANCE'),
        state.quality > 60,
        Array.isArray(state.conflicts),
        $('#view-about') !== null,
        !document.querySelector('script[src*="backend"]')
      ];
      $('#selfTestStatus').dataset.status = checks.every(Boolean) ? 'PASS' : 'FAIL';
      $('#selfTestStatus').textContent = JSON.stringify({ checks, quality:state.quality, conflicts:state.conflicts.length });
    } catch (error) {
      $('#selfTestStatus').dataset.status = 'ERROR';
      $('#selfTestStatus').textContent = error.stack || String(error);
    }
  }

  init();
})();
