import type { InstrumentDefinition } from "../types";

const JAPAN_STOCK_DEFAULTS = {
  currency: "JPY",
  unitLabel: "株",
  defaultLotSize: 100,
  multiplier: 1,
  priceDecimals: 0,
} as const;

const US_STOCK_DEFAULTS = {
  currency: "USD",
  unitLabel: "株",
  defaultLotSize: 1,
  multiplier: 1,
  priceDecimals: 2,
} as const;

const FUTURES_DEFAULTS = {
  currency: "USD",
  unitLabel: "枚",
  defaultLotSize: 1,
  multiplier: 1,
  priceDecimals: 2,
} as const;

export const INSTRUMENTS = [
  {
    path: "/data/0225_日経.csv",
    currency: "JPY",
    unitLabel: "",
    defaultLotSize: 1,
    multiplier: 1,
    priceDecimals: 2,
  },
  { path: "/data/2229_カルビー.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/2502_アサヒグループ.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/3197_すかいらーく.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/3382_セブン&アイ.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/4503_アステラス製薬.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/4755_楽天.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/5019_出光興産.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/6501_日本製作所.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/6586_マキタ.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/7203_トヨタ自動車.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/7832_バンダイナムコ.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/8306_三菱UFJ.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/9020_JR東日本.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/9434_ソフトバンク.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/9501_東京電力.csv", ...JAPAN_STOCK_DEFAULTS },
  { path: "/data/AAPL_Apple.csv", ...US_STOCK_DEFAULTS },
  { path: "/data/AMZN_Amazon.csv", ...US_STOCK_DEFAULTS },
  { path: "/data/NVDA_NVIDIA.csv", ...US_STOCK_DEFAULTS },
  {
    path: "/data/BTC_Bitcoin.csv",
    currency: "USD",
    unitLabel: "BTC",
    defaultLotSize: 1,
    multiplier: 1,
    priceDecimals: 2,
  },
  { path: "/data/CL=F_原油先物.csv", ...FUTURES_DEFAULTS },
  { path: "/data/GC=F_金先物.csv", ...FUTURES_DEFAULTS },
  {
    path: "/data/USDJPY_米ドル_円.csv",
    currency: "JPY",
    unitLabel: "USD",
    defaultLotSize: 1,
    multiplier: 1,
    priceDecimals: 3,
  },
  {
    path: "/data/EURUSD_ユーロ_米ドル.csv",
    currency: "USD",
    unitLabel: "EUR",
    defaultLotSize: 1,
    multiplier: 1,
    priceDecimals: 5,
  },
] as const satisfies readonly InstrumentDefinition[];

export const DATA_FILES = INSTRUMENTS.map((instrument) => instrument.path);

const DEFAULT_INSTRUMENT: InstrumentDefinition = {
  path: "",
  ...JAPAN_STOCK_DEFAULTS,
};

export function getInstrumentDefinition(path: string): InstrumentDefinition {
  return (
    INSTRUMENTS.find((instrument) => instrument.path === path) ??
    DEFAULT_INSTRUMENT
  );
}
