import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2, Clock, ChevronRight, AlertCircle, XCircle, Info } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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
  const [pollingCounter, setPollingCounter] = useState(0);
  const queryClient = useQueryClient();
  
  const cancelJobMutation = useMutation({
    mutationFn: () => apiRequest.post(`/api/upload/batch/${batch.id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/upload/batches'] });
    }
  });

  // Update elapsed time and polling counter every second
  useEffect(() => {
    if (!batch.createdAt || batch.status === "completed" || batch.status === "failed") return;

    const updateElapsed = () => {
      const start = new Date(batch.createdAt!).getTime();
      const now = Date.now();
      const elapsed = now - start;
      
      // Update polling counter for Mastercard
      setPollingCounter(prev => prev + 1);
      
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
      status: batch.finexioMatchingProgress >= batch.processedRecords ? "completed" :
              batch.finexioMatchingProgress > 0 ? "in_progress" : "pending",
      current: batch.finexioMatchingProgress || 0,
      total: batch.processedRecords || batch.totalRecords,
      percentage: batch.processedRecords > 0 ? 
        Math.round((batch.finexioMatchingProgress || 0) / batch.processedRecords * 100) : 0,
      matchRate: batch.finexioMatchPercentage,
      color: { bg: "bg-green-500", light: "bg-green-100", text: "text-green-700" },
      enabled: batch.finexioMatchingStatus !== "skipped"
    },
    {
      name: "Google Address",
      key: "google",
      status: batch.googleAddressProgress >= batch.processedRecords ? "completed" :
              batch.googleAddressProgress > 0 ? "in_progress" : "pending",
      current: batch.googleAddressProgress || 0,
      total: batch.processedRecords || batch.totalRecords,
      percentage: batch.processedRecords > 0 ? 
        Math.round((batch.googleAddressProgress || 0) / batch.processedRecords * 100) : 0,
      validated: batch.googleAddressValidated,
      color: { bg: "bg-indigo-500", light: "bg-indigo-100", text: "text-indigo-700" },
      enabled: batch.googleAddressStatus !== "skipped"
    },
    {
      name: "Mastercard",
      key: "mastercard",
      status: batch.mastercardEnrichmentProgress >= batch.processedRecords ? "completed" :
              batch.mastercardEnrichmentProgress > 0 ? "in_progress" : "pending",
      current: batch.mastercardEnrichmentProgress || 0,
      total: batch.processedRecords || batch.totalRecords,
      percentage: batch.processedRecords > 0 ? 
        Math.round((batch.mastercardEnrichmentProgress || 0) / batch.processedRecords * 100) : 0,
      enriched: batch.mastercardActualEnriched,
      color: { bg: "bg-purple-500", light: "bg-purple-100", text: "text-purple-700" },
      enabled: batch.mastercardEnrichmentStatus !== "skipped"
    },
    {
      name: "Akkio ML",
      key: "akkio",
      status: batch.akkioPredictionProgress >= batch.processedRecords ? "completed" :
              batch.akkioPredictionProgress > 0 ? "in_progress" : "pending",
      current: batch.akkioPredictionProgress || 0,
      total: batch.processedRecords || batch.totalRecords,
      percentage: batch.processedRecords > 0 ? 
        Math.round((batch.akkioPredictionProgress || 0) / batch.processedRecords * 100) : 0,
      predicted: batch.akkioPredictionSuccessful,
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
        <div className="flex items-center gap-3">
          <div className="font-medium">
            {activePhase.status === "in_progress" ? activePhase.name : "Processing"}
          </div>
          {(batch.status === "processing" || batch.status === "enriching") && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => cancelJobMutation.mutate()}
              disabled={cancelJobMutation.isPending}
              className="h-7 text-xs"
            >
              <XCircle className="h-3 w-3 mr-1" />
              {cancelJobMutation.isPending ? "Cancelling..." : "Cancel Job"}
            </Button>
          )}
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
                        {phase.validated !== undefined && `${phase.validated} validated • `}
                        {phase.predicted !== undefined && `${phase.predicted} predicted • `}
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
                  <div className="space-y-1">
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          phase.status === "completed" ? phase.color.bg : "bg-blue-500"
                        }`}
                        style={{ 
                          width: `${phase.percentage}%` 
                        }}
                      />
                    </div>
                    {phase.status === "in_progress" && phase.percentage > 0 && (
                      <div className="text-xs font-medium text-blue-600 text-right">
                        {phase.percentage}%
                      </div>
                    )}
                  </div>
                )}

                {/* Additional details for active phase */}
                {phase.status === "in_progress" && batch.progressMessage && (
                  <p className="text-xs text-gray-500 mt-1">{batch.progressMessage}</p>
                )}
                
                {/* Special messaging for Mastercard polling */}
                {phase.key === "mastercard" && phase.status === "in_progress" && phase.current === 0 && (
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-xs space-y-1">
                        <p className="font-medium text-amber-900">
                          Waiting for Mastercard API Response
                        </p>
                        <p className="text-amber-700">
                          Your records have been submitted to Mastercard's servers. Processing typically takes 10-20 minutes.
                        </p>
                        <div className="flex items-center gap-1 text-amber-600">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>
                            Checking status... (checked {Math.floor(pollingCounter / 5)} times, next check in {5 - (pollingCounter % 5)}s)
                          </span>
                        </div>
                        <div className="text-xs text-amber-600">
                          ⚡ This is normal - Mastercard processes large batches asynchronously
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Show when Mastercard is actually processing results */}
                {phase.key === "mastercard" && phase.status === "in_progress" && phase.current > 0 && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="text-xs space-y-1">
                        <p className="font-medium text-green-900">
                          Receiving Results from Mastercard
                        </p>
                        <p className="text-green-700">
                          Processing {phase.current} of {phase.total} records...
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary stats */}
      {phases.filter(p => p.status === "completed").length > 0 && (
        <div className="border-t pt-3 text-xs text-gray-600">
          <span>
            {phases.filter(p => p.status === "completed").length} of {phases.length} phases complete
          </span>
        </div>
      )}
    </div>
  );
}