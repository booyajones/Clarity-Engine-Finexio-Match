import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Loader2 } from "lucide-react";

interface UploadBatch {
  id: number;
  status: string;
  totalRecords: number;
  processedRecords: number;
  currentStep?: string;
  progressMessage?: string;
  // Enrichment statuses
  finexioMatchingStatus?: string;
  googleAddressStatus?: string;
  mastercardEnrichmentStatus?: string;
  akkioPredictionStatus?: string;
}

interface ProgressTrackerProps {
  batch: UploadBatch;
}

export function ProgressTracker({ batch }: ProgressTrackerProps) {
  // Calculate overall progress across all phases
  const calculateOverallProgress = () => {
    const isEnriching = batch.status === "enriching" || 
      (batch.processedRecords === batch.totalRecords && batch.status === "processing");
    
    // If still in classification phase only
    if (!isEnriching && batch.status === "processing" && batch.processedRecords < batch.totalRecords) {
      // Classification is the first 25% of total progress
      return batch.totalRecords > 0 
        ? (batch.processedRecords / batch.totalRecords) * 25 
        : 0;
    }
    
    // Calculate progress across all phases with proper weighting
    let totalProgress = 0;
    let activeEnrichmentPhases = 0;
    
    // Classification phase (always 25% of total)
    if (batch.processedRecords === batch.totalRecords) {
      totalProgress += 25; // Classification complete = 25%
    } else {
      totalProgress += (batch.processedRecords / batch.totalRecords) * 25;
    }
    
    // Count active enrichment phases (excluding skipped ones)
    const enrichmentPhases = [];
    
    if (batch.finexioMatchingStatus && batch.finexioMatchingStatus !== "skipped") {
      enrichmentPhases.push({
        status: batch.finexioMatchingStatus,
        progress: batch.finexioMatchingStatus === "completed" ? 100 : 
                  batch.finexioMatchingStatus === "in_progress" ? 50 : 0
      });
      activeEnrichmentPhases++;
    }
    
    if (batch.googleAddressStatus && batch.googleAddressStatus !== "skipped") {
      enrichmentPhases.push({
        status: batch.googleAddressStatus,
        progress: batch.googleAddressStatus === "completed" ? 100 : 
                  batch.googleAddressStatus === "in_progress" ? 50 : 0
      });
      activeEnrichmentPhases++;
    }
    
    if (batch.mastercardEnrichmentStatus && batch.mastercardEnrichmentStatus !== "skipped") {
      enrichmentPhases.push({
        status: batch.mastercardEnrichmentStatus,
        progress: batch.mastercardEnrichmentStatus === "completed" ? 100 : 
                  batch.mastercardEnrichmentStatus === "in_progress" ? 50 : 0
      });
      activeEnrichmentPhases++;
    }
    
    if (batch.akkioPredictionStatus && batch.akkioPredictionStatus !== "skipped") {
      enrichmentPhases.push({
        status: batch.akkioPredictionStatus,
        progress: batch.akkioPredictionStatus === "completed" ? 100 : 
                  batch.akkioPredictionStatus === "in_progress" ? 50 : 0
      });
      activeEnrichmentPhases++;
    }
    
    // If there are no enrichment phases, classification is 100% of the work
    if (activeEnrichmentPhases === 0) {
      return (batch.processedRecords / batch.totalRecords) * 100;
    }
    
    // Each enrichment phase gets an equal share of the remaining 75%
    const enrichmentWeight = 75 / activeEnrichmentPhases;
    
    // Add progress for each enrichment phase
    enrichmentPhases.forEach(phase => {
      totalProgress += (phase.progress / 100) * enrichmentWeight;
    });
    
    return Math.min(Math.round(totalProgress), 100);
  };
  
  // Get current phase description
  const getCurrentPhase = () => {
    if (batch.status === "processing" && batch.processedRecords < batch.totalRecords) {
      return `Classification: ${batch.processedRecords}/${batch.totalRecords} records`;
    }
    
    if (batch.processedRecords === batch.totalRecords) {
      // Check enrichment phases
      if (batch.finexioMatchingStatus === "in_progress") {
        return "Matching with Finexio suppliers...";
      }
      if (batch.googleAddressStatus === "in_progress") {
        return "Validating addresses with Google...";
      }
      if (batch.mastercardEnrichmentStatus === "in_progress") {
        return "Enriching with Mastercard data...";
      }
      if (batch.akkioPredictionStatus === "in_progress") {
        return "Running Akkio ML predictions...";
      }
      
      // Check if any are pending
      if (batch.finexioMatchingStatus === "pending" || 
          batch.googleAddressStatus === "pending" ||
          batch.mastercardEnrichmentStatus === "pending" ||
          batch.akkioPredictionStatus === "pending") {
        return "Starting enrichment processes...";
      }
      
      return "Completing enrichment...";
    }
    
    return batch.currentStep || "Processing...";
  };
  
  // Show phase indicators
  const getPhaseIndicators = () => {
    const phases = [];
    
    // Classification
    phases.push({
      name: "Classification",
      status: batch.processedRecords === batch.totalRecords ? "completed" : "in_progress",
      progress: batch.totalRecords > 0 ? (batch.processedRecords / batch.totalRecords) * 100 : 0
    });
    
    // Only show enrichment phases if classification is complete
    if (batch.processedRecords === batch.totalRecords) {
      if (batch.finexioMatchingStatus && batch.finexioMatchingStatus !== "skipped") {
        phases.push({
          name: "Finexio",
          status: batch.finexioMatchingStatus,
          progress: batch.finexioMatchingStatus === "completed" ? 100 : 
                   batch.finexioMatchingStatus === "in_progress" ? 50 : 0
        });
      }
      
      if (batch.googleAddressStatus && batch.googleAddressStatus !== "skipped") {
        phases.push({
          name: "Google",
          status: batch.googleAddressStatus,
          progress: batch.googleAddressStatus === "completed" ? 100 : 
                   batch.googleAddressStatus === "in_progress" ? 50 : 0
        });
      }
      
      if (batch.mastercardEnrichmentStatus && batch.mastercardEnrichmentStatus !== "skipped") {
        phases.push({
          name: "Mastercard",
          status: batch.mastercardEnrichmentStatus,
          progress: batch.mastercardEnrichmentStatus === "completed" ? 100 : 
                   batch.mastercardEnrichmentStatus === "in_progress" ? 50 : 0
        });
      }
      
      if (batch.akkioPredictionStatus && batch.akkioPredictionStatus !== "skipped") {
        phases.push({
          name: "Akkio",
          status: batch.akkioPredictionStatus,
          progress: batch.akkioPredictionStatus === "completed" ? 100 : 
                   batch.akkioPredictionStatus === "in_progress" ? 50 : 0
        });
      }
    }
    
    return phases;
  };

  const isStreaming = batch.totalRecords === 0 && batch.processedRecords > 0;
  const overallProgress = calculateOverallProgress();
  const phases = getPhaseIndicators();

  return (
    <div className="space-y-3">
      {/* Main progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">{getCurrentPhase()}</span>
          {!isStreaming && (
            <span className="font-medium">{Math.round(overallProgress)}%</span>
          )}
        </div>
        {!isStreaming ? (
          <Progress value={overallProgress} className="h-2" />
        ) : (
          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-primary" style={{ width: '100%' }} />
          </div>
        )}
      </div>
      
      {/* Phase indicators - horizontal chevron style */}
      {phases.length > 1 && (
        <div className="flex items-center gap-1">
          {phases.map((phase, index) => (
            <div key={phase.name} className="flex items-center">
              <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                phase.status === "completed" 
                  ? "bg-green-100 text-green-700" 
                  : phase.status === "in_progress"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-500"
              }`}>
                {phase.status === "completed" ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : phase.status === "in_progress" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : null}
                <span>{phase.name}</span>
              </div>
              {index < phases.length - 1 && (
                <svg className="h-4 w-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
      
      {batch.progressMessage && (
        <p className="text-sm text-gray-600">{batch.progressMessage}</p>
      )}
    </div>
  );
}