import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Search, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { FilterState } from './types';
import { DATE_FILTER_OPTIONS, ITEMS_PER_PAGE_OPTIONS } from './constants';

interface HistoryFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: Partial<FilterState>) => void;
}

export const HistoryFilters = ({ filters, onFiltersChange }: HistoryFiltersProps) => {
  return (
    <Card className="shadow-sm border-gray-200 mb-4 sm:mb-6">
      <CardContent className="p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Search - Mobile full width, Desktop span 2 */}
          <div className="sm:col-span-2 lg:col-span-2">
            <Label className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">
              Tìm kiếm
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Số điện thoại, session ID..."
                value={filters.searchQuery}
                onChange={(e) => onFiltersChange({ searchQuery: e.target.value })}
                className="pl-10 text-sm"
              />
            </div>
          </div>

          {/* Date Filter */}
          <div>
            <Label className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">
              Lọc ngày
            </Label>
            <Select 
              value={filters.dateFilter} 
              onValueChange={(value) => onFiltersChange({ dateFilter: value })}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Chọn thời gian" />
              </SelectTrigger>
              <SelectContent>
                {DATE_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Items per page */}
          <div>
            <Label className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">
              Hiển thị
            </Label>
            <Select 
              value={filters.itemsPerPage.toString()} 
              onValueChange={(value) => onFiltersChange({ itemsPerPage: parseInt(value) })}
            >
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Custom Date Range */}
        {filters.dateFilter === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                Từ ngày
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.customStartDate 
                      ? format(filters.customStartDate, "dd/MM/yyyy", { locale: vi }) 
                      : "Chọn ngày bắt đầu"
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.customStartDate}
                    onSelect={(date) => onFiltersChange({ customStartDate: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                Đến ngày
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.customEndDate 
                      ? format(filters.customEndDate, "dd/MM/yyyy", { locale: vi }) 
                      : "Chọn ngày kết thúc"
                    }
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.customEndDate}
                    onSelect={(date) => onFiltersChange({ customEndDate: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};