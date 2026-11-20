import { Languages } from 'lucide-react';
import { AppLang } from '../types';

interface LanguageToggleProps {
  lang: AppLang;
  onToggle: () => void;
}

export function LanguageToggle({ lang, onToggle }: LanguageToggleProps) {
  const isKannada = lang === 'kn';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isKannada ? 'Switch language to English' : 'ಭಾಷೆಯನ್ನು ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿಸಿ'}
      title={isKannada ? 'Switch to English' : 'ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿಸಿ'}
      className="min-w-[44px] min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
    >
      <Languages className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
      <span>{isKannada ? 'EN' : 'ಕನ್ನಡ'}</span>
    </button>
  );
}
