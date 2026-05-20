import { create } from "zustand";

interface Branding {
  hospitalName?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
}

interface Locale {
  timezone?: string;
  currency?: string;
  dateFormat?: string;
  language?: string;
}

interface Modules {
  patients: boolean;
  staff: boolean;
  appointments: boolean;
  pharmacy: boolean;
  billing: boolean;
  dashboard: boolean;
}

interface Features {
  walkInQueue: boolean;
  autoMrnGeneration: boolean;
  mrnPrefix: string;
}

interface TenantConfig {
  branding: Branding;
  locale: Locale;
  modules: Modules;
  features: Features;
}

interface TenantConfigState {
  config: TenantConfig;
  isLoaded: boolean;
  setConfig: (raw: Record<string, unknown>) => void;
  reset: () => void;
}

const DEFAULT_CONFIG: TenantConfig = {
  branding: { primaryColor: "#1A5276", accentColor: "#27AE60" },
  locale: { timezone: "Africa/Accra", currency: "GHS", dateFormat: "DD/MM/YYYY", language: "en" },
  modules: { patients: true, staff: true, appointments: true, pharmacy: true, billing: true, dashboard: true },
  features: { walkInQueue: true, autoMrnGeneration: true, mrnPrefix: "MRN" },
};

export const useTenantConfigStore = create<TenantConfigState>((set) => ({
  config: DEFAULT_CONFIG,
  isLoaded: false,

  setConfig: (raw: Record<string, unknown>) => {
    const branding = (raw.branding as Branding) || DEFAULT_CONFIG.branding;
    const locale = (raw.locale as Locale) || DEFAULT_CONFIG.locale;
    const modules = (raw.modules as Modules) || DEFAULT_CONFIG.modules;
    const rawFeatures = raw.features as Record<string, unknown> | undefined;
    const features: Features = rawFeatures
      ? {
          walkInQueue: (rawFeatures.walk_in_queue as boolean) ?? true,
          autoMrnGeneration: (rawFeatures.auto_mrn_generation as boolean) ?? true,
          mrnPrefix: (rawFeatures.mrn_prefix as string) ?? "MRN",
        }
      : DEFAULT_CONFIG.features;

    const config: TenantConfig = { branding, locale, modules, features };
    if (typeof window !== "undefined") {
      localStorage.setItem("hms_tenant_config", JSON.stringify(config));
    }
    set({ config, isLoaded: true });
  },

  reset: () => set({ config: DEFAULT_CONFIG, isLoaded: false }),
}));
