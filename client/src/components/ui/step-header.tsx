interface StepHeaderProps {
  title: string;
  subtitle?: string;
  currentStep?: number;
  totalSteps?: number;
}

export function StepHeader({ title, subtitle, currentStep, totalSteps }: StepHeaderProps) {
  return (
    <div className="mb-6 border-b border-slate-200 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
        </div>
        {currentStep && totalSteps && (
          <div className="text-sm text-slate-500">
            Step {currentStep} of {totalSteps}
          </div>
        )}
      </div>
    </div>
  );
}