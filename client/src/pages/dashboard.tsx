import KpiCards from "@/components/dashboard/kpi-cards";
import ClassificationChart from "@/components/dashboard/classification-chart";
import UploadWidget from "@/components/dashboard/upload-widget";
import BusinessInsights from "@/components/dashboard/business-insights";
import ReviewQueue from "@/components/dashboard/review-queue";
import { useQuery } from "@tanstack/react-query";
import type { ClassificationStats, BusinessCategory, ActivityItem } from "@/lib/types";
import Header from "@/components/layout/Header"; // Added missing import

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<ClassificationStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  // Placeholder data for now
  const chartData = { business: 60, individual: 30, government: 10 };
  const categories: BusinessCategory[] = [
    { name: "Business", percentage: 60, color: "bg-primary-500" },
    { name: "Individual", percentage: 30, color: "bg-success-500" },
    { name: "Government", percentage: 10, color: "bg-warning-500" },
  ];
  const activities: ActivityItem[] = [];

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Dashboard" subtitle="Overview of classification activity" />
      <main className="flex-1 p-6 overflow-auto space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 rounded-lg skeleton transition-smooth" />
            ))}
          </div>
        ) : (
          stats && <KpiCards stats={stats} />
        )}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ClassificationChart data={chartData} />
          <UploadWidget />
        </div>
        <BusinessInsights categories={categories} activities={activities} />
        <ReviewQueue />
      </main>
    </div>
  );
}