"use client"

import * as React from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table"
import { Button } from "@/components/ui/Button"
import { JobDto } from "@/lib/api"
import { Badge } from "@/components/ui/Badge"
import { formatDate } from "@/lib/utils"
import { Progress } from "@/components/ui/Progress"
import { useRouter } from "next/navigation"

const columns: ColumnDef<JobDto>[] = [
  {
    accessorKey: "jobId",
    header: "ID",
    cell: ({ row }) => <span className="font-mono text-xs">{row.getValue("jobId")}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string
      let variant: any = "default"
      if (status === "COMPLETED") variant = "success"
      if (status === "FAILED") variant = "destructive"
      if (status === "RETRYING") variant = "warning"
      if (status === "RUNNING") variant = "secondary"
      
      return <Badge variant={variant}>{status}</Badge>
    },
  },
  {
    accessorKey: "progress",
    header: "Progress",
    cell: ({ row }) => {
      const progress = row.getValue("progress") as number
      return <Progress value={progress} className="w-[100px]" />
    },
  },
  {
    accessorKey: "workerId",
    header: "Worker",
    cell: ({ row }) => {
      const workerId = row.getValue("workerId") as string | undefined
      return workerId ? <span className="font-mono text-xs text-zinc-400">{workerId.slice(0, 8)}</span> : <span className="text-zinc-600">-</span>
    },
  },
  {
    accessorKey: "retryCount",
    header: "Retries",
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => <span className="text-zinc-400">{formatDate(row.getValue("createdAt"))}</span>,
  },
]

export function JobsTable({ data }: { data: JobDto[] }) {
  const router = useRouter()
  const [sorting, setSorting] = React.useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  })

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-zinc-800 bg-zinc-950">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={() => router.push(`/jobs/${row.original.jobId}`)}
                  className="cursor-pointer"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-zinc-500">
                  No jobs found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
