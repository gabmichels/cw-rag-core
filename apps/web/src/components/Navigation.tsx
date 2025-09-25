"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageSquare, Upload, BarChart3, Bot, Book } from 'lucide-react';

export default function Navigation() {
  const pathname = usePathname();

  // Tenant branding configuration
  const tenantBrandName = process.env.NEXT_PUBLIC_TENANT_BRAND_NAME || 'RAG Chat';
  const tenantLogoUrl = process.env.NEXT_PUBLIC_TENANT_LOGO_URL;
  const tenantPrimaryColor = process.env.NEXT_PUBLIC_TENANT_PRIMARY_COLOR || '#3b82f6';
  const tenantTheme = process.env.NEXT_PUBLIC_TENANT_THEME || 'default';

  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true;
    if (path !== '/' && pathname.startsWith(path)) return true;
    return false;
  };

  const navItems = [
    { href: '/ask', label: 'AI Chat', icon: MessageSquare },
    { href: '/upload', label: 'Upload', icon: Upload },
    { href: '/library', label: 'Library', icon: Book },
    { href: '/ingests', label: 'Analytics', icon: BarChart3 },
  ];

  // Dynamic styling based on tenant theme
  const getThemeClasses = () => {
    switch (tenantTheme) {
      case 'premium':
        return 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200';
      case 'development':
        return 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200';
      default:
        return 'bg-card/50 backdrop-blur-sm border-border/50';
    }
  };

  return (
    <nav className={`${getThemeClasses()} sticky top-0 z-50 border-b`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo/Brand */}
          <div className="flex items-center space-x-3">
            {tenantLogoUrl ? (
              <img
                src={tenantLogoUrl}
                alt={`${tenantBrandName} Logo`}
                className="w-8 h-8 rounded-lg"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: tenantPrimaryColor }}
              >
                <Bot className="w-5 h-5 text-white" />
              </div>
            )}
            <Link
              href="/"
              className="text-xl font-semibold text-foreground hover:opacity-80 transition-opacity"
              style={{ color: tenantPrimaryColor }}
            >
              {tenantBrandName}
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                    flex items-center space-x-2 hover:scale-105
                    ${
                      isActive(item.href)
                        ? 'bg-primary text-primary-foreground shadow-md'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}