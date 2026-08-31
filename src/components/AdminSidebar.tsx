"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Inbox,
  Search,
  SlidersHorizontal,
  MessageSquare,
  Users,
  LogOut,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/session-user";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
  /** Rozbalitelná skupina (styl platform.claude.com) — Fáze 17. */
  children?: { label: string; href: string }[];
  /** Minimální aplikační role; bez uvedení vidí položku každý přihlášený. */
  minRole?: AppRole;
}

const navItems: NavItem[] = [
  { label: "Přehled", href: "/admin", icon: LayoutDashboard },
  { label: "Dokumenty", href: "/admin/documents", icon: FileText },
  { label: "Poptávky", href: "/admin/leads", icon: Inbox },
  { label: "Test retrievalu", href: "/admin/retrieval-test", icon: Search },
  {
    label: "Parametry",
    href: "/admin/parameters",
    icon: SlidersHorizontal,
    children: [
      { label: "RAG parametry", href: "/admin/parameters" },
      { label: "Prompty", href: "/admin/parameters/prompts" },
    ],
  },
  {
    label: "Uživatelé",
    href: "/admin/users",
    icon: Users,
    minRole: "admin",
    children: [
      { label: "Účty", href: "/admin/users" },
      { label: "Pracovní role", href: "/admin/users/job-roles" },
      { label: "Štítky dokumentů", href: "/admin/users/audiences" },
    ],
  },
  { label: "Chat", href: "/", icon: MessageSquare, external: true },
];

const ROLE_RANK: Record<AppRole, number> = { viewer: 1, editor: 2, admin: 3 };

export function AdminSidebar({
  appRole,
  username,
}: {
  appRole: AppRole;
  username: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // Explicitní toggly uživatele; bez záznamu platí auto-expand aktivní skupiny.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Skrytí položky je jen kosmetika — autorizace drží na routách (requireAppRole).
  const visibleItems = navItems.filter(
    (item) => !item.minRole || ROLE_RANK[appRole] >= ROLE_RANK[item.minRole]
  );

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2 px-4 py-5">
        <div className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-sm font-medium">
          K
        </div>
        <span className="text-[15px] font-medium text-sidebar-foreground">
          Kecalo
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;

          if (item.children) {
            const groupActive = isActive(item.href);
            const isExpanded = expanded[item.href] ?? groupActive;

            return (
              <div key={item.href}>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [item.href]: !isExpanded,
                    }))
                  }
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    // Rodič skupiny se zvýrazňuje jen textem — accent pozadí
                    // patří konkrétní aktivní podsekci níže.
                    groupActive
                      ? "font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                  <ChevronRight
                    size={14}
                    className={cn(
                      "ml-auto transition-transform",
                      isExpanded && "rotate-90"
                    )}
                  />
                </button>
                {isExpanded &&
                  item.children.map((child) => {
                    // Exact match — prefix by rozsvítil „RAG parametry" i na /prompts.
                    const childActive = pathname === child.href;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "mt-0.5 flex items-center rounded-md py-1.5 pl-[42px] pr-3 text-sm transition-colors",
                          childActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
              </div>
            );
          }

          const active = !item.external && isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              target={item.external ? "_blank" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4">
        <div className="truncate px-3 pb-2 text-xs text-sidebar-foreground/70">
          {username}
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
        >
          <LogOut size={18} />
          Odhlásit
        </button>
      </div>
    </aside>
  );
}
