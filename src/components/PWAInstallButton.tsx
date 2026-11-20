import { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { TRANSLATIONS } from '../i18n/translations';
import { AppLang } from '../types';

interface PWAInstallButtonProps {
  lang: AppLang;
}

export function PWAInstallButton({ lang }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const t = TRANSLATIONS[lang];

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="min-h-[44px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/70 text-blue-700 dark:text-blue-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline">{t.installApp}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="min-h-[44px] px-3 py-2 text-xs sm:text-sm font-semibold rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/70 text-blue-700 dark:text-blue-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">{t.installOnIos}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t.iosInstallTitle}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label={t.close}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="mt-4 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                    1.
                  </span>
                  <span className="flex items-center gap-1.5 flex-wrap">
                    {t.iosInstallStep1}
                    <Share className="w-4 h-4 text-blue-600 dark:text-blue-400 inline shrink-0" />
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                    2.
                  </span>
                  <span>{t.iosInstallStep2}</span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
              >
                {t.close}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
