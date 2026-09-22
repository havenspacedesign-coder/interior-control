export const HOME_MODULES = [
  'app/features/home/index.js',
  'app/features/home/growth-list.js',
  'app/features/home/recommendations.js',
  'app/features/home/message-board.js',
  'app/features/home/announcements.js',
  'app/features/home/company-duty.js',
  'app/features/home/daily-joke.js',
  'app/features/home/daily-quiz.js',
  'app/features/home/quiz-bank.js',
  'app/features/home/daily-nonsense.js',
  'app/features/home/haven-news.js'
];

export const B1F_MODULES = [
  'app/features/b1f/index.js',
  'app/features/b1f/local-workflows.js',
  'app/features/b1f/shared-store.js',
  'app/features/b1f/product-management.js'
];

export const PROGRESS_MODULES = [
  'app/features/construction-progress/index.js',
  'app/features/construction-progress/daily-logs.js',
  'app/features/construction-progress/meeting-logs.js',
  'app/features/construction-progress/todos.js',
  'app/features/construction-progress/private-notes.js',
  'app/features/construction-progress/schedule-grid.js'
];

export const MODULE_ORDER = [
  'app/shared/firebase-config.js',
  'app/shared/core.js',
  'app/shared/auth-shell.js',
  ...B1F_MODULES,
  'app/shared/render-router.js',
  ...HOME_MODULES.slice(0, -1),
  'app/features/project-overview/index.js',
  'app/features/design-progress/index.js',
  ...PROGRESS_MODULES,
  'app/features/construction-guide/index.js',
  'app/features/vendors/index.js',
  'app/features/members/index.js',
  'app/shared/projects.js',
  HOME_MODULES.at(-1)
];

export const FEATURE_MODULES = {
  home: HOME_MODULES,
  overview: [...B1F_MODULES, 'app/features/project-overview/index.js', 'app/features/design-progress/index.js'],
  design: ['app/features/design-progress/index.js', ...PROGRESS_MODULES],
  progress: ['app/features/design-progress/index.js', ...PROGRESS_MODULES],
  bible: ['app/features/construction-guide/index.js'],
  vendors: ['app/features/vendors/index.js'],
  members: ['app/features/members/index.js'],
  b1f: B1F_MODULES
};

export const SHARED_MODULES = [
  'app/shared/firebase-config.js',
  'app/shared/core.js',
  'app/shared/auth-shell.js',
  'app/shared/render-router.js',
  'app/shared/projects.js'
];
