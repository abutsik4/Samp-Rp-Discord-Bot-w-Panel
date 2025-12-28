// Global internationalization (i18n) utility for panel pages
// Provides EN/RU translations for all UI text

const translations = {
  en: {
    // Navigation
    'nav.back': 'Back',
    'nav.panel': 'Panel',
    'nav.logout': 'Logout',
    
    // Common UI
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.edit': 'Edit',
    'common.delete': 'Delete',
    'common.remove': 'Remove',
    'common.add': 'Add',
    'common.enabled': 'Enabled',
    'common.disabled': 'Disabled',
    'common.loading': 'Loading...',
    
    // Rate Limiter
    'rateLimiter.title': 'Message Rate Limiting',
    'rateLimiter.config': 'Configuration',
    'rateLimiter.enabled': 'Enable Rate Limiting',
    'rateLimiter.limit': 'Message Limit',
    'rateLimiter.period': 'Time Period (minutes)',
    'rateLimiter.channel': 'Target Channel',
    'rateLimiter.roleLimits': 'Role-Based Limits',
    'rateLimiter.roleLimitsDesc': 'Configure different limits for specific roles. Higher limits override default.',
    'rateLimiter.addRole': 'Add Role Limit',
    'rateLimiter.selectRole': 'Select a role...',
    'rateLimiter.manualEntry': 'Or manually enter Role ID:',
    'rateLimiter.roleId': 'Role ID (manual)',
    'rateLimiter.roleName': 'Name (optional)',
    'rateLimiter.saveConfig': 'Save Configuration',
    
    // AI Engagement
    'ai.title': 'AI Chat Engagement',
    'ai.config': 'Configuration',
    'ai.enabled': 'Enable AI Engagement',
    'ai.probability': 'Engagement Probability (%)',
    'ai.cooldown': 'Cooldown (minutes)',
    'ai.mlThreshold': 'ML Confidence Threshold',
    'ai.mlThresholdDesc': 'Minimum ML confidence to respond (higher = fewer but more relevant responses)',
    'ai.targetChannels': 'Target Channels (empty = all channels)',
    'ai.howItWorks': 'How It Works',
    'ai.mlFeatures': 'ML-Powered Features:',
    'ai.feature1': 'Pure ML-generated responses (GPT-2)',
    'ai.feature2': 'Sentiment analysis for mood-aware responses',
    'ai.feature3': 'Context-aware topic detection',
    'ai.feature4': 'Smart cooldown system',
    'ai.feature5': 'Configurable confidence threshold',
    'ai.feature6': 'Skips low-confidence responses',
    'ai.feature7': '100% free (no API costs)',
    
    // Messages
    'messages.title': 'Messages & Embeds',
    'messages.send': 'Send Message',
    'messages.channel': 'Select Channel',
    'messages.content': 'Message Content',
    'messages.embed': 'Embed Builder',
    
    // Stats
    'stats.total': 'Total Engagements',
    'stats.last24h': 'Last 24 Hours',
    'stats.mlGenerated': 'ML Generated',
    'stats.mlFallback': 'ML Fallback',
  },
  
  ru: {
    // Navigation
    'nav.back': 'Назад',
    'nav.panel': 'Панель',
    'nav.logout': 'Выйти',
    
    // Common UI
    'common.save': 'Сохранить',
    'common.cancel': 'Отмена',
    'common.edit': 'Редактировать',
    'common.delete': 'Удалить',
    'common.remove': 'Убрать',
    'common.add': 'Добавить',
    'common.enabled': 'Включено',
    'common.disabled': 'Выключено',
    'common.loading': 'Загрузка...',
    
    // Rate Limiter
    'rateLimiter.title': 'Ограничение Сообщений',
    'rateLimiter.config': 'Настройки',
    'rateLimiter.enabled': 'Включить ограничение сообщений',
    'rateLimiter.limit': 'Лимит сообщений',
    'rateLimiter.period': 'Период времени (минуты)',
    'rateLimiter.channel': 'Целевой канал',
    'rateLimiter.roleLimits': 'Лимиты по ролям',
    'rateLimiter.roleLimitsDesc': 'Настройте разные лимиты для конкретных ролей. Более высокие лимиты переопределяют стандартный.',
    'rateLimiter.addRole': 'Добавить лимит роли',
    'rateLimiter.selectRole': 'Выберите роль...',
    'rateLimiter.manualEntry': 'Или введите ID роли вручную:',
    'rateLimiter.roleId': 'ID роли (вручную)',
    'rateLimiter.roleName': 'Название (необязательно)',
    'rateLimiter.saveConfig': 'Сохранить настройки',
    
    // AI Engagement
    'ai.title': 'AI Общение в Чате',
    'ai.config': 'Настройки',
    'ai.enabled': 'Включить AI общение',
    'ai.probability': 'Вероятность ответа (%)',
    'ai.cooldown': 'Задержка (минуты)',
    'ai.mlThreshold': 'Порог уверенности ML',
    'ai.mlThresholdDesc': 'Минимальная уверенность ML для ответа (выше = меньше, но более релевантных ответов)',
    'ai.targetChannels': 'Целевые каналы (пусто = все каналы)',
    'ai.howItWorks': 'Как это работает',
    'ai.mlFeatures': 'Функции на основе ML:',
    'ai.feature1': 'Чистая генерация ML-ответов (GPT-2)',
    'ai.feature2': 'Анализ настроения для ответов с учётом эмоций',
    'ai.feature3': 'Определение тем с учётом контекста',
    'ai.feature4': 'Умная система задержки',
    'ai.feature5': 'Настраиваемый порог уверенности',
    'ai.feature6': 'Пропускает ответы с низкой уверенностью',
    'ai.feature7': '100% бесплатно (без затрат на API)',
    
    // Messages
    'messages.title': 'Сообщения и Встраивания',
    'messages.send': 'Отправить сообщение',
    'messages.channel': 'Выберите канал',
    'messages.content': 'Содержание сообщения',
    'messages.embed': 'Конструктор встраиваний',
    
    // Stats
    'stats.total': 'Всего взаимодействий',
    'stats.last24h': 'За последние 24 часа',
    'stats.mlGenerated': 'Сгенерировано ML',
    'stats.mlFallback': 'Запасной вариант ML',
  },
};

