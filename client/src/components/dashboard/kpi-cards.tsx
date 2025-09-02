import { Card, CardContent } from "@/components/ui/card";
import type { ClassificationStats } from "@/lib/types";

interface KpiCardsProps {
  stats: ClassificationStats;
}

export default function KpiCards({ stats }: KpiCardsProps) {
  const cards = [
    {
      title: "Total Records",
      value: (stats.totalRecords || 0).toLocaleString(),
      change: `${stats.totalBatches || 0} batches`,
      icon: "fas fa-database",
      bgColor: "bg-primary-100",
      iconColor: "text-primary-600",
      changeColor: "text-gray-600"
    },
    {
      title: "Match Rate",
      value: `${stats.matchRate || 0}%`,
      change: `${(stats.matchedRecords || 0).toLocaleString()} matched`,
      icon: "fas fa-bullseye",
      bgColor: "bg-success-100",
      iconColor: "text-success-600",
      changeColor: "text-success-600"
    },
    {
      title: "Processing",
      value: (stats.processingBatches || 0).toLocaleString(),
      change: stats.processingBatches > 0 ? "In progress" : "All complete",
      icon: "fas fa-spinner",
      bgColor: "bg-warning-100",
      iconColor: "text-warning-600",
      changeColor: stats.processingBatches > 0 ? "text-warning-600" : "text-success-600"
    },
    {
      title: "Completed",
      value: (stats.completedBatches || 0).toLocaleString(),
      change: `${((stats.completedBatches / Math.max(stats.totalBatches, 1)) * 100).toFixed(0)}% success rate`,
      icon: "fas fa-check-circle",
      bgColor: "bg-gray-100",
      iconColor: "text-gray-600",
      changeColor: "text-gray-500"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {cards.map((card, index) => (
        <Card key={index} className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{card.title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{card.value}</p>
                <p className={`text-sm mt-1 ${card.changeColor}`}>
                  <i className="fas fa-arrow-up text-xs mr-1"></i>
                  {card.change}
                </p>
              </div>
              <div className={`w-12 h-12 ${card.bgColor} rounded-xl flex items-center justify-center`}>
                <i className={`${card.icon} ${card.iconColor} text-lg`}></i>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
