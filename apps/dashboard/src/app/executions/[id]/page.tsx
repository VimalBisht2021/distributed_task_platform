import { use } from "react"
import { ExecutionViewer } from "@/components/Executions/ExecutionViewer"

export default function ExecutionDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <div className="container mx-auto p-6 max-w-6xl">
        <ExecutionViewer executionId={id} />
    </div>
  )
}
