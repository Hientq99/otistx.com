import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  change?: string;
  changeLabel?: string;
  changeType?: "positive" | "negative" | "neutral";
  iconColor?: string;
}

export function StatsCard({
  title,
  value,
  icon: Icon,
  change,
  changeLabel,
  changeType = "neutral",
  iconColor = "text-primary"
}: StatsCardProps) {
  const changeColors = {
    positive: "text-accent",
    negative: "text-destructive",
    neutral: "text-gray-600"
  };

  return (
    <Card className="bg-surface border border-gray-200">
      <CardContent className="p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={`w-8 h-8 bg-opacity-10 rounded-md flex items-center justify-center ${iconColor === 'text-primary' ? 'bg-primary' : iconColor === 'text-accent' ? 'bg-accent' : iconColor === 'text-warning' ? 'bg-warning' : 'bg-gray-500'}`}>
              <Icon className={`h-4 w-4 ${iconColor}`} />
            </div>
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-2xl font-semibold text-gray-900">{value}</p>
          </div>
        </div>
        {change && changeLabel && (
          <div className="mt-4">
            <div className="flex items-center text-sm">
              <span className={`font-medium ${changeColors[changeType]}`}>
                {change}
              </span>
              <span className="text-gray-600 ml-1">{changeLabel}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
