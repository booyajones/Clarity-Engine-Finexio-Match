import Header from "@/components/layout/header";
import { SingleClassification } from "@/components/single-classification";

export default function SingleClassificationPage() {
  return (
    <div className="flex-1 flex flex-col">
      <Header title="Single Classification" subtitle="Classify a single payee" />
      <main className="flex-1 p-6 overflow-auto">
        <SingleClassification />
      </main>
    </div>
  );
}
