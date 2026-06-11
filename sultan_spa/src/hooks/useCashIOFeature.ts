import { useState, useEffect } from "react";
import { getCashIOConfig } from "../services/cashTransaction";
import type { CashIOConfig } from "../services/cashTransaction";

const _cache: { config: CashIOConfig | null; posProfile: string } = {
  config: null,
  posProfile: "",
};

export function useCashIOFeature(posProfile?: string) {
  const [config, setConfig] = useState<CashIOConfig>(
    _cache.config && _cache.posProfile === (posProfile ?? "")
      ? _cache.config
      : { installed: false, enabled: false, allowed_modes: [] }
  );

  useEffect(() => {
    const key = posProfile ?? "";
    if (_cache.config && _cache.posProfile === key) return;

    getCashIOConfig(posProfile).then((cfg) => {
      _cache.config = cfg;
      _cache.posProfile = key;
      setConfig(cfg);
    });
  }, [posProfile]);

  return config;
}
