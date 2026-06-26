export type InstrumentDefinition = {
  path: string;
  currency: string;
  unitLabel: string;
  defaultLotSize: number;
  multiplier: number;
};

const JAPAN_STOCK_DEFAULTS = {
  currency: "JPY",
  unitLabel: "株",
  defaultLotSize: 100,
  multiplier: 1,
} as const;

export const INSTRUMENTS = [
  {
    path: "/data/0225_日経.csv",
    currency: "JPY",
    unitLabel: "",
    defaultLotSize: 1,
    multiplier: 1,
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
