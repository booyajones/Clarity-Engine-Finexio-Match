import Header from "@/components/layout/header";
import { KeywordManager } from "@/components/keyword-manager";

export default function KeywordManagerPage() {
  return (
    <div className="flex-1 flex flex-col">
      <Header title="Keyword Manager" subtitle="Manage exclusion keywords" />
      <main className="flex-1 p-6 overflow-auto">
        <KeywordManager />
      </main>
    </div>
  );
}
