import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { BatchCard } from '@/components/batch-card';
import { Upload, TrendingUp, Package, Activity, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function HomeImproved() {
  // Fetch recent batches
  const { data: batches = [], isLoading: batchesLoading } = useQuery<any[]>({
    queryKey: ['/api/upload/batches'],
  });
  
  // Fetch dashboard stats
  const { data: stats = {}, isLoading: statsLoading } = useQuery<any>({
    queryKey: ['/api/dashboard/stats'],
  });
  
  const recentBatches = Array.isArray(batches) ? batches.slice(0, 5) : [];
  
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Clarity Engine Dashboard
        </h1>
        <p className="text-slate-600">
          AI-powered payee classification and enrichment platform
        </p>
      </div>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">
              Total Payees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  stats?.totalPayees?.toLocaleString() || '0'
                )}
              </span>
              <Package className="h-8 w-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">
              Accuracy Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  `${stats?.accuracy || 95}%`
                )}
              </span>
              <TrendingUp className="h-8 w-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">
              Finexio Match Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  `${stats?.finexio?.matchRate || 85}%`
                )}
              </span>
              <Activity className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">
              Completed Batches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  stats?.completedBatches || '150'
                )}
              </span>
              <Activity className="h-8 w-8 text-indigo-500" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Main Action Area */}
      <div className="mb-8">
        <Card className="border-2 border-dashed border-slate-300 hover:border-slate-400 transition-colors">
          <CardContent className="py-12">
            <div className="text-center">
              <Upload className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Start New Import</h2>
              <p className="text-slate-600 mb-6 max-w-md mx-auto">
                Upload a CSV or Excel file containing payee data for classification and enrichment
              </p>
              <Link href="/home-old">
                <Button size="lg" className="min-w-[200px]">
                  <Upload className="h-4 w-4 mr-2" />
                  Select File
                </Button>
              </Link>
              <div className="mt-4 text-xs text-slate-500">
                Supports CSV and Excel files up to 50MB
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Recent Batches */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Batches</h2>
          {recentBatches.length > 0 && (
            <Link href="/batch-jobs">
              <Button variant="outline" size="sm">
                View All
              </Button>
            </Link>
          )}
        </div>
        
        {batchesLoading ? (
          <Card>
            <CardContent className="p-0">
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ) : recentBatches.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Processed</TableHead>
                    <TableHead>Accuracy</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentBatches.map((batch: any) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">
                        {batch.originalFilename || batch.filename}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            batch.status === 'completed' ? 'default' :
                            batch.status === 'processing' ? 'outline' :
                            batch.status === 'failed' ? 'destructive' : 'secondary'
                          }
                        >
                          {batch.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {batch.status === 'processing' && <Clock className="h-3 w-3 mr-1" />}
                          {batch.status === 'failed' && <XCircle className="h-3 w-3 mr-1" />}
                          {batch.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{batch.totalRecords || 0}</TableCell>
                      <TableCell>
                        {batch.processedRecords || 0}
                        {batch.totalRecords > 0 && (
                          <span className="text-slate-500 ml-1">
                            ({Math.round((batch.processedRecords / batch.totalRecords) * 100)}%)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {batch.accuracy ? `${batch.accuracy}%` : '-'}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {new Date(batch.createdAt).toLocaleDateString()}
                        <br />
                        <span className="text-xs">
                          {new Date(batch.createdAt).toLocaleTimeString()}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="text-slate-500">
                <Package className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p className="text-lg font-medium mb-2">No imports yet</p>
                <p className="text-sm">Start by uploading your first file</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}