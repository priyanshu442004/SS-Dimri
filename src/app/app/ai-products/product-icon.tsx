import { Handshake, Landmark, Package, Percent, Receipt, ReceiptText, Scale, Sparkles, TrendingUp, Truck, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  receipt: Receipt, landmark: Landmark, scale: Scale, trending: TrendingUp, percent: Percent, "receipt-text": ReceiptText, truck: Truck, handshake: Handshake, package: Package,
};

export function ProductIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}
