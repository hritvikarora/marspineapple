import { useUiLang } from './i18n';

export function LangToggle({ className = '' }: { className?: string }) {
  const [lang, setLang] = useUiLang();
  return (
    <div
      className={`lang-toggle ${className}`.trim()}
      role="group"
      aria-label={lang === 'it' ? 'Lingua' : 'Language'}
      data-testid="lang-toggle"
    >
      <button
        type="button"
        className={`lang-btn${lang === 'en' ? ' active' : ''}`}
        aria-pressed={lang === 'en'}
        aria-label="English"
        data-testid="lang-en"
        onClick={() => setLang('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={`lang-btn${lang === 'it' ? ' active' : ''}`}
        aria-pressed={lang === 'it'}
        aria-label="Italiano"
        data-testid="lang-it"
        onClick={() => setLang('it')}
      >
        IT
      </button>
    </div>
  );
}
