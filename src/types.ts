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

export type OrderAction =
  | "add-short"
  | "close-short"
  | "add-long"
  | "close-long";

export type PositionSide = "short" | "long";

export type PositionLot = {
  id: string;
  side: PositionSide;
  entryDate: string;
  entryPrice: number;
  sharesPerLot: number;
};

export type PendingOrder = {
  id: string;
  action: OrderAction;
  lots: number;
  shares: number;
  sharesPerLot: number;
  orderedDate: string;
  executeDate: string;
  executionTiming: "next-open" | "same-close";
};

export type TradeLog = {
  id: string;
  action: OrderAction;
  lots: number;
  shares: number;
  orderedDate: string;
  executionDate: string;
  executionPrice: number;
  realizedProfit: number | null;
  positionIds?: string[];
  closesPositionIds?: string[];
  closedPositions?: PositionLot[];
};

export type TradingBook = {
  shortPositions: PositionLot[];
  longPositions: PositionLot[];
  pendingOrder: PendingOrder | null;
  pendingOrders: PendingOrder[];
  logs: TradeLog[];
};
