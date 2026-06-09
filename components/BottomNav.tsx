'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', icon: '🏠', label: 'Home' },
  { href: '/check-in/new', icon: '📍', label: 'Check in', primary: true },
  { href: '/groups', icon: '👥', label: 'Friends' },
  { href: '/hangouts', icon: '📅', label: 'Plans' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 pb-safe z-50">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-4">
        {TABS.map((tab) => {
          const active =
            tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);

          if (tab.primary) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex items-center justify-center w-14 h-14 bg-indigo-600 rounded-full shadow-lg -mt-5 active:scale-95 transition-transform"
              >
                <span className="text-2xl">{tab.icon}</span>
              </Link>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 ${
                active ? 'text-indigo-600' : 'text-gray-400'
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-xs font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
