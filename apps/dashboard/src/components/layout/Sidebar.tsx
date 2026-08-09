"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Server, ListTree, RefreshCcw, LayoutDashboard, LogOut, FlaskConical } from "lucide-react";
import { useAuth } from "@/lib/auth";

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Jobs", href: "/jobs", icon: ListTree },
  { name: "Workers", href: "/workers", icon: Server, adminOnly: true },
  { name: "Recovery", href: "/recovery", icon: RefreshCcw, adminOnly: true },
  { name: "System", href: "/system", icon: Activity, adminOnly: true },
  { name: "Lab", href: "/lab", icon: FlaskConical, adminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const filteredNav = navigation.filter(item => !item.adminOnly || user?.role === "ADMIN");

  return (
    <div className="flex h-full flex-col bg-base-950/80 backdrop-blur-xl border-r border-base-800">
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-base-800">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-accent-primary/20 glow-border-primary">
            <Activity className="h-5 w-5 text-accent-primary animate-pulse-glow" />
          </div>
          <span className="font-mono text-sm font-bold tracking-wider text-white">
            OPS_CONSOLE
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto mt-6">
        <nav className="flex-1 space-y-2 px-4">
          {filteredNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`group flex items-center gap-x-3 rounded-md p-3 text-sm font-mono transition-all duration-200 ${
                  isActive
                    ? "bg-accent-primary/10 text-accent-primary glow-border-primary"
                    : "text-zinc-400 hover:bg-base-800/50 hover:text-white"
                }`}
              >
                <item.icon
                  className={`h-5 w-5 shrink-0 transition-colors ${
                    isActive ? "text-accent-primary" : "text-zinc-500 group-hover:text-zinc-300"
                  }`}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="p-4 border-t border-base-800">
        <div className="mb-4 px-2">
          <p className="text-xs font-mono text-zinc-500">OPERATOR:</p>
          <p className="text-sm font-mono text-white truncate">{user?.email}</p>
          <p className="text-xs font-mono text-accent-primary mt-1">[{user?.role}]</p>
        </div>
        <button
          onClick={logout}
          className="w-full group flex items-center gap-x-3 rounded-md p-3 text-sm font-mono text-zinc-400 hover:bg-base-800/50 hover:text-white transition-all duration-200"
        >
          <LogOut className="h-5 w-5 shrink-0 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
          TERMINATE_SESSION
        </button>
      </div>
    </div>
  );
}
