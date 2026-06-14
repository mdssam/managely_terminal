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
    // Only use the cache when it holds a positive (enabled) result.
    // A cached enabled:false may be stale (profile loaded before session was ready).
    if (_cache.config && _cache.config.enabled && _cache.posProfile === key) return;

    getCashIOConfig(posProfile).then((cfg) => {
      if (cfg?.enabled) {
        _cache.config = cfg;
        _cache.posProfile = key;
      }
      setConfig(cfg ?? { installed: false, enabled: false, allowed_modes: [] });
    });
  }, [posProfile]);

  return config;
}
