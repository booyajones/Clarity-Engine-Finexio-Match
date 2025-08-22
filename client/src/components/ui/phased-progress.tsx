interface Phase {
  name: string;
  done: number;
  total: number;
  status?: 'pending' | 'active' | 'completed';
}

interface PhasedProgressProps {
  phases: Phase[];
  className?: string;
}

export function PhasedProgress({ phases, className = "" }: PhasedProgressProps) {
  const total = phases.reduce((acc, phase) => acc + phase.total, 0) || 1;
  const done = phases.reduce((acc, phase) => acc + phase.done, 0);
  const percentage = Math.round((done / total) * 100);
  
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">
          Progress: {done.toLocaleString()} / {total.toLocaleString()}
        </span>
        <span className="text-sm font-medium text-slate-700">{percentage}%</span>
      </div>
      
      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      
      <div className="flex gap-4 mt-3">
        {phases.map((phase) => {
          const phasePercentage = phase.total > 0 ? Math.round((phase.done / phase.total) * 100) : 0;
          const statusColor = phase.status === 'completed' ? 'text-emerald-600' : 
                             phase.status === 'active' ? 'text-blue-600' : 
                             'text-slate-500';
          
          return (
            <div key={phase.name} className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${statusColor}`}>
                  {phase.name}
                </span>
                <span className="text-xs text-slate-500">
                  {phasePercentage}%
                </span>
              </div>
              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    phase.status === 'completed' ? 'bg-emerald-500' :
                    phase.status === 'active' ? 'bg-blue-500' :
                    'bg-slate-300'
                  }`}
                  style={{ width: `${phasePercentage}%` }}
                />
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {phase.done.toLocaleString()} / {phase.total.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}