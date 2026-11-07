import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Overview" };

export default function AdminHome() {
  return (
    <>
      <h1 className="text-h1">Overview</h1>
      <Card className="mt-6" padded={false}>
        <EmptyState message="Rates, allotment and the enquiry inbox arrive in the next sprint." />
      </Card>
    </>
  );
}
