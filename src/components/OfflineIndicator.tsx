import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { TRANSLATIONS } from '../i18n/translations';
import { AppLang } from '../types';

interface OfflineIndicatorProps {
  lang: AppLang;
}

export function OfflineIndicator({ lang }: OfflineIndicatorProps) {
  const isOnline = useOnlineStatus();
  const t = TRANSLATIONS[lang];

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>{t.offlineMessage}</span>
    </div>
  );
}
