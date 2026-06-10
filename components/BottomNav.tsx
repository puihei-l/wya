'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function BottomNav() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    async function fetchPending() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { count } = await supabase
        .from('friend_requests')
        .select('id', { count: 'exact', head: true })
        .eq('to_id', user.id)
        .eq('status', 'pending');
      setPendingCount(count ?? 0);
    }
    fetchPending();
  }, [pathname]);

  const TABS = [
    { href: '/', img: '/1.png', label: 'Home' },
    { href: '/check-in/new', img: '/2.png', label: 'Check in', primary: true },
    { href: '/groups', img: '/3.png', label: 'Friends', badge: pendingCount },
  ];

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
                <img src={tab.img} alt={tab.label} className="w-7 h-7 object-contain" />
              </Link>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative flex flex-col items-center gap-0.5 px-3 py-2"
            >
              <img
                src={tab.img}
                alt={tab.label}
                className="w-6 h-6 object-contain transition-opacity"
                style={{ opacity: active ? 1 : 0.4 }}
              />
              <span className={`text-xs font-medium ${active ? 'text-indigo-600' : 'text-gray-400'}`}>
                {tab.label}
              </span>
              {(tab.badge ?? 0) > 0 && (
                <span className="absolute top-1 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
