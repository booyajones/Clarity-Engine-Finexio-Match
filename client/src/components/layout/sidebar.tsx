import { Link as NavLink, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Upload,
  FileCheck,
  Tags,
  List,
  Download,
} from "lucide-react";
import { useRef } from "react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Upload", href: "/upload", icon: Upload },
  { name: "Single Classification", href: "/single", icon: FileCheck },
  { name: "Keyword Manager", href: "/keywords", icon: Tags },
  { name: "Classifications", href: "/classifications", icon: List },
  { name: "Downloads", href: "/downloads", icon: Download },
];

export default function Sidebar() {
  const [location, setLocation] = useLocation();
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const handleKeyDown = (index: number) => (
    e: React.KeyboardEvent<HTMLAnchorElement>
  ) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = (index + 1) % navigation.length;
      itemRefs.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (index - 1 + navigation.length) % navigation.length;
      itemRefs.current[prev]?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      setLocation(navigation[index].href);
    }
  };

  return (
    <div className="w-48 bg-white border-r flex flex-col">
      {/* Logo */}
      <div className="px-4 py-4 border-b">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-blue-500 rounded"></div>
          <span className="font-medium">Clarity</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navigation.map((item, idx) => {
          const Icon = item.icon;
          const active = location === item.href;
          return (
            <NavLink
              key={item.name}
              href={item.href}
              aria-label={item.name}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-600",
                active
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
              ref={(el) => (itemRefs.current[idx] = el)}
              onKeyDown={handleKeyDown(idx)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
