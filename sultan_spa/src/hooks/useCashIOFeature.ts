import { useState, useEffect } from "react";
import { getCashIOConfig } from "../services/cashTransaction";
import type { CashIOConfig } from "../services/cashTransaction";

export function useCashIOFeature(posProfile?: string) {
  const [config, setConfig] = useState<CashIOConfig>({
    installed: false,
    enabled: false,
    allowed_modes: [],
  });

  useEffect(() => {
    getCashIOConfig(posProfile).then((cfg) => {
      setConfig(cfg ?? { installed: false, enabled: false, allowed_modes: [] });
    });
  }, [posProfile]);

  return config;
}
