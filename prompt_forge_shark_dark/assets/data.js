window.PFS_DATA = (() => {
  const taskTypes = [
    ['word-template','Word Template','قالب Word قابل للتعديل'],
    ['study-guide','Premium Study Guide','دليل مذاكرة احترافي'],
    ['strict-word','Strict Word Publishing','تنسيق Word مع حفظ كامل للمحتوى'],
    ['question-bank','Question Bank','بنك أسئلة شامل'],
    ['lecture-questions','Lecture + Questions','محاضرة Word مع أسئلة'],
    ['presentation','PowerPoint Conversion','تحويل إلى PowerPoint'],
    ['egyptian-translation','Egyptian Arabic Translation','ترجمة للهجة المصرية'],
    ['highlight-only','Selective Highlighting','تمييز الكلمات المهمة فقط'],
    ['bilingual','Bilingual Learning','إنجليزي ثم مصري'],
    ['educational-visuals','Educational Visuals','صور ورسومات تعليمية'],
    ['social-rewrite','Social Rewrite','إعادة كتابة منشور اجتماعي'],
    ['custom','Custom Prompt','Prompt مخصص بالكامل']
  ];

  const fidelity = [
    {id:'strict',title:'Strict Preservation',titleAr:'حفظ كامل 100%',desc:'Preserve every original word and only change formatting.',descAr:'الحفاظ على كل كلمة وتغيير التنسيق فقط.'},
    {id:'format-only',title:'Formatting Only',titleAr:'تنسيق فقط',desc:'Repair layout without rewriting content.',descAr:'إصلاح التنسيق والهيكل بدون إعادة صياغة.'},
    {id:'light-edit',title:'Light Editing',titleAr:'تحرير خفيف',desc:'Fix OCR, grammar and split-word errors only.',descAr:'إصلاح OCR والأخطاء الواضحة فقط.'},
    {id:'study',title:'Study Guide Mode',titleAr:'وضع دليل المذاكرة',desc:'Organize and explain while preserving academic meaning.',descAr:'تنظيم وشرح مع الحفاظ على المعنى الأكاديمي.'},
    {id:'enhance',title:'Intelligent Enhancement',titleAr:'تحسين ذكي',desc:'Add clearly labelled study aids and visual learning support.',descAr:'إضافة وسائل تعليمية منفصلة وموسومة بوضوح.'},
    {id:'rewrite',title:'Full Rewrite',titleAr:'إعادة كتابة كاملة',desc:'Create a new version while preserving the intended message.',descAr:'إنشاء نسخة جديدة تحافظ على الفكرة الأساسية.'}
  ];

  const contentRules = [
    ['preserve-definitions','Preserve definitions','الحفاظ على التعريفات'],
    ['preserve-formulas','Preserve formulas and notation','الحفاظ على المعادلات والرموز'],
    ['preserve-tables','Preserve tables and values','الحفاظ على الجداول والقيم'],
    ['preserve-examples','Preserve examples','الحفاظ على الأمثلة'],
    ['preserve-references','Preserve references and slide numbers','الحفاظ على المراجع وأرقام الشرائح'],
    ['repair-ocr','Repair obvious OCR errors','إصلاح أخطاء OCR الواضحة'],
    ['organize-headings','Use real heading hierarchy','استخدام تسلسل عناوين حقيقي'],
    ['short-paragraphs','Keep paragraphs short','جعل الفقرات قصيرة'],
    ['use-tables','Use tables for comparisons','استخدام الجداول للمقارنات'],
    ['bold-terms','Bold important terms selectively','تمييز المصطلحات المهمة باعتدال']
  ];

  const documentFeatures = [
    ['cover','Professional cover page','غلاف احترافي'],
    ['toc','Automatic table of contents','جدول محتويات تلقائي'],
    ['header-footer','Consistent header and footer','هيدر وفوتر ثابتان'],
    ['page-numbers','Automatic page numbering','ترقيم صفحات تلقائي'],
    ['first-page','Different first-page header','هيدر مختلف للصفحة الأولى'],
    ['editable-elements','All elements remain editable','كل العناصر قابلة للتعديل'],
    ['stable-tables','Use tables for stable alignment','استخدام الجداول لتثبيت المحاذاة'],
    ['print-ready','Print-ready layout','تنسيق جاهز للطباعة'],
    ['mobile-copy','Create a mobile-friendly copy','إنشاء نسخة مناسبة للموبايل'],
    ['document-log','Document Log for unclear content','سجل للمحتوى غير الواضح']
  ];

  const boxFeatures = [
    ['definition-box','Definition box','صندوق تعريف'],
    ['core-box','Core Concept box','صندوق الفكرة الأساسية'],
    ['formula-box','Formula box','صندوق معادلة'],
    ['exam-box','Exam Focus box','صندوق تركيز امتحاني'],
    ['high-yield-box','High-Yield Point box','صندوق أهم النقاط'],
    ['notes-box','Notes box','صندوق ملاحظات'],
    ['study-aid-box','Study Aid box','صندوق مساعدة تعليمية'],
    ['memory-box','Memory Tip box','صندوق تلميح للحفظ'],
    ['confuse-box','Do Not Confuse box','صندوق لا تخلط'],
    ['self-test-box','Quick Self-Test box','صندوق اختبار سريع'],
    ['takeaways-box','Key Takeaways box','صندوق أهم الخلاصات'],
    ['summary-box','Summary box','صندوق ملخص']
  ];

  const visualFeatures = [
    ['flowchart','Process flowcharts','مخططات خطوات'],
    ['concept-map','Concept maps','خرائط مفاهيم'],
    ['classification-tree','Classification trees','أشجار تصنيف'],
    ['comparison-diagram','Comparison diagrams','رسومات مقارنة'],
    ['timeline','Timelines','خطوط زمنية'],
    ['relationship-map','Relationship maps','خرائط علاقات'],
    ['cause-effect','Cause-and-effect maps','خرائط سبب ونتيجة'],
    ['decision-tree','Decision trees','أشجار قرار'],
    ['figure-captions','Numbered figures and captions','ترقيم وعناوين للرسومات'],
    ['source-only-visuals','Use source-supported facts only','رسومات من معلومات المصدر فقط']
  ];

  const questionFeatures = [
    ['mcq','Multiple-choice questions','اختيار من متعدد'],
    ['true-false','True / False','صح أو خطأ'],
    ['fill-blanks','Fill in the blanks','أكمل الفراغ'],
    ['define','Define','عرّف'],
    ['compare','Compare between','قارن بين'],
    ['explain-why','Explain why','علّل'],
    ['short-answer','Short answer','إجابة قصيرة'],
    ['essay','Essay questions','أسئلة مقالية'],
    ['case-based','Case-based questions','أسئلة تطبيقية'],
    ['mock-exam','Comprehensive mock exam','امتحان شامل']
  ];

  const prohibitedRules = [
    ['no-omission','Do not omit source content','عدم حذف محتوى المصدر'],
    ['no-guessing','Never guess unreadable text','عدم تخمين النص غير المقروء'],
    ['no-flat-image','Do not use a flat page image','عدم استخدام الصفحة كصورة مسطحة'],
    ['no-lock','Do not lock the document','عدم قفل الملف'],
    ['no-filler','Do not add filler or unsupported claims','عدم إضافة حشو أو معلومات غير مدعومة'],
    ['no-overhighlight','Do not highlight full paragraphs','عدم تمييز فقرات كاملة'],
    ['no-overcrowding','Do not overcrowd pages or slides','عدم تكديس الصفحات أو الشرائح'],
    ['no-random-icons','Do not use random decorative icons','عدم استخدام أيقونات عشوائية'],
    ['no-external-facts','Do not add external facts unless allowed','عدم إضافة معلومات خارجية إلا عند السماح'],
    ['no-meaning-change','Do not change academic meaning','عدم تغيير المعنى الأكاديمي']
  ];

  const templates = [
    {
      id:'premium-word-template',category:'Word',icon:'▣',title:'Premium Editable Word Template',titleAr:'قالب Word تعليمي احترافي',desc:'A4 educational notes template with editable boxes, styles, cover, TOC and stable page structure.',descAr:'قالب A4 للمذكرات التعليمية بصناديق وأنماط وغلاف وجدول محتويات.',popularity:98,
      config:{taskType:'word-template',outputFormat:'DOCX',fidelity:'format-only',languageMode:'bilingual',organization:'workbook',designTheme:'Premium Academic Blue',primaryGoal:'Create a fully editable, reusable and print-ready Microsoft Word A4 educational notes template.',features:['cover','toc','header-footer','page-numbers','first-page','editable-elements','stable-tables','print-ready','definition-box','formula-box','exam-box','notes-box','summary-box','self-test-box','no-flat-image','no-lock','no-overcrowding']}
    },
    {
      id:'comprehensive-study-guide',category:'Study',icon:'◆',title:'Comprehensive Premium Study Guide',titleAr:'دليل مذاكرة احترافي شامل',desc:'Organized chapter-by-chapter guide with exam points, revision questions and summaries.',descAr:'دليل منظم فصلًا فصلًا مع نقاط امتحانية وأسئلة ومراجعة نهائية.',popularity:97,
      config:{taskType:'study-guide',outputFormat:'DOCX',fidelity:'study',languageMode:'english',organization:'chapter',designTheme:'Premium Academic Blue',primaryGoal:'Create a comprehensive premium study guide optimized for efficient exam revision.',features:['cover','toc','header-footer','page-numbers','preserve-definitions','preserve-formulas','preserve-tables','preserve-examples','organize-headings','short-paragraphs','use-tables','bold-terms','definition-box','formula-box','exam-box','takeaways-box','summary-box','mcq','true-false','define','compare','explain-why','short-answer','essay','mock-exam','no-meaning-change','no-filler']}
    },
    {
      id:'fixed-reference-enhanced',category:'Study',icon:'◈',title:'Fixed Word Reference + Enhancement',titleAr:'مرجع Word ثابت مع تحسين ذكي',desc:'Preserves a reference document identity while adding clearly labelled educational enhancements.',descAr:'يحافظ على هوية ملف Word المرجعي مع تحسينات تعليمية منفصلة بوضوح.',popularity:96,
      config:{taskType:'study-guide',outputFormat:'DOCX',sourceType:'word-reference',fidelity:'enhance',languageMode:'preserve',organization:'reference',designTheme:'Premium University Blue',primaryGoal:'Use the approved Word reference as the mandatory design foundation and improve it intelligently without losing source content.',features:['cover','toc','header-footer','page-numbers','preserve-definitions','preserve-formulas','preserve-tables','preserve-examples','preserve-references','repair-ocr','definition-box','core-box','formula-box','exam-box','high-yield-box','notes-box','study-aid-box','memory-box','confuse-box','self-test-box','takeaways-box','flowchart','concept-map','classification-tree','comparison-diagram','timeline','relationship-map','figure-captions','source-only-visuals','no-omission','no-guessing','no-filler','no-overcrowding','no-random-icons']}
    },
    {
      id:'strict-publication-word',category:'Word',icon:'▤',title:'Strict Publication-Quality Word',titleAr:'Word أكاديمي مع حفظ كامل',desc:'Publication-quality Word formatting with absolute text fidelity and issue logging.',descAr:'تنسيق نشر أكاديمي مع الحفاظ الكامل على النص وتسجيل المشكلات.',popularity:94,
      config:{taskType:'strict-word',outputFormat:'DOCX',fidelity:'strict',languageMode:'preserve',organization:'preserve',designTheme:'Academic Blue',primaryGoal:'Convert the source into a publication-quality Word document while preserving every word exactly.',features:['cover','toc','header-footer','page-numbers','editable-elements','stable-tables','print-ready','document-log','preserve-definitions','preserve-formulas','preserve-tables','preserve-examples','preserve-references','organize-headings','definition-box','formula-box','exam-box','no-omission','no-guessing','no-meaning-change','no-external-facts']}
    },
    {
      id:'question-bank',category:'Assessment',icon:'?',title:'Complete Question Bank',titleAr:'بنك أسئلة شامل',desc:'Creates mixed question types, difficulty levels, explanations and a final mock exam.',descAr:'ينشئ أنواع أسئلة ومستويات مختلفة مع الإجابات وامتحان شامل.',popularity:95,
      config:{taskType:'question-bank',outputFormat:'DOCX',fidelity:'study',languageMode:'preserve',organization:'topic',designTheme:'Clean Academic',primaryGoal:'Generate a comprehensive question bank based strictly on every topic in the source material.',questionCount:8,difficulty:'mixed',answerMode:'answer-explanation',features:['organize-headings','preserve-formulas','preserve-definitions','mcq','true-false','fill-blanks','define','compare','explain-why','short-answer','essay','case-based','mock-exam','source-only-visuals','no-external-facts','no-filler']}
    },
    {
      id:'lecture-with-questions',category:'Assessment',icon:'✎',title:'Lecture + Practice Questions',titleAr:'محاضرة مع أسئلة تدريبية',desc:'Preserves the lecture and adds a separate practice and exam preparation section.',descAr:'يحافظ على المحاضرة ويضيف قسمًا منفصلًا للتدريب والاستعداد للامتحان.',popularity:93,
      config:{taskType:'lecture-questions',outputFormat:'DOCX',fidelity:'strict',languageMode:'preserve',organization:'chapter',designTheme:'Modern Blue Academic',primaryGoal:'Create a professional Word document containing the complete lecture plus a separate comprehensive practice section.',questionCount:6,difficulty:'mixed',answerMode:'answer-explanation',features:['cover','toc','header-footer','page-numbers','preserve-definitions','preserve-formulas','preserve-tables','preserve-examples','bold-terms','mcq','true-false','fill-blanks','short-answer','essay','case-based','mock-exam','no-omission','no-meaning-change','no-external-facts']}
    },
    {
      id:'powerpoint-conversion',category:'Presentation',icon:'▰',title:'Academic PowerPoint Conversion',titleAr:'تحويل أكاديمي إلى PowerPoint',desc:'Professional blue presentation with balanced slides and full source coverage.',descAr:'عرض احترافي أزرق بشرائح متوازنة مع تغطية كاملة للمصدر.',popularity:91,
      config:{taskType:'presentation',outputFormat:'PPTX',fidelity:'study',languageMode:'preserve',organization:'section-slides',designTheme:'Modern Academic Blue',primaryGoal:'Convert the lecture into a clear, professional and engaging academic PowerPoint presentation.',features:['page-numbers','preserve-definitions','preserve-formulas','preserve-tables','preserve-examples','bold-terms','use-tables','flowchart','concept-map','comparison-diagram','timeline','no-omission','no-overcrowding','no-random-icons','no-meaning-change']}
    },
    {
      id:'egyptian-translation',category:'Language',icon:'ع',title:'Natural Egyptian Arabic Translation',titleAr:'ترجمة طبيعية للهجة المصرية',desc:'Natural Egyptian Arabic translation preserving meaning, tone and terminology.',descAr:'ترجمة مصرية طبيعية تحافظ على المعنى والنبرة والمصطلحات.',popularity:92,
      config:{taskType:'egyptian-translation',outputFormat:'PROMPT',fidelity:'rewrite',languageMode:'egyptian',organization:'preserve',designTheme:'None',primaryGoal:'Translate the supplied text into natural, professional Egyptian Arabic without adding or removing information.',features:['no-filler','no-meaning-change']}
    },
    {
      id:'selective-highlighting',category:'Editing',icon:'▥',title:'Selective Academic Highlighting',titleAr:'تمييز أكاديمي انتقائي',desc:'Highlights only key terms, formulas, dates and exam-focused words while preserving layout.',descAr:'يميز المصطلحات والمعادلات والتواريخ المهمة فقط مع الحفاظ على التنسيق.',popularity:90,
      config:{taskType:'highlight-only',outputFormat:'DOCX',fidelity:'strict',languageMode:'preserve',organization:'preserve',designTheme:'Original Document',primaryGoal:'Highlight only the most important academic words while leaving all original content and layout unchanged.',features:['preserve-definitions','preserve-formulas','preserve-tables','preserve-references','bold-terms','no-omission','no-overhighlight','no-meaning-change']}
    },
    {
      id:'bilingual-study',category:'Language',icon:'Aع',title:'English → Egyptian Arabic Learning',titleAr:'تعلم ثنائي إنجليزي ومصري',desc:'Places the original English first and an accurate Egyptian Arabic explanation directly below.',descAr:'يضع الإنجليزي الأصلي ثم شرحًا مصريًا دقيقًا تحته مباشرة.',popularity:89,
      config:{taskType:'bilingual',outputFormat:'DOCX',fidelity:'strict',languageMode:'bilingual',organization:'line-by-line',designTheme:'Bilingual Academic Blue',primaryGoal:'Create a bilingual study document with every English line followed by accurate Egyptian Arabic.',features:['cover','toc','header-footer','page-numbers','preserve-definitions','preserve-formulas','preserve-tables','definition-box','takeaways-box','no-omission','no-external-facts','no-meaning-change']}
    },
    {
      id:'educational-visuals',category:'Visual',icon:'⌁',title:'Source-Based Educational Visuals',titleAr:'رسومات تعليمية من المصدر',desc:'Generates only useful, source-supported diagrams with figure numbers and captions.',descAr:'ينشئ رسومات مفيدة ومدعومة بالمصدر مع ترقيم وعناوين.',popularity:87,
      config:{taskType:'educational-visuals',outputFormat:'DOCX',fidelity:'strict',languageMode:'preserve',organization:'source',designTheme:'Academic Blue + Grayscale',primaryGoal:'Create original educational diagrams only when they substantially improve understanding.',features:['flowchart','concept-map','classification-tree','comparison-diagram','timeline','relationship-map','cause-effect','decision-tree','figure-captions','source-only-visuals','no-external-facts','no-random-icons','no-filler']}
    },
    {
      id:'beauty-facebook-rewrite',category:'Social',icon:'◎',title:'Beauty Facebook Group Rewrite',titleAr:'إعادة كتابة منشور بيوتي لفيسبوك',desc:'Turns a discussion into an original, authentic beauty-community Facebook post.',descAr:'يحوّل النقاش إلى منشور أصلي وطبيعي لمجتمع بيوتي على فيسبوك.',popularity:84,
      config:{taskType:'social-rewrite',outputFormat:'PROMPT',fidelity:'rewrite',languageMode:'english',organization:'social-post',designTheme:'None',primaryGoal:'Write an original Facebook beauty-group post inspired by the supplied discussion without copying its wording.',features:['no-filler','no-random-icons']}
    }
  ];

  const builtInSnippets = [
    {id:'source-only',name:'Source Material Only',nameAr:'المصدر فقط',category:'Integrity',content:'Base all factual content strictly on the supplied source. Do not introduce external facts, assumptions, or unsupported interpretations.'},
    {id:'qa-pass',name:'Full QA Pass',nameAr:'مراجعة جودة كاملة',category:'Quality',content:'Before finalizing, perform a complete quality review for omissions, altered meaning, broken formatting, cut-off content, table integrity, formula accuracy, heading consistency, and print readiness.'},
    {id:'separate-additions',name:'Separate Added Content',nameAr:'فصل المحتوى المضاف',category:'Integrity',content:'Place any added clarification or study aid in a clearly separated and labelled box. Never blend added material into the original source content.'},
    {id:'word-editable',name:'Fully Editable Word',nameAr:'Word قابل للتعديل بالكامل',category:'Word',content:'Use genuine editable Word elements, styles, tables, shapes, headers, footers, fields, and text boxes. Do not flatten pages into background images.'},
    {id:'no-guess',name:'Never Guess',nameAr:'ممنوع التخمين',category:'OCR',content:'If text is unclear, cropped, or unreadable, never guess. Flag it in a Document Log with its page or slide reference.'},
    {id:'exam-focus',name:'Exam Focus',nameAr:'تركيز امتحاني',category:'Study',content:'Identify likely exam points from the source only and present them in clearly labelled Exam Focus sections without adding external facts.'}
  ];

  const guide = [
    {id:'start',title:'Getting Started',titleAr:'البدء السريع'},
    {id:'builder',title:'Using the Builder',titleAr:'استخدام المنشئ'},
    {id:'templates',title:'Templates',titleAr:'القوالب'},
    {id:'conflicts',title:'Conflict Detector',titleAr:'كشف التعارضات'},
    {id:'projects',title:'Projects & Versions',titleAr:'المشاريع والإصدارات'},
    {id:'settings',title:'Settings',titleAr:'الإعدادات'},
    {id:'shortcuts',title:'Keyboard Shortcuts',titleAr:'اختصارات لوحة المفاتيح'},
    {id:'privacy',title:'Privacy',titleAr:'الخصوصية'},
    {id:'maintenance',title:'Maintenance',titleAr:'الصيانة'}
  ];

  return {taskTypes,fidelity,contentRules,documentFeatures,boxFeatures,visualFeatures,questionFeatures,prohibitedRules,templates,builtInSnippets,guide};
})();