/**
 * Get translated string for given key and language
 * @param {string} key - Translation key (e.g., 'nav.back')
 * @param {string} lang - Language code ('en' or 'ru')
 * @returns {string} Translated text or key if not found
 */
function t(key, lang = 'en') {
  return translations[lang]?.[key] || translations.en[key] || key;
}

/**
 * Get all translation keys and values for a language
 * @param {string} lang - Language code ('en' or 'ru')
 * @returns {object} All translations for that language
 */
function getAllTranslations(lang = 'en') {
  return translations[lang] || translations.en;
}

/**
 * Generate language switcher HTML
 * @returns {string} HTML for language toggle buttons
 */
function generateLanguageSwitcher() {
  return `
    <div class="lang-switch">
      <button class="lang-btn" data-lang="en" onclick="setLanguage('en')">EN</button>
      <button class="lang-btn" data-lang="ru" onclick="setLanguage('ru')">RU</button>
    </div>
  `;
}

/**
 * Generate language switcher CSS
 * @returns {string} CSS styles for language switcher
 */
function getLanguageSwitcherCSS() {
  return `
    .lang-switch{display:flex;gap:6px;background:rgba(17,24,39,.9);border:1px solid var(--border);border-radius:8px;padding:4px}
    .lang-btn{padding:6px 12px;border:none;background:transparent;color:var(--text-muted);cursor:pointer;border-radius:6px;font-size:13px;font-weight:500;transition:all .2s}
    .lang-btn.active{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));color:#fff}
    .lang-btn:hover:not(.active){color:var(--text);background:rgba(30,41,59,.5)}
    [data-lang-text]{display:none}
    [data-lang-text].active{display:inline}
    [data-lang-block]{display:none}
    [data-lang-block].active{display:block}
  `;
}

/**
 * Generate client-side JavaScript for language switching
 * @returns {string} JavaScript code for language toggle
 */
function getLanguageSwitcherScript() {
  return `
    // Language switcher logic
    let currentLang = getCookie('panelLang') || 'en';
    
    function getCookie(name) {
      const value = \`; \${document.cookie}\`;
      const parts = value.split(\`; \${name}=\`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return null;
    }
    
    function setLanguage(lang) {
      currentLang = lang;
      document.cookie = \`panelLang=\${lang};path=/;max-age=31536000\`;
      
      // Update all elements with data-lang-text or data-lang-block attributes
      document.querySelectorAll('[data-lang-text]').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-lang-text') === lang);
      });
      
      document.querySelectorAll('[data-lang-block]').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-lang-block') === lang);
      });
      
      // Update switcher buttons
      document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
      });
    }
    
    // Initialize on page load
    setLanguage(currentLang);
  `;
}

module.exports = {
  t,
  getAllTranslations,
  generateLanguageSwitcher,
  getLanguageSwitcherCSS,
  getLanguageSwitcherScript,
  translations,
};
