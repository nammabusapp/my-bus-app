import { useState } from 'react';
import { Check, Copy, Download, MoreVertical, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { TRANSLATIONS } from '../i18n/translations';
import { AppLang } from '../types';

interface PWAInstallButtonProps {
  lang: AppLang;
}

export function PWAInstallButton({ lang }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isInAppOrIframe, install } =
    usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const t = TRANSLATIONS[lang];

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const outcome = await install();
      if (outcome === 'installed' || outcome === 'dismissed') {
        return;
      }
    }
    setShowGuide(true);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleInstallClick()}
        aria-label={t.installApp}
        className="min-h-[40px] sm:min-h-[44px] px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/70 text-blue-700 dark:text-blue-300 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
        <span>{t.installApp}</span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isIOS ? t.iosInstallTitle : t.browserInstallTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label={t.close}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isInstallable && (
              <button
                type="button"
                onClick={async () => {
                  const res = await install();
                  if (res === 'installed') setShowGuide(false);
                }}
                className="mt-4 w-full min-h-[44px] rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{t.installNowBtn}</span>
              </button>
            )}

            <ol className="mt-4 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex items-start gap-2">
                <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                  1.
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  {isIOS ? t.iosInstallStep1 : t.browserInstallStep1}
                  {isIOS ? (
                    <Share className="w-4 h-4 text-blue-600 dark:text-blue-400 inline shrink-0" />
                  ) : (
                    <MoreVertical className="w-4 h-4 text-blue-600 dark:text-blue-400 inline shrink-0" />
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                  2.
                </span>
                <span>{isIOS ? t.iosInstallStep2 : t.browserInstallStep2}</span>
              </li>
            </ol>

            {isInAppOrIframe && (
              <p className="mt-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 leading-relaxed">
                {t.inAppBrowserHint}
              </p>
            )}

            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="flex-1 min-h-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>{t.linkCopied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>{t.copyAppLink}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-h-[44px] px-4 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
