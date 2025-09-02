import { useQuery } from "@tanstack/react-query";
import { 
  TrendingUp, 
  Package, 
  CheckCircle, 
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BarChart3,
  Briefcase,
  Users,
  Building2,
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCard {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: any;
  color: string;
  bgColor: string;
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  const statCards: StatCard[] = [
    {
      title: "Total Batches",
      value: stats?.totalBatches || 0,
      change: 12,
      changeLabel: "from last month",
      icon: Package,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      title: "Processed Records",
      value: stats?.processedRecords?.toLocaleString() || "0",
      change: 8.5,
      changeLabel: "increase",
      icon: FileText,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "Match Rate",
      value: `${stats?.matchRate || 0}%`,
      change: -2.3,
      changeLabel: "from average",
      icon: Activity,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
    },
    {
      title: "Active Suppliers",
      value: "96,670",
      icon: Building2,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Modern Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-20">
        <div className="px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome back
              </h1>
              <p className="text-gray-500 mt-1">
                Here's what's happening with your classifications today
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button className="px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                <span className="text-sm font-medium">Last 30 days</span>
              </button>
              <button className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg transition-all duration-200 transform hover:scale-105">
                <span className="text-sm font-medium">Export Report</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {isLoading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-40 rounded-2xl skeleton bg-gray-100 animate-pulse" />
              ))}
            </>
          ) : (
            statCards.map((card, index) => {
              const Icon = card.icon;
              const isPositive = card.change && card.change > 0;
              
              return (
                <div
                  key={card.title}
                  className="group relative bg-white rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 overflow-hidden"
                  style={{
                    animationDelay: `${index * 100}ms`,
                  }}
                >
                  {/* Background decoration */}
                  <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 opacity-20 group-hover:scale-150 transition-transform duration-500" />
                  
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className={cn("p-3 rounded-xl", card.bgColor)}>
                        <Icon className={cn("w-6 h-6", card.color)} />
                      </div>
                      {card.change && (
                        <div className={cn(
                          "flex items-center text-sm font-medium",
                          isPositive ? "text-green-600" : "text-red-600"
                        )}>
                          {isPositive ? (
                            <ArrowUpRight className="w-4 h-4 mr-1" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4 mr-1" />
                          )}
                          {Math.abs(card.change)}%
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-sm text-gray-500">{card.title}</p>
                      <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                      {card.changeLabel && (
                        <p className="text-xs text-gray-400">{card.changeLabel}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Classification Distribution */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Classification Distribution</h2>
              <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                View Details →
              </button>
            </div>
            
            <div className="space-y-4">
              {[
                { name: "Business", value: 60, color: "bg-purple-500" },
                { name: "Individual", value: 30, color: "bg-blue-500" },
                { name: "Government", value: 10, color: "bg-emerald-500" },
              ].map((item) => (
                <div key={item.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{item.name}</span>
                    <span className="text-sm text-gray-500">{item.value}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div 
                      className={cn("h-full rounded-full transition-all duration-1000", item.color)}
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl p-6 text-white">
            <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button className="w-full px-4 py-3 bg-white/20 backdrop-blur rounded-xl hover:bg-white/30 transition-colors text-left">
                <div className="flex items-center">
                  <div className="p-2 bg-white/20 rounded-lg mr-3">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium">Upload New Batch</p>
                    <p className="text-xs opacity-80">Process new classifications</p>
                  </div>
                </div>
              </button>
              
              <button className="w-full px-4 py-3 bg-white/20 backdrop-blur rounded-xl hover:bg-white/30 transition-colors text-left">
                <div className="flex items-center">
                  <div className="p-2 bg-white/20 rounded-lg mr-3">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium">View Analytics</p>
                    <p className="text-xs opacity-80">Detailed insights</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Recent Batches</h2>
            <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">
              View All →
            </button>
          </div>
          
          {stats?.recentBatches?.length > 0 ? (
            <div className="space-y-3">
              {stats.recentBatches.map((batch: any) => (
                <div 
                  key={batch.id}
                  className="flex items-center justify-between p-4 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                      <Package className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{batch.name}</p>
                      <p className="text-sm text-gray-500">
                        {batch.processedRecords} / {batch.totalRecords} records
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium",
                      batch.status === "completed" 
                        ? "bg-green-100 text-green-700"
                        : batch.status === "processing"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-700"
                    )}>
                      {batch.status}
                    </span>
                    <span className="text-sm text-gray-400">
                      {new Date(batch.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No recent batches</p>
              <p className="text-sm mt-1">Upload your first batch to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}