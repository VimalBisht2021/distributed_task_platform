"use client"

import useSWR from "swr"
import { api } from "@/lib/api"
import { JobsTable } from "@/components/jobs/JobsTable"
import { Skeleton } from "@/components/ui/Skeleton"
import { Button } from "@/components/ui/Button"
import { Plus } from "lucide-react"

export default function JobsPage() {
  const { data: jobs, isLoading, mutate } = useSWR("jobsList", api.jobs.list, { refreshInterval: 5000 })

  const handleCreateJob = async () => {
    try {
      await api.jobs.create({
        jobType: "long-running-job",
        payload: { duration: 15000 },
        priority: "MEDIUM"
      });
      mutate();
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-base-800 pb-4">
        <div>
          <h2 className="text-xl font-mono font-bold tracking-widest uppercase text-white glow-text-primary">JOB_QUEUE</h2>
          <p className="text-sm font-mono text-zinc-500 tracking-wider">DISTRIBUTED_EXECUTION_LOG</p>
        </div>
        <Button onClick={handleCreateJob} variant="cyber">
          <Plus className="mr-2 h-4 w-4" />
          DISPATCH_TEST_JOB
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-[400px] w-full bg-base-800" />
        </div>
      ) : (
        <JobsTable data={jobs || []} />
      )}
    </div>
  )
}
