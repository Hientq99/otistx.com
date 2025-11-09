import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayCircle, Loader2, Check, Smartphone, Network, Zap, Shield } from "lucide-react";
import { ServiceType } from './types';
import { SERVICE_OPTIONS } from './constants';
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

interface ServiceSelectorProps {
  selectedService: ServiceType;
  selectedCarrier: string;
  isLoading: boolean;
  onServiceChange: (service: ServiceType) => void;
  onCarrierChange: (carrier: string) => void;
  onStartRental: () => void;
}

export const ServiceSelector = ({
  selectedService,
  selectedCarrier,
  isLoading,
  onServiceChange,
  onCarrierChange,
  onStartRental
}: ServiceSelectorProps) => {
  const { user } = useAuth();
  
  // Fetch dynamic pricing for phone rental services
  const { data: servicePricing = [] } = useQuery({
    queryKey: ['/api/service-pricing'],
    enabled: !!user,
  });

  // Extract prices for each service
  const otissimV1Price = servicePricing.find((s: any) => s.serviceType === 'otissim_v1' && s.serviceName === 'Otissim_v1')?.price || '2100';
  const otissimV2Price = servicePricing.find((s: any) => s.serviceType === 'otissim_v2' && s.serviceName === 'Otissim_v2')?.price || '2000';
  const otissimV3Price = servicePricing.find((s: any) => s.serviceType === 'otissim_v3' && s.serviceName === 'Otissim_v3')?.price || '2000';

  // Create service options with dynamic pricing
  const serviceOptionsWithPricing = SERVICE_OPTIONS.map(service => ({
    ...service,
    price: service.value === 'otissim_v1' ? `${parseFloat(otissimV1Price).toLocaleString()} VND` :
           service.value === 'otissim_v2' ? `${parseFloat(otissimV2Price).toLocaleString()} VND` :
           service.value === 'otissim_v3' ? `${parseFloat(otissimV3Price).toLocaleString()} VND` :
           service.price
  }));

  const selectedServiceData = serviceOptionsWithPricing.find(s => s.value === selectedService);

  const isFormValid = selectedService && selectedCarrier;

  return (
    <div className="space-y-6">
      {/* Service Selection */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Chọn dịch vụ
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {serviceOptionsWithPricing.map((service) => (
            <div
              key={service.value}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md ${
                selectedService === service.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              onClick={() => {
                onServiceChange(service.value);
                onCarrierChange('');
              }}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">
                    {service.label}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    {service.carriers.length} nhà mạng
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">
                    {service.price}
                  </span>
                  {selectedService === service.value && (
                    <div className="mt-1">
                      <Check className="h-5 w-5 text-blue-500 mx-auto" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Carrier Selection */}
      {selectedServiceData && (
        <div>
          <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-3">
            Chọn nhà mạng ({selectedServiceData.label})
          </Label>
          
          <Select value={selectedCarrier} onValueChange={onCarrierChange}>
            <SelectTrigger className="w-full h-12 text-base">
              <SelectValue placeholder="Chọn nhà mạng..." />
            </SelectTrigger>
            <SelectContent>
              {selectedServiceData.carriers.map((carrier) => (
                <SelectItem key={carrier.value} value={carrier.value}>
                  {carrier.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Start Button */}
      <Button
        onClick={onStartRental}
        disabled={!isFormValid || isLoading}
        className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-lg transition-colors"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Đang xử lý...
          </>
        ) : (
          <>
            <PlayCircle className="mr-2 h-5 w-5" />
            Bắt đầu thuê số - {selectedServiceData?.price}
          </>
        )}
      </Button>
    </div>
  );
};