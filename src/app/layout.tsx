import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import JsonLd from "./components/json-ld";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL((process as any).env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  applicationName: "RepoLLM",
  title: {
    default: "Stop reading code. Start talking to it.",
    template: "%s",
  },
  description: "Don't just stare at the repo, interrogate it. Deep dive into logic, squash vulnerabilities and ship faster with AI-powered robust analysis.",
  keywords: [
    "github repo visualizer",
    "codebase analysis",
    "ai code assistant",
    "github repo answering",
    "repository chat",
    "code understanding",
    "developer tools",
    "static analysis",
  ],
  icons: {
    icon: "/favicon.ico",
  },
  appleWebApp: {
    title: "RepoLLM",
    statusBarStyle: "default",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "RepoLLM: Stop reading code. Start talking to it.",
    description: "Don't just stare at the repo, interrogate it. Deep dive into logic, squash vulnerabilities and ship faster with AI-powered robust analysis.",
    url: (process as any).env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
    siteName: "RepoLLM",
    images: [
      {
        url: "/RepoLLM.png",
        width: 1200,
        height: 630,
        alt: "RepoLLM AI - GitHub Repository Visualizer and Chat",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RepoLLM: Stop reading code. Start talking to it.",
    description: "Don't just stare at the repo, interrogate it. Deep dive into logic, squash vulnerabilities and ship faster with AI-powered robust analysis.",
    images: ["/RepoLLM.png"],
        creator: "@repo-llm",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "NAlIH9k-f2Xwk4cvXUpEw3hsL9a56pR_2X0ZBdBKwQ4",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${montserrat.variable}`} suppressHydrationWarning>
      <body
        className="antialiased font-sans"
        suppressHydrationWarning
      >
        <JsonLd />
        {children}
        {/* Remove Next.js Dev Tools - Comprehensive Removal */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                const removeDevTools = () => {
                  // Remove dev tools button by various selectors
                  const selectors = [
                    '[aria-label*="Next.js Dev Tools"]',
                    '[aria-label*="Open Next.js Dev Tools"]',
                    '[aria-label*="Close Next.js Dev Tools"]',
                    '[data-nextjs-dev-tools-button]',
                    '[data-next-mark]',
                    '#nextjs-dev-tools-menu',
                    '[id*="nextjs-dev-tools"]',
                    '[class*="nextjs-dev-tools"]',
                    '[class*="dev-tools-indicator"]',
                  ];
                  
                  selectors.forEach(selector => {
                    try {
                      const elements = document.querySelectorAll(selector);
                      elements.forEach(el => el.remove());
                    } catch (e) {
                      // Ignore selector errors
                    }
                  });
                  
                  // Remove any iframe overlays
                  const iframes = document.querySelectorAll('iframe');
                  iframes.forEach(iframe => {
                    try {
                      const src = iframe.getAttribute('src') || '';
                      if (src.includes('nextjs') && src.includes('dev')) {
                        iframe.remove();
                      }
                    } catch (e) {
                      // Ignore
                    }
                  });
                  
                  // Remove dev tools from shadow DOM if present
                  try {
                    const shadowHosts = document.querySelectorAll('[data-nextjs-dev-overlay]');
                    shadowHosts.forEach(host => {
                      if (host.shadowRoot) {
                        const shadowElements = host.shadowRoot.querySelectorAll('*');
                        shadowElements.forEach(el => {
                          if (el.textContent?.includes('Dev Tools') || el.id?.includes('dev-tools')) {
                            el.remove();
                          }
                        });
                      }
                    });
                  } catch (e) {
                    // Shadow DOM access may fail, ignore
                  }
                };
                
                // Run immediately
                removeDevTools();
                
                // Run after DOM is ready
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', removeDevTools);
                }
                
                // Run after a delay to catch late-loading elements
                setTimeout(removeDevTools, 100);
                setTimeout(removeDevTools, 500);
                setTimeout(removeDevTools, 1000);
                setTimeout(removeDevTools, 2000);
                
                // Use MutationObserver to catch dynamically added elements
                const observer = new MutationObserver((mutations) => {
                  let shouldRemove = false;
                  mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                      if (node.nodeType === 1) { // Element node
                        const el = node;
                        // Handle className - it can be string or DOMTokenList
                        const className = typeof el.className === 'string' 
                          ? el.className 
                          : (el.className?.baseVal || String(el.className) || '');
                        if (el.getAttribute?.('aria-label')?.includes('Dev Tools') ||
                            el.id?.includes('nextjs-dev-tools') ||
                            className.includes('dev-tools') ||
                            el.getAttribute?.('data-nextjs-dev-tools-button')) {
                          shouldRemove = true;
                        }
                      }
                    });
                  });
                  if (shouldRemove) {
                    removeDevTools();
                  }
                });
                
                observer.observe(document.body, { 
                  childList: true, 
                  subtree: true,
                  attributes: true,
                  attributeFilter: ['aria-label', 'id', 'class', 'data-nextjs-dev-tools-button']
                });
              }
            `,
          }}
        />
        {/* CSS to hide dev tools */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              [aria-label*="Next.js Dev Tools"],
              [aria-label*="Open Next.js Dev Tools"],
              [aria-label*="Close Next.js Dev Tools"],
              [data-nextjs-dev-tools-button],
              [data-next-mark],
              #nextjs-dev-tools-menu,
              [id*="nextjs-dev-tools"],
              [class*="nextjs-dev-tools"],
              [class*="dev-tools-indicator"],
              [data-nextjs-dev-overlay] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
                position: absolute !important;
                left: -9999px !important;
                width: 0 !important;
                height: 0 !important;
                overflow: hidden !important;
              }
            `,
          }}
        />
        <Toaster
          position="top-right"
          theme="dark"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: '#18181b',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fff',
            },
          }}
        />
      </body>
    </html>
  );
}
