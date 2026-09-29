export interface Mupihat {
  Charger_Status?: string
  Vbat?: number
  Vbus?: number
  Ibat?: number
  IBus?: number
  Temp?: number
  BatteryConnected?: number
  Bat_SOC?: string
  Bat_Stat?: string
  Bat_Type?: string
  // Phase-12: granular 5%-step SoC + charging-state hint. Backend computes
  // these via piecewise-linear interpolation over the same v_100..v_0 config
  // thresholds, smoothed over a ~32 s VBAT window.
  Bat_Percent?: number
  Bat_PercentSource?: 'voltage' | 'charging'
}
