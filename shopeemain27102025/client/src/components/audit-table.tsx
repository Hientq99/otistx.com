import { Badge } from "@/components/ui/badge";
import { type AuditLog } from "@shared/schema";
import { type User } from "@/lib/auth";

interface AuditTableProps {
  logs: AuditLog[];
  users: User[];
}

export function AuditTable({ logs, users }: AuditTableProps) {
  const getUserName = (userId: number) => {
    const user = users.find(u => u.id === userId);
    return user?.fullName || "Unknown";
  };

  const getActionBadge = (action: string) => {
    const actionColors: Record<string, string> = {
      LOGIN: "bg-primary bg-opacity-10 text-primary",
      LOGOUT: "bg-gray-500 bg-opacity-10 text-gray-500",
      PROJECT_CREATE: "bg-accent bg-opacity-10 text-accent",
      PROJECT_UPDATE: "bg-warning bg-opacity-10 text-warning",
      BUDGET_APPROVE: "bg-accent bg-opacity-10 text-accent",
      BUDGET_MODIFY: "bg-warning bg-opacity-10 text-warning",
      RESOURCE_ASSIGN: "bg-primary bg-opacity-10 text-primary",
    };

    return (
      <Badge className={actionColors[action] || "bg-gray-500 bg-opacity-10 text-gray-500"}>
        {action}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: Date) => {
    return new Date(timestamp).toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
              Thời gian
            </th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
              Người dùng
            </th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
              Hành động
            </th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
              Mô tả
            </th>
            <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
              IP Address
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="py-3 text-sm text-gray-900">
                {formatTimestamp(log.timestamp)}
              </td>
              <td className="py-3 text-sm text-gray-900">
                {getUserName(log.userId)}
              </td>
              <td className="py-3">
                {getActionBadge(log.action)}
              </td>
              <td className="py-3 text-sm text-gray-900">
                {log.description}
              </td>
              <td className="py-3 text-sm text-gray-500">
                {log.ipAddress}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
