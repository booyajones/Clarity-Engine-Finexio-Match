import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { Clock, FileText, CheckCircle, AlertCircle, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BatchCardProps {
  batch: {
    id: number;
    filename: string;
    status: 'queued' | 'processing' | 'enriching' | 'completed' | 'failed';
    totalRecords: number;
    processedRecords: number;
    accuracy?: number;
    createdAt: string;
    completedAt?: string;
    currentStep?: string;
  };
  onDelete?: (id: number) => void;
  onRetry?: (id: number) => void;
}

export function BatchCard({ batch, onDelete, onRetry }: BatchCardProps) {
  // Calculate processing time
  const processingTime = batch.completedAt && batch.createdAt
    ? Math.round((new Date(batch.completedAt).getTime() - new Date(batch.createdAt).getTime()) / 1000)
    : null;
  
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return `${minutes}m ${secs}s`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };
  
  const getIcon = () => {
    switch (batch.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-emerald-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-rose-600" />;
      case 'processing':
      case 'enriching':
        return <Clock className="h-4 w-4 text-blue-600 animate-spin" />;
      default:
        return <FileText className="h-4 w-4 text-slate-400" />;
    }
  };
  
  const completionPercent = batch.totalRecords > 0 
    ? Math.round((batch.processedRecords / batch.totalRecords) * 100)
    : 0;
  
  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {getIcon()}
            <CardTitle className="text-base font-medium">
              {batch.filename}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={batch.status} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => onRetry?.(batch.id)}
                  disabled={batch.status !== 'failed'}
                >
                  Retry
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onDelete?.(batch.id)}
                  className="text-rose-600"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Stats */}
        <div className="text-sm text-slate-600 space-y-1">
          <div className="flex items-center justify-between">
            <span>{batch.totalRecords.toLocaleString()} rows</span>
            {batch.accuracy !== undefined && (
              <span>Accuracy: {Math.round(batch.accuracy)}%</span>
            )}
          </div>
          
          {processingTime && (
            <div className="flex items-center justify-between">
              <span>Processing time</span>
              <span className="font-medium">{formatTime(processingTime)}</span>
            </div>
          )}
          
          {batch.currentStep && batch.status === 'processing' && (
            <div className="text-xs text-blue-600 font-medium">
              {batch.currentStep}
            </div>
          )}
        </div>
        
        {/* Progress bar for active batches */}
        {(batch.status === 'processing' || batch.status === 'enriching') && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Progress</span>
              <span>{completionPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 transition-all duration-500"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Action button */}
        <Link href={`/batch/${batch.id}`}>
          <Button className="w-full" size="sm">
            {batch.status === 'completed' ? 'View Results' : 'View Details'}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}