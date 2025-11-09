import { Badge } from "@/components/ui/badge";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { SessionStatus } from './types';

interface StatusBadgeProps {
  status: SessionStatus;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  switch (status) {
    case 'waiting':
      return (
        <Badge className="bg-blue-100 text-blue-800 border-blue-300">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Đang chờ
        </Badge>
      );
    case 'completed':
      return (
        <Badge className="bg-green-100 text-green-800 border-green-300">
          <CheckCircle className="w-3 h-3 mr-1" />
          Hoàn thành
        </Badge>
      );
    case 'expired':
      return (
        <Badge className="bg-red-100 text-red-800 border-red-300">
          <AlertCircle className="w-3 h-3 mr-1" />
          Hết hạn
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-gray-100 text-gray-800 border-gray-300">
          <AlertCircle className="w-3 h-3 mr-1" />
          Thất bại
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};