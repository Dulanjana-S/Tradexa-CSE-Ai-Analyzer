import { Link } from "react-router";
import { TrendingUp, Twitter, Facebook, Linkedin, Mail } from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * Footer Component
 * 
 * Site-wide footer with links, information, and legal disclaimers.
 * Displayed at the bottom of every page.
 */
export function Footer() {
  const { theme } = useTheme();
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    product: [
      { name: "Dashboard", path: "/" },
      { name: "Markets", path: "/markets" },
      { name: "Stock Screener", path: "/screener" },
      { name: "Announcements", path: "/announcements" },
      { name: "Watchlist", path: "/watchlist" },
    ],
    company: [
      { name: "About Us", path: "/about" },
      { name: "Contact", path: "/contact" },
      { name: "Careers", path: "/careers" },
      { name: "Blog", path: "/blog" },
    ],
    legal: [
      { name: "Terms of Service", path: "/terms" },
      { name: "Privacy Policy", path: "/privacy" },
      { name: "Cookie Policy", path: "/cookies" },
      { name: "Disclaimer", path: "/disclaimer" },
    ],
    support: [
      { name: "Help Center", path: "/help" },
      { name: "API Documentation", path: "/api-docs" },
      { name: "System Status", path: "/admin" },
      { name: "Contact Support", path: "/support" },
    ],
  };

  const socialLinks = [
    { name: "Twitter", icon: Twitter, url: "https://twitter.com" },
    { name: "Facebook", icon: Facebook, url: "https://facebook.com" },
    { name: "LinkedIn", icon: Linkedin, url: "https://linkedin.com" },
    { name: "Email", icon: Mail, url: "mailto:info@tradexalk.com" },
  ];

  return (
    <footer className="bg-[var(--color-bg-primary)] border-t border-[var(--color-border)] mt-auto">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Main Footer Content */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-8">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <img 
                src="/logo.png" 
                alt="Tradexa.lk" 
                className="h-12 w-auto object-contain transition-all" 
                style={{ 
                  filter: theme === 'light' ? 'invert(1) hue-rotate(180deg) brightness(0.2)' : 'none' 
                }}
              />
            </Link>
            <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
              Professional stock market analytics platform for the Colombo Stock Exchange.
            </p>
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.name}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded-lg bg-[var(--color-border)] border border-[var(--color-border)] hover:border-emerald-600/30 hover:bg-[var(--color-border)] flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-emerald-500 transition-colors"
                    aria-label={social.name}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider mb-4">
              Product
            </h3>
            <ul className="space-y-2.5">
              {footerLinks.product.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm text-[var(--color-text-tertiary)] hover:text-emerald-500 transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* About Links */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider mb-4">
              About
            </h3>
            <ul className="space-y-2.5">
              {footerLinks.company.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm text-[var(--color-text-tertiary)] hover:text-emerald-500 transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider mb-4">
              Legal
            </h3>
            <ul className="space-y-2.5">
              {footerLinks.legal.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm text-[var(--color-text-tertiary)] hover:text-emerald-500 transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support Links */}
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider mb-4">
              Support
            </h3>
            <ul className="space-y-2.5">
              {footerLinks.support.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm text-[var(--color-text-tertiary)] hover:text-emerald-500 transition-colors"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="border-t border-[var(--color-border)] pt-8 mb-8">
          <div className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-lg p-4">
            <p className="text-xs text-[var(--warning-text)] leading-relaxed opacity-90">
              <strong className="font-semibold">Disclaimer:</strong> TradexaLK is an independent financial analytics platform.
              Stock market investments involve risk, and past performance does not guarantee future results.
              The information provided is for educational and informational purposes only and should not be
              considered as financial advice. Please consult with a qualified financial advisor before making
              investment decisions. All data is sourced from the Colombo Stock Exchange and third-party providers.
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--color-text-tertiary)]">
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <p>
              © {currentYear} TradexaLK. All rights reserved.
            </p>
            <span className="hidden sm:inline">•</span>
            <p>
              Powered by Colombo Stock Exchange data
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span>Built with ❤️ for Sri Lankan traders</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
