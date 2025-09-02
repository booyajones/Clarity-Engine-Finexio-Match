import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Upload,
  FileText,
  Search,
  Download,
  Settings,
  BarChart3,
  Briefcase,
  Sparkles,
  ChevronRight,
  Activity,
} from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const menuItems = [
  {
    title: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/" },
      { icon: Activity, label: "Batch Jobs", path: "/batch-jobs" },
    ],
  },
  {
    title: "Classification",
    items: [
      { icon: Upload, label: "Upload & Process", path: "/upload" },
      { icon: Sparkles, label: "Single Classification", path: "/single" },
      { icon: FileText, label: "Classifications", path: "/classifications" },
    ],
  },
  {
    title: "Management",
    items: [
      { icon: Settings, label: "Keyword Manager", path: "/keywords" },
      { icon: Download, label: "Downloads", path: "/downloads" },
    ],
  },
];

export default function ModernSidebar({ isOpen, onClose }: SidebarProps) {
  const [location] = useLocation();

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex fixed left-0 top-0 h-full w-72 bg-gradient-to-b from-gray-900 via-gray-900 to-black text-white z-40">
        <div className="flex flex-col w-full">
          {/* Logo Section */}
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Clarity Engine</h1>
                <p className="text-xs text-gray-400">Intelligent Classification</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            {menuItems.map((section) => (
              <div key={section.title} className="mb-6">
                <h2 className="px-6 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {section.title}
                </h2>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = location === item.path;
                    const Icon = item.icon;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <div
                          className={cn(
                            "flex items-center px-6 py-3 text-sm font-medium transition-all duration-200 group relative",
                            isActive
                              ? "text-white bg-gradient-to-r from-purple-600/20 to-pink-600/20 border-l-4 border-purple-500"
                              : "text-gray-300 hover:text-white hover:bg-gray-800/50"
                          )}
                        >
                          <Icon 
                            className={cn(
                              "mr-3 h-5 w-5 transition-transform duration-200",
                              isActive ? "text-purple-400" : "text-gray-400 group-hover:text-purple-400",
                              "group-hover:scale-110"
                            )} 
                          />
                          <span className="flex-1">{item.label}</span>
                          {isActive && (
                            <ChevronRight className="w-4 h-4 text-purple-400 animate-pulse" />
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Bottom Stats */}
          <div className="p-6 border-t border-gray-800">
            <div className="rounded-xl bg-gradient-to-r from-purple-600/20 to-pink-600/20 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">System Status</span>
                <span className="flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              </div>
              <div className="text-2xl font-bold text-white">96,670</div>
              <div className="text-xs text-gray-400">Suppliers Available</div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar */}
      <div
        className={cn(
          "fixed left-0 top-0 h-full w-72 bg-gradient-to-b from-gray-900 via-gray-900 to-black text-white z-40 transform transition-transform duration-300 ease-in-out lg:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo Section */}
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <Briefcase className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">Clarity Engine</h1>
                  <p className="text-xs text-gray-400">Intelligent Classification</p>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            {menuItems.map((section) => (
              <div key={section.title} className="mb-6">
                <h2 className="px-6 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {section.title}
                </h2>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = location === item.path;
                    const Icon = item.icon;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <div
                          onClick={onClose}
                          className={cn(
                            "flex items-center px-6 py-3 text-sm font-medium transition-all duration-200 group",
                            isActive
                              ? "text-white bg-gradient-to-r from-purple-600/20 to-pink-600/20 border-l-4 border-purple-500"
                              : "text-gray-300 hover:text-white hover:bg-gray-800/50"
                          )}
                        >
                          <Icon 
                            className={cn(
                              "mr-3 h-5 w-5",
                              isActive ? "text-purple-400" : "text-gray-400"
                            )} 
                          />
                          <span className="flex-1">{item.label}</span>
                          {isActive && (
                            <ChevronRight className="w-4 h-4 text-purple-400" />
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}