"use client"

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from "recharts"

const COLORS = {
  QUEUED: "#38BDF8",     // Info (Blue)
  RUNNING: "#00E5FF",    // Primary Accent (Cyan)
  COMPLETED: "#10B981",  // Success (Green)
  FAILED: "#EF4444",     // Error (Red)
  RETRYING: "#F59E0B",   // Warning (Amber)
}

export function JobStatusChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={90}
          paddingAngle={5}
          dataKey="value"
          stroke="none"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS] || "#7C3AED"} />
          ))}
        </Pie>
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'rgba(11, 16, 32, 0.8)', 
            borderColor: '#111827', 
            color: '#fff',
            backdropFilter: 'blur(12px)',
            fontFamily: 'var(--font-space-mono)',
            textTransform: 'uppercase'
          }}
          itemStyle={{ color: '#00E5FF' }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function WorkerUtilizationChart({ data }: { data: { name: string; capacity: number; load: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <XAxis 
          dataKey="name" 
          stroke="#00E5FF" 
          fontSize={10} 
          fontFamily="var(--font-space-mono)"
          tickLine={false}
          axisLine={false}
          opacity={0.6}
        />
        <YAxis
          stroke="#00E5FF"
          fontSize={10}
          fontFamily="var(--font-space-mono)"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
          opacity={0.6}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0, 229, 255, 0.1)' }}
          contentStyle={{ 
            backgroundColor: 'rgba(11, 16, 32, 0.8)', 
            borderColor: 'rgba(0, 229, 255, 0.3)', 
            color: '#fff',
            backdropFilter: 'blur(12px)',
            fontFamily: 'var(--font-space-mono)'
          }}
        />
        <Bar dataKey="capacity" fill="#111827" stroke="#00E5FF" strokeWidth={1} radius={[2, 2, 0, 0]} name="Capacity" />
        <Bar dataKey="load" fill="#00E5FF" radius={[2, 2, 0, 0]} name="Current Load" />
      </BarChart>
    </ResponsiveContainer>
  )
}
