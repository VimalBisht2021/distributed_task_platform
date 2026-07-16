import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
}

export function StatsCard({ title, value, description, icon }: StatsCardProps) {
  return (
    <Card className="relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 transition-opacity duration-300 group-hover:opacity-20 pointer-events-none text-accent-primary transform scale-150 -translate-y-1/4 translate-x-1/4">
        {icon}
      </div>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
        <CardTitle className="text-xs text-accent-primary/80 glow-text-primary">
          {title}
        </CardTitle>
        {icon && <div className="text-accent-primary animate-pulse-glow">{icon}</div>}
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="text-3xl font-mono font-bold text-white tracking-widest">{value}</div>
        {description && (
          <p className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 mt-2">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}
