import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  ArrowRight,
  Building2,
  User,
  Briefcase,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  Shield,
  TrendingUp,
  Search,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClassificationResult {
  payeeType: string;
  confidence: number;
  reasoning: string;
  matchedSupplier?: {
    name: string;
    id: string;
    matchScore: number;
  };
}

export default function SingleClassificationPage() {
  const [payeeName, setPayeeName] = useState("");
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const { toast } = useToast();

  const classifyMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", "/api/classify/single", { payeeName: name });
    },
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: "Classification complete",
        description: `Classified as ${data.payeeType} with ${Math.round(data.confidence * 100)}% confidence`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Classification failed",
        description: error.message || "An error occurred during classification",
        variant: "destructive",
      });
    },
  });

  const handleClassify = () => {
    if (!payeeName.trim()) {
      toast({
        title: "Input required",
        description: "Please enter a payee name to classify",
        variant: "destructive",
      });
      return;
    }
    classifyMutation.mutate(payeeName);
  };

  const features = [
    {
      icon: Sparkles,
      title: "AI-Powered",
      description: "GPT-4 intelligence",
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      icon: Zap,
      title: "Instant",
      description: "Real-time results",
      color: "text-yellow-600",
      bgColor: "bg-yellow-100",
    },
    {
      icon: Shield,
      title: "Accurate",
      description: "95%+ precision",
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      icon: TrendingUp,
      title: "Smart",
      description: "Context-aware",
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
  ];

  const getTypeIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case "business":
        return Building2;
      case "individual":
        return User;
      case "government":
        return Briefcase;
      default:
        return AlertCircle;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case "business":
        return "text-purple-600 bg-purple-100";
      case "individual":
        return "text-blue-600 bg-blue-100";
      case "government":
        return "text-green-600 bg-green-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-20">
        <div className="px-8 py-6">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-900">Single Classification</h1>
            <p className="text-gray-500 mt-1">
              Instantly classify any payee name with AI-powered intelligence
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-8">
        {/* Features */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="bg-white rounded-xl p-4 border border-gray-100 hover:shadow-md transition-all duration-300 group"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className={cn("p-2 rounded-lg inline-block mb-2", feature.bgColor)}>
                  <Icon className={cn("w-5 h-5", feature.color)} />
                </div>
                <h3 className="font-semibold text-sm text-gray-900">{feature.title}</h3>
                <p className="text-xs text-gray-500 mt-1">{feature.description}</p>
              </div>
            );
          })}
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="p-8">
            <div className="max-w-2xl mx-auto">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Enter Payee Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleClassify()}
                  placeholder="e.g., Amazon Web Services, John Smith, IRS"
                  className="w-full px-6 py-4 text-lg border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:outline-none transition-colors pr-14"
                />
                <Search className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
              
              <button
                onClick={handleClassify}
                disabled={classifyMutation.isPending || !payeeName.trim()}
                className={cn(
                  "mt-6 w-full px-8 py-4 rounded-xl font-medium transition-all duration-200 transform flex items-center justify-center",
                  classifyMutation.isPending
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-lg hover:scale-[1.02]"
                )}
              >
                {classifyMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Classifying...
                  </>
                ) : (
                  <>
                    Classify Now
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Result Section */}
        {result && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
            <div className="p-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Classification Result</h3>
              
              <div className="space-y-6">
                {/* Classification Type */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <div className={cn("p-3 rounded-xl", getTypeColor(result.payeeType))}>
                      {(() => {
                        const Icon = getTypeIcon(result.payeeType);
                        return <Icon className="w-6 h-6" />;
                      })()}
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Classification</p>
                      <p className="text-xl font-bold text-gray-900">{result.payeeType}</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Confidence</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {Math.round(result.confidence * 100)}%
                    </p>
                  </div>
                </div>

                {/* Confidence Bar */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500">Confidence Level</span>
                    <span className={cn(
                      "text-sm font-medium",
                      result.confidence > 0.9 ? "text-green-600" : 
                      result.confidence > 0.7 ? "text-yellow-600" : "text-red-600"
                    )}>
                      {result.confidence > 0.9 ? "High" : 
                       result.confidence > 0.7 ? "Medium" : "Low"}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-1000",
                        result.confidence > 0.9 ? "bg-green-500" : 
                        result.confidence > 0.7 ? "bg-yellow-500" : "bg-red-500"
                      )}
                      style={{ width: `${result.confidence * 100}%` }}
                    />
                  </div>
                </div>

                {/* Reasoning */}
                {result.reasoning && (
                  <div className="p-4 bg-purple-50 rounded-xl">
                    <h4 className="font-medium text-purple-900 mb-2">AI Reasoning</h4>
                    <p className="text-sm text-purple-700">{result.reasoning}</p>
                  </div>
                )}

                {/* Matched Supplier */}
                {result.matchedSupplier && (
                  <div className="p-4 bg-blue-50 rounded-xl">
                    <h4 className="font-medium text-blue-900 mb-2">Matched Supplier</h4>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-blue-700">
                          {result.matchedSupplier.name}
                        </p>
                        <p className="text-xs text-blue-600">
                          ID: {result.matchedSupplier.id}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-blue-600">Match Score</p>
                        <p className="text-lg font-bold text-blue-700">
                          {Math.round(result.matchedSupplier.matchScore * 100)}%
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Try Another Button */}
              <button
                onClick={() => {
                  setResult(null);
                  setPayeeName("");
                }}
                className="mt-6 w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
              >
                Try Another Classification
              </button>
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="space-y-2">
              <h4 className="font-semibold text-blue-900">How it works</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Enter any company, individual, or organization name</li>
                <li>• AI analyzes the name using GPT-4 intelligence</li>
                <li>• Matches against 96,670 suppliers in our database</li>
                <li>• Returns classification with confidence score and reasoning</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}