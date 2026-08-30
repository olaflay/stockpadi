export type OnboardingStep = "marketing" | "business_type" | "first_product" | "education";

export interface FirstProductDraft {
  name: string;
  costPrice: number | "";
  sellPrice: number | "";
  unitLabel: string;
  lowStockThreshold: number;
}

export interface OnboardingState {
  businessName: string;
  businessTypeId: string;
  loadStarterPack: boolean;
  firstProduct: FirstProductDraft;
}

export interface EducationSuperpower {
  id: "offline" | "debtors" | "reconciliation";
  iconName: "WifiOff" | "MessageCircle" | "Moon";
  title: string;
  badge: string;
  description: string;
  benefit: string;
}
