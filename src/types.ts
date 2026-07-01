export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type DisplayCandle = Candle & {
  sourceStartTime: string;
  sourceEndTime: string;
};

export type InstrumentDefinition = {
  path: string;
  currency: string;
  unitLabel: string;
  defaultLotSize: number;
  multiplier: number;
  priceDecimals: number;
};
