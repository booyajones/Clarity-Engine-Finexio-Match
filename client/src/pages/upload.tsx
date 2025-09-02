import { useState, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Upload as UploadIcon,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Loader2,
  Sparkles,
  Zap,
  Shield,
  TrendingUp,
  ArrowRight,
  FileText,
  Download,
  AlertCircle,
  X,
  Clock,
  Package
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProcessingOptions {
  confidenceThreshold: number;
  useFuzzyMatching: boolean;
  useAI: boolean;
  matchingAlgorithm: string;
}

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
    confidenceThreshold: 95,
    useFuzzyMatching: true,
    useAI: true,
    matchingAlgorithm: "advanced",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: batches = [], isLoading: isBatchesLoading } = useQuery({
    queryKey: ["/api/upload/batches"],
    refetchInterval: 2000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return apiRequest("POST", "/api/upload", formData);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/upload/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Upload successful",
        description: `Processing ${data.filename} with ${data.recordCount} records`,
      });
      setFile(null);
      setUploadProgress(0);
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "An error occurred during upload",
        variant: "destructive",
      });
      setUploadProgress(0);
    },
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      const fileType = droppedFile.type;
      const fileName = droppedFile.name.toLowerCase();
      
      if (fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        setFile(droppedFile);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a CSV or Excel file",
          variant: "destructive",
        });
      }
    }
  }, [toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("options", JSON.stringify(processingOptions));

    // Simulate progress
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    uploadMutation.mutate(formData);
  };

  const features = [
    {
      icon: Sparkles,
      title: "AI-Powered",
      description: "95%+ accuracy",
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Process in minutes",
      color: "text-yellow-600",
      bgColor: "bg-yellow-100",
    },
    {
      icon: Shield,
      title: "Secure",
      description: "Enterprise-grade",
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      icon: TrendingUp,
      title: "96,670",
      description: "Suppliers available",
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
  ];

  const recentBatches = batches.slice(0, 3);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-20">
        <div className="px-8 py-6">
          <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-900">Upload & Process</h1>
            <p className="text-gray-500 mt-1">
              Upload CSV or Excel files for intelligent payee classification
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Section */}
          <div className="lg:col-span-2 space-y-6">
            {/* Features */}
            <div className="grid grid-cols-4 gap-3">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="bg-white rounded-xl p-3 border border-gray-100 hover:shadow-md transition-all duration-300"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className={cn("p-2 rounded-lg inline-block mb-1", feature.bgColor)}>
                      <Icon className={cn("w-4 h-4", feature.color)} />
                    </div>
                    <h3 className="font-semibold text-xs text-gray-900">{feature.title}</h3>
                    <p className="text-xs text-gray-500">{feature.description}</p>
                  </div>
                );
              })}
            </div>

            {/* Upload Area */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={cn(
                  "relative p-8 cursor-pointer transition-all duration-300",
                  "border-2 border-dashed rounded-2xl",
                  dragActive
                    ? "border-purple-500 bg-purple-50"
                    : file
                    ? "border-green-500 bg-green-50"
                    : "border-gray-200 hover:border-purple-400 hover:bg-gray-50"
                )}
                onClick={() => !file && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                <div className="text-center">
                  {file ? (
                    <div className="space-y-4">
                      <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
                      <div>
                        <div className="inline-flex items-center px-4 py-2 bg-green-100 rounded-xl">
                          <FileSpreadsheet className="w-5 h-5 text-green-600 mr-2" />
                          <span className="font-medium text-green-900">{file.name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setFile(null);
                            }}
                            className="ml-3 p-1 hover:bg-green-200 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4 text-green-700" />
                          </button>
                        </div>
                        <p className="text-sm text-gray-500 mt-2">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4">
                        <UploadIcon className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {dragActive ? "Drop your file here" : "Drag & drop your file"}
                      </h3>
                      <p className="text-gray-500 mb-2">
                        or click to browse
                      </p>
                      <p className="text-xs text-gray-400">
                        CSV, XLS, XLSX up to 50MB
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Processing Options */}
              {file && (
                <div className="p-6 bg-gray-50 border-t border-gray-100">
                  <h4 className="font-semibold text-gray-900 mb-4">Options</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Confidence</span>
                      <span className="text-sm font-medium text-purple-600">
                        {processingOptions.confidenceThreshold}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="100"
                      value={processingOptions.confidenceThreshold}
                      onChange={(e) =>
                        setProcessingOptions({
                          ...processingOptions,
                          confidenceThreshold: parseInt(e.target.value),
                        })
                      }
                      className="w-full accent-purple-600"
                    />
                    
                    <div className="flex items-center justify-between">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={processingOptions.useAI}
                          onChange={(e) =>
                            setProcessingOptions({
                              ...processingOptions,
                              useAI: e.target.checked,
                            })
                          }
                          className="w-4 h-4 text-purple-600 rounded"
                        />
                        <span className="text-sm text-gray-700">AI Classification</span>
                      </label>
                      
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={processingOptions.useFuzzyMatching}
                          onChange={(e) =>
                            setProcessingOptions({
                              ...processingOptions,
                              useFuzzyMatching: e.target.checked,
                            })
                          }
                          className="w-4 h-4 text-purple-600 rounded"
                        />
                        <span className="text-sm text-gray-700">Fuzzy Matching</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Progress */}
              {uploadMutation.isPending && (
                <div className="p-6 border-t border-gray-100">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Processing...</span>
                      <span className="text-sm text-purple-600">{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {file && !uploadMutation.isPending && (
                <div className="p-6 bg-white border-t border-gray-100">
                  <button
                    onClick={handleUpload}
                    className="w-full px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg transition-all duration-200 transform hover:scale-[1.02] font-medium flex items-center justify-center"
                  >
                    Process File
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Recent Batches Sidebar */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
                <Clock className="w-4 h-4 mr-2 text-gray-400" />
                Recent Batches
              </h3>
              
              {isBatchesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-lg skeleton bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : recentBatches.length > 0 ? (
                <div className="space-y-3">
                  {recentBatches.map((batch: any) => (
                    <div
                      key={batch.id}
                      className="p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer border border-gray-100"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {batch.filename}
                        </span>
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          batch.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : batch.status === "processing"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-700"
                        )}>
                          {batch.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {batch.processedRecords}/{batch.totalRecords} records
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm text-gray-500">No recent batches</p>
                </div>
              )}
            </div>

            {/* Help Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-blue-900 text-sm">Requirements</h4>
                  <ul className="text-xs text-blue-700 space-y-0.5">
                    <li>• Headers in first row</li>
                    <li>• "Payee Name" column required</li>
                    <li>• Max 50MB file size</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}