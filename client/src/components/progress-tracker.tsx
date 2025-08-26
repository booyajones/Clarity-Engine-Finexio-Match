import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2, Clock, ChevronRight, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";

interface UploadBatch {
  id: number;
  status: string;
  totalRecords: number;
  processedRecords: number;
  currentStep?: string;
  progressMessage?: string;
  createdAt?: string;
  // Enrichment statuses
  finexioMatchingStatus?: string;
  finexioMatchingProgress?: number;
  finexioMatchPercentage?: number;
  googleAddressStatus?: string;
  googleAddressProgress?: number;
  googleAddressValidated?: number;
  mastercardEnrichmentStatus?: string;
  mastercardEnrichmentProgress?: number;
  mastercardActualEnriched?: number;
  mastercardEnrichmentTotal?: number;
  akkioPredictionStatus?: string;
  akkioPredictionProgress?: number;
  akkioPredictionSuccessful?: number;
}

interface ProgressTrackerProps {
  batch: UploadBatch;
}

export function ProgressTracker({ batch }: ProgressTrackerProps) {
  const [elapsedTime, setElapsedTime] = useState<string>("");

  // Update elapsed time every second
  useEffect(() => {
    if (!batch.createdAt || batch.status === "completed" || batch.status === "failed") return;

    const updateElapsed = () => {
      const start = new Date(batch.createdAt!).getTime();
      const now = Date.now();
      const elapsed = now - start;
      
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      setElapsedTime(`${minutes}m ${seconds}s`);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [batch.createdAt, batch.status]);

  // Define all possible phases with their data
  const phases = [
    {
      name: "Classification",
      key: "classification",
      status: batch.processedRecords === batch.totalRecords ? "completed" : 
              batch.processedRecords > 0 ? "in_progress" : "pending",
      current: batch.processedRecords,
      total: batch.totalRecords,
      percentage: batch.totalRecords > 0 ? Math.round((batch.processedRecords / batch.totalRecords) * 100) : 0,
      color: { bg: "bg-blue-500", light: "bg-blue-100", text: "text-blue-700" },
      enabled: true
    },
    {
      name: "Finexio Matching",
      key: "finexio",
      status: batch.finexioMatchingStatus || "pending",
      current: batch.finexioMatchingStatus === "completed" ? batch.totalRecords : 
               batch.finexioMatchingStatus === "in_progress" ? Math.round(batch.totalRecords * 0.5) : 0,
      total: batch.totalRecords,
      percentage: batch.finexioMatchPercentage || 0,
      matchRate: batch.finexioMatchPercentage,
      color: { bg: "bg-green-500", light: "bg-green-100", text: "text-green-700" },
      enabled: batch.finexioMatchingStatus !== "skipped"
    },
    {
      name: "Google Address",
      key: "google",
      status: batch.googleAddressStatus || "pending",
      current: batch.googleAddressValidated || 0,
      total: batch.totalRecords,
      percentage: batch.googleAddressProgress || 0,
      color: { bg: "bg-indigo-500", light: "bg-indigo-100", text: "text-indigo-700" },
      enabled: batch.googleAddressStatus !== "skipped"
    },
    {
      name: "Mastercard",
      key: "mastercard",
      status: batch.mastercardEnrichmentStatus || "pending",
      current: batch.mastercardActualEnriched || 0,
      total: batch.mastercardEnrichmentTotal || batch.totalRecords,
      percentage: batch.mastercardEnrichmentProgress || 0,
      enriched: batch.mastercardActualEnriched,
      color: { bg: "bg-purple-500", light: "bg-purple-100", text: "text-purple-700" },
      enabled: batch.mastercardEnrichmentStatus !== "skipped"
    },
    {
      name: "Akkio ML",
      key: "akkio",
      status: batch.akkioPredictionStatus || "pending",
      current: batch.akkioPredictionSuccessful || 0,
      total: batch.totalRecords,
      percentage: batch.akkioPredictionProgress || 0,
      color: { bg: "bg-orange-500", light: "bg-orange-100", text: "text-orange-700" },
      enabled: batch.akkioPredictionStatus !== "skipped"
    }
  ].filter(phase => phase.enabled);

  // Get the currently active phase
  const activePhase = phases.find(p => p.status === "in_progress") || phases[0];

  // Calculate estimated time remaining
  const getEstimatedTime = () => {
    if (!activePhase || activePhase.percentage === 0) return null;
    
    const elapsedMs = batch.createdAt ? Date.now() - new Date(batch.createdAt).getTime() : 0;
    const msPerPercent = elapsedMs / activePhase.percentage;
    const remainingMs = msPerPercent * (100 - activePhase.percentage);
    
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    
    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      return `~${hours}h ${minutes % 60}m remaining`;
    }
    return `~${minutes}m ${seconds}s remaining`;
  };

  const estimatedTime = getEstimatedTime();

  return (
    <div className="space-y-4">
      {/* Header with timing info */}
      <div className="flex justify-between items-center text-sm">
        <div className="flex items-center gap-3 text-gray-600">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>Elapsed: {elapsedTime || "0m 0s"}</span>
          </div>
          {estimatedTime && activePhase.status === "in_progress" && (
            <div className="text-blue-600">
              {estimatedTime}
            </div>
          )}
        </div>
        <div className="font-medium">
          {activePhase.status === "in_progress" ? activePhase.name : "Processing"}
        </div>
      </div>

      {/* Timeline view of all phases */}
      <div className="space-y-3">
        {phases.map((phase, index) => (
          <div key={phase.key} className="relative">
            {/* Connection line to next phase */}
            {index < phases.length - 1 && (
              <div className={`absolute left-4 top-10 bottom-0 w-0.5 ${
                phase.status === "completed" ? "bg-green-300" : "bg-gray-200"
              }`} />
            )}
            
            {/* Phase row */}
            <div className="flex items-center gap-3">
              {/* Status icon */}
              <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                phase.status === "completed" 
                  ? "border-green-500 bg-green-500" 
                  : phase.status === "in_progress"
                  ? "border-blue-500 bg-blue-500"
                  : "border-gray-300 bg-white"
              }`}>
                {phase.status === "completed" ? (
                  <CheckCircle2 className="h-5 w-5 text-white" />
                ) : phase.status === "in_progress" ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : (
                  <div className="h-2 w-2 bg-gray-300 rounded-full" />
                )}
              </div>

              {/* Phase details */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-medium text-sm ${
                    phase.status === "in_progress" ? "text-blue-700" : 
                    phase.status === "completed" ? "text-green-700" : 
                    "text-gray-500"
                  }`}>
                    {phase.name}
                  </span>
                  <span className="text-xs text-gray-600">
                    {phase.status === "completed" ? (
                      <>
                        {phase.matchRate !== undefined && `${phase.matchRate}% matched • `}
                        {phase.enriched !== undefined && `${phase.enriched} enriched • `}
                        {phase.current}/{phase.total} processed
                      </>
                    ) : phase.status === "in_progress" ? (
                      `${phase.current}/${phase.total} records`
                    ) : (
                      "Waiting..."
                    )}
                  </span>
                </div>

                {/* Progress bar for this phase */}
                {(phase.status === "in_progress" || phase.status === "completed") && (
                  <div className="relative">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          phase.status === "completed" ? phase.color.bg : "bg-blue-500"
                        }`}
                        style={{ 
                          width: phase.status === "completed" ? "100%" : `${phase.percentage}%` 
                        }}
                      />
                    </div>
                    {phase.status === "in_progress" && (
                      <span className="absolute -top-0.5 text-xs font-medium text-blue-600" 
                            style={{ left: `${Math.min(phase.percentage, 90)}%` }}>
                        {phase.percentage}%
                      </span>
                    )}
                  </div>
                )}

                {/* Additional details for active phase */}
                {phase.status === "in_progress" && batch.progressMessage && (
                  <p className="text-xs text-gray-500 mt-1">{batch.progressMessage}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary stats */}
      {phases.filter(p => p.status === "completed").length > 0 && (
        <div className="border-t pt-3 flex justify-between text-xs text-gray-600">
          <span>
            {phases.filter(p => p.status === "completed").length} of {phases.length} phases complete
          </span>
          <span className="font-medium">
            Total progress: {Math.round((phases.filter(p => p.status === "completed").length / phases.length) * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}